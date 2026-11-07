const assert=require('node:assert/strict');
const approveBackupImports=require('./backup-confirmation.cjs');
const {pathToFileURL}=require('node:url');
const {chromium,devices}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

const url=process.env.TEST_URL||pathToFileURL(process.cwd()+'/public/Elsewhere_Phase1_Standalone.html').href;
const endpoint='https://meeting-fixture.invalid/v1',saveKey='elsewhere-v01';
const at=Date.parse('2026-11-04T22:00:00Z');
const opening='我沿着岸边朝你走过去。',phone='我也看见你了。我这就朝你走过去。';
const wait=async (condition,label)=>{
 const end=Date.now()+8000;
 while(Date.now()<end){if(await condition())return;await new Promise(resolve=>setTimeout(resolve,20));}
 throw Error('Timeout: '+label);
};
async function main(){
 const {defaults,createRole}=await import('../src/core/defaults.ts');
 const browser=await chromium.launch({ignoreDefaultArgs:['--disable-back-forward-cache'],...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 const deadline=setTimeout(()=>{console.error('Meeting control suite exceeded its deadline');process.exitCode=1;void browser.close();},150000);
 const canned=(d,scene)=>d.choices?.[0]||{message:{role:'assistant',content:scene?opening:phone},finish_reason:'stop'};
 const away=new URL('meeting-fixture-away',url).href;
 async function run(label,test,{key=true,roles=1,legacy=false,focused=true}={}){
  if(process.env.TEST_CASE&&!label.includes(process.env.TEST_CASE))return;
  const c=await browser.newContext({...devices['iPhone 13'],ignoreHTTPSErrors:true,serviceWorkers:'block',timezoneId:'America/Los_Angeles'});
  await approveBackupImports(c);
  const p=await c.newPage();p.setDefaultTimeout(8000);p.setDefaultNavigationTimeout(8000);
  const errors=[],posts=[];let respond;
  p.on('pageerror',e=>errors.push(e.message));
  const gate=new Promise(resolve=>{respond=resolve;});
  try{
   let seed=true;
   await c.route('**/*',async route=>{
    const request=route.request(),dest=request.url();
    if(request.isNavigationRequest()&&request.frame()===p.mainFrame()&&seed){
     seed=false;return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated fixture</title>'});
    }
    if(dest===endpoint+'/chat/completions'){
     const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST','access-control-allow-headers':'*'};
     if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
     assert.equal(request.method(),'POST');
     const body=request.postDataJSON(),line=body.messages[0].content.split('\n').find(s=>s.startsWith('{"requestId":'));
     const control=line?JSON.parse(line):null,scene=!!control?.sceneId;
     posts.push({body,control,scene});
     const d=await gate,choice=canned(d||{},scene);
     if(control&&!scene&&d?.arrive){
      const event={state:'approaching',context:'physical-now',user:{id:control.currentInputs.at(-1),quote:'我看见你了！',signal:'sighting'},actor:{id:'@reply',quote:phone,signal:'approaching'}};
      choice.message.content+='<elsewhere_scene_event>'+JSON.stringify({requestId:control.requestId,roleId:control.roleId,sceneId:null,event})+'</elsewhere_scene_event>';
     }
     return route.fulfill({json:{choices:[choice]},headers}).catch(()=>{});
    }
    if(dest===away&&request.method()==='GET')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Away fixture</title>'});
    if(request.method()==='GET'&&(new URL(dest).protocol==='file:'||new URL(dest).origin===new URL(url).origin))return route.continue();
    return route.abort();
   });
   await c.addInitScript(()=>{
    window.meetingPage={id:crypto.randomUUID(),shows:[]};
    addEventListener('pageshow',e=>window.meetingPage.shows.push(e.persisted));
    const old=Storage.prototype.setItem;
    Storage.prototype.setItem=function(k,v){
     if(k==='elsewhere-v01'){
      const scenes=JSON.parse(v).roles.map(r=>r.scene).filter(Boolean);
      if(window.failMeeting&&scenes.some(s=>s.opening?.status===window.failMeeting)){
       window.failedMeetingWrites=(window.failedMeetingWrites||0)+1;
       throw Error('synthetic scene write failure');
      }
     }
     return old.call(this,k,v);
    };
   });
   const world=defaults();
   world.roles=Array.from({length:roles},(_,i)=>{
    const r=createRole('合成会面角色'+i,'','观察员','谨慎','虚构群岛');r.id='meeting-fixture-'+i;r.chats=[];r.diaries=[];r.events=[];r.meetings=[];r.lifeAt=at;r.lastDiaryCheckDay='2026-11-04';r.firstMessageState={status:'ready',updatedAt:at};
    r.chatTiming={version:1,focused,generation:0,pending:[],quietUntil:0};
    if(legacy)r.scene={id:'legacy-fixture',where:'旧港口',startedAt:at-50000,entryPhase:'approaching',messages:[{id:'legacy-msg',speaker:'char',text:'旧场景的正文仍在。',at:at-40000}]};
    return r;
   });
   world.selected=world.roles[0].id;
   world.settings={...world.settings,mode:'api',endpoint,model:'synthetic',autonomousLife:false};
   await p.clock.install({time:at-60000});await p.clock.pauseAt(at);
   await p.goto(url);
   await p.evaluate(({world,endpoint,key,saveKey})=>{
    localStorage.setItem(saveKey,JSON.stringify(world));
    if(key)localStorage.setItem('elsewhere-device-api-key-v1',JSON.stringify({endpoint,key:'SYNTHETIC_MOCK_ONLY'}));
   },{world,endpoint,key,saveKey});
   const ready=()=>p.locator('#app[data-storage-state=ready]').waitFor();
   const reload=async()=>{await p.reload();await ready();};
   const current=async(i=0)=>(await p.evaluate(k=>JSON.parse(localStorage.getItem(k)),saveKey)).roles[i];
   const enter=async(i=0)=>p.locator(`[data-action=enter][data-id=meeting-fixture-${i}]`).click();
   const chat=async(i=0)=>{await enter(i);await p.locator('.dock [data-view=chat]').click();};
   const resume=async()=>{await enter();await p.locator('[data-action=openconversation]').click();};
   const toggle=p.locator('[data-action=offline-round]');
   const draft=p.locator('#message-input');
   const send=async text=>{await draft.fill(text);await p.locator('#message-form .send-btn').click();};
   const tool=()=>p.locator('[data-action=chatpanel][data-panel=more]').click();
   const instant=async()=>{await tool();await p.locator('.chat-drawer [data-action=meet]').click();};
   const advance=ms=>p.clock.fastForward(ms);
   const scene=()=>p.locator('#novel-form').waitFor();
   const status=async expected=>wait(async()=>(await current()).scene?.opening?.status===expected,'saved opening '+expected);
   const mock=async count=>wait(()=>posts.length===count,count+' Mock POST');
   const archived=async()=>{respond();await status('archived');};
   await reload();
   await test({c,p,current,reload,chat,enter,resume,toggle,draft,send,tool,instant,advance,scene,status,mock,respond,archived,posts});
   assert.deepEqual(errors,[],'uncaught browser errors');
   console.log('PASS '+label+' | POST='+posts.length);
  }catch(error){console.error(label,'POSTs',posts.map(p=>p.scene?'scene':'phone'));throw error;}
  finally{respond();await c.close();}
 }
 try{
  await run('immediate consumes the armed round once through exit and refresh',async t=>{
   await t.chat();assert.equal(await t.toggle.isDisabled(),true);
   await t.send('我看见你了！');await t.toggle.click();
   const before=await t.current(),round=before.chatTiming.round.id;
   assert.equal(await t.toggle.getAttribute('aria-pressed'),'true');
   assert.equal(t.posts.length,0);
   await t.draft.fill('尚未发送的合成草稿');
   await t.tool();assert.equal(await t.p.locator('[data-panel=sticker]').count(),1);
   const meet=t.p.locator('.chat-drawer [data-action=meet]');
   assert.match(await meet.innerText(),/使用本轮消息/);
   await meet.evaluate(b=>{b.click();b.click();});
   await t.scene();await t.mock(1);assert.equal(t.posts[0].scene,true);
   const during=await t.current(),id=during.scene.id;
   assert.deepEqual(during.scene.opening,{roundId:round,entry:'immediate',status:'unknown'});
   assert.equal(during.scene.messages.some(m=>m.speaker==='char'),false);
   assert.deepEqual(during.chats,before.chats);
   assert.deepEqual(during.scene.messages.filter(m=>m.sourceMessageId).map(m=>[m.sourceMessageId,m.text]),[[before.chats[0].id,before.chats[0].text]]);
   assert.deepEqual(during.chatTiming.pending,[]);
   assert.equal(during.chatTiming.inFlight,undefined);
   assert.ok(t.posts[0].body.messages.some(m=>m.role==='user'&&m.content.includes(before.chats[0].text)));
   await t.archived();
   await t.p.locator('[data-action=endnovel]').click();await t.draft.waitFor();
   await t.reload();await t.chat();assert.equal(await t.draft.inputValue(),'尚未发送的合成草稿');
   await t.advance(75000);
   const after=await t.current();assert.equal(after.scene,null);
   assert.deepEqual(after.chats,before.chats);
   assert.deepEqual(after.meetings.map(m=>m.id),[id]);
   assert.equal(after.meetings[0].messages.filter(m=>m.speaker==='char'&&m.text===opening).length,1);
   assert.equal(t.posts.length,1);
  });
  await run('timed scene locks choice at the new deadline after three messages',async t=>{
   await t.chat();await t.send('第一次');const deadline=(await t.current()).chatTiming.quietUntil;
   for(let i=0;i<3;i++)await t.toggle.click();
   assert.equal((await t.current()).chatTiming.quietUntil,deadline);
   await t.advance(30000);await t.send('第二次');await t.advance(30000);await t.send('第三次');
   const before=await t.current();
   assert.equal(before.chatTiming.quietUntil,deadline+60000);
   assert.equal(await t.toggle.getAttribute('aria-pressed'),'true');
   await t.advance(59000);assert.equal(t.posts.length,0);assert.equal(await t.p.locator('#novel-form').count(),0);
   await t.draft.fill('截止时仍未发送的草稿');
   await t.p.evaluate(cutoff=>{
    const realNow=Date.now;
    try{
     Date.now=()=>cutoff;
     document.querySelector('[data-action=offline-round]').click();
     document.querySelector('#message-form').requestSubmit();
    }finally{Date.now=realNow;}
   },before.chatTiming.quietUntil);
   const cutoff=await t.current();
   assert.equal(cutoff.chatTiming.quietUntil,before.chatTiming.quietUntil);
   assert.deepEqual(cutoff.chats,before.chats);
   assert.equal(await t.draft.inputValue(),'截止时仍未发送的草稿');
   await t.advance(1900);await t.scene();await t.mock(1);
   const r=await t.current();assert.equal(r.scene.opening.entry,'scheduled');
   assert.deepEqual(r.scene.messages.filter(m=>m.sourceMessageId).map(m=>m.sourceMessageId),before.chats.map(m=>m.id));
   await t.archived();assert.equal(t.posts.length,1);
  });
  await run('turning off keeps normal wait and old model metadata cannot enter a scene',async t=>{
   await t.chat();await t.send('我看见你了！');await t.toggle.click();await t.toggle.click();
   await t.advance(61000);assert.equal(t.posts.length,0);assert.equal(await t.toggle.isDisabled(),true);
   await t.toggle.evaluate(b=>b.dispatchEvent(new MouseEvent('click',{bubbles:true})));
   await t.advance(61000);await t.mock(1);assert.equal(t.posts[0].scene,false);
   t.respond({arrive:true});
   await wait(async()=>(await t.current()).chats.some(m=>m.text===phone),'phone bubble archived');
   await t.advance(2000);
   assert.equal((await t.current()).scene,null);assert.equal(await t.p.locator('#novel-form').count(),0);assert.equal(t.posts.length,1);
  },{focused:false});
  await run('an offline round waits for its role without freezing the cutoff',async t=>{
   await t.chat();await t.send('在原角色等待');await t.toggle.click();
   await t.draft.fill('只属于角色零的草稿');
   const before=await t.current();
   const switcher=async()=>{await t.p.locator('.chat-back').click();await t.p.getByRole('button',{name:'切换角色'}).click();};
   await switcher();await t.chat(1);assert.equal(await t.toggle.isDisabled(),true);assert.equal(await t.draft.inputValue(),'');
   await t.advance(63000);assert.equal(t.posts.length,0);
   assert.equal((await t.current()).chatTiming.quietUntil,before.chatTiming.quietUntil);
   assert.equal((await t.current(1)).scene,null);
   await switcher();await t.chat();assert.equal(await t.draft.inputValue(),'只属于角色零的草稿');
   await t.advance(900);await t.mock(1);await t.scene();await t.archived();
  },{roles:2});
  await run('timer claims first and an immediate click cannot claim again',async t=>{
   await t.chat();await t.send('本轮只能有一个 Scene');await t.toggle.click();await t.tool();
   await t.p.evaluate(()=>{
    const digest=crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest=(...args)=>new Promise(resolve=>{window.releaseMeetingDigest=()=>{
     crypto.subtle.digest=digest;digest(...args).then(resolve);
    };});
   });
   await t.advance(61000);
   await wait(async()=>await t.p.evaluate(()=>typeof window.releaseMeetingDigest==='function'),'timer owns the round before the competing click');
   assert.equal((await t.current()).chatTiming.inFlight.entry,'scheduled');
   await t.p.locator('.chat-drawer [data-action=meet]').click();
   assert.equal(t.posts.length,0);
   await t.p.evaluate(()=>window.releaseMeetingDigest());
   await t.scene();await t.mock(1);await t.archived();
   assert.equal((await t.current()).scene.opening.entry,'scheduled');
  });
  await run('second tab cannot consume a round or dispatch a POST',async t=>{
   await t.chat();await t.send('竞争中的手机原话');await t.toggle.click();
   const other=await t.c.newPage();other.setDefaultTimeout(8000);
   await other.goto(url);
   await other.locator('#app[data-storage-state=ready][data-write-access=read-only]').waitFor();
   await other.locator('[data-action=enter][data-id=meeting-fixture-0]').click();
   await other.locator('.dock [data-view=chat]').click();
   await other.locator('[data-action=chatpanel][data-panel=more]').click();
   await other.locator('.chat-drawer [data-action=meet]').click();
   assert.equal((await t.current()).scene,null);assert.equal(t.posts.length,0);
   await t.p.bringToFront();await t.advance(61000);await t.scene();await t.mock(1);await t.archived();
   await other.locator('.chat-drawer [data-action=meet]').click();
   assert.equal(await other.locator('#novel-form').count(),0);assert.equal(t.posts.length,1);
  });
  if(new URL(url).protocol!=='file:')await run('real BFCache keeps the original deadline and dispatches only after returning',async t=>{
   await t.chat();await t.send('返回时保留线下选择');await t.toggle.click();await t.draft.fill('返回时保留的草稿');
   const before=await t.current(),id=await t.p.evaluate(()=>window.meetingPage.id);
   await t.p.goto(away);await t.p.goBack({waitUntil:'commit'});
   await t.p.locator('#app[data-write-access=writer]').waitFor();
   const lifecycle=await t.p.evaluate(()=>window.meetingPage);
   assert.equal(lifecycle.id,id);assert.equal(lifecycle.shows.at(-1),true);
   assert.equal((await t.current()).chatTiming.quietUntil,before.chatTiming.quietUntil);
   assert.equal(await t.draft.inputValue(),'返回时保留的草稿');
   assert.equal(t.posts.length,0);
   await t.advance(61000);await t.scene();await t.mock(1);await t.archived();
  });
  await run('scene commit failure preserves the round and draft without sending',async t=>{
   await t.chat();await t.send('保存前的手机原话');await t.toggle.click();
   const before=await t.current();await t.draft.fill('恢复时仍在的草稿');
   await t.p.evaluate(()=>window.failMeeting='unsent');await t.instant();
   await wait(async()=>(await t.current()).chatTiming.blocked==='failed','confirmed failed scene save');
   const failed=await t.current();
   assert.equal(failed.scene,null);assert.deepEqual(failed.chats,before.chats);
   assert.deepEqual(failed.chatTiming.pending,before.chatTiming.pending);
   assert.equal(failed.chatTiming.round.id,before.chatTiming.round.id);
   assert.equal(await t.draft.inputValue(),'恢复时仍在的草稿');assert.equal(t.posts.length,0);
   await t.reload();await t.chat();assert.equal(await t.draft.inputValue(),'恢复时仍在的草稿');
   assert.equal(t.posts.length,0);
   await t.p.locator('.chat-error-notice summary').click();
   await t.p.locator('[data-action=retrychatbatch]').click();await t.advance(62000);await t.scene();await t.mock(1);await t.archived();
  });
  await run('saved unsent scene can continue after refresh with no fee prompt',async t=>{
   await t.chat();await t.send('进入但尚未派发');
   await t.p.evaluate(()=>window.failMeeting='unknown');
   await t.instant();await t.scene();
   await t.p.locator('[data-action=resume-scene-opening]').waitFor();
   const saved=await t.current();assert.equal(saved.scene.opening.status,'unsent');assert.equal(t.posts.length,0);
   await t.reload();await t.resume();await t.advance(62000);
   assert.equal(t.posts.length,0);assert.equal((await t.current()).scene.id,saved.scene.id);
   t.p.on('dialog',async dialog=>{await dialog.dismiss();assert.fail('a known unsent request must not ask about repeat fees');});
   await t.p.locator('[data-action=resume-scene-opening]').click();await t.mock(1);await t.archived();
  });
  await run('dispatched scene reloads as unknown and canceling fee confirmation sends nothing',async t=>{
   await t.chat();await t.send('已派发但结果未知');await t.instant();await t.mock(1);await t.status('unknown');
   const saved=await t.current();
   await t.reload();await t.resume();await t.advance(75000);
   await t.p.locator('[data-scene-opening=unknown]').waitFor();
   const confirmation=t.p.waitForEvent('dialog');
   const click=t.p.locator('[data-action=resume-scene-opening]').click();
   const dialog=await confirmation;assert.match(dialog.message(),/再次计费/);await dialog.dismiss();await click;
   t.respond();assert.equal((await t.current()).scene.id,saved.scene.id);assert.equal(t.posts.length,1);
  });
  await run('first result save failure exposes copy and keeps uncertain status',async t=>{
   await t.chat();await t.send('等待正文保存');await t.instant();await t.mock(1);await t.status('unknown');
   await t.p.evaluate(()=>window.failMeeting='archived');t.respond();
   const copy=t.p.locator('dialog[open] textarea');await copy.waitFor();assert.equal(await copy.inputValue(),opening);
   const failed=await t.current();assert.equal(failed.scene.opening.status,'unknown');assert.equal(failed.scene.messages.filter(m=>m.speaker==='char').length,0);
   await t.reload();await t.resume();await t.advance(62000);assert.equal(t.posts.length,1);
  });
  await run('ending an in-flight Scene does not deliver its late response into chat',async t=>{
   await t.chat();await t.send('合成先说的话');await t.instant();await t.mock(1);await t.scene();
   const before=await t.current();
   await t.p.locator('[data-action=endnovel]').click();await t.draft.waitFor();t.respond();
   await t.advance(63000);
   const after=await t.current();assert.equal(after.scene,null);assert.deepEqual(after.chats,before.chats);
   assert.equal(after.meetings[0].id,before.scene.id);assert.equal(after.meetings[0].messages.some(m=>m.speaker==='char'),false);assert.equal(t.posts.length,1);
  });
  await run('switching worlds rejects the old opening and does not leak its draft',async t=>{
   await t.chat();await t.send('旧世界的手机原话');
   const replacement=await t.p.evaluate(key=>JSON.parse(localStorage.getItem(key)),saveKey);
   replacement.roles[0].name='同角色标识的新世界';
   replacement.roles[0].chats=[];
   await t.draft.fill('旧世界的草稿');
   await t.instant();await t.mock(1);await t.scene();
   await t.p.locator('[data-action=view][data-view=home]').first().click();
   await t.p.getByRole('button',{name:'切换角色'}).click();
   await t.p.locator('#landing-backup-file').setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(replacement))});
   await t.p.getByText('同角色标识的新世界',{exact:true}).waitFor();
   t.respond();await t.chat();assert.equal(await t.draft.inputValue(),'');
   await t.advance(62000);
   const r=await t.current();assert.equal(r.scene,null);assert.deepEqual(r.chats,[]);
   assert.equal(t.posts.length,1);
  });
  await run('theatre and intermission remain separate from the armed phone round',async t=>{
   await t.chat();await t.send('不得注入戏内的手机原话');await t.toggle.click();await t.tool();
   await t.p.locator('.chat-drawer [data-view=drama]').click();
   await t.p.locator('#play-start button').click();await t.scene();
   await t.p.locator('#novel-input').fill('戏中合成台词');await t.p.locator('#novel-form button[type=submit], #novel-form button:not([type])').first().click();
   await t.mock(1);t.respond();
   await wait(async()=>(await t.current()).play?.messages.some(m=>m.speaker==='char'),'play reply saved');
   assert.equal(t.posts[0].control,null);assert.ok(!JSON.stringify(t.posts[0].body).includes('不得注入戏内的手机原话'));
   await t.p.locator('[data-action=intermission]').click();
   await t.p.getByTestId('intermission-panel').waitFor();
   const r=await t.current();assert.equal(r.scene,null);assert.equal(r.play.paused,true);assert.equal(r.chatTiming.round.entry,'scheduled');
   assert.equal(t.posts.length,1);
  });
  await run('immediate without a pending turn and legacy scenes stay usable',async t=>{
   await t.chat();await t.instant();await t.scene();const saved=await t.current();assert.equal(saved.scene.opening,undefined);
   await t.reload();await t.resume();assert.equal((await t.current()).scene.id,saved.scene.id);
   await t.p.locator('[data-action=endnovel]').click();assert.equal((await t.current()).meetings.length,1);assert.equal(t.posts.length,0);
  });
  await run('old approaching scene survives reload and archives intact',async t=>{
   await t.resume();assert.equal((await t.current()).scene.id,'legacy-fixture');
   await t.p.locator('[data-action=endnovel]').click();
   const saved=await t.current();assert.equal(saved.meetings[0].entryPhase,'approaching');assert.equal(saved.meetings[0].messages[0].text,'旧场景的正文仍在。');assert.equal(t.posts.length,0);
  },{legacy:true});
  await run('missing credentials keep the original round without a scene or POST',async t=>{
   await t.chat();await t.send('没有 Key 时保留原话');await t.toggle.click();await t.instant();await t.advance(65000);
   const r=await t.current();assert.equal(r.scene,null);assert.equal(r.chatTiming.pending.length,1);assert.equal(r.chatTiming.blocked,'api');assert.equal(t.posts.length,0);
  },{key:false});
 }finally{clearTimeout(deadline);await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
