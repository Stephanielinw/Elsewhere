export type PresetMode = 'meeting' | 'theatre';
export interface PresetItem {
  id: string;
  name: string;
  role: 'system' | 'user' | 'assistant';
  enabled: boolean;
  content: string;
  group?: string;
}
export interface ElsewherePreset {
  format: 'elsewhere-preset';
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  entries: PresetItem[];
}
export interface PresetSettings { length: { min: number; max: number }; style: string }
export interface LegacyElsewherePreset extends ElsewherePreset { settings: Record<PresetMode, PresetSettings> }
export interface PresetOverride {
  entries?: Record<string, Partial<Omit<PresetItem, 'id'>>>;
  added?: PresetItem[];
  hidden?: string[];
  order?: string[];
}
export interface PresetBinding { presetId: string; overrides: PresetOverride }
export interface ElsewherePresetLibrary {
  schemaVersion: 2;
  revision: number;
  presets: ElsewherePreset[];
  defaultPresetId: string;
  bindings: Record<string, PresetBinding>;
  taskProfiles?: unknown;
  legacyNotice?: boolean;
}

// A full V1 preset can gain two entries when its saved style and length become editable prompts.
export const PRESET_MAX_ENTRIES = 130;
export const PRESET_MAX_BYTES = 8 * 1024 * 1024 + 16 * 1024;
const modes: PresetMode[] = ['meeting', 'theatre'];
const itemFields = ['name', 'role', 'enabled', 'content', 'group'] as const;
const encoder = new TextEncoder();
export const presetObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const presetId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200 && !['__proto__', 'constructor', 'prototype'].includes(v) && !/[\u0000-\u001f]/.test(v);

function fields(v: unknown, allowed: readonly string[], label: string): asserts v is Record<string, unknown> {
  if (!presetObject(v) || Object.keys(v).some(k => !allowed.includes(k))) throw Error(label + '包含无效字段');
}
function text(v: unknown, max: number, label: string, required = false): string {
  if (typeof v !== 'string' || v.length > max || required && !v.trim()) throw Error(label + '不完整或过长');
  return v;
}
function settings(v: unknown): PresetSettings {
  fields(v, ['length', 'style'], '设置');
  fields(v.length, ['min', 'max'], '字数');
  const {min, max} = v.length;
  if (typeof min !== 'number' || typeof max !== 'number' || !Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min || max > 50000) throw Error('字数应为 1–50000 的整数范围');
  return {length: {min, max}, style: text(v.style, 2000, '文风')};
}
function item(v: unknown): PresetItem {
  fields(v, ['id', ...itemFields], '条目');
  if (!presetId(v.id) || !['system', 'user', 'assistant'].includes(String(v.role)) || typeof v.enabled !== 'boolean') throw Error('条目 ID、消息角色或启用状态无效');
  return {
    id: v.id, name: text(v.name, 200, '条目名称', true), role: v.role as PresetItem['role'],
    enabled: v.enabled, content: text(v.content, 128000, '条目正文'),
    ...(v.group === undefined ? {} : {group: text(v.group, 100, '分组')}),
  };
}
function entries(v: unknown): PresetItem[] {
  if (!Array.isArray(v) || v.length > PRESET_MAX_ENTRIES) throw Error(`条目超过 ${PRESET_MAX_ENTRIES} 个或格式无效`);
  const result = v.map(item);
  if (new Set(result.map(e => e.id)).size !== result.length) throw Error('条目 ID 重复');
  return result;
}
export function validateElsewherePreset(v: unknown): ElsewherePreset {
  if (!presetObject(v) || v.format !== 'elsewhere-preset' || v.schemaVersion !== 1) throw Error('请选择 Elsewhere 原生预设 V1 JSON');
  fields(v, ['format', 'schemaVersion', 'id', 'name', 'description', 'entries'], '预设');
  if (!presetId(v.id)) throw Error('预设 ID 无效');
  const preset: ElsewherePreset = {format: 'elsewhere-preset', schemaVersion: 1, id: v.id, name: text(v.name, 200, '预设名称', true), description: text(v.description, 2000, '简介'), entries: entries(v.entries)};
  if (encoder.encode(JSON.stringify(preset)).length > PRESET_MAX_BYTES) throw Error('预设文件超过大小限制');
  return preset;
}
function readPreset(v: unknown): ElsewherePreset | LegacyElsewherePreset {
  if (!presetObject(v) || !Object.hasOwn(v, 'settings')) return validateElsewherePreset(v);
  const {settings: old, ...rest} = v;
  fields(old, modes, '旧模式设置');
  return {...validateElsewherePreset(rest), settings: {meeting: settings(old.meeting), theatre: settings(old.theatre)}};
}
export function builtinPreset(): ElsewherePreset {
  return {format: 'elsewhere-preset', schemaVersion: 1, id: 'native', name: 'Elsewhere 内置基础', description: '沿用 Elsewhere 的人物、来源与小说基础规则。复制后可编辑。', entries: []};
}
export function emptyPresetLibrary(): ElsewherePresetLibrary {
  return {schemaVersion: 2, revision: 0, presets: [builtinPreset()], defaultPresetId: 'native', bindings: {}};
}
export function readElsewherePresetFile(raw: Uint8Array): ElsewherePreset | LegacyElsewherePreset {
  if (!raw.length || raw.length > PRESET_MAX_BYTES) throw Error('预设 JSON 为空或超过大小限制');
  let value: unknown;
  try { value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(raw)); }
  catch { throw Error('JSON 无法读取，请选择完整的预设文件'); }
  return readPreset(value);
}
export function parseElsewherePreset(raw: Uint8Array): ElsewherePreset {
  return unifyElsewherePreset(readElsewherePresetFile(raw), 'meeting');
}
export function exportElsewherePreset(p: unknown): Uint8Array {
  const preset = validateElsewherePreset(p);
  const pretty = encoder.encode(JSON.stringify(preset, null, 2));
  return pretty.length <= PRESET_MAX_BYTES ? pretty : encoder.encode(JSON.stringify(preset));
}

