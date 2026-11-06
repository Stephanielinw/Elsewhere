const assert = require('node:assert/strict');
const {join} = require('node:path');
const {pathToFileURL} = require('node:url');
const {readFile} = require('node:fs/promises');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const appUrl = process.env.TEST_URL || pathToFileURL(join(__dirname, '../public/Elsewhere_Phase1_Standalone.html')).href;
const app = new URL(appUrl);
assert.ok(app.protocol === 'file:' || (['http:', 'https:'].includes(app.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(app.hostname)), 'TEST_URL must be a local app');
const storageKey = 'elsewhere-v01';
const mediaDb = 'elsewhere-media-v1', mediaStore = 'blobs';
const mockEndpoint = 'https://storage-fixture.invalid/v1';
const mime = 'image/gif';
const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
function gif(red) {
  const bytes = Buffer.from(pixel);
  bytes[13] = red;
  return bytes.toString('base64');
}
const previousPhoto = {type:mime, base64:gif(0)};
const previousFrame = {type:mime, base64:gif(64)};
const incomingPhoto = {type:mime, base64:gif(128)};
const incomingFrame = {type:mime, base64:gif(192)};
const font = {type:'application/font-woff', base64:Buffer.from('wOFF synthetic bytes').toString('base64')};
const priorMedia = {'shared-id':previousPhoto, 'frame-id':previousFrame, 'old-orphan':previousFrame};
const asAttachment = (id, {type, base64}) => ({id, data:'data:' + type + ';base64,' + base64});
const file = ({type, base64}) => ({name:'synthetic.gif', mimeType:type, buffer:Buffer.from(base64, 'base64')});

const raw = p => p.evaluate(key => Storage.prototype.integrityRead.call(localStorage, key), storageKey);
const stored = async p => JSON.parse(await raw(p));
const arm = (p, fault = {}) => p.evaluate(fault => {window.integrityFault = fault; window.integrityTrace.length = 0; window.integrityAdds = 0;}, fault);
const toast = (p, text) => p.locator('.toast').filter({hasText:text}).waitFor();
const ready = p => p.locator('#app[data-storage-state=ready]').waitFor();
const reload = async p => {await p.reload(); await ready(p);};
const upload = (p, world, selector = '#landing-backup-file') => p.locator(selector).setInputFiles({
  name:'synthetic.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(world)),
});
const entered = p => p.locator('.dock [data-view=terminal]').waitFor();
const enter = async p => {await p.locator('[data-action=enter][data-id=fixture-role]').click(); await entered(p);};

function readMedia(p) {
  return p.evaluate(async ({mediaDb, mediaStore}) => {
    const entries = await new Promise((resolve, reject) => {
      const open = indexedDB.open(mediaDb, 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction(mediaStore, 'readonly');
        const store = tx.objectStore(mediaStore);
        const keys = store.getAllKeys();
        const blobs = store.getAll();
        tx.onabort = () => {db.close(); reject(tx.error);};
        tx.oncomplete = () => {db.close(); resolve(keys.result.map((id, i) => [id, blobs.result[i]]));};
      };
    });
    return Object.fromEntries(await Promise.all(entries.map(async ([id, blob]) => [
      id, {type:blob.type, base64:btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())))},
    ])));
  }, {mediaDb, mediaStore});
}

