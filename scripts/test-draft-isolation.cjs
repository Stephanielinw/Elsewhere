const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const {chromium, devices} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.TEST_URL || pathToFileURL(process.cwd()+'/public/Elsewhere_Phase1_Standalone.html').href;
const endpoint = 'https://draft-fixture.invalid/v1';
const away = new URL('draft-fixture-away', url).href;
const at = Date.parse('2026-11-06T22:00:00Z');
const key = 'elsewhere-v01';
const draftPrefix = 'elsewhere-draft-v1:';
const canned = '这是一条合成回复。';
const poll = async (read, label) => {
  const until = Date.now()+8000;
  while (Date.now()<until) {
    if (await read()) return;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  throw Error('Timeout: '+label);
};

async function main() {
  const {defaults,createRole} = await import('../src/core/defaults.ts');
  const browser = await chromium.launch({
    ignoreDefaultArgs:['--disable-back-forward-cache'],
    ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {}),
  });
  const watchdog = setTimeout(()=>{process.exitCode=1;console.error('Draft suite exceeded its deadline');void browser.close();},150000);
  let failed=0;
  async function run(label,test,{scene=false,denyDraft=false,legacyOnly=false,modelFailure=false,noLocks=false}={}) {
    if (process.env.TEST_CASE && !label.includes(process.env.TEST_CASE)) return;
    const ctx = await browser.newContext({...devices['iPhone 13'],ignoreHTTPSErrors:true,serviceWorkers:'block',timezoneId:'America/Los_Angeles'});
    const p = await ctx.newPage();
    p.setDefaultTimeout(8000);
    p.setDefaultNavigationTimeout(8000);
    const posts=[], postUrls=[], errors=[];
    ctx.on('request',request=>{if(request.method()==='POST')postUrls.push(request.url());});
    ctx.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
    p.on('pageerror',error=>errors.push(error.message));
    let seed=true;
    try {
      await ctx.route('**/*',async route=>{
        const req=route.request(), dest=req.url();
        if (seed && req.isNavigationRequest()) {
          seed=false;
          return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Draft seed</title>'});
        }
        if (dest===endpoint+'/chat/completions') {
          const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST','access-control-allow-headers':'*'};
          if (req.method()==='OPTIONS') return route.fulfill({status:204,headers});
          assert.equal(req.method(),'POST');
          posts.push(req.postDataJSON());
          if(modelFailure)return route.fulfill({status:500,json:{error:'synthetic failure'},headers});
          return route.fulfill({json:{choices:[{message:{role:'assistant',content:canned},finish_reason:'stop'}]},headers});
        }
        if (dest===away && req.method()==='GET') return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Away</title>'});
        if (req.method()==='GET' && (new URL(dest).protocol==='file:' || new URL(dest).origin===new URL(url).origin)) return route.continue();
        return route.abort();
      });
      await ctx.addInitScript(({key,draftPrefix,denyDraft,noLocks})=>{
        window.draftFixture={page:Math.random(),shows:[],reject:'',failed:0};
        if(noLocks)Object.defineProperty(navigator,'locks',{value:undefined});
        addEventListener('pageshow',e=>window.draftFixture.shows.push(e.persisted));
        const get=Storage.prototype.getItem,set=Storage.prototype.setItem,remove=Storage.prototype.removeItem;
        Storage.prototype.getItem=function(k){
          if(denyDraft && k.startsWith(draftPrefix)) throw Error('draft storage denied');
          return get.call(this,k);
        };
        Storage.prototype.setItem=function(k,v){
          if(denyDraft && k.startsWith(draftPrefix)) throw Error('draft storage denied');
          if(k===key && window.draftFixture.reject && v.includes(window.draftFixture.reject)){
            window.draftFixture.failed++;
            throw Error('synthetic write failure');
          }
          return set.call(this,k,v);
        };
        Storage.prototype.removeItem=function(k){
          if(denyDraft && k.startsWith(draftPrefix)) throw Error('draft storage denied');
          if(window.draftFixture.denyRemove && k.startsWith(draftPrefix))throw Error('draft removal denied');
          return remove.call(this,k);
        };
      },{key,draftPrefix,denyDraft,noLocks});
      const world=defaults();
      world.roles=[0,1].map(i=>{
        const r=createRole('合成同名角色','','观察员','谨慎','虚构世界');
        Object.assign(r,{id:'draft-role-'+i,chats:[],diaries:[],events:[],meetings:[],lifeAt:at,lastDiaryCheckDay:'2026-11-06',firstMessageState:{status:'ready',updatedAt:at}});
        r.play={id:'shared-stage-id',title:'合成戏剧'+i,world:'测试剧场',user:'来访者',char:'留守者',startedAt:at-60000,messages:[{id:'saved-play-'+i,speaker:'me',text:'已保存的戏内发言'+i,at:at-50000,status:'active'}]};
        if(scene && i===0) r.scene={id:'shared-stage-id',where:'合成见面地点',startedAt:at-40000,draft:'OLD_SCENE_DRAFT',messages:[]};
        return r;
      });
      if(legacyOnly) world.roles[0].play=null;
      world.selected=world.roles[0].id;
      world.settings={...world.settings,mode:'api',endpoint,model:'synthetic',autonomousLife:false};
      await p.clock.install({time:at-60000});
      await p.clock.pauseAt(at);
      await p.goto(url);
      await p.evaluate(({world,endpoint,key})=>{
        localStorage.setItem(key,JSON.stringify(world));
        localStorage.setItem('elsewhere-device-api-key-v1',JSON.stringify({endpoint,key:'SYNTHETIC_MOCK_ONLY'}));
      },{world,endpoint,key});
      const ready=(page=p)=>page.locator('#app[data-storage-state=ready]').waitFor();
      const reload=async()=>{await p.reload();await ready();};
      const raw=()=>p.evaluate(k=>localStorage.getItem(k),key);
      const saved=async()=>JSON.parse(await raw());
      const enter=(i=0,page=p)=>page.locator(`[data-action=enter][data-id=draft-role-${i}]`).click();
      const back=async()=>{
        await p.locator('[data-action=view][data-view=home]:visible').first().click();
        await p.getByRole('button',{name:'切换角色'}).click();
      };
      const play=async(i=0)=>{await enter(i);await p.locator('[data-action=resume]').click();};
      const phone=async(i=0,page=p)=>{await enter(i,page);await page.locator('.dock [data-view=chat]').click();};
      const meeting=async()=>{await enter();await p.locator('[data-action=openconversation]').click();};
      const novel=p.locator('#novel-input'), backstage=p.locator('#intermission-input'), chat=p.locator('#message-input');
      const pause=()=>p.locator('[data-action=intermission]').click();
      const resume=()=>p.locator('[data-action=resumeplay]').click();
      const sendNovel=()=>p.locator('#novel-form button[type=submit], #novel-form button:not([type])').first().click();
      const sendBackstage=()=>p.locator('#intermission-form button[type=submit]').click();
      const keys=()=>p.evaluate(prefix=>Object.keys(sessionStorage).filter(k=>k.startsWith(prefix)),draftPrefix);
      const archive=()=>p.locator('[data-action=endnovel]').click();
      const failOn=text=>p.evaluate(text=>window.draftFixture.reject=text,text);
      const importWorld=async world=>{
        await p.locator('#landing-backup-file').setInputFiles({name:'synthetic-world.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(world))});
      };
      await reload();
      await test({p,ctx,ready,enter,back,play,phone,meeting,novel,backstage,chat,pause,resume,sendNovel,sendBackstage,raw,saved,reload,posts,keys,archive,failOn,importWorld});
      assert.deepEqual(postUrls,posts.map(()=>endpoint+'/chat/completions'),'all actual POSTs reached the expected Mock service');
      assert.deepEqual(errors,[],'uncaught browser errors');
      console.log('PASS '+label+' | POST='+posts.length);
    }catch(error){
      failed++;console.error('FAIL '+label+' | POST='+posts.length,error);
    }finally{await ctx.close();}
  }
  try {
    await run('same-name roles do not share performance drafts',async t=>{
      await t.play();await t.novel.fill('A_ONLY_PERFORMANCE');await t.back();
      await t.play(1);assert.equal(await t.novel.inputValue(),'');
      await t.novel.fill('B_PERFORMANCE');await t.sendNovel();
      await poll(()=>t.posts.length===1,'B performance POST');
      await poll(async()=> (await t.saved()).roles[1].play.messages.some(m=>m.text===canned),'B saved reply');
      assert.match(JSON.stringify(t.posts[0]),/B_PERFORMANCE/);
      assert.doesNotMatch(JSON.stringify(t.posts[0]),/A_ONLY_PERFORMANCE/);
      assert.doesNotMatch(await t.raw(),/A_ONLY_PERFORMANCE/);
      await t.back();await t.play();assert.equal(await t.novel.inputValue(),'A_ONLY_PERFORMANCE');
      await t.sendNovel();await poll(()=>t.posts.length===2,'A performance POST');
      assert.doesNotMatch(JSON.stringify(t.posts[1]),/B_PERFORMANCE/);
      assert.match(JSON.stringify(t.posts[1]),/A_ONLY_PERFORMANCE/);
    });
    await run('same-name roles do not share backstage drafts',async t=>{
      await t.play();await t.pause();await t.backstage.fill('A_ONLY_BACKSTAGE');
      await t.back();await t.play(1);await t.pause();assert.equal(await t.backstage.inputValue(),'');
      await t.backstage.fill('B_BACKSTAGE');await t.sendBackstage();
      assert.equal(await t.backstage.inputValue(),'');
      assert.equal(t.posts.length,0);assert.doesNotMatch(await t.raw(),/A_ONLY_BACKSTAGE/);
      await t.p.locator('[data-action=intermissionreply]').click();
      await poll(()=>t.posts.length===1,'backstage paw POST');
      await poll(async()=> (await t.saved()).roles[1].play.intermissionMessages.some(m=>m.speaker==='char'),'B saved backstage reply');
      assert.match(JSON.stringify(t.posts[0]),/B_BACKSTAGE/);
      assert.doesNotMatch(JSON.stringify(t.posts[0]),/A_ONLY_BACKSTAGE/);
      await t.back();await t.play();assert.equal(await t.backstage.inputValue(),'A_ONLY_BACKSTAGE');
    });
    await run('generic redraw does not restore a scoped textarea by ID',async t=>{
      const js=require('esbuild').buildSync({stdin:{
        resolveDir:process.cwd(),contents:`import {captureUIState,restoreUIState} from './src/core/domGuard.ts'; window.draftGuard={captureUIState,restoreUIState};`
      },bundle:true,format:'iife',write:false}).outputFiles[0].text;
      await t.p.addScriptTag({content:js});
      assert.deepEqual(await t.p.evaluate(()=>{
        const root=document.createElement('section');
        document.body.append(root);
        const markup='<textarea id="draft-scope-probe" data-scoped-draft></textarea><input id="draft-form-probe">';
        root.innerHTML=markup;
        root.children[0].value='other role';
        root.children[1].value='keep form';
        const snapshot=window.draftGuard.captureUIState(root);
        root.innerHTML=markup;
        window.draftGuard.restoreUIState(snapshot,false,root);
        const values=Array.from(root.children,el=>el.value);
        root.remove();
        return values;
      }),['','keep form']);
      assert.equal(t.posts.length,0);
    });
    await run('scene, performance and backstage keep separate drafts even with identical stage IDs',async t=>{
      await t.meeting();assert.equal(await t.novel.inputValue(),'OLD_SCENE_DRAFT');
      await t.novel.fill('SCENE_ONLY');await t.back();await t.play();
      assert.equal(await t.novel.inputValue(),'');
      await t.novel.fill('PERFORMANCE_ONLY');await t.pause();
      assert.equal(await t.backstage.inputValue(),'');
      await t.backstage.fill('BACKSTAGE_ONLY');
      await t.p.locator('.intermission-tools summary').click();
      await t.p.locator('[data-action=rollbackplay]').click();
      assert.equal(await t.backstage.inputValue(),'BACKSTAGE_ONLY');
      assert.equal((await t.saved()).roles[0].play.revisions.length,1);
      await t.resume();assert.equal(await t.novel.inputValue(),'PERFORMANCE_ONLY');
      await t.back();await t.meeting();assert.equal(await t.novel.inputValue(),'SCENE_ONLY');
      const raw=await t.raw();
      assert.doesNotMatch(raw,/SCENE_ONLY|PERFORMANCE_ONLY|BACKSTAGE_ONLY/);
      assert.equal(t.posts.length,0);
    },{scene:true});
    await run('explicit empty scene draft beats the legacy fallback through redraw and reload',async t=>{
      await t.meeting();assert.equal(await t.novel.inputValue(),'OLD_SCENE_DRAFT');
      await t.novel.fill('');
      await t.p.locator('[data-action=togglerevisions]').click();
      assert.equal(await t.novel.inputValue(),'');
      assert.equal((await t.saved()).roles[0].scene.draft,'OLD_SCENE_DRAFT');
      await t.reload();await t.meeting();assert.equal(await t.novel.inputValue(),'');
      await t.novel.fill('SCENE_SENT');
      await t.sendNovel();
      await poll(async()=> (await t.saved()).roles[0].scene.messages.some(m=>m.text===canned),'scene reply saved');
      assert.equal(t.posts.length,1);
      assert.match(JSON.stringify(t.posts[0]),/SCENE_SENT/);
      assert.doesNotMatch(JSON.stringify(t.posts[0]),/OLD_SCENE_DRAFT/);
      assert.equal((await t.saved()).roles[0].scene.draft,undefined);
      assert.equal((await t.keys()).some(k=>k.includes('"scene"')),false);
      await t.reload();await t.meeting();assert.equal(await t.novel.inputValue(),'');
    },{scene:true,legacyOnly:true});
    await run('failed scene archive preserves the draft; retry archives without it',async t=>{
      await t.meeting();await t.novel.fill('LIVE_SCENE_DRAFT');
      const raw=await t.raw();
      await t.failOn('这次见面结束');await t.archive();
      assert.match(await t.p.locator('.toast').innerText(),/保存失败/);
      assert.equal(await t.novel.inputValue(),'LIVE_SCENE_DRAFT');
      assert.equal(await t.raw(),raw);
      await t.failOn('');await t.archive();await t.chat.waitFor();
      const archived=(await t.saved()).roles[0].meetings;
      assert.equal(archived.length,1);assert.equal(archived[0].draft,undefined);
      assert.equal((await t.keys()).some(k=>k.includes('"scene"')),false);
      await t.p.locator('[data-action=chatpanel][data-panel=more]').click();
      await t.p.locator('.chat-drawer [data-action=meet]').click();
      assert.equal(await t.novel.inputValue(),'');
      assert.notEqual((await t.saved()).roles[0].scene.id,archived[0].id);
      assert.equal(t.posts.length,0);
    },{scene:true,legacyOnly:true});
    await run('ending a play clears only that play and backstage before opening a new play',async t=>{
      await t.play(1);await t.novel.fill('OTHER_ROLE_DRAFT');
      await t.back();await t.play();await t.novel.fill('OLD_PLAY_DRAFT');await t.pause();await t.backstage.fill('OLD_BACKSTAGE_DRAFT');
      await t.resume();await t.archive();await t.chat.waitFor();
      assert.equal((await t.saved()).roles[0].plays.length,1);
      const keys=await t.keys();
      assert.equal(keys.length,1);assert.match(keys[0],/draft-role-1/);
      await t.p.locator('[data-action=chatpanel][data-panel=more]').click();
      await t.p.locator('.chat-drawer [data-view=drama]').click();
      await t.p.locator('#play-start button').click();
      assert.equal(await t.novel.inputValue(),'');
      assert.notEqual((await t.saved()).roles[0].play.id,'shared-stage-id');
      await t.pause();assert.equal(await t.backstage.inputValue(),'');
      assert.doesNotMatch(await t.raw(),/OLD_PLAY_DRAFT|OLD_BACKSTAGE_DRAFT|OTHER_ROLE_DRAFT/);
      assert.equal(t.posts.length,0);
    });
    await run('save failure and duplicate submit keep exact text until one confirmed send',async t=>{
      await t.play();await t.novel.fill('\n  FAILED_PERFORMANCE  \n');
      const raw=await t.raw();
      await t.failOn('FAILED_PERFORMANCE');await t.sendNovel();
      assert.equal(await t.novel.inputValue(),'\n  FAILED_PERFORMANCE  \n');
      assert.equal(await t.raw(),raw);assert.equal(t.posts.length,0);
      assert.equal(await t.p.evaluate(()=>window.draftFixture.failed),1);
      await t.reload();await t.play();
      assert.equal(await t.novel.inputValue(),'\n  FAILED_PERFORMANCE  \n');
      await t.p.locator('#novel-form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});
      await poll(async()=> (await t.saved()).roles[0].play.messages.some(m=>m.text===canned),'retry reply saved');
      assert.equal(t.posts.length,1);
      assert.equal((await t.saved()).roles[0].play.messages.filter(m=>m.text==='FAILED_PERFORMANCE').length,1);
      assert.equal(await t.novel.inputValue(),'');assert.deepEqual(await t.keys(),[]);
    });
    await run('backstage failure preserves draft and successful send stays local',async t=>{
      await t.play();await t.pause();await t.backstage.fill('UNSAVED_BACKSTAGE');
      const raw=await t.raw();await t.failOn('UNSAVED_BACKSTAGE');await t.sendBackstage();
      assert.equal(await t.raw(),raw);assert.equal(await t.backstage.inputValue(),'UNSAVED_BACKSTAGE');
      await t.failOn('');await t.sendBackstage();assert.equal(await t.backstage.inputValue(),'');
      assert.equal((await t.saved()).roles[0].play.intermissionMessages.filter(m=>m.text==='UNSAVED_BACKSTAGE').length,1);
      assert.equal(t.posts.length,0);
    });
    await run('model failure after committed speech does not restore or resend the draft',async t=>{
      await t.play();await t.novel.fill('COMMITTED_BEFORE_MODEL_ERROR');await t.sendNovel();
      await poll(()=>t.posts.length===1,'failing model POST');
      await t.p.locator('#novel-form button:not([type]):enabled').waitFor();
      assert.equal(await t.novel.inputValue(),'');
      assert.equal((await t.saved()).roles[0].play.messages.some(m=>m.speaker==='char'),false);
      await t.reload();await t.play();
      assert.equal(await t.novel.inputValue(),'');
      assert.equal((await t.saved()).roles[0].play.messages.filter(m=>m.text==='COMMITTED_BEFORE_MODEL_ERROR').length,1);
      assert.equal(t.posts.length,1);
    },{modelFailure:true});
    await run('a detached form reinserted into the live app cannot send to another role',async t=>{
      await t.play();await t.novel.fill('STALE_ROLE_A');
      await t.p.locator('#novel-form').evaluate(form=>{window.oldDraftForm=form;});
      await t.back();await t.play(1);await t.novel.fill('CURRENT_ROLE_B');
      const raw=await t.raw();
      await t.p.evaluate(()=>{
        const old=window.oldDraftForm;
        document.querySelector('#app').append(old);
        old.requestSubmit();
        old.remove();
      });
      assert.equal(await t.raw(),raw);assert.equal(t.posts.length,0);
      await t.sendNovel();await poll(()=>t.posts.length===1,'current form POST');
      assert.doesNotMatch(JSON.stringify(t.posts[0]),/STALE_ROLE_A/);
      assert.match(JSON.stringify(t.posts[0]),/CURRENT_ROLE_B/);
    });
    await run('world ID stays stable after reload and failed import, then changes only for confirmed replacement',async t=>{
      const id=(await t.saved()).draftWorldId;
      assert.match(id,/^[a-f0-9]{32}$/);
      await t.play();await t.novel.fill('OLD_WORLD_DRAFT');await t.back();await t.reload();await t.play();
      assert.equal((await t.saved()).draftWorldId,id);
      assert.equal(await t.novel.inputValue(),'OLD_WORLD_DRAFT');await t.back();
      const raw=await t.raw(),backup=JSON.parse(raw);
      backup.roles[0].play.title='IMPORTED_WORLD';
      await t.failOn('IMPORTED_WORLD');await t.importWorld(backup);
      await t.p.locator('.toast').filter({hasText:'备份导入失败'}).waitFor();
      assert.equal(await t.raw(),raw);
      await t.play();assert.equal(await t.novel.inputValue(),'OLD_WORLD_DRAFT');await t.back();
      await t.failOn('');await t.importWorld(backup);
      await t.p.locator('.toast').filter({hasText:'已导入备份及媒体附件'}).waitFor();
      const after=await t.saved();assert.notEqual(after.draftWorldId,id);
      assert.match(after.draftWorldId,/^[a-f0-9]{32}$/);
      assert.deepEqual(after.roles.map(r=>[r.id,r.play.id]),backup.roles.map(r=>[r.id,r.play.id]));
      assert.equal((await t.keys()).some(k=>k.startsWith(draftPrefix+id+':')),false);
      await t.play();assert.equal(await t.novel.inputValue(),'');await t.reload();
      assert.equal((await t.saved()).draftWorldId,after.draftWorldId);
      assert.equal(t.posts.length,0);
    });
    await run('an old-world form with matching role and stage IDs cannot submit after import',async t=>{
      await t.play();await t.novel.fill('OLD_WORLD_UNSENT');
      await t.p.locator('#novel-form').evaluate(form=>{window.oldDraftForm=form;});
      await t.back();await t.importWorld(await t.saved());
      await t.p.locator('.toast').filter({hasText:'已导入备份及媒体附件'}).waitFor();
      await t.play();await t.novel.fill('NEW_WORLD_DRAFT');
      const raw=await t.raw();
      await t.p.evaluate(()=>{
        const old=window.oldDraftForm;
        document.querySelector('#app').append(old);old.requestSubmit();old.remove();
      });
      assert.equal(await t.raw(),raw);assert.equal(await t.novel.inputValue(),'NEW_WORLD_DRAFT');
      assert.equal(t.posts.length,0);
    });
    await run('deleting one role clears only that role drafts',async t=>{
      await t.play();await t.novel.fill('DELETE_ROLE_A');await t.back();
      await t.play(1);await t.novel.fill('KEEP_ROLE_B');await t.back();
      await t.p.locator('[data-action=editrole][data-id=draft-role-0]').click();
      await t.p.locator('[data-action=askdelete]').click();
      await t.p.locator('#delete-role-form [name=confirmName]').fill('合成同名角色');
      const raw=await t.raw(),keysBefore=await t.keys();
      await t.failOn('saved-play-1');
      await t.p.locator('#delete-role-form button').click();
      assert.equal(await t.raw(),raw);assert.deepEqual(await t.keys(),keysBefore);
      await t.failOn('');
      await t.p.locator('#delete-role-form button').click();
      assert.deepEqual((await t.saved()).roles.map(r=>r.id),['draft-role-1']);
      const keys=await t.keys();assert.equal(keys.length,1);assert.match(keys[0],/draft-role-1/);
      await t.play(1);assert.equal(await t.novel.inputValue(),'KEEP_ROLE_B');
      assert.equal(t.posts.length,0);
    });
    await run('ordinary navigation and role switches work when draft storage is denied',async t=>{
      await t.play();await t.novel.fill('MEMORY_PERFORMANCE');
      await t.pause();await t.backstage.fill('MEMORY_BACKSTAGE');await t.back();
      await t.play(1);assert.equal(await t.novel.inputValue(),'');await t.back();
      await t.play();assert.equal(await t.backstage.inputValue(),'MEMORY_BACKSTAGE');
      await t.resume();assert.equal(await t.novel.inputValue(),'MEMORY_PERFORMANCE');
      assert.deepEqual(await t.keys(),[]);assert.equal(t.posts.length,0);
    },{denyDraft:true});
    await run('failed tab-storage removal cannot refill successfully sent text',async t=>{
      await t.play();await t.novel.fill('SENT_ONCE_DESPITE_REMOVE_FAILURE');
      await t.p.evaluate(()=>window.draftFixture.denyRemove=true);
      await t.sendNovel();
      await poll(async()=> (await t.saved()).roles[0].play.messages.some(m=>m.text===canned),'reply persisted');
      assert.equal(await t.novel.inputValue(),'');
      await t.back();await t.play();assert.equal(await t.novel.inputValue(),'');
      assert.equal((await t.saved()).roles[0].play.messages.filter(m=>m.text==='SENT_ONCE_DESPITE_REMOVE_FAILURE').length,1);
      assert.equal(t.posts.length,1);
    });
    await run('readonly legacy load does not persist a new world identity',async t=>{
      const raw=await t.raw();assert.equal((await t.saved()).draftWorldId,undefined);
      assert.equal(await t.p.locator('#app').getAttribute('data-write-access'),'read-only');
      await t.play();await t.novel.fill('READONLY_LOCAL_DRAFT');
      await t.back();await t.play(1);assert.equal(await t.novel.inputValue(),'');
      await t.back();await t.play();assert.equal(await t.novel.inputValue(),'READONLY_LOCAL_DRAFT');
      assert.equal(await t.raw(),raw);assert.deepEqual(await t.keys(),[]);
      assert.equal(t.posts.length,0);
    },{noLocks:true});
    await run('phone draft without a pending round survives reload',async t=>{
      await t.phone();await t.chat.fill('PHONE_BEFORE_FIRST_SEND');
      await t.reload();await t.phone();assert.equal(await t.chat.inputValue(),'PHONE_BEFORE_FIRST_SEND');
      assert.doesNotMatch(await t.raw(),/PHONE_BEFORE_FIRST_SEND/);
      await t.p.locator('#message-form .send-btn').click();
      assert.equal((await t.saved()).roles[0].chats.filter(m=>m.text==='PHONE_BEFORE_FIRST_SEND').length,1);
      assert.equal(await t.chat.inputValue(),'');assert.equal(t.posts.length,0);
    });
    await run('independent tabs do not share drafts and F04 blocks readonly submission',async t=>{
      await t.phone();await t.chat.fill('TAB_A_DRAFT');
      const other=await t.ctx.newPage();
      try {
        await other.goto(url);await t.ready(other);
        assert.equal(await other.locator('#app').getAttribute('data-write-access'),'read-only');
        await t.phone(0,other);
        const draft=other.locator('#message-input');assert.equal(await draft.inputValue(),'');
        await draft.fill('TAB_B_DRAFT');const raw=await t.raw();
        await other.locator('#message-form').evaluate(form=>form.requestSubmit());
        assert.equal(await draft.inputValue(),'TAB_B_DRAFT');assert.equal(await t.raw(),raw);
        await other.reload();await t.ready(other);await t.phone(0,other);
        assert.equal(await draft.inputValue(),'TAB_B_DRAFT');
        assert.equal(await t.chat.inputValue(),'TAB_A_DRAFT');assert.equal(t.posts.length,0);
      } finally {await other.close();}
    });
    if(new URL(url).protocol==='https:')await run('real BFCache preserves the world ID and scoped draft',async t=>{
      await t.play();await t.novel.fill('BFCACHE_DRAFT');
      const id=(await t.saved()).draftWorldId,doc=await t.p.evaluate(()=>window.draftFixture.page);
      await t.p.goto(away);await t.p.goBack({waitUntil:'commit'});await t.ready();
      await t.p.waitForFunction(()=>window.draftFixture.shows.at(-1)===true);
      assert.equal(await t.p.evaluate(()=>window.draftFixture.page),doc);
      await t.p.locator('#app[data-write-access=writer]').waitFor();
      assert.equal((await t.saved()).draftWorldId,id);
      assert.equal(await t.novel.inputValue(),'BFCACHE_DRAFT');
      assert.equal(t.posts.length,0);
    });
  }finally{clearTimeout(watchdog);await browser.close();}
  if(failed) process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
