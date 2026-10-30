import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseFruitPreset, createFruitState, replaceFruitPreset, validateProfile } from './fruit/preset';
import { FruitMacroResolver } from './fruit/macros';
import { compileFruitPrompt } from './fruit/compiler';
import { makeFruitFixtureContext } from './fruit/fixture';
import { parseFruitOutput } from './fruit/output';

function bytes(prompts: object[], order: object[], extensions: object = {}) {
  return new TextEncoder().encode(JSON.stringify({prompts, prompt_order:[{character_id:100001,order}],extensions,temperature:0.8}));
}
const p=(identifier:string,content:string,extra:object={})=>({identifier,name:identifier,role:'system',content,enabled:true,marker:false,injection_position:0,injection_depth:4,injection_order:100,...extra});
const o=(identifier:string,enabled=true)=>({identifier,enabled});

test('Fruit importer validates structure and preserves exact original bytes including BOM/spacing',async()=>{
  const raw=new TextEncoder().encode('\ufeff  '+new TextDecoder().decode(bytes([p('a','hello')],[o('a')]))+'\n');
  const preset=await parseFruitPreset(raw,'本地 V6.4X.json');
  assert.deepEqual(preset.raw,raw);assert.equal(preset.prompts.length,1);assert.equal(preset.order.length,1);assert.equal(preset.version,'V6.4X');
  await assert.rejects(()=>parseFruitPreset(new TextEncoder().encode('{ broken'),'坏.json'),/JSON/);
  await assert.rejects(()=>parseFruitPreset(bytes([p('a','x'),p('a','y')],[o('a')]),'重复.json'),/重复/);
  await assert.rejects(()=>parseFruitPreset(bytes([p('a','x')],[o('missing')]),'缺失.json'),/不存在/);
});

test('Fruit profiles inherit original order flags, isolate overrides, and reject invalid replacement/profile',async()=>{
  const preset=await parseFruitPreset(bytes([p('a','a'),p('b','b')],[o('b'),o('a',false)]),'test.json');
  const initial=replaceFruitPreset(createFruitState(),preset);
  const changed=validateProfile({...initial.profiles.meeting,overrides:{a:true},style:'清淡',length:{min:200,max:400}});
  const next={...initial,profiles:{...initial.profiles,meeting:changed}};
  assert.deepEqual(initial.profiles.meeting.overrides,{});assert.deepEqual(next.profiles.theatre.overrides,{});
  assert.equal(next.profiles.theatre.style,'');assert.throws(()=>validateProfile({...changed,length:{min:500,max:100}}),/字数/);
  assert.equal(initial.preset,preset);
});

test('Fruit macro resolver nests safely, respects lexical order, trims comments, and isolates request globals',()=>{
  const one=new FruitMacroResolver({user:'用户',char:'角色',date:'2026-10-29',time:'10:00',lastUserMessage:'你好'},()=>0.9);
  assert.equal(one.resolve('{{setvar::greet::Hello {{user}}}}{{getvar::greet}} {{random::甲::乙}}'),'Hello 用户 乙');
  assert.equal(one.resolve('{{setglobalvar::g::X}}{{getglobalvar::g}}'),'X');
  assert.equal(one.resolve('a\n{{trim}}\n\nb'),'ab');
  assert.equal(one.resolve('{{// {{setvar::bad::evil}} }}ok'),'ok');
  assert.throws(()=>one.resolve('{{getvar::bad}}'),/变量/);
  const two=new FruitMacroResolver({user:'B',char:'C'});assert.throws(()=>two.resolve('{{getglobalvar::g}}'),/变量/);
  assert.throws(()=>one.resolve('{{unknown::x}}'),/不支持/);
  assert.equal(one.resolve('{{日期}}'),'[由场景填写：日期]');
});

