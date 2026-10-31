import test from 'node:test';
import cases,{legacyPreset} from './fixtures/legacyPrompts';
import assert from 'node:assert/strict';
import {createRole,defaults} from './defaults';
import {compileNativeConversation,compileOpeningPrompt} from './prompt';
import {buildPhoneRegeneration} from './chatBatchPrompt';
import {compileConversationPrompt,requestMessages,promptStructure} from './conversationPrompt';
import {makeNativePreset} from './fruit/nativePreset';
import {createFruitState,parseFruitPreset} from './fruit/preset';
import {makeFruitFixtureContext} from './fruit/fixture';
import {compileFruitPrompt} from './fruit/compiler';
import {decodePresetLibrary} from './fruit/library';

const now=Date.parse('2026-10-30T14:00:00Z');
function fixture(){const data=defaults(),r=createRole('合成甲','','职业','轻快、有主见','场景');data.roles=[r];data.preset=null;r.chats=[];r.events=[];r.diaries=[];r.profile='PRIVATE_ACTOR_CANON';r.canonNotes='CANON_BOUNDARY';r.scene={id:'scene',where:'见面地点',startedAt:now-1000,messages:[]};r.play={id:'play',title:'合成剧',world:'THEATRE_WORLD',user:'戏内访客',char:'戏内守灯人',startedAt:now-1000,messages:[]};return {data,r};}
test('all native conversation modes compile through the shared engine and preserve mode boundaries',()=>{
 for(const mode of ['chat','scene','play','intermission']as const){
  const {data,r}=fixture(),result=compileNativeConversation(data,r,mode,'测试',{nowTs:now});
  assert.equal(result.engine,'conversation-v1');assert.equal(result.status,'request-ready');
  const text=JSON.stringify(requestMessages(result));assert.equal(text.includes('PRIVATE_ACTOR_CANON'),mode!=='play');
  assert.ok(!text.includes('林澈（测试角色）'));assert.ok(!text.includes('<content>'));
 }
});
test('opening and opening regeneration retain the configured world in protected context',()=>{
 const {data,r}=fixture();r.place='OPENING_WORLD_SENTINEL';r.scene=null;r.play=null;
 const opening=compileOpeningPrompt(data,r,now);
 assert.ok(JSON.stringify(requestMessages(opening)).includes('OPENING_WORLD_SENTINEL'));
 assert.ok(requestMessages(opening).every(m=>m.role==='system'));
 r.chats=[{id:'opening',speaker:'char',text:'原开场',at:now-1000}];
 const regenerated=buildPhoneRegeneration(data,r,'opening',now)!;
 assert.ok(JSON.stringify(regenerated.messages).includes('OPENING_WORLD_SENTINEL'));
});
test('saved native entry edits change messages; switching off style never removes protected Canon',()=>{
 const {data,r}=fixture(),profile=createFruitState().profiles.meeting;
 profile.edits={'native.chat.voice':{content:'EDITED_NATIVE_VOICE'}};
 const first=compileNativeConversation(data,r,'chat','测试',{profile,nowTs:now});
 assert.ok(JSON.stringify(requestMessages(first)).includes('EDITED_NATIVE_VOICE'));
 profile.overrides['native.chat.voice']=false;
 const next=JSON.stringify(requestMessages(compileNativeConversation(data,r,'chat','测试',{profile,nowTs:now})));
 assert.ok(!next.includes('EDITED_NATIVE_VOICE'));assert.ok(next.includes('PRIVATE_ACTOR_CANON'));assert.ok(next.includes('CANON_BOUNDARY'));
});
test('language belongs to editable expression rules rather than protected facts',()=>{
 for(const mode of ['chat','scene','play']as const){
  const {data,r}=fixture(),profile=createFruitState().profiles[mode==='play'?'theatre':'meeting'];
  profile.edits={[mode==='chat'?'native.chat.voice':'native-base']:{content:'OUTPUT_IN_ENGLISH_FOR_TEST'}};
  const text=JSON.stringify(requestMessages(compileNativeConversation(data,r,mode,'测试',{nowTs:now,profile})));
  assert.ok(text.includes('OUTPUT_IN_ENGLISH_FOR_TEST'));assert.ok(!text.includes('回复使用自然中文'));assert.ok(!text.includes('使用中文进行自然的沉浸式叙事'));
 }
});
test('Fruit preview is the same compiler output and cannot be promoted to a real request',async()=>{
 const preset=await parseFruitPreset(new TextEncoder().encode(JSON.stringify({prompts:[{identifier:'a',name:'A',role:'system',content:'{{setvar::x::VALUE}}{{getvar::x}}'},{identifier:'chatHistory',marker:true}],prompt_order:[{order:[{identifier:'a',enabled:true},{identifier:'chatHistory',enabled:true}]}]})),'synthetic.json');
 const profile=createFruitState().profiles.meeting,ctx=makeFruitFixtureContext('meeting');
 const preview=compileFruitPrompt(preset,profile,ctx),shared=compileConversationPrompt(preset,profile,ctx);
 assert.deepEqual(preview.messages,shared.messages);assert.equal(preview.sendAllowed,false);assert.equal(shared.status,'preview-only');
 assert.throws(()=>requestMessages(shared));
 Object.assign(shared,{status:'request-ready',origin:'native',valid:true});assert.throws(()=>requestMessages(shared),'changing result flags must not authorize a third-party request');
 const blocked=compileConversationPrompt(preset,profile,ctx,{purpose:'request'});assert.equal(blocked.status,'blocked');assert.throws(()=>requestMessages(blocked));
});
test('legacy role-over-global priority, empty override and tail injection remain intact',()=>{
 const {data,r}=fixture();data.preset={name:'global',prompts:[{content:'GLOBAL',enabled:true}]};
 r.preset={name:'role',prompts:[{content:'ROLE {{char}}',role:'user',enabled:true},{identifier:'chatHistory',marker:true,enabled:true},{content:'TAIL',role:'system',enabled:true,injection_position:1,injection_depth:0}]};
 r.chats=[{id:'u',speaker:'me',text:'REAL_INPUT',at:now-1}];const raw=structuredClone(r.preset);
 const result=requestMessages(compileNativeConversation(data,r,'chat','测试',{nowTs:now}));
 assert.deepEqual(result.slice(1),[{role:'user',content:'ROLE 合成甲'},{role:'user',content:'REAL_INPUT'},{role:'system',content:'TAIL'}]);
 assert.deepEqual(r.preset,raw);r.preset={name:'empty',prompts:[]};assert.ok(!JSON.stringify(requestMessages(compileNativeConversation(data,r,'chat','测试',{nowTs:now}))).includes('GLOBAL'));
});
test('unknown legacy macros block explicitly and a one-request native fallback preserves the configuration',()=>{
 const {data,r}=fixture();r.preset={name:'legacy',prompts:[{enabled:true,content:'{{UNSUPPORTED_REQUIRED_MACRO}}'}]};const before=structuredClone(r);
 const blocked=compileNativeConversation(data,r,'chat','测试',{nowTs:now});assert.equal(blocked.status,'blocked');assert.throws(()=>requestMessages(blocked));
 const retry=compileNativeConversation(data,r,'chat','测试',{nowTs:now,skipLegacyOnce:true});assert.equal(retry.status,'request-ready');assert.deepEqual(r,before);
});
test('native catalog contains editable rules and context slots without fixture Canon',async()=>{
 for(const mode of ['meeting','theatre']as const){const preset=await makeNativePreset(mode);assert.ok(preset.prompts.some(p=>p.identifier==='nativeContext'&&p.marker));assert.ok(preset.prompts.some(p=>p.identifier==='native-base'));assert.ok(!new TextDecoder().decode(preset.raw).includes('旧书店'));}
});
test('request diagnostics expose structure only, never private body, entry names or user text',()=>{
 const {data,r}=fixture();r.preset={name:'PRIVATE_PRESET',prompts:[{name:'PRIVATE_ENTRY',enabled:true,content:'PRIVATE_RULE'}]};r.chats=[{id:'private-id',speaker:'me',text:'PRIVATE_CHAT',at:now}];
 const trace=JSON.stringify(promptStructure(compileNativeConversation(data,r,'chat','测试',{nowTs:now})));
 for(const secret of ['PRIVATE_PRESET','PRIVATE_ENTRY','PRIVATE_RULE','PRIVATE_CHAT','PRIVATE_ACTOR_CANON','private-id'])assert.ok(!trace.includes(secret));
 assert.ok(trace.includes('旧附加预设'));assert.ok(trace.includes('Puppy'));
});
test('legacy compatibility matches the pre-change golden requests in all four native modes',()=>{

 for(const item of cases){const {data,r}=fixture();r.traits='自然';r.profile='SYNTHETIC_CANON';data.user.name='测试用户';r.preset=structuredClone(legacyPreset);
  r.chats=[{id:'h1',speaker:'me',text:'历史输入',at:item.at-2000},{id:'h2',speaker:'char',text:'历史回答',at:item.at-1000}];
  r.scene!.messages=structuredClone(r.chats);Object.assign(r.play!,{world:'STAGE_WORLD',user:'戏内访客',char:'戏内人物',messages:structuredClone(r.chats),intermissionMessages:structuredClone(r.chats)});
  const before=structuredClone(data),messages=requestMessages(compileNativeConversation(data,r,item.mode,'测试',{nowTs:item.at}));messages[0].content='<NATIVE_CONTEXT>';
  assert.deepEqual(messages,item.expected,item.mode);assert.deepEqual(data,before);
 }
});
test('native context excludes future, private, invalid-source and theatre-only facts without changing records',()=>{
 const {data,r}=fixture();r.chats=[{id:'gone',speaker:'char',text:'INVALID_SOURCE',at:now-2000,status:'retracted'}];
 r.events=[{id:'future',kind:'chat',title:'事件',detail:'FUTURE_FACT',at:now+1000},{id:'private',kind:'chat',title:'事件',detail:'PRIVATE_FACT',at:now-1000,knownBy:['someone-else']},{id:'invalid',kind:'chat',title:'事件',detail:'INVALID_SOURCE',at:now-1000,messageId:'gone'},{id:'drama',kind:'drama',title:'事件',detail:'FICTION_NOT_CANON',at:now-1000},{id:'ok',kind:'chat',title:'事件',detail:'PERMITTED_FACT',at:now-1000,knownBy:[r.id]}];
 const before=structuredClone(r),text=JSON.stringify(requestMessages(compileNativeConversation(data,r,'chat','事件',{nowTs:now})));
 for(const value of ['FUTURE_FACT','PRIVATE_FACT','INVALID_SOURCE','FICTION_NOT_CANON'])assert.ok(!text.includes(value));
 assert.ok(text.includes('PERMITTED_FACT'));assert.deepEqual(r,before);
});
test('schema 2 Profiles, native old-order overrides and private raw bytes survive decoding without migration',async()=>{
 const native=await makeNativePreset('meeting'),state=createFruitState(),raw=new TextEncoder().encode('\ufeff '+JSON.stringify({prompts:[{identifier:'a',name:'合成私有条目',content:'SYNTHETIC_PRIVATE_BODY'}],prompt_order:[{order:[{identifier:'a',enabled:true}]}]},null,2)+'\n');
 const profile={...state.profiles.meeting,order:['native-base','chatHistory','native-format'],edits:{'native-base':{content:'SAVED_NATIVE_TEXT'}},overrides:{'native-base':true},style:'SAVED_STYLE'};
 const record={schema:2,revision:8,selectedId:'private-synthetic',defaults:{meeting:'private-synthetic',theatre:'native'},entries:[{id:'native',kind:'native',raw:native.raw,fileName:native.fileName,importedAt:0,enabled:true,profiles:{meeting:profile,theatre:state.profiles.theatre}},{id:'private-synthetic',kind:'st',raw,fileName:'synthetic-private.json',importedAt:now,enabled:false,profiles:state.profiles}]};
 const before=structuredClone(record),decoded=await decodePresetLibrary(record,native);
 assert.equal(decoded.schema,2);assert.equal(decoded.revision,8);assert.equal(decoded.selectedId,record.selectedId);assert.deepEqual(decoded.defaults,record.defaults);
 assert.deepEqual(decoded.entries[1].preset.raw,raw);assert.deepEqual(decoded.entries[1].profiles,state.profiles);assert.deepEqual(decoded.entries[0].profiles.meeting,profile);assert.deepEqual(record,before);
 const {data,r}=fixture();const result=compileNativeConversation(data,r,'scene','测试',{nowTs:now,profile});
 assert.ok(JSON.stringify(requestMessages(result)).includes('SAVED_NATIVE_TEXT'));assert.deepEqual(profile.order,['native-base','chatHistory','native-format']);
});
