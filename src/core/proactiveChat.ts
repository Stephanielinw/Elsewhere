import type {RoleData} from './types';
import {collectRoleLife,splitPersonalReply} from './roleLife';
import {getActiveMessages,makeUid} from './revisions';
const day=86400000;
export interface ProactiveTask {
 id:string;roleId:string;topicId:string;topic:string;topicVersion:string;chatVersion:string;at:number;
 status:'attempted'|'queued'|'sent'|'skipped'|'failed'|'cancelled';error?:string;
}
export interface ProactiveState {attempts:ProactiveTask[];sentTopics:string[]}
const chatVersion=(r:RoleData,id='')=>JSON.stringify(getActiveMessages(r.chats).filter(m=>m.replyTurnId!==id).map(m=>[m.id,m.speaker,m.at,m.text,m.revisionCount||0]));
function topics(r:RoleData,at:number) {
 const {threads,events,historicalProfileEventIds}=collectRoleLife(r,at);
 const currentProfile=JSON.stringify([r.name,r.job,r.traits,r.place,r.profile,r.relationship,r.canonNotes,r.notes]);
 return [...threads.filter(t=>t.shareable&&at-t.at<=14*day).map(t=>({id:'thread:'+t.key,text:t.text,version:JSON.stringify(t)})),
 ...events.filter(e=>at-e.at<=7*day).reverse().map(e=>({id:'event:'+e.id,text:(historicalProfileEventIds.has(e.id)?'旧档案历史（'+new Date(e.at).toISOString()+'），当前身份、地点和关系以当前档案为准：':'')+e.title+'：'+e.detail,version:JSON.stringify(historicalProfileEventIds.has(e.id)?[e,currentProfile]:e)}))];
}
/** An unsent topic makes outreach possible, not mandatory: the same generation can decline. */
export function claimProactive(roles:RoleData[],r:RoleData,at:number,ready:boolean):ProactiveTask|null {
 if(!ready||!roles.includes(r)||r.scene||r.play||r.chatTiming?.pending.length||r.chatTiming?.inFlight||r.pendingReplies?.length||!getActiveMessages(r.chats).some(m=>m.speaker==='char'))return null;
 const lastContact=Math.max(0,...getActiveMessages(r.chats).map(m=>m.at));
 if(at-lastContact<6*3600000)return null;
 const attempts=r.proactive?.attempts||[];
 if(attempts.some(t=>at-t.at<day)||roles.flatMap(r=>r.proactive?.attempts||[]).filter(t=>at-t.at<day).length>=2)return null;
 const topic=topics(r,at).find(t=>!r.proactive?.sentTopics.includes(t.id));if(!topic)return null;
 const task:ProactiveTask={id:makeUid('contact'),roleId:r.id,topicId:topic.id,topic:topic.text.slice(0,600),topicVersion:topic.version,chatVersion:chatVersion(r),at,status:'attempted'};
 r.proactive={attempts:[...attempts.filter(t=>at-t.at<=14*day),task],sentTopics:r.proactive?.sentTopics||[]};return task;
}
export function proactiveTaskValid(r:RoleData,t:ProactiveTask):boolean {
 return r.id===t.roleId&&!r.scene&&!r.play&&!r.chatTiming?.pending.length&&!r.chatTiming?.inFlight&&Boolean(r.proactive?.attempts.some(x=>x.id===t.id&&(x.status==='attempted'||x.status==='queued')))&&chatVersion(r,t.id)===t.chatVersion&&topics(r,Math.max(Date.now(),t.at)).some(topic=>topic.id===t.topicId&&topic.version===t.topicVersion);
}
export function finishProactive(r:RoleData,t:ProactiveTask,status:ProactiveTask['status'],error?:string):void {
 const saved=r.proactive?.attempts.find(x=>x.id===t.id);if(!saved)return;saved.status=status;saved.error=error;
 if(status==='sent')recordProactiveDelivery(r,t);
}
export function recordProactiveDelivery(r:RoleData,t:ProactiveTask):void {
 if(r.proactive&&!r.proactive.sentTopics.includes(t.topicId))r.proactive.sentTopics.push(t.topicId);
}
export function recoverProactive(r:RoleData):void {
 for(const t of r.proactive?.attempts||[]){
  if(t.status==='attempted')finishProactive(r,t,'failed','页面关闭中断；保留冷却，不自动重试');
  if(t.status==='queued'&&!r.pendingReplies?.some(j=>j.proactiveId===t.id))finishProactive(r,t,'cancelled');
 }
}
export function proactiveInstruction(t:ProactiveTask):string {
 return `这次是你没有收到新用户消息时自主决定是否联系对方。可谈素材：${t.topic}。结合自己的性格、关系、实际处境判断是否有值得现在说的话；没有就不发，不为完成任务制造问候、新闻或重大事件。私人内容可保留，不要求热情或转述整段生活材料。若决定发送，写普通手机消息并附 <elsewhere_contact>{"requestId":"${t.id}","send":true}</elsewhere_contact>；若不适合，只返回同标签且send=false。不是替用户说话，不伪造用户新输入。`;
}
export function parseProactiveReply(raw:string,t:ProactiveTask) {
 const personal=splitPersonalReply(raw),matches=[...personal.text.matchAll(/<elsewhere_contact>([\s\S]*?)<\/elsewhere_contact>/g)];
 if(matches.length!==1||matches[0][1].length>500)throw new Error('主动联系未提供有效发送决定');
 let decision:unknown;try{decision=JSON.parse(matches[0][1]);}catch{throw new Error('主动联系决定无效');}
 if(!decision||typeof decision!=='object'||(decision as {requestId:unknown}).requestId!==t.id||typeof (decision as {send:unknown}).send!=='boolean')throw new Error('主动联系决定不属于本任务');
 const text=personal.text.replace(matches[0][0],'').trim();if(/<\/?elsewhere_contact\b/i.test(text))throw new Error('主动联系含残缺元数据');
 return {send:(decision as {send:boolean}).send,text,payload:personal.payload};
}
