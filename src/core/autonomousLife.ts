import type {AppData,EventRecord,RoleData} from './types';
import type {PersonalSource,PersonalTicket} from './roleLife';
import {collectRoleLife,preparePersonalReply,personalTicketValid,applyPersonalReply} from './roleLife';
import {getActiveMessages} from './revisions';
import {getLocalDayBounds,toLocalDateKey} from './diary';
import {estimateTextTokens} from './contextBudget';
import {dateDayNumber} from './homeTasks';
import {lifeOrigin,lifeStageOccupied,stageIntervals,LIFE_ACTIONS,type RoleLifePlan,type LifeIntent} from './lifeExecution';
import {roleMemoryText} from './roleMemoryView';

export const LIFE_JOURNAL_KEY='elsewhere-life-budget-v1',LIFE_MAX_OUTPUT=2400;
const day=86400000;
export interface LifeTask {id:string;roleId:string;dateKey:string;at:number;from:number;to:number;status:'attempted'|'completed'|'quiet'|'failed'|'cancelled';error?:string;eventIds?:string[];planId?:string;outputTokenLimit?:number;dispatchedAt?:number;transport?:'not-sent'|'unknown'|'returned';usage?:{input?:number;output?:number}}
export interface LifeRecord {version:1|2;roleId:string;taskId:string;origin:'simulation';action:string;until:number;sources:PersonalSource[];planId?:string;stepId?:string;artifact?:import('./types').FootprintArtifact}
type Store=Pick<Storage,'getItem'|'setItem'>;
export function readLifeJournal(store:Store):LifeTask[] {
 const raw=store.getItem(LIFE_JOURNAL_KEY);if(!raw)return [];
 return decodeLifeJournal(JSON.parse(raw));
}
function originalTaskDayValid(task:LifeTask):boolean {
 const date=typeof task.dateKey==='string'?dateDayNumber(task.dateKey):null;
 // Legacy receipts have no timezone. This is date plausibility only, never a quota window.
 return date!==null&&task.at>=date*day-14*3600000&&task.at<date*day+36*3600000;
}
export function decodeLifeJournal(value:unknown):LifeTask[] {
 if(value===undefined)return [];
 const data=value as {version?:number;tasks?:LifeTask[]}|null;if(data?.version!==1||!Array.isArray(data.tasks)||data.tasks.some((t:LifeTask)=>!t||typeof t.id!=='string'||typeof t.roleId!=='string'||t.id!=='life:'+encodeURIComponent(t.roleId)+':'+t.dateKey||!originalTaskDayValid(t)||t.to!==t.at||t.from>t.to||!Number.isFinite(t.at)||!Number.isFinite(t.from)||!Number.isFinite(t.to)||!['attempted','completed','quiet','failed','cancelled'].includes(t.status)))throw Error('生活调用记录不可验证，自动推进已暂停');
 if(new Set(data.tasks.map((t:LifeTask)=>t.id)).size!==data.tasks.length)throw Error('生活调用记录重复，自动推进已暂停');
 return data.tasks;
}
export function writeLifeJournal(store:Store,tasks:LifeTask[]):void {store.setItem(LIFE_JOURNAL_KEY,JSON.stringify({version:1,tasks}));}
const allTasks=(roles:RoleData[],journal:LifeTask[])=>[...new Map([...roles.flatMap(r=>r.lifeTasks||[]),...journal].map(t=>[t.id,t])).values()];
export function lifeQuotaAvailable(tasks:LifeTask[],roleId:string,at:number):boolean {
 const dateKey=toLocalDateKey(at),id='life:'+encodeURIComponent(roleId)+':'+dateKey;
 return !tasks.some(t=>t.id===id||t.roleId===roleId&&t.at>at-day)&&tasks.filter(t=>t.at>at-day||t.dateKey===dateKey).length<2;
}
export function claimLifeTask(roles:RoleData[],r:RoleData,at:number,ready:boolean,journal:LifeTask[]=[]):LifeTask|null {
 if(!ready||!roles.some(x=>x.id===r.id)||lifeStageOccupied(r)||r.chatTiming?.pending.length||r.chatTiming?.inFlight||r.pendingReplies?.length||r.firstMessageState?.status!=='ready'&&!getActiveMessages(r.chats).some(m=>m.speaker==='char'))return null;
 const dateKey=toLocalDateKey(at),tasks=allTasks(roles,journal),id='life:'+encodeURIComponent(r.id)+':'+dateKey;
 if(r.events.some(e=>e.lifeRecord?.taskId===id||e.source==='autonomous-life-v1:'+id))return null;
 if(!lifeQuotaAvailable(tasks,r.id,at))return null;
 const from=Math.max(getLocalDayBounds(dateKey).startMs,at-6*3600000,r.firstMessageState?.updatedAt||Math.min(...getActiveMessages(r.chats).filter(m=>m.speaker==='char').map(m=>m.at)));
 if(at-from<2*3600000)return null;
 const lastContact=Math.max(0,...getActiveMessages(r.chats).map(m=>m.at));if(at-lastContact<3600000)return null;
 const task:LifeTask={id,roleId:r.id,dateKey,at,from,to:at,status:'attempted',outputTokenLimit:LIFE_MAX_OUTPUT};r.lifeTasks=[...(r.lifeTasks||[]),task];return task;
}
export function lifeTaskState(roles:RoleData[],r:RoleData,at:number,ready:boolean,enabled:boolean,journal:LifeTask[]=[],running=false):string {
 if(!enabled)return '自动推进已暂停；已保存的生活记录仍可查看。';
 const task=allTasks(roles,journal).find(t=>t.roleId===r.id&&t.dateKey===toLocalDateKey(at));
 if(task)return task.status==='attempted'?(running?'正在推进一段已过去的生活…':'上次任务尚未完成或已中断，额度已保留，今天不会重复请求。'):task.status==='quiet'?'本次推进没有需要单独记录的事情。':task.status==='completed'?(task.planId?'生活意图已保存；只有条件满足并执行成功的小活动才归档。':'本次生活已归档，今天不会重复生成。'):`本次未归档：${task.error||'任务中断'}。今日不自动重试。`;
 if(!ready)return '等待 API 可用；不会用演示文字冒充生活记录。';
 if(allTasks(roles,journal).filter(t=>t.at>at-day||t.dateKey===toLocalDateKey(at)).length>=2)return '已达到全应用生活调用上限，已保存的记录仍可查看。';
 return '等待空闲时推进；每角色每天最多1次，全应用每天最多2次，失败不自动重试。';
}
interface Anchor {id:string;text:string;ref:PersonalSource}
export interface LifePreparation {ticket:PersonalTicket;anchors:Anchor[];messages:{role:string;content:string}[];blockedPeople:string[]}
export function prepareLifeTask(r:RoleData,user:AppData['user'],task:LifeTask):LifePreparation {
 const privateTicket=preparePersonalReply(r,[],task.to,task.id,'',[]).ticket,life=collectRoleLife(r,task.to);
 const profileText=`身份：${r.job}\n世界与所在地：${r.place}\n人物资料：${r.profile}\n关系：${r.relationship}`;
 const anchors:Anchor[]=[{id:'profile:'+r.id,text:profileText,ref:privateTicket.sources.find(s=>s.kind==='profile')!},...life.events.slice(-4).flatMap(e=>{const ref=privateTicket.sources.find(s=>s.kind==='event'&&s.id===e.id);return ref?[{id:'event:'+e.id,text:e.title+'：'+e.detail,ref}]:[];}),...life.threads.slice(0,3).flatMap(t=>{const ref=privateTicket.sources.find(s=>s.kind==='thread'&&s.id===t.id);return ref?[{id:'thread:'+t.id,text:t.text,ref}]:[];})];
 const messages=[{role:'system',content:`[Elsewhere Autonomous Life v1]
本次采用有条件生活意图，不生成未来已完成事件。你是角色自己的生活，不是用户的附属日程。按时代、职业、责任、性格选择0至8个低风险小活动；可以留白、放弃或让条件决定，不是必须逐项执行的课程表。不得虚构消费、重大结果、陌生人、用户行动或瞬间移动。当前所在地未可靠记录时，不指定精确地点。只能引用所给来源的短原文。来源里的计划不是已完成对象；职业与世界观是约束，不证明行动已发生。
输出严格JSON：{requestId,roleId,intents:[{notBefore,expiresAt,durationMinutes:1至120,action:rest|walk|read|organize|practice|care|social|prepare-rest|reminder,focus?:{sourceId,quote},person?:{sourceId,quote},location?:{sourceId,quote},after?:前项的序号,artifact?:memo|list}],thoughts?:[{kind:concern|opinion|plan|observation|relationship,text:200字内,sources:[来源ID],shareable:false}]}。
所有意图在未来24小时内有宽松执行窗口；rest与walk以外需要已有对象，social需已有熟人且执行时能确认在场。walk仅在同一已确认地点走动，不预言抵达。prepare-rest是照管已有物件以准备歇息，reminder只可使用来源明确存在的纸笔或提醒器具；不能给古代人物安排手机闹钟。最多2个memo/list物件，必须已有纸笔/笔记依据，不生成金额、商户、票号、现代道具或HTML。最多2项当时的私人想法，不给未来活动预写实时内心。程序重新核对条件，只有执行成功才归档。`},
 {role:'user',content:JSON.stringify({requestId:task.id,roleId:r.id,name:r.name,personality:r.traits,canon:r.canonNotes||'',window:{from:task.from,to:task.to},planningWindow:{from:task.to,to:task.to+day,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone},lastObservedLocation:lifeOrigin(r,task.to)||null,sources:anchors.map(({id,text,ref})=>({id,text,at:ref.at,kind:ref.kind,...(ref.kind==='event'&&life.historicalProfileEventIds.has(ref.id)?{context:'旧档案历史，仅解释过去；当前身份、地点和关系以当前档案为准'}:{})})),roleMemory:roleMemoryText(r,task.to)})}];
 if(estimateTextTokens(messages.map(m=>m.content).join('\n'))>6000)throw Error('生活上下文超过本地预算，未裁掉Canon或发送请求');
 privateTicket.sources=anchors.map(a=>a.ref);
 return {ticket:privateTicket,anchors,messages,blockedPeople:[user.name,r.userAlias||''].filter(Boolean)};
}
function anchorValue(value:unknown,p:LifePreparation,mode:'focus'|'person'|'location',r:RoleData,eventAt:number):{text:string;ref:PersonalSource}|undefined {
 if(!value||typeof value!=='object')return;const a=value as Record<string,unknown>,source=p.anchors.find(s=>s.id===a.sourceId),quote=typeof a.quote==='string'?a.quote.trim():'';
 if(!source||source.ref.kind!=='profile'&&source.ref.at>eventAt||source.ref.kind==='thread'||!quote||quote.length>32||/[<>\[\]{}\n]/.test(quote)||!source.text.includes(quote))return;
 const index=source.text.indexOf(quote),clause=source.text.slice(Math.max(source.text.lastIndexOf('。',index),source.text.lastIndexOf('\n',index))+1).split(/[。\n]/)[0];
 if(/尚未|假设|如果|将来|未来|还未|未曾/.test(clause))return;
 if(mode==='location'&&quote!==r.place){
  const life=collectRoleLife(r,p.ticket.at);
  if(!life.events.some(e=>e.where===quote&&!life.historicalProfileEventIds.has(e.id)))return;
 }
 if(mode==='person'&&(source.ref.kind!=='profile'||p.blockedPeople.includes(quote)||!/^[\p{L} ·-]{2,32}$/u.test(quote)||/用户|玩家|创作者|你|\buser\b|\bplayer\b/i.test(quote)||!/朋友|恋人|同事|熟识|家人|父|母|兄|弟|姐|妹|friend|partner|colleague|family/i.test(clause)))return;
 return {text:quote,ref:source.ref};
}
export function lifeTaskValid(r:RoleData,task:LifeTask,p:LifePreparation):boolean {return task.status==='attempted'&&r.id===task.roleId&&r.lifeTasks?.some(t=>t.id===task.id&&t.status==='attempted')===true&&personalTicketValid(r,p.ticket);}
function commitLifeIntentPlan(r:RoleData,task:LifeTask,p:LifePreparation,data:Record<string,any>,at:number):EventRecord[]{
 if(data.requestId!==task.id||data.roleId!==r.id||Object.keys(data).some(k=>!['requestId','roleId','intents','thoughts'].includes(k))||data.intents.length>8||at<task.to||at>=task.to+10*60000||r.lifePlans?.some(plan=>plan.taskId===task.id))throw Error('生活意图身份或结构无效');
 const intents:LifeIntent[]=[],planId=task.id+':plan',sources=new Map<string,PersonalSource>([['profile:'+r.id,p.anchors[0].ref]]);let artifacts=0;
 for(const [i,item]of data.intents.entries()){
  if(!item||typeof item!=='object'||Object.keys(item).some(k=>!['notBefore','expiresAt','durationMinutes','action','focus','person','location','after','artifact'].includes(k))||!LIFE_ACTIONS.includes(item.action)||!Number.isFinite(item.notBefore)||!Number.isFinite(item.expiresAt)||item.notBefore<task.to||item.expiresAt<=item.notBefore||item.expiresAt>task.to+day||!Number.isInteger(item.durationMinutes)||item.durationMinutes<1||item.durationMinutes>120||item.after!==undefined&&(!Number.isInteger(item.after)||item.after<0||item.after>=i))throw Error('生活意图时间或条件无效');
  const focus=anchorValue(item.focus,p,'focus',r,task.to),person=anchorValue(item.person,p,'person',r,task.to),location=anchorValue(item.location,p,'location',r,task.to);
  if(item.focus&&!focus||item.person&&!person||item.location&&!location||!['rest','walk','social'].includes(item.action)&&!focus||item.action==='social'&&!person)throw Error('生活意图引用无效');
  if(item.artifact&&(!['memo','list'].includes(item.artifact)||++artifacts>2||!focus||!/纸|笔记|清单|便笺|羊皮|卷|paper|notebook|list|scroll/i.test(focus.text)))throw Error('物件没有已有材料依据');
  if(item.action==='reminder'&&(!focus||!/纸|笔记|清单|便笺|闹钟|手机|钟|paper|notebook|alarm|clock/i.test(focus.text)))throw Error('提醒器具没有依据');
  for(const anchor of [focus,person,location])if(anchor)sources.set(anchor.ref.kind+':'+anchor.ref.id,anchor.ref);
  intents.push({id:planId+':step:'+i,action:item.action,notBefore:item.notBefore,expiresAt:item.expiresAt,durationMinutes:item.durationMinutes,status:'pending',...(focus?{focus:focus.text}:{}),...(person?{person:person.text}:{}),...(location?{where:location.text}:{}),...(item.after!==undefined?{after:planId+':step:'+item.after}:{}),...(item.artifact?{artifact:item.artifact}:{})});
 }
 if(data.thoughts!==undefined&&(!Array.isArray(data.thoughts)||data.thoughts.length>2||data.thoughts.some((t:any)=>!t||t.shareable!==false||typeof t.text!=='string'||t.text.length>200||Object.keys(t).some(k=>!['kind','text','sources','shareable'].includes(k)))))throw Error('私人想法格式无效');
 if(data.thoughts?.length&&!applyPersonalReply(r,p.ticket,JSON.stringify({requestId:task.id,roleId:r.id,updates:data.thoughts}),at))throw Error('私人想法来源无效');
 const plan:RoleLifePlan={version:1,id:planId,taskId:task.id,roleId:r.id,acceptedAt:at,expiresAt:task.to+day,sources:[...sources.values()],origin:lifeOrigin(r,at),intents};
 r.lifePlans=[...(r.lifePlans||[]),plan];task.planId=planId;task.status=intents.length?'completed':'quiet';task.eventIds=[];return [];
}
/** Commit only closed, low-stakes primitives; model-authored prose never becomes an external outcome. */
export function commitLifeTask(r:RoleData,task:LifeTask,p:LifePreparation,raw:string,at:number):EventRecord[] {
 if(!lifeTaskValid(r,task,p)||raw.length>16000)throw Error('生活任务或来源已变化，未归档');
 let data;try{data=JSON.parse(raw);}catch{throw Error('生活响应不是完整JSON');}if(data&&Array.isArray(data.intents))return commitLifeIntentPlan(r,task,p,data,at);if(!data||data.requestId!==task.id||data.roleId!==r.id||Object.keys(data).some(k=>!['requestId','roleId','events','thoughts'].includes(k))||!Array.isArray(data.events)||data.events.length>3)throw Error('生活响应结构无效');
 const result:EventRecord[]=[],seen=new Set<string>();
 for(const [i,item]of data.events.entries()){
  if(!item||typeof item!=='object'||Object.keys(item).some(k=>!['at','action','durationMinutes','focus','person','location'].includes(k))||!Number.isFinite(item.at)||item.at<task.from||item.at>task.to||item.at>at||!Number.isInteger(item.durationMinutes)||item.durationMinutes<1||item.durationMinutes>30)throw Error('生活事件时间或字段无效');
  const until=item.at+item.durationMinutes*60000;if(until>task.to||[...(r.meetings||[]),...(r.plays||[]),...(r.scene?[r.scene]:[]),...(r.play?[r.play]:[])].some(s=>stageIntervals(s,task.to).some(w=>item.at<w.to&&until>w.from))||collectRoleLife(r,task.to).events.some(e=>item.at<(e.lifeRecord?.until??e.at+1)&&until>e.at)||result.some(e=>item.at<e.lifeRecord!.until&&until>e.at))throw Error('生活事件与实际场景时间冲突');
  const focus=anchorValue(item.focus,p,'focus',r,item.at),person=anchorValue(item.person,p,'person',r,item.at),location=anchorValue(item.location,p,'location',r,item.at);
  if(item.focus&&!focus||item.person&&!person||item.location&&!location)throw Error('生活事件引用无法验证');
  const details:Record<string,[string,string]>={rest:['短暂歇息',`${r.name}让自己歇了片刻。`],walk:['走动片刻',`${r.name}${location?'在'+location.text:''}走动了一会儿。`],read:['翻阅资料',`${r.name}翻看了关于「${focus?.text}」的已有资料。`],organize:['整理手头材料',`${r.name}整理了与「${focus?.text}」有关的手头材料。`],practice:['练习基本技巧',`${r.name}练习了与「${focus?.text}」有关的基本技巧。`],care:['日常照料',`${r.name}照看、维护了「${focus?.text}」。`],social:['短暂交谈',`${r.name}与${person?.text}说了几句近况。`]};
  const content=details[item.action];if(typeof item.action!=='string'||!Object.hasOwn(details,item.action)||!content||item.action==='social'&&!person||!['rest','walk','social'].includes(item.action)&&!focus)throw Error('不是可提交的低风险日常活动');
  const key=JSON.stringify([item.at,item.action,focus?.text,person?.text]);if(seen.has(key))throw Error('生活事件重复');seen.add(key);
  const sources=[p.anchors[0].ref,...[focus,person,location].flatMap(a=>a?[a.ref]:[])];
  result.push({id:task.id+':event:'+i,kind:'life',title:content[0],detail:content[1],at:item.at,where:location?.text,source:'autonomous-life-v1:'+task.id,status:'active',knownBy:[r.id],lifeEvidence:'confirmed',lifeRecord:{version:1,roleId:r.id,taskId:task.id,origin:'simulation',action:item.action,until,sources:[...new Map(sources.map(s=>[s.kind+':'+s.id,s])).values()]}});
 }
 if(result.some(e=>r.events.some(old=>old.id===e.id)))throw Error('该生活任务已经归档');
 if(data.thoughts!==undefined&&(!Array.isArray(data.thoughts)||data.thoughts.length>2||data.thoughts.some((t:Record<string,unknown>)=>!t||typeof t!=='object'||t.shareable!==false||Object.keys(t).some(k=>!['kind','text','sources','shareable'].includes(k)))))throw Error('私人关注结构无效');
 r.events.push(...result);
 if(data.thoughts?.length)applyPersonalReply(r,p.ticket,JSON.stringify({requestId:task.id,roleId:r.id,updates:data.thoughts}),at);
 task.status=result.length?'completed':'quiet';task.eventIds=result.map(e=>e.id);return result;
}
