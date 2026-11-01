import type {ChatMessage,MeetingPlan,RoleData,SceneData} from './types';
import {getActiveEvents,getActiveMessages,makeUid} from './revisions';
import {structuredMeetingPlan,sceneDecisionStillValid,type SceneDecision} from './sceneState';

// shortcut: deterministic explicit agreements only; ambiguous prose stays in chat until manual meeting.
function ownWords(text:string):string {
  return text.replace(/```[\s\S]*?```/g,'').replace(/^\s*>.*$/gm,'')
    .replace(/[“「『"][\s\S]*?[”」』"]/g,'').trim();
}
const hypothetical=/(如果|假如|要是|开玩笑|逗你|玩笑|台词|转述|他说|她说|我想说|比如)/;
const intent=/(见面|碰面|碰头|会合|相见|见吧|见好吗|见如何|见怎么样|等你|等我|找你|过去|过来)/;
const refusal=/(不能|没法|无法|不想|不愿|不方便|不行|不了|拒绝|不去|不见)/;
const cancellation=/(取消|改天再|下次再|别来了|不用来了|不必来了)/;
const uncertain=/不一定|可能|也许|到时再|再看看|看情况|有空再|尽量|争取/;
const unsupportedTime=/\d{4}[-/]\d{1,2}[-/]\d{1,2}|周末|下周|下星期|下个?月|明年|后年|明晚|明早|周[一二三四五六日天]|星期[一二三四五六日天]|(?:\d+|[一二三四五六七八九十]+)[天周月]后/;
const acceptance=/^(好[的啊呀吧，。！!\s]|好$|可以|行[，。！!啊吧\s]|行$|没问题|就这么定|说定了|一言为定|那就|嗯[，。！!\s]|嗯$)|我(?:会)?在.{1,30}等你|到时见|到时候见|不见不散/;
const snapshot=(m:ChatMessage)=>({id:m.id,at:m.at,text:m.text,revisionCount:m.revisionCount||0});
function number(text:string):number {
  if(/^\d+$/.test(text))return Number(text);
  const digits='零一二三四五六七八九';if(text==='两')return 2;
  if(text.includes('十')){const [a,b]=text.split('十');return (a?digits.indexOf(a):1)*10+(b?digits.indexOf(b):0);}
  return digits.indexOf(text);
}
function meetingTime(text:string,at:number):Pick<MeetingPlan,'timeText'|'scheduledAt'|'expiresAt'>|null {
  const explicitDate=text.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})[日号]/);
  const day=text.match(/大后天|后天|明天|今天|今晚|今早|今夜/),period=text.match(/凌晨|早上|上午|中午|下午|傍晚|晚上|今晚|今夜/);
  const clock=text.match(/(\d{1,2}|[零一二两三四五六七八九十]{1,3})\s*(?:[:：](\d{2})|点(?:(半)|(\d{1,2}|[零一二两三四五六七八九十]{1,3})分?)?)/);
  const immediate=/(现在|这就|马上)/.test(text);
  if(!explicitDate&&!day&&!period&&!clock&&!immediate)return null;
  const date=new Date(at);date.setHours(0,0,0,0);
  if(explicitDate){date.setFullYear(explicitDate[1]?Number(explicitDate[1]):date.getFullYear(),Number(explicitDate[2])-1,Number(explicitDate[3]));if(date.getMonth()!==Number(explicitDate[2])-1||date.getDate()!==Number(explicitDate[3]))return null;}
  else date.setDate(date.getDate()+(day?.[0]==='明天'?1:day?.[0]==='后天'?2:day?.[0]==='大后天'?3:0));
  const timeText=[explicitDate?.[0],day?.[0],period?.[0],clock?.[0]].filter(Boolean).join('')||'现在';
  if(immediate&&!explicitDate&&!day&&!period&&!clock)return {timeText,scheduledAt:at,expiresAt:at+2*3600000};
  if(clock){
    let h=number(clock[1]);const min=clock[3]?30:number(clock[2]||clock[4]||'0');
    if(/下午|傍晚|晚上|今晚|今夜/.test(period?.[0]||'')&&h<12)h+=12;
    if(period?.[0]==='中午'&&h<11)h+=12;
    if(h<0||h>23||min<0||min>59)return null;
    date.setHours(h,min);return {timeText,scheduledAt:date.getTime(),expiresAt:date.getTime()+4*3600000};
  }
  const hours=period?(/凌晨/.test(period[0])?[0,6]:/早上|上午/.test(period[0])?[6,12]:/中午/.test(period[0])?[11,14]:/下午/.test(period[0])?[12,18]:[18,24]):[0,24];
  const end=new Date(date);date.setHours(hours[0]);end.setHours(hours[1]);
  return {timeText,scheduledAt:date.getTime(),expiresAt:end.getTime()};
}
function meetingPlace(text:string):string|undefined {
  // Bound extraction to a preposition and a meeting/arrival verb, not arbitrary nearby nouns.
  const match=text.match(/(?<!现)(?:在|到|去)\s*([^，。！？!?；;\n]{1,32}?)(?:见面|碰面|碰头|会合|相见|等你|等我|见吧|见好吗|见如何|见怎么样|见[，。！？!?\s]|见$|到了|了[，。！？!?\s]|了$)/);
  let place=match?.[1]?.trim().replace(/^(?:了|达了|达)/,'').replace(/(?:再|一起|那里|那儿)$/,'');
  if(!place||/^(?:这|那|这里|那里|这儿|那儿|你那|你这|老地方|约好的地方|约定地点|时候|时)$/.test(place)||/[我你他她]|\d.*点|明天|今天|下午|晚上/.test(place))return undefined;
  return place;
}

