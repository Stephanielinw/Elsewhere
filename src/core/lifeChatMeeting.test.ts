import test from 'node:test';
import assert from 'node:assert/strict';
import {createRole,defaults} from './defaults';
import {routine,splitNaturalChatBubbles,buildMessagesForModel,compileOpeningPrompt} from './prompt';
import {requestMessages} from './conversationPrompt';
const at=new Date(2026,9,31,18,0).getTime();
const fixture=()=>{const r=createRole('Telemachus','','古希腊伊萨卡王子','谨慎而有主见','古希腊 · 伊萨卡');r.profile='奥德修斯之子，生活在古希腊';r.chats=[];r.events=[];return r;};
test('life state never invents a modern timetable for Telemachus or a modern worker',()=>{
 for(const job of ['古希腊伊萨卡王子','书店职员'])for(let hour=0;hour<24;hour++){
  const r=fixture();r.job=job;const state=routine(r,new Date(2026,9,31,hour).getTime());
  assert.doesNotMatch(JSON.stringify(state),/下班|咖啡馆|工作地点|街区|小餐馆|起床|洗漱/);
  assert.match(state.doing,/未确认|暂无可确认/);
 }
});
test('chat bubbles preserve a complete reply despite topic changes or a final question',()=>{
 const r=fixture();
 for(const text of ['今天的事情我已经想清楚了，不必担心。对了，那封信我还没有打开。那你准备怎么做？','这件事需要我自己作出判断，我也不赞同他的想法。你为什么这么看？'])assert.deepEqual(splitNaturalChatBubbles(text,r),[text]);
 for(let n=1;n<=6;n++)assert.equal(splitNaturalChatBubbles(Array.from({length:n},(_,i)=>`消息${i}`).join('|||'),{...r,traits:'沉默寡言'}).length,n);
});
test('native phone and opening have no fixed bubble quota or forced conversational rhythm',()=>{
 const data=defaults(),r=fixture();data.roles=[r];r.chats=[{id:'u',speaker:'me',text:'你好',at}];
 for(const text of [JSON.stringify(buildMessagesForModel(data,r,'chat','你好',{nowTs:at})),JSON.stringify(requestMessages(compileOpeningPrompt(data,r,at)))]){
  assert.doesNotMatch(text,/1 至 3|1～3|通常发 1 条|最多 [24] 条/);
  assert.match(text,/不强制反问/);assert.match(text,/伊萨卡/);assert.doesNotMatch(text,/下班|工作地点/);
 }
});

