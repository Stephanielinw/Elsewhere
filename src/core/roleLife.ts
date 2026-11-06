import type {ChatMessage,DiaryEntry,EventRecord,RoleData} from './types';
import {getActiveEvents,getActiveMessages} from './revisions';
import {messageSourceIndex,phoneMessagesAt} from './messageProvenance';
import {eventSourceValid,memoryVersion,compactRoleMemory} from './memory';
import {memoryExcerpt,memoryRelevance,selectMemoryItems} from './contextBudget';
import {dateDayNumber} from './homeTasks';

export interface PersonalSource {kind:'profile'|'message'|'event'|'diary'|'thread';id:string;at:number;version:string}
export interface PersonalThread {
 id:string;key:string;roleId:string;kind:'concern'|'opinion'|'plan'|'observation'|'relationship';text:string;at:number;
 status:'open'|'resolved';shareable:boolean;sources:PersonalSource[];origin:'model-private';requestId:string;
}
export interface PersonalTicket {id:string;roleId:string;at:number;sceneId:string|null;playId:string|null;sources:PersonalSource[];threadVersion:string;memoryVersion?:string;mode?:'chat'|'diary'}
const version=(value:unknown)=>JSON.stringify(value);
const threadVersion=(t:PersonalThread)=>version([t.id,t.key,t.roleId,t.kind,t.text,t.at,t.status,t.shareable,t.requestId]);
const ledgerVersion=(r:RoleData)=>version((r.personalThreads||[]).map(threadVersion));
const profile=(r:RoleData)=>version([r.name,r.job,r.traits,r.place,r.profile,r.relationship,r.canonNotes,r.notes]);
function messageRef(m:ChatMessage):PersonalSource{return {kind:'message',id:m.id,at:m.at,version:version([m.speaker,m.text,m.at,m.revisionCount||0,m.quote||null])};}
function diaryRef(d:DiaryEntry):PersonalSource{return {kind:'diary',id:d.id,at:d.at,version:version([d.speaker,d.text,d.at,d.sourceMessageIds,d.sourceEventIds,d.sourceMessageRevisions,d.memoryState])};}
function eventRef(e:EventRecord):PersonalSource{
 const fields:unknown[]=[e.kind,e.title,e.detail,e.at,e.source,e.knownBy,e.messageId,e.lifeEvidence];
 if(e.lifeRecord)fields.push(e.where,[e.lifeRecord.version,e.lifeRecord.roleId,e.lifeRecord.taskId,e.lifeRecord.origin,e.lifeRecord.action,e.lifeRecord.until,Array.isArray(e.lifeRecord.sources)?e.lifeRecord.sources.map(s=>s&&[s.kind,s.id,s.at]):null]);
 return {kind:'event',id:e.id,at:e.at,version:version(fields)};
}
function archivedProfileValid(r:RoleData,s:PersonalSource,taskAt:number):boolean {
 if(!s||s.kind!=='profile'||s.id!==r.id||s.at!==taskAt||typeof s.version!=='string')return false;
 try{
  const fields:unknown=JSON.parse(s.version);
  return Array.isArray(fields)&&fields.length===8&&typeof fields[0]==='string'&&Boolean(fields[0].trim())&&
   fields.every(value=>value===null||typeof value==='string');
 }catch{return false;}
}
function referenceValid(r:RoleData,s:PersonalSource,at:number,seen=new Set<string>(),memory=compactRoleMemory(r,at),historical=new Set<string>()):boolean {
 if(!s||typeof s.version!=='string'||!Number.isFinite(s.at)||s.at>at)return false;
 if(s.kind==='profile')return s.id===r.id&&s.version===profile(r);
 if(s.kind==='message'){const m=messageSourceIndex(r,at).get(s.id);return Boolean(m&&m.speaker!=='note'&&messageRef(m).version===s.version&&!memory.supersededSources.has(m.id));}
 if(s.kind==='event'){
  if(seen.has('event:'+s.id))return false;
  const allEvents=Array.isArray(r.events)?r.events:[];
  const matches=allEvents.filter(e=>e?.id===s.id);
  if(matches.length!==1)return false;
  const e=getActiveEvents(matches).find(e=>e.at===s.at&&e.at<=at&&e.knownBy?.includes(r.id)&&e.kind!=='drama'&&e.kind!=='diary');
  const life=e?.lifeRecord;
  if(!life&&e?.source?.startsWith('autonomous-life-v1:'))return false;
  if(life){
   const tasks=Array.isArray(r.lifeTasks)?r.lifeTasks.filter(t=>t?.id===life.taskId):[],task=tasks[0];
   if(!e||life.version!==1||life.roleId!==r.id||life.origin!=='simulation'||tasks.length!==1||
    task.roleId!==r.id||task.status!=='completed'||dateDayNumber(task.dateKey)===null||
    task.id!=='life:'+encodeURIComponent(r.id)+':'+task.dateKey||
    ![task.at,task.from,task.to].every(Number.isFinite)||task.to!==task.at||task.from>task.to||task.to>at||
    !Array.isArray(task.eventIds)||!task.eventIds.length||task.eventIds.length>3||
    !task.eventIds.every((id,i)=>id===task.id+':event:'+i)||
    !task.eventIds.includes(e.id)||e.source!=='autonomous-life-v1:'+task.id||e.kind!=='life'||
    typeof e.title!=='string'||typeof e.detail!=='string'||e.at<task.from||e.status!==undefined&&e.status!=='active'||
    !Number.isFinite(life.until)||life.until>task.to||life.until>at||life.until<=e.at||
    !Number.isInteger((life.until-e.at)/60000)||life.until-e.at>30*60000||
    !['rest','walk','read','organize','practice','care','social'].includes(life.action)||
    !Array.isArray(life.sources)||!life.sources.length||
    life.sources.filter(ref=>ref?.kind==='profile').length!==1||
    new Set(life.sources.map(ref=>ref?.kind+':'+ref?.id)).size!==life.sources.length)return false;
   // The snapshot is context only; the completed task and every live dependency must also verify.
   for(const ref of life.sources){
    if(ref?.kind==='profile'){
     if(!archivedProfileValid(r,ref,task.to))return false;
    }else if(ref?.kind!=='event'||ref.at>e.at||!referenceValid(r,ref,at,new Set([...seen,'event:'+s.id]),memory,historical))return false;
   }
   if(life.sources.some(ref=>ref.kind==='profile'?ref.version!==profile(r):historical.has(ref.id)))historical.add(e.id);
  }
  return Boolean(e&&eventRef(e).version===s.version&&eventSourceValid(r,e,at,messageSourceIndex(r,at),memory.supersededSources)&&(e.kind!=='life'||e.lifeEvidence==='confirmed'&&e.source));
 }
 if(s.kind==='diary'){
  if(seen.has('diary:'+s.id))return false;
  const d=r.diaries.find(d=>d.id===s.id&&d.speaker==='char'&&d.source==='ai'&&d.at<=at);
  const current=memory;
  if(d&&((d.memoryState?.factIds||[]).some(id=>!current.facts.some(f=>f.id===id)&&!current.trace.some(t=>t.id===id&&t.reason==='same-current-fact'))||(d.sourceMessageIds||[]).some(id=>current.supersededSources.has(id)&&!d.memoryState?.ignoredMessageIds.includes(id))))return false;
  const cutoff=Math.min(at,d?.at??at),sources=messageSourceIndex(r,cutoff,true);
  return Boolean(d&&d.generatedAt&&d.generatedAt<=at&&diaryRef(d).version===s.version&&(d.sourceMessageIds||[]).every(id=>{
   const m=sources.get(id);
   return m&&(d.sourceMessageRevisions?d.sourceMessageRevisions[id]===(m.revisionCount||0):!m.editedAt&&!m.revisionCount);
  })&&(d.sourceEventIds||[]).every(id=>getActiveEvents(r.events).some(e=>e.id===id&&e.knownBy?.includes(r.id)&&eventSourceValid(r,e,cutoff,sources,current.supersededSources)&&
   (e.kind!=='life'||referenceValid(r,eventRef(e),cutoff,new Set([...seen,'diary:'+s.id]),memory,historical))))&&(!d.continuitySources||d.continuitySources.every(ref=>referenceValid(r,ref,at,new Set([...seen,'diary:'+s.id]),memory,historical))));
 }
 const t=r.personalThreads?.find(t=>t.id===s.id);
 if(!t||seen.has(t.id)||t.roleId!==r.id||t.at>at||s.version!==threadVersion(t))return false;
 return t.sources.length>0&&t.sources.every(ref=>referenceValid(r,ref,at,new Set([...seen,t.id]),memory,historical));
}

