import {FRUIT_DATABASE,openFruitDatabaseReadonly} from './fruit/storage';
import {createFruitState,validateProfile} from './fruit/preset';
import {nativePreset,type ConversationMode} from './fruit/nativePreset';
import {decodePresetLibraryBackup} from './fruit/library';
import type {FruitProfile} from './fruit/types';
import {builtinPreset,validatePresetLibrary,resolvePreset,presetId,presetObject,type ElsewherePresetLibrary,type PresetMode} from './elsewherePreset';

const STORE='elsewhere-presets',CURRENT='current',UPGRADE='before-shared-novel';
export interface PresetUpgradeBackup {library:unknown;previous?:unknown}
export interface LegacyPresetArchive {library?:unknown;document?:unknown;recovery?:unknown;migration?:unknown}
function legacyArchive(library:unknown,document:unknown,recovery?:unknown,migration?:unknown):LegacyPresetArchive {return {...(library===undefined?{}:{library}),...(document===undefined?{}:{document}),...(recovery===undefined?{}:{recovery}),...(migration===undefined?{}:{migration})};}
function openDatabase():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{const q=indexedDB.open(FRUIT_DATABASE,3);let blocked=false;
  q.onupgradeneeded=()=>{for(const name of ['documents','preset-library',STORE])if(!q.result.objectStoreNames.contains(name))q.result.createObjectStore(name);};
  q.onblocked=()=>{blocked=true;reject(Error('其他标签页正在使用预设库，请关闭后重试。原数据保留。'));};
  q.onerror=()=>reject(Error('无法打开私有预设库，请检查浏览器存储权限。'));
  q.onsuccess=()=>{const db=q.result;if(blocked){db.close();return;}db.onversionchange=()=>db.close();resolve(db);};
 });
}
function taskProfiles(value:unknown):Record<'meeting'|'theatre',FruitProfile>{
 if(value===undefined)return createFruitState().profiles;
 if(!presetObject(value))throw Error('原生任务配置无效，原数据保留。');
 return {meeting:validateProfile(value.meeting),theatre:validateProfile(value.theatre)};
}
export function migrateElsewhereLibrary(archive:LegacyPresetArchive,source:PresetMode='meeting'):ElsewherePresetLibrary {
 const defaults=createFruitState().profiles;
 const builtin={...builtinPreset(),settings:{meeting:{length:defaults.meeting.length,style:defaults.meeting.style},theatre:{length:defaults.theatre.length,style:defaults.theatre.style}}};
 const l={schemaVersion:1,revision:0,presets:[builtin],defaults:{meeting:'native',theatre:'native'},bindings:{} as Record<string,Partial<Record<PresetMode,{presetId:string;overrides:unknown}>>>,taskProfiles:undefined as unknown,legacyNotice:false},old=archive.library;
 if(presetObject(old)&&Array.isArray(old.entries)){
  const native=old.entries.find(v=>presetObject(v)&&v.kind==='native');
  if(presetObject(native)){
   const profiles=taskProfiles(native.profiles);l.taskProfiles=profiles;
   const base={...builtinPreset(),id:'upgraded-native',name:'旧原生基础设置',description:'保留旧原生字数和文风。旧条目编辑和排序保留在归档中，未自动转换。',settings:{meeting:{length:profiles.meeting.length,style:profiles.meeting.style},theatre:{length:profiles.theatre.length,style:profiles.theatre.style}}};
   const settingsChanged=JSON.stringify(base.settings)!==JSON.stringify(builtin.settings);
   if(settingsChanged)l.presets.push(base);
   const legacy=presetObject(old.legacyNovel)?old.legacyNovel:old,defaults=presetObject(legacy.defaults)?legacy.defaults:{};
   for(const mode of ['meeting','theatre']as const)if(defaults[mode]==='native'&&settingsChanged)l.defaults[mode]=base.id;
   if(presetObject(old.roleNovel))for(const [roleId,value]of Object.entries(old.roleNovel)){
    if(!presetId(roleId)||!presetObject(value)||value.useLegacy===true)continue;
    if(value.presetId!=='native'){l.bindings[roleId]={meeting:{presetId:'native',overrides:{}},theatre:{presetId:'native',overrides:{}}};continue;}
    const bindings=presetObject(value.profiles)?value.profiles:{},binding=bindings.native;
    const profile=presetObject(binding)?validateProfile(binding.profile):undefined;
    l.bindings[roleId]={};
    for(const mode of ['meeting','theatre']as const)l.bindings[roleId][mode]={presetId:settingsChanged?base.id:'native',overrides:profile?{settings:{length:profile.length,style:profile.style}}:{}};
   }
  }
 }
 if(archive.library!==undefined||archive.document!==undefined)l.legacyNotice=true;
 return validatePresetLibrary(l,source);
}