import {meetingPlan,isArrival,createEncounter,isFarewell} from './encounter';
import {editMessage,retractMessage} from './revisions';
const time=(day:number,hour:number,minute=0)=>new Date(2026,9,day,hour,minute).getTime();
function say(r:ReturnType<typeof fixture>,speaker:'me'|'char',text:string,at:number){const m={id:'m'+r.chats.length,speaker,text,at,status:'active' as const};r.chats.push(m);return m;}
function agreed(){const r=fixture();say(r,'me','明天下午三点在王宫门口见面，好吗？',time(30,18));say(r,'char','好，明天下午三点在王宫门口等你。',time(30,18,1));return r;}
test('invitation, confirmation and arrival are distinct; confirmed source time/place survive refresh',()=>{
 const r=fixture();say(r,'me','明天下午三点在王宫门口见面，好吗？',time(30,18));
 assert.equal(meetingPlan(r,time(30,18))?.status,'proposed');assert.equal(isArrival(r,'我到了，你在哪',time(30,18)),false);
 say(r,'char','好，明天下午三点在王宫门口等你。',time(30,18,1));
 const plan=meetingPlan(r,time(31,15));assert.equal(plan?.status,'confirmed');assert.equal(plan?.where,'王宫门口');assert.equal(plan?.scheduledAt,time(31,15));assert.equal(plan?.sources.length,2);
 assert.deepEqual(meetingPlan(JSON.parse(JSON.stringify(r)),time(31,15)),plan);
 assert.equal(isArrival(r,'我到王宫门口了，能看到我吗？',time(31,15)),true);
 assert.equal(isArrival(r,'已经到了，在约好的地方等你。',time(31,15)),true);
 assert.equal(isArrival(r,'我到了，你在哪',time(30,19)),false);
 assert.equal(isArrival(r,'我到港口了',time(31,15)),false);
 assert.equal(isArrival(r,'我到了，你在哪',time(31,22)),false);
});
test('no agreement, refusal, cancellation, ambiguous time, quotes, jokes and third-party arrival do not start a meeting',()=>{
 const bare=fixture();assert.equal(isArrival(bare,'我到了，你在哪',at),false);say(bare,'char','等你回信。',at-1000);assert.equal(isArrival(bare,'到啦',at),false);
 for(const text of ['他发来“我到了，你在哪”','我朋友到了王宫门口','“我到了”','> 我到了，你在哪','如果我到了怎么办？','开玩笑的，我到了','我还没到','我快到了','我想说我到了','明天我到了再联系你'])assert.equal(isArrival(agreed(),text,time(31,15)),false,text);
 const r=agreed();say(r,'char','不行，我今天不能见面了。',time(31,14));assert.equal(meetingPlan(r,time(31,15))?.status,'declined');assert.equal(isArrival(r,'我到了',time(31,15)),false);
 const cancelled=agreed();say(cancelled,'me','取消见面吧，改天再约。',time(31,14));assert.equal(isArrival(cancelled,'我到了',time(31,15)),false);
 const vague=fixture();say(vague,'me','有空在王宫门口见面吗？',time(30,18));say(vague,'char','好，在王宫门口等你。',time(30,18,1));assert.equal(isArrival(vague,'我到了',time(31,15)),false);
});
test('both speakers must accept the same plan; rescheduling requires new confirmation',()=>{
 const r=agreed();say(r,'me','改成下午四点在港口见吧。',time(31,14));
 assert.equal(meetingPlan(r,time(31,16))?.status,'proposed');assert.equal(isArrival(r,'我到港口了',time(31,16)),false);
 say(r,'char','好，就在那里等你。',time(31,14,1));assert.equal(isArrival(r,'我到港口了',time(31,16)),true);assert.equal(meetingPlan(r,time(31,16))?.where,'港口');
 const proposed=fixture();say(proposed,'char','现在在王宫门口见面？',time(31,15));assert.equal(meetingPlan(proposed,time(31,15))?.status,'proposed');say(proposed,'me','好，我这就过去。',time(31,15,1));assert.equal(isArrival(proposed,'我到了',time(31,15,2)),true);
});
test('edited, retracted, future, private or consumed agreements cannot authorize arrival',()=>{
 for(const kind of ['edit','retract','future','private','consumed']){
  const r=agreed();if(kind==='edit')editMessage(r,'chat','m0','今天风很大。',time(31,14));
  if(kind==='retract')retractMessage(r,'chat','m1',time(31,14));
  if(kind==='future')r.chats[1].at=time(31,16);
  if(kind==='private')r.events.push({id:'hidden',kind:'chat',at:r.chats[1].at,detail:r.chats[1].text,title:'私密',messageId:'m1',knownBy:['other']});
  if(kind==='consumed')r.meetings=[{id:'old',where:'王宫门口',startedAt:time(31,15),endedAt:time(31,15,1),messages:[]}];
  assert.equal(isArrival(r,'我到了',time(31,15,2)),false,kind);
 }
});
test('encounter preserves phone source/time and agreement, does not invent an opening; manual remains available',()=>{
 const r=agreed(),arrival=say(r,'me','我到王宫门口了',time(31,15));
 const scene=createEncounter(r,arrival,time(31,15),'scene-id');assert.ok(scene);assert.equal(scene.where,'王宫门口');assert.equal(scene.agreement?.sources[0].id,'m0');
 assert.equal(scene.messages.filter(m=>m.speaker==='char').length,0);assert.equal(scene.messages.find(m=>m.speaker==='me')?.at,arrival.at);assert.equal(scene.messages.find(m=>m.speaker==='me')?.sourceMessageId,arrival.id);assert.equal(r.chats.at(-1)?.text,arrival.text);
 r.scene=scene;assert.equal(isArrival(r,'我到了',time(31,15)),false);
 assert.ok(isFarewell('我先走了，下次见。'));assert.equal(isFarewell('他说“我先走了”'),false);
 const manual=createEncounter(fixture(),null,time(31,15),'manual-id');assert.ok(manual);assert.equal(manual.where,'地点待确认');
});

