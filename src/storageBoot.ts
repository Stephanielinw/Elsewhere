import {makeUid} from './core/revisions';
import {STORAGE_KEY,defaults} from './core/defaults';
import {SaveSession,readStoredSave,savePresence,traceStorage} from './core/storageSession';

// Hold the browser's exclusive grant across synchronous saves. All supported writers use this name.
const SAVE_LOCK='elsewhere-main-writer-v1';
async function claimWriter():Promise<(()=>void)|null>{
 try{
  if(!navigator.locks)return null;
  return await new Promise(resolve=>{
   void navigator.locks.request(SAVE_LOCK,{ifAvailable:true},lock=>{
    if(!lock){resolve(null);return;}
    return new Promise<void>(release=>resolve(release));
   }).catch(()=>resolve(null));
  });
 }catch{return null;}
}

export async function startStoredApp(start:(session:SaveSession)=>void):Promise<void> {
 const host=document.getElementById('app');if(!host)return;
 let release:(()=>void)|null=null,exiting=false;
 const hasWriter=()=>release!==null;
 const relinquish=()=>{const end=release;release=null;host.dataset.writeAccess='read-only';end?.();};
 window.addEventListener('pagehide',()=>{exiting=true;relinquish();});
 function show(state:string,message:string,create?:()=>Promise<void>){
  traceStorage('boot-protected',{state});
  host!.dataset.storageState=state;
  host!.innerHTML=`<div class="shell"><main class="phone"><div class="page"><section class="card" role="${create?'status':'alert'}"><h1>Elsewhere</h1><p data-storage-message></p><button class="btn secondary" data-storage-retry>重新读取</button>${create?'<button class="btn" data-storage-create>建立新存档</button>':''}</section></div></main></div>`;
  host!.querySelector('[data-storage-message]')!.textContent=message;
  host!.querySelector('[data-storage-retry]')!.addEventListener('click',()=>location.reload());
  host!.querySelector('[data-storage-create]')?.addEventListener('click',async()=>{try{await create!();}catch{show('unavailable','存储尚未准备好，未写入默认数据。请重新读取。');}});
 }
 function mount(session:SaveSession){try{host!.dataset.storageState='ready';start(session);}catch{relinquish();show('load-failed','本机存档未能安全载入或保存。已停止初始化，请重新读取；不会用默认数据覆盖原记录。');}}
 let store:Storage;try{store=localStorage;}catch{show('unavailable','浏览器不允许读取本机存档。未创建或覆盖任何数据。');return;}
 release=await claimWriter();
 if(exiting){relinquish();return;}
 host.dataset.writeAccess=hasWriter()?'writer':'read-only';
 const snapshot=readStoredSave(store);
 if(snapshot.state==='unavailable'){relinquish();show('unavailable','本机存档暂时无法读取。未创建或覆盖任何数据。');return;}
 if(snapshot.state==='invalid'){relinquish();show('invalid','发现无法解析的本机存档，已保留原始数据。请重新读取或使用已有备份恢复，不会自动重置。');return;}
 if(snapshot.state==='loaded'){
  if(hasWriter())try{await savePresence('known');}catch{traceStorage('presence-unavailable');}
  // Recheck after asynchronous storage work; another page may have changed the world.
  let current:string|null;try{current=store.getItem(STORAGE_KEY);}catch{relinquish();show('unavailable','本机存档暂时无法读取，未写入任何数据。请重新读取。');return;}
  if(current!==snapshot.raw){relinquish();show('changed','存档在读取期间发生变化。未覆盖，请重新读取。');return;}
  traceStorage('boot-ready');mount(new SaveSession(store,snapshot,hasWriter));return;
 }
 if(!hasWriter()){show('read-only','无法取得此存档的独占写入权限。关闭其他 Elsewhere 标签页后重新读取；缺少互斥能力时不能建立新档。');return;}
 try{
  const known=(await savePresence())!=='none';
  const names=typeof indexedDB.databases==='function'?(await indexedDB.databases()).map(d=>d.name):[];
  const other=names.some(n=>['elsewhere-media-v1','elsewhere-fruit-private-v1','elsewhere-life-budget-v1'].includes(n||''));
  const otherLocal=Array.from({length:store.length},(_,i)=>store.key(i)).some(k=>['elsewhere-device-api-key-v1','elsewhere-life-budget-v1'].includes(k||''));
  if(known||other||otherLocal){relinquish();show('missing-known','发现此来源已有存档或初始化记录，但当前未读到主存档。已暂停初始化，避免覆盖。请重新读取。');return;}
  const initialize=async()=>{
   if(!hasWriter()){show('read-only','当前页面没有写入权限，请重新读取后再建立存档。');return;}
   if(readStoredSave(store).state!=='empty'){show('changed','检测到存档变化，未覆盖。请重新读取。');return;}
   const owner=makeUid('storage-init');await savePresence({claim:owner});
   if(readStoredSave(store).state!=='empty'){show('changed','检测到存档变化，未覆盖。请重新读取。');return;}
   traceStorage('initialize-explicit');const value=defaults(),session=new SaveSession(store,{raw:null,value},hasWriter);
   if(!session.write(JSON.stringify(value))){
    // Only a confirmed no-write can release this page's own initial intent.
    const retryable=session.error==='write-failed'&&session.current()&&(await savePresence({release:owner}))==='none';
    show('write-failed','新存档未能确认保存，已停止初始化。未覆盖原记录，请恢复存储后重新读取。',retryable?initialize:undefined);return;
   }
   try{await savePresence('known');}catch{traceStorage('presence-unavailable');}
   mount(session);
  };
  show('empty-unverified','当前未读取到本机存档，尚未写入默认数据。首次使用时可建立新存档；如果以前使用过，请先重新读取。',initialize);
 }catch{relinquish();show('unavailable','无法核验本机存储状态，已暂停初始化。未创建或覆盖任何数据。');}
}
