import { createFruitState, object, parseFruitPreset, validateProfile } from './preset';
import type { FruitState } from './types';

export const FRUIT_DATABASE='elsewhere-fruit-private-v1';
const STORE='documents',KEY='current';
export function openFruitDatabase():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(FRUIT_DATABASE,2);let blocked=false;
    request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE);if(!db.objectStoreNames.contains('preset-library'))db.createObjectStore('preset-library');};
    request.onsuccess=()=>{const db=request.result;if(blocked){db.close();return;}db.onversionchange=()=>db.close();resolve(db);};
    request.onerror=()=>reject(new Error('无法打开果实私有存储；请检查浏览器存储权限'));
    request.onblocked=()=>{blocked=true;reject(new Error('果实存储升级被其他标签页阻塞，请关闭其他页面后重试'));};
  });
}
export async function decodeFruitDocument(value:unknown):Promise<FruitState>{
  if(value===undefined)return createFruitState();
  if(!object(value)||value.schema!==1||!Number.isInteger(value.revision)||Number(value.revision)<1||typeof value.enabled!=='boolean'||!object(value.profiles))throw new Error('果实配置记录损坏，已保留原记录，未自动重置');
  const profiles={meeting:validateProfile(value.profiles.meeting),theatre:validateProfile(value.profiles.theatre)};
  let preset=null;
  if(value.raw!==null){
    if(!(value.raw instanceof Uint8Array)||typeof value.fileName!=='string'||typeof value.importedAt!=='number'||!Number.isFinite(value.importedAt))throw new Error('果实原件记录损坏，未覆盖');
    preset=await parseFruitPreset(value.raw,value.fileName,value.importedAt);
  }
  return {schema:1,revision:Number(value.revision),enabled:value.enabled,preset,profiles};
}
export class FruitRepository {
  async load():Promise<FruitState>{
    const db=await openFruitDatabase();
    try{
      const value=await new Promise<unknown>((resolve,reject)=>{
        const tx=db.transaction(STORE,'readonly');const request=tx.objectStore(STORE).get(KEY);let result:unknown;
        request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(new Error('读取果实配置失败，原配置未改变'));tx.onerror=()=>reject(new Error('读取果实配置失败'));
      });
      return await decodeFruitDocument(value);
    }finally{db.close();}
  }
  async save(candidate:FruitState,expectedRevision:number):Promise<FruitState>{
    const profiles={meeting:validateProfile(candidate.profiles.meeting),theatre:validateProfile(candidate.profiles.theatre)};
    const next:FruitState={...candidate,profiles,revision:expectedRevision+1};
    const document={schema:1,revision:next.revision,enabled:next.enabled,profiles,raw:next.preset?.raw||null,fileName:next.preset?.fileName||'',importedAt:next.preset?.importedAt||0};
    const db=await openFruitDatabase();
    try{
      await new Promise<void>((resolve,reject)=>{
        const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),request=store.get(KEY);let reason='果实配置未保存；原配置保留，请检查存储空间';
        request.onsuccess=()=>{
          const previous:unknown=request.result;
          const revision=previous===undefined?0:object(previous)&&typeof previous.revision==='number'?previous.revision:-1;
          if(revision!==expectedRevision){reason='其他标签页已修改果实配置；请重新读取后再保存，避免覆盖';tx.abort();return;}
          try{store.put(document,KEY);}catch{tx.abort();}
        };
        tx.oncomplete=()=>resolve();tx.onabort=()=>reject(new Error(reason));tx.onerror=()=>reject(new Error(reason));
      });
      return next;
    }finally{db.close();}
  }
}