test('short confirmations preserve a precise time; counteroffers and uncertainty do not falsely confirm',()=>{
 const r=fixture();say(r,'me','明天下午三点在王宫门口见面，好吗？',time(30,18));say(r,'char','好，明天见。',time(30,18,1));
 assert.equal(meetingPlan(r,time(31,15))?.status,'confirmed');assert.equal(meetingPlan(r,time(31,15))?.scheduledAt,time(31,15));
 const changed=agreed();say(changed,'char','改成下午四点吧。',time(31,14));assert.equal(meetingPlan(changed,time(31,16))?.status,'proposed');assert.equal(meetingPlan(changed,time(31,16))?.scheduledAt,time(31,16));
 say(changed,'me','好，就这样。',time(31,14,1));assert.equal(isArrival(changed,'我到了',time(31,16)),true);
 for(const text of ['好，但不一定能去见面。','可能吧，到时再看。','好，如果有空就去。']){
  const uncertain=fixture();say(uncertain,'me','现在在王宫门口见面吗？',time(31,15));say(uncertain,'char',text,time(31,15,1));assert.equal(isArrival(uncertain,'我到了',time(31,15,2)),false,text);
 }
});
test('unrelated or quoted acceptance and stale schedules cannot confirm a proposal',()=>{
 const r=fixture();say(r,'me','明天下午三点在王宫门口见面，好吗？',time(30,18));say(r,'me','刚刚说的是那本书，读过了吗？',time(30,18,1));say(r,'char','好。',time(30,18,2));assert.notEqual(meetingPlan(r,time(31,15))?.status,'confirmed');
 const third=fixture();say(third,'me','他约你明天下午三点在王宫门口见面。',time(30,18));say(third,'char','好。',time(30,18,1));assert.equal(isArrival(third,'我到了',time(31,15)),false);
 const old=agreed();say(old,'char','我在王宫门口等你。',time(31,14));say(old,'me','好。',time(31,14,1));assert.equal(meetingPlan(old,time(31,15))?.scheduledAt,time(31,15));
});
test('old invented hourly records and invalid sources do not enter native current state or memory',()=>{
 const data=defaults(),r=fixture();data.roles=[r];r.events=[{id:'legacy-life',kind:'life',title:'下班路上',detail:'MODERN_FAKE_ACTIVITY',at:at-1000,where:'街区'}, {id:'future-life',kind:'life',source:'real',knownBy:[r.id],title:'未来',detail:'FUTURE_ACTIVITY',at:at+1000}];
 const prompt=JSON.stringify(buildMessagesForModel(data,r,'chat','今天如何',{nowTs:at}));assert.ok(!prompt.includes('MODERN_FAKE_ACTIVITY'));assert.ok(!prompt.includes('FUTURE_ACTIVITY'));
 r.scene={id:'known-scene',startedAt:at-1000,where:'王宫庭院',messages:[]};assert.equal(routine(r,at).where,'王宫庭院');assert.equal(routine(r,at).label,'正在见面');
});

test('arrival must be completed and its explicit place must match the agreement',()=>{
 const r=agreed();for(const text of ['我到了港口，你在哪？','我到隔壁王宫门口了','我到王宫门口再告诉你','我准备到王宫门口','我到王宫门口去找你'])assert.equal(isArrival(r,text,time(31,15)),false,text);
 for(const text of ['我到了王宫门口，你在哪？','到啦','我已经抵达王宫门口了','我到门口了'])assert.equal(isArrival(r,text,time(31,15)),true,text);
});

