const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {join}=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const app=new URL(process.env.TEST_URL||pathToFileURL(join(__dirname,'../public/Elsewhere_Phase1_Standalone.html')));
assert.ok(app.protocol==='file:'||(['http:','https:'].includes(app.protocol)&&['127.0.0.1','localhost','[::1]'].includes(app.hostname)));
const endpoint='https://message-provenance-fixture.invalid/v1',key='elsewhere-v01';
const away=app.protocol==='file:'?null:new URL('/provenance-navigation-fixture',app).href;
const old='原版合成发言-甲',middle='中间合成发言-乙',latest='最新合成发言-丙';
const diary='合成日记正文。',original='phone-origin',bridge='scene-bridge';
const ready=p=>p.locator('#app[data-storage-state=ready][data-write-access=writer]').waitFor();
const read=p=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
const archived=async p=>(await read(p)).roles[0].diaries.find(d=>d.text===diary);
async function recoveryRecord(p,day){
 const world=await read(p),r=world.roles.find(r=>r.id==='fixture-role');
 const task=r.diaryTasks.find(t=>t.dateKey===day&&t.roleId===r.id);
 const id=JSON.stringify([world.diaryWorldId,r.id,day]);
 const receipt=await p.evaluate(id=>new Promise((resolve,reject)=>{
  const open=indexedDB.open('elsewhere-diary-requests-v1',1);
  open.onerror=()=>reject(open.error);
  open.onsuccess=()=>{
   const db=open.result,tx=db.transaction('receipts'),request=tx.objectStore('receipts').get(id);
   tx.oncomplete=()=>{db.close();resolve(request.result);};
   tx.onabort=()=>{db.close();reject(tx.error);};
  };
 }),id);
 return {id,task,receipt};
}
async function wait(fn,label){
 const until=Date.now()+8000;
 do{if(await fn())return;await new Promise(r=>setTimeout(r,40));}while(Date.now()<until);
 throw Error('Timed out: '+label);
}

