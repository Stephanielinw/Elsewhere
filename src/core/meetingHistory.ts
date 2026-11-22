import type {ChatMessage,RoleData,SceneData} from './types';
import {getActiveMessages,makeUid} from './revisions';
import {meetingPlan} from './encounter';

export type MeetingTimelineItem={kind:'message';id:string;at:number;message:ChatMessage}|{kind:'meeting';id:string;at:number;scene:SceneData};
export function meetingTimeline(r:RoleData):MeetingTimelineItem[]{
 const items:MeetingTimelineItem[]=getActiveMessages(r.chats).map(message=>({kind:'message',id:message.id,at:message.at,message}));
 const ids=new Set<string>();
 for(const scene of r.meetings||[]){
  if(ids.has(scene.id)||!Number.isFinite(scene.endedAt)||scene.endedAt! < scene.startedAt)continue;
  ids.add(scene.id);items.push({kind:'meeting',id:scene.id,at:scene.endedAt!,scene});
 }
 return items.map((item,index)=>({item,index})).sort((a,b)=>a.item.at-b.item.at||a.index-b.index).map(v=>v.item);
}
/** Archive the one owned Scene; rollback leaves the same live object available to retry. */
export function archiveMeeting(r:RoleData,at:number,persist:()=>boolean):SceneData|null {
 const scene=r.scene;if(!scene)return null;
 if(scene.endedAt||!Number.isFinite(at)||at<scene.startedAt)throw new Error('见面时间无效，现场已保留');
 if(r.meetings?.some(s=>s.id===scene.id))throw new Error('同一见面 ID 已有档案，未覆盖原记录');
 const before={meetings:r.meetings,lifeAt:r.lifeAt,meetingPlan:r.meetingPlan,events:r.events.length};
 // A real encounter supersedes speculative activities created before it.
 // Keep completed history; cancel only pending or overlapping incomplete work.
 const steps=(r.lifePlans||[]).flatMap(p=>p.intents.map(step=>({step,status:step.status,reason:step.reason})));
 const timelines=r.events.flatMap(e=>e.lifeRecord?.timeline?[{record:e.lifeRecord,timeline:e.lifeRecord.timeline,state:e.lifeRecord.timeline.state,until:e.lifeRecord.until}]:[]);
 try{
  for(const {step} of steps)if(step.status==='pending'&&step.expiresAt>scene.startedAt||step.status==='running'&&(step.until??0)>scene.startedAt){
   step.status=step.status==='pending'?'expired':'interrupted';
   step.reason='实际见面已改变此后的生活安排，需从最新事实重新规划';
  }
  for(const {record,timeline} of timelines){
   if(timeline.state==='pending'&&timeline.to>scene.startedAt)timeline.state='expired';
   else if(timeline.state==='running'&&timeline.to>scene.startedAt){
    const ended=Math.min(record.until,scene.startedAt);
    if(ended<=timeline.from)timeline.state='expired';
    else {timeline.state='interrupted';record.until=ended;}
   }
  }
  scene.endedAt=at;r.meetings=[...(r.meetings||[]),scene];r.scene=null;r.lifeAt=at;r.meetingPlan=meetingPlan(r,at);
  r.events.push({id:makeUid('ev'),kind:'scene',title:'这次见面结束',detail:`面对面交互结束，最后记录地点为${scene.where}；不推断双方是否告别或谁离开。开始于${new Date(scene.startedAt).toISOString()}，结束于${new Date(at).toISOString()}。见面原始对白独立保存。`,at,source:scene.id,status:'active',knownBy:['user',r.id]});
  if(!persist())throw new Error('见面档案保存失败，原现场已保留，可重试');
  return scene;
 }catch(error){
  for(const {step,status,reason} of steps){step.status=status;if(reason===undefined)delete step.reason;else step.reason=reason;}
  for(const {record,timeline,state,until} of timelines){timeline.state=state;record.until=until;}
  delete scene.endedAt;r.scene=scene;r.meetings=before.meetings;r.lifeAt=before.lifeAt;r.meetingPlan=before.meetingPlan;r.events.length=before.events;throw error;
 }
}
