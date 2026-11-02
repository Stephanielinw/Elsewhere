import type {PresetData,RoleData} from './types';
import type {FruitProfile} from './fruit/types';
import {nativePreset} from './fruit/nativePreset';
import {applyFruitProfile} from './fruit/profile';

export type ChatVoice='A'|'B';
export const nativeBubbleRule='气泡数量随人物的打字习惯、情境与实际内容决定，不设固定数量。可以只发一条完整消息，也可发送独立的手机消息气泡；仅在确实另发一条时用换行或 ||| 分隔。不要机械拆句，不强制反问、安慰或总结，也不要固定采用「回应—感想—反问」的套路。';
export const candidateChatVoice={
 'native.chat.voice':'你正在用手机和用户发消息。回复使用自然中文。从自己的性格、经历、关系与当前处境出发，决定你怎么看、想谈什么，再用属于自己的词汇和习惯表达。你有自己的意见、兴趣和安排；可以简短应一声，也可以认真展开，不必刻意展示性格标签。',
 'native.chat.bubbles':'按人物习惯和内容自然分条，换行或 ||| 可分隔独立消息，不设数量。让交流随当前事情发展，无需把每次回复写成完整问答、分析或情绪服务流程。',
};
export const chatVoiceChoice=(value:unknown):ChatVoice=>value==='B'?'B':'A';

/** Request projection only: a saved body edit always wins over the candidate. */
export function projectChatVoiceProfile(profile:FruitProfile,choice:ChatVoice):FruitProfile {
 if(choice==='A')return profile;
 const edits={...profile.edits};
 for(const [id,content]of Object.entries(candidateChatVoice))if(typeof edits[id]?.content!=='string')edits[id]={...edits[id],content};
 return {...profile,edits};
}
export function saveChatVoice(role:RoleData,choice:ChatVoice,save:()=>boolean):boolean {
 const previous=role.chatVoice;role.chatVoice=choice;
 try{if(save())return true;}catch{ /* Restore the last confirmed choice on storage failure. */ }
 if(previous===undefined)delete role.chatVoice;else role.chatVoice=previous;
 return false;
}

/** Inspect configuration text locally; never include histories, identity data, or API settings. */
export function describeChatVoice(profile:FruitProfile,role:RoleData,globalPreset:PresetData|null){
 const choice=chatVoiceChoice(role.chatVoice),preset=applyFruitProfile(nativePreset('meeting'),projectChatVoiceProfile(profile,choice));
 const rules=preset.order.flatMap((entry,index)=>{
  if(!Object.hasOwn(candidateChatVoice,entry.identifier))return [];
  const p=preset.prompts.find(p=>p.identifier===entry.identifier)!;
  const edited=typeof profile.edits?.[p.identifier]?.content==='string';
  return [{id:p.identifier,name:p.name,source:edited?'user-edit':choice==='B'?'candidate-b':'builtin-a',enabled:profile.overrides[p.identifier]??entry.enabled,order:index+1,role:p.role,position:p.position,depth:p.depth,content:p.content.replaceAll('{{native_bubbles}}',nativeBubbleRule)}];
 });
 const legacy=role.preset||globalPreset;
 return {choice,rules,legacySource:role.preset?'role':globalPreset?'global':'none',legacyName:legacy?.name||'',legacy:(legacy?.prompts||[]).map((p,index)=>({id:'legacy:'+index,name:p.name||'旧条目 '+(index+1),enabled:Boolean(p.enabled),order:index+1,role:p.role==='user'||p.role==='assistant'?p.role:'system',marker:Boolean(p.marker),position:Number(p.injection_position)===1?1:0,depth:Math.max(0,Number(p.injection_depth)||0),content:p.content||''}))};
}
export function chatVoiceSummary(info:ReturnType<typeof describeChatVoice>,skipLegacyOnce=false){
 return {choice:info.choice,rules:info.rules.map(({id,source,enabled,order})=>({id,source,enabled,order})),legacySource:skipLegacyOnce?'none':info.legacySource,legacyCount:skipLegacyOnce?0:info.legacy.length,legacySkippedOnce:skipLegacyOnce};
}
