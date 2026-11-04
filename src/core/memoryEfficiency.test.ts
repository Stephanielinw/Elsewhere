import test from 'node:test';import assert from 'node:assert/strict';
import {createRole,defaults} from './defaults';import {buildNativeContext,compileNativeConversation} from './prompt';import {requestMessages} from './conversationPrompt';import {buildCharacterDiaryPrompt} from './diary';import {syncRoleMemory,inspectMemoryRequest} from './memory';import {preparePersonalReply,applyPersonalReply} from './roleLife';
const at=Date.parse('2026-11-03T20:00:00Z');
function fixture(){const data=defaults(),r=createRole('合成角色','','修复师','谨慎','合成世界');r.id='actor';r.chats=[];r.events=[];r.diaries=[];data.roles=[r];data.preset=null;r.preset=null;r.canonNotes='CANON_KEEP：北门事件尚未发生。';return {data,r};}
function message(r:ReturnType<typeof fixture>['r'],id:string,speaker:'me'|'char',text:string,time:number){const m={id,speaker,text,at:time,status:'active' as const};r.chats.push(m);r.events.push({id:'e-'+id,kind:'chat',title:'合成发言',detail:text,at:time,speaker,messageId:id,knownBy:[r.id],status:'active'});return m;}
function oldHistory(r:ReturnType<typeof fixture>['r']){for(let i=0;i<45;i++)message(r,'filler'+i,i%2?'char':'me','看云 '+i,at-100000+i);}

test('repeated identity corrections are represented once without changing stored sources',()=>{
 const {data,r}=fixture();for(let i=0;i<18;i++){message(r,'guess'+i,'char','你是导演吧？',at-300000+i*2);message(r,'fix'+i,'me','不是，我是剪辑师。',at-300000+i*2+1);}syncRoleMemory(r,at);oldHistory(r);const stored=JSON.stringify(r);
 const ctx=buildNativeContext(data,r,'chat','晚饭吃什么',{nowTs:at}),facts=ctx.facts.filter(f=>f.id.startsWith('memory:'));
 assert.equal(facts.length,2);assert.equal(JSON.stringify(r),stored);assert.ok(ctx.native!.memoryTrace!.some(t=>t.reason==='same-current-fact'));
 const compilation=compileNativeConversation(data,r,'chat','晚饭吃什么',{nowTs:at}),wire=requestMessages(compilation),trace=inspectMemoryRequest(ctx,compilation,wire);assert.equal(trace.facts.filter(f=>f.id.startsWith('memory:')&&f.reason==='injected').length,2);
});

test('compact identity facts retain client provenance without repeating raw ids/timestamps in the stable block',()=>{
 const {data,r}=fixture();message(r,'source-long-id-that-stays-local','me','我的职业不是导演而是剪辑师。',at-200000);oldHistory(r);const ctx=buildNativeContext(data,r,'chat','早',{nowTs:at});
 const facts=ctx.facts.filter(f=>f.id.startsWith('memory:'));assert.ok(facts.length);for(const f of facts){assert.ok(!f.text.includes('source-long-id-that-stays-local'));assert.ok(!f.text.includes('2026-'));assert.ok(ctx.native!.memoryTrace!.some(t=>t.id===f.id&&t.sourceIds.includes('source-long-id-that-stays-local')));}
});

test('protected Canon and distinct corrections cannot be crowded out by duplicate facts or a soft budget',()=>{
 const {data,r}=fixture();r.canonNotes='CANON_BOUNDARY '.repeat(300);
 for(let i=0;i<35;i++)message(r,'unique'+i,'me','我的属性'+i+'是重要事实'+i+'。',at-400000+i);
 for(let i=0;i<20;i++)message(r,'repeat'+i,'me','我不是旧推测，我是新身份。',at-300000+i);
 oldHistory(r);const wire=JSON.stringify(requestMessages(compileNativeConversation(data,r,'chat','你好',{nowTs:at})));
 assert.ok(wire.includes(r.canonNotes!));for(let i=0;i<35;i++)assert.ok(wire.includes('重要事实'+i));assert.ok(wire.includes('已否认：旧推测'));assert.ok(wire.includes('当前陈述：新身份'));
});

