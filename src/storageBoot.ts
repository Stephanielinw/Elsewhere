import {makeUid} from './core/revisions';
import {STORAGE_KEY,defaults} from './core/defaults';
import {SAVE_ACCESS_EVENT,SaveSession,normalizeStoredWorld,readRecoveryBaseline,readStoredSave,savePresence,traceStorage} from './core/storageSession';
import {DIARY_REQUEST_DB} from './core/diaryRequests';
import {backupImpact,downloadRawSave,prepareBackup,readBackupFile} from './core/backup';
import {stageBackupMedia} from './core/media';

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
 let store:Storage;
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
 function appSession(snapshot:SaveSession['initial']):SaveSession {
  const archive:SaveSession=new SaveSession(store,snapshot,()=>session===archive&&hasWriter());
  return archive;
 }
 function show(state:string,message:string,create?:()=>Promise<void>,uncertainRaw?:string|null){
  traceStorage('boot-protected',{state});
  host!.dataset.storageState=state;
  host!.innerHTML=`<div class="shell"><main class="phone"><div class="viewport">
   <section class="card">
    <h1>Elsewhere</h1><p data-storage-message role="status"></p>
    <button type="button" class="btn secondary" data-storage-retry>重新读取</button>
    ${create?'<button type="button" class="btn" data-storage-create>建立新存档</button>':''}
   </section>
   <section class="card" aria-label="存档恢复">
    <h2>存档恢复</h2><p class="sub" data-storage-raw-state></p>
    <button type="button" class="btn secondary" data-storage-export>导出原始数据</button>
    <p class="sub"><label for="storage-backup-file">选择 Elsewhere 备份文件</label></p>
    <input id="storage-backup-file" class="field" type="file" accept=".json,application/json">
    <p class="sub" data-storage-result role="status"></p>
    <button type="button" class="btn" data-storage-restore disabled>确认恢复</button>
    <button type="button" class="btn" data-storage-enter hidden>进入应用</button>
   </section>
  </div></main></div>`;
  const input=host!.querySelector<HTMLInputElement>('#storage-backup-file')!;
  const confirm=host!.querySelector<HTMLButtonElement>('[data-storage-restore]')!;
  const enter=host!.querySelector<HTMLButtonElement>('[data-storage-enter]')!;
  const rawButton=host!.querySelector<HTMLButtonElement>('[data-storage-export]')!;
  const createButton=host!.querySelector<HTMLButtonElement>('[data-storage-create]');
  const rawState=host!.querySelector('[data-storage-raw-state]')!;
  const result=host!.querySelector('[data-storage-result]')!;
  let retainedRaw=uncertainRaw,blocked=uncertainRaw!==undefined,busy=false,selection=0,restored=false;
  let selected:{raw:string|null;backup:ReturnType<typeof prepareBackup>}|undefined;
  const currentRaw=()=>{
   if(!store)throw Error('本机主档暂时无法读取。');
   return readRecoveryBaseline(store);
  };
  const refreshRaw=()=>{
   rawButton.disabled=true;
   try{
    const raw=retainedRaw!==undefined?retainedRaw:currentRaw();
    rawButton.disabled=raw===null;
    rawState.textContent=raw===null?'没有可导出的本机主档。':retainedRaw!==undefined?
     '可下载恢复前已读取的原始数据，文件不包含附件。':'可下载本机主档原文，文件不包含附件。';
   }catch{rawState.textContent='暂时无法读取本机主档，当前无法导出。';}
  };
  const controls=()=>{
   input.disabled=busy||blocked||restored;
   confirm.disabled=busy||blocked||restored||!selected;
   if(createButton)createButton.disabled=busy||blocked||restored;
  };
  refreshRaw();
  controls();
  host!.querySelector('[data-storage-message]')!.textContent=message;
  host!.querySelector('[data-storage-retry]')!.addEventListener('click',()=>location.reload());
  rawButton.addEventListener('click',()=>{
   try{
    const raw=retainedRaw!==undefined?retainedRaw:currentRaw();
    if(raw!==null)downloadRawSave(raw);
   }catch{refreshRaw();}
  });
  input.addEventListener('change',async()=>{
   const version=++selection;
   selected=undefined;controls();
   const file=input.files?.[0];
   if(!file||busy||blocked){result.textContent='';return;}
   result.textContent='正在校验备份…';
   try{
    const raw=currentRaw();
    const backup=prepareBackup(await readBackupFile(file));
    if(version!==selection||!input.isConnected)return;
    selected={raw,backup};
    result.textContent=backupImpact(backup,raw!==null);
   }catch(error){
    if(version===selection)result.textContent=error instanceof Error?error.message:'备份校验失败。';
   }
   controls();
  });
  confirm.addEventListener('click',async()=>{
   if(!selected||busy||blocked||restored)return;
   const target=selected,started=epoch,alreadyWriter=hasWriter();
   busy=true;controls();result.textContent='正在恢复备份…';
   const checkedStore={
    getItem:(key:string)=>key===STORAGE_KEY?currentRaw():store.getItem(key),
    setItem:(key:string,value:string)=>store.setItem(key,value),
   };
   const archive=new SaveSession(checkedStore,{raw:target.raw,value:null},()=>hasWriter()&&started===epoch);
   let committed=false;
   const check=()=>{
    if(hidden||started!==epoch)throw Error('页面已离开，恢复已停止。请重新读取。');
    if(currentRaw()!==target.raw)throw Error('本机主档已被修改，未覆盖。请重新读取。');
    if(!archive.current())throw Error('无法取得独占写入权限，请关闭其他 Elsewhere 标签页后重试。');
   };
   try{
    await acquireWriter();
    check();
    const world=structuredClone(target.backup.world);
    await stageBackupMedia(world,target.backup.attachments);
    check();
    const raw=JSON.stringify(world);
    if(!archive.write(raw))throw Error(archive.error==='uncertain'?
     '写入结果不确定，请先保留原始数据，再重新读取。':'存档未保存，原主档与旧附件保留。');
    committed=true;
    try{await savePresence('known');}catch{traceStorage('presence-unavailable');}
    const verified=readStoredSave(checkedStore);
    if(hidden||started!==epoch||!archive.current()||verified.state!=='loaded'||verified.raw!==raw){
     throw Error('保存后无法确认恢复结果，请重新读取。');
    }
    normalizeStoredWorld(verified.value);
    restored=true;
    retainedRaw=target.raw;
    host!.dataset.storageState='restored';
    result.textContent='恢复成功，已重新校验本机主档。点击「进入应用」继续。';
    enter.hidden=false;
   }catch(error){
    if(committed||archive.error==='uncertain'){blocked=true;retainedRaw=target.raw;}
    result.textContent=error instanceof Error?error.message:'恢复失败。';
    selected=undefined;
   }finally{
    if(!alreadyWriter||restored||blocked)relinquish();
    busy=false;controls();refreshRaw();
   }
  });
  enter.addEventListener('click',()=>location.reload());
  createButton?.addEventListener('click',async()=>{
   if(busy||blocked||restored)return;
   busy=true;controls();
   try{await create!();}
   catch{show('unavailable','存储尚未准备好，未写入默认数据。请重新读取。');}
   finally{busy=false;controls();}
  });
 }
 function mount(archive:SaveSession){session=archive;try{host!.dataset.storageState='ready';start(archive);}catch{session=undefined;relinquish();show('load-failed','本机存档未能安全载入或保存。已停止初始化，请重新读取；不会用默认数据覆盖原记录。',undefined,archive.error==='uncertain'?archive.raw:undefined);}}
 try{store=localStorage;}catch{show('unavailable','浏览器不允许读取本机存档。未创建或覆盖任何数据。');return;}
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
  const archive=appSession(snapshot);
  session=archive;
  if(hasWriter())try{await savePresence('known');}catch{traceStorage('presence-unavailable');}
  // Recheck after asynchronous storage work; another page may have changed the world.
  let current:string|null;try{current=store.getItem(STORAGE_KEY);}catch{session=undefined;relinquish();show('unavailable','本机存档暂时无法读取，未写入任何数据。请重新读取。');return;}
  if(current!==snapshot.raw){session=undefined;relinquish();show('changed','存档在读取期间发生变化。未覆盖，请重新读取。');return;}
  traceStorage('boot-ready');mount(archive);return;
 }
 try{
  if(readRecoveryBaseline(store)!==null)throw Error();
 }catch{relinquish();show('missing-known','暂时无法确认主档是否存在。已暂停初始化，请重新读取。');return;}
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
   if(readRecoveryBaseline(store)!==null){show('changed','检测到存档变化，未覆盖。请重新读取。');return;}
   const owner=makeUid('storage-init');await savePresence({claim:owner});
   if(readRecoveryBaseline(store)!==null){show('changed','检测到存档变化，未覆盖。请重新读取。');return;}
   traceStorage('initialize-explicit');const value=defaults(),archive=appSession({raw:null,value});
   session=archive;
   if(!archive.write(JSON.stringify(value))){
    // Only a confirmed no-write can release this page's own initial intent.
    const retryable=archive.error==='write-failed'&&archive.current()&&(await savePresence({release:owner}))==='none';
    show('write-failed','新存档未能确认保存，已停止初始化。请恢复存储后重新读取。',retryable?initialize:undefined,archive.error==='uncertain'?archive.raw:undefined);return;
   }
   try{await savePresence('known');}catch{traceStorage('presence-unavailable');}
   mount(archive);
  };
  show('empty-unverified','当前未读取到本机存档，尚未写入默认数据。首次使用时可建立新存档；如果以前使用过，请先重新读取。',initialize);
 }catch{session=undefined;relinquish();show('unavailable','无法核验本机存储状态，已暂停初始化。未创建或覆盖任何数据。');}
}
