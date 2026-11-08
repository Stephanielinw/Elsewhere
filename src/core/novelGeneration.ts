import {permittedNovelSections} from './novelDocument';
import type {ChatMessage,RoleData,SceneData,PlayData} from './types';
import type {FruitPreset,FruitProfile} from './fruit/types';
import {getActiveMessages,makeUid,prepareRegenerateReply} from './revisions';
import {parseFruitOutput} from './fruit/output';
import {readChatResponse} from './chatBatchPrompt';
import {splitSceneReply} from './sceneReply';

export type NovelKind='scene'|'play';
// Ten characters/second with queue allowance; this is a client wait bound, not a provider SLA.
export function novelRequestTimeout(profile:FruitProfile){return Math.min(600_000,Math.max(180_000,profile.length.max*100));}
const stage=(r:RoleData,kind:NovelKind)=>kind==='play'?r.play:r.scene;
export function novelSourceKey(r:RoleData,kind:NovelKind){
 const p=stage(r,kind);
 const ids=new Set(r.events.flatMap(e=>e.messageId?[e.messageId]:[]));
 const sources=kind==='scene'?[...r.chats,...(r.meetings||[]).flatMap(s=>s.messages)].filter(m=>ids.has(m.id)).map(m=>[m.id,m.text,m.at,m.status,m.editedAt,m.revisionCount]):[];
 const realContext=kind==='scene'?[r.name,r.userAlias,r.notes,r.place,r.profile,r.canonNotes,r.relationship,r.traits,r.job,r.events.map(e=>[e.id,e.kind,e.title,e.detail,e.at,e.status,e.knownBy,e.source,e.messageId]),sources,r.messageRevisions?.map(v=>[v.id,v.scope,v.targetMessageId,v.at]),r.diaries.filter(d=>d.speaker==='me').map(d=>[d.id,d.text,d.at,d.sharedWith,d.sharedAt])]:null;
 return JSON.stringify([p?.id,p?.endedAt,kind==='play'&&r.play?[r.play.paused,r.play.title,r.play.world,r.play.user,r.play.char]:r.scene?.where,r.scene?.id,r.play?.id,getActiveMessages(p?.messages),realContext]);
}
export interface NovelTask {id:string;roleId:string;kind:NovelKind;stage:SceneData|PlayData;revision:string;controller:AbortController}
function unchanged(task:NovelTask,r:RoleData){return r.id===task.roleId&&stage(r,task.kind)===task.stage&&!task.stage.endedAt&&!(task.kind==='play'&&r.play?.paused)&&!task.controller.signal.aborted&&novelSourceKey(r,task.kind)===task.revision;}
export function createNovelTasks(){
 const active=new Map<string,NovelTask>();
 return {
  has(roleId:string,attemptId?:string){const task=active.get(roleId);return !!task&&(!attemptId||task.id===attemptId);},
  begin(r:RoleData,kind:NovelKind):NovelTask{
   if(active.has(r.id))throw new Error('本角色的小说请求尚未结束，请勿重复生成');
   const p=stage(r,kind);if(!p||p.endedAt||(kind==='play'&&r.play?.paused))throw new Error('当前场景已结束或暂停');
   const task:NovelTask={id:makeUid('novel-task'),roleId:r.id,kind,stage:p,revision:novelSourceKey(r,kind),controller:new AbortController()};active.set(r.id,task);return task;
  },
  valid(task:NovelTask,r:RoleData,currentRoleId:string|null|undefined){return currentRoleId===r.id&&active.get(r.id)===task&&unchanged(task,r);},
  finish(task:NovelTask){if(active.get(task.roleId)===task)active.delete(task.roleId);},
  cancel(roleId:string,kind?:NovelKind){const task=active.get(roleId);if(!task||kind&&task.kind!==kind)return false;task.controller.abort();active.delete(roleId);return true;},
 };
}
export function prepareNovelRegeneration(r:RoleData,kind:NovelKind,id:string){
 const p=stage(r,kind),target=getActiveMessages(p?.messages).find(m=>m.id===id&&m.speaker==='char');if(!p||!target)return null;
 const copy=structuredClone(r),prep=prepareRegenerateReply(copy,kind,id,target.at);if(!prep.ok)return null;
 const targetIds=prep.supersededMessageIds||[id],first=Math.min(...targetIds.map(id=>p.messages.findIndex(m=>m.id===id)).filter(i=>i>=0));
 stage(copy,kind)!.messages=structuredClone(p.messages.slice(0,first));
 // Historical memory snapshots do not exist: don't retrieve current events/diaries for a past turn.
 copy.events=[];copy.diaries=[];copy.chats=[];
 return {role:copy,targetId:id,targetIds,targetAt:target.at,input:prep.promptMessage?.text||'',sourceId:prep.promptMessage?.id};
}
export type NovelRegeneration=NonNullable<ReturnType<typeof prepareNovelRegeneration>>;
export function commitNovelReply(r:RoleData,task:NovelTask,item:ChatMessage,persist:()=>boolean,regeneration?:NovelRegeneration,completedAt=Date.now()){
 if(!unchanged(task,r))throw new Error('场景或来源已变化，迟到回复未写入');
 const p=stage(r,task.kind)!;
 if(p.messages.some(m=>m.id===item.id))throw new Error('回复已保存，未重复写入');
 const before={messages:structuredClone(p.messages),events:structuredClone(r.events),revisions:structuredClone(r.messageRevisions),scene:r.scene?structuredClone({where:r.scene.where,agreement:r.scene.agreement,locationEvidence:r.scene.locationEvidence}):null};
 try{
  let insert=p.messages.length;
  if(regeneration){
   insert=Math.max(...regeneration.targetIds.map(id=>p.messages.findIndex(m=>m.id===id)))+1;
   if(!prepareRegenerateReply(r,task.kind,regeneration.targetId,completedAt).ok)throw new Error('原回复已变化，未覆盖');
  }
  p.messages.splice(insert,0,item);
  r.events.push({id:makeUid('ev'),kind:task.kind==='play'?'drama':'scene',title:task.kind==='play'?'戏内人物的回复':`${r.name}的回复`,detail:item.text,at:item.at,source:p.id,messageId:item.id,speaker:'char',status:'active',knownBy:['user',r.id]});
  if(!persist())throw new Error('回复保存失败，原记录已保留，可重试');
 }catch(error){p.messages=before.messages;r.events=before.events;r.messageRevisions=before.revisions;if(r.scene&&before.scene){r.scene.where=before.scene.where;if(before.scene.agreement)r.scene.agreement=before.scene.agreement;else delete r.scene.agreement;if(before.scene.locationEvidence)r.scene.locationEvidence=before.scene.locationEvidence;else delete r.scene.locationEvidence;}throw error;}
}
/** Sampling only. Model, endpoint, credentials, stream and output limits belong to the connection/task. */
export function novelSamplingParameters(preset:FruitPreset){
 const result:Record<string,number>={};
 for(const [key,min,max]of [['temperature',0,2],['top_p',0,1],['frequency_penalty',-2,2],['presence_penalty',-2,2]]as const){
  const value=preset.modelParameters[key];if(value===undefined)continue;
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error(`预设参数 ${key} 无效，应为 ${min}–${max}`);
  result[key]=value;
 }
 return result;
}
export class NovelOutputError extends Error {constructor(public safeText:string){super('小说正文或完成状态无法接受；已接收的安全正文仅供复制，未归档');}}
export function safeNovelText(text:string):string {try{return parseFruitOutput(text).safeText;}catch{return '';}}
export async function readNovelResponse(response:Response,profile:FruitProfile,thirdParty:boolean){
 return parseNovelResponse(await readChatResponse(response),profile,thirdParty);
}
export function parseNovelResponse(text:string,profile:FruitProfile,thirdParty:boolean){
 const extracted=splitSceneReply(text),raw=extracted.text;
 if(!raw)throw new Error('小说正文为空，原记录保留');
 if(!thirdParty){const parsed=parseFruitOutput(raw),safe=parsed.content;if(!safe||/<\/?[\p{L}][^>]*(?:>|$)/u.test(safe))throw new NovelOutputError(safeNovelText(raw));return {text:safe,warnings:[] as string[],sections:undefined,auxiliary:undefined,...(extracted.payload?{sceneEvent:extracted.payload}:{})};}
 const parsed=parseFruitOutput(raw);
 if(!parsed.content||/<\/?[\p{L}][^>]*(?:>|$)/u.test(parsed.content))throw new NovelOutputError(parsed.safeText&&!/<\/?[\p{L}][^>]*(?:>|$)/u.test(parsed.safeText)?parsed.safeText:'');
 const auxiliary:Pick<NonNullable<ChatMessage['novelOutput']>,'scene'|'summary'|'characters'|'choices'|'generatedAuxiliary'>={};
 if(!parsed.diagnostics.length&&profile.output.scene&&parsed.scene)auxiliary.scene=parsed.scene;
 if(!parsed.diagnostics.length&&profile.output.summary&&parsed.summary)auxiliary.summary=parsed.summary;
 if(!parsed.diagnostics.length&&profile.output.characters){if(parsed.characters)auxiliary.characters=parsed.characters;if(parsed.choices)auxiliary.choices=parsed.choices;}
 if(!parsed.diagnostics.length&&profile.output.auxiliary&&parsed.generatedAuxiliary)auxiliary.generatedAuxiliary=parsed.generatedAuxiliary;
 return {text:parsed.content,warnings:parsed.diagnostics,sections:permittedNovelSections(parsed.sections,profile),auxiliary,...(extracted.payload?{sceneEvent:extracted.payload}:{})};
}
