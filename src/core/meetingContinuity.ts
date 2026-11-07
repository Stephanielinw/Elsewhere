import type {RoleData} from './types';
import {sceneMessagesAt,messageSourceIndex} from './messageProvenance';
import {estimateTextTokens,memoryExcerpt,memoryRelevance} from './contextBudget';

export const MEETING_CONTINUITY_TOKENS=1000;
/** Read-only excerpts, not a summary or a new permanent fact. */
export function meetingContinuity(r:RoleData,query:string,at:number,rejected:ReadonlySet<string>){
 const index=messageSourceIndex(r,at),counts=new Map<string,number>();
 const withheld=new Set(r.events.filter(e=>e.messageId&&e.status!=='retracted'&&e.status!=='superseded'&&(e.sourceRevision===undefined||e.sourceRevision===(index.get(e.messageId)?.revisionCount||0))&&e.knownBy?.length&&!e.knownBy.includes(r.id)).map(e=>e.messageId));
 const messageIds=new Set((r.meetings||[]).flatMap(s=>Array.isArray(s.messages)?s.messages.filter(Boolean).map(m=>m.id):[]));
 for(const scene of r.meetings||[])counts.set(scene.id,(counts.get(scene.id)||0)+1);
 const candidates=(r.meetings||[]).filter(s=>counts.get(s.id)===1&&Number.isFinite(s.startedAt)&&Number.isFinite(s.endedAt)&&s.startedAt<=s.endedAt!&&s.endedAt!<=at)
  .sort((a,b)=>b.endedAt!-a.endedAt!).slice(0,12).map(scene=>{
   const messages=sceneMessagesAt(r,scene.messages,at).filter(m=>m.at>=scene.startedAt&&m.at<=scene.endedAt!&&m.kind!=='play'&&m.novelOutput?.mode!=='theatre'&&index.has(m.id)&&!withheld.has(m.id)&&!rejected.has(m.id)&&!rejected.has(m.sourceMessageId||'')&&
    // Unstructured user scene input can contain unspoken thoughts; only a verified phone bridge is public here.
    (m.speaker==='char'||m.speaker==='me'&&!!m.sourceMessageId));
   return {scene,messages,score:messages.reduce((score,m)=>Math.max(score,memoryRelevance(m.text,query)),0)};
  });
 const selected=candidates.filter(c=>c.score>0||at-c.scene.endedAt!<=86400000).sort((a,b)=>b.score-a.score||b.scene.endedAt!-a.scene.endedAt!).slice(0,2);
 const facts:{id:string;text:string;at:number;sourceIds:string[]}[]=[];
 let used=0;
 for(const {scene,messages} of selected){
  const ranked=messages.map((m,i)=>({m,i,score:memoryRelevance(m.text,query)})).sort((a,b)=>b.score-a.score||b.i-a.i);
  const positions=new Set([0,1,messages.length-2,messages.length-1]);
  for(const {i} of ranked.slice(0,2))for(const n of [i-1,i,i+1])positions.add(n);
  const chosen=ranked.filter(({i})=>positions.has(i)).slice(0,8),lines:{i:number;id:string;text:string}[]=[];
  const heading=`[见面原文 · Scene=${scene.id} · ${new Date(scene.startedAt).toISOString()} 至 ${new Date(scene.endedAt!).toISOString()}]\n`;
  let cost=estimateTextTokens(heading);
  for(const {m,i} of chosen){
   const text=`[消息=${m.id}; 修订=${m.revisionCount||0}; 原发于=${new Date(m.at).toISOString()}${m.editedAt!==undefined?'; 修订生效于='+new Date(m.editedAt).toISOString()+'（当前版本，不证明原发时已知）':''}; ${m.speaker==='char'?'角色原文（对话/叙述，主张不等于外部证实）':'用户已公开的手机原话'}] ${memoryExcerpt(m.text,query,120)}`;
   const size=estimateTextTokens(text+'\n');if(used+cost+size>MEETING_CONTINUITY_TOKENS)continue;
   cost+=size;lines.push({i,id:m.id,text});
  }
  if(lines.length){lines.sort((a,b)=>a.i-b.i);facts.push({id:'meeting:'+scene.id,text:heading+lines.map(l=>l.text).join('\n'),at:scene.endedAt!,sourceIds:lines.map(l=>l.id)});used+=cost;}
 }
 return {facts,messageIds};
}
