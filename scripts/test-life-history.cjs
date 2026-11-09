const assert=require('node:assert/strict');
const approveBackupImports=require('./backup-confirmation.cjs');
const {pathToFileURL}=require('node:url');
const {chromium,devices}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const url=process.env.TEST_URL||pathToFileURL(process.cwd()+'/public/Elsewhere_Phase1_Standalone.html').href;
const endpoint='https://life-history-fixture.invalid/v1',key='elsewhere-v01';
const away=new URL('life-history-away',url).href;
const at=Date.parse('2026-11-06T22:00:00Z'),hour=3600000;
async function wait(read,why){
  const until=Date.now()+8000;
  while(Date.now()<until){if(await read())return;await new Promise(resolve=>setTimeout(resolve,25));}
  throw Error('Timeout: '+why);
}
async function main(){
  const {defaults,createRole}=await import('../src/core/defaults.ts');
  const {claimLifeTask,prepareLifeTask,commitLifeTask}=await import('../src/core/autonomousLife.ts');
  const {toLocalDateKey}=await import('../src/core/diary.ts');
  const {editMessage}=await import('../src/core/revisions.ts');
  const {estimateTextTokens}=await import('../src/core/contextBudget.ts');
  const browser=await chromium.launch({ignoreDefaultArgs:['--disable-back-forward-cache'],...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  const deadline=setTimeout(()=>{console.error('Life history suite exceeded its deadline');process.exitCode=1;void browser.close();},180000);
  let failures=0;
  async function run(label,check,{live=false,hold=false,archiveFailure=false,basis=false,diary=false,tz='America/Los_Angeles',alter}={}){
    if(process.env.TEST_CASE&&!label.includes(process.env.TEST_CASE))return;
    const ctx=await browser.newContext({...devices['iPhone 13'],ignoreHTTPSErrors:true,serviceWorkers:'block',timezoneId:tz});
    await approveBackupImports(ctx);
    const p=await ctx.newPage();p.setDefaultTimeout(8000);p.setDefaultNavigationTimeout(8000);
    const posts=[],postUrls=[],errors=[];let boot=true,release;
    const gate=new Promise(resolve=>{release=resolve;});
    try{
      ctx.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
      p.on('pageerror',error=>errors.push(error.message));
      ctx.on('request',req=>{if(req.method()==='POST')postUrls.push(req.url());});
      await ctx.route('**/*',async route=>{
        const req=route.request(),dest=req.url();
        if(boot&&req.isNavigationRequest()){
          boot=false;return route.fulfill({contentType:'text/html',body:'<!doctype html><title>History seed</title>'});
        }
        if(dest===away&&req.method()==='GET')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Away</title>'});
        if(dest===endpoint+'/chat/completions'){
          const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST','access-control-allow-headers':'*'};
          if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
          assert.equal(req.method(),'POST');
          const body=req.postDataJSON(),wire=body.messages.map(m=>m.content).join('\n'),life=wire.includes('[Elsewhere Autonomous Life v1]');
          posts.push({kind:life?'life':wire.includes('【私人日记】')?'diary':'chat',body,wire});
          if(hold&&life)await gate;
          const task=life?JSON.parse(body.messages.at(-1).content):null;
          const content=life?JSON.stringify({requestId:task.requestId,roleId:task.roleId,events:[{at:task.window.to-20*60000,action:'walk',durationMinutes:5,location:{sourceId:'profile:'+task.roleId,quote:'旧港口'}}]}):wire.includes('【私人日记】')?'合成历史日记。':'合成手机回复。';
          return route.fulfill({headers,json:{choices:[{finish_reason:'stop',message:{role:'assistant',content}}]}}).catch(()=>{});
        }
        if(req.method()==='GET'&&(new URL(dest).protocol==='file:'||new URL(dest).origin===new URL(url).origin))return route.continue();
        return route.abort();
      });
      await ctx.addInitScript(({key,archiveFailure})=>{
        window.historyFixture={document:Math.random(),shows:[],failRole:false,failures:0};
        addEventListener('pageshow',e=>window.historyFixture.shows.push(e.persisted));
        const set=Storage.prototype.setItem;
        Storage.prototype.setItem=function(k,v){
          if(k===key){
            const world=JSON.parse(v);
            if(window.historyFixture.failRole&&world.roles.some(r=>r.name==='拒写新名')||
              archiveFailure&&world.roles.some(r=>r.events.some(e=>e.lifeRecord))){
              window.historyFixture.failures++;
              throw Error('synthetic history write failure');
            }
          }
          return set.call(this,k,v);
        };
      },{key,archiveFailure});
      const data=defaults(),r=createRole('合成旧名','','医生','谨慎','旧港口'),eventAt=diary?at-24*hour:at;
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
      Object.assign(r,{id:'life-history-actor',profile:'整理医生手册。与朋友伊洛熟识。',relationship:'老朋友',notes:'合成笔记',chats:[],events:[],diaries:[],lifeAt:at,lastDiaryCheckDay:today,firstMessageState:{status:'ready',updatedAt:eventAt-4*hour}});
      r.proactive={attempts:[{id:'synthetic-prior',roleId:r.id,topicId:'none',topic:'',topicVersion:'',chatVersion:'',at,status:'skipped'}],sentTopics:[]};
      if(basis){
        r.chats=[{id:'basis-message',speaker:'char',text:'合成材料已经备好。',at:eventAt-3*hour,status:'active'}];
        r.events=[{id:'basis-event',kind:'life',title:'合成材料',detail:'合成材料',at:eventAt-3*hour,messageId:'basis-message',sourceRevision:0,source:'confirmed',lifeEvidence:'confirmed',knownBy:[r.id]}];
      }
      let event;
      if(!live){
        const task=claimLifeTask([r],r,eventAt,true),prep=prepareLifeTask(r,data.user,task);
        [event]=commitLifeTask(r,task,prep,JSON.stringify({requestId:task.id,roleId:r.id,events:[{at:eventAt-20*60000,action:basis?'read':'walk',durationMinutes:5,...(basis?{focus:{sourceId:'event:basis-event',quote:'合成材料'}}:{location:{sourceId:'profile:'+r.id,quote:'旧港口'}})}]}),eventAt);
      }
      if(diary)r.diaryTasks=[{id:'manual-history-diary',roleId:r.id,dateKey:toLocalDateKey(eventAt),status:'failed',attempts:0,createdAt:at,updatedAt:at}];
      const other=createRole('合成隔离角色','','作家','安静','另一地点');
      Object.assign(other,{id:'other-history-actor',chats:[],events:[],diaries:[],lifeAt:at,lastDiaryCheckDay:today,firstMessageState:{status:'ready',updatedAt:at}});
      data.roles=[r,other];data.selected=null;data.settings={...data.settings,mode:'api',endpoint,model:'synthetic-history',autonomousLife:!diary};
      if(alter)alter(r,event,data);
      await p.clock.install({time:at-60000});await p.clock.pauseAt(at);
      await p.goto(url);
      await p.evaluate(({key,data,endpoint})=>{
        localStorage.setItem(key,JSON.stringify(data));
        localStorage.setItem('elsewhere-device-api-key-v1',JSON.stringify({endpoint,key:'SYNTHETIC_MOCK_ONLY'}));
      },{key,data,endpoint});
      const ready=(page=p)=>page.locator('#app[data-storage-state=ready]').waitFor();
      const reload=async()=>{await p.reload();await ready();};
      const raw=()=>p.evaluate(key=>localStorage.getItem(key),key);
      const saved=async()=>JSON.parse(await raw());
      const owner=async()=>(await saved()).roles[0];
      const landing=async()=>{
        if(await p.locator('#landing-backup-file').count())return;
        await p.locator('[data-action=view][data-view=home]:visible').first().click();
        await p.getByRole('button',{name:'切换角色'}).click();
      };
      const enter=async()=>{await landing();await p.locator('[data-action=enter][data-id=life-history-actor]').click();};
      const openApp=async(name)=>{await enter();await p.locator('[data-home-page="1"]').click();await p.getByRole('button',{name:'打开'+name,exact:true}).click();};
      const monitor=()=>openApp('监控');
      const edit=async(fields)=>{
        await landing();await p.locator('[data-action=editrole][data-id=life-history-actor]').click();
        for(const [name,value]of Object.entries(fields))await p.locator('#role-form [name="'+name+'"]').fill(value);
        await p.getByTestId('save-role-form-btn').click();
      };
      const phone=async()=>{await enter();await p.locator('.dock [data-view=chat]').click();};
      const send=async(text)=>{await p.locator('#message-input').fill(text);await p.locator('#message-form .send-btn').click();};
      const lifeCards=p.locator('[data-fp-category=life]');
      const imported=async(world)=>{
        await landing();
        await p.locator('#landing-backup-file').setInputFiles({name:'synthetic-history.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(world))});
        await p.locator('.toast').filter({hasText:'已导入备份及媒体附件'}).waitFor();
      };
      await reload();
      await check({ctx,p,ready,raw,saved,owner,reload,landing,monitor,lifeCards,edit,phone,send,openApp,imported,posts,release,event,seed:data});
      assert.deepEqual(postUrls,posts.map(()=>endpoint+'/chat/completions'),'all actual POSTs accounted for');
      assert.deepEqual(errors,[],'uncaught browser errors');
      console.log('PASS '+label+' | POST='+posts.length+' | life='+posts.filter(x=>x.kind==='life').length+' | diary='+posts.filter(x=>x.kind==='diary').length);
    }catch(error){failures++;console.error('FAIL '+label+' | POST='+posts.length,error);}
    finally{release();await ctx.close();}
  }
  try{
    await run('profile edits retain a completed event ID, time and stored source snapshot',async t=>{
      const original=JSON.stringify({events:(await t.owner()).events,tasks:(await t.owner()).lifeTasks});
      await t.monitor();assert.equal(await t.lifeCards.count(),1);
      for(const fields of [{name:'合成新名'},{job:'作家'},{traits:'外向'},{place:'新山城'},{profile:'新的写作背景'},{relationship:'新关系'},{canonNotes:'新的边界'}]){
        await t.edit(fields);await t.monitor();
        assert.equal(await t.lifeCards.count(),1,Object.keys(fields)[0]);
        await t.lifeCards.locator('[data-action=monitor-detail]').first().click();
        const details=t.p.locator('dialog.monitor-detail .life-provenance');
        await details.locator('summary').click();
        assert.match(await details.innerText(),/旧档案.*仅解释当时/);
        await t.p.getByRole('button',{name:'关闭记录',exact:true}).click();
        const r=await t.owner();assert.equal(JSON.stringify({events:r.events,tasks:r.lifeTasks}),original);
      }
      await t.reload();await t.monitor();assert.equal(await t.lifeCards.count(),1);
      await t.p.clock.fastForward(120000);
      assert.equal(t.posts.length,0);
    });
    await run('chat sends current identity and explicitly dated old-profile history in one POST',async t=>{
      await t.edit({name:'合成新名',job:'作家',place:'新山城',relationship:'新关系'});
      await t.phone();await t.send('还记得之前的生活记录吗？');await t.p.clock.fastForward(122000);
      await wait(()=>t.posts.length===1,'one phone POST');
      await wait(async()=>(await t.owner()).chats.some(m=>m.speaker==='char'),'phone result saved');
      const wire=t.posts[0].wire;
      if(process.env.LIFE_WIRE_PROOF)console.log('WIRE_PROOF '+JSON.stringify({
        estimatedInputTokens:estimateTextTokens(wire),eventId:t.event.id,
        currentIdentity:wire.match(/身份：作家/)?.[0],
        historicalLines:wire.split('\n').filter(line=>line.includes('[生活记录 '+t.event.id+' ·')).map(line=>line.slice(0,180)),
      }));
      assert.match(wire,/身份：作家/);assert.match(wire,/新山城/);assert.match(wire,/新关系/);
      assert.ok(wire.includes('[生活记录 '+t.event.id+' ·'));assert.match(wire,/旧档案历史/);
      assert.doesNotMatch(wire,/此刻地点：旧港口/);
      assert.equal((await t.owner()).events.filter(e=>e.lifeRecord).length,1);
    });
    await run('manual diary uses the same verified history and latest profile without regenerating life',async t=>{
      await t.edit({name:'合成新名',job:'作家',place:'新山城',relationship:'新关系'});
      await t.openApp('日记');
      t.p.once('dialog',d=>d.accept());
      await t.p.locator('[data-action=retrydiary][data-date="'+t.seed.roles[0].diaryTasks[0].dateKey+'"]').click();
      await wait(()=>t.posts.length===1,'one explicit diary POST');
      await wait(async()=>(await t.owner()).diaries.some(d=>d.text==='合成历史日记。'),'diary archived');
      assert.equal(t.posts[0].kind,'diary');
      assert.ok(t.posts[0].wire.includes('[生活记录 '+t.event.id+' ·'));
      assert.match(t.posts[0].wire,/旧档案历史/);assert.match(t.posts[0].wire,/身份与职业：作家/);
      await t.reload();assert.equal((await t.owner()).diaries.filter(d=>d.text==='合成历史日记。').length,1);
      assert.equal(t.posts.length,1);
    },{diary:true});
    await run('profile save failure keeps the original archive and editable form',async t=>{
      const raw=await t.raw();
      await t.p.evaluate(()=>window.historyFixture.failRole=true);
      await t.edit({name:'拒写新名'});
      assert.equal(await t.p.locator('#role-form [name=name]').inputValue(),'拒写新名');
      assert.equal((await t.owner()).name,'合成旧名');
      assert.equal((await t.owner()).events[0].id,t.event.id);
      assert.equal(await t.p.evaluate(()=>window.historyFixture.failures),1);
      await t.p.evaluate(()=>window.historyFixture.failRole=false);
      await t.p.getByTestId('save-role-form-btn').click();
      await t.monitor();assert.equal(await t.lifeCards.count(),1);
      assert.equal(t.posts.length,0);assert.notEqual(await t.raw(),raw);
    });
    await run('confirmed history round-trips through an older backup and same-ID replacement',async t=>{
      await t.edit({name:'合成新名',job:'作家'});await t.monitor();
      const snapshot=(await t.owner()).events;
      await t.landing();
      const download=await Promise.all([t.p.waitForEvent('download'),t.p.locator('[data-action=export]').first().click()]);
      const stream=await download[0].createReadStream();const chunks=[];
      for await(const chunk of stream)chunks.push(chunk);
      const exported=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      delete exported.draftWorldId;
      await t.imported(exported);
      assert.deepEqual((await t.owner()).events,snapshot);
      await t.monitor();assert.equal(await t.lifeCards.count(),1);
      await t.reload();await t.monitor();assert.equal(await t.lifeCards.count(),1);
      assert.equal(t.posts.length,0);
    });
    await run('source edit invalidates derived history without deleting the stored event',async t=>{
      await t.phone();
      const message=t.p.locator('[data-msg-id=basis-message]');
      await message.locator('[data-action=starteditmsg]').click();
      await t.p.locator('#inline-edit-form textarea').fill('合成材料尚未备好。');
      await t.p.locator('#inline-edit-form button[type=submit]').click();
      await t.edit({name:'合成新名'});await t.monitor();
      assert.equal(await t.lifeCards.count(),0);
      assert.ok((await t.owner()).events.some(e=>e.id===t.event.id));
      assert.equal(t.posts.length,0);
    },{basis:true});
    await run('source withdrawal invalidates derived history after profile change',async t=>{
      await t.phone();t.p.once('dialog',d=>d.accept());
      await t.p.locator('[data-msg-id=basis-message] [data-action=retractmsg]').click();
      await t.edit({name:'合成新名'});await t.monitor();
      assert.equal(await t.lifeCards.count(),0);
      assert.ok((await t.owner()).events.some(e=>e.id===t.event.id));
      assert.equal(t.posts.length,0);
    },{basis:true});
    await run('explicit history withdrawal stays withdrawn through rename and refresh',async t=>{
      await t.monitor();await t.lifeCards.locator('[data-action=monitor-detail]').first().click();
      await t.p.locator('dialog.monitor-detail .life-provenance summary').click();t.p.once('dialog',d=>d.accept());
      await t.p.locator('[data-action=retractlife]').click();
      await t.edit({name:'合成新名'});await t.reload();await t.monitor();
      assert.equal(await t.lifeCards.count(),0);
      assert.equal((await t.owner()).events.find(e=>e.id===t.event.id).status,'retracted');
      assert.equal(t.posts.length,0);
    });
    for(const [name,alter]of [
      ['missing task',(r)=>{r.lifeTasks=[];}],
      ['unfinished task',(r)=>{r.lifeTasks[0].status='attempted';}],
      ['wrong event ID',(r,e)=>{e.id='foreign-event';r.lifeTasks[0].eventIds=[e.id];}],
      ['foreign role',(r,e)=>{e.lifeRecord.roleId='foreign-role';}],
      ['malformed snapshot',(r,e)=>{e.lifeRecord.sources[0].version='[]';}],
      ['duplicate event',(r,e)=>{r.events.push(structuredClone(e));}],
      ['wrong source version',(r,e)=>{e.lifeRecord.sources[0].at--; }],
    ])await run('invalid provenance rejects '+name+' despite parseable profile JSON',async t=>{
      await t.monitor();assert.equal(await t.lifeCards.count(),0);
      assert.ok((await t.owner()).events.length>0);
      await t.phone();await t.send('还记得之前的生活记录吗？');await t.p.clock.fastForward(122000);
      await wait(()=>t.posts.length===1,'one phone POST without unverified history');
      assert.ok(!t.posts[0].wire.includes('[生活记录 '+t.event.id+' ·'));
    },{alter});
    await run('same role and event IDs in another world do not borrow missing task evidence',async t=>{
      await t.edit({name:'合成新名'});const other=await t.saved();
      other.roles[0].lifeTasks=[];other.roles[0].firstMessageState.updatedAt=at;
      await t.imported(other);await t.monitor();assert.equal(await t.lifeCards.count(),0);
      assert.equal((await t.owner()).events[0].id,t.event.id);
      assert.equal(t.posts.length,0);
    });
    await run('a live request changed mid-flight cannot establish a completed event',async t=>{
      await wait(()=>t.posts.length===1,'life POST started');
      await t.edit({job:'作家'});
      t.release();
      await wait(()=>t.p.evaluate(()=>{
        const journal=JSON.parse(localStorage.getItem('elsewhere-life-budget-v1')||'null');
        return journal?.tasks?.some(t=>t.roleId==='life-history-actor'&&t.status==='failed');
      }),'stale request recorded as failed in the durable cost journal');
      assert.equal((await t.owner()).lifeTasks[0].status,'attempted');
      assert.equal((await t.owner()).events.filter(e=>e.lifeRecord).length,0);
      await t.reload();await t.p.clock.fastForward(120000);assert.equal(t.posts.length,1);
    },{live:true,hold:true});
    await run('life archive refusal preserves failure status and never reissues the task',async t=>{
      await wait(async()=>(await t.owner()).lifeTasks?.[0]?.status==='failed','archive save refusal');
      assert.equal(t.posts.length,1);assert.equal((await t.owner()).events.filter(e=>e.lifeRecord).length,0);
      await t.reload();await t.p.clock.fastForward(120000);assert.equal(t.posts.length,1);
    },{live:true,archiveFailure:true});
    await run('a completed live task remains one POST after repeated profile edits and refresh',async t=>{
      await wait(async()=>(await t.owner()).lifeTasks?.[0]?.status==='completed','live event archived');
      const original=(await t.owner()).events.find(e=>e.lifeRecord),taskId=original.lifeRecord.taskId;
      await t.edit({name:'合成新名',job:'作家',place:'新山城'});await t.monitor();
      assert.equal(await t.lifeCards.count(),1);await t.reload();await t.monitor();
      assert.deepEqual((await t.owner()).events.find(e=>e.lifeRecord),original);
      assert.equal((await t.owner()).lifeTasks.filter(task=>task.id===taskId).length,1);
      await t.p.clock.fastForward(120000);assert.equal(t.posts.length,1);
    },{live:true});
    await run('another writer updating the world blocks stale profile saves while preserving history',async t=>{
      const b=await t.ctx.newPage();b.setDefaultTimeout(8000);
      try{
        await b.clock.install({time:at-60000});await b.clock.pauseAt(at);await b.goto(url);await t.ready(b);
        await b.locator('#app[data-write-access=read-only]').waitFor();
        await b.locator('[data-action=editrole][data-id=life-history-actor]').click();
        await b.locator('#role-form [name=name]').fill('过期页面改名');
        await t.edit({name:'另页已保存名'});
        const confirmed=await t.raw();
        await b.getByTestId('save-role-form-btn').click();
        assert.equal(await b.locator('#role-form [name=name]').inputValue(),'过期页面改名');
        assert.equal(await t.raw(),confirmed);
        assert.equal((await t.owner()).events[0].id,t.event.id);
      }finally{await b.close();}
      await t.reload();await t.monitor();assert.equal(await t.lifeCards.count(),1);
      assert.equal((await t.owner()).name,'另页已保存名');assert.equal(t.posts.length,0);
    });
    await run('timezone change does not reinterpret the archived task date as an invalid receipt',async t=>{
      await t.edit({name:'合成新名'});await t.monitor();assert.equal(await t.lifeCards.count(),1);
      assert.equal((await t.owner()).lifeTasks[0].dateKey,t.seed.roles[0].lifeTasks[0].dateKey);
      assert.equal(t.posts.length,0);
    },{tz:'Asia/Tokyo'});
    if(new URL(url).protocol==='https:')await run('real BFCache restores changed-profile history without any POST',async t=>{
      await t.edit({name:'合成新名'});await t.monitor();
      const doc=await t.p.evaluate(()=>window.historyFixture.document);
      await t.p.goto(away);await t.p.goBack({waitUntil:'commit'});await t.ready();
      await t.p.waitForFunction(()=>window.historyFixture.shows.at(-1)===true);
      assert.equal(await t.p.evaluate(()=>window.historyFixture.document),doc);
      await t.p.locator('#app[data-write-access=writer]').waitFor();
      assert.equal(await t.lifeCards.count(),1);assert.equal(t.posts.length,0);
    });
  }finally{clearTimeout(deadline);await browser.close();}
  if(failures)process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
