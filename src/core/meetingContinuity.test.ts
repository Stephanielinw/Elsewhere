import test from 'node:test';
import assert from 'node:assert/strict';
import {createRole,defaults} from './defaults';
import {archiveMeeting} from './meetingHistory';
import {buildNativeContext,compileNativeConversation} from './prompt';
import {requestMessages} from './conversationPrompt';
import {editMessage,retractMessage} from './revisions';
import {estimateTextTokens} from './contextBudget';
const at=Date.parse('2026-11-06T22:00:00Z');
function fixture(){
 const data=defaults(),r=createRole('合成船长','','守港人','倔强','合成港口');r.id='actor';r.chats=[];r.events=[];r.diaries=[];
 r.scene={id:'room',where:'贮藏室',startedAt:at-10000,messages:[
  {id:'lead',speaker:'char',text:'我领你走进贮藏室。',at:at-9000},
  {id:'stay',speaker:'char',text:'待在这儿，别四处走动。',at:at-8000},
  {id:'leave',speaker:'char',text:'我推门出去，只有我离开，你还在屋里。',at:at-7000},
  {id:'private',speaker:'me',text:'UNSPOKEN_USER_THOUGHT',at:at-6500},
  {id:'aux',speaker:'note',text:'AUX_NOT_CANON',at:at-6400},
 ]};archiveMeeting(r,at-6000,()=>true);data.roles=[r];return {data,r};
}
const wire=(f:ReturnType<typeof fixture>,time=at)=>requestMessages(compileNativeConversation(f.data,f.r,'chat','为什么把我留在这里？',{nowTs:time})).map(m=>m.content).join('\n');
test('phone receives the attributed original scene chain without changing archived records',()=>{
 const f=fixture(),before=JSON.stringify(f),text=wire(f),ctx=buildNativeContext(f.data,f.r,'chat','为什么把我留在这里？',{nowTs:at});
 for(const m of f.r.meetings![0].messages.slice(0,3)){assert.ok(text.includes(m.text));assert.ok(text.includes(m.id));}
 assert.ok(text.includes('Scene=room'));assert.ok(text.includes('角色原文'));assert.ok(!text.includes('UNSPOKEN_USER_THOUGHT'));assert.ok(!text.includes('AUX_NOT_CANON'));assert.equal(JSON.stringify(f),before);
 assert.ok(ctx.native!.memoryTrace!.some(t=>t.id==='meeting:room'&&t.sourceIds.includes('lead')));
});
test('ending interaction does not assert that both parties left or said goodbye',()=>{const f=fixture();assert.ok(!f.r.events.at(-1)!.detail.includes('在贮藏室告别'));assert.ok(f.r.events.at(-1)!.detail.includes('不推断双方'));assert.ok(!wire(f).includes('在贮藏室告别'));});
test('edits, withdrawals and missing effective revision time cannot revive replaced content',()=>{
 for(const mode of ['edit','retract','unknown']){const f=fixture();f.r.scene=f.r.meetings![0];if(mode==='edit')editMessage(f.r,'scene','lead','我独自走进另一间屋子。',at-5000);else if(mode==='retract')retractMessage(f.r,'scene','lead',at-5000);else f.r.scene.messages[0].revisionCount=1;f.r.scene=null;const text=wire(f);assert.ok(!text.includes('我领你走进贮藏室。'));if(mode==='edit'){assert.ok(text.includes('我独自走进另一间屋子。'));assert.ok(text.includes('修订生效于='+new Date(at-5000).toISOString()));assert.ok(text.includes('不证明原发时已知'));}}
});
test('future archives, future edits and messages outside their scene interval are excluded',()=>{const f=fixture();assert.ok(!wire(f,at-6001).includes('我领你'));f.r.meetings![0].messages[0].at=at-11000;assert.ok(!wire(f).includes('我领你'));});
test('two archives keep their own IDs and actor roles; theatre and other roles do not join them',()=>{
 const f=fixture();f.r.meetings!.push({id:'garden',startedAt:at-4000,endedAt:at-1000,where:'庭院',messages:[{id:'garden-char',speaker:'char',text:'我独自在庭院喝茶。',at:at-2000}]});
 const text=wire(f);assert.ok(text.includes('Scene=room'));assert.ok(text.includes('Scene=garden'));const other=createRole('另一角色','','','','');other.id='other';other.chats=[];other.events=[];other.diaries=[];f.data.roles.push(other);assert.ok(!requestMessages(compileNativeConversation(f.data,other,'chat','为什么把我留在这里？',{nowTs:at})).some(m=>m.content.includes('贮藏室')));
 const before=wire(f);f.r.plays=[{id:'theatre',title:'戏中戏',world:'虚构',user:'用户',char:'演员',startedAt:at-9000,endedAt:at-1000,messages:[{id:'play-message',speaker:'char',text:'THEATRE_NOT_REAL',at:at-2000}]}];assert.equal(wire(f),before);
});
test('long archives remain bounded and all excerpts retain source labels',()=>{
 const f=fixture();for(let i=0;i<2000;i++)f.r.meetings![0].messages.splice(2,0,{id:'long'+i,speaker:'char',text:'无关的长叙述。'.repeat(100),at:at-7500});
 const ctx=buildNativeContext(f.data,f.r,'chat','贮藏室里为什么让我等？',{nowTs:at}),facts=ctx.facts.filter(f=>f.id.startsWith('meeting:'));assert.ok(facts.length<=2);assert.ok(estimateTextTokens(facts.map(f=>f.text).join('\n'))<=1000);assert.ok(wire(f).length<16000);
});
test('duplicate message identities and invalid phone bridges are not used',()=>{const f=fixture();f.r.meetings![0].messages.push({...f.r.meetings![0].messages[0]});assert.ok(!wire(f).includes('我领你'));f.r.meetings![0].messages[2].sourceMessageId='missing-phone';assert.ok(!wire(f).includes('我推门出去'));});
test('explicit private sources and theatre-labelled messages are not promoted',()=>{
 const f=fixture();f.r.events.push({id:'private-event',kind:'scene',title:'私密来源',detail:f.r.meetings![0].messages[0].text,at:at-9000,messageId:'lead',source:'room',sourceRevision:0,knownBy:['user']});f.r.meetings![0].messages[1].kind='play';const text=wire(f);assert.ok(!text.includes('我领你'));assert.ok(!text.includes('待在这儿'));assert.ok(text.includes('我推门出去'));
});
test('a public phone bridge retains its source revision and disappears when edited',()=>{
 const f=fixture(),m={id:'phone-public',speaker:'me' as const,text:'PUBLIC_PHONE_SOURCE',at:at-8500};f.r.chats.push(m);f.r.meetings![0].messages.push({...m,id:'phone-bridge',sourceMessageId:m.id});assert.equal(wire(f).split('PUBLIC_PHONE_SOURCE').length-1,1);assert.ok(buildNativeContext(f.data,f.r,'chat','',{nowTs:at}).history.some(item=>item.id===m.id));editMessage(f.r,'chat',m.id,'PUBLIC_UPDATED',at-5000);const text=wire(f);assert.ok(!text.includes('PUBLIC_PHONE_SOURCE'));assert.ok(!text.includes('消息=phone-bridge'));
});
test('later edits never masquerade as earlier knowledge and valid old archives remain retrievable',()=>{
 const f=fixture();f.r.meetings![0].messages[0].text='LATER_REVISION';f.r.meetings![0].messages[0].editedAt=at+1000;f.r.meetings![0].messages[0].revisionCount=1;assert.ok(!wire(f).includes('LATER_REVISION'));
 const old=fixture();const time=at+30*86400000;assert.ok(requestMessages(compileNativeConversation(old.data,old.r,'chat','还记得贮藏室那次见面吗？',{nowTs:time})).some(m=>m.content.includes('我领你走进贮藏室。')));
});
test('independent scene consequences and explicit location corrections remain available',()=>{
 const f=fixture();f.r.events.push({id:'consequence',kind:'scene',title:'独立历史',detail:'INDEPENDENT_CONSEQUENCE 已经修好门锁。',at:at-5500,source:'room',knownBy:[f.r.id]});
 const ctx=buildNativeContext(f.data,f.r,'chat','INDEPENDENT_CONSEQUENCE 门锁修好了吗',{nowTs:at});assert.ok(ctx.native!.protectedText.includes('INDEPENDENT_CONSEQUENCE'));assert.ok(ctx.native!.protectedText.includes('已经修好门锁'));
});
