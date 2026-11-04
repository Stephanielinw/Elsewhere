import test from 'node:test';
import assert from 'node:assert/strict';
import {createRole,defaults} from './defaults';
import {buildNativeContext,compileNativeConversation} from './prompt';
import {compileConversationPrompt,requestMessages} from './conversationPrompt';
import {nativePreset} from './fruit/nativePreset';
import {createFruitState} from './fruit/preset';
const at=Date.parse('2026-11-03T20:00:00Z');
function fixture(){const data=defaults(),r=createRole('合成角色','','修复师','谨慎','合成世界');r.id='actor';r.chats=[];r.events=[];r.diaries=[];r.preset=null;data.roles=[r];data.preset=null;return {data,r};}
function message(r:ReturnType<typeof fixture>['r'],id:string,speaker:'me'|'char',text:string,time:number){const m={id,speaker,text,at:time,status:'active' as const};r.chats.push(m);r.events.push({id:'e-'+id,kind:'chat',title:speaker==='me'?'你说过':'角色说过',detail:text,at:time,speaker,messageId:id,knownBy:['user',r.id],status:'active'});return m;}

test('explicit identity correction remains in actual phone request beyond thirty messages without query keyword overlap',()=>{
 const {data,r}=fixture();message(r,'guess','char','你是导演吧？',at-500000);message(r,'correction','me','不是，我已经说过了，我是剪辑师。',at-499000);
 for(let i=0;i<45;i++)message(r,'filler-'+i,i%2?'char':'me','看见那朵云了吗 '+i,at-450000+i*1000);
 const wire=requestMessages(compileNativeConversation(data,r,'chat','明天有什么安排',{nowTs:at}));
 assert.ok(wire.some(m=>m.role==='system'&&m.content.includes('剪辑师')),'current identity must survive history truncation and unrelated query');
});

test('nativeContext does not report a source whose content was never materialized',()=>{
 const {data,r}=fixture(),ctx=buildNativeContext(data,r,'chat','',{nowTs:at});ctx.facts.push({id:'not-sent',text:'NEVER_MATERIALIZED',layer:'identity',at,scope:ctx.scope,knownBy:[r.id],active:true,revisionValid:true});
 const compilation=compileConversationPrompt(nativePreset('meeting'),createFruitState().profiles.meeting,ctx,{purpose:'request'});
 assert.ok(!requestMessages(compilation).some(m=>m.content.includes('NEVER_MATERIALIZED')));
 assert.ok(!compilation.memorySources.some(s=>s.id==='not-sent'),'candidate != injected');
});

test('a user diary shared only in the future cannot enter an earlier request',()=>{
 const {data,r}=fixture();r.diaries.push({id:'future-share',speaker:'me',text:'PRIVATE_FUTURE_SHARE',at:at-10000,sharedWith:[r.id],sharedAt:{[r.id]:at+1000},source:'manual'});
 assert.ok(!JSON.stringify(requestMessages(compileNativeConversation(data,r,'chat','',{nowTs:at}))).includes('PRIVATE_FUTURE_SHARE'));
});

import {projectRoleMemory,syncRoleMemory,inspectMemoryRequest} from './memory';
import {editMessage,retractMessage} from './revisions';

test('identity ledger persists without touching profiles/history, and later explicit properties supersede old ones',()=>{
 const {data,r}=fixture();message(r,'a','me','我的职业是修复师。',at-3000);const originalProfile=r.profile;
 assert.ok(syncRoleMemory(r,at));message(r,'b','me','更正，我的职业是航路设计师。',at-1000);syncRoleMemory(r,at);
 const restored=JSON.parse(JSON.stringify(r)),projection=projectRoleMemory(restored,at);
 assert.ok(projection.facts.some(f=>f.value==='航路设计师'&&f.polarity==='affirm'));
 assert.ok(!projection.facts.some(f=>f.value==='修复师'&&f.polarity==='affirm'));assert.equal(r.profile,originalProfile);assert.equal(r.chats.length,2);
 assert.ok(projection.trace.some(t=>t.reason==='corrected'));
});

test('quotes, hypothetical self claims, explicit jokes and theatre text never become current identity',()=>{
 const {r}=fixture();for(const [i,text] of ['如果我是修复师就好了。','他对我说：“我是守卫。”','开玩笑，我是国王。','对对对，我是宇宙之主，行了吧。','假装我是船长。'].entries())message(r,'ambiguous'+i,'me',text,at-1000+i);
 r.play={id:'play',title:'剧',world:'虚构',char:'船长',user:'王',startedAt:at-1000,messages:[{id:'stage',speaker:'me',text:'我是国王。',at:at-900}]};
 assert.equal(projectRoleMemory(r,at).facts.length,0);
});

