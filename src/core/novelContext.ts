import {encounterHistory,encounterEntryContext} from './encounter';
import type {ConversationContext} from './conversationPrompt';
import type {AppData,RoleData,ChatMessage} from './types';
import type {FruitSource} from './fruit/types';
import {formatMessageContentForModel,getActiveMessages} from './revisions';
import {projectedUserFields,projectRoleMemory,memoryFactText,relationshipContext,memoryRuleConflicts} from './memory';

const authorized=new WeakSet<ConversationContext>();
export const isLiveNovelContext=(context:ConversationContext)=>authorized.has(context);

/** Adapt already retrieved candidates against their actual role/scene records; flags alone confer no authority. */
export function createLiveNovelContext(data:AppData,r:RoleData,kind:'scene'|'play',base:ConversationContext):ConversationContext {
 const p=kind==='play'?r.play:r.scene,mode=kind==='play'?'theatre':'meeting';
 if(!p||p.endedAt||('paused'in p&&p.paused)||!data.roles.some(role=>role.id===r.id)||base.source!=='native-live'||base.mode!==mode||base.actorId!==r.id||!Number.isFinite(base.now))throw new Error('小说上下文归属无效，请重新打开当前场景');
 const at=base.now,scope=kind==='play'?'play:'+p.id:'real:'+r.id,knownBy=[r.id,'user'];
 const historyIds=new Set((kind==='scene'?encounterHistory(r,p.messages):getActiveMessages(p.messages)).filter(m=>m.speaker!=='note'&&m.at<=at).slice(-30).flatMap(m=>[m.id,...(m.sourceMessageId?[m.sourceMessageId]:[])]));
 const facts:FruitSource[]=[];
 const add=(id:string,layer:FruitSource['layer'],marker:string,text:string)=>{if(text.trim())facts.push({id,text,layer,marker,at,scope,knownBy,active:true,revisionValid:true});};
 if(kind==='play'){
  const play=r.play!;
  add('identity:'+p.id,'identity','charDescription',`戏内身份：${play.char}`);
  add('persona:'+p.id,'identity','personaDescription',`戏内对方身份：${play.user}`);
  add('relationship:'+p.id,'relationship','worldInfoBefore','人物关系仅以本剧设定及已发生的戏内记录为准。');
  add('state:'+p.id,'currentState','scenario',`剧名：${play.title}；世界与开场：${play.world}；当前时间：${new Date(at).toISOString()}`);
 }else{
  add('identity:'+r.id,'identity','charDescription',`姓名：${r.name}；身份：${r.job}；所在区域与世界设定：${r.place}；人设：${r.profile}；Canon 与尚未发生的边界：${r.canonNotes||'以已确认设定为准'}`);
  add('traits:'+r.id,'identity','charPersonality',r.traits);
  const u=data.user;
  const fields=Object.fromEntries(projectedUserFields(u,r,at).map(f=>[f.key,f.conflicts.length?'':f.text])),memory=projectRoleMemory(r,at);
  add('persona:'+r.id,'identity','personaDescription',`对方称呼：${r.userAlias||fields.name||'未指定'}；身份：${fields.identity||''}；背景：${fields.background||''}；称呼与代词：${fields.pronouns||''}；自述：${fields.notes||''}；仅对本角色的补充：${memoryRuleConflicts('用户补充：'+r.notes,memory.denied).length>0?'':r.notes||''}`);
  for(const f of memory.facts)facts.push({id:f.id,text:memoryFactText(f),layer:f.layer,marker:f.layer==='identity'?'personaDescription':'worldInfoBefore',at:f.at,scope,knownBy:[r.id],active:true,revisionValid:true});
  add('relationship:'+r.id,'relationship','worldInfoBefore',relationshipContext(r,at));
  const entry=encounterEntryContext(r,at);
  add('state:'+r.id,'currentState','scenario',`本次见面地点：${r.scene!.where}；当前时间：${new Date(at).toISOString()}${entry?'\n'+entry:''}`);
  const realMessages=[...r.chats,...(r.scene?.messages||[]),...(r.meetings||[]).flatMap(s=>s.messages)];
  const active=new Map(getActiveMessages(realMessages).filter(m=>m.at<=at).map(m=>[m.id,m]));
  for(const candidate of base.facts.filter(f=>f.layer==='episodic')){
   const e=r.events.find(e=>e.id===candidate.id),message=e?.messageId?active.get(e.messageId):undefined;
   if(e?.messageId&&historyIds.has(e.messageId))continue;
   if(!e||e.at>at||e.status==='retracted'||e.status==='superseded'||e.kind==='drama'||(e.messageId&&(!message||message.text!==e.detail)))continue;
   if(e.knownBy?.length?!e.knownBy.includes(r.id):!message)continue;
   if(!e.messageId&&!e.source)continue;
   facts.push({...candidate,text:`[记录来源 ${e.source||e.messageId}；${e.speaker==='me'?'对方原话':e.speaker==='char'?'角色发言（不代表对外部事实的证实）':'正式事件记录'}] ${e.title}：${e.detail}`,scope,knownBy:e.knownBy?.length?[...e.knownBy]:knownBy,active:true,revisionValid:true});
  }
 }
 const history=(kind==='scene'?encounterHistory(r,p.messages):getActiveMessages(p.messages)).filter(m=>m.speaker!=='note'&&m.at<=at).slice(-30).map(m=>{
  const quote=m.quote&&getActiveMessages(p.messages).find(q=>q.id===m.quote!.id&&q.at<=m.at);
  const source:ChatMessage={...m,quote:quote?{id:quote.id,speaker:quote.speaker,text:quote.text,at:quote.at}:null};
  return {id:m.id,role:m.speaker==='me'?'user' as const:'assistant' as const,text:`[消息 ID=${m.id}; createdAt=${new Date(m.at).toISOString()}]\n${formatMessageContentForModel(source,base.char,base.user)}`,at:m.at,scope,knownBy,active:true,revisionValid:true};
 });
 const context:ConversationContext={source:'novel-live',mode,memoryDenied:kind==='scene'?base.memoryDenied:[],actorId:r.id,scope,now:at,user:base.user,char:base.char,facts,history,examples:[],capabilities:{keywordRetrieval:kind==='scene',semanticRetrieval:false,completeRevisionChain:false}};
 authorized.add(context);return context;
}
