const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {main} = require('./test-fruit-novel-output.cjs');
const roleId = 'novel-role';
const list = p => p.locator('[data-terminal-list]');
const rows = p => list(p).locator('[data-prompt-row]');
const editor = p => p.locator('dialog[open]');
const button = (p, name) => p.getByRole('button', {name, exact: true});
const tools = async p => {const d = p.locator('[data-preset-tools]'); if (!await d.evaluate(el => el.open)) await d.locator('summary').click();};
const backups = async p => {const d = p.locator('[data-preset-backups]'); if (!await d.evaluate(el => el.open)) await d.locator('summary').click();};
const saved = p => p.locator('[data-preset-status]').filter({hasText:'保存成功'}).waitFor();
const save = async p => {await button(p,'保存预设').click();await saved(p);};
const read = (p, key = 'current', store = 'elsewhere-presets') => p.evaluate(({key,store}) => new Promise((resolve,reject) => {
 const q = indexedDB.open('elsewhere-fruit-private-v1');
 q.onerror = () => reject(q.error);
 q.onsuccess = () => {
  const db = q.result;
  if (!db.objectStoreNames.contains(store)) {db.close();resolve(undefined);return;}
  const tx = db.transaction(store), r = tx.objectStore(store).get(key);
  tx.oncomplete = () => {db.close();resolve(r.result);};
  tx.onabort = () => {db.close();reject(tx.error);};
 };
}),{key,store});
const put = (p, key, value, store = 'elsewhere-presets') => p.evaluate(({key,value,store}) => new Promise((resolve,reject) => {
 const q=indexedDB.open('elsewhere-fruit-private-v1');
 q.onsuccess=()=>{const db=q.result,tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value,key);tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(tx.error);};};
 q.onerror=()=>reject(q.error);
}),{key,value,store});
async function fromHome(p) {
 await p.locator('[data-home-page="1"]').click();
 await button(p,'打开预设').click();
}
async function presets(p) {
 await p.locator('[data-action=view][data-view=home],.chat-back').filter({visible:true}).first().click();
 await fromHome(p);
 await list(p).waitFor();
}
async function entry(p, id, values) {
 if (id) await list(p).locator(`[data-prompt-row="${id}"] .native-prompt-name`).click();
 else await button(p,'添加 Prompt').click();
 const form=editor(p);
 if (values.name !== undefined) await form.locator('[name=prompt-name]').fill(values.name);
 if (values.content !== undefined) await form.locator('textarea').fill(values.content);
 if (values.role !== undefined) await form.locator('[name=prompt-role]').selectOption(values.role);
 if (values.group !== undefined) await form.locator('[name=prompt-group]').fill(values.group);
 await button(form,'保存条目').click();
 await form.waitFor({state:'hidden'});
}
async function download(p, name) {
 const pending=p.waitForEvent('download');
 await button(p,name).click();
 return fs.readFileSync(await (await pending).path());
}
async function importFile(p, bytes, selector = '[data-native-import]') {
 await p.locator(selector).setInputFiles({name:'synthetic-preset.json',mimeType:'application/json',buffer:Buffer.from(bytes)});
}

