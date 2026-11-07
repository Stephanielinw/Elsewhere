import test from 'node:test';
import assert from 'node:assert/strict';
import {createRole,defaults,normalizeAndMigrateData} from './defaults';
import {projectRoleMemory,syncRoleMemory,memorySnapshot,relationshipContext} from './memory';
import {editMessage,retractMessage,prepareRegenerateReply} from './revisions';
import {buildNativeContext,compileNativeConversation} from './prompt';
import {requestMessages} from './conversationPrompt';
import type {RoleData} from './types';
import {personalDiaries,collectRoleLife} from './roleLife';

const at=Date.parse('2026-11-07T18:00:00Z');
function fixture(text?:string){const data=defaults(),r=createRole('合成角色','','记录员','谨慎','合成港口');r.id='precision-role';r.chats=[];r.events=[];r.diaries=[];r.preset=null;data.roles=[r];data.preset=null;if(text)add(r,'source',text,at-5000);return {data,r};}
function add(r:RoleData,id:string,text:string,time:number,speaker:'me'|'char'='me'){const m={id,text,at:time,speaker,status:'active' as const};r.chats.push(m);return m;}
function selected(text:string){return projectRoleMemory(fixture(text).r,at).facts.map(f=>[f.attribute,f.value,f.polarity]);}

for(const [text,expected] of [
 ['我是剪辑师，不过我可能明天去纽约。',[['self','剪辑师','affirm']]],
 ['我不是医生，但我也许明天去医院。',[['self','医生','deny']]],
 ['如果我是医生，我就会帮你。',[]],['也许我是学生吧。',[]],
 ['我是学生。我可能下周毕业。',[['self','学生','affirm']]],
 ['我刚才是在开玩笑，我不是医生。',[['self','医生','deny']]],
 ['「我是医生」是电影里的台词。',[]],['我梦见自己是一名国王。',[]],
 ['我不是医生，我是剪辑师。',[['self','医生','deny'],['self','剪辑师','affirm']]],
 ['我们是恋人，但也许你不这么认为。',[['relationship','恋人','affirm']]],
 ['I am an editor, but I might move tomorrow.',[['self','an editor','affirm']]],
 ['I am not a doctor, but I may visit a hospital.',[['self','a doctor','deny']]],
 ['I am a doctor, maybe.',[]],['I am a doctor, I guess.',[]],['Perhaps I am a doctor.',[]],
 ['I am a doctor, I might be wrong.',[]],['我是医生，但我不确定。',[]],['我是医生，也许不是。',[]],
 ['I am an editor but I might move tomorrow.',[['self','an editor','affirm']]],
 ['我是剪辑师不过我可能晚到。',[['self','剪辑师','affirm']]],
 ['我是剪辑师，不过如果下雨，我是医生这件事就能告诉你。',[['self','剪辑师','affirm']]],
 ['I am a doctor or I am a teacher.',[]],
 ['I am a doctor, or I am a teacher.',[]],
 ['I am a doctor, aren\'t I?',[]],['我不是很确定，我是医生。',[]],
 ['更正：我是剪辑师，不过我可能晚到。',[['self','剪辑师','affirm']]],
 ['Actually I am an editor, but I might move.',[['self','an editor','affirm']]],
 ['我是医生，可能吧。',[]],['也许，我是医生。',[]],
 ['如果明天我有时间，我是医生这件事就能告诉你。',[]],
 ['If I have time, I am a doctor and can help.',[]],
 ['他告诉我，我是医生。',[]],['She said, I am a doctor.',[]],
 ['对对对，我是宇宙之主，行了吧。',[]],['I am a king, just kidding.',[]],
 ['「引用」我是医生。',[]],['我是「医生」。',[]],
 ['我是说过要早睡。',[]],
 ['我可能晚到。我的职业是编辑。',[['attribute:职业','编辑','affirm']]],
 ['如果我是医生就好了。我是剪辑师。',[['self','剪辑师','affirm']]],
] as [string,string[][]][]){test('local certainty: '+text,()=>assert.deepEqual(selected(text),expected));}

