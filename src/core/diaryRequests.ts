import type {TimelineTicket} from './worldTimeline';
export type DiaryResult = {text:string;sourceHash:string;requestId:string;payload?:string;timeline?:TimelineTicket};
export type DiaryReceipt = {
 attempt:string;
 state:'claimed'|'sent'|'ready'|'archived'|'failed';
 priorDispatch?:boolean;
 result?:DiaryResult;
};

export const DIARY_REQUEST_DB='elsewhere-diary-requests-v1';
const storeName='receipts';

export function diaryRequestKey(worldId:string,roleId:string,dateKey:string):string {
 return JSON.stringify([worldId,roleId,dateKey]);
}
export async function diarySourceHash(snapshot:string):Promise<string>{
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(snapshot));
 return Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,'0')).join('');
}
function storageError(){return Error('日记任务记录无法确认，自动补写已暂停。');}
function openDiaryRequests():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DIARY_REQUEST_DB,1);
  let expired=false;
  const fail=()=>{expired=true;clearTimeout(timer);reject(storageError());};
  const timer=setTimeout(fail,5000);
  request.onblocked=request.onerror=fail;
  request.onupgradeneeded=()=>request.result.createObjectStore(storeName);
  request.onsuccess=()=>{
   clearTimeout(timer);
   const db=request.result;
   if(expired){db.close();return;}
   db.onversionchange=()=>db.close();
   resolve(db);
  };
 });
}
function validReceipt(value:DiaryReceipt|undefined):boolean{
 return value===undefined||!!value&&typeof value.attempt==='string'
  && ['claimed','sent','ready','archived','failed'].includes(value.state)
  && (value.state!=='ready'||!!value.result&&typeof value.result.text==='string'
   &&typeof value.result.sourceHash==='string'&&typeof value.result.requestId==='string'
   &&(value.result.payload===undefined||typeof value.result.payload==='string'));
}

async function accessDiaryReceipt(key:string,change?:{before:DiaryReceipt|undefined;after:DiaryReceipt}):Promise<{receipt?:DiaryReceipt;updated:boolean}>{
 const db=await openDiaryRequests();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction(storeName,change?'readwrite':'readonly',{durability:'strict'});
  const store=tx.objectStore(storeName),get=store.get(key);
  let receipt:DiaryReceipt|undefined,updated=false;
  const timer=setTimeout(()=>{try{tx.abort();}catch{}reject(storageError());},5000);
  get.onsuccess=()=>{
   try{
    receipt=get.result as DiaryReceipt|undefined;
    if(!validReceipt(receipt)){tx.abort();return;}
    if(change&&receipt?.attempt===change.before?.attempt&&receipt?.state===change.before?.state){
     store.put(change.after,key);
     updated=true;
    }
   }catch{tx.abort();}
  };
  tx.oncomplete=()=>{clearTimeout(timer);resolve({receipt,updated});};
  tx.onabort=tx.onerror=()=>{clearTimeout(timer);reject(storageError());};
 });}finally{db.close();}
}

export async function readDiaryReceipt(key:string):Promise<DiaryReceipt|undefined>{
 return (await accessDiaryReceipt(key)).receipt;
}
export async function replaceDiaryReceipt(key:string,before:DiaryReceipt|undefined,after:DiaryReceipt):Promise<void>{
 if(!(await accessDiaryReceipt(key,{before,after})).updated)throw Error('日记任务已由另一处处理，请核对状态。');
}