/** Shared read-only life timeline: inferred monitor enrichments never become evidence. */
export function collectRoleLife(r:RoleData,at=Date.now()) {
 const memory=compactRoleMemory(r,at),historical=new Set<string>();
 const events=getActiveEvents(r.events).filter(e=>e.kind==='life'&&e.lifeEvidence==='confirmed'&&Boolean(e.source)&&e.knownBy?.includes(r.id)&&e.at<=at&&referenceValid(r,eventRef(e),at,new Set(),memory,historical)).sort((a,b)=>a.at-b.at);
 const latest=new Map<string,PersonalThread>();
 for(const t of r.personalThreads||[]){
  if(t.origin!=='model-private'||t.roleId!==r.id||t.at>at||!t.sources?.length||!t.sources.every(s=>referenceValid(r,s,at,new Set(),memory)))continue;
  const old=latest.get(t.key);if(!old||t.at>=old.at)latest.set(t.key,t);
 }
 const threads=[...latest.values()].filter(t=>t.status==='open').sort((a,b)=>b.at-a.at).slice(0,8);
 return {events,threads,historicalProfileEventIds:new Set(events.filter(e=>historical.has(e.id)).map(e=>e.id))};
}
export function personalDiaries(r:RoleData,at:number):DiaryEntry[] {
 const memory=compactRoleMemory(r,at);
 return r.diaries.filter(d=>d.speaker==='char'&&d.source==='ai'&&d.at<=at&&referenceValid(r,diaryRef(d),at,new Set(),memory)).sort((a,b)=>b.at-a.at).slice(0,2);
}
export function personalContext(r:RoleData,at:number,compact?:{query?:string;excludeEvents?:Set<string>}):string {
 const {events,threads,historicalProfileEventIds}=collectRoleLife(r,at);
 const historyNote=historicalProfileEventIds.size?'\n旧档案历史仅说明归档时语境，当前身份、地点和关系以当前档案为准。':'';
 if(compact){
  const query=compact.query||'',rank=<T extends {at:number}>(items:T[],text:(t:T)=>string)=>[...items].sort((a,b)=>memoryRelevance(text(b),query)-memoryRelevance(text(a),query)||b.at-a.at);
  const items=[
   ...rank(threads,t=>t.text).slice(0,2).map(t=>({text:memoryExcerpt(t.text,query,65),prefix:`[${t.id} · key=${t.key} · ${t.kind}] `})),
   ...rank(events.filter(e=>!compact.excludeEvents?.has(e.id)),e=>e.detail).slice(0,2).map(e=>({text:memoryExcerpt(e.detail,query,70),prefix:`[生活记录 ${e.id} · ${new Date(e.at).toISOString().slice(0,10)}] ${historicalProfileEventIds.has(e.id)?'（旧档案历史）':''}${e.title}：`})),
   ...personalDiaries(r,at).slice(0,1).map(d=>({text:memoryExcerpt(d.text,query,55),prefix:`[${d.id} · ${new Date(d.at).toISOString().slice(0,10)}] 私人日记短摘：`})),
  ];
  const firstLife=items.findIndex(t=>t.prefix.startsWith('[生活记录 '));
  if(firstLife>1)items.splice(1,0,items.splice(firstLife,1)[0]);
  return '角色自身生活材料（不是必须公开的话题）：\n私人关注/日记是主观文字，计划不是已发生的外部事实。'+historyNote+'\n'+selectMemoryItems(items,t=>t.text,210,4).map(t=>t.prefix+t.text).join('\n');
 }
 return `角色自身生活材料（不是必须公开的话题）：${historyNote}\n`+
  events.slice(-6).map(e=>`[生活记录 ${e.id} · ${new Date(e.at).toISOString()}] ${historicalProfileEventIds.has(e.id)?'（旧档案历史）':''}${e.title}：${e.detail.slice(0,400)}`).join('\n')+
  '\n私人持续关注（模型此前写下的想法/打算，不是已确认的外部事件；不必告诉对方）：\n'+
  (threads.map(t=>`[${t.id} · key=${t.key} · ${new Date(t.at).toISOString()} · ${t.kind}] ${t.text}`).join('\n')||'暂无已记录关注点')+
  '\n此前私人日记短摘（本人的主观文字，不自动作为外部事实）：\n'+personalDiaries(r,at).map(d=>`[${d.id} · ${new Date(d.at).toISOString()}] ${d.text.slice(0,300)}`).join('\n');
}

