const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const https = require('node:https');
const {createHash} = require('node:crypto');
const {spawn, execFileSync} = require('node:child_process');
const {pathToFileURL} = require('node:url');

function assertFirstAttempt(attempt) {
  assert.equal(attempt, '1', 'Deployment blocked: create a new workflow_dispatch Run instead of re-running this Run');
}

function distManifest(dir) {
  const files = fs.readdirSync(dir, {recursive:true, withFileTypes:true});
  const manifest = {};
  for (const file of files) {
    assert.ok(!file.isSymbolicLink(), 'Unexpected symbolic link');
    if (file.isDirectory()) continue;
    const full = path.join(file.parentPath, file.name);
    const name = path.relative(dir, full).split(path.sep).join('/');
    assert.match(name, /^(?:index\.html|Elsewhere_Phase1_Standalone\.html|assets\/[\w-]+\.(?:js|css))$/, 'Unexpected published file');
    const bytes = fs.readFileSync(full);
    assert.ok(bytes.length > 0, 'Empty published file');
    const text = bytes.toString('utf8');
    assert.ok(!/(?:\/Users\/|\/home\/runner\/work\/|[A-Z]:\\Users\\|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AIza[\w-]{30,}|gh[pousr]_[A-Za-z0-9]{30,}|sk-(?:proj-)?[A-Za-z0-9_-]{40,})/.test(text), 'Published privacy check failed');
    manifest[name] = createHash('sha256').update(bytes).digest('hex');
  }
  for (const required of ['index.html', 'Elsewhere_Phase1_Standalone.html']) {
    assert.ok(manifest[required], 'Missing '+required);
    assert.match(fs.readFileSync(path.join(dir, required), 'utf8'), /id="app"/);
  }
  const index = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const refs = [...index.matchAll(/(?:src|href)="(\/Elsewhere\/assets\/[^"?#]+)"/g)].map(m => m[1].slice('/Elsewhere/'.length));
  assert.ok(refs.some(name => name.endsWith('.js')) && refs.some(name => name.endsWith('.css')), 'Missing Pages JS or CSS references');
  for (const name of refs) assert.ok(manifest[name], 'Missing referenced asset');
  return Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
}

function validateUnit(output) {
  const count = name => {
    const matches = [...output.matchAll(new RegExp('^# '+name+' (\\d+)$', 'gm'))];
    assert.equal(matches.length, 1, 'Missing unit '+name+' total');
    return Number(matches[0][1]);
  };
  const passed = count('pass'), skipped = count('skipped');
  assert.ok(passed >= 410, 'Core unit tests did not all run');
  assert.equal(count('fail'), 0);
  assert.equal(count('cancelled'), 0);
  assert.equal(count('tests'), passed + skipped);
  assert.equal(skipped, 1);
  const skips = output.split('\n').filter(line => /^ok .*# SKIP/.test(line));
  assert.equal(skips.length, 1);
  assert.match(skips[0], /Fruit actual private V6\.4X fixture \(opt in; never bundled\)/);
  return {passed, skipped};
}

function validateSuite(output, expected, expectedPosts) {
  const lines = output.trim().split('\n');
  const summary = lines.findLast(line => line.startsWith('{'));
  const data = summary ? JSON.parse(summary) : {
    passed: lines.filter(line => line.startsWith('PASS ')).length,
    posts: lines.reduce((n, line) => n + Number(line.match(/^PASS .*\| POST=(\d+)/)?.[1] || 0), 0),
  };
  assert.equal(data.failures || 0, 0, 'Browser failures');
  assert.equal(data.passed, expected, 'Required browser cases missing');
  const posts = data.posts ?? data.results?.reduce((n, item) => n + (item.posts || 0), 0);
  assert.equal(posts, expectedPosts, 'Unexpected actual Mock POST total');
  return {passed:data.passed, posts};
}

async function run(command, args, env, logfile, timeout = 240000) {
  let output = '';
  const child = spawn(command, args, {env:{...process.env, ...env}, stdio:['ignore','pipe','pipe']});
  const log = fs.createWriteStream(logfile);
  for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => {
    output += bytes.toString();
    log.write(bytes);
    process.stdout.write(bytes);
  });
  let expired = false, killTimer;
  const timer = setTimeout(() => {
    expired = true;
    child.kill('SIGTERM');
    killTimer = setTimeout(() => child.kill('SIGKILL'), 1000);
  }, timeout);
  try {
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => code === 0 && !expired ? resolve() : reject(Error('Required check failed: '+path.basename(logfile)+' ('+(expired?'timeout':code ?? signal)+')')));
    });
    return output;
  } finally {
    clearTimeout(timer);
    clearTimeout(killTimer);
    log.end();
  }
}