function initFaults({storageKey, mediaStore, capability}) {
  const {getItem, setItem} = Storage.prototype;
  Storage.prototype.integrityRead = getItem;
  window.integrityFault = {};
  window.integrityTrace = [];
  if (capability === 'no-locks') Object.defineProperty(navigator, 'locks', {value:undefined});
  if (capability === 'lock-denied') Object.defineProperty(navigator, 'locks', {value:{request:()=>Promise.reject(new DOMException('synthetic deny','SecurityError'))}});
  if (capability === 'no-idb' && window.name === 'no-idb') {
    indexedDB.open = () => {throw new DOMException('synthetic IDB unavailable','SecurityError');};
  }
  let blockedRead = false;
  Storage.prototype.getItem = function(key) {
    if (key === storageKey && blockedRead) throw new DOMException('INTEGRITY_FIXTURE_PRIVATE', 'SecurityError');
    return getItem.call(this, key);
  };
  Storage.prototype.setItem = function(key, value) {
    if (key !== storageKey) return setItem.call(this, key, value);
    const {main} = window.integrityFault;
    window.integrityTrace.push('main');
    if (main === 'before') throw new DOMException('INTEGRITY_FIXTURE_PRIVATE', 'QuotaExceededError');
    if (main === 'reload') {
      location.reload();
      throw new DOMException('INTEGRITY_FIXTURE_PRIVATE', 'QuotaExceededError');
    }
    setItem.call(this, key, value);
    if (main === 'reload-after') {blockedRead = true;location.reload();}
    if (main === 'uncertain') blockedRead = true;
    if (main === 'throw-after') throw new DOMException('INTEGRITY_FIXTURE_PRIVATE', 'QuotaExceededError');
  };
  window.integrityAdds = 0;
  const transaction = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function(stores, mode, options) {
    const tx = transaction.call(this, stores, mode, options);
    if (stores === mediaStore && mode === 'readwrite' && window.integrityFault.observeMedia) {
      tx.addEventListener('complete', () => window.integrityTrace.push('media-committed'), {once:true});
    }
    return tx;
  };
  const {add, put} = IDBObjectStore.prototype;
  for (const [name, write] of Object.entries({add, put})) {
    IDBObjectStore.prototype[name] = function(blob, key) {
      if (this.name !== mediaStore || !blob || !window.integrityFault.observeMedia) return write.call(this, blob, key);
      const {addFailure, abortStage} = window.integrityFault;
      window.integrityTrace.push(name);
      const attempt = ++window.integrityAdds;
      if (attempt === addFailure) throw new DOMException('INTEGRITY_FIXTURE_PRIVATE', 'QuotaExceededError');
      const req = write.call(this, blob, key);
      if (attempt === 1 && abortStage) req.addEventListener('success', () => {
        this.transaction.abort();
        location.reload();
      });
      return req;
    };
  }
  const remove = IDBObjectStore.prototype.delete;
  IDBObjectStore.prototype.delete = function(key) {
    if(this.name===mediaStore&&window.integrityFault.noCleanup){window.integrityTrace.push('unexpected-delete');throw Error('fixture cleanup refused');}
    return remove.call(this,key);
  };
  const readAsText = FileReader.prototype.readAsText;
  FileReader.prototype.readAsText = function(blob, encoding) {
    if (window.integrityFault.pauseRead) {
      window.integrityTrace.push('file-pending');
      return;
    }
    return readAsText.call(this, blob, encoding);
  };
}

