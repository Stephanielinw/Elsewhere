import {validateProfile} from './preset';
import type {FruitMode,FruitPreset,FruitProfile,FruitPrompt} from './types';

export type ConversationMode='chat'|'meeting'|'theatre'|'intermission';
const owned=new WeakSet<FruitPreset>();
const catalogs=new Map<FruitMode,FruitPreset>();
export const isNativePreset=(preset:FruitPreset)=>owned.has(preset);
export function nativeEntryApplies(id:string,mode:ConversationMode):boolean {
  if(id.startsWith('native.chat.'))return mode==='chat';
  if(id.startsWith('native.intermission.'))return mode==='intermission';
  if(id==='native-base'||id==='native-format'||id.startsWith('custom:'))return mode==='meeting'||mode==='theatre';
  return true;
}
export function nativePreset(mode:FruitMode):FruitPreset {
  const existing=catalogs.get(mode);if(existing)return existing;
  const prompts:FruitPrompt[]=[];
  function add(identifier:string,name:string,content:string,group:string,marker=false){prompts.push({identifier,name,content,group,marker,role:'system',originalEnabled:true,position:0,depth:4,injectionOrder:100,styleEntry:false});}
  add('nativeContext','人物事实与授权上下文','','系统提供 · 不可关闭',true);
  if(mode==='meeting'){
    add('native.chat.voice','手机 · 人物表达','你正在用手机和用户发消息。回复使用自然中文。请按你本人的打字与说话习惯组织回复。','手机聊天 · 仅手机模式');
    add('native.chat.bubbles','手机 · 多气泡规则','{{native_bubbles}}','手机聊天 · 仅手机模式');
    add('native.chat.format','手机 · 正文格式','日常聊天只展示手机消息正文，严禁混入小说式第三人称旁白、神态动作描写（如*动作*或括号动作）、时间戳或「{{char}}：」前缀。','手机聊天 · 仅手机模式');
    add('native.chat.life','手机 · 主动性与生活','{{native_life}}','手机聊天 · 仅手机模式');
  }else add('native.intermission.voice','幕间 · 人物表达','保持自身性格，回答要像一个真实的演员。','幕间讨论 · 仅幕间模式');
  add('native-base','小说 · 叙事与互动','{{native_novel_rule}}','小说 · 仅本小说模式');
  add('chatHistory','有效近期对话','','系统提供 · 不可关闭',true);
  add('native-format','小说 · 输出形式','{{native_output_rule}}','小说 · 仅本小说模式');
  const document={name:'Elsewhere 原生预设',prompts,prompt_order:[{order:prompts.map(p=>({identifier:p.identifier,enabled:true}))}]};
  const preset:FruitPreset={raw:new TextEncoder().encode(JSON.stringify(document)),sha256:'',fileName:'Elsewhere-native.json',name:document.name,version:'统一引擎第一阶段',importedAt:0,prompts,order:document.prompt_order[0].order,orderGroup:0,regex:[],extensions:[],modelParameters:{},outputTags:[],diagnostics:[]};
  owned.add(preset);catalogs.set(mode,preset);return preset;
}
export async function makeNativePreset(mode:FruitMode):Promise<FruitPreset>{
  const preset=nativePreset(mode);
  if(!preset.sha256){const digest=await crypto.subtle.digest('SHA-256',Uint8Array.from(preset.raw));preset.sha256=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');}
  return preset;
}
/** Complete new built-in slots in memory; never rewrite the saved Profile. */
export function projectNativeProfile(preset:FruitPreset,input:FruitProfile):FruitProfile {
  const profile=validateProfile(input);if(!profile.order)return profile;
  const order=[...profile.order],defaults=[...preset.order.map(e=>e.identifier),...(profile.customPrompts||[]).map(p=>p.identifier)];
  for(let i=0;i<defaults.length;i++)if(!order.includes(defaults[i])){const next=defaults.slice(i+1).find(id=>order.includes(id));order.splice(next?order.indexOf(next):order.length,0,defaults[i]);}
  return {...profile,order};
}
