import test from 'node:test';
import assert from 'node:assert/strict';
import {createRole} from './defaults';
import {forgetChatMessagePermanently,prepareRegenerateReply,retractMessage} from './revisions';

const at=Date.parse('2026-11-22T05:00:00Z');
function roleFixture(){
 const r=createRole('合成警员','','巡警','稳重','现代都市');
 r.id='only-role';r.chats=[
  {id:'lin-1',speaker:'me',text:'我今天来见你。',at:at-40000},
  {id:'ai-1',speaker:'char',text:'第一条回复。',at:at-30000,replyTurnId:'reply-one',replyTo:'lin-1',replySourceIds:['lin-1']},
  {id:'ai-2',speaker:'char',text:'第二条回复。',at:at-29999,replyTurnId:'reply-one',replyTo:'lin-1',replySourceIds:['lin-1']},
  {id:'lin-2',speaker:'me',text:'引用你之前的发言',at:at-20000,
   quote:{id:'ai-1',speaker:'char',text:'第一条回复。',at:at-30000}},
 ];
 r.events=[{id:'event-lin-1',kind:'chat',title:'消息',detail:'我今天来见你。',at:at-40000,messageId:'lin-1',knownBy:[r.id]}];
 r.diaries=[];
 return r;
}
test('only the owner may retract phone messages; AI messages cannot be recalled',()=>{
 const r=roleFixture(),before=JSON.stringify(r);
 const denied=retractMessage(r,'chat','ai-1',at);
 assert.equal(denied.ok,false);
 assert.match(denied.reason||'',/只能撤回自己/);
 assert.equal(JSON.stringify(r),before);
 const recalled=retractMessage(r,'chat','lin-2',at);
 assert.equal(recalled.ok,true);
 assert.equal(r.chats.find(m=>m.id==='lin-2')?.status,'retracted');
});
test('all bubbles of one AI replyTurnId are superseded together',()=>{
 const r=roleFixture(),result=prepareRegenerateReply(r,'chat','ai-2',at);
 assert.equal(result.ok,true);
 assert.deepEqual(new Set(result.supersededMessageIds),new Set(['ai-1','ai-2']));
 assert.equal(r.chats.find(m=>m.id==='ai-1')?.status,'retracted');
 assert.equal(r.chats.find(m=>m.id==='ai-2')?.status,'retracted');
 assert.equal(r.chats.find(m=>m.id==='lin-2')?.status,undefined);
});
test('permanent deletion removes source, linked event, revision and active quote snapshot',()=>{
 const r=roleFixture();
 const old=r.chats.find(m=>m.id==='ai-1')!;
 const result=forgetChatMessagePermanently(r,'ai-1',at);
 assert.equal(result.ok,true);
 assert.ok(!r.chats.some(m=>m.id==='ai-1'));
 assert.equal(r.chats.find(m=>m.id==='lin-2')?.quote,null);
 assert.equal(r.chats.find(m=>m.id==='ai-2')?.status,undefined);
 assert.equal(result.reason,undefined);
 assert.equal(forgetChatMessagePermanently(r,'ai-1',at).ok,false);
 assert.ok(!r.chats.includes(old));
});
test('permanently deleting user text invalidates source-linked AI replies and facts',()=>{
 const r=roleFixture();
 const result=forgetChatMessagePermanently(r,'lin-1',at);
 assert.equal(result.ok,true);
 assert.ok(!r.chats.some(m=>m.id==='lin-1'));
 assert.equal(r.chats.find(m=>m.id==='ai-1')?.status,'retracted');
 assert.equal(r.chats.find(m=>m.id==='ai-2')?.status,'retracted');
 assert.ok(!r.events.some(e=>e.messageId==='lin-1'));
 assert.ok(!(r.messageRevisions||[]).some(v=>v.targetMessageId==='lin-1'));
 assert.ok(!(r.memory?.records||[]).some(v=>v.source?.id==='lin-1'));
});
