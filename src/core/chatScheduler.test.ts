import test from 'node:test';
import assert from 'node:assert/strict';
import {createRole} from './defaults';
import {enqueueChat,prepareChatDue,claimChatBatch,completeChatBatch,failChatBatch,recoverChatTiming,retryChatTiming,chatBatchValid,chatTiming,setChatFocused} from './chatScheduler';
import {editMessage,retractMessage} from './revisions';
const fixture=()=>{const r=createRole('合成角色','A','职业','自然','地点');r.chats=[];r.events=[];return r;};
function send(r:ReturnType<typeof fixture>,id:string,at:number){r.chats.push({id,speaker:'me',text:id,at,status:'active'});enqueueChat(r,id,at);}

test('hot mode dispatches at the silence boundary without invoking the natural-delay callback',()=>{
 const r=fixture();setChatFocused(r,true);send(r,'A',0);send(r,'B',35000);let calls=0;
 prepareChatDue(r,94999,()=>{calls++;return 999999;});assert.equal(claimChatBatch(r,94999,true),null);
 prepareChatDue(r,95000,()=>{calls++;return 999999;});assert.deepEqual(claimChatBatch(r,95000,true)?.sources.map(m=>m.id),['A','B']);assert.equal(calls,0);
});
test('switching modes reevaluates pending deadlines without changing the in-flight batch or losing inputs',()=>{
 const r=fixture();send(r,'A',0);prepareChatDue(r,60000,()=>200000);setChatFocused(r,true);prepareChatDue(r,70000,()=>99999);
 const batch=claimChatBatch(r,70000,true)!;assert.ok(batch);send(r,'B',71000);setChatFocused(r,false);prepareChatDue(r,131000,()=>10000);
 assert.equal(chatTiming(r).replyDueAt,141000);assert.equal(claimChatBatch(r,141000,true),null);assert.equal(chatBatchValid(r,batch),true);completeChatBatch(r,batch);
 assert.deepEqual(claimChatBatch(r,141000,true)?.sources.map(m=>m.id),['B']);
});

test('60 second quiet period restarts for every message; duplicate enqueues do not duplicate a batch',()=>{
 const r=fixture();for(let i=0;i<5;i++)send(r,'m'+i,i*10000);
 assert.equal(prepareChatDue(r,99999,()=>5000),false);assert.equal(chatTiming(r).replyDueAt,undefined);
 prepareChatDue(r,100000,()=>5000);assert.equal(chatTiming(r).replyDueAt,105000);
 enqueueChat(r,'m4',40000);assert.equal(claimChatBatch(r,104999,true),null);
 const batch=claimChatBatch(r,105000,true);assert.ok(batch);assert.deepEqual(batch.sources.map(m=>m.id),['m0','m1','m2','m3','m4']);assert.equal(claimChatBatch(r,105000,true),null);
});
test('new messages retain the scheduled deadline and extend it only beyond their quiet period',()=>{
 const r=fixture();send(r,'A',0);send(r,'B',40000);prepareChatDue(r,100000,()=>200000);assert.equal(chatTiming(r).replyDueAt,300000);
 send(r,'C',180000);assert.equal(claimChatBatch(r,240000,true),null);assert.equal(chatTiming(r).replyDueAt,300000);
 send(r,'D',290000);assert.equal(claimChatBatch(r,300000,true),null);
 assert.deepEqual(claimChatBatch(r,350000,true)?.sources.map(m=>m.id),['A','B','C','D']);
});
test('messages during a request form the next batch and valid completion consumes only its own sources',()=>{
 const r=fixture();send(r,'A',0);prepareChatDue(r,60000,()=>0);const a=claimChatBatch(r,60000,true)!;
 send(r,'B',61000);assert.equal(claimChatBatch(r,122000,true),null);assert.equal(completeChatBatch(r,a),true);
 prepareChatDue(r,122000,()=>0);assert.deepEqual(claimChatBatch(r,122000,true)?.sources.map(m=>m.id),['B']);assert.equal(completeChatBatch(r,a),false);
});
test('missing API and failed responses keep messages; retry and reload never silently duplicate an interrupted generation',()=>{
 const r=fixture();send(r,'A',0);prepareChatDue(r,60000,()=>0);assert.equal(claimChatBatch(r,60000,false),null);assert.deepEqual(chatTiming(r).pending,['A']);
 const batch=claimChatBatch(r,60000,true)!;failChatBatch(r,batch,'失败');assert.equal(claimChatBatch(r,70000,true),null);
 retryChatTiming(r);const retried=claimChatBatch(r,70000,true)!;assert.ok(retried);assert.notEqual(retried.id,batch.id);
 const restored=JSON.parse(JSON.stringify(r));recoverChatTiming(restored);assert.deepEqual(chatTiming(restored).pending,['A']);assert.equal(claimChatBatch(restored,90000,true),null);
 retryChatTiming(restored);assert.ok(claimChatBatch(restored,90000,true));
});
test('edits, retractions and scene changes invalidate late results without accepting other roles',()=>{
 for(const change of ['edit','retract','scene']){const r=fixture();send(r,'A',0);prepareChatDue(r,60000,()=>0);const batch=claimChatBatch(r,60000,true)!;
 if(change==='edit')editMessage(r,'chat','A','changed',61000);if(change==='retract')retractMessage(r,'chat','A',61000);if(change==='scene')r.scene={id:'scene',startedAt:61000,where:'地点',messages:[]};
 assert.equal(chatBatchValid(r,batch),false,change);assert.equal(completeChatBatch(r,batch),false,change);
 }
});

