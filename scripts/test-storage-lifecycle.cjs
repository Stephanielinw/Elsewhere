const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const app = new URL(process.env.TEST_URL || 'http://127.0.0.1:3013/');
assert.ok(['http:', 'https:'].includes(app.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(app.hostname), 'use a local build');
const away = new URL('/elsewhere-lifecycle-fixture', app).href;
const endpoint = 'https://lifecycle-fixture.invalid/v1';
const key = 'elsewhere-v01';
const lock = 'elsewhere-main-writer-v1';
const ready = p => p.locator('#app[data-storage-state=ready]').waitFor();
const access = (p, value) => p.locator(`#app[data-write-access=${value}]`).waitFor();
const raw = p => p.evaluate(key => localStorage.getItem(key), key);
const roles = async p => JSON.parse(await raw(p)).roles;
const toast = (p, text) => p.locator('.toast').filter({hasText:text}).waitFor();
const notice = (p, text) => p.locator('[data-world-save-notice]').filter({hasText:text}).waitFor();
const chat = p => p.locator('#message-input');
const diary = p => p.locator('#diary-form textarea');
const roleName = p => p.locator('#role-form [name=name]');
const submitChat = p => p.locator('#message-form .send-btn').click();
const submitDiary = p => p.locator('#diary-form button').click();
const submitRole = p => p.getByTestId('save-role-form-btn').click();
const enterChat = async p => {
  await p.locator('[data-action=enter][data-id=fixture-role]').click();
  await p.locator('[data-action=openconversation]').click();
};
const identity = p => p.evaluate(() => window.lifecycleProbe.document);
const held = p => p.evaluate(async name => (await navigator.locks.query()).held.filter(x => x.name === name).length, lock);

async function returnToApp(p, original, hit = true) {
  await p.goBack({waitUntil:'commit'});
  await ready(p);
  await p.waitForFunction(() => window.lifecycleProbe.shows.length > 0);
  const result = await p.evaluate(() => ({...window.lifecycleProbe, persisted:window.lifecycleProbe.shows.at(-1)}));
  assert.equal(result.document === original, hit, 'browser restored the expected document');
  assert.equal(result.persisted, hit, 'observed actual BFCache result');
}

async function main() {
  const {defaults,createRole} = await import('../src/core/defaults.ts');
  const {toLocalDateKey} = await import('../src/core/diary.ts');
  const launch = (cache) => chromium.launch({
    ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {}),
    ...(cache ? {ignoreDefaultArgs:['--disable-back-forward-cache']} : {args:['--disable-back-forward-cache']}),
  });
  const browser = await launch(true);
  let coldBrowser;
  async function run(name, test, {cache = true, noLocks = false, pendingReply = false} = {}) {
    if (process.env.TEST_CASE && !name.includes(process.env.TEST_CASE)) return;
    const owner = cache ? browser : (coldBrowser ||= await launch(false));
    const context = await owner.newContext({ignoreHTTPSErrors:true,serviceWorkers:'block'});
    const posts = [], errors = [];
    context.on('request', request => {
      if (request.method() === 'POST') posts.push(new URL(request.url()).pathname);
    });
    let releaseReply;
    const replyGate = new Promise(resolve => {releaseReply = resolve;});
    try {
      await context.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        if (url.href === away && req.method() === 'GET') {
          return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated navigation fixture</title>'});
        }
        if (url.href === endpoint+'/chat/completions' && pendingReply) {
          const headers = {'access-control-allow-origin':'*','access-control-allow-methods':'POST','access-control-allow-headers':'*'};
          if (req.method() === 'OPTIONS') return route.fulfill({status:204,headers});
          if (req.method() === 'POST') {
            await replyGate;
            return route.fulfill({json:{choices:[{message:{role:'assistant',content:'合成回复'},finish_reason:'stop'}]},headers}).catch(()=>{});
          }
        }
        if (url.origin === app.origin && req.method() === 'GET') return route.continue();
        return route.abort();
      });
      context.on('page', p => p.on('pageerror', error => errors.push(error.message)));
      await context.addInitScript(({noLocks, lock}) => {
        const probe = window.lifecycleProbe = {document:Math.random(),shows:[],claims:0};
        addEventListener('pageshow', event => probe.shows.push(event.persisted));
        if (noLocks) Object.defineProperty(navigator,'locks',{value:undefined});
        else if (navigator.locks) {
          const request = navigator.locks.request.bind(navigator.locks);
          navigator.locks.request = (name,...args) => {
            if (name === lock) {
              probe.claims++;
              if (probe.pauseNextClaim) {
                probe.pauseNextClaim = false;
                return new Promise((resolve,reject) => {
                  probe.releaseClaim = () => request(name,...args).then(resolve,reject);
                });
              }
            }
            return request(name,...args);
          };
        }
      }, {noLocks,lock});
      const p = await context.newPage();
      p.setDefaultTimeout(6000);
      await p.goto(away);
      const at = Date.now(), role = createRole('合成守档者','','守档者','稳重','虚构港口');
      Object.assign(role,{id:'fixture-role',chats:[],lifeAt:at,lastDiaryCheckDay:toLocalDateKey(at),
        firstMessageState:{status:'ready',updatedAt:at},chatTiming:{version:1,focused:true,generation:0,pending:[],quietUntil:0}});
      const seed = defaults();
      seed.roles=[role];seed.selected=null;
      seed.settings={...seed.settings,autonomousLife:false,...(pendingReply?{mode:'api',endpoint,model:'fixture-model'}:{mode:'demo'})};
      await p.evaluate(({key,seed,pendingReply,endpoint})=>{
        localStorage.setItem(key,JSON.stringify(seed));
        if(pendingReply)localStorage.setItem('elsewhere-device-api-key-v1',JSON.stringify({endpoint,key:'synthetic-credential'}));
      },{key,seed,pendingReply,endpoint});
      await p.goto(app.href);
      await ready(p);
      await access(p,noLocks?'read-only':'writer');
      await test(p,context,posts,releaseReply);
      assert.deepEqual(posts,pendingReply?['/v1/chat/completions']:[],'exact model POST count');
      assert.deepEqual(errors,[],'no uncaught browser errors');
      console.log('PASS',name);
    } finally {
      releaseReply();
      await context.close();
    }
  }

  try {
    await run('BFCache free lock restores editing and three drafts', async p => {
      const original = await identity(p);
      const visit = async (input, text) => {
        await input.fill(text);
        const before = await raw(p);
        await p.goto(away);
        assert.equal(await held(p),0);
        await returnToApp(p,original);
        await access(p,'writer');
        assert.equal(await held(p),1);
        assert.equal(await input.inputValue(),text);
        assert.equal(await raw(p),before,'recovery alone must not save');
      };
      await enterChat(p);
      await visit(chat(p),'聊天草稿');
      await submitChat(p);
      assert.equal((await roles(p))[0].chats.at(-1).text,'聊天草稿');
      // Settle the normal scheduler write before asserting that BFCache recovery itself writes nothing.
      await p.waitForFunction(key=>{const timing=JSON.parse(localStorage.getItem(key)).roles[0].chatTiming;return timing.pending.length>0&&timing.replyDueAt===timing.quietUntil;},key);
      await p.locator('.chat-back').click();
      await p.locator('[data-view=diary]').first().evaluate(el=>el.click());
      await p.locator('[data-action=diarytab][data-tab=me]').click();
      await visit(diary(p),'私人日记草稿');
      await submitDiary(p);
      assert.equal((await roles(p))[0].diaries.at(-1).text,'私人日记草稿');
      await p.locator('.back-btn').click();
      await p.locator('[data-action=openconversation]').click();
      await p.getByTestId('chat-role-edit-btn').click();
      await visit(roleName(p),'角色资料草稿');
      await submitRole(p);
      assert.equal((await roles(p))[0].name,'角色资料草稿');
      assert.equal(await p.evaluate(()=>window.lifecycleProbe.claims),4,'one lock request per document entry');
      for(let i=0;i<2;i++){
        await p.reload();
        await ready(p);
        await access(p,'writer');
        assert.equal(await held(p),1);
        const [r]=await roles(p);
        assert.equal(r.name,'角色资料草稿');
        assert.equal(r.diaries.at(-1).text,'私人日记草稿');
        assert.equal(r.chats.at(-1).text,'聊天草稿');
      }
    });

    await run('BFCache competing tab keeps the old draft read-only', async (p,context) => {
      const original = await identity(p);
      await enterChat(p);
      await chat(p).fill('竞态保留草稿');
      const before = await raw(p);
      await p.goto(away);
      const b = await context.newPage();
      await b.goto(app.href);
      await ready(b);await access(b,'writer');
      assert.equal(await raw(b),before);
      await returnToApp(p,original);
      await access(p,'read-only');
      await notice(p,'只有读取权限');
      await submitChat(p);
      await toast(p,'只有读取权限');
      assert.equal(await chat(p).inputValue(),'竞态保留草稿');
      assert.equal(await raw(b),before);
      assert.equal(await held(b),1);
      await b.close();
      await p.goto(away);
      await returnToApp(p,original);
      await access(p,'writer');
      assert.equal(await chat(p).inputValue(),'竞态保留草稿');
      await submitChat(p);
      assert.equal((await roles(p))[0].chats.at(-1).text,'竞态保留草稿');
    });

    await run('BFCache newly acquired lock cannot publish stale main bytes', async (p,context) => {
      const original = await identity(p);
      await enterChat(p);
      await p.getByTestId('chat-role-edit-btn').click();
      await roleName(p).fill('旧页角色草稿');
      await p.goto(away);
      const b = await context.newPage();
      await b.goto(app.href);
      await ready(b);await access(b,'writer');
      await b.locator('[data-action=editrole][data-id=fixture-role]').click();
      await roleName(b).fill('另一页已保存');
      await submitRole(b);
      const newer = await raw(b);
      assert.equal(JSON.parse(newer).roles[0].name,'另一页已保存');
      await b.close();
      await returnToApp(p,original);
      await notice(p,'存档版本已过期');
      await p.waitForFunction(async name=>(await navigator.locks.query()).held.every(item=>item.name!==name),lock);
      await access(p,'read-only');
      assert.equal(await p.evaluate(()=>window.lifecycleProbe.claims),2,'stale recovery still requested the browser lock');
      await submitRole(p);
      await toast(p,'存档版本已过期');
      assert.equal(await roleName(p).inputValue(),'旧页角色草稿');
      assert.equal(await raw(p),newer);
    });

    await run('BFCache navigation invalidates a pending lock grant', async p => {
      const original = await identity(p);
      await p.evaluate(()=>window.lifecycleProbe.pauseNextClaim=true);
      await p.goto(away);
      await returnToApp(p,original);
      await p.waitForFunction(()=>Boolean(window.lifecycleProbe.releaseClaim));
      await p.goto(away);
      await returnToApp(p,original);
      await p.evaluate(()=>{for(let i=0;i<4;i++)document.dispatchEvent(new Event('visibilitychange'));});
      assert.equal(await p.evaluate(()=>window.lifecycleProbe.claims),2,'do not request again until the in-flight grant settles');
      await p.evaluate(()=>window.lifecycleProbe.releaseClaim());
      await access(p,'writer').catch(async error=>{
        console.error('grant after repeated navigation:',await p.evaluate(()=>window.lifecycleProbe.claims),'requests,',await held(p),'held');
        throw error;
      });
      assert.equal(await p.evaluate(()=>window.lifecycleProbe.claims),3);
      assert.equal(await held(p),1);
    });

    for(const cache of [true,false])await run(`BFCache ${cache?'hit':'miss'} does not repeat a dispatched chat request`, async (p,context,posts,releaseReply) => {
      const original = await identity(p);
      await p.clock.install();
      await enterChat(p);
      await chat(p).fill('已派发的合成聊天');
      await submitChat(p);
      const dispatched = context.waitForEvent('request',{
        predicate: req=>req.method()==='POST'&&req.url()===endpoint+'/chat/completions',
        timeout:6000,
      });
      await p.clock.fastForward(125000);
      await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).roles[0].chatTiming.inFlight,key);
      await dispatched;
      assert.equal(posts.length,1);
      await p.goto(away);
      await returnToApp(p,original,cache);
      await access(p,'writer');
      assert.equal((await roles(p))[0].chats.at(-1).text,'已派发的合成聊天');
      if(cache)assert.ok((await roles(p))[0].chatTiming.inFlight);
      else assert.equal((await roles(p))[0].chatTiming.blocked,'failed');
      releaseReply();
      if(cache)await p.waitForFunction(key=>{
        const r=JSON.parse(localStorage.getItem(key)).roles[0];
        return r.chats.some(m=>m.text==='合成回复')||r.pendingReplies?.some(m=>m.bubbles.includes('合成回复'));
      },key);
      await p.clock.fastForward(125000);
      assert.equal(posts.length,1);
    },{cache,pendingReply:true});

    await run('BFCache Web Locks unavailable stays read-only', async p => {
      const original = await identity(p);
      await enterChat(p);
      await chat(p).fill('能力降级草稿');
      const before = await raw(p);
      await p.goto(away);
      await returnToApp(p,original);
      await access(p,'read-only');
      await submitChat(p);
      await toast(p,'只有读取权限');
      assert.equal(await chat(p).inputValue(),'能力降级草稿');
      assert.equal(await raw(p),before);
    },{noLocks:true});
  } finally {
    await coldBrowser?.close();
    await browser.close();
  }
}
main().catch(error => {console.error(error);process.exitCode=1;});