test('a fact already fully supplied in fixed identity is not repeated as extra memory',()=>{
 const {data,r}=fixture();data.user.identity='剪辑师';message(r,'job','me','我是剪辑师。',at-200000);oldHistory(r);
 const ctx=buildNativeContext(data,r,'chat','晚安',{nowTs:at}),compilation=compileNativeConversation(data,r,'chat','晚安',{nowTs:at}),wire=requestMessages(compilation);
 assert.equal(wire.map(m=>m.content).join('\n').split('剪辑师').length-1,1);assert.ok(inspectMemoryRequest(ctx,compilation,wire).facts.some(f=>f.id.startsWith('memory:')&&f.reason==='injected'));
});

test('ordinary chat skips irrelevant raw episodes but a specific past question retrieves attributed excerpts',()=>{
 const {data,r}=fixture();message(r,'past','char','那次船坞修复停在潮汐变化之前。'+ '无关的长叙述。'.repeat(700),at-86400000*30);oldHistory(r);
 const short=buildNativeContext(data,r,'chat','晚饭吃什么',{nowTs:at});assert.ok(!short.native!.protectedText.includes('无关的长叙述'));
 const past=buildNativeContext(data,r,'chat','还记得那次船坞修复吗',{nowTs:at});assert.ok(past.native!.protectedText.includes('那次船坞修复停在潮汐变化之前'));assert.ok(past.native!.protectedText.length<8000);assert.ok(past.facts.some(f=>f.id==='e-past'));
});

test('diary uses compact stable facts and does not duplicate a confirmed life event',()=>{
 const {data,r}=fixture();message(r,'fix','me','我的职业不是导演而是剪辑师。',at-3000);r.events.push({id:'life',kind:'life',title:'材料试验',detail:'FIBRE_EVENT：已确认纤维试样可用。',at:at-2000,source:'manual',lifeEvidence:'confirmed',knownBy:[r.id]});
 const day=new Date(at).toLocaleDateString('en-CA'),wire=buildCharacterDiaryPrompt(r,data.user,day).messages.map(m=>m.content).join('\n');
 assert.equal(wire.split('FIBRE_EVENT').length-1,1);assert.ok(wire.includes('当前陈述：剪辑师'));assert.ok(wire.includes('已否认：导演'));assert.ok(wire.includes(r.canonNotes!));
});

test('novel modes retain the existing source-rich representation',()=>{
 const {data,r}=fixture();message(r,'job','me','我是剪辑师。',at-2000);r.scene={id:'scene',where:'合成地点',startedAt:at-1000,messages:[]};
 const scene=buildNativeContext(data,r,'scene','',{nowTs:at});assert.ok(scene.native!.protectedText.includes('来源消息 job，2026-'));assert.ok(scene.native!.protectedText.includes('[记忆 memory:job:0:0]'));
});

import {estimateTextTokens,memoryExcerpt,selectMemoryItems} from './contextBudget';import {createFruitState} from './fruit/preset';import {retractMessage} from './revisions';
test('local budget is approximate, Unicode-safe and excerpts are explicitly incomplete original data',()=>{
 const text='第一句说明。'+'🌊潮汐变化并未确认。'.repeat(60),snippet=memoryExcerpt(text,'潮汐',30);assert.ok(snippet.startsWith('〔原文节选〕'));assert.ok(snippet.endsWith('〔节选结束〕'));assert.ok(!snippet.includes('\ufffd'));assert.ok(estimateTextTokens(text)>estimateTextTokens(snippet));
 assert.deepEqual(selectMemoryItems(['长'.repeat(200),'甲','乙'],x=>x,5,2),['甲','乙']);
});

test('budget selection does not conflate distinct episodic sources with identical words',()=>{
 const {data,r}=fixture();message(r,'a','char','那次修复需要慢慢来。',at-200000);message(r,'b','char','那次修复需要慢慢来。',at-190000);oldHistory(r);
 const ctx=buildNativeContext(data,r,'chat','那次修复的经过',{nowTs:at}),comp=compileNativeConversation(data,r,'chat','那次修复的经过',{nowTs:at});assert.ok(ctx.native!.factFragments!['e-a']);assert.ok(ctx.native!.factFragments!['e-b']);assert.ok(comp.memorySources.some(s=>s.id==='e-a')&&comp.memorySources.some(s=>s.id==='e-b'));
});

