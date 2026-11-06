import {DEFAULT_API_SETTINGS,STORAGE_KEY} from './defaults';
import {normalizeApiBase} from './modelDiscovery';

type Store=Pick<Storage,'getItem'|'setItem'>;
export const SAVE_ACCESS_EVENT='elsewhere-save-access';
export type SaveSnapshot={state:'loaded';raw:string;value:Record<string,unknown>}|{state:'empty'|'unavailable'|'invalid';raw:string|null};
export function traceStorage(phase:string,details:Record<string,string|number|boolean>={}):void {
 const trace=(globalThis as typeof globalThis&{__elsewhereStorageTrace?:unknown}).__elsewhereStorageTrace;
 if(Array.isArray(trace)){trace.push({phase,at:Date.now(),...details});if(trace.length>100)trace.splice(0,trace.length-100);}
}
const arrays=(v:Record<string,unknown>,fields:string[])=>fields.every(k=>v[k]===undefined||Array.isArray(v[k]));
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const finiteNumber=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const positiveNumber=(value:unknown)=>finiteNumber(value)&&value>0;

export function validateStoredWorld(value:unknown):Record<string,unknown> {
  if(!object(value)||!Array.isArray(value.roles)||!object(value.settings))throw Error('不是有效的 Elsewhere 存档');
  const settings=value.settings,legacy=value.version===undefined||value.version===1||value.version===2;
  const {
    endpoint=legacy?'':undefined,
    mode=legacy?DEFAULT_API_SETTINGS.mode:undefined,
    model=legacy?DEFAULT_API_SETTINGS.model:undefined,
    temperature=legacy?DEFAULT_API_SETTINGS.temperature:undefined,
    maxTokens=legacy?DEFAULT_API_SETTINGS.maxTokens:undefined,
    autonomousLife,
  }=settings;
  if(typeof endpoint!=='string')throw Error('API 地址必须是文本');
  const base=endpoint.trim()?normalizeApiBase(endpoint):'';
  if(mode!=='api'&&mode!=='demo')throw Error('API 运行方式无效');
  if(typeof model!=='string'||model.length>512)throw Error('模型 ID 必须是至多 512 字符的文本');
  if(typeof temperature!=='number'||!Number.isFinite(temperature)||temperature<0||temperature>2)throw Error('Temperature 必须是 0–2 的数字');
  if(typeof maxTokens!=='number'||!Number.isSafeInteger(maxTokens)||maxTokens<=0)throw Error('输出预算必须是正整数');
  if(autonomousLife!==undefined&&typeof autonomousLife!=='boolean')throw Error('生活推进开关必须是布尔值');
  if(!arrays(value,['customFrames','customFonts','bubblePresets','logs']))throw Error('存档列表无效');
  if(value.sharedTasks!==undefined&&(!object(value.sharedTasks)||!arrays(value.sharedTasks,['ddl','todo'])))throw Error('待办结构无效');
  if(value.focus!=null){
    const focus=value.focus;
    if(!object(focus)||!arrays(focus,['completed']))throw Error('专注记录结构无效');
    if(focus.workMinutes!==undefined&&!positiveNumber(focus.workMinutes))throw Error('专注设置时长无效');
    if(focus.active!=null){
      const active=focus.active;
      if(!object(active)||!arrays(active,['participants','participantRoleIds','tasks','moments']))throw Error('进行中的专注结构无效');
      if(['minutes','durationMs'].some(key=>active[key]!==undefined&&!positiveNumber(active[key]))
        ||['elapsedMs','startedAt','nextLiveLogDueAt'].some(key=>active[key]!==undefined&&!finiteNumber(active[key]))
        ||active.runSince!=null&&!finiteNumber(active.runSince))throw Error('进行中的专注时间无效');
    }
    for(const record of (focus.completed as unknown[]|undefined)||[]){
      if(!object(record)||['minutes','plannedMinutes'].some(key=>record[key]!==undefined&&!positiveNumber(record[key])))throw Error('归档专注时长无效');
      const run=record.summaryRun;
      if(run!==undefined&&(!object(run)||!Array.isArray(run.remainingRoleIds)||run.remainingRoleIds.some(id=>typeof id!=='string')||run.pendingRoleId!==undefined&&!run.remainingRoleIds.includes(run.pendingRoleId)))throw Error('专注总结进度无效');
    }
  }
  const user=value.user;
  if(user!==undefined&&(!object(user)||['name','pronouns','identity','background','notes','avatarMediaId','frameId','frameMediaId','frameData'].some(k=>user[k]!==undefined&&typeof user[k]!=='string')))throw Error('用户资料结构无效');
  const histories=['chats','diaries','events','plays','meetings','messageRevisions','diaryTasks','pendingReplies','personalThreads','lifeTasks'];
  if(value.roles.some(r=>!object(r)||typeof r.id!=='string'||typeof r.name!=='string'||!arrays(r,histories)||r.footprintsByDate!==undefined&&!object(r.footprintsByDate)||['avatarMediaId','frameId','frameMediaId'].some(k=>r[k]!==undefined&&typeof r[k]!=='string')||['chats','diaries','events'].some(k=>Array.isArray(r[k])&&(r[k] as unknown[]).some(m=>!object(m)))))throw Error('角色资料或历史结构无效');
  if(value.roles.some(r=>r.diaries?.some((entry:Record<string,unknown>)=>entry.wordCount!==undefined
    && (typeof entry.wordCount!=='number'||!Number.isSafeInteger(entry.wordCount)||entry.wordCount<0))))throw Error('日记归档字数无效');
  return {...value,settings:{...settings,endpoint:base,mode,model,temperature,maxTokens}};
}
export function readStoredSave(store:Pick<Storage,'getItem'>):SaveSnapshot {
 let raw:string|null;try{raw=store.getItem(STORAGE_KEY);}catch{traceStorage('read-unavailable');return {state:'unavailable',raw:null};}
 if(raw===null){traceStorage('read-empty');return {state:'empty',raw};}
 try{
  const value=validateStoredWorld(JSON.parse(raw));
  traceStorage('read-loaded',{roles:(value.roles as unknown[]).length});return {state:'loaded',raw,value};
 }catch{traceStorage('read-invalid');return {state:'invalid',raw};}
}
export class SaveSession {
 private confirmed:string|null;private uncertain=false;
 error:'changed'|'unavailable'|'write-failed'|'uncertain'|'read-only'|null=null;
 readonly storage:Store;
 constructor(private store:Store,readonly initial:{raw:string|null;value:unknown},readonly hasWriter:()=>boolean){
  this.confirmed=initial.raw;
  this.storage={getItem:key=>store.getItem(key),setItem:(key,value)=>{if(key!==STORAGE_KEY){if(!this.current())throw Error('当前页面没有写入权限');store.setItem(key,value);return;}if(!this.write(value))throw Error('存档写入未确认');}};
 }
 get raw():string|null{return this.confirmed;}
 current():boolean {
  if(this.uncertain){this.error='uncertain';return false;}
  try{if(this.store.getItem(STORAGE_KEY)!==this.confirmed){this.error='changed';traceStorage('write-blocked',{reason:'changed'});return false;}}
  catch{this.error='unavailable';traceStorage('write-blocked',{reason:'unavailable'});return false;}
  if(!this.hasWriter()){this.error='read-only';traceStorage('write-blocked',{reason:'read-only'});return false;}
  return true;
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