/** Rebuild from active originals; cached plans never override edits, permissions or time. */
export function meetingPlan(r:RoleData,at:number):MeetingPlan|null {
  const semantic=structuredMeetingPlan(r,at);if(semantic)return semantic;
  const consumed=Math.max(0,...(r.meetings||[]).map(s=>s.startedAt));
  const denied=new Set(getActiveEvents(r.events).filter(e=>e.messageId&&e.knownBy?.length&&!e.knownBy.includes(r.id)).map(e=>e.messageId));
  const messages=getActiveMessages(r.chats).filter(m=>m.speaker!=='note'&&m.at<=at&&m.at>consumed&&!denied.has(m.id)).map((m,i)=>({m,i})).sort((a,b)=>a.m.at-b.m.at||a.i-b.i);
  let plan:MeetingPlan|null=null;
  let previous:ChatMessage|undefined;
  for(const {m} of messages){plan=advancePlan(plan,m,previous);previous=m;}
  return plan;
}
function advancePlan(plan:MeetingPlan|null,m:ChatMessage,previous?:ChatMessage):MeetingPlan|null {
  const text=ownWords(m.text);if(!text||hypothetical.test(text)||/(?:他|她|他们|她们|朋友|同事)(?:约你|约我|要去|去见|来见)|替.{0,8}(?:约|发消息)/.test(text)||m.kind&&m.kind!=='chat')return plan;
  if(m.speaker==='note')return plan;
  const speaker=m.speaker,source=snapshot(m);
  const contextual=Boolean(previous&&plan?.sources.some(source=>source.id===previous.id)&&m.at-previous.at<=15*60000);
  const meetingMention=intent.test(text)||/约定|约好|赴约|取消|别来了|不去了|不能去了|改天再|下次再/.test(text);
  if(plan&&(meetingMention||contextual)&&(cancellation.test(text)||refusal.test(text)))
    return {...plan,status:cancellation.test(text)?'cancelled':'declined',acceptedBy:[],sources:[...plan.sources,source]};
  const where=meetingPlace(text);let when=meetingTime(text,m.at);const question=/[？?]|好吗|可以吗|怎么样|如何/.test(text);
  if(!question&&uncertain.test(text))return plan&&(meetingMention||contextual)?{...plan,status:'proposed',acceptedBy:[speaker],sources:[...plan.sources,source]}:plan;
  if(unsupportedTime.test(text))return meetingMention||contextual?{status:'proposed',where:where||plan?.where,timeText:text.slice(0,120),proposedBy:speaker,acceptedBy:[speaker],sources:[...(plan?.sources||[]),source]}:plan;
  const offers=(intent.test(text)||Boolean(plan&&/改成|改到|改在|换到|不如|那就/.test(text)&&(where||when)))&&!refusal.test(text)&&!cancellation.test(text);
  const agrees=!question&&!refusal.test(text)&&!cancellation.test(text)&&(acceptance.test(text)||/^(?:那|到时)?我(?:会)?在.{1,30}等你/.test(text));
  if(!offers&&!agrees)return plan;
  const slotReply=Boolean(plan&&agrees&&when&&text.replace(/^(?:好[的啊呀]?|可以|行|那就)[，,。\s]*/,'').replace(when.timeText||'','').replace(/[，,。！!\s]/g,'')==='');
  if(!offers&&!contextual&&!slotReply)return plan;
  if(plan&&agrees&&(!where||where===plan.where)&&when?.timeText==='现在'&&plan.scheduledAt!==undefined&&Math.abs(m.at-plan.scheduledAt)<=15*60000)when=null;
  // A date-only confirmation must not broaden an already precise appointment.
  if(plan?.scheduledAt!==undefined&&when?.scheduledAt!==undefined&&when.expiresAt!==undefined&&!/[点:：]|现在/.test(when.timeText||'')&&plan.scheduledAt>=when.scheduledAt&&plan.scheduledAt<when.expiresAt)when=null;
  const changed=Boolean(plan&&((where&&where!==plan.where)||(when&&(when.scheduledAt!==plan.scheduledAt||when.expiresAt!==plan.expiresAt))));
  if((offers||(contextual||slotReply)&&agrees)&&(!plan||plan.status==='declined'||plan.status==='cancelled'||changed)){
    const inherit:MeetingPlan|null=plan&&changed?plan:null;
    plan={status:'proposed',where:where||inherit?.where,...(when||{timeText:inherit?.timeText,scheduledAt:inherit?.scheduledAt,expiresAt:inherit?.expiresAt}),proposedBy:speaker,acceptedBy:[speaker],sources:[...(inherit?.sources||[]),source]};
  }else if(plan&&plan.status!=='declined'&&plan.status!=='cancelled'&&agrees)
    plan={...plan,acceptedBy:[...new Set([...plan.acceptedBy,speaker])],sources:[...plan.sources,source]};
  if(plan&&plan.acceptedBy.length===2&&plan.where&&plan.scheduledAt!==undefined&&plan.expiresAt!==undefined)plan.status='confirmed';
  return plan;
}

