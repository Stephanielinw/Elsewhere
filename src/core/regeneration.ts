import type {AppData,ChatMessage,RevisionScope,RoleData} from './types';
import {buildFirstMessagePrompt} from './firstMessage';
import {buildMessagesForModel,dt} from './prompt';
import {getActiveMessages,getScopeMessages,prepareRegenerateReply} from './revisions';

/** Build a bounded copy; the live history is never changed while the model is pending. */
export function buildRegenerationPlan(data:AppData, role:RoleData, scope:RevisionScope, targetId:string) {
  const original=getScopeMessages(role,scope);
  const target=getActiveMessages(original).find(m=>m.id===targetId);
  if (!target || target.speaker!=='char') return null;
  const copy=JSON.parse(JSON.stringify(role)) as RoleData;
  const trial=prepareRegenerateReply(copy,scope,targetId,target.at);
  if (!trial.ok) return null;
  const source=trial.promptMessage;
  const activeBefore=getActiveMessages(original).slice(0,getActiveMessages(original).findIndex(m=>m.id===targetId));
  if (!source && (scope!=='chat' || activeBefore.some(m=>m.speaker==='char'))) return null;
  const list=getScopeMessages(copy,scope);
  const sourceIndex=source ? list.findIndex(m=>m.id===source.id) : -1;
  if (source && sourceIndex<0) return null;
  const cutoff=source?.at ?? target.at;
  const history=source ? list.slice(0,sourceIndex+1).filter(m=>m.id===source.id || !m.editedAt || m.editedAt<=cutoff) : [];
  const ids=new Set(history.map(m=>m.id));
  for (const m of history) if (m.quote && !ids.has(m.quote.id)) m.quote=null;
  if (scope==='chat') { copy.chats=history; copy.scene=null; }
  else if (scope==='scene' && copy.scene) copy.scene.messages=history;
  else if (scope==='play' && copy.play) copy.play.messages=history;
  // shortcut: old memory and shared-task snapshots are unavailable; omit them until historical provenance exists.
  copy.events=[];
  copy.diaries=[];
  const boundedData:AppData={...data,sharedTasks:{ddl:[],todo:[]}};
  const messages=source ? buildMessagesForModel(boundedData,copy,scope,source.text,{nowTs:cutoff}) : buildFirstMessagePrompt(copy,data.user,dt(cutoff));
  const contextSignature=(messages:ChatMessage[])=>JSON.stringify(messages.slice(0,messages.findIndex(m=>m.id===targetId)+1).map(m=>[m.id,m.status,m.text,m.revisionCount,m.quote]));
  return {sourceId:source?.id, sourceText:source?.text, targetId, targetAt:target.at, messages, signature:contextSignature(original), contextSignature, supersededIds:trial.supersededMessageIds || []};
}
