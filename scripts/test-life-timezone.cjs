const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const url=process.env.TEST_URL||pathToFileURL(process.cwd()+'/dist/Elsewhere_Phase1_Standalone.html').href;
const endpoint='https://life-timezone-fixture.invalid/v1',key='elsewhere-v01',dbName='elsewhere-life-budget-v1',hour=3600000;
const base=Date.parse('2026-11-07T07:00:00Z');
async function wait(read,phase){
 const end=Date.now()+8000;
 while(Date.now()<end){if(await read())return;await new Promise(r=>setTimeout(r,20));}
 throw Error('Timeout: '+phase);
}
async function main(){
 const {defaults,createRole}=await import('../src/core/defaults.ts');
 const browser=await chromium.launch({executablePath:chromium.executablePath()});
 const deadline=setTimeout(()=>{console.error('Timezone suite deadline');process.exitCode=1;void browser.close();},180000);
 const results=[];
 async function run(label,options,check){
  if(process.env.TEST_CASE&&!label.includes(process.env.TEST_CASE))return;
  const at=options.at||base,zone=options.zone||'America/Los_Angeles';
  const ctx=await browser.newContext({viewport:{width:390,height:844},ignoreHTTPSErrors:true,serviceWorkers:'block'});
  const posts=[],errors=[];let boot=true,release;const gate=new Promise(r=>release=r);
  const world=defaults(),actor=createRole('合成时区记录者','','守档者','谨慎','合成海港');
  Object.assign(actor,{id:'timezone-actor',chats:[],events:[],diaryTasks:[],lifeAt:at,firstMessageState:{status:'ready',updatedAt:at-8*hour}});
  // Cover the entire existing seven-day diary backfill range in every tested timezone.
  actor.diaries=Array.from({length:21},(_,i)=>({id:'synthetic-diary-'+i,speaker:'char',source:'manual',dateKey:new Date(at+(i-10)*24*hour).toISOString().slice(0,10),at:at+(i-10)*24*hour,text:'合成已保存日记'}));
  world.roles=[actor];world.selected=null;world.settings={...world.settings,mode:'api',endpoint,model:'synthetic-timezone',autonomousLife:true};
  if(options.multiple)world.roles.push(...[2,3].map(i=>({...structuredClone(actor),id:'timezone-actor-'+i,name:'合成记录者'+i})));
  try{
   ctx.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
   await ctx.addInitScript(dbName=>{
    const get=IDBObjectStore.prototype.get,put=IDBObjectStore.prototype.put,transaction=IDBDatabase.prototype.transaction;
    IDBObjectStore.prototype.get=function(...args){if(this.transaction.db.name===dbName&&window.name==='idb-read')throw Error('synthetic receipt read failure');return get.apply(this,args);};
    IDBObjectStore.prototype.put=function(...args){if(this.transaction.db.name===dbName&&window.name==='idb-write')throw Error('synthetic receipt write failure');return put.apply(this,args);};
    IDBDatabase.prototype.transaction=function(...args){const tx=transaction.apply(this,args);if(this.name===dbName&&args[1]==='readwrite'&&window.name==='idb-uncertain')Object.defineProperty(tx,'oncomplete',{set(){}});return tx;};
   },dbName);
   await ctx.route('**/*',async route=>{
    const request=route.request(),dest=request.url();
    if(boot&&request.isNavigationRequest()){boot=false;return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Synthetic timezone seed</title>'});}
    if(dest===endpoint+'/chat/completions'){
     const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST','access-control-allow-headers':'*'};
     if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
     const wire=request.postDataJSON();assert.equal(request.method(),'POST');assert.ok(wire.messages[0].content.includes('[Elsewhere Autonomous Life v1]'),'Unexpected non-life POST');
     const input=JSON.parse(wire.messages.at(-1).content);posts.push({id:input.requestId,roleId:input.roleId,at:input.window.to});
     if(options.hold)await gate;
     return route.fulfill({status:options.networkFailure?503:200,headers,json:options.networkFailure?{error:'synthetic'}:{choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify({requestId:input.requestId,roleId:input.roleId,events:[{at:input.window.to-20*60000,action:'rest',durationMinutes:5}]})}}]}}).catch(()=>{});
    }
    if(request.method()==='POST')throw Error('Unexpected non-life POST');
    if(request.method()==='GET'&&(new URL(dest).protocol==='file:'||new URL(dest).origin===new URL(url).origin))return route.continue();
    return route.abort();
   });
   const p=await ctx.newPage();p.setDefaultTimeout(8000);p.setDefaultNavigationTimeout(8000);
   const cdp=await ctx.newCDPSession(p);
   const changeZone=async zone=>{await cdp.send('Emulation.setTimezoneOverride',{timezoneId:zone});assert.equal(await p.evaluate(()=>Intl.DateTimeFormat().resolvedOptions().timeZone),zone);};
   await changeZone(zone);
   await p.clock.install({time:at-60000});await p.clock.pauseAt(at);await p.goto(url);
   await p.evaluate(({world,key,endpoint})=>{localStorage.setItem(key,JSON.stringify(world));localStorage.setItem('elsewhere-device-api-key-v1',JSON.stringify({endpoint,key:'SYNTHETIC_MOCK_ONLY'}));},{world,key,endpoint});
   const ready=page=>page.locator('#app[data-storage-state=ready]').waitFor();
   const raw=()=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
   const receipts=()=>p.evaluate(dbName=>new Promise((ok,bad)=>{const q=indexedDB.open(dbName);q.onerror=()=>bad(Error('receipt open'));q.onsuccess=()=>{const db=q.result,tx=db.transaction('journal','readonly'),r=tx.objectStore('journal').get('current');tx.oncomplete=()=>{db.close();ok(r.result?.tasks||[]);};tx.onabort=()=>bad(Error('receipt read'));};}),dbName);
   const settled=()=>p.evaluate(()=>navigator.locks.request('elsewhere-life-budget-v1',()=>true));
   const reload=async()=>{await p.reload();await ready(p);await p.clock.runFor(1800);await settled();};
   const monitor=async()=>{await p.locator('[data-action=enter]').filter({hasText:'合成时区记录者'}).click();await p.locator('[data-home-page="1"]').click();await p.getByRole('button',{name:'打开监控',exact:true}).click();};
   await p.reload();await ready(p);await p.clock.runFor(1800);
   await wait(()=>posts.length===1,'initial life POST');
   if(!options.hold)await wait(async()=>['completed','failed'].includes((await raw()).roles[0].lifeTasks?.[0]?.status),'initial durable result');
   const before=await raw(),ledger=await receipts();
   assert.equal(ledger.length,1);assert.equal(before.roles[0].lifeTasks[0].id,posts[0].id);
   await check({p,ctx,raw,receipts,settled,reload,changeZone,monitor,posts,before,ledger,at,ready,release});
   assert.deepEqual(errors,[]);results.push({label,posts:posts.length,receipts:(await receipts()).length,archives:(await raw()).roles.reduce((n,r)=>n+r.events.filter(e=>e.lifeRecord).length,0)});
   console.log('PASS '+label+' | POST='+posts.length);
  }finally{release();await ctx.close();}
 }
 try{
  for(const [from,to,at]of [
   ['America/Los_Angeles','Asia/Tokyo',base],['Asia/Tokyo','America/Los_Angeles',base],
   ['Pacific/Kiritimati','Etc/GMT+12',Date.parse('2026-11-06T15:00:00Z')],['Etc/GMT+12','Pacific/Kiritimati',Date.parse('2026-11-06T15:00:00Z')],
  ])await run(from+' to '+to+' retains legacy receipts and confirmed history',{zone:from,at},async t=>{
   await t.changeZone(to);await t.reload();await t.reload();await t.monitor();
   assert.equal(await t.p.evaluate(()=>Intl.DateTimeFormat().resolvedOptions().timeZone),to);
   assert.equal(await t.p.locator('[data-fp-category=life]').count(),1);
   assert.doesNotMatch(await t.p.getByTestId('life-state').textContent(),/无法核验|不可验证/);
   const after=await t.raw();assert.deepEqual(after.roles[0].lifeTasks,t.before.roles[0].lifeTasks);assert.deepEqual(after.roles[0].events,t.before.roles[0].events);
   assert.deepEqual(await t.receipts(),t.ledger);assert.equal(t.posts.length,1);
  });
  for(const [label,at,elapsed]of [['spring DST',Date.parse('2026-03-08T07:30:00Z'),4],['fall DST',Date.parse('2026-11-01T06:30:00Z'),4],['midnight',base,2]])await run(label+' keeps elapsed quota',{at},async t=>{
   await t.p.clock.setSystemTime(t.at+elapsed*hour);await t.reload();assert.equal(t.posts.length,1);assert.deepEqual(await t.receipts(),t.ledger);
  });
  await run('system time rollback keeps consumed receipt and never replays',{},async t=>{
   await t.changeZone('Asia/Tokyo');await t.p.clock.setSystemTime(t.at-2*hour);await t.reload();assert.equal(t.posts.length,1);assert.deepEqual(await t.receipts(),t.ledger);
  });
  await run('failed request still consumes quota after travel',{networkFailure:true},async t=>{
   await t.changeZone('Asia/Tokyo');await t.reload();assert.equal((await t.raw()).roles[0].lifeTasks[0].status,'failed');assert.equal(t.posts.length,1);assert.deepEqual(await t.receipts(),t.ledger);
  });
  await run('two timezone pages cannot replay an already dispatched task',{hold:true},async t=>{
   await t.changeZone('Asia/Tokyo');
   const p2=await t.ctx.newPage();await p2.clock.install({time:t.at-60000});await p2.clock.pauseAt(t.at);
   await p2.goto(url);await t.ready(p2);await p2.clock.runFor(1800);assert.equal(t.posts.length,1);
   await p2.close();await t.changeZone('Asia/Tokyo');await t.reload();t.release();assert.equal(t.posts.length,1);assert.equal((await t.raw()).roles[0].events.length,0);assert.deepEqual(await t.receipts(),t.ledger);
  });
  for(const mode of ['idb-read','idb-write','idb-uncertain'])await run(mode+' blocks new consumption after travel',{},async t=>{
   await t.changeZone('Asia/Tokyo');await t.p.evaluate(mode=>window.name=mode,mode);
   await t.p.reload();await t.ready(t.p);await t.p.clock.runFor(6500);await t.settled();assert.equal(t.posts.length,1);
   await t.p.evaluate(()=>window.name='');assert.deepEqual(await t.receipts(),t.ledger);
  });
  await run('invalid legacy calendar evidence pauses without deleting history',{},async t=>{
   await t.p.evaluate(key=>{const journal=JSON.parse(localStorage.getItem(key));journal.tasks[0].dateKey='2026-02-30';journal.tasks[0].id='life:timezone-actor:2026-02-30';localStorage.setItem(key,JSON.stringify(journal));},dbName);
   await t.reload();await t.monitor();assert.match(await t.p.getByTestId('life-state').textContent(),/无法核验/);assert.equal(t.posts.length,1);assert.deepEqual((await t.raw()).roles[0].events,t.before.roles[0].events);
  });
  await run('a new eligible rolling day still generates once after travel',{},async t=>{
   await t.changeZone('Asia/Tokyo');await t.p.clock.setSystemTime(t.at+25*hour);await t.reload();
   await wait(async()=>(await t.raw()).roles[0].lifeTasks.filter(x=>x.status==='completed').length===2,'next legitimate archive');
   assert.equal(t.posts.length,2);assert.notEqual(t.posts[1].id,t.posts[0].id);assert.equal((await t.receipts()).length,2);
   await t.reload();assert.equal(t.posts.length,2);
  });
  await run('travel does not refund the global two-attempt budget',{multiple:true},async t=>{
   await t.changeZone('Asia/Tokyo');await t.reload();await wait(()=>t.posts.length===2,'second independent role');
   await wait(async()=>(await t.raw()).roles[1].lifeTasks?.[0]?.status==='completed','second role archive');
   await t.p.clock.fastForward(61000);await t.p.clock.runFor(1800);await t.settled();
   assert.equal(t.posts.length,2);assert.equal(new Set(t.posts.map(x=>x.roleId)).size,2);assert.equal((await t.receipts()).length,2);
  });
 }finally{clearTimeout(deadline);await browser.close();}
 console.log(JSON.stringify({passed:results.length,posts:results.reduce((n,r)=>n+r.posts,0),results}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
