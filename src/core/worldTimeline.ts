import type {ApiSettings,AppData,ChatMessage,EventRecord,RoleData} from './types';
import {validWorldZone,worldDate,worldDay} from './worldClock';
import {completionLimit} from './outputBudget';
import {estimateTextTokens} from './contextBudget';
import {collectRoleLife,lifeSourcesValid,splitPersonalReply,type PersonalSource} from './roleLife';
import {lifePlanShape,lifeStageOccupied,stageIntervals} from './lifeExecution';
import {phoneMessagesAt,scenePlaceAt} from './messageProvenance';

const minute=60_000;
const actions={sleep:['睡觉','睡觉休息'],rest:['休息','休息了一会'],work:['工作','做自己的日常工作'],eat:['吃饭','吃了一餐'],drink:['喝咖啡','喝咖啡'],walk:['散步','散步'],read:['阅读','阅读'],shop:['购买日用品','买了日用品'],social:['闲聊','和在场的熟人或工作人员闲聊'],travel:['途中','在当地移动']} as const;
type Action=keyof typeof actions;
type Span=[number,number];
export interface TimelineEntry {
 requestId:string;key:string;generatedAt:number;state:'pending'|'running'|'ended'|'interrupted'|'expired';
 from:number;to:number;destination?:string;
}
export interface TimelineTicket {
 id:string;roleId:string;zone:string;at:number;start:number;end:number;cutoff:number;gaps:Span[];
 profile:PersonalSource;life:boolean;mode:'chat'|'diary'|'thought';
}
interface Aux {
 requestId?:unknown;roleId?:unknown;life?:unknown;thought?:unknown;thoughts?:unknown;
}
export interface ThoughtRecord {
 requestId:string;roleId:string;anchorId:string;group:{id:string;version:string}[];
 text:string;scope:'message'|'turn';
}

const own=(object:object,key:PropertyKey)=>Object.hasOwn(object,key);
const isAction=(value:unknown):value is Action=>typeof value==='string'&&own(actions,value);
const profileValue=(r:RoleData)=>JSON.stringify([r.name,r.job,r.traits,r.place,r.profile,r.relationship,r.canonNotes,r.notes]);
const eventId=(roleId:string,id:string,key:string)=>'timeline:'+encodeURIComponent(roleId)+':'+encodeURIComponent(id)+':'+key;
const version=(m:ChatMessage)=>JSON.stringify([m.text,m.revisionCount||0,m.editedAt,m.at,m.replyTurnId]);
function safePhrase(value:unknown,max:number):string|undefined {
 return typeof value==='string'&&value.trim()&&value.length<=max&&!/[<>\u0000-\u001f]/.test(value)?value.trim():undefined;
}
const overlaps=(from:number,to:number,spans:Span[])=>spans.some(([a,b])=>from<b&&to>a);
const isRealStage=(stage:{startedAt:number;endedAt?:number})=>Number.isFinite(stage.startedAt);

function occupancy(r:RoleData,at:number):Span[] {
 return [...(r.meetings||[]),...(r.plays||[]),...(r.scene?[r.scene]:[]),...(r.play?[r.play]:[])]
  .filter(isRealStage).flatMap(stage=>stageIntervals(stage,at).map(w=>[w.from,w.to]));
}

function legacyRunningSpans(r:RoleData,at:number):Span[] {
 return (r.lifePlans||[]).filter(plan=>lifePlanShape(r,plan)&&plan.acceptedAt<=at&&lifeSourcesValid(r,plan.sources,at))
  .flatMap(plan=>plan.intents.filter(step=>step.status==='running'&&Number.isFinite(step.startedAt)&&Number.isFinite(step.until)&&step.startedAt!<=at&&step.until!>step.startedAt!)
   .map((step):Span=>[step.startedAt!,step.until!]));
}