test('Fruit compiler follows order, preserves roles/markers, uses bounded authorised context and depth/order',async()=>{
  const preset=await parseFruitPreset(bytes([
    p('late','L'),p('init','{{setvar::v::VALUE}}I'),p('disabled','MUST_NOT_APPEAR'),
    p('charDescription','',{marker:true}),p('chatHistory','',{marker:true}),
    p('d2','D2',{role:'assistant',injection_position:1,injection_depth:0,injection_order:2}),
    p('d1','{{getvar::v}}',{role:'assistant',injection_position:1,injection_depth:0,injection_order:1}),
  ],[o('init'),o('charDescription'),o('chatHistory'),o('late'),o('disabled',false),o('d2'),o('d1')]),'test.json');
  const context=makeFruitFixtureContext('meeting');
  const result=compileFruitPrompt(preset,createFruitState().profiles.meeting,context);
  assert.equal(result.sendAllowed,false);assert.equal(result.valid,true);
  assert.ok(result.messages.find(m=>m.sourceId==='charDescription')?.content.includes(context.char));
  const sources=result.messages.map(m=>m.sourceId);assert.ok(sources.indexOf('init')<sources.indexOf('late'));assert.ok(sources.indexOf('d1')<sources.indexOf('d2'));
  assert.ok(!JSON.stringify(result.messages).includes('MUST_NOT_APPEAR'));
  assert.ok(result.messages.filter(m=>m.sourceId==='chatHistory').length<=12);
});

test('Fruit compiler replaces original length, retains snow closure, allows content options and diagnoses unknown macros',async()=>{
  const preset=await parseFruitPreset(bytes([
    p('body','正文需求：字数2200-2500字。<content>正文</content>'),
    p('snow','<snow>BAD_SNOW</snow>',{name:'小剧场'}),
    p('unsafe','BAD_ADULT',{name:'🔞 NSFW'}),p('unknown','{{futureMacro}}')
  ],[o('body'),o('snow'),o('unsafe'),o('unknown')]),'test.json');
  const profile=validateProfile({...createFruitState().profiles.meeting,length:{min:300,max:500}});
  const r=compileFruitPrompt(preset,profile,makeFruitFixtureContext('meeting'));
  const text=JSON.stringify(r.messages);assert.ok(text.includes('300–500'));assert.ok(!text.includes('2200'));assert.ok(!text.includes('BAD_SNOW'));assert.ok(text.includes('BAD_ADULT'));
  assert.equal(r.valid,false);assert.ok(r.diagnostics.some(d=>d.code==='macro-unsupported'));
  assert.ok(!r.messages.some(m=>m.sourceId==='unknown'));
});

test('Fruit output parser returns inert text, drops snow, and never treats generated ECoT as memory',()=>{
  const r=parseFruitOutput('<ECoT>辅助文字</ECoT><content><img onerror="evil()">正文</content><meow_FM>摘要</meow_FM><snow>DROP_ME</snow>');
  assert.ok(r.content.includes('正文'));assert.equal(r.summary,'摘要');assert.equal(r.generatedAuxiliary,'辅助文字');assert.equal(r.snowDiscarded,true);assert.equal(r.memoryEligible,false);
  assert.ok(!JSON.stringify(r).includes('DROP_ME'));
});

test('Fruit actual private V6.4X fixture (opt in; never bundled)',{skip:!process.env.ELSEWHERE_FRUIT_FIXTURE},async()=>{
  const path=process.env.ELSEWHERE_FRUIT_FIXTURE;assert.ok(path);
  const raw=new Uint8Array(await readFile(path));
  const preset=await parseFruitPreset(raw,'【MoM】果实V6.4X丨@KKM丨20261009 (1).json');
  assert.equal(preset.prompts.length,316);assert.equal(preset.order.length,277);assert.equal(preset.order.filter(x=>x.enabled).length,101);assert.equal(preset.prompts.filter(x=>x.marker).length,8);
  assert.equal(preset.regex.length,21);assert.equal(preset.regex.filter(x=>x.enabled).length,18);assert.deepEqual(preset.raw,raw);
  for(const mode of ['meeting','theatre']as const)for(const auxiliary of [false,true])for(const style of ['', '测试自定义文风']){
    const base=createFruitState().profiles[mode];const r=compileFruitPrompt(preset,{...base,style,output:{...base.output,auxiliary,characters:true}},makeFruitFixtureContext(mode));
    assert.ok(r.messages.length>15);assert.equal(r.valid,false);assert.equal(r.sendAllowed,false);assert.ok(!r.messages.some(m=>/<snow>|2200\s*[-–]\s*2500/.test(m.content)));
    const errors=r.diagnostics.filter(d=>d.severity==='error');
    assert.deepEqual(errors.map(d=>d.code).sort(),auxiliary?['macro-unsupported','macro-unsupported']:['auxiliary-unsupported','auxiliary-unsupported','macro-unsupported']);
    assert.ok(errors.some(d=>d.code==='macro-unsupported'&&d.message.includes('roll:1d10')));
    if(auxiliary)assert.ok(errors.some(d=>d.code==='macro-unsupported'&&d.message.includes('roll:1d9999')));
  }
});

