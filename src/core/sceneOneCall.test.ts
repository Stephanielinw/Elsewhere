import test from 'node:test';import assert from 'node:assert/strict';
import {createRole,defaults} from './defaults';import {buildNativeContext,compileNativeConversation} from './prompt';
import {createSceneObservation} from './sceneState';import {prepareSceneReply,splitSceneReply,resolveSceneReply,sceneReplyMatches} from './sceneReply';
import {createNovelTasks,prepareNovelRegeneration,commitNovelReply} from './novelGeneration';
import {requestMessages} from './conversationPrompt';
import {commitSceneDecision} from './encounter';import {editMessage,retractMessage,prepareRegenerateReply} from './revisions';
const at=new Date(2026,9,31,15).getTime();
function fixture(scene=false){const r=createRole('Arin','','环海研究员','独立','漂浮群岛'),data=defaults();r.chats=[{id:'u',speaker:'me',text:'现在在第七塔的青铜栈道见面好吗？',at:at-2000}];r.events=[];r.diaries=[];r.meetings=[];data.roles=[r];data.selected=r.id;if(scene)r.scene={id:'s',where:'青铜栈道',startedAt:at-10000,messages:[{id:'su',speaker:'me',text:'我们往观星厅走吧。',at:at-1000}]};return {r,data};}
async function contract(f:ReturnType<typeof fixture>){const kind=f.r.scene?'scene':'chat',context=buildNativeContext(f.data,f.r,kind,'',{nowTs:at});return prepareSceneReply(f.r,f.data.user,createSceneObservation(f.r,context,f.r.scene?buildNativeContext(f.data,f.r,'chat','',{nowTs:at}):undefined),compileNativeConversation(f.data,f.r,kind,'',{nowTs:at}),{requestId:'request-1',now:at});}
const footer=(id:string,event:unknown,roleId:string,sceneId:string|null)=>`<elsewhere_scene_event>${JSON.stringify({requestId:id,roleId,sceneId,event})}</elsewhere_scene_event>`;
test('optional same-response footer leaves normal plain text, content and auxiliary blocks intact',()=>{
 const raw='<content>他抬头看你。</content><status_bar>晴天</status_bar>'+footer('a',{action:'none'},'r','s'),x=splitSceneReply(raw);assert.equal(x.text,'<content>他抬头看你。</content><status_bar>晴天</status_bar>');assert.ok(x.payload);assert.deepEqual(splitSceneReply('普通文字'),{text:'普通文字'});
 for(const bad of ['<elsewhere_scene_event>{坏JSON}</elsewhere_scene_event>','<elsewhere_scene_event>{"truncated":'])assert.equal(splitSceneReply('正文'+bad).text,'正文');
 const nested=splitSceneReply('<content>正文'+footer('a',{action:'move'},'r','s')+'</content>');assert.equal(nested.text,'<content>正文</content>');assert.equal(nested.payload,undefined);
});
test('one-call request preserves roles/order; source index and optional event never replace author format',async()=>{
 const f=fixture(),c=await contract(f);assert.equal(c.messages[0].role,'system');assert.match(c.messages[0].content,/elsewhere_scene_event/);assert.ok(c.messages.some(m=>m.role==='user'&&m.content.includes(f.r.chats[0].text)));assert.equal(c.ticket.sceneId,null);assert.equal(c.ticket.roleId,f.r.id);assert.ok(c.ticket.sourceIds.includes('u'));assert.deepEqual(c.messages.slice(1),requestMessages(compileNativeConversation(f.data,f.r,'chat','',{nowTs:at})));assert.ok(!c.messages[0].content.includes(f.r.chats[0].text));
});
test('new assistant acceptance resolves to saved bubble ID; wrong request or stale source cannot update plan',async()=>{
 const f=fixture(),c=await contract(f),reply={id:'c',speaker:'char' as const,text:'好，现在在那里等你。',at};
 const event={action:'plan',plan:{status:'confirmed',where:'第七塔的青铜栈道',timeText:'现在',scheduledAt:at,expiresAt:at+3600000,evidence:[{id:'u',quote:f.r.chats[0].text,purpose:'proposal'},{id:'@reply',quote:reply.text,purpose:'acceptance'}]}};
 f.r.chats.push(reply);assert.equal(await sceneReplyMatches(f.r,f.data.user,c.ticket,[reply]),true);const payload=splitSceneReply(reply.text+footer('request-1',event,f.r.id,null)).payload!;
 const d=resolveSceneReply(f.r,f.data.user,{...c.ticket,payload},[reply],at);commitSceneDecision(f.r,d,at,'unused',()=>true);assert.equal(f.r.meetingPlan?.status,'confirmed');assert.equal(f.r.meetingPlan?.sources.at(-1)?.id,'c');
 assert.throws(()=>resolveSceneReply(f.r,f.data.user,{...c.ticket,payload:payload.replace('request-1','other')},[reply],at));f.r.chats[0].text='改过了';assert.equal(await sceneReplyMatches(f.r,f.data.user,c.ticket,[reply]),false);
});
test('current movement follows source revision invalidation without rewriting archives or deleting prose',async()=>{
 for(const action of ['edit','retract','regen']){
  const f=fixture(true),c=await contract(f),reply={id:'sc',speaker:'char' as const,text:'他陪你走进观星厅。',at,kind:'scene' as const};f.r.scene!.messages.push(reply);
  const event={action:'move',location:{name:'观星厅',basis:'movement',evidence:[{id:'@reply',quote:reply.text,purpose:'movement'}]}},payload=splitSceneReply('<content>'+reply.text+'</content>'+footer('request-1',event,f.r.id,'s')).payload!;
  const d=resolveSceneReply(f.r,f.data.user,{...c.ticket,payload},[reply],at);commitSceneDecision(f.r,d,at,'unused',()=>true,{requestId:c.ticket.requestId,replyIds:[reply.id]});assert.equal(f.r.scene!.where,'观星厅');
  if(action==='edit')editMessage(f.r,'scene','sc','他没有移动。',at+1);else if(action==='retract')retractMessage(f.r,'scene','sc',at+1);else prepareRegenerateReply(f.r,'scene','sc',at+1);
  assert.equal(f.r.scene!.where,'青铜栈道');assert.ok(f.r.scene!.messages.some(m=>m.id==='sc'));assert.ok(f.r.events.some(e=>e.sceneChange&&e.status!=='active'));
 }
});
test('native auxiliary blocks cannot be quoted as actual movement',async()=>{
 const f=fixture(true),c=await contract(f),reply={id:'aux',speaker:'char' as const,text:'他向你点头。<status_bar>他走进观星厅。</status_bar>',at};f.r.scene!.messages.push(reply);
 const event={action:'move',location:{name:'观星厅',basis:'movement',evidence:[{id:'@reply',quote:'他走进观星厅。',purpose:'movement'}]}},payload=splitSceneReply(reply.text+footer('request-1',event,f.r.id,'s')).payload!;assert.throws(()=>resolveSceneReply(f.r,f.data.user,{...c.ticket,payload},[reply],at));
});
test('same-place evidence changes are still derived state and invalidated when confirmation is edited',async()=>{
 const f=fixture(true);f.r.scene!.where='咖啡馆';f.r.chats=[{id:'p',speaker:'me',text:'现在在咖啡馆见面好吗？',at:at-12000},{id:'a',speaker:'char',text:'好，就在咖啡馆见。',at:at-11000}];
 const c=await contract(f);assert.ok(c.ticket.sourceIds.includes('p')&&c.ticket.sourceIds.includes('a'));const reply={id:'same',speaker:'char' as const,text:'我已经在这里。',at};f.r.scene!.messages.push(reply);
 const event={action:'reconcile',plan:{status:'confirmed',where:'咖啡馆',timeText:'现在',scheduledAt:at-12000,expiresAt:at+3600000,evidence:[{id:'p',quote:f.r.chats[0].text,purpose:'proposal'},{id:'a',quote:f.r.chats[1].text,purpose:'acceptance'}]},location:{name:'咖啡馆',basis:'agreement',evidence:[]}},payload=splitSceneReply(reply.text+footer('request-1',event,f.r.id,'s')).payload!;
 const d=resolveSceneReply(f.r,f.data.user,{...c.ticket,payload},[reply],at);commitSceneDecision(f.r,d,at,'unused',()=>true,{requestId:c.ticket.requestId,replyIds:[reply.id]});editMessage(f.r,'chat','a','我还没有同意。',at+1);assert.equal(f.r.scene!.agreement,undefined);assert.equal(f.r.scene!.locationEvidence,undefined);
});
test('truncated or selfclosing reserved metadata never becomes a chat bubble',()=>{
 for(const tail of ['<elsewhere_scene_event','<elsewhere_scene_event/>{"leak":"private"}','<ELSEWHERE_SCENE_EVENT attr=','<elsewhere_scene_event'+footer('req',{action:'none'},'r',null)])assert.equal(splitSceneReply('正文'+tail).text,'正文');
});
test('editing a phone original invalidates movement evidence in its copied scene bridge',async()=>{
 const f=fixture(true),original={id:'original',speaker:'me' as const,text:'我走进观星厅了。',at:at-5000};f.r.chats.push(original);f.r.scene!.messages.push({...original,id:'bridge',sourceMessageId:'original',kind:'scene'});const c=await contract(f),reply={id:'bridge-reply',speaker:'char' as const,text:'我看见你了。',at};f.r.scene!.messages.push(reply);
 const event={action:'move',location:{name:'观星厅',basis:'movement',evidence:[{id:'bridge',quote:original.text,purpose:'movement'}]}},payload=splitSceneReply(reply.text+footer('request-1',event,f.r.id,'s')).payload!;
 commitSceneDecision(f.r,resolveSceneReply(f.r,f.data.user,{...c.ticket,payload},[reply],at),at,'unused',()=>true,{requestId:'request-1',replyIds:[reply.id]});assert.equal(f.r.scene!.where,'观星厅');editMessage(f.r,'chat','original','我还没有过去。',at+1);assert.equal(f.r.scene!.where,'青铜栈道');
});
test('generated initial places retain authorized context IDs without treating them as prior facts',async()=>{
 const f=fixture(true);f.r.scene!.where='地点待确认';const c=await contract(f),reply={id:'generated',speaker:'char' as const,text:'你们站在环海研究所的门廊。',at};f.r.scene!.messages.push(reply);assert.ok(c.ticket.contextIds?.includes('scene-world:'+f.r.id));
 const event={action:'locate',location:{name:'环海研究所门廊',basis:'contextual',evidence:[]}},payload=splitSceneReply(reply.text+footer('request-1',event,f.r.id,'s')).payload!;
 commitSceneDecision(f.r,resolveSceneReply(f.r,f.data.user,{...c.ticket,payload},[reply],at),at,'unused',()=>true,{requestId:'request-1',replyIds:[reply.id],contextIds:c.ticket.contextIds});assert.equal(f.r.scene!.locationEvidence?.origin,'generated');assert.ok(f.r.scene!.locationEvidence?.contextIds?.includes('scene-world:'+f.r.id));
});