function recordedSpans(r:RoleData,at:number):Span[] {
 const entries=r.events.filter(e=>e.lifeRecord?.version===3&&['ended','running','interrupted'].includes(e.lifeRecord.timeline?.state||''));
 return [...occupancy(r,at),...legacyRunningSpans(r,at),...collectRoleLife(r,at).events.filter(e=>e.lifeRecord?.version!==3).map((e):Span=>[e.at,e.lifeRecord?.until??e.at+1]),
  ...entries.map((e):Span=>[e.at,e.lifeRecord!.until])];
}

function missingSpans(from:number,to:number,occupied:Span[]):Span[] {
 const gaps:Span[]=[];
 let start=from;
 for(const [a,b] of [...occupied].sort((x,y)=>x[0]-y[0])){
  if(a>=to)break;
  if(b<=start)continue;
  if(a>start)gaps.push([start,Math.min(a,to)]);
  start=Math.max(start,b);
 }
 if(start<to)gaps.push([start,to]);
 return gaps;
}

export function prepareTimeline(data:AppData,r:RoleData,at:number,id:string,mode:TimelineTicket['mode'],dateKey?:string,through=Infinity) {
 const zone=data.worldTimeZone,limit=completionLimit(data.settings,mode==='diary'?'diary':'chat');
 if(!validWorldZone(zone)||!Object.keys(limit).length)return;
 const {startMs:start,endMs}=worldDay(dateKey||worldDate(at,zone),zone);
 const end=endMs+1,cutoff=Math.min(end,at,through),life=mode!=='thought'&&data.settings.autonomousLife!==false;
 if(mode==='diary'&&!life)return;
 const occupied=life?recordedSpans(r,cutoff):[];
 const gaps=life?missingSpans(start,cutoff,occupied).flatMap(([a,b])=>{
  const from=Math.ceil((a-start)/minute),to=Math.floor((b-start)/minute);
  return from<to?[[from,to] as Span]:[];
 }):[];
 const profile:PersonalSource={kind:'profile',id:r.id,at,version:profileValue(r)};
 const ticket:TimelineTicket={id,roleId:r.id,zone,at,start,end,cutoff,gaps,profile,life,mode};
 const extra=Math.min(1536,128+32*Math.ceil(gaps.reduce((n,[a,b])=>n+b-a,0)/60)+48*gaps.length+(mode==='diary'?0:192));
 const present=timelineState(r,at);
 const rules=mode==='diary'?
  '可用独立一行 [[life:候选id]] 引用本次已结束活动。若同时附上 life 字段，其余段落只能写 [[reflection]] 我觉得/我希望… 的主观感受。禁止在自由正文复述候选，禁止引用未来或进行中活动。':
  '正文仍使用原有气泡分隔。thought 是整轮第一人称虚构内心独白。thoughts 可给气泡提供独立独白，每项用零基 index、原正文内唯一 anchor 和 text。玩家读心不改变角色或玩家角色的知情范围。不要输出分析或隐藏推理。';
 const fields=JSON.stringify({requestId:id,roleId:r.id,...(life?{life:[{id:'a',from:0,to:60,action:'sleep',where:'可选地点'}]}:{}),...(mode!=='diary'?{thought:'我当时的想法',thoughts:[{index:0,anchor:'正文原句',text:'我当时的想法'}]}:{})});
 const facts=mode==='thought'?'':JSON.stringify({worldTimeZone:zone,dayStart:start,cutoff,end,missingElapsedMinutes:gaps,knownRegion:r.place,current:present?.label,location:present?.where});
 const instruction=`[Elsewhere Timeline] 保持主要回复完整，把附带字段合并到已有 elsewhere_private_state JSON（标签拼写沿用上文）或在正文后附加 <elsewhere_private_state>${fields}</elsewhere_private_state>。只用 roleId、requestId 和给出的字段。心声不是对白。 ${rules}
${life?'生活按世界日零点以来的实际分钟 from/to 划连续区间，优先补齐缺口，可用一个区间覆盖数小时；至多两个未来安排。动作 sleep/rest/work/eat/drink/walk/read/shop/social/travel。地点参考已有地区和当前位置，移动用 travel 加 destination。只创造低影响日常，不伪造玩家参与、重要承诺、关系、大额财产或他人的重要决定。正文不要声称候选活动已发生，避免与当前状态冲突。无把握留空。':''}
${facts}
[/Elsewhere Timeline]`;
 if(estimateTextTokens(instruction)>900)return;
 return {ticket,instruction,limit:increaseLimit(data.settings,mode==='diary'?'diary':'chat',extra),extra};
}