export function isArrival(r:RoleData,text:string,at:number):boolean {
  if(r.scene||r.play)return false;
  const words=ownWords(text),plan=meetingPlan(r,at);
  if(plan?.interpretation==='scene-state-v1')return false;
  if(!words||hypothetical.test(words)||refusal.test(words)||cancellation.test(words)||uncertain.test(words)||/(没到|未到|没有到|还没|不是|快到|就到|将到|会到|等我到|到了再|昨天|前天|刚才|上次|明天|后天|朋友|同事|他说|她说)/.test(words))return false;
  if(!plan||plan.status!=='confirmed'||plan.scheduledAt===undefined||plan.expiresAt===undefined||at<plan.scheduledAt-30*60000||at>plan.expiresAt)return false;
  if(!/^(?:我(?:已经|刚刚|刚)?(?:到|抵达)|已经到了|到啦|到了|我看见你了|我已经在你面前|我就在你旁边)/.test(words))return false;
  if(/准备|打算|再告诉|再联系|去找|还要|要去/.test(words))return false;
  const arrivedPlace=words.match(/(?:我(?:已经|刚刚|刚)?(?:到了|到达(?:了)?|抵达(?:了)?))([^，。！？!?\n]{1,32})/);
  const actual=arrivedPlace?.[1]?.replace(/了$/,'').trim()||meetingPlace(words);
  const relative=actual&&/^(?:约好的地方|约定的地方|这里|这儿|那里|那儿)$/.test(actual);
  if(!/(到了|到啦|抵达|到达|到.{1,32}了|我看见你了|我已经在你面前|我就在你旁边)/.test(words))return false;
  return !actual||relative||actual===plan.where||Boolean(/^(门口|入口|楼下|前门)$/.test(actual)&&plan.where?.endsWith(actual));
}
export function isFarewell(text:string):boolean {
  const words=ownWords(text);
  return !hypothetical.test(words)&&!/(还不|不想|不能|不会|如果|你说|他说|她说)/.test(words)&&/(我(?:先|要|得)?(?:回家|走了|离开|告辞)|再见|我们(?:分开|道别)|下次见)/.test(words);
}
export function createEncounter(r:RoleData,arrival:ChatMessage|null,at:number,id:string,decision?:SceneDecision):SceneData|null {
  const semantic=decision&&sceneDecisionStillValid(r,decision)&&decision.action==='arrive'&&decision.arrival?.id===arrival?.id;
  if(r.scene||r.play||arrival&&(!getActiveMessages(r.chats).some(m=>m.id===arrival.id&&m.speaker==='me'&&m.text===arrival.text&&m.at===arrival.at)||!semantic&&!isArrival(r,arrival.text,at)))return null;
  const plan=semantic?decision.plan:meetingPlan(r,at),confirmed=plan?.status==='confirmed'&&(semantic||at>=(plan.scheduledAt??Infinity)-30*60000&&at<=(plan.expiresAt??-Infinity));
  const where=semantic?decision.location!.name:confirmed?plan.where!:'地点待确认';
  return {id,startedAt:at,where,...(confirmed?{agreement:structuredClone(plan),locationEvidence:{origin:'agreement' as const,at,sources:structuredClone(plan.sources)}}:{}),messages:[
    {id:id+':start',speaker:'note',text:`${where}。你们开始当面交谈。`,at,status:'active'},
    ...(arrival?[{...arrival,id:id+':arrival',sourceMessageId:arrival.id,kind:'scene'}]:[]),
  ]};
}

