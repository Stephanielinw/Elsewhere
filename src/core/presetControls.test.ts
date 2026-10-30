import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFruitPreset,createFruitState} from './fruit/preset';
import {compileFruitPrompt} from './fruit/compiler';
import {makeFruitFixtureContext} from './fruit/fixture';
import {editPrompt,planPresetUpdate} from './fruit/profile';
import {renderPresetList,renderPromptEditor} from '../terminalPresetView';
import {renderFruitPreview} from '../fruitPresetView';
import {fruitPromptRows} from '../fruitUiLabels';

test('content-labelled prompts are editable and controlled by each profile; snow remains closed and originals intact',async()=>{
  const doc={prompts:[
    {identifier:'master',name:'📌 🥵NSFW总开关｜按需·固定位置',content:'MASTER_BODY'},
    {identifier:'output',name:'📌 🥵NSFW输出｜必开·固定位置',content:'OUTPUT_BODY'},
    {identifier:'snow',name:'小剧场',content:'<snow>STILL_DISABLED</snow>'},
    {identifier:'charDescription',name:'角色身份',marker:true,content:''},
  ],prompt_order:[{order:['master','output','snow','charDescription'].map(identifier=>({identifier,enabled:true}))}]};
  const raw=new TextEncoder().encode('\ufeff '+JSON.stringify(doc,null,2)+'\n'),preset=await parseFruitPreset(raw,'local.json');
  const profiles=createFruitState().profiles,html=renderPresetList(preset,profiles.meeting);
  for(const id of ['master','output']){
    const prompt=preset.prompts.find(p=>p.identifier===id)!;
    assert.equal(prompt.blockedReason,undefined);
    const input=html.match(new RegExp('<input[^>]*data-prompt-enabled="'+id+'"[^>]*>'))?.[0];
    assert.ok(input);assert.ok(!input.includes('disabled'));
    assert.ok(!renderPromptEditor(prompt,prompt).match(/<textarea[^>]*disabled/));
  }
  assert.match(html,/<input[^>]*data-prompt-enabled="snow"[^>]*disabled/);
  assert.match(html,/<input[^>]*data-prompt-enabled="charDescription"[^>]*disabled/);
  const meeting=editPrompt(preset,{...profiles.meeting,overrides:{master:false,output:true,snow:true}},'output',{content:'CONFIRMED_EDIT'});
  const compiled=compileFruitPrompt(preset,meeting,makeFruitFixtureContext('meeting'));
  assert.equal(compiled.valid,true);assert.equal(compiled.sendAllowed,false);
  assert.ok(compiled.messages.some(m=>m.sourceId==='output'&&m.content==='CONFIRMED_EDIT'));
  assert.ok(!compiled.messages.some(m=>m.sourceId==='master'||m.sourceId==='snow'));
  const theatre=compileFruitPrompt(preset,profiles.theatre,makeFruitFixtureContext('theatre'));
  assert.equal(theatre.messages.find(m=>m.sourceId==='master')?.content,'MASTER_BODY');
  assert.equal(theatre.messages.find(m=>m.sourceId==='output')?.content,'OUTPUT_BODY');
  const updated=await parseFruitPreset(new TextEncoder().encode(JSON.stringify(doc)),'next.json');
  const plan=planPresetUpdate({preset,profiles:{meeting,theatre:profiles.theatre},enabled:true},updated);
  assert.equal(plan.next.profiles.meeting.overrides.master,false);
  assert.equal(plan.next.profiles.meeting.edits?.output.content,'CONFIRMED_EDIT');
  assert.deepEqual(preset.raw,raw);assert.deepEqual(profiles.meeting.overrides,{});
});

test('unlocked text remains inert HTML and unsupported macros remain explicit diagnostics',async()=>{
  const preset=await parseFruitPreset(new TextEncoder().encode(JSON.stringify({
    prompts:[{identifier:'text',name:'NSFW jailbreak',content:'<img onerror="globalThis.__presetTextRan=true">TEXT'},
      {identifier:'macro',name:'🔞 选项',content:'{{setglobalvar::x::UNCOMMITTED}}{{futureMacro}}'}],
    prompt_order:[{order:[{identifier:'text',enabled:true},{identifier:'macro',enabled:true}]}],
    extensions:{tavern_helper:{script:'globalThis.__presetTextRan=true'},regex_scripts:[{scriptName:'原始规则',findRegex:'.*',replaceString:'<script>globalThis.__presetTextRan=true</script>'}]},
  })),'local.json');
  const profile=createFruitState().profiles.meeting,result=compileFruitPrompt(preset,profile,makeFruitFixtureContext('meeting'));
  assert.equal(result.valid,false);assert.equal(result.variables.global.x,undefined);
  assert.ok(result.diagnostics.some(d=>d.sourceId==='macro'&&d.code==='macro-unsupported'));
  assert.ok(!result.excluded.some(e=>e.reason.includes('成人')||e.reason.includes('规避安全')));
  assert.equal(preset.regex[0].status,'disabled-safety');
  const html=renderFruitPreview(result,fruitPromptRows(preset,profile));
  assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));
  assert.equal(Object.hasOwn(globalThis,'__presetTextRan'),false);
});
