import type {MeetingTimelineItem} from './meetingHistory';
export const CHAT_PAGE_SIZE=80;
export const timelineKey=(item:MeetingTimelineItem)=>item.kind+':'+item.id;
export type ChatPosition={key:string;at:number};
export function chatWindow(all:MeetingTimelineItem[],oldest?:ChatPosition){
 // shortcut: expanded pages stay mounted; add eviction only if measured long-reading sessions require it.
 let start=oldest?all.findIndex(item=>timelineKey(item)===oldest.key):-1;
 if(start<0&&oldest)start=all.findIndex(item=>item.at>=oldest.at);
 if(start<0)start=Math.max(0,all.length-CHAT_PAGE_SIZE);
 return {start,items:all.slice(start),oldest:all[start]?{key:timelineKey(all[start]),at:all[start].at}:undefined};
}
