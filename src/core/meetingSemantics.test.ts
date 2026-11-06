import test from 'node:test';
import assert from 'node:assert/strict';
import {createRole,defaults} from './defaults';
import {buildNativeContext,compileNativeConversation} from './prompt';
import {requestMessages} from './conversationPrompt';
import {createSceneObservation} from './sceneState';
import {prepareSceneReply,resolvePhoneSceneReply,sceneReplyMatches,splitSceneReply} from './sceneReply';
import {commitSceneDecision} from './encounter';
import {editMessage} from './revisions';
import type {ChatMessage,MeetingPlan} from './types';

const at=Date.parse('2026-11-04T22:00:00Z');
type Signal='present'|'sighting'|'approaching'|'nearby'|'interacting';
const positive: Array<[string,string,string,string,string,Signal,Signal]>=[
 ['coast / zh','忒勒马科斯','古希腊海岸','船已经系牢了，我踩着湿沙冲你招手。','我从橄榄树下过来，沿着你招手的方向。','sighting','approaching'],
 ['coast / en','Nerites','Bronze Age coast','Dry land at last. That’s my torch beside the mooring.','Keep it raised. I’m coming down the beach to that torch.','present','approaching'],
 ['street / zh','夏青','现代街头','刚才撞歪你伞的就是我。','原来是你。我把伞往我们两人头顶挪了挪。','nearby','interacting'],
 ['street / en','Morgan','city sidewalk','The bike courier in the orange jacket waving at you is me.','Hold the bike there. I’m threading past the flower stall towards you.','sighting','approaching'],
 ['café / ja','遥','喫茶店','向かいの椅子に座って、君の注文票を手に取った。','その伝票は僕のだよ。君の正面でカップを置く。','nearby','interacting'],
 ['café / en','Jun','neighborhood café','I’m sliding the menu between our cups.','I nudge it back across our table and ask which cake you want.','interacting','interacting'],
 ['station / zh','罗桥','火车站','检票口外举着绿色纸袋的是我。','认出纸袋了，我离开队伍来找你。','sighting','approaching'],
 ['station / ja','澪','駅の改札','改札の外で青い封筒を掲げているのが私。','封筒が目印ね。列を抜けてそっちへ向かう。','sighting','approaching'],
 ['airport / es','Luz','aeropuerto','Ya crucé aduanas. Soy quien levanta el cartel amarillo.','Distingo el cartel; salgo de la fila y voy hacia ti.','sighting','approaching'],
 ['airport / en','Casey','arrivals hall','That’s my suitcase nudging the wheel of yours.','I pull mine aside and greet you over the two bags.','nearby','interacting'],
 ['door / fr','Ana','immeuble','Je suis sur ton palier, ma main est encore sur la sonnette.','Je quitte la cuisine et me dirige vers la porte.','present','approaching'],
 ['door / zh','宋迟','住宅门口','我按了门铃，脚边是带来的两袋橘子。','听到铃声了，我正从屋里过来给你开门。','present','approaching'],
 ['court / zh','沈衡','古代宫廷','阶前执笏候着的便是臣，见殿下从廊下经过。','本宫离席，正循石阶向你而来。','sighting','approaching'],
 ['court / en','Ianthe','royal audience chamber','I put my petition on the cushion at your elbow.','I take up the petition and address you from the dais.','nearby','interacting'],
 ['fantasy / zh','星灯','浮空渡口','我踏上浮桥，手里那盏银灯朝你晃了两下。','银光在雾里闪了，我沿桥板往那边去。','sighting','approaching'],
 ['fantasy / es','Nara','puerto flotante','El banco junto al tuyo crujió cuando me senté.','Acerco mi farol entre los dos bancos y te saludo.','nearby','interacting'],
 ['chance / en','Rowan','secondhand book fair','We both reached for this battered atlas. I’m holding the other corner.','I let go of my corner and laugh right next to you.','nearby','interacting'],
 ['chance / zh','秋禾','露天书市','原来跟我捡同一本书的人是你，书还在咱俩手中间。','我松开书，抬眼当面问你找的是哪一版。','nearby','interacting'],
 ['speaking / de','Mira','Museum','Ich frage dich am selben Tisch nach dem zerbrochenen Siegel.','Ich antworte dir leise, direkt neben deinem Stuhl.','interacting','interacting'],
 ['speaking / ja','灯','美術館','隣に腰を下ろして、展示の封印について君に尋ねた。','隣の席から、君にだけ聞こえる声で答える。','interacting','interacting'],
];