test('failed novel regeneration restores the current scene proof along with original prose',async()=>{
 const f=fixture(true),c=await contract(f),reply={id:'sc',speaker:'char' as const,text:'他走进观星厅。',at,replyTo:'su'};f.r.scene!.messages.push(reply);
 const event={action:'move',location:{name:'观星厅',basis:'movement',evidence:[{id:'@reply',quote:reply.text,purpose:'movement'}]}},payload=splitSceneReply(reply.text+footer('request-1',event,f.r.id,'s')).payload!;
 commitSceneDecision(f.r,resolveSceneReply(f.r,f.data.user,{...c.ticket,payload},[reply],at),at,'unused',()=>true,{requestId:'request-1',replyIds:[reply.id]});
 const before=structuredClone(f.r),tasks=createNovelTasks(),task=tasks.begin(f.r,'scene'),regen=prepareNovelRegeneration(f.r,'scene','sc')!;assert.ok(regen);
 assert.throws(()=>commitNovelReply(f.r,task,{id:'replacement',speaker:'char',text:'没有移动。',at},()=>false,regen,at+1));assert.deepEqual(f.r,before);
});
test('invalidating an archived scene source never rewrites the finished meeting record',async()=>{
 const f=fixture(true),original={id:'original',speaker:'me' as const,text:'我进观星厅了。',at:at-5000};f.r.chats.push(original);f.r.scene!.messages.push({...original,id:'bridge',sourceMessageId:'original'});const c=await contract(f),reply={id:'archive-reply',speaker:'char' as const,text:'你来了。',at};f.r.scene!.messages.push(reply);
 const event={action:'move',location:{name:'观星厅',basis:'movement',evidence:[{id:'bridge',quote:original.text,purpose:'movement'}]}},payload=splitSceneReply(reply.text+footer('request-1',event,f.r.id,'s')).payload!;
 commitSceneDecision(f.r,resolveSceneReply(f.r,f.data.user,{...c.ticket,payload},[reply],at),at,'unused',()=>true,{requestId:'request-1',replyIds:[reply.id]});f.r.meetings=[{...structuredClone(f.r.scene!),endedAt:at+1}];f.r.scene=null;
 const archive=structuredClone(f.r.meetings),events=structuredClone(f.r.events);editMessage(f.r,'chat',original.id,'我还没到。',at+2);assert.deepEqual(f.r.meetings,archive);assert.deepEqual(f.r.events,events);
});

test('closed malformed tags and nested reserved blocks preserve later author prose',()=>{
 for(const middle of ['</elsewhere_scene_event>','<elsewhere_scene_event/>','<elsewhere_scene_event>{'+footer('inner',{action:'none'},'r',null)+'}</elsewhere_scene_event>']){
  const result=splitSceneReply('<content>前'+middle+'后</content>');assert.equal(result.text,'<content>前后</content>');assert.equal(result.payload,undefined);
 }
 assert.equal(splitSceneReply('正文<elsewhere_scene_event/>{"ignored":true}尾文').text,'正文尾文');
});
