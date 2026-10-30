import test from 'node:test';
import assert from 'node:assert/strict';
import {createRole} from './defaults';
import {editMessage,retractMessage,getActiveEvents,getActiveMessages} from './revisions';

for (const action of ['edit','retract'] as const) {
  test(`${action} archives directly linked replies and keeps later turns`,()=>{
    const role=createRole('合成角色','A','职业','性格','地点');
    role.chats=[
      {id:'u1',speaker:'me',text:'旧发言',at:1,status:'active'},
      {id:'c1',speaker:'char',text:'旧关联回复',at:2,status:'active',replyTo:'u1'},
      {id:'u2',speaker:'me',text:'后续发言',at:3,status:'active'},
      {id:'c2',speaker:'char',text:'后续回复',at:4,status:'active',replyTo:'u2'},
    ];
    role.events=[{id:'event1',kind:'chat',title:'角色说过',detail:'旧关联回复',at:2,status:'active',messageId:'c1',knownBy:[role.id]}];
    const result=action==='edit'?editMessage(role,'chat','u1','修改后发言',5):retractMessage(role,'chat','u1',5);
    assert.ok(result.ok);
    assert.equal(role.chats.find(m=>m.id==='c1')?.status,'retracted');
    assert.equal(getActiveEvents(role.events).length,0);
    assert.deepEqual(getActiveMessages(role.chats).filter(m=>m.id==='u2'||m.id==='c2').map(m=>m.id),['u2','c2']);
    assert.ok(role.messageRevisions?.some(rev=>rev.targetMessageId==='c1' && rev.previousText==='旧关联回复'));
  });
}

import {defaults} from './defaults';
import {buildRegenerationPlan} from './regeneration';

test('historical regeneration uses a bounded context and leaves live history unchanged',()=>{
  const data=defaults(),role=createRole('合成角色','A','职业','性格','地点');data.roles=[role];
  role.chats=[{id:'opening',speaker:'char',text:'开场',at:1},{id:'u1',speaker:'me',text:'第一轮真实输入',at:2},{id:'c1',speaker:'char',text:'第一轮旧回复',at:3,replyTo:'u1'},{id:'u2',speaker:'me',text:'FUTURE_CHAT',at:4},{id:'c2',speaker:'char',text:'FUTURE_REPLY',at:5,replyTo:'u2'}];
  role.events=[{id:'future',kind:'chat',title:'角色说过',detail:'FUTURE_MEMORY',at:4}];
  data.sharedTasks={ddl:[],todo:[{id:'future-task',text:'FUTURE_TASK',done:false,at:5}]};
  const before=JSON.stringify(role),plan=buildRegenerationPlan(data,role,'chat','c1');
  assert.ok(plan);const payload=JSON.stringify(plan.messages);
  assert.ok(payload.includes('第一轮真实输入'));for(const marker of ['FUTURE_CHAT','FUTURE_REPLY','FUTURE_MEMORY','FUTURE_TASK','第一轮旧回复'])assert.ok(!payload.includes(marker));
  assert.equal(plan.messages.at(-1)?.role,'user');assert.equal(JSON.stringify(role),before);
});

test('opening regeneration uses the dedicated opening prompt without later chat',()=>{
  const data=defaults(),role=createRole('合成角色','A','职业','性格','地点');data.roles=[role];
  role.chats=[{id:'first',speaker:'char',text:'旧开场',at:1},{id:'later',speaker:'me',text:'FUTURE_USER',at:2}];
  const plan=buildRegenerationPlan(data,role,'chat','first');assert.ok(plan);
  const payload=JSON.stringify(plan.messages);assert.ok(payload.includes('第一条手机消息'));assert.ok(!payload.includes('FUTURE_USER'));assert.equal(role.chats[0].status,undefined);
});

test('a linked reply cannot be regenerated from an unrelated later user message',()=>{
  const data=defaults(),role=createRole('合成角色','A','职业','性格','地点');data.roles=[role];
  role.chats=[{id:'old',speaker:'me',text:'旧问题',at:1,status:'retracted'},{id:'new',speaker:'me',text:'新问题',at:2},{id:'answer',speaker:'char',text:'旧回答',at:3,replyTo:'old'}];
  assert.equal(buildRegenerationPlan(data,role,'chat','answer'),null);assert.equal(role.chats[2].status,undefined);
});

import {startReplyTask} from './replyTask';

test('reply tasks bind role, source revision, session and generation',()=>{
  const a=createRole('角色A','A','职业','性格','地点'),b=createRole('角色B','B','职业','性格','地点');
  const roles=[a,b],generations=new Map<string,number>();
  const message={id:'u',speaker:'me' as const,text:'真实输入',at:1,status:'active' as const};a.chats=[message];
  const first=startReplyTask(()=>roles,generations,a,'chat',message);assert.equal(first(),true);
  const next=startReplyTask(()=>roles,generations,a,'chat',message);assert.equal(first(),false);assert.equal(next(),true);
  assert.equal(editMessage(a,'chat','u','修改后的输入',2).ok,true);assert.equal(next(),false);
  const edited=startReplyTask(()=>roles,generations,a,'chat',message);assert.equal(edited(),true);
  assert.equal(retractMessage(a,'chat','u',3).ok,true);assert.equal(edited(),false);
  const sceneMessage={id:'s',speaker:'me' as const,text:'见面',at:4};a.scene={id:'scene',where:'地点',startedAt:1,messages:[sceneMessage]};
  const scene=startReplyTask(()=>roles,generations,a,'scene',sceneMessage);assert.equal(scene(),true);
  a.scene={id:'new-scene',where:'地点',startedAt:2,messages:[sceneMessage]};assert.equal(scene(),false);
  const bMessage={id:'u-b',speaker:'me' as const,text:'B 输入',at:5};b.chats=[bMessage];
  const bTask=startReplyTask(()=>roles,generations,b,'chat',bMessage);assert.equal(bTask(),true);roles.splice(1,1);assert.equal(bTask(),false);
});