async function turn(name:string,world:string,userText:string,actorText:string,options:{before?:ChatMessage[];moreInputs?:string[];plan?:MeetingPlan}={}) {
 const data=defaults();
 const r=createRole(name,'','旅人','独立',world);
 r.id='actor';r.events=[];r.diaries=[];r.meetings=[];
 const user:ChatMessage={id:'input',speaker:'me',text:userText,at:at-1000,kind:'chat'};
 const extra=(options.moreInputs||[]).map((text,i):ChatMessage=>({id:'extra'+i,speaker:'me',text,at:at-900+i,kind:'chat'}));
 r.chats=[...(options.before||[]),user,...extra];r.meetingPlan=options.plan;
 data.roles=[r];data.selected=r.id;
 const context=buildNativeContext(data,r,'chat','',{nowTs:at});
 const compiled=compileNativeConversation(data,r,'chat','',{nowTs:at});
 const prepared=await prepareSceneReply(r,data.user,createSceneObservation(r,context),compiled,{requestId:'same-call',now:at,inputIds:[user.id,...extra.map(m=>m.id)]});
 const actor:ChatMessage={id:'reply',speaker:'char',text:actorText,at,kind:'chat',replySourceIds:[user.id,...extra.map(m=>m.id)]};
 r.chats.push(actor);
 const event=(userSignal:Signal,actorSignal:Signal,state=userSignal==='approaching'||actorSignal==='approaching'?'approaching':'together')=>({state,context:'physical-now',user:{id:user.id,quote:user.text,signal:userSignal},actor:{id:'@reply',quote:actor.text,signal:actorSignal}});
 const encode=(value:unknown,overrides:Record<string,unknown>={})=>JSON.stringify({requestId:prepared.ticket.requestId,roleId:r.id,sceneId:null,event:value,...overrides});
 const resolve=(value?:unknown,overrides?:Record<string,unknown>)=>resolvePhoneSceneReply(r,data.user,{...prepared.ticket,...(value?{payload:encode(value,overrides)}:{})},[actor],at+10);
 return {data,r,user,actor,prepared,compiled,event,encode,resolve};
}

for(const [label,name,world,user,actor,us,as] of positive)test(`semantic true-positive ${label}`,async()=>{
 const f=await turn(name,world,user,actor);
 const originals=structuredClone(f.r.chats);
 assert.equal(await sceneReplyMatches(f.r,f.data.user,f.prepared.ticket,[f.actor]),true);
 const event=f.event(us,as);
 const outcome=f.resolve(event);
 assert.equal(outcome.code,'handoff-semantic-'+event.state);
 assert.equal(outcome.decision?.action,'arrive');
 assert.equal(outcome.decision?.entryPhase,event.state==='approaching'?'approaching':as==='interacting'?'interacting':'nearby');
 const origin={requestId:'same-call',replyIds:[f.actor.id]};
 assert.throws(()=>commitSceneDecision(f.r,outcome.decision!,at+10,'not-saved',()=>false,origin),/保存失败/);
 assert.equal(f.r.scene,null);
 assert.deepEqual(f.r.chats,originals);
 assert.equal(commitSceneDecision(f.r,outcome.decision!,at+10,'saved',()=>true,origin),'entered');
 assert.deepEqual(f.r.chats,originals);
 assert.deepEqual(f.r.scene!.messages.slice(1).map(m=>m.text),[user,actor]);
 assert.throws(()=>commitSceneDecision(f.r,outcome.decision!,at+10,'duplicate',()=>true,origin));
});

