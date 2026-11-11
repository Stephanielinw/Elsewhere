const assert=require('node:assert/strict'),fs=require('node:fs');
const {main}=require('./test-fruit-novel-output.cjs');
const read=async(t,key='current')=>t.p.evaluate(key=>new Promise((yes,no)=>{const q=indexedDB.open('elsewhere-fruit-private-v1');q.onsuccess=()=>{const db=q.result;if(!db.objectStoreNames.contains('elsewhere-presets')){db.close();yes(undefined);return;}const tx=db.transaction('elsewhere-presets'),r=tx.objectStore('elsewhere-presets').get(key);tx.oncomplete=()=>{db.close();yes(r.result);};tx.onabort=()=>no(Error('fixture read failed'));};}),key);
const saved=async t=>t.p.getByRole('status').filter({hasText:'保存成功'}).waitFor();
async function presets(t){await t.p.locator('[data-action=view][data-view=home],.chat-back').filter({visible:true}).first().click();await t.p.locator('[data-home-page="1"]').click();await t.p.getByRole('button',{name:'打开预设',exact:true}).click();await t.p.getByRole('button',{name:'新建空白预设',exact:true}).waitFor();}
const tab=(t,name)=>t.p.getByRole('button',{name,exact:true}).click();
const field=(t,name)=>t.p.locator('[data-preset-field="'+name+'"]');
async function download(t,button){const pending=t.p.waitForEvent('download');await button.click();const file=await pending;return fs.readFileSync(await file.path());}
async function cases(run){
 const core=await import('../src/core/elsewherePreset.ts');
 const native=core.emptyPresetLibrary();native.revision=1;
 const sample={...core.builtinPreset(),id:'sample',name:'合成原生规则',description:'只用于隔离验收',entries:[{id:'first',name:'第一规则',role:'system',enabled:true,content:'SHARED_FIRST {{literal}}'},{id:'second',name:'第二规则',role:'assistant',enabled:true,content:'SHARED_SECOND'}]};
 const library=core.importElsewherePreset(native,sample);library.defaults={meeting:'sample',theatre:'sample'};
 library.bindings['novel-role']={theatre:{presetId:'sample',overrides:{entries:{second:{content:'THEATRE_ONLY'}}}}};
 await run('native editor creates saves exports and imports literal entries in actual order',{phoneFirst:true,width:320},async t=>{
  await presets(t);await tab(t,'新建空白预设');
  await field(t,'name').fill('合成编辑预设');await field(t,'description').fill('合成简介');
  for(const [i,text]of ['FIRST_ORIGINAL\n\n保留段落','SECOND_ORIGINAL'].entries()){
   await tab(t,'新增条目');await field(t,'entry.'+i+'.name').fill('合成条目'+i);await field(t,'entry.'+i+'.content').fill(text);
  }
  await field(t,'entry.1.role').selectOption('assistant');await field(t,'entry.0.enabled').uncheck();
  await t.p.getByRole('button',{name:'上移条目 2'}).click();
  assert.match(await t.p.locator('[data-preset-scope-notice]').innerText(),/修改会影响使用此预设的角色/);
  await tab(t,'保存共享预设');await saved(t);
  const l=await read(t),p=l.presets.at(-1);assert.equal(p.entries[0].content,'SECOND_ORIGINAL');assert.equal(p.entries[0].role,'assistant');assert.equal(p.entries[1].enabled,false);assert.equal(p.entries[1].content,'FIRST_ORIGINAL\n\n保留段落');
  await tab(t,'导出预设');const bytes=await download(t,t.p.getByRole('button',{name:'导出 JSON',exact:true}));assert.deepEqual(JSON.parse(bytes),p);
  await tab(t,'导入预设');await t.p.locator('[data-native-import]').setInputFiles({name:'native.json',mimeType:'application/json',buffer:bytes});await t.p.locator('[data-import-preview]').waitFor();
  assert.match(await t.p.locator('[data-import-preview]').innerText(),/新 ID/);await tab(t,'确认导入');await saved(t);
  const imported=(await read(t)).presets.at(-1);assert.notEqual(imported.id,p.id);assert.deepEqual(imported.entries,p.entries);assert.deepEqual(imported.settings,p.settings);
  const last=imported.id;await t.p.reload();await t.ready();await t.p.locator('[data-action=enter][data-id=novel-role]').click();await t.p.locator('[data-home-page="1"]').click();await t.p.getByRole('button',{name:'打开预设',exact:true}).click();await t.p.locator('[data-preset-id="'+last+'"]').getByRole('button',{name:'编辑预设',exact:true}).click();
  assert.equal(await field(t,'entry.1.content').inputValue(),'FIRST_ORIGINAL\n\n保留段落');assert.equal(t.posts.length,0);
 });
 await run('copying presets and duplicating or deleting entries keeps independent IDs and the source intact',{phoneFirst:true,nativeLibrary:library},async t=>{
  await presets(t);await t.p.locator('[data-preset-id="sample"]').getByRole('button',{name:'复制预设',exact:true}).click();await saved(t);
  await t.p.locator('[data-preset-action=duplicate-entry][data-index="0"]').click();await t.p.locator('[data-preset-action=delete-entry][data-index="0"]').click();await t.p.locator('dialog').getByRole('button',{name:'删除条目',exact:true}).click();await tab(t,'保存共享预设');await saved(t);
  const after=await read(t),copy=after.presets.at(-1);assert.notEqual(copy.id,'sample');assert.equal(copy.entries.length,2);assert.notEqual(copy.entries[0].id,'first');assert.equal(copy.entries[0].content,sample.entries[0].content);assert.equal(copy.entries[1].id,'second');assert.deepEqual(after.presets.find(p=>p.id==='sample'),sample);
  await tab(t,'我的预设');await t.p.locator('[data-preset-id="'+copy.id+'"]').getByRole('button',{name:'删除预设',exact:true}).click();await t.p.getByRole('button',{name:'确认删除预设',exact:true}).click();await saved(t);assert.deepEqual((await read(t)).presets,library.presets);assert.equal(t.posts.length,0);
 });
 await run('imports reject ST and malformed data while HTML remains inert',{phoneFirst:true},async t=>{
  await presets(t);await tab(t,'导入预设');const before=await read(t);
  await t.p.locator('[data-native-import]').setInputFiles({name:'valid-preview.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(sample))});await t.p.locator('[data-import-preview]').waitFor();
  for(const [name,text]of [['st.json','{"prompts":[],"prompt_order":[]}'],['broken.json','{oops']]){await t.p.locator('[data-native-import]').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(text)});await t.p.locator('[data-preset-status]').filter({hasText:name==='st.json'?'Elsewhere':'JSON'}).waitFor();assert.deepEqual(await read(t),before);assert.equal(await t.p.locator('[data-import-preview]').count(),0);}
  const p={...sample,name:'<img src=x onerror="window.__presetExecuted=1">',entries:[{...sample.entries[0],content:'<script>window.__presetExecuted=1</script>'}]};
  await t.p.locator('[data-native-import]').setInputFiles({name:'inert.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});await tab(t,'确认导入');await saved(t);
  assert.equal(await t.p.evaluate(()=>window.__presetExecuted),undefined);assert.equal(await field(t,'entry.0.content').inputValue(),p.entries[0].content);assert.equal(t.posts.length,0);
 });
 await run('old selected third-party original is archived byte-for-byte and its request falls back to native',{phoneFirst:true,fruit:true,content:'原生回退普通正文。'},async t=>{
  const old=await t.p.evaluate(()=>new Promise(resolve=>{const q=indexedDB.open('elsewhere-fruit-private-v1');q.onsuccess=()=>{const db=q.result,tx=db.transaction('preset-library'),r=tx.objectStore('preset-library').get('current');tx.oncomplete=()=>{db.close();resolve(Array.from(r.result.entries[1].raw));};};}));
  await t.p.evaluate(()=>new Promise(resolve=>{const q=indexedDB.open('elsewhere-fruit-private-v1');q.onsuccess=()=>{const db=q.result,tx=db.transaction(['documents','preset-library'],'readwrite'),r=tx.objectStore('preset-library').get('current');r.onsuccess=()=>{const recovery=structuredClone(r.result);recovery.entries[1].raw=new TextEncoder().encode('EXACT RECOVERY ORIGINAL');recovery.entries[1].fileName='recovery.json';tx.objectStore('documents').put(recovery,'role-preset-before-restore');tx.objectStore('documents').put({schema:1,raw:new TextEncoder().encode('EXACT MIGRATION ORIGINAL'),fileName:'migration.json'},'terminal-ux-migration-backup');};tx.oncomplete=()=>{db.close();resolve();};};}));
  await presets(t);await tab(t,'新建空白预设');await tab(t,'我的预设');
  await t.p.getByText('备份、恢复与旧预设归档',{exact:true}).click();
  const bytes=await download(t,t.p.locator('[data-preset-action=legacy-raw][data-id=entry-1]'));assert.deepEqual([...bytes],old);
  const snapshot=await read(t,'legacy');assert.deepEqual(Object.values(snapshot.library.entries[1].raw),old);assert.equal(Buffer.from(Object.values(snapshot.recovery.entries[1].raw)).toString(),'EXACT RECOVERY ORIGINAL');assert.equal(Buffer.from(Object.values(snapshot.migration.raw)).toString(),'EXACT MIGRATION ORIGINAL');assert.equal(t.posts.length,0);
  await t.p.locator('[data-action=view][data-view=home]').first().click();await t.p.locator('.dock [data-view=chat]').click();await t.p.locator('[data-action=chatpanel][data-panel=more]').click();await t.p.locator('[data-action=meet]').click();await t.send();await t.p.locator('.passage.theirs').filter({hasText:'原生回退普通正文。'}).waitFor();assert.equal(t.posts.length,1);assert.ok(!JSON.stringify(t.posts[0]).includes('合成规则 99'));assert.equal((await t.record()).novelAttempt.presetId,'native');
 });
 await run('existing native settings are retained instead of silently replaced during upgrade',{phoneFirst:true,libraryAlter:l=>{l.entries[0].profiles.meeting.style='OLD_NATIVE_STYLE';l.entries[0].profiles.meeting.length.max=1700;l.entries[0].profiles.theatre.style='OLD_THEATRE_STYLE';}},async t=>{
  await presets(t);const l=await read(t);assert.equal(core.resolvePreset(l,'novel-role','meeting').settings.meeting.style,'OLD_NATIVE_STYLE');assert.equal(core.resolvePreset(l,'novel-role','meeting').settings.meeting.length.max,1700);assert.equal(core.resolvePreset(l,'novel-role','theatre').settings.theatre.style,'OLD_THEATRE_STYLE');await t.p.locator('[data-preset-id="upgraded-native"]').getByRole('button',{name:'编辑预设',exact:true}).click();assert.equal(await field(t,'meeting.style').inputValue(),'OLD_NATIVE_STYLE');assert.equal(t.posts.length,0);
 });
 for(const options of [{},{opening:true},{regen:true},{play:true}])await run('native plain prose saves displays and refreshes '+JSON.stringify(options),{nativeLibrary:library,content:'合成普通小说第一段。\n\n「这是无需标签的正文。」',...options},async t=>{
  if(options.opening){await t.details();await t.p.getByRole('button',{name:'重新调用',exact:true}).click();}
  else if(options.regen)await t.p.locator('[data-action=regenmsg][data-id=prior-char]').click();else await t.send();
  await t.p.locator('.passage.theirs').filter({hasText:'合成普通小说第一段。'}).waitFor();assert.equal(t.posts.length,1);
  const wire=t.posts[0].messages.map(m=>m.content).join('\n');assert.match(wire,/SHARED_FIRST \{\{literal\}\}/);assert.ok(wire.indexOf('SHARED_FIRST')<wire.indexOf(options.play?'THEATRE_ONLY':'SHARED_SECOND'));
  assert.ok(!wire.includes('正文以 <content> 包裹'));const record=await t.record();assert.equal(record.messages.at(-1).text,'合成普通小说第一段。\n\n「这是无需标签的正文。」');
  await t.p.reload();await t.ready();await t.p.locator('[data-action=enter][data-id=novel-role]').click();await t.p.locator(options.play?'[data-action=resume]':'[data-action=openconversation]').click();await t.p.locator('.passage.theirs').filter({hasText:'合成普通小说第一段。'}).waitFor();assert.deepEqual((await t.record()).messages,record.messages);assert.equal(t.posts.length,1);
 });
 await run('shared and per-role editor scope is explicit and deletion atomically restores defaults',{phoneFirst:true,other:true,nativeLibrary:library},async t=>{
  await presets(t);await t.p.locator('[data-preset-id="sample"]').getByRole('button',{name:'编辑预设',exact:true}).click();
  assert.match(await t.p.locator('[data-preset-scope-notice]').innerText(),/合成另一角色/);
  await field(t,'entry.0.content').fill('SHARED_CHANGED');await tab(t,'保存共享预设');await saved(t);
  await t.p.locator('[data-preset-scope]').selectOption('meeting');assert.match(await t.p.locator('[data-preset-scope-notice]').innerText(),/仅修改 合成小说角色 · 面对面/);
  await field(t,'entry.0.content').fill('A_MEETING_ONLY');await tab(t,'仅保存此角色覆盖');await saved(t);
  let l=await read(t);assert.equal(l.bindings['novel-role'].meeting.presetId,'inherit');assert.equal(core.resolvePreset(l,'novel-role','meeting').entries[0].content,'A_MEETING_ONLY');assert.equal(core.resolvePreset(l,'other-role','meeting').entries[0].content,'SHARED_CHANGED');assert.equal(core.resolvePreset(l,'novel-role','theatre').entries[0].content,'SHARED_CHANGED');
  await t.p.locator('[data-preset-scope]').selectOption('shared');await field(t,'meeting.max').fill('1800');await tab(t,'保存共享预设');await saved(t);l=await read(t);assert.equal(core.resolvePreset(l,'novel-role','meeting').settings.meeting.length.max,1800);assert.equal(core.resolvePreset(l,'novel-role','meeting').entries[0].content,'A_MEETING_ONLY');
  await tab(t,'我的预设');await t.p.locator('[data-preset-id="sample"]').getByRole('button',{name:'删除预设',exact:true}).click();assert.match(await t.p.locator('dialog').innerText(),/默认引用：面对面、戏中戏/);await t.p.getByRole('button',{name:'确认删除预设'}).click();await saved(t);
  const after=await read(t);assert.equal(after.defaults.meeting,'native');assert.equal(core.resolvePreset(after,'novel-role','meeting').id,'native');assert.equal(core.resolvePreset(after,'other-role','meeting').id,'native');assert.equal(t.posts.length,0);
 });
 await run('refused preset transaction keeps the original library and editable unsaved draft',{phoneFirst:true,nativeLibrary:library},async t=>{
  await presets(t);await t.p.locator('[data-preset-id="sample"]').getByRole('button',{name:'编辑预设',exact:true}).click();const before=await read(t);
  await field(t,'entry.0.content').fill('UNSAVED_DRAFT');await t.p.evaluate(()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='elsewhere-presets')throw Error('synthetic preset write refusal');return put.apply(this,args);};});
  await tab(t,'保存共享预设');await t.p.locator('[data-preset-status]').filter({hasText:'未保存'}).waitFor();assert.equal(await field(t,'entry.0.content').inputValue(),'UNSAVED_DRAFT');assert.deepEqual(await read(t),before);assert.equal(t.posts.length,0);
 });
 await run('save before export saves the pending shared body even from a role scope',{phoneFirst:true,nativeLibrary:library},async t=>{
  await presets(t);await t.p.locator('[data-preset-id="sample"]').getByRole('button',{name:'编辑预设',exact:true}).click();await field(t,'name').fill('未保存共享名称');await t.p.locator('[data-preset-scope]').selectOption('meeting');await field(t,'meeting.style').fill('未保存角色文风');await tab(t,'导出预设');const pending=t.p.waitForEvent('download');await tab(t,'导出 JSON');await t.p.getByRole('button',{name:'保存后导出',exact:true}).click();const bytes=fs.readFileSync(await (await pending).path());assert.equal(JSON.parse(bytes).name,'未保存共享名称');assert.equal((await read(t)).presets.find(p=>p.id==='sample').name,'未保存共享名称');await tab(t,'编辑预设');assert.equal(await field(t,'meeting.style').inputValue(),'未保存角色文风');assert.equal(t.posts.length,0);
 });
 await run('two tabs cannot overwrite a newer preset revision',{phoneFirst:true,nativeLibrary:library},async t=>{
  await presets(t);await t.p.locator('[data-preset-id="sample"]').getByRole('button',{name:'编辑预设',exact:true}).click();
  const second=await t.ctx.newPage();await second.goto(t.p.url());await second.locator('#app[data-storage-state=ready]').waitFor();await second.locator('[data-action=enter][data-id=novel-role]').click();await second.locator('[data-home-page="1"]').click();await second.getByRole('button',{name:'打开预设',exact:true}).click();await second.locator('[data-preset-id="sample"]').getByRole('button',{name:'编辑预设',exact:true}).click();
  await field(t,'entry.0.content').fill('FIRST_CONFIRMED');await tab(t,'保存共享预设');await saved(t);
  await second.locator('[data-preset-field="entry.0.content"]').fill('STALE_EDIT');await second.getByRole('button',{name:'保存共享预设',exact:true}).click();await second.locator('[data-preset-status]').filter({hasText:'其他标签页'}).waitFor();
  assert.equal((await read(t)).presets.find(p=>p.id==='sample').entries[0].content,'FIRST_CONFIRMED');assert.equal(await second.locator('[data-preset-field="entry.0.content"]').inputValue(),'STALE_EDIT');await second.locator('[data-preset-action=reload]').click();await second.locator('dialog').getByRole('button',{name:'重新读取',exact:true}).click();await second.locator('dialog').waitFor({state:'detached'});await second.getByRole('button',{name:'保存共享预设',exact:true}).click();await second.getByRole('button',{name:'保留新版本',exact:true}).click();assert.equal((await read(t)).presets.find(p=>p.id==='sample').entries[0].content,'FIRST_CONFIRMED');await second.close();assert.equal(t.posts.length,0);
 });
 await run('a blocked storage upgrade keeps the old original and the new action unsaved',{phoneFirst:true,fruit:true},async t=>{
  await t.p.evaluate(()=>new Promise(resolve=>{const q=indexedDB.open('elsewhere-fruit-private-v1');q.onsuccess=()=>{window.presetBlockingHandle=q.result;q.result.onversionchange=()=>{};resolve();};}));
  await t.p.locator('[data-action=view][data-view=home],.chat-back').filter({visible:true}).first().click();await t.p.locator('[data-home-page="1"]').click();await t.p.getByRole('button',{name:'打开预设',exact:true}).click();await t.p.locator('[data-preset-status]').filter({hasText:'其他标签页'}).waitFor();
  assert.equal(await t.p.evaluate(()=>window.presetBlockingHandle.objectStoreNames.contains('elsewhere-presets')),false);assert.equal(t.posts.length,0);await t.p.evaluate(()=>window.presetBlockingHandle.close());assert.equal(await read(t),undefined);
 });
 await run('previous-format library backups restore safely as an exportable archive', {phoneFirst:true,fruit:true},async t=>{
  const legacy=await t.p.evaluate(()=>new Promise(resolve=>{const q=indexedDB.open('elsewhere-fruit-private-v1');q.onsuccess=()=>{const db=q.result,tx=db.transaction('preset-library'),r=tx.objectStore('preset-library').get('current');tx.oncomplete=()=>{db.close();resolve(JSON.stringify({kind:'Elsewhere private preset library',version:1,library:r.result},(_k,v)=>{if(!(v instanceof Uint8Array))return v;return {encoding:'base64',value:btoa(String.fromCharCode(...v))};}));};};}));
  await presets(t);await tab(t,'新建空白预设');const before=await read(t);await tab(t,'我的预设');await t.p.getByText('备份、恢复与旧预设归档',{exact:true}).click();
  await t.p.locator('[data-preset-restore]').setInputFiles({name:'old-library.json',mimeType:'application/json',buffer:Buffer.from(legacy)});await t.p.getByRole('button',{name:'确认恢复',exact:true}).waitFor();assert.match(await t.p.locator('dialog').innerText(),/只恢复到可导出的归档/);await t.p.getByRole('button',{name:'确认恢复',exact:true}).click();await saved(t);
  const restored=await read(t),archive=await read(t,'legacy');assert.equal(restored.presets.length,1);assert.equal(core.resolvePreset(restored,'novel-role','meeting').id,'native');assert.equal((await read(t,'previous')).library.presets.length,before.presets.length);
  const original=JSON.parse(legacy).library.entries[1].raw;assert.equal(Buffer.from(Object.values(archive.library.entries[1].raw)).toString('base64'),original.value);assert.equal(t.posts.length,0);
 });
 await run('private library backup and undo retain native overrides and old original bytes',{phoneFirst:true,fruit:true},async t=>{
  await presets(t);await tab(t,'新建空白预设');await field(t,'name').fill('备份预设');await field(t,'meeting.style').fill('PRIVATE_STYLE');await tab(t,'保存共享预设');await saved(t);const before=await read(t),old=await read(t,'legacy');
  await tab(t,'我的预设');await t.p.getByText('备份、恢复与旧预设归档',{exact:true}).click();const bytes=await download(t,t.p.getByRole('button',{name:'导出私有库备份',exact:true}));
  await tab(t,'新建空白预设');await tab(t,'我的预设');await t.p.getByText('备份、恢复与旧预设归档',{exact:true}).click();await t.p.locator('[data-preset-restore]').setInputFiles({name:'library.json',mimeType:'application/json',buffer:bytes});await t.p.getByRole('button',{name:'确认恢复',exact:true}).click();await saved(t);
  const restored=await read(t);assert.deepEqual(restored.presets,before.presets);assert.deepEqual(restored.bindings,before.bindings);assert.deepEqual(await read(t,'legacy'),old);
  await t.p.getByText('备份、恢复与旧预设归档',{exact:true}).click();await tab(t,'恢复上次修改前版本');await t.p.getByRole('button',{name:'确认恢复',exact:true}).click();await saved(t);assert.equal((await read(t)).presets.length,before.presets.length+1);assert.equal(t.posts.length,0);
 });
 for(const theme of ['blue','green','pink','coffee','night'])await run('phone long-text focus and layout '+theme,{phoneFirst:true,width:theme==='blue'?320:theme==='night'?430:390,theme,nativeLibrary:library},async t=>{
  await presets(t);await t.p.locator('[data-preset-id="sample"]').getByRole('button',{name:'编辑预设',exact:true}).click();const area=field(t,'entry.0.content'),text='合成长段落。\n'.repeat(200);await area.fill(text);await area.evaluate(el=>{el.setSelectionRange(20,20);el.scrollTop=200;window.nativeFocused=el;});await t.advance(4000);
  assert.equal(await area.evaluate(el=>el===window.nativeFocused&&document.activeElement===el),true);assert.equal(await area.inputValue(),text);assert.ok(await t.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await t.p.screenshot({path:'artifacts/elsewhere-preset-v1/editor-'+theme+'.png'});assert.equal(t.posts.length,0);
 });

}
main(cases).catch(error=>{console.error(error);process.exitCode=1});