export function preparePersonalReply(r:RoleData,messages:{role:string;content:string}[],at:number,id:string,extraTask='',sourceMessages:ChatMessage[]=getActiveMessages(r.chats).slice(-12),mode:'chat'|'diary'='chat',visibleSourcesOnly=false) {
 const life=collectRoleLife(r,at),memory=compactRoleMemory(r,at),visible=(marker:string)=>!visibleSourcesOnly||messages.some(m=>m.content.includes(marker));
 const requested=new Set(sourceMessages.map(m=>m.id));
 const sources:PersonalSource[]=[{kind:'profile',id:r.id,at,version:profile(r)},...phoneMessagesAt(r,at).filter(m=>requested.has(m.id)&&m.speaker!=='note'&&!memory.supersededSources.has(m.id)).map(messageRef),...life.events.slice(-6).filter(e=>visible('[生活记录 '+e.id+' ·')).map(eventRef),...personalDiaries(r,at).filter(d=>visible('['+d.id+' ·')).map(diaryRef),...life.threads.filter(t=>visible('['+t.id+' ·')).map(t=>({kind:'thread' as const,id:t.id,at:t.at,version:threadVersion(t)}))];
 const ticket:PersonalTicket={id,roleId:r.id,at,sceneId:r.scene?.id||null,playId:r.play?.id||null,sources,threadVersion:ledgerVersion(r),memoryVersion:memoryVersion(r,at),mode};
 const control=`[Elsewhere Private Continuity v1]\n保持原有${mode==='diary'?'日记正文':'手机正文与全部场景事件协议'}。${extraTask}\n可在正文后按需附加 <elsewhere_private_state>{"requestId":${JSON.stringify(id)},"roleId":${JSON.stringify(r.id)},"updates":[{"kind":"concern|opinion|plan|observation|relationship","text":"简短的私人关注/判断/打算","sources":["kind:id"],"shareable":false}]}</elsewhere_private_state>。无值得持续记录的变化就省略；至多3项，每项200字。已有关注用 key=原关注key 更新，status=open或resolved。不写推理过程，不总结用户每句话，不记录未经证实的重大外部事件。允许符合身份的平常私人观察与想法，标为个人想法而非Canon；观点可以改变或纠正。shareable仅表示本人愿意以后主动谈及，不要求在本轮公开。元数据不是聊天、场景事件或正式记忆；不得放入对白或其他标签。\n可引用的来源：${JSON.stringify(sources.map(s=>({id:s.kind+':'+s.id,at:s.at,...(s.kind==='thread'?{key:life.threads.find(t=>t.id===s.id)?.key}:{})})))}`;
 const copy=messages.map(m=>({...m})),first=copy.find(m=>m.role==='system');if(first)first.content+='\n\n'+control;else copy.unshift({role:'system',content:control});
 return {messages:copy,ticket};
}