export function increaseLimit(settings:ApiSettings,mode:'chat'|'diary',extra:number) {
 const limit=completionLimit(settings,mode),bounded=Math.max(0,Math.min(1536,extra));
 return limit.max_tokens?{max_tokens:limit.max_tokens+bounded}:limit.max_completion_tokens?{max_completion_tokens:limit.max_completion_tokens+bounded}:limit;
}

export function withTimeline(messages:{role:string;content:string}[],instruction:string|undefined) {
 if(!instruction)return messages;
 const index=messages.findIndex(m=>m.role==='system');
 if(index<0)return [{role:'system',content:instruction},...messages];
 return messages.map((m,i)=>i===index?{...m,content:m.content+'\n\n'+instruction}:m);
}

export function timelinePayload(payload:string|undefined):Aux|undefined {
 try{const value=JSON.parse(payload||'null');return value&&typeof value==='object'&&!Array.isArray(value)?value:undefined;}catch{return;}
}

function bound(payload:Aux|undefined,roleId:string,id:string):payload is Aux {
 return !!payload&&payload.roleId===roleId&&payload.requestId===id;
}

function knownPlace(r:RoleData,where:string):boolean {
 return !!r.place&&(where===r.place||where.startsWith(r.place+'的')&&/^(?:咖啡馆|餐馆|食堂|商店|市场|工作地点|住所|车站|街道|码头|茶馆|书店|公园)$/.test(where.slice(r.place.length+1)))||
  [...(r.meetings||[]),...(r.scene?[r.scene]:[])].some(scene=>scenePlaceAt(r,scene,scene.endedAt??scene.startedAt)===where);
}

function latestPlace(r:RoleData,at:number):string|undefined {
 const places=r.events.flatMap(e=>{
  if(!timelineEvidence(r,e,at)||!['running','ended','interrupted'].includes(e.lifeRecord!.timeline!.state))return [];
  return [{where:e.lifeRecord!.timeline!.state==='ended'?e.lifeRecord!.timeline!.destination||e.where:e.where,at:e.lifeRecord!.action==='travel'?e.lifeRecord!.until:e.at}];
 });
 for(const scene of r.meetings||[]){
  if(scene.endedAt===undefined||scene.endedAt>at)continue;
  const where=scenePlaceAt(r,scene,scene.endedAt);
  if(where&&!/未确认|待确认|未知/.test(where))places.push({where,at:scene.endedAt});
 }
 return places.filter(p=>p.where&&p.at<=at&&at-p.at<=86_400_000).sort((a,b)=>b.at-a.at)[0]?.where;
}

