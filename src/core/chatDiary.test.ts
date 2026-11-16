import test from 'node:test';
import assert from 'node:assert/strict';
import {createRole,defaults} from './defaults';
import {buildCharacterDiaryPrompt,applyGeneratedCharacterDiary,getLocalDayBounds} from './diary';
import {buildNativeContext} from './prompt';
import {diaryEvidenceValid} from './diaryEvidence';
import {createHash} from 'node:crypto';
import {diaryFingerprint} from './diaryFingerprint';
import {personalDiaries} from './roleLife';

const day='2026-11-02',at=getLocalDayBounds(day).endMs;
function fixture(){const r=createRole('合成档案修复师','','档案修复师','克制、固执，不喜欢谈私事','浮桥城');r.id='self';r.chats=[];r.events=[];r.diaries=[];r.profile='一直在研究一册褪色的航路图，和师姐在修复办法上存在分歧。';r.canonNotes='地图尚未修好，不能假定师姐已同意。';r.preset=null;return r;}

test('diary source projection bounds heavy phone transcripts and keeps both sides as attributed speech',()=>{
 const r=fixture();for(let i=0;i<120;i++)r.chats.push({id:'chat'+i,speaker:i%2?'char':'me',text:'UNIQUE_PHONE_'+i+' '+ '长话'.repeat(120),at:at-200000+i});
 const prompt=buildCharacterDiaryPrompt(r,defaults().user,day),wire=JSON.stringify(prompt.messages);
 assert.equal(prompt.facts.summary.chatCount,120);
 assert.ok(wire.length<12000,'daily chat must not dominate the diary');
 assert.ok(!wire.includes('目标长度约 1,000'));assert.ok(!wire.includes('第一优先：'+day+' 当天你与'));
 assert.ok(wire.includes('UNIQUE_PHONE_119'));assert.ok(wire.includes('未解决'));
});

test('late or duplicate diary completion cannot overwrite an already archived diary',()=>{
 const r=fixture();assert.ok(applyGeneratedCharacterDiary(r,day,'原有私人日记。',at+1000).ok);
 const before=structuredClone(r);const second=applyGeneratedCharacterDiary(r,day,'迟到覆盖。',at+2000);
 assert.equal(second.ok,false);assert.deepEqual(r,before);
});

test('unproven life projections are not promoted to confirmed diary facts',()=>{
 const r=fixture();r.events=[{id:'guess',kind:'life',title:'猜测',detail:'UNVERIFIED_LIFE',at:at-5000,status:'active'}, {id:'private',kind:'life',title:'玩家观察',detail:'USER_ONLY',at:at-4000,source:'observation',knownBy:['user']}];
 const wire=JSON.stringify(buildCharacterDiaryPrompt(r,defaults().user,day).messages);
 assert.ok(!wire.includes('UNVERIFIED_LIFE'));assert.ok(!wire.includes('USER_ONLY'));
});

test('phone context uses trusted own life even for an unrelated user question without exposing other actors or inferred monitor notes',()=>{
 const r=fixture(),data=defaults();data.roles=[r];r.events=[
 {id:'confirmed',kind:'life',title:'修复材料',detail:'SELF_LIFE_FIBRE',at:at-1000,source:'manual',lifeEvidence:'confirmed',knownBy:[r.id]},
 {id:'guess',kind:'life',title:'猜测',detail:'MONITOR_GUESS',at:at-1000,source:'ai_enriched',knownBy:[r.id]},
 ];const before=structuredClone(r),wire=JSON.stringify(buildNativeContext(data,r,'chat','我今天吃了什么',{nowTs:at}));
 assert.ok(wire.includes('SELF_LIFE_FIBRE'));assert.ok(!wire.includes('MONITOR_GUESS'));assert.deepEqual(r,before);
});

test('diary prompt records rendered sources rather than every message on that day',()=>{
 const r=fixture();
 for(let i=0;i<20;i++)r.chats.push({id:'basis-'+i,speaker:'me',text:'普通合成对白 '+i,at:at-40_000+i});
 const {evidence,messages}=buildCharacterDiaryPrompt(r,defaults().user,day);
 const rendered=messages.map(m=>m.content).join('\n');
 assert.ok(rendered.includes('普通合成对白 19'));
 assert.ok(evidence.sources.some(s=>s.kind==='message'&&s.id==='basis-19'));
 assert.ok(!evidence.sources.some(s=>s.id==='basis-0'));
});