const negative: Array<[string,string,string,string]>=[
 ['video / zh','我在视频里看到你的帽子了。','镜头再往左一点。','mediated'],
 ['video / ja','画面の向こうに君の帽子が映った。','カメラを少し傾けて。','mediated'],
 ['window / zh','隔着二楼的窗户远远看见你。','我在对街等公交。','distance'],
 ['window / en','I can make you out through my office window.','I’m on the opposite side of the boulevard.','distance'],
 ['actor absent / zh','我已经到门口了。','我还没到，你先等一会。','en-route'],
 ['actor absent / en','My bag is at the entrance.','I haven’t even left the hotel.','en-route'],
 ['riding / zh','我看见你了！我还在船上，船没靠岸。','等系好缆绳再过来。','en-route'],
 ['riding / es','Todavía estoy en el tren, te veo desde la ventana.','Te espero cuando se detenga.','en-route'],
 ['future / zh','明天去看钟楼怎么样？','好，明天见。','future'],
 ['future / fr','Rendez-vous demain devant la gare ?','D’accord, à demain.','future'],
 ['memory / zh','还记得昨天咱们坐在咖啡馆吗？','当然，那杯咖啡很苦。','past'],
 ['memory / de','Erinnerst du dich an unseren Besuch gestern?','Ja, damals saßen wir am Fenster.','past'],
 ['joke / zh','开玩笑说一句「我走到你身边了」。','我听懂了这个玩笑。','fiction'],
 ['roleplay / en','In the script, my character walks through your door.','I read the next stage direction out loud.','fiction'],
 ['quote / zh','她说「我看见你了」。','这是你刚念的那段对白。','fiction'],
 ['quote / en','The note says "I am at your doorstep".','That line is from the letter.','fiction'],
 ['decline / zh','我看见你了！','我也看见你了，但今天不想见面。','declined'],
 ['decline / es','Te veo desde la plaza.','Prefiero no reunirnos hoy.','declined'],
 ['cancel / zh','取消见面吧。','收到，我不去了。','cancelled'],
 ['cancel / ja','今日は待ち合わせを取りやめよう。','わかった、そちらへは行かない。','cancelled'],
 ['sight only / zh','我看见你了！','我也看见你了。各忙各的吧。','uncertain'],
 ['sight only / en','I can see you at the other gate.','I can see you too. I’m continuing on my way.','uncertain'],
];
for(const [label,user,actor,reason] of negative)test(`semantic true-negative ${label}`,async()=>{
 const f=await turn('合成角色','独立测试世界',user,actor);
 const outcome=f.resolve({state:'remote',reason});
 assert.equal(outcome.diagnostic,'scene-event-valid');
 assert.equal(outcome.decision?.action,'none');
 assert.equal(outcome.code,'handoff-remote-'+reason);
 assert.equal(f.r.scene,null);
});

test('current semantic non-entry wins over the old lexical handoff and the normal request remains intact',async()=>{
 const f=await turn('Arin','港口','我看见你了！','太好了，我也看见你了。你站在那别动，我这就朝你走过去。');
 assert.equal(f.resolve().decision?.entryPhase,'approaching');
 assert.equal(f.resolve({state:'remote',reason:'uncertain'}).decision?.action,'none');
 assert.equal(f.resolve({state:'separated',reason:'ended'}).decision?.action,'none');
 assert.deepEqual(f.prepared.messages.slice(1),requestMessages(f.compiled));
 assert.match(f.prepared.messages[0].content,/模式由玩家选择，约见信息不切换页面/);
 assert.doesNotMatch(f.prepared.messages[0].content,/physical-now/);
 const x=splitSceneReply(f.actor.text+'<elsewhere_scene_event>'+f.encode({state:'remote',reason:'uncertain'})+'</elsewhere_scene_event>');
 assert.equal(x.text,f.actor.text);
 assert.ok(x.payload);
});

test('validated legacy no-change and plan events take priority over lexical recovery',async()=>{
 const f=await turn('Arin','港口','我看见你了！','太好了，我也看见你了。你站在那别动，我这就朝你走过去。');
 assert.equal(f.resolve().decision?.action,'arrive');
 assert.equal(f.resolve({action:'none'}).decision?.action,'none');
 const plan=f.resolve({action:'plan',plan:{status:'proposed',evidence:[{id:f.user.id,quote:f.user.text,purpose:'proposal'}]}});
 assert.equal(plan.decision?.action,'plan');
 assert.equal(plan.decision?.plan?.status,'proposed');
});

test('positive metadata needs attributable current evidence, viable state and no known contradiction',async()=>{
 const f=await turn('Arin','港口','我看见你了！','太好了，我也看见你了。你站在那别动，我这就朝你走过去。');
 const positive=f.event('sighting','approaching');
 for(const invalid of [
  {...positive,context:'video'},
  {...positive,reason:'cancelled'},
  {...positive,state:'together'},
  {...positive,user:{...positive.user,id:'reply'}},
  {...positive,actor:{...positive.actor,quote:'伪造的角色原话'}},
  {...positive,where:'虚构地点'},
  {...positive,appointment:true},
 ])assert.equal(f.resolve(invalid).decision,undefined);
 assert.equal(f.resolve(positive,{requestId:'stale-ticket'}).decision,undefined);
 const later=await turn('Arin','港口','I’m taking the chair next to you.','I lower my voice to address you.',{moreInputs:['Actually, I changed my mind.']});
 assert.equal(later.resolve(later.event('nearby','interacting')).decision,undefined);
 const quote=await turn('Arin','港口','The script says "I take the chair next to you".','I lower my voice to address you.');
 const quoted=quote.event('nearby','interacting');
 quoted.user.quote='I take the chair next to you';
 assert.equal(quote.resolve(quoted).decision,undefined);
 const remote=await turn('Arin','港口','我还在船上，船没靠岸。','我正在朝你走过去。');
 assert.equal(remote.resolve(remote.event('sighting','approaching')).decision,undefined);
 const stale=await turn('Arin','港口','I’m taking the chair next to you.','I lower my voice to address you.');
 editMessage(stale.r,'chat',stale.user.id,'I have not arrived.',at+5);
 assert.equal(await sceneReplyMatches(stale.r,stale.data.user,stale.prepared.ticket,[stale.actor]),false);
});

