import {createFruitState,object,parseFruitPreset,validateProfile,isFruitDocument} from './preset';
import {decodeFruitDocument,openFruitDatabase,openFruitDatabaseReadonly} from './storage';
import {applyFruitProfile} from './profile';
import {nativePreset,isNativePreset} from './nativePreset';
import {selectRoleRequestPreset,decodeRoleNovelState} from './roleProfiles';
import type {RoleNovelConfig,LegacyNovelSnapshot} from './roleProfiles';
import type {ConversationMode} from './nativePreset';
import type {FruitMode,FruitPreset,FruitProfile,FruitState} from './types';
export interface PresetEntry {id:string;kind:'native'|'fruit'|'st';preset:FruitPreset;profiles:Record<FruitMode,FruitProfile>;enabled:boolean;archived?:boolean}
export interface PresetLibrary {schema:2|3;revision:number;selectedId:string;defaults:Record<FruitMode,string>;entries:PresetEntry[];roleNovel?:Record<string,RoleNovelConfig>;legacyNovel?:LegacyNovelSnapshot;versions?:FruitPreset[]}
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
  if(!object(value)||(value.schema!==2&&value.schema!==3)||!Number.isInteger(value.revision)||Number(value.revision)<1||!Array.isArray(value.entries)||value.entries.length<1||value.entries.length>20||typeof value.selectedId!=='string'||!object(value.defaults))throw new Error('预设库记录损坏，已保留原数据，未自动重置');
  const ids=new Set<string>(),entries:PresetEntry[]=[];
  for(const item of value.entries){
    if(!object(item)||typeof item.id!=='string'||!item.id||item.id.length>200||['__proto__','constructor','prototype'].includes(item.id)||ids.has(item.id)||!['native','fruit','st'].includes(String(item.kind))||typeof item.enabled!=='boolean'||item.archived!==undefined&&typeof item.archived!=='boolean'||!object(item.profiles))throw new Error('预设库条目无效，原件保留');ids.add(item.id);
    if(!(item.raw instanceof Uint8Array)||typeof item.fileName!=='string'||typeof item.importedAt!=='number')throw new Error('预设原件记录损坏');
    const preset=item.kind==='native'?native:await parseFruitPreset(item.raw,item.fileName,item.importedAt),profiles={meeting:validateProfile(item.profiles.meeting),theatre:validateProfile(item.profiles.theatre)};
    for(const mode of ['meeting','theatre']as const)applyFruitProfile(item.kind==='native'&&isNativePreset(native)?nativePreset(mode):preset,profiles[mode]);
    const kind=item.kind==='native'?'native':item.kind==='fruit'?'fruit':'st';entries.push({id:item.id,kind,preset,profiles,enabled:item.enabled,...(item.archived?{archived:true}:{})});
  }
  if(entries.filter(e=>e.kind==='native').length!==1||!entries.some(e=>e.id==='native'&&e.kind==='native')||!ids.has(value.selectedId)||typeof value.defaults.meeting!=='string'||typeof value.defaults.theatre!=='string'||!ids.has(value.defaults.meeting)||!ids.has(value.defaults.theatre))throw new Error('预设选择或默认值无效，原记录保留');
  const library:PresetLibrary={schema:value.schema,revision:Number(value.revision),selectedId:value.selectedId,defaults:{meeting:value.defaults.meeting,theatre:value.defaults.theatre},entries};
  if(value.schema===3){
    if(!Array.isArray(value.versions)||value.versions.length>100)throw new Error('预设版本备份损坏，原件保留');
    const versions:FruitPreset[]=[],hashes=new Set<string>();
    for(const v of value.versions){if(!object(v)||!(v.raw instanceof Uint8Array)||typeof v.fileName!=='string'||typeof v.importedAt!=='number')throw new Error('旧原件备份损坏');const p=await parseFruitPreset(v.raw,v.fileName,v.importedAt);if(hashes.has(p.sha256))throw new Error('旧原件备份重复');hashes.add(p.sha256);versions.push(p);}
    library.versions=versions;Object.assign(library,decodeRoleNovelState(value,library));
  }
  return library;
}
export function serializePresetLibrary(library:PresetLibrary){
  if([...new Map([...library.entries.map(e=>e.preset),...(library.versions||[])].map(p=>[p.sha256||p.fileName,p])).values()].reduce((n,p)=>n+p.raw.length,0)>32*1024*1024)throw new Error('预设原件总量超过 32 MiB，未保存');
  return {...library,...(library.versions?{versions:library.versions.map(p=>({raw:p.raw,fileName:p.fileName,importedAt:p.importedAt}))}:{}),entries:library.entries.map(e=>({id:e.id,kind:e.kind,enabled:e.enabled,...(e.archived?{archived:true}:{}),profiles:{meeting:validateProfile(e.profiles.meeting),theatre:validateProfile(e.profiles.theatre)},raw:e.preset.raw,fileName:e.preset.fileName,importedAt:e.preset.importedAt}))};
}
export class PresetLibraryRepository {
  constructor(private native:FruitPreset){}
  async load(persistMigration=true):Promise<PresetLibrary>{
    const db=persistMigration?await openFruitDatabase():await openFruitDatabaseReadonly();let records:{library:unknown;legacy:unknown}={library:undefined,legacy:undefined};
    if(db)try{records=await new Promise((resolve,reject)=>{const stores=db.objectStoreNames.contains(STORE)?[STORE,'documents']:['documents'],tx=db.transaction(stores,'readonly'),a=stores.includes(STORE)?tx.objectStore(STORE).get(KEY):null,b=tx.objectStore('documents').get('current');tx.oncomplete=()=>resolve({library:a?.result,legacy:b.result});tx.onabort=()=>reject(new Error('读取预设库失败，原数据保留'));});}finally{db.close();}
    if(records.library!==undefined)return decodePresetLibrary(records.library,this.native);
    const legacy=await decodeFruitDocument(records.legacy),migrated=migrateLegacyLibrary(legacy,this.native);return persistMigration?this.save(migrated,0,{legacyBackup:records.legacy}):migrated;
  }
  async restoreBackup():Promise<PresetLibrary|null>{
    const db=await openFruitDatabaseReadonly();if(!db)return null;
    try{const value=await new Promise<unknown>((resolve,reject)=>{const tx=db.transaction('documents','readonly'),r=tx.objectStore('documents').get('role-preset-before-restore');tx.oncomplete=()=>resolve(r.result);tx.onabort=()=>reject(new Error('读取恢复前备份失败'));});return value===undefined?null:decodePresetLibrary(value,this.native);}finally{db.close();}
  }
  async save(candidate:PresetLibrary,expectedRevision:number,options?:{legacyBackup?:unknown;backupCurrent?:boolean}):Promise<PresetLibrary>{
    const next={...candidate,revision:expectedRevision+1},document=serializePresetLibrary(next);await decodePresetLibrary(document,this.native);
    const db=await openFruitDatabase();
    try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction([STORE,'documents'],'readwrite'),store=tx.objectStore(STORE),get=store.get(KEY);let reason='预设库未保存，原件及配置保留；请检查存储空间';
      get.onsuccess=()=>{const old:unknown=get.result;const revision=old===undefined?0:object(old)&&typeof old.revision==='number'?old.revision:-1;if(revision!==expectedRevision){reason='其他标签页已修改预设库，请重新读取后再保存，避免覆盖';tx.abort();return;}try{store.put(document,KEY);if(options?.legacyBackup!==undefined)tx.objectStore('documents').put(options.legacyBackup,'terminal-ux-migration-backup');if(options?.backupCurrent&&old!==undefined)tx.objectStore('documents').put(old,'role-preset-before-restore');}catch{tx.abort();}};
      tx.oncomplete=()=>resolve();tx.onabort=()=>reject(new Error(reason));tx.onerror=()=>reject(new Error(reason));});return next;}finally{db.close();}
  }
}
/** Request reads must never initialize, migrate or save a user's configuration. */
export async function loadNativeRequestProfile(mode:ConversationMode){
 const library=await new PresetLibraryRepository(nativePreset('meeting')).load(false);
 const slot=mode==='theatre'||mode==='intermission'?'theatre':'meeting',entry=library.entries.find(e=>e.id==='native'&&e.kind==='native');
 if(!entry)throw new Error('原生预设不存在，原配置保留，请在预设 App 检查');
 return {profile:structuredClone(entry.profiles[slot]),revision:library.revision,requestedPresetId:mode==='meeting'||mode==='theatre'?library.defaults[slot]:'native',actualPresetId:'native' as const};
}
export function selectRequestPreset(library:PresetLibrary,mode:ConversationMode,roleId:string){return selectRoleRequestPreset(library,mode,roleId);}
export async function loadRequestPreset(mode:ConversationMode,roleId:string){return selectRequestPreset(await new PresetLibraryRepository(nativePreset('meeting')).load(false),mode,roleId);}

