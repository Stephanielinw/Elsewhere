import {plainUiLabel} from './uiIcons';
import type { FruitPreset, FruitProfile, FruitPrompt } from './core/fruit/types';

export const fruitSections = [
  {id:'story',icon:'sparkles',title:'剧情控制',description:'把握推进节奏，留下下一次相遇的余韵。'},
  {id:'style',icon:'edit',title:'正文风格',description:'选择叙述的质感，让故事更像你想读的那一本。'},
  {id:'output',icon:'file',title:'非正文输出',description:'正文之外的信息，按需要轻轻打开。'},
  {id:'character',icon:'profile',title:'角色表现',description:'保留人物的性格、关系与自然反应。'},
  {id:'language',icon:'language',title:'语言与字数',description:'从短暂互动到长篇叙事，自由决定这一页的长度。'},
  {id:'memory',icon:'memory',title:'记忆与约束',description:'让身份、场景与已有经历保持连续。'},
  {id:'boundary',icon:'shield',title:'内容选项与兼容信息',description:'内容开关由你选择；不兼容格式单独提示。'},
  {id:'advanced',icon:'settings',title:'高级条目',description:'模型专用、结构控制及尚未确认语义的配置。'},
] as const;
export type FruitSectionId = typeof fruitSections[number]['id'];
const labels: Record<string,[string,string]> = {
  personaDescription:['用户身份','注入当前模式允许使用的用户身份资料。'],worldInfoBefore:['关系与世界背景','在人物资料之前放入已获知的关系与世界信息。'],
  charDescription:['角色身份与经历','使用当前模式下的角色资料；演出模式只使用戏内身份。'],charPersonality:['性格与习惯','保留角色的性格、偏好与表达习惯。'],
  scenario:['当前场景','注入当前时间、地点及场景状态。'],worldInfoAfter:['相关经历','在人物资料之后加入已获知且有效的相关事件。'],
  dialogueExamples:['对话示例','提供少量表达示例，帮助保持语气。'],chatHistory:['近期对话','使用经过筛选的近期对话，不拼接全部历史。'],
  '文末钩子':['文末钩子','让每轮结尾保留自然的后续空间。'],'推故事':['剧情推进','侧重故事进展与新线索的出现。'],
  '推进慢速':['慢节奏','为对话、动作与细节留出更多篇幅。'],'推进快速':['快节奏','加快场景推进与事件变化。'],
  '防抢话':['保留你的行动空间','让模型主要扮演其他角色，减少替你做决定。'],
  '语言设置':['输出语言','控制正文的语言规则；具体要求可在详情中查看。'],
  '正文与字数要求':['正文格式与篇幅','保持原正文结构；字数由本模式的篇幅设置替换。'],
  '前端卡':['前端卡正文格式','原件的另一种正文格式；字数仍由本模式设置控制。'],
  '角色内心':['角色内心描写','在小说中描写角色的内心活动，不代表真实读心。'],
  '对白加强':['对白表现','增加对白在正文中的表现力。'],'自然互动':['自然互动','让人物交流更贴近日常反应。'],
  '优先人设':['忠于人设','优先遵循人物既有的性格与经历。'],'防重复':['减少重复','减少重复表达与内容回环。'],
  '获取变量':['预设变量初始化','建立原件运行需要的变量；通常保持原配置。'],
  '摘要':['剧情摘要','为后续阅读准备摘要；生成内容不会自动成为正式记忆。'],
  '角色表':['人物辅助信息','整理本轮人物信息，供辅助查看。'],
};
export function cleanFruitTitle(name:string):string {
  return plainUiLabel(name.replace(/[@#][^\s｜|]+/gu,'').split(/[｜|]/u)[0]
    .replace(/^[\s\p{Extended_Pictographic}\uFE0F\u200D━─—=·📌]+/u,'').replace(/[━─—=]+$/u,'').trim());
}
export function describeFruitPrompt(prompt:FruitPrompt) {
  const clean=cleanFruitTitle(prompt.name);
  const mapped=labels[prompt.identifier]||labels[clean];
  const uncertain=!mapped&&(!/[\u3400-\u9fff]/u.test(clean)||/^(?:fruit-|[\da-f]{8}-)/i.test(clean));
  const structural=/^(?:━|——|==|---)/u.test(prompt.name.trim())||/display-section/.test(prompt.identifier);
  let section:FruitSectionId='advanced';
  const group=prompt.group+' '+prompt.name;
  if(prompt.blockedReason||/🔞|NSFW/i.test(group))section='boundary';
  else if(structural)section='advanced';
  else if(prompt.marker||/基础|梦境载入|世界观|梦境舞台/.test(prompt.group))section='memory';
  else if(/语言|字数|人称|视角|前端卡/.test(group))section='language';
  else if(/文风|写作/.test(group))section='style';
  else if(/剧情|AI模式|文末钩子|伏笔|seeds|防转折/.test(group))section='story';
  else if(/行为指导|角色塑造|角色内心|对白/.test(group))section='character';
  else if(/输出|果农人格/.test(prompt.group))section='output';
  const variant=/好结局/.test(clean)?(prompt.name.includes('允许局部负面')?'好结局 · 允许波折':prompt.name.includes('反阴谋')?'好结局 · 少阴谋':undefined):undefined;
  const title=variant||mapped?.[0]||(uncertain?'预设扩展选项':clean||'预设结构条目');
  const description=mapped?.[1]||(uncertain?'语义待确认，请查看原始条目后决定是否调整。':`原件的「${title}」选项；查看详情了解具体要求。`);
  const single=prompt.name.match(/([^｜|\s]+)单选/u)?.[1];
  return {title,description,section,uncertain,structural,single};
}
export function fruitPromptRows(preset:FruitPreset,profile:FruitProfile) {
  const order=new Map(preset.order.map((item,index)=>[item.identifier,{...item,index}]));
  return preset.prompts.map(prompt=>{
    const item=order.get(prompt.identifier),label=describeFruitPrompt(prompt);
    const reason=prompt.blockedReason||(!item?'未包含在当前排序中，仅供查阅':'');
    const enabled=Boolean(item&&!reason&&(Object.hasOwn(profile.overrides,prompt.identifier)?profile.overrides[prompt.identifier]:item.enabled));
    return {prompt,...label,section:!item?'advanced' as const:label.section,enabled,reason,orderIndex:item?.index};
  }).sort((a,b)=>(a.orderIndex??10000)-(b.orderIndex??10000));
}
export type FruitUiRow=ReturnType<typeof fruitPromptRows>[number];