export function applyTimeline(r:RoleData,ticket:TimelineTicket,payload:Aux|undefined,at:number,blocked:Span[]=[],publicText='') {
 const accepted=new Map<string,EventRecord>();
 const result={accepted,rejected:0};
 if(!bound(payload,r.id,ticket.id)||!Array.isArray(payload.life)||payload.life.length>32||!ticket.life||ticket.mode==='thought'||
  r.id!==ticket.roleId||!lifeSourcesValid(r,[ticket.profile],at)||r.events.some(e=>e.lifeRecord?.timeline?.requestId===ticket.id))return result;
 if(!validWorldZone(ticket.zone)||![ticket.at,ticket.start,ticket.end,ticket.cutoff,at].every(Number.isFinite)||
  ticket.start>ticket.cutoff||ticket.cutoff>ticket.at||ticket.at>at||ticket.cutoff>ticket.end||ticket.end-ticket.start>26*3600000||
  !Array.isArray(ticket.gaps)||ticket.gaps.some(gap=>!Array.isArray(gap)||gap.length!==2||!gap.every(Number.isInteger)))return result;
 const claimsPlaces=r.events.map(e=>e.where).filter((s):s is string=>!!s&&s.length>=2);
 const occupied=[...recordedSpans(r,at),...blocked];
 const declaredAction=(Object.keys(actions) as Action[]).find(action=>
  new RegExp('我(?:现在|此刻)?(?:正在|在)'+actions[action][0]+'(?:[。！？，、\\s]|$)').test(publicText));
 const ancient=/古希腊|古罗马|先秦|上古|伊萨卡|Ithaca|Telemachus/i.test([r.name,r.place,r.profile,r.canonNotes].join(' '))&&
  !/现代|当代|赛博|modern|contemporary|cyber/i.test([r.place,r.profile,r.canonNotes].join(' '));
 const candidates=[...payload.life].sort((a,b)=>Number(a?.from)-Number(b?.from));
 let planned=0;
 for(const item of candidates){
  const key=item?.id,action=item?.action,from=ticket.start+item?.from*minute,to=ticket.start+item?.to*minute;
  const where=safePhrase(item?.where,70),destination=safePhrase(item?.destination,70);
  const duration=to-from,elapsed=to<=ticket.cutoff,active=from<=ticket.cutoff&&to>at&&ticket.cutoff===ticket.at;
  const future=from>ticket.cutoff&&from>=at&&ticket.at<ticket.end;
  const pastEnd=Math.min(item?.to,Math.floor((ticket.cutoff-ticket.start)/minute));
  const hasPast=from<ticket.cutoff&&pastEnd>item?.from;
  const inGap=!hasPast||ticket.gaps.some(([a,b])=>item.from>=a&&pastEnd<=b);
  const previous=latestPlace(r,from);
  const validDestination=action==='travel'&&where&&destination&&where!==destination&&duration>=15*minute&&knownPlace(r,where)&&knownPlace(r,destination);
  const hasUnsupportedLocation=item?.where!==undefined&&!where||where&&!knownPlace(r,where);
  const contradicts=active&&declaredAction&&action!==declaredAction||elapsed&&/我(?:早上|上午|中午|下午|晚上|刚才|之前)[^。！？\n]{0,24}(?:在|去|喝|吃|工作|休息|买|见)/.test(publicText)||active&&where&&claimsPlaces.some(place=>place!==where&&publicText.includes(place))||
   active&&where&&/我(?:现在|正在|就在|在)[^。！？\n]{1,28}(?:馆|店|家|公司|医院|车站|机场|公园)/.test(publicText)&&!publicText.includes(where);
  if(typeof key!=='string'||!/^[a-zA-Z0-9_-]{1,24}$/.test(key)||accepted.has(key)||!isAction(action)||
   !Number.isInteger(item.from)||!Number.isInteger(item.to)||from<ticket.start||from>=ticket.end||
   to>(elapsed?ticket.end:Math.max(ticket.end,ticket.at+12*3600000))||duration<minute||
   (!elapsed&&!active&&!future)||!inGap||overlaps(from,to,occupied)||future&&planned>=2||
   hasUnsupportedLocation||where&&previous&&where!==previous||action==='travel'&&!validDestination||action!=='travel'&&item.destination!==undefined||
   ancient&&(action==='drink'||[where,destination].some(place=>place?.endsWith('咖啡馆')))||contradicts){
   result.rejected++;continue;
  }
  const [title,verb]=actions[action],id=eventId(r.id,ticket.id,key);
  const state=elapsed?'ended':future?'pending':'running';
  const e:EventRecord={id,kind:'life',title,detail:'我'+verb+'。',at:from,where,source:'timeline:'+ticket.id,status:'active',
   knownBy:[r.id],...(state!=='pending'?{lifeEvidence:'confirmed' as const}:{}),lifeRecord:{version:3,roleId:r.id,taskId:ticket.id,origin:'simulation',action,until:to,sources:[ticket.profile],
    timeline:{requestId:ticket.id,key,generatedAt:at,state,from,to,destination}}};
  occupied.push([from,to]);r.events.push(e);accepted.set(key,e);
  if(future)planned++;
 }
 return result;
}