import {buildChatBatchMessages,readChatResponse} from './chatBatchPrompt';
import {defaults} from './defaults';
test('batch Prompt preserves ID, true timestamp, order and quote per message, excluding next-batch text',()=>{
 const data=defaults(),r=fixture();data.roles=[r];send(r,'first',1000);send(r,'second',2000);r.chats[1].quote={id:'ref',speaker:'char',text:'引用原文',at:500};prepareChatDue(r,62000,()=>0);const batch=claimChatBatch(r,62000,true)!;
 send(r,'next-batch',63000);const messages=buildChatBatchMessages(data,r,batch,64000),text=JSON.stringify(messages);
 assert.ok(!text.includes('next-batch'));const users=messages.filter(m=>m.role==='user');assert.equal(users.length,2);
 assert.ok(users[0].content.includes('first')&&users[0].content.includes('1970-01-01T00:00:01.000Z'));assert.ok(users[1].content.includes('second')&&users[1].content.includes('1970-01-01T00:00:02.000Z')&&users[1].content.includes('引用原文'));
 assert.equal(messages.at(-1)?.role,'user');
});
test('chat response failures never masquerade as successful text',async()=>{
 const good={choices:[{message:{role:'assistant',content:'  真实正文  '},finish_reason:'stop'}]};assert.equal(await readChatResponse(new Response(JSON.stringify(good))),'真实正文');
 for(const body of [{error:{message:'private'}},{choices:[{message:{role:'error',content:'technical error'},finish_reason:'stop'}]},{choices:[{message:{role:'assistant',content:'',reasoning_content:'only thinking'},finish_reason:'stop'}]},{choices:[{message:{role:'assistant',content:'partial'},finish_reason:'length'}]}])await assert.rejects(readChatResponse(new Response(JSON.stringify(body))));
 await assert.rejects(readChatResponse(new Response('broken')));await assert.rejects(readChatResponse(new Response('{}',{status:503})));
});

