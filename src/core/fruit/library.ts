import {createFruitState,object,parseFruitPreset,validateProfile,isFruitDocument} from './preset';
import {decodeFruitDocument,openFruitDatabase} from './storage';
import {applyFruitProfile} from './profile';
import type {FruitMode,FruitPreset,FruitProfile,FruitState} from './types';
export interface PresetEntry {id:string;kind:'native'|'fruit'|'st';preset:FruitPreset;profiles:Record<FruitMode,FruitProfile>;enabled:boolean}
export interface PresetLibrary {schema:2;revision:number;selectedId:string;defaults:Record<FruitMode,string>;entries:PresetEntry[]}
const STORE='preset-library',KEY='current';
export function migrateLegacyLibrary(legacy:FruitState,native:FruitPreset):PresetLibrary {
  const entries:PresetEntry[]=[{id:'native',kind:'native',preset:native,profiles:createFruitState().profiles,enabled:true}];
  if(legacy.preset)entries.push({id:'legacy-fruit',kind:'fruit',preset:legacy.preset,profiles:structuredClone(legacy.profiles),enabled:legacy.enabled});
  return {schema:2,revision:0,selectedId:legacy.preset?'legacy-fruit':'native',defaults:{meeting:'native',theatre:'native'},entries};
}
export function addLibraryPreset(library:PresetLibrary,preset:FruitPreset):PresetLibrary {
  if(library.entries.length>=20)throw new Error('私有预设最多保存 20 套，请先导出备份后再整理');
  if(library.entries.some(e=>e.preset.sha256===preset.sha256))throw new Error('这份原件已在预设库中，请直接选择；更新请使用「更新预设」');
  const fruit=isFruitDocument(JSON.parse(new TextDecoder().decode(preset.raw)));
  const entry:PresetEntry={id:crypto.randomUUID(),kind:fruit?'fruit':'st',preset,profiles:createFruitState().profiles,enabled:false};
  return {...library,selectedId:entry.id,entries:[...library.entries,entry]};
}
export async function decodePresetLibrary(value:unknown,native:FruitPreset):Promise<PresetLibrary>{
  if(!object(value)||value.schema!==2||!Number.isInteger(value.revision)||Number(value.revision)<1||!Array.isArray(value.entries)||value.entries.length<1||value.entries.length>20||typeof value.selectedId!=='string'||!object(value.defaults))throw new Error('预设库记录损坏，已保留原数据，未自动重置');
  const ids=new Set<string>(),entries:PresetEntry[]=[];
  for(const item of value.entries){
    if(!object(item)||typeof item.id!=='string'||ids.has(item.id)||!['native','fruit','st'].includes(String(item.kind))||typeof item.enabled!=='boolean'||!object(item.profiles))throw new Error('预设库条目无效，原件保留');ids.add(item.id);
    if(!(item.raw instanceof Uint8Array)||typeof item.fileName!=='string'||typeof item.importedAt!=='number')throw new Error('预设原件记录损坏');
    const preset=item.kind==='native'?native:await parseFruitPreset(item.raw,item.fileName,item.importedAt),profiles={meeting:validateProfile(item.profiles.meeting),theatre:validateProfile(item.profiles.theatre)};
    for(const p of Object.values(profiles))applyFruitProfile(preset,p);
    const kind=item.kind==='native'?'native':item.kind==='fruit'?'fruit':'st';entries.push({id:item.id,kind,preset,profiles,enabled:item.enabled});
  }
  if(entries.filter(e=>e.kind==='native').length!==1||!entries.some(e=>e.id==='native'&&e.kind==='native')||!ids.has(value.selectedId)||typeof value.defaults.meeting!=='string'||typeof value.defaults.theatre!=='string'||!ids.has(value.defaults.meeting)||!ids.has(value.defaults.theatre))throw new Error('预设选择或默认值无效，原记录保留');
  return {schema:2,revision:Number(value.revision),selectedId:value.selectedId,defaults:{meeting:value.defaults.meeting,theatre:value.defaults.theatre},entries};
}
function serialize(library:PresetLibrary){
  if(library.entries.reduce((n,e)=>n+e.preset.raw.length,0)>32*1024*1024)throw new Error('预设原件总量超过 32 MiB，未保存');
  return {...library,entries:library.entries.map(e=>({id:e.id,kind:e.kind,enabled:e.enabled,profiles:{meeting:validateProfile(e.profiles.meeting),theatre:validateProfile(e.profiles.theatre)},raw:e.preset.raw,fileName:e.preset.fileName,importedAt:e.preset.importedAt}))};
}
export class PresetLibraryRepository {
  constructor(private native:FruitPreset){}
  async load():Promise<PresetLibrary>{
    const db=await openFruitDatabase();let records:{library:unknown;legacy:unknown};
    try{records=await new Promise((resolve,reject)=>{const tx=db.transaction([STORE,'documents'],'readonly'),a=tx.objectStore(STORE).get(KEY),b=tx.objectStore('documents').get('current');tx.oncomplete=()=>resolve({library:a.result,legacy:b.result});tx.onabort=()=>reject(new Error('读取预设库失败，原数据保留'));});}finally{db.close();}
    if(records.library!==undefined)return decodePresetLibrary(records.library,this.native);
    const legacy=await decodeFruitDocument(records.legacy),migrated=migrateLegacyLibrary(legacy,this.native);return this.save(migrated,0,records.legacy);
  }
  async save(candidate:PresetLibrary,expectedRevision:number,legacyBackup?:unknown):Promise<PresetLibrary>{
    const next={...candidate,revision:expectedRevision+1},document=serialize(next);await decodePresetLibrary(document,this.native);
    const db=await openFruitDatabase();
    try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction([STORE,'documents'],'readwrite'),store=tx.objectStore(STORE),get=store.get(KEY);let reason='预设库未保存，原件及配置保留；请检查存储空间';
      get.onsuccess=()=>{const old:unknown=get.result;const revision=old===undefined?0:object(old)&&typeof old.revision==='number'?old.revision:-1;if(revision!==expectedRevision){reason='其他标签页已修改预设库，请重新读取后再保存，避免覆盖';tx.abort();return;}try{store.put(document,KEY);if(legacyBackup!==undefined)tx.objectStore('documents').put(legacyBackup,'terminal-ux-migration-backup');}catch{tx.abort();}};
      tx.oncomplete=()=>resolve();tx.onabort=()=>reject(new Error(reason));tx.onerror=()=>reject(new Error(reason));});return next;}finally{db.close();}
  }
}
