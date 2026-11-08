import type {RoleData} from './types';
import {compactRoleMemory,relationshipContext} from './memory';
import {collectRoleLife,personalContext,lifeSourcesValid} from './roleLife';
import {experienceContext,observedRoleState,roleEpisodes} from './roleExperience';
import {meetingPlan} from './encounter';
import {lifeActivity,lifePlanShape} from './lifeExecution';
/** One role-owned four-layer view. Mode adapters cannot create competing histories. */
export function readRoleMemory(r:RoleData,at:number,query='',options:{excludeStage?:string;since?:number}={}){
 const declarations=compactRoleMemory(r,at),life=collectRoleLife(r,at),episodes=experienceContext(r,query,at,declarations.supersededSources,{...options,includePerformance:true}),observed=observedRoleState(r,at);
 const plans=(Array.isArray(r.lifePlans)?r.lifePlans:[]).filter(p=>lifePlanShape(r,p)&&p.acceptedAt<=at&&p.expiresAt>at&&lifeSourcesValid(r,p.sources,at)),running=plans.flatMap(p=>p.intents).find(s=>s.status==='running'&&s.startedAt!<=at&&s.until!>at);
 const state=observed.kind==='unknown'&&running?{kind:'life' as const,label:lifeActivity(running.action,r.name,running.focus,running.person,running.where)[0],where:running.where||'地点未记录',sourceId:running.id,at:running.startedAt!}:observed;
 return {roleId:r.id,identity:{name:r.name,job:r.job,profile:r.profile,traits:r.traits},relationship:relationshipContext(r,at,declarations),declarations,episodes,state,life,
  pending:[...(meetingPlan(r,at)&&['proposed','confirmed'].includes(meetingPlan(r,at)!.status)?[{id:'meeting-plan',text:meetingPlan(r,at)!.timeText||'未结束的约定'}]:[]),...life.threads.filter(t=>t.kind==='plan').map(t=>({id:t.id,text:t.text})),...plans.flatMap(p=>p.intents.filter(s=>s.status==='pending').slice(0,2).map(s=>({id:s.id,text:'可能'+lifeActivity(s.action,r.name,s.focus,s.person,s.where)[0]+'（条件未满足，不是事实）'})))],
  experienceIds:roleEpisodes(r,at).map(e=>e.id),privateText:personalContext(r,at,{query})};
}
export function roleMemoryText(r:RoleData,at:number,query='',options:{excludeStage?:string;since?:number;includeEpisodes?:boolean}={}){
 const view=readRoleMemory(r,at,query,options);
 return `[角色级四层记忆 · ${r.id}]\n当前身份：${r.name}；${r.job}。当前关系：${view.relationship}。\n当前状态：${view.state.label}；${view.state.where}。\n未完事项（计划不是已发生事实）：${view.pending.map(p=>p.text).join('；')||'没有可验证的明确计划'}。\n现实经历与表演经历保持各自语境；结束见面不推断谁离开，角色主张不是外部事实证实。\n${options.includeEpisodes===false?'':view.episodes.facts.map(f=>f.text).join('\n')}`;
}
