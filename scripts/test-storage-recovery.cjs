const {chromium,devices}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),{pathToFileURL}=require('node:url'),path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=process.cwd(),out=path.join(root,'artifacts/test-results/STORAGE-RECOVERY-01');fs.mkdirSync(out,{recursive:true});const url=process.env.TEST_URL||pathToFileURL(path.join(root,'public/Elsewhere_Phase1_Standalone.html')).href,label=process.env.TEST_LABEL||'offline',at=Date.parse('2026-11-04T22:00:00Z'),hash=s=>crypto.createHash('sha256').update(s??'<missing>').digest('hex');
const wait=async(fn,phase)=>{const until=Date.now()+8000;while(Date.now()<until){if(await fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('Timeout at '+phase);};
(async()=>{const {defaults,createRole,normalizeAndMigrateData}=await import(pathToFileURL(path.join(root,'src/core/defaults.ts'))),b=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})}),results=[],errors=[],contexts=[];let current;const deadline=setTimeout(()=>{console.error('Suite deadline; last completed:',results.at(-1)?.case);void b.close();process.exitCode=1;},180000);
function fixture(){const d=defaults(),r=createRole('合成守望者','','守望者','谨慎','虚构海岛');r.id='actor';r.chats=[{id:'near',speaker:'me',text:'我想可能马上就要到了，我还在船上。',at:at-300000},{id:'waiting',speaker:'char',text:'我已经到海岸边了，我就在这里等你，你慢着点上岸。',at:at-200000}];r.events=[];r.diaries=[];r.diaryTasks=[];r.meetings=[];r.lifeAt=at;r.lastDiaryCheckDay='2026-11-04';r.firstMessageState={status:'ready',updatedAt:at};r.chatTiming={version:1,focused:true,generation:0,pending:[],quietUntil:0};d.roles=[r];d.selected=r.id;d.settings={...d.settings,autonomousLife:false,mode:'api',endpoint:'https://mock.example.invalid/v1',model:'mock'};return normalizeAndMigrateData(d);}
async function setup({raw=JSON.stringify(fixture()),mode='',key=false,reply='看见你了。\n你站稳些，把手给我，这里礁石滑。',sceneEvent}={}){
 const c=await b.newContext({...devices['iPhone 13'],viewport:{width:390,height:844},timezoneId:'America/Los_Angeles'});contexts.push(c);const wire=[],timeline=[];let seedDocument=true,release;const gate=new Promise(r=>release=r);
 await c.addInitScript(()=>{window.__elsewhereStorageTrace=[];const get=Storage.prototype.getItem,set=Storage.prototype.setItem;let uncertain=false;window.__nativeSave=()=>get.call(localStorage,'elsewhere-v01');window.__storageDoc=crypto.randomUUID();Storage.prototype.getItem=function(k){if(k==='elsewhere-v01'){if(window.name==='read-error'||uncertain)throw Error('synthetic unavailable');if(window.name==='read-null')return null;}return get.call(this,k);};Storage.prototype.setItem=function(k,v){if(k!=='elsewhere-v01')return set.call(this,k,v);let scene=false;try{scene=JSON.parse(v)?.roles?.some(r=>r.scene);}catch{}if(window.name==='write-error'||scene&&window.name==='scene-write-fail'){window.__failedWrites=(window.__failedWrites||0)+1;throw Error('synthetic quota');}set.call(this,k,v);if(scene&&window.name==='scene-write-after')throw Error('synthetic error after commit');if(scene&&window.name==='scene-uncertain')uncertain=true;};});
 await c.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(req.isNavigationRequest()&&req.frame()===req.frame().page().mainFrame()&&seedDocument){seedDocument=false;return route.fulfill({contentType:'text/html',body:'<!doctype html><body><div id="app" data-storage-state="fixture">Isolated fixture bootstrap</div></body>'});}if(u.hostname==='mock.example.invalid'){if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'POST','access-control-allow-headers':'*'}});const sceneRequest=req.postDataJSON().messages[0].content.includes('\"sceneId\":\"');wire.push({kind:sceneRequest?'scene':'phone'});await gate;let content=reply;if(sceneEvent&&!sceneRequest){
   const messages=req.postDataJSON().messages;
   const line=messages[0].content.split('\n').find(s=>s.startsWith('{"requestId":')&&s.includes('"currentInputs"'));
   assert.ok(line,'the one phone request carries the semantic contract');
   const control=JSON.parse(line),inputId=control.currentInputs.at(-1),ref=control.sources.find(s=>s[0]===inputId);
   assert.equal(messages[ref[1]-1].role,'user','source index still addresses the actual user message');
   const event=sceneEvent(inputId,reply);
   content+='<elsewhere_scene_event>'+JSON.stringify({requestId:control.requestId,roleId:control.roleId,sceneId:null,event})+'</elsewhere_scene_event>';
  }return route.fulfill({json:{choices:[{message:{role:'assistant',content},finish_reason:'stop'}]},headers:{'access-control-allow-origin':'*'}}).catch(()=>{});}if(u.protocol==='file:'||u.hostname==='127.0.0.1')return route.continue();throw Error('unexpected remote request: '+u.origin);});
 const p=await c.newPage();p.setDefaultTimeout(8000);p.setDefaultNavigationTimeout(8000);p.on('pageerror',e=>errors.push(e.message));await p.clock.install({time:at-60000});await p.clock.pauseAt(at);await p.goto(url);
 // Seed exactly once, after a complete same-origin document; never reseed on null during reload.
 await p.evaluate(({raw,mode,key})=>{if(raw!==null)localStorage.setItem('elsewhere-v01',raw);if(key)localStorage.setItem('elsewhere-device-api-key-v1',JSON.stringify({endpoint:'https://mock.example.invalid/v1',key:'SYNTHETIC_MOCK_KEY'}));window.name=mode;},{raw,mode,key});
 const read=()=>p.evaluate(()=>window.__nativeSave()),state=()=>p.locator('#app').getAttribute('data-storage-state'),stored=async()=>JSON.parse(await read()),capture=async phase=>timeline.push({phase,doc:await p.evaluate(()=>window.__storageDoc),state:await state(),hash:hash(await read()),trace:await p.evaluate(()=>window.__elsewhereStorageTrace)});
 async function reload(){await capture('before reload');await p.reload();await wait(async()=>!!await state(),'bootstrap classification');await capture('after reload');}
 current={c,p,wire,timeline,raw,read,stored,state,capture,reload,release};await reload();return current;
}
async function done(name,t){results.push({case:name,posts:t.wire.length,timeline:t.timeline});fs.writeFileSync(path.join(out,label+'-progress.json'),JSON.stringify({results,errors},null,2));await t.c.close();}
async function chat(t){assert.equal(await t.state(),'ready');await t.p.locator('[data-action=enter]').filter({hasText:'合成守望者'}).click();await t.p.locator('.dock [data-view=chat]').click();}
async function openSavedScene(t,id){await t.p.locator('[data-action=enter]').filter({hasText:'合成守望者'}).click();await t.p.locator('.home-widget').click();await t.p.locator('#novel-input').waitFor();assert.equal(await t.p.locator('#novel-form').getAttribute('data-scene-id'),id);await t.capture('UI restored the persisted Scene');}
async function send(t,mode,inputs){
 await chat(t);
 await t.p.evaluate(mode=>window.name=mode,mode);
 for(const text of inputs){
  await t.p.locator('#message-input').fill(text);
  await t.p.locator('#message-form .send-btn').click();
  await t.p.clock.runFor(100);
 }
 return (await t.stored()).roles[0].chats.at(-1).id;
}
async function phone(t,inputs){
 const id=await send(t,'',inputs);
 await t.p.clock.fastForward(61000);
 await wait(()=>t.wire.length===1,'one phone API');
 assert.equal(t.wire[0].kind,'phone');
 t.release();
 await wait(async()=>(await t.stored()).roles[0].chats.some(m=>m.speaker==='char'&&m.replyTo===id),'phone reply saved');
 await t.p.clock.runFor(1800);
}
async function scene(t,mode='',holdHash=false,inputs=['我看见你了！','守望者！']){
 await send(t,mode,inputs);
 await t.p.locator('[data-action=offline-round]').click();
 if(holdHash)await t.p.evaluate(()=>{
  const digest=crypto.subtle.digest.bind(crypto.subtle);
  crypto.subtle.digest=(...args)=>new Promise(resolve=>{window.__releaseDigest=()=>digest(...args).then(resolve);});
 });
 await t.p.clock.fastForward(61000);
}
async function complete(t){
 await wait(()=>t.wire.length===1,'one scene API');
 assert.equal(t.wire[0].kind,'scene');
 t.release();
 await wait(async()=>(await t.stored()).roles[0].scene?.opening?.status==='archived','scene reply archived');
}
async function retryRound(t){
 await chat(t);
 await t.p.locator('.chat-error-notice summary').click();
 await t.p.locator('[data-action=retrychatbatch]').click();
 await t.p.clock.runFor(1000);
}

