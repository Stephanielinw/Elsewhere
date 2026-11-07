const assert=require('node:assert/strict');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {chromium,webkit}=require('playwright');
const url=process.env.TEST_URL||pathToFileURL(process.cwd()+'/dist/Elsewhere_Phase1_Standalone.html').href;
const at=Date.parse('2026-11-06T22:00:00Z'),key='elsewhere-v01',endpoint='https://chat-performance-fixture.invalid/v1';
async function main(){
 const {defaults,createRole}=await import('../src/core/defaults.ts');
 const browser=process.env.TEST_BROWSER==='webkit'?await webkit.launch():await chromium.launch({executablePath:chromium.executablePath(),ignoreDefaultArgs:['--disable-back-forward-cache']});
 const watchdog=setTimeout(()=>{console.error('Chat performance suite deadline');void browser.close();setTimeout(()=>process.exit(1),1000);},240000);
 const results=[];
 async function run(label,options,check){
  if(process.env.TEST_CASE&&!label.includes(process.env.TEST_CASE))return;
  const count=options.count||200,posts=[],errors=[];const trace=stage=>{if(process.env.TEST_TRACE)console.error(label+': '+stage);};trace('starting');
  const ctx=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Los_Angeles',ignoreHTTPSErrors:true,serviceWorkers:'block',...(options.touch?{isMobile:true,hasTouch:true}:{} )});
  let bootstrap=true,release;const held=new Promise(resolve=>release=resolve);
  try{
   ctx.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
   await ctx.route('**/*',async route=>{
    const req=route.request(),dest=req.url();
    if(bootstrap&&req.isNavigationRequest()){bootstrap=false;return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Chat measurement seed</title>'});}
    if(dest===new URL('chat-performance-away',url).href)return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Away</title>'});
    if(dest===endpoint+'/chat/completions'){
     const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST','access-control-allow-headers':'*'};
     if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
     posts.push(req.postDataJSON());if(options.hold)await held;
     return route.fulfill({headers,json:{choices:[{finish_reason:'stop',message:{role:'assistant',content:'合成模型回复'}}]}}).catch(()=>{});
    }
    if(req.method()==='GET'&&(new URL(dest).protocol==='file:'||new URL(dest).origin===new URL(url).origin))return route.continue();
    throw Error('Unexpected external request');
   });
   await ctx.addInitScript(at=>{
    Date.now=()=>window.syntheticChatNow??at;
    const stats=window.chatMeasure={ticks:[],urls:new Set(),mutations:0,loads:0,srcWrites:0,document:Math.random(),shows:[],reject:false};
    addEventListener('pageshow',e=>stats.shows.push(e.persisted));
    const interval=window.setInterval.bind(window);
    window.setInterval=(fn,delay,...args)=>interval((...values)=>{const start=performance.now();try{return fn(...values);}finally{if(delay===850&&document.querySelector('.chat-conversation'))stats.ticks.push(performance.now()-start);}},delay,...args);
    const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL),load=HTMLMediaElement.prototype.load,set=Storage.prototype.setItem;
    URL.createObjectURL=blob=>{const u=create(blob);stats.urls.add(u);return u;};URL.revokeObjectURL=u=>{stats.urls.delete(u);return revoke(u);};
    HTMLMediaElement.prototype.load=function(){stats.loads++;return load.call(this);};
    Storage.prototype.setItem=function(k,v){if(k==='elsewhere-v01'&&stats.reject)throw Error('synthetic chat save refusal');return set.call(this,k,v);};
    const get=IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get=function(...args){
     const request=get.apply(this,args);
     if(args[0]==='image-late')Object.defineProperty(request,'onsuccess',{set(fn){request.addEventListener('success',()=>{window.releaseChatImage=()=>fn.call(request,new Event('success'));});}});
     return request;
    };
   },at);
   const world=defaults(),r=createRole('合成长聊天角色','','记录者','谨慎','合成港口');
   Object.assign(r,{id:'perf-role',lifeAt:at,lastDiaryCheckDay:'2026-11-06',firstMessageState:{status:'ready',updatedAt:at},events:[],chats:Array.from({length:count},(_,i)=>({id:'m'+i,speaker:i%2?'char':'me',text:'合成历史消息 '+i,at:at-60000-(count-i)*1000,status:'active',...(i===count-2?{kind:'voice',mediaId:'synthetic-audio',seconds:10,caption:'合成静音音频'}:{})})),pendingReplies:options.api?[]:[{id:'queued',replyTo:'m'+(count-1),bubbles:['合成新增角色消息'],dueAt:at+10000}]});
   r.diaries=Array.from({length:7},(_,i)=>({id:'prior-diary-'+i,speaker:'char',source:'manual',dateKey:new Date(at-(i+1)*86400000).toISOString().slice(0,10),at:at-(i+1)*86400000,text:'合成既有日记'}));
   if(options.api)r.chatTiming={version:1,focused:true,generation:0,pending:[],quietUntil:0};
   if(options.quote)r.chats.at(-1).quote={id:'m0',speaker:'me',text:'合成历史消息 0',at:r.chats[0].at};
   if(options.meetings){
    const {archiveMeeting}=await import('../src/core/meetingHistory.ts');
    for(const [id,index,place] of [['archive-one',100,'合成旧港口'],['archive-two',180,'合成庭院']]){
     r.scene={id,startedAt:r.chats[index].at,where:place,messages:[{id:id+'-user',speaker:'me',text:id+' 用户已保存的原话',at:r.chats[index].at},{id:id+'-reply',speaker:'char',text:id+' 角色已保存的回复',at:r.chats[index+1].at},{id:id+'-gone',speaker:'char',text:'失效的归档正文',at:r.chats[index+1].at,status:'retracted'}]};
     archiveMeeting(r,r.chats[index+1].at,()=>true);
    }
   }
   if(options.image)Object.assign(r.chats.at(-1),{kind:'photo',mediaId:'image-late',caption:'合成延迟图片'});
   if(options.alter)options.alter(r,world);
   world.roles=[r];world.selected=null;world.settings={...world.settings,mode:'api',endpoint:options.api?endpoint:'',model:options.api?'synthetic-chat':'',autonomousLife:false};
   if(options.other){const second=structuredClone(r);second.id='perf-other';second.name='合成另一角色';second.pendingReplies=[];second.chats=second.chats.map(m=>({...m,text:'另一角色的内容 '+m.id}));world.roles.push(second);}
   const p=await ctx.newPage();p.setDefaultTimeout(10000);p.setDefaultNavigationTimeout(10000);await p.goto(url);trace('seed page loaded');
   await p.evaluate(async({world,key,endpoint,api})=>{
    localStorage.setItem(key,JSON.stringify(world));if(api)localStorage.setItem('elsewhere-device-api-key-v1',JSON.stringify({endpoint,key:'SYNTHETIC_MOCK_ONLY'}));
    const bytes=new ArrayBuffer(160044),v=new DataView(bytes),s=(o,t)=>[...t].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
    s(0,'RIFF');v.setUint32(4,160036,true);s(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);s(36,'data');v.setUint32(40,160000,true);
    await new Promise((ok,bad)=>{const q=indexedDB.open('elsewhere-media-v1',1);q.onupgradeneeded=()=>q.result.createObjectStore('blobs');q.onsuccess=()=>{const db=q.result,tx=db.transaction('blobs','readwrite');tx.objectStore('blobs').put(new Blob([bytes],{type:'audio/wav'}),'synthetic-audio');tx.objectStore('blobs').put(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="300" height="230"><rect width="300" height="230" fill="skyblue"/></svg>'],{type:'image/svg+xml'}),'image-late');tx.oncomplete=()=>{db.close();ok();};tx.onerror=()=>bad(Error('synthetic media seed'));};});
   },{world,key,endpoint,api:options.api});
   trace('media seeded');const ready=()=>p.locator('#app[data-storage-state=ready][data-write-access=writer]').waitFor();
   await p.reload();await ready();trace('app ready');await p.locator('[data-action=enter]').filter({hasText:'合成长聊天角色'}).click();
   const before=await p.evaluate(()=>{const start=performance.now();document.querySelector('.dock [data-view=chat]').click();const area=document.querySelector('.chat-conversation');area.getBoundingClientRect();return {openLayoutMs:performance.now()-start,rows:area.querySelectorAll('[data-msg-id]').length,nodes:area.querySelectorAll('*').length};});
   await p.waitForFunction(()=>document.querySelector('audio')?.readyState>=1);
   const saved=()=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
   const tick=async(ms=0)=>{const n=await p.evaluate(ms=>{window.syntheticChatNow=Date.now()+ms;return window.chatMeasure.ticks.length;},ms);await p.waitForFunction(n=>window.chatMeasure.ticks.length>n,n);};
   const observe=()=>p.evaluate(()=>{window.chatMeasure.mutations=0;window.chatMeasure.ticks=[];window.chatObserver?.disconnect();window.chatObserver=new MutationObserver(ms=>window.chatMeasure.mutations+=ms.reduce((n,m)=>n+m.addedNodes.length+m.removedNodes.length,0));window.chatObserver.observe(document.querySelector('.chat-conversation'),{subtree:true,childList:true});});
   const play=()=>p.evaluate(async()=>{const a=document.querySelector('audio');a.muted=true;a.currentTime=1.25;await a.play();window.oldMeasuredAudio=a;window.oldMeasuredPane=document.querySelector('.chat-conversation');});
   const position=()=>p.evaluate(()=>{const pane=document.querySelector('.chat-conversation'),top=pane.getBoundingClientRect().top,el=[...pane.querySelectorAll('[data-msg-id],[data-meeting-id]')].find(el=>el.getBoundingClientRect().bottom>top+1);return {id:el?.dataset.msgId||el?.dataset.meetingId,offset:el?el.getBoundingClientRect().top-top:0,top:pane.scrollTop,gap:pane.scrollHeight-pane.clientHeight-pane.scrollTop};});
   const older=async()=>{await p.locator('[data-action=loadchatolder]').evaluate(el=>el.click());};
   await check({p,ctx,world,r,count,posts,before,saved,tick,play,observe,release,ready,position,older});
   assert.deepEqual(errors,[]);results.push({label,posts:posts.length});console.log('PASS '+label+' | POST='+posts.length);
  }finally{release();await ctx.close();}
 }
 try{
  if(process.env.BENCHMARK_ONLY){
   const metrics=[];
   for(const count of [200,2000,6000])for(let trial=0;trial<3;trial++)await run('benchmark '+count+' trial '+trial,{count},async t=>{
    await t.play();await t.observe();await t.tick(11000);await t.p.waitForFunction(()=>document.querySelector('.chat-conversation').textContent.includes('合成新增角色消息'));
    const after=await t.p.evaluate(()=>({tickMs:Math.max(0,...window.chatMeasure.ticks),mutatedNodes:window.chatMeasure.mutations,sameAudio:window.oldMeasuredAudio===document.querySelector('audio'),oldAudioConnected:window.oldMeasuredAudio.isConnected,playTime:document.querySelector('audio').currentTime,paused:document.querySelector('audio').paused,urls:window.chatMeasure.urls.size,nodes:document.querySelector('.chat-conversation').querySelectorAll('*').length}));
    const cdp=await t.ctx.newCDPSession(t.p),heap=await cdp.send('Runtime.getHeapUsage');metrics.push({count,trial,...t.before,after,jsHeapBytes:heap.usedSize});assert.equal(t.posts.length,0);
   });
   if(process.env.METRICS_FILE)fs.writeFileSync(process.env.METRICS_FILE,JSON.stringify(metrics,null,2));
   console.log('METRICS '+JSON.stringify(metrics));return;
  }
  await run('whole-page redraw and incoming message preserve playing audio and pane',{},async t=>{
   await t.play();await t.p.evaluate(()=>window.originalRows=[...document.querySelectorAll('[data-msg-id]')]);const source=await t.p.locator('audio').getAttribute('src');await t.p.locator('[data-action=chatpanel][data-panel=more]').click();
   assert.equal(await t.p.evaluate(()=>window.oldMeasuredPane===document.querySelector('.chat-conversation')&&window.oldMeasuredAudio===document.querySelector('audio')),true);
   await t.tick(11000);assert.equal(await t.p.evaluate(()=>window.originalRows.every(el=>el===document.querySelector('[data-msg-id="'+el.dataset.msgId+'"]'))),true);assert.equal(await t.p.evaluate(()=>window.oldMeasuredAudio===document.querySelector('audio')),true);assert.equal(await t.p.locator('audio').getAttribute('src'),source);
   assert.ok(await t.p.locator('audio').evaluate(a=>a.currentTime>=1.25&&!a.paused));assert.equal(await t.p.evaluate(()=>window.chatMeasure.loads),0);assert.equal(t.posts.length,0);
  });
  for(const count of [200,2000,6000])await run(count+' messages initially mount only 80 entries without deleting history',{count},async t=>{
   assert.equal(t.before.rows,80);assert.ok(t.before.nodes<1500);assert.equal((await t.saved()).roles[0].chats.length,count);
   await t.observe();await t.tick(11000);assert.ok(await t.p.evaluate(()=>window.chatMeasure.mutations<40));
   assert.equal((await t.saved()).roles[0].chats.length,count+1);assert.equal(t.posts.length,0);
  });
  await run('all 6000 messages remain reachable by older pages',{count:6000},async t=>{
   for(let i=0;i<75&&await t.p.locator('[data-msg-id=m0]').count()===0;i++)await t.older();
   assert.equal(await t.p.locator('[data-msg-id=m0]').count(),1);assert.equal(await t.p.locator('.chat-conversation [data-msg-id]').count(),6000);assert.equal((await t.saved()).roles[0].chats.length,6000);
  });
  await run('prepending older history keeps the visible message and offset',{},async t=>{
   await t.p.locator('.chat-conversation').evaluate(el=>el.scrollTop=300);await t.tick();const before=await t.position();await t.older();
   const after=await t.position();assert.equal(after.id,before.id);assert.ok(Math.abs(after.offset-before.offset)<2);
  });
  await run('incoming reply does not drag a reader to the bottom',{},async t=>{
   await t.p.locator('.chat-conversation').evaluate(el=>el.scrollTop=500);await t.tick();const before=await t.position();await t.tick(11000);
   const after=await t.position();assert.equal(after.id,before.id);assert.ok(Math.abs(after.offset-before.offset)<2);assert.ok(after.gap>100);
  });
  await run('bottom reader follows the received message',{},async t=>{await t.tick(11000);assert.ok((await t.position()).gap<2);});
  await run('a valid old quote loads its target without a POST',{quote:true},async t=>{
   assert.equal(await t.p.locator('[data-msg-id=m0]').count(),0);await t.p.locator('button.bubble-quote').click();assert.equal(await t.p.locator('[data-msg-id=m0]').count(),1);assert.equal((await t.position()).id,'m0');assert.equal(t.posts.length,0);
  });
  for(const mode of ['missing','withdrawn','duplicate','no-id','invalid-source','mismatched-text','mismatched-time','mismatched-speaker'])await run('legacy '+mode+' quote cannot guess a target',{quote:true,alter:r=>{
   if(mode==='missing')r.chats.at(-1).quote.id='not-present';
   if(mode==='withdrawn')r.chats[0].status='retracted';
   if(mode==='duplicate')r.chats.push({...r.chats[0]});
   if(mode==='no-id')delete r.chats.at(-1).quote.id;
   if(mode==='invalid-source')r.chats[0].revisionCount=1;
   if(mode==='mismatched-text')r.chats.at(-1).quote.text='没有这个来源的旧引用';
   if(mode==='mismatched-time')r.chats.at(-1).quote.at++;
   if(mode==='mismatched-speaker')r.chats.at(-1).quote.speaker='char';
  }},async t=>{
   const quotes=t.p.locator('.bubble-quote');assert.equal(await quotes.count(),1);
   if(mode==='no-id'){assert.equal(await t.p.locator('button.bubble-quote').count(),0);return;}
   await quotes.click();await t.p.locator('.toast').filter({hasText:'无法定位'}).waitFor();assert.equal(await t.p.locator('[data-msg-id=m0]').count(),0);assert.equal(t.posts.length,0);
  });
  await run('editing and retracting touch only the affected visible message',{},async t=>{
   await t.play();await t.p.locator('[data-action=starteditmsg][data-id=m199]').click();await t.p.locator('#inline-edit-form textarea').fill('合成编辑后的正文');await t.p.locator('#inline-edit-form [type=submit]').click();
   assert.equal((await t.saved()).roles[0].chats.find(m=>m.id==='m199').text,'合成编辑后的正文');assert.equal(await t.p.evaluate(()=>window.oldMeasuredAudio===document.querySelector('audio')),true);
   await t.p.locator('[data-action=retractmsg][data-id=m199]').click();assert.equal(await t.p.locator('[data-msg-id=m199]').count(),0);assert.equal(await t.p.evaluate(()=>window.oldMeasuredAudio===document.querySelector('audio')),true);
  });
  await run('a refused send keeps draft and confirmed history',{},async t=>{
   const before=(await t.saved()).roles[0].chats;await t.p.evaluate(()=>window.chatMeasure.reject=true);await t.p.locator('#message-input').fill('未确认发送的草稿');await t.p.locator('#message-form .send-btn').click();
   assert.equal(await t.p.locator('#message-input').inputValue(),'未确认发送的草稿');assert.deepEqual((await t.saved()).roles[0].chats,before);assert.equal(t.posts.length,0);
  });
  await run('busy and typing states preserve media while normal chat makes one POST',{api:true,hold:true,alter:r=>r.chats[0].text='我的职业是档案修复师。'},async t=>{
   await t.play();await t.p.locator('#message-input').fill('合成正常手机消息');await t.p.locator('#message-form .send-btn').click();await t.tick(61000);await t.p.waitForFunction(()=>document.querySelector('[data-testid=chat-typing]'));
   assert.equal(t.posts.length,1);assert.ok(JSON.stringify(t.posts[0]).includes('档案修复师'));assert.equal(await t.p.evaluate(()=>window.oldMeasuredAudio===document.querySelector('audio')),true);assert.ok(await t.p.locator('audio').evaluate(a=>!a.paused));
   t.release();await t.p.locator('.bubble').filter({hasText:'合成模型回复'}).waitFor();assert.equal(t.posts.length,1);assert.equal(await t.p.evaluate(()=>window.oldMeasuredAudio===document.querySelector('audio')),true);
  });
  await run('regenerating a visible reply preserves the playing audio and source history',{api:true,alter:r=>r.chats.at(-1).replyTo='m196'},async t=>{
   await t.play();await t.p.locator('[data-action=regenmsg][data-id=m199]').click();await t.p.waitForFunction(()=>document.querySelector('.chat-conversation').textContent.includes('合成模型回复'));
   assert.equal(t.posts.length,1);const chats=(await t.saved()).roles[0].chats;assert.equal(chats.find(m=>m.id==='m199').status,'retracted');assert.equal(chats.filter(m=>m.text==='合成模型回复').length,1);
   assert.equal(await t.p.evaluate(()=>window.oldMeasuredAudio===document.querySelector('audio')),true);assert.ok(await t.p.locator('audio').evaluate(a=>!a.paused&&a.currentTime>=1.25));
  });
  await run('meeting cards are whole touch targets and return to the same history anchor',{meetings:true,touch:true},async t=>{
   assert.equal(await t.p.locator('[data-meeting-id=archive-one]').count(),0);await t.older();
   const order=await t.p.locator('.chat-conversation [data-msg-id],.chat-conversation [data-meeting-id]').evaluateAll(els=>els.map(el=>el.dataset.msgId||el.dataset.meetingId));assert.ok(order.indexOf('m101')<order.indexOf('archive-one'));assert.ok(order.indexOf('archive-one')<order.indexOf('m102'));
   const beforeRecords=(await t.saved()).roles[0].meetings;
   for(const id of ['archive-one','archive-two']){
    const card=t.p.locator('[data-meeting-id='+id+']');await card.scrollIntoViewIfNeeded();await t.tick();
    const geometry=await card.evaluate(el=>{const rect=el.getBoundingClientRect();return {height:rect.height,width:rect.width,text:el.innerText,tag:el.tagName,hit:el.contains(document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2))};});
    if(process.env.TEST_TRACE)console.log('MEETING_LAYOUT '+JSON.stringify({id,height:geometry.height,width:geometry.width,hit:geometry.hit,tag:geometry.tag}));
    assert.ok(geometry.height>=64);assert.ok(geometry.width>=200);assert.ok(geometry.hit);assert.ok(geometry.text.includes('见面记录'));assert.ok(geometry.text.includes('合成长聊天角色'));assert.equal(geometry.tag,'BUTTON');
    const before=await t.position();await card.tap({position:{x:12,y:12}});await t.p.locator('[data-meeting-record='+id+']').waitFor();
    const detail=await t.p.locator('[data-meeting-record='+id+']').innerText();assert.ok(detail.includes(id+' 用户已保存的原话'));assert.ok(detail.includes(id+' 角色已保存的回复'));assert.ok(!detail.includes('失效的归档正文'));assert.ok(!detail.includes((id==='archive-one'?'archive-two':'archive-one')+' 用户'));
    assert.equal(await t.p.locator('[data-meeting-record] textarea').count(),0);await t.p.locator('.back-btn').click();const after=await t.position();assert.equal(after.id,before.id);assert.ok(Math.abs(after.offset-before.offset)<2);
   }
   await t.p.evaluate(()=>window.oldMeetingCard=document.querySelector('[data-meeting-id=archive-one]'));await t.tick(11000);assert.equal(await t.p.evaluate(()=>window.oldMeetingCard===document.querySelector('[data-meeting-id=archive-one]')),true);assert.deepEqual((await t.saved()).roles[0].meetings,beforeRecords);assert.equal(t.posts.length,0);
  });
  await run('meeting cards remain keyboard accessible after append and refresh',{meetings:true,touch:true},async t=>{
   const before=(await t.saved()).roles[0].meetings;await t.older();await t.tick(11000);await t.p.reload();await t.ready();await t.p.locator('[data-action=enter]').click();await t.p.locator('.dock [data-view=chat]').click();
   for(const id of ['archive-one','archive-two']){const card=t.p.locator('[data-meeting-id='+id+']');await card.focus();await card.press('Enter');await t.p.locator('[data-meeting-record='+id+']').waitFor();await t.p.locator('.back-btn').click();}
   assert.deepEqual((await t.saved()).roles[0].meetings,before);assert.equal(t.posts.length,0);
  });
  await run('meeting cards survive restoring a legacy no-media backup',{meetings:true,touch:true},async t=>{
   const legacy=structuredClone(t.world);legacy.version=1;legacy.selected=null;delete legacy.draftWorldId;
   for(const m of legacy.roles[0].chats)if(m.kind==='voice'){delete m.kind;delete m.mediaId;delete m.seconds;delete m.caption;}
   await t.p.locator('.chat-back').click();await t.p.getByRole('button',{name:'切换角色'}).click();t.p.once('dialog',d=>d.accept());
   await t.p.locator('#landing-backup-file').setInputFiles({name:'synthetic-legacy-meetings.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});await t.p.locator('.toast').filter({hasText:'已导入备份及媒体附件'}).waitFor();
   assert.deepEqual((await t.saved()).roles[0].meetings,t.r.meetings);await t.p.reload();await t.ready();await t.p.locator('[data-action=enter]').click();await t.p.locator('.dock [data-view=chat]').click();await t.older();
   for(const id of ['archive-one','archive-two']){await t.p.locator('[data-meeting-id='+id+']').tap();await t.p.locator('[data-meeting-record='+id+']').waitFor();await t.p.locator('.back-btn').click();}
   assert.deepEqual((await t.saved()).roles[0].meetings,t.r.meetings);assert.equal(t.posts.length,0);
  });
  if(new URL(url).protocol==='https:'&&process.env.TEST_BROWSER!=='webkit')await run('meeting cards retain archive identity through real BFCache',{meetings:true,touch:true},async t=>{
   await t.older();const card=t.p.locator('[data-meeting-id=archive-one]');await card.scrollIntoViewIfNeeded();await t.tick();const before=await t.position(),doc=await t.p.evaluate(()=>window.chatMeasure.document);
   await t.p.goto(new URL('chat-performance-away',url).href);await t.p.goBack({waitUntil:'commit'});await t.ready();assert.equal(await t.p.evaluate(()=>window.chatMeasure.document),doc);assert.equal(await t.p.evaluate(()=>window.chatMeasure.shows.at(-1)),true);assert.equal((await t.position()).id,before.id);
   await t.p.locator('[data-meeting-id=archive-one]').tap();await t.p.locator('[data-meeting-record=archive-one]').waitFor();await t.p.locator('.back-btn').click();assert.equal((await t.position()).id,before.id);assert.equal(t.posts.length,0);
  });
  await run('refresh restores the scoped reading anchor and oldest loaded message',{},async t=>{
   await t.older();await t.p.locator('.chat-conversation').evaluate(el=>el.scrollTop=400);await t.tick();const before=await t.position();await t.p.reload();await t.ready();await t.p.locator('[data-action=enter]').click();await t.p.locator('.dock [data-view=chat]').click();
   const after=await t.position();assert.equal(after.id,before.id);assert.ok(Math.abs(after.offset-before.offset)<2);
  });
  await run('role navigation isolates history and drafts and releases unused media',{other:true},async t=>{
   await t.p.locator('#message-input').fill('角色 A 的未发草稿');await t.play();
   await t.p.locator('[data-action=view][data-view=home]').first().click();await t.p.getByRole('button',{name:'切换角色'}).click();await t.p.locator('[data-action=enter][data-id=perf-other]').click();await t.p.locator('.dock [data-view=chat]').click();
   assert.equal(await t.p.locator('#message-input').inputValue(),'');assert.ok((await t.p.locator('.chat-conversation').innerText()).includes('另一角色的内容'));
   assert.equal(await t.p.evaluate(()=>window.oldMeasuredAudio.isConnected),false);assert.equal(await t.p.evaluate(()=>window.oldMeasuredAudio.paused),true);assert.ok(await t.p.evaluate(()=>window.chatMeasure.urls.size<=1));
  });
  await run('late image loading cannot override a newer wheel scroll',{image:true},async t=>{
   await t.p.waitForFunction(()=>typeof window.releaseChatImage==='function');await t.p.locator('.chat-conversation').hover();await t.p.mouse.wheel(0,-400);await t.p.waitForFunction(()=>{const p=document.querySelector('.chat-conversation');return p.scrollHeight-p.clientHeight-p.scrollTop>100;});
   const before=await t.position();await t.p.evaluate(()=>window.releaseChatImage());await t.p.waitForFunction(()=>document.querySelector('[data-media-id=image-late]')?.naturalWidth>0);const after=await t.position();assert.equal(after.id,before.id);assert.ok(Math.abs(after.offset-before.offset)<2);
  });
  await run('an old quote button cannot target another role or world',{quote:true},async t=>{
   for(const field of ['quoteRole','quoteWorld']){
    await t.p.locator('button.bubble-quote').evaluate((el,field)=>el.dataset[field]='different-scope',field);await t.p.locator('button.bubble-quote').click();await t.p.locator('.toast').filter({hasText:'无法定位'}).waitFor();assert.equal(await t.p.locator('[data-msg-id=m0]').count(),0);
   }
   assert.equal(t.posts.length,0);
  });
  await run('an old image callback cannot scroll a newly opened role chat',{image:true,other:true},async t=>{
   await t.p.waitForFunction(()=>typeof window.releaseChatImage==='function');await t.p.evaluate(()=>window.releaseOldChatImage=window.releaseChatImage);
   await t.p.locator('[data-action=view][data-view=home]').first().click();await t.p.getByRole('button',{name:'切换角色'}).click();await t.p.locator('[data-action=enter][data-id=perf-other]').click();await t.p.locator('.dock [data-view=chat]').click();
   await t.p.locator('.chat-conversation').evaluate(el=>el.scrollTop=500);await t.tick();const before=await t.position();await t.p.evaluate(()=>window.releaseOldChatImage());await t.tick();const after=await t.position();assert.equal(after.id,before.id);assert.ok(Math.abs(after.offset-before.offset)<2);assert.equal(t.posts.length,0);
  });
  if(new URL(url).protocol==='https:')await run('real BFCache retains chat nodes without new POST',{},async t=>{
   await t.older();const before=await t.position(),id=await t.p.evaluate(()=>window.chatMeasure.document);await t.p.goto(new URL('chat-performance-away',url).href);await t.p.goBack({waitUntil:'commit'});await t.ready();assert.equal(await t.p.evaluate(()=>window.chatMeasure.document),id);assert.equal(await t.p.evaluate(()=>window.chatMeasure.shows.at(-1)),true);assert.equal((await t.position()).id,before.id);
  });
 }finally{clearTimeout(watchdog);await browser.close();}
 assert.ok(results.length,'No chat performance cases ran');console.log(JSON.stringify({passed:results.length,posts:results.reduce((n,r)=>n+r.posts,0)}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
