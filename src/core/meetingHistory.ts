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
 try{
  scene.endedAt=at;r.meetings=[...(r.meetings||[]),scene];r.scene=null;r.lifeAt=at;r.meetingPlan=meetingPlan(r,at);
  r.events.push({id:makeUid('ev'),kind:'scene',title:'这次见面结束',detail:`面对面交互结束，最后记录地点为${scene.where}；不推断双方是否告别或谁离开。开始于${new Date(scene.startedAt).toISOString()}，结束于${new Date(at).toISOString()}。见面原始对白独立保存。`,at,source:scene.id,status:'active',knownBy:['user',r.id]});
  if(!persist())throw new Error('见面档案保存失败，原现场已保留，可重试');
  return scene;
 }catch(error){delete scene.endedAt;r.scene=scene;r.meetings=before.meetings;r.lifeAt=before.lifeAt;r.meetingPlan=before.meetingPlan;r.events.length=before.events;throw error;}
}
