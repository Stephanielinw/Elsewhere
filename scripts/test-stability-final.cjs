// Synthetic worlds only. Every model POST goes through the intercepted HTTP endpoint.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const url=process.env.TEST_URL||pathToFileURL(process.cwd()+'/dist/Elsewhere_Phase1_Standalone.html').href;
const key='elsewhere-v01',endpoint='https://stability-final.invalid/v1',at=Date.parse('2026-11-06T22:00:00Z');
const wait=async(read,why)=>{const until=Date.now()+8000;while(Date.now()<until){if(await read())return;await new Promise(r=>setTimeout(r,20));}throw Error('Timeout: '+why);};
async function main(){
 const {defaults,createRole}=await import('../src/core/defaults.ts');
 const browser=await chromium.launch({executablePath:chromium.executablePath(),ignoreDefaultArgs:['--disable-back-forward-cache']});
 const results=[],deadline=setTimeout(()=>{process.exitCode=1;void browser.close();},180000);
 async function run(name,options,check){
  if(process.env.TEST_CASE&&!name.includes(process.env.TEST_CASE))return;
  const ctx=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Los_Angeles',serviceWorkers:'block'}),posts=[],errors=[];
  let seed=true;
  try{
   ctx.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
   await ctx.addInitScript(({endpoint,key,mode})=>{
    window.finalProbe={mode,holds:[],refuse:false,failures:0,aborts:0};
    const native=fetch.bind(window);
    window.fetch=async(input,init)=>{
     if(!String(input).startsWith(endpoint))return native(input,init);
     init.signal?.addEventListener('abort',()=>window.finalProbe.aborts++);
     // Deliberately ignore AbortSignal, but still issue a real, counted Mock HTTP POST.
     const response=await native(input,{...init,signal:undefined});
     const probe=window.finalProbe;
     const prompt=JSON.parse(init.body).messages.map(m=>m.content).join('\n');
     if(!prompt.includes(probe.mode==='diary'?'【私人日记】':'[Elsewhere Autonomous Life v1]'))return response;
     if(probe.mode==='headers')return new Promise((resolve,reject)=>probe.holds.push({resolve:()=>resolve(response),reject:()=>reject(Error('synthetic late rejection'))}));
     if(probe.mode==='body'||probe.mode==='diary'){
      const json=response.json.bind(response);
      Object.defineProperty(response,'json',{value:async()=>{const body=await json();return new Promise((resolve,reject)=>probe.holds.push({resolve:()=>resolve(body),reject:()=>reject(Error('synthetic late rejection'))}));}});
     }
     return response;
    };
    const set=Storage.prototype.setItem;
    Storage.prototype.setItem=function(k,v){
     if(k===key){
      const world=JSON.parse(v),p=window.finalProbe;
      if(p.refuse&&world.roles.some(r=>r.events.some(e=>e.lifeRecord))||p.mode==='claim-save'&&world.roles.some(r=>r.lifeTasks?.length)){
       p.failures++;throw Error('synthetic final save refusal');
      }
      if(p.mode==='unsent'&&world.roles.some(r=>r.lifeTasks?.length)){
       p.mode='none';const result=set.call(this,k,v);dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false}));return result;
      }
     }
     return set.call(this,k,v);
    };
   },{endpoint,key,mode:options.mode||'none'});
   await ctx.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());
    if(seed&&req.isNavigationRequest()){seed=false;return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Final stability seed</title>'});}
    if(req.url()===endpoint+'/chat/completions'){
     const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST','access-control-allow-headers':'*'};
     if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
     assert.equal(req.method(),'POST');const body=req.postDataJSON(),wire=body.messages.map(m=>m.content).join('\n');
     if(!wire.includes('[Elsewhere Autonomous Life v1]')){
      const kind=wire.includes('【私人日记】')?'diary':options.mode==='e2e'&&!options.long&&posts.length===0?'scene':'chat';
      if(kind==='scene')assert.ok(wire.includes('"sceneId"'));
      posts.push({kind,hasSceneAction:wire.includes('我带你进入合成房间。你留在这里，我先出去。')});
      const content=kind==='scene'?'我带你进入合成房间。你留在这里，我先出去。':kind==='diary'?'合成收尾私人日记。':'合成收尾手机回复。';
      return route.fulfill({headers,json:{choices:[{finish_reason:'stop',message:{role:'assistant',content}}]}});
     }
     const task=JSON.parse(body.messages.at(-1).content);
     const receipt=await req.frame().page().evaluate(async id=>new Promise((yes,no)=>{
      const q=indexedDB.open('elsewhere-life-budget-v1');q.onerror=()=>no(Error('receipt unavailable'));
      q.onsuccess=()=>{const db=q.result,tx=db.transaction('journal','readonly'),r=tx.objectStore('journal').get('current');tx.oncomplete=()=>{db.close();yes(r.result?.tasks?.find(t=>t.id===id));};};
     }),task.requestId);
     assert.equal(receipt?.status,'attempted','immutable receipt must precede POST');
     posts.push({kind:'life',taskId:task.requestId,roleId:task.roleId,receiptStatus:receipt.status});
     return route.fulfill({headers,json:{choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify({requestId:task.requestId,roleId:task.roleId,events:[{at:task.window.to-3600000,action:'rest',durationMinutes:5}]})}}]}});
    }
    if(req.method()==='GET'&&(u.protocol==='file:'||u.origin===new URL(url).origin))return route.continue();
    throw Error('Unexpected network request');
   });
   const world=defaults();world.roles=Array.from({length:options.roles||1},(_,i)=>{
    const r=createRole('合成收尾角色'+i,'','守档者','谨慎','合成港口');
    Object.assign(r,{id:'final-role-'+i,chats:[],events:[],diaries:[],diaryTasks:options.mode==='diary'?[{id:'synthetic-diary',roleId:'final-role-'+i,dateKey:'2026-11-05',status:'failed',attempts:0,createdAt:at,updatedAt:at}]:[],chatTiming:{version:1,focused:true,generation:0,pending:[],quietUntil:0},meetings:[],lifeAt:at,lastDiaryCheckDay:'2026-11-06',firstMessageState:{status:'ready',updatedAt:at-4*3600000},proactive:{attempts:[{id:'prior',roleId:'final-role-'+i,topicId:'none',topic:'',topicVersion:'',chatVersion:'',at,status:'skipped'}],sentTopics:[]}});return r;
   });world.selected=world.roles[0].id;world.settings={...world.settings,mode:'api',endpoint,model:'synthetic-final',autonomousLife:!['diary','e2e'].includes(options.mode)};
   if(options.long){
    const r=world.roles[0];r.chats=Array.from({length:2000},(_,i)=>({id:'history-'+i,speaker:i%2?'char':'me',text:'合成长期历史 '+i,at:at-60000-(2000-i)*1000,status:'active'}));
    Object.assign(r.chats.at(-2),{kind:'voice',mediaId:'final-audio',seconds:10,caption:'合成静音'});r.chats.at(-1).quote={id:r.chats[0].id,speaker:'me',text:r.chats[0].text,at:r.chats[0].at};
   }
   const p=await ctx.newPage();p.setDefaultTimeout(8000);p.setDefaultNavigationTimeout(8000);
   await p.clock.install({time:at-60000});await p.clock.pauseAt(at);await p.goto(url);
   await p.evaluate(({key,world,endpoint})=>{localStorage.setItem(key,JSON.stringify(world));localStorage.setItem('elsewhere-device-api-key-v1',JSON.stringify({endpoint,key:'SYNTHETIC_MOCK_ONLY'}));},{key,world,endpoint});
   if(options.long)await p.evaluate(async()=>{
    const bytes=new ArrayBuffer(160044),v=new DataView(bytes),s=(o,t)=>[...t].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
    s(0,'RIFF');v.setUint32(4,160036,true);s(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);s(36,'data');v.setUint32(40,160000,true);
    await new Promise((yes,no)=>{const q=indexedDB.open('elsewhere-media-v1',1);q.onupgradeneeded=()=>q.result.createObjectStore('blobs');q.onsuccess=()=>{const db=q.result,tx=db.transaction('blobs','readwrite');tx.objectStore('blobs').put(new Blob([bytes],{type:'audio/wav'}),'final-audio');tx.oncomplete=()=>{db.close();yes();};tx.onabort=()=>no(Error('synthetic audio seed failed'));};});
   });
   await p.reload();await p.locator('#app[data-storage-state=ready][data-write-access=writer]').waitFor();await p.clock.runFor(1800);
   const saved=()=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
   const receipts=()=>p.evaluate(async()=>{if(!(await indexedDB.databases()).some(d=>d.name==='elsewhere-life-budget-v1'))return [];return new Promise((yes,no)=>{
    const q=indexedDB.open('elsewhere-life-budget-v1');q.onerror=()=>no(Error('read receipts'));
    q.onsuccess=()=>{const db=q.result,tx=db.transaction('journal','readonly'),r=tx.objectStore('journal').get('current');tx.oncomplete=()=>{db.close();yes(r.result?.tasks||[]);};};
   });});
   const locked=()=>p.evaluate(async()=>(await navigator.locks.query()).held.some(l=>l.name==='elsewhere-life-budget-v1'));
   const archiveCount=async()=>(await saved()).roles.reduce((n,r)=>n+r.events.filter(e=>e.lifeRecord).length,0);
   const release=(index,fail=false)=>p.evaluate(({index,fail})=>window.finalProbe.holds[index][fail?'reject':'resolve'](),{index,fail});
   await check({p,ctx,posts,saved,receipts,locked,archiveCount,release});
   assert.deepEqual(errors,[]);
   const claims=await receipts(),d=await saved();
   const lifePosts=posts.filter(p=>p.kind==='life');
   results.push({name,claims:claims.length,posts:posts.length,postKinds:posts.map(p=>p.kind),archives:await archiveCount(),receiptStates:claims.map(t=>t.status),taskStates:d.roles.flatMap(r=>(r.lifeTasks||[]).map(t=>({id:t.id,status:t.status}))),automaticLifeRetries:lifePosts.length-new Set(lifePosts.map(p=>p.taskId)).size});
   console.log('PASS '+name+' | POST='+posts.length);
  }finally{await ctx.close();}
 }
 try{
  for(const mode of ['headers','body'])await run('deadline releases '+mode+' lock without refund; late result cannot unlock independent task',{mode,roles:2},async t=>{
   await wait(()=>t.posts.length===1,'first POST');await t.p.waitForFunction(()=>window.finalProbe.holds.length===1);assert.equal(await t.locked(),true);
   const receipt=(await t.receipts())[0];await t.p.clock.fastForward(90001);
   await wait(async()=>(await t.saved()).roles[0].lifeTasks[0].status==='failed','timeout recorded');assert.equal(await t.locked(),false);
   assert.deepEqual(await t.receipts(),[receipt]);assert.equal(await t.archiveCount(),0);
   await t.p.clock.runFor(1800);await wait(()=>t.posts.length===2,'independent role POST');await t.p.waitForFunction(()=>window.finalProbe.holds.length===2);assert.equal(await t.locked(),true);
   await t.release(0,mode==='body');await t.p.clock.runFor(50);assert.equal(await t.locked(),true,'old completion must not release new lock');assert.equal(await t.archiveCount(),0);
   await t.release(1);await wait(async()=>await t.archiveCount()===1,'new role archive');assert.equal(await t.locked(),false);assert.equal((await t.saved()).roles[0].events.length,0);assert.equal((await t.saved()).roles[1].lifeTasks[0].status,'completed');
   assert.equal((await t.receipts()).length,2);await t.p.reload();await t.p.locator('#app[data-storage-state=ready]').waitFor();await t.p.clock.runFor(1800);assert.equal(t.posts.length,2);
  });
  await run('claim save refusal consumes conservative receipt but dispatches nothing',{mode:'claim-save'},async t=>{
   await wait(async()=>await t.p.evaluate(()=>window.finalProbe.failures>0),'claim save refused');assert.equal(t.posts.length,0);assert.equal((await t.receipts()).length,1);assert.equal(await t.locked(),false);await t.p.clock.fastForward(180000);assert.equal(t.posts.length,0);assert.equal(await t.archiveCount(),0);
  });
  await run('pagehide before transport never dispatches and retains receipt',{mode:'unsent'},async t=>{
   await wait(async()=>(await t.receipts()).length===1,'unsent receipt');await wait(async()=>!await t.locked(),'unsent lock release');assert.equal(t.posts.length,0);assert.equal(await t.archiveCount(),0);
  });
  await run('pagehide cancels dispatched task and ignores late body',{mode:'body'},async t=>{
   await wait(()=>t.posts.length===1,'POST');await t.p.waitForFunction(()=>window.finalProbe.holds.length===1);const receipt=(await t.receipts())[0];
   await t.p.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));await wait(async()=>!await t.locked(),'pagehide lock release');await t.release(0);await t.p.clock.runFor(100);
   assert.deepEqual(await t.receipts(),[receipt]);assert.equal(await t.archiveCount(),0);await t.p.reload();await t.p.locator('#app[data-storage-state=ready]').waitFor();await t.p.clock.runFor(1800);assert.equal(t.posts.length,1);
  });
  await run('archive save refusal never confirms history or refunds quota',{mode:'body'},async t=>{
   await wait(()=>t.posts.length===1,'POST');await t.p.waitForFunction(()=>window.finalProbe.holds.length===1);await t.p.evaluate(()=>window.finalProbe.refuse=true);await t.release(0);
   await wait(async()=>(await t.saved()).roles[0].lifeTasks[0].status==='failed','archive failure');assert.equal(await t.archiveCount(),0);assert.equal(await t.locked(),false);assert.equal((await t.receipts()).length,1);await t.p.clock.fastForward(180000);assert.equal(t.posts.length,1);
  });
  await run('persisted version changes during two-tab contention; old response cannot archive',{mode:'body'},async t=>{
   await wait(()=>t.posts.length===1,'POST');await t.p.waitForFunction(()=>window.finalProbe.holds.length===1);
   const other=await t.ctx.newPage();await other.goto(url);await other.locator('#app[data-write-access=read-only]').waitFor();assert.equal(t.posts.length,1);
   const raw=await other.evaluate(key=>{const w=JSON.parse(localStorage.getItem(key));w.roles[0].name='合成另一版本';const raw=JSON.stringify(w);localStorage.setItem(key,raw);return raw;},key);
   await t.release(0);await wait(async()=>!await t.locked(),'stale owner releases life lock');assert.equal(await t.p.evaluate(key=>localStorage.getItem(key),key),raw);assert.equal(await t.archiveCount(),0);assert.equal((await t.receipts()).length,1);assert.equal(t.posts.length,1);
  });
  async function chat(t){await t.p.locator('[data-action=enter][data-id=final-role-0]').click();await t.p.locator('.dock [data-view=chat]').click();}
  async function send(t){await t.p.locator('#message-input').fill('合成收尾用户原话');await t.p.locator('#message-form .send-btn').click();await t.p.clock.fastForward(61000);await t.p.clock.runFor(1800);}
  await run('phone chat interleaves with life; changed sources reject old life without refund',{mode:'body'},async t=>{
   await wait(()=>t.posts.length===1,'life POST');await t.p.waitForFunction(()=>window.finalProbe.holds.length===1);await chat(t);await send(t);
   await wait(async()=>(await t.saved()).roles[0].chats.some(m=>m.speaker==='char'),'saved phone reply');assert.equal(t.posts.length,2);await t.release(0);
   await wait(async()=>!await t.locked(),'life source rejection');const r=(await t.saved()).roles[0];
   // Changed persisted sources forbid an old task from writing even its failure state.
   assert.equal(r.lifeTasks[0].status,'attempted');assert.equal(await t.archiveCount(),0);assert.equal(r.chats.filter(m=>m.speaker==='char').length,1);assert.equal((await t.receipts()).length,1);
  });
  await run('phone reply and explicit diary keep separate ownership and receipts',{mode:'diary'},async t=>{
   await t.p.locator('[data-action=enter][data-id=final-role-0]').click();await t.p.locator('[data-home-page="1"]').click();await t.p.getByRole('button',{name:'打开日记',exact:true}).click();await t.p.locator('[data-action=retrydiary][data-date="2026-11-05"]').click();
   await wait(()=>t.posts.length===1,'diary POST');await t.p.waitForFunction(()=>window.finalProbe.holds.length===1);await t.p.locator('[data-action=view][data-view=home]').first().click();await t.p.locator('.dock [data-view=chat]').click();await send(t);
   await wait(async()=>(await t.saved()).roles[0].chats.some(m=>m.speaker==='char'),'phone saved during diary');await t.release(0);await wait(async()=>(await t.saved()).roles[0].diaries.some(m=>m.speaker==='char'&&m.dateKey==='2026-11-05'),'diary saved');assert.equal(t.posts.length,2);assert.deepEqual(t.posts.map(p=>p.kind),['diary','chat']);
   await t.p.reload();await t.p.locator('#app[data-storage-state=ready]').waitFor();await t.p.clock.runFor(1800);assert.equal(t.posts.length,2);assert.equal((await t.saved()).roles[0].chats.filter(m=>m.speaker==='char').length,1);
  });
  await run('phone to full Scene to archive to phone retains original experience',{mode:'e2e'},async t=>{
   await chat(t);await t.p.locator('#message-input').fill('合成用户来到门前。');await t.p.locator('#message-form .send-btn').click();await t.p.locator('[data-action=offline-round]').click();assert.equal(t.posts.length,0);
   await t.p.clock.fastForward(61000);await t.p.clock.runFor(1800);await t.p.locator('#novel-form').waitFor();await wait(async()=>(await t.saved()).roles[0].scene?.opening?.status==='archived','Scene opening archive');
   const scene=(await t.saved()).roles[0].scene;assert.equal(t.posts.length,1);assert.equal(t.posts[0].kind,'scene');assert.equal(scene.messages.filter(m=>m.speaker==='char').length,1);
   await t.p.locator('[data-action=endnovel]').click();const card=t.p.locator('[data-meeting-id="'+scene.id+'"]');await card.waitFor();assert.ok(await card.evaluate(el=>el.getBoundingClientRect().height>=64));await card.click();await t.p.locator('[data-meeting-record="'+scene.id+'"]').waitFor();assert.ok((await t.p.locator('[data-meeting-record]').innerText()).includes('我带你进入合成房间'));assert.equal(t.posts.length,1);
   await t.p.locator('.back-btn').click();await t.p.locator('#message-input').fill('为什么把我留在这里？');await t.p.locator('#message-form .send-btn').click();await t.p.clock.fastForward(61000);await t.p.clock.runFor(1800);await wait(()=>t.posts.length===2,'phone continuity POST');assert.equal(t.posts[1].kind,'chat');assert.equal(t.posts[1].hasSceneAction,true);
   await wait(async()=>(await t.saved()).roles[0].chats.some(m=>m.speaker==='char'),'phone archived');await t.p.reload();await t.p.locator('#app[data-storage-state=ready]').waitFor();assert.equal((await t.saved()).roles[0].meetings[0].id,scene.id);assert.equal((await t.saved()).roles[0].meetings[0].messages.filter(m=>m.speaker==='char').length,1);assert.equal(t.posts.length,2);
  });
  await run('long chat reads old source receives reply keeps audio and resumes',{mode:'e2e',long:true},async t=>{
   await chat(t);assert.equal(await t.p.locator('.chat-conversation [data-msg-id]').count(),80);await t.p.locator('[data-action=loadchatolder]').evaluate(el=>el.click());
   await t.p.locator('button.bubble-quote').click();await t.p.locator('[data-msg-id=history-0]').waitFor();await t.p.waitForFunction(()=>document.querySelector('audio')?.readyState>=1);
   await t.p.evaluate(async()=>{const a=document.querySelector('audio');a.muted=true;a.currentTime=1.25;await a.play();window.finalAudio=a;});
   await send(t);await wait(async()=>(await t.saved()).roles[0].chats.filter(m=>m.text==='合成收尾手机回复。').length===1,'long chat reply');assert.equal(t.posts.length,1);
   assert.equal(await t.p.evaluate(()=>window.finalAudio===document.querySelector('audio')),true);assert.ok(await t.p.locator('audio').evaluate(a=>!a.paused&&a.currentTime>=1.25));assert.equal((await t.saved()).roles[0].chats.length,2002);
   await t.p.locator('[data-action=view][data-view=home]').first().click();await t.p.locator('.dock [data-view=chat]').click();await t.p.locator('[data-msg-id=history-0]').waitFor();assert.equal(t.posts.length,1);
  });
  assert.ok(results.length);const summary={label:process.env.TEST_LABEL||'offline',passed:results.length,posts:results.reduce((n,r)=>n+r.posts,0),results};
  if(process.env.EVIDENCE_FILE)fs.writeFileSync(process.env.EVIDENCE_FILE,JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
 }finally{clearTimeout(deadline);await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
