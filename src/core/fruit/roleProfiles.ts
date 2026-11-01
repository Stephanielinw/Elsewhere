import {createFruitState,object,validateProfile} from './preset';
import {applyFruitProfile,planPresetUpdate} from './profile';
import {nativePreset} from './nativePreset';
import type {ConversationMode} from './nativePreset';
import type {PresetEntry,PresetLibrary} from './library';
import type {FruitMode,FruitPreset,FruitProfile} from './types';

export interface RolePresetBinding {baseHash:string;enabled:boolean;profile:FruitProfile}
export interface RoleNovelBase {presetId:string;sourceMode:FruitMode;profiles:Record<string,RolePresetBinding>;backups?:Record<string,RolePresetBinding>}
export interface RoleNovelConfig extends RoleNovelBase {useLegacy?:boolean;previous?:RoleNovelBase}
export interface LegacyNovelSnapshot {defaults:Record<FruitMode,string>;entries:Record<string,{baseHash:string;enabled:boolean;profiles:Record<FruitMode,FruitProfile>}>}
const safeId=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=200&&!['__proto__','constructor','prototype'].includes(v)&&!/[\u0000-\u001f]/.test(v);
const fail=(message:string):never=>{throw new Error(message+'；原配置保留，未回退或重置');};
export const presetHash=(entry:PresetEntry)=>entry.kind==='native'?'native':entry.preset.sha256;
const entry=(l:PresetLibrary,id:string)=>l.entries.find(e=>e.id===id)||fail('所选预设不存在');
export function legacyNovelSnapshot(l:PresetLibrary):LegacyNovelSnapshot {
 return l.legacyNovel||{defaults:{...l.defaults},entries:Object.fromEntries(l.entries.map(e=>[e.id,{baseHash:presetHash(e),enabled:e.enabled,profiles:structuredClone(e.profiles)}]))};
}
const canonical=(value:unknown):string=>JSON.stringify(value,(_k,v:unknown)=>object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const comparable=(p:FruitProfile)=>({...p,edits:p.edits||{},customPrompts:p.customPrompts||[],regexOverrides:p.regexOverrides||{}});
export function legacyNovelAgrees(l:PresetLibrary):boolean {
 const s=legacyNovelSnapshot(l);return s.defaults.meeting===s.defaults.theatre&&Object.values(s.entries).every(e=>canonical(comparable(e.profiles.meeting))===canonical(comparable(e.profiles.theatre)));
}
/** Mobile/backstage builtins stay in their original native profiles, not the role novel layer. */
export function sharedNovelProfile(p:FruitProfile,native=false):FruitProfile {
 const next=validateProfile(p);if(!native)return next;
 const novel=(id:string)=>!id.startsWith('native.chat.')&&!id.startsWith('native.intermission.');
 return {...next,overrides:Object.fromEntries(Object.entries(next.overrides).filter(([id])=>novel(id))),...(next.edits?{edits:Object.fromEntries(Object.entries(next.edits).filter(([id])=>novel(id)))}:{}),...(next.order?{order:next.order.filter(novel)}:{})};
}
export function presetVersion(l:PresetLibrary,id:string,hash:string,mode:FruitMode='meeting'):FruitPreset {
 const e=entry(l,id);if(e.kind==='native'){if(hash!=='native')return fail('原生预设引用无效');return nativePreset(mode);}
 return (e.preset.sha256===hash?e.preset:l.versions?.find(p=>p.sha256===hash))||fail('配置所引用的原件版本缺失');
}
export function rolePresetBinding(l:PresetLibrary,roleId:string,id?:string):RolePresetBinding {
 const r=l.roleNovel?.[roleId];if(!r||r.useLegacy)return fail('请先确认沿用哪份旧小说配置');
 const presetId=id||r.presetId,e=entry(l,presetId),saved=r.profiles[presetId];if(saved)return structuredClone(saved);
 const old=legacyNovelSnapshot(l).entries[presetId];
 return {baseHash:old?.baseHash||presetHash(e),enabled:old?.enabled??e.enabled,profile:sharedNovelProfile(old?.profiles[r.sourceMode]||createFruitState().profiles.meeting,e.kind==='native')};
}
export function rolePresetEntry(l:PresetLibrary,roleId:string,id?:string):PresetEntry {
 const presetId=id||l.roleNovel?.[roleId]?.presetId;if(!presetId)return fail('角色小说预设尚未选择');const e=entry(l,presetId),b=rolePresetBinding(l,roleId,presetId);
 return {...e,enabled:b.enabled};
}
export function initializeRoleNovel(l:PresetLibrary,roleId:string,choice?:FruitMode):PresetLibrary {
 if(!safeId(roleId))return fail('角色 ID 无效');
 const current=l.roleNovel?.[roleId];if(current&&!current.useLegacy)return l;
 const next:PresetLibrary=l.schema===3&&l.legacyNovel&&l.roleNovel?l:{...l,schema:3,legacyNovel:structuredClone(legacyNovelSnapshot(l)),roleNovel:{...l.roleNovel},versions:l.versions||[]};
 if(!choice&&(current?.useLegacy||!legacyNovelAgrees(next)))return next;
 const sourceMode=choice||'meeting',presetId=legacyNovelSnapshot(next).defaults[sourceMode];
 const base:RoleNovelConfig={presetId,sourceMode,profiles:{},...(current?{previous:{presetId:current.presetId,sourceMode:current.sourceMode,profiles:structuredClone(current.profiles),backups:structuredClone(current.backups)}}:{})};
 const candidate={...next,roleNovel:{...next.roleNovel,[roleId]:base}};base.profiles[presetId]=rolePresetBinding(candidate,roleId);return candidate;
}
export function selectRoleNovelPreset(l:PresetLibrary,roleId:string,presetId:string):PresetLibrary {
 const r=l.roleNovel?.[roleId];if(!r||r.useLegacy)return fail('请先完成小说配置选择');const e=entry(l,presetId);if(e.archived&&r.presetId!==presetId)return fail('原件已移出列表，请先恢复');
 return {...l,roleNovel:{...l.roleNovel,[roleId]:{...r,presetId,profiles:{...r.profiles,[presetId]:rolePresetBinding(l,roleId,presetId)}}}};
}
export function saveRoleNovelProfile(l:PresetLibrary,roleId:string,presetId:string,p:FruitProfile,enabled?:boolean):PresetLibrary {
 const r=l.roleNovel?.[roleId];if(!r||r.useLegacy)return fail('请先完成小说配置选择');const e=entry(l,presetId),b=rolePresetBinding(l,roleId,presetId),edited=sharedNovelProfile(p,e.kind==='native');
 if(b.baseHash!==presetHash(e))projectRoleNovelProfile(l,presetId,b);
 const profile=projectRoleNovelProfile(l,presetId,{...b,baseHash:presetHash(e),profile:edited});
 for(const mode of ['meeting','theatre']as const)applyFruitProfile(e.kind==='native'?nativePreset(mode):e.preset,profile);
 return {...l,roleNovel:{...l.roleNovel,[roleId]:{...r,...(b.baseHash!==presetHash(e)?{backups:{...r.backups,[presetId]:b}}:{}),profiles:{...r.profiles,[presetId]:{...b,baseHash:presetHash(e),profile,enabled:enabled??b.enabled}}}}};
}
export function useLegacyNovel(l:PresetLibrary,roleId:string,value:boolean):PresetLibrary {
 const r=l.roleNovel?.[roleId];if(!r)return fail('该角色尚无共享配置');return {...l,roleNovel:{...l.roleNovel,[roleId]:{...r,useLegacy:value}}};
}
export function restorePreviousRoleNovel(l:PresetLibrary,roleId:string):PresetLibrary {
 const r=l.roleNovel?.[roleId];if(!r?.previous)return fail('没有上次共享配置备份');
 const previous:RoleNovelBase={presetId:r.presetId,sourceMode:r.sourceMode,profiles:structuredClone(r.profiles),...(r.backups?{backups:structuredClone(r.backups)}:{})};
 return {...l,roleNovel:{...l.roleNovel,[roleId]:{...structuredClone(r.previous),previous}}};
}
export function selectRoleRequestPreset(l:PresetLibrary,mode:ConversationMode,roleId:string){
 if(!safeId(roleId))return fail('请求角色 ID 无效');
 const slot=mode==='theatre'||mode==='intermission'?'theatre':'meeting',novel=mode==='meeting'||mode==='theatre',r=l.roleNovel?.[roleId];
 if(!novel){const e=entry(l,'native');return {profile:structuredClone(e.profiles[slot]),preset:nativePreset(slot),revision:l.revision,requestedPresetId:'native',actualPresetId:'native',roleId,configSource:'native-task',presetHash:'native',profileBaseHash:'native'};}
 if(r&&!r.useLegacy){const b=rolePresetBinding(l,roleId),e=entry(l,r.presetId);if(e.kind!=='native'&&!b.enabled)return fail('角色所选小说预设已停用');return {profile:projectRoleNovelProfile(l,r.presetId,b),preset:e.kind==='native'?nativePreset(slot):e.preset,revision:l.revision,requestedPresetId:r.presetId,actualPresetId:r.presetId,roleId,configSource:'role-shared',presetHash:presetHash(e),profileBaseHash:b.baseHash};}
 const old=legacyNovelSnapshot(l),id=old.defaults[slot],e=entry(l,id),b=old.entries[id];if(!b)return fail('旧小说配置缺失');if(e.kind!=='native'&&!b.enabled)return fail('所选小说预设已停用');
 return {profile:projectRoleNovelProfile(l,id,{profile:b.profiles[slot],baseHash:b.baseHash,enabled:b.enabled},false),preset:e.kind==='native'?nativePreset(slot):e.preset,revision:l.revision,requestedPresetId:id,actualPresetId:id,roleId,configSource:'legacy-unresolved',presetHash:presetHash(e),profileBaseHash:b.baseHash};
}
/** Validate against the referenced original version, never silently rebase another role. */
export function decodeRoleNovelState(value:Record<string,unknown>,l:PresetLibrary):Pick<PresetLibrary,'roleNovel'|'legacyNovel'|'versions'> {
 if(!object(value.legacyNovel)||!object(value.legacyNovel.defaults)||!object(value.legacyNovel.entries)||!object(value.roleNovel)||!Array.isArray(l.versions))return fail('角色小说配置或迁移备份损坏');
 const snapshot=value.legacyNovel,defaults=snapshot.defaults,sourceEntries=snapshot.entries;if(!object(defaults)||!object(sourceEntries))return fail('旧默认配置损坏');
 const legacyEntries:LegacyNovelSnapshot['entries']={};
 for(const [id,raw]of Object.entries(sourceEntries)){
  if(!safeId(id)||!object(raw)||typeof raw.baseHash!=='string'||typeof raw.enabled!=='boolean'||!object(raw.profiles))return fail('旧模式配置损坏');
  const profiles={meeting:validateProfile(raw.profiles.meeting),theatre:validateProfile(raw.profiles.theatre)};for(const mode of ['meeting','theatre']as const)applyFruitProfile(presetVersion(l,id,raw.baseHash,mode),profiles[mode]);legacyEntries[id]={baseHash:raw.baseHash,enabled:raw.enabled,profiles};
 }
 if(typeof defaults.meeting!=='string'||typeof defaults.theatre!=='string'||!Object.hasOwn(legacyEntries,defaults.meeting)||!Object.hasOwn(legacyEntries,defaults.theatre))return fail('旧默认预设缺失');
 const legacyNovel:LegacyNovelSnapshot={defaults:{meeting:defaults.meeting,theatre:defaults.theatre},entries:legacyEntries};
 const readBindings=(raw:unknown)=>{if(!object(raw)||Object.keys(raw).length>20)return fail('角色 Profile 集合损坏');const bindings:Record<string,RolePresetBinding>={};for(const [id,v]of Object.entries(raw)){if(!safeId(id)||!object(v)||typeof v.baseHash!=='string'||typeof v.enabled!=='boolean')return fail('角色 Profile 损坏');const profile=sharedNovelProfile(validateProfile(v.profile),entry(l,id).kind==='native');for(const mode of ['meeting','theatre']as const)applyFruitProfile(presetVersion(l,id,v.baseHash,mode),profile);bindings[id]={baseHash:v.baseHash,enabled:v.enabled,profile};}return bindings;};
 const readBase=(raw:unknown):RoleNovelBase=>{if(!object(raw)||typeof raw.presetId!=='string'||!['meeting','theatre'].includes(String(raw.sourceMode)))return fail('角色预设选择损坏');entry(l,raw.presetId);return {presetId:raw.presetId,sourceMode:raw.sourceMode==='meeting'?'meeting':'theatre',profiles:readBindings(raw.profiles),...(raw.backups===undefined?{}:{backups:readBindings(raw.backups)})};};
 if(Object.keys(value.roleNovel).length>500)return fail('角色配置数量超限');const roleNovel:Record<string,RoleNovelConfig>={};
 for(const [id,raw]of Object.entries(value.roleNovel)){if(!safeId(id)||!object(raw)||raw.useLegacy!==undefined&&typeof raw.useLegacy!=='boolean')return fail('角色小说配置无效');roleNovel[id]={...readBase(raw),...(raw.useLegacy===undefined?{}:{useLegacy:raw.useLegacy}),...(raw.previous===undefined?{}:{previous:readBase(raw.previous)})};}
 return {roleNovel,legacyNovel,versions:l.versions};
}

export function planRoleProfile(l:PresetLibrary,id:string,b:RolePresetBinding){
 const e=entry(l,id),source=presetVersion(l,id,b.baseHash),profile=sharedNovelProfile(b.profile,e.kind==='native');
 const plan=planPresetUpdate({preset:source,profiles:{meeting:profile,theatre:profile},enabled:b.enabled},e.preset);
 const dropped=[...new Map(plan.dropped.map(d=>[d.id,{id:d.id,reason:d.reason}])).values()];
 const regexIds=new Set(e.preset.regex.map(r=>r.id));const next=plan.next.profiles.meeting;
 if(profile.regexOverrides){next.regexOverrides={};for(const [key,on]of Object.entries(profile.regexOverrides)){if(regexIds.has(key))next.regexOverrides[key]=on;else dropped.push({id:'regex:'+key,reason:'新版中已无此正则；开关未映射到其他规则'});}}
 return {...plan,profile:next,dropped};
}
export function projectRoleNovelProfile(l:PresetLibrary,id:string,b:RolePresetBinding,normalizeNative=true):FruitProfile {
 if(entry(l,id).kind==='native')return normalizeNative?sharedNovelProfile(b.profile,true):validateProfile(b.profile);
 const plan=planRoleProfile(l,id,b);if(plan.dropped.length)return fail('角色覆盖与新原件不兼容：'+plan.dropped.map(d=>d.id+'（'+d.reason+'）').join('；')+'。请在预设 App 复核新版覆盖');
 return structuredClone(plan.profile);
}
export function planRolePresetUpdate(l:PresetLibrary,roleId:string,id:string,preset:FruitPreset){
 const current=entry(l,id);if(current.kind==='native')return fail('原生预设不能用外部原件替换');const role=l.roleNovel?.[roleId];if(!role||role.useLegacy)return fail('请先完成角色配置选择');
 const binding=rolePresetBinding(l,roleId,id),global=planPresetUpdate(current,preset),versions=[...new Map([...(l.versions||[]),current.preset].filter(p=>p.sha256!==preset.sha256).map(p=>[p.sha256,p])).values()];
 const upgraded:PresetLibrary={...l,versions,entries:l.entries.map(e=>e.id===id?global.next:e)},review=planRoleProfile(upgraded,id,binding);
 const next:PresetLibrary={...upgraded,roleNovel:{...upgraded.roleNovel,[roleId]:{...role,profiles:{...role.profiles,[id]:{baseHash:preset.sha256,profile:review.profile,enabled:false}},backups:{...role.backups,[id]:structuredClone(binding)}}}};
 return {...review,next};
}
export function restoreRolePresetBackup(l:PresetLibrary,roleId:string,id:string):PresetLibrary {
 const r=l.roleNovel?.[roleId],b=r?.backups?.[id];if(!r||!b)return fail('没有该角色的更新前配置备份');
 return {...l,roleNovel:{...l.roleNovel,[roleId]:{...r,profiles:{...r.profiles,[id]:structuredClone(b)},backups:{...r.backups,[id]:rolePresetBinding(l,roleId,id)}}}};
}
export function rolePresetReferences(l:PresetLibrary,id:string,roleIds:string[]):string[]{
 const old=legacyNovelSnapshot(l);return [...new Set([...roleIds,...Object.keys(l.roleNovel||{})])].filter(roleId=>{const r=l.roleNovel?.[roleId];return r&&!r.useLegacy?r.presetId===id:Object.values(old.defaults).includes(id);});
}
export function archiveRolePreset(l:PresetLibrary,id:string,roleIds:string[],archived=true):PresetLibrary {
 const e=entry(l,id);if(e.kind==='native')return fail('不能删除原生预设');const affected=rolePresetReferences(l,id,roleIds);if(archived&&affected.length)return fail('仍有角色正在使用这份预设：'+affected.join('、'));
 return {...l,entries:l.entries.map(e=>e.id===id?{...e,archived}:e)};
}
