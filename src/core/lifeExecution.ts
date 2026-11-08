import type {EventRecord,FootprintArtifact,RoleData,SceneData,PlayData} from './types';
import type {PersonalSource} from './roleLife';
import {lifeSourcesValid} from './roleLife';
import {scenePlaceAt} from './messageProvenance';
import {dateDayNumber} from './homeTasks';
export type LifeAction='rest'|'walk'|'read'|'organize'|'practice'|'care'|'social'|'prepare-rest'|'reminder';
export interface LifeIntent {
 id:string;action:LifeAction;notBefore:number;expiresAt:number;durationMinutes:number;
 focus?:string;person?:string;where?:string;after?:string;artifact?:'memo'|'list';
 status:'pending'|'running'|'completed'|'interrupted'|'expired';startedAt?:number;until?:number;eventId?:string;reason?:string;
}
export interface RoleLifePlan {version:1;id:string;roleId:string;taskId:string;acceptedAt:number;expiresAt:number;sources:PersonalSource[];origin?:{where:string;at:number;sourceId:string};intents:LifeIntent[];lastCheckedAt?:number}
export const LIFE_ACTIONS:LifeAction[]=['rest','walk','read','organize','practice','care','social','prepare-rest','reminder'];
export function lifeActivity(action:string,name:string,focus?:string,person?:string,where?:string):[string,string]{
 const actions:Record<string,[string,string]>={rest:['歇息片刻',`${name}让自己歇了片刻。`],walk:['走动片刻',`${name}${where?'在'+where:''}走动了一会儿。`],read:['翻阅资料',`${name}翻看了关于「${focus}」的已有资料。`],organize:['整理手头物件',`${name}整理了「${focus}」。`],practice:['练习基本技巧',`${name}练习了与「${focus}」有关的基本技巧。`],care:['日常照料',`${name}照看、维护了「${focus}」。`],social:['短暂交谈',`${name}与${person}说了几句近况。`],'prepare-rest':['准备歇息',`${name}安放好「${focus}」，准备歇息。`],reminder:['留下提醒',`${name}在「${focus}」上记下已有待办的提醒。`]};return actions[action]||['',''];
}
export function stageIntervals(stage:SceneData|PlayData,at:number):{from:number;to:number}[]{
 const end=stage.endedAt??at,windows=stage.attendance;
 if(!Array.isArray(windows)||!windows.length)return [{from:stage.startedAt,to:end}];
 let previous=stage.startedAt;
 for(const w of windows){if(!Number.isFinite(w.from)||w.from<previous||w.to!==undefined&&(!Number.isFinite(w.to)||w.to<w.from||stage.endedAt!==undefined&&w.to>stage.endedAt))return [{from:stage.startedAt,to:end}];previous=w.to??at;}
 return windows.map(w=>({from:w.from,to:w.to??at}));
}
export function lifeStageOccupied(r:RoleData):boolean{return !![r.scene,r.play].find(s=>s&&!s.endedAt&&(!Array.isArray(s.attendance)||!s.attendance.length||s.attendance.at(-1)?.to===undefined));}
export function updateStageAttendance(stage:SceneData|PlayData,active:boolean,at:number):boolean{
 if(stage.endedAt||at<stage.startedAt)return false;
 if(stage.attendance!==undefined&&!Array.isArray(stage.attendance))return false;
 const last=stage.attendance?.at(-1);
 if(active){if(!last||last.to===undefined||at<last.to)return false;stage.attendance!.push({from:at});return true;}
 if(last?.to!==undefined)return false;
 stage.attendance=[...(stage.attendance||[{from:stage.startedAt}])];stage.attendance.at(-1)!.to=at;return true;
}
export function lifeOrigin(r:RoleData,at:number,historical=false):RoleLifePlan['origin']{
 const profile=JSON.stringify([r.name,r.job,r.traits,r.place,r.profile,r.relationship,r.canonNotes,r.notes]),scenes=[...(r.meetings||[]),...(r.scene?[r.scene]:[])];
 const entries=[...r.events.filter(e=>e.lifeRecord?.version===2&&e.lifeRecord.until<=at&&at-e.lifeRecord.until<=86400000&&e.status==='active'&&e.where&&lifeExecutionEvidence(r,e,at)&&(historical||e.lifeRecord.sources.find(s=>s.kind==='profile')?.version===profile)&&e.lifeRecord.sources.filter(s=>s.kind!=='profile').every(s=>lifeSourcesValid(r,[s],at))).map(e=>({where:e.where!,at:e.lifeRecord!.until,sourceId:e.id})),...scenes.filter(s=>scenes.filter(x=>x.id===s.id).length===1&&s.startedAt<=at).map(s=>({where:s.locationEvidence||s.agreement?scenePlaceAt(r,s,at):s.where,at:s.endedAt??s.attendance?.at(-1)?.to??s.startedAt,sourceId:s.id}))].filter(s=>s.where&&!/未确认|未知/.test(s.where)&&s.at<=at&&at-s.at<=86400000).sort((a,b)=>b.at-a.at);
 return entries[0];
}
export function lifePlanShape(r:RoleData,plan:RoleLifePlan):boolean {
 if(!plan||typeof plan!=='object'||!Array.isArray(r.lifeTasks))return false;
 const task=r.lifeTasks.filter(t=>t&&t.id===plan.taskId),t=task[0];
 if(!t||dateDayNumber(t.dateKey)===null||t.id!=='life:'+encodeURIComponent(r.id)+':'+t.dateKey||![t.at,t.from,t.to].every(Number.isFinite)||t.to!==t.at||t.from>t.to)return false;
 return !!(plan?.version===1&&plan.roleId===r.id&&task?.length===1&&t?.roleId===r.id&&t.status==='completed'&&t.planId===plan.id&&plan.id===t.id+':plan'&&Number.isFinite(plan.acceptedAt)&&plan.acceptedAt>=t.to&&plan.acceptedAt<t.to+10*60000&&plan.expiresAt===t.to+86400000&&Array.isArray(plan.sources)&&plan.sources.length>0&&Array.isArray(plan.intents)&&plan.intents.length<=8&&plan.intents.every((s,i)=>s&&s.id===plan.id+':step:'+i&&LIFE_ACTIONS.includes(s.action)&&Number.isFinite(s.notBefore)&&s.notBefore>=t.to&&s.expiresAt>s.notBefore&&s.expiresAt<=plan.expiresAt&&Number.isInteger(s.durationMinutes)&&s.durationMinutes>=1&&s.durationMinutes<=120&&['pending','running','completed','interrupted','expired'].includes(s.status)&&(!s.after||plan.intents.slice(0,i).some(old=>old.id===s.after))));
}
/** Completed evidence needs the accepted task, exact step and original interval, never a profile JSON alone. */
export function lifeExecutionEvidence(r:RoleData,e:EventRecord,at:number):RoleLifePlan|undefined{
 const record=e.lifeRecord;if(record?.version!==2)return;
 const plans=Array.isArray(r.lifePlans)?r.lifePlans.filter(p=>p?.id===record.planId):[],plan=plans[0];if(plans.length!==1||!lifePlanShape(r,plan!))return;
 const step=plan!.intents.find(s=>s.id===record.stepId),task=r.lifeTasks!.find(t=>t.id===plan!.taskId)!;
 if(!step||step.status!=='completed'||step.eventId!==e.id||e.id!==step.id+':event'||!task.eventIds?.includes(e.id)||new Set(task.eventIds).size!==task.eventIds.length||e.source!=='autonomous-life-v2:'+task.id||record.roleId!==r.id||record.taskId!==task.id||record.origin!=='simulation'||record.action!==step.action||record.until!==step.until||e.at!==step.startedAt||e.at<plan!.acceptedAt||e.at<step.notBefore||e.at>step.expiresAt||record.until!==e.at+step.durationMinutes*60000||record.until>plan!.expiresAt||record.until>at||e.where!==step.where||JSON.stringify(record.sources)!==JSON.stringify(plan!.sources))return;
 const profile=plan!.sources.find(s=>s.kind==='profile');let name;try{name=JSON.parse(profile?.version||'')[0];}catch{return;}
 if(!task.eventIds!.every(id=>plan!.intents.some(s=>s.status==='completed'&&s.eventId===id&&id===s.id+':event')))return;
 let sourceText;try{sourceText=plan!.sources.flatMap(s=>JSON.parse(s.version).flat(Infinity)).filter(v=>typeof v==='string').join('\n');}catch{return;}
 if(!['rest','walk','social'].includes(step.action)&&(!step.focus||!sourceText.includes(step.focus))||step.action==='social')return;
 const [title,detail]=lifeActivity(step.action,name,step.focus,step.person,step.where);
 if(e.title!==title||e.detail!==detail)return;
 if(step.where&&lifeOrigin(r,e.at,true)?.where!==step.where)return;
 return plan;
}
function overlaps(r:RoleData,from:number,to:number){return [...(r.meetings||[]),...(r.plays||[]),...(r.scene?[r.scene]:[]),...(r.play?[r.play]:[])].some(s=>stageIntervals(s,to).some(w=>from<w.to&&to>w.from));}
/** Only a persisted start may finish. Missed windows are expired, not invented as past activity. */
export function advanceLifePlans(r:RoleData,at:number,allowed:boolean,sourcesValid:(sources:PersonalSource[])=>boolean):boolean{
 let changed=false;
 for(const plan of Array.isArray(r.lifePlans)?r.lifePlans:[]){
  if(!lifePlanShape(r,plan))continue;
  const rollback=plan.lastCheckedAt!==undefined&&at<plan.lastCheckedAt;
  for(const step of plan.intents){
   if(!['pending','running'].includes(step.status))continue;
   const running=step.status==='running',prior=step.after?plan.intents.find(s=>s.id===step.after):undefined;
   const blocked=!allowed||lifeStageOccupied(r)||r.chatTiming?.pending.length||r.chatTiming?.inFlight||r.pendingReplies?.length||!sourcesValid(plan.sources)||rollback||step.action==='social';
   if(running){
    if(blocked||overlaps(r,step.startedAt!,Math.min(at,step.until!))){step.status='interrupted';step.reason='条件、来源或活动占用已变化；没有完成记录';changed=true;continue;}
    if(at<step.until!)continue;
    const origin=lifeOrigin(r,step.startedAt!);if(step.where&&(!origin||origin.where!==step.where)){step.status='interrupted';step.reason='所在地无法继续验证';changed=true;continue;}
    const [title,detail]=lifeActivity(step.action,r.name,step.focus,step.person,step.where),eventId=step.id+':event';if(r.events.some(e=>e.id===eventId))continue;
    const event:EventRecord={id:eventId,kind:'life',title,detail,at:step.startedAt!,where:step.where,source:'autonomous-life-v2:'+plan.taskId,status:'active',knownBy:[r.id],lifeEvidence:'confirmed',lifeRecord:{version:2,roleId:r.id,taskId:plan.taskId,planId:plan.id,stepId:step.id,origin:'simulation',action:step.action,until:step.until!,sources:plan.sources}};
    if(step.artifact){const paper:FootprintArtifact={kind:step.artifact,paperStyle:step.artifact==='list'?'craft':'parchment',header:title,bodyText:detail,groundedInEventIds:[eventId],...(step.artifact==='list'?{items:[{name:step.focus||title,checked:true}]}:{})};event.lifeRecord!.artifact=paper;}
    r.events.push(event);step.eventId=eventId;step.status='completed';const task=r.lifeTasks!.find(t=>t.id===plan.taskId)!;task.eventIds=[...(task.eventIds||[]),eventId];changed=true;
   }else if(at>step.expiresAt||at+step.durationMinutes*60000>plan.expiresAt){step.status='expired';step.reason='没有在有效条件窗口内开始';changed=true;}
   else if(!blocked&&at>=step.notBefore&&(!prior||prior.status==='completed')&&!plan.intents.some(s=>s.status==='running')){
    const origin=lifeOrigin(r,at);if(step.where&&(!origin||origin.where!==step.where))continue;
    if(!step.where&&origin)step.where=origin.where;
    step.status='running';step.startedAt=at;step.until=at+step.durationMinutes*60000;changed=true;
   }
  }
  if(changed)plan.lastCheckedAt=Math.max(plan.lastCheckedAt||0,at);
 }
 return changed;
}