test('unselected candidates are not counted injected even when a different source has identical body',()=>{
 const {data,r}=fixture();for(let i=0;i<8;i++)message(r,'copy'+i,'char','修复需要慢慢来。',at-200000+i);oldHistory(r);
 const ctx=buildNativeContext(data,r,'chat','修复',{nowTs:at}),comp=compileNativeConversation(data,r,'chat','修复',{nowTs:at});const sent=comp.memorySources.filter(s=>s.id.startsWith('e-copy'));
 assert.equal(sent.length,3);assert.ok(ctx.facts.filter(s=>s.id.startsWith('e-copy')).length>3);assert.ok(!comp.memorySources.some(s=>s.id==='e-copy0'));
});

test('compaction retains custom rules, quotations, source invalidation and role isolation',()=>{
 const {data,r}=fixture();const fact=message(r,'job','me','我的职业不是导演而是剪辑师。',at-200000);syncRoleMemory(r,at);oldHistory(r);const quoted=message(r,'quote','me','这是引用',at-1000);Object.assign(quoted,{quote:{id:'filler44',speaker:'me',text:'看云 44',at:at-99956}});
 const profile=createFruitState().profiles.meeting;profile.edits={'native.chat.voice':{content:'CUSTOM_KEEP {{char}}：你可以有自己的意见。'}};
 const wire=JSON.stringify(requestMessages(compileNativeConversation(data,r,'chat','今晚',{profile,nowTs:at})));assert.ok(wire.includes('CUSTOM_KEEP 合成角色'));assert.ok(wire.includes('看云 44'));assert.ok(wire.includes('剪辑师'));
 const other=fixture().r;other.id='other';other.memory=structuredClone(r.memory);data.roles.push(other);assert.ok(!JSON.stringify(requestMessages(compileNativeConversation(data,other,'chat','今晚',{nowTs:at}))).includes('剪辑师'));
 retractMessage(r,'chat',fact.id,at+1);assert.ok(!JSON.stringify(requestMessages(compileNativeConversation(data,r,'chat','今晚',{nowTs:at+2}))).includes('当前陈述：剪辑师'));
});

test('private state cannot cite a non-visible source whose id prefixes a visible source',()=>{
 const {r}=fixture();for(const id of ['life-1','life-10'])r.events.push({id,kind:'life',title:'生活记录',detail:'已确认材料可用',at:at-1000,source:'manual',lifeEvidence:'confirmed',knownBy:[r.id]});
 const p=preparePersonalReply(r,[{role:'system',content:'[生活记录 life-10 · 2026-11-03] 材料可用'}],at,'request','',[],'chat',true);assert.ok(p.ticket.sources.some(s=>s.id==='life-10'));assert.ok(!p.ticket.sources.some(s=>s.id==='life-1'));
});

test('legacy user diary events without explicit sharing never enter candidate or wire memory',()=>{
 for(const knownBy of [undefined,[]]){const {data,r}=fixture();r.events.push({id:'private-diary',kind:'diary',title:'旧私人日记',detail:'PRIVATE_UNSHARED_SECRET',at:at-1000,knownBy});const ctx=buildNativeContext(data,r,'chat','PRIVATE_UNSHARED_SECRET',{nowTs:at});assert.ok(!ctx.facts.some(f=>f.id==='private-diary'));assert.ok(!JSON.stringify(requestMessages(compileNativeConversation(data,r,'chat','PRIVATE_UNSHARED_SECRET',{nowTs:at}))).includes('PRIVATE_UNSHARED_SECRET'));}
});

test('all protected facts actually sent retain matching source metadata beyond sixty candidates',()=>{
 const {data,r}=fixture();for(let i=0;i<70;i++)message(r,'fact'+i,'me','我的属性'+i+'是重要事实'+i+'。',at-200000+i);oldHistory(r);const ctx=buildNativeContext(data,r,'chat','晚安',{nowTs:at}),comp=compileNativeConversation(data,r,'chat','晚安',{nowTs:at}),wire=requestMessages(comp);
 const traced=inspectMemoryRequest(ctx,comp,wire).facts.filter(f=>f.id.startsWith('memory:')&&f.reason==='injected');assert.equal(traced.length,70);assert.equal(comp.memorySources.filter(f=>f.id.startsWith('memory:')).length,70);
});

test('an explicit past question receives the matching tail of a long original sentence',()=>{
 const {data,r}=fixture();message(r,'past','char','此前一路走过平静的山道'.repeat(50)+'北门密码是4827',at-86400000*30);oldHistory(r);const wire=JSON.stringify(requestMessages(compileNativeConversation(data,r,'chat','还记得北门密码是多少吗',{nowTs:at})));assert.ok(wire.includes('北门密码是4827'));
});