test('Fruit compiler excludes future, private, invalid revision and actor-world leaks from every marker/history',async()=>{
  const preset=await parseFruitPreset(bytes(['charDescription','worldInfoBefore','worldInfoAfter','scenario','chatHistory'].map(id=>p(id,'',{marker:true})),['charDescription','worldInfoBefore','worldInfoAfter','scenario','chatHistory'].map(id=>o(id))),'test.json');
  const ctx=makeFruitFixtureContext('theatre');
  for(const patch of [{knownBy:['other']},{at:ctx.now+1},{revisionValid:false},{scope:'real:actor-private'}])ctx.facts.push({...ctx.facts[0],id:'blocked',text:'PRIVATE_CANON_MUST_NOT_LEAK',...patch});
  ctx.history.push({...ctx.history[0],text:'RETRACTED_HISTORY',active:false});
  const result=compileFruitPrompt(preset,createFruitState().profiles.theatre,ctx);
  assert.ok(!JSON.stringify(result.messages).includes('PRIVATE_CANON_MUST_NOT_LEAK'));assert.ok(!JSON.stringify(result.messages).includes('RETRACTED_HISTORY'));
  assert.ok(result.messages.some(m=>m.content.includes('当前剧本')));
});

test('Fruit unknown macros roll back side effects and global variables never leak to a later compile',async()=>{
  const preset=await parseFruitPreset(bytes([p('bad','{{setglobalvar::x::LEAK}}{{unsupported}}'),p('read','{{getglobalvar::x}}')],[o('bad'),o('read')]),'test.json');
  const profile=createFruitState().profiles.meeting;
  const first=compileFruitPrompt(preset,profile,makeFruitFixtureContext('meeting'));
  assert.equal(first.valid,false);assert.equal(first.variables.global.x,undefined);assert.ok(!JSON.stringify(first.messages).includes('LEAK'));
  const second=compileFruitPrompt(preset,{...profile,overrides:{bad:false}},makeFruitFixtureContext('theatre'));assert.equal(second.variables.global.x,undefined);
});

test('Fruit style and one-shot length overrides do not mutate either saved profile or raw preset',async()=>{
  const preset=await parseFruitPreset(bytes([p('style','OLD_STYLE {{setvar::当前文风::旧风格}}'),p('body','字数2200-2500字。{{getvar::当前文风}}')],[o('style'),o('body')]),'test.json');
  const state=createFruitState(),raw=Uint8Array.from(preset.raw);const profile={...state.profiles.meeting,style:'清淡风格'};
  const result=compileFruitPrompt(preset,profile,makeFruitFixtureContext('meeting'),{lengthOverride:{min:100,max:200}});
  assert.equal(result.valid,true);assert.ok(JSON.stringify(result.messages).includes('清淡风格'));assert.ok(!JSON.stringify(result.messages).includes('OLD_STYLE'));assert.deepEqual(profile.length,{min:600,max:1200});assert.deepEqual(preset.raw,raw);
});

