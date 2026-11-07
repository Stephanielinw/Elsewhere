const assert=require('node:assert/strict');
const approveBackupImports=require('./backup-confirmation.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

const url=process.env.TEST_URL||pathToFileURL(process.cwd()+'/public/Elsewhere_Phase1_Standalone.html').href;
const endpoint='https://timeout-fixture.invalid/v1';
const away=new URL('timeout-fixture-away',url).href;
const key='elsewhere-v01';
const at=Date.parse('2026-11-06T22:00:00Z');
const day='2026-11-06';
const ready=p=>p.locator('#app[data-storage-state=ready]').waitFor();
const paw=p=>p.locator('[data-action=intermissionreply]');
const wait=async(read,label)=>{
  for(let i=0;i<150;i++){
    if(await read())return;
    await new Promise(resolve=>setTimeout(resolve,30));
  }
  throw Error('Timeout: '+label);
};

async function main(){
  const {defaults,createRole}=await import('../src/core/defaults.ts');
  const {createActiveFocusSession,ensureFocusStateNormalized}=await import('../src/core/focus.ts');
  const browser=await chromium.launch({ignoreDefaultArgs:['--disable-back-forward-cache'],...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  let failures=0,passed=0,totalPosts=0;

  async function run(name,options,check){
    if(process.env.TEST_CASE&&!name.includes(process.env.TEST_CASE))return;
    const ctx=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Los_Angeles',ignoreHTTPSErrors:true,serviceWorkers:'block'});
    await approveBackupImports(ctx);
    const posts=[],wire=[],errors=[];
    let bootstrap=true,releaseHeaders;
    const headerGate=new Promise(resolve=>{releaseHeaders=resolve;});
    try{
      ctx.on('request',req=>{if(req.method()==='POST')wire.push(req.url());});
      ctx.on('page',p=>p.on('pageerror',error=>errors.push(error.message)));
      await ctx.route('**/*',async route=>{
        const req=route.request(),dest=req.url();
        if(bootstrap&&req.isNavigationRequest()){
          bootstrap=false;
          return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated seed</title>'});
        }
        if(dest===away&&req.method()==='GET')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated navigation</title>'});
        if(dest===endpoint+'/chat/completions'){
          const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST','access-control-allow-headers':'*'};
          if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
          assert.equal(req.method(),'POST');
          const body=req.postDataJSON(),index=posts.push(body);
          if(options.headers===index)await headerGate;
          const content=options.kind==='live'?JSON.stringify({title:'合成实况',detail:'合成实况正文',statusText:'合成状态'}):'合成回复 '+index;
          return route.fulfill({headers,json:{choices:[{message:{role:'assistant',content},finish_reason:'stop'}]}}).catch(()=>{});
        }
        if(req.method()==='GET'&&(new URL(dest).protocol==='file:'||new URL(dest).origin===new URL(url).origin))return route.continue();
        return route.abort();
      });
      await ctx.addInitScript(({key,endpoint,holdBody,failText,failClaim})=>{
        const fixture=window.timeoutFixture={holdBody,release:null,reads:0,failText,failClaim,failed:0,document:Math.random(),shows:[]};
        addEventListener('pageshow',e=>fixture.shows.push(e.persisted));
        const nativeFetch=window.fetch.bind(window);
        window.fetch=async(input,options)=>{
          if(String(input)!==endpoint+'/chat/completions'||options?.method!=='POST'||++fixture.reads!==fixture.holdBody)return nativeFetch(input,options);
          const response=await nativeFetch(input,{...options,signal:undefined});
          return {ok:response.ok,status:response.status,json:async()=>{
            const reject=await new Promise(resolve=>{fixture.release=resolve;});
            if(reject)throw Error('fixture late rejection');
            return response.json();
          }};
        };
        const set=Storage.prototype.setItem;
        Storage.prototype.setItem=function(k,v){
          if(k===key&&(fixture.failText&&v.includes(fixture.failText)||
             fixture.failClaim&&Object.values(JSON.parse(v).roles[0]?.play?.intermissionAttempts||{}).some(a=>a.status==='unknown'))){
            fixture.failed++;throw Error('fixture save rejection');
          }
          return set.call(this,k,v);
        };
      },{key,endpoint,holdBody:options.body||0,failText:options.failText||'',failClaim:!!options.failClaim});
      const p=await ctx.newPage();
      p.setDefaultTimeout(5000);
      await p.clock.install({time:at-60000});
      await p.clock.pauseAt(at);
      const world=defaults();
      const roles=world.roles=Array.from({length:3},(_,i)=>{
        const r=createRole('合成角色'+i,'','馆员','谨慎','虚构港口');
        Object.assign(r,{id:'timeout-role-'+i,chats:[],events:[],diaries:[],lifeAt:at,lastDiaryCheckDay:day,firstMessageState:{status:'ready',updatedAt:at}});
        if(!options.kind)r.play={id:'same-play-id',title:'合成戏剧',world:'测试剧场',user:'来访者',char:'留守者',startedAt:at-60000,paused:true,messages:[],intermissionMessages:[]};
        return r;
      });
      world.selected=null;
      world.settings={...world.settings,mode:'api',endpoint,model:'synthetic-timeout',autonomousLife:false};
      world.focus=ensureFocusStateNormalized(world.focus,roles);
      const ids=roles.map(r=>r.id);
      if(options.kind==='summary'){
        world.focus.completed=[{id:'timeout-summary',ownerId:ids[0],phase:'work',minutes:25,companion:true,startedAt:at-120000,finishedAt:at-1000,actualElapsedMs:119000,dateKey:day,moments:[],tasks:['合成专注'],participantRoleIds:ids,roleSummaries:[],summaryStatus:'ready'}];
      }
      if(options.kind==='live'){
        const f=createActiveFocusSession({minutes:25,tasks:['合成专注'],invitedRoleIds:[ids[0]],roles,nowTs:at-120000,forceDecisionByRoleId:{[ids[0]]:'accept'}});
        f.liveLogBusy=true;
        f.nextLiveLogDueAt=at+1000;
        f.moments.push({id:'old-moment-without-attempt',roleId:ids[0],source:'focus-live-log',index:f.moments.length,at:at-5000,icon:'·',title:'旧实况',detail:'旧实况必须保留'});
        world.focus.active=f;
      }
      if(options.kind==='diary')roles[0].diaryTasks=[{id:'fixture-diary',roleId:ids[0],dateKey:'2026-11-05',status:'pending',attempts:0,createdAt:at,updatedAt:at}];
      await p.goto(url);
      await p.evaluate(({key,world,endpoint})=>{
        localStorage.setItem(key,JSON.stringify(world));
        localStorage.setItem('elsewhere-device-api-key-v1',JSON.stringify({endpoint,key:'SYNTHETIC_TIMEOUT_FIXTURE'}));
      },{key,world:options.importFirst?{...world,focus:{...world.focus,active:null}}:world,endpoint});
      const reload=async(page=p)=>{await page.reload();await ready(page);};
      const saved=async()=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
      const role=async(i=0)=>(await saved()).roles[i];
      const attempt=async()=>Object.values((await role()).play.intermissionAttempts||{})[0];
      const enter=async(i=0,page=p)=>page.locator(`[data-action=enter][data-id=timeout-role-${i}]`).click();
      const stage=async(i=0,page=p)=>{await enter(i,page);await page.locator('[data-action=resume]').click();};
      const back=async()=>{
        await p.locator('[data-action=view][data-view=home]:visible').first().click();
        await p.getByRole('button',{name:'切换角色'}).click();
      };
      const send=async(text='合成幕间发言')=>{
        await p.locator('#intermission-input').fill(text);
        await p.locator('#intermission-form button[type=submit]').click();
      };
      const confirm=accept=>p.once('dialog',async dialog=>{
        assert.match(dialog.message(),/再次计费/);
        if(accept)await dialog.accept();else await dialog.dismiss();
      });
      const summary=()=>p.getByTestId('retry-focus-summary-btn');
      const openSummary=async()=>{await enter();await p.locator('.dock [data-view=focus]').click();await p.locator('[data-action=openfocusrecord]').first().click();};
      const upload=async w=>p.locator('#landing-backup-file').setInputFiles({name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(w))});
      const openScene=async()=>{
        await enter();await p.locator('.dock [data-view=chat]').click();
        await p.locator('#message-input').fill('合成见面原话');
        await p.locator('#message-form .send-btn').click();
        await p.locator('[data-action=offline-round]').click();
        await p.locator('[data-action=chatpanel][data-panel=more]').click();
        await p.locator('.chat-drawer [data-action=meet]').click();
      };
      const bodyReady=async()=>wait(()=>p.evaluate(()=>typeof window.timeoutFixture.release==='function'),'body read has started');
      const release=async(reject=false)=>p.evaluate(reject=>window.timeoutFixture.release(reject),reject);
      const count=n=>wait(()=>posts.length===n,n+' Mock POST');
      const advance=(ms=90001)=>p.clock.fastForward(ms);
      const chars=async(i=0)=>(await role(i)).play.intermissionMessages.filter(m=>m.speaker==='char').length;
      await reload();
      await check({p,ctx,world,posts,saved,role,attempt,enter,stage,back,send,confirm,summary,openSummary,openScene,upload,reload,bodyReady,release,releaseHeaders,count,advance,chars});
      assert.deepEqual(wire,posts.map(()=>endpoint+'/chat/completions'),'all actual model POSTs reached the Mock');
      assert.deepEqual(errors,[],'no unhandled browser errors');
      assert.equal(posts.length,options.posts);
      passed++;
      totalPosts+=posts.length;
      console.log('PASS '+name+' | POST='+posts.length);
    }catch(error){failures++;console.error('FAIL '+name+' | POST='+posts.length,error);}
    finally{releaseHeaders();await ctx.close();}
  }

  try{
    await run('intermission header deadline, refresh, confirmed retry and no duplicate archive',{headers:1,posts:2},async t=>{
      await t.stage();await t.send();assert.equal(t.posts.length,0);
      await paw(t.p).click();await t.count(1);
      await paw(t.p).evaluate(el=>el.click());
      const first=await t.attempt();
      await t.advance();await wait(async()=>!(await paw(t.p).isDisabled()),'header timeout releases paw');
      await t.reload();await t.stage();assert.equal((await t.attempt()).id,first.id);
      assert.match(await t.p.locator('.intermission-panel [role=status]').innerText(),/可能已计费/);
      t.confirm(false);await paw(t.p).click();assert.equal(t.posts.length,1);
      t.confirm(true);await paw(t.p).click();await t.count(2);
      await wait(async()=>(await t.attempt()).status==='archived','retry archived');
      assert.notEqual((await t.attempt()).id,first.id);
      t.releaseHeaders();await t.advance();
      await paw(t.p).click();assert.equal(await t.chars(),1);
      assert.equal((await t.role()).play.intermissionMessages.filter(m=>m.speaker==='me').length,1);
    });
    await run('intermission body ignores abort and a late rejection cannot affect newer attempt',{body:1,headers:2,posts:2},async t=>{
      await t.stage();await t.send();await paw(t.p).click();await t.bodyReady();
      await t.advance();await wait(async()=>!(await paw(t.p).isDisabled()),'body timeout releases paw');
      assert.equal((await t.attempt()).status,'unknown');assert.equal(await t.chars(),0);
      t.confirm(true);await paw(t.p).click();await t.count(2);
      await t.release(true);
      await t.p.evaluate(()=>Promise.resolve());
      assert.equal(await paw(t.p).isDisabled(),true);
      t.releaseHeaders();
      await wait(async()=>await t.chars()===1,'new attempt saved');
      assert.equal((await t.attempt()).status,'archived');
    });
    await run('intermission claim rejection never dispatches',{failClaim:true,posts:0},async t=>{
      await t.stage();await t.send();await paw(t.p).click();
      await wait(()=>t.p.evaluate(()=>window.timeoutFixture.failed===1),'claim save failed');
      assert.equal(await t.attempt(),undefined);assert.equal(await t.chars(),0);
    });
    await run('intermission rejected archive leaves only scoped copy and durable uncertainty',{failText:'合成回复 1',posts:1},async t=>{
      await t.stage();await t.send();await paw(t.p).click();await t.count(1);
      const copy=t.p.locator('[data-action=copy-intermission-reply]');
      await copy.waitFor();await copy.click();
      assert.equal(await t.p.getByRole('textbox',{name:'可复制的未确认回复'}).inputValue(),'合成回复 1');
      await t.p.getByRole('button',{name:'关闭',exact:true}).click();
      assert.equal(await t.chars(),0);assert.equal((await t.attempt()).status,'unknown');
      assert.doesNotMatch(JSON.stringify(await t.saved()),/合成回复 1/);
      await t.back();await t.stage(1);assert.equal(await copy.count(),0);
      await t.back();await t.stage();assert.equal(await copy.count(),1);
      await t.reload();await t.stage();assert.equal(await copy.count(),0);
      assert.match(await t.p.locator('.intermission-panel [role=status]').innerText(),/可能已计费/);
    });
    await run('ordinary role navigation keeps a valid result in the original Play',{body:1,posts:1},async t=>{
      await t.stage();await t.send();await paw(t.p).click();await t.bodyReady();
      await t.back();await t.stage(1);await t.release();
      await wait(async()=>await t.chars()===1,'original role archived');
      assert.equal(await t.chars(1),0);
      assert.equal((await t.saved()).logs.find(log=>log.detail==='用户通过爪印触发戏外 AI 回复').roleId,'timeout-role-0');
    });
    await run('world replacement with the same role and Play IDs rejects the old result',{body:1,posts:1},async t=>{
      await t.stage();await t.send();await paw(t.p).click();await t.bodyReady();
      await t.back();await t.upload(t.world);
      await t.p.locator('.toast').filter({hasText:'已导入备份'}).waitFor();
      await t.release();await t.advance();
      assert.equal(await t.chars(),0);assert.equal(await t.attempt(),undefined);
    });
    await run('a saved intermission source change invalidates a late body',{body:1,posts:1},async t=>{
      await t.stage();await t.send();await paw(t.p).click();await t.bodyReady();
      await t.p.locator('.intermission-tools summary').click();
      await t.p.locator('#intermission-settings-form [name=world]').fill('新的合成设定');
      await t.p.locator('#intermission-settings-form button').click();
      await t.release();
      await wait(async()=>!(await paw(t.p).isDisabled()),'changed source released paw');
      assert.equal(await t.chars(),0);
      assert.equal((await t.attempt()).status,'unknown');
      assert.equal((await t.role()).play.world,'新的合成设定');
    });
    await run('same intermission task across two writers sends at most once',{body:1,posts:1},async t=>{
      await t.stage();await t.send();
      const b=await t.ctx.newPage();b.setDefaultTimeout(5000);
      await b.clock.install({time:at-60000});await b.clock.pauseAt(at);
      await b.goto(url);await ready(b);
      await b.locator('#app[data-write-access=read-only]').waitFor();
      await t.stage(0,b);
      await Promise.all([paw(t.p).click(),paw(b).click()]);
      await t.bodyReady();assert.equal(t.posts.length,1);
      await t.p.close();
      await t.reload(b);await b.locator('#app[data-write-access=writer]').waitFor();
      await t.stage(0,b);
      await b.locator('.intermission-panel [role=status]').filter({hasText:'可能已计费'}).waitFor();
      b.once('dialog',d=>d.dismiss());await paw(b).click();assert.equal(t.posts.length,1);
      const saved=await b.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
      assert.equal(saved.roles[0].play.intermissionMessages.length,1);
    });
    await run('Focus summary timeout stops before third role and keeps first confirmed',{kind:'summary',body:2,posts:4},async t=>{
      await t.openSummary();await t.summary().click();await t.bodyReady();
      await t.advance();
      const record=async()=>(await t.saved()).focus.completed[0];
      await wait(async()=>(await record()).summaryStatus==='failed','summary timeout finalized');
      const stopped=await record();
      assert.deepEqual(stopped.roleSummaries.map(s=>s.roleId),['timeout-role-0']);
      assert.equal(stopped.summaryRun.pendingRoleId,'timeout-role-1');assert.ok(stopped.summaryRun.pendingAttemptId);
      assert.deepEqual(stopped.summaryRun.remainingRoleIds,['timeout-role-1','timeout-role-2']);
      await t.release();await t.advance(1000);assert.equal(t.posts.length,2);
      await t.reload();await t.openSummary();assert.equal(t.posts.length,2);
      await t.p.evaluate(()=>window.timeoutFixture.holdBody=0);
      t.confirm(true);await t.summary().click();
      await wait(async()=>(await record()).summaryStatus==='ready','manual remainder archived');
      assert.equal((await record()).roleSummaries[0].text,'合成回复 1');
      assert.equal((await record()).roleSummaries.length,3);
    });
    await run('Focus summary save rejection stops later roles',{kind:'summary',failText:'合成回复 2',posts:2},async t=>{
      await t.openSummary();await t.summary().click();await t.count(2);
      const record=async()=>(await t.saved()).focus.completed[0];
      await wait(async()=>(await record()).summaryStatus==='failed','summary archive refusal');
      assert.deepEqual((await record()).roleSummaries.map(s=>s.roleId),['timeout-role-0']);
      assert.equal((await record()).summaryRun.pendingRoleId,'timeout-role-1');
      assert.equal(await t.summary().isEnabled(),true);
    });
    await run('Focus second role claim rejection prevents its POST and stops later roles',{kind:'summary',failText:'"pendingRoleId":"timeout-role-1"',posts:1},async t=>{
      await t.openSummary();await t.summary().click();await t.count(1);
      const record=async()=>(await t.saved()).focus.completed[0];
      await wait(async()=>(await record()).summaryStatus==='failed','summary claim refusal');
      assert.deepEqual((await record()).roleSummaries.map(s=>s.roleId),['timeout-role-0']);
      assert.equal((await record()).summaryRun.pendingRoleId,undefined);
      assert.deepEqual((await record()).summaryRun.remainingRoleIds,['timeout-role-1','timeout-role-2']);
    });
    await run('old Focus busy is released without replay, then a later independent moment can send',{kind:'live',importFirst:true,body:1,posts:2},async t=>{
      const legacy=t.world.focus.active;
      await t.upload(t.world);
      await t.p.locator('.toast').filter({hasText:'已导入备份'}).waitFor();
      const active=async()=>(await t.saved()).focus.active;
      assert.equal((await active()).liveLogBusy,undefined);assert.equal(t.posts.length,0);
      await t.advance(2000);await t.bodyReady();
      const first=(await active()).moments.find(m=>m.aiAttempt);
      assert.notEqual(first.id,'old-moment-without-attempt');assert.equal(first.aiAttempt.status,'unknown');
      await t.advance();await t.release();await t.advance(1000);
      const persisted=await active();
      assert.equal(persisted.status,'running');assert.equal(persisted.runSince,legacy.runSince);
      assert.deepEqual(persisted.moments.slice(0,legacy.moments.length),legacy.moments);
      assert.deepEqual(persisted.moments.find(m=>m.id===first.id),first);
      await t.reload();
      assert.equal(t.posts.length,1);
      await t.p.evaluate(()=>window.timeoutFixture.holdBody=0);
      await t.advance(persisted.nextLiveLogDueAt-await t.p.evaluate(()=>Date.now())+1000);
      await t.count(2);
      await wait(async()=>(await active()).moments.some(m=>m.aiAttempt?.status==='archived'),'new moment archived');
      assert.equal((await active()).moments.find(m=>m.id===first.id).aiAttempt.status,'unknown');
    });
    await run('diary releases hung body and does not archive or dispatch after refresh',{kind:'diary',body:1,posts:1},async t=>{
      await t.bodyReady();await t.advance();
      await wait(async()=>(await t.role()).diaryTasks.some(d=>d.status==='uncertain'),'diary receipt remains uncertain');
      await t.release();
      assert.equal((await t.role()).diaries.length,0);
      await t.reload();await t.advance();
      assert.equal((await t.role()).diaries.length,0);
    });
    await run('first Scene body timeout preserves unknown opening without a second POST',{kind:'scene',body:1,posts:1},async t=>{
      await t.openScene();
      await t.bodyReady();await t.advance();
      await t.p.locator('[data-action=resume-scene-opening]').waitFor();
      const opening=(await t.role()).scene.opening;
      assert.equal(opening.status,'unknown');
      await t.release();await t.reload();await t.enter();await t.p.locator('[data-action=openconversation]').click();
      await t.advance();assert.deepEqual((await t.role()).scene.opening,opening);
      assert.equal((await t.role()).scene.messages.filter(m=>m.speaker==='char').length,0);
    });
    await run('replacing a world during Scene opening releases the old busy state',{kind:'scene',body:1,posts:1},async t=>{
      await t.openScene();await t.bodyReady();
      await t.p.locator('[data-action=view][data-view=home]:visible').first().click();
      await t.p.locator('.dock [data-view=terminal]').click();
      t.world.roles[0].play={id:'replacement-play',title:'合成替换剧场',world:'测试剧场',user:'来访者',char:'留守者',startedAt:at-60000,paused:true,messages:[]};
      await t.p.locator('#backup-file').setInputFiles({name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(t.world))});
      await t.p.locator('.toast').filter({hasText:'已导入备份'}).waitFor();
      await t.stage();assert.equal(await paw(t.p).isEnabled(),true);
      await t.release();await t.advance();assert.equal((await t.role()).scene,null);
    });
    if(new URL(url).protocol==='https:')await run('real BFCache returns to uncertain intermission without resending',{body:1,posts:1},async t=>{
      await t.stage();await t.send();await paw(t.p).click();await t.bodyReady();
      const id=await t.p.evaluate(()=>window.timeoutFixture.document);
      await t.p.goto(away);await t.p.goBack({waitUntil:'commit'});await ready(t.p);
      await t.p.locator('#app[data-write-access=writer]').waitFor();
      assert.equal(await t.p.evaluate(()=>window.timeoutFixture.document),id);
      assert.equal(await t.p.evaluate(()=>window.timeoutFixture.shows.at(-1)),true);
      await t.p.locator('.intermission-panel [role=status]').filter({hasText:'可能已计费'}).waitFor();
      await t.release();await t.advance();assert.equal(await t.chars(),0);
    });
  }finally{await browser.close();}
  console.log(JSON.stringify({passed,failures,posts:totalPosts}));
  if(failures)process.exitCode=1;
}

main().catch(error=>{console.error(error);process.exitCode=1;});