export function commitSceneDecision(r:RoleData,d:SceneDecision,at:number,id:string,persist:()=>boolean,origin?:{requestId:string;replyIds:string[];contextIds?:string[]}):'none'|'plan'|'entered'|'moved'|'left' {
  if(!sceneDecisionStillValid(r,d)||!Number.isFinite(at)||at<d.observation.now)throw new Error('场景或原话已变化，状态未写入');
  if(d.action==='none')return 'none';
  if(d.action==='leave')return 'left';
  const old=r.scene,before={where:old?.where,agreement:old?.agreement,proof:old?.locationEvidence,plan:r.meetingPlan,events:r.events.length};
  try{
    if(d.action==='arrive'){
      const arrival=r.chats.find(m=>m.id===d.arrival!.id)!;
      const scene=createEncounter(r,arrival,at,id,d);if(!scene)throw new Error('当前不能重复进入见面');r.scene=scene;
    }
    if(d.plan)r.meetingPlan=d.plan;
    if(d.location&&r.scene){
      const scene=r.scene;scene.where=d.location.name;
      scene.locationEvidence={origin:d.location.origin,at,sources:d.location.sources.map(s=>({id:s.id,text:s.text,at:s.at,revisionCount:s.revisionCount})),...(d.location.origin==='generated'?{contextIds:origin?.contextIds??d.observation.facts.filter(f=>f.layer==='identity'||f.layer==='currentState').map(f=>f.id)}:{})};
      if(d.plan?.status==='confirmed'&&(d.action==='arrive'||d.action==='reconcile'))scene.agreement=structuredClone(d.plan);
      if(JSON.stringify({where:scene.where,agreement:scene.agreement,proof:scene.locationEvidence})!==JSON.stringify({where:before.where,agreement:before.agreement,proof:before.proof})){
        const sourceMessages=[...scene.locationEvidence.sources,...[...r.chats,...scene.messages].filter(m=>origin?.replyIds.includes(m.id)).map(m=>({id:m.id,text:m.text,at:m.at,revisionCount:m.revisionCount||0}))];
        r.events.push({id:makeUid('ev'),kind:'scene',title:d.action==='move'?'见面中的实际移动':d.action==='reconcile'?'依据原约定更正见面地点':'确定本次见面地点',detail:`地点：${scene.where}；依据：${d.location.origin}；原地点：${before.where||'尚未进入'}；原消息：${scene.locationEvidence.sources.map(s=>s.id).join('、')||'根据获权角色背景生成的初始场景设定，不是既有历史事实'}。`,at,where:scene.where,source:scene.id,status:'active',knownBy:['user',r.id],...(origin?{messageId:origin.replyIds.at(-1),sceneChange:{requestId:origin.requestId,sceneId:scene.id,sources:sourceMessages,before:structuredClone({where:before.where||'地点待确认',agreement:before.agreement,locationEvidence:before.proof}),after:structuredClone({where:scene.where,agreement:scene.agreement,locationEvidence:scene.locationEvidence})}}:{})});
      }
    }
    if(!persist())throw new Error('场景状态保存失败，原现场已保留');
    return d.action==='arrive'?'entered':d.location?'moved':'plan';
  }catch(error){r.scene=old;if(old){old.where=before.where!;if(before.agreement)old.agreement=before.agreement;else delete old.agreement;if(before.proof)old.locationEvidence=before.proof;else delete old.locationEvidence;}r.meetingPlan=before.plan;r.events.length=before.events;throw error;}
}