test('old IDs, snapshots and existing diary fact references remain stable without a ledger',()=>{
 const {data,r}=fixture('我的职业不是导演而是剪辑师。我的名字是小舟。');
 const first=projectRoleMemory(r,at),ids=first.facts.map(f=>f.id).sort();
 assert.deepEqual(ids,['memory:source:0:0','memory:source:0:1','memory:source:0:2']);
 r.diaries.push({id:'old-diary',speaker:'char',text:'合成历史',at:at-1000,generatedAt:at-900,source:'ai',sourceMessageIds:['source'],sourceMessageRevisions:{source:0},memoryState:{version:1,factIds:ids,ignoredMessageIds:[]}});
 assert.equal(personalDiaries(r,at).length,1);
 const before=JSON.stringify(data);assert.deepEqual(memorySnapshot(r,at).factIds.sort(),ids);assert.equal(JSON.stringify(data),before);
 syncRoleMemory(r,at);const restored=normalizeAndMigrateData(JSON.parse(JSON.stringify(data))).roles[0];
 assert.deepEqual(projectRoleMemory(restored,at).facts.map(f=>f.id).sort(),ids);assert.deepEqual(restored.diaries[0].memoryState?.factIds,ids);
 assert.equal(personalDiaries(restored,at).length,1);
 for(const f of restored.memory!.records)assert.deepEqual(f.source,{id:'source',text:r.chats[0].text,at:at-5000,revisionCount:0});
});

test('quote masking preserves original offsets and the unchanged legacy assertion ID',()=>{
 const {r}=fixture('“我是医生”。 我是剪辑师。');const f=projectRoleMemory(r,at).facts;
 assert.equal(f.length,1);assert.equal(f[0].id,'memory:source:0:0');assert.equal(f[0].value,'剪辑师');
});

test('a conflicting stored source cannot lend its occupied ID to a different current assertion',()=>{
 const {r}=fixture('我是医生。');syncRoleMemory(r,at);const before=JSON.stringify(r.memory);
 r.chats[0].text='我是剪辑师。';const p=projectRoleMemory(r,at);assert.equal(p.facts.length,1);assert.notEqual(p.facts[0].id,'memory:source:0:0');assert.equal(p.facts[0].value,'剪辑师');assert.equal(JSON.stringify(r.memory),before);
 syncRoleMemory(r,at);const ids=r.memory!.records.map(f=>f.id);assert.equal(ids.length,new Set(ids).size);assert.deepEqual(projectRoleMemory(r,at).facts.map(f=>f.id),[p.facts[0].id]);
});

test('confirmation context changes cannot silently reuse a stored mutual source identity',()=>{
 const {r}=fixture('我们是朋友。');add(r,'consent','是的，我们是朋友。',at-4000,'char');syncRoleMemory(r,at);
 const old=r.memory!.records.find(f=>f.mutual)!,saved=JSON.stringify(r.memory);r.chats[1].text='我们是朋友。';const current=projectRoleMemory(r,at).facts.find(f=>f.mutual)!;
 assert.ok(current);assert.notEqual(current.id,old.id);assert.equal(JSON.stringify(r.memory),saved);assert.equal(current.contextSource!.text,'我们是朋友。');
});

test('mixed correction does not erase an independent confirmed life event',()=>{
 const {data,r}=fixture('我是医生。');syncRoleMemory(r,at-4000);
 r.events.push({id:'independent-life',kind:'life',title:'合成独立生活',detail:'合成书桌整理完成',at:at-3000,source:'manual',lifeEvidence:'confirmed',knownBy:[r.id],status:'active'});
 const events=JSON.stringify(r.events);add(r,'fix','我不是医生，不过我可能晚到。',at-2000);syncRoleMemory(r,at);
 assert.deepEqual(collectRoleLife(r,at).events.map(e=>e.id),['independent-life']);assert.equal(JSON.stringify(r.events),events);
 assert.ok(requestMessages(compileNativeConversation(data,r,'chat','书桌整理',{nowTs:at})).some(m=>m.content.includes('合成书桌整理完成')));
});

test('rejected earlier candidates never lend their old IDs to a later identical assertion',()=>{
 const {r}=fixture('I am a doctor, I guess. I am a doctor.');
 const facts=projectRoleMemory(r,at).facts;assert.equal(facts.length,1);assert.equal(facts[0].id,'memory:source:0:1');
});