test('no footer leaves unfamiliar wording undecided and a future appointment only saves a plan',async()=>{
 const f=await turn('Arin','港口','I put the petition on the cushion at your elbow.','I read it aloud to you from the dais.');
 assert.equal(f.resolve().decision,undefined);
 assert.equal(f.resolve().diagnostic,'scene-event-missing');
 const plan=await turn('Arin','港口','Shall we meet at the north gate tomorrow?','Yes, at the north gate tomorrow.');
 const d=plan.resolve({state:'planned',plan:{status:'confirmed',where:'north gate',timeText:'tomorrow',scheduledAt:at+86400000,expiresAt:at+90000000,evidence:[{id:plan.user.id,quote:plan.user.text,purpose:'proposal'},{id:'@reply',quote:plan.actor.text,purpose:'acceptance'}]}}).decision;
 assert.equal(d?.action,'plan');
 assert.equal(commitSceneDecision(plan.r,d!,at+10,'no-scene',()=>true),'plan');
 assert.equal(plan.r.scene,null);
 assert.equal(plan.r.meetingPlan?.where,'north gate');
});

test('semantic arrival uses a verified appointment only in its window and does not move the other participant',async()=>{
 const before:ChatMessage[]=[
  {id:'offer',speaker:'me',text:'Meet at the bronze door now?',at:at-120000},
  {id:'accept',speaker:'char',text:'Yes, the bronze door now.',at:at-119000},
 ];
 const plan:MeetingPlan={interpretation:'scene-state-v1',status:'confirmed',where:'bronze door',timeText:'now',scheduledAt:at-119000,expiresAt:at+3600000,proposedBy:'me',acceptedBy:['me','char'],sources:before.map(({id,text,at})=>({id,text,at,revisionCount:0}))};
 const f=await turn('Ianthe','royal chamber','I leave the stairs and come towards the bronze door.','I stay at the bronze door where you can find me.',{before,plan});
 const event=f.event('approaching','present');
 event.user.quote='come towards the bronze door';
 event.actor.quote='I stay at the bronze door';
 const decision=f.resolve({...event,appointment:true}).decision;
 assert.equal(decision?.location?.name,'bronze door');
 assert.equal(decision?.plan?.scheduledAt,plan.scheduledAt);
 assert.equal(f.resolve({...event,appointment:true,where:'east gate'}).decision,undefined);
 const future=await turn('Ianthe','royal chamber',f.user.text,f.actor.text,{before,plan:{...plan,scheduledAt:at+86400000,expiresAt:at+90000000}});
 assert.equal(future.resolve({...future.event('approaching','present'),appointment:true}).code,'handoff-outside-window');
 assert.equal(commitSceneDecision(f.r,decision!,at+10,'converging',()=>true,{requestId:'same-call',replyIds:[f.actor.id]}),'entered');
 assert.match(f.r.scene!.messages[0].text,/按原话继续靠近过程/);
 assert.doesNotMatch(f.r.scene!.messages[0].text,/对方表示要朝你走近|开始当面交谈/);
});

test('a source-backed semantic cancellation updates the plan without changing the scene or originals',async()=>{
 const f=await turn('Luz','estación','Cancela nuestra cita, por favor.','De acuerdo, no nos reuniremos hoy.');
 const originals=structuredClone(f.r.chats);
 const event={state:'remote',reason:'cancelled',plan:{status:'cancelled',evidence:[{id:f.user.id,quote:f.user.text,purpose:'cancellation'}]}};
 const outcome=f.resolve(event);
 assert.equal(outcome.decision?.action,'plan');
 assert.equal(outcome.code,'handoff-remote-cancelled');
 assert.equal(commitSceneDecision(f.r,outcome.decision!,at+10,'unused',()=>true),'plan');
 assert.equal(f.r.meetingPlan?.status,'cancelled');
 assert.equal(f.r.scene,null);
 assert.deepEqual(f.r.chats,originals);
});