test('Fruit unsupported injection and disabled history marker block compilation rather than relocate silently',async()=>{
  const preset=await parseFruitPreset(bytes([p('h','',{identifier:'chatHistory',marker:true}),p('deep','D',{injection_position:1}),p('future','X',{injection_position:99})],[o('chatHistory',false),o('deep'),o('future')]),'test.json');
  const r=compileFruitPrompt(preset,createFruitState().profiles.meeting,makeFruitFixtureContext('meeting'));
  assert.equal(r.valid,false);assert.ok(r.diagnostics.some(x=>x.code==='history-marker-required'));assert.ok(!r.messages.some(x=>x.content==='D'||x.content==='X'));
});

test('Fruit regex and extension metadata are inert and distinguish prompt/display safety restrictions',async()=>{
  const preset=await parseFruitPreset(bytes([p('body','正文')],[o('body')],{regex_scripts:[{id:'p',scriptName:'prompt',promptOnly:true,disabled:false,findRegex:'(a+)+$',replaceString:''},{id:'d',scriptName:'display',markdownOnly:true,disabled:true,findRegex:'x',replaceString:'<script>throw new Error("NOT_EXECUTED")</script>'}],tavern_helper:{scripts:[{content:'throw new Error("NEVER_EXECUTE")'}]}}),'test.json');
  assert.equal(preset.regex[0].side,'prompt');assert.equal(preset.regex[0].status,'unsupported');assert.equal(preset.regex[1].side,'display');assert.equal(preset.regex[1].hasExecutableMarkup,true);assert.equal(preset.regex[1].status,'disabled-safety');
  assert.ok(preset.diagnostics.some(x=>x.code==='extension-inert'));
});

test('Fruit output parser handles incomplete blocks without echoing dropped snow or treating HTML as markup',()=>{
  const r=parseFruitOutput('<content>正文</content><snow>unclosed secret');assert.equal(r.content,'正文');assert.equal(r.snowDiscarded,true);assert.ok(!JSON.stringify(r).includes('secret'));
  assert.equal(parseFruitOutput('<content>'.repeat(20000)).content,'');
});

test('Fruit disabled entries cannot inherit prototype properties as enabled overrides',async()=>{
  const preset=await parseFruitPreset(bytes([p('toString','PROTOTYPE_LEAK')],[o('toString',false)]),'test.json');
  const r=compileFruitPrompt(preset,createFruitState().profiles.meeting,makeFruitFixtureContext('meeting'));
  assert.ok(!r.messages.some(m=>m.content.includes('PROTOTYPE_LEAK')));
});

test('Fruit review: nested snow never leaks content from inside the outer block',()=>{
  const r=parseFruitOutput('<snow><snow>inner</snow><content>SNOW_LEAK</content></snow><content>正文</content>');
  assert.equal(r.content,'正文');assert.ok(!JSON.stringify(r).includes('SNOW_LEAK'));
});
test('Fruit review: Unicode text does not shift ASCII tag offsets',()=>{
  assert.equal(parseFruitOutput('<content>İ正文</content>').content,'İ正文');
});
test('Fruit review: disabling auxiliary output preserves body language in a mixed language item',async()=>{
  const preset=await parseFruitPreset(bytes([p('language','- ECoT: "zh-CN"\n- 正文: "zh-CN"\n双语要求保留')],[o('language')]),'test.json');
  const r=compileFruitPrompt(preset,createFruitState().profiles.meeting,makeFruitFixtureContext('meeting'));
  assert.ok(r.messages.some(m=>m.sourceId==='language'&&m.content.includes('正文: "zh-CN"')&&m.content.includes('双语要求保留')));
  assert.ok(!r.messages.find(m=>m.sourceId==='language')?.content.includes('ECoT'));
});
test('Fruit review: alternate body length ranges are replaced rather than contradicted',async()=>{
  const preset=await parseFruitPreset(bytes([p('body','正文需求：字数1800-2500字。完整场面可写1800-2500字。')],[o('body')]),'test.json');
  const r=compileFruitPrompt(preset,{...createFruitState().profiles.meeting,length:{min:150,max:400}},makeFruitFixtureContext('meeting'));
  assert.equal(r.valid,true);assert.ok(!JSON.stringify(r.messages).includes('1800-2500'));assert.ok(r.messages[0].content.includes('150–400'));
});
test('Fruit review: disabled markers do not claim their candidate memories were injected',async()=>{
  const preset=await parseFruitPreset(bytes([p('charDescription','',{marker:true})],[o('charDescription',false)]),'test.json');
  const r=compileFruitPrompt(preset,createFruitState().profiles.meeting,makeFruitFixtureContext('meeting'));assert.deepEqual(r.memorySources,[]);
});
test('Fruit provenance follows context data through variables to the message that emits it',async()=>{
  const preset=await parseFruitPreset(bytes([p('store','{{setvar::saved::{{description}}}}'),p('emit','{{getvar::saved}}')],[o('store'),o('emit')]),'test.json');
  const r=compileFruitPrompt(preset,createFruitState().profiles.meeting,makeFruitFixtureContext('meeting'));
  assert.deepEqual(r.messages.find(m=>m.sourceId==='emit')?.sourceIds,['fixture-canon']);assert.deepEqual(r.memorySources.map(x=>x.id),['fixture-canon']);
});

