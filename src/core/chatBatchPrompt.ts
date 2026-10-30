import type {AppData,ChatBatch,RoleData} from './types';
import {buildMessagesForModel,dt} from './prompt';
import {formatMessageContentForModel,getActiveMessages,prepareRegenerateReply} from './revisions';
import {buildFirstMessagePrompt} from './firstMessage';
import {sourceStillValid} from './chatScheduler';

export function buildChatBatchMessages(data:AppData,r:RoleData,batch:ChatBatch,at:number):{role:string;content:string}[] {
  if(r.id!==batch.roleId||!batch.sources.length||!batch.sources.every(source=>sourceStillValid(r,source)))throw new Error('聊天来源已变化');
  const copy=structuredClone(r),excluded=new Set([...batch.sources.map(m=>m.id),...(r.chatTiming?.pending||[])]);
  const lastIndex=r.chats.findIndex(m=>m.id===batch.sources.at(-1)!.id);
  copy.chats=r.chats.slice(0,lastIndex+1).filter(m=>!excluded.has(m.id));
  copy.events=r.events.filter(e=>!e.messageId||!excluded.has(e.messageId));
  const input=batch.sources.map(m=>m.text).join('\n');
  // Mode changes timing only; character voice and native control rules stay the same.
  const messages=buildMessagesForModel(data,copy,'chat',input,{isFocused:false,nowTs:at});
  for(const source of batch.sources){
    const date=new Date(source.at),local=date.toLocaleString('zh-CN',{hour12:false});
    messages.push({role:'user',content:`[消息 ID=${source.id}; createdAt=${date.toISOString()}; 本地发送时间=${local}]\n${formatMessageContentForModel(source,r.name,r.userAlias||data.user.name||'用户')}`});
  }
  return messages;
}
export async function readChatResponse(response:Response):Promise<string> {
  if(!response.ok)throw new Error(`回复请求失败（HTTP ${response.status}）`);
  let body:unknown;try{body=await response.json();}catch{throw new Error('回复不是有效 JSON');}
  if(!body||typeof body!=='object')throw new Error('回复格式无效');
  const value=body as Record<string,unknown>;
  if(value.error||!Array.isArray(value.choices)||!value.choices[0]||typeof value.choices[0]!=='object')throw new Error('接口未返回有效回复');
  const choice=value.choices[0] as Record<string,unknown>;
  if(!['stop','STOP'].includes(String(choice.finish_reason)))throw new Error('回复未正常完成，请检查连接后重试');
  if(!choice.message||typeof choice.message!=='object')throw new Error('接口未返回有效消息');
  const message=choice.message as Record<string,unknown>;
  if(message.role!=='assistant'||message.refusal||message.function_call||(message.tool_calls&&(!Array.isArray(message.tool_calls)||message.tool_calls.length))||typeof message.content!=='string'||!message.content.trim())throw new Error('接口未返回有效聊天正文');
  return message.content.trim();
}
export function buildPhoneRegeneration(data:AppData,r:RoleData,id:string,at:number):{messages:{role:string;content:string}[];sourceIds:string[];targetIds:string[];targetAt:number}|null {
  const copy=structuredClone(r),target=getActiveMessages(copy.chats).find(m=>m.id===id&&m.speaker==='char');
  if(!target)return null;
  const prep=prepareRegenerateReply(copy,'chat',id,at);
  if(!prep.ok)return null;
  const sourceIds=target.replySourceIds || (target.replyTo?[target.replyTo]:prep.promptMessage?[prep.promptMessage.id]:[]);
  const sources=sourceIds.map(sourceId=>getActiveMessages(r.chats).find(m=>m.id===sourceId&&m.speaker==='me'));
  if(sources.some(m=>!m))return null;
  // shortcut: historical memory snapshots do not exist; replay uses bounded chat, without current retrieved events/diaries/tasks.
  copy.events=[];copy.diaries=[];
  const messages=sources.length?buildChatBatchMessages({...data,sharedTasks:{ddl:[],todo:[]}},copy,{
    id:'regeneration',roleId:r.id,generation:0,sources:sources.filter((m):m is NonNullable<typeof m>=>Boolean(m)).sort((a,b)=>a.at-b.at),quietUntil:0,replyDueAt:0,revisionKey:'',sceneId:null,playId:null,
  },target.at):buildFirstMessagePrompt(copy,data.user,dt(target.at));
  return {messages,sourceIds,targetIds:prep.supersededMessageIds||[],targetAt:target.at};
}