try{
 let t=await setup({raw:null});assert.equal(await t.state(),'empty-unverified');assert.equal(await t.read(),null);assert.equal(t.wire.length,0);await t.p.locator('[data-storage-create]').click();await wait(async()=>await t.state()==='ready','explicit initialization');assert.ok((await t.stored()).roles.length);await done('empty context never auto-writes; explicit first initialization persists',t);
 t=await setup({raw:null});await t.p.evaluate(()=>window.name='write-error');await t.p.locator('[data-storage-create]').click();await wait(async()=>await t.state()==='write-failed','first save definitely failed');assert.equal(await t.read(),null);await t.p.evaluate(()=>window.name='');await t.reload();assert.equal(await t.state(),'empty-unverified','definite failed initialization must not permanently lock a new user out');await t.p.locator('[data-storage-create]').click();await wait(async()=>await t.state()==='ready','retry first initialization');assert.ok(await t.read());await done('a confirmed first-write failure releases only its own intent and remains retryable',t);
 for(const raw of ['{broken','null','{"roles":{},"settings":{}}']){t=await setup({raw});assert.equal(await t.state(),'invalid');assert.equal(await t.read(),raw);await t.p.clock.runFor(3000);assert.equal(await t.read(),raw);assert.equal(t.wire.length,0);await done('invalid existing bytes retained: '+hash(raw).slice(0,8),t);}
 t=await setup({raw:null});await t.p.evaluate(()=>new Promise((ok,bad)=>{const q=indexedDB.open('elsewhere-save-presence-v1');q.onsuccess=()=>{const db=q.result,tx=db.transaction('presence','readwrite');tx.objectStore('presence').put(false,'known');tx.oncomplete=()=>{db.close();ok()};tx.onabort=()=>bad(Error('fixture marker'));};}));await t.reload();assert.equal(await t.state(),'unavailable');assert.equal(await t.read(),null);assert.equal(await t.p.locator('[data-storage-create]').count(),0);await done('invalid presence marker blocks initialization without resetting it',t);
 {const d=fixture();d.customFonts=[{id:'SYNTHETIC_OLD_FONT',name:'保留的旧字体字段'}];const raw=JSON.stringify(d);t=await setup({raw});assert.equal(await t.state(),'load-failed');assert.equal(await t.read(),raw);assert.equal(t.wire.length,0);await done('normalization that would discard stored appearance entries is blocked before any save',t);}
 t=await setup({mode:'read-error'});assert.equal(await t.state(),'unavailable');assert.equal(await t.read(),t.raw);await t.p.evaluate(()=>window.name='');await t.reload();assert.equal(await t.state(),'ready');await done('read failure preserves existing bytes; explicit reread loads original',t);
 t=await setup({mode:'write-error',key:true});assert.equal(await t.state(),'load-failed');await t.p.clock.runFor(3000);assert.equal(await t.read(),t.raw);assert.equal(t.wire.length,0);await done('startup write failure stops recovery pumps and retains existing bytes',t);
 t=await setup();const before=await t.read();await t.p.evaluate(()=>window.name='read-null');await t.reload();assert.equal(await t.state(),'missing-known');assert.equal(await t.read(),before);assert.equal(await t.p.locator('[data-storage-create]').count(),0);assert.equal(t.wire.length,0);await t.p.evaluate(()=>window.name='');await t.reload();assert.equal(await t.state(),'ready');await done('known save with abnormal null is protected, never classified as new',t);
 t=await setup();await chat(t);const saved=await t.read();await t.p.evaluate(()=>window.name='write-error');await t.p.locator('#message-input').fill('合成待发送草稿');await t.p.locator('#message-form .send-btn').click();assert.equal(await t.read(),saved);assert.equal(await t.p.locator('#message-input').inputValue(),'合成待发送草稿');assert.equal(t.wire.length,0);await done('write failure retains original bytes and draft; no API',t);
 t=await setup();const p2=await t.c.newPage();await p2.goto(url);await wait(async()=>await p2.locator('#app').getAttribute('data-storage-state')==='ready','second page loads');await p2.evaluate(()=>{const d=JSON.parse(localStorage.getItem('elsewhere-v01'));d.user.notes='SYNTHETIC_OTHER_PAGE_CHANGE';localStorage.setItem('elsewhere-v01',JSON.stringify(d));});await chat(t);await t.p.locator('#message-input').fill('旧页面消息');await t.p.locator('#message-form .send-btn').click();assert.equal((await t.stored()).user.notes,'SYNTHETIC_OTHER_PAGE_CHANGE');assert.ok(!(await t.stored()).roles[0].chats.some(m=>m.text==='旧页面消息'));assert.equal(t.wire.length,0);await done('another page update cannot be overwritten by a stale app session',t);
 t=await setup();for(let i=0;i<30;i++){await t.reload();assert.equal(await t.state(),'ready');}await t.p.evaluate(()=>{for(let i=0;i<10;i++){window.dispatchEvent(new Event('pageshow'));document.dispatchEvent(new Event('visibilitychange'));}});await t.p.clock.runFor(2000);assert.equal(t.wire.length,0);await done('30 refreshes and repeated page lifecycle events preserve save without fixture reseeding or API',t);
 for(const mode of ['', 'scene-write-after']){
  t=await setup({key:true});await scene(t,mode);await complete(t);
  await t.p.locator('#novel-input').waitFor();const saved=(await t.stored()).roles[0];
  await t.p.evaluate(()=>window.name='');for(let i=0;i<10;i++)await t.reload();
  await openSavedScene(t,saved.scene.id);assert.deepEqual((await t.stored()).roles[0].scene,saved.scene);assert.equal(t.wire.length,1);
  await done(mode?'Scene committed before exception is confirmed, not rolled back over disk':'saved Scene restores with one identity and one API',t);
 }
 t=await setup({key:true});await scene(t,'scene-write-fail');
 await wait(async()=>await t.p.evaluate(()=>window.__failedWrites>0)&&(await t.stored()).roles[0].chatTiming.blocked==='failed','real failed Scene save plus durable unconsumed round');
 let r=(await t.stored()).roles[0];assert.equal(r.scene,null);assert.equal(r.chatTiming.pending.length,2);assert.equal(t.wire.length,0);assert.ok(!r.events.some(e=>e.sceneChange));
 await t.capture('Scene failed but original round persisted');await t.p.evaluate(()=>window.name='');await t.reload();
 assert.equal((await t.stored()).roles[0].scene,null);assert.equal(t.wire.length,0);
 await retryRound(t);await complete(t);assert.deepEqual((await t.stored()).roles[0].chats,r.chats);
 await done('unsaved Scene never claimed successful; durable round continues only when requested',t);
 t=await setup({key:true});await scene(t,'',true);
 await wait(async()=>await t.p.evaluate(()=>typeof window.__releaseDigest==='function'),'Scene preflight suspended after durable round claim');
 r=(await t.stored()).roles[0];assert.equal(r.scene,null);assert.ok(r.chatTiming.inFlight?.entry);assert.equal(t.wire.length,0);
 await t.capture('reload during preflight, before POST');await t.reload();
 assert.equal((await t.stored()).roles[0].scene,null);assert.equal(t.wire.length,0);
 await retryRound(t);await complete(t);assert.deepEqual((await t.stored()).roles[0].chats,r.chats);
 await done('refresh during unfinished preflight preserves the known unsent round',t);
 t=await setup({key:true});await scene(t,'scene-uncertain');
 await wait(async()=>!!(await t.stored()).roles[0].scene,'actual commit under readback failure');
 await wait(async()=>await t.p.evaluate(()=>window.__elsewhereStorageTrace.some(x=>x.phase==='write-uncertain')),'unknown outcome diagnosed');
 const uncertain=(await t.stored()).roles[0],id=uncertain.scene.id;assert.equal(uncertain.scene.opening.status,'unsent');assert.equal(t.wire.length,0);
 await t.capture('actual Scene persisted; write outcome unknown to old page');await t.p.evaluate(()=>window.name='');await t.reload();
 assert.equal((await t.stored()).roles[0].scene.id,id);await openSavedScene(t,id);assert.equal(t.wire.length,0);
 await t.p.locator('[data-action=resume-scene-opening]').click();await complete(t);
 assert.deepEqual((await t.stored()).roles[0].chats,uncertain.chats);
 await done('uncertain commit freezes rollback writes; reload reads actual persisted Scene before explicit continue',t);
 const approachReply='太好了，我也看见你了。你站在那别动，我这就朝你走过去。';
 const sighting=['我看见你了！'];
 const approach=fixture();approach.roles[0].chats=[];
 for(const chooseOffline of [false,true]){
  t=await setup({raw:JSON.stringify(approach),key:true,reply:approachReply});
  if(chooseOffline){await scene(t,'',false,sighting);await complete(t);await t.p.locator('#novel-input').waitFor();}
  else await phone(t,sighting);
  const saved=(await t.stored()).roles[0];
  assert.equal(t.wire.length,1);
  if(chooseOffline){
   assert.equal(saved.scene.opening.entry,'scheduled');
   assert.deepEqual(saved.chats.map(m=>m.text),sighting);
   assert.deepEqual(saved.scene.messages.filter(m=>m.sourceMessageId).map(m=>m.sourceMessageId),saved.chats.map(m=>m.id));
   assert.equal(saved.scene.messages.at(-1).text,approachReply);
   assert.doesNotMatch(saved.scene.messages[0].text,/开始当面交谈|握手|拥抱/);
   await t.reload();await openSavedScene(t,saved.scene.id);
   assert.deepEqual((await t.stored()).roles[0].chats,saved.chats);
  }else{
   assert.equal(saved.scene,null);
   assert.deepEqual(saved.chats.map(m=>m.text),[...sighting,approachReply]);
  }
  await done(chooseOffline?'reported approach is bridged only after player choice':'reported approach does not itself switch UI',t);
 }
 const separated=fixture();separated.roles[0].chats=[{id:'aboard',speaker:'me',text:'我还在船上，船没靠岸。',at:at-60000}];
 t=await setup({raw:JSON.stringify(separated),key:true,reply:approachReply});await phone(t,sighting);
 assert.equal((await t.stored()).roles[0].scene,null);assert.equal(await t.p.locator('#novel-input').count(),0);assert.equal(t.wire.length,1);
 await done('reported approach stays on the phone while the user is still aboard',t);
 for(const [name,world,user,reply,userSignal,actorSignal,state] of [
  ['airport Spanish','aeropuerto','Ya crucé aduanas. Soy quien levanta el cartel amarillo.','Distingo el cartel; salgo de la fila y voy hacia ti.','sighting','approaching','approaching'],
  ['café Japanese','喫茶店','向かいの椅子に座って、君の注文票を手に取った。','その伝票は僕のだよ。君の正面でカップを置く。','nearby','interacting','together'],
  ['palace English','royal audience chamber','I put my petition on the cushion at your elbow.','I take up the petition and address you from the dais.','nearby','interacting','together'],
 ]){
  const synthetic=fixture();synthetic.roles[0].place=world;synthetic.roles[0].chats=[];
  t=await setup({raw:JSON.stringify(synthetic),key:true,reply,sceneEvent:id=>({
   state,context:'physical-now',user:{id,quote:user,signal:userSignal},actor:{id:'@reply',quote:reply,signal:actorSignal},
  })});
  await phone(t,[user]);
  const saved=(await t.stored()).roles[0];assert.equal(saved.scene,null);assert.deepEqual(saved.chats.map(m=>m.text),[user,reply]);
  await t.reload();assert.equal((await t.stored()).roles[0].scene,null);assert.equal(t.wire.length,1);
  await done('old model '+name+' metadata cannot create a Scene, including after reload',t);
 }
 const reserved=fixture(),reservedRole=reserved.roles[0];
 reservedRole.chats=[{id:'offer',speaker:'me',text:'现在在南门见面吧。',at:at-180000},{id:'accept',speaker:'char',text:'好，现在在南门见。',at:at-179000}];
 reservedRole.meetingPlan={interpretation:'scene-state-v1',status:'confirmed',where:'南门',timeText:'现在',scheduledAt:at-179000,expiresAt:at+3600000,proposedBy:'me',acceptedBy:['me','char'],sources:reservedRole.chats.map(({id,at,text})=>({id,at,text,revisionCount:0}))};
 t=await setup({raw:JSON.stringify(reserved),key:true,reply:'我还没到。今天先取消吧。',sceneEvent:()=>({state:'remote',reason:'cancelled'})});
 await phone(t,['我到了南门。']);assert.equal((await t.stored()).roles[0].scene,null);
 assert.equal(await t.p.locator('#novel-input').count(),0);assert.equal(t.wire.length,1);
 await done('existing appointment never bypasses player choice',t);
 const a=await setup(),b2=await setup({raw:null});assert.equal(await b2.state(),'empty-unverified');assert.ok(await a.read());assert.equal(await b2.read(),null);await done('separate browser contexts are genuinely isolated, not evidence of data loss',b2);await a.c.close();
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,label+'-browser.json'),JSON.stringify({url,results,errors},null,2));console.log(JSON.stringify({label,passed:results.length,posts:results.reduce((n,r)=>n+r.posts,0),errors}));
}catch(e){if(current&&!current.p.isClosed()){await current.capture('failure');fs.writeFileSync(path.join(out,label+'-failure.json'),JSON.stringify({message:e.message,timeline:current.timeline,posts:current.wire.length},null,2));}throw e;}finally{clearTimeout(deadline);await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