test('editing or retracting correction sources invalidates derived current facts without deleting ledger records',()=>{
 for(const change of ['edit','retract']){const {r}=fixture();message(r,'source','me','我的职业是修复师。',at-1000);syncRoleMemory(r,at);const saved=JSON.stringify(r.memory);
 if(change==='edit')editMessage(r,'chat','source','这句需要重新说。',at+1);else retractMessage(r,'chat','source',at+1);
 assert.equal(projectRoleMemory(r,at+2).facts.length,0);assert.equal(JSON.stringify(r.memory),saved);
 }
});

test('new relationship declarations are source-qualified, do not overwrite Canon, and remain role-isolated',()=>{
 const {r}=fixture();message(r,'rel1','me','我们现在是合作伙伴。',at-2000);message(r,'rel2','me','我们现在是朋友。',at-1000);const before=r.relationship;syncRoleMemory(r,at);
 const facts=projectRoleMemory(r,at).facts.filter(f=>f.layer==='relationship');assert.equal(facts.length,1);assert.equal(facts[0].value,'朋友');assert.equal(r.relationship,before);
 const other=fixture().r;other.id='other';other.memory=structuredClone(r.memory);assert.equal(projectRoleMemory(other,at).facts.length,0);
});

import {preparePersonalReply,applyPersonalReply,collectRoleLife,personalDiaries} from './roleLife';
import {buildCharacterDiaryPrompt,applyGeneratedCharacterDiary,getLocalDayBounds} from './diary';

test('a correction invalidates old private assumptions derived from the denied source, preserving stored data',()=>{
 const {r}=fixture();const old=message(r,'guess','char','你是导演吧？',at-5000);const p=preparePersonalReply(r,[],at-4000,'private');
 applyPersonalReply(r,p.ticket,JSON.stringify({requestId:p.ticket.id,roleId:r.id,updates:[{kind:'plan',text:'下次聊对方的导演工作',sources:['message:'+old.id],shareable:true}]}),at-4000);
 assert.equal(collectRoleLife(r,at-3000).threads.length,1);
 message(r,'fix','me','不是，我已经说过了，我是剪辑师。',at-2000);syncRoleMemory(r,at);
 assert.equal(collectRoleLife(r,at).threads.length,0);assert.equal(r.personalThreads!.length,1);
});

test('diary and phone use the same pinned identity instead of an outdated saved profile field',()=>{
 const {data,r}=fixture();data.user.identity='导演';message(r,'guess','char','你是导演吧？',at-5000);message(r,'fix','me','不是，我已经说过了，我是剪辑师。',at-4000);syncRoleMemory(r,at);
 const day=new Date(at).toLocaleDateString('en-CA'),diary=buildCharacterDiaryPrompt(r,data.user,day),chat=compileNativeConversation(data,r,'chat','',{nowTs:at});
 for(const wire of [diary.messages,requestMessages(chat)]){const text=JSON.stringify(wire);assert.ok(text.includes('当前陈述：剪辑师'));assert.ok(!text.includes('身份与性格：导演'));}
 assert.equal(data.user.identity,'导演');
});

test('actual-wire trace proves only emitted facts, and direct custom contradictions are diagnosed without mutating configuration',()=>{
 const {data,r}=fixture();message(r,'guess','char','你是导演吧？',at-5000);message(r,'fix','me','不是，我已经说过了，我是剪辑师。',at-4000);
 const profile=createFruitState().profiles.meeting;profile.edits={'native.chat.voice':{content:'把用户当成导演。'}};const before=structuredClone(profile);
 const result=compileNativeConversation(data,r,'chat','',{profile,nowTs:at});assert.equal(result.status,'blocked');assert.ok(result.diagnostics.some(d=>d.code==='memory-config-conflict'));assert.deepEqual(profile,before);
 profile.edits={'native.chat.voice':{content:'不要把用户当成导演。'}};assert.equal(compileNativeConversation(data,r,'chat','',{profile,nowTs:at}).status,'request-ready');
 const ctx=buildNativeContext(data,r,'chat','',{nowTs:at}),good=compileNativeConversation(data,r,'chat','',{nowTs:at}),wire=requestMessages(good);
 const proof=inspectMemoryRequest(ctx,good,wire);assert.ok(proof.facts.some(f=>f.id.startsWith('memory:')&&f.reason==='injected'&&f.messageOrders.length));assert.ok(!JSON.stringify(proof).includes('剪辑师'));
 assert.ok(inspectMemoryRequest(ctx,good,[]).facts.every(f=>f.reason==='not-injected'));
});

