const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium,devices}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

const url=process.env.TEST_URL||pathToFileURL(process.cwd()+'/public/Elsewhere_Phase1_Standalone.html').href;
const endpoint='https://voice-fixture.invalid/v1',saveKey='elsewhere-v01',mediaDB='elsewhere-media-v1';
const at=Date.parse('2026-11-06T22:00:00Z');
const away=new URL('voice-fixture-away',url).href;
const audio=Buffer.alloc(8044,128);
audio.write('RIFF',0);audio.writeUInt32LE(audio.length-8,4);audio.write('WAVEfmt ',8);
audio.writeUInt32LE(16,16);audio.writeUInt16LE(1,20);audio.writeUInt16LE(1,22);
audio.writeUInt32LE(8000,24);audio.writeUInt32LE(8000,28);audio.writeUInt16LE(1,32);
audio.writeUInt16LE(8,34);audio.write('data',36);audio.writeUInt32LE(audio.length-44,40);
audio.fill(150,4022);
const first=[...audio.subarray(0,4022)],last=[...audio.subarray(4022)];
const wait=async (check,label)=>{
 const deadline=Date.now()+6500;
 do{if(await check())return;await new Promise(resolve=>setTimeout(resolve,20));}while(Date.now()<deadline);
 throw Error('Timeout: '+label);
};