export function unifyElsewherePreset(p: ElsewherePreset | LegacyElsewherePreset, mode: PresetMode, lengthOverride = false): ElsewherePreset {
  if (!('settings' in p)) return p;
  const {settings: old, ...base} = p;
  const {length, style} = old[mode];
  const result = {...base, entries: [...base.entries]};
  function add(id: string, name: string, content: string) {
    let entryId = id;
    let suffix = 2;
    while (result.entries.some(e => e.id === entryId)) entryId = `${id}-${suffix++}`;
    result.entries.push({id: entryId, name, content, role: 'system', enabled: true});
  }
  if (p.id !== 'native' || lengthOverride) add('previous-length', '正文篇幅', `目标 ${length.min}–${length.max} 字，按剧情自然取舍，不凑字数。`);
  if (style.trim()) add('previous-style', '文风要求', `文风：${style}`);
  return validateElsewherePreset(result);
}

function applyOverride(base: ElsewherePreset, override: PresetOverride): ElsewherePreset {
  const effective = [...base.entries.filter(e => !override.hidden?.includes(e.id)).map(e => ({...e, ...override.entries?.[e.id]})), ...(override.added || [])];
  const byId = new Map(effective.map(e => [e.id, e]));
  return {...base, entries: override.order ? override.order.map(id => byId.get(id)!) : effective};
}
function validateOverride(v: unknown, p: ElsewherePreset, legacy = false): PresetOverride {
  fields(v, legacy ? ['entries', 'order', 'settings'] : ['entries', 'order', 'added', 'hidden'], '角色覆盖');
  const result: PresetOverride = {};
  if (v.entries !== undefined) {
    if (!presetObject(v.entries)) throw Error('条目覆盖无效');
    result.entries = {};
    for (const [id, patch] of Object.entries(v.entries)) {
      const source = p.entries.find(e => e.id === id);
      if (!source) throw Error('覆盖引用的条目不存在');
      fields(patch, itemFields, '条目覆盖');
      item({...source, ...patch});
      result.entries[id] = {...patch};
    }
  }
  if (v.added !== undefined) {
    result.added = entries(v.added);
    if (result.added.some(e => p.entries.some(x => x.id === e.id))) throw Error('角色自建条目 ID 重复');
  }
  if (v.hidden !== undefined) {
    if (!Array.isArray(v.hidden) || new Set(v.hidden).size !== v.hidden.length || v.hidden.some(id => !p.entries.some(e => e.id === id))) throw Error('角色隐藏引用无效');
    result.hidden = [...v.hidden];
  }
  if (v.order !== undefined) {
    const effective = applyOverride(p, result).entries;
    if (!Array.isArray(v.order) || v.order.length !== effective.length || new Set(v.order).size !== v.order.length || v.order.some(id => !effective.some(e => e.id === id))) throw Error('角色排序引用无效');
    result.order = [...v.order];
  }
  return result;
}
export function presetOverride(base: ElsewherePreset, edited: ElsewherePreset): PresetOverride {
  const changed: NonNullable<PresetOverride['entries']> = {};
  const added = edited.entries.filter(e => !base.entries.some(x => x.id === e.id));
  const hidden = base.entries.filter(e => !edited.entries.some(x => x.id === e.id)).map(e => e.id);
  for (const entry of edited.entries) {
    const source = base.entries.find(x => x.id === entry.id);
    if (!source) continue;
    const patch = Object.fromEntries(itemFields.filter(k => (entry[k] ?? '') !== (source[k] ?? '')).map(k => [k, entry[k] ?? '']));
    if (Object.keys(patch).length) changed[entry.id] = patch;
  }
  const result: PresetOverride = {
    ...(Object.keys(changed).length ? {entries: changed} : {}),
    ...(added.length ? {added} : {}), ...(hidden.length ? {hidden} : {}),
  };
  const order = edited.entries.map(e => e.id);
  if (JSON.stringify(order) !== JSON.stringify(applyOverride(base, result).entries.map(e => e.id))) result.order = order;
  return result;
}
export function resolvePreset(l: ElsewherePresetLibrary, roleId: string): ElsewherePreset {
  const b = Object.hasOwn(l.bindings, roleId) ? l.bindings[roleId] : undefined;
  const id = b && b.presetId !== 'inherit' ? b.presetId : l.defaultPresetId;
  const p = l.presets.find(p => p.id === id);
  if (!p) throw Error('预设选择已失效，请重新选择');
  return applyOverride(p, b?.overrides || {});
}
function legacyBinding(value: unknown, presets: (ElsewherePreset | LegacyElsewherePreset)[], defaultId: string, mode: PresetMode) {
  fields(value, ['presetId', 'overrides'], '旧角色选择');
  const source = presets.find(p => p.id === (value.presetId === 'inherit' ? defaultId : value.presetId));
  if (!source || !('settings' in source)) throw Error('旧角色预设引用失效');
  const override = validateOverride(value.overrides, source, true);
  const patch = presetObject(value.overrides) ? value.overrides.settings : undefined;
  let effective = source.settings[mode];
  let lengthOverride = false;
  if (patch !== undefined) {
    fields(patch, ['length', 'style'], '设置覆盖');
    if (patch.length !== undefined) fields(patch.length, ['min', 'max'], '字数覆盖');
    lengthOverride = presetObject(patch.length) && Object.keys(patch.length).length > 0;
    effective = settings({...effective, ...patch, length: {...effective.length, ...(presetObject(patch.length) ? patch.length : {})}});
  }
  const edited = unifyElsewherePreset({...source, entries: applyOverride(source, override).entries, settings: {...source.settings, [mode]: effective}}, mode, lengthOverride);
  return {presetId: String(value.presetId), sourceId: source.id, edited};
}
export function validatePresetLibrary(v: unknown, source: PresetMode = 'meeting'): ElsewherePresetLibrary {
  const legacy = presetObject(v) && v.schemaVersion === 1;
  fields(v, ['schemaVersion', 'revision', 'presets', legacy ? 'defaults' : 'defaultPresetId', 'bindings', 'taskProfiles', 'legacyNotice'], '预设库');
  if ((!legacy && v.schemaVersion !== 2) || !Number.isSafeInteger(v.revision) || Number(v.revision) < 0 || !Array.isArray(v.presets) || !v.presets.length || v.presets.length > 20 || !presetObject(v.bindings) || Object.keys(v.bindings).length > 500) throw Error('预设库结构无效，原数据保留');
  const old = v.presets.map(legacy ? readPreset : validateElsewherePreset);
  if (legacy && old.some(p => !('settings' in p))) throw Error('旧预设缺少模式设置');
  const presets = old.map(p => unifyElsewherePreset(p, source));
  if (new Set(presets.map(p => p.id)).size !== presets.length) throw Error('预设 ID 重复');
  if (JSON.stringify(presets.find(p => p.id === 'native')) !== JSON.stringify(builtinPreset())) throw Error('内置基础不能被替换');
  let defaultPresetId = v.defaultPresetId;
  const legacyDefaults: Record<string, string> = {};
  if (legacy) {
    const defaults = v.defaults;
    fields(defaults, modes, '旧默认预设');
    for (const mode of modes) {
      if (!old.some(p => p.id === defaults[mode])) throw Error('旧默认预设不存在');
      legacyDefaults[mode] = String(defaults[mode]);
    }
    defaultPresetId = legacyDefaults[source];
  }
  if (!presetId(defaultPresetId) || !presets.some(p => p.id === defaultPresetId)) throw Error('默认预设不存在');
  const result: ElsewherePresetLibrary = {schemaVersion: 2, revision: Number(v.revision), presets, defaultPresetId, bindings: {}, ...(v.taskProfiles === undefined ? {} : {taskProfiles: structuredClone(v.taskProfiles)}), ...(v.legacyNotice === true ? {legacyNotice: true} : {})};
  for (const [roleId, value] of Object.entries(v.bindings)) {
    if (!presetId(roleId)) throw Error('角色 ID 无效');
    if (legacy) {
      fields(value, modes, '旧角色模式');
      for (const mode of modes) {
        if (value[mode] === undefined) continue;
        const b = legacyBinding(value[mode], old, legacyDefaults[mode], mode);
        if (mode === source) result.bindings[roleId] = {presetId: b.presetId, overrides: presetOverride(presets.find(p => p.id === b.sourceId)!, b.edited)};
      }
    } else {
      fields(value, ['presetId', 'overrides'], '角色选择');
      const p = presets.find(p => p.id === (value.presetId === 'inherit' ? defaultPresetId : value.presetId));
      if (!p) throw Error('角色预设引用失效');
      result.bindings[roleId] = {presetId: String(value.presetId), overrides: validateOverride(value.overrides, p)};
    }
    validateElsewherePreset(resolvePreset(result, roleId));
  }
  return result;
}
export function importElsewherePreset(l: ElsewherePresetLibrary, input: ElsewherePreset): ElsewherePresetLibrary {
  if (l.presets.length >= 20) throw Error('预设库最多保存 20 份，请先导出和整理');
  const p = validateElsewherePreset(input);
  if (p.id === 'inherit' || l.presets.some(e => e.id === p.id)) p.id = crypto.randomUUID();
  const name = p.name;
  let n = 2;
  while (l.presets.some(e => e.name === p.name)) {
    const suffix = '（' + n++ + '）';
    p.name = name.slice(0, 200 - suffix.length) + suffix;
  }
  return {...l, presets: [...l.presets, p]};
}
export function replaceSharedPreset(l: ElsewherePresetLibrary, input: ElsewherePreset): ElsewherePresetLibrary {
  const p = validateElsewherePreset(input);
  if (p.id === 'native') throw Error('请先复制内置基础');
  if (!l.presets.some(e => e.id === p.id)) throw Error('原预设不存在');
  const next = structuredClone(l);
  next.presets = next.presets.map(e => e.id === p.id ? p : e);
  for (const [roleId, binding] of Object.entries(next.bindings)) {
    if ((binding.presetId === 'inherit' ? l.defaultPresetId : binding.presetId) !== p.id) continue;
    const o = binding.overrides;
    const remains = (id: string) => p.entries.some(e => e.id === id);
    if (o.entries) o.entries = Object.fromEntries(Object.entries(o.entries).filter(([id]) => remains(id)));
    if (o.hidden) o.hidden = o.hidden.filter(remains);
    if (o.order) {
      const natural = applyOverride(p, {...o, order: undefined}).entries.map(e => e.id);
      const order = o.order.filter(id => natural.includes(id));
      for (const [index, id] of natural.entries()) {
        if (order.includes(id)) continue;
        const successor = natural.slice(index + 1).find(id => order.includes(id));
        order.splice(successor ? order.indexOf(successor) : order.length, 0, id);
      }
      o.order = order;
    }
    validateOverride(o, p);
    validateElsewherePreset(resolvePreset(next, roleId));
  }
  return next;
}
export function deletePreset(l: ElsewherePresetLibrary, id: string): ElsewherePresetLibrary {
  if (id === 'native') throw Error('不能删除内置基础');
  if (!l.presets.some(p => p.id === id)) throw Error('预设不存在');
  const next = structuredClone(l);
  next.presets = next.presets.filter(p => p.id !== id);
  if (next.defaultPresetId === id) next.defaultPresetId = 'native';
  for (const [roleId, b] of Object.entries(next.bindings)) {
    if (b.presetId === id) next.bindings[roleId] = {presetId: 'native', overrides: {}};
    else if (b.presetId === 'inherit' && l.defaultPresetId === id) next.bindings[roleId] = {presetId: 'inherit', overrides: {}};
  }
  return next;
}
export function presetFilename(name: string) {
  return (name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim().slice(0, 100) || 'Elsewhere-preset') + '.json';
}
