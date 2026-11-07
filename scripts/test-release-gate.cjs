const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {distManifest, validateUnit, validateSuite, assertFirstAttempt, run} = require('./release-gate.cjs');

test('gate rejects missing assets, private paths, extra files and changed final bytes', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-gate-test-'));
  t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
  fs.mkdirSync(path.join(dir, 'assets'));
  const html = '<div id="app"></div><script src="/Elsewhere/assets/app.js"></script><link href="/Elsewhere/assets/app.css">';
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  fs.writeFileSync(path.join(dir, 'Elsewhere_Phase1_Standalone.html'), '<div id="app"></div><script>void 0</script>');
  fs.writeFileSync(path.join(dir, 'assets/app.js'), 'void 0');
  assert.throws(() => distManifest(dir));
  fs.writeFileSync(path.join(dir, 'assets/app.css'), 'body{}');
  const frozen = distManifest(dir);
  fs.appendFileSync(path.join(dir, 'assets/app.js'), ';void 1');
  assert.notDeepEqual(distManifest(dir), frozen);
  fs.appendFileSync(path.join(dir, 'assets/app.js'), '// /Users/synthetic/private');
  assert.throws(() => distManifest(dir), /privacy/);
  fs.writeFileSync(path.join(dir, 'assets/app.js'), 'void 0');
  fs.writeFileSync(path.join(dir, 'synthetic-backup.json'), '{}');
  assert.throws(() => distManifest(dir), /Unexpected/);
});

test('a nonempty complete suite is required, including actual POST totals', () => {
  assert.deepEqual(validateSuite('{"passed":16,"failures":0,"posts":22}', 16, 22), {passed:16,posts:22});
  for (const output of ['', '{"passed":0}', '{"passed":15,"posts":22}', '{"passed":16,"failures":1,"posts":22}', '{"passed":16,"posts":23}']) {
    assert.throws(() => validateSuite(output, 16, 22));
  }
  const lines = 'PASS one | POST=1\nPASS two | POST=0\n';
  assert.deepEqual(validateSuite(lines, 2, 1), {passed:2,posts:1});
});

test('unit gate permits only the existing explicitly private fixture skip', () => {
  const log = 'ok 69 - Fruit actual private V6.4X fixture (opt in; never bundled) # SKIP\n# tests 411\n# pass 410\n# fail 0\n# skipped 1\n# cancelled 0\n';
  assert.equal(validateUnit(log).passed, 410);
  assert.throws(() => validateUnit(log.replace('# fail 0', '# fail 1')));
  assert.throws(() => validateUnit(log.replace('Fruit actual private V6.4X fixture (opt in; never bundled)', 'required browser test')));
  assert.throws(() => validateUnit(''));
});

test('re-running an existing workflow is an error, never a successful skip', () => {
  assertFirstAttempt('1');
  assert.throws(() => assertFirstAttempt('2'), /new workflow_dispatch/);
});

test('a failed or hanging check exits the gate before subsequent work', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-gate-child-'));
  t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
  let reachedUpload = false;
  await assert.rejects(async () => {
    await run(process.execPath, ['-e','process.exit(2)'], {}, path.join(dir,'failed.log'));
    reachedUpload = true;
  }, /Required check failed/);
  assert.equal(reachedUpload, false);
  await assert.rejects(run(process.execPath, ['-e','setInterval(()=>{},1000)'], {}, path.join(dir,'hung.log'), 50), /timeout/);
});
