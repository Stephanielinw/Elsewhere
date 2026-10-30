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