test('archival checks original inputs while later unrelated same-day facts stay separate',()=>{
 const r=fixture(),user=defaults().user,cutoff=at-40_000;
 r.chats.push({id:'used',speaker:'me',text:'我把书放在木架上。',at:cutoff-1000});
 const {evidence}=buildCharacterDiaryPrompt(r,user,day,'',cutoff);
 r.chats.push({id:'later-chat',speaker:'char',text:'有一本新书。',at:cutoff-500});
 r.events.push({id:'new-life',kind:'life',title:'合成补录',detail:'整理房间。',at:cutoff-600,source:'fixture',lifeEvidence:'confirmed',knownBy:[r.id]});
 r.personalThreads=[{id:'next',key:'next',roleId:r.id,kind:'concern',text:'无关关注',at:cutoff-800,status:'open',shareable:false,sources:[],origin:'model-private',requestId:'next'}];
 assert.equal(diaryEvidenceValid(r,evidence,at,user),true);
 const {diary}=applyGeneratedCharacterDiary(r,day,'合成日记内容。',at,cutoff,undefined,evidence);
 assert.deepEqual(diary?.sourceMessageIds,['used']);
 assert.deepEqual(diary?.sourceEventIds,[]);
 assert.deepEqual(personalDiaries(r,at).map(entry=>entry.id),[diary?.id]);
 r.events.push({id:'no-access',kind:'chat',title:'知情撤回',detail:'',at:at-3,messageId:'used',knownBy:['another-role']});
 assert.equal(diaryEvidenceValid(r,evidence,at,user),false);
 assert.deepEqual(personalDiaries(r,at),[]);
});

test('editing, withdrawing and explicitly correcting an original basis invalidates the receipt',()=>{
 const r=fixture(),user=defaults().user,cutoff=at-40_000;
 r.chats.push({id:'assertion',speaker:'me',text:'我是医生。',at:cutoff-1000});
 const {evidence}=buildCharacterDiaryPrompt(r,user,day,'',cutoff);
 assert.equal(diaryEvidenceValid(r,evidence,at,user),true);
 const edited=structuredClone(r);
 Object.assign(edited.chats[0],{text:'我是编辑。',revisionCount:1,editedAt:cutoff+1000});
 assert.equal(diaryEvidenceValid(edited,evidence,at,user),false);
 const withdrawn=structuredClone(r);
 withdrawn.chats[0].status='retracted';
 assert.equal(diaryEvidenceValid(withdrawn,evidence,at,user),false);
 r.chats.push({id:'correction',speaker:'me',text:'我刚才是在开玩笑，我不是医生。',at:cutoff+1000});
 assert.equal(diaryEvidenceValid(r,evidence,at,user),false);
 const fresh=buildCharacterDiaryPrompt(r,user,day,'',cutoff);
 assert.doesNotMatch(fresh.messages.map(m=>m.content).join('\n'),/我是医生/);
 assert.equal(diaryEvidenceValid(r,fresh.evidence,at,user),true);
});

test('a quoted or explicitly shared source cannot be archived after the source is withdrawn',()=>{
 const r=fixture(),user=defaults().user,cutoff=at-40_000;
 r.chats.push({id:'first',speaker:'me',text:'一张草图',at:cutoff-8000},
  {id:'quote',speaker:'char',text:'我要补上这张图。',at:cutoff-7000,quote:{id:'first',speaker:'me',text:'一张草图',at:cutoff-8000}});
 r.diaries.push({id:'shared',speaker:'me',text:'只告诉你的备忘。',at:cutoff-5000,sharedWith:[r.id],sharedAt:{[r.id]:cutoff-4500}});
 const {evidence}=buildCharacterDiaryPrompt(r,user,day,'',cutoff);
 assert.ok(evidence.sources.some(s=>s.kind==='shared-diary'&&s.id==='shared'));
 assert.equal(diaryEvidenceValid(r,evidence,at,user),true);
 const unshared=structuredClone(r);unshared.diaries[0].sharedWith=[];
 assert.equal(diaryEvidenceValid(unshared,evidence,at,user),false);
 r.chats[0].status='retracted';
 assert.equal(diaryEvidenceValid(r,evidence,at,user),false);
});

test('archived evidence excludes source text outside the rendered excerpt',()=>{
 const r=fixture(),user=defaults().user;
 const secret='UNSENT_PRIVATE_TAIL';
 r.chats.push({id:'basis',speaker:'me',text:'合'.repeat(350)+secret,at:at-1_000});
 const {evidence,messages}=buildCharacterDiaryPrompt(r,user,day);
 assert.doesNotMatch(messages.map(m=>m.content).join('\n'),new RegExp(secret));
 const {diary}=applyGeneratedCharacterDiary(r,day,'公开验收合成正文。',at+1000,Infinity,undefined,evidence);
 assert.doesNotMatch(JSON.stringify(diary),new RegExp(secret));
});

test('synchronous diary fingerprints match SHA-256 across ASCII, multibyte and padding boundaries',()=>{
 for(const value of ['',null,'a'.repeat(53),'a'.repeat(54),'a'.repeat(55),'新来源'.repeat(120),['source',42]]){
  assert.equal(diaryFingerprint(value),createHash('sha256').update(JSON.stringify(value)).digest('hex'));
 }
});
