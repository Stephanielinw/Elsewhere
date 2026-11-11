export type PresetMode='meeting'|'theatre';
export interface PresetSettings {length:{min:number;max:number};style:string}
export interface PresetItem {id:string;name:string;role:'system'|'user'|'assistant';enabled:boolean;content:string}
export interface ElsewherePreset {format:'elsewhere-preset';schemaVersion:1;id:string;name:string;description:string;entries:PresetItem[];settings:Record<PresetMode,PresetSettings>}
export interface PresetOverride {entries?:Record<string,Partial<Omit<PresetItem,'id'>>>;order?:string[];settings?:{length?:Partial<PresetSettings['length']>;style?:string}}
export interface PresetBinding {presetId:string;overrides:PresetOverride}
export interface ElsewherePresetLibrary {schemaVersion:1;revision:number;presets:ElsewherePreset[];defaults:Record<PresetMode,string>;bindings:Record<string,Partial<Record<PresetMode,PresetBinding>>>;taskProfiles?:unknown;legacyNotice?:boolean}
export const PRESET_MAX_BYTES=8*1024*1024;
const modes:PresetMode[]=['meeting','theatre'];
export const presetObject=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export const presetId=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=200&&!['__proto__','constructor','prototype'].includes(v)&&!/[\u0000-\u001f]/.test(v);
function fields(v:unknown,allowed:string[],label:string):asserts v is Record<string,unknown>{if(!presetObject(v)||Object.keys(v).some(k=>!allowed.includes(k)))throw Error(label+'包含无效字段');}
function text(v:unknown,max:number,label:string,required=false):string {if(typeof v!=='string'||v.length>max||required&&!v.trim())throw Error(label+'不完整或过长');return v;}
function settings(v:unknown):PresetSettings {
 fields(v,['length','style'],'设置');fields(v.length,['min','max'],'字数');
 const {min,max}=v.length;
 if(typeof min!=='number'||typeof max!=='number'||!Number.isInteger(min)||!Number.isInteger(max)||min<1||max<min||max>50000)throw Error('字数应为 1–50000 的整数范围');
 return {length:{min,max},style:text(v.style,2000,'文风')};
}
function item(v:unknown):PresetItem {
 fields(v,['id','name','role','enabled','content'],'条目');
 if(!presetId(v.id)||!['system','user','assistant'].includes(String(v.role))||typeof v.enabled!=='boolean')throw Error('条目 ID、消息角色或启用状态无效');
 return {id:v.id,name:text(v.name,200,'条目名称',true),role:v.role as PresetItem['role'],enabled:v.enabled,content:text(v.content,128000,'条目正文')};
}
export function validateElsewherePreset(v:unknown):ElsewherePreset {
 if(!presetObject(v)||v.format!=='elsewhere-preset'||v.schemaVersion!==1)throw Error('请选择 Elsewhere 原生预设 V1 JSON');
 fields(v,['format','schemaVersion','id','name','description','entries','settings'],'预设');
 if(!presetId(v.id)||!Array.isArray(v.entries)||v.entries.length>128)throw Error('预设 ID 无效或条目超过 128 个');
 const entries=v.entries.map(item);
 if(new Set(entries.map(e=>e.id)).size!==entries.length)throw Error('条目 ID 重复');
 fields(v.settings,modes,'模式设置');
 const preset:ElsewherePreset={format:'elsewhere-preset',schemaVersion:1,id:v.id,name:text(v.name,200,'预设名称',true),description:text(v.description,2000,'简介'),entries,settings:{meeting:settings(v.settings.meeting),theatre:settings(v.settings.theatre)}};
 if(new TextEncoder().encode(JSON.stringify(preset)).length>PRESET_MAX_BYTES)throw Error('预设超过 8 MiB');
 return preset;
}
export function builtinPreset():ElsewherePreset {
 const base={length:{min:600,max:1200},style:''};
 return {format:'elsewhere-preset',schemaVersion:1,id:'native',name:'Elsewhere 内置基础',description:'沿用 Elsewhere 的人物、来源与小说基础规则。复制后可编辑。',entries:[],settings:{meeting:structuredClone(base),theatre:structuredClone(base)}};
}
export function emptyPresetLibrary():ElsewherePresetLibrary {return {schemaVersion:1,revision:0,presets:[builtinPreset()],defaults:{meeting:'native',theatre:'native'},bindings:{}};}
export function parseElsewherePreset(raw:Uint8Array):ElsewherePreset {
 if(!raw.length||raw.length>PRESET_MAX_BYTES)throw Error('请选择不超过 8 MiB 的 JSON');
 let v:unknown;try{v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw).replace(/^\uFEFF/,''));}catch{throw Error('JSON 无法读取，请选择完整的预设文件');}
 return validateElsewherePreset(v);
}
export function exportElsewherePreset(p:unknown):Uint8Array {
 const preset=validateElsewherePreset(p),encoder=new TextEncoder(),pretty=encoder.encode(JSON.stringify(preset,null,2));
 return pretty.length<=PRESET_MAX_BYTES?pretty:encoder.encode(JSON.stringify(preset));
}
export function validatePresetOverride(v:unknown,p:ElsewherePreset):PresetOverride {
 fields(v,['entries','order','settings'],'角色覆盖');const next:PresetOverride={};
 if(v.entries!==undefined){
  if(!presetObject(v.entries)||Object.keys(v.entries).length>128)throw Error('条目覆盖无效');
  next.entries={};
  for(const [id,patch] of Object.entries(v.entries)){
   const source=p.entries.find(e=>e.id===id);if(!source)throw Error('覆盖引用的条目不存在');
   fields(patch,['name','role','enabled','content'],'条目覆盖');item({...source,...patch});next.entries[id]={...patch};
  }
 }
 if(v.order!==undefined){if(!Array.isArray(v.order)||v.order.length!==p.entries.length||new Set(v.order).size!==v.order.length||v.order.some(id=>!p.entries.some(e=>e.id===id)))throw Error('角色排序引用无效');next.order=[...v.order] as string[];}
 if(v.settings!==undefined){
  fields(v.settings,['length','style'],'设置覆盖');next.settings={};
  if(v.settings.style!==undefined)next.settings.style=text(v.settings.style,2000,'文风');
  if(v.settings.length!==undefined){fields(v.settings.length,['min','max'],'字数覆盖');next.settings.length={};for(const field of ['min','max']as const){const value=v.settings.length[field];if(value===undefined)continue;if(typeof value!=='number'||!Number.isInteger(value)||value<1||value>50000)throw Error('字数覆盖无效');next.settings.length[field]=value;}}
 }
 return next;
}
export function resolvePreset(l:ElsewherePresetLibrary,roleId:string,mode:PresetMode):ElsewherePreset {
 const b=l.bindings[roleId]?.[mode],id=b&&b.presetId!=='inherit'?b.presetId:l.defaults[mode];
 const p=l.presets.find(p=>p.id===id);if(!p)throw Error('预设选择已失效，请重新选择');
 const o=validatePresetOverride(b?.overrides||{},p),byId=new Map(p.entries.map(e=>[e.id,e]));
 const effective=settings({...p.settings[mode],...o.settings,length:{...p.settings[mode].length,...o.settings?.length}});
 return {...structuredClone(p),entries:(o.order||p.entries.map(e=>e.id)).map(id=>({...byId.get(id)!,...o.entries?.[id]})),settings:{...p.settings,[mode]:effective}};
}
export function validatePresetLibrary(v:unknown):ElsewherePresetLibrary {
 fields(v,['schemaVersion','revision','presets','defaults','bindings','taskProfiles','legacyNotice'],'预设库');
 if(v.schemaVersion!==1||!Number.isSafeInteger(v.revision)||Number(v.revision)<0||!Array.isArray(v.presets)||!v.presets.length||v.presets.length>20||!presetObject(v.bindings)||Object.keys(v.bindings).length>500)throw Error('预设库结构无效，原数据保留');
 const presets=v.presets.map(validateElsewherePreset);
 if(new Set(presets.map(p=>p.id)).size!==presets.length||presets.filter(p=>p.id==='native').length!==1)throw Error('预设 ID 或内置基础无效');
 if(JSON.stringify(presets.find(p=>p.id==='native'))!==JSON.stringify(builtinPreset()))throw Error('内置基础不能被替换');
 fields(v.defaults,modes,'默认预设');
 const defaults={meeting:String(v.defaults.meeting),theatre:String(v.defaults.theatre)};
 if(modes.some(m=>!presets.some(p=>p.id===defaults[m])))throw Error('默认预设不存在');
 const l:ElsewherePresetLibrary={schemaVersion:1,revision:Number(v.revision),presets,defaults,bindings:{},...(v.taskProfiles===undefined?{}:{taskProfiles:structuredClone(v.taskProfiles)}),...(v.legacyNotice===true?{legacyNotice:true}:{})};
 for(const [roleId,bindings] of Object.entries(v.bindings)){
  if(!presetId(roleId))throw Error('角色 ID 无效');fields(bindings,modes,'角色模式');l.bindings[roleId]={};
  for(const mode of modes){const b=bindings[mode];if(b===undefined)continue;fields(b,['presetId','overrides'],'角色选择');
   const id=b.presetId==='inherit'?defaults[mode]:b.presetId,p=presets.find(p=>p.id===id);if(!p)throw Error('角色预设引用失效');
   l.bindings[roleId][mode]={presetId:String(b.presetId),overrides:validatePresetOverride(b.overrides,p)};
   resolvePreset(l,roleId,mode);
  }
 }
 return l;
}
export function importElsewherePreset(l:ElsewherePresetLibrary,input:ElsewherePreset):ElsewherePresetLibrary {
 if(l.presets.length>=20)throw Error('预设库最多保存 20 份，请先导出和整理');
 const p=validateElsewherePreset(input);if(l.presets.some(e=>e.id===p.id))p.id=crypto.randomUUID();
 const base=p.name;let n=2;while(l.presets.some(e=>e.name===p.name)){const suffix='（'+n+++'）';p.name=base.slice(0,200-suffix.length)+suffix;}
 return {...l,presets:[...l.presets,p]};
}
export function replaceSharedPreset(l:ElsewherePresetLibrary,input:ElsewherePreset):ElsewherePresetLibrary {
 const p=validateElsewherePreset(input);if(p.id==='native')throw Error('请先复制内置基础');
 if(!l.presets.some(e=>e.id===p.id))throw Error('原预设不存在');
 const next=structuredClone(l);next.presets=next.presets.map(e=>e.id===p.id?p:e);
 for(const [roleId,slots]of Object.entries(next.bindings))for(const mode of modes){
  const b=slots[mode];if(!b||(b.presetId==='inherit'?l.defaults[mode]:b.presetId)!==p.id)continue;
  if(b.overrides.entries)b.overrides.entries=Object.fromEntries(Object.entries(b.overrides.entries).filter(([id])=>p.entries.some(e=>e.id===id)));
  if(b.overrides.order){const order=b.overrides.order.filter(id=>p.entries.some(e=>e.id===id));
   for(let i=0;i<p.entries.length;i++)if(!order.includes(p.entries[i].id)){const successor=p.entries.slice(i+1).find(e=>order.includes(e.id));order.splice(successor?order.indexOf(successor.id):order.length,0,p.entries[i].id);}b.overrides.order=order;
  }
  resolvePreset(next,roleId,mode);
 }
 return next;
}
export function deletePreset(l:ElsewherePresetLibrary,id:string):ElsewherePresetLibrary {
 if(id==='native')throw Error('不能删除内置基础');if(!l.presets.some(p=>p.id===id))throw Error('预设不存在');
 const next=structuredClone(l);next.presets=next.presets.filter(p=>p.id!==id);
 for(const mode of modes){if(next.defaults[mode]===id)next.defaults[mode]='native';}
 for(const slots of Object.values(next.bindings))for(const mode of modes){const b=slots[mode];if(b&&(b.presetId===id||b.presetId==='inherit'&&l.defaults[mode]===id))slots[mode]={presetId:b.presetId===id?'native':'inherit',overrides:{}};}
 return next;
}
export function presetFilename(name:string){return (name.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').trim().slice(0,100)||'Elsewhere-preset')+'.json';}
