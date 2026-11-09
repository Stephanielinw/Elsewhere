import type {ChatMessage,RoleData,SceneData,PlayData} from './types';
import {phoneMessagesAt,sceneMessagesAt,stageMessagesAt,messageSourceIndex,scenePlaceAt} from './messageProvenance';
import {estimateTextTokens,memoryRelevance,memoryExcerpt} from './contextBudget';
import {stageIntervals} from './lifeExecution';

export interface EpisodeSource {id:string;at:number;revision:number;editedAt?:number;replyTo?:string}
export interface RoleEpisode {id:string;roleId:string;domain:'real'|'performance'|'backstage';kind:'phone'|'meeting'|'life'|'play'|'backstage';containerId:string;at:number;until?:number;sources:EpisodeSource[];links:string[]}
export interface RoleExperienceLedger {version:1;episodes:RoleEpisode[]}
const ref=(m:ChatMessage):EpisodeSource=>({id:m.id,at:m.at,revision:m.revisionCount||0,...(m.editedAt!==undefined?{editedAt:m.editedAt}:{}),...(m.replyTo?{replyTo:m.replyTo}:{})});
const id=(kind:string,key:string)=>'episode:'+kind+':'+encodeURIComponent(key);
/** Source identities persist; original bodies remain exclusively in their existing archives. */
export function roleEpisodes(r:RoleData,at:number):RoleEpisode[]{
 const episodes:RoleEpisode[]=[];
 const add=(kind:RoleEpisode['kind'],domain:RoleEpisode['domain'],key:string,messages:ChatMessage[],until?:number)=>{
  if(!messages.length)return;
  episodes.push({id:id(kind,key),roleId:r.id,domain,kind,containerId:key,at:messages[0].at,...(until!==undefined&&until<=at?{until}:{}),sources:messages.map(ref),links:[...new Set(messages.flatMap(m=>m.replyTo?[m.replyTo]:[]))]});
 };
 const groups=new Map<string,ChatMessage[]>();for(const m of phoneMessagesAt(r,at)){if(m.speaker==='note')continue;const key=m.replyTurnId||m.replyTo||m.id;groups.set(key,[...(groups.get(key)||[]),m]);}
 for(const [key,messages]of groups)add('phone','real',key,messages);
 const scenes=[...(r.meetings||[]),...(r.scene?[r.scene]:[])],plays=[...(r.plays||[]),...(r.play?[r.play]:[])];
 for(const scene of scenes){if(scenes.filter(s=>s.id===scene.id).length!==1||!Number.isFinite(scene.startedAt)||scene.startedAt>at||scene.endedAt!==undefined&&(!Number.isFinite(scene.endedAt)||scene.endedAt<scene.startedAt||scene.endedAt>at))continue;add('meeting','real',scene.id,sceneMessagesAt(r,scene.messages,at).filter(m=>m.at>=scene.startedAt&&(scene.endedAt===undefined||m.at<=scene.endedAt)&&m.speaker!=='note'&&m.kind!=='play'&&m.novelOutput?.mode!=='theatre'),scene.endedAt);}
 for(const play of plays){
  if(plays.filter(p=>p.id===play.id).length!==1||!Number.isFinite(play.startedAt)||play.startedAt>at||
    play.endedAt!==undefined&&(!Number.isFinite(play.endedAt)||play.endedAt<play.startedAt))continue;
  const cutoff=Math.min(at,play.endedAt??at);
  add('play','performance',play.id,stageMessagesAt(play.messages,cutoff).filter(m=>m.at>=play.startedAt&&m.speaker!=='note'),play.endedAt);
  add('backstage','backstage',play.id,stageMessagesAt(play.intermissionMessages,cutoff).filter(m=>m.at>=play.startedAt&&m.speaker!=='note'));
 }
 for(const e of r.events.filter(e=>e.kind==='life'&&e.at<=at&&(e.lifeRecord?.until??e.at)<=at&&e.status!=='retracted'&&e.status!=='superseded'))episodes.push({id:id('life',e.id),roleId:r.id,domain:'real',kind:'life',containerId:e.id,at:e.at,until:e.lifeRecord?.until,sources:[],links:[]});
 return episodes.sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
}
export function syncRoleExperiences(r:RoleData,at:number):void{
 if(r.memory&&(r.memory.version!==1||!Array.isArray(r.memory.records)))return;
 const episodes=roleEpisodes(r,at),stored=r.memory?.experiences?.episodes;
 const previous=Array.isArray(stored)?stored:[];
 // Invalidated sources remain in the ledger as history; readers always revalidate current sources.
 const merged=new Map(previous.filter(e=>e&&typeof e.id==='string'&&e.roleId===r.id).map(e=>[e.id,e]));for(const e of episodes)merged.set(e.id,e);
 const experiences:RoleExperienceLedger={version:1,episodes:[...merged.values()]};
 if(JSON.stringify(r.memory?.experiences)!==JSON.stringify(experiences))r.memory={...(r.memory||{version:1,records:[]}),experiences};
}
export function publicUserText(m:ChatMessage):boolean{return !!m.sourceMessageId||/^(?:我(?:说|回答|问|告诉你)[：:]?\s*[「“"]|[「“"]).+[」”"]\s*[。.!！?？]?$/.test(m.text)&&!/(?:心想|心里|默念|梦|假如|如果|假装|台词)/.test(m.text);}
/** Fragments are exact attributed spans; they do not turn narration or intentions into Canon. */
export function episodeExcerpt(text:string,query:string,budget:number):string{
 if(estimateTextTokens(text)<=budget)return text;
 const quotes=[...text.matchAll(/[「“][^」”\n]{1,800}[」”]/g)];
 const ordered=quotes.map((m,i)=>({m,i,score:memoryRelevance(m[0],query)})).sort((a,b)=>b.score-a.score||b.i-a.i);
 const ranges:{at:number;text:string}[]=[];let used=0;
 for(const {m}of ordered){const start=Math.max(0,text.lastIndexOf('\n',m.index)+1),prefix=text.slice(start,m.index).split(/[。！？]/).at(-1)||'';const span=prefix+m[0],cost=estimateTextTokens(span);if(used+cost<=budget){ranges.push({at:m.index,text:span});used+=cost;}if(ranges.length===3)break;}
 if(!ranges.length)return memoryExcerpt(text,query,budget);
 return ranges.sort((a,b)=>a.at-b.at).map(r=>'〔原文节选〕'+r.text+'〔节选结束〕').join('\n');
}
export function experienceContext(r:RoleData,query:string,at:number,rejected:ReadonlySet<string>,options:{excludeStage?:string;includePerformance?:boolean;since?:number;excludeMessageIds?:ReadonlySet<string>;preferredPlayId?:string;phoneRelevantOnly?:boolean}={}){
 const all=messageSourceIndex(r,at),episodes=roleEpisodes(r,at),messageIds=new Set((r.meetings||[]).flatMap(s=>s.messages.map(m=>m.id))),facts:{id:string;text:string;at:number;sourceIds:string[]}[]=[];
 const diaryPhoneIds = options.since === undefined ? undefined : new Set(phoneMessagesAt(r, at).filter(m => m.at >= options.since!).map(m => m.id));
 const playTitles=new Map([...(r.plays||[]),...(r.play?[r.play]:[])].map(p=>[p.id,p.title]));
 const played=new Set(r.events.filter(e=>e.kind==='drama'&&e.at<=at&&e.status!=='retracted'&&e.status!=='superseded'&&(!e.knownBy?.length||e.knownBy.includes(r.id))).map(e=>e.source));
 const withheld=new Set(r.events.filter(e=>e.messageId&&e.status!=='retracted'&&e.status!=='superseded'&&(e.sourceRevision===undefined||e.sourceRevision===(all.get(e.messageId)?.revisionCount||0))&&e.knownBy?.length&&!e.knownBy.includes(r.id)).map(e=>e.messageId));
 const phone=phoneMessagesAt(r,at);
 const phoneThreads=new Map<string,string>();
 for(const m of phone)if(m.speaker==='char'&&m.replyTo){
  const turn=m.replyTurnId||m.replyTo;
  phoneThreads.set(m.id,turn);
  for(const source of Array.isArray(m.replySourceIds)?m.replySourceIds:[m.replyTo])phoneThreads.set(source,turn);
 }
 const byPhoneThread=new Map<string,ChatMessage[]>();
 for(const m of phone){
  const key=phoneThreads.get(m.id)||m.replyTurnId||m.id;
  const group=byPhoneThread.get(key)||[];group.push(m);byPhoneThread.set(key,group);
 }
 const phoneGroup=(e:RoleEpisode)=>e.kind==='phone'&&(phoneThreads.get(e.sources[0].id)||e.containerId);
 const candidates=episodes.filter(e=>e.kind!=='life'&&(e.kind!=='phone'||options.includePerformance)&&(e.containerId!==options.excludeStage||e.kind==='play'&&e.containerId===options.preferredPlayId)&&(options.since===undefined||(e.until??e.at)>=options.since)&&(e.domain!=='performance'||options.includePerformance));
 const messages=(e:RoleEpisode)=>{
  const p=(e.kind==='meeting'?[...(r.meetings||[]),...(r.scene?[r.scene]:[])]:[...(r.plays||[]),...(r.play?[r.play]:[])]).find(s=>s.id===e.containerId);
  const effective=e.kind==='phone'?(byPhoneThread.get(String(phoneGroup(e)))||[]):e.kind==='meeting'?sceneMessagesAt(r,p?.messages,at):stageMessagesAt(e.kind==='backstage'?(p as PlayData)?.intermissionMessages:p?.messages,at);
  return effective.filter(m=>(options.since===undefined||m.at>=options.since)&&!options.excludeMessageIds?.has(m.id)&&!options.excludeMessageIds?.has(m.sourceMessageId||'')&&!diaryPhoneIds?.has(m.sourceMessageId||'')&&!(e.kind==='phone'&&diaryPhoneIds?.has(m.id))&&(e.kind==='phone'||e.sources.some(s=>s.id===m.id&&s.at===m.at&&s.revision===(m.revisionCount||0)))&&m.speaker!=='note'&&(e.domain!=='real'||all.has(m.id))&&!withheld.has(m.id)&&!withheld.has(m.sourceMessageId||'')&&!rejected.has(m.id)&&!rejected.has(m.sourceMessageId||'')&&(m.speaker==='char'||e.kind==='phone'||e.kind==='backstage'||e.domain==='performance'||publicUserText(m)));
 };
 const seenPhone=new Set<string>();
 const ranked=candidates.flatMap(e=>{
  const group=phoneGroup(e);
  if(group&&seenPhone.has(group))return [];
  if(group)seenPhone.add(group);
  const selected=messages(e);
  if(!selected.length)return [];
  const performance=e.kind==='play'||e.kind==='backstage';
  const score=selected.reduce((best,m)=>Math.max(best,memoryRelevance(m.text,query)),performance?memoryRelevance(playTitles.get(e.containerId)||'',query):0);
  const age=at-(e.until??e.at);
  const recent=age<=86400000&&(e.kind!=='phone'||!options.phoneRelevantOnly);
  const relevant=e.domain!=='performance'||!query||score>0||played.has(e.containerId)&&e.until!==undefined&&age<=3600000;
  return performance&&e.containerId===options.preferredPlayId||relevant&&(score>0||recent)?[{e,messages:selected,score}]:[];
 }).sort((a,b)=>b.e.at-a.e.at);
 // Keep recent meetings in view even when the current message uses different words.
 const prioritized=ranked.slice().sort((a,b)=>Number(b.e.containerId===options.preferredPlayId)-Number(a.e.containerId===options.preferredPlayId)||b.score-a.score||b.e.at-a.e.at);
 const anchors=options.includePerformance?['meeting','phone','backstage','play'].flatMap(kind=>{
  const item=kind==='meeting'?ranked.find(x=>x.e.kind===kind):prioritized.find(x=>x.e.kind===kind);
  return item?[item]:[];
 }):ranked.slice(0,1);
 const earlierPlay=options.excludeStage===options.preferredPlayId&&options.preferredPlayId
  ?prioritized.find(x=>{const title=playTitles.get(x.e.containerId);return x.e.kind==='play'&&!anchors.includes(x)&&!!title&&query.includes(title);})
  :undefined;
 const extra=earlierPlay||(!options.phoneRelevantOnly?prioritized.find(x=>x.e.kind==='phone'&&!anchors.includes(x)):undefined);
 if(extra)anchors.push(extra);
 const selected=[...anchors,...prioritized.filter(x=>!anchors.includes(x))].slice(0,Math.max(2,anchors.length));
 const shown=new Set<string>();let used=0;
 for(const [index,{e,messages:ms}]of selected.entries()){
  const remaining=selected.length-index-1;
  const limit=1000-used-remaining*185;
  const heading=`[${e.kind==='phone'?'手机原话 · Turn=':e.kind==='meeting'?'见面原文 · Scene=':e.kind==='backstage'?'戏外幕间 · Play=':'演员演过的虚构内容 · Play='}${e.containerId}${playTitles.has(e.containerId)&&(e.kind==='play'||e.kind==='backstage')?'《'+playTitles.get(e.containerId)!.slice(0,80)+'》':''} · ${new Date(e.at).toISOString()}${e.until!==undefined?' 至 '+new Date(e.until).toISOString():''}]\n`;
  const available=ms.filter(m=>!shown.has(m.sourceMessageId||m.id));
  const chosen=[...available.slice(-2),...available.slice(0,-2).sort((a,b)=>memoryRelevance(b.text,query)-memoryRelevance(a.text,query))].slice(0,5),lines:{index:number;text:string;id:string}[]=[];let cost=estimateTextTokens(heading);
  for(const m of chosen){const prefix=`[消息=${m.id}; 修订=${m.revisionCount||0}; 原发于=${new Date(m.at).toISOString()}${m.editedAt!==undefined?'; 修订生效于='+new Date(m.editedAt).toISOString()+'（当前版本，不证明原发时已知）':''}; ${m.speaker==='char'?'角色原文（对话/叙述，主张不等于外部证实）':m.sourceMessageId?'用户已公开的手机原话':'用户已公开的原话'}] `;
   const allowance=Math.min(300,limit-cost-estimateTextTokens(prefix)-14);if(allowance<35)continue;const text=prefix+episodeExcerpt(m.text,query,allowance),size=estimateTextTokens(text+'\n');if(cost+size>limit)continue;cost+=size;shown.add(m.sourceMessageId||m.id);lines.push({index:ms.indexOf(m),id:m.id,text});}
  if(lines.length){facts.push({id:e.kind==='meeting'?'meeting:'+e.containerId:e.id,text:heading+lines.sort((a,b)=>a.index-b.index).map(l=>l.text).join('\n'),at:e.until??e.at,sourceIds:lines.map(l=>l.id)});used+=cost;}
 }
 return {facts,messageIds};
}
export function observedRoleState(r:RoleData,at:number){
 const scene=r.scene,play=r.play;
 if(scene&&!scene.endedAt&&stageIntervals(scene,at+1).some(w=>w.from<=at&&w.to>at))return {kind:'meeting' as const,label:'正在见面',where:scene.locationEvidence||scene.agreement?scenePlaceAt(r,scene,at):scene.where,sourceId:scene.id,at:scene.startedAt};
 if(play&&!play.endedAt&&stageIntervals(play,at+1).some(w=>w.from<=at&&w.to>at))return {kind:'performance' as const,label:play.paused?'幕间讨论':'戏剧演出',where:'排演地点未记录',sourceId:play.id,at:play.startedAt};
 return {kind:'unknown' as const,label:'暂无新的活动记录',where:'地点未记录',sourceId:'',at};
}
