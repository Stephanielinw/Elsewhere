import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,createRole} from './defaults';
import {compileNovelConversation,compileNativeConversation} from './prompt';
import {requestMessages,compileConversationPrompt} from './conversationPrompt';
import {parseFruitPreset,createFruitState} from './fruit/preset';
import {selectRequestPreset} from './fruit/library';
import {makeNativePreset} from './fruit/nativePreset';
import {compileFruitPrompt} from './fruit/compiler';
import {FruitMacroResolver} from './fruit/macros';
import {makeFruitFixtureContext} from './fruit/fixture';
import {createNovelTasks,commitNovelReply,prepareNovelRegeneration,readNovelResponse,novelSamplingParameters} from './novelGeneration';
import {novelAuxiliaryHtml} from '../novelOutputView';
import {retractMessage} from './revisions';
const now=Date.parse('2026-10-31T16:00:00Z');
function fixture(){const data=defaults(),r=createRole('合成演员','','合成职业','克制','合成地点');data.roles=[r];data.selected=r.id;data.user.name='合成旅伴';data.preset=null;r.events=[];r.chats=[];r.diaries=[];r.profile='ACTOR_CANON';r.canonNotes='CANON_LIMIT';r.scene={id:'scene-a',where:'SCENE_PLACE',startedAt:now-5000,messages:[{id:'u',speaker:'me',text:'REAL_INPUT',at:now-1000}]};r.play={id:'play-a',title:'合成剧',world:'STAGE_WORLD',user:'STAGE_USER',char:'STAGE_ACTOR',startedAt:now-5000,messages:[{id:'p-u',speaker:'me',text:'STAGE_INPUT',at:now-1000}]};return {data,r};}
async function preset(content='RULE_A {{char}} {{user}}'){
 return parseFruitPreset(new TextEncoder().encode(JSON.stringify({name:'合成小说预设',temperature:0.7,top_p:0.9,extensions:{regex_scripts:[{id:'r',scriptName:'不执行',findRegex:'/x/g',replaceString:'<script>BAD()</script>'}]},prompts:[{identifier:'a',name:'规则 A',role:'system',content},{identifier:'b',name:'规则 B',role:'assistant',content:'RULE_B'},{identifier:'charDescription',marker:true},{identifier:'worldInfoAfter',marker:true},{identifier:'chatHistory',marker:true}],prompt_order:[{order:['a','b','charDescription','worldInfoAfter','chatHistory'].map(identifier=>({identifier,enabled:true}))}]})),'synthetic-novel.json',now);
}
const response=(content:string,extra:Record<string,unknown>={})=>new Response(JSON.stringify({choices:[{message:{role:'assistant',content},finish_reason:'stop'}],...extra}));
test('live third-party compilation uses saved ordering, switches, macros, source IDs and true scene history',async()=>{
 const {data,r}=fixture(),p=await preset(),profile=createFruitState().profiles.meeting,before=p.raw.slice();
 const result=compileNovelConversation(data,r,'scene','REAL_INPUT',{preset:p,profile,nowTs:now});
 const messages=requestMessages(result);assert.equal(result.status,'request-ready');assert.equal(result.origin,'third-party');
 assert.ok(messages.some(m=>m.content==='RULE_A 合成演员 合成旅伴'));assert.ok(messages.some(m=>m.content==='RULE_B'));
 assert.ok(JSON.stringify(messages).includes('CANON_LIMIT'));assert.ok(JSON.stringify(messages).includes('SCENE_PLACE'));
 assert.equal(messages.filter(m=>m.role==='user'&&m.content.includes('REAL_INPUT')).length,1);
 assert.ok(result.messages.some(m=>m.sourceIds?.includes('u')));assert.deepEqual(p.raw,before);
 profile.overrides.a=false;assert.ok(!JSON.stringify(requestMessages(compileNovelConversation(data,r,'scene','REAL_INPUT',{preset:p,profile,nowTs:now}))).includes('RULE_A'));
 profile.overrides.a=true;profile.order=['b','a','charDescription','worldInfoAfter','chatHistory'];
 const reordered=requestMessages(compileNovelConversation(data,r,'scene','REAL_INPUT',{preset:p,profile,nowTs:now}));assert.ok(reordered.findIndex(m=>m.content==='RULE_B')<reordered.findIndex(m=>m.content.startsWith('RULE_A')));
});
test('saved defaults choose exact preset and mode; disabled selections fail without native fallback',async()=>{
 const native=await makeNativePreset('meeting'),p=await preset(),profiles=createFruitState().profiles;
 const lib={schema:2 as const,revision:3,selectedId:'a',defaults:{meeting:'a',theatre:'native'},entries:[{id:'native',kind:'native' as const,preset:native,profiles,enabled:true},{id:'a',kind:'st' as const,preset:p,profiles:structuredClone(profiles),enabled:true}]};
 lib.entries[1].profiles.meeting.overrides.a=false;
 assert.equal(selectRequestPreset(lib,'meeting','legacy-unmigrated').actualPresetId,'a');assert.equal(selectRequestPreset(lib,'theatre','legacy-unmigrated').actualPresetId,'native');
 assert.equal(selectRequestPreset(lib,'chat','legacy-unmigrated').actualPresetId,'native');assert.equal(selectRequestPreset(lib,'intermission','legacy-unmigrated').actualPresetId,'native');
 assert.equal(selectRequestPreset(lib,'meeting','legacy-unmigrated').profile.overrides.a,false);
 lib.entries[1].enabled=false;assert.throws(()=>selectRequestPreset(lib,'meeting','legacy-unmigrated'),/停用/);
});
test('theatre uses only stage identity, while native phone/backstage remain native',async()=>{
 const {data,r}=fixture(),p=await preset(),profile=createFruitState().profiles.theatre;
 r.events=[{id:'secret',kind:'chat',title:'私密',detail:'PRIVATE_REAL_LIFE',at:now-2000,knownBy:[r.id]}];
 const wire=JSON.stringify(requestMessages(compileNovelConversation(data,r,'play','STAGE_INPUT',{preset:p,profile,nowTs:now})));
 for(const text of ['ACTOR_CANON','CANON_LIMIT','PRIVATE_REAL_LIFE','REAL_INPUT','合成旅伴'])assert.ok(!wire.includes(text),text);
 for(const text of ['STAGE_WORLD','STAGE_ACTOR','STAGE_USER','STAGE_INPUT'])assert.ok(wire.includes(text),text);
 for(const kind of ['chat','intermission']as const)assert.equal(compileNativeConversation(data,r,kind,'x',{nowTs:now}).origin,'native');
});
test('Fruit context excludes unknown, invalid, future and foreign facts and quotes',async()=>{
 const {data,r}=fixture(),p=await preset(),profile=createFruitState().profiles.meeting;
 r.chats=[{id:'known',speaker:'me',text:'CONFIRMED_SOURCE',at:now-4000},{id:'gone',speaker:'me',text:'RETRACTED_SECRET',at:now-4000,status:'retracted'}];
 r.events=[{id:'good',kind:'chat',title:'原话',detail:'CONFIRMED_SOURCE',at:now-4000,messageId:'known',knownBy:[r.id]},{id:'stale',kind:'chat',title:'旧话',detail:'STALE_TEXT',at:now-4000,messageId:'known',knownBy:[r.id]},{id:'unknown',kind:'life',title:'猜想',detail:'UNVERIFIED',at:now-4000},{id:'future',kind:'life',title:'未来',detail:'FUTURE',at:now+1,knownBy:[r.id]},{id:'private',kind:'life',title:'私有',detail:'FOREIGN',at:now-4000,knownBy:['other']},{id:'gone',kind:'chat',title:'作废',detail:'RETRACTED_SECRET',at:now-4000,messageId:'gone',knownBy:[r.id]}];
 r.scene!.messages[0].quote={id:'gone',speaker:'me',text:'RETRACTED_SECRET',at:now-4000};
 const wire=JSON.stringify(requestMessages(compileNovelConversation(data,r,'scene','REAL_INPUT',{preset:p,profile,nowTs:now})));
 assert.ok(wire.includes('CONFIRMED_SOURCE'));for(const text of ['STALE_TEXT','UNVERIFIED','FUTURE','FOREIGN','RETRACTED_SECRET'])assert.ok(!wire.includes(text),text);
});
test('preview flags cannot authorize requests and unknown live macros block explicitly',async()=>{
 const {data,r}=fixture(),p=await preset('{{not_supported}}'),profile=createFruitState().profiles.meeting;
 const result=compileNovelConversation(data,r,'scene','x',{preset:p,profile,nowTs:now});assert.equal(result.status,'blocked');assert.throws(()=>requestMessages(result));
 const preview=compileFruitPrompt(await preset(),profile,makeFruitFixtureContext('meeting'));
 const forged={...preview,engine:'conversation-v1' as const,origin:'third-party' as const,mode:'meeting' as const,status:'request-ready' as const};assert.throws(()=>requestMessages(forged));
 const fake=compileConversationPrompt(await preset(),profile,{...makeFruitFixtureContext('meeting'),source:'native-live'},{purpose:'request'});assert.equal(fake.status,'blocked');
});
test('novel output validates API payloads and keeps only selected plain-text auxiliary fields',async()=>{
 const profile=createFruitState().profiles.meeting;profile.output={scene:true,summary:true,characters:false,auxiliary:false};
 const value=await readNovelResponse(response('<content>正文</content><status_bar>场景</status_bar><meow_FM>摘要</meow_FM><profile>人物</profile><ECoT>辅助秘密</ECoT><snow>小剧场</snow>'),profile,true);
 assert.equal(value.text,'正文');assert.equal(value.auxiliary?.scene,'场景');assert.equal(value.auxiliary?.summary,'摘要');assert.ok(!JSON.stringify(value).includes('辅助秘密'));assert.ok(!JSON.stringify(value).includes('人物'));assert.ok(!JSON.stringify(value).includes('小剧场'));
 for(const res of [response(''),response('正文',{error:{message:'technical'}}),response('<content>unclosed'),response('<content><script>BAD()</script></content>'),new Response('bad json'),new Response('error',{status:503})])await assert.rejects(()=>readNovelResponse(res,profile,true));
 assert.equal((await readNovelResponse(response('原生正文'),profile,false)).text,'原生正文');
});
test('novel tasks reject duplicates, edits, retractions, wrong roles, scene closure and late generations',()=>{
 const {r}=fixture();r.play=null;const tasks=createNovelTasks(),a=tasks.begin(r,'scene');assert.throws(()=>tasks.begin(r,'scene'));
 assert.equal(tasks.valid(a,r,r.id),true);assert.equal(tasks.valid(a,r,'other'),false);
 r.scene!.messages[0].text='changed';assert.equal(tasks.valid(a,r,r.id),false);tasks.finish(a);
 const b=tasks.begin(r,'scene');r.scene!.messages[0].status='retracted';assert.equal(tasks.valid(b,r,r.id),false);tasks.cancel(r.id);assert.equal(b.controller.signal.aborted,true);
 r.scene!.messages[0].status='active';const c=tasks.begin(r,'scene');tasks.cancel(r.id);const d=tasks.begin(r,'scene');assert.equal(tasks.valid(c,r,r.id),false);assert.equal(tasks.valid(d,r,r.id),true);r.scene=null;assert.equal(tasks.valid(d,r,r.id),false);
});
test('regeneration uses bounded history, preserves old replies until success, and rolls back on save failure',()=>{
 const {r}=fixture();r.play=null;const p=r.scene!;p.messages.push({id:'old',speaker:'char',text:'OLD_BODY',at:now,replyTo:'u'},{id:'later',speaker:'me',text:'FUTURE_ROUND',at:now+1000});
 const before=structuredClone(r),plan=prepareNovelRegeneration(r,'scene','old');assert.ok(plan);assert.ok(!JSON.stringify(plan.role.scene?.messages).includes('FUTURE_ROUND'));assert.deepEqual(r,before);
 const tasks=createNovelTasks(),task=tasks.begin(r,'scene'),item={id:'new',speaker:'char' as const,text:'NEW_BODY',at:now+2000,replyTo:'u'};
 assert.throws(()=>commitNovelReply(r,task,item,()=>false,plan),/保存/);assert.deepEqual(r,before);
 commitNovelReply(r,task,item,()=>true,plan);assert.equal(r.scene!.messages.find(m=>m.id==='old')!.status,'retracted');assert.equal(r.scene!.messages.findIndex(m=>m.id==='new'),2);assert.equal(r.scene!.messages.at(-1)!.id,'later');assert.ok(r.messageRevisions?.length);assert.ok(r.events.some(e=>e.detail==='NEW_BODY'));assert.ok(!r.events.some(e=>e.detail==='OLD_BODY'));
});
test('preset sampling is allowlisted; connection identity and task budgets cannot be overridden',async()=>{
 const p=await preset();p.modelParameters={temperature:0.3,top_p:0.8,model:'EVIL_MODEL',max_tokens:20,api_key:'SYNTHETIC_KEY',stream:true};
 assert.deepEqual(novelSamplingParameters(p),{temperature:0.3,top_p:0.8});p.modelParameters.temperature=-1;assert.throws(()=>novelSamplingParameters(p),/temperature/);
});
test('required Fruit dice macros are bounded, deterministic under test and never evaluate code',()=>{
 const resolver=new FruitMacroResolver({},()=>0.5);
 assert.equal(resolver.resolve('{{roll:1d10}}'),'6');assert.equal(resolver.resolve('{{roll:1d9999}}'),'5000');
 assert.throws(()=>resolver.resolve('{{roll:999999d999999}}'));assert.throws(()=>resolver.resolve('{{roll:process.exit()}}'));
});
test('mixed auxiliary requirements retain their dependency text without making disabled auxiliary visible',async()=>{
 const {data,r}=fixture(),p=await preset('正文与 ECoT 分开。{{roll:1d10}}'),profile=createFruitState().profiles.meeting;
 profile.output.auxiliary=false;const result=compileNovelConversation(data,r,'scene','x',{preset:p,profile,nowTs:now});
 assert.equal(result.status,'request-ready');assert.ok(result.messages.some(m=>m.sourceId==='a'&&m.content.includes('ECoT')));
 const output=await readNovelResponse(response('<ECoT>NOT_DISPLAYED</ECoT><content>正文</content>'),profile,true);assert.ok(!JSON.stringify(output).includes('NOT_DISPLAYED'));
});
test('auxiliary markup is escaped and never becomes active page elements',()=>{
 const html=novelAuxiliaryHtml({id:'aux',speaker:'char',text:'正文',at:now,novelOutput:{presetId:'test',mode:'meeting',memoryEligible:false,scene:'<img src=x onerror=BAD()>',summary:'<script>BAD()</script>'}});
 assert.ok(html.includes('&lt;img'));assert.ok(html.includes('&lt;script'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));
});
test('historical regeneration records the real revision time while keeping the original turn time',()=>{
 const {r}=fixture();r.play=null;r.scene!.messages.push({id:'old',speaker:'char',text:'OLD',at:now,replyTo:'u'});
 const plan=prepareNovelRegeneration(r,'scene','old')!,tasks=createNovelTasks(),task=tasks.begin(r,'scene');
 commitNovelReply(r,task,{id:'new',speaker:'char',text:'NEW',at:now,replyTo:'u'},()=>true,plan,now+5000);
 assert.equal(r.messageRevisions?.at(-1)?.at,now+5000);assert.equal(r.scene!.messages.at(-1)?.at,now);
});
test('content examples inside auxiliary blocks are never mistaken for the actual novel body',async()=>{
 const profile=createFruitState().profiles.meeting;
 const value=await readNovelResponse(response('<ECoT>格式举例：<content>NOT_THE_STORY</content></ECoT><meow_FM><content>NOT_THE_BODY</content></meow_FM><content>ACTUAL_STORY</content>'),profile,true);
 assert.equal(value.text,'ACTUAL_STORY');
 await assert.rejects(()=>readNovelResponse(response('<ECoT>unclosed<content>NOT_A_BODY</content>'),profile,true));
});
test('revoking a compiled episodic source or changing identity invalidates an outstanding meeting task',async()=>{
 const {data,r}=fixture();r.play=null;r.chats=[{id:'source',speaker:'me',text:'SOURCE_FACT',at:now-4000}];
 r.events=[{id:'event',kind:'chat',title:'真实发言',detail:'SOURCE_FACT',at:now-4000,messageId:'source',knownBy:[r.id]}];
 const tasks=createNovelTasks(),task=tasks.begin(r,'scene'),compiled=compileNovelConversation(data,r,'scene','SOURCE_FACT',{preset:await preset(),profile:createFruitState().profiles.meeting,nowTs:now});
 assert.ok(compiled.memorySources.some(s=>s.id==='event'));assert.equal(tasks.valid(task,r,r.id),true);
 retractMessage(r,'chat','source',now+1);assert.equal(tasks.valid(task,r,r.id),false);
 assert.throws(()=>commitNovelReply(r,task,{id:'late',speaker:'char',text:'STALE_RESULT',at:now+2},()=>true));
 for(const field of ['name','notes','userAlias','place']as const){const {r}=fixture();r.play=null;const registry=createNovelTasks(),t=registry.begin(r,'scene');r[field]='CHANGED';assert.equal(registry.valid(t,r,r.id),false,field);}
});
test('regenerated openings retain an absent parent and cannot supersede a later real reply',()=>{
 const {r}=fixture();r.play=null;r.scene!.messages=[{id:'opening',speaker:'char',text:'OPENING',at:now-3000},{id:'later-u',speaker:'me',text:'LATER',at:now-2000},{id:'later-r',speaker:'char',text:'LATER_REPLY',at:now-1000,replyTo:'later-u'}];
 const plan=prepareNovelRegeneration(r,'scene','opening')!,tasks=createNovelTasks(),task=tasks.begin(r,'scene');
 const lastInput=r.scene!.messages.filter(m=>m.speaker==='me').at(-1);
 const replyTo=plan?plan.sourceId:lastInput?.id;
 commitNovelReply(r,task,{id:'new-opening',speaker:'char',text:'NEW_OPENING',at:plan.targetAt,replyTo},()=>true,plan,now);
 const next=prepareNovelRegeneration(r,'scene','new-opening')!;assert.deepEqual(next.targetIds,['new-opening']);assert.equal(r.scene!.messages.find(m=>m.id==='later-r')?.status,undefined);
});
test('closing an auxiliary output never removes a mixed author body-format rule',async()=>{
 const {data,r}=fixture(),p=await preset('AUTHOR_BODY_FORMAT：<content>正文</content>，可附 <profile>人物</profile> 与 <meow_FM>摘要</meow_FM> 和 <status_bar>场景</status_bar>。');
 const profile=createFruitState().profiles.meeting;profile.output={scene:false,summary:false,characters:false,auxiliary:false};
 const result=compileNovelConversation(data,r,'scene','x',{preset:p,profile,nowTs:now});assert.equal(result.status,'request-ready');assert.ok(result.messages.some(m=>m.sourceId==='a'&&m.content.includes('AUTHOR_BODY_FORMAT')));
});
test('a scene message already included as history is not injected again as episodic memory',async()=>{
 const {data,r}=fixture();r.events=[{id:'same-turn-event',kind:'scene',title:'当前发言',detail:'REAL_INPUT',at:now-1000,source:r.scene!.id,messageId:'u',speaker:'me',knownBy:[r.id]}];
 const result=compileNovelConversation(data,r,'scene','REAL_INPUT',{preset:await preset(),profile:createFruitState().profiles.meeting,nowTs:now});
 assert.equal(requestMessages(result).reduce((n,m)=>n+(m.content.match(/REAL_INPUT/g)||[]).length,0),1);
});
