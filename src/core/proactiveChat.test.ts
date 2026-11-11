import test from 'node:test';
import assert from 'node:assert/strict';
import {createRole} from './defaults';
import {claimProactive,proactiveTaskValid,finishProactive,recoverProactive} from './proactiveChat';
import {retractMessage} from './revisions';
const at=Date.parse('2026-11-03T20:00:00Z');
function fixture(id='a') {const r=createRole('合成角色','','修复师','不喜欢空聊','合成城');r.id=id;r.chats=[{id:'old-'+id,speaker:'char' as const,text:'先去处理那张残页。',at:at-3*86400000}];r.events=[{id:'life-'+id,kind:'life',title:'残页修复',detail:'残页纤维已确认备妥',at:at-3600000,source:'manual',lifeEvidence:'confirmed' as const,knownBy:[id],status:'active' as const}];r.diaries=[];r.firstMessageState={status:'ready',updatedAt:at-3*86400000};return r;}

test('idle role with an unsent verified topic gets one durable claim; reload never duplicates it',()=>{
 const r=fixture(),task=claimProactive([r],r,at,true)!;assert.ok(task);assert.equal(r.chats.length,1);assert.equal(task.status,'attempted');
 assert.equal(claimProactive([r],r,at+1000,true),null);
 const restored=JSON.parse(JSON.stringify(r));recoverProactive(restored);assert.equal(claimProactive([restored],restored,at+10000,true),null);
});

test('missing API, active user batch, scene and recent contact preclude an outreach claim',()=>{
 for(const variant of ['api','pending','scene','recent','no-topic']){const r=fixture();
  if(variant==='pending')r.chatTiming={version:1,focused:false,generation:0,pending:['pending'],quietUntil:at+10000};
  if(variant==='scene')r.scene={id:'s',where:'另一个现场',startedAt:at,messages:[]};
  if(variant==='recent')r.chats.push({id:'recent',speaker:'me',text:'稍等',at:at-1000});
  if(variant==='no-topic')r.events=[];
  assert.equal(claimProactive([r],r,at,variant!=='api'),null,variant);
 }
});

test('global budget permits only two attempts per rolling day, and role cooldown covers API failure/no-send',()=>{
 const roles=[fixture('a'),fixture('b'),fixture('c')];
 const a=claimProactive(roles,roles[0],at,true)!,b=claimProactive(roles,roles[1],at,true)!;assert.ok(a&&b);assert.equal(claimProactive(roles,roles[2],at,true),null);
 finishProactive(roles[0],a,'failed');finishProactive(roles[1],b,'skipped');
 assert.equal(claimProactive(roles,roles[0],at+3600000,true),null);
 assert.ok(claimProactive(roles,roles[2],at+86400001,true));
});

test('new user message, source edits and entering another stage invalidate a late outreach',t=>{
 t.mock.timers.enable({apis:['Date'],now:at});
 for(const change of ['new-message','source','scene','role']){const r=fixture(),task=claimProactive([r],r,at,true)!;assert.equal(proactiveTaskValid(r,task),true);
  if(change==='new-message')r.chats.push({id:'new',speaker:'me',text:'认真说件事',at:at+100});
  if(change==='source')r.events[0].status='retracted';
  if(change==='scene')r.scene={id:'s',where:'现场',startedAt:at+100,messages:[]};
  if(change==='role')r.id='other';
  assert.equal(proactiveTaskValid(r,task),false,change);
 }
});

test('a sent topic never repeats merely because the page reopened or three days passed',()=>{
 const r=fixture(),task=claimProactive([r],r,at,true)!;finishProactive(r,task,'sent');
 assert.equal(claimProactive([r],r,at+3*86400000,true),null);
});

import {parseProactiveReply} from './proactiveChat';
test('explicit no-send is not a fake message, and a foreign or malformed send decision is rejected',()=>{
 const r=fixture(),t=claimProactive([r],r,at,true)!;
 const result=parseProactiveReply('<elsewhere_contact>'+JSON.stringify({requestId:t.id,send:false})+'</elsewhere_contact>',t);
 assert.equal(result.send,false);assert.equal(result.text,'');assert.equal(r.chats.length,1);
 for(const raw of ['你好','<elsewhere_contact>{"requestId":"wrong","send":true}</elsewhere_contact>','<elsewhere_contact>{}</elsewhere_contact>'])assert.throws(()=>parseProactiveReply(raw,t));
});

import {recordProactiveDelivery} from './proactiveChat';
test('one publicly delivered bubble consumes its topic even if a new user input cancels the rest',()=>{
 const r=fixture(),t=claimProactive([r],r,at,true)!;finishProactive(r,t,'queued');recordProactiveDelivery(r,t);
 r.chats.push({id:'first-delivered',speaker:'char',text:'先说材料的事。',at,replyTurnId:t.id,proactive:true});
 r.chats.push({id:'interrupt',speaker:'me',text:'等一下',at:at+100});finishProactive(r,t,'cancelled');
 assert.equal(claimProactive([r],r,at+86400001,true),null);
});