function checked(value:unknown,source:PresetMode='meeting'){const l=validatePresetLibrary(value,source);if(l.taskProfiles!==undefined)l.taskProfiles=taskProfiles(l.taskProfiles);return l;}
async function read(signal?:AbortSignal):Promise<{current:unknown;archive:LegacyPresetArchive}> {
 const db=await openFruitDatabaseReadonly(signal);if(!db)return {current:undefined,archive:{}};
 try{return await new Promise((resolve,reject)=>{
  const stores=['documents','preset-library',STORE].filter(name=>db.objectStoreNames.contains(name));
  if(!stores.length){resolve({current:undefined,archive:{}});return;}
  const tx=db.transaction(stores,'readonly'),get=(name:string,key:string)=>stores.includes(name)?tx.objectStore(name).get(key):undefined;
  const current=get(STORE,CURRENT),oldLibrary=get('preset-library','current'),oldDocument=get('documents','current'),recovery=get('documents','role-preset-before-restore'),migration=get('documents','terminal-ux-migration-backup');
  const cancel=()=>{try{tx.abort();}catch{}reject(signal?.reason||new DOMException('预设读取取消','AbortError'));};
  signal?.addEventListener('abort',cancel,{once:true});
  tx.oncomplete=()=>{signal?.removeEventListener('abort',cancel);resolve({current:current?.result,archive:legacyArchive(oldLibrary?.result,oldDocument?.result,recovery?.result,migration?.result)});};
  tx.onabort=()=>{signal?.removeEventListener('abort',cancel);reject(signal?.reason||Error('预设读取未完成，原数据保留。'));};
  if(signal?.aborted)cancel();
 });}finally{db.close();}
}
export class ElsewherePresetRepository {
 private legacySeen:LegacyPresetArchive|undefined;
 upgradePending=false;
 async load(signal?:AbortSignal){
  const result=await read(signal);this.legacySeen=result.archive;
  this.upgradePending=presetObject(result.current)&&result.current.schemaVersion===1;
  return result.current===undefined?migrateElsewhereLibrary(result.archive):checked(result.current);
 }
 async upgradeBackup():Promise<PresetUpgradeBackup|undefined>{
  const db=await openFruitDatabaseReadonly();if(!db)return;
  try{
   if(!db.objectStoreNames.contains(STORE))return;
   return await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readonly'),q=tx.objectStore(STORE).get(UPGRADE);
    tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(Error('升级前备份读取失败'));
   });
  }finally{db.close();}
 }
 async archive():Promise<LegacyPresetArchive>{
  const db=await openFruitDatabaseReadonly();if(!db)return {};
  try{
   if(!db.objectStoreNames.contains(STORE))return (await read()).archive;
   return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),q=tx.objectStore(STORE).get('legacy');tx.oncomplete=()=>resolve(q.result||this.legacySeen||{});tx.onabort=()=>reject(Error('旧原件读取失败，原数据仍保留。'));});
  }finally{db.close();}
 }
 async previous():Promise<{library:ElsewherePresetLibrary;archive:LegacyPresetArchive}|undefined>{
  const db=await openFruitDatabaseReadonly();if(!db)return;
  try{if(!db.objectStoreNames.contains(STORE))return;
   const value=await new Promise<unknown>((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),q=tx.objectStore(STORE).get('previous');tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(Error('无法读取恢复前版本'));});
   if(value===undefined)return;if(!presetObject(value))throw Error('恢复前版本损坏');return {library:checked(value.library),archive:presetObject(value.archive)?value.archive:{}};
  }finally{db.close();}
 }
 async save(candidate:ElsewherePresetLibrary,expectedRevision:number,replaceArchive?:LegacyPresetArchive,importedBackup?:PresetUpgradeBackup):Promise<ElsewherePresetLibrary>{
  const next=checked({...candidate,revision:expectedRevision+1}),db=await openDatabase();
  try{await new Promise<void>((resolve,reject)=>{
   const tx=db.transaction([STORE,'documents','preset-library'],'readwrite'),store=tx.objectStore(STORE),q=store.get(CURRENT),archive=store.get('legacy'),previous=store.get('previous'),upgrade=store.get(UPGRADE);
   const oldLibrary=tx.objectStore('preset-library').get('current'),oldDocument=tx.objectStore('documents').get('current'),recovery=tx.objectStore('documents').get('role-preset-before-restore'),migration=tx.objectStore('documents').get('terminal-ux-migration-backup');let reason='预设未保存，原库和修改保留。';
   migration.onsuccess=()=>{
    try{
     const old=q.result,revision=old===undefined?0:presetObject(old)?old.revision:-1;
     if(revision!==expectedRevision){reason='其他标签页已修改预设库，请重新读取后再保存。';tx.abort();return;}
     const legacy=legacyArchive(oldLibrary.result,oldDocument.result,recovery.result,migration.result);
     if(old===undefined&&this.legacySeen&&JSON.stringify(legacy)!==JSON.stringify(this.legacySeen)){reason='旧库已被另一页面修改，请重新读取。';tx.abort();return;}
     if(upgrade.result===undefined){
      if(presetObject(old)&&old.schemaVersion===1)store.put({library:old,...(previous.result===undefined?{}:{previous:previous.result})},UPGRADE);
      else if(importedBackup)store.put(importedBackup,UPGRADE);
     }
     if(old!==undefined)store.put({library:old,archive:archive.result||legacy},'previous');
     if(archive.result===undefined||replaceArchive!==undefined)store.put(replaceArchive||legacy,'legacy');
     store.put(next,CURRENT);
    }catch{tx.abort();}
   };
   tx.oncomplete=()=>resolve();tx.onabort=()=>reject(Error(reason));tx.onerror=()=>reject(Error(reason));
  });this.upgradePending=false;return next;}finally{db.close();}
 }
}
export async function loadElsewhereRequestPreset(mode:ConversationMode,roleId:string,signal?:AbortSignal){
 const l=await new ElsewherePresetRepository().load(signal),slot=mode==='theatre'||mode==='intermission'?'theatre':'meeting';
 const novel=mode==='meeting'||mode==='theatre',p=novel?resolvePreset(l,roleId):undefined;
 const hash=p?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(p)))),b=>b.toString(16).padStart(2,'0')).join(''):'native';
 const profile=novel?createFruitState().profiles[slot]:taskProfiles(l.taskProfiles)[slot];
 return {profile,preset:nativePreset(slot),elsewherePreset:p,revision:l.revision,requestedPresetId:p?.id||'native',actualPresetId:p?.id||'native',roleId,configSource:novel?'elsewhere-v1':'native-task',presetHash:hash,profileBaseHash:hash};
}
export function encodeNativeLibraryBackup(library:unknown,archive:LegacyPresetArchive,beforeSharedNovel?:PresetUpgradeBackup):Uint8Array {
 const validated=checked(library);
 const original=presetObject(library)&&library.schemaVersion===1?library:validated;
 const raw=JSON.stringify({format:'elsewhere-preset-library',schemaVersion:1,library:original,archive,...(beforeSharedNovel?{beforeSharedNovel}:{})},(_key,v:unknown)=>{
  if(!(v instanceof Uint8Array))return v;let s='';for(let i=0;i<v.length;i+=32768)s+=String.fromCharCode(...v.subarray(i,i+32768));return {encoding:'base64',value:btoa(s)};
 });
 const bytes=new TextEncoder().encode(raw);if(bytes.length>64*1024*1024)throw Error('预设库备份超过 64 MiB，请分别导出预设和旧原件。');return bytes;
}
export async function decodeNativeLibraryBackup(raw:Uint8Array,source:PresetMode='meeting'):Promise<{library:ElsewherePresetLibrary;archive:LegacyPresetArchive;upgradeBackup?:PresetUpgradeBackup}>{
 if(!raw.length||raw.length>64*1024*1024)throw Error('库备份应为不超过 64 MiB 的 JSON');
 let doc:unknown;try{doc=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw),(_k,v:unknown)=>{
  if(presetObject(v)&&v.encoding==='base64'&&typeof v.value==='string'){if(v.value.length>44*1024*1024||!/^[A-Za-z0-9+/]*={0,2}$/.test(v.value))throw Error('原件编码损坏');return Uint8Array.from(atob(v.value),c=>c.charCodeAt(0));}return v;
 });}catch{throw Error('预设库备份无法读取，当前库未改变。');}
 if(presetObject(doc)&&doc.kind==='Elsewhere private preset library'&&doc.version===1){
  await decodePresetLibraryBackup(raw,nativePreset('meeting'));
  const archive={library:doc.library};return {library:checked(migrateElsewhereLibrary(archive,source)),archive};
 }
 if(!presetObject(doc)||doc.format!=='elsewhere-preset-library'||doc.schemaVersion!==1||!presetObject(doc.archive))throw Error('请选择 Elsewhere 私有库备份');
 const library=checked(doc.library,source);
 const imported=doc.beforeSharedNovel;
 if(imported!==undefined){
  if(!presetObject(imported)||!presetObject(imported.library)||imported.library.schemaVersion!==1)throw Error('升级前备份格式无效');
  checked(imported.library);
 }
 const upgradeBackup=presetObject(doc.library)&&doc.library.schemaVersion===1?{library:doc.library}:imported as PresetUpgradeBackup|undefined;
 return {library,archive:doc.archive,upgradeBackup};
}
export function legacyOriginals(archive:LegacyPresetArchive):{id:string;name:string;raw:Uint8Array}[]{
 const out:{id:string;name:string;raw:Uint8Array}[]=[],seen=new Set<string>();
 const add=(v:unknown,id:string)=>{if(!presetObject(v)||!(v.raw instanceof Uint8Array)||!v.raw.length)return;const name=typeof v.fileName==='string'?v.fileName:id+'.json';if(seen.has(id))return;seen.add(id);out.push({id,name,raw:v.raw});};
 const libraryOriginals=(library:unknown,prefix:string)=>{
  if(!presetObject(library))return;
  if(Array.isArray(library.entries))library.entries.forEach((v,i)=>{if(presetObject(v)&&v.kind!=='native')add(v,prefix+'entry-'+i);});
  if(Array.isArray(library.versions))library.versions.forEach((v,i)=>add(v,prefix+'version-'+i));
 };
 libraryOriginals(archive.library,'');libraryOriginals(archive.recovery,'recovery-');
 add(archive.document,'legacy-current');add(archive.migration,'migration-original');return out;
}