/** Explicit correction only: retain original agreement, prose and past meeting records. */
export function updateEncounterLocation(r:RoleData,scene:SceneData,expectedWhere:string,value:string,at:number,persist:()=>boolean):boolean {
  if(r.scene!==scene||scene.endedAt!==undefined||scene.where!==expectedWhere)throw new Error('当前见面或地点已变化，请重新打开后修改');
  const where=value.trim();
  if(!where||where.length>120||/[\u0000-\u001f\u007f]/.test(value))throw new Error('请填写 1–120 字的单行地点');
  if(!Number.isFinite(at)||at<scene.startedAt)throw new Error('修改时间无效，原地点已保留');
  if(where===scene.where)return false;
  const eventsBefore=r.events.length,proofBefore=scene.locationEvidence;
  try{
    scene.where=where;
    scene.locationEvidence={origin:'manual',at,sources:[]};
    r.events.push({id:makeUid('ev'),kind:'scene',title:'更正本次见面地点',detail:`用户确认本次见面地点为「${where}」（原地点记录：「${expectedWhere}」）；不改写此前对白及约定。`,at,where,source:scene.id,speaker:'me',status:'active',knownBy:['user',r.id]});
    if(!persist())throw new Error('地点保存失败，原地点已保留，请重试');
    return true;
  }catch(error){scene.where=expectedWhere;if(proofBefore)scene.locationEvidence=proofBefore;else delete scene.locationEvidence;r.events.length=eventsBefore;throw error;}
}

export function encounterHistory(r:RoleData,messages:ChatMessage[]|undefined):ChatMessage[] {
  const originals=new Map(getActiveMessages(r.chats).map(m=>[m.id,m]));
  return getActiveMessages(messages).filter(m=>{
    if(!m.sourceMessageId)return true;
    const source=originals.get(m.sourceMessageId);
    return source?.speaker===m.speaker&&source.text===m.text&&source.at===m.at&&(source.revisionCount||0)===(m.revisionCount||0);
  });
}
