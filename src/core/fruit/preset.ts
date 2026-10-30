import type { FruitDiagnostic, FruitPreset, FruitProfile, FruitPrompt, FruitRegex, FruitState, FruitPromptEdit, FruitCustomPrompt } from './types';

export const FRUIT_MAX_BYTES = 8 * 1024 * 1024;
export const FRUIT_MARKERS = ['personaDescription','worldInfoBefore','charDescription','charPersonality','scenario','worldInfoAfter','dialogueExamples','chatHistory'] as const;
export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function fail(message: string): never { throw new Error(message); }
function text(value: unknown, label: string, max=1000000): string {
  if(typeof value!=='string'||value.length>max)fail(`${label}必须是长度受限的文本`);return value;
}
function number(value: unknown, fallback: number, label: string): number {
  if(value===undefined)return fallback;
  if(typeof value!=='number'||!Number.isFinite(value))fail(`${label}必须是有限数字`);return value;
}
function safeKey(key: string): boolean { return !['__proto__','prototype','constructor'].includes(key); }
export function isFruitDocument(value: unknown): boolean {
  return object(value)&&object(value.extensions)&&'fruitHeartSections' in value.extensions;
}
export function fruitSafetyReason(name: string, content: string): string | undefined {
  if(/小剧场|纯文字剧场|主剧场/i.test(name)||/<\/?snow\b|setvar\s*::\s*(?:小剧场[^:]*|emoji_snow|snow)\s*::\s*[^\s}]/i.test(content))return '关闭果实小剧场及其输出依赖';
  return undefined;
}
export async function parseFruitPreset(raw: Uint8Array, fileName: string, importedAt=Date.now()): Promise<FruitPreset> {
  if(!raw.length||raw.length>FRUIT_MAX_BYTES)fail('请选择不超过 8 MiB 的 JSON 文件');
  text(fileName,'文件名',300);
  let doc: unknown;
  try{doc=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{fail('JSON 无法解析，请选择完整的 UTF-8 预设文件');}
  if(!object(doc)||!Array.isArray(doc.prompts)||!Array.isArray(doc.prompt_order))fail('JSON 需要 prompts 和 prompt_order 数组');
  if(!doc.prompts.length||doc.prompts.length>1000||!doc.prompt_order.length||doc.prompt_order.length>20)fail('预设条目或排序组数量超出支持范围');
  const ext=object(doc.extensions)?doc.extensions:{};
  const sections=object(ext.fruitHeartSections)?ext.fruitHeartSections:{};
  const groupNames=new Map<string,string>();
  if(Array.isArray(sections.groups))for(const g of sections.groups)if(object(g)&&typeof g.id==='string'&&typeof g.name==='string')groupNames.set(g.id,g.name);
  const promptGroups=object(sections.prompts)?sections.prompts:{};
  const seen=new Set<string>(),diagnostics:FruitDiagnostic[]=[];
  const prompts:FruitPrompt[]=doc.prompts.map((value,index)=>{
    if(!object(value))return fail(`Prompt ${index+1} 不是对象`);
    const id=text(value.identifier,'identifier',200);if(!id||!safeKey(id)||seen.has(id))fail('Prompt identifier 为空、重复或不安全');seen.add(id);
    const name=text(value.name??id,'条目名称',500),content=text(value.content??'','条目内容');
    if(value.enabled!==undefined&&typeof value.enabled!=='boolean')fail(`条目 ${name} 的 enabled 不是布尔值`);
    if(value.marker!==undefined&&typeof value.marker!=='boolean')fail(`条目 ${name} 的 marker 不是布尔值`);
    const role=value.role??'system';if(role!=='system'&&role!=='user'&&role!=='assistant')fail(`条目 ${name} 的 role 不支持`);
    const position=number(value.injection_position,0,'injection_position'),depth=number(value.injection_depth,4,'injection_depth'),injectionOrder=number(value.injection_order,100,'injection_order');
    if(!Number.isInteger(depth)||depth<0||depth>10000)fail('injection_depth 必须为 0–10000 的整数');
    if(position!==0&&position!==1)diagnostics.push({code:'injection-unsupported',severity:'warning',sourceId:id,message:'未知注入位置，编译时阻断该条目'});
    const metadata=promptGroups[id];const groupId=object(metadata)&&typeof metadata.groupId==='string'?metadata.groupId:'';
    const group=groupNames.get(groupId)||'其他条目';
    const blockedReason=fruitSafetyReason(`${group} ${name}`,content);
    return {identifier:id,name,role,content,marker:value.marker===true,originalEnabled:value.enabled===true,position,depth,injectionOrder,group,blockedReason,styleEntry:/文风/.test(group+' '+name)||(/setvar\s*::\s*当前文风/.test(content)&&(content.match(/\{\{set(?:global)?var\s*::/g)||[]).length===1)};
  });
  const groups=doc.prompt_order.map((g,index)=>{
    if(!object(g)||!Array.isArray(g.order)||g.order.length>1000)fail(`排序组 ${index+1} 无效`);
    const used=new Set<string>();
    return {characterId:g.character_id,order:g.order.map((v)=>{
      if(!object(v)||typeof v.identifier!=='string'||typeof v.enabled!=='boolean')return fail('排序项需要 identifier 文本和 enabled 布尔值');
      if(!seen.has(v.identifier))fail(`排序引用的条目不存在：${v.identifier}`);if(used.has(v.identifier))fail('同一排序组存在重复条目');used.add(v.identifier);
      return {identifier:v.identifier,enabled:v.enabled};
    })};
  });
  const found=groups.findIndex(g=>g.characterId===100001),orderGroup=found<0?0:found;
  if(groups.length>1)diagnostics.push({code:'order-group',severity:'warning',message:`保留全部原始排序组；当前采用第 ${orderGroup+1} 组（优先 character_id=100001）`});
  const rules=ext.regex_scripts??[];if(!Array.isArray(rules)||rules.length>200)fail('extensions.regex_scripts 必须是受限数组');
  const regex:FruitRegex[]=rules.map((v,i)=>{
    if(!object(v))return fail(`正则 ${i+1} 无效`);
    const replacement=text(v.replaceString??'','正则替换文本');
    const hasExecutableMarkup=/<script\b|\bon\w+\s*=|javascript:|<iframe\b/i.test(replacement);
    return {id:text(v.id??String(i),'正则 ID',200),name:text(v.scriptName??`正则 ${i+1}`,'正则名称',500),enabled:v.disabled!==true,pattern:text(v.findRegex??'','正则表达式',20000),placement:Array.isArray(v.placement)?v.placement.filter((x):x is number=>typeof x==='number'&&Number.isInteger(x)):[],side:v.promptOnly===true?'prompt':v.markdownOnly===true?'display':'other',hasExecutableMarkup,status:hasExecutableMarkup?'disabled-safety':'unsupported',reason:hasExecutableMarkup?'替换含可执行 HTML/脚本，禁止执行':'仅识别元数据；本轮不运行导入正则，改用受限结构解析'};
  });
  const modelParameters:FruitPreset['modelParameters']={};
  for(const [key,v]of Object.entries(doc)){
    if(['prompts','prompt_order','extensions','name'].includes(key)||!safeKey(key))continue;
    if(typeof v==='number'&&Number.isFinite(v)||typeof v==='boolean'||typeof v==='string'&&v.length<10000)modelParameters[key]=v;
    else diagnostics.push({code:'model-parameter',severity:'warning',message:`模型参数 ${key} 形状不支持，仅保留于原件`});
  }
  diagnostics.push({code:'runtime-options',severity:'warning',message:'模型参数、上下文包装、续写和供应商专有选项仅保留预览，尚未映射到真实请求。'});
  if(regex.length)diagnostics.push({code:'regex-inert',severity:'warning',message:`识别 ${regex.length} 条正则，全部只读，不执行替换或改写历史`});
  for(const key of Object.keys(ext))if(key!=='regex_scripts')diagnostics.push({code:'extension-inert',severity:'warning',message:`扩展 ${key} 仅保留原始数据；不执行脚本/QR/扩展事件`});
  const allTags=[...new Set(prompts.flatMap(p=>[...p.content.matchAll(/<\/?([\p{L}][\p{L}\p{N}_-]*)(?=[\s/>])/gu)].map(m=>m[1])))];
  if(allTags.length>512)diagnostics.push({code:'tag-inventory-limit',severity:'warning',message:'标签清单超出 512 项，完整数据仍保存在原件；这里只显示受限清单'});
  const tags=allTags.slice(0,512);
  const digest=await crypto.subtle.digest('SHA-256',Uint8Array.from(raw));
  const sha256=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
  return {raw:Uint8Array.from(raw),sha256,fileName,name:typeof doc.name==='string'?doc.name.slice(0,300):fileName.replace(/\.json$/i,''),version:fileName.match(/V\d+(?:\.\d+)*[A-Za-z]*/i)?.[0]||'未声明',importedAt,prompts,order:groups[orderGroup].order,orderGroup,regex,extensions:Object.keys(ext),modelParameters,outputTags:tags,diagnostics};
}
export function createFruitState(): FruitState {
  const profile=():FruitProfile=>({overrides:{},style:'',length:{min:600,max:1200},output:{scene:true,summary:true,characters:false,auxiliary:false}});
  return {schema:1,revision:0,enabled:false,preset:null,profiles:{meeting:profile(),theatre:profile()}};
}
export function validatePromptEdit(value:unknown):FruitPromptEdit {
  if(!object(value))fail('Prompt 编辑格式无效');const edit:FruitPromptEdit={};
  for(const [key,v]of Object.entries(value)){
    if(key==='name'||key==='content')edit[key]=text(v,key,key==='name'?500:1000000);
    else if(key==='role'){if(v!=='system'&&v!=='assistant'&&v!=='user')fail('Role 无效');edit.role=v;}
    else if(key==='position'){if(v!==0&&v!==1)fail('Position 只支持 Relative / In-Chat');edit.position=v;}
    else if(key==='depth'||key==='injectionOrder'){if(typeof v!=='number'||!Number.isInteger(v)||v<0||v>10000)fail('Depth / Order 应为 0–10000 的整数');edit[key]=v;}
    else fail('Prompt 编辑包含不支持的字段');
  }return edit;
}
export function validateProfile(value: unknown): FruitProfile {
  if(!object(value)||!object(value.overrides)||!object(value.length)||!object(value.output))fail('模式配置不完整');
  const {min,max}=value.length;
  if(typeof min!=='number'||typeof max!=='number'||!Number.isInteger(min)||!Number.isInteger(max)||min<1||max<min||max>50000)fail('字数范围应为 1–50000 的整数，最少不能超过最多');
  const overrides:Record<string,boolean>={};
  for(const [k,v] of Object.entries(value.overrides)){if(!safeKey(k)||typeof v!=='boolean')fail('条目覆盖设置无效');overrides[k]=v;}
  if(Object.keys(overrides).length>1000)fail('条目覆盖数量超限');
  const style=text(value.style,'文风',2000),output=value.output;
  for(const k of ['scene','summary','characters','auxiliary'])if(typeof output[k]!=='boolean')fail('输出选项必须是布尔值');
  const profile:FruitProfile={overrides,style,length:{min,max},output:{scene:output.scene===true,summary:output.summary===true,characters:output.characters===true,auxiliary:output.auxiliary===true}};
  if(value.edits!==undefined){if(!object(value.edits)||Object.keys(value.edits).length>1000)fail('Prompt 编辑数量无效');profile.edits={};for(const [id,edit]of Object.entries(value.edits)){if(!safeKey(id)||id.length>200)fail('编辑 ID 无效');profile.edits[id]=validatePromptEdit(edit);}}
  if(value.order!==undefined){if(!Array.isArray(value.order)||value.order.length>1100||value.order.some(id=>typeof id!=='string'||!safeKey(id))||new Set(value.order).size!==value.order.length)fail('排序覆盖格式或重复项无效');profile.order=[...value.order];}
  if(value.customPrompts!==undefined){if(!Array.isArray(value.customPrompts)||value.customPrompts.length>100)fail('自建条目最多 100 个');const used=new Set<string>();profile.customPrompts=value.customPrompts.map((v)=>{if(!object(v)||typeof v.identifier!=='string'||!v.identifier.startsWith('custom:')||v.identifier.length>200||used.has(v.identifier))return fail('自建条目 ID 无效或重复');used.add(v.identifier);const {identifier,...rest}=v;const edit=validatePromptEdit(rest);if(typeof edit.name!=='string'||!edit.name.trim()||typeof edit.content!=='string'||!edit.role||edit.position===undefined||edit.depth===undefined||edit.injectionOrder===undefined)return fail('自建条目字段不完整');return {identifier,name:edit.name,content:edit.content,role:edit.role,position:edit.position,depth:edit.depth,injectionOrder:edit.injectionOrder} satisfies FruitCustomPrompt;});}
  return profile;
}
export function replaceFruitPreset(state: FruitState,preset: FruitPreset): FruitState {
  const allowed=new Set(preset.order.map(x=>x.identifier));
  const profile=(p:FruitProfile)=>validateProfile({...p,overrides:Object.fromEntries(Object.entries(p.overrides).filter(([id])=>allowed.has(id)))});
  return {...state,enabled:false,preset,profiles:{meeting:profile(state.profiles.meeting),theatre:profile(state.profiles.theatre)}};
}