/** Explicit local backup only; never bundled or sent to any model. */
export function encodePresetLibraryBackup(library:PresetLibrary):Uint8Array {
 const json=JSON.stringify({kind:'Elsewhere private preset library',version:1,library:serializePresetLibrary(library)},(_key,value:unknown)=>{
  if(!(value instanceof Uint8Array))return value;let binary='';for(let i=0;i<value.length;i+=32768)binary+=String.fromCharCode(...value.subarray(i,i+32768));return {encoding:'base64',value:btoa(binary)};
 });const bytes=new TextEncoder().encode(json);if(bytes.length>64*1024*1024)throw new Error('私有库备份超过 64 MiB，未生成不可恢复文件，请分别导出原件');return bytes;
}
export async function decodePresetLibraryBackup(raw:Uint8Array,native:FruitPreset):Promise<PresetLibrary>{
 if(!raw.length||raw.length>64*1024*1024)throw new Error('私有库备份须为不超过 64 MiB 的 JSON');let doc:unknown;
 try{doc=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{throw new Error('备份 JSON 无法解析，当前库保持不变');}
 if(!object(doc)||doc.kind!=='Elsewhere private preset library'||doc.version!==1||!object(doc.library)||!Array.isArray(doc.library.entries)||doc.library.entries.length>20)throw new Error('不是有效的私有预设库备份');
 const versions=doc.library.versions===undefined?[]:doc.library.versions;if(!Array.isArray(versions)||versions.length>100)throw new Error('备份版本记录无效');
 for(const item of [...doc.library.entries,...versions]){
  if(!object(item)||!object(item.raw)||item.raw.encoding!=='base64'||typeof item.raw.value!=='string'||item.raw.value.length>12*1024*1024||!/^[A-Za-z0-9+/]*={0,2}$/.test(item.raw.value))throw new Error('备份原件编码损坏，未替换当前库');
  try{item.raw=Uint8Array.from(atob(item.raw.value),c=>c.charCodeAt(0));}catch{throw new Error('备份原件无法解码');}
 }
 return decodePresetLibrary(doc.library,native);
}
