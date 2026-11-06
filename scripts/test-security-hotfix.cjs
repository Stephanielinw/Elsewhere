const assert = require('node:assert/strict');
const {createServer} = require('node:http');
const {once} = require('node:events');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const appUrl = process.env.TEST_URL || pathToFileURL(process.cwd() + '/public/Elsewhere_Phase1_Standalone.html').href;
const keyA = 'fixture-a', keyB = 'fixture-b';
const modelA = 'synthetic-model', modelB = 'model "quoted" <tag> & more';
const storageKey = 'elsewhere-v01', deviceKey = 'elsewhere-device-api-key-v1';
const malicious = '"><img src="data:," onerror="document.documentElement.dataset.hotfixMarker=1"><span data-rest="';
const cors = {'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'authorization,content-type'};
const response = text => ({choices:[{message:{role:'assistant',content:text},finish_reason:'stop'}]});
const delay = () => {let open;const promise = new Promise(resolve => open = resolve);return {promise,open};};
const bounded = async (condition, label) => {
  for(let i=0;i<120;i++){if(await condition())return;await new Promise(resolve=>setTimeout(resolve,50));}
  throw Error('Timed out: '+label);
};

async function main(){
  const {defaults,createRole} = await import('../src/core/defaults.ts');
  const {toLocalDateKey} = await import('../src/core/diary.ts');
  const results=[], requests=[];
  let current, redirects=0;
  async function service(name){
    const server=createServer(async(req,res)=>{
      try {
        if(req.method==='OPTIONS'){res.writeHead(204,cors).end();return;}
        if(req.method==='GET'){
          res.writeHead(200,{'content-type':'application/json',...cors}).end(JSON.stringify({data:[{id:modelA},{id:modelB}]}));
          return;
        }
        if(req.url==='/redirect-target'){redirects++;res.writeHead(200,cors).end('{}');return;}
        let body='';for await(const bytes of req)body+=bytes;
        const wire=JSON.parse(body);
        assert.match(req.url,/^\/v1\/chat\/completions$/);
        assert.ok(wire.messages[0].content.includes('专注'), 'only Focus POSTs are expected');
        const call={service:name,path:req.url,model:wire.model,credential:req.headers.authorization===('Bearer '+keyA)?'A':req.headers.authorization===('Bearer '+keyB)?'B':req.headers.authorization?'unexpected':'none'};
        requests.push(call);
        const behavior=current;
        if(behavior.hold && requests.length===1)await behavior.hold.promise;
        if(behavior.redirect){res.writeHead(behavior.redirect,{...cors,location:originB+'/redirect-target'}).end();return;}
        if(behavior.fail===requests.length){res.writeHead(503,cors).end();return;}
        res.writeHead(200,{'content-type':'application/json',...cors}).end(JSON.stringify(response('合成小结 · '+name+' '+requests.length)));
      }catch(error){current.error=error;res.writeHead(500,cors).end();}
    });
    server.listen(0,'127.0.0.1');await once(server,'listening');
    return {server,origin:'http://127.0.0.1:'+server.address().port};
  }
  const a=await service('A'),b=await service('B'),originB=b.origin;
  let browser;
  const endpoint=a.origin+'/v1', endpointB=b.origin+'/v1';
  function world(n=2,api=true,label='甲'){
    const at=Date.now(),roles=Array.from({length:n},(_,i)=>{
      const r=createRole('合成角色'+label+i,'','档案员','谨慎','虚构港湾');
      Object.assign(r,{id:'synthetic-'+i,chats:[],events:[],diaries:[],lifeAt:at,firstMessageState:{status:'ready',updatedAt:at},lastDiaryCheckDay:toLocalDateKey(at)});
      return r;
    });
    return {...defaults(),roles,selected:null,settings:{mode:api?'api':'demo',endpoint,model:modelA,maxTokens:550,temperature:0.8,autonomousLife:false},
      focus:{workMinutes:25,breakMinutes:5,active:null,completed:[{id:'synthetic-focus',phase:'work',ownerId:roles[0].id,minutes:25,companion:true,startedAt:at-60000,finishedAt:at-1000,actualElapsedMs:59000,moments:[],dateKey:toLocalDateKey(at),tasks:['合成专注任务'],participantRoleIds:roles.map(r=>r.id),roleSummaries:[],summaryStatus:'ready'}]}};
  }
  const read = p => p.evaluate(k=>localStorage.getItem(k),storageKey);
  const record = async p => JSON.parse(await read(p)).focus.completed[0];
  const postCount = n => bounded(()=>{if(current.error)throw current.error;return requests.length>=n;},'mock POST '+n);
  const finished = (p,status) => bounded(async()=> (await record(p)).summaryStatus===status,'summary status '+status);
  const upload = (p,backup) => p.locator('#landing-backup-file, #backup-file').setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  const enter = p => p.locator('[data-action=enter]').first().click();
  async function focus(p){
    await p.locator('.dock [data-view=focus]').click();
    await p.locator('[data-action=openfocusrecord]').first().click();
  }
  async function deliver(p,hold){
    const completed=p.waitForResponse(res=>res.url().endsWith('/v1/chat/completions')&&res.request().method()==='POST');
    hold.open();await (await completed).finished();
    await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  }
  const start = p => p.getByTestId('retry-focus-summary-btn').click();
  async function terminal(p,fromFocus=true){
    if(fromFocus){await p.getByTestId('confirm-settlement-modal-btn').click();await p.locator('[data-action=view][data-view=home]').first().click();}
    await p.locator('.dock [data-view=terminal]').click();
  }
  async function change(p,kind){
    await terminal(p);
    const form=p.locator('[data-terminal-api]');
    if(kind==='demo'){await form.locator('[name=mode]').selectOption('demo');return;}
    if(kind==='service'||kind==='roundtrip')await form.locator('[name=endpoint]').fill(endpointB);
    if(kind==='key'||kind==='service'||kind==='roundtrip')await form.locator('[name=token]').fill(keyB);
    await form.locator('[data-api-models]').click();
    await form.locator('[name=model] option').filter({hasText:'quoted'}).waitFor({state:'attached'});
    await form.locator('[name=model]').selectOption(kind==='model'?modelB:modelA);
    await form.locator('button[type=submit], .terminal-api-footer button').click();
    await bounded(async()=>JSON.parse(await read(p)).settings.model===(kind==='model'?modelB:modelA),'configured model');
    if(kind==='roundtrip'){
      await form.locator('[name=endpoint]').fill(endpoint);
      await form.locator('[name=token]').fill(keyA);
      await form.locator('[data-api-models]').click();
      await form.locator('[name=model] option').filter({hasText:'quoted'}).waitFor({state:'attached'});
      await form.locator('[name=model]').selectOption(modelA);
      await form.locator('.terminal-api-footer button').click();
    }
  }
  async function run(name,seed,body,behavior={}){
    requests.length=0;current=behavior;redirects=0;
    const c=await browser.newContext({viewport:{width:390,height:844}});
    try{
      await c.route('**/*',route=>{
        const url=route.request().url();
        if(url===appUrl||url.startsWith(new URL(appUrl).origin+'/')||url.startsWith(a.origin+'/')||url.startsWith(b.origin+'/')||url.startsWith('data:'))return route.continue();
        return route.abort();
      });
      await c.addInitScript(({seed,storageKey,deviceKey,keyA,endpoint})=>{
        if(!localStorage.getItem(storageKey)){
          localStorage.setItem(storageKey,JSON.stringify(seed));
          if(keyA)localStorage.setItem(deviceKey,JSON.stringify({endpoint,key:keyA}));
        }
      },{seed,storageKey,deviceKey,keyA:behavior.anonymous?'':keyA,endpoint});
      const p=await c.newPage();p.setDefaultTimeout(5000);
      await p.goto(appUrl);
      await body(p);
      if(behavior.error)throw behavior.error;
      results.push({case:name,posts:requests.map(x=>({...x}))});
      console.log('PASS', name);
    }finally{behavior.hold?.open();await c.close();}
  }

  try{
    browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
    if(process.env.BASELINE==='focus'){
      const hold=delay();
      await run('provider rotation preserves first reply but never mixes connections',world(),async p=>{
        await enter(p);await focus(p);await start(p);await postCount(1);await change(p,'service');hold.open();
        await bounded(async()=> (await record(p)).summaryStatus!=='generating','end of old task');
        console.log(JSON.stringify({baseline:requests}));
        assert.equal(requests.length,1,'the old provider must never receive a second POST');
      },{hold});
      return;
    }
    await run('invalid backup writes nothing and does not execute',world(1,false),async p=>{
      await p.locator('#landing-backup-file').waitFor({state:'attached'});
      const before=await read(p);
      await p.evaluate(()=>{
        const originalSet=Storage.prototype.setItem,originalRemove=Storage.prototype.removeItem;
        window.hotfixWrites=[];
        Storage.prototype.setItem=function(key,value){window.hotfixWrites.push(key);return originalSet.call(this,key,value);};
        Storage.prototype.removeItem=function(key){window.hotfixWrites.push(key);return originalRemove.call(this,key);};
        for(const method of ['add','put']){
          const write=IDBObjectStore.prototype[method];
          IDBObjectStore.prototype[method]=function(...args){window.hotfixWrites.push('media-write');return write.apply(this,args);};
        }
      });
      const reject = async backup => {
        await p.evaluate(()=>document.querySelector('.toast')?.remove());
        await upload(p,backup);
        await p.locator('.toast').filter({hasText:'备份导入失败'}).waitFor();
      };
      for(const field of [{temperature:malicious},{temperature:'0.8'},{endpoint:'javascript:void(0)'},{endpoint:'https://example.invalid/#x'},{maxTokens:0},{model:[]}]){
        const backup=world(1,false,'恶意');Object.assign(backup.settings,field);
        backup._media=[{id:'synthetic-media',data:'data:image/png;base64,AAAA'}];
        await reject(backup);
        assert.equal(await read(p),before);
      }
      const badFocus=world(1,false,'恶意');
      badFocus.focus.completed[0].plannedMinutes=malicious;
      await reject(badFocus);
      badFocus.focus.completed[0].plannedMinutes=25;
      badFocus.focus.active={minutes:malicious};
      await reject(badFocus);
      badFocus.focus.active={minutes:25,phase:'work',status:'running',runSince:1,durationMs:{toString:null,valueOf:null}};
      await reject(badFocus);
      const badWork=world(1,false,'恶意');
      badWork.focus.workMinutes={toString:null,valueOf:null};
      badWork._media=[{id:'synthetic-valid',data:'data:image/png;base64,AAAA'}];
      await reject(badWork);
      const badDiary=world(1,false,'恶意');
      badDiary.roles[0].diaries=[{id:'synthetic-diary',speaker:'char',dateKey:toLocalDateKey(Date.now()),at:Date.now(),text:'合成文本',wordCount:malicious}];
      await reject(badDiary);
      const malformedAttachment=world(1,false,'恶意');
      malformedAttachment._media=[{id:'synthetic-valid',data:'data:image/png;base64,AAAA'},{id:'synthetic-invalid',data:'data:image/png;base64,===='}];
      await reject(malformedAttachment);
      malformedAttachment._media[1].data='data:text/html;base64,AAAA';
      await reject(malformedAttachment);
      assert.deepEqual(await p.evaluate(()=>window.hotfixWrites),[]);
      assert.equal(await read(p),before);
      await enter(p);await terminal(p,false);
      assert.equal(await p.locator('html').getAttribute('data-hotfix-marker'),null);
    });
    await run('old empty settings and unknown business data survive import and refresh',world(1,false),async p=>{
      await p.locator('#landing-backup-file').waitFor({state:'attached'});
      const legacy=world(1,false,'旧');
      legacy.version=1;legacy.settings={endpoint:'',legacyField:{retained:true}};
      legacy.focus.futureFocus={retained:true};
      legacy.futureBusiness={value:'" & <literal>'};
      await upload(p,legacy);await p.locator('.toast').filter({hasText:'已导入备份'}).waitFor();
      await p.reload();await enter(p);await terminal(p,false);
      assert.equal(await p.locator('[name=endpoint]').inputValue(),'');
      assert.equal(await p.locator('[name=temperature]').inputValue(),'0.8');
      const stored=JSON.parse(await read(p));assert.deepEqual(stored.futureBusiness,legacy.futureBusiness);
      assert.deepEqual(stored.settings.legacyField,legacy.settings.legacyField);
      assert.deepEqual(stored.focus.futureFocus,legacy.focus.futureFocus);
      assert.equal(requests.length,0);
    });
    await run('current settings render special characters and can be saved',world(1,false),async p=>{
      await p.locator('#landing-backup-file').waitFor({state:'attached'});
      const next=world(1,true,'合法');next.settings.model=modelB;
      await upload(p,next);await p.locator('.toast').filter({hasText:'已导入备份'}).waitFor();
      await enter(p);await terminal(p,false);
      assert.equal(await p.locator('[name=model]').inputValue(),modelB);
      await p.locator('[name=temperature]').fill('1.1');
      await p.locator('.terminal-api-footer button').click();
      assert.equal(JSON.parse(await read(p)).settings.temperature,1.1);
      assert.equal(await p.locator('html').getAttribute('data-hotfix-marker'),null);
      assert.equal(requests.length,0);
    });
    await run('valid preflight followed by world-write failure reports the media boundary',world(1,false),async p=>{
      await p.locator('#landing-backup-file').waitFor({state:'attached'});
      const before=await read(p);
      await p.evaluate(({storageKey})=>{
        const set=Storage.prototype.setItem,add=IDBObjectStore.prototype.add;
        window.hotfixMediaWrites=[];
        Storage.prototype.setItem=function(key,value){
          if(key===storageKey&&JSON.parse(value).failThisFixture)throw new DOMException('synthetic quota','QuotaExceededError');
          return set.call(this,key,value);
        };
        IDBObjectStore.prototype.add=function(...args){if(this.name==='blobs')window.hotfixMediaWrites.push(args[1]);return add.apply(this,args);};
      },{storageKey});
      const next=world(1,false,'写入失败');next.failThisFixture=true;
      next.roles[0].avatarMediaId='synthetic-media';
      next._media=[{id:'synthetic-media',data:'data:image/png;base64,AAAA'}];
      await upload(p,next);
      await p.locator('.toast').filter({hasText:'备份导入失败：存档未保存'}).waitFor();
      assert.equal(await read(p),before);
      const stagedIds=await p.evaluate(()=>window.hotfixMediaWrites);
      assert.equal(stagedIds.length,1);
      assert.notEqual(stagedIds[0],'synthetic-media');
      assert.equal(await p.locator('[data-action=enter]').first().textContent().then(text=>text.includes('甲0')),true);
    });
    const contaminated=world(1,false);contaminated.settings.temperature=malicious;
    await run('already stored invalid settings are held byte-for-byte',contaminated,async p=>{
      await p.locator('[data-storage-state=invalid]').waitFor();
      assert.equal(await read(p),JSON.stringify(contaminated));
      assert.equal(await p.locator('html').getAttribute('data-hotfix-marker'),null);
    });
    for(const n of [1,2])await run(n+' participants complete on one immutable connection',world(n),async p=>{
      await enter(p);await focus(p);await start(p);await postCount(n);await finished(p,'ready');
      assert.equal((await record(p)).roleSummaries.filter(x=>x.source==='ai').length,n);
      assert.deepEqual(requests.map(x=>[x.service,x.model,x.credential]),Array.from({length:n},()=>['A',modelA,'A']));
    });
    await run('a compatible endpoint configured without a Key receives no Authorization',world(1),async p=>{
      await enter(p);await focus(p);await start(p);await postCount(1);await finished(p,'ready');
      assert.equal(requests[0].credential,'none');
    },{anonymous:true});
    await run('a failed dispatch marker blocks the POST',world(1),async p=>{
      await enter(p);await focus(p);
      await p.evaluate(storageKey=>{
        const set=Storage.prototype.setItem;
        Storage.prototype.setItem=function(key,value){
          if(key===storageKey&&JSON.parse(value).focus.completed[0].summaryRun?.pendingRoleId)throw Error('synthetic dispatch write failure');
          return set.call(this,key,value);
        };
      },storageKey);
      await start(p);await finished(p,'failed');
      assert.equal(requests.length,0);
      assert.equal((await record(p)).summaryRun.pendingRoleId,undefined);
      assert.match(await p.locator('[data-focus-request-state]').textContent(),/尚未发送/);
    });
    for(const kind of ['service','key','model','demo','roundtrip']){
      const hold=delay();
      await run('change '+kind+' while first POST is pending',world(),async p=>{
        await enter(p);await focus(p);await start(p);await postCount(1);await change(p,kind);hold.open();
        await finished(p,'failed');
        assert.equal(requests.length,1);
        assert.equal((await record(p)).roleSummaries.filter(x=>x.source==='ai').length,1);
        if(kind!=='service')return;
        await p.locator('[data-action=view][data-view=home]').first().click();
        await focus(p);await start(p);await postCount(2);await finished(p,'ready');
        assert.deepEqual(requests.map(x=>[x.service,x.model,x.credential]),[['A',modelA,'A'],['B',modelA,'B']]);
        assert.equal((await record(p)).roleSummaries.filter(x=>x.source==='ai').length,2);
      },{hold});
    }
    {
      const hold=delay();
      await run('imported world with the same role and Focus IDs rejects the old result',world(),async p=>{
        await enter(p);await focus(p);await start(p);await postCount(1);await terminal(p);
        const next=JSON.parse(await read(p));
        next.roles[0].name='合成新世界的角色';
        await upload(p,next);await p.locator('.toast').filter({hasText:'已导入备份'}).waitFor();
        const before=await read(p);
        await deliver(p,hold);
        assert.equal(await read(p),before);
        assert.equal((await record(p)).roleSummaries.length,0);
        assert.equal(requests.length,1);
      },{hold});
    }
    for(const deleted of [0,1]){
      const hold=delay();
      await run('deleting participant '+deleted+' invalidates a late summary',world(),async p=>{
        await enter(p);await focus(p);await start(p);await postCount(1);
        await p.getByTestId('confirm-settlement-modal-btn').click();
        await p.locator('[data-action=view][data-view=home]').first().click();
        await p.locator('.home-role-switch').click();
        await p.locator('[data-action=editrole][data-id=synthetic-'+deleted+']').click();
        await p.locator('[data-action=askdelete]').click();
        await p.locator('[name=confirmName]').fill('合成角色甲'+deleted);
        await p.locator('#delete-role-form button').click();
        await p.locator('#landing-backup-file').waitFor({state:'attached'});
        const before=await read(p);
        await deliver(p,hold);
        assert.equal(await read(p),before);
        assert.equal((await record(p)).roleSummaries.length,0);
        assert.equal(requests.length,1);
      },{hold});
    }
    {
      const hold=delay();
      await run('an externally changed archive rejects a late result from a stale page',world(),async p=>{
        await enter(p);await focus(p);await start(p);await postCount(1);
        const other=await p.context().newPage();await other.goto(appUrl);
        await other.locator('[data-storage-state=ready]').waitFor();
        const replacement=await other.evaluate(storageKey=>{
          const d=JSON.parse(localStorage.getItem(storageKey));
          d.focus.completed[0].tasks=['合成归档已被另一页替换'];
          delete d.focus.completed[0].summaryRun;
          d.focus.completed[0].summaryStatus='ready';
          const raw=JSON.stringify(d);
          localStorage.setItem(storageKey,raw);
          return raw;
        },storageKey);
        await deliver(p,hold);
        assert.equal(await read(p),replacement);
        assert.equal((await record(p)).roleSummaries.length,0);
        assert.equal(requests.length,1);
        await other.close();
      },{hold});
    }
    await run('failed POST prompts before explicit retry after refresh',world(),async p=>{
      await enter(p);await focus(p);await start(p);await postCount(2);await finished(p,'failed');
      await p.reload();await enter(p);await focus(p);
      assert.deepEqual(await p.locator('[data-focus-request-state]').allTextContents(),['已成功保存','可能已发送 · 结果未确认']);
      let prompts=0;
      p.once('dialog',async d=>{assert.match(d.message(),/再次计费/);prompts++;await d.dismiss();});
      await start(p);assert.equal(prompts,1);assert.equal(requests.length,2);
      p.once('dialog',async d=>{assert.match(d.message(),/再次计费/);prompts++;await d.accept();});
      await start(p);await postCount(3);await finished(p,'ready');
      assert.equal(prompts,2);assert.equal((await record(p)).roleSummaries.filter(x=>x.source==='ai').length,2);
    },{fail:2});
    for(const code of [307,308])await run('redirect '+code+' does not reach target',world(1),async p=>{
      await enter(p);await focus(p);await start(p);await postCount(1);await finished(p,'failed');
      assert.equal(redirects,0);
    },{redirect:code});
    console.log(JSON.stringify({passed:results.length,results}));
  }finally{
    await browser?.close();a.server.close();b.server.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