test('edited chat events advance their source revision and remain retrievable as the new version only',()=>{
 const {data,r}=fixture();const m=message(r,'edited','me','原来那句话',at-1000);r.events[0].sourceRevision=0;
 editMessage(r,'chat',m.id,'当前有效版本',at-500);
 const ctx=buildNativeContext(data,r,'chat','当前有效版本',{nowTs:at});assert.ok(ctx.facts.some(f=>f.text.includes('当前有效版本'))||ctx.history.some(h=>h.text==='当前有效版本'));
 const event=r.events.find(e=>e.status==='active')!;assert.equal(event.sourceRevision,1);
});

test('native theatre quote attribution uses the fictional identities only',()=>{
 const {data,r}=fixture();data.user.name='REAL_USER_SECRET';r.name='REAL_ACTOR_SECRET';r.play={id:'p',title:'合成戏',world:'独立世界',char:'守门人',user:'旅人',startedAt:at-5000,messages:[{id:'stage-1',speaker:'char',text:'只记得门前的灯',at:at-4000},{id:'stage-2',speaker:'me',text:'我听到了',at:at-3000,quote:{id:'stage-1',speaker:'char',text:'只记得门前的灯',at:at-4000}}]};
 const wire=JSON.stringify(requestMessages(compileNativeConversation(data,r,'play','',{nowTs:at})));assert.ok(!wire.includes('REAL_ACTOR_SECRET')&&!wire.includes('REAL_USER_SECRET'));assert.ok(wire.includes('守门人'));
});

test('mutual relationship confirmation is distinct from a unilateral proposal and survives reopen',()=>{
 const {data,r}=fixture();r.relationship='普通熟人';message(r,'offer','me','我们现在是朋友。',at-3000);syncRoleMemory(r,at-2500);
 assert.ok(!projectRoleMemory(r,at-2500).facts.some(f=>f.layer==='relationship'&&f.mutual));
 message(r,'accept','char','是的，我们现在是朋友。',at-2000);syncRoleMemory(r,at-1000);
 const restored=JSON.parse(JSON.stringify(r));assert.ok(projectRoleMemory(restored,at).facts.some(f=>f.layer==='relationship'&&f.mutual&&f.value==='朋友'));
 message(restored,'new-proposal','me','我们现在是恋人。',at-500);syncRoleMemory(restored,at);
 const ctx=buildNativeContext({...data,roles:[restored]},restored,'chat','',{nowTs:at});assert.ok(ctx.native!.protectedText.includes('你和用户目前的关系：朋友'));
 assert.equal(r.relationship,'普通熟人');
});

import {normalizeAndMigrateData} from './defaults';
import {compileChatBatchPrompt,buildPhoneRegeneration} from './chatBatchPrompt';

test('old saves project lazily, preserve optional ledger on restore, and unknown versions are never overwritten',()=>{
 const {data,r}=fixture();message(r,'legacy','me','我的职业是修复师。',at-1000);const before=JSON.stringify(r);
 assert.ok(projectRoleMemory(r,at).facts.length);assert.equal(JSON.stringify(r),before);
 syncRoleMemory(r,at);const saved=JSON.stringify(data),restored=normalizeAndMigrateData(JSON.parse(saved));assert.deepEqual(restored.roles[0].memory,r.memory);
 const unknown=JSON.parse(JSON.stringify(r));unknown.memory={version:99,records:[],opaque:'preserve'};const raw=JSON.stringify(unknown.memory);assert.equal(syncRoleMemory(unknown,at),false);assert.equal(JSON.stringify(unknown.memory),raw);
});

test('a later explicit assertion can replace a prior denial without both appearing as current',()=>{
 const {r}=fixture();message(r,'old','me','我不是修复师。',at-2000);syncRoleMemory(r,at-1000);
 message(r,'new','me','更正，我是修复师。',at);syncRoleMemory(r,at+1);
 const p=projectRoleMemory(r,at+1);assert.ok(p.facts.some(f=>f.value==='修复师'&&f.polarity==='affirm'));assert.ok(!p.facts.some(f=>f.value==='修复师'&&f.polarity==='deny'));
 retractMessage(r,'chat','new',at+2);assert.ok(!projectRoleMemory(r,at+3).facts.some(f=>f.value==='修复师'));
});

test('a withdrawn mutual confirmation cannot keep overriding the original relationship',()=>{
 const {r}=fixture();r.relationship='熟人';message(r,'offer','me','我们现在是朋友。',at-2000);message(r,'consent','char','是的，我们现在是朋友。',at-1000);syncRoleMemory(r,at);
 retractMessage(r,'chat','consent',at+1);assert.ok(!projectRoleMemory(r,at+2).facts.some(f=>f.mutual));
});

