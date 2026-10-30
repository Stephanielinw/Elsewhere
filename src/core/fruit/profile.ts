import {fruitSafetyReason,validateProfile,validatePromptEdit} from './preset';
import type {FruitCustomPrompt,FruitMode,FruitPreset,FruitProfile,FruitPrompt,FruitPromptEdit} from './types';
export const isPromptHeading=(p:FruitPrompt)=>/^(?:━|——|==|---)/u.test(p.name.trim())||/display-section/.test(p.identifier);
export const isPromptPinned=(p:FruitPrompt)=>p.marker||isPromptHeading(p)||p.position!==0||/必开.*(?:别动|固定位置)|勿动/.test(p.name);
export function applyFruitProfile(preset:FruitPreset,input:FruitProfile):FruitPreset {
  const profile=validateProfile(input),byId=new Map(preset.prompts.map(p=>[p.identifier,p]));
  for(const [id,patch]of Object.entries(profile.edits||{})){
    const original=byId.get(id);if(!original)throw new Error('编辑引用的原条目已不存在，请更新配置');
    if(original.marker)throw new Error('Marker 不支持正文或注入编辑');if(original.blockedReason)throw new Error('受保护条目不可编辑或启用');
    const prompt={...original,...patch};prompt.blockedReason=fruitSafetyReason(prompt.group+' '+prompt.name,prompt.content);if(prompt.blockedReason)throw new Error(prompt.blockedReason);byId.set(id,prompt);
  }
  const order=preset.order.map(p=>({...p})),customIds=new Set((profile.customPrompts||[]).map(p=>p.identifier));
  for(const custom of profile.customPrompts||[]){
    if(byId.has(custom.identifier))throw new Error('自建条目与原件 ID 冲突');
    const blockedReason=fruitSafetyReason(custom.name,custom.content);if(blockedReason)throw new Error(blockedReason);
    byId.set(custom.identifier,{...custom,marker:false,originalEnabled:true,group:'用户自建',styleEntry:false});order.push({identifier:custom.identifier,enabled:true});
  }
  if(profile.order){
    const all=new Set(order.map(e=>e.identifier));if(profile.order.length!==all.size||profile.order.some(id=>!all.has(id)))throw new Error('排序覆盖与当前条目不一致，请恢复排序或重新检查更新');
    const anchors=order.filter(e=>isPromptPinned(byId.get(e.identifier)!)).map(e=>e.identifier);
    const actual=profile.order.filter(id=>isPromptPinned(byId.get(id)!));if(anchors.join('\n')!==actual.join('\n'))throw new Error('不能移动 Marker、固定条目或 In-Chat 深度注入项');
    let segment=0;const expected=new Map<string,string>();let group='';
    for(const e of order){const p=byId.get(e.identifier)!;if(isPromptPinned(p)){segment++;continue;}if(!customIds.has(e.identifier))expected.set(e.identifier,segment+'|'+p.group);}
    segment=0;let previousSegment='';const runs:string[]=[];
    for(const id of profile.order){const p=byId.get(id)!;if(isPromptPinned(p)){segment++;continue;}if(expected.has(id)){const key=segment+'|'+p.group;if(expected.get(id)!==key)throw new Error('普通条目不能跨越固定上下文位置');if(key!==previousSegment){runs.push(key);previousSegment=key;}}}
    const originalRuns:string[]=[];for(const e of order){const key=expected.get(e.identifier);if(key&&key!==group){originalRuns.push(key);group=key;}}if(runs.join('\n')!==originalRuns.join('\n'))throw new Error('不能拖动条目打乱作者分组');
    const items=new Map(order.map(e=>[e.identifier,e]));order.splice(0,order.length,...profile.order.map(id=>items.get(id)!));
  }
  return {...preset,prompts:[...byId.values()],order};
}
export function editPrompt(preset:FruitPreset,profile:FruitProfile,id:string,patch:FruitPromptEdit):FruitProfile {
  const custom=profile.customPrompts?.find(p=>p.identifier===id),edit=validatePromptEdit(patch);
  const next=custom?{...profile,customPrompts:profile.customPrompts!.map(p=>p.identifier===id?{...p,...edit}:p)}:{...profile,edits:{...profile.edits,[id]:{...profile.edits?.[id],...edit}}};
  applyFruitProfile(preset,next);return validateProfile(next);
}
export function addPrompt(preset:FruitPreset,profile:FruitProfile,prompt:FruitCustomPrompt):FruitProfile {
  const next={...profile,customPrompts:[...(profile.customPrompts||[]),prompt],...(profile.order?{order:[...profile.order,prompt.identifier]}:{})};applyFruitProfile(preset,next);return validateProfile(next);
}
export function movePrompt(preset:FruitPreset,profile:FruitProfile,id:string,direction:-1|1):FruitProfile {
  const effective=applyFruitProfile(preset,profile),order=effective.order.map(p=>p.identifier),index=order.indexOf(id),other=index+direction;
  const map=new Map(effective.prompts.map(p=>[p.identifier,p]));const a=map.get(id),b=map.get(order[other]);
  if(!a||!b||isPromptPinned(a)||isPromptPinned(b)||a.blockedReason||b.blockedReason||(a.group!==b.group&&!(profile.customPrompts||[]).some(p=>p.identifier===a.identifier)))throw new Error('仅可在同组内移动相邻普通相对条目；固定或深度注入项不可拖动');
  [order[index],order[other]]=[order[other],order[index]];const next={...profile,order};applyFruitProfile(preset,next);return validateProfile(next);
}
export function planPresetUpdate<T extends {preset:FruitPreset;profiles:Record<FruitMode,FruitProfile>;enabled:boolean}>(entry:T,preset:FruitPreset){
  const old=new Map(entry.preset.prompts.map(p=>[p.identifier,p])),available=new Map(preset.prompts.map(p=>[p.identifier,p])),ordered=new Set(preset.order.map(p=>p.identifier));
  const dropped:{mode:FruitMode;id:string;reason:string}[]=[];
  const profiles={...entry.profiles};
  for(const mode of ['meeting','theatre']as const){
    const original=validateProfile(entry.profiles[mode]),next=structuredClone(original);next.overrides={};next.edits={};
    for(const id of new Set([...Object.keys(original.overrides),...Object.keys(original.edits||{})])){
      const p=available.get(id),before=old.get(id);let reason=!p||!ordered.has(id)?'新版中已移除或未排序':p.blockedReason||((p.position!==0&&p.position!==1)?'新版注入位置尚不兼容':!before||p.marker!==before.marker?'条目种类已改变':'');
      if(!reason&&original.edits?.[id]){try{applyFruitProfile(preset,{...next,order:undefined,customPrompts:undefined,edits:{[id]:original.edits[id]}});}catch{reason='编辑覆盖与新版权限或结构不兼容';}}
      if(reason){dropped.push({mode,id,reason});continue;}
      if(Object.hasOwn(original.overrides,id))next.overrides[id]=original.overrides[id];if(original.edits?.[id])next.edits![id]=original.edits[id];
    }
    if(original.customPrompts)next.customPrompts=original.customPrompts.filter(p=>{if(!available.has(p.identifier))return true;dropped.push({mode,id:p.identifier,reason:'自建 ID 与新版作者条目冲突'});return false;});
    for(const custom of next.customPrompts||[])if(Object.hasOwn(original.overrides,custom.identifier)){next.overrides[custom.identifier]=original.overrides[custom.identifier];const i=dropped.findIndex(d=>d.mode===mode&&d.id===custom.identifier);if(i>=0)dropped.splice(i,1);}
    if(original.order){
      const all=[...preset.order.map(p=>p.identifier),...(next.customPrompts||[]).map(p=>p.identifier)];const surviving=original.order.filter(id=>all.includes(id));
      for(let i=0;i<all.length;i++)if(!surviving.includes(all[i])){const after=all.slice(i+1).find(id=>surviving.includes(id));surviving.splice(after?surviving.indexOf(after):surviving.length,0,all[i]);}
      next.order=surviving;try{applyFruitProfile(preset,next);}catch{delete next.order;dropped.push({mode,id:'(排序)',reason:'分组或固定注入结构改变，排序恢复新版作者顺序'});}
    }
    profiles[mode]=validateProfile(next);
  }
  const added=preset.prompts.filter(p=>!old.has(p.identifier)).length,removed=entry.preset.prompts.filter(p=>!available.has(p.identifier)).length;
  const changed=preset.prompts.filter(p=>{const before=old.get(p.identifier);return before&&['name','role','content','marker','position','depth','injectionOrder','group'].some(k=>Reflect.get(before,k)!==Reflect.get(p,k));}).length;
  const oldOrder=new Map(entry.preset.order.map((p,i)=>[p.identifier,{...p,index:i}]));
  const orderChanged=preset.order.filter((p,i)=>oldOrder.get(p.identifier)?.index!==i).length;
  const enabledChanged=preset.order.filter(p=>oldOrder.has(p.identifier)&&oldOrder.get(p.identifier)!.enabled!==p.enabled).length;
  const modelParametersChanged=[...new Set([...Object.keys(entry.preset.modelParameters),...Object.keys(preset.modelParameters)])].filter(k=>entry.preset.modelParameters[k]!==preset.modelParameters[k]);
  return {next:{...entry,preset,profiles,enabled:false},added,removed,changed,orderChanged,enabledChanged,modelParametersChanged,dropped};
}