test('new clause IDs are deterministic, disjoint from old IDs, and sync is append-only',()=>{
 const {r}=fixture('我是剪辑师，不过我可能明天去纽约。我的姓名是小舟。');
 const facts=projectRoleMemory(r,at).facts;assert.equal(new Set(facts.map(f=>f.id)).size,2);assert.ok(facts.every(f=>f.id.includes(':local:')));
 const original=JSON.stringify(r);assert.deepEqual(projectRoleMemory(r,at).facts,facts);assert.equal(JSON.stringify(r),original);
 syncRoleMemory(r,at);const saved=JSON.stringify(r.memory);syncRoleMemory(r,at);assert.equal(JSON.stringify(r.memory),saved);
});

test('a legacy uncertain record is retained in storage but cannot prove its own assertion',()=>{
 const {r}=fixture('I am a doctor, maybe.');
 r.memory={version:1,records:[{id:'memory:source:0:0',roleId:r.id,scope:'real:'+r.id,layer:'identity',attribute:'self',value:'a doctor',polarity:'affirm',correction:false,at:at-5000,knownBy:[r.id],origin:'explicit-user',source:{...r.chats[0],revisionCount:0},supersedes:[]}]};
 const before=JSON.stringify(r);const p=projectRoleMemory(r,at);assert.equal(p.facts.length,0);assert.ok(p.trace.some(t=>t.reason==='assertion-unverifiable'));assert.equal(JSON.stringify(r),before);
});

test('mixed corrections invalidate prior claims and withdrawal does not revive rejected identity',()=>{
 const {r}=fixture();add(r,'old','我的职业是医生。',at-4000);syncRoleMemory(r,at-3500);
 add(r,'fix','我的职业不是医生而是剪辑师，不过我可能晚到。',at-3000);syncRoleMemory(r,at-2500);
 const p=projectRoleMemory(r,at-2000);assert.ok(p.facts.some(f=>f.value==='医生'&&f.polarity==='deny'));assert.ok(!p.facts.some(f=>f.value==='医生'&&f.polarity==='affirm'));
 const ledger=JSON.stringify(r.memory);retractMessage(r,'chat','fix',at-1000);assert.ok(!projectRoleMemory(r,at).facts.some(f=>f.value==='医生'&&f.polarity==='affirm'));assert.equal(JSON.stringify(r.memory),ledger);
});

test('edit and historical cutoff preserve the original snapshot and reject unavailable revisions',()=>{
 const {r}=fixture('我是学生。我可能下周毕业。');syncRoleMemory(r,at-4000);const old=structuredClone(r.memory!.records);
 editMessage(r,'chat','source','我是剪辑师。我可能晚到。',at-1000);syncRoleMemory(r,at);
 assert.deepEqual(r.memory!.records.slice(0,old.length),old);assert.equal(projectRoleMemory(r,at-2000).facts.length,0);
 const p=projectRoleMemory(r,at);assert.ok(p.facts.some(f=>f.value==='剪辑师'&&f.source.revisionCount===1));assert.ok(!p.facts.some(f=>f.value==='学生'));
});

test('single-sided relationship remains a proposal and only existing valid consent can make it mutual',()=>{
 const {r}=fixture('我们是恋人，但也许你不这么认为。');r.relationship='熟人';syncRoleMemory(r,at-4000);
 assert.ok(!projectRoleMemory(r,at-3000).facts.some(f=>f.mutual));assert.equal(relationshipContext(r,at-3000),'熟人');
 add(r,'yes','是的，我们是恋人。',at-2000,'char');syncRoleMemory(r,at-1000);
 assert.equal(relationshipContext(r,at),'恋人');retractMessage(r,'chat','yes',at+1);assert.equal(relationshipContext(r,at+2),'熟人');
});

test('explicit roleplay stays out of real identity across messages until an explicit exit',()=>{
 const {r}=fixture();add(r,'enter','我们来角色扮演。',at-4000);add(r,'fiction','我是国王。',at-3000);assert.equal(projectRoleMemory(r,at-2500).facts.length,0);
 add(r,'exit','回到现实。我是剪辑师。',at-2000);assert.deepEqual(projectRoleMemory(r,at).facts.map(f=>f.value),['剪辑师']);
});