test('retracting one aggregated source invalidates generated bubbles and their events but preserves revision evidence',()=>{
 const r=fixture();send(r,'A',0);send(r,'B',1000);r.chats.push({id:'reply',speaker:'char',text:'已作废的答复',at:2,replyTo:'B',replySourceIds:['A','B'],replyTurnId:'turn',status:'active'});r.events.push({id:'event',kind:'chat',title:'角色说过',detail:'已作废的答复',at:2,messageId:'reply',status:'active'});
 r.pendingReplies=[{id:'outbox',replyTo:'B',replyTurnId:'turn',bubbles:['迟到气泡'],dueAt:999999,sources:structuredClone(r.chats.filter(m=>m.speaker==='me'))}];
 retractMessage(r,'chat','A',3000);assert.equal(r.chats.find(m=>m.id==='reply')?.status,'retracted');assert.equal(r.events[0].status,'superseded');assert.equal(r.pendingReplies.length,0);assert.ok(r.messageRevisions?.some(rev=>rev.targetMessageId==='reply'));
});

test('restored and edited source IDs are always sent in their original timestamp order',()=>{
 const r=fixture();r.chats=[{id:'A',speaker:'me',text:'A',at:1},{id:'B',speaker:'me',text:'B',at:2}];enqueueChat(r,'B',2);enqueueChat(r,'A',3);prepareChatDue(r,60003,()=>0);assert.deepEqual(claimChatBatch(r,60003,true)?.sources.map(m=>m.id),['A','B']);
});
test('focused setting changes no compiled character instructions or batch content',()=>{
 const data=defaults(),r=fixture();send(r,'A',1000);prepareChatDue(r,61000,()=>0);const batch=claimChatBatch(r,61000,true)!;
 const normal=buildChatBatchMessages(data,r,batch,61000);chatTiming(r).focused=true;assert.deepEqual(buildChatBatchMessages(data,r,batch,61000),normal);
});

test('failed in-flight batch merges later messages without losing their silence deadline',()=>{
 const r=fixture();send(r,'A',0);prepareChatDue(r,60000,()=>0);const batch=claimChatBatch(r,60000,true)!;send(r,'B',65000);failChatBatch(r,batch,'失败');retryChatTiming(r);
 assert.equal(claimChatBatch(r,124999,true),null);assert.deepEqual(claimChatBatch(r,125000,true)?.sources.map(m=>m.id),['A','B']);
});
test('wrong-role and retracted records never join pending batches',()=>{
 const r=fixture();r.chats=[{id:'char',speaker:'char',text:'角色记录',at:0},{id:'gone',speaker:'me',text:'撤回记录',at:0,status:'retracted'}];enqueueChat(r,'char',0);enqueueChat(r,'gone',0);assert.deepEqual(chatTiming(r).pending,[]);prepareChatDue(r,70000,()=>0);assert.equal(claimChatBatch(r,70000,true),null);
});

import {buildPhoneRegeneration} from './chatBatchPrompt';
test('explicit chat regeneration preserves old records until success and bounds historical/opening context',()=>{
 const data=defaults(),r=fixture();r.chats=[{id:'opening',speaker:'char',text:'旧开场',at:1},{id:'u',speaker:'me',text:'过去的问题',at:2},{id:'c',speaker:'char',text:'过去的答案',at:3,replyTo:'u'},{id:'future',speaker:'me',text:'FUTURE_SECRET',at:4}];r.events=[{id:'f',kind:'chat',title:'之后',detail:'FUTURE_SECRET',at:4}];const before=JSON.stringify(r);
 const history=buildPhoneRegeneration(data,r,'c',10);assert.ok(history);assert.ok(!JSON.stringify(history.messages).includes('FUTURE_SECRET'));assert.deepEqual(history.sourceIds,['u']);assert.equal(JSON.stringify(r),before);
 const opening=buildPhoneRegeneration(data,r,'opening',10);assert.ok(opening);assert.ok(JSON.stringify(opening.messages).includes('第一条手机消息'));assert.ok(!JSON.stringify(opening.messages).includes('FUTURE_SECRET'));assert.equal(JSON.stringify(r),before);
});
