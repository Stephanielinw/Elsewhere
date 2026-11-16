import test from 'node:test';
import assert from 'node:assert/strict';
import {uiIcon,plainUiLabel} from '../uiIcons';
import {renderPresetList,presetLabel} from '../terminalPresetView';
import {parseFruitPreset,createFruitState} from './fruit/preset';
test('legacy and functional UI icons render safe vectors without passing untrusted icon text into HTML',()=>{
 for(const key of ['chat','focus','drama','diary','monitor','presets','terminal','💭','⏳','📅','📍'])assert.match(uiIcon(key),/^<svg[\s>]/);
 assert.ok(!uiIcon('<img src=x onerror=alert(1)>').includes('<img'));assert.ok(!uiIcon('🐾').includes('🐾'));
 assert.equal(plainUiLabel('📌🍎 保留名字 🎭 V6.4X'),'保留名字 V6.4X');
});
test('preset display labels remove decorative emoji while original names/content/bytes remain unchanged',async()=>{
 const raw=new TextEncoder().encode(JSON.stringify({prompts:[{identifier:'p',name:'📌 🍎 原始名字',role:'system',content:'不要改变 🙂 正文'}],prompt_order:[{character_id:100001,order:[{identifier:'p',enabled:true}]}]}));
 const preset=await parseFruitPreset(raw,'fruit.json'),before=JSON.stringify(preset),html=renderPresetList(preset,createFruitState().profiles.meeting);
 assert.ok(!html.includes('<b>📌'));assert.ok(!html.includes('<b>🍎'));assert.equal(JSON.stringify(preset),before);assert.equal(plainUiLabel('正常名称'),'正常名称');
 assert.ok(!presetLabel({id:'preset',kind:'fruit',preset,enabled:false,profiles:createFruitState().profiles}).includes('🍎'));
});
test('emoji-only preset names remain identifiable without modifying author data',async()=>{
 const preset=await parseFruitPreset(new TextEncoder().encode(JSON.stringify({prompts:[{identifier:'p',name:'🍃',role:'system',content:'原件'}],prompt_order:[{character_id:100001,order:[{identifier:'p',enabled:true}]}]})),'preset.json');
 assert.ok(renderPresetList(preset,createFruitState().profiles.meeting).includes('未命名条目'));
 const entry={id:'p',kind:'fruit' as const,preset:{...preset,name:'🍎'},enabled:false,profiles:createFruitState().profiles};assert.equal(presetLabel(entry),'MoM 果实预设');assert.equal(entry.preset.name,'🍎');
});

test('doodle themes keep original ink, control size and line fallbacks',async()=>{
 const icons=await import('../uiIcons');
 const chat='<svg viewBox="0 0 48 48"><path d="M 2 5 L 8 9"/></svg>';
 icons.installDoodleIcons({chat,plus:'<svg viewBox="0 0 48 48"><script>alert(1)</script></svg>'});
 try{
  assert.equal(icons.normalizeIconTheme('nonsense'),'line');
  const original=icons.uiIcon('chat','app-symbol',true);
  assert.match(original,/viewBox="0 0 24 24"/);
  icons.setUiIconTheme('doodle');
  assert.match(icons.uiIcon('💬','app-symbol',true),/class="app-symbol"[^>]*viewBox="0 0 48 48"[^>]*stroke="currentColor"[^>]*aria-hidden="true"/);
  assert.match(icons.uiIcon('chat'),/d="M 2 5 L 8 9"/);
  for(const key of ['focus','plus'])assert.match(icons.uiIcon(key),/viewBox="0 0 24 24"/);
  icons.setUiIconTheme('doodle-motion');
  assert.match(icons.uiIcon('chat','app-symbol',true),/data-doodle-app/);
  assert.doesNotMatch(icons.uiIcon('chat'),/data-doodle-app|filter=|pathLength=/);
  assert.doesNotMatch(icons.uiIcon('__proto__'),/\[object Object\]/);
 }finally{
  icons.setUiIconTheme('line');
  icons.installDoodleIcons({});
 }
});
