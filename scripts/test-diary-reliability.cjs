const assert=require('node:assert/strict');
const approveBackupImports=require('./backup-confirmation.cjs');
const {pathToFileURL}=require('node:url');
const {join}=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const app=new URL(process.env.TEST_URL||pathToFileURL(join(__dirname,'../public/Elsewhere_Phase1_Standalone.html')).href);
assert.ok(app.protocol==='file:'||(['http:','https:'].includes(app.protocol)&&['localhost','127.0.0.1','[::1]'].includes(app.hostname)));
const endpoint='https://diary-fixture.invalid/v1',key='elsewhere-v01',dbName='elsewhere-diary-requests-v1';
const read=p=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
const wait=async(fn,label)=>{
 const end=Date.now()+7000;
 do{if(await fn())return;await new Promise(resolve=>setTimeout(resolve,25));}while(Date.now()<end);
 throw Error('Timed out: '+label);
};
const ready=p=>p.locator('#app[data-storage-state=ready]').waitFor();
const archives=async p=>(await read(p)).roles.flatMap(r=>r.diaries.filter(d=>d.speaker==='char'&&d.source!=='life'));
async function receipts(p){
 return p.evaluate(async dbName=>{
  if(!(await indexedDB.databases()).some(db=>db.name===dbName))return [];
  return new Promise((resolve,reject)=>{
   const open=indexedDB.open(dbName,1);
   open.onerror=()=>reject(open.error);
   open.onsuccess=()=>{
    const db=open.result,tx=db.transaction('receipts'),store=tx.objectStore('receipts'),keys=store.getAllKeys(),rows=store.getAll();
    tx.onabort=()=>{db.close();reject(tx.error);};
    tx.oncomplete=()=>{db.close();resolve(rows.result.map((row,i)=>({key:JSON.parse(keys.result[i]),state:row.state,hasText:typeof row.result?.text==='string'})));};
   };
  });
 },dbName);
}

