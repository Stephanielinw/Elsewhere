import {STORAGE_KEY} from './defaults';

type Store=Pick<Storage,'getItem'|'setItem'>;
export type SaveSnapshot={state:'loaded';raw:string;value:Record<string,unknown>}|{state:'empty'|'unavailable'|'invalid';raw:string|null};
export function traceStorage(phase:string,details:Record<string,string|number|boolean>={}):void {
 const trace=(globalThis as typeof globalThis&{__elsewhereStorageTrace?:unknown}).__elsewhereStorageTrace;
 if(Array.isArray(trace)){trace.push({phase,at:Date.now(),...details});if(trace.length>100)trace.splice(0,trace.length-100);}
}
const arrays=(v:Record<string,unknown>,fields:string[])=>fields.every(k=>v[k]===undefined||Array.isArray(v[k]));
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function readStoredSave(store:Pick<Storage,'getItem'>):SaveSnapshot {
 let raw:string|null;try{raw=store.getItem(STORAGE_KEY);}catch{traceStorage('read-unavailable');return {state:'unavailable',raw:null};}
 if(raw===null){traceStorage('read-empty');return {state:'empty',raw};}
 try{
  const value:unknown=JSON.parse(raw);
  if(!object(value)||!Array.isArray(value.roles)||!object(value.settings)||typeof value.settings.endpoint!=='string')throw Error('invalid save');
  if(!arrays(value,['customFrames','customFonts','bubblePresets','logs']))throw Error('invalid lists');
  if(value.sharedTasks!==undefined&&(!object(value.sharedTasks)||!arrays(value.sharedTasks,['ddl','todo'])))throw Error('invalid tasks');
  if(value.focus!=null&&(!object(value.focus)||!arrays(value.focus,['completed'])))throw Error('invalid focus');
  const user=value.user;
  if(user!==undefined&&(!object(user)||['name','pronouns','identity','background','notes','avatarMediaId','frameId','frameMediaId','frameData'].some(k=>user[k]!==undefined&&typeof user[k]!=='string')))throw Error('invalid profile');
  const histories=['chats','diaries','events','plays','meetings','messageRevisions','diaryTasks','pendingReplies','personalThreads','lifeTasks'];
  if(value.roles.some(r=>!object(r)||typeof r.id!=='string'||typeof r.name!=='string'||!arrays(r,histories)||r.footprintsByDate!==undefined&&!object(r.footprintsByDate)||['avatarMediaId','frameId','frameMediaId'].some(k=>r[k]!==undefined&&typeof r[k]!=='string')||['chats','diaries','events'].some(k=>Array.isArray(r[k])&&(r[k] as unknown[]).some(m=>!object(m)))))throw Error('invalid history');
  traceStorage('read-loaded',{roles:value.roles.length});return {state:'loaded',raw,value};
 }catch{traceStorage('read-invalid');return {state:'invalid',raw};}
}
export class SaveSession {
 private confirmed:string|null;private uncertain=false;
 error:'changed'|'unavailable'|'write-failed'|'uncertain'|null=null;
 readonly storage:Store;
 constructor(private store:Store,readonly initial:{raw:string|null;value:unknown}){
  this.confirmed=initial.raw;
  this.storage={getItem:key=>store.getItem(key),setItem:(key,value)=>{if(key!==STORAGE_KEY){store.setItem(key,value);return;}if(!this.write(value))throw Error('存档写入未确认，原记录保留');}};
 }
 get raw():string|null{return this.confirmed;}
 current():boolean {
  if(this.uncertain){this.error='uncertain';return false;}
  try{if(this.store.getItem(STORAGE_KEY)!==this.confirmed){this.error='changed';traceStorage('write-blocked',{reason:'changed'});return false;}return true;}
  catch{this.error='unavailable';traceStorage('write-blocked',{reason:'unavailable'});return false;}
 }
 write(raw:string):boolean {
  if(!this.current())return false;
  let threw=false;traceStorage('write-started');
  try{this.store.setItem(STORAGE_KEY,raw);}catch{threw=true;}
  try{
   const saved=this.store.getItem(STORAGE_KEY);
   if(saved===raw){this.confirmed=raw;this.error=null;traceStorage('write-confirmed',{afterException:threw});return true;}
   if(threw&&saved===this.confirmed){this.error='write-failed';traceStorage('write-failed');return false;}
  }catch{}
  this.uncertain=true;this.error='uncertain';traceStorage('write-uncertain');return false;
 }
}

/** Presence only: a missing main key must never silently erase known local data. */
type Presence='none'|'known'|'reserved';
type PresenceAction='read'|'known'|{claim:string}|{release:string};
export async function savePresence(action:PresenceAction='read'):Promise<Presence> {
 if(typeof indexedDB==='undefined')throw Error('storage unavailable');
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open('elsewhere-save-presence-v1',1);let settled=false,db:IDBDatabase|undefined,tx:IDBTransaction|undefined;
  const timer=setTimeout(()=>fail(),5000);
  function fail(){if(settled)return;settled=true;clearTimeout(timer);try{tx?.abort();}catch{}db?.close();reject(Error('存储状态无法核验'));}
  request.onupgradeneeded=()=>request.result.createObjectStore('presence');
  request.onerror=request.onblocked=fail;
  request.onsuccess=()=>{
   db=request.result;if(settled){db.close();return;}db.onversionchange=()=>db!.close();
   try{tx=db.transaction('presence',action==='read'?'readonly':'readwrite',{durability:'strict'});}catch{fail();return;}
   let result:Presence='none';const store=tx.objectStore('presence'),get=store.get('known');
   get.onsuccess=()=>{
    const value:unknown=get.result,owner=object(value)&&typeof value.owner==='string'?value.owner:null;
    if(value!==undefined&&value!==true&&!owner){tx!.abort();return;}
    result=value===true?'known':owner?'reserved':'none';
    if(action==='known'){store.put(true,'known');result='known';}
    else if(typeof action==='object'&&'claim'in action){if(value!==undefined){tx!.abort();return;}store.put({owner:action.claim},'known');result='reserved';}
    else if(typeof action==='object'&&'release'in action&&owner===action.release){store.delete('known');result='none';}
   };
   tx.oncomplete=()=>{db!.close();if(settled)return;settled=true;clearTimeout(timer);resolve(result);};
   tx.onabort=tx.onerror=fail;
  };
 });
}
