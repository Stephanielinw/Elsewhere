import test from 'node:test';import assert from 'node:assert/strict';
import {createRole,defaults} from './defaults';
import {buildNativeContext,compileNovelConversation} from './prompt';
import {createSceneObservation,sceneUnderstandingMessages,parseSceneDecision,sceneDecisionStillValid} from './sceneState';
import {commitSceneDecision,meetingPlan} from './encounter';
import {makeNativePreset} from './fruit/nativePreset';import {createFruitState} from './fruit/preset';
const at=new Date(2026,9,31,15).getTime();
function fixture(world='在浮空海生活的航行者',place='第七星港的回声阶梯'){
 const r=createRole('新角色','','航行者','独立而谨慎',world),data=defaults();r.chats=[{id:'offer',speaker:'char',text:`现在，在${place}见面，可以吗？`,at:at-5000},{id:'accept',speaker:'me',text:'可以，现在在那里见。',at:at-4000},{id:'arrival',speaker:'me',text:'我已经站在约好的地方了，你认出我了吗？',at}];r.events=[];r.diaries=[];r.meetings=[];data.roles=[r];data.selected=r.id;return {r,data,place};
}
const evidence=(id:string,quote:string,purpose:string)=>({id,quote,purpose});
function plan(f:ReturnType<typeof fixture>,where:string|null=f.place){return {status:'confirmed',where,timeText:'现在',scheduledAt:at-1000,expiresAt:at+3600000,evidence:[evidence('offer',f.r.chats[0].text,'proposal'),evidence('accept',f.r.chats[1].text,'acceptance')]};}
function observe(f:ReturnType<typeof fixture>){const mode=f.r.scene?'scene':'chat';return createSceneObservation(f.r,buildNativeContext(f.data,f.r,mode,'',{nowTs:at}),mode==='scene'?buildNativeContext(f.data,f.r,'chat','',{nowTs:at}):undefined);}
function arrival(f:ReturnType<typeof fixture>){return {action:'arrive',plan:plan(f),arrival:evidence('arrival',f.r.chats[2].text,'arrival'),location:{name:f.place,basis:'agreement',evidence:[]}};}
test('semantic decisions accept arbitrary unseen locations and worlds without place keyword matching',()=>{
 for(const [world,place]of [['古代海岛王国','宫墙北侧的无名小径'],['未来殖民船','舱段Q-17维护井'],['漂浮大陆','Syreen / 叶影环廊']]){
  const f=fixture(world,place),o=observe(f),d=parseSceneDecision(JSON.stringify(arrival(f)),o);assert.equal(commitSceneDecision(f.r,d,at,'new-scene',()=>true),'entered');assert.equal(f.r.scene?.where,place);assert.equal(f.r.scene?.agreement?.sources.length,2);assert.equal(f.r.scene?.messages.at(-1)?.sourceMessageId,'arrival');assert.equal(f.r.scene?.locationEvidence?.origin,'agreement');assert.equal(f.r.chats.length,3);assert.equal(meetingPlan(f.r,at)?.where,place);
 }
});
test('missing, mismatched, revoked, future or same-speaker agreement evidence blocks state changes',()=>{
 const f=fixture(),o=observe(f);for(const alter of [(x:ReturnType<typeof arrival>)=>x.plan.evidence.pop(),(x:ReturnType<typeof arrival>)=>x.plan.evidence[1].id='unknown',(x:ReturnType<typeof arrival>)=>x.plan.evidence[1].quote='随便编的同意',(x:ReturnType<typeof arrival>)=>x.plan.evidence[1]=evidence('offer',f.r.chats[0].text,'acceptance')]){const x=arrival(f);alter(x);assert.throws(()=>parseSceneDecision(JSON.stringify(x),o));}const d=parseSceneDecision(JSON.stringify(arrival(f)),o);f.r.chats[0].status='retracted';assert.equal(sceneDecisionStillValid(f.r,d),false);assert.throws(()=>commitSceneDecision(f.r,d,at,'wrong',()=>true));assert.equal(f.r.scene,null);
});
test('last mutually accepted change wins; refusal/proposal/cancellation cannot enter a Scene',()=>{
 const f=fixture(),o=observe(f);for(const status of ['proposed','declined','cancelled']){const p={...plan(f),status,evidence:[evidence('offer',f.r.chats[0].text,status==='proposed'?'proposal':status==='declined'?'refusal':'cancellation')]};assert.throws(()=>parseSceneDecision(JSON.stringify({...arrival(f),plan:p}),o));}
 f.r.chats.splice(2,0,{id:'change',speaker:'me',text:'改到星港最下层的旧渡桥，可以吗？',at:at-3000},{id:'reaccept',speaker:'char',text:'可以，按新地点见。',at:at-2000});const x=arrival(f);x.plan={...plan(f,'星港最下层的旧渡桥'),evidence:[evidence('offer',f.r.chats[0].text,'proposal'),evidence('change',f.r.chats[2].text,'proposal'),evidence('reaccept',f.r.chats[3].text,'acceptance')]};x.arrival=evidence('arrival',f.r.chats.at(-1)!.text,'arrival');x.location.name=x.plan.where!;commitSceneDecision(f.r,parseSceneDecision(JSON.stringify(x),observe(f)),at,'changed',()=>true);assert.equal(f.r.scene?.where,'星港最下层的旧渡桥');
});
test('unknown stays neutral or uses an explicitly labelled contextual initial setting, never a routine default',()=>{
 const f=fixture(),x=arrival(f);x.plan.where=null;x.location={name:'远航者共同居住的船舱',basis:'contextual',evidence:[]};const d=parseSceneDecision(JSON.stringify(x),observe(f));commitSceneDecision(f.r,d,at,'generated',()=>true);assert.equal(f.r.scene?.locationEvidence?.origin,'generated');assert.equal(f.r.scene?.agreement?.where,undefined);assert.ok(f.r.scene?.locationEvidence?.sources.some(s=>s.id==='arrival'));assert.ok(f.r.scene?.locationEvidence?.contextIds?.includes('scene-world:'+f.r.id));
 const g=fixture(),y=arrival(g);y.plan.where=null;y.location={name:'',basis:'unknown',evidence:[]};commitSceneDecision(g.r,parseSceneDecision(JSON.stringify(y),observe(g)),at,'neutral',()=>true);assert.equal(g.r.scene?.where,'地点待确认');
});
test('movement is source-linked, atomic and propagated into novel Prompt; auxiliary state bars have no authority',async()=>{
 const f=fixture();commitSceneDecision(f.r,parseSceneDecision(JSON.stringify(arrival(f)),observe(f)),at,'live',()=>true);f.r.scene!.messages.push({id:'move',speaker:'char',text:'他陪你离开阶梯，走进船上的观星室。',at});const o=observe(f),raw={action:'move',location:{name:'船上的观星室',basis:'movement',evidence:[evidence('move',f.r.scene!.messages.at(-1)!.text,'movement')]}};
 const before=JSON.stringify(f.r);assert.throws(()=>commitSceneDecision(f.r,parseSceneDecision(JSON.stringify(raw),o),at,'unused',()=>false));assert.equal(JSON.stringify(f.r),before);commitSceneDecision(f.r,parseSceneDecision(JSON.stringify(raw),observe(f)),at,'unused',()=>true);assert.equal(f.r.scene?.where,'船上的观星室');assert.equal(f.r.scene?.id,'live');
 const compilation=compileNovelConversation(f.data,f.r,'scene','继续',{nowTs:at,preset:await makeNativePreset('meeting'),profile:createFruitState().profiles.meeting});assert.ok(compilation.messages.some(m=>m.content.includes('船上的观星室')));assert.throws(()=>parseSceneDecision(JSON.stringify({...raw,location:{...raw.location,evidence:[evidence('status_bar','模型装饰状态栏','movement')]}}),observe(f)));
});
test('only a traceable pre-Scene agreement can reconcile an unverified legacy default; archives and original prose remain',()=>{
 const f=fixture();f.r.scene={id:'old',where:'咖啡馆',startedAt:at,messages:[{id:'old-story',speaker:'char',text:'旧小说原文',at}]};f.r.meetings=[{id:'past',where:'咖啡馆',startedAt:at-20000,endedAt:at-19000,messages:[]}];const raw={action:'reconcile',plan:plan(f),location:{name:f.place,basis:'agreement',evidence:[]}};const past=JSON.stringify(f.r.meetings);commitSceneDecision(f.r,parseSceneDecision(JSON.stringify(raw),observe(f)),at,'unused',()=>true);assert.equal(f.r.scene.where,f.place);assert.equal(f.r.scene.messages[0].text,'旧小说原文');assert.equal(JSON.stringify(f.r.meetings),past);assert.throws(()=>parseSceneDecision(JSON.stringify({...raw,location:{name:'没有来源的咖啡馆',basis:'contextual',evidence:[]}}),observe(f)));
});
test('observation uses authorized current sources; no private, future, withdrawn or theatre records',()=>{
 const f=fixture();f.r.canonNotes='尚未发生的未来不得当作既成事实';f.r.chats.push({id:'future',speaker:'me',text:'未来地点秘密',at:at+5000},{id:'dead',speaker:'me',text:'作废地点秘密',at:at-2000,status:'retracted'});f.r.events.push({id:'secret',kind:'chat',title:'不可知',detail:'私密地点',at:at-1000,source:'private',knownBy:['other']});const text=JSON.stringify(sceneUnderstandingMessages(observe(f)));assert.ok(!text.includes('未来地点秘密'));assert.ok(!text.includes('作废地点秘密'));assert.ok(!text.includes('私密地点'));assert.ok(text.includes('createdAt'));assert.ok(text.includes(f.place));assert.ok(text.includes(f.r.place));assert.ok(text.includes(f.r.job));assert.ok(text.includes(f.r.canonNotes));
});
test('a real native agreement at an ordinary modern place is not mistaken for a legacy default',()=>{
 const f=fixture();f.r.chats.push({id:'cafe-u',speaker:'me',text:'我们改在咖啡馆见面，好吗？',at:at-2000},{id:'cafe-c',speaker:'char',text:'好，就在咖啡馆见。',at:at-1000});
 f.r.scene={id:'native-cafe',startedAt:at,where:'咖啡馆',messages:[],agreement:{status:'confirmed',where:'咖啡馆',proposedBy:'me',acceptedBy:['me','char'],sources:f.r.chats.slice(-2).map(m=>({id:m.id,text:m.text,at:m.at,revisionCount:0}))}};
 assert.throws(()=>parseSceneDecision(JSON.stringify({action:'reconcile',plan:plan(f),location:{name:f.place,basis:'agreement',evidence:[]}}),observe(f)));
 assert.equal(f.r.scene.where,'咖啡馆');
});
test('later cancellation or a new proposal without a later other-party acceptance cannot be labelled confirmed',()=>{
 const f=fixture();f.r.chats.splice(2,0,{id:'cancel',speaker:'char',text:'先取消刚才的约定。',at:at-2000});let x=arrival(f);x.arrival=evidence('arrival',f.r.chats.at(-1)!.text,'arrival');x.plan.evidence.push(evidence('cancel',f.r.chats[2].text,'cancellation'));assert.throws(()=>parseSceneDecision(JSON.stringify(x),observe(f)));
 const g=fixture();g.r.chats.splice(2,0,{id:'new-proposal',speaker:'char',text:'还是换到另一个地点吧？',at:at-2000});x=arrival(g);x.arrival=evidence('arrival',g.r.chats.at(-1)!.text,'arrival');x.plan.evidence.push(evidence('new-proposal',g.r.chats[2].text,'proposal'));assert.throws(()=>parseSceneDecision(JSON.stringify(x),observe(g)));
});
test('scheduled time must cite original time wording, and a future appointment cannot cause arrival now',()=>{
 const f=fixture(),x=arrival(f);x.plan.timeText='未经说出的时间';assert.throws(()=>parseSceneDecision(JSON.stringify(x),observe(f)));x.plan.timeText='现在';x.plan.scheduledAt=at+86400000;x.plan.expiresAt=at+90000000;assert.throws(()=>parseSceneDecision(JSON.stringify(x),observe(f)));
});
