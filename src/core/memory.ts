import type {ChatMessage,EventRecord,RoleData,UserProfileData} from './types';
import type {ConversationContext,ConversationCompilation} from './conversationPrompt';
import {matchesMessageSource,messageAvailableAt,messageSourceIndex,phoneMessagesAt} from './messageProvenance';
export interface MemoryRecord {
 id:string;roleId:string;scope:string;layer:'identity'|'relationship';attribute:string;value:string;
 polarity:'affirm'|'deny';correction:boolean;mutual?:true;at:number;knownBy:string[];origin:'explicit-user';
 source:{id:string;text:string;at:number;revisionCount:number};contextSource?:MemoryRecord['source'];supersedes:string[];
}
export interface RoleMemoryLedger {version:1;records:MemoryRecord[]}
export interface MemoryDecision {id:string;layer:string;sourceIds:string[];reason:string}
const normalize=(s:string)=>s.normalize('NFKC').toLocaleLowerCase().replace(/[\s。.!！?？]+$/g,'').trim();
const snapshot=(m:ChatMessage)=>({id:m.id,text:m.text,at:m.at,revisionCount:m.revisionCount||0});
const uncertain=/如果|假如|假设|要是|也许|可能|大概|是不是|是否|难道|莫非|开玩笑|玩笑话|反话|讽刺|对对对|行了吧|才怪|假装|扮演|台词|梦见|举例|比如|suppose|pretend|joking|if i\b/i;
function assertedText(text:string):string {
 return text.replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/g,'').replace(/“[^”]*”|「[^」]*」|『[^』]*』|"[^"\n]*"|^\s*>[^\n]*(?:\n|$)/gm,'');
}
function derive(r:RoleData,at:number):MemoryRecord[] {
 const messages=phoneMessagesAt(r,at).filter(m=>(!m.kind||m.kind==='chat')).sort((a,b)=>a.at-b.at);
 const records:MemoryRecord[]=[];
 for(const [index,m]of messages.entries()){
  if(m.speaker!=='me'||uncertain.test(m.text))continue;
  const text=assertedText(m.text),correction=/不是|不对|更正|纠正|说过|改为|actually|correction/i.test(text);
  const clauses=[...text.matchAll(/([^，,。.!！?？；;\n]+)([，,。.!！?？；;\n]|$)/g)].filter(m=>!/[?？]/.test(m[2])).map(m=>m[1].trim()).filter(Boolean);
  const add=(attribute:string,value:string,polarity:'affirm'|'deny',contextSource?:ChatMessage)=>{
   value=value.trim();if(!value||value.length>60||/[<>\[\]{}]|(?:吗|吧)$/.test(value)||attribute==='self'&&/^(?:觉得|认为|说|想|说过)/.test(value))return;
   const layer=attribute==='relationship'?'relationship':'identity';
   const record:MemoryRecord={id:`memory:${encodeURIComponent(m.id)}:${m.revisionCount||0}:${records.filter(f=>f.source.id===m.id).length}`,roleId:r.id,scope:'real:'+r.id,layer,attribute,value,polarity,correction,at:m.at,knownBy:[r.id],origin:'explicit-user',source:snapshot(m),supersedes:[],...(contextSource?{contextSource:snapshot(contextSource)}:{})};
   record.supersedes=records.filter(old=>polarity==='deny'?old.polarity==='affirm'&&normalize(old.value)===normalize(value):old.polarity==='deny'&&normalize(old.value)===normalize(value)||old.polarity==='affirm'&&attribute!=='self'&&old.attribute===attribute&&!old.mutual).map(old=>old.id);
   records.push(record);
  };
  for(const clause of clauses){
   let match:RegExpMatchArray|null;
   if((match=clause.match(/^我的([^不是:：]{1,12})不是(.+?)而是(.+)$/))){add('attribute:'+match[1],match[2],'deny');add('attribute:'+match[1],match[3],'affirm');continue;}
   if((match=clause.match(/^我不是(.+?)而是(.+)$/))){add('self',match[1],'deny');add('self',match[2],'affirm');continue;}
   if((match=clause.match(/^(?:而)?是(.+)$/))&&/^我不是/.test(text)){add('self',match[1],'affirm');continue;}
   if((match=clause.match(/^(?:其实|更正[：:]?\s*)?(?:我的([^不是:：]{1,12})(不是|是|[：:])(.+))$/))){add('attribute:'+match[1],match[3],match[2]==='不是'?'deny':'affirm');continue;}
   if((match=clause.match(/^(?:其实)?我(不是|是|叫)(.+)$/))){add(match[1]==='叫'?'name':'self',match[2],match[1]==='不是'?'deny':'affirm');continue;}
   if((match=clause.match(/^我们(?:现在|已经)?是(.+)$/))){
    add('relationship',match[1],'affirm');const parent=records.at(-1),next=messages[index+1];
    const consent=next?.speaker==='char'&&!uncertain.test(next.text)?assertedText(next.text).trim().match(/^(?:(?:是的|好|嗯)[，,]\s*)?我们(?:现在|已经)?是([^。.!！?？]+)[。.!！]?$/):null;
    if(parent?.source.id===m.id&&consent&&normalize(consent[1])===normalize(parent.value))records.push({...parent,id:parent.id+':confirmed:'+encodeURIComponent(next.id)+':'+(next.revisionCount||0),at:next.at,mutual:true,contextSource:snapshot(next),supersedes:[parent.id,...records.filter(old=>old.layer==='relationship'&&old.mutual).map(old=>old.id)]});
    continue;
   }
   if((match=clause.match(/^I (am not|am|work as|live in) (.+)$/i))){add(/live/i.test(match[1])?'attribute:residence':'self',match[2],/not/i.test(match[1])?'deny':'affirm');}
  }
  // A plain denial can refer to the immediately preceding direct question, not arbitrary old text.
  const previous=messages[index-1];
  if(correction&&/^不是[，,。\s]/.test(text)&&previous?.speaker==='char'){
   const question=previous.text.trim().match(/^(?:你是不是(.+?)[？?。]?|你是(.+?)(?:吧|吗)[？?。]?|(?:Are you|You are) (.+?)(?:\?|,? right\?))$/i);
   const value=question&&(question[1]||question[2]||question[3]);
   if(value&&!uncertain.test(value)&&records.some(f=>f.source.id===m.id&&f.polarity==='affirm'))add('self',value,'deny',previous);
  }
 }
 return records;
}
function sourceValid(r:RoleData,s:MemoryRecord['source'],at:number,user=false):boolean {
 const m=phoneMessagesAt(r,at).find(m=>m.id===s.id&&(!m.kind||m.kind==='chat'));
 return Boolean(m&&(!user||m.speaker==='me')&&matchesMessageSource(m,s));
}
function sourceChanged(r:RoleData,s:MemoryRecord['source'],at:number):boolean {
 // A source omitted from a bounded request is not a withdrawal.
 return r.chats.some(m=>m.id===s.id&&m.at<=at&&!sourceValid(r,s,at));
}
/** Legacy saves get a read-only projection; the first accepted save can persist it without a schema migration. */
export function projectRoleMemory(r:RoleData,at=Date.now(),limit=24) {
 const stored=r.memory?.version===1&&Array.isArray(r.memory.records)?r.memory.records:[];
 const derived=derive(r,at),definitions=new Map(derived.map(f=>[f.id,f]));
 const all=new Map<string,MemoryRecord>();for(const f of [...stored,...derived])if(f&&f.source&&Array.isArray(f.knownBy)&&Array.isArray(f.supersedes)&&f.roleId===r.id&&f.scope==='real:'+r.id&&f.origin==='explicit-user'&&f.knownBy?.includes(r.id))all.set(f.id,f);
 const trace:MemoryDecision[]=[],valid:MemoryRecord[]=[];
 for(const f of all.values()){
  const definition=definitions.get(f.id);
  const reason=f.at>at?'future':!sourceValid(r,f.source,at,true)||f.contextSource&&!sourceValid(r,f.contextSource,at)?'source-invalid':!definition||definition.value!==f.value||definition.attribute!==f.attribute||definition.polarity!==f.polarity?'assertion-unverifiable':'';
  if(reason)trace.push({id:f.id,layer:f.layer,sourceIds:[f.source.id],reason});else valid.push(f);
 }
 valid.sort((a,b)=>a.at-b.at);
 const corrected=new Set(valid.flatMap(f=>f.supersedes));
 // A withdrawn correction leaves its old assertion uncertain, rather than silently reviving it.
 for(const f of stored)if(f?.source&&f.roleId===r.id&&f.scope==='real:'+r.id&&f.at<=at&&(sourceChanged(r,f.source,at)||f.contextSource&&sourceChanged(r,f.contextSource,at)))for(const id of f.supersedes||[])corrected.add(id);
 const slot=(f:MemoryRecord)=>f.attribute+(f.mutual?':mutual':'');
 const latest=new Map<string,MemoryRecord>();for(const f of valid)if(f.attribute!=='self'&&f.polarity==='affirm')latest.set(slot(f),f);
 const facts=valid.filter(f=>{
  const replaced=corrected.has(f.id)||f.polarity==='affirm'&&(f.attribute!=='self'&&latest.get(slot(f))!==f||valid.some(n=>n.at>=f.at&&n.polarity==='deny'&&normalize(n.value)===normalize(f.value)));
  trace.push({id:f.id,layer:f.layer,sourceIds:[f.source.id,...(f.contextSource?[f.contextSource.id]:[])],reason:replaced?'corrected':'selected'});return !replaced;
 }).sort((a,b)=>Number(b.correction)-Number(a.correction)||b.at-a.at).slice(0,limit);
 const selectedIds=new Set(facts.map(f=>f.id));for(const t of trace)if(t.reason==='selected'&&!selectedIds.has(t.id))t.reason='layer-budget';
 const denied=facts.filter(f=>f.polarity==='deny');
 const supersededSources=new Set(valid.filter(f=>corrected.has(f.id)).map(f=>f.source.id));
 for(const f of denied){
  if(f.contextSource)supersededSources.add(f.contextSource.id);
  for(const m of r.chats)if(m.speaker==='char'&&m.at<=at&&directUserClaim(m.text,f.value))supersededSources.add(m.id);
 }

 return {facts,trace,supersededSources,denied};
}
/** Phone/diary projection only; all source records remain stored and novel formatting is unchanged. */
export function compactRoleMemory(r:RoleData,at:number) {
 const projection=projectRoleMemory(r,at,Infinity),seen=new Set<string>();
 const facts=projection.facts.filter(f=>{const key=JSON.stringify([f.layer,f.attribute,normalize(f.value),f.polarity,Boolean(f.mutual)]);if(seen.has(key)){const trace=projection.trace.find(t=>t.id===f.id);if(trace)trace.reason='same-current-fact';return false;}seen.add(key);return true;});
 return {...projection,facts,denied:facts.filter(f=>f.polarity==='deny')};
}
export function syncRoleMemory(r:RoleData,at=Date.now()):boolean {
 if(r.memory&&(r.memory.version!==1||!Array.isArray(r.memory.records)))return false;
 const previous=r.memory?.records||[],ids=new Set(previous.flatMap(f=>f&&typeof f.id==='string'?[f.id]:[])),added=derive(r,at).filter(f=>!ids.has(f.id));
 if(added.length)r.memory={version:1,records:[...previous,...added]};return true;
}
export function memoryFactText(f:MemoryRecord,compact=false):string {
 const subject=f.layer==='relationship'?(f.mutual?'双方明确确认的关系':'用户对关系的明确表述（不代替另一方同意）'):'用户明确自述';
 return `${subject} · ${f.attribute} · ${f.polarity==='deny'?'已否认':'当前陈述'}：${f.value}`+(compact?'':`（来源消息 ${f.source.id}，${new Date(f.at).toISOString()}）`);
}
export function memoryContext(r:RoleData,at:number):string {
 return projectRoleMemory(r,at).facts.map(f=>`[记忆 ${f.id}] ${memoryFactText(f)}`).join('\n');
}
export function memoryMessageIndex(r:RoleData,at=Infinity):Map<string,ChatMessage> {
 return messageSourceIndex(r,at);
}
export function eventSourceValid(r:RoleData,e:EventRecord,at:number,allMessages:Map<string,ChatMessage>=memoryMessageIndex(r,at),rejected?:Set<string>):boolean {
 if(e.kind==='diary'&&!e.knownBy?.includes(r.id))return false;
 if(e.at>at||e.status==='retracted'||e.status==='superseded'||e.knownBy?.length&&!e.knownBy.includes(r.id))return false;
 if(e.sceneChange&&(!Array.isArray(e.sceneChange.sources)||!e.sceneChange.sources.every(s=>s&&matchesMessageSource(allMessages.get(s.id),s))))return false;
 if(!e.messageId)return true;
 const m=allMessages.get(e.messageId);if(!m||!messageAvailableAt(m,at))return false;
 if(e.sourceRevision!==undefined&&(m.revisionCount||0)!==e.sourceRevision)return false;
 if(e.sourceRevision===undefined&&(m.revisionCount||m.editedAt)&&e.detail!==m.text)return false;
 return !(rejected||projectRoleMemory(r,at).supersededSources).has(m.id);
}
/** Free-form profile originals stay intact; a directly rejected assertion is excluded from current identity projection. */
export function projectedUserFields(user:UserProfileData,r:RoleData,at:number,projected=projectRoleMemory(r,at)) {
 const denied=projected.denied;
 return (['name','pronouns','identity','background','notes'] as const).map(key=>{
  const name=key==='name'?projected.facts.find(f=>f.attribute==='name'&&f.polarity==='affirm'):undefined;
  return {key,text:name?.value||user[key]||'',conflicts:['identity','background','notes'].includes(key)?memoryRuleConflicts('用户'+key+'：'+(user[key]||''),denied):[]};
 });
}
export function inspectMemoryRequest(context:ConversationContext,compilation:ConversationCompilation,wire:{role:string;content:string}[],includeText=false) {
 const fragments=context.native?.factFragments||{};
 return {boundary:'Elsewhere client request; proxy transformation unverified',facts:context.facts.map(f=>{
  const fragment=fragments[f.id]||`[来源 ${f.id} · ${new Date(f.at).toISOString()}]\n${f.text}`,indices=wire.flatMap((m,i)=>m.content.includes(fragment)?[i+1]:[]);
  return {id:f.id,layer:f.layer,sourceIds:context.native?.memoryTrace?.find(t=>t.id===f.id)?.sourceIds||[f.id],reason:indices.length?'injected':'not-injected',messageOrders:indices,...(includeText?{text:f.text}:{})};
 }),decisions:context.native?.memoryTrace||[],diagnostics:compilation.diagnostics.map(d=>({code:d.code,sourceId:d.sourceId,severity:d.severity}))};
}

