import test from 'node:test';
import assert from 'node:assert/strict';
import {createRole} from './defaults';
import {editMessage,retractMessage} from './revisions';
import {collectRoleLife,preparePersonalReply,splitPersonalReply,applyPersonalReply} from './roleLife';
const at=Date.parse('2026-11-02T20:00:00Z');
function fixture(){const r=createRole('合成守档者','','守档者','寡言','古城');r.id='self';r.chats=[{id:'c',speaker:'char' as const,text:'那张残页还没修好，我想试试另一种纤维。',at:at-1000,status:'active' as const}];r.events=[];r.diaries=[];return r;}
const wrap=(ticket:ReturnType<typeof preparePersonalReply>['ticket'],updates:unknown[])=>'<elsewhere_private_state>'+JSON.stringify({requestId:ticket.id,roleId:ticket.roleId,updates})+'</elsewhere_private_state>';

test('same-completion private thought is source-bound, not a public event or Canon; survives refresh and several days',()=>{
 const r=fixture(),prepared=preparePersonalReply(r,[{role:'system',content:'人物边界'},{role:'user',content:'普通问候'}],at,'request1');
 const parsed=splitPersonalReply('我还想试一次。'+wrap(prepared.ticket,[{kind:'plan',text:'想试用另一种纤维修复残页',sources:['message:c'],shareable:false}]));
 assert.equal(parsed.text,'我还想试一次。');assert.ok(applyPersonalReply(r,prepared.ticket,parsed.payload!,at));
 assert.equal(r.events.length,0);assert.equal(r.canonNotes,undefined);assert.equal(r.chats.length,1);
 const later=collectRoleLife(JSON.parse(JSON.stringify(r)),at+3*86400000);assert.equal(later.threads.length,1);assert.equal(later.threads[0].shareable,false);
});

test('edited/retracted sources, wrong-role and future threads are excluded without deleting saved state',()=>{
 const r=fixture(),p=preparePersonalReply(r,[],at,'r');applyPersonalReply(r,p.ticket,splitPersonalReply(wrap(p.ticket,[{kind:'opinion',text:'不赞成仓促补完地图',sources:['message:c'],shareable:true}])).payload!,at);
 const original=JSON.stringify(r.personalThreads);assert.equal(collectRoleLife(r,at-1).threads.length,0);
 editMessage(r,'chat','c','我改变主意了。',at+1);assert.equal(collectRoleLife(r,at+2).threads.length,0);assert.equal(JSON.stringify(r.personalThreads),original);
 assert.equal(applyPersonalReply(r,p.ticket,wrap(p.ticket,[]),at+3),false);
});

test('private parser strips malformed/duplicate/oversized control blocks rather than exposing them as prose',()=>{
 for(const raw of ['正文<elsewhere_private_state>{"broken":','正文<elsewhere_private_state>{}</elsewhere_private_state><elsewhere_private_state>{}</elsewhere_private_state>','正文<elsewhere_private_state>'+ 'x'.repeat(9000)+'</elsewhere_private_state>']){
  const p=splitPersonalReply(raw);assert.equal(p.text,'正文');assert.equal(p.payload,undefined);
 }
});

test('only verified, past, role-known life timeline entries are read; monitor enrichments remain unused',()=>{
 const r=fixture();r.events=[
  {id:'good',kind:'life',title:'修复',detail:'纤维已备好',at:at-100,source:'manual',lifeEvidence:'confirmed',knownBy:['self'],status:'active'},
  {id:'guess',kind:'life',title:'猜测',detail:'不可靠推测',at:at-100,source:'ai_enriched',knownBy:['self'],status:'active'},
  {id:'future',kind:'life',title:'未来',detail:'未来',at:at+1,source:'manual',lifeEvidence:'confirmed',knownBy:['self']},
  {id:'user',kind:'life',title:'用户观察',detail:'独有观察',at:at-100,source:'manual',lifeEvidence:'confirmed',knownBy:['user']},
 ];const before=structuredClone(r);assert.deepEqual(collectRoleLife(r,at).events.map(e=>e.id),['good']);assert.deepEqual(r,before);
});

test('invalid metadata is optional: unbound sources or duplicate request cannot mutate private continuity',()=>{
 const r=fixture(),p=preparePersonalReply(r,[],at,'r');
 const payload=JSON.stringify({requestId:'r',roleId:r.id,updates:[{kind:'plan',text:'编造计划',sources:['unknown'],shareable:true}]});
 assert.equal(applyPersonalReply(r,p.ticket,payload,at),false);assert.equal(r.personalThreads,undefined);
 const valid=JSON.stringify({requestId:'r',roleId:r.id,updates:[{kind:'concern',text:'继续研究残页',sources:['message:c'],shareable:true}]});
 assert.equal(applyPersonalReply(r,p.ticket,valid,at),true);assert.equal(applyPersonalReply(r,p.ticket,valid,at),false);
});