async function main(){
 const {defaults,createRole}=await import('../src/core/defaults.ts');
 const browser=await chromium.launch({ignoreDefaultArgs:['--disable-back-forward-cache'],...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 const deadline=setTimeout(()=>{console.error('Voice safety suite exceeded its deadline');process.exitCode=1;void browser.close();},150000);
 async function run(label,test,{model=false,postsExpected=0}={}){
  if(process.env.TEST_CASE&&!label.includes(process.env.TEST_CASE))return;
  const context=await browser.newContext({...devices['iPhone 13'],ignoreHTTPSErrors:true,serviceWorkers:'block',acceptDownloads:true,timezoneId:'America/Los_Angeles'});
  const p=await context.newPage();p.setDefaultTimeout(6500);p.setDefaultNavigationTimeout(6500);
  const posts=[],errors=[];p.on('pageerror',e=>errors.push(e.message));
  try{
   let seed=true;
   await context.route('**/*',async route=>{
    const req=route.request(),dest=req.url();
    if(req.isNavigationRequest()&&req.frame()===p.mainFrame()&&seed){
     seed=false;return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated fixture</title>'});
    }
    if(dest===endpoint+'/chat/completions'){
     const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST','access-control-allow-headers':'*'};
     if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
     assert.equal(req.method(),'POST');posts.push(req.postDataJSON());
     return route.fulfill({headers,json:{choices:[{finish_reason:'stop',message:{role:'assistant',content:'合成回复'}}]}}).catch(()=>{});
    }
    if(dest===away&&req.method()==='GET')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Away fixture</title>'});
    if(req.method()==='GET'&&(new URL(dest).protocol==='file:'||new URL(dest).origin===new URL(url).origin))return route.continue();
    return route.abort();
   });
   await context.addInitScript(({saveKey,mediaDB})=>{
    const probe=window.voiceProbe={id:crypto.randomUUID(),requests:[],recorders:[],streams:[],shows:[],adds:[],held:false};
    addEventListener('pageshow',e=>{probe.shows.push(e.persisted);probe.pageHiding=false;});
    if(!navigator.mediaDevices)Object.defineProperty(navigator,'mediaDevices',{value:{}});
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:options=>{
     if(probe.failure==='permission-throw')throw Error('fixture getUserMedia threw');
     if(!options.audio||options.video)throw Error('fixture expects audio only');
     return new Promise((resolve,reject)=>probe.requests.push({resolve,reject}));
    }});
    probe.grant=i=>{
     const tracks=Array.from({length:2},()=>({readyState:'live',stops:0,stop(){this.stops++;this.readyState='ended';if(probe.pageHiding)sessionStorage.setItem('voice-fixture-pagehide',JSON.stringify(probe.streams.flat().map(t=>t.readyState)));}}));
     const stream={getTracks:()=>tracks};probe.streams[i]=tracks;probe.requests[i].resolve(stream);
    };
    probe.reject=i=>probe.requests[i].reject(new DOMException('fixture denied','NotAllowedError'));
    window.MediaRecorder=class {
     static isTypeSupported(){return true;}
     constructor(stream){
      if(probe.failure==='constructor')throw Error('fixture constructor failed');
      this.stream=stream;this.mimeType='audio/wav';this.state='inactive';this.starts=0;this.stops=0;
      probe.recorders.push(this);
     }
     start(){
      if(probe.failure==='start')throw Error('fixture start failed');
      this.starts++;this.state='recording';
     }
     stop(){
      if(this.state==='inactive')throw Error('fixture duplicate stop');
      this.stops++;this.state='inactive';
      if(probe.failure==='stop')throw Error('fixture stop failed');
     }
     emit(bytes){this.ondataavailable?.({data:new Blob([Uint8Array.from(bytes)],{type:this.mimeType})});}
     finish(bytes){if(bytes)this.emit(bytes);this.state='inactive';this.onstop?.();}
     error(){this.onerror?.(new Event('error'));}
    };
    const add=IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add=function(blob,id){
     if(this.transaction.db.name!==mediaDB||!blob?.type?.startsWith('audio/'))return add.call(this,blob,id);
     if(probe.failure==='media')throw Error('fixture media failure');
     const request=add.call(this,blob,id);
     const tx=this.transaction;
     tx.addEventListener('complete',()=>probe.adds.push(id));
     if(probe.holdMedia){
      const store=this;
      const keepAlive=()=>{
       const tick=store.get('voice-fixture-keepalive');
       tick.onsuccess=()=>{probe.held=true;if(probe.holdMedia)keepAlive();};
      };
      keepAlive();
     }
     return request;
    };
    const set=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){
     if(key===saveKey&&probe.failure==='main'&&JSON.parse(value).roles.some(r=>r.chats.some(m=>m.kind==='voice'&&!probe.existing?.includes(m.mediaId)))){
      probe.mainFailures=(probe.mainFailures||0)+1;
      throw new DOMException('fixture main write failure','QuotaExceededError');
     }
     return set.call(this,key,value);
    };
    addEventListener('pagehide',()=>{
     probe.pageHiding=true;
     sessionStorage.setItem('voice-fixture-pagehide',JSON.stringify(probe.streams.flat().map(t=>t.readyState)));
    });
   },{saveKey,mediaDB});
   const world=defaults();
   world.roles=Array.from({length:2},(_,i)=>{
    const r=createRole('合成语音角色'+i,'','观察员','谨慎','虚构群岛');
    r.id='voice-fixture-'+i;r.chats=[];r.diaries=[];r.events=[];r.meetings=[];r.lifeAt=at;r.lastDiaryCheckDay='2026-11-06';
    r.firstMessageState={status:'ready',updatedAt:at};r.chatTiming={version:1,focused:true,generation:0,pending:[],quietUntil:0};
    return r;
   });
   world.selected=world.roles[0].id;
   world.settings={...world.settings,mode:'api',endpoint,model:'synthetic',autonomousLife:false};
   await p.clock.install({time:at-60000});await p.clock.pauseAt(at);
   await p.goto(url);
   await p.evaluate(({world,endpoint,model,saveKey})=>{
    localStorage.setItem(saveKey,JSON.stringify(world));
    if(model)localStorage.setItem('elsewhere-device-api-key-v1',JSON.stringify({endpoint,key:'SYNTHETIC_MOCK_ONLY'}));
   },{world,endpoint,model,saveKey});
   const ready=()=>p.locator('#app[data-storage-state=ready]').waitFor();
   const reload=async()=>{await p.reload();await ready();};
   const read=()=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)),saveKey);
   const messages=async(i=0)=>(await read()).roles[i].chats.filter(m=>m.kind==='voice');
   const state=()=>p.evaluate(()=>({
    requests:voiceProbe.requests.length,recorders:voiceProbe.recorders.map(r=>({starts:r.starts,stops:r.stops,state:r.state})),
    tracks:voiceProbe.streams.map(ts=>ts.map(t=>[t.readyState,t.stops])),
    adds:voiceProbe.adds.slice(),held:voiceProbe.held,mainFailures:voiceProbe.mainFailures||0,
   }));
   const media=async id=>Buffer.from(await p.evaluate(({id,mediaDB})=>new Promise((resolve,reject)=>{
    const open=indexedDB.open(mediaDB);
    open.onerror=()=>reject(open.error);
    open.onsuccess=()=>{
     const db=open.result,tx=db.transaction('blobs'),get=tx.objectStore('blobs').get(id);
     get.onsuccess=()=>get.result?.arrayBuffer().then(buf=>resolve([...new Uint8Array(buf)]))??reject(Error('missing fixture media'));
     tx.oncomplete=()=>db.close();
    };
   }),{id,mediaDB}));
   const enter=async(i=0)=>{await p.locator('[data-action=enter][data-id=voice-fixture-'+i+']').click();await p.locator('.dock [data-view=chat]').click();};
   const landing=async()=>{await p.locator('.chat-back').click();await p.getByRole('button',{name:'切换角色'}).click();};
   const panel=()=>p.getByRole('region',{name:'发送语音'});
   const open=async()=>{await p.locator('.compose-plus').click();await p.locator('[data-panel=voice]').click();await panel().waitFor();};
   const close=()=>panel().getByRole('button',{name:'关闭聊天工具'}).click();
   const toggle=()=>p.locator('[data-action=recordtoggle]');
   const begin=()=>toggle().click();
   const caption=()=>p.locator('#voice-caption');
   const fault=name=>p.evaluate(name=>voiceProbe.failure=name,name);
   const grant=i=>p.evaluate(i=>voiceProbe.grant(i),i);
   const active=async(i=0)=>wait(async()=>(await state()).recorders[i]?.state==='recording','active recorder');
   const stop=async()=>{await toggle().filter({hasText:'结束并发送'}).click();};
   const emit=(i,bytes)=>p.evaluate(({i,bytes})=>voiceProbe.recorders[i].emit(bytes),{i,bytes});
   const finish=(i,bytes)=>p.evaluate(({i,bytes})=>voiceProbe.recorders[i].finish(bytes),{i,bytes});
   const ended=async(i=0)=>assert.deepEqual((await state()).tracks[i],[['ended',1],['ended',1]]);
   const empty=async()=>{assert.deepEqual(await messages(),[]);assert.deepEqual(await messages(1),[]);};
   const recorded=async(i=0)=>{await wait(async()=>(await messages(i)).length===1,'voice history commit');return (await messages(i))[0];};
   const download=async()=>{
    const button=p.getByRole('button',{name:'下载未确认的录音'});
    await button.waitFor();
    const transfer=p.waitForEvent('download');
    await button.click();
    const stream=await (await transfer).createReadStream();
    const chunks=[];for await(const chunk of stream)chunks.push(chunk);
    assert.deepEqual(Buffer.concat(chunks),audio);
   };
   const playback=async id=>{
    const player=p.locator('audio[data-media-id="'+id+'"]');
    await player.waitFor();
    await p.waitForFunction(id=>{const a=document.querySelector('audio[data-media-id="'+id+'"]');return a?.readyState>=2&&a.duration>0;},id);
    assert.equal(await player.evaluate(async a=>{a.muted=true;await a.play();const playing=!a.paused;a.pause();return playing;}),true);
   };
   const start=async()=>{await begin();await grant(0);await active();};
   const hide=()=>p.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
   const show=async()=>{
    await p.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
    await p.locator('#app[data-write-access=writer]').waitFor();
   };
   await reload();await enter();await open();
   await test({p,context,world,posts,read,messages,state,media,enter,landing,panel,open,close,toggle,begin,caption,fault,grant,active,stop,emit,finish,ended,empty,recorded,download,playback,start,hide,show,reload});
   assert.deepEqual(errors,[],'uncaught browser errors');assert.equal(posts.length,postsExpected);
   console.log('PASS '+label+' | POST='+posts.length);
  }finally{await context.close();}
 }
 try{
  await run('late approval after closing the voice panel stops all tracks without starting',async t=>{
   await t.begin();await t.close();await t.grant(0);
   const result=await t.state();
   assert.equal(result.recorders.length,0,'stale permission must never construct a recorder');
   await t.ended();await t.empty();assert.deepEqual(result.adds,[]);
  });
  await run('double click starts one request and late older grant cannot touch the new recording',async t=>{
   await t.toggle().evaluate(el=>{el.click();el.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
   assert.equal((await t.state()).requests,1);
   await t.close();await t.open();await t.begin();await t.grant(1);await t.active();
   await t.grant(0);await t.ended(0);
   assert.deepEqual((await t.state()).tracks[1],[['live',0],['live',0]]);
   assert.equal((await t.state()).recorders.length,1);
   await t.p.locator('[data-action=recordcancel]').evaluate(el=>{el.click();el.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
   await t.ended(1);assert.equal((await t.state()).recorders[0].stops,1);await t.empty();
  });
  await run('cancelling a waiting request suppresses its later rejection and permits a fresh start',async t=>{
   await t.begin();await t.p.locator('[data-action=recordcancel]').click();await t.begin();
   await t.p.evaluate(()=>voiceProbe.reject(0));
   assert.equal(await t.p.getByText('无法开始录音',{exact:false}).count(),0);
   await t.grant(1);await t.active();await t.close();await t.ended(1);await t.empty();
  });
  await run('permission denial displays a message and a fresh request can record',async t=>{
   await t.begin();await t.p.evaluate(()=>voiceProbe.reject(0));
   await t.p.getByText('无法开始录音',{exact:false}).waitFor();
   await t.begin();await t.grant(1);await t.active();await t.close();await t.ended(1);await t.empty();
  });
  await run('late approval is discarded after switching roles',async t=>{
   await t.begin();await t.landing();await t.enter(1);await t.open();await t.grant(0);
   await t.ended();assert.equal((await t.state()).recorders.length,0);await t.empty();
  });
  await run('timed Scene cancels pending permission and sends only the existing Scene POST',async t=>{
   await t.close();
   await t.p.locator('#message-input').fill('合成场景发言');await t.p.locator('#message-form .send-btn').click();
   await t.p.locator('[data-action=offline-round]').click();
   await t.open();await t.begin();
   await t.p.clock.fastForward(62000);
   await t.p.locator('#novel-form').waitFor();
   await t.grant(0);await t.ended();
   assert.equal((await t.state()).recorders.length,0);
   await wait(()=>t.posts.length===1,'existing Scene request');await t.empty();
  },{model:true,postsExpected:1});
  await run('backgrounding cancels active recording and cannot send its late events',async t=>{
   await t.start();await t.emit(0,first);
   await t.p.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,value:true});
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));
   });
   await t.ended();await t.finish(0,last);await t.empty();
   assert.equal((await t.state()).recorders[0].stops,1);
  });
  await run('switching roles during capture stops tracks and never saves',async t=>{
   await t.start();await t.emit(0,first);await t.landing();await t.enter(1);
   await t.ended();await t.finish(0,last);await t.empty();
  });
  await run('unsupported recorder and thrown permission call show the upload fallback',async t=>{
   await t.p.evaluate(()=>{window.fixtureRecorder=window.MediaRecorder;window.MediaRecorder=undefined;});
   await t.begin();await t.p.getByText('浏览器不支持直接录音',{exact:false}).waitFor();
   assert.equal((await t.state()).requests,0);await t.p.locator('#audio-upload').waitFor({state:'attached'});
   await t.p.evaluate(()=>window.MediaRecorder=window.fixtureRecorder);await t.fault('permission-throw');
   await t.begin();await t.p.getByText('无法开始录音',{exact:false}).waitFor();await t.empty();
  });
  for(const failure of ['constructor','start','stop','recorder-error','unexpected-stop','empty','oversize']){
   await run(failure+' releases every track and writes no attachment',async t=>{
    if(failure==='constructor'||failure==='start'){
     await t.fault(failure);await t.begin();await t.grant(0);
    }else{
     await t.start();
     if(failure==='stop'){await t.fault(failure);await t.stop();}
     if(failure==='recorder-error')await t.p.evaluate(()=>voiceProbe.recorders[0].error());
     if(failure==='unexpected-stop')await t.finish(0,first);
     if(failure==='empty'){await t.stop();await t.finish(0);}
     if(failure==='oversize')await t.p.evaluate(()=>voiceProbe.recorders[0].ondataavailable({data:new Blob([new Uint8Array(8*1024*1024+1)],{type:'audio/wav'})}));
    }
    await t.ended();await t.empty();assert.deepEqual((await t.state()).adds,[]);
    await t.toggle().filter({hasText:'开始录音'}).waitFor();
   });
  }
  await run('explicit stop sends one complete recording with the final caption and plays after reload',async t=>{
   await t.caption().fill('开始时的说明');await t.start();await t.emit(0,first);
   await t.caption().fill('合成语音说明');
   await t.toggle().evaluate(el=>{el.click();el.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
   await t.empty();assert.equal((await t.state()).recorders[0].stops,1);
   await t.finish(0,last);
   const m=await t.recorded();await t.ended();
   assert.equal(m.caption,'合成语音说明');assert.ok(m.text.includes('用户提供的文字内容：合成语音说明'));
   assert.deepEqual(await t.media(m.mediaId),audio);
   await t.finish(0,last);assert.equal((await t.messages()).length,1);
   await t.playback(m.mediaId);await t.reload();await t.enter();await t.playback(m.mediaId);
   assert.equal((await t.read()).roles[0].chatTiming.pending[0],m.id);
  });
  await run('explicit stop survives role switch and the delayed final block cannot affect the newer recorder',async t=>{
   await t.caption().fill('原角色说明');await t.start();await t.emit(0,first);await t.stop();
   await t.landing();await t.enter(1);await t.open();
   await t.caption().fill('新角色说明');await t.begin();await t.grant(1);await t.active(1);
   await t.empty();await t.finish(0,last);const original=await t.recorded();
   await t.ended(0);assert.deepEqual(await t.media(original.mediaId),audio);assert.equal(original.caption,'原角色说明');
   assert.deepEqual(await t.messages(1),[]);assert.equal(await t.caption().inputValue(),'新角色说明');
   assert.deepEqual((await t.state()).tracks[1],[['live',0],['live',0]]);
   await t.p.locator('[data-action=recordcancel]').click();await t.ended(1);
  });
  await run('pagehide before the final chunk releases tracks and retains complete audio for download only',async t=>{
   await t.start();await t.emit(0,first);await t.stop();await t.hide();
   await t.ended();await t.show();
   await t.p.getByText('浏览器尚未交付录音结尾',{exact:false}).waitFor();
   await t.finish(0,last);await t.download();await t.empty();assert.deepEqual((await t.state()).adds,[]);
  });
  await run('pagehide during media staging prevents main commit even after writer returns',async t=>{
   await t.start();await t.emit(0,first);await t.stop();
   await t.p.evaluate(()=>voiceProbe.holdMedia=true);await t.finish(0,last);
   await wait(async()=>(await t.state()).held,'IDB staging held');await t.ended();
   await t.hide();await t.show();
   await t.download();await t.empty();
   await t.p.getByRole('button',{name:'移除恢复项'}).click();
   await t.p.evaluate(()=>voiceProbe.holdMedia=false);
   await wait(async()=>(await t.state()).adds.length===1,'detached media transaction committed');
   const [staged]=(await t.state()).adds;assert.deepEqual(await t.media(staged),audio);
   assert.equal(await t.p.getByRole('button',{name:'下载未确认的录音'}).count(),0);
   await t.empty();
  });
  await run('a stale main store after media staging cannot be overwritten',async t=>{
   await t.start();await t.emit(0,first);await t.stop();
   await t.p.evaluate(()=>voiceProbe.holdMedia=true);await t.finish(0,last);
   await wait(async()=>(await t.state()).held,'IDB staging held before stale save');
   await t.p.evaluate(key=>{
    const newer=JSON.parse(localStorage.getItem(key));newer.user.name='合成的新存档';
    localStorage.setItem(key,JSON.stringify(newer));voiceProbe.holdMedia=false;
   },saveKey);
   await t.ended();await t.download();await t.empty();
   assert.equal((await t.read()).user.name,'合成的新存档');
   const [staged]=(await t.state()).adds;assert.deepEqual(await t.media(staged),audio);
  });
  await run('media write failure retains complete audio without a history commit',async t=>{
   await t.start();await t.emit(0,first);await t.stop();await t.fault('media');await t.finish(0,last);
   await t.ended();await t.download();await t.empty();assert.deepEqual((await t.state()).adds,[]);
  });
  await run('main write failure preserves staged and previously sent audio without resending',async t=>{
   const upload={name:'fixture.wav',mimeType:'audio/wav',buffer:audio};
   await t.p.locator('#audio-upload').setInputFiles(upload);
   const prior=await t.recorded();await t.open();
   await t.p.evaluate(id=>voiceProbe.existing=[id],prior.mediaId);
   await t.start();await t.emit(0,first);await t.stop();await t.fault('main');await t.finish(0,last);
   await t.ended();await t.download();
   const result=await t.state(),staged=result.adds[1];
   assert.equal(result.mainFailures,1);assert.equal(result.adds.length,2);
   assert.deepEqual(await t.media(staged),audio);assert.deepEqual(await t.media(prior.mediaId),audio);
   assert.deepEqual(await t.messages(),[prior]);assert.deepEqual(await t.messages(1),[]);
   await t.fault('');await t.p.clock.fastForward(62000);
   await t.p.getByRole('button',{name:'移除恢复项'}).click();assert.deepEqual(await t.media(staged),audio);
   await t.reload();await t.enter();assert.deepEqual(await t.messages(),[prior]);await t.playback(prior.mediaId);
  });
  await run('late finalization after stop timeout is download only',async t=>{
   await t.start();await t.emit(0,first);await t.stop();await t.p.clock.fastForward(5001);
   await t.ended();await t.p.getByText('浏览器尚未交付录音结尾',{exact:false}).waitFor();
   await t.finish(0,last);await t.download();await t.empty();assert.deepEqual((await t.state()).adds,[]);
  });
  await run('replacing the world with the same role IDs cannot receive the old recording or recovery',async t=>{
   await t.start();await t.emit(0,first);await t.stop();await t.landing();
   await t.p.locator('#landing-backup-file').setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(t.world))});
   await t.p.getByText('已导入备份及媒体附件').waitFor();await t.ended();
   await t.enter();await t.open();await t.finish(0,last);
   await t.empty();assert.equal(await t.p.getByRole('button',{name:'下载未确认的录音'}).count(),0);
   assert.deepEqual((await t.state()).adds,[]);
  });
  await run('reloading an active capture ends every track and leaves no voice message',async t=>{
   await t.start();await t.emit(0,first);await t.reload();
   assert.deepEqual(await t.p.evaluate(()=>JSON.parse(sessionStorage.getItem('voice-fixture-pagehide'))),['ended','ended']);
   await t.empty();
  });
  if(new URL(url).protocol!=='file:'){
   await run('real BFCache rejects late permission granted after leaving and returning',async t=>{
    await t.begin();
    const id=await t.p.evaluate(()=>voiceProbe.id);
    await t.p.goto(away);await t.p.goBack({waitUntil:'commit'});
    await t.p.locator('#app[data-write-access=writer]').waitFor();
    assert.equal(await t.p.evaluate(()=>voiceProbe.id),id);assert.equal(await t.p.evaluate(()=>voiceProbe.shows.at(-1)),true);
    await t.grant(0);await t.ended();assert.equal((await t.state()).recorders.length,0);await t.empty();
   });
   await run('real BFCache releases an active recording before returning',async t=>{
    await t.start();await t.emit(0,first);
    const id=await t.p.evaluate(()=>voiceProbe.id);
    await t.p.goto(away);await t.p.goBack({waitUntil:'commit'});
    await t.p.locator('#app[data-write-access=writer]').waitFor();
    assert.equal(await t.p.evaluate(()=>voiceProbe.id),id);assert.equal(await t.p.evaluate(()=>voiceProbe.shows.at(-1)),true);
    await t.ended();await t.finish(0,last);await t.empty();assert.deepEqual((await t.state()).adds,[]);
   });
   await run('real BFCache retains a delayed final block for download without resending',async t=>{
    await t.start();await t.emit(0,first);await t.stop();
    const id=await t.p.evaluate(()=>voiceProbe.id);
    await t.p.goto(away);await t.p.goBack({waitUntil:'commit'});
    await t.p.locator('#app[data-write-access=writer]').waitFor();
    assert.equal(await t.p.evaluate(()=>voiceProbe.id),id);assert.equal(await t.p.evaluate(()=>voiceProbe.shows.at(-1)),true);
    await t.ended();await t.finish(0,last);await t.download();await t.empty();
    assert.deepEqual((await t.state()).adds,[]);
   });
  }
  await run('an older audio upload cannot close a newer active recording',async t=>{
   await t.p.evaluate(()=>voiceProbe.holdMedia=true);
   await t.p.locator('#audio-upload').setInputFiles({name:'fixture.wav',mimeType:'audio/wav',buffer:audio});
   await wait(async()=>(await t.state()).held,'prior audio upload held');
   await t.start();await t.p.evaluate(()=>voiceProbe.holdMedia=false);
   const uploaded=await t.recorded();assert.deepEqual(await t.media(uploaded.mediaId),audio);
   assert.deepEqual((await t.state()).tracks[0],[['live',0],['live',0]]);
   await t.close();await t.ended();assert.deepEqual(await t.messages(),[uploaded]);
  });
  await run('upload and playback preserve the caption and legacy text photo and sticker queue',async t=>{
   await t.caption().fill('上传的文字说明');
   await t.p.locator('#audio-upload').setInputFiles({name:'fixture.wav',mimeType:'audio/wav',buffer:audio});
   const m=await t.recorded();assert.equal(m.caption,'上传的文字说明');
   await t.playback(m.mediaId);assert.deepEqual(await t.media(m.mediaId),audio);
   const png={name:'fixture.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64')};
   for(const [kind,panel] of [['photo','photo'],['sticker','sticker']]){
    await t.p.locator('.compose-plus').click();await t.p.locator('[data-panel='+panel+']').click();
    await t.p.locator('#'+kind+'-upload').setInputFiles(png);
    await wait(async()=>(await t.read()).roles[0].chats.some(m=>m.kind===kind),'save '+kind);
   }
   await t.p.locator('#message-input').fill('合成文字');await t.p.locator('#message-form .send-btn').click();
   const r=(await t.read()).roles[0];
   assert.deepEqual(r.chats.map(m=>m.kind),['voice','photo','sticker','chat']);
   assert.deepEqual(r.chatTiming.pending,r.chats.map(m=>m.id));assert.equal((await t.state()).requests,0);
   await t.reload();await t.enter();await t.playback(m.mediaId);
  });
 }finally{clearTimeout(deadline);await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