/** Only a direct, affirmative configuration contradiction blocks; mere mentions and prohibitions do not. */
export function memoryRuleConflicts(content:string,denied:{id:string;value:string}[]):string[] {
 return denied.filter(f=>content.split(/[。.!！?？;；\n]/).some(line=>{
  const text=normalize(line),index=text.indexOf(normalize(f.value));if(index<0)return false;
  const before=text.slice(0,index);
  return /(?:用户|对方|user|you).{0,24}(?:(?:是|为|当成|叫作|称作|is|as)\s*[^，,]*|(?:身份|职业|工作|identity|occupation)?\s*[:：=]\s*)$/i.test(before)&&!/(?:不是|并非|不要|不能|不得|不再|勿|not|never|曾经|以前|过去)/i.test(before);
 })).map(f=>f.id);
}

export function memoryVersion(r:RoleData,at:number):string {return JSON.stringify(compactRoleMemory(r,at).facts.map(f=>[f.id,f.attribute,f.value,f.polarity,f.source.revisionCount]));}
export function memorySnapshot(r:RoleData,at:number) {const p=compactRoleMemory(r,at);return {version:1 as const,factIds:p.facts.map(f=>f.id),ignoredMessageIds:[...p.supersededSources]};}

function directUserClaim(text:string,value:string):boolean {
 const input=normalize(text),index=input.indexOf(normalize(value));if(index<0)return false;
 const before=input.slice(0,index);
 return /(?:你|用户|对方|you).{0,12}(?:是|身份|职业|工作|is|are)\s*[^，,。.!！?？]*$/i.test(before)&&!/(?:不是|并非|不是说|曾以为|误以为|not)/i.test(before);
}

export function relationshipContext(r:RoleData,at:number,projection=projectRoleMemory(r,at)):string {return projection.facts.find(f=>f.layer==='relationship'&&f.mutual)?.value||r.relationship;}
