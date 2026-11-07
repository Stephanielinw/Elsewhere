const assert=require('node:assert/strict');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const url=process.env.TEST_URL||pathToFileURL(process.cwd()+'/dist/Elsewhere_Phase1_Standalone.html').href;
const key='elsewhere-v01',endpoint='https://continuity-fixture.invalid/v1',at=Date.parse('2026-11-06T22:00:00Z');
const query='为什么把我留在这里？';
const original=['我领你走进贮藏室。','待在这儿，别四处走动。','我推门出去，只有我离开，你还在屋里。'];
async function main(){
 const {defaults,createRole}=await import('../src/core/defaults.ts');
 const {archiveMeeting}=await import('../src/core/meetingHistory.ts');
 const {editMessage,retractMessage}=await import('../src/core/revisions.ts');
 const browser=await chromium.launch({executablePath:chromium.executablePath()});
 const timer=setTimeout(()=>{console.error('Continuity suite deadline');void browser.close();setTimeout(()=>process.exit(1),1000);},180000),results=[];
 async function run(label,opts,check){
  if(process.env.TEST_CASE&&!label.includes(process.env.TEST_CASE))return;
  const ctx=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Los_Angeles',ignoreHTTPSErrors:true,serviceWorkers:'block'});
  const posts=[],errors=[];let seed=true;
  try{
   await ctx.addInitScript(at=>{Date.now=()=>window.continuityNow??at;},at);
   await ctx.route('**/*',async route=>{
    const req=route.request(),dest=new URL(req.url());
    if(seed&&req.isNavigationRequest()){seed=false;return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated continuity seed</title>'});}
    if(req.url()===endpoint+'/chat/completions'){
     const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST','access-control-allow-headers':'*'};
     if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});posts.push(req.postDataJSON());return route.fulfill({headers,json:{choices:[{finish_reason:'stop',message:{role:'assistant',content:'合成角色可以表达自己的解释。'}}]}});
    }
    if(req.method()==='GET'&&(dest.protocol==='file:'||dest.origin===new URL(url).origin))return route.continue();return route.abort();
   });
   const r=createRole('合成船长','','守港人','倔强','合成海港');Object.assign(r,{id:'actor-a',chats:[],events:[],lifeAt:at,lastDiaryCheckDay:'2026-11-06',firstMessageState:{status:'ready',updatedAt:at},chatTiming:{version:1,focused:true,generation:0,pending:[],quietUntil:0}});
   r.diaries=Array.from({length:7},(_,i)=>({id:'diary'+i,speaker:'char',source:'manual',dateKey:new Date(at-(i+1)*86400000).toISOString().slice(0,10),at:at-(i+1)*86400000,text:'合成既有日记'}));
   r.scene={id:'room-visit',startedAt:at-600000,where:'贮藏室',messages:original.map((text,i)=>({id:'action-'+i,speaker:'char',text,at:at-500000+i*1000,status:'active'}))};
   for(const m of r.scene.messages)r.events.push({id:'event-'+m.id,kind:'scene',title:'角色回复',detail:m.text,at:m.at,source:r.scene.id,messageId:m.id,speaker:m.speaker,sourceRevision:0,knownBy:['user',r.id]});
   r.scene.messages.push({id:'private-user',speaker:'me',text:'PRIVATE_UNSPOKEN_THOUGHT：我在心里猜测尚未说出口的秘密。',at:at-490000});
   r.scene.messages.push({id:'private-note',speaker:'note',text:'PRIVATE_SYSTEM_NOTE',at:at-489000});
   archiveMeeting(r,at-480000,()=>true);
   const world=defaults();world.roles=[r];world.selected=null;world.settings={...world.settings,mode:'api',endpoint,model:'synthetic-continuity',autonomousLife:false};
   if(opts.edit){r.scene=r.meetings[0];editMessage(r,'scene','action-0','我独自走进别的房间。',at-470000);r.scene=null;}
   if(opts.retract){r.scene=r.meetings[0];retractMessage(r,'scene','action-0',at-470000);r.scene=null;}
   if(opts.alter)opts.alter(r,world);
   const p=await ctx.newPage();p.setDefaultTimeout(8000);p.on('pageerror',e=>errors.push(e.message));await p.goto(url);
   await p.evaluate(({key,world,endpoint})=>{localStorage.setItem(key,JSON.stringify(world));localStorage.setItem('elsewhere-device-api-key-v1',JSON.stringify({endpoint,key:'SYNTHETIC_MOCK_ONLY'}));},{key,world,endpoint});
   const ready=()=>p.locator('#app[data-storage-state=ready][data-write-access=writer]').waitFor();await p.reload();await ready();
   await p.locator('[data-action=enter][data-id="'+(opts.role||r.id)+'"]').click();await p.locator('.dock [data-view=chat]').click();
   const before=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
   await p.locator('#message-input').fill(opts.query||query);await p.locator('#message-form .send-btn').click();assert.equal(posts.length,0);await p.evaluate(()=>window.continuityNow=Date.now()+61000);
   await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).roles.some(r=>r.chats.some(m=>m.speaker==='char'&&m.text==='合成角色可以表达自己的解释。')),key);
   if(!opts.future)await p.locator('.chat-conversation').filter({hasText:'合成角色可以表达自己的解释。'}).waitFor();
   assert.equal(posts.length,1);const wire=posts[0].messages.map(m=>m.content).join('\n');
   const evidence={label,posts:posts.length,sceneIds:r.meetings.map(s=>s.id),actions:original.map(text=>wire.includes(text)),sourceIds:original.map((_,i)=>wire.includes('action-'+i)),falseFarewell:wire.includes('在贮藏室告别'),privateInput:wire.includes('PRIVATE_UNSPOKEN_THOUGHT'),bytes:Buffer.byteLength(wire),estimatedTokens:(await import('../src/core/contextBudget.ts')).estimateTextTokens(wire)};
   if(process.env.EVIDENCE_FILE)fs.appendFileSync(process.env.EVIDENCE_FILE,JSON.stringify(evidence)+'\n');
   await check({p,wire,r,world,posts,before,ready});
   assert.deepEqual(errors,[]);results.push(evidence);console.log('PASS '+label+' | POST='+posts.length);
  }finally{await ctx.close();}
 }
 try{
  await run('ended scene supplies the original attributed action chain',{},async t=>{for(let i=0;i<original.length;i++){assert.ok(t.wire.includes(original[i]),'missing action '+i);assert.ok(t.wire.includes('action-'+i));}assert.ok(t.wire.includes('room-visit'));assert.ok(!t.wire.includes('在贮藏室告别'));assert.ok(!t.wire.includes('PRIVATE_UNSPOKEN_THOUGHT'));assert.ok(!t.wire.includes('PRIVATE_SYSTEM_NOTE'));assert.deepEqual((await t.p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key)).roles[0].meetings,t.before.roles[0].meetings);});
  await run('edited source uses current text and never the replaced body',{edit:true,query:'你为什么独自走进别的房间？'},async t=>{assert.ok(t.wire.includes('我独自走进别的房间。'));assert.ok(!t.wire.includes(original[0]));});
  await run('retracted source does not return through archive or event copies',{retract:true},async t=>{assert.ok(!t.wire.includes(original[0]));assert.ok(t.wire.includes(original[2]));});
  await run('two recent meetings retain their distinct scenes and actions',{alter:r=>r.meetings.push({id:'garden-visit',startedAt:at-300000,endedAt:at-240000,where:'庭院',messages:[{id:'garden-action',speaker:'char',text:'第二次见面，我独自在庭院修补花架。',at:at-270000}]})},async t=>{assert.ok(t.wire.includes('room-visit'));assert.ok(t.wire.includes('garden-visit'));assert.ok(t.wire.includes(original[0]));assert.ok(t.wire.includes('第二次见面，我独自在庭院修补花架。'));});
  await run('switching the selected role never exposes another actors meeting',{role:'actor-b',alter:(r,w)=>{const b=structuredClone(r);b.id='actor-b';b.name='合成旅人';b.meetings=[];b.events=[];w.roles.push(b);}},async t=>{for(const text of original)assert.ok(!t.wire.includes(text));assert.ok(!t.wire.includes('room-visit'));});
  await run('legacy archive and false goodbye metadata are handled without rewriting history',{alter:(r,w)=>{w.version=1;delete w.draftWorldId;r.events.at(-1).detail='在贮藏室告别；旧合成归档摘要';}},async t=>{assert.ok(t.wire.includes(original[0]));assert.ok(!t.wire.includes('在贮藏室告别'));assert.ok(t.before.roles[0].events.some(e=>e.detail.includes('在贮藏室告别')));assert.deepEqual((await t.p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key)).roles[0].meetings,t.before.roles[0].meetings);});
  await run('long original scenes use bounded source-labelled excerpts',{alter:r=>{for(let i=0;i<1500;i++)r.meetings[0].messages.splice(2,0,{id:'long-'+i,speaker:'char',text:'无关的长叙述。'.repeat(100),at:at-498500});},query:'贮藏室里为什么让我等？'},async t=>{assert.ok(t.wire.length<16000);assert.ok(t.wire.includes('room-visit'));assert.ok(t.wire.includes('action-0'));assert.ok(t.wire.includes(original[2]));});
  await run('unknown revision time cannot reintroduce old source content',{alter:r=>r.meetings[0].messages[0].revisionCount=1},async t=>assert.ok(!t.wire.includes(original[0])));
  await run('theatre and auxiliary text stay outside real meeting continuity',{alter:r=>{r.plays=[{id:'play',title:'戏中戏',world:'虚构世界',char:'戏中人物',user:'演员',startedAt:at-300000,endedAt:at-200000,messages:[{id:'play-only',speaker:'char',text:'THEATRE_SECRET_NOT_REAL',at:at-250000}]}];r.meetings[0].messages[0].novelOutput={mode:'meeting',presetId:'synthetic',memoryEligible:false,generatedAuxiliary:'AUXILIARY_PRIVATE_MARKER'};}},async t=>{assert.ok(!t.wire.includes('THEATRE_SECRET_NOT_REAL'));assert.ok(!t.wire.includes('AUXILIARY_PRIVATE_MARKER'));assert.ok(t.wire.includes(original[0]));});
  await run('future archives cannot be used as past phone knowledge',{future:true,alter:r=>r.meetings[0].endedAt=at+3600000},async t=>{for(const text of original)assert.ok(!t.wire.includes(text));});
  await run('same IDs in a replaced world cannot restore the previous rooms text',{alter:r=>{r.meetings[0].messages=r.meetings[0].messages.map(m=>({...m,text:'新世界的独立原文 '+m.id}));r.events=[];}},async t=>{assert.ok(t.wire.includes('新世界的独立原文'));for(const text of original)assert.ok(!t.wire.includes(text));});
 }finally{clearTimeout(timer);await browser.close();}
 assert.ok(results.length);console.log(JSON.stringify({passed:results.length,posts:results.reduce((n,r)=>n+r.posts,0)}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
