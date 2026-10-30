import test from 'node:test';
import assert from 'node:assert/strict';
import {describeFruitPrompt,fruitPromptRows} from '../fruitUiLabels';
import {createFruitState,parseFruitPreset} from './fruit/preset';
import type {FruitPrompt} from './fruit/types';
const prompt=(name:string,extra:Partial<FruitPrompt>={}):FruitPrompt=>({identifier:'test',name,content:'',group:'其他条目',role:'system',marker:false,originalEnabled:false,position:0,depth:4,injectionOrder:100,styleEntry:false,...extra});
test('Fruit UI maps friendly titles without leaking technical identifiers or changing source data',()=>{
  const p=prompt('🍏 文末钩子 @作者 #MODEL');const before=structuredClone(p);const label=describeFruitPrompt(p);
  assert.equal(label.title,'文末钩子');assert.equal(label.section,'story');assert.deepEqual(p,before);
  assert.equal(describeFruitPrompt(prompt('fruit-v61-display-section-06')).uncertain,true);
  assert.equal(describeFruitPrompt(prompt('📌 Persona Description',{identifier:'personaDescription',marker:true})).title,'用户身份');
  assert.equal(describeFruitPrompt(prompt('🔞 温柔')).section,'boundary');
});
test('Fruit UI preserves order and user overrides without category locks; unordered entries stay unavailable',async()=>{
  const doc={prompts:[prompt('乙',{identifier:'b'}),prompt('甲',{identifier:'a'}),prompt('🔞 特殊',{identifier:'c'}),prompt('未排序',{identifier:'d'})],prompt_order:[{character_id:100001,order:[{identifier:'a',enabled:true},{identifier:'b',enabled:false},{identifier:'c',enabled:true}]}]};
  const preset=await parseFruitPreset(new TextEncoder().encode(JSON.stringify(doc)),'test.json');const profile=createFruitState().profiles.meeting;
  profile.overrides.b=true;const before=structuredClone(profile);const rows=fruitPromptRows(preset,profile);
  assert.deepEqual(rows.map(x=>x.prompt.identifier),['a','b','c','d']);assert.deepEqual(rows.map(x=>x.enabled),[true,true,true,false]);assert.equal(rows[2].reason,'');assert.ok(rows[3].reason);assert.deepEqual(profile,before);
  profile.overrides.c=false;assert.equal(fruitPromptRows(preset,profile)[2].enabled,false);
});