test('pending next-batch identity and later history do not leak into the active batch or historical regeneration',()=>{
 const {data,r}=fixture();const user=message(r,'first-input','me','你好。',at-5000);message(r,'reply','char','第一轮。',at-4000);Object.assign(r.chats.at(-1)!,{replyTo:user.id,replySourceIds:[user.id]});message(r,'future-fact','me','我的职业是未来独有身份。',at-3000);syncRoleMemory(r,at);
 r.chatTiming={version:1,focused:true,generation:0,pending:['future-fact'],quietUntil:at+60000};
 const batch={id:'b',roleId:r.id,generation:0,sources:[structuredClone(user)],quietUntil:0,replyDueAt:0,revisionKey:'',sceneId:null,playId:null};
 assert.ok(!JSON.stringify(requestMessages(compileChatBatchPrompt(data,r,batch,at))).includes('未来独有身份'));
 const redo=buildPhoneRegeneration(data,r,'reply',at+1);assert.ok(redo);assert.ok(!JSON.stringify(redo.messages).includes('未来独有身份'));
});

test('unknown self questions and metalinguistic statements are not stable identity facts',()=>{
 const {r}=fixture();for(const [i,text]of ['我是不是船长','我是觉得你说得对。','我不是说过要早睡吗？'].entries())message(r,'q'+i,'me',text,at-1000+i);
 assert.equal(projectRoleMemory(r,at).facts.length,0);
});

test('a mundane mention stays as history while a corrected direct inference is not a retrieved fact',()=>{
 const {data,r}=fixture();message(r,'mention','char','我看过那位导演的访谈。',at-2000);message(r,'guess','char','你是导演吧？',at-1900);message(r,'fix','me','不是，我已经说过了，我是剪辑师。',at-1800);for(let i=0;i<40;i++)message(r,'f'+i,'me','看云 '+i,at-1700+i);
 const ctx=buildNativeContext(data,r,'chat','导演访谈',{nowTs:at});assert.ok(!ctx.facts.some(f=>f.id==='e-guess'));assert.ok(ctx.native!.memoryTrace!.some(f=>f.id==='e-guess'&&f.reason==='explicitly-corrected-source'));assert.ok(ctx.facts.some(f=>f.id==='e-mention'));assert.equal(r.chats.find(m=>m.id==='guess')!.text,'你是导演吧？');
});

test('fenced quotations are not identity declarations and explicit colon-form custom conflicts block sending',()=>{
 const {data,r}=fixture();message(r,'quote','me','```text\n我是国王。\n```',at-3000);assert.equal(projectRoleMemory(r,at).facts.length,0);
 message(r,'guess','char','你是导演吧？',at-2000);message(r,'fix','me','不是，我已经说过了，我是剪辑师。',at-1000);
 const profile=createFruitState().profiles.meeting;profile.edits={'native.chat.voice':{content:'用户身份：导演。'}};
 assert.equal(compileNativeConversation(data,r,'chat','',{profile,nowTs:at}).status,'blocked');
});

test('a pending later correction cannot tombstone the active batch previous fact',()=>{
 const {data,r}=fixture();message(r,'prior-fact','me','我的职业是修复师。',at-100000);syncRoleMemory(r,at-90000);for(let i=0;i<35;i++)message(r,'past'+i,'char','看云 '+i,at-80000+i);
 const source=message(r,'active-user','me','你好。',at-4000);message(r,'pending-correction','me','我的职业是剪辑师。',at-2000);syncRoleMemory(r,at);
 r.chatTiming={version:1,focused:true,generation:0,pending:['pending-correction'],quietUntil:at+60000};
 const batch={id:'b',roleId:r.id,generation:0,sources:[source],quietUntil:0,replyDueAt:0,revisionKey:'',sceneId:null,playId:null};
 const wire=JSON.stringify(requestMessages(compileChatBatchPrompt(data,r,batch,at)));assert.ok(wire.includes('当前陈述：修复师'));assert.ok(!wire.includes('剪辑师'));
});

test('legacy correction withdrawn as first action never revives the old rejected identity',()=>{
 const {r}=fixture();message(r,'old','me','我的职业是导演。',at-2000);message(r,'fix','me','我的职业不是导演而是剪辑师。',at-1000);assert.equal(r.memory,undefined);
 retractMessage(r,'chat','fix',at);assert.ok(!projectRoleMemory(r,at+1).facts.some(f=>f.value==='导演'&&f.polarity==='affirm'));
});