async function main(){
 const {defaults,createRole}=await import('../src/core/defaults.ts');
 const {editMessage,retractMessage}=await import('../src/core/revisions.ts');
 const browser=await chromium.launch({ignoreDefaultArgs:['--disable-back-forward-cache'],...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 async function fixture(options,check){
  const ctx=await browser.newContext({ignoreHTTPSErrors:true,serviceWorkers:'block',viewport:{width:390,height:844},timezoneId:options.tz||'America/Los_Angeles'});
  const posts=[],errors=[];
  let bootstrap=true,release;
  const hold=new Promise(resolve=>{release=resolve;});
  try{
   await ctx.addInitScript(key=>{
    window.provenanceDocument=Math.random();
    addEventListener('pageshow',event=>{window.provenanceRestored=event.persisted;});
    const set=Storage.prototype.setItem;
    Storage.prototype.setItem=function(k,v){
     if(k===key&&window.blockRecoveryStatus&&JSON.parse(v).roles.some(r=>r.diaryTasks.some(t=>t.id==='fixture-diary'&&['ready','stale'].includes(t.status)))){
      throw new DOMException('synthetic quota failure','QuotaExceededError');
     }
     return set.call(this,k,v);
    };
   },key);
   await ctx.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.href===away&&req.method()==='GET')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated navigation</title>'});
    if(bootstrap&&req.isNavigationRequest()&&url.href===app.href){
     bootstrap=false;return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated message fixture</title>'});
    }
    if(url.href===endpoint+'/chat/completions'){
     const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST','access-control-allow-headers':'*'};
     if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
     if(req.method()==='POST'){
      const wire=req.postDataJSON().messages.map(m=>m.content).join('\n');
      posts.push(wire);
      if(options.hold)await hold;
      const content=wire.includes('属于你自己的【私人日记】')?diary:'合成场景回复。';
      return route.fulfill({headers,json:{choices:[{finish_reason:'stop',message:{role:'assistant',content}}]}}).catch(()=>{});
     }
    }
    if(req.method()==='GET'&&(url.href===app.href||app.protocol!=='file:'&&url.origin===app.origin))return route.continue();
    return route.abort();
   });
   const p=await ctx.newPage();p.setDefaultTimeout(8000);
   p.on('pageerror',e=>errors.push(e.message));
   await p.goto(app.href);
   const now=Date.now();
   const day=await p.evaluate(at=>{const d=new Date(at);d.setDate(d.getDate()-1);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');},now);
   const bounds=await p.evaluate(day=>{const [y,m,d]=day.split('-').map(Number);return {startMs:new Date(y,m-1,d).getTime(),endMs:new Date(y,m-1,d+1).getTime()-1};},day);
   const at=bounds.endMs-3600000;
   const world=defaults(),r=createRole('合成档案员','','馆员','沉静','合成海岸');
   r.id='fixture-role';r.chats=[{id:original,speaker:'me',text:old,at,kind:'chat',status:'active'}];
   const sc={id:'fixture-scene',where:'合成见面地',startedAt:at,messages:[
    {...r.chats[0],id:bridge,sourceMessageId:original,kind:'scene'},
    {id:'own-scene',speaker:'char',text:'独立现场对白标记',at:at+2000,kind:'scene',quote:{id:original,speaker:'me',text:old,at}},
   ]};
   if(options.archived)r.meetings=[{...sc,endedAt:at+4000}];else if(!options.phoneOnly)r.scene=sc;
   if(options.action==='edit'){editMessage(r,'chat',original,middle,at+500);editMessage(r,'chat',original,latest,options.late?bounds.endMs+1:at+1000);}
   if(options.action==='retract')retractMessage(r,'chat',original,at+500);
   if(options.action==='deleted')r.chats[0].status='deleted';
   if(options.action==='unknown-edit'){r.chats[0].text=latest;r.chats[0].revisionCount=1;}
   r.events=[{id:'legacy-independent',kind:'life',title:'合成独立事件标记',detail:'按设定整理了档案。',at:at+500,knownBy:[r.id],lifeEvidence:'confirmed',source:'fixture-independent'}];
   if(options.action==='edit'||options.action==='retract'){
    const change=options.action==='edit'?editMessage:retractMessage;
    const unrelated={id:'same-text-independent',kind:'life',title:'同文无关事件标记',detail:r.chats[0].text,at,knownBy:[r.id],lifeEvidence:'confirmed',source:'fixture-independent'};
    r.events.push(unrelated);
    const secondary={id:'other-phone',speaker:'me',text:r.chats[0].text,at,kind:'chat'};
    r.chats.push(secondary);
    if(options.action==='edit')change(r,'chat',secondary.id,'独立消息编辑标记',at+1200);else change(r,'chat',secondary.id,at+1200);
    assert.equal(unrelated.status,process.env.BASELINE?(options.action==='edit'?'superseded':'retracted'):undefined,'a matching text and timestamp do not establish dependency');
    unrelated.detail='另一条独立记录。';
    r.events=r.events.filter(e=>e.id===unrelated.id||e.id==='legacy-independent');
   }
   if(options.nextDay)r.chats.push({id:'later',speaker:'me',text:'次日才出现标记',at:bounds.endMs+1,kind:'chat'});
   if(options.location){
    sc.where='午夜后新地点标记';
    sc.locationEvidence={origin:'manual',at:bounds.endMs+1,sources:[]};
    r.events.push({id:'move',kind:'scene',title:'移动',detail:'午夜后新地点标记',at:bounds.endMs+1,source:sc.id,knownBy:[r.id],sceneChange:{requestId:'move',sceneId:sc.id,sources:[],before:{where:'午夜前地点标记',locationEvidence:{origin:'manual',at,sources:[]}},after:{where:sc.where,locationEvidence:sc.locationEvidence}}});
   }
   r.lifeAt=now;r.lastDiaryCheckDay=await p.evaluate(at=>{const d=new Date(at);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');},now);r.firstMessageState={status:'ready',updatedAt:now};
   r.diaryTasks=[{id:'fixture-diary',roleId:r.id,dateKey:day,status:'pending',attempts:0,createdAt:now,updatedAt:now}];
   world.roles=[r];world.selected=null;world.settings={...world.settings,mode:'api',endpoint,model:'synthetic-provenance',autonomousLife:false};
   await p.evaluate(({key,world,endpoint})=>{
    localStorage.setItem(key,JSON.stringify(world));localStorage.setItem('elsewhere-device-api-key-v1',JSON.stringify({endpoint,key:'synthetic-credential'}));
   },{key,world,endpoint});
   await p.reload();await ready(p);
   await check({p,ctx,posts,release,day,at,r});
   assert.deepEqual(errors,[],'no uncaught browser errors');
  }finally{release();await ctx.close();}
 }
 async function enterConversation(p){
  await p.locator('[data-action=enter][data-id=fixture-role]').click();
  await p.locator('[data-action=openconversation]').click();
 }
 async function revisePhone(p,action){
  const button=p.locator('[data-scope=chat][data-id='+original+'][data-action='+(action==='edit'?'starteditmsg':'retractmsg')+']');
  await button.evaluate(el=>el.click());
  if(action==='edit'){
   await p.locator('#inline-edit-form textarea').fill(latest);
   await p.locator('#inline-edit-form [type=submit]').click();
  }
 }
 try{
  const baseline=Boolean(process.env.BASELINE);
  for(const archivedScene of [false,true])for(const action of ['edit','retract']){
   await fixture({archived:archivedScene,action},async({p,posts,r})=>{
    await wait(()=>posts.length===1,'diary POST');await wait(()=>archived(p),'diary archive');
    const record=await archived(p);
    const observed={old:posts[0].includes(old),bridge:record.sourceMessageIds.includes(bridge)};
    assert.deepEqual(observed,{old:baseline,bridge:baseline});
    assert.ok(posts[0].includes('独立现场对白标记'));
    assert.ok(posts[0].includes('按设定整理了档案'));
    assert.equal(posts[0].includes(latest),action==='edit');
    if(archivedScene)assert.deepEqual((await read(p)).roles[0].meetings,r.meetings);
    console.log('PASS',archivedScene?'archived':'active',action,JSON.stringify(observed));
   });
  }
  if(baseline)return;
  for(const tz of ['America/Los_Angeles','Asia/Tokyo']){
   await fixture({action:'edit',late:true,nextDay:true,location:true,tz},async({p,posts})=>{
    await wait(()=>archived(p),'historical diary archive');
    assert.equal(posts.length,1);
    for(const hidden of [old,middle,latest,'次日才出现标记','午夜后新地点标记'])assert.ok(!posts[0].includes(hidden),hidden);
    assert.ok(posts[0].includes('午夜前地点标记'));
    assert.ok(!(await archived(p)).sourceMessageIds.includes(original));
    console.log('PASS',tz,'historical cutoff for edit, next day and location');
   });
  }
  for(const action of ['deleted','unknown-edit']){
   await fixture({action},async({p,posts})=>{
    await wait(()=>archived(p),'legacy diary archive');
    assert.equal(posts.length,1);
    assert.ok(!posts[0].includes(old)&&!posts[0].includes(latest));
    assert.ok(!(await archived(p)).sourceMessageIds.includes(original));
    console.log('PASS',action,'legacy sources handled conservatively');
   });
  }
  await fixture({},async({p,posts})=>{
   await wait(()=>archived(p),'unchanged diary archive');
   assert.equal(posts.length,1);
   assert.equal(posts[0].split(old).length-1,1);
   assert.deepEqual((await archived(p)).sourceMessageIds.filter(id=>id===original||id===bridge),[original]);
   console.log('PASS valid bridge appears only once in the diary');
  });
  await fixture({action:'edit'},async({p,posts})=>{
   await wait(()=>archived(p),'diary archive before Scene');
   await enterConversation(p);
   await p.locator('#novel-input').fill('合成现场新对白');
   await p.locator('#novel-form button').first().click();
   await wait(()=>posts.length===2,'Scene POST');
   assert.ok(posts[1].includes('合成现场新对白')&&posts[1].includes('独立现场对白标记'));
   assert.ok(!posts[1].includes(old)&&!posts[1].includes(middle));
   console.log('PASS actual Scene POST excludes replaced bridge and quote');
  });
  for(const [action,failStatusSave] of [['edit',false],['retract',false],['retract',true]]){
   await fixture({archived:true,hold:true},async({p,ctx,posts,release,day})=>{
    await wait(()=>posts.length===1,'in-flight diary POST');
    assert.ok(posts[0].includes(old));
    await enterConversation(p);
    if(app.protocol!=='file:'&&action==='edit'){
     const reader=await ctx.newPage();
     await reader.goto(app.href);
     await reader.locator('#app[data-write-access=read-only]').waitFor();
     await enterConversation(reader);
     await revisePhone(reader,'edit');
     assert.equal((await read(p)).roles[0].chats.find(m=>m.id===original).text,old);
     await reader.close();
    }
    await revisePhone(p,action);
    const saved=await read(p);
    assert.ok(action==='edit'?saved.roles[0].chats.find(m=>m.id===original).text===latest:saved.roles[0].chats.find(m=>m.id===original).status==='retracted');
    if(away&&action==='retract'){
     const before=await p.evaluate(()=>window.provenanceDocument);
     await p.goto(away);await p.goBack({waitUntil:'commit'});await ready(p);
     assert.equal(await p.evaluate(()=>window.provenanceDocument),before);
     assert.equal(await p.evaluate(()=>window.provenanceRestored),true);
    }
    if(failStatusSave)await p.evaluate(()=>window.blockRecoveryStatus=true);
    const sent=await recoveryRecord(p,day);
    assert.equal(sent.receipt.state,'sent');
    assert.equal(sent.task.requestAttempt,sent.receipt.attempt);
    assert.ok(sent.task.sourceMessageIds.includes(original));
    release();
    const copy=p.locator('dialog[open] textarea[aria-label="可复制的未确认回复"]');
    await copy.waitFor();assert.equal(await copy.inputValue(),diary);
    await p.locator('dialog[open] button').click();
    assert.equal(await archived(p),undefined);
    const stored=await recoveryRecord(p,day);
    assert.equal(stored.receipt.state,'ready');
    assert.equal(stored.receipt.result.text,diary);
    assert.match(stored.receipt.result.sourceHash,/^[a-f0-9]{64}$/);
    assert.equal(stored.receipt.attempt,sent.receipt.attempt);
    if(failStatusSave)assert.equal(stored.task.status,'generating','fixture rejected main status write after IDB commit');
    await p.reload();await ready(p);
    await p.locator('[data-action=enter][data-id=fixture-role]').click();
    await p.locator('[data-home-page="1"]').click();
    await p.getByRole('button',{name:'打开日记'}).click();
    const card=p.locator('[data-diary-task-date="'+day+'"]');
    await card.getByText('正文待复制 · 来源已变化',{exact:true}).waitFor();
    const restored=await recoveryRecord(p,day);
    assert.equal(restored.id,stored.id);
    assert.equal(restored.task.id,stored.task.id);
    assert.equal(restored.task.requestAttempt,stored.receipt.attempt);
    assert.deepEqual(restored.receipt,stored.receipt);
    assert.ok(!restored.task.sourceMessageIds.includes(original));
    await card.getByRole('button',{name:'查看并复制正文'}).click();
    await copy.waitFor();assert.equal(await copy.inputValue(),diary);
    assert.match(await p.locator('dialog[open] h2').textContent(),/来源已变化/);
    await p.locator('dialog[open] button').click();
    assert.equal(await archived(p),undefined);
    assert.equal(posts.length,1,'editing, reopening and inspecting the stale result must not resend');
    await p.locator('[data-action=view][data-view=home]').filter({visible:true}).first().click();
    await p.locator('[data-action=openconversation]').click();
    await p.clock.install();
    await p.getByTestId('chat-focus-paw-btn').click();
    await p.clock.fastForward(125000);
    assert.equal(posts.length,1,'revision must not queue a phone POST');
    await p.locator('#message-input').fill('用户主动发送合成新一轮');
    await p.locator('#message-form .send-btn').click();
    await p.clock.fastForward(125000);
    await wait(()=>posts.length===2,'explicit new phone send');
    assert.ok(posts[1].includes('用户主动发送合成新一轮'));
    assert.ok(!posts[1].includes(old)&&!posts[1].includes(middle));
    assert.equal(posts[1].includes(latest),action==='edit');
    assert.ok(!posts[1].includes(diary),'copied stale diary is not a memory source');
    console.log('PASS',action,failStatusSave?'status-save failure':'normal save','in-flight diary stays recoverable, future phone POST is current, zero automatic retries');
   });
  }
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
