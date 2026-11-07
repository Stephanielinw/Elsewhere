const assert=require('node:assert/strict');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const url=process.env.TEST_URL||pathToFileURL(process.cwd()+'/dist/Elsewhere_Phase1_Standalone.html').href;
const key='elsewhere-v01',endpoint='https://memory-precision.invalid/v1',at=Date.parse('2026-11-07T18:00:00Z');
async function main(){
 const {defaults,createRole}=await import('../src/core/defaults.ts');
 const {projectRoleMemory,syncRoleMemory,inspectMemoryRequest}=await import('../src/core/memory.ts');
 const {buildNativeContext}=await import('../src/core/prompt.ts');
 const {editMessage,retractMessage}=await import('../src/core/revisions.ts');
 const browser=await chromium.launch({executablePath:chromium.executablePath(),ignoreDefaultArgs:['--disable-back-forward-cache']});
 const timer=setTimeout(()=>{console.error('Memory precision suite deadline');void browser.close();setTimeout(()=>process.exit(1),1000);},240000),results=[];
 async function run(label,text,expected,options={}){
  if(process.env.TEST_CASE&&!label.includes(process.env.TEST_CASE))return;
  const ctx=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Los_Angeles',ignoreHTTPSErrors:true,serviceWorkers:'block'});
  const posts=[],errors=[];let boot=true,release;const held=new Promise(r=>release=r);
  try{
   await ctx.addInitScript(at=>{Date.now=()=>window.precisionNow??at;window.precisionDocument=Math.random();window.precisionShows=[];addEventListener('pageshow',e=>window.precisionShows.push(e.persisted));const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='elsewhere-v01'&&window.refuseMemorySave)throw Error('Synthetic memory save refusal');return set.call(this,k,v);};},at);
   await ctx.route('**/*',async route=>{const q=route.request(),u=new URL(q.url());
    if(boot&&q.isNavigationRequest()){boot=false;return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated memory seed</title>'});}
    if(q.url()===endpoint+'/chat/completions'){
     const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'POST'};
     if(q.method()==='OPTIONS')return route.fulfill({status:204,headers});posts.push(q.postDataJSON());if(options.hold)await held;
     return route.fulfill({headers,json:{choices:[{finish_reason:'stop',message:{role:'assistant',content:'合成角色已收到。'}}]}}).catch(()=>{});
    }
    if(q.url()===new URL('precision-away',url).href)return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Away</title>'});
    if(q.method()==='GET'&&(u.protocol==='file:'||u.origin===new URL(url).origin))return route.continue();return route.abort();
   });
   const data=defaults(),r=createRole('合成角色','','记录员','谨慎','合成港口');Object.assign(r,{id:'precision-role',chats:[],events:[],lifeAt:at,lastDiaryCheckDay:'2026-11-07',firstMessageState:{status:'ready',updatedAt:at},chatTiming:{version:1,focused:true,generation:0,pending:[],quietUntil:0}});
   r.diaries=Array.from({length:8},(_,i)=>({id:'diary'+i,speaker:'char',text:'合成既有日记',source:'manual',at:at-(i+1)*86400000,dateKey:new Date(at-(i+1)*86400000).toISOString().slice(0,10)}));
   if(!options.live)r.chats.push({id:'source',speaker:'me',text,at:at-100000,status:'active'});
   if(!options.recent)for(let i=0;i<40;i++)r.chats.push({id:'filler'+i,speaker:'char',text:'合成闲谈 '+i,at:at-90000+i,status:'active'});
   data.roles=[r];data.selected=null;data.settings={...data.settings,mode:'api',endpoint,model:'synthetic-memory',autonomousLife:false};
   if(options.prepare)options.prepare(r,data,{syncRoleMemory,editMessage,retractMessage});
   if(options.other){const b=structuredClone(r);b.id='other';b.name='合成另一角色';b.chats=[];b.events=[];b.memory=structuredClone(r.memory);data.roles.push(b);}
   const p=await ctx.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));await p.goto(url);
   await p.evaluate(({data,key,endpoint})=>{localStorage.setItem(key,JSON.stringify(data));localStorage.setItem('elsewhere-device-api-key-v1',JSON.stringify({endpoint,key:'SYNTHETIC_ONLY'}));},{data,key,endpoint});
   const ready=()=>p.locator('#app[data-storage-state=ready][data-write-access=writer]').waitFor();
   const open=async(id='precision-role')=>{await p.locator('[data-action=enter][data-id='+id+']').click();await p.locator('.dock [data-view=chat]').click();};
   const raw=()=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
   await p.reload();await ready();await open(options.other?'other':'precision-role');assert.equal(posts.length,0);
   if(options.edit){await p.locator('[data-action=starteditmsg][data-id=source]').click();await p.locator('textarea[name=editText]').fill(options.edit);await p.getByRole('button',{name:'保存修改',exact:true}).click();}
   if(options.retract)await p.locator('[data-action=retractmsg][data-id='+options.retract+']').click();
   if(options.reload){await p.reload();await ready();await open();assert.equal(posts.length,0);}
   if(options.bfcache){const id=await p.evaluate(()=>window.precisionDocument);await p.goto(new URL('precision-away',url).href);await p.goBack({waitUntil:'commit'});await ready();assert.equal(await p.evaluate(()=>window.precisionDocument),id);assert.ok(await p.evaluate(()=>window.precisionShows.includes(true)));assert.equal(posts.length,0);}
   const input=options.live?text:'继续聊聊今天的风。';
   if(options.failedSend){
    const before=JSON.stringify(await raw());await p.evaluate(()=>window.refuseMemorySave=true);await p.locator('#message-input').fill(input);await p.locator('#message-form .send-btn').click();
    assert.equal(JSON.stringify(await raw()),before);assert.equal(await p.locator('#message-input').inputValue(),input);assert.equal(posts.length,0);
    await p.reload();await ready();await open();assert.equal(await p.locator('#message-input').inputValue(),input);
   }
   await p.locator('#message-input').fill(input);await p.locator('#message-form .send-btn').click();assert.equal(posts.length,0);
   const savedBeforeRequest=await raw();await p.evaluate(()=>window.precisionNow=Date.now()+61000);
   const deadline=Date.now()+12000;while(!posts.length&&Date.now()<deadline)await new Promise(r=>setTimeout(r,25));assert.equal(posts.length,1);
   if(options.hold){await p.locator('[data-action=starteditmsg][data-id=source]').click();await p.locator('textarea[name=editText]').fill('不再作为身份自述。');await p.getByRole('button',{name:'保存修改',exact:true}).click();release();await new Promise(r=>setTimeout(r,150));assert.equal((await raw()).roles[0].chats.filter(m=>m.text==='合成角色已收到。').length,0);assert.equal(posts.length,1);}
   else await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).roles.some(r=>r.chats.some(m=>m.speaker==='char'&&m.text==='合成角色已收到。')),key);
   const snapshot=options.hold?savedBeforeRequest:await raw(),current=snapshot.roles.find(r=>r.id===(options.other?'other':'precision-role'));
   const facts=projectRoleMemory(current,at+61000).facts;assert.deepEqual(facts.map(f=>[f.value,f.polarity,!!f.mutual]),expected);
   const context=buildNativeContext(snapshot,current,'chat','继续聊聊今天的风。',{nowTs:at+61000});
   const memory=context.facts.filter(f=>f.id.startsWith('memory:'));
   assert.equal(memory.length,expected.length);const trace=inspectMemoryRequest(context,{diagnostics:[]} ,posts[0].messages);
   for(const fact of memory)assert.ok(trace.facts.some(t=>t.id===fact.id&&t.reason==='injected'),'Fact must reach the actual HTTP request');
   if(options.forbidden)for(const value of options.forbidden)assert.ok(!memory.some(f=>f.text.includes(value)));
   if(options.recent)assert.ok(posts[0].messages.some(m=>m.content.includes(text)),'Keep uncertain original history without declaring it a fact');
   if(options.other)assert.ok(!JSON.stringify(posts[0].messages).includes('剪辑师'));
   if(options.live){const stored=(await raw()).roles[0];assert.equal(stored.chats.filter(m=>m.speaker==='me'&&m.text===text).length,1);assert.ok(stored.memory?.records.length);}
   if(!options.hold){const before=await raw();await p.reload();await ready();await open(options.other?'other':'precision-role');assert.equal(posts.length,1);const after=await raw();assert.deepEqual(after.roles.map(r=>r.memory),before.roles.map(r=>r.memory));assert.deepEqual(after.roles.map(r=>r.chats),before.roles.map(r=>r.chats));}
   assert.deepEqual(errors,[]);results.push({label,posts:posts.length,factIds:facts.map(f=>f.id),sourceIds:facts.map(f=>f.source.id),injected:trace.facts.filter(f=>f.id.startsWith('memory:')&&f.reason==='injected').length});console.log('PASS '+label+' | POST='+posts.length);
  }finally{release();await ctx.close();}
 }
 try{
  for(const [label,text,expected] of [
   ['mixed affirmative','我是剪辑师，不过我可能明天去纽约。',[['剪辑师','affirm',false]]],
   ['mixed denial','我不是医生，但我也许明天去医院。',[['医生','deny',false]]],
   ['conditional identity','如果我是医生，我就会帮你。',[]],['uncertain identity','也许我是学生吧。',[]],
   ['separate sentence','我是学生。我可能下周毕业。',[['学生','affirm',false]]],
   ['past joke then explicit denial','我刚才是在开玩笑，我不是医生。',[['医生','deny',false]]],
   ['quoted movie identity','「我是医生」是电影里的台词。',[]],['dream identity','我梦见自己是一名国王。',[]],
   ['explicit replacement','我不是医生，我是剪辑师。',[['医生','deny',false],['剪辑师','affirm',false]]],
   ['unilateral relationship','我们是恋人，但也许你不这么认为。',[['恋人','affirm',false]]],
   ['english mixed identity','I am an editor but I might move tomorrow.',[['an editor','affirm',false]]],
   ['english trailing maybe','I am a doctor, maybe.',[]],['english trailing guess','I am a doctor, I guess.',[]],
   ['condition survives comma','如果明天我有时间，我是医生这件事就能告诉你。',[]],
   ['indirect speech','他告诉我，我是医生。',[]],['sarcasm','对对对，我是宇宙之主，行了吧。',[]],
  ])await run(label,text,expected,{forbidden:['纽约','毕业','国王']});
  await run('uncertain raw history remains history','I am a doctor, maybe.',[],{recent:true});
  await run('normal user send persists exact mixed sources','我是剪辑师，不过我可能晚到。',[['剪辑师','affirm',false]],{live:true});
  await run('refused send retains draft and retry creates one record','我是剪辑师，不过我可能晚到。',[['剪辑师','affirm',false]],{live:true,failedSend:true});
  await run('UI edit preserves ledger and only current revision is injected','我是学生。',[['剪辑师','affirm',false]],{prepare:(r,d,h)=>h.syncRoleMemory(r,at),edit:'我是剪辑师，不过我可能晚到。',reload:true});
  await run('UI retract invalidates mixed source after refresh','我是剪辑师，不过我可能晚到。',[],{prepare:(r,d,h)=>h.syncRoleMemory(r,at),retract:'source',reload:true});
  await run('withdrawing correction cannot resurrect rejected identity','我的职业是医生。',[],{prepare:(r,d,h)=>{h.syncRoleMemory(r,at-80000);r.chats.push({id:'fix',speaker:'me',text:'我的职业不是医生而是剪辑师，不过我可能晚到。',at:at-1000});h.syncRoleMemory(r,at);},retract:'fix',reload:true});
  await run('existing confirmed relationship keeps valid consent','我们是朋友。',[['朋友','affirm',true]],{prepare:r=>r.chats.splice(1,0,{id:'consent',speaker:'char',text:'是的，我们是朋友。',at:at-99999})});
  await run('copied ledger cannot reveal another role facts','我是剪辑师，不过我可能晚到。',[],{prepare:(r,d,h)=>h.syncRoleMemory(r,at),other:true});
  await run('same IDs in a different world cannot validate copied source','我是剪辑师。',[],{prepare:(r,d,h)=>{h.syncRoleMemory(r,at);r.chats[0].text='合成另一个世界的发言。';}});
  for(const action of ['edit','retract'])await run('lost roleplay framing stays conservative '+action,'我们来角色扮演。',[],{prepare:(r,d,h)=>{r.chats.splice(1,0,{id:'fiction',speaker:'me',text:'我是国王。',at:at-99999});if(action==='edit')h.editMessage(r,'chat','source','这一条先不说。',at-1000);else h.retractMessage(r,'chat','source',at-1000);},reload:true});
  await run('legacy valid memory IDs survive reopen','我的职业是剪辑师。',[['剪辑师','affirm',false]],{prepare:(r,d,h)=>h.syncRoleMemory(r,at),reload:true});
  await run('old uncertain ledger is not an independent proof','I am a doctor, maybe.',[],{prepare:r=>{r.memory={version:1,records:[{id:'memory:source:0:0',roleId:r.id,scope:'real:'+r.id,layer:'identity',attribute:'self',value:'a doctor',polarity:'affirm',correction:false,at:at-100000,knownBy:[r.id],origin:'explicit-user',source:{id:'source',text:r.chats[0].text,at:at-100000,revisionCount:0},supersedes:[]}]};},reload:true});
  await run('source edit during reply does not pay for a replacement','我是剪辑师，不过我可能晚到。',[['剪辑师','affirm',false]],{hold:true});
  if(new URL(url).protocol==='https:')await run('real BFCache preserves scoped memory without resending','我是剪辑师，不过我可能晚到。',[['剪辑师','affirm',false]],{bfcache:true});
 }finally{clearTimeout(timer);await browser.close();}
 assert.ok(results.length);const summary={passed:results.length,posts:results.reduce((n,r)=>n+r.posts,0),automaticRetries:0,results};if(process.env.EVIDENCE_FILE)fs.writeFileSync(process.env.EVIDENCE_FILE,JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
