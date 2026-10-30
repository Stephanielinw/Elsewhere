import type {DailyFootprintItem,RoleData,UserProfileData} from './types';
import {collectDailyDiaryFacts,getRoleKnownEvents} from './diary';
import {getActiveEvents} from './revisions';
export function newestMonitorFirst<T extends {id:string;timestamp?:number;at?:number}>(items:readonly T[]):T[]{
  return [...items].sort((a,b)=>(b.timestamp??b.at??0)-(a.timestamp??a.at??0)||(a.id<b.id?-1:a.id>b.id?1:0));
}
const topics:[RegExp,string][]=[
  [/信件|信封|封信|来信|回信|寄信|写信|书信/,'信件'],[/工作|上班|同事/,'工作'],[/见面|碰面|约会/,'见面安排'],[/咖啡/,'咖啡'],[/吃饭|午饭|晚饭/,'用餐'],[/专注|学习|论文/,'学习与专注'],[/剧本|演戏|戏剧/,'戏剧'],[/日记/,'日记'],
];
const topic=(text:string)=>topics.find(([pattern])=>pattern.test(text))?.[1];

export function monitorItemsForDisplay(role:RoleData,user:UserProfileData,items:DailyFootprintItem[],now:number){
  const username=user.name?.trim()||role.userAlias?.trim()||'对方';
  const known=getRoleKnownEvents(role),knownIds=new Set(known.map(e=>e.id));
  const deniedMessages=new Set(getActiveEvents(role.events).filter(e=>e.messageId&&!knownIds.has(e.id)).map(e=>e.messageId));
  const days=new Map<string,ReturnType<typeof collectDailyDiaryFacts>>();
  return newestMonitorFirst(items.map(item=>{
    let facts=days.get(item.dateKey);if(!facts){facts=collectDailyDiaryFacts(role,item.dateKey);days.set(item.dateKey,facts);}
    const candidates=item.category==='interaction'?facts.chatMessages:item.category==='scene'?facts.sceneBlocks.flatMap(b=>b.messages):item.category==='drama'?facts.playBlocks.flatMap(b=>[...b.messages,...b.intermissionMessages]):[];
    const messages=candidates.filter(m=>m.at<=now&&m.speaker!=='note'&&item.sourceMessageIds.includes(m.id)&&!deniedMessages.has(m.id));
    const events=known.filter(e=>e.at<=now&&e.kind!=='life'&&item.sourceEventIds.includes(e.id));
    const diary=facts.sharedUserDiaries.find(d=>item.id==='fp_shared_diary_'+d.id&&(d.sharedAt?.[role.id]??d.at)<=now);
    const confirmed=Boolean(messages.length||events.length||diary);
    let title='活动记录待确认',description='暂无可确认的活动记录';
    if(confirmed){
      if(item.category==='interaction'){
        const subject=topic(messages.map(m=>m.text).join(' ')),sent=messages.some(m=>m.speaker==='char');
        title=`线上联络 · ${messages.length} 条消息`;
        description=sent?`与${username}线上联络${subject?`，聊起${subject}`:''}。`:`收到${username}发来的线上消息。`;
      }else if(item.category==='scene'){title='当面交谈';description=`与${username}当面交谈。`;}
      else if(item.category==='focus'){title='共同专注';description=`与${username}共同专注。`;}
      else if(item.category==='drama'){title='戏剧演出';description=`与${username}排演戏剧。`;}
      else if(item.category==='diary_share'){title='日记分享';description=`收到${username}分享的日记。`;}
    }
    const timestamp=confirmed?Math.max(...messages.map(m=>m.at),...events.map(e=>e.at),...(diary?[diary.sharedAt?.[role.id]??diary.at]:[])):item.timestamp;
    return {...item,confirmed,sourceMessageCount:messages.length,sourceEventCount:events.length,timestamp,title,summary:description,where:item.category==='scene'?facts.sceneBlocks.find(b=>b.messages.some(m=>messages.some(source=>source.id===m.id)))?.where:undefined,innerThought:item.innerThought?{...item.innerThought,surfaceState:description}:undefined};
  }));
}