async function main() {
  if (process.env.GITHUB_ACTIONS) assertFirstAttempt(process.env.GITHUB_RUN_ATTEMPT);
  if (process.argv[2] === '--units') {
    console.log(JSON.stringify(validateUnit(fs.readFileSync(process.argv[3], 'utf8'))));
    return;
  }
  const dir = path.resolve('dist'), out = path.resolve('artifacts/release-gate');
  if (process.argv[2] === '--check-manifest') {
    assert.deepEqual(distManifest(dir), JSON.parse(fs.readFileSync(path.join(out, 'sha256.json'), 'utf8')));
    console.log('Verified unchanged deployment bytes');
    return;
  }
  assert.equal(process.argv.length, 2, 'Unexpected gate arguments');
  // Always name the final dist inputs; suite defaults point at the development copy in public.
  for (const key of ['TEST_CASE','TEST_URL','PLAYWRIGHT_MODULE','CHROME_PATH']) assert.ok(!process.env[key], 'Release gate rejects '+key+' overrides');
  fs.mkdirSync(out, {recursive:true});
  fs.rmSync(path.join(out,'results.json'), {force:true});
  const frozen = distManifest(dir);
  fs.writeFileSync(path.join(out, 'sha256.json'), JSON.stringify(frozen, null, 2)+'\n');
  console.log('FROZEN_DIST '+JSON.stringify(frozen));
  const tlsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elsewhere-release-tls-'));
  let server;
  try {
    execFileSync('openssl', ['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(tlsDir,'key'),'-out',path.join(tlsDir,'cert'),'-days','1','-subj','/CN=127.0.0.1'], {stdio:'ignore'});
    server = https.createServer({key:fs.readFileSync(path.join(tlsDir,'key')),cert:fs.readFileSync(path.join(tlsDir,'cert'))}, (req,res) => {
      const name = new URL(req.url, 'https://127.0.0.1').pathname;
      const relative = name === '/Elsewhere/' ? 'index.html' : name.slice('/Elsewhere/'.length);
      if (req.method !== 'GET' || !name.startsWith('/Elsewhere/') || !Object.hasOwn(frozen, relative)) {
        res.writeHead(404).end(); return;
      }
      const mime = relative.endsWith('.js') ? 'text/javascript' : relative.endsWith('.css') ? 'text/css' : 'text/html';
      res.writeHead(200, {'content-type':mime+'; charset=utf-8','cache-control':'no-store'});
      fs.createReadStream(path.join(dir,relative)).pipe(res);
    });
    await new Promise((resolve,reject) => {server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const pages = 'https://127.0.0.1:'+server.address().port+'/Elsewhere/';
    const offline = pathToFileURL(path.join(dir,'Elsewhere_Phase1_Standalone.html')).href;
    // Full Chromium supports BFCache; the default headless shell does not.
    const chromiumPath = require('playwright').chromium.executablePath();
    const results = [];
    for (const [suite,url,expected,posts] of [
      ['release-blockers',offline,16,10],
      ['storage-recovery',offline,26,12],
      ['request-timeout',pages,16,22],
      ['data-protection',pages,17,0],
      ['life-history',pages,22,12],
    ]) {
      const output = await run(process.execPath,['--import','tsx','scripts/test-'+suite+'.cjs'],{TEST_URL:url,TEST_LABEL:'release-gate',CHROME_PATH:chromiumPath},path.join(out,suite+'.log'));
      results.push({suite,...validateSuite(output,expected,posts)});
      assert.deepEqual(distManifest(dir), frozen, 'A test modified final deployment files');
    }
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,passed:results.reduce((n,r)=>n+r.passed,0),posts:results.reduce((n,r)=>n+r.posts,0),automaticRetries:0},null,2)+'\n');
    console.log('RELEASE_GATE_PASSED '+JSON.stringify(results));
  } finally {
    if (server) {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    fs.rmSync(tlsDir,{recursive:true,force:true});
  }
}

module.exports = {assertFirstAttempt,distManifest,validateUnit,validateSuite,run};
if (require.main === module) main().catch(error=>{console.error(error);process.exitCode=1;});
