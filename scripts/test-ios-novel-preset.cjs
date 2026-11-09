const assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const {pathToFileURL}=require('node:url'),{chromium,webkit}=require('playwright');
const url=process.env.TEST_URL||pathToFileURL(process.cwd()+'/dist/Elsewhere_Phase1_Standalone.html').href;
const key='elsewhere-v01',endpoint='https://ios-novel-fixture.invalid/v1',at=Date.parse('2026-11-07T18:00:00Z');
const wait=async(fn,why)=>{const end=Date.now()+8000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('Timeout: '+why);};
async function main(){
 const {defaults,createRole}=await import('../src/core/defaults.ts');
 const {createFruitState,parseFruitPreset}=await import('../src/core/fruit/preset.ts');
 const {nativePreset}=await import('../src/core/fruit/nativePreset.ts');
 const {initializeRoleNovel}=await import('../src/core/fruit/roleProfiles.ts');
 const {serializePresetLibrary}=await import('../src/core/fruit/library.ts');
 const {editMessage}=await import('../src/core/revisions.ts');
 const synth=await parseFruitPreset(new TextEncoder().encode(JSON.stringify({prompts:[{identifier:'base',name:'合成小说规则',role:'system',content:'SYNTHETIC_NOVEL_RULE：正文用 <content> 包裹。'},{identifier:'blocked',name:'合成小剧场',role:'system',content:'<snow>不启用</snow>'},{identifier:'unused',name:'未排序项',role:'system',content:'合成保留原件'},...Array.from({length:80},(_,i)=>({identifier:'rule'+i,name:'规则'+i,role:'system',content:'合成复杂规则 '+i})),...['charDescription','personaDescription','scenario','chatHistory'].map(identifier=>({identifier,marker:true}))],prompt_order:[{order:['base',...Array.from({length:80},(_,i)=>'rule'+i),'blocked','charDescription','personaDescription','scenario','chatHistory'].map(identifier=>({identifier,enabled:identifier!=='blocked'}))}]})),'synthetic.json',at);
 let original;
 if(process.env.ELSEWHERE_FRUIT_FIXTURE)original=await parseFruitPreset(new Uint8Array(fs.readFileSync(process.env.ELSEWHERE_FRUIT_FIXTURE)),'private-fixture.json',at);
 const engine=process.env.TEST_BROWSER==='webkit'?webkit:chromium;
 const browser=await engine.launch(engine===chromium?{executablePath:chromium.executablePath(),ignoreDefaultArgs:['--disable-back-forward-cache']}:{}),results=[];
 const deadline=setTimeout(()=>{console.error('iOS novel suite exceeded its deadline');void browser.close();setTimeout(()=>process.exit(1),1000);},240000);
 async function run(label,options,check){
  if(process.env.TEST_CASE&&!label.includes(process.env.TEST_CASE))return;
  const ctx=await browser.newContext({viewport:{width:options.width||390,height:844},isMobile:true,hasTouch:true,timezoneId:'America/Los_Angeles',serviceWorkers:'block',ignoreHTTPSErrors:true}),posts=[],errors=[];
  let boot=true,release,failed=false;const held=new Promise(r=>release=r);
  const trace=stage=>{if(process.env.TEST_TRACE)console.error(label+': '+stage);};trace('context ready');
  let preset=options.original?original:synth;if(!preset)throw Error('Explicit private fixture required');
  if(options.invalidParameter){const doc=JSON.parse(new TextDecoder().decode(preset.raw));doc.top_p=5;preset=await parseFruitPreset(new TextEncoder().encode(JSON.stringify(doc)),'invalid-synthetic.json',at);}
  const body='合成小说正文。'.repeat(330)+'合成终点。';
  try{
   ctx.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
   await ctx.addInitScript(()=>{
    window.iosFault='';window.iosProbe={refuseWorld:false,refuseLibrary:false};
    const databases=indexedDB.databases.bind(indexedDB),open=indexedDB.open.bind(indexedDB),transaction=IDBDatabase.prototype.transaction,set=Storage.prototype.setItem;
    indexedDB.databases=()=>window.iosFault==='hang'?new Promise(()=>{}):databases();
    indexedDB.open=(name,...args)=>{
     if(name==='elsewhere-fruit-private-v1'){
      if(window.iosFault==='open')throw new DOMException('synthetic storage refusal','SecurityError');
      if(window.iosFault==='blocked'){const request={};setTimeout(()=>request.onblocked?.(),0);return request;}
     }
     return open(name,...args);
    };
    IDBDatabase.prototype.transaction=function(...args){if(this.name==='elsewhere-fruit-private-v1'&&(window.iosFault==='transaction'||window.iosProbe.refuseLibrary&&args[1]==='readwrite'))throw new DOMException('synthetic transaction refusal','InvalidStateError');return transaction.apply(this,args);};
    Storage.prototype.setItem=function(k,v){if(k==='elsewhere-v01'&&window.iosProbe.refuseWorld&&JSON.parse(v).roles.some(r=>r.scene?.messages.some(m=>m.speaker==='char'&&m.text.includes('合成终点'))))throw Error('synthetic archive refusal');return set.call(this,k,v);};
   });
   await ctx.route('**/*',async route=>{
    const q=route.request(),u=new URL(q.url());if(boot&&q.isNavigationRequest()){boot=false;return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated iOS fixture</title>'});}
    if(q.url()===endpoint+'/chat/completions'){
     const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'POST'};
     if(q.method()==='OPTIONS')return route.fulfill({status:204,headers});
     assert.equal(q.method(),'POST');const payload=q.postDataJSON();assert.equal(payload.model,'synthetic');assert.ok(!JSON.stringify(payload.messages).includes('OTHER_ROLE_PRIVATE'));
     posts.push(payload);if(options.hold)await held;
     return route.fulfill({headers,json:{choices:[{finish_reason:'stop',message:{role:'assistant',content:'<content>'+body+'</content>'}}]}}).catch(()=>{});
    }
    if(q.method()==='GET'&&(u.protocol==='file:'||u.origin===new URL(url).origin))return route.continue();return route.abort();
   });
   const d=defaults(),r=createRole('合成小说角色','','记录者','谨慎','合成庭院');Object.assign(r,{id:'ios-role',theme:options.theme||'blue',chats:[],events:[],lifeAt:at,lastDiaryCheckDay:'2026-11-07',firstMessageState:{status:'ready',updatedAt:at},scene:{id:'existing-scene',where:'合成庭院',startedAt:at-10000,messages:[]}});
   r.diaries=Array.from({length:8},(_,i)=>({id:'prior-diary-'+i,speaker:'char',source:'manual',dateKey:new Date(at-i*86400000).toISOString().slice(0,10),at:at-i*86400000,text:'合成已有日记'}));
   if(options.recover||options.layout){
    r.scene.messages=[{id:'prior',speaker:'char',text:'合成之前已保存的回复。',at:at-8000},{id:'pending',speaker:'me',text:options.long?'长文本测试。'.repeat(150)+'\n\n保留第二段。':options.short?'合成用户描写：一个人在角落里等待。':'第一段合成描写。\n\n第二段依然保留。',at:at-5000,status:'active'}];
    if(options.quote)r.scene.messages[1].quote={id:'prior',speaker:'char',text:r.scene.messages[0].text,at:r.scene.messages[0].at};
    r.scene.novelAttempt={id:'before-fix',inputId:'pending',at:at-4000,timeoutMs:0,state:'not-sent',code:'preset'};
    r.meetings=[{id:'prior-archive',where:'合成旧地点',startedAt:at-30000,endedAt:at-20000,messages:[{id:'archived',speaker:'char',text:'合成历史档案。',at:at-25000}]}];r.messageRevisions=[];
    if(options.recover)editMessage(r,'scene','prior','合成已编辑的既有回复。',at-7000);
   }
   const other=structuredClone(r);other.id='other-role';other.name='合成另一角色';other.theme='night';other.scene.id='other-scene';other.scene.messages=[{id:'other',speaker:'me',text:'OTHER_ROLE_PRIVATE',at:at-1000}];
   d.roles=[r,other];d.selected=null;d.settings={...d.settings,mode:'api',endpoint,model:'synthetic',autonomousLife:false};
   let l=initializeRoleNovel({schema:2,revision:1,selectedId:'fruit',defaults:{meeting:'fruit',theatre:'fruit'},entries:[{id:'native',kind:'native',preset:nativePreset('meeting'),enabled:true,profiles:createFruitState().profiles},{id:'fruit',kind:'fruit',preset,enabled:true,profiles:createFruitState().profiles}]},r.id);
   const binding=l.roleNovel[r.id].profiles.fruit;binding.profile.style='SYNTHETIC_ROLE_STYLE';binding.profile.length={min:2200,max:2500};const disabled=preset.prompts.find(p=>p.blockedReason);if(disabled)binding.profile.overrides[disabled.identifier]=false;
   if(!options.original)binding.profile.overrides.unused=false;
   if(options.disabled)binding.enabled=false;
   if(options.invalidReference)binding.profile.overrides['not-an-entry']=false;
   const p=await ctx.newPage();p.setDefaultTimeout(8000);p.setDefaultNavigationTimeout(10000);await p.clock.install({time:at});await p.goto(url);trace('seed page loaded');
   await p.evaluate(async({d,l,key,endpoint})=>{localStorage.setItem(key,JSON.stringify(d));localStorage.setItem('elsewhere-device-api-key-v1',JSON.stringify({endpoint,key:'SYNTHETIC_ONLY'}));await new Promise((yes,no)=>{const q=indexedDB.open('elsewhere-fruit-private-v1',2);q.onupgradeneeded=()=>{q.result.createObjectStore('documents');q.result.createObjectStore('preset-library');};q.onsuccess=()=>{const db=q.result,tx=db.transaction('preset-library','readwrite');tx.objectStore('preset-library').put(l,'current');tx.oncomplete=()=>{db.close();yes();};tx.onabort=()=>no(Error('isolated preset seed failed'));};});},{d,l:serializePresetLibrary(l),key,endpoint});
   trace('preset seeded');const ready=()=>p.locator('#app[data-storage-state=ready][data-write-access=writer]').waitFor();await p.reload();trace('app loaded');await ready();trace('write access ready');
   await p.locator('[data-action=enter][data-id=ios-role]').click();await p.locator('[data-action=openconversation]').click();
   if(options.fault)await p.evaluate(f=>window.iosFault=f,options.fault);
   const saved=()=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key),record=async()=>(await saved()).roles[0].scene;
   const library=()=>p.evaluate(async()=>new Promise((yes,no)=>{const q=indexedDB.open('elsewhere-fruit-private-v1');q.onerror=()=>no(Error('fixture read'));q.onsuccess=()=>{const db=q.result,tx=db.transaction('preset-library'),r=tx.objectStore('preset-library').get('current');tx.oncomplete=()=>{db.close();yes(r.result);};};}));
   const send=async()=>{await p.locator('#novel-input').fill('合成用户本轮描写。');await p.getByRole('button',{name:'发送描写',exact:true}).click();};
   trace('Scene open');const measurement=await check({p,ctx,posts,body,saved,record,library,send,ready,release,preset,before:structuredClone(r)});trace('assertions complete');
   assert.deepEqual(errors,[]);const scene=await record();results.push({label,posts:posts.length,sceneId:scene.id,users:scene.messages.filter(m=>m.speaker==='me').length,actors:scene.messages.filter(m=>m.speaker==='char').length,state:scene.novelAttempt?.state||null,...(measurement?{measurement}:{}),...(options.original?{originalSha:preset.sha256}:{})});console.log('PASS '+label+' | POST='+posts.length);
  }catch(error){failed=true;if(process.env.EVIDENCE_FILE)fs.writeFileSync(process.env.EVIDENCE_FILE+'.failure',JSON.stringify({label,posts:posts.length,error:String(error)},null,2));throw error;}
  finally{release();try{await ctx.close();}catch(error){if(!failed)throw error;}}
 }
 async function archived(t){await t.p.locator('.passage.theirs .novel-body').filter({hasText:'合成终点。'}).waitFor();assert.equal((await t.record()).novelAttempt.state,'archived');assert.ok((await t.record()).messages.some(m=>m.text===t.body));}
 async function details(t){if(!await t.p.locator('.novel-failure-dialog[open]').count())await t.p.locator('[data-action=novel-details]').click();}
 async function recover(t){
  assert.equal(t.posts.length,0);assert.equal(await t.p.locator('#novel-form button').count(),1);const prior=await t.library(),before=await t.record();
  await details(t);await t.p.getByRole('button',{name:'重新调用',exact:true}).click();await archived(t);assert.equal(t.posts.length,1);
  const after=await t.record();assert.equal(after.id,before.id);assert.deepEqual(after.messages.slice(0,before.messages.length),before.messages);assert.equal(after.messages.filter(m=>m.id==='pending').length,1);assert.deepEqual((await t.saved()).roles[0].meetings,t.before.meetings);assert.deepEqual((await t.saved()).roles[0].messageRevisions,t.before.messageRevisions);assert.deepEqual(await t.library(),prior);
  const wire=t.posts[0].messages.map(m=>m.content).join('\n');assert.ok(wire.includes('SYNTHETIC_ROLE_STYLE'));assert.ok(wire.includes('2200'));assert.equal(t.posts[0].max_tokens,undefined);
  assert.equal(after.messages.at(-1).novelOutput.presetId,'fruit');assert.ok(t.before.messageRevisions.length>0);
  if(t.preset===original){const active=new Set(original.order.filter(e=>e.enabled).map(e=>e.identifier)),excerpts=original.prompts.filter(p=>active.has(p.identifier)&&!p.marker&&!p.blockedReason).flatMap(p=>p.content.match(/[^{}<>]{20,80}/g)||[]).map(s=>s.trim()).filter(s=>s.length>=20);assert.ok(excerpts.some(s=>wire.includes(s)),'actual original instructions must reach the Mock request');}
  await t.p.reload();await t.ready();await t.p.locator('[data-action=enter][data-id=ios-role]').click();await t.p.locator('[data-action=openconversation]').click();await t.p.locator('.novel-body').filter({hasText:'合成终点。'}).waitFor();assert.equal(t.posts.length,1);assert.equal(await t.p.locator('[data-action=retry-novel]').count(),0);
 }
 try{
  await run('new Scene compiles preserved overrides and saves actual body',{},async t=>{await t.send();await archived(t);assert.equal(t.posts.length,1);assert.ok(JSON.stringify(t.posts[0].messages).includes('SYNTHETIC_NOVEL_RULE'));});
  await run('existing preset not-sent Scene recovers without inserting another user message',{recover:true},recover);
  await run('duplicate retry and a stale retry control cannot dispatch twice',{recover:true},async t=>{
   await details(t);await t.p.evaluate(()=>{const b=document.querySelector('[data-action=retry-novel]');window.oldRetry=b;b.click();b.click();});await archived(t);assert.equal(t.posts.length,1);assert.equal((await t.record()).messages.filter(m=>m.id==='pending').length,1);await t.p.evaluate(()=>window.oldRetry.click());assert.equal(t.posts.length,1);
  });
  await run('retry loses write authority without changing the original Scene',{recover:true},async t=>{
   const before=await t.record();await details(t);await t.p.evaluate(()=>{const b=document.querySelector('[data-action=retry-novel]');dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));b.click();});assert.equal(t.posts.length,0);assert.deepEqual(await t.record(),before);
  });
  if(original)await run('private V6.4X original recovers an existing not-sent Scene',{recover:true,original:true},recover);
  await run('disabled role has actionable diagnosis and can be explicitly enabled',{disabled:true},async t=>{
   await t.send();await t.p.locator('[data-novel-status=failed]').waitFor();assert.equal(t.posts.length,0);assert.equal((await t.record()).novelAttempt.presetIssue,'preset-disabled');await t.p.getByRole('button',{name:'检查当前角色预设'}).click();await t.p.locator('[data-preset-active]').check();await t.p.getByTestId('preset-save').click();await wait(async()=>(await t.library()).roleNovel['ios-role'].profiles.fruit.enabled,'confirmed role enable');assert.equal(t.posts.length,0);
   await t.p.locator('.back-btn[data-view=home]').click();await t.p.locator('[data-action=openconversation]').click();await details(t);await t.p.getByRole('button',{name:'重新调用',exact:true}).click();await archived(t);assert.equal(t.posts.length,1);assert.equal((await t.record()).messages.filter(m=>m.speaker==='me').length,1);
  });
  for(const fault of ['open','blocked','transaction','hang'])await run('preset '+fault+' is diagnosed without POST or lost input',{fault},async t=>{
   await t.send();if(fault==='hang')await t.p.clock.fastForward(31000);await t.p.locator('[data-novel-status=failed]').waitFor();const a=(await t.record()).novelAttempt;assert.equal(t.posts.length,0);assert.equal(a.state,'not-sent');assert.equal(a.presetIssue,fault==='blocked'?'storage-blocked':fault==='hang'?'storage-timeout':'storage-failed');assert.equal((await t.record()).messages.filter(m=>m.speaker==='me').length,1);assert.equal(await t.p.locator('#novel-form button').count(),1);
  });
  for(const option of ['invalidReference','invalidParameter'])await run(option+' remains blocked for the same original',{[option]:true},async t=>{await t.send();await t.p.locator('[data-novel-status=failed]').waitFor();assert.equal(t.posts.length,0);assert.equal((await t.record()).novelAttempt.state,'not-sent');assert.equal((await t.record()).novelAttempt.code,option==='invalidParameter'?'compile':'preset');});
  await run('library refusal keeps old enabled state and unsent message',{disabled:true},async t=>{
   await t.send();await t.p.locator('[data-novel-status=failed]').waitFor();await t.p.getByRole('button',{name:'检查当前角色预设'}).click();await t.p.locator('[data-preset-active]').waitFor();await t.p.evaluate(()=>window.iosProbe.refuseLibrary=true);await t.p.locator('[data-preset-active]').check();await t.p.getByTestId('preset-save').click();await t.p.locator('[data-terminal-status][data-save-state=failed]').waitFor();await t.p.evaluate(()=>window.iosProbe.refuseLibrary=false);assert.equal((await t.library()).roleNovel['ios-role'].profiles.fruit.enabled,false);assert.equal(t.posts.length,0);assert.equal((await t.record()).messages.filter(m=>m.speaker==='me').length,1);
  });
  await run('returned body refused by main storage is copyable but not archived',{},async t=>{await t.p.evaluate(()=>window.iosProbe.refuseWorld=true);await t.send();await t.p.locator('[data-novel-status=failed]').waitFor();assert.equal((await t.record()).messages.filter(m=>m.speaker==='char').length,0);assert.equal(t.posts.length,1);await t.p.locator('[data-action=copy-novel-reply]').waitFor();assert.equal(await t.p.locator('#novel-form button').count(),1);});
  await run('unknown result retries require confirmation and never duplicate the original input',{hold:true},async t=>{
   await t.send();await wait(()=>t.posts.length===1,'first POST');assert.equal(await t.p.locator('[data-action=retry-novel]').count(),0);await t.p.locator('[data-action=cancel-novel]').click();await t.p.locator('[data-novel-state=unknown]').waitFor();t.release();await t.p.clock.fastForward(1000);assert.equal((await t.record()).messages.filter(m=>m.speaker==='char').length,0);
   await t.p.reload();await t.ready();await t.p.locator('[data-action=enter][data-id=ios-role]').click();await t.p.locator('[data-action=openconversation]').click();t.p.once('dialog',async d=>{assert.ok(d.message().includes('再次计费'));await d.dismiss();});await details(t);await t.p.getByRole('button',{name:'重新调用',exact:true}).click();assert.equal(t.posts.length,1);
   t.p.once('dialog',d=>d.accept());await details(t);await t.p.getByRole('button',{name:'重新调用',exact:true}).click();await archived(t);assert.equal(t.posts.length,2);assert.equal((await t.record()).messages.filter(m=>m.speaker==='me').length,1);
  });
  for(const width of [320,375,390,430])for(const theme of ['blue','green','pink','coffee','night'])await run('compact multiline card and themed safe area '+width+' '+theme,{layout:true,width,theme,quote:width===320,long:width===430,short:width===390&&theme==='blue'},async t=>{
   await t.p.evaluate(()=>{const s=document.createElement('style');s.textContent=':root{--app-safe-top:47px;--app-safe-bottom:34px}';document.head.append(s);});
   const measured=await t.p.locator('.passage.mine').evaluate(el=>{const r=el.getBoundingClientRect(),body=el.querySelector('.novel-body'),speaker=el.querySelector('.speaker'),actions=el.querySelector('.message-meta-row'),s=getComputedStyle(el),phone=document.querySelector('.phone');return {height:r.height,body:body.getBoundingClientRect().height,speaker:speaker.getBoundingClientRect().height,actions:actions.getBoundingClientRect().height,quote:el.querySelector('.bubble-quote')?.getBoundingClientRect().height||0,padding:parseFloat(s.paddingTop)+parseFloat(s.paddingBottom),text:body.textContent,whiteSpace:s.whiteSpace,bodyWhiteSpace:getComputedStyle(body).whiteSpace,overflow:el.scrollWidth>el.clientWidth+1,safeTop:parseFloat(getComputedStyle(phone).paddingTop),headerGap:document.querySelector('.top').getBoundingClientRect().top-phone.getBoundingClientRect().top};});
   assert.equal(measured.text,t.before.scene.messages.at(-1).text);assert.equal(measured.whiteSpace,'normal');assert.equal(measured.bodyWhiteSpace,'pre-wrap');assert.ok(measured.height>0&&measured.body>0,'measure connected visible content');assert.ok(measured.height<=measured.body+measured.speaker+measured.actions+measured.quote+measured.padding+34);assert.equal(measured.overflow,false);assert.equal(measured.safeTop,47);assert.ok(Math.abs(measured.headerGap-47)<2);
   const color=await t.p.evaluate(()=>({theme:document.documentElement.dataset.theme,scheme:document.querySelector('meta[name=color-scheme]').content,css:getComputedStyle(document.documentElement).colorScheme,meta:document.querySelector('meta[name=theme-color]').content,bg:getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()}));assert.equal(color.theme,theme);assert.equal(color.scheme,theme==='night'?'dark':'light');assert.equal(color.css,color.scheme);assert.equal(color.meta,color.bg);assert.equal(await t.p.locator('#novel-form button').count(),1);assert.equal(t.posts.length,0);
   assert.equal(await t.p.evaluate(()=>{document.documentElement.dataset.keyboardOpen='true';const inset=getComputedStyle(document.querySelector('.phone')).paddingBottom;delete document.documentElement.dataset.keyboardOpen;return inset;}),'0px');
   if(process.env.EVIDENCE_FILE&&width===390&&['blue','coffee','night'].includes(theme))await t.p.screenshot({path:process.env.EVIDENCE_FILE+'.'+theme+'.png'});
   return {height:measured.height,bodyHeight:measured.body,overflow:measured.overflow,safeTop:measured.safeTop};
  });
  await run('theme saving navigation and refresh keep the active browser scheme',{layout:true},async t=>{
   await t.p.locator('.back-btn[data-view=home]').click();await t.p.locator('.dock [data-view=terminal]').click();await t.p.locator('[data-style-panel]').filter({hasText:'02｜外观与主题'}).locator('summary').click();
   for(const theme of ['night','green']){await t.p.locator('[data-style-theme='+theme+']').click();await t.p.locator('[data-style-form=appearance] [type=submit]').click();await t.p.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme);assert.equal(await t.p.locator('meta[name=color-scheme]').getAttribute('content'),theme==='night'?'dark':'light');}
   await t.p.locator('.back-btn[data-view=home]').click();await t.p.locator('[data-action=openconversation]').click();assert.equal(await t.p.locator('meta[name=color-scheme]').getAttribute('content'),'light');await t.p.reload();await t.ready();assert.equal(await t.p.locator('html').getAttribute('data-theme'),'green');assert.equal(t.posts.length,0);
  });
  await run('quotes edits and retraction keep authored line breaks',{layout:true,quote:true},async t=>{
   await t.p.locator('[data-action=starteditmsg][data-id=pending]').click();const edit='修改后的第一段。\n\n保留第二段。';await t.p.locator('#inline-edit-form textarea').fill(edit);await t.p.locator('#inline-edit-form [type=submit]').click();assert.equal(await t.p.locator('.passage.mine .novel-body').textContent(),edit);await t.p.locator('[data-action=retractmsg][data-id=pending]').click();assert.equal(await t.p.locator('.passage.mine').count(),0);assert.equal((await t.record()).messages.find(m=>m.id==='pending').status,'retracted');assert.equal(t.posts.length,0);
  });
  const summary={browser:process.env.TEST_BROWSER||'chromium',passed:results.length,posts:results.reduce((n,r)=>n+r.posts,0),privateOriginal:original?{sha256:original.sha256,bytes:original.raw.length}:null,results};if(process.env.EVIDENCE_FILE)fs.writeFileSync(process.env.EVIDENCE_FILE,JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
 }finally{clearTimeout(deadline);await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