test('Fruit user-disabled entries do not evaluate macros regardless of content category',async()=>{
  const preset=await parseFruitPreset(bytes([p('bad','ECoT {{setglobalvar::leak::BAD}}{{futureMacro}}',{name:'jailbreak'}),p('good','正文')],[o('bad'),o('good')]),'test.json');
  const r=compileFruitPrompt(preset,{...createFruitState().profiles.meeting,overrides:{bad:false}},makeFruitFixtureContext('meeting'));
  assert.equal(r.valid,true);assert.equal(r.variables.global.leak,undefined);assert.ok(!r.messages.some(m=>m.sourceId==='bad'));
});

test('Fruit all eight markers use context values and preserve example/history roles',async()=>{
  const ids=['personaDescription','worldInfoBefore','charDescription','charPersonality','scenario','worldInfoAfter','dialogueExamples','chatHistory'];
  const preset=await parseFruitPreset(bytes(ids.map(id=>p(id,'IGNORE_MARKER_BODY',{marker:true})),ids.map(id=>o(id))),'test.json');
  const r=compileFruitPrompt(preset,createFruitState().profiles.theatre,makeFruitFixtureContext('theatre'));
  assert.equal(r.valid,true);assert.deepEqual([...new Set(r.messages.map(m=>m.marker).filter(Boolean))],ids);
  assert.deepEqual(r.messages.filter(m=>m.marker==='dialogueExamples').map(m=>m.role),['user','assistant']);
  assert.deepEqual(r.messages.filter(m=>m.marker==='chatHistory').map(m=>m.role),['assistant','user']);
  assert.ok(!JSON.stringify(r.messages).includes('IGNORE_MARKER_BODY'));assert.ok(r.messages.some(m=>m.marker==='charDescription'&&m.content.includes('守灯人')));
});

test('Fruit depth injection uses the bounded history block with explicit role ordering',async()=>{
  const preset=await parseFruitPreset(bytes([p('chatHistory','',{marker:true}),p('after','AFTER'),p('s','S',{injection_position:1,injection_depth:0,role:'system',injection_order:1}),p('a','A',{injection_position:1,injection_depth:0,role:'assistant',injection_order:10}),p('u','U',{injection_position:1,injection_depth:0,role:'user',injection_order:999}),p('beforeLast','BEFORE_LAST',{injection_position:1,injection_depth:1})],[o('chatHistory'),o('after'),o('s'),o('a'),o('u'),o('beforeLast')]),'test.json');
  const r=compileFruitPrompt(preset,createFruitState().profiles.meeting,makeFruitFixtureContext('meeting'));
  assert.deepEqual(r.messages.filter(m=>m.depth===0).map(m=>m.sourceId),['u','a','s']);
  const i=r.messages.findIndex(m=>m.sourceId==='beforeLast'),last=r.messages.findIndex(m=>m.sourceIds?.includes('fixture-h2'));
  assert.ok(i<last);assert.ok(r.messages.findIndex(m=>m.sourceId==='s')<r.messages.findIndex(m=>m.sourceId==='after'));
});
