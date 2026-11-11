import {isNativePreset,nativeEntryApplies,type ConversationMode} from './fruit/nativePreset';
import type {PresetData} from './types';
import {isLiveNovelContext} from './novelContext';
import { applyFruitProfile } from './fruit/profile';
import { FruitMacroError, FruitMacroResolver } from './fruit/macros';
import { FRUIT_MARKERS, validateProfile } from './fruit/preset';
import type { FruitCompilation, FruitCompiledMessage, FruitContext, FruitLength, FruitPreset, FruitProfile } from './fruit/types';
import {memoryRuleConflicts,type MemoryDecision} from './memory';
import {validateElsewherePreset,type ElsewherePreset} from './elsewherePreset';

export interface ConversationContext extends Omit<FruitContext,'source'|'mode'> {
 source:'isolated-fixture'|'native-live'|'novel-live';mode:ConversationMode;memoryDenied?:{id:string;value:string}[];
 native?:{protectedText:string;values:Record<string,string>;legacy:PresetData|null;currentInputs:FruitContext['history'];suffix?:string;factFragments?:Record<string,string>;memoryTrace?:MemoryDecision[]};
}
export interface ConversationCompilation extends Omit<FruitCompilation,'previewOnly'|'sendAllowed'|'mode'> {
 engine:'conversation-v1';origin:'native'|'third-party';mode:ConversationMode;
 status:'request-ready'|'preview-only'|'blocked';
}
export class ConversationCompileError extends Error {
 constructor(public compilation:ConversationCompilation){super('Prompt 未能编译：'+compilation.diagnostics.filter(d=>d.severity==='error').map(d=>`${d.sourceId||'配置'}：${d.message}`).join('；'));}
}
const dispatchable=new WeakSet<ConversationCompilation>();
export function requestMessages(result:ConversationCompilation):{role:'system'|'user'|'assistant';content:string}[]{
 if(!dispatchable.has(result)||result.status!=='request-ready'||!result.valid)throw new ConversationCompileError(result);
 return result.messages.map(({role,content})=>({role,content}));
}
export function promptStructure(result:ConversationCompilation){
 return {engine:result.engine,mode:result.mode,status:result.status,messages:result.messages.map((m,index)=>({order:index+1,role:m.role,source:m.sourceId==='current-input'?'本轮用户输入':m.marker==='chatHistory'?'有效历史':m.sourceId.startsWith('legacy:')?'旧附加预设':m.sourceId.startsWith('preset:')?'预设条目（用户配置）':m.sourceId.startsWith('custom:')?'自建规则':result.origin==='third-party'?'预设条目与授权上下文':'原生上下文与规则'})),diagnostics:result.diagnostics.map(d=>({code:d.code,severity:d.severity})),protocol:'编译保留角色；代理转换未经验证，Puppy 的 System 降级风险仍未解决'};
}
function prepareNativePreset(preset:FruitPreset,context:ConversationContext):FruitPreset {
 const legacy=context.native?.legacy;if(!legacy)return preset;
 const prompts=[...preset.prompts],order=preset.order.filter(e=>e.identifier!=='chatHistory');
 const index=preset.order.findIndex(e=>e.identifier==='chatHistory'),entries:{identifier:string;enabled:boolean}[]=[];let inserted=false;
 for(const [i,p]of legacy.prompts.entries()){
  if(!p.enabled)continue;
  if(p.marker){if(/chatHistory/i.test(p.identifier||'')&&!inserted){entries.push({identifier:'chatHistory',enabled:true});inserted=true;}continue;}
  if(!p.content)continue;
  const id='legacy:'+i,role=p.role==='user'||p.role==='assistant'?p.role:'system';
  prompts.push({identifier:id,name:p.name||'旧附加条目 '+(i+1),role,content:p.content,marker:false,originalEnabled:true,position:Number(p.injection_position)===1?1:0,depth:Math.max(0,Number(p.injection_depth)||0),injectionOrder:i,group:'旧附加预设',styleEntry:false});entries.push({identifier:id,enabled:true});
 }
 if(!inserted)entries.push({identifier:'chatHistory',enabled:true});
 order.splice(Math.max(0,index),0,...entries);return {...preset,prompts,order};
}
function finishNativeMessages(result:ConversationCompilation,context:ConversationContext,legacy:FruitCompiledMessage[]):void {
 // Keep the old single native prelude and legacy whole-request depth semantics.
 let count=0;while(count<result.messages.length&&result.messages[count].role==='system'&&!result.messages[count].sourceId.startsWith('legacy:')&&result.messages[count].marker!=='chatHistory'&&result.messages[count].sourceId!=='native-format')count++;
 if(count>1){const prefix=result.messages.slice(0,count);result.messages.splice(0,count,{...prefix[0],content:prefix.map(m=>m.content).join(''),sourceIds:[...new Set(prefix.flatMap(m=>[m.sourceId,...(m.sourceIds||[])]))]});}
 const suffixIndex=result.messages.findIndex(m=>m.sourceId==='native-format'),suffix=suffixIndex<0?[]:result.messages.splice(suffixIndex);
 for(const message of legacy)result.messages.splice(Math.max(1,result.messages.length-(message.depth||0)),0,message);
 result.messages.push(...suffix);
 if(context.native?.suffix)result.messages.push({role:'system',content:context.native.suffix,sourceId:'native-task-boundary',sourceName:'原生任务边界',orderIndex:result.messages.length});
 const inputs=context.native?.currentInputs||[];
 for(const input of inputs){if(input.active&&input.revisionValid&&input.knownBy.includes(context.actorId)&&input.scope===context.scope&&input.at<=context.now)result.messages.push({role:input.role,content:input.text,sourceId:'current-input',sourceName:'本轮真实用户消息',orderIndex:result.messages.length,sourceIds:[input.id]});else result.diagnostics.push({code:'input-invalid',severity:'error',message:'当前输入来源失效，未编译'});}
}