test('explicit resolutions preserve historical versions but stop future unsolicited topics',()=>{
 const r=fixture(),a=preparePersonalReply(r,[],at,'first');
 applyPersonalReply(r,a.ticket,splitPersonalReply(wrap(a.ticket,[{kind:'concern',text:'还在考虑修复办法',sources:['message:c'],shareable:true}])).payload!,at);
 const key=r.personalThreads![0].key,b=preparePersonalReply(r,[],at+1000,'second');
 applyPersonalReply(r,b.ticket,splitPersonalReply(wrap(b.ticket,[{kind:'concern',key,status:'resolved',text:'已经选定下次试验方法',sources:['thread:'+key],shareable:false}])).payload!,at+1000);
 assert.equal(collectRoleLife(r,at+2000).threads.length,0);assert.equal(collectRoleLife(r,at+500).threads.length,1);assert.equal(r.personalThreads!.length,2);
});

test('private continuity bound to generated chat is invalidated by edit/retraction of that reply',()=>{
 for(const change of ['edit','retract']){const r=fixture(),p=preparePersonalReply(r,[],at,'record-'+change),reply={id:'reply',speaker:'char' as const,text:'我仍然不赞成那种做法。',at:at+1};r.chats.push(reply);
 const payload=JSON.stringify({requestId:p.ticket.id,roleId:r.id,updates:[{kind:'opinion',text:'不赞成仓促修复',sources:['message:c'],shareable:true}]});
 assert.ok(applyPersonalReply(r,p.ticket,payload,at+1,[reply]));assert.equal(collectRoleLife(r,at+2).threads.length,1);
 if(change==='edit')editMessage(r,'chat',reply.id,'我重新想过了。',at+3);else retractMessage(r,'chat',reply.id,at+3);
 assert.equal(collectRoleLife(r,at+4).threads.length,0);assert.equal(r.personalThreads!.length,1);
 }
});

test('JSON string tag literals and nested private tags never leak private text into a bubble',()=>{
 const payload=JSON.stringify({requestId:'x',roleId:'self',updates:[{kind:'opinion',text:'字面 </elsewhere_private_state> 不等于标签'}]});
 const parsed=splitPersonalReply('正文<elsewhere_private_state>'+payload+'</elsewhere_private_state>');assert.equal(parsed.text,'正文');assert.equal(parsed.payload,payload);
 const nested=splitPersonalReply('正文<elsewhere_private_state>{"private":"甲"}<elsewhere_private_state>{"private":"乙"}</elsewhere_private_state>secret-tail</elsewhere_private_state>');assert.equal(nested.text,'正文');assert.equal(nested.payload,undefined);
});

test('a diary whose source message was edited is not reintroduced through private continuity',()=>{
 const r=fixture();r.diaries=[{id:'old-diary',speaker:'char',source:'ai',text:'OLD_SECRET_SOURCE',at:at-100,generatedAt:at-50,sourceMessageIds:['c']}];
 editMessage(r,'chat','c','当前有效记录',at+1);
 const p=preparePersonalReply(r,[],at+2,'new-request');assert.ok(!p.ticket.sources.some(s=>s.id==='old-diary'));
});

test('later thread updates expose stable key separately from the current revision ID',()=>{
 const r=fixture();for(let n=1;n<=3;n++){const p=preparePersonalReply(r,[],at+n,'update'+n),current=collectRoleLife(r,at+n).threads[0];
  const update={kind:'plan',text:'第'+n+'次继续研究',sources:[current?'thread:'+current.id:'message:c'],shareable:false,...(current?{key:current.key}:{})};
  assert.ok(applyPersonalReply(r,p.ticket,splitPersonalReply(wrap(p.ticket,[update])).payload!,at+n));
 }
 const t=collectRoleLife(r,at+4).threads[0];assert.notEqual(t.id,t.key);
});

test('same-millisecond edits cannot reuse a newly archived diary through continuity',async()=>{
 const {applyGeneratedCharacterDiary,getLocalDayBounds}=await import('./diary');
 const r=fixture(),date='2026-11-02',end=getLocalDayBounds(date).endMs;
 const result=applyGeneratedCharacterDiary(r,date,'SOURCE_VERSION_PRIVATE',end+1000);assert.ok(result.ok);
 editMessage(r,'chat','c','该来源在归档后改了',end+1000);
 const p=preparePersonalReply(r,[],end+1001,'after-edit');assert.ok(!p.ticket.sources.some(s=>s.id===result.diary!.id));
});