async function cases(run) {
 const core=await import('../src/core/elsewherePreset.ts');
 const native=core.emptyPresetLibrary();native.revision=1;
 const rule=(id,name,content,extra={})=>({id,name,role:'system',enabled:true,content,...extra});
 const sample={...core.builtinPreset(),id:'sample',name:'合成小说预设',description:'隔离验收',entries:[rule('first','人物演绎','SHARED_FIRST {{literal}}'),rule('second','叙事规则','SHARED_SECOND',{role:'assistant'})]};
 const library=core.importElsewherePreset(native,sample);
 library.defaultPresetId='sample';
 library.bindings[roleId]={presetId:'inherit',overrides:{entries:{second:{content:'ROLE_SECOND'}}}};
 const names=['人物演绎','叙事规则','文风要求','正文篇幅','互动要求','情绪描写','场景连续性','时间感','环境细节','对话节奏'];
 const ten=names.map((name,i)=>rule('rule-'+i,name,`合成 Prompt ${i+1}。\n\n第二段合成正文。`,{enabled:i!==7}));
 const tenLibrary=core.importElsewherePreset({...core.emptyPresetLibrary(),revision:1},{...sample,entries:ten});tenLibrary.defaultPresetId='sample';
 const length={min:600,max:1200};
 const legacyNative={...core.builtinPreset(),settings:{meeting:{length,style:''},theatre:{length,style:''}}};
 const legacySample={...sample,settings:{meeting:{length:{min:440,max:880},style:'MEETING_STYLE'},theatre:{length:{min:1200,max:2400},style:'THEATRE_STYLE'}}};
 const dual={schemaVersion:1,revision:7,presets:[legacyNative,legacySample],defaults:{meeting:'sample',theatre:'native'},bindings:{[roleId]:{meeting:{presetId:'inherit',overrides:{entries:{second:{content:'OLD_MEETING_OVERRIDE'}},order:['second','first']}},theatre:{presetId:'sample',overrides:{entries:{second:{content:'OLD_THEATRE_OVERRIDE'}}}}}}};

 await run('mobile directly opens the role list and edits ten ordinary prompts',{phoneFirst:true,width:320},async t=>{
  const {p}=t;
  await presets(p);
  assert.equal(await p.locator('[data-preset-select]').count(),1);
  assert.equal(await p.locator('[data-preset-tools]').evaluate(el=>el.open),false);
  assert.equal(await p.getByText('面对面设置',{exact:true}).count(),0);
  await tools(p);await button(p,'新建空白预设').click();await saved(p);
  for(const [i,r] of ten.entries()) await entry(p,undefined,{...r,group:i<5?'演绎':'叙事',role:i===1?'assistant':'system'});
  assert.equal(await rows(p).count(),10);
  const firstId=await rows(p).first().getAttribute('data-prompt-row');
  await entry(p,firstId,{content:'\n\n手工编辑的正文。\n\n第二段。'});
  await list(p).getByRole('checkbox',{name:'启用时间感',exact:true}).uncheck();
  await p.getByRole('searchbox',{name:'搜索 Prompt'}).fill('文风');
  assert.equal(await rows(p).filter({visible:true}).count(),1);
  await p.getByRole('searchbox',{name:'搜索 Prompt'}).fill('');
  await button(p,'折叠 / 展开全部').click();assert.equal(await rows(p).filter({visible:true}).count(),0);
  await button(p,'折叠 / 展开全部').click();assert.equal(await rows(p).filter({visible:true}).count(),10);
  await p.getByRole('button',{name:'上移叙事规则',exact:true}).tap();
  assert.equal(await rows(p).first().locator('.native-prompt-name').innerText(),'叙事规则');
  await save(p);
  const effective=core.resolvePreset(await read(p),roleId);
  assert.equal(effective.entries[0].role,'assistant');assert.equal(effective.entries[1].content,'\n\n手工编辑的正文。\n\n第二段。');
  assert.equal(effective.entries.find(e=>e.name==='时间感').enabled,false);
  await tools(p);const bytes=await download(p,'导出 JSON');
  assert.deepEqual(core.parseElsewherePreset(bytes).entries,effective.entries);
  await importFile(p,bytes);await button(editor(p),'确认导入').click();await saved(p);
  const imported=core.resolvePreset(await read(p),roleId);
  assert.notEqual(imported.id,effective.id);assert.deepEqual(imported.entries,effective.entries);
  await p.reload();await t.ready();await p.locator('[data-action=enter][data-id=novel-role]').click();await fromHome(p);
  await rows(p).first().waitFor();assert.equal(await rows(p).count(),10);assert.equal(t.posts.length,0);
 });
 await run('desktop drag plus copying and deleting use the list order',{phoneFirst:true,desktop:true,width:650,nativeLibrary:library},async t=>{
  const {p}=t;await presets(p);
  await p.locator('[data-prompt-drag=second]').dragTo(rows(p).first());
  assert.equal(await rows(p).first().getAttribute('data-prompt-row'),'second');
  await rows(p).first().locator('.native-prompt-name').click();await button(editor(p),'复制条目').click();
  assert.equal(await rows(p).count(),3);
  await rows(p).last().locator('.native-prompt-name').click();p.once('dialog',d=>d.accept());await button(editor(p),'删除条目').click();
  await save(p);
  const edited=core.resolvePreset(await read(p),roleId);
  assert.deepEqual(edited.entries.map(e=>e.name),['叙事规则','叙事规则副本']);
  assert.notEqual(edited.entries[0].id,edited.entries[1].id);
  await tools(p);await button(p,'复制预设').click();await saved(p);
  const copied=core.resolvePreset(await read(p),roleId);
  assert.notEqual(copied.id,edited.id);assert.deepEqual(copied.entries,edited.entries);
  assert.deepEqual((await read(p)).presets.find(x=>x.id==='sample'),sample);assert.equal(t.posts.length,0);
 });
 await run('old V1 import previews the difference and offers theatre values as ordinary entries',{phoneFirst:true,nativeLibrary:library},async t=>{
  const {p}=t;await presets(p);await tools(p);
  await importFile(p,JSON.stringify(legacySample));
  assert.match(await editor(p).innerText(),/两种旧设置不同/);
  await button(editor(p),'沿用原戏中戏').click();await saved(p);
  const migrated=core.resolvePreset(await read(p),roleId);
  assert.ok(migrated.entries.some(e=>e.content==='文风：THEATRE_STYLE'));
  assert.ok(migrated.entries.some(e=>e.content.includes('1200–2400')));
  await rows(p).last().locator('.native-prompt-name').click();p.once('dialog',d=>d.accept());await button(editor(p),'删除条目').click();
  await save(p);assert.ok(!core.resolvePreset(await read(p),roleId).entries.some(e=>e.content==='文风：THEATRE_STYLE'));assert.equal(t.posts.length,0);
 });
 await run('invalid, third-party and oversized imports leave the library untouched; markup stays inert',{phoneFirst:true},async t=>{
  const {p}=t;await presets(p);await tools(p);const before=await read(p);
  for(const [bytes,message] of [['{"prompts":[],"prompt_order":[]}','Elsewhere'],['{oops','JSON'],[Buffer.alloc(core.PRESET_MAX_BYTES+1),'大小限制']]){
   await importFile(p,bytes);await p.locator('[data-preset-status]').filter({hasText:message}).waitFor();
   assert.deepEqual(await read(p),before);assert.equal(await editor(p).count(),0);
  }
  const inert={...sample,name:'<img src=x onerror="window.__presetExecuted=1">',entries:[rule('inert','合成条目','<script>window.__presetExecuted=1</script>')]};
  await importFile(p,JSON.stringify(inert));await button(editor(p),'确认导入').click();await saved(p);
  assert.equal(await p.evaluate(()=>window.__presetExecuted),undefined);assert.equal(core.resolvePreset(await read(p),roleId).entries[0].content,inert.entries[0].content);assert.equal(t.posts.length,0);
 });
 await run('V1 upgrade preserves the complete dual config and previous snapshot, including after explicit theatre recovery',{phoneFirst:true,nativeLibrary:dual,fruit:true},async t=>{
  const {p}=t;const previous={library:{...dual,revision:6},archive:{marker:'previous fixture'}};
  await put(p,'previous',previous);
  const original=await read(p,'current','preset-library');
  const before=await p.evaluate(()=>JSON.parse(localStorage.getItem('elsewhere-v01')).roles[0].chats);
  await presets(p);const l=await read(p);assert.equal(l.schemaVersion,2);assert.equal(l.defaultPresetId,'sample');
  assert.deepEqual(core.resolvePreset(l,roleId).entries.map(e=>e.content),['OLD_MEETING_OVERRIDE','SHARED_FIRST {{literal}}','目标 440–880 字，按剧情自然取舍，不凑字数。','文风：MEETING_STYLE']);
  assert.deepEqual(await read(p,'before-shared-novel'),{library:dual,previous});
  assert.deepEqual(await read(p,'current','preset-library'),original);
  await backups(p);const old=JSON.parse(await download(p,'导出合并前备份'));assert.deepEqual(old.library,dual);
  await button(p,'恢复合并前配置').click();await button(editor(p),'沿用原戏中戏').click();await saved(p);
  assert.ok(core.resolvePreset(await read(p),roleId).entries.some(e=>e.content==='OLD_THEATRE_OVERRIDE'));
  assert.deepEqual(await read(p,'before-shared-novel'),{library:dual,previous});
  assert.deepEqual((await read(p,'previous')).library,l);
  assert.deepEqual(await p.evaluate(()=>JSON.parse(localStorage.getItem('elsewhere-v01')).roles[0].chats),before);assert.equal(t.posts.length,0);
 });
 await run('an upgrade write refusal leaves the V1 library and previous version intact',{phoneFirst:true,nativeLibrary:dual},async t=>{
  const {p}=t;const previous={library:{...dual,revision:6},archive:{}};await put(p,'previous',previous);
  await p.evaluate(()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='elsewhere-presets'&&args[1]==='current')throw Error('synthetic write refusal after snapshot');return put.apply(this,args);};});
  await p.locator('.chat-back').filter({visible:true}).first().click();await fromHome(p);
  await p.locator('[data-preset-status]').filter({hasText:'未保存'}).waitFor();
  assert.deepEqual(await read(p),dual);assert.deepEqual(await read(p,'previous'),previous);assert.equal(await read(p,'before-shared-novel'),undefined);assert.equal(t.posts.length,0);
 });
 await run('old fruit archive preserves original bytes and only native reaches formal requests',{phoneFirst:true,fruit:true,content:'原生回退普通正文。'},async t=>{
  const {p}=t;const original=await read(p,'current','preset-library');
  await p.evaluate(()=>new Promise(resolve=>{const q=indexedDB.open('elsewhere-fruit-private-v1');q.onsuccess=()=>{const db=q.result,tx=db.transaction(['documents','preset-library'],'readwrite'),r=tx.objectStore('preset-library').get('current');r.onsuccess=()=>{const recovery=structuredClone(r.result);recovery.entries[1].raw=new TextEncoder().encode('EXACT RECOVERY ORIGINAL');tx.objectStore('documents').put(recovery,'role-preset-before-restore');tx.objectStore('documents').put({schema:1,raw:new TextEncoder().encode('EXACT MIGRATION ORIGINAL'),fileName:'migration.json'},'terminal-ux-migration-backup');};tx.oncomplete=()=>{db.close();resolve();};};}));
  await presets(p);await backups(p);
  const pending=p.waitForEvent('download');await p.locator('[data-preset-action=legacy-raw][data-id=entry-1]').click();
  assert.deepEqual([...fs.readFileSync(await (await pending).path())],Object.values(original.entries[1].raw));
  const archive=await read(p,'legacy');assert.equal(Buffer.from(Object.values(archive.recovery.entries[1].raw)).toString(),'EXACT RECOVERY ORIGINAL');assert.equal(Buffer.from(Object.values(archive.migration.raw)).toString(),'EXACT MIGRATION ORIGINAL');
  assert.deepEqual(await read(p,'current','preset-library'),original);assert.equal(t.posts.length,0);
  await p.locator('[data-action=view][data-view=home]').first().click();await p.locator('.dock [data-view=chat]').click();await p.locator('[data-action=chatpanel][data-panel=more]').click();await p.locator('[data-action=meet]').click();await t.send();
  await p.locator('.passage.theirs').filter({hasText:'原生回退普通正文。'}).waitFor();assert.equal(t.posts.length,1);assert.ok(!JSON.stringify(t.posts[0]).includes('合成规则 99'));
 });
 await run('previous native length and style become ordinary entries',{phoneFirst:true,libraryAlter:l=>{l.entries[0].profiles.meeting.style='OLD_NATIVE_STYLE';l.entries[0].profiles.meeting.length.max=1700;l.entries[0].profiles.theatre.style='OLD_THEATRE_STYLE';}},async t=>{
  await presets(t.p);const effective=core.resolvePreset(await read(t.p),roleId);
  assert.ok(effective.entries.some(e=>e.content==='文风：OLD_NATIVE_STYLE'));assert.ok(effective.entries.some(e=>e.content.includes('600–1700')));assert.ok(!effective.entries.some(e=>e.content==='文风：OLD_THEATRE_STYLE'));assert.equal(t.posts.length,0);
 });
 for(const options of [{},{opening:true},{regen:true},{play:true}]) await run('shared role prompt and native plain prose '+JSON.stringify(options),{nativeLibrary:library,content:'合成普通小说第一段。\n\n「这是无需标签的正文。」',...options,alter(r){
  r.chats.push({id:'phone-private',speaker:'me',text:'PHONE_HISTORY_ONLY',at:Date.parse('2026-11-06T21:59:58Z')});
  if(options.play)r.play.messages.push({id:'play-private',speaker:'me',text:'PLAY_HISTORY_ONLY',at:Date.parse('2026-11-06T21:59:59.500Z')});
  else if(!options.regen&&!options.opening)r.scene.messages.push({id:'scene-private',speaker:'me',text:'SCENE_HISTORY_ONLY',at:Date.parse('2026-11-06T21:59:59.500Z')});
 }},async t=>{
  const {p}=t;
  if(options.opening){await t.details();await button(p,'重新调用').click();}
  else if(options.regen)await p.locator('[data-action=regenmsg][data-id=prior-char]').click();else await t.send();
  await p.locator('.passage.theirs').filter({hasText:'合成普通小说第一段。'}).waitFor();assert.equal(t.posts.length,1);
  const messages=t.posts[0].messages;
  const configured=messages.filter(m=>/SHARED_FIRST|ROLE_SECOND/.test(m.content));
  assert.deepEqual(configured,[{role:'system',content:'SHARED_FIRST {{literal}}'},{role:'assistant',content:'ROLE_SECOND'}]);
  const wire=messages.map(m=>m.content).join('\n');assert.ok(!wire.includes('600–1200'));assert.ok(!wire.includes('正文以 <content> 包裹'));
  if(options.play){assert.match(wire,/PLAY_HISTORY_ONLY/);assert.doesNotMatch(wire,/SCENE_HISTORY_ONLY|PHONE_HISTORY_ONLY/);}
  else if(!options.regen&&!options.opening){assert.match(wire,/SCENE_HISTORY_ONLY/);assert.doesNotMatch(wire,/PLAY_HISTORY_ONLY/);}
  const record=await t.record();assert.equal(record.messages.at(-1).text,'合成普通小说第一段。\n\n「这是无需标签的正文。」');
  await p.reload();await t.ready();await p.locator('[data-action=enter][data-id=novel-role]').click();await p.locator(options.play?'[data-action=resume]':'[data-action=openconversation]').click();
  await p.locator('.passage.theirs').filter({hasText:'合成普通小说第一段。'}).waitFor();assert.deepEqual((await t.record()).messages,record.messages);assert.equal(t.posts.length,1);
 });
 await run('a formal request before opening the editor uses the meeting migration without writing old storage',{play:true,nativeLibrary:dual,content:'合成迁移后正文。'},async t=>{
  await t.send();await t.p.locator('.passage.theirs').filter({hasText:'合成迁移后正文。'}).waitFor();
  const wire=t.posts[0].messages.map(m=>m.content).join('\n');
  assert.match(wire,/OLD_MEETING_OVERRIDE/);assert.match(wire,/文风：MEETING_STYLE/);
  assert.doesNotMatch(wire,/OLD_THEATRE_OVERRIDE|THEATRE_STYLE/);
  assert.deepEqual(await read(t.p),dual);assert.equal(await read(t.p,'before-shared-novel'),undefined);assert.equal(t.posts.length,1);
 });
 await run('shared edits inherit, role overrides stay local, and preset deletion falls back safely',{phoneFirst:true,other:true,nativeLibrary:library},async t=>{
  const {p}=t;await presets(p);assert.equal(await p.locator('[data-preset-scope-notice]').count(),0);
  await entry(p,'first',{content:'A_ROLE_ONLY'});await save(p);
  await tools(p);await button(p,'编辑共享本体').click();assert.match(await p.locator('[data-preset-scope-notice]').innerText(),/合成另一角色/);
  await entry(p,'first',{content:'NEW_SHARED'});await save(p);
  const l=await read(p);assert.equal(core.resolvePreset(l,roleId).entries[0].content,'A_ROLE_ONLY');assert.equal(core.resolvePreset(l,'other-role').entries[0].content,'NEW_SHARED');
  await tools(p);await button(p,'删除预设').click();assert.match(await editor(p).innerText(),/全局默认将改为内置基础/);
  await button(editor(p),'确认删除预设').click();await saved(p);
  const after=await read(p);assert.equal(after.defaultPresetId,'native');assert.equal(core.resolvePreset(after,roleId).id,'native');assert.equal(core.resolvePreset(after,'other-role').id,'native');assert.equal(t.posts.length,0);
 });
 await run('refused preset write keeps both original library and editable draft',{phoneFirst:true,nativeLibrary:library},async t=>{
  const {p}=t;await presets(p);const before=await read(p);await entry(p,'first',{content:'UNSAVED_DRAFT'});
  await p.evaluate(()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='elsewhere-presets')throw Error('synthetic preset write refusal');return put.apply(this,args);};});
  await button(p,'保存预设').click();await p.locator('[data-preset-status]').filter({hasText:'未保存'}).waitFor();
  await list(p).locator('[data-prompt-row=first] .native-prompt-name').click();assert.equal(await editor(p).locator('textarea').inputValue(),'UNSAVED_DRAFT');assert.deepEqual(await read(p),before);assert.equal(t.posts.length,0);
 });
 await run('save before exporting includes the current effective role draft',{phoneFirst:true,nativeLibrary:library},async t=>{
  const {p}=t;await presets(p);await entry(p,'first',{content:'EXPORT_ROLE_DRAFT'});await tools(p);
  const pending=p.waitForEvent('download');await button(p,'导出 JSON').click();await button(editor(p),'保存后导出').click();
  const file=JSON.parse(fs.readFileSync(await (await pending).path()));
  assert.equal(file.entries[0].content,'EXPORT_ROLE_DRAFT');assert.equal(core.resolvePreset(await read(p),roleId).entries[0].content,'EXPORT_ROLE_DRAFT');assert.equal(t.posts.length,0);
 });
 await run('two tabs reject a stale write and preserve its draft for review',{phoneFirst:true,nativeLibrary:library},async t=>{
  const {p}=t;await presets(p);
  const second=await t.ctx.newPage();await second.goto(p.url());await second.locator('#app[data-storage-state=ready]').waitFor();await second.locator('[data-action=enter][data-id=novel-role]').click();await fromHome(second);await rows(second).first().waitFor();
  await entry(p,'first',{content:'FIRST_CONFIRMED'});await save(p);
  await entry(second,'first',{content:'STALE_EDIT'});await button(second,'保存预设').click();await second.locator('[data-preset-status]').filter({hasText:'其他标签页'}).waitFor();
  assert.equal(core.resolvePreset(await read(p),roleId).entries[0].content,'FIRST_CONFIRMED');
  await second.locator('[data-preset-conflict-reload]').click();await second.locator('[data-preset-status]').filter({hasText:'修改尚未保存'}).waitFor();
  await button(second,'保存预设').click();await button(editor(second),'继续核对').click();
  assert.equal(core.resolvePreset(await read(p),roleId).entries[0].content,'FIRST_CONFIRMED');await second.close();assert.equal(t.posts.length,0);
 });
 await run('blocked database upgrade leaves the old library in place',{phoneFirst:true,fruit:true},async t=>{
  const {p}=t;await p.evaluate(()=>new Promise(resolve=>{const q=indexedDB.open('elsewhere-fruit-private-v1');q.onsuccess=()=>{window.presetBlockingHandle=q.result;q.result.onversionchange=()=>{};resolve();};}));
  await p.locator('.chat-back').filter({visible:true}).first().click();await fromHome(p);await p.locator('[data-preset-status]').filter({hasText:'其他标签页'}).waitFor();
  assert.equal(await p.evaluate(()=>window.presetBlockingHandle.objectStoreNames.contains('elsewhere-presets')),false);assert.equal(t.posts.length,0);await p.evaluate(()=>window.presetBlockingHandle.close());
 });
 await run('old-format library backup restores original bytes as archive',{phoneFirst:true,fruit:true},async t=>{
  const {p}=t;
  const legacy=await p.evaluate(()=>new Promise(resolve=>{const q=indexedDB.open('elsewhere-fruit-private-v1');q.onsuccess=()=>{const db=q.result,tx=db.transaction('preset-library'),r=tx.objectStore('preset-library').get('current');tx.oncomplete=()=>{db.close();resolve(JSON.stringify({kind:'Elsewhere private preset library',version:1,library:r.result},(_k,v)=>v instanceof Uint8Array?{encoding:'base64',value:btoa(String.fromCharCode(...v))}:v));};};}));
  await presets(p);await tools(p);await button(p,'新建空白预设').click();await saved(p);const before=await read(p);
  await backups(p);await importFile(p,legacy,'[data-preset-restore]');await button(editor(p),'确认恢复').click();await saved(p);
  assert.equal(core.resolvePreset(await read(p),roleId).id,'native');assert.deepEqual((await read(p,'previous')).library,before);
  const archive=await read(p,'legacy');assert.equal(Buffer.from(Object.values(archive.library.entries[1].raw)).toString('base64'),JSON.parse(legacy).library.entries[1].raw.value);assert.equal(t.posts.length,0);
 });
 await run('private library backup and undo preserve role overrides and archives',{phoneFirst:true,nativeLibrary:dual},async t=>{
  const {p}=t;await presets(p);await backups(p);const before=await read(p),old=await read(p,'before-shared-novel');const bytes=await download(p,'导出私有库备份');
  await tools(p);await button(p,'新建空白预设').click();await saved(p);
  await backups(p);await importFile(p,bytes,'[data-preset-restore]');await button(editor(p),'确认恢复').click();await saved(p);
  const restored=await read(p);assert.deepEqual(restored.presets,before.presets);assert.deepEqual(restored.bindings,before.bindings);assert.deepEqual(await read(p,'before-shared-novel'),old);
  await backups(p);await button(p,'恢复上次修改前版本').click();await button(editor(p),'确认恢复').click();await saved(p);assert.equal((await read(p)).presets.length,before.presets.length+1);assert.equal(t.posts.length,0);
 });
 for(const [width,theme] of [[320,'blue'],[390,'blue'],[390,'green'],[390,'pink'],[390,'coffee'],[430,'night']]) await run(`mobile layout ${width} ${theme}`,{phoneFirst:true,width,theme,nativeLibrary:tenLibrary},async t=>{
  const {p}=t;await presets(p);assert.equal(await rows(p).count(),10);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const screenshot=process.env.PRESET_SCREENSHOTS;
  if(screenshot&&width===390&&theme==='blue')await p.screenshot({path:path.join(screenshot,'after-list-390.png')});
  await rows(p).first().locator('.native-prompt-name').tap();
  if(screenshot&&width===390&&theme==='blue')await p.screenshot({path:path.join(screenshot,'after-editor-390.png')});
  const field=editor(p).locator('textarea');const text='合成长段落。\n'.repeat(200);
  await field.fill(text);await field.evaluate(el=>{el.setSelectionRange(20,20);el.scrollTop=200;window.nativeFocused=el;});await t.advance(4000);
  assert.equal(await field.evaluate(el=>el===window.nativeFocused&&document.activeElement===el),true);assert.equal(await field.inputValue(),text);
  assert.ok(await editor(p).evaluate(el=>el.scrollWidth<=el.clientWidth+1));assert.equal(t.posts.length,0);
 });
}
main(cases).catch(error=>{console.error(error);process.exitCode=1;});