for(const action of ['edit','retract'])test('lost roleplay framing never promotes past fiction: '+action,()=>{
 const {r}=fixture();add(r,'enter','我们来角色扮演。',at-4000);add(r,'fiction','我是国王。',at-3000);
 if(action==='edit')editMessage(r,'chat','enter','这一条先不说。',at-2000);else retractMessage(r,'chat','enter',at-2000);
 assert.equal(projectRoleMemory(r,at).facts.length,0);const before=JSON.stringify(r);
 add(r,'exit','回到现实。我是剪辑师。',at-1000);assert.deepEqual(projectRoleMemory(r,at).facts.map(f=>f.value),['剪辑师']);
 assert.ok(before.includes('我是国王'));assert.equal(r.chats.find(m=>m.id==='fiction')!.text,'我是国王。');
});

test('a late edited exit cannot retroactively turn an earlier fictional message into real identity',()=>{
 const {r}=fixture();add(r,'enter','我们来角色扮演。',at-4000);add(r,'fiction','我是国王。',at-3000);
 editMessage(r,'chat','enter','回到现实。',at-2000);assert.equal(projectRoleMemory(r,at).facts.length,0);
 add(r,'real','我是剪辑师。',at-1000);assert.deepEqual(projectRoleMemory(r,at).facts.map(f=>f.value),['剪辑师']);
});

test('a mention of an exit does not end roleplay, and a real exit only applies forward',()=>{
 const {r}=fixture();add(r,'enter','我们来角色扮演。',at-4000);add(r,'mention','我不想回到现实，我是国王。',at-3000);assert.equal(projectRoleMemory(r,at-2500).facts.length,0);
 add(r,'exit','我是国王，回到现实，我是剪辑师。',at-2000);assert.deepEqual(projectRoleMemory(r,at).facts.map(f=>f.value),['剪辑师']);
});

test('real prompt facts stay pinned without promoting guesses, theatre or another role',()=>{
 const {data,r}=fixture('我是剪辑师，不过我可能明天去纽约。');syncRoleMemory(r,at-4500);
 for(let i=0;i<45;i++)add(r,'filler'+i,'合成闲谈 '+i,at-4000+i,'char');
 r.play={id:'p',title:'戏',world:'虚构',char:'人物',user:'王',startedAt:at-1000,messages:[{id:'play-user',speaker:'me',text:'我是国王。',at:at-900}]};
 const before=JSON.stringify(data),context=buildNativeContext(data,r,'chat','继续聊聊',{nowTs:at});
 const facts=context.facts.filter(f=>f.id.startsWith('memory:'));assert.ok(facts.some(f=>f.text.includes('当前陈述：剪辑师')));assert.ok(!facts.some(f=>/纽约|国王/.test(f.text)));
 const wire=requestMessages(compileNativeConversation(data,r,'chat','继续聊聊',{nowTs:at}));assert.ok(wire.some(m=>m.role==='system'&&m.content.includes('当前陈述：剪辑师')));assert.equal(JSON.stringify(data),before);
 const other=createRole('合成角色','','记录员','谨慎','合成港口');other.id='other';other.chats=[];other.events=[];other.diaries=[];other.memory=structuredClone(r.memory);
 assert.equal(projectRoleMemory(other,at).facts.length,0);
 const next=structuredClone(r);next.chats=next.chats.filter(m=>m.id!=='source');assert.equal(projectRoleMemory(next,at).facts.length,0);
});

test('regenerated character claims never become user identity or keep mutual consent alive',()=>{
 const {r}=fixture('我们是朋友。');add(r,'reply','是的，我们是朋友。',at-4000,'char');syncRoleMemory(r,at-3000);
 assert.ok(projectRoleMemory(r,at-2000).facts.some(f=>f.mutual));assert.ok(prepareRegenerateReply(r,'chat','reply',at-1000).ok);
 add(r,'regenerated','我是医生。',at-500,'char');assert.ok(!projectRoleMemory(r,at).facts.some(f=>f.mutual||f.value==='医生'));
});
