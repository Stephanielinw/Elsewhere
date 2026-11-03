import type {AppData,ChatBatch,RoleData} from './types';
import {compileNativeConversation,compileOpeningPrompt,type NativePromptOptions} from './prompt';
import {requestMessages} from './conversationPrompt';
import {getActiveMessages,prepareRegenerateReply} from './revisions';
import {sourceStillValid} from './chatScheduler';

export function compileChatBatchPrompt(data:AppData,r:RoleData,batch:ChatBatch,at:number,options:NativePromptOptions={}) {
  if(r.id!==batch.roleId||!batch.sources.length||!batch.sources.every(source=>sourceStillValid(r,source)))throw new Error('聊天来源已变化');
  const copy=structuredClone(r),excluded=new Set([...batch.sources.map(m=>m.id),...(r.chatTiming?.pending||[])]);
  const lastIndex=r.chats.findIndex(m=>m.id===batch.sources.at(-1)!.id);
  copy.chats=r.chats.slice(0,lastIndex+1).filter(m=>!excluded.has(m.id));
  copy.events=r.events.filter(e=>!e.messageId||!excluded.has(e.messageId));
  const input=batch.sources.map(m=>m.text).join('\n');
  // Mode changes timing only; character voice and native control rules stay the same.
  return compileNativeConversation(data,copy,'chat',input,{...options,isFocused:false,nowTs:at,currentInputs:batch.sources});
}
export function buildChatBatchMessages(data:AppData,r:RoleData,batch:ChatBatch,at:number,options:NativePromptOptions={}):{role:string;content:string}[]{return requestMessages(compileChatBatchPrompt(data,r,batch,at,options));}
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
export function buildPhoneRegeneration(data:AppData,r:RoleData,id:string,at:number,options:NativePromptOptions={}) {
  const copy=structuredClone(r),target=getActiveMessages(copy.chats).find(m=>m.id===id&&m.speaker==='char');
  if(!target)return null;
  const prep=prepareRegenerateReply(copy,'chat',id,at);
  if(!prep.ok)return null;
  const sourceIds=target.replySourceIds || (target.replyTo?[target.replyTo]:prep.promptMessage?[prep.promptMessage.id]:[]);
  const sources=sourceIds.map(sourceId=>getActiveMessages(r.chats).find(m=>m.id===sourceId&&m.speaker==='me'));
  if(sources.some(m=>!m))return null;
  // shortcut: historical memory snapshots do not exist; replay uses bounded chat, without current retrieved events/diaries/tasks.
  copy.events=[];copy.diaries=[];copy.personalThreads=[];
  const compilation=sources.length?compileChatBatchPrompt({...data,sharedTasks:{ddl:[],todo:[]}},copy,{
    id:'regeneration',roleId:r.id,generation:0,sources:sources.filter((m):m is NonNullable<typeof m>=>Boolean(m)).sort((a,b)=>a.at-b.at),quietUntil:0,replyDueAt:0,revisionKey:'',sceneId:null,playId:null,
  },target.at,options):compileOpeningPrompt({...data,sharedTasks:{ddl:[],todo:[]}},copy,target.at,options);
  return {messages:requestMessages(compilation),compilation,sourceIds,targetIds:prep.supersededMessageIds||[],targetAt:target.at};
}