async function main(){
 const {defaults,createRole}=await import('../src/core/defaults.ts');
 const {toLocalDateKey,shiftDateKey,buildCharacterDiaryPrompt}=await import('../src/core/diary.ts');
 const {roleMemoryText}=await import('../src/core/roleMemoryView.ts');
 const {diarySourceHash,diaryRequestKey}=await import('../src/core/diaryRequests.ts');
 const day=shiftDateKey(toLocalDateKey(Date.now()),-1);
 const away=app.protocol==='file:'?'data:text/html,isolated-diary-navigation':new URL('/elsewhere-diary-navigation',app).href;
 const browser=await chromium.launch({ignoreDefaultArgs:['--disable-back-forward-cache'],...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 async function run(name,body,{days=1,hold=false,fault='',count=1,claims=count,roles=1,onlyFirst=false,manual=false,legacyInFlight=false,existing=false,network='',sources=false,text='合成的私人记录。',finish='stop'}={}){
  if(process.env.TEST_CASE&&!name.includes(process.env.TEST_CASE))return;
  const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},ignoreHTTPSErrors:true});
  await approveBackupImports(ctx);
  let bootstrap=true,unblock;
  const gate=new Promise(resolve=>{unblock=resolve;});
  const posts=[],errors=[],committedClaims=[];
  try{
   ctx.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
   await ctx.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.href===away&&req.method()==='GET')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated navigation</title>'});
    if(bootstrap&&req.isNavigationRequest()&&url.href===app.href){
     bootstrap=false;return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated diary fixture</title>'});
    }
    if(url.href===endpoint+'/chat/completions'){
     const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST','access-control-allow-headers':'*'};
     if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
     if(req.method()==='POST'){
      posts.push(req.postDataJSON().messages.map(m=>m.content).join('\n'));
      if(hold)await gate;
      if(network==='abort')return route.abort('timedout').catch(()=>{});
      if(network==='http'&&posts.length===1)return route.fulfill({status:503,headers,json:{error:'fixture'}}).catch(()=>{});
      return route.fulfill({headers,json:{choices:[{finish_reason:finish,message:{role:'assistant',content:text}}]}}).catch(()=>{});
     }
    }
    if(req.method()==='GET'&&(url.href===app.href||app.protocol!=='file:'&&url.origin===app.origin))return route.continue();
    return route.abort();
   });
   await ctx.exposeBinding('fixtureDiaryClaimed',(_source,key)=>{committedClaims.push(key);});
   await ctx.addInitScript(({fault,key,dbName})=>{
    window.fixtureDoc=Math.random();
    window.fixtureRestored=false;
    addEventListener('pageshow',event=>{if(event.persisted)window.fixtureRestored=true;});
    const set=Storage.prototype.setItem;
    let stop=false;
    if(fault==='no-locks')Object.defineProperty(navigator,'locks',{value:undefined});
    Storage.prototype.setItem=function(k,v){
     if(k===key&&window.fixtureFailWrites!==false){
      const data=JSON.parse(v);
      if(fault==='preflight'&&data.roles.some(r=>r.diaryTasks?.some(t=>['generating','claimed'].includes(t.status)&&t.attempts)))stop=true;
      if(fault==='archive'&&data.roles.some(r=>r.diaries?.some(d=>d.text==='合成的私人记录。')))throw new DOMException('fixture quota','QuotaExceededError');
      if(stop)throw new DOMException('fixture quota','QuotaExceededError');
     }
     return set.call(this,k,v);
    };
    if(fault==='idb'){
     const open=indexedDB.open.bind(indexedDB);
     indexedDB.open=(name,...args)=>{if(name===dbName)throw new DOMException('fixture IDB unavailable','SecurityError');return open(name,...args);};
    }
    const subtle=globalThis.crypto?.subtle;
    if(subtle){
     const digest=subtle.digest.bind(subtle);
     subtle.digest=(...args)=>sessionStorage.getItem('fixture-diary-source-unavailable')
      ?Promise.reject(Error('synthetic source hash unavailable')):digest(...args);
    }
    const put=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(row,id){
     if(this.transaction.db.name===dbName){
      if(fault==='result'&&row.state==='ready')throw new DOMException('fixture result write','QuotaExceededError');
      if(fault==='claim')throw new DOMException('fixture IDB write','QuotaExceededError');
      if(row.state==='claimed')this.transaction.addEventListener('complete',()=>window.fixtureDiaryClaimed(id),{once:true});
     }
     return put.call(this,row,id);
    };
   },{fault,key,dbName});
   const p=await ctx.newPage();p.setDefaultTimeout(6500);
   await p.goto(app.href);
   const world=defaults();
   world.settings={...world.settings,mode:'api',endpoint,model:'synthetic-diary',autonomousLife:false};
   world.roles=Array.from({length:roles},(_,i)=>{
    const r=createRole('合成记录者'+i,'','馆员','沉静','虚构港口'),at=Date.now();
    r.id='fixture-role-'+i;r.lifeAt=at;r.lastDiaryCheckDay=toLocalDateKey(at);
    r.firstMessageState={status:'ready',updatedAt:at};r.chats=[];r.events=[];r.diaries=[];
    if(sources&&(!onlyFirst||i===0)){
     const [y,m,d]=day.split('-').map(Number),past=new Date(y,m-1,d,12).getTime();
     r.chats=[{id:'fixture-phone',speaker:'me',text:'合成聊天素材',at:past}];
     r.events=[{id:'fixture-life',kind:'life',title:'合成生活素材',detail:'按设定整理档案',at:past,knownBy:[r.id],lifeEvidence:'confirmed',source:'fixture'}];
    }
    if(existing)r.diaries=[{id:'already-saved',speaker:'char',dateKey:day,at:at-86400000,source:'ai',text:'已有编辑归档'}];
    r.diaryTasks=Array.from({length:onlyFirst&&i>0?0:days},(_,i)=>({id:'legacy-task-'+i,roleId:r.id,dateKey:shiftDateKey(day,-i),status:legacyInFlight?'generating':manual?'failed':'pending',attempts:legacyInFlight?1:0,createdAt:at,updatedAt:at}));
    return r;
   });
   world.selected=null;
   await p.evaluate(({key,world,endpoint})=>{
    localStorage.setItem(key,JSON.stringify(world));
    localStorage.setItem('elsewhere-device-api-key-v1',JSON.stringify({endpoint,key:'synthetic-credential'}));
   },{key,world,endpoint});
   await p.reload();await ready(p);
   const info=await body({p,ctx,posts,unblock,day});
   const expected=process.env.BASELINE?(name.includes('takeover')?2:name.includes('save failure before')?7:count):count;
   assert.equal(posts.length,expected,'actual model POST count');
   assert.deepEqual(errors,[],'uncaught browser errors');
   if(!process.env.BASELINE){if(claims)await wait(()=>committedClaims.length>=claims,'committed claim count');assert.equal(committedClaims.length,claims);}
   console.log('PASS',name,JSON.stringify({claims:committedClaims.length,posts:posts.length,...info}));
  }finally{unblock();await ctx.close();}
 }
 async function open(ctx){const p=await ctx.newPage();p.setDefaultTimeout(6500);await p.goto(app.href);await ready(p);return p;}
 async function flush(p){await p.waitForTimeout(400);}
 async function enterDiary(p,id='fixture-role-0'){
  await p.locator('[data-action=enter][data-id='+id+']').click();
  await p.locator('[data-home-page="1"]').click();
  await p.getByRole('button',{name:'打开日记'}).click();
 }
 const retry=(p,day)=>p.locator('[data-action=retrydiary][data-date="'+day+'"]').click();
 const states=async p=>(await receipts(p)).map(row=>row.state).sort();
 try{
  await run('takeover after dispatched request is never an automatic second POST',async({p,ctx,posts})=>{
   await wait(()=>posts.length===1,'first real model POST');
   const b=await open(ctx),c=await open(ctx);
   assert.equal(await b.locator('#app').getAttribute('data-write-access'),'read-only');
   assert.equal(await c.locator('#app').getAttribute('data-write-access'),'read-only');
   await b.reload();await ready(b);assert.equal(posts.length,1,'contender reload while first request is pending');
   await p.close();
   await b.reload();await ready(b);
   assert.equal(await b.locator('#app').getAttribute('data-write-access'),'writer');
   await c.reload();await ready(c);
   if(process.env.BASELINE)await wait(()=>posts.length===2,'original duplicate request');
   else{
    await flush(b);assert.deepEqual(await states(b),['sent']);
    assert.equal((await archives(b)).length,0);
   }
   return {archived:(await archives(b)).length,uncertain:1,automaticRetries:posts.length-1};
  },{hold:true});
  await run('save failure before dispatch stops all seven tasks',async({p,posts})=>{
   if(process.env.BASELINE)await wait(()=>posts.length===7,'original queue continued dispatching');
   else{await wait(async()=>JSON.stringify(await states(p))==='["claimed"]','only one durable claim');await flush(p);}
   assert.equal((await archives(p)).length,0);
   return {archived:0,uncertain:0,automaticRetries:0};
  },{days:7,fault:'preflight',count:0,claims:1});
  if(process.env.BASELINE)return;
  await run('legacy in-flight state without a receipt requires manual handling',async({p})=>{
   await flush(p);assert.deepEqual(await states(p),[]);
   assert.equal((await read(p)).roles[0].diaryTasks[0].status,'uncertain');
   return {archived:0,uncertain:1,automaticRetries:0};
  },{legacyInFlight:true,count:0});
  await run('known unsent claim can be manually attempted once without a fee prompt',async({p,posts,day})=>{
   await wait(async()=>JSON.stringify(await states(p))==='["claimed"]','durable but unsent');
   await flush(p);assert.equal(posts.length,0);
   await p.evaluate(()=>window.fixtureFailWrites=false);
   let prompts=0;
   p.on('dialog',dialog=>{prompts++;void dialog.dismiss();});
   await enterDiary(p);await retry(p,day);
   await wait(async()=>JSON.stringify(await states(p))==='["archived"]','retry confirmed archive');
   assert.equal(prompts,0);
   return {archived:1,uncertain:0,automaticRetries:0};
  },{fault:'preflight',claims:2});
  await run('daily diary uses its chat and life sources and survives reload',async({p,posts,day})=>{
   await wait(async()=>JSON.stringify(await states(p))==='["archived"]','durable archive');
   assert.ok(posts[0].includes('合成聊天素材')&&posts[0].includes('合成生活素材'));
   const [entry]=await archives(p);
   assert.equal(entry.dateKey,day);assert.deepEqual(entry.sourceMessageIds,['fixture-phone']);
   await p.reload();await ready(p);await flush(p);
   assert.deepEqual(await archives(p),[entry]);assert.ok((await receipts(p)).every(x=>!x.hasText));
   return {archived:1,uncertain:0,automaticRetries:0};
  },{sources:true});
  await run('different roles and days have independent receipts',async({p})=>{
   await wait(async()=>(await receipts(p)).filter(x=>x.state==='archived').length===4,'all four archives');
   const all=await receipts(p),world=await read(p);
   assert.equal(new Set(all.map(row=>JSON.stringify(row.key))).size,4);
   assert.ok(all.every(row=>row.key[0]===world.diaryWorldId));
   assert.deepEqual(world.roles.map(r=>r.diaries.length),[2,2]);
   return {archived:4,uncertain:0,automaticRetries:0};
  },{roles:2,days:2,count:4});
  await run('manual unattempted backfill is available without a fee warning',async({p,day})=>{
   await enterDiary(p);await retry(p,day);
   await wait(async()=>JSON.stringify(await states(p))==='["archived"]','manual archive');
   assert.equal((await archives(p)).length,1);
   return {archived:1,uncertain:0,automaticRetries:0};
  },{manual:true});
  await run('existing edited archive remains readable and unchanged',async({p,day})=>{
   const [prior]=await archives(p);
   await enterDiary(p);await p.getByText('已有编辑归档',{exact:true}).waitFor();
   await p.reload();await ready(p);await flush(p);
   assert.deepEqual(await archives(p),[prior]);assert.equal(prior.dateKey,day);assert.deepEqual(await states(p),[]);
   return {archived:1,uncertain:0,automaticRetries:0};
  },{existing:true,count:0});
  for(const fault of ['idb','claim','no-locks'])await run('storage '+fault+' failure halts dispatch',async({p})=>{
   await flush(p);
   assert.equal((await archives(p)).length,0);
   return {archived:0,uncertain:0,automaticRetries:0};
  },{fault,days:2,count:0});
  await run('archive failure holds the returned result and stops the remaining backfill',async({p,ctx,posts,day})=>{
   await wait(async()=>JSON.stringify(await states(p))==='["ready"]','result retained before main write');
   await flush(p);assert.equal(posts.length,1);assert.equal((await archives(p)).length,0);
   await p.reload();await ready(p);await flush(p);assert.equal(posts.length,1);
   await p.evaluate(()=>window.fixtureFailWrites=false);
   await enterDiary(p);
   await retry(p,shiftDateKey(day,-6));
   await wait(async()=>JSON.stringify(await states(p))==='["archived"]','ready result saved after the fault is removed');
   assert.equal(posts.length,1,'recover action never sends another POST');
   assert.equal((await archives(p)).length,1);assert.ok((await receipts(p)).every(row=>!row.hasText));
   return {archived:1,readyBeforeRecovery:1,uncertain:0,automaticRetries:0,recoveredWithoutPost:1};
  },{fault:'archive',days:7});
  const full=Array.from({length:120},(_,i)=>`第${i+1}行合成私人正文。`).join('\n');
  await run('complete receipt survives unavailable source check, refresh, copy and save',async({p,posts,unblock,day})=>{
   await wait(()=>posts.length===1,'sent request before source check');
   await p.evaluate(()=>sessionStorage.setItem('fixture-diary-source-unavailable','1'));
   unblock();
   await wait(async()=>JSON.stringify(await states(p))==='["ready"]','body committed before failed source check');
   await p.reload();await ready(p);await enterDiary(p);
   await p.locator('[data-action=viewdiaryresult][data-date="'+day+'"]').click();
   const dialog=p.getByRole('dialog',{name:'日记正文已生成，尚未归档'}),field=dialog.getByRole('textbox');
   assert.equal(await field.inputValue(),full);
   assert.match(await dialog.locator('p').textContent(),/暂时无法复核/);
   assert.equal(await field.evaluate(el=>el.scrollHeight>el.clientHeight),true);
   await dialog.getByRole('button',{name:'全选',exact:true}).click();
   assert.deepEqual(await field.evaluate(el=>[el.selectionStart,el.selectionEnd]),[0,full.length]);
   await p.evaluate(()=>{
    Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{window.fixtureCopied=value;}},configurable:true});
   });
   await dialog.getByRole('button',{name:'复制全文'}).click();
   assert.equal(await p.evaluate(()=>window.fixtureCopied),full);
   assert.equal((await archives(p)).length,0);
   await p.evaluate(()=>sessionStorage.removeItem('fixture-diary-source-unavailable'));
   await dialog.getByRole('button',{name:'保存已有结果'}).click();
   await wait(async()=>JSON.stringify(await states(p))==='["archived"]','verified result saved locally');
   assert.equal((await archives(p))[0].text,full);
   assert.equal(posts.length,1);
   return {archived:1,copiedCharacters:full.length,recoveryPosts:0};
  },{hold:true,sources:true,text:full});
  await run('receipt write refusal leaves an honest copyable result in the current page',async({p,posts,day})=>{
   await enterDiary(p);
   await retry(p,day);
   const dialog=p.getByRole('dialog',{name:'日记正文已生成，尚未归档'});
   assert.equal(await dialog.getByRole('textbox').inputValue(),'合成的私人记录。');
   assert.match(await dialog.locator('p').textContent(),/刷新后可能无法恢复/);
   assert.equal(await dialog.getByRole('button',{name:'保存已有结果'}).count(),0);
   assert.deepEqual(await states(p),['sent']);
   assert.equal((await archives(p)).length,0);
   assert.equal(posts.length,1);
   return {archived:0,copiedAvailable:1,recoveryPosts:0};
  },{manual:true,fault:'result'});
  await run('receipt refusal after switching role still allows copying in the owner view',async({p,posts,unblock,day})=>{
   await wait(()=>posts.length===1,'original role dispatched');
   await p.locator('[data-action=enter][data-id=fixture-role-1]').click();
   unblock();
   await wait(async()=>(await read(p)).roles[0].diaryTasks[0].status==='uncertain','body receipt write refused');
   await p.getByRole('button',{name:'切换角色'}).click();
   await enterDiary(p);
   await retry(p,day);
   const dialog=p.getByRole('dialog',{name:'日记正文已生成，尚未归档'});
   assert.equal(await dialog.getByRole('textbox').inputValue(),'合成的私人记录。');
   assert.match(await dialog.locator('p').textContent(),/刷新后可能无法恢复/);
   assert.equal(posts.length,1);
   return {archived:0,recoveryPosts:0};
  },{hold:true,fault:'result',roles:2,onlyFirst:true});
  await run('cut optional suffix preserves the complete diary even with autonomous life disabled',async({p,posts})=>{
   await wait(async()=>JSON.stringify(await states(p))==='["archived"]','complete diary with cut optional suffix');
   assert.equal((await archives(p))[0].text,'合成的私人记录。');
   assert.equal(posts.length,1);
   return {archived:1,automaticRetries:0};
  },{finish:'length',text:'合成的私人记录。\n<elsewhere_private_state>{"requestId":'});
  await run('legacy ready receipt with its exact original snapshot can be saved without new POST',async({p,posts,day})=>{
   const world=await read(p),r=world.roles[0],attempt='synthetic-legacy-attempt';
   world.diaryWorldId=crypto.randomUUID();
   r.diaryTasks[0].requestAttempt=attempt;r.diaryTasks[0].status='ready';
   const {facts,personal}=buildCharacterDiaryPrompt(r,world.user,day,'',Infinity,world.worldTimeZone,true);
   const snapshot=JSON.stringify([world.user,facts,roleMemoryText(r,facts.endMs,'',{since:facts.startMs,includePrivate:false})]);
   const sourceHash=await diarySourceHash(JSON.stringify([snapshot,{...personal,id:''}]));
   const receiptKey=diaryRequestKey(world.diaryWorldId,r.id,day),bundle=(await require('esbuild').build({
    entryPoints:[join(__dirname,'../src/core/diaryRequests.ts')],bundle:true,write:false,format:'iife',globalName:'fixtureDiary'
   })).outputFiles[0].text;
   await p.addScriptTag({content:bundle});
   await p.evaluate(async({key,world,receiptKey,attempt,sourceHash,requestId})=>{
    localStorage.setItem(key,JSON.stringify(world));
    await window.fixtureDiary.replaceDiaryReceipt(receiptKey,undefined,{attempt,state:'ready',result:{sourceHash,requestId,text:'合成旧收据正文。'}});
   },{key,world,receiptKey,attempt,sourceHash,requestId:personal.id});
   await p.reload();await ready(p);
   await enterDiary(p);await retry(p,day);
   await wait(async()=>JSON.stringify(await states(p))==='["archived"]','legacy with matching inputs');
   assert.equal((await archives(p))[0].text,'合成旧收据正文。');
   assert.equal(posts.length,0);
   return {archived:1,recoveryPosts:0};
  },{manual:true,sources:true,count:0});
  await run('truncated output is distinguished from a complete unarchived body',async({p,posts,day})=>{
   await wait(async()=>JSON.stringify(await states(p))==='["failed"]','truncated result');
   await enterDiary(p);
   await p.locator('[data-diary-task-date="'+day+'"]').getByText(/输出已截断/).waitFor();
   assert.equal((await archives(p)).length,0);
   assert.ok((await receipts(p)).every(x=>!x.hasText));
   assert.equal(posts.length,1);
   return {archived:0,truncated:1,automaticRetries:0};
  },{finish:'length'});
  await run('uncertain network outcome stays blocked until an explicit fee confirmation',async({p,posts,day})=>{
   await wait(async()=>JSON.stringify(await states(p))==='["failed"]','durable ambiguous result');
   await p.reload();await ready(p);await flush(p);assert.equal(posts.length,1);
   await enterDiary(p);
   p.once('dialog',dialog=>{assert.match(dialog.message(),/第二次费用/);void dialog.dismiss();});
   await retry(p,day);await flush(p);assert.equal(posts.length,1);
   p.once('dialog',dialog=>{assert.match(dialog.message(),/第二次费用/);void dialog.accept();});
   await retry(p,day);
   await wait(async()=>JSON.stringify(await states(p))==='["archived"]','confirmed retry archived');
   assert.equal((await archives(p)).length,1);
   return {archived:1,uncertainBeforeConfirmation:1,automaticRetries:0,manualRetries:1};
  },{network:'http',count:2});
  await run('timeout leaves a potentially billed task without retry',async({p,posts})=>{
   await wait(async()=>JSON.stringify(await states(p))==='["failed"]','failed receipt');
   await p.reload();await ready(p);await flush(p);assert.equal(posts.length,1);
   assert.equal((await archives(p)).length,0);
   return {archived:0,uncertain:1,automaticRetries:0};
  },{network:'abort'});
  await run('atomic receipt store accepts one of three contenders',async({p,ctx})=>{
   const bundle=(await require('esbuild').build({entryPoints:[join(__dirname,'../src/core/diaryRequests.ts')],bundle:true,write:false,format:'iife',globalName:'fixtureDiary'})).outputFiles[0].text;
   const b=await open(ctx),c=await open(ctx);
   const pages=[p,b,c];await Promise.all(pages.map(page=>page.addScriptTag({content:bundle})));
   const won=await Promise.all(pages.map((page,i)=>page.evaluate(async({i,day})=>{
    const task=window.fixtureDiary.diaryRequestKey('synthetic-race-world','same-role',day);
    try{await window.fixtureDiary.replaceDiaryReceipt(task,undefined,{attempt:'contender-'+i,state:'claimed'});return true;}catch{return false;}
   },{i,day})));
   assert.equal(won.filter(Boolean).length,1);assert.deepEqual(await states(p),['claimed']);
   return {archived:0,uncertain:0,automaticRetries:0};
  },{days:0,count:0,claims:1});
  await run('switching the viewed role leaves the original result with its owner',async({p,posts,unblock})=>{
   await wait(()=>posts.length===1,'dispatched original role');
   await p.locator('[data-action=enter][data-id=fixture-role-1]').click();
   unblock();
   await wait(async()=>JSON.stringify(await states(p))==='["archived"]','archive after role switch');
   const world=await read(p);
   assert.equal(world.selected,'fixture-role-1');assert.deepEqual(world.roles.map(r=>r.diaries.length),[1,0]);
   return {archived:1,uncertain:0,automaticRetries:0};
  },{hold:true,roles:2,onlyFirst:true,sources:true});
  if(app.protocol!=='file:')await run('BFCache resumes one dispatched diary without reissuing',async({p,posts,unblock})=>{
   await wait(()=>posts.length===1,'dispatched diary');
   const doc=await p.evaluate(()=>window.fixtureDoc);
   await p.goto(away);await p.goBack({waitUntil:'commit'});await ready(p);
   await p.locator('#app[data-write-access=writer]').waitFor();
   assert.equal(await p.evaluate(()=>window.fixtureDoc),doc);
   assert.equal(await p.evaluate(()=>window.fixtureRestored),true);
   assert.deepEqual(await states(p),['sent']);unblock();
   await wait(async()=>JSON.stringify(await states(p))==='["archived"]','original response archived');
   return {archived:(await archives(p)).length,uncertain:0,automaticRetries:0};
  },{hold:true});
  if(app.protocol!=='file:')await run('main conflict retains a response and accepts unrelated same-day life, chat and private ledger changes',async({p,ctx,posts,unblock,day})=>{
   await wait(()=>posts.length===1,'dispatched diary');
   const doc=await p.evaluate(()=>window.fixtureDoc);
   await p.goto(away);
   const b=await open(ctx);
   await b.locator('[data-action=editrole][data-id=fixture-role-1]').click();
   await b.locator('#role-form [name=name]').fill('另一角色已修改');
   await b.getByTestId('save-role-form-btn').click();
   await b.locator('.toast').filter({hasText:'角色资料与头像框修改已保存'}).waitFor();
   await b.evaluate(key=>{
    const data=JSON.parse(localStorage.getItem(key)),r=data.roles[0],original=r.chats[0];
    r.chats.push({id:'late-unrelated-chat',speaker:'char',text:'合成无关新消息。',at:original.at+100});
    r.events.push({id:'late-unrelated-life',kind:'life',title:'合成生活补录',detail:'整理器材。',at:original.at+200,knownBy:[r.id],lifeEvidence:'confirmed',source:'fixture'});
    r.personalThreads=[{id:'late-unrelated-thread',key:'late-unrelated-thread',roleId:r.id,kind:'opinion',text:'合成无关关注。',at:original.at+300,status:'open',shareable:false,
     sources:[{kind:'message',id:original.id,at:original.at,version:JSON.stringify([original.speaker,original.text,original.at,0,null])}],origin:'model-private',requestId:'other-request'}];
    localStorage.setItem(key,JSON.stringify(data));
   },key);
   await b.reload();await ready(b);

   await p.goBack({waitUntil:'commit'});await ready(p);
   assert.equal(await p.evaluate(()=>window.fixtureDoc),doc);
   await p.locator('#app[data-write-access=read-only]').waitFor();
   unblock();
   await wait(async()=>JSON.stringify(await states(b))==='["ready"]','late response persisted without saving stale world');
   assert.equal((await archives(b)).length,0);assert.equal(posts.length,1);
   await enterDiary(b);await retry(b,day);
   await wait(async()=>JSON.stringify(await states(b))==='["archived"]','explicit ready result recovery');
   const world=await read(b);
   assert.equal(world.roles[0].diaries.length,1);assert.equal(world.roles[1].diaries.length,0);
   assert.equal(world.roles[1].name,'另一角色已修改');
   assert.deepEqual(world.roles[0].diaries[0].sourceMessageIds,['fixture-phone']);
   assert.deepEqual(world.roles[0].diaries[0].sourceEventIds,['fixture-life']);
   return {archived:1,uncertain:0,automaticRetries:0,recoveredWithoutPost:1};
  },{hold:true,roles:2,onlyFirst:true,sources:true});
  if(app.protocol!=='file:')await run('late result cannot replace an edited archive restored by the winning page',async({p,ctx,posts,unblock,day})=>{
   await wait(()=>posts.length===1,'dispatched diary');
   const doc=await p.evaluate(()=>window.fixtureDoc);
   await p.goto(away);
   const b=await open(ctx),world=await read(b);
   world.roles[0].diaries.push({id:'edited-before-response',speaker:'char',dateKey:day,at:Date.now()-86400000,source:'ai',text:'另一页已保存编辑稿'});
   await b.locator('#landing-backup-file').setInputFiles({name:'synthetic-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(world))});
   await b.locator('.toast').filter({hasText:'已导入备份'}).waitFor();
   await p.goBack({waitUntil:'commit'});await ready(p);assert.equal(await p.evaluate(()=>window.fixtureDoc),doc);
   unblock();
   await wait(async()=>JSON.stringify(await states(b))==='["ready"]','late draft retained separately');
   await enterDiary(b);await b.getByText('另一页已保存编辑稿',{exact:true}).waitFor();
   assert.deepEqual((await archives(b)).map(d=>d.text),['另一页已保存编辑稿']);
   return {archived:1,ready:1,uncertain:0,automaticRetries:0};
  },{hold:true});
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
