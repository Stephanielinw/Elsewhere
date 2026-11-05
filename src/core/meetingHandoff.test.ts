import test from 'node:test';import assert from 'node:assert/strict';
import {createRole,defaults} from './defaults';import {meetingPlan,isArrival,commitSceneDecision} from './encounter';import {buildNativeContext,compileNativeConversation} from './prompt';import {createSceneObservation,parseSceneDecision} from './sceneState';import {prepareSceneReply,sceneReplyMatches,resolveSceneReply} from './sceneReply';import {editMessage,retractMessage,prepareRegenerateReply} from './revisions';
import {encounterHistory} from './encounter';
const at=new Date(2026,10,4,14).getTime();
function fixture(){const data=defaults(),r=createRole('合成岛民','','海岛守望者','谨慎','虚构海岛');r.id='island';r.chats=[];r.events=[];r.diaries=[];r.meetings=[];data.roles=[r];data.selected=r.id;return {r,data};}
function say(r:ReturnType<typeof fixture>['r'],speaker:'me'|'char',text:string,offset:number){const m={id:'m'+r.chats.length,speaker,text,at:at+offset,status:'active' as const};r.chats.push(m);return m;}
function agreed(arrival='我到了。'){const f=fixture(),{r}=f;const offer=say(r,'char','在北堤见面吧，我在这里等你。',-3000),accept=say(r,'me','好，我来找你。',-2000),user=say(r,'me',arrival,-1000);r.meetingPlan={interpretation:'scene-state-v1',status:'confirmed',where:'北堤',proposedBy:'char',acceptedBy:['char','me'],sources:[offer,accept].map(m=>({id:m.id,text:m.text,at:m.at,revisionCount:0}))};return {...f,user};}
function arrivalEvent(f:ReturnType<typeof agreed>){return {action:'arrive',plan:{status:'confirmed',where:'北堤',timeText:null,scheduledAt:null,expiresAt:null,evidence:f.r.chats.slice(0,2).map((m,i)=>({id:m.id,quote:m.text,purpose:i?'acceptance':'proposal'}))},arrival:{id:f.user.id,quote:f.user.text,purpose:'arrival'},location:{name:'北堤',basis:'agreement',evidence:[]}};}
test('confirmed semantic plan without exact appointment time accepts a completed current arrival',()=>{const {r}=agreed();assert.equal(meetingPlan(r,at)?.status,'confirmed');assert.equal(isArrival(r,'我到了。',at),true);});
test('same-turn scene metadata cannot promote nearing, remote sighting, quotes or hypothetical words into arrival',()=>{
 for(const text of ['我可能马上就要到了。','我在船上远远看见你了。','我快到了。','如果我到了就喊你。','“我到了。”','昨天我到了。','我到了，但今天不想见你。']){const f=agreed(text),o=createSceneObservation(f.r,buildNativeContext(f.data,f.r,'chat','',{nowTs:at}));assert.throws(()=>parseSceneDecision(JSON.stringify(arrivalEvent(f)),o),text);}
});
test('a later cancellation supersedes an earlier source-valid semantic appointment',()=>{const {r}=agreed();say(r,'char','取消见面，别来了。',-500);assert.equal(meetingPlan(r,at)?.status,'cancelled');assert.equal(isArrival(r,'我到了。',at),false);});
import {resolvePhoneSceneReply} from './sceneReply';
async function coast(user='我看见你了！',reply='看见你了。\n你站稳些，把手给我，这里礁石滑。'){
 const f=fixture(),{r,data}=f;say(r,'char','你昨天提到今天要来，海上的情况如何？',-5000);say(r,'me','我想可能马上就要到了，我感觉已经看到海岸了……你来了吗？',-4000);say(r,'char','我已经到海岸边了。你从船上抬起头，能看见那片浅滩和正对着港湾的橄榄林吗？我就在这里等你，你慢着点上岸。',-3000);const input=say(r,'me',user,-2000),name=say(r,'me','Orin!',-1000);
 const context=buildNativeContext(data,r,'chat','',{nowTs:at}),prepared=await prepareSceneReply(r,data.user,createSceneObservation(r,context),compileNativeConversation(data,r,'chat','',{nowTs:at}),{requestId:'handoff',now:at,inputIds:[input.id,name.id]});
 const replies=reply.split('\n').map((text,i)=>({...say(r,'char',text,i),replyTurnId:'turn',replySourceIds:[input.id,name.id]}));r.chats.splice(-replies.length,replies.length,...replies);
 return {...f,input,replies,ticket:prepared.ticket};
}
test('coast conversation missing metadata enters once using mutual presence, preserving this whole turn',async()=>{
 const f=await coast();assert.equal(isArrival({...f.r,scene:null},f.input.text,at),false,'sighting alone must wait for counterpart evidence');assert.equal(await sceneReplyMatches(f.r,f.data.user,f.ticket,f.replies),true);const result=resolvePhoneSceneReply(f.r,f.data.user,f.ticket,f.replies,at+10);assert.equal(result.code,'handoff-mutual-presence');assert.equal(result.decision?.action,'arrive');const original=structuredClone(f.r.chats);assert.equal(commitSceneDecision(f.r,result.decision!,at+10,'coast-scene',()=>true,{requestId:f.ticket.requestId,replyIds:f.replies.map(m=>m.id)}),'entered');assert.equal(f.r.scene?.where,'海岸边');assert.deepEqual(f.r.chats,original);assert.equal(f.r.scene?.messages.filter(m=>m.speaker==='char').length,2);assert.equal(f.r.scene?.messages.filter(m=>m.speaker==='me').length,2);assert.throws(()=>commitSceneDecision(f.r,result.decision!,at+10,'duplicate',()=>true));
});
test('recovery never relies on the character taking action for a still-distant or unconfirmed user',async()=>{
 for(const [user,reply]of [['我可能马上就到了。','看见你了。\n你站稳些，把手给我。'],['我在船上远远看见你了。','看见你了。\n把手给我。'],['我看见你了！','我也远远看见你了，你慢慢来。'],['海风真大。','他把你拉上岸，站到你身边。'],['“我看见你了”是那句台词。','看见你了。\n把手给我。'],['如果我到了再叫你。','你来了，站稳些。']]){
  const f=await coast(user,reply),out=resolvePhoneSceneReply(f.r,f.data.user,f.ticket,f.replies,at+10);assert.equal(out.decision,undefined,user);assert.equal(f.r.scene,null);
 }
});
test('malformed optional metadata can recover from actual phone evidence, stale/retracted input cannot',async()=>{
 const f=await coast();const result=resolvePhoneSceneReply(f.r,f.data.user,{...f.ticket,payload:'{broken'},f.replies,at+10);assert.equal(result.diagnostic,'scene-event-invalid');assert.equal(result.decision?.action,'arrive');
 for(const action of ['edit','retract']){const g=await coast();if(action==='edit')editMessage(g.r,'chat',g.input.id,'我还在船上。',at+1);else retractMessage(g.r,'chat',g.input.id,at+1);assert.equal(await sceneReplyMatches(g.r,g.data.user,g.ticket,g.replies),false);assert.equal(resolvePhoneSceneReply(g.r,g.data.user,g.ticket,g.replies,at+10).decision,undefined);}
});
test('metadata cannot cherry-pick an old consent over a newer cancellation or unilateral action',()=>{
 const f=agreed();say(f.r,'char','取消见面，别来了。',-10);assert.throws(()=>parseSceneDecision(JSON.stringify(arrivalEvent(f)),createSceneObservation(f.r,buildNativeContext(f.data,f.r,'chat','',{nowTs:at}))));
 const g=agreed('海风真大。');say(g.r,'char','我把你拉上岸了。',-10);assert.throws(()=>parseSceneDecision(JSON.stringify(arrivalEvent(g)),createSceneObservation(g.r,buildNativeContext(g.data,g.r,'chat','',{nowTs:at}))));
 const h=agreed('我看见你了！');say(h.r,'char','我也远远看见你，你慢慢来。',-10);assert.throws(()=>parseSceneDecision(JSON.stringify(arrivalEvent(h)),createSceneObservation(h.r,buildNativeContext(h.data,h.r,'chat','',{nowTs:at}))));
});
test('handoff persist failure rolls back queue and scene while preserving every phone original',async()=>{
 const f=await coast(),out=resolvePhoneSceneReply(f.r,f.data.user,f.ticket,f.replies,at+10);f.r.pendingReplies=[{id:'old',replyTo:f.input.id,replyTurnId:'old-turn',bubbles:['旧未交付气泡'],dueAt:at+1000}];f.r.chatTiming={version:1,focused:true,generation:8,pending:[],quietUntil:0};
 // Queue state is outside the immutable conversational evidence, and must still roll back atomically.
 const before=structuredClone(f.r);assert.throws(()=>commitSceneDecision(f.r,out.decision!,at+10,'failed',()=>false,{requestId:f.ticket.requestId,replyIds:f.replies.map(m=>m.id)}));assert.deepEqual(f.r,before);
 commitSceneDecision(f.r,out.decision!,at+10,'ok',()=>true,{requestId:f.ticket.requestId,replyIds:f.replies.map(m=>m.id)});assert.deepEqual(f.r.pendingReplies,[]);assert.deepEqual(f.r.chatTiming.pending,[]);assert.ok(f.r.chatTiming.generation>8);
});
test('metadata cannot ignore a later contradictory input in the same batch',async()=>{
 const f=agreed();const later=say(f.r,'me','刚才看错了，我还在船上。',-500),o=createSceneObservation(f.r,buildNativeContext(f.data,f.r,'chat','',{nowTs:at}));o.inputIds=[f.user.id,later.id];assert.throws(()=>parseSceneDecision(JSON.stringify(arrivalEvent(f)),o));
});
test('a valid refusal event wins over physical-looking prose and optional recovery',async()=>{
 const f=await coast('我到了。','看见你了，站稳些。我不方便接待你，回去吧。');const payload=JSON.stringify({requestId:f.ticket.requestId,roleId:f.r.id,sceneId:null,event:{action:'plan',plan:{status:'declined',where:null,timeText:null,scheduledAt:null,expiresAt:null,evidence:[{id:'@reply',quote:f.replies[0].text,purpose:'refusal'}]}}});const out=resolvePhoneSceneReply(f.r,f.data.user,{...f.ticket,payload},f.replies,at+10);assert.equal(out.decision?.action,'plan');assert.equal(out.decision?.plan?.status,'declined');assert.equal(resolvePhoneSceneReply(f.r,f.data.user,f.ticket,f.replies,at+10).decision,undefined);
});
test('user-proposed timed appointment retains original time evidence in local recovery',async()=>{
 const f=fixture();say(f.r,'me','今天下午两点在北堤见面吧。',-4000);say(f.r,'char','好，就这么定。',-3000);f.r.meetingPlan=meetingPlan(f.r,at);const input=say(f.r,'me','我看见你了！',-1000),ctx=buildNativeContext(f.data,f.r,'chat','',{nowTs:at});const prep=await prepareSceneReply(f.r,f.data.user,createSceneObservation(f.r,ctx),compileNativeConversation(f.data,f.r,'chat','',{nowTs:at}),{requestId:'timed',now:at,inputIds:[input.id]});const reply=say(f.r,'char','看见你了。站稳些，把手给我。',0);const out=resolvePhoneSceneReply(f.r,f.data.user,prep.ticket,[reply],at+10);assert.equal(out.decision?.action,'arrive');assert.equal(out.decision?.location?.name,'北堤');assert.ok(out.decision?.plan?.sources.some(s=>s.id==='m0'));
});
test('local handoff never overwrites explicit actual arrival with an incompatible proposed place',async()=>{
 for(const status of ['proposed','confirmed'] as const){const f=await coast('我到了广场。');if(status==='confirmed'){const p=meetingPlan(f.r,at)!;f.r.meetingPlan={...p,interpretation:'scene-state-v1',status,acceptedBy:['char','me']};}const out=resolvePhoneSceneReply(f.r,f.data.user,f.ticket,f.replies,at+10);assert.ok(!out.decision||out.decision.location?.name!=='海岸边');}
});
test('metadata cannot bypass a source-valid legacy cancellation or revive ten-day-old presence',()=>{
 const f=agreed();delete f.r.meetingPlan!.interpretation;say(f.r,'char','不用来了。',-500);f.r.meetingPlan=meetingPlan(f.r,at);assert.equal(f.r.meetingPlan?.status,'cancelled');assert.throws(()=>parseSceneDecision(JSON.stringify(arrivalEvent(f)),createSceneObservation(f.r,buildNativeContext(f.data,f.r,'chat','',{nowTs:at}))));
 const g=agreed();assert.throws(()=>parseSceneDecision(JSON.stringify(arrivalEvent(g)),createSceneObservation(g.r,buildNativeContext(g.data,g.r,'chat','',{nowTs:at+10*86400000}))));
});
test('arrival footer obeys the same actual-place and counterpart absence checks as recovery',()=>{
 const f=agreed('我到了广场。');assert.throws(()=>parseSceneDecision(JSON.stringify(arrivalEvent(f)),createSceneObservation(f.r,buildNativeContext(f.data,f.r,'chat','',{nowTs:at}))));
 const g=agreed();say(g.r,'char','我还没到，你等我一下。',-10);assert.throws(()=>parseSceneDecision(JSON.stringify(arrivalEvent(g)),createSceneObservation(g.r,buildNativeContext(g.data,g.r,'chat','',{nowTs:at}))));
});
test('a cancellation source cannot be relabelled as new consent in metadata',()=>{
 const f=agreed();const cancel=say(f.r,'char','不用来了。',-500),arrival=say(f.r,'me','我到了。',-100);f.r.meetingPlan=meetingPlan(f.r,at);const event=arrivalEvent({...f,user:arrival});event.plan.evidence=[{id:cancel.id,quote:cancel.text,purpose:'proposal'},{id:arrival.id,quote:arrival.text,purpose:'acceptance'}];assert.throws(()=>parseSceneDecision(JSON.stringify(event),createSceneObservation(f.r,buildNativeContext(f.data,f.r,'chat','',{nowTs:at}))));
});
test('a declined cached plan requires fresh consent from both parties, not only a later user arrival',()=>{
 for(const text of ['不用来了。','我不去见你。','我今天没法赴约。']){const f=agreed(),decline={id:'decline',speaker:'char' as const,text,at:at-1500};f.r.chats.splice(2,0,decline);f.r.meetingPlan=meetingPlan(f.r,at);assert.ok(['declined','cancelled'].includes(f.r.meetingPlan!.status));const e=arrivalEvent(f);e.plan.evidence.push({id:f.user.id,quote:f.user.text,purpose:'acceptance'});assert.throws(()=>parseSceneDecision(JSON.stringify(e),createSceneObservation(f.r,buildNativeContext(f.data,f.r,'chat','',{nowTs:at}))),text);}
});

test('editing, withdrawing or regenerating handoff sources invalidates proof and bridges without deleting history',async()=>{
 for(const change of ['edit','retract','regenerate']){const f=await coast(),out=resolvePhoneSceneReply(f.r,f.data.user,f.ticket,f.replies,at+10);commitSceneDecision(f.r,out.decision!,at+10,'revisable',()=>true,{requestId:f.ticket.requestId,replyIds:f.replies.map(m=>m.id)});const scene=f.r.scene!;
 if(change==='edit')editMessage(f.r,'chat',f.input.id,'我还在船上。',at+20);else if(change==='retract')retractMessage(f.r,'chat',f.input.id,at+20);else prepareRegenerateReply(f.r,'chat',f.replies[0].id,at+20);
 assert.equal(f.r.scene?.id,scene.id);assert.equal(scene.where,'地点待确认');assert.ok(f.r.chats.some(m=>m.id===f.input.id));assert.ok(scene.messages.some(m=>m.sourceMessageId===f.input.id));assert.equal(encounterHistory(f.r,scene.messages).filter(m=>m.speaker==='char').length,0);assert.ok(f.r.events.some(e=>e.sceneChange&&e.status==='superseded'));
 }
});