export function timelineEvidence(r:RoleData,e:EventRecord,at:number):boolean {
 const record=e.lifeRecord,t=record?.timeline;
 if(record?.version!==3||!t||typeof t.requestId!=='string'||!t.requestId||t.requestId.length>120||
  typeof t.key!=='string'||!/^[a-zA-Z0-9_-]{1,24}$/.test(t.key)||!isAction(record.action)||record.roleId!==r.id||t.requestId!==record.taskId||e.source!=='timeline:'+t.requestId||
  e.id!==eventId(r.id,t.requestId,t.key)||e.kind!=='life'||e.lifeEvidence!=='confirmed'||e.status!=='active'||!e.knownBy?.includes(r.id)||
  ![e.at,t.from,t.to,t.generatedAt,record.until].every(Number.isFinite)||e.at!==t.from||e.at>at||record.until<=e.at||record.until>t.to||
  t.to-t.from>26*3600000||!['running','ended','interrupted'].includes(t.state)||e.title!==actions[record.action][0]||e.detail!=='我'+actions[record.action][1]+'。'||
  record.sources?.length!==1||record.sources[0]?.kind!=='profile'||record.sources[0].id!==r.id||!Number.isFinite(record.sources[0].at)||record.sources[0].at>t.generatedAt||r.events.filter(item=>item.id===e.id).length!==1)return false;
 try {
  const snapshot=JSON.parse(record.sources[0].version);
  return Array.isArray(snapshot)&&snapshot.length===8&&snapshot.every(field=>field===null||typeof field==='string');
 }catch{return false;}
}

export function timelineState(r:RoleData,at:number) {
 const current=r.events.find(e=>e.lifeRecord?.timeline?.state==='running'&&e.lifeRecord.timeline.generatedAt<=at&&e.lifeRecord.until>at&&timelineEvidence(r,e,at)&&
  lifeSourcesValid(r,e.lifeRecord.sources,at));
 if(!current)return;
 return {kind:'life' as const,label:current.title,where:current.lifeRecord!.action==='travel'?'途中':current.where||'',at:current.at,until:current.lifeRecord!.until,sourceId:current.id};
}

export function advanceTimeline(r:RoleData,at:number,allowed:boolean,blocked:Span[]=[]):boolean {
 let changed=false;
 const legacy=legacyRunningSpans(r,at);
 const active=r.events.filter(e=>e.lifeRecord?.version===3&&e.status==='active').sort((a,b)=>a.at-b.at);
 for(const e of active){
  const rec=e.lifeRecord!,t=rec.timeline;
  if(!t||!['running','pending'].includes(t.state))continue;
  const legacyRunning=overlaps(t.from,Math.min(t.to,at+1),legacy);
  const conflicts=[...occupancy(r,at+1),...blocked].filter(([from,to])=>from<Math.min(t.to,at+1)&&to>t.from);
  const occupied=!allowed||legacyRunning||lifeStageOccupied(r)||conflicts.length>0;
  const valid=lifeSourcesValid(r,rec.sources,at);
  if(t.state==='running'){
   if(!valid||occupied){
    const interruptedAt=Math.max(e.at,Math.min(at,rec.until,...conflicts.map(span=>span[0])));
    t.state=interruptedAt<=e.at?'expired':'interrupted';rec.until=interruptedAt;changed=true;
   }else if(at>=rec.until){t.state='ended';changed=true;}
  }else if(at>=t.to||!valid){t.state='expired';changed=true;}
  else if(at>=t.from&&!occupied&&!timelineState(r,at)){
   const previous=latestPlace(r,at);
   if(e.where&&previous&&e.where!==previous)continue;
   e.at=at;t.from=at;t.state='running';e.lifeEvidence='confirmed';changed=true;
  }
 }
 return changed;
}

