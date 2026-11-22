import test from 'node:test';
import assert from 'node:assert/strict';
import {createRole,defaults} from './defaults';
import {archiveMeeting} from './meetingHistory';
import {buildNativeContext,compileNativeConversation} from './prompt';
import {requestMessages} from './conversationPrompt';
import {roleCurrentState} from './roleMemoryView';
import type {EventRecord} from './types';
import type {RoleLifePlan} from './lifeExecution';

const at=Date.parse('2026-11-22T02:25:00Z');
function fixture() {
 const data=defaults(),r=createRole('年轻巡警','','新人警察','克制','浣熊市');r.id='young';
 r.chats=[{id:'before-phone',speaker:'char',text:'我们约好去看电影。',at:at-5*3600000}];
 r.events=[];r.diaries=[];r.meetings=[];
 r.scene={id:'date-home',where:'Lin家',startedAt:at-3*3600000,messages:[
  {id:'s1',speaker:'char',text:'我们没有看电影，而是在家里抱着睡了两个小时。',at:at-2*3600000},
  {id:'s2',speaker:'char',text:'我送你去见朋友，车停在了日落大道边上。',at:at-600000},
  {id:'s3',speaker:'me',text:'我拉开车门，在日落大道下车了。',at:at-590000},
  {id:'private',speaker:'me',text:'我心想或许见的是另一个Leon。',at:at-580000},
 ]};
 data.roles=[r];data.selected=r.id;
 return {r,data};
}
function wire(f:ReturnType<typeof fixture>) {
 return requestMessages(compileNativeConversation(f.data,f.r,'chat','嘿嘿，准备吃烧烤！',{nowTs:at+1000})).map(m=>m.content).join('\n');
}
test('a concluded real encounter informs a new unrelated SMS, including the public drop-off action',()=>{
 const f=fixture();assert.ok(archiveMeeting(f.r,at,()=>true));
 const text=wire(f);
 assert.match(text,/电影，而是在家里抱着睡了两个小时/);
 assert.match(text,/我拉开车门，在日落大道下车了/);
 assert.match(text,/Scene=date-home/);
 assert.doesNotMatch(text,/我心想或许见的是另一个Leon/);
 assert.match(text,/不得把原计划编成已经看过的电影/);
 const c=buildNativeContext(f.data,f.r,'chat','准备吃烧烤！',{nowTs:at+1000});
 assert.ok(c.native?.memoryTrace?.some(t=>t.id==='meeting:date-home'&&t.sourceIds.includes('s3')));
 assert.equal(roleCurrentState(f.r,at+1000).kind,'recent');
 assert.match(text,/当前活动和地点未确认/);
 const other=createRole('另一只Leon','','政府特工','','华盛顿特区');other.id='older';other.chats=[];other.events=[];other.diaries=[];
 const otherData=defaults();otherData.roles=[other];assert.doesNotMatch(requestMessages(compileNativeConversation(otherData,other,'chat','吃烧烤',{nowTs:at+1000})).map(m=>m.content).join('\n'),/日落大道下车/);
});
test('archiving a real encounter expires outdated future simulation, preserving completed history',()=>{
 const f=fixture(),r=f.r;
 r.lifePlans=[{intents:[{status:'pending',notBefore:at+60000,expiresAt:at+3600000,durationMinutes:10},{status:'completed',notBefore:at-86400000,expiresAt:at-70000000,durationMinutes:10}]}] as unknown as RoleLifePlan[];
 r.events=[{id:'future',lifeRecord:{until:at+3600000,timeline:{state:'pending',from:at+60000,to:at+3600000}}},{id:'past',kind:'life',title:'已完成过去活动',at:at-86400000}] as unknown as EventRecord[];
 const before=JSON.stringify(r);
 assert.throws(()=>archiveMeeting(r,at,()=>false),/保存失败/);
 assert.equal(JSON.stringify(r),before,'failed save must restore the exact original scene and schedule');
 assert.ok(archiveMeeting(r,at,()=>true));
 assert.equal(r.lifePlans![0].intents[0].status,'expired');
 assert.equal(r.lifePlans![0].intents[1].status,'completed');
 assert.equal(r.events.find(e=>e.id==='future')?.lifeRecord?.timeline?.state,'expired');
 assert.ok(r.events.some(e=>e.id==='past'));
 assert.equal(r.meetings![0].messages.find(m=>m.id==='s3')?.text,'我拉开车门，在日落大道下车了。');
});
