import type {ChatBatch,ChatMessage,ChatTimingState,RoleData} from './types';
import {getActiveMessages,makeUid} from './revisions';
export type {ChatBatch} from './types';
export const CHAT_QUIET_MS=60000;
export const chatRevisionKey=(r:RoleData)=>JSON.stringify((r.messageRevisions||[]).filter(rev=>rev.scope==='chat').map(rev=>rev.id));
export function chatTiming(r:RoleData):ChatTimingState {
  return r.chatTiming ||= {version:1,focused:false,generation:0,pending:[],quietUntil:0};
}
export function setChatFocused(r:RoleData,focused:boolean):void {
  const state=chatTiming(r);if(state.focused===focused)return;
  state.focused=focused;delete state.replyDueAt;
}
export function sourceStillValid(r:RoleData,source:ChatMessage):boolean {
  return getActiveMessages(r.chats).some(m=>m.id===source.id&&m.speaker==='me'&&m.text===source.text&&m.at===source.at&&(m.revisionCount||0)===(source.revisionCount||0)&&JSON.stringify(m.quote||null)===JSON.stringify(source.quote||null));
}
const validIds=(r:RoleData,ids:string[])=>[...new Set(ids)].filter(id=>getActiveMessages(r.chats).some(m=>m.id===id&&m.speaker==='me'));
export function enqueueChat(r:RoleData,id:string,at:number):void {
  const state=chatTiming(r);
  if(state.pending.includes(id)||state.inFlight?.sources.some(m=>m.id===id)||!validIds(r,[id]).length)return;
  state.pending.push(id);state.quietUntil=Math.max(state.quietUntil,at+CHAT_QUIET_MS);
}
export function prepareChatDue(r:RoleData,now:number,delay:(quietAt:number)=>number):boolean {
  const state=chatTiming(r),ids=validIds(r,state.pending);
  let changed=ids.length!==state.pending.length;state.pending=ids;
  if(!ids.length){if(state.replyDueAt!==undefined){delete state.replyDueAt;changed=true;}return changed;}
  if(state.focused){if(state.replyDueAt!==state.quietUntil){state.replyDueAt=state.quietUntil;changed=true;}return changed;}
  if(now>=state.quietUntil && state.replyDueAt===undefined){state.replyDueAt=state.quietUntil+Math.max(0,delay(state.quietUntil));changed=true;}
  return changed;
}
export function claimChatBatch(r:RoleData,now:number,ready:boolean):ChatBatch|null {
  const state=chatTiming(r);
  if(state.inFlight||state.blocked==='failed'||r.scene||r.play||!state.pending.length||state.replyDueAt===undefined||now<Math.max(state.quietUntil,state.replyDueAt))return null;
  if(!ready){state.blocked='api';return null;}
  delete state.blocked;delete state.error;
  const sources=state.pending.map(id=>getActiveMessages(r.chats).find(m=>m.id===id&&m.speaker==='me')).filter((m):m is ChatMessage=>Boolean(m)).sort((a,b)=>a.at-b.at);
  if(!sources.length)return null;
  const batch:ChatBatch={id:makeUid('chat-batch'),roleId:r.id,generation:++state.generation,sources:structuredClone(sources),quietUntil:state.quietUntil,replyDueAt:state.replyDueAt,revisionKey:chatRevisionKey(r),sceneId:null,playId:null};
  state.inFlight=batch;state.pending=[];state.quietUntil=0;delete state.replyDueAt;
  return batch;
}
export function chatBatchValid(r:RoleData,batch:ChatBatch):boolean {
  const state=chatTiming(r);
  return r.id===batch.roleId&&state.inFlight?.id===batch.id&&state.generation===batch.generation&&chatRevisionKey(r)===batch.revisionKey&&(r.scene?.id||null)===batch.sceneId&&(r.play?.id||null)===batch.playId&&batch.sources.every(m=>sourceStillValid(r,m));
}
export function completeChatBatch(r:RoleData,batch:ChatBatch):boolean {
  if(!chatBatchValid(r,batch))return false;
  delete chatTiming(r).inFlight;return true;
}
function restoreSources(r:RoleData,batch:ChatBatch):void {
  const state=chatTiming(r);state.pending=validIds(r,[...batch.sources.map(m=>m.id),...state.pending]);
  state.quietUntil=Math.max(state.quietUntil,batch.quietUntil);
  state.replyDueAt=Math.max(state.replyDueAt||0,batch.replyDueAt);
  delete state.inFlight;
}
export function failChatBatch(r:RoleData,batch:ChatBatch,error:string):void {
  if(chatTiming(r).inFlight?.id!==batch.id)return;
  restoreSources(r,batch);const state=chatTiming(r);state.blocked='failed';state.error=error;
}
export function recoverChatTiming(r:RoleData):void {
  if(!r.chatTiming?.inFlight)return;
  failChatBatch(r,r.chatTiming.inFlight,'上次请求被刷新中断，请检查连接后重试。');r.chatTiming.generation++;
}
export function retryChatTiming(r:RoleData):void { const state=chatTiming(r);delete state.blocked;delete state.error; }
export function reviseChatTiming(r:RoleData,at:number):void {
  const state=chatTiming(r);if(state.inFlight)restoreSources(r,state.inFlight);
  state.generation++;state.pending=validIds(r,state.pending);if(state.pending.length)state.quietUntil=Math.max(state.quietUntil,at+CHAT_QUIET_MS);
  delete state.blocked;delete state.error;
}
