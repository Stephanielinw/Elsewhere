import type {ChatMessage,EventRecord,RoleData,UserProfileData} from './types';
import {syncRoleExperiences,type RoleExperienceLedger} from './roleExperience';
import type {ConversationContext,ConversationCompilation} from './conversationPrompt';
import {matchesMessageSource,messageAvailableAt,messageSourceIndex,phoneMessagesAt,sceneMessagesAt,stageMessagesAt} from './messageProvenance';
export interface MemoryRecord {
 id:string;roleId:string;scope:string;layer:'identity'|'relationship';attribute:string;value:string;
 polarity:'affirm'|'deny';correction:boolean;mutual?:true;at:number;knownBy:string[];origin:'explicit-user';
 source:{id:string;text:string;at:number;revisionCount:number;scope?:string};contextSource?:MemoryRecord['source'];supersedes:string[];
}
export interface RoleMemoryLedger {version:1;records:MemoryRecord[];experiences?:RoleExperienceLedger}
export interface MemoryDecision {id:string;layer:string;sourceIds:string[];reason:string}
const normalize=(s:string)=>s.normalize('NFKC').toLocaleLowerCase().replace(/[\s。.!！?？]+$/g,'').trim();
type MemoryInput=ChatMessage&{memoryScope?:string};
function memoryInputs(r:RoleData,at:number):MemoryInput[]{
 const privateIds=new Set(r.events.filter(e=>e.messageId&&e.status!=='retracted'&&e.status!=='superseded'&&e.knownBy?.length&&!e.knownBy.includes(r.id)).map(e=>e.messageId));
 const scenes=[...(r.meetings||[]),...(r.scene?[r.scene]:[])],plays=[...(r.plays||[]),...(r.play?[r.play]:[])];
 const extra=[...scenes.filter(s=>scenes.filter(x=>x.id===s.id).length===1&&(s.endedAt===undefined||s.endedAt<=at)).flatMap(s=>sceneMessagesAt(r,s.messages,at).filter(m=>!m.sourceMessageId&&m.kind!=='play'&&m.novelOutput?.mode!=='theatre'&&!privateIds.has(m.id)).map(m=>({...m,memoryScope:'scene:'+s.id}))),...plays.flatMap(p=>stageMessagesAt(p.intermissionMessages,at).map(m=>({...m,memoryScope:'backstage:'+p.id})))];
 const all=[...phoneMessagesAt(r,at),...extra],counts=new Map<string,number>();for(const m of all)counts.set(m.id,(counts.get(m.id)||0)+1);return all.filter(m=>counts.get(m.id)===1);
}
const snapshot=(m:MemoryInput)=>({id:m.id,text:m.text,at:m.at,revisionCount:m.revisionCount||0,...(m.memoryScope?{scope:m.memoryScope}:{})});
const uncertain=/如果|假如|假设|要是|也许|可能|大概|是不是|是否|难道|莫非|开玩笑|玩笑话|反话|讽刺|对对对|行了吧|才怪|假装|扮演|台词|梦见|举例|比如|suppose|pretend|joking|if i\b/i;
function assertedText(text:string):string {
 return text.replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/g,'').replace(/“[^”]*”|「[^」]*」|『[^』]*』|"[^"\n]*"|^\s*>[^\n]*(?:\n|$)/gm,'');
}
type AssertionClause={text:string;start:number;end:number;allowed:boolean;denyOnly?:boolean};
function assertionProjection(raw:string,local:boolean){
 let text=raw,positions=Array.from({length:raw.length},(_,i)=>i);
 const remove=(pattern:RegExp)=>{
  const parts:string[]=[],next:number[]=[];let cursor=0;
  for(const match of text.matchAll(pattern)){
   parts.push(text.slice(cursor,match.index));for(let i=cursor;i<match.index;i++)next.push(positions[i]);
   if(local){parts.push(match[0].replace(/[^\r\n]/g,'\0'));for(let i=match.index;i<match.index+match[0].length;i++)next.push(positions[i]);}
   cursor=match.index+match[0].length;
  }
  parts.push(text.slice(cursor));for(let i=cursor;i<text.length;i++)next.push(positions[i]);text=parts.join('');positions=next;
 };
 remove(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/g);
 remove(local?/“[^”]*(?:”|$)|「[^」]*(?:」|$)|『[^』]*(?:』|$)|‘[^’]*(?:’|$)|"[^"\n]*(?:"|$)|(?<![\p{L}\p{N}])'[^'\n]*(?:'|$)|`[^`\n]*(?:`|$)|^\s*>[^\n]*(?:\n|$)/gmu:/“[^”]*”|「[^」]*」|『[^』]*』|"[^"\n]*"|^\s*>[^\n]*(?:\n|$)/gm);
 const clause=(value:string,index:number):AssertionClause=>{const trimmed=value.trim(),start=index+value.length-value.trimStart().length;return {text:trimmed,start:positions[start]??raw.length,end:positions[start+trimmed.length-1]+1||raw.length,allowed:true};};
 return {text,clause};
}
// shortcut: Implicit cross-message paraphrases are not resolved; extend only with source/ID regressions.
const localUncertain=/也许|可能|大概|是不是|是否|难道|莫非|不(?:是很|太)?确定|不(?:太)?肯定|(?:吗|吧)$|\b(?:maybe|perhaps|probably|possibly|might|may|guess|suppose|unsure|seems?|not sure|i think|i believe)\b/i;
const conditional=/如果|假如|假设|要是|举例|比如|或者|或是|\b(?:if|unless|suppose|supposing|hypothetically|or)\b/i;
const nonliteral=/开玩笑|玩笑话|反话|讽刺|对对对|行了吧|才怪|假装|扮演|台词|梦见|梦到|转述|(?:他|她|他们|别人|朋友)(?:说|告诉我|表示)|\b(?:pretend|role.?play|jok(?:e|ing)|kidding|sarcasm|sarcastic|dream(?:t|ed)?|(?:he|she|they) (?:said|told)|in (?:a|the) (?:movie|film|play))\b/i;
const connective=/^(?:(?:但是|不过|然而|而且|并且|可是|但|而)\s*|(?:but|however|and|yet)\b\s*)+/i;
const pureHedge=/^(?:也许(?:不是)?|可能(?:不是)?|大概|我猜|我想|我不(?:是很|太)?确定|我可能说错了|其实不是|其实不对|并非如此|对吧|是吧|maybe(?: not)?|perhaps|probably|possibly|i guess|i think|i suppose|not sure|i (?:might|may|could) be (?:wrong|mistaken)|aren't i|am i|isn't it|right)[吧啊呀\s]*$/i;
const roleplayEnter=/^(?:我们(?:来|开始)(?:角色)?扮演|let['’]s (?:role.?play|pretend)\b)/i;
const roleplayExit=/^(?:回到现实|结束(?:角色)?扮演|不演了|out of character|stop roleplaying|back to reality)(?:\s|$)/i;
const frameChanges=(text:string)=>[...text.matchAll(/[^，,。.!！?？；;\n]+/g)].flatMap(m=>{const clause=m[0].trim().replace(connective,'');return roleplayExit.test(clause)?[{index:m.index,value:false}]:roleplayEnter.test(clause)?[{index:m.index,value:true}]:[];});
function roleplayStates(r:RoleData,messages:ChatMessage[],at:number,scope='chat'){
 const events:{at:number;order:number;value?:boolean;message?:ChatMessage}[]=[],states=new Map<ChatMessage,boolean>();
 const indices=new Map(r.chats.map((m,i)=>[m?.id,i])),activeIds=new Set(messages.map(m=>m.id)),historical=new Set<string>();
 const framing=(text:string)=>assertionProjection(text,true).text;
 for(const v of Array.isArray(r.messageRevisions)?r.messageRevisions:[]){
  if(!v||typeof v.targetMessageId!=='string')continue;
  const source=r.chats[indices.get(v.targetMessageId)??-1];
  if(source?.speaker==='me'&&v.scope===scope&&v.speaker==='me'&&['edit','retract'].includes(v.action)&&Number.isFinite(v.at)&&v.at>=source.at&&typeof v.previousText==='string'&&frameChanges(framing(v.previousText)).some(m=>m.value))historical.add(source.id);
 }
 for(const m of messages.filter(m=>m.speaker==='me')){
  const order=indices.get(m.id)!*3,time=m.editedAt??m.at,text=framing(m.text);
  events.push({at:time,order,message:m});
  const markers=frameChanges(text);
  if(markers.length)events.push({at:time,order:order+1,value:markers.at(-1)!.value});
 }
 // Lost framing is an ambiguity guard, never evidence of a current identity or a historical exit.
 for(const [i,m]of r.chats.entries())if(m?.speaker==='me'&&(!m.kind||m.kind==='chat')&&Number.isFinite(m.at)&&m.at<=at){
  if(historical.has(m.id)||!activeIds.has(m.id)&&frameChanges(framing(m.text)).some(m=>m.value))events.push({at:m.at,order:i*3-1,value:true});
 }
 let pretending=false;
 for(const event of events.sort((a,b)=>a.at-b.at||a.order-b.order))if(event.message)states.set(event.message,pretending);else pretending=event.value!;
 return states;
}
function localAssertions(raw:string,pretending:boolean):{text:string;clauses:AssertionClause[];pretending:boolean}{
 const projection=assertionProjection(raw,true),clauses:AssertionClause[]=[];
 for(const statement of projection.text.matchAll(/([^。.!！?？；;\n]+)([。.!！?？；;\n]|$)/g)){
  const text=statement[1];
  const conditionAt=text.search(conditional),alternative=/或者|或是|\bor\b/i.test(text);
  const pastJoke=/^(?:我)?(?:刚才|刚刚|之前|先前)[^，,]{0,16}(?:开玩笑|说反话)|^i was (?:just )?joking (?:earlier|before)\b/i.test(text.trim());
  const parts:{text:string;index:number}[]=[];let start=0;
  for(const separator of text.matchAll(/[，,]|\s+(?=(?:but|however|and|yet)\s+(?:I|my|we)\b)|(?=(?:但是|不过|然而|但)(?:我|我们|如果|假如|要是))/gi)){
   if(separator.index>start)parts.push({text:text.slice(start,separator.index),index:start});start=separator.index+separator[0].length;
  }
  if(start<text.length)parts.push({text:text.slice(start),index:start});
  const framed=nonliteral.test(parts.filter(p=>!roleplayExit.test(p.text.trim().replace(connective,''))).map(p=>p.text).join(','));
  for(const [i,part]of parts.entries()){
   const c=projection.clause(part.text,statement.index+part.index);c.text=c.text.replace(connective,'').replace(/^(?:更正[：:]?|纠正[：:]?|实际上|其实|说真的|actually\b|correction[:：]?)\s*/i,'');
   if(roleplayExit.test(c.text))pretending=false;else if(roleplayEnter.test(c.text))pretending=true;
   const neighborHedge=[parts[i-1],parts[i+1]].some(p=>p&&pureHedge.test(p.text.trim().replace(connective,'')));
   c.denyOnly=framed&&pastJoke&&i>0;
   const condition=alternative||conditionAt>=0&&part.index+part.text.length>conditionAt;
   c.allowed=Boolean(c.text)&&!c.text.includes('\0')&&!pretending&&!condition&&(!framed||c.denyOnly)&&!localUncertain.test(c.text)&&!neighborHedge&&!(i===parts.length-1&&/[?？]/.test(statement[2]));
   clauses.push(c);
  }
 }
 return {text:projection.text,clauses,pretending};
}
function deriveRecords(r:RoleData,at:number,local:boolean,legacyIds=new Map<string,string>()) {
 const messages=memoryInputs(r,at).filter(m=>m.memoryScope||!m.kind||m.kind==='chat').sort((a,b)=>a.at-b.at);
 const records:MemoryRecord[]=[],keys=new Map<string,string>(),frames=new Map<ChatMessage,boolean>();
 if(local)for(const scope of new Set(messages.map(m=>m.memoryScope))){const scoped=messages.filter(m=>m.memoryScope===scope),source=scope?{...r,chats:scoped}:r;for(const [m,state]of roleplayStates(source,scoped,at,scope?.startsWith('scene:')?'scene':scope?'intermission':'chat'))frames.set(m,state);}
 const reserved=r.memory?.version===1&&Array.isArray(r.memory.records)?r.memory.records:[];
 const sameSource=(a:MemoryRecord['source']|undefined,b:MemoryRecord['source']|undefined)=>a&&b?a.scope===b.scope&&a.id===b.id&&a.at===b.at&&a.text===b.text&&(a.revisionCount||0)===(b.revisionCount||0):a===b;
 const retainId=(record:MemoryRecord,fallback:string)=>{
  if(!local)return;
  const compatible=(old:MemoryRecord)=>old.roleId===record.roleId&&old.scope===record.scope&&old.attribute===record.attribute&&old.value===record.value&&old.polarity===record.polarity&&!!old.mutual===!!record.mutual&&sameSource(old.source,record.source)&&sameSource(old.contextSource,record.contextSource);
  let suffix=0;
  while(reserved.some(old=>old?.id===record.id&&!compatible(old))){record.id=fallback+(suffix?':'+suffix:'');suffix++;}
 };
 for(const [index,m]of messages.entries()){
  if(m.speaker!=='me'||!local&&uncertain.test(m.text))continue;
  const projection=local?undefined:assertionProjection(m.text,false);
  const parsed=local?localAssertions(m.text,frames.get(m)||false):undefined;
  const text=parsed?.text??projection!.text,correction=/不是|不对|更正|纠正|说过|改为|actually|correction/i.test(text);
  const clauses=parsed?.clauses??[...text.matchAll(/([^，,。.!！?？；;\n]+)([，,。.!！?？；;\n]|$)/g)].filter(m=>!/[?？]/.test(m[2])).map(m=>projection!.clause(m[1],m.index)).filter(c=>c.text);
  let current:AssertionClause={text:'',start:0,end:0,allowed:true},part=0,anchor='context';
  const add=(attribute:string,value:string,polarity:'affirm'|'deny',contextSource?:ChatMessage)=>{
   const slot=part++;
   value=value.trim();if(!value||value.length>60||/[<>\[\]{}]|(?:吗|吧)$/.test(value)||attribute==='self'&&/^(?:觉得|认为|说|想|说过)/.test(value))return;
   if(local&&(!current.allowed||current.denyOnly&&polarity!=='deny'))return;
   const layer=attribute==='relationship'?'relationship':'identity';
   const key=JSON.stringify([snapshot(m),anchor,slot,attribute,value,polarity,contextSource?snapshot(contextSource):null]);
   const prefix=`memory:${m.memoryScope?encodeURIComponent(m.memoryScope)+':':''}${encodeURIComponent(m.id)}:${m.revisionCount||0}:`;
   const id=local?(legacyIds.get(key)||prefix+`local:${anchor}:${slot}`):prefix+records.filter(f=>f.source.id===m.id).length;
   const record:MemoryRecord={id,roleId:r.id,scope:'real:'+r.id,layer,attribute,value,polarity,correction,at:m.at,knownBy:[r.id],origin:'explicit-user',source:snapshot(m),supersedes:[],...(contextSource?{contextSource:snapshot(contextSource)}:{})};
   retainId(record,prefix+`local:${anchor}:${slot}`);
   record.supersedes=records.filter(old=>polarity==='deny'?old.polarity==='affirm'&&normalize(old.value)===normalize(value):old.polarity==='deny'&&normalize(old.value)===normalize(value)||old.polarity==='affirm'&&attribute!=='self'&&old.attribute===attribute&&!old.mutual).map(old=>old.id);
   records.push(record);keys.set(key,record.id);return record;
  };
  for(const c of clauses){
   current=c;part=0;anchor=c.start+':'+c.end;const clause=c.text;
   let match:RegExpMatchArray|null;
   if((match=clause.match(/^我的([^不是:：]{1,12})不是(.+?)而是(.+)$/))){add('attribute:'+match[1],match[2],'deny');add('attribute:'+match[1],match[3],'affirm');continue;}
   if((match=clause.match(/^我不是(.+?)而是(.+)$/))){add('self',match[1],'deny');add('self',match[2],'affirm');continue;}
   if((match=clause.match(/^(?:而)?是(.+)$/))&&/^我不是/.test(text)){add('self',match[1],'affirm');continue;}
   if((match=clause.match(/^(?:其实|更正[：:]?\s*)?(?:我的([^不是:：]{1,12})(不是|是|[：:])(.+))$/))){add('attribute:'+match[1],match[3],match[2]==='不是'?'deny':'affirm');continue;}
   if((match=clause.match(/^(?:其实)?我(不是|是|叫)(.+)$/))){add(match[1]==='叫'?'name':'self',match[2],match[1]==='不是'?'deny':'affirm');continue;}
   if((match=clause.match(/^我们(?:现在|已经)?是(.+)$/))){
    const added=add('relationship',match[1],'affirm'),parent=local?added:records.at(-1),next=messages[index+1];
    const consent=next?.memoryScope===m.memoryScope&&next?.speaker==='char'&&!uncertain.test(next.text)?assertedText(next.text).trim().match(/^(?:(?:是的|好|嗯)[，,]\s*)?我们(?:现在|已经)?是([^。.!！?？]+)[。.!！]?$/):null;
    if(parent?.source.id===m.id&&consent&&normalize(consent[1])===normalize(parent.value)){
     const confirmation:MemoryRecord={...parent,id:parent.id+':confirmed:'+encodeURIComponent(next.id)+':'+(next.revisionCount||0),at:next.at,mutual:true,contextSource:snapshot(next),supersedes:[parent.id,...records.filter(old=>old.layer==='relationship'&&old.mutual).map(old=>old.id)]};
     retainId(confirmation,confirmation.id+':local');records.push(confirmation);
    }
    continue;
   }
   if((match=clause.match(/^I (am not|am|work as|live in) (.+)$/i))){add(/live/i.test(match[1])?'attribute:residence':'self',match[2],/not/i.test(match[1])?'deny':'affirm');}
  }
  // A plain denial can refer to the immediately preceding direct question, not arbitrary old text.
  const previous=messages[index-1];
  current={text:'',start:0,end:0,allowed:true};part=0;anchor='context';
  if(correction&&/^不是[，,。\s]/.test(text)&&previous?.speaker==='char'&&previous.memoryScope===m.memoryScope){
   const question=previous.text.trim().match(/^(?:你是不是(.+?)[？?。]?|你是(.+?)(?:吧|吗)[？?。]?|(?:Are you|You are) (.+?)(?:\?|,? right\?))$/i);
   const value=question&&(question[1]||question[2]||question[3]);
   if(value&&!uncertain.test(value)&&records.some(f=>f.source.id===m.id&&f.polarity==='affirm'))add('self',value,'deny',previous);
  }
 }
 return {records,keys};
}
function derive(r:RoleData,at:number):MemoryRecord[] {
 // Legacy matching reserves IDs only; local source validation alone decides which assertions are facts.
 return deriveRecords(r,at,true,deriveRecords(r,at,false).keys).records;
}
function sourceValid(r:RoleData,s:MemoryRecord['source'],at:number,user=false):boolean {
 const m=memoryInputs(r,at).find(m=>m.id===s.id&&m.memoryScope===s.scope&&(m.memoryScope||!m.kind||m.kind==='chat'));
 return Boolean(m&&(!user||m.speaker==='me')&&matchesMessageSource(m,s));
}
function sourceChanged(r:RoleData,s:MemoryRecord['source'],at:number):boolean {
 // A source omitted from a bounded request is not a withdrawal.
 const originals=s.scope?.startsWith('scene:')?[...(r.meetings||[]),...(r.scene?[r.scene]:[])].flatMap(p=>p.messages):s.scope?.startsWith('backstage:')?[...(r.plays||[]),...(r.play?[r.play]:[])].flatMap(p=>p.intermissionMessages||[]):r.chats;
 return originals.some(m=>m.id===s.id&&m.at<=at&&!sourceValid(r,s,at));
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
 if(added.length)r.memory={...r.memory,version:1,records:[...previous,...added]};syncRoleExperiences(r,at);return true;
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