function replaceLength(text:string,length:FruitLength):string {
  return text.replace(/((?:正文(?:需求|要求|篇幅|字数|长度)?[：:\s]*(?:字数)?|需求字数|完整场面可写)[：:\s]*)[\d,，]+\s*[-–—~～至到]\s*[\d,，]+\s*字/g,`$1${length.min}–${length.max}字`).replace(/2[,.，]?200\s*[-–—~～至到]\s*2[,.，]?500\s*字/g,`${length.min}–${length.max}字`);
}
export function compileConversationPrompt(preset:FruitPreset,rawProfile:FruitProfile,context:ConversationContext,options:{purpose?:'preview'|'request';lengthOverride?:FruitLength;rng?:()=>number;format?:'native';elsewherePreset?:ElsewherePreset}={}):ConversationCompilation {
  const native=isNativePreset(preset),purpose=options.purpose||'preview',liveNovel=isLiveNovelContext(context)&&context.source==='novel-live'&&(context.mode==='meeting'||context.mode==='theatre');
  const profile=validateProfile({...rawProfile,length:options.lengthOverride||rawProfile.length});
  preset=applyFruitProfile(preset,profile);
  const result:ConversationCompilation={engine:'conversation-v1',origin:native?'native':'third-party',status:'preview-only',valid:true,mode:context.mode,length:profile.length,messages:[],diagnostics:[...preset.diagnostics],variables:{local:{},global:{}},memorySources:[],excluded:[],modelParameters:preset.modelParameters};
  if(purpose==='request'&&!(native&&context.source==='native-live')&&!(!native&&liveNovel))result.diagnostics.push({code:'request-protected',severity:'error',message:'正式请求需要受验证的原生或小说上下文，预览结果不可直接发送'});
  if(!native&&context.source!=='isolated-fixture'&&!liveNovel)result.diagnostics.push({code:'fixture-required',severity:'error',message:'第三方预设需要隔离预览或受验证的小说上下文'});
  if(purpose==='preview')result.diagnostics.push({code:'preview-only',severity:'warning',message:'这是隔离测试预览，不发送 API。正式小说另行验证真实上下文、任务和输出；完整语义检索与修订依赖链尚未实现。'});
  const permitted=(f:{active:boolean;revisionValid:boolean;at:number;scope:string;knownBy:string[]})=>f.active&&f.revisionValid&&f.at<=context.now&&f.scope===context.scope&&f.knownBy.includes(context.actorId);
  const facts=context.facts.filter(permitted).slice(0,native&&context.source==='native-live'&&context.mode==='chat'?Infinity:60),history=context.history.filter(permitted).slice(native||liveNovel?-30:-12);
  if(facts.length!==context.facts.length)result.diagnostics.push({code:'memory-filter',severity:'info',message:'部分来源因权限、时间、修订或作用域被排除；不展示被排除的内容。'});
  const markerFor=(f:typeof facts[number])=>f.marker||({identity:'charDescription',relationship:'worldInfoBefore',episodic:'worldInfoAfter',currentState:'scenario'}[f.layer]);
  const markerText=(id:string)=>facts.filter(f=>markerFor(f)===id).map(f=>`[来源 ${f.id} · ${new Date(f.at).toISOString()}]\n${f.text}`).join('\n');
  const lastUser=[...history].reverse().find(h=>h.role==='user');
  const valueSources:Record<string,string[]>={description:facts.filter(f=>markerFor(f)==='charDescription').map(f=>f.id),personality:facts.filter(f=>markerFor(f)==='charPersonality').map(f=>f.id),scenario:facts.filter(f=>markerFor(f)==='scenario').map(f=>f.id),lastusermessage:lastUser?[lastUser.id]:[]};
  const values={native_novel_rule:'采用文字小说式描写，只写自己的回应，不替对方行动。',native_output_rule:`保留当前模式身份与时间边界；目标 ${profile.length.min}–${profile.length.max} 字。${profile.style?`文风：${profile.style}`:''}`,user:context.user,char:context.char,date:new Date(context.now).toISOString().slice(0,10),time:new Date(context.now).toISOString().slice(11,16),lastusermessage:lastUser?.text||'',description:markerText('charDescription'),personality:markerText('charPersonality'),scenario:markerText('scenario'),mesexamples:context.examples.map(x=>x.text).join('\n')};
  Object.assign(values,context.native?.values);
  const resolver=new FruitMacroResolver(values,options.rng,profile.style?{'当前文风':profile.style}:{});
  if(native){
    for(const id of ['nativeContext','chatHistory'])if(profile.overrides[id]===false)result.diagnostics.push({code:'protected-marker',severity:'error',sourceId:id,message:'必要上下文不可关闭；配置保留，请恢复该 Marker'});
    preset=prepareNativePreset(preset,context);
  }
  const prompts=new Map(preset.prompts.map(p=>[p.identifier,p]));
  const relative:FruitCompiledMessage[]=[],injections:FruitCompiledMessage[]=[];
  let historyStart:number|null=null,historyCount=0;
  for(const [orderIndex,entry]of preset.order.entries()){
    const prompt=prompts.get(entry.identifier);if(!prompt)continue;
    if(native&&!nativeEntryApplies(prompt.identifier,context.mode)){result.excluded.push({id:prompt.identifier,reason:'不适用于当前原生模式'});continue;}
    if(!(Object.hasOwn(profile.overrides,entry.identifier)?profile.overrides[entry.identifier]:entry.enabled)){result.excluded.push({id:entry.identifier,reason:'当前模式已停用'});continue;}
    if(prompt.blockedReason){result.excluded.push({id:entry.identifier,reason:prompt.blockedReason});continue;}
    let reason:string|undefined,adaptedContent=prompt.content;
    if(!native&&profile.style&&prompt.styleEntry&&!/^━━/.test(prompt.name))reason='自定义文风替代原文风条目';
    if(!native&&!profile.output.auxiliary){
      if(/\bECoT\b/i.test(adaptedContent)){
        adaptedContent=adaptedContent.split(/\r?\n/).filter(line=>!/^\s*(?:-\s*)?ECoT\s*[:：]\s*(?:["'][^"']*["']|[\w-]+)\s*$/i.test(line)&&!/^\s*\*{0,2}你的回复必须以ECoT开始[。.!]*\*{0,2}\s*$/i.test(line)&&!/^\s*ECoT\s*$/i.test(line)).join('\n');
        if(/\bECoT\b/i.test(adaptedContent)){adaptedContent=prompt.content;result.diagnostics.push({code:'auxiliary-retained',severity:'warning',sourceId:prompt.identifier,message:'混合辅助要求保留作者文本与变量依赖；关闭的辅助结果不展示、不保存为消息或记忆'});}
        else result.diagnostics.push({code:'auxiliary-adapted',severity:'info',sourceId:prompt.identifier,message:'仅移除辅助文本要求，正文语言与其他格式要求保留'});
      }
    }
    if(!native&&!profile.output.summary&&(/摘要/.test(prompt.name)||/<meow_FM>/i.test(prompt.content)))reason='当前模式关闭摘要';
    if(!native&&!profile.output.characters&&(/角色表|选择器/.test(prompt.name)||/<(?:profile|branches)>/i.test(prompt.content)))reason='当前模式关闭人物辅助信息/选项';
    if(!native&&!profile.output.scene&&(/状态栏|题记|序言/.test(prompt.name)||/<(?:status_bar|prologue|novel_header)>/i.test(prompt.content)))reason='当前模式关闭场景辅助块';
    if(reason?.startsWith('当前模式关闭')&&/<content\b/i.test(adaptedContent)){
      result.diagnostics.push({code:'mixed-output-retained',severity:'warning',sourceId:prompt.identifier,message:'保留混合正文格式规则；关闭的辅助块由输出解析层丢弃'});reason=undefined;
    }
    if(reason){result.excluded.push({id:entry.identifier,reason});continue;}
    const source={sourceId:prompt.identifier,sourceName:prompt.name,orderIndex};
    if(prompt.marker){
      if(native&&prompt.identifier==='nativeContext'){
        if(context.native)relative.push({role:'system',content:context.native.protectedText,...source,marker:prompt.identifier,sourceIds:facts.filter(f=>context.native?.factFragments?.[f.id]&&context.native.protectedText.includes(context.native.factFragments[f.id])).map(f=>f.id)});
        else for(const id of ['personaDescription','charDescription','charPersonality','worldInfoBefore','worldInfoAfter','scenario']){const content=markerText(id);if(content)relative.push({role:'system',content,...source,marker:id,sourceIds:facts.filter(f=>markerFor(f)===id).map(f=>f.id)});}
        continue;
      }
      if(!(FRUIT_MARKERS as readonly string[]).includes(prompt.identifier)){result.diagnostics.push({code:'marker-unsupported',severity:'error',sourceId:prompt.identifier,message:'未知 Marker，未编译'});continue;}
      if(prompt.identifier==='chatHistory'){
        historyStart=relative.length;historyCount=history.length;
        relative.push(...history.map(h=>({role:h.role,content:h.text,...source,marker:prompt.identifier,sourceIds:[h.id]})));
      }else if(prompt.identifier==='dialogueExamples')relative.push(...context.examples.slice(0,4).map(h=>({role:h.role,content:h.text,...source,marker:prompt.identifier})));
      else {
        const content=markerText(prompt.identifier);
        if(content)relative.push({role:prompt.role,content,...source,marker:prompt.identifier,sourceIds:facts.filter(f=>markerFor(f)===prompt.identifier).map(f=>f.id)});
        else result.diagnostics.push({code:'marker-empty',severity:'info',sourceId:prompt.identifier,message:'该 Marker 的授权上下文为空，未注入其他来源补足'});
      }
      continue;
    }
    if(prompt.position!==0&&prompt.position!==1){result.diagnostics.push({code:'injection-unsupported',severity:'error',sourceId:prompt.identifier,message:'注入位置不支持，未编译'});continue;}
    const snapshot=resolver.snapshot();
    try{
      const expanded=resolver.resolve(native?adaptedContent:replaceLength(adaptedContent,profile.length));
      const content=prompt.identifier.startsWith('legacy:')?expanded:expanded.trim();
      if(!content)continue;
      if((prompt.identifier.startsWith('legacy:')||prompt.identifier.startsWith('custom:')||typeof profile.edits?.[prompt.identifier]?.content==='string')){
        for(const conflict of memoryRuleConflicts(content,context.memoryDenied||[]))result.diagnostics.push({code:'memory-config-conflict',severity:'error',sourceId:prompt.identifier,message:`该条目与当前有效的用户纠正 ${conflict} 冲突；配置和用户消息保留，请核对条目。`});
      }
      const sourceIds=[...new Set([...resolver.referencedValues()].flatMap(key=>valueSources[key]||[]))];
      const message:FruitCompiledMessage={role:prompt.role,content,...source,sourceIds};
      if(prompt.position===1)injections.push({...message,depth:prompt.depth,injectionOrder:prompt.injectionOrder});else relative.push(message);
    }catch(e){resolver.restore(snapshot);result.excluded.push({id:prompt.identifier,reason:'宏未完整解析'});result.diagnostics.push({code:e instanceof FruitMacroError?e.code:'macro-error',severity:'error',sourceId:prompt.identifier,message:e instanceof Error?e.message:'宏处理失败'});}
  }
  const buckets=new Map<number,FruitCompiledMessage[]>();
  const priority={user:0,assistant:1,system:2};
  const legacyInjections=native?injections.filter(m=>m.sourceId.startsWith('legacy:')):[];
  const standardInjections=injections.filter(m=>!legacyInjections.includes(m));
  if(standardInjections.length&&historyStart===null)result.diagnostics.push({code:'history-marker-required',severity:'error',message:'深度注入需要已启用的 Chat History Marker；未将条目随意追加到尾部'});
  else for(const message of standardInjections){
    const index=(historyStart||0)+Math.max(0,historyCount-(message.depth||0));const bucket=buckets.get(index)||[];bucket.push(message);buckets.set(index,bucket);
    if((message.depth||0)>historyCount)result.diagnostics.push({code:'depth-clamped',severity:'warning',sourceId:message.sourceId,message:'测试历史短于注入深度，限定到该历史块开头；不是全量聊天历史'});
  }
  for(let i=0;i<=relative.length;i++){
    const bucket=buckets.get(i)||[];bucket.sort((a,b)=>priority[a.role]-priority[b.role]||(a.injectionOrder||0)-(b.injectionOrder||0)||a.orderIndex-b.orderIndex);
    result.messages.push(...bucket);if(i<relative.length)result.messages.push(relative[i]);
  }
  if(native)finishNativeMessages(result,context,legacyInjections);
  if(native&&options.elsewherePreset&&(context.mode==='meeting'||context.mode==='theatre')){
    const p=validateElsewherePreset(options.elsewherePreset);
    const entries=p.entries.filter(e=>e.enabled&&e.content.trim()).map((e,index)=>({role:e.role,content:e.content,sourceId:'preset:'+p.id+':'+e.id,sourceName:e.name,orderIndex:index}));
    for(const e of entries)for(const conflict of memoryRuleConflicts(e.content,context.memoryDenied||[]))result.diagnostics.push({code:'memory-config-conflict',severity:'error',sourceId:e.sourceId,message:'预设条目与用户已确认纠正冲突：'+conflict});
    const index=result.messages.findIndex(m=>m.marker==='chatHistory'||m.sourceId==='native-format'||m.sourceId==='current-input');
    result.messages.splice(index<0?result.messages.length:index,0,...entries);
  }
  const guard=`Elsewhere ${context.mode==='meeting'?'Meeting Novel：保留真实 Canon 与当前人生连续性':'Theatre Performance：仅当前剧本和戏内身份，禁止演员私密知识进入戏内，戏内事件不改写演员 Canon'}。只使用已授权的来源，不将推测写成正式事实。正文以 <content> 包裹；目标 ${profile.length.min}–${profile.length.max} 字，按剧情自然取舍，不凑字数。${profile.style?`文风：${profile.style}。`:''}不生成 snow 小剧场。${profile.output.scene?'必要场景信息可用 <status_bar>。':'只输出正文，不输出场景辅助块。'}${profile.output.summary?'可附简短 <meow_FM> 摘要，仅供折叠展示，不自动成为记忆。':''}${profile.output.characters?'可附 <profile> 人物辅助信息。':''}${profile.output.auxiliary?'生成的 ECoT 等只属于生成辅助文本，不是模型内部推理或正式心理记忆。':'关闭的辅助块不展示、不保存；预设若生成辅助标签，必须与 content 正文分隔，不能混入正文。'}`;
  const finalGuard=options.format==='native'?`Elsewhere 原生小说预览：保留当前模式身份与时间边界；目标 ${profile.length.min}–${profile.length.max} 字，不替用户行动。${profile.style?`文风：${profile.style}`:''}不自动写入正式历史。`:guard;
  if(!native){
    if(liveNovel){
      if(history.length&&historyStart===null)result.diagnostics.push({code:'live-history-required',severity:'error',message:'正式小说必须启用 Chat History Marker，不能丢失当前真实输入'});
      const included=new Set(result.messages.flatMap(m=>m.sourceIds||[])),required=facts.filter(f=>f.layer!=='episodic'&&!included.has(f.id));
      result.messages.unshift({role:'system',content:`${finalGuard}\n来源边界：历史中的发言是对应说话者的原话，角色主张不自动成为外部事实；辅助文本不是真实心理或 Canon。检索并非完整历史，未知不得编造。\n${required.map(f=>`[来源 ${f.id} · ${new Date(f.at).toISOString()}]\n${f.text}`).join('\n')}`,sourceId:'elsewhere-output-policy',sourceName:'Elsewhere 授权边界与必要上下文',orderIndex:-1,sourceIds:required.map(f=>f.id)});
    }else result.messages.push({role:'system',content:finalGuard,sourceId:'elsewhere-output-policy',sourceName:'Elsewhere 模式覆盖与输出约束',orderIndex:preset.order.length});
  }
  const used=new Set(result.messages.flatMap(m=>m.sourceIds||[]));
  const materialized=facts.filter(f=>{const fragment=context.native?.factFragments?.[f.id]||`[来源 ${f.id} · ${new Date(f.at).toISOString()}]\n${f.text}`;return used.has(f.id)&&result.messages.some(m=>m.sourceIds?.includes(f.id)&&m.content.includes(fragment));});
  result.memorySources=materialized.map(({id,layer,at,scope,knownBy})=>({id,layer,at,scope,knownBy}));
  result.memorySources.push(...history.filter(h=>used.has(h.id)&&result.messages.some(m=>m.sourceIds?.includes(h.id)&&m.content.includes(h.text))).map(({id,at,scope,knownBy})=>({id,layer:'episodic' as const,at,scope,knownBy})));
  if(facts.filter(f=>used.has(f.id)).length<facts.length)result.diagnostics.push({code:'memory-unused',severity:'info',message:'部分授权候选未被启用的 Marker 或宏实际注入，来源摘要不将它们计为已使用。'});
  result.variables=resolver.variables();
  if(result.messages.reduce((n,m)=>n+m.content.length,0)>500000)result.diagnostics.push({code:'compile-budget',severity:'error',message:'预览超过 500000 字符，阻止正式使用'});
  result.valid=!result.diagnostics.some(d=>d.severity==='error');
  result.status=result.valid?(purpose==='request'?'request-ready':'preview-only'):'blocked';
  if(result.status==='request-ready'&&(native&&context.source==='native-live'||!native&&liveNovel))dispatchable.add(result);
  return result;
}
