import test from 'node:test';
import assert from 'node:assert/strict';
import {createRole,defaults} from './defaults';
import {editMessage,retractMessage} from './revisions';
import {eventSourceValid,projectRoleMemory} from './memory';
import {collectRoleLife,personalDiaries} from './roleLife';
import {buildNativeContext,compileNativeConversation} from './prompt';
import {createLiveNovelContext} from './novelContext';
import {requestMessages} from './conversationPrompt';
import {applyGeneratedCharacterDiary,collectDailyDiaryFacts,toLocalDateKey} from './diary';
import {sceneMessagesAt,stageMessagesAt} from './messageProvenance';
import type {ChatMessage,EventRecord} from './types';

const at=new Date(2026,9,20,12).getTime();
const phone=(id:string,text:string,time=at):ChatMessage=>({id,text,at:time,speaker:'me',kind:'chat'});
function fixture(){
 const r=createRole('合成记录员','','馆员','专注','合成港口'),data=defaults();
 r.id='same-role';data.roles=[r];
 r.chats=[phone('source','我的职业是合成摄影师。')];
 r.scene={id:'scene',startedAt:at,where:'合成地点',messages:[{...r.chats[0],id:'bridge',sourceMessageId:'source',kind:'scene'}]};
 return {r,data};
}

test('same-ID originals cannot authorize another role or world’s bridge; rename keeps valid own sources',()=>{
 const a=fixture(),b=fixture();
 b.r.id='different-role';b.r.chats[0].text='不同角色来源';
 assert.deepEqual(sceneMessagesAt(b.r,a.r.scene!.messages,at),[]);
 b.r.id=a.r.id;b.data.roles=[b.r];
 assert.deepEqual(sceneMessagesAt(b.r,b.r.scene!.messages,at),[]);
 a.r.name='改名后的同一人';
 assert.deepEqual(sceneMessagesAt(a.r,a.r.scene!.messages,at).map(m=>m.id),['bridge']);
});

test('quotes require active original text within the owning scope and at the time quoted',()=>{
 const a=phone('a','合成引用'),b={...phone('b','正文',at+1000),quote:{id:'a',speaker:'me' as const,text:a.text,at}};
 assert.equal(stageMessagesAt([a,b],at+2000)[1].quote?.text,a.text);
 const later={...a,text:'较晚修订',revisionCount:1,editedAt:at+1500};
 assert.equal(stageMessagesAt([later,{...b,quote:{...b.quote,text:later.text}}],at+2000)[1].quote,null);
 assert.equal(stageMessagesAt([b],at+2000)[0].text,b.text);
 assert.equal(stageMessagesAt([b],at+2000)[0].quote,null);
 assert.equal(stageMessagesAt([a,b],at+999).length,1);
});

test('revisions remove only linked facts; independent life and unlinked reply remain present',()=>{
 const {r,data}=fixture(),before=r.chats[0].text;
 const independent:EventRecord={id:'independent',kind:'life',title:'已完成独立活动',detail:before,at,source:'manual',lifeEvidence:'confirmed',knownBy:[r.id]};
 const linked:EventRecord={...independent,id:'linked',kind:'chat',messageId:'bridge',sourceRevision:0};
 const otherReply:ChatMessage={id:'independent-reply',speaker:'char',text:'已完成独立准备',at:at+100};
 r.events=[independent,linked];r.chats.push(otherReply);
 editMessage(r,'chat','source','我的职业是合成馆员。',at+1000);
 assert.equal(independent.status,undefined);
 assert.ok(!eventSourceValid(r,linked,at+2000));
 assert.ok(collectRoleLife(r,at+2000).events.includes(independent));
 assert.ok(projectRoleMemory(r,at+2000).facts.some(f=>f.value==='合成馆员'));
 assert.ok(!projectRoleMemory(r,at+500).facts.some(f=>f.value==='合成馆员'||f.value==='合成摄影师'));
 assert.equal(r.chats[1],otherReply);
 const wire=requestMessages(compileNativeConversation(data,r,'chat','准备',{nowTs:at+2000}));
 assert.ok(wire.some(m=>m.content.includes(otherReply.text)));
});

test('an independent Scene edit remains after the phone original is withdrawn in native and fruit contexts',()=>{
 const {r,data}=fixture();
 editMessage(r,'scene','bridge','独立现场新正文',at+500);
 retractMessage(r,'chat','source',at+1000);
 const context=buildNativeContext(data,r,'scene','',{nowTs:at+2000});
 assert.ok(context.history.some(m=>m.text==='独立现场新正文'));
 const fruit=createLiveNovelContext(data,r,'scene',context);
 assert.ok(fruit.history.some(m=>m.text.includes('独立现场新正文')));
 assert.ok(!JSON.stringify(fruit).includes('合成摄影师'));
});

test('archived diary with real and rehearsal provenance is usable only while its sources are effective',()=>{
 const {r}=fixture(),date=toLocalDateKey(at);
 r.scene=null;r.plays=[{id:'play',title:'合成演出',world:'架空',user:'观众',char:'馆员',startedAt:at,endedAt:at+3000,messages:[{id:'fiction',speaker:'char',text:'合成戏剧片段',at:at+1000,kind:'play'}]}];
 const finished=at+36*3600000;
 const d=applyGeneratedCharacterDiary(r,date,'混合来源的合成日记。',finished).diary!;
 assert.deepEqual(d.sourceMessageIds,['source','fiction']);
 assert.equal(personalDiaries(r,finished-1).length,0);
 assert.equal(personalDiaries(r,finished+1)[0],d);
 const original=structuredClone(d);
 retractMessage(r,'chat','source',finished+2);
 assert.equal(personalDiaries(r,finished+3).length,0);
 assert.deepEqual(r.diaries[0],original);
 assert.deepEqual(collectDailyDiaryFacts(r,date,true).sourceMessageIds,['fiction']);
});