async function main() {
  const {defaults, createRole} = await import('../src/core/defaults.ts');
  const {toLocalDateKey} = await import('../src/core/diary.ts');
  const browser = await chromium.launch({
    timeout:10000,
    ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {}),
  });
  const failures = [];
  function world(label = '旧世界', api = false) {
    const at = Date.now();
    const role = createRole(label, '', '虚构档案员', '谨慎', '虚构港湾');
    Object.assign(role, {
      id:'fixture-role', lifeAt:at, firstMessageState:{status:'ready', updatedAt:at}, lastDiaryCheckDay:toLocalDateKey(at),
      avatarMediaId:'shared-id', frameMediaId:'frame-id', wallpaperMediaId:'frame-id',
      chats:[{id:'fixture-chat', kind:'photo', speaker:'me', at, text:'合成附件', mediaId:'shared-id'}],
    });
    const seed = defaults();
    return {...seed, selected:null, roles:[role], user:{...seed.user, avatarMediaId:'shared-id', frameMediaId:'frame-id'},
      settings:{...seed.settings, endpoint:mockEndpoint, model:'fixture-model', autonomousLife:false, mode:api?'api':'demo'}};
  }
  function backup(label = '新世界', legacy = false) {
    const data = world(label);
    data.customFonts = [{id:'synthetic-font', name:'合成字体', mediaId:'font-id'}];
    data.customFrames = [{id:'synthetic-frame', name:'合成头像框', mediaId:'frame-id', category:'custom'}];
    data.futureData = {test:'应保留'};
    if (legacy) {data.version = 1; data.settings = {endpoint:'', legacyData:{test:'应保留'}};}
    data._media = [asAttachment('shared-id', incomingPhoto), asAttachment('frame-id', incomingFrame), asAttachment('font-id', font)];
    return data;
  }
  async function run(name, body, {api = false, shared = false, capability, mock, empty = false} = {}) {
    if (process.env.TEST_CASE && !name.includes(process.env.TEST_CASE)) return;
    const context = await browser.newContext({viewport:{width:390, height:844}, serviceWorkers:'block'});
    try {
      let bootstrap = true;
      const posts = [], errors = [];
      context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
      await context.route('**/*', route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin === new URL(mockEndpoint).origin && req.method() === 'OPTIONS' && mock) {
          return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'POST','access-control-allow-headers':'*'}});
        }
        if (req.method() === 'POST') {
          posts.push(url.pathname);
          if (url.origin === new URL(mockEndpoint).origin && mock) return mock(route);
        }
        if (bootstrap && req.isNavigationRequest() && req.url() === appUrl) {
          bootstrap = false;
          return route.fulfill({contentType:'text/html', body:'<!doctype html><title>Isolated storage fixture</title>'});
        }
        if (req.method() === 'GET' && (req.url() === appUrl || (app.protocol !== 'file:' && url.origin === app.origin))) return route.continue();
        return route.abort();
      });
      await context.addInitScript(initFaults, {storageKey, mediaStore, capability});
      const p = await context.newPage();
      p.setDefaultTimeout(4500);
      p.setDefaultNavigationTimeout(8000);
      await p.goto(appUrl);
      const seed = world('旧世界', api);
      if(shared)seed.roles.push({...seed.roles[0],id:'other-role',name:'共享素材角色'});
      if(!empty)await p.evaluate(async ({storageKey, seed, mediaDb, mediaStore, priorMedia, mockEndpoint}) => {
        localStorage.setItem(storageKey, JSON.stringify(seed));
        if (seed.settings.mode === 'api') localStorage.setItem('elsewhere-device-api-key-v1', JSON.stringify({endpoint:mockEndpoint, key:'synthetic-credential'}));
        await new Promise((resolve, reject) => {
          const open = indexedDB.open(mediaDb, 1);
          open.onerror = () => reject(open.error);
          open.onupgradeneeded = () => open.result.createObjectStore(mediaStore);
          open.onsuccess = () => {
            const db = open.result, tx = db.transaction(mediaStore, 'readwrite'), store = tx.objectStore(mediaStore);
            for (const [id, {type, base64}] of Object.entries(priorMedia)) store.put(new Blob([Uint8Array.from(atob(base64), ch => ch.charCodeAt(0))], {type}), id);
            tx.onabort = () => {db.close(); reject(tx.error);};
            tx.oncomplete = () => {db.close(); resolve();};
          };
        });
      }, {storageKey, seed, mediaDb, mediaStore, priorMedia, mockEndpoint});
      if(capability==='no-idb')await p.evaluate(()=>window.name='no-idb');
      if(empty){
        await p.reload();
        await p.locator('#app[data-storage-state=empty-unverified]').waitFor();
      }else await reload(p);
      await body(p,posts);
      assert.deepEqual(posts, mock?['/v1/chat/completions']:[], 'only the expected synthetic POST may be dispatched');
      assert.deepEqual(errors, [], 'uncaught page errors');
      console.log('PASS', name);
    } catch (error) {
      failures.push(name);
      console.error('FAIL', name, '\n', error);
    } finally {
      await context.close();
    }
  }

  async function intact(p, before, onlyPrior = false) {
    assert.equal(await raw(p), before, 'previous main archive must be byte-for-byte intact');
    const media = await readMedia(p);
    if (onlyPrior) assert.deepEqual(media, priorMedia, 'no stage record may survive a rolled back media transaction');
    else for (const [id, bytes] of Object.entries(priorMedia)) assert.deepEqual(media[id], bytes, 'previous blob ' + id);
    await p.locator('[data-action=enter]').filter({hasText:'旧世界'}).waitFor();
  }

  async function restored(p, label, {withFont = true} = {}) {
    const state = await stored(p), media = await readMedia(p), [role] = state.roles;
    assert.equal(role.name, label);
    assert.equal(state._media, undefined);
    assert.deepEqual(state.futureData, {test:'应保留'});
    for (const [id, bytes] of Object.entries(priorMedia)) assert.deepEqual(media[id], bytes, 'prior blob changed: ' + id);
    const shared = state.user.avatarMediaId, frame = role.wallpaperMediaId;
    assert.ok(shared && !Object.hasOwn(priorMedia, shared), 'incoming shared image must have a fresh ID');
    assert.ok(frame && frame !== shared && !Object.hasOwn(priorMedia, frame), 'incoming frame must have a distinct fresh ID');
    assert.equal(role.avatarMediaId, shared);
    assert.equal(role.chats[0].mediaId, shared);
    assert.equal(state.user.frameMediaId, frame);
    assert.equal(state.customFrames[0].mediaId, frame);
    assert.equal(role.frameMediaId, frame);
    assert.deepEqual(media[shared], incomingPhoto);
    assert.deepEqual(media[frame], incomingFrame);
    if (withFont) {
      const fontId = state.customFonts[0].mediaId;
      assert.ok(fontId && fontId !== shared && fontId !== frame && !Object.hasOwn(priorMedia, fontId));
      assert.deepEqual(media[fontId], font);
    }
    await p.locator('[data-action=enter]').filter({hasText:label}).waitFor();
  }

  try {
    await run('current import remaps shared references without overwriting colliding old blobs', async p => {
      const next=backup();
      next.roles.push({...next.roles[0],id:'second-incoming',name:'共享附件'});
      await arm(p,{noCleanup:true});
      await upload(p,next);
      await toast(p, '已导入备份');
      await restored(p, '新世界');
      const current=await stored(p);
      assert.equal(current.roles[0].avatarMediaId,current.roles[1].avatarMediaId);
      assert.ok(!(await p.evaluate(()=>window.integrityTrace)).includes('unexpected-delete'));
      await p.locator('.toast').evaluateAll(elements=>elements.forEach(el=>el.remove()));
      await upload(p,next);await toast(p,'已导入备份');
      await restored(p,'新世界');
      assert.notEqual((await stored(p)).roles[0].avatarMediaId,current.roles[0].avatarMediaId);
      const media=await readMedia(p);
      assert.deepEqual(media[current.roles[0].avatarMediaId],incomingPhoto);
      await reload(p);
      await restored(p, '新世界');
    });
    await run('legacy backup without API connection preserves original attachments', async p=>{
      await upload(p,backup('旧格式恢复',true));await toast(p,'已导入备份');
      await restored(p,'旧格式恢复');
      assert.equal((await stored(p)).settings.endpoint,'');
      assert.deepEqual((await stored(p)).settings.legacyData,{test:'应保留'});
    });
    for(const invalid of ['malicious','missing','malformed','incomplete-font']){
      await run('rejected '+invalid+' backup does not write',async p=>{
        const before=await raw(p),next=backup();
        if(invalid==='malicious')next.settings.temperature='"><img src="data:," onerror="document.body.dataset.fixture=1">';
        if(invalid==='missing')next._media.pop();
        if(invalid==='malformed')next._media[1].data='data:image/gif;base64,====';
        if(invalid==='incomplete-font')delete next.customFonts[0].name;
        await arm(p,{observeMedia:true});
        await upload(p,next);await toast(p,'备份导入失败');
        assert.deepEqual(await p.evaluate(()=>window.integrityTrace),[]);
        assert.equal(await p.locator('body').getAttribute('data-fixture'),null);
        await intact(p,before,true);
        await reload(p);await intact(p,before,true);
      });
    }
    for(const failAt of [1,2])await run('media add '+failAt+' failure rolls back the complete stage',async p=>{
      const before=await raw(p);
      await arm(p,{observeMedia:true,addFailure:failAt});
      await upload(p,backup());await toast(p,'媒体暂存失败');
      const trace=await p.evaluate(()=>window.integrityTrace);
      assert.deepEqual(trace,Array(failAt).fill('add'));
      await intact(p,before,true);
      await reload(p);await intact(p,before,true);
    });
    await run('all attachments staged then main write fails, retry safely commits once',async p=>{
      const before=await raw(p);
      await arm(p,{observeMedia:true,main:'before',noCleanup:true});
      await upload(p,backup());await toast(p,'存档未保存');
      const trace=await p.evaluate(()=>window.integrityTrace);
      assert.deepEqual(trace,['add','add','add','media-committed','main']);
      await intact(p,before);
      const staged=await readMedia(p);assert.equal(Object.keys(staged).length,Object.keys(priorMedia).length+3);
      await arm(p);
      await upload(p,backup());await toast(p,'已导入备份');
      await restored(p,'新世界');
      assert.equal((await stored(p)).roles.length,1);
      for(const [id,bytes] of Object.entries(staged))assert.deepEqual((await readMedia(p))[id],bytes);
    });
    await run('committed main write with unreadable readback retains both generations',async p=>{
      await arm(p,{observeMedia:true,main:'uncertain',noCleanup:true});
      await upload(p,backup());await toast(p,'结果不确定，请刷新');
      assert.equal(await p.locator('.toast').filter({hasText:'已导入备份'}).count(),0);
      await p.locator('[data-action=enter]').filter({hasText:'旧世界'}).waitFor();
      assert.equal((await stored(p)).roles[0].name,'新世界');
      await reload(p);
      await restored(p,'新世界');
    });
    await run('main write throws after commit but verified readback succeeds',async p=>{
      await arm(p,{main:'throw-after',noCleanup:true});
      await upload(p,backup());await toast(p,'已导入备份');
      await restored(p,'新世界');
    });
    await run('reload before file read finishes leaves old world and media intact',async p=>{
      const before=await raw(p);
      await arm(p,{pauseRead:true,observeMedia:true});
      await upload(p,backup());assert.deepEqual(await p.evaluate(()=>window.integrityTrace),['file-pending']);
      await reload(p);await intact(p,before,true);
    });
    for(const [name,fault,expected] of [
      ['reload during media stage',{observeMedia:true,abortStage:true},'old-no-stage'],
      ['reload after staging before main write',{observeMedia:true,main:'reload'},'old-staged'],
      ['reload after main write before confirmation',{observeMedia:true,main:'reload-after'},'new'],
    ])await run(name,async p=>{
      const before=await raw(p);
      await arm(p,fault);
      const navigation=p.waitForEvent('framenavigated',{predicate:frame=>frame===p.mainFrame(),timeout:8000});
      await Promise.all([upload(p,backup()),navigation]);
      await ready(p);
      if(expected==='new')await restored(p,'新世界');
      else{
        await intact(p,before,expected==='old-no-stage');
        if(expected==='old-staged')assert.equal(Object.keys(await readMedia(p)).length,Object.keys(priorMedia).length+3);
      }
    });
    const edit = p=>p.locator('[data-action=editrole][data-id=fixture-role]').click();
    const submitRole = p=>p.getByTestId('save-role-form-btn').click();
    const uploadAvatar=async p=>{
      await p.locator('#role-avatar-input').setInputFiles(file(incomingPhoto));
      await toast(p,'已预览新角色头像');
    };
    await run('avatar media failure and world failure keep draft and old shared blob, retry commits fresh ID',async p=>{
      await edit(p);await uploadAvatar(p);
      const before=await raw(p);
      await arm(p,{observeMedia:true,addFailure:1});await submitRole(p);await toast(p,'头像暂存失败');
      assert.equal(await raw(p),before);assert.deepEqual(await readMedia(p),priorMedia);
      await arm(p,{observeMedia:true,main:'before'});await submitRole(p);await toast(p,'存档未保存');
      assert.equal(await raw(p),before);await p.locator('#role-form').waitFor();
      assert.deepEqual((await readMedia(p))['shared-id'],previousPhoto);
      await arm(p);await submitRole(p);await toast(p,'角色资料与头像框修改已保存');
      const data=await stored(p),id=data.roles[0].avatarMediaId;
      assert.notEqual(id,'shared-id');assert.equal(data.user.avatarMediaId,'shared-id');
      await reload(p);
      assert.equal((await stored(p)).roles[0].avatarMediaId,id);
      assert.deepEqual((await readMedia(p))[id],incomingPhoto);
      assert.deepEqual((await readMedia(p))['shared-id'],previousPhoto);
    });
    await run('failed avatar removal keeps persisted reference and retry keeps shared old blob',async p=>{
      await edit(p);await p.getByTestId('remove-role-avatar-btn').click();
      const before=await raw(p);await arm(p,{main:'before',noCleanup:true});
      await submitRole(p);await toast(p,'存档未保存');
      assert.equal(await raw(p),before);
      await arm(p,{noCleanup:true});await submitRole(p);await toast(p,'角色资料与头像框修改已保存');
      await reload(p);
      const data=await stored(p);
      assert.equal(data.roles[0].avatarMediaId,'');assert.equal(data.user.avatarMediaId,'shared-id');
      assert.deepEqual(await readMedia(p),priorMedia);
    });
    await run('role deletion failure and retry preserve another role sharing the same blob',async p=>{
      await edit(p);await p.locator('[data-action=askdelete]').click();
      const form=p.locator('#delete-role-form');
      await form.locator('[name=confirmName]').fill('旧世界');const before=await raw(p);
      await arm(p,{main:'before',noCleanup:true});await form.locator('button').click();await toast(p,'存档未保存');
      assert.equal(await raw(p),before);assert.deepEqual(await readMedia(p),priorMedia);await form.waitFor();
      await arm(p,{noCleanup:true});await form.locator('button').click();await toast(p,'已删除角色');
      await reload(p);
      const data=await stored(p);assert.deepEqual(data.roles.map(r=>r.id),['other-role']);
      assert.equal(data.roles[0].avatarMediaId,'shared-id');assert.equal(data.roles[0].chats[0].mediaId,'shared-id');
      assert.deepEqual(await readMedia(p),priorMedia);
    },{shared:true});
    await run('photo message and retraction commit references safely, export preserves the bytes',async p=>{
      await enter(p);
      await p.locator('[data-action=openconversation]').click();
      await p.locator('[data-action=chatpanel][data-panel=more]').click();
      await p.locator('[data-action=chatpanel][data-panel=photo]').click();
      const input=p.locator('#photo-upload');
      const before=await raw(p);
      await arm(p,{main:'before'});
      await input.setInputFiles(file(incomingPhoto));
      await toast(p,'存档未保存');assert.equal(await raw(p),before);
      await arm(p);
      await input.setInputFiles(file(incomingPhoto));
      await input.waitFor({state:'detached'});
      const sent=(await stored(p)).roles[0].chats;
      assert.equal(sent.length,2);
      assert.deepEqual((await readMedia(p))[sent[1].mediaId],incomingPhoto);
      const retract=p.locator('[data-action=retractmsg][data-id=fixture-chat]');
      const beforeRetract=await raw(p);
      await arm(p,{main:'before'});
      await retract.evaluate(el=>el.click());
      await toast(p,'存档未保存');assert.equal(await raw(p),beforeRetract);
      await arm(p);
      await retract.evaluate(el=>el.click());
      await toast(p,'消息已撤回');
      assert.equal((await stored(p)).roles[0].chats[0].status,'retracted');
      await reload(p);
      const download=p.waitForEvent('download');
      await p.locator('[data-action=export]').click();
      const exported=JSON.parse(await readFile(await (await download).path(),'utf8'));
      assert.deepEqual(exported._media.find(item=>item.id==='shared-id'),asAttachment('shared-id',previousPhoto));
      assert.deepEqual(exported._media.find(item=>item.id===sent[1].mediaId),asAttachment(sent[1].mediaId,incomingPhoto));
    });
    await run('role creation failure keeps form and does not dispatch an opening POST',async p=>{
      await p.getByTestId('create-role-btn').click();const field=p.locator('#role-form [name=name]');
      await field.fill('失败后保留角色草稿');const before=await raw(p);
      await arm(p,{main:'before'});await submitRole(p);await toast(p,'存档未保存');
      assert.equal(await field.inputValue(),'失败后保留角色草稿');assert.equal(await raw(p),before);
      await reload(p);assert.equal((await stored(p)).roles.length,1);
    },{api:true});
    await run('role creation retry yields one record',async p=>{
      await p.getByTestId('create-role-btn').click();
      await p.locator('#role-form [name=name]').fill('合成新角色');const before=await raw(p);
      await arm(p,{main:'before'});await submitRole(p);await toast(p,'存档未保存');
      assert.equal(await raw(p),before);await arm(p);
      await submitRole(p);await toast(p,'已创建角色');
      await reload(p);assert.equal((await stored(p)).roles.filter(r=>r.name==='合成新角色').length,1);
    });
    await run('failed manual diary keeps textarea and retry saves one entry and one event',async p=>{
      await enter(p);
      await p.locator('[data-view=diary]').first().evaluate(el=>el.click());
      await p.locator('[data-action=diarytab][data-tab=me]').click();
      const form=p.locator('#diary-form'),field=form.locator('textarea'),text='合成的私人日记草稿';
      await field.fill(text);const before=await raw(p);
      await arm(p,{main:'before'});await form.locator('button').click();await toast(p,'存档未保存');
      assert.equal(await field.inputValue(),text);assert.equal(await raw(p),before);
      await arm(p);await form.locator('button').click();await toast(p,'私人日记已保存');
      await reload(p);const role=(await stored(p)).roles[0];
      assert.equal(role.diaries.filter(d=>d.text===text).length,1);
      assert.equal(role.events.filter(e=>e.kind==='diary'&&e.diaryId===role.diaries[0].id).length,1);
    });
    await run('wallpaper stage and main failure preserve existing media, retry applies fresh media',async p=>{
      await enter(p);await p.locator('.dock [data-view=terminal]').click();
      await p.locator('details:has([data-style-form=appearance]) > summary').click();
      const input=p.locator('[data-style-file=wallpaper]');
      const submit=p.locator('[data-style-form=appearance] button[type=submit]');
      await input.setInputFiles(file(incomingFrame));await toast(p,'壁纸已载入预览');
      const before=await raw(p);
      await arm(p,{observeMedia:true,addFailure:1});await submit.click();await toast(p,'壁纸或字体文件保存失败');
      assert.equal(await raw(p),before);assert.deepEqual(await readMedia(p),priorMedia);
      await arm(p,{main:'before'});await submit.click();await toast(p,'存档未保存');
      assert.equal(await raw(p),before);
      await arm(p);await submit.click();await toast(p,'主题、壁纸和字体已保存');
      await reload(p);
      const id=(await stored(p)).roles[0].wallpaperMediaId;
      assert.notEqual(id,'frame-id');
      const media=await readMedia(p);assert.deepEqual(media[id],incomingFrame);assert.deepEqual(media['frame-id'],previousFrame);
    });

    const writerState=p=>p.locator('#app').getAttribute('data-write-access');
    async function otherPage(p) {
      const other=await p.context().newPage();
      other.setDefaultTimeout(4500);
      await other.goto(appUrl);
      await ready(other);
      return other;
    }
    const roleName=p=>p.locator('#role-form [name=name]');
    await run('F04 only the first tab may initialize an empty storage',async p=>{
      const b=await p.context().newPage();
      b.setDefaultTimeout(4500);
      await b.goto(appUrl);
      await b.locator('#app[data-storage-state=read-only]').waitFor();
      assert.equal(await b.locator('[data-storage-create]').count(),0);
      assert.equal(await raw(b),null);
      await p.locator('[data-storage-create]').click();
      await ready(p);
      const bytes=await raw(p);
      assert.ok(bytes);assert.equal(await raw(b),bytes);
      await p.close();await reload(b);assert.equal(await writerState(b),'writer');
      assert.ok((await stored(b)).roles.length>0);
    },{empty:true});
    for(const sameRole of [true,false])await run('F04 old tab cannot edit '+(sameRole?'the same role':'another role'),async p=>{
      const b=await otherPage(p);
      assert.equal(await writerState(p),'writer');assert.equal(await writerState(b),'read-only');
      const initial=await raw(p);assert.equal(await raw(b),initial);
      await b.locator('[data-action=editrole][data-id='+ (sameRole?'fixture-role':'other-role') +']').click();
      await roleName(b).fill('保留冲突表单');
      await edit(p);await roleName(p).fill('先提交的角色');await submitRole(p);
      await toast(p,'角色资料与头像框修改已保存');
      const committed=await raw(p);
      assert.notEqual(committed,initial);
      await b.evaluate(()=>{window.dispatchEvent(new Event('pageshow'));document.dispatchEvent(new Event('visibilitychange'));});
      await submitRole(b);await toast(b,'存档版本已过期');
      assert.equal(await raw(b),committed);assert.equal(await roleName(b).inputValue(),'保留冲突表单');
      assert.equal(await b.locator('.toast').filter({hasText:'修改已保存'}).count(),0);
      b.once('dialog',dialog=>dialog.dismiss());
      await b.locator('[data-action=reloadworld]').click();
      assert.equal(await roleName(b).inputValue(),'保留冲突表单');
      await p.close();
      await reload(b);assert.equal(await writerState(b),'writer');
      assert.equal((await stored(b)).roles[0].name,'先提交的角色');
      assert.deepEqual(await readMedia(b),priorMedia);
    },{shared:!sameRole});

    await run('F04 owner and contender cannot both confirm creation from the same save',async p=>{
      const b=await otherPage(p);
      assert.equal(await raw(b),await raw(p));
      await Promise.all([p.getByTestId('create-role-btn').click(),b.getByTestId('create-role-btn').click()]);
      await Promise.all([roleName(p).fill('唯一已提交角色'),roleName(b).fill('未提交角色草稿')]);
      await Promise.all([submitRole(p),submitRole(b)]);
      await toast(p,'已创建角色');
      assert.equal(await roleName(b).inputValue(),'未提交角色草稿');
      const disk=await raw(p);
      assert.equal(await raw(b),disk);
      assert.deepEqual(JSON.parse(disk).roles.map(r=>r.name),['旧世界','唯一已提交角色']);
      await p.close();await reload(b);
      assert.equal(await writerState(b),'writer');assert.deepEqual((await stored(b)).roles.map(r=>r.name),['旧世界','唯一已提交角色']);
    });

    await run('F04 tab taking over commits and the restored prior writer cannot save its diary draft',async p=>{
      await enter(p);
      await p.locator('[data-view=diary]').first().evaluate(el=>el.click());
      await p.locator('[data-action=diarytab][data-tab=me]').click();
      const form=p.locator('#diary-form'),field=form.locator('textarea');
      await field.fill('跨页面保留的私人日记');
      await p.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
      const b=await otherPage(p);
      assert.equal(await writerState(b),'writer');
      await edit(b);await roleName(b).fill('接管后保存的角色');await submitRole(b);await toast(b,'角色资料与头像框修改已保存');
      const disk=await raw(b);
      await p.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
      await form.locator('button').click();await toast(p,'存档版本已过期');
      assert.equal(await field.inputValue(),'跨页面保留的私人日记');assert.equal(await raw(p),disk);
      assert.deepEqual((await stored(b)).roles[0].diaries,[]);
    });

    await run('F04 stale page cannot restore deleted role or supersede new avatar reference',async p=>{
      const b=await otherPage(p);
      await b.locator('[data-action=editrole][data-id=other-role]').click();
      await roleName(b).fill('应保留但不能复活角色');
      await edit(p);await uploadAvatar(p);await submitRole(p);await toast(p,'角色资料与头像框修改已保存');
      const currentId=(await stored(p)).roles[0].avatarMediaId;
      await p.locator('[data-action=editrole][data-id=other-role]').click();
      await p.locator('[data-action=askdelete]').click();
      const form=p.locator('#delete-role-form');
      await form.locator('[name=confirmName]').fill('共享素材角色');await form.locator('button').click();await toast(p,'已删除角色');
      const disk=await raw(p);
      await submitRole(b);await toast(b,'存档版本已过期');
      assert.equal(await raw(b),disk);assert.equal(await roleName(b).inputValue(),'应保留但不能复活角色');
      assert.equal(JSON.parse(disk).roles.length,1);assert.equal(JSON.parse(disk).roles[0].avatarMediaId,currentId);
      const media=await readMedia(b);
      assert.deepEqual(media[currentId],incomingPhoto);assert.deepEqual(media['shared-id'],previousPhoto);
    },{shared:true});

    await run('F04 contender retains a chat draft and does not dispatch a request',async p=>{
      const b=await otherPage(p);
      await enter(b);await b.locator('[data-action=openconversation]').click();
      const input=b.locator('#message-input');
      await input.fill('只读页面的未发送内容');
      const before=await raw(p);
      await b.locator('#message-form .send-btn').click();
      await toast(b,'只有读取权限');
      assert.equal(await input.inputValue(),'只读页面的未发送内容');
      assert.equal(await raw(p),before);
    },{api:true});

    for(const capability of ['no-locks','lock-denied','no-idb'])await run('F04 capability '+capability,async p=>{
      const before=await raw(p);
      await p.getByTestId('create-role-btn').click();await roleName(p).fill('权限测试角色');await submitRole(p);
      if(capability==='no-idb'){
        await toast(p,'已创建角色');assert.equal(await writerState(p),'writer');
        assert.equal((await stored(p)).roles.at(-1).name,'权限测试角色');
      }else{
        await toast(p,'只有读取权限');assert.equal(await writerState(p),'read-only');
        assert.equal(await raw(p),before);assert.equal(await roleName(p).inputValue(),'权限测试角色');
      }
    },{capability});

    let allowReply,postStarted;
    const replyGate=new Promise(resolve=>{allowReply=resolve;});
    const started=new Promise(resolve=>{postStarted=resolve;});
    await run('F04 already dispatched reply stays copyable without overwriting or reissuing',async(p,posts)=>{
      await p.clock.install();
      await enter(p);await p.locator('[data-action=openconversation]').click();
      await p.locator('#message-input').fill('合成并发请求');
      await p.locator('#message-form .send-btn').click();
      await p.clock.fastForward(130000);
      let timer;try{await Promise.race([started,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('mock POST did not start')),6500);})]);}finally{clearTimeout(timer);}
      assert.equal(posts.length,1);
      await p.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
      const b=await otherPage(p);assert.equal(await writerState(b),'writer');
      await edit(b);await roleName(b).fill('并发请求之后更新');await submitRole(b);await toast(b,'角色资料与头像框修改已保存');
      const committed=await raw(b);
      allowReply();
      const recovery=p.getByRole('textbox',{name:'可复制的未确认回复'});
      await recovery.waitFor();
      assert.equal(await recovery.inputValue(),'合成的迟到回复。');
      assert.equal(await raw(p),committed);
      await reload(b);
      const state=await stored(b);
      assert.equal(state.roles[0].name,'并发请求之后更新');
      assert.ok(!state.roles[0].chats.some(m=>m.text==='合成的迟到回复。'));
      assert.equal(state.roles[0].chatTiming.blocked,'failed');
    },{api:true,mock:async route=>{
      postStarted();await replyGate;
      return route.fulfill({json:{choices:[{message:{role:'assistant',content:'合成的迟到回复。'},finish_reason:'stop'}]},headers:{'access-control-allow-origin':'*'}});
    }});
  } finally {
    await browser.close();
  }
  assert.deepEqual(failures, [], 'browser storage integrity failures');
}
main().catch(error => {console.error(error); process.exitCode = 1;});