import {encounterHistory} from './encounter';
test('scene arrival source cannot revive after its phone original is edited or retracted',()=>{
 for(const change of ['edit','retract']){
  const r=agreed(),m=say(r,'me','我到了王宫门口',time(31,15));r.scene=createEncounter(r,m,time(31,15),'scene')!;
  assert.equal(encounterHistory(r,r.scene.messages).filter(m=>m.speaker==='me').length,1);
  if(change==='edit')editMessage(r,'chat',m.id,'我还在路上',time(31,15,1));else retractMessage(r,'chat',m.id,time(31,15,1));
  assert.equal(encounterHistory(r,r.scene.messages).filter(m=>m.speaker==='me').length,0);
  const data=defaults();data.roles=[r];assert.ok(!JSON.stringify(buildMessagesForModel(data,r,'scene','',{nowTs:time(31,15,2)})).includes('我到了王宫门口'));
 }
});

test('the same immediate meeting is not turned into a counteroffer by normal network time',()=>{
 const r=fixture();say(r,'me','现在在王宫门口见面好吗？',time(31,15));say(r,'char','好，现在在王宫门口等你。',time(31,15,1));
 assert.equal(meetingPlan(r,time(31,15,2))?.status,'confirmed');assert.equal(isArrival(r,'我到王宫门口了',time(31,15,2)),true);
});

test('a participant can withdraw confirmed consent with a short refusal or explicit uncertainty',()=>{
 for(const text of ['不去了。','别来了。','取消吧。','我不能去了。','今天不一定能去见面。']){
  const r=agreed();say(r,'char',text,time(31,14));assert.notEqual(meetingPlan(r,time(31,15))?.status,'confirmed',text);assert.equal(isArrival(r,'我到了',time(31,15)),false,text);
 }
});
test('third-person, past and negated arrivals are not affirmative current first-person arrivals',()=>{
 for(const text of ['他已经到了','妈妈到了','昨天我到了','我不是已经到了','她刚刚到王宫门口了','我还没有到王宫门口','我到了，今天不能见面了。'])assert.equal(isArrival(agreed(),text,time(31,15)),false,text);
});
test('contextual changed time is a counteroffer and unsupported future qualifiers never become today',()=>{
 const r=agreed();say(r,'char','好，下午四点。',time(31,14));assert.equal(meetingPlan(r,time(31,15))?.status,'proposed');assert.equal(meetingPlan(r,time(31,15))?.scheduledAt,time(31,16));assert.equal(isArrival(r,'我到了',time(31,15)),false);
 for(const date of ['下周三','下个月31日','明年10月31日','下星期一','2026-11-05']){
  const r=fixture();say(r,'me',date+'下午三点在王宫门口见面好吗？',time(31,14));say(r,'char','好。',time(31,14,1));assert.notEqual(meetingPlan(r,time(31,15))?.status,'confirmed',date);assert.equal(isArrival(r,'我到了',time(31,15)),false,date);
 }
});
test('explicitly editing the scene bridge becomes an independent source without changing the phone original',()=>{
 const r=agreed(),m=say(r,'me','我到了王宫门口',time(31,15));r.scene=createEncounter(r,m,time(31,15),'scene')!;
 const bridge=r.scene.messages.find(m=>m.sourceMessageId)!;
 assert.equal(editMessage(r,'scene',bridge.id,'我在门口向你招手',time(31,15,1)).ok,true);
 assert.equal(r.chats.at(-1)?.text,'我到了王宫门口');assert.equal(encounterHistory(r,r.scene.messages).find(m=>m.id===bridge.id)?.text,'我在门口向你招手');assert.ok(r.messageRevisions?.some(v=>v.targetMessageId===bridge.id&&v.reason?.includes(m.id)));
});
