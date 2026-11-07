const assert=require('node:assert/strict');
const {readFile}=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

const url=process.env.TEST_URL||pathToFileURL(process.cwd()+'/public/Elsewhere_Phase1_Standalone.html').href;
const site=new URL(url);
assert.ok(site.protocol==='file:'||(['http:','https:'].includes(site.protocol)&&site.hostname==='127.0.0.1')||site.href==='https://stephanielinw.github.io/Elsewhere/');
const key='elsewhere-v01',db='elsewhere-media-v1',receipts='elsewhere-diary-requests-v1';
const at=Date.parse('2026-11-06T22:00:00Z');
const corrupt=' \t{合成的损坏主档\r\n';
const gif='R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const replacementGif=Buffer.from(gif,'base64');replacementGif[13]=42;
const raw=p=>p.evaluate(key=>window.protectionFixture.read(key),key);
const state=(p,name)=>p.locator('#app[data-storage-state='+name+']').waitFor();
const result=(p,text)=>p.locator('[data-storage-result]').filter({hasText:text}).waitFor();
const toast=(p,text)=>p.locator('.toast').filter({hasText:text}).waitFor();
const upload=(p,value,selector='#storage-backup-file')=>p.locator(selector).setInputFiles({
  name:'synthetic-backup.json',mimeType:'application/json',buffer:Buffer.from(typeof value==='string'?value:JSON.stringify(value)),
});
const restore=p=>p.locator('[data-storage-restore]').click();
const allow=(p,expected,answer=true)=>p.once('dialog',async d=>{
  assert.match(d.message(),expected);
  if(answer)await d.accept();else await d.dismiss();
});
async function download(p,button){
  const [file]=await Promise.all([p.waitForEvent('download'),p.locator(button).click()]);
  return {name:file.suggestedFilename(),bytes:await readFile(await file.path())};
}

async function idb(p,database,store,action,id,data){
  return p.evaluate(({database,store,action,id,data})=>new Promise((resolve,reject)=>{
    const request=indexedDB.open(database,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(store);
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result,tx=db.transaction(store,action==='put'?'readwrite':'readonly');
      const object=tx.objectStore(store);
      const op=action==='put'?object.put(data.blob?new Blob([Uint8Array.from(atob(data.blob),c=>c.charCodeAt(0))],{type:'image/gif'}):data,id):
        action==='get'?object.get(id):object.getAllKeys();
      tx.onabort=()=>{db.close();reject(tx.error);};
      tx.oncomplete=async()=>{
        db.close();
        if(op.result instanceof Blob){
          const bytes=new Uint8Array(await op.result.arrayBuffer());
          resolve(btoa(String.fromCharCode(...bytes)));
        }else resolve(op.result);
      };
    };
  }),{database,store,action,id,data});
}
const media=(p,id)=>idb(p,db,'blobs',id?'get':'keys',id);
const storeMedia=(p,id,blob=gif)=>idb(p,db,'blobs','put',id,{blob});