/** Invalid optional metadata is discarded, including an incomplete suffix, without hiding normal text. */
export function splitPersonalReply(raw:string):{text:string;payload?:string} {
 const lower=raw.replace(/[A-Z]/g,c=>c.toLowerCase()),open='<elsewhere_private_state>',close='</elsewhere_private_state>';
 let cursor=0,text='',payload:string|undefined,count=0;
 while(cursor<raw.length){
  const tag=/<\/?elsewhere_private_state\b/ig;tag.lastIndex=cursor;const match=tag.exec(raw);
  if(!match){text+=raw.slice(cursor);break;}
  text+=raw.slice(cursor,match.index);count++;
  const end=raw.indexOf('>',tag.lastIndex),next=raw.indexOf('<',tag.lastIndex);
  if(end<0||next>=0&&next<end)break;
  if(match[0].startsWith('</')){cursor=end+1;continue;}
  const from=end+1;let quote=false,escape=false,depth=1,stop=-1,nested=false;
  for(let i=from;i<raw.length;i++){
   const c=raw[i];if(escape){escape=false;continue;}if(quote&&c==='\\'){escape=true;continue;}if(c==='"'){quote=!quote;continue;}
   if(!quote){if(lower.startsWith(open,i)){depth++;nested=true;}if(lower.startsWith(close,i)&&--depth===0){stop=i;break;}}
  }
  if(stop<0)break;
  if(count===1&&!nested&&lower.slice(match.index,from)===open&&stop-from<=6000)payload=raw.slice(from,stop);
  cursor=stop+close.length;
 }
 return {text:text.trim(),...(count===1&&payload?{payload}:{})};
}
export function personalTicketValid(r:RoleData,ticket:PersonalTicket):boolean {
 return r.id===ticket.roleId&&(r.scene?.id||null)===ticket.sceneId&&(r.play?.id||null)===ticket.playId&&ledgerVersion(r)===ticket.threadVersion&&(!ticket.memoryVersion||ticket.memoryVersion===memoryVersion(r,ticket.mode==='diary'?ticket.at:Math.max(Date.now(),ticket.at)))&&ticket.sources.every(s=>referenceValid(r,s,Math.max(Date.now(),ticket.at),new Set(),compactRoleMemory(r,ticket.mode==='diary'?ticket.at:Math.max(Date.now(),ticket.at))));
}
export function applyPersonalReply(r:RoleData,ticket:PersonalTicket,payload:string,at:number,bindings:(ChatMessage|DiaryEntry)[]=[]):boolean {
 if(!personalTicketValid(r,ticket)||payload.length>6000||(r.personalThreads||[]).some(t=>t.requestId===ticket.id)||(r.personalThreads||[]).filter(t=>t.at>at-86400000).length>=12)return false;
 let data:unknown;try{data=JSON.parse(payload);}catch{return false;}
 if(!data||typeof data!=='object')return false;const body=data as Record<string,unknown>;
 if(body.roleId!==r.id||body.requestId!==ticket.id||!Array.isArray(body.updates)||body.updates.length>3)return false;
 const updates:PersonalThread[]=[];
 for(const [i,value]of body.updates.entries()){
  if(!value||typeof value!=='object')return false;const u=value as Record<string,unknown>;
  if(!['concern','opinion','plan','observation','relationship'].includes(String(u.kind))||typeof u.text!=='string'||!u.text.trim()||u.text.length>200||!Array.isArray(u.sources)||!u.sources.length||u.sources.length>3||u.shareable!==true&&u.shareable!==false||u.status!==undefined&&!['open','resolved'].includes(String(u.status)))return false;
  const refs=u.sources.map(key=>ticket.sources.find(s=>s.kind+':'+s.id===key));if(refs.some(s=>!s))return false;
  if(u.key!==undefined&&!collectRoleLife(r,ticket.at).threads.some(t=>t.key===u.key))return false;
  const dependencies=bindings.map(m=>'generatedAt'in m||r.diaries.some(d=>d.id===m.id)?diaryRef(m as DiaryEntry):messageRef(m as ChatMessage));
  updates.push({id:ticket.id+':'+i,key:typeof u.key==='string'?u.key:ticket.id+':'+i,roleId:r.id,kind:u.kind as PersonalThread['kind'],text:u.text.trim(),at,status:u.status==='resolved'?'resolved':'open',shareable:u.shareable,sources:[...refs as PersonalSource[],...dependencies],origin:'model-private',requestId:ticket.id});
 }
 if(!updates.length)return false;r.personalThreads=[...(r.personalThreads||[]),...updates];return true;
}
