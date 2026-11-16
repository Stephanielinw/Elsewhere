const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium, webkit, devices} = require(process.env.PLAYWRIGHT_MODULE||'playwright');
const approveBackupImports=require('./backup-confirmation.cjs');

const app = process.env.TEST_URL || pathToFileURL(path.resolve('dist/Elsewhere_Phase1_Standalone.html')).href;
const engine = process.env.TEST_BROWSER === 'webkit' ? webkit : chromium;
const visual = process.argv.includes('--visual');
const key = 'elsewhere-v01';
const boil = '#elsewhere-doodle-boil';
const filtered = 'svg[data-doodle-app] g[filter="url(#elsewhere-doodle-boil)"]';

async function main(){
 const {defaults,createRole} = await import('../src/core/defaults.ts');
 const {emptyPresetLibrary,builtinPreset,importElsewherePreset}=await import('../src/core/elsewherePreset.ts');
 const library=importElsewherePreset(emptyPresetLibrary(),{...builtinPreset(),id:'doodle-example',name:'合成见面预设',entries:
  ['人物演绎','叙事规则','对白风格','场景连续性'].map((name,i)=>({id:'doodle-rule-'+i,name,role:'system',content:'合成展示条目',enabled:true}))});
 library.defaultPresetId='doodle-example';
 const browser = await engine.launch(engine===chromium ? {executablePath:chromium.executablePath()} : {});
 const timer=setTimeout(()=>{console.error('Doodle suite deadline');process.exitCode=1;void browser.close();},130000);
 let passed=0;
 async function run(label,work,{theme,night=false,video,reduce='no-preference',invalid=false,legacyColor=false}={}){
  if(process.env.TEST_CASE&&!label.includes(process.env.TEST_CASE))return;
  const settings=engine===webkit?devices['iPhone 13']:{viewport:{width:390,height:844},isMobile:true,hasTouch:true};
  const ctx=await browser.newContext({...settings,defaultBrowserType:undefined,viewport:{width:390,height:844},deviceScaleFactor:1,
   reducedMotion:reduce,ignoreHTTPSErrors:true,serviceWorkers:'block',
   ...(video?{recordVideo:{dir:video,size:{width:390,height:844}}}:{})});
  await approveBackupImports(ctx);
  const unexpected=[],errors=[];
  let bootstrap=true;
  try{
   await ctx.route('**/*',route=>{
    const req=route.request(),url=new URL(req.url());
    if(req.method()==='GET'&&bootstrap&&req.isNavigationRequest()){
     bootstrap=false;
     return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated icons fixture</title>'});
    }
    if(req.method()==='GET'&&(url.protocol==='file:'||url.origin===new URL(app).origin))return route.continue();
    unexpected.push({method:req.method(),host:url.hostname});return route.abort();
   });
   await ctx.addInitScript(()=>{
    const set=Storage.prototype.setItem;
    Storage.prototype.setItem=function(k,v){if(k==='elsewhere-v01'&&window.rejectIconSave)throw Error('isolated icon settings write refusal');return set.call(this,k,v);};
    window.entranceRuns=0;
    addEventListener('animationstart',e=>{if(e.animationName==='elsewhere-doodle-draw')window.entranceRuns++;});
   });
   const world=defaults(),at=Date.now();
   world.roles=['甲','乙'].map((name,i)=>{
    const r=createRole('合成角色'+name,'','档案员','沉静','合成港口');
    r.id='doodle-'+i;r.theme=night?'night':'coffee';r.lastDiaryCheckDay=new Date(at).toLocaleDateString('sv-SE');
    r.firstMessageState={status:'ready',updatedAt:at};
    r.chats=[{id:'hello-'+i,speaker:'me',text:'今天的笔记留在桌上。',at:at-90000},
     {id:'reply-'+i,speaker:'char',text:'我看到了，谢谢。',at:at-80000}];
    return r;
   });
   if(legacyColor){world.theme='night';delete world.roles[0].theme;}
   world.selected=null;world.settings={...world.settings,mode:'api',endpoint:'',model:'',autonomousLife:false};
   world.sharedTasks={ddl:[{id:'doodle-due',text:'整理桌面',due:'2026-11-29',done:false,at}],todo:Array.from({length:12},(_,i)=>({id:'doodle-task-'+i,text:'合成待办 '+i,done:false,at}))};
   if(theme||invalid)world.iconTheme=invalid?'<invalid>':theme;
   const p=await ctx.newPage();p.setDefaultTimeout(6500);p.setDefaultNavigationTimeout(6500);
   p.on('pageerror',e=>errors.push(e.message));
   await p.goto(app);await p.evaluate(async({key,world,library})=>{
    localStorage.setItem(key,JSON.stringify(world));
    if(library)await new Promise((resolve,reject)=>{
     const q=indexedDB.open('elsewhere-fruit-private-v1',3);
     q.onupgradeneeded=()=>['documents','preset-library','elsewhere-presets'].forEach(name=>q.result.createObjectStore(name));
     q.onerror=()=>reject(q.error);
     q.onsuccess=()=>{
      const db=q.result,tx=db.transaction('elsewhere-presets','readwrite');
      tx.objectStore('elsewhere-presets').put(library,'current');
      tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(tx.error);};
     };
    });
   },{key,world,library:visual?library:undefined});
   await p.reload();await p.locator('#app[data-storage-state=ready][data-write-access=writer]').waitFor();
   const enter=async(i=0)=>{await p.locator('[data-action=enter][data-id=doodle-'+i+']').click();await p.locator('.home-view .dock').waitFor();};
   const home=async()=>{
    if(await p.locator('.home-view').count())await p.locator('.home-indicator').evaluate(el=>el.click());
    else await p.locator('.chat-back,.back-btn[data-view=home]').filter({visible:true}).first().click();
    await p.locator('.home-view .dock').waitFor();
   };
   const appPage=i=>p.locator('[data-home-page="'+i+'"]').click();
   const open=async name=>{if(name==='预设')await appPage(1);await p.getByRole('button',{name:'打开'+name,exact:true}).click();};
   const terminal=async()=>{await open('终端');await p.locator('details:has(#terminal-api-root)[open] > summary').click();await p.locator('details:has([data-style-form=appearance]) > summary').click();};
   const read=()=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
   const choose=async value=>{
    await p.getByRole('combobox',{name:'图标主题'}).selectOption(value);
    await p.getByRole('button',{name:'保存主题与外观'}).click();
   };
   await work({p,ctx,enter,home,terminal,open,appPage,choose,read});
   assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[],'external network and model POSTs must stay absent');passed++;
   console.log('PASS '+label+' | POST=0');
   if(video){const record=p.video();await p.close();await record.saveAs(path.join(video,'dynamic.webm'));}
  }finally{await ctx.close();}
 }
 try{
  if(visual){
   const out=process.env.CAPTURE_DIR;
   assert.ok(out,'set CAPTURE_DIR');fs.mkdirSync(out,{recursive:true});
   for(const theme of ['line','doodle'])await run(theme+' comparisons',async({p,enter,home,appPage,open,terminal})=>{
    const capture=name=>p.screenshot({path:path.join(out,name+'-'+theme+'.png'),animations:'disabled'});
    await enter();await appPage(1);await capture('home');
    await open('聊天');await capture('chat');await home();
    await terminal();await capture('terminal');await home();
    await open('预设');await p.locator('#fruit-preset-root .native-prompt-name').first().waitFor();await capture('presets');
   },{theme});
   await run('dynamic recording',async({p,enter,appPage,open})=>{
    await enter();await p.locator(boil).waitFor({state:'attached'});
    await p.waitForTimeout(2200);await appPage(1);await p.waitForTimeout(2100);
    await open('聊天');await p.waitForTimeout(1000);
   },{theme:'doodle-motion',video:out});
   return;
  }
  await run('world setting, existing controls, rejection and reload',async({p,enter,terminal,choose,read,home})=>{
   await enter();
   const starter=p.locator('.dock [data-view=chat] svg');
   assert.equal(await starter.getAttribute('viewBox'),'0 0 24 24');
   await terminal();
   const pref=p.getByRole('combobox',{name:'图标主题'});
   assert.deepEqual(await pref.locator('option').allTextContents(),['原版线条','手绘涂鸦','动态涂鸦']);
   const font=p.getByLabel('字体',{exact:true}),fontNode=await font.elementHandle();
   const before=await read();
   await p.evaluate(()=>window.rejectIconSave=true);
   await choose('doodle');
   assert.notEqual((await read()).iconTheme,'doodle');
   assert.equal(await p.locator('.terminal-settings summary svg').first().getAttribute('viewBox'),'0 0 24 24');
   await p.evaluate(()=>window.rejectIconSave=false);
   await choose('doodle');
   assert.equal((await read()).iconTheme,'doodle');
   assert.equal(await fontNode.evaluate(el=>el.isConnected),true);
   assert.equal(await p.locator('.terminal-settings summary svg').first().getAttribute('viewBox'),'0 0 48 48');
   assert.deepEqual((await read()).roles.map(r=>[r.id,r.theme,r.font,r.wallpaperMediaId]),before.roles.map(r=>[r.id,r.theme,r.font,r.wallpaperMediaId]));
   await home();await p.getByRole('button',{name:'切换角色'}).click();await enter(1);
   assert.equal(await starter.getAttribute('viewBox'),'0 0 48 48');
   await p.reload();await p.locator('#app[data-storage-state=ready][data-write-access=writer]').waitFor();
   await enter(1);await starter.waitFor();
   assert.equal(await starter.getAttribute('viewBox'),'0 0 48 48');
   assert.equal(await p.locator(boil).count(),0);
  },{invalid:true});
  await run('icon changes preserve inherited color and a pending wallpaper preview',async({p,enter,terminal,choose,read})=>{
   await enter();await terminal();
   assert.equal(await p.locator('html').getAttribute('data-theme'),'night');
   const tint=p.locator('[data-style-theme=night]');
   assert.equal(await tint.getAttribute('aria-pressed'),'true');
   await p.evaluate(()=>{
    const decode=Image.prototype.decode;
    Image.prototype.decode=function(){return new Promise((resolve,reject)=>{window.finishWallpaper=()=>decode.call(this).then(resolve,reject);});};
   });
   await p.locator('[data-style-file=wallpaper]').setInputFiles({name:'synthetic.gif',mimeType:'image/gif',
    buffer:Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64')});
   await p.waitForFunction(()=>typeof window.finishWallpaper==='function');
   await p.getByRole('combobox',{name:'图标主题'}).selectOption('doodle');
   await p.evaluate(()=>window.finishWallpaper());
   await p.locator('[data-wallpaper-preview] img').waitFor();
   await choose('doodle');
   try{
    await p.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).iconTheme==='doodle'&&!!JSON.parse(localStorage.getItem(k)).roles[0].wallpaperMediaId,key);
   }catch(error){
    throw new Error('Appearance save did not commit: '+await p.locator('[data-style-status]').innerText(),{cause:error});
   }
   const world=await read();
   assert.equal(world.roles[0].theme,undefined);
   assert.equal(world.iconTheme,'doodle');
   assert.ok(world.roles[0].wallpaperMediaId);
   assert.equal(await p.locator('html').getAttribute('data-theme'),'night');
  },{legacyColor:true});
  await run('world backup round trip restores the visual preference',async({p,enter,terminal,choose,read})=>{
   await enter();await terminal();
   await p.locator('.terminal-other-settings > summary').click();
   const download=p.waitForEvent('download');
   await p.locator('[data-action=export]').click();
   const saved=await download;
   const file=await saved.path();
   const backup=fs.readFileSync(file);
   const before=(await read()).roles.map(r=>[r.id,r.chats]);
   await choose('line');
   assert.equal((await read()).iconTheme,'line');
   await p.locator('#backup-file').setInputFiles({name:'synthetic-world.json',mimeType:'application/json',buffer:backup});
   await p.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).iconTheme==='doodle',key);
   assert.deepEqual((await read()).roles.map(r=>[r.id,r.chats]),before);
  },{theme:'doodle'});
  await run('boil persists after drawing and stops outside its visible scope',async({p,enter,appPage,open,home})=>{
   await enter();
   await p.locator(boil).waitFor({state:'attached'});
   await p.waitForFunction(()=>window.entranceRuns>0);
   assert.equal(await p.locator('.home-page-apps '+filtered).count(),0);
   assert.ok(await p.locator('.dock '+filtered).count()>0);
   await p.waitForTimeout(1100);
   const first=p.locator('.dock [data-view=chat] svg');
   const frame=await first.screenshot();let changed=false;
   for(let i=0;i<4&&!changed;i++){await p.waitForTimeout(145);changed=!(await first.screenshot()).equals(frame);}
   assert.ok(changed,'Boiling Line changes rendered frames after drawing');
   const drawCount=await p.evaluate(()=>window.entranceRuns);
   await appPage(1);
   await p.locator('.home-page-apps '+filtered).first().waitFor({state:'attached'});
   await home();await p.locator(boil).waitFor({state:'attached'});
   await p.waitForTimeout(450);
   assert.equal(await p.evaluate(()=>window.entranceRuns),drawCount,'paging and same-view render do not redraw');
   await p.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
   assert.equal(await p.locator(boil).count(),0);assert.equal(await p.locator(filtered).count(),0);
   await p.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
   await p.locator(boil).waitFor({state:'attached'});
   assert.equal(await p.evaluate(()=>window.entranceRuns),drawCount);
   await p.emulateMedia({reducedMotion:'reduce'});
   await p.locator(boil).waitFor({state:'detached'});
   await p.emulateMedia({reducedMotion:'no-preference'});
   await p.locator(boil).waitFor({state:'attached'});
   await appPage(0);
   await p.locator('.home-page-apps '+filtered).first().waitFor({state:'detached'});
   await open('聊天');
   assert.equal(await p.locator(boil).count(),0);assert.equal(await p.locator(filtered).count(),0);
   assert.equal(await p.locator('#message-form .send-btn svg').getAttribute('viewBox'),'0 0 48 48');
   await home();await p.waitForFunction(previous=>window.entranceRuns>previous,drawCount);
  },{theme:'doodle-motion'});
  await run('reduced motion keeps complete dark-theme icons and keyboard labels',async({p,enter})=>{
   await enter();
   await p.getByRole('button',{name:'打开聊天',exact:true}).press('Enter');
   const button=p.locator('#message-form .send-btn');
   assert.equal(await button.locator('svg').getAttribute('aria-hidden'),'true');
   assert.equal(await button.locator('svg').evaluate(el=>getComputedStyle(el).stroke===getComputedStyle(el).color),true);
   assert.equal(await p.locator(boil).count(),0);
   assert.equal(await p.evaluate(()=>window.entranceRuns),0);
   const scroll=await p.evaluate(()=>document.documentElement.scrollWidth);
   assert.ok(scroll<=390);
  },{theme:'doodle-motion',night:true,reduce:'reduce'});
  await run('scroll profiling compares static and animated home within one browser',async({p,enter,terminal,choose,home})=>{
   const profile=()=>p.locator('.home-pages').evaluate(el=>new Promise(resolve=>{
    const times=[];let last=performance.now(),n=0;
    function frame(now){
     if(n)times.push(now-last);
     last=now;n++;
     el.scrollLeft=el.clientWidth*(n%40<20?0:1);
     if(n<=80)requestAnimationFrame(frame);
     else{times.sort((a,b)=>a-b);resolve({frames:times.length,medianMs:Number(times[39].toFixed(2)),p95Ms:Number(times[75].toFixed(2)),over50Ms:times.filter(t=>t>50).length});}
    }
    requestAnimationFrame(frame);
   }));
   await enter();
   const still=await profile();
   await terminal();await choose('doodle-motion');await home();
   await p.locator(boil).waitFor({state:'attached'});
   await p.waitForTimeout(1050);
   const motion=await profile();
   assert.equal(motion.frames,still.frames);
   console.log('PROFILE '+JSON.stringify({browser:engine.name(),still,motion}));
  },{theme:'doodle'});
  assert.ok(passed>0);
  console.log(JSON.stringify({passed,posts:0,browser:engine.name()}));
 }finally{clearTimeout(timer);await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