async function main(){
  const {defaults,createRole}=await import('../src/core/defaults.ts');
  const {claimLifeTask,prepareLifeTask,commitLifeTask}=await import('../src/core/autonomousLife.ts');
  const {diaryRequestKey}=await import('../src/core/diaryRequests.ts');
  const browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
  let passed=0,failures=0;
  const world=(name='合成恢复角色')=>{
    const data=defaults(),r=createRole(name,'','档案员','谨慎','合成港口');
    Object.assign(r,{id:'protection-role',chats:[],diaries:[],events:[],lifeAt:at,firstMessageState:{status:'ready',updatedAt:at-4*3600000},lastDiaryCheckDay:'2026-11-06'});
    return {...data,roles:[r],selected:null,settings:{...data.settings,autonomousLife:false}};
  };
  const backup=(name,withMedia=false)=>{
    const data={...world(name),version:1,settings:{endpoint:'',legacy:{retained:true}},futureBusiness:{untouched:true}};
    if(withMedia){
      data.roles[0].avatarMediaId='fixture-shared';
      data._media=[{id:'fixture-shared',data:'data:image/gif;base64,'+replacementGif.toString('base64')}];
    }
    return data;
  };

  async function run(name,initial,body,options={}){
    if(process.env.TEST_CASE&&!name.includes(process.env.TEST_CASE))return;
    const ctx=await browser.newContext({viewport:{width:390,height:720},timezoneId:'America/Los_Angeles',ignoreHTTPSErrors:true,serviceWorkers:'block'});
    const posts=[],errors=[];
    let seed=true;
    try{
      ctx.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
      ctx.on('page',p=>p.on('pageerror',error=>errors.push(error.message)));
      await ctx.route('**/*',route=>{
        const request=route.request(),dest=new URL(request.url());
        if(seed&&request.isNavigationRequest()){
          seed=false;return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Synthetic storage seed</title>'});
        }
        if(request.method()==='GET'&&(dest.protocol==='file:'||dest.protocol==='data:'||dest.origin===site.origin))return route.continue();
        return route.abort();
      });
      await ctx.addInitScript(({key,mode})=>{
        const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
        const fixture=window.protectionFixture={read:k=>get.call(localStorage,k),mode,writes:0};
        Storage.prototype.getItem=function(k){
          if(k===key&&fixture.mode==='read-error')throw Error('synthetic read failure');
          if(k===key&&fixture.mode==='read-null')return null;
          return get.call(this,k);
        };
        Storage.prototype.setItem=function(k,v){
          if(k===key){
            fixture.writes++;
            if(fixture.mode==='write-error')throw Error('synthetic write failure');
            if(fixture.mode==='uncertain'){set.call(this,k,v);fixture.mode='read-error';return;}
          }
          return set.call(this,k,v);
        };
        window.protectionFixture.seed=value=>set.call(localStorage,key,value);
      },{key,mode:options.mode||''});
      const p=await ctx.newPage();p.setDefaultTimeout(6000);
      await p.clock.install({time:at-60000});await p.clock.pauseAt(at);
      await p.goto(url);
      if(initial!==null)await p.evaluate(initial=>window.protectionFixture.seed(typeof initial==='string'?initial:JSON.stringify(initial)),initial);
      if(options.oldMedia)await storeMedia(p,'fixture-shared');
      if(options.setup)await options.setup(p);
      await p.reload();
      await body(p,ctx);
      assert.deepEqual(posts,[],'no model POST during recovery or fixture startup');
      assert.deepEqual(errors,[],'no uncaught page errors');
      passed++;console.log('PASS '+name+' | POST=0');
    }catch(error){failures++;console.error('FAIL '+name,error);}
    finally{await ctx.close();}
  }

  try{
    await run('first startup preserves the explicit create path',null,async p=>{
      await state(p,'empty-unverified');assert.equal(await raw(p),null);
      assert.equal(await p.locator('[data-storage-export]').isDisabled(),true);
      assert.match(await p.locator('[data-storage-raw-state]').innerText(),/没有可导出/);
      await p.locator('[data-storage-create]').click();await state(p,'ready');
      assert.ok(JSON.parse(await raw(p)).roles.length);
    });
    await run('valid archive opens with no protection controls',world(),async p=>{
      await state(p,'ready');assert.equal(await p.locator('#storage-backup-file').count(),0);
    });
    await run('corrupt raw export preserves bytes and rejected files do not write',corrupt,async p=>{
      await state(p,'invalid');
      const file=await download(p,'[data-storage-export]');
      assert.deepEqual(file.bytes,Buffer.from(corrupt));
      await upload(p,'{"roles":[],"settings":{}}');await result(p,'没有可识别');
      assert.equal(await p.locator('[data-storage-restore]').isDisabled(),true);
      const hostile=backup();hostile.settings.temperature='"><img src="x" onerror="document.body.dataset.executed=1">';
      await upload(p,hostile);await result(p,'Temperature');
      const brokenTasks=backup();brokenTasks.roles[0].diaryTasks=[null];
      await upload(p,brokenTasks);await result(p,'日记任务记录无效');
      assert.equal(await p.locator('body').getAttribute('data-executed'),null);
      assert.equal(await raw(p),corrupt);
      assert.equal(await p.evaluate(()=>window.protectionFixture.writes),0);
    });
    await run('invalid shell is rejected on startup', '{"roles":[],"settings":{}}', async p=>{
      await state(p,'invalid');assert.equal(await raw(p),'{"roles":[],"settings":{}}');
    });
    for(const [mode,expected] of [['read-error','unavailable'],['read-null','missing-known']]){
      await run(mode+' cannot export a fake empty archive or overwrite the hidden original',corrupt,async p=>{
        await state(p,expected);
        assert.equal(await p.locator('[data-storage-export]').isDisabled(),true);
        assert.equal(await p.locator('[data-storage-create]').count(),0);
        await upload(p,backup());await result(p,'无法确认');
        assert.equal(await p.locator('[data-storage-restore]').isDisabled(),true);
        assert.equal(await raw(p),corrupt);
      },{mode});
    }
    await run('read uncertainty after preview stops before staging or writing',corrupt,async p=>{
      await state(p,'invalid');await upload(p,backup('读回故障',true));await result(p,'校验通过');
      await p.evaluate(()=>window.protectionFixture.mode='read-null');
      await restore(p);await result(p,'无法确认');
      assert.equal(await raw(p),corrupt);
      assert.deepEqual(await media(p),['fixture-shared']);
      assert.equal(await p.evaluate(()=>window.protectionFixture.writes),0);
    },{oldMedia:true});
    await run('a truly absent main key can restore a versioned empty world',null,async p=>{
      await state(p,'empty-unverified');await upload(p,{version:1,roles:[],settings:{}});
      await result(p,'0 个角色和 0 个附件');assert.equal(await raw(p),null);
      await restore(p);await state(p,'restored');
      assert.deepEqual(JSON.parse(await raw(p)).roles,[]);
      await p.locator('[data-storage-enter]').click();await state(p,'ready');
      assert.deepEqual(JSON.parse(await raw(p)).roles,[]);
    });
    await run('a startup failure can be recovered with an explicitly confirmed legacy backup',{...world(),customFonts:[{id:'invalid',name:'old'}]},async p=>{
      await state(p,'load-failed');const original=await raw(p);
      await upload(p,backup('旧格式角色',true));await result(p,'1 个角色和 1 个附件');
      assert.equal(await raw(p),original);
      await restore(p);await state(p,'restored');
      const saved=JSON.parse(await raw(p)),id=saved.roles[0].avatarMediaId;
      assert.notEqual(id,'fixture-shared');
      assert.equal(await media(p,id),replacementGif.toString('base64'));
      assert.equal(await media(p,'fixture-shared'),gif);
      assert.deepEqual(saved.settings.legacy,{retained:true});assert.deepEqual(saved.futureBusiness,{untouched:true});
      await p.locator('[data-storage-enter]').click();await state(p,'ready');
      await p.locator('[data-action=enter]').filter({hasText:'旧格式角色'}).waitFor();
    },{oldMedia:true});
    await run('known write refusal keeps corrupt raw bytes and existing media',corrupt,async p=>{
      await state(p,'invalid');await upload(p,backup('拒写',true));await result(p,'校验通过');
      await p.evaluate(()=>window.protectionFixture.mode='write-error');
      await restore(p);await result(p,'存档未保存');
      assert.equal(await raw(p),corrupt);assert.equal(await media(p,'fixture-shared'),gif);
      assert.equal(await p.locator('[data-storage-enter]').isVisible(),false);
      assert.equal(await p.evaluate(()=>window.protectionFixture.writes),1);
    },{oldMedia:true});
    await run('uncertain write keeps original export and cannot announce success or retry',corrupt,async p=>{
      await state(p,'invalid');await upload(p,backup('可能已写入',true));await result(p,'校验通过');
      await p.evaluate(()=>window.protectionFixture.mode='uncertain');
      await restore(p);await result(p,'写入结果不确定');
      assert.equal(JSON.parse(await raw(p)).roles[0].name,'可能已写入');
      assert.equal(await media(p,'fixture-shared'),gif);
      assert.equal(await p.locator('[data-storage-enter]').isVisible(),false);
      assert.equal(await p.locator('#storage-backup-file').isDisabled(),true);
      assert.equal(await p.locator('[data-storage-restore]').isDisabled(),true);
      const file=await download(p,'[data-storage-export]');assert.deepEqual(file.bytes,Buffer.from(corrupt));
      assert.equal(await p.evaluate(()=>window.protectionFixture.writes),1);
    },{oldMedia:true});
    await run('a second tab repairing the raw target invalidates the first preview',corrupt,async(p,ctx)=>{
      await state(p,'invalid');await upload(p,backup('过期候选',true));await result(p,'校验通过');
      const other=await ctx.newPage();other.setDefaultTimeout(6000);
      await other.goto(url);await state(other,'invalid');
      await upload(other,backup('另一页已修复',true));await result(other,'校验通过');
      await restore(other);await state(other,'restored');
      const confirmed=await raw(other),mediaIds=await media(other);
      assert.equal(JSON.parse(confirmed).roles[0].name,'另一页已修复');
      await restore(p);await result(p,'已被修改');
      assert.equal(await raw(p),confirmed);assert.deepEqual(await media(p),mediaIds);
      assert.equal(await media(p,'fixture-shared'),gif);
      assert.equal(await p.evaluate(()=>window.protectionFixture.writes),0);
    },{oldMedia:true});
    await run('normal import needs confirmation and rejects the same empty shell',world(),async p=>{
      await state(p,'ready');const original=await raw(p);
      await upload(p,'{"roles":[],"settings":{}}','#landing-backup-file');await toast(p,'没有可识别');
      assert.equal(await raw(p),original);
      allow(p,/替换本机主档/,false);await upload(p,backup('取消覆盖',true),'#landing-backup-file');
      await toast(p,'已取消恢复');
      assert.equal(await raw(p),original);assert.deepEqual(await media(p),['fixture-shared']);
      allow(p,/替换本机主档/);await upload(p,backup('明确确认',true),'#landing-backup-file');
      await toast(p,'已导入备份');assert.equal(JSON.parse(await raw(p)).roles[0].name,'明确确认');
    },{oldMedia:true});
    const exportButton='[data-action=export]';
    const attached=world();attached.roles[0].avatarMediaId='fixture-shared';
    await run('complete backup reports success and includes the original attachment',attached,async p=>{
      await state(p,'ready');const original=await raw(p);
      const file=await download(p,exportButton);await toast(p,'附件齐全');
      const payload=JSON.parse(file.bytes);
      assert.deepEqual(payload._media,[{id:'fixture-shared',data:'data:image/gif;base64,'+gif}]);
      assert.equal(payload._backupIntegrity,undefined);assert.equal(await raw(p),original);
    },{oldMedia:true});
    const incomplete=structuredClone(attached);incomplete.roles[0].frameMediaId='missing-frame';
    await run('incomplete backup warns, can cancel, and never replaces an intact archive on import',incomplete,async p=>{
      await state(p,'ready');const original=await raw(p);
      let downloads=0;p.on('download',()=>downloads++);
      allow(p,/缺少 1 个附件.*无法直接恢复为完整世界/,false);
      await p.locator(exportButton).click();await toast(p,'已取消导出');assert.equal(downloads,0);
      allow(p,/缺少 1 个附件.*无法直接恢复为完整世界/);
      const file=await download(p,exportButton);await toast(p,'抢救性不完整备份');
      assert.match(file.name,/不完整\.json$/);
      const payload=JSON.parse(file.bytes);
      assert.deepEqual(payload._backupIntegrity,{status:'incomplete',missingMediaCount:1});
      assert.equal(payload._media.length,1);
      assert.equal(payload.roles[0].frameMediaId,'missing-frame');
      await upload(p,payload,'#landing-backup-file');await toast(p,'缺少 1 个');
      assert.equal(await raw(p),original);assert.equal(await media(p,'fixture-shared'),gif);
    },{oldMedia:true});
    const preserved=backup('任务与生活记录');
    const r=preserved.roles[0],life=claimLifeTask([r],r,at,true);
    const prepared=prepareLifeTask(r,preserved.user,life);
    commitLifeTask(r,life,prepared,JSON.stringify({requestId:life.id,roleId:r.id,events:[{
      at:at-20*60000,action:'walk',durationMinutes:5,location:{sourceId:'profile:'+r.id,quote:'合成港口'},
    }]}),at);
    r.play={id:'synthetic-play',title:'合成幕间',world:'舞台',user:'来访者',char:'演员',startedAt:at-1000,paused:true,messages:[],
      intermissionMessages:[{id:'speech',speaker:'me',text:'合成发言',at:at-1000}],
      intermissionAttempts:{speech:{id:'intermission-unknown',revision:0,status:'unknown'}}};
    const diaryDay='2026-11-05',attempt='diary-sent';
    preserved.diaryWorldId='00000000-0000-0000-0000-000000000001';
    r.diaryTasks=[{id:'synthetic-diary',roleId:r.id,dateKey:diaryDay,status:'uncertain',requestAttempt:attempt,attempts:1,createdAt:at-1000,updatedAt:at-1000}];
    const diaryKey=diaryRequestKey(preserved.diaryWorldId,r.id,diaryDay);
    await run('recovery preserves F11 receipt identity and F17 archive provenance',corrupt,async p=>{
      await state(p,'invalid');await upload(p,preserved);await result(p,'校验通过');await restore(p);await state(p,'restored');
      const saved=JSON.parse(await raw(p));
      assert.deepEqual(saved.roles[0].events,r.events);assert.deepEqual(saved.roles[0].lifeTasks,r.lifeTasks);
      assert.deepEqual(saved.roles[0].play.intermissionAttempts,r.play.intermissionAttempts);
      assert.equal(saved.roles[0].diaryTasks[0].requestAttempt,attempt);
      assert.equal(saved.diaryWorldId,preserved.diaryWorldId);
      assert.deepEqual(await idb(p,receipts,'receipts','get',diaryKey),{attempt,state:'sent'});
      await p.locator('[data-storage-enter]').click();await state(p,'ready');
      const entered=JSON.parse(await raw(p));
      assert.deepEqual(entered.roles[0].events,r.events);
      assert.deepEqual(await idb(p,receipts,'receipts','get',diaryKey),{attempt,state:'sent'});
    },{setup:p=>idb(p,receipts,'receipts','put',diaryKey,{attempt,state:'sent'})});
    const configured=world('自动任务仅在进入应用后运行');
    const endpoint='https://protection-fixture.invalid/v1';
    configured.settings={...configured.settings,mode:'api',endpoint,model:'synthetic-protection'};
    configured.roles[0].diaryTasks=[{...r.diaryTasks[0],status:'pending',requestAttempt:undefined,attempts:0}];
    await run('confirmed recovery with configured API does not start work before entering',corrupt,async p=>{
      await state(p,'invalid');await upload(p,configured);await result(p,'校验通过');await restore(p);await state(p,'restored');
      await p.clock.fastForward(120000);
      assert.equal(JSON.parse(await raw(p)).roles[0].diaryTasks[0].status,'pending');
    },{setup:p=>p.evaluate(endpoint=>{
      localStorage.setItem('elsewhere-device-api-key-v1',JSON.stringify({endpoint,key:'SYNTHETIC_PROTECTION_ONLY'}));
    },endpoint)});
  }finally{await browser.close();}
  console.log(JSON.stringify({passed,failures,posts:0}));
  if(failures)process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
