import test from 'node:test';
import assert from 'node:assert/strict';
import {createRole,defaults} from './defaults';
import {buildNativeContext,compileNativeConversation} from './prompt';
import {requestMessages} from './conversationPrompt';
import {estimateTextTokens} from './contextBudget';
import {experienceContext} from './roleExperience';

const at=Date.parse('2026-11-22T02:25:00Z');
function fixture(){
 const data=defaults(),r=createRole('合成巡警','','新人警察','克制','现代城市');
 r.id='young-officer';r.chats=[];r.events=[];r.diaries=[];
 r.meetings=[{id:'real-date',where:'Lin的家',startedAt:at-3*3600000,endedAt:at-30*60000,messages:Array.from({length:119},(_,i)=>({
  id:'scene-'+i,speaker:'char' as const,at:at-3*3600000+i*60000,
  text:i===59?'那天原本要一起看电影，但电影没有看，我们相拥睡了两个小时。'
   :i===117?'我把外套拉链给你拉好，虽然舍不得你走，还是送你去见朋友。'
   :'现场第'+i+'次交流：我们在房间里说话。',
 }))}];
 r.chats=[{id:'old-plan',speaker:'char',text:'明天一起去看电影吧。',at:at-26*3600000},{id:'last-input',speaker:'me',text:'嘿嘿，准备去吃烧烤！',at:at-10*60000}];
 data.roles=[r];data.selected=r.id;
 return {data,r};
}
const wire=(f:ReturnType<typeof fixture>,time=at,query='准备去吃烧烤！')=>
 requestMessages(compileNativeConversation(f.data,f.r,'chat',query,{nowTs:time})).map(m=>m.content).join('\n');

test('unrelated post-meeting SMS still receives actual 119-round meeting, not only the old movie plan',()=>{
 const f=fixture(),before=JSON.stringify(f),prompt=wire(f);
 assert.match(prompt,/Scene=real-date/);
 assert.match(prompt,/电影没有看，我们相拥睡了两个小时/);
 assert.match(prompt,/我把外套拉链给你拉好/);
 assert.match(prompt,/约定.*并不证明后来真的完成/);
 assert.equal(JSON.stringify(f),before);
 const context=buildNativeContext(f.data,f.r,'chat','准备去吃烧烤！',{nowTs:at});
 assert.ok(context.native?.memoryTrace?.some(t=>t.id==='meeting:real-date'&&t.sourceIds.some(id=>id.startsWith('scene-'))));
});

test('meeting anchor is bounded and uses only original role-scoped messages',()=>{
 const f=fixture(),facts=experienceContext(f.r,'烧烤',at,new Set(),{phoneRelevantOnly:true}).facts;
 assert.equal(facts.filter(x=>x.id==='meeting:real-date').length,1);
 assert.ok(estimateTextTokens(facts.map(x=>x.text).join('\n'))<=1000);
 assert.ok(facts.every(x=>!x.text.includes('OTHER_PERSON_SECRET')));
 assert.ok(facts.some(x=>x.text.includes('角色原文')));
});

test('old unrelated scenes do not crowd fresh texts, but explicit recollection can retrieve them',()=>{
 const f=fixture(),month=at+31*86400000;
 assert.ok(!wire(f,month,'今天吃什么？').includes('Scene=real-date'));
 assert.ok(wire(f,month,'还记得上次在Lin家见面的事吗？').includes('Scene=real-date'));
});

test('do not fabricate a meeting when only a future movie invitation exists',()=>{
 const f=fixture();f.r.meetings=[];
 assert.ok(!wire(f).includes('Scene=real-date'));
});