export function resolveDiaryLife(text:string,result:ReturnType<typeof applyTimeline>,at:number,structured=false):string|null {
 const sections:string[]=[];
 for(const section of text.trim().split(/\n\s*\n/)){
  const match=/^\[\[life:([\w-]+)\]\]$/.exec(section.trim());
  if(match){
   const event=result.accepted.get(match[1]);
   if(event?.lifeRecord?.timeline?.state==='ended'&&event.lifeRecord.until<=at)sections.push(event.detail);
  }else{
   if(/\[\[life\s*:/.test(section))return null;
   if(structured){
    const reflection=/^\[\[reflection\]\]\s*(我(?:觉得|希望|想|仍在想)[^<>]{1,180})$/u.exec(section.trim());
    if(!reflection||/(?:发生了|已经|今天|昨天|刚才|答应了|完成了|买了|见过|去了|来到|付了|答应|和你)/.test(reflection[1]))return null;
    sections.push(reflection[1]);
   }else sections.push(section);
  }
 }
 return sections.join('\n\n')||null;
}

export function attachThoughts(r:RoleData,bubbles:ChatMessage[],payload:Aux|undefined,id:string):void {
 if(!bound(payload,r.id,id)||!bubbles.length||bubbles.some(m=>m.speaker!=='char'))return;
 const fallback=safePhrase(payload.thought,280),individual=Array.isArray(payload.thoughts)?payload.thoughts.slice(0,16):[];
 const group=bubbles.map(m=>({id:m.id,version:version(m)}));
 for(const [i,message] of bubbles.entries()){
  const matching=individual.filter(item=>item?.index===i&&typeof item.anchor==='string'&&item.anchor.length>0&&item.anchor.length<=120&&
   message.text.includes(item.anchor)&&bubbles.filter(m=>m.text.includes(item.anchor)).length===1);
  const direct=matching.length===1?safePhrase(matching[0].text,280):undefined;
  const text=direct||fallback;
  if(text)message.privateThought={requestId:id,roleId:r.id,anchorId:message.id,group,text,scope:direct?'message':'turn'};
 }
}

export function replyThought(r:RoleData,m:ChatMessage):{text:string;scope:ThoughtRecord['scope']}|undefined {
 const record=m.privateThought;
 if(!record||record.roleId!==r.id||record.anchorId!==m.id||m.speaker!=='char'||!m.replyTurnId||!Array.isArray(record.group)||
  !record.group.length||record.group.length>32||!record.group.some(p=>p?.id===m.id)||!safePhrase(record.text,280)||
  !['message','turn'].includes(record.scope))return;
 const effective=phoneMessagesAt(r,Infinity);
 if(!record.group.every(ref=>ref&&effective.some(item=>item.id===ref.id&&item.speaker==='char'&&item.replyTurnId===m.replyTurnId&&version(item)===ref.version)))return;
 return {text:record.text,scope:record.scope};
}

export function latestReplyThought(r:RoleData,at:number) {
 for(const m of phoneMessagesAt(r,at).slice(-16).reverse()){
  const thought=replyThought(r,m);
  if(thought&&m.privateThought!.group.every(ref=>r.chats.some(item=>item.id===ref.id&&item.at<=at)))return thought.text;
 }
}

export function splitTimelineReply(text:string) {
 const reply=splitPersonalReply(text);
 return {...reply,aux:timelinePayload(reply.payload)};
}
