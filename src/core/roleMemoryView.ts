import type {RoleData} from './types';
import {compactRoleMemory,relationshipContext} from './memory';
import {collectRoleLife,personalContext,lifeSourcesValid} from './roleLife';
import {experienceContext,observedRoleState,roleEpisodes} from './roleExperience';
import {meetingPlan} from './encounter';
import {sceneMessagesAt,scenePlaceAt,stageMessagesAt} from './messageProvenance';
import {lifeActivity,lifePlanShape} from './lifeExecution';
export function roleCurrentState(r:RoleData,at:number,life=collectRoleLife(r,at)){
 const observed=observedRoleState(r,at),plans=(Array.isArray(r.lifePlans)?r.lifePlans:[]).filter(p=>lifePlanShape(r,p)&&p.acceptedAt<=at&&p.expiresAt>at&&lifeSourcesValid(r,p.sources,at)),running=plans.flatMap(p=>p.intents).find(s=>s.status==='running'&&s.startedAt!<=at&&s.until!>at);
 if(observed.kind!=='unknown')return observed;
 if(running)return {kind:'life' as const,label:lifeActivity(running.action,r.name,running.focus,running.person,running.where)[0],where:running.where||'地点未记录',sourceId:running.id,at:running.startedAt!};
 const scenes=[...(r.meetings||[]),...(r.scene?[r.scene]:[])],plays=[...(r.plays||[]),...(r.play?[r.play]:[])];
 const lastAttendanceEnd=(stage:typeof scenes[number]|typeof plays[number])=>Array.isArray(stage.attendance)?stage.attendance.at(-1)?.to:undefined;
 const records=[...life.events.map(e=>({at:e.lifeRecord?.until??e.at,label:e.title,where:life.historicalProfileEventIds.has(e.id)?'':e.where||'',sourceId:e.id})),...scenes.filter(s=>scenes.filter(x=>x.id===s.id).length===1&&s.startedAt<=at&&sceneMessagesAt(r,s.messages,at).some(m=>m.speaker!=='note'&&m.kind!=='play')&&(s.endedAt!==undefined||lastAttendanceEnd(s)!==undefined)).map(s=>({at:s.endedAt??lastAttendanceEnd(s)!,label:s.endedAt?'与你见面':'见面暂歇',where:s.locationEvidence||s.agreement?scenePlaceAt(r,s,at):s.where,sourceId:s.id})),...plays.filter(p=>p.startedAt<=at&&stageMessagesAt([...p.messages,...(p.intermissionMessages||[])],at).length&&(p.endedAt!==undefined||lastAttendanceEnd(p)!==undefined)).map(p=>({at:p.endedAt??lastAttendanceEnd(p)!,label:'排演《'+p.title+'》',where:'',sourceId:p.id}))].filter(e=>e.at<=at&&at-e.at<=86400000).sort((a,b)=>b.at-a.at);
 const latest=records[0];return latest?{kind:'recent' as const,label:'最近：'+latest.label,where:latest.where?latest.where+'（当时）':'地点尚未确认',sourceId:latest.sourceId,at:latest.at}:observed;
}
interface EpisodeOptions {excludeStage?:string;since?:number;excludeMessageIds?:ReadonlySet<string>;preferredPlayId?:string;phoneRelevantOnly?:boolean}
/** One role-owned four-layer view. Mode adapters cannot create competing histories. */
export function readRoleMemory(r:RoleData,at:number,query='',options:EpisodeOptions={}){
 const declarations=compactRoleMemory(r,at),life=collectRoleLife(r,at),episodes=experienceContext(r,query,at,declarations.supersededSources,{...options,includePerformance:true}),state=roleCurrentState(r,at,life);
 const plans=(Array.isArray(r.lifePlans)?r.lifePlans:[]).filter(p=>lifePlanShape(r,p)&&p.acceptedAt<=at&&p.expiresAt>at&&lifeSourcesValid(r,p.sources,at));
 const agreement=meetingPlan(r,at);
 return {roleId:r.id,identity:{name:r.name,job:r.job,profile:r.profile,traits:r.traits},relationship:relationshipContext(r,at,declarations),declarations,episodes,state,life,
  pending:[...(agreement&&['proposed','confirmed'].includes(agreement.status)?[{id:'meeting-plan',text:agreement.timeText||'未结束的约定'}]:[]),...life.threads.filter(t=>t.kind==='plan').map(t=>({id:t.id,text:t.text})),...plans.flatMap(p=>p.intents.filter(s=>s.status==='pending').slice(0,2).map(s=>({id:s.id,text:'可能'+lifeActivity(s.action,r.name,s.focus,s.person,s.where)[0]+'（条件未满足，不是事实）'})))],
  experienceIds:roleEpisodes(r,at).map(e=>e.id),privateText:personalContext(r,at,{query})};
}
export function roleMemoryText(r:RoleData,at:number,query='',options:EpisodeOptions&{includeEpisodes?:boolean;includePrivate?:boolean}={},view=readRoleMemory(r,at,query,options)){
 return `[角色级四层记忆 · ${r.id}]\n当前身份：${r.name}；${r.job}。当前关系：${view.relationship}。\n当前状态：${view.state.kind==='recent'?'当前活动和地点未确认。'+view.state.label+'；'+view.state.where:view.state.label+'；'+view.state.where}。\n未完事项（计划不是已发生事实）：${view.pending.map(p=>p.text).join('；')||'没有可验证的明确计划'}。\n现实经历与表演经历保持各自语境；结束见面不推断谁离开，角色主张不是外部事实证实。\n${options.includeEpisodes===false?'':view.episodes.facts.map(f=>f.text).join('\n')}\n${options.includePrivate===false?'':view.privateText}`;
}
