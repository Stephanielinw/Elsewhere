import type {ChatMessage,MeetingPlan,RoleData,SceneData} from './types';

export function getActiveMessages(messages:ChatMessage[]|null|undefined):ChatMessage[]{
 return Array.isArray(messages)?messages.filter(m=>m&&!['retracted','superseded','deleted'].includes(String(m.status))):[];
}

/** The current body is the only usable version. A revision with no effective time cannot be dated. */
export function messageAvailableAt(m:ChatMessage,at:number):boolean{
 return Number.isFinite(m.at)&&m.at<=at&&typeof m.text==='string'&&
  (m.editedAt===undefined?!(m.revisionCount&&m.revisionCount>0):Number.isFinite(m.editedAt)&&m.editedAt>=m.at&&m.editedAt<=at);
}

export function matchesMessageSource(m:ChatMessage|undefined,s:MeetingPlan['sources'][number]):boolean{
 return !!m&&!!s&&m.id===s.id&&m.at===s.at&&m.text===s.text&&(m.revisionCount||0)===(s.revisionCount||0);
}

function scopedMessages(messages:ChatMessage[]|undefined,at:number):ChatMessage[]{
 const eligible=getActiveMessages(messages).filter(m=>messageAvailableAt(m,at));
 const counts=new Map<string,number>();
 for(const m of eligible)counts.set(m.id,(counts.get(m.id)||0)+1);
 return eligible.filter(m=>counts.get(m.id)===1);
}

function withValidQuote(m:ChatMessage,sources:Map<string,ChatMessage>,at:number):ChatMessage{
 const q=m.quote;
 if(!q)return m;
 const source=sources.get(q.id);
 return source&&source.speaker===q.speaker&&source.at===q.at&&source.id!==m.id&&
  messageAvailableAt(source,Math.min(at,m.at))&&typeof q.text==='string'&&q.text.length>0&&source.text.startsWith(q.text)?m:{...m,quote:null};
}

export function stageMessagesAt(messages:ChatMessage[]|undefined,at:number):ChatMessage[]{
 const effective=scopedMessages(messages,at);
 const sources=new Map(effective.map(m=>[m.id,m]));
 return effective.map(m=>withValidQuote(m,sources,at));
}

export function phoneMessagesAt(r:RoleData,at:number):ChatMessage[]{
 return stageMessagesAt(r.chats,at);
}

export function sceneMessagesAt(r:RoleData,messages:ChatMessage[]|undefined,at:number):ChatMessage[]{
 const originals=scopedMessages(r.chats,at);
 const phoneById=new Map(originals.map(m=>[m.id,m]));
 const effective=scopedMessages(messages,at).filter(m=>{
  if(!m.sourceMessageId)return true;
  const source=phoneById.get(m.sourceMessageId);
  return source?.speaker===m.speaker&&matchesMessageSource(source,{...m,id:m.sourceMessageId,revisionCount:m.revisionCount||0});
 });
 const sceneById=new Map(effective.map(m=>[m.id,m]));
 return effective.map(m=>withValidQuote(m,m.sourceMessageId?phoneById:sceneById,at));
}

export const roleScenes=(r:RoleData)=>[...new Map([...(r.meetings||[]),...(r.scene?[r.scene]:[])].filter(Boolean).map(s=>[s.id,s])).values()];
export const rolePlays=(r:RoleData)=>[...new Map([...(r.plays||[]),...(r.play?[r.play]:[])].filter(Boolean).map(p=>[p.id,p])).values()];

export function messageSourceIndex(r:RoleData,at:number,includePlays=false):Map<string,ChatMessage>{
 const messages=[...phoneMessagesAt(r,at),...roleScenes(r).flatMap(s=>sceneMessagesAt(r,s.messages,at)),
  ...(includePlays?rolePlays(r).flatMap(p=>[...stageMessagesAt(p.messages,at),...stageMessagesAt(p.intermissionMessages,at)]):[])];
 const unique=new Map<string,ChatMessage>(),ambiguous=new Set<string>();
 for(const m of messages){
  if(unique.has(m.id)){unique.delete(m.id);ambiguous.add(m.id);}
  else if(!ambiguous.has(m.id))unique.set(m.id,m);
 }
 return unique;
}

export function scenePlaceAt(r:RoleData,scene:SceneData,at:number):string {
 const unknown='地点未确认';
 if(!Number.isFinite(scene.startedAt)||scene.startedAt>at)return unknown;
 const sources=[...phoneMessagesAt(r,at),...sceneMessagesAt(r,scene.messages,at)];
 const valid=(refs:MeetingPlan['sources'])=>Array.isArray(refs)&&refs.every(ref=>{
  const matches=sources.filter(m=>m.id===ref.id);
  return matches.length===1&&matchesMessageSource(matches[0],ref);
 });
 const positions:{where:string;at:number}[]=[];
 const add=(state:Pick<SceneData,'where'|'locationEvidence'|'agreement'>)=>{
  const proof=state.locationEvidence;
  if(proof&&Number.isFinite(proof.at)&&proof.at>=scene.startedAt&&proof.at<=at&&valid(proof.sources)&&valid(state.agreement?.sources||[]))positions.push({where:state.where,at:proof.at});
 };
 const changes=r.events.filter(e=>e.sceneChange?.sceneId===scene.id);
 if(!changes.some(e=>e.sceneChange?.after.locationEvidence?.at===scene.locationEvidence?.at&&e.sceneChange?.after.where===scene.where))add(scene);
 for(const e of r.events){
  if(e.knownBy?.length&&!e.knownBy.includes(r.id))continue;
  const change=e.sceneChange;
  if(change?.sceneId===scene.id){
   // A recorded prior position has its own evidence, independent of the later move.
   if(e.status!=='retracted')add(change.before);
   if(e.at<=at&&e.status!=='retracted'&&e.status!=='superseded'&&valid(change.sources))add(change.after);
  }
  if(e.source===scene.id&&e.title==='更正本次见面地点'&&e.where&&e.at<=at&&e.status!=='retracted'&&e.status!=='superseded')positions.push({where:e.where,at:e.at});
 }
 if(positions.length)return positions.sort((a,b)=>b.at-a.at)[0].where||unknown;
 if(!scene.locationEvidence&&!scene.agreement&&
  scene.endedAt!==undefined&&scene.endedAt<=at&&
  !r.events.some(e=>e.sceneChange?.sceneId===scene.id||e.source===scene.id&&e.title==='更正本次见面地点'))return scene.where||unknown;
 return unknown;
}