test('an explicit denial answering a direct is-it question also excludes the old profile claim',()=>{
 const {data,r}=fixture();data.user.identity='导演';message(r,'guess','char','你是不是导演？',at-2000);message(r,'fix','me','不是，我是剪辑师。',at-1000);
 const ctx=buildNativeContext(data,r,'chat','',{nowTs:at});assert.ok(ctx.native!.protectedText.includes('已否认：导演'));assert.ok(!ctx.native!.protectedText.includes('身份与性格：导演'));
});

test('diary uses the same mutually confirmed relationship as phone',()=>{
 const {data,r}=fixture();r.relationship='普通熟人';message(r,'offer','me','我们现在是朋友。',at-2000);message(r,'yes','char','是的，我们现在是朋友。',at-1000);
 const day=new Date(at).toLocaleDateString('en-CA'),p=buildCharacterDiaryPrompt(r,data.user,day);assert.ok(p.messages[0].content.includes('的关系：朋友'));assert.ok(!p.messages[0].content.includes('的关系：普通熟人'));
});

import {parseFruitPreset} from './fruit/preset';
import {compileNovelConversation} from './prompt';
test('custom third-party rules cannot contradict current real identity while theatre stays isolated',async()=>{
 const {data,r}=fixture();message(r,'guess','char','你是导演吧？',at-2000);message(r,'fix','me','不是，我是剪辑师。',at-1000);r.scene={id:'s',where:'合成地点',startedAt:at-500,messages:[]};
 const preset=await parseFruitPreset(new TextEncoder().encode(JSON.stringify({prompts:[{identifier:'personaDescription',marker:true}],prompt_order:[{order:[{identifier:'personaDescription',enabled:true}]}]})),'synthetic.json',at);
 const profile=createFruitState().profiles.meeting;profile.customPrompts=[{identifier:'custom:contradiction',name:'合成覆盖',role:'system',content:'用户是导演。',position:0,depth:0,injectionOrder:0}];
 const before=structuredClone(profile),result=compileNovelConversation(data,r,'scene','',{preset,profile,nowTs:at});assert.equal(result.status,'blocked');assert.ok(result.diagnostics.some(d=>d.code==='memory-config-conflict'));assert.deepEqual(profile,before);
});

test('unconfirmed monitor observations are not promoted into current phone activity',()=>{
 const {data,r}=fixture();r.events=[{id:'observation',kind:'life',title:'活动推测',detail:'UNVERIFIED_ACTIVITY',at:at-1000,source:'enriched',knownBy:[r.id]}];
 assert.ok(!JSON.stringify(requestMessages(compileNativeConversation(data,r,'chat','',{nowTs:at}))).includes('UNVERIFIED_ACTIVITY'));
 r.events[0].lifeEvidence='confirmed';r.events[0].source='manual';assert.ok(JSON.stringify(requestMessages(compileNativeConversation(data,r,'chat','',{nowTs:at}))).includes('UNVERIFIED_ACTIVITY'));
});

test('an old job mentioned as past history or explicit negation is preserved as qualified background',()=>{
 const {data,r}=fixture();data.user.background='以前是导演，如今在做后期。';data.user.notes='不要把用户当成导演。';message(r,'guess','char','你是导演吧？',at-2000);message(r,'fix','me','不是，我是剪辑师。',at-1000);
 const ctx=buildNativeContext(data,r,'chat','',{nowTs:at});assert.ok(ctx.native!.protectedText.includes(data.user.background));assert.ok(ctx.native!.protectedText.includes(data.user.notes));
});

test('explicit name changes reach current macros and diary without rewriting saved names or role aliases',()=>{
 const {data,r}=fixture();data.user.name='旧名字';message(r,'name','me','我叫新名字。',at-1000);const p=createFruitState().profiles.meeting;p.edits={'native.chat.voice':{content:'对方叫 {{user}}。'}};
 const wire=JSON.stringify(requestMessages(compileNativeConversation(data,r,'chat','',{profile:p,nowTs:at})));assert.ok(wire.includes('对方叫 新名字。'));
 const day=new Date(at).toLocaleDateString('en-CA');assert.ok(buildCharacterDiaryPrompt(r,data.user,day).messages[0].content.includes('用户名：新名字'));assert.equal(data.user.name,'旧名字');
 r.userAlias='已有专属称呼';assert.ok(JSON.stringify(requestMessages(compileNativeConversation(data,r,'chat','',{profile:p,nowTs:at}))).includes('对方叫 已有专属称呼。'));
});
