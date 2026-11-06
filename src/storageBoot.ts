import {makeUid} from './core/revisions';
import {STORAGE_KEY,defaults} from './core/defaults';
import {SAVE_ACCESS_EVENT,SaveSession,readStoredSave,savePresence,traceStorage} from './core/storageSession';
import {DIARY_REQUEST_DB} from './core/diaryRequests';

// Hold the browser's exclusive grant across synchronous saves. All supported writers use this name.
const SAVE_LOCK='elsewhere-main-writer-v1';
type ReleaseWriter=()=>Promise<void>;
async function claimWriter():Promise<ReleaseWriter|null>{
 try{
  if(!navigator.locks)return null;
  return await new Promise(resolve=>{
   const finished=navigator.locks.request(SAVE_LOCK,{ifAvailable:true},lock=>{
    if(!lock){resolve(null);return;}
    return new Promise<void>(unlock=>resolve(()=>{unlock();return finished.catch(()=>{});}));
   });
   void finished.catch(()=>resolve(null));
  });
 }catch{return null;}
}

export async function startStoredApp(start:(session:SaveSession)=>void):Promise<void> {
 const host=document.getElementById('app');if(!host)return;
 let release:ReleaseWriter|null=null,hidden=false,epoch=0;
 let pending:{epoch:number;done:Promise<void>}|undefined,releasing:Promise<void>|undefined;
 let session:SaveSession|undefined,resumeBoot:(()=>void)|undefined;
 const hasWriter=()=>release!==null;
 const relinquish=()=>{
  const end=release;release=null;host.dataset.writeAccess='read-only';
  if(end)releasing=end().finally(()=>{releasing=undefined;});
  return releasing;
 };
 async function acquireWriter():Promise<void>{
  if(hidden||hasWriter())return;
  const requestedEpoch=epoch;
  // The browser can still hold a released grant until its request promise settles.
  if(releasing)await releasing;
  if(hidden||requestedEpoch!==epoch||hasWriter())return;
  if(pending){
   const previous=pending;
   await previous.done;
   if(previous.epoch!==requestedEpoch&&requestedEpoch===epoch)await acquireWriter();
   return;
  }
  const done=claimWriter().then(async end=>{
   if(!end)return;
   // A grant requested before another pagehide cannot authorize this document.
   if(hidden||requestedEpoch!==epoch){await end();return;}
   release=end;
   if(session&&!session.current())await relinquish();
  }).finally(()=>{pending=undefined;});
  pending={epoch:requestedEpoch,done};
  await done;
 }
 window.addEventListener('pagehide',()=>{
  if(hidden)return;
  hidden=true;epoch++;
  relinquish();
 });
 window.addEventListener('pageshow',event=>{
  if(!event.persisted||!hidden)return;
  hidden=false;
  const resume=resumeBoot;resumeBoot=undefined;resume?.();
  if(session)void acquireWriter().then(()=>{
   host.dataset.writeAccess=hasWriter()?'writer':'read-only';
   window.dispatchEvent(new Event(SAVE_ACCESS_EVENT));
  });
 });
 function show(state:string,message:string,create?:()=>Promise<void>){
  traceStorage('boot-protected',{state});
  host!.dataset.storageState=state;
  host!.innerHTML=`<div class="shell"><main class="phone"><div class="page"><section class="card" role="${create?'status':'alert'}"><h1>Elsewhere</h1><p data-storage-message></p><button class="btn secondary" data-storage-retry>重新读取</button>${create?'<button class="btn" data-storage-create>建立新存档</button>':''}</section></div></main></div>`;
  host!.querySelector('[data-storage-message]')!.textContent=message;
  host!.querySelector('[data-storage-retry]')!.addEventListener('click',()=>location.reload());
  host!.querySelector('[data-storage-create]')?.addEventListener('click',async()=>{try{await create!();}catch{show('unavailable','存储尚未准备好，未写入默认数据。请重新读取。');}});
 }
 function mount(archive:SaveSession){session=archive;try{host!.dataset.storageState='ready';start(archive);}catch{session=undefined;relinquish();show('load-failed','本机存档未能安全载入或保存。已停止初始化，请重新读取；不会用默认数据覆盖原记录。');}}
 let store:Storage;try{store=localStorage;}catch{show('unavailable','浏览器不允许读取本机存档。未创建或覆盖任何数据。');return;}
 for(;;){
  const started=epoch;
  await acquireWriter();
  if(hidden)await new Promise<void>(resolve=>{resumeBoot=resolve;});
  else if(started===epoch)break;
 }
 host.dataset.writeAccess=hasWriter()?'writer':'read-only';
 const snapshot=readStoredSave(store);
 if(snapshot.state==='unavailable'){relinquish();show('unavailable','本机存档暂时无法读取。未创建或覆盖任何数据。');return;}
 if(snapshot.state==='invalid'){relinquish();show('invalid','发现无法解析的本机存档，已保留原始数据。请重新读取或使用已有备份恢复，不会自动重置。');return;}
 if(snapshot.state==='loaded'){
  const archive=new SaveSession(store,snapshot,hasWriter);
  session=archive;
  if(hasWriter())try{await savePresence('known');}catch{traceStorage('presence-unavailable');}
  // Recheck after asynchronous storage work; another page may have changed the world.
  let current:string|null;try{current=store.getItem(STORAGE_KEY);}catch{session=undefined;relinquish();show('unavailable','本机存档暂时无法读取，未写入任何数据。请重新读取。');return;}
  if(current!==snapshot.raw){session=undefined;relinquish();show('changed','存档在读取期间发生变化。未覆盖，请重新读取。');return;}
  traceStorage('boot-ready');mount(archive);return;
 }
 if(!hasWriter()){show('read-only','无法取得此存档的独占写入权限。关闭其他 Elsewhere 标签页后重新读取；缺少互斥能力时不能建立新档。');return;}
 session=new SaveSession(store,{raw:null,value:null},hasWriter);
 try{
  const known=(await savePresence())!=='none';
  const names=typeof indexedDB.databases==='function'?(await indexedDB.databases()).map(d=>d.name):[];
  const other=names.some(n=>['elsewhere-media-v1','elsewhere-fruit-private-v1','elsewhere-life-budget-v1',DIARY_REQUEST_DB].includes(n||''));
  const otherLocal=Array.from({length:store.length},(_,i)=>store.key(i)).some(k=>['elsewhere-device-api-key-v1','elsewhere-life-budget-v1'].includes(k||''));
  if(known||other||otherLocal){session=undefined;relinquish();show('missing-known','发现此来源已有存档或初始化记录，但当前未读到主存档。已暂停初始化，避免覆盖。请重新读取。');return;}
  const initialize=async()=>{
   if(!hasWriter()){show('read-only','当前页面没有写入权限，请重新读取后再建立存档。');return;}
   if(readStoredSave(store).state!=='empty'){show('changed','检测到存档变化，未覆盖。请重新读取。');return;}
   const owner=makeUid('storage-init');await savePresence({claim:owner});
   if(readStoredSave(store).state!=='empty'){show('changed','检测到存档变化，未覆盖。请重新读取。');return;}
   traceStorage('initialize-explicit');const value=defaults(),archive=new SaveSession(store,{raw:null,value},hasWriter);
   session=archive;
   if(!archive.write(JSON.stringify(value))){
    // Only a confirmed no-write can release this page's own initial intent.
    const retryable=archive.error==='write-failed'&&archive.current()&&(await savePresence({release:owner}))==='none';
    show('write-failed','新存档未能确认保存，已停止初始化。未覆盖原记录，请恢复存储后重新读取。',retryable?initialize:undefined);return;
   }
   try{await savePresence('known');}catch{traceStorage('presence-unavailable');}
   mount(archive);
  };
  show('empty-unverified','当前未读取到本机存档，尚未写入默认数据。首次使用时可建立新存档；如果以前使用过，请先重新读取。',initialize);
 }catch{session=undefined;relinquish();show('unavailable','无法核验本机存储状态，已暂停初始化。未创建或覆盖任何数据。');}
}
