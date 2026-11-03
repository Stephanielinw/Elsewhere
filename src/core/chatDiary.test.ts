import test from 'node:test';
import assert from 'node:assert/strict';
import {createRole,defaults} from './defaults';
import {buildCharacterDiaryPrompt,applyGeneratedCharacterDiary,getLocalDayBounds} from './diary';
import {buildNativeContext} from './prompt';

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
