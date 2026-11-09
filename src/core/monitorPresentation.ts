import type {DailyFootprintItem,RoleData,UserProfileData} from './types';
import {collectDailyDiaryFacts,getLocalDayBounds} from './diary';
import {collectRoleLife} from './roleLife';
import {compactRoleMemory} from './memory';
import {artifactForLifeEvent} from './footprints';
import {episodeExcerpt,publicUserText} from './roleExperience';
export function newestMonitorFirst<T extends {id:string;timestamp?:number;at?:number}>(items:readonly T[]):T[]{
  return [...items].sort((a,b)=>(b.timestamp??b.at??0)-(a.timestamp??a.at??0)||(a.id<b.id?-1:a.id>b.id?1:0));
}
/** Only current source-backed records become visible; never trust a cached summary/thought. */
export function monitorItemsForDisplay(role:RoleData,user:UserProfileData,items:DailyFootprintItem[],now:number){
 const username=user.name?.trim()||role.userAlias?.trim()||'对方';
 return newestMonitorFirst(items.flatMap<DailyFootprintItem&{confirmed:true;sourceMessageCount:number;sourceEventCount:number}>(item=>{
  if(item.timestamp>now||item.id.startsWith('fp_chat_'))return [];
  const {endMs}=getLocalDayBounds(item.dateKey),cutoff=Math.min(now,endMs),life=collectRoleLife(role,cutoff).events;
  const facts=collectDailyDiaryFacts(role,item.dateKey,true,cutoff);let summary='',where:string|undefined;
  if(item.category==='life'){
   const event=life.find(e=>item.sourceEventIds.length===1&&e.id===item.sourceEventIds[0]);if(!event)return [];
   return [{...item,title:event.title,summary:event.detail,where:event.where,confirmed:true,sourceMessageCount:item.sourceMessageIds.length,sourceEventCount:1,innerThought:undefined,artifact:artifactForLifeEvent(role,event,cutoff)}];
  }
  if(item.category==='interaction'){
   const fact=compactRoleMemory(role,cutoff).facts.find(f=>f.mutual&&item.id==='fp_relation_'+f.id);if(!fact)return [];
   summary=`与${username}明确确认了「${fact.value}」的关系。`;
  }else if(item.category==='scene'){
   const scene=facts.sceneBlocks.find(s=>item.id==='fp_scene_'+s.id&&s.messages.some(m=>m.at<=cutoff));if(!scene)return [];where=scene.where;
   const exchange=scene.messages.filter(m=>m.kind!=='play'&&m.novelOutput?.mode!=='theatre'&&(m.speaker==='char'||m.speaker==='me'&&publicUserText(m))).slice(-2);
   summary=exchange.length?exchange.map(m=>`${m.speaker==='char'?role.name:username}的原话：${episodeExcerpt(m.text,'',90)}`).join('\n'):`${role.name}在「${where}」与${username}见面。`;
   return [{...item,title:'与你见面',summary,where,confirmed:true,sourceMessageCount:scene.messages.length,sourceEventCount:0,innerThought:undefined,artifact:undefined}];
  }else if(item.category==='focus'){
   if(!facts.focusEvents.some(e=>item.sourceEventIds.includes(e.id)&&e.at<=cutoff))return [];summary=`${role.name}留出了一段专注的时间。`;
  }else if(item.category==='drama'){
   const play=facts.playBlocks.find(p=>item.id==='fp_play_'+p.id&&[...p.messages,...p.intermissionMessages].some(m=>m.at<=cutoff));if(!play)return [];summary=`${role.name}参与了《${play.title}》的排演；这是戏外的参与记录。`;
  }else return [];
  return [{...item,summary,where,confirmed:true,sourceMessageCount:item.sourceMessageIds.length,sourceEventCount:item.sourceEventIds.length,innerThought:undefined,artifact:undefined}];
 }));
}
