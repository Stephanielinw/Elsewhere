const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const url=process.env.TEST_URL||pathToFileURL(process.cwd()+'/dist/Elsewhere_Phase1_Standalone.html').href;
const key='elsewhere-v01',at=Date.parse('2026-11-06T22:00:00Z'),away=new URL('home-focus-away',url).href;
async function main(){
 const {defaults,createRole}=await import('../src/core/defaults.ts');
 const browser=await chromium.launch({executablePath:chromium.executablePath(),ignoreDefaultArgs:['--disable-back-forward-cache']});
 const watchdog=setTimeout(()=>{console.error('Home focus suite deadline');process.exitCode=1;void browser.close();},180000);
 let passed=0;
 async function run(label,test,{stamp=at,expiring=false,many=false}={}){
  if(process.env.TEST_CASE&&!label.includes(process.env.TEST_CASE))return;
  const ctx=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Los_Angeles',ignoreHTTPSErrors:true,serviceWorkers:'block'});
  const posts=[],errors=[];let boot=true;
  try{
   await ctx.route('**/*',route=>{
    const req=route.request(),dest=req.url();
    if(req.method()==='POST'){posts.push(dest);return route.abort();}
    if(boot&&req.isNavigationRequest()){boot=false;return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Synthetic home seed</title>'});}
    if(dest===away)return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Away</title>'});
    if(req.method()==='GET'&&(new URL(dest).protocol==='file:'||new URL(dest).origin===new URL(url).origin))return route.continue();
    return route.abort();
   });
   await ctx.addInitScript(()=>{
    const set=Storage.prototype.setItem;
    window.homeFocusProbe={reject:false,document:Math.random(),shows:[]};
    addEventListener('pageshow',e=>window.homeFocusProbe.shows.push(e.persisted));
    Storage.prototype.setItem=function(k,v){if(k==='elsewhere-v01'&&window.homeFocusProbe.reject)throw Error('synthetic task write refusal');return set.call(this,k,v);};
   });
   const world=defaults(),r=createRole('合成首页角色','','守档者','谨慎','合成港口');r.id='home-focus-role';r.chats=[];r.firstMessageState={status:'ready',updatedAt:stamp};
   world.roles=[r];world.selected=null;world.settings={...world.settings,mode:'api',endpoint:'',model:'',autonomousLife:false};
   world.sharedTasks={ddl:[{id:'deadline',text:'合成截止任务',due:'2026-11-07',done:false,at:stamp}],todo:[{id:'todo',text:'合成待办',done:false,at:stamp}]};
   if(expiring)world.sharedTasks.todo.push({id:'expiring',text:'即将归档',done:true,at:stamp-86400000,completedAt:stamp-86400000+1500});
   if(many)world.sharedTasks.todo.push(...Array.from({length:18},(_,i)=>({id:'scroll-'+i,text:'合成列表项目'+i,done:false,at:stamp+i})));
   const p=await ctx.newPage();p.setDefaultTimeout(8000);p.setDefaultNavigationTimeout(8000);p.on('pageerror',e=>errors.push(e.message));
   await p.clock.install({time:stamp-60000});await p.clock.pauseAt(stamp);await p.goto(url);
   await p.evaluate(({key,world})=>localStorage.setItem(key,JSON.stringify(world)),{key,world});await p.reload();
   const ready=()=>p.locator('#app[data-storage-state=ready][data-write-access=writer]').waitFor();await ready();
   const enter=async()=>{await p.locator('[data-action=enter]').filter({hasText:'合成首页角色'}).click();await p.locator('#home-task-cards').waitFor();};await enter();
   const raw=()=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
   const focused=locator=>locator.evaluate(el=>document.activeElement===el);
   const tick=()=>p.clock.runFor(3500);
   const outside=async()=>{await p.evaluate(()=>{const input=document.createElement('input');input.id='synthetic-external-input';document.body.append(input);input.focus();});return p.locator('#synthetic-external-input');};
   const add=kind=>p.locator('[data-action=hometaskadd][data-kind='+kind+']');
   await test({p,ctx,raw,focused,tick,outside,add,enter,ready,stamp});
   assert.deepEqual(posts,[]);assert.deepEqual(errors,[]);passed++;console.log('PASS '+label+' | POST=0');
  }finally{await ctx.close();}
 }
 try{
  for(const [name,selector]of [
   ['DDL Add','[data-action=hometaskadd][data-kind=ddl]'],['To-do Add','[data-action=hometaskadd][data-kind=todo]'],
   ['DDL archive','[data-action=hometaskarchive][data-kind=ddl]'],['To-do archive','[data-action=hometaskarchive][data-kind=todo]'],
   ['task title','.home-task-name[data-kind=ddl]'],['DDL countdown','.home-task-due'],['completion','.home-task-check'],
  ])await run(name+' keeps its exact node and keyboard focus through idle ticks',async t=>{
   const control=t.p.locator(selector);await control.focus();const node=await control.elementHandle();await t.tick();
   assert.equal(await node.evaluate(el=>el.isConnected),true);assert.equal(await t.focused(control),true);
   await control.press('Enter');
   if(name==='completion')assert.equal((await t.raw()).sharedTasks.todo[0].done,true);
   else await t.p.locator('dialog[open]').waitFor();
  });
  await run('midnight really updates DDL and preserves the correct focused control',async t=>{
   const due=t.p.locator('.home-task-due');assert.match(await due.innerText(),/还剩 1 天/);await due.focus();await t.tick();
   assert.equal(await due.innerText(),'今天截止');assert.equal(await t.focused(due),true);
  },{stamp:Date.parse('2026-11-07T07:59:58Z')});
  await run('real task changes retain completion focus and can undo completion',async t=>{
   const check=t.p.locator('.home-task-check');await check.focus();await check.press('Enter');assert.equal(await t.focused(check),true);assert.equal((await t.raw()).sharedTasks.todo[0].done,true);
   await check.press('Enter');assert.equal((await t.raw()).sharedTasks.todo[0].done,false);assert.equal(await t.focused(check),true);
  });
  await run('archiving the focused row falls back to its own Add',async t=>{
   const row=t.p.locator('[data-task-id=expiring] .home-task-name');await row.focus();await t.tick();
   assert.equal(await row.count(),0);assert.equal(await t.focused(t.add('todo')),true);assert.equal((await t.raw()).sharedTasks.todo.length,2);
   const archive=t.p.locator('[data-action=hometaskarchive][data-kind=todo]');await archive.press('Enter');assert.match(await t.p.locator('dialog[open]').innerText(),/即将归档/);
  },{expiring:true});
  await run('external input keeps focus while a task row expires',async t=>{
   const input=await t.outside();await input.fill('任务区外尚未提交');await t.tick();assert.equal(await t.focused(input),true);assert.equal(await input.inputValue(),'任务区外尚未提交');
   assert.equal(await t.p.locator('[data-task-id=expiring]').count(),0);
  },{expiring:true});
  await run('modal input survives a real background update without losing text',async t=>{
   await t.add('todo').click();const input=t.p.locator('#home-task-form [name=text]');await input.fill('弹窗尚未保存');await t.tick();
   assert.equal(await t.focused(input),true);assert.equal(await input.inputValue(),'弹窗尚未保存');assert.equal(await t.p.locator('[data-task-id=expiring]').count(),0);
  },{expiring:true});
  await run('late close cannot steal focus from another input',async t=>{
   await t.add('todo').click();await t.p.evaluate(()=>{document.querySelector('dialog').close();const input=document.createElement('input');input.id='new-focus-owner';document.body.append(input);input.focus();});
   await t.tick();assert.equal(await t.focused(t.p.locator('#new-focus-owner')),true);
  });
  await run('navigation makes an old dialog focus callback invalid',async t=>{
   await t.add('todo').click();await t.p.evaluate(()=>{document.querySelector('dialog').close();document.querySelector('.dock [data-view=chat]').click();});
   const input=t.p.locator('#message-input');await input.fill('仍属于手机的未发草稿');await t.tick();assert.equal(await t.focused(input),true);assert.equal(await input.inputValue(),'仍属于手机的未发草稿');
  });
  await run('failed task save keeps input and retry persists exactly one record',async t=>{
   await t.add('todo').click();const input=t.p.locator('#home-task-form [name=text]');await input.fill('重试保留的合成待办');
   await t.p.evaluate(()=>window.homeFocusProbe.reject=true);await t.p.locator('#home-task-form [type=submit]').click();
   assert.match(await t.p.locator('[data-task-error]').innerText(),/保存失败/);await t.tick();assert.equal(await input.inputValue(),'重试保留的合成待办');assert.equal((await t.raw()).sharedTasks.todo.length,1);
   await t.p.evaluate(()=>window.homeFocusProbe.reject=false);await t.p.locator('#home-task-form [type=submit]').click();await t.p.locator('dialog').waitFor({state:'detached'});
   assert.equal((await t.raw()).sharedTasks.todo.filter(x=>x.text==='重试保留的合成待办').length,1);
  });
  await run('list scroll survives an actual completion repaint',async t=>{
   const list=t.p.locator('[data-home-task-card=todo] .home-task-list');await list.evaluate(el=>el.scrollTop=80);const top=await list.evaluate(el=>el.scrollTop);assert.ok(top>0);
   const check=t.p.locator('.home-task-check').first();await check.focus();const position=await list.evaluate(el=>el.scrollTop);await check.press('Enter');assert.equal(await list.evaluate(el=>el.scrollTop),position);
  },{many:true});
  await run('saved completion and task identity survive refresh',async t=>{
   await t.p.locator('.home-task-check').press('Enter');const before=(await t.raw()).sharedTasks;await t.p.reload();await t.ready();await t.enter();assert.deepEqual((await t.raw()).sharedTasks,before);assert.equal(await t.p.locator('.home-task-check').getAttribute('aria-checked'),'true');
  });
  await run('DDL completion returns to its own Add after its opener is removed',async t=>{
   await t.p.locator('.home-task-name[data-kind=ddl]').press('Enter');
   await t.p.locator('[data-task-complete]').click();await t.p.locator('dialog').waitFor({state:'detached'});
   assert.equal((await t.raw()).sharedTasks.ddl[0].done,true);assert.equal(await t.focused(t.add('ddl')),true);
   await t.p.locator('[data-action=hometaskarchive][data-kind=ddl]').press('Enter');assert.match(await t.p.locator('dialog[open]').innerText(),/合成截止任务/);
  });
  await run('an older close event cannot focus behind a newly opened dialog',async t=>{
   await t.add('todo').click();const state=await t.p.evaluate(()=>{
    const old=document.querySelector('dialog');old.close();document.querySelector('[data-action=hometaskadd][data-kind=ddl]').click();
    const current=document.querySelector('dialog[open]'),input=current.querySelector('[name=text]');input.value='新弹窗的独立输入';input.focus();
    return {oldClosed:!old.open,newTitle:current.querySelector('h2').textContent,focused:document.activeElement===input};
   });assert.deepEqual(state,{oldClosed:true,newTitle:'添加 DDL',focused:true});
   await t.tick();const input=t.p.locator('dialog[open] #home-task-form [name=text]');assert.equal(await t.p.locator('dialog').count(),1);
   assert.equal(await t.focused(input),true);assert.equal(await input.inputValue(),'新弹窗的独立输入');assert.match(await t.p.locator('dialog[open] h2').innerText(),/DDL/);
  });
  if(new URL(url).protocol==='https:')await run('real BFCache restores tasks and writing without an AI request',async t=>{
   await t.p.locator('.home-task-check').press('Enter');const before=(await t.raw()).sharedTasks,id=await t.p.evaluate(()=>window.homeFocusProbe.document);
   await t.p.goto(away);await t.p.goBack({waitUntil:'commit'});await t.ready();assert.equal(await t.p.evaluate(()=>window.homeFocusProbe.document),id);assert.equal(await t.p.evaluate(()=>window.homeFocusProbe.shows.at(-1)),true);assert.deepEqual((await t.raw()).sharedTasks,before);
  });
 }finally{clearTimeout(watchdog);await browser.close();}
 console.log(JSON.stringify({passed,posts:0}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
