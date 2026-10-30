import { applyFruitProfile } from './profile';
import { FruitMacroError, FruitMacroResolver } from './macros';
import { FRUIT_MARKERS, validateProfile } from './preset';
import type { FruitCompilation, FruitCompiledMessage, FruitContext, FruitLength, FruitPreset, FruitProfile } from './types';

function replaceLength(text:string,length:FruitLength):string {
  return text.replace(/((?:正文(?:需求|要求|篇幅|字数|长度)?[：:\s]*(?:字数)?|需求字数|完整场面可写)[：:\s]*)[\d,，]+\s*[-–—~～至到]\s*[\d,，]+\s*字/g,`$1${length.min}–${length.max}字`).replace(/2[,.，]?200\s*[-–—~～至到]\s*2[,.，]?500\s*字/g,`${length.min}–${length.max}字`);
}
export function compileFruitPrompt(preset:FruitPreset,rawProfile:FruitProfile,context:FruitContext,options:{lengthOverride?:FruitLength;rng?:()=>number;format?:'native'}={}):FruitCompilation {
  if(context.source!=='isolated-fixture')throw new Error('FRUIT-01 仅允许隔离测试上下文；尚未接入正式记忆');
  const profile=validateProfile({...rawProfile,length:options.lengthOverride||rawProfile.length});
  preset=applyFruitProfile(preset,profile);
  const result:FruitCompilation={previewOnly:true,sendAllowed:false,valid:true,mode:context.mode,length:profile.length,messages:[],diagnostics:[...preset.diagnostics],variables:{local:{},global:{}},memorySources:[],excluded:[],modelParameters:preset.modelParameters};
  result.diagnostics.push({code:'preview-only',severity:'warning',message:'隔离测试预览，不发送 API；四层目前为字段投影，语义检索与完整修订链未实现。正式接入仍受存档/修订链 P1 阻塞。'});
  const permitted=(f:{active:boolean;revisionValid:boolean;at:number;scope:string;knownBy:string[]})=>f.active&&f.revisionValid&&f.at<=context.now&&f.scope===context.scope&&f.knownBy.includes(context.actorId);
  const facts=context.facts.filter(permitted).slice(0,60),history=context.history.filter(permitted).slice(-12);
  if(facts.length!==context.facts.length)result.diagnostics.push({code:'memory-filter',severity:'info',message:'部分来源因权限、时间、修订或作用域被排除；不展示被排除的内容。'});
  const markerFor=(f:typeof facts[number])=>f.marker||({identity:'charDescription',relationship:'worldInfoBefore',episodic:'worldInfoAfter',currentState:'scenario'}[f.layer]);
  const markerText=(id:string)=>facts.filter(f=>markerFor(f)===id).map(f=>`[来源 ${f.id} · ${new Date(f.at).toISOString()}]\n${f.text}`).join('\n');
  const lastUser=[...history].reverse().find(h=>h.role==='user');
  const valueSources:Record<string,string[]>={description:facts.filter(f=>markerFor(f)==='charDescription').map(f=>f.id),personality:facts.filter(f=>markerFor(f)==='charPersonality').map(f=>f.id),scenario:facts.filter(f=>markerFor(f)==='scenario').map(f=>f.id),lastusermessage:lastUser?[lastUser.id]:[]};
  const values={user:context.user,char:context.char,date:new Date(context.now).toISOString().slice(0,10),time:new Date(context.now).toISOString().slice(11,16),lastusermessage:lastUser?.text||'',description:markerText('charDescription'),personality:markerText('charPersonality'),scenario:markerText('scenario'),mesexamples:context.examples.map(x=>x.text).join('\n')};
  const resolver=new FruitMacroResolver(values,options.rng,profile.style?{'当前文风':profile.style}:{});
  const prompts=new Map(preset.prompts.map(p=>[p.identifier,p]));
  const relative:FruitCompiledMessage[]=[],injections:FruitCompiledMessage[]=[];
  let historyStart:number|null=null,historyCount=0;
  for(const [orderIndex,entry]of preset.order.entries()){
    const prompt=prompts.get(entry.identifier);if(!prompt)continue;
    if(!(Object.hasOwn(profile.overrides,entry.identifier)?profile.overrides[entry.identifier]:entry.enabled)){result.excluded.push({id:entry.identifier,reason:'当前模式已停用'});continue;}
    if(prompt.blockedReason){result.excluded.push({id:entry.identifier,reason:prompt.blockedReason});continue;}
    let reason:string|undefined,adaptedContent=prompt.content;
    if(profile.style&&prompt.styleEntry&&!/^━━/.test(prompt.name))reason='自定义文风替代原文风条目';
    if(!profile.output.auxiliary){
      if(/COT|思考约束/i.test(prompt.name))reason='当前模式不请求生成辅助思考文本';
      else if(/\bECoT\b/i.test(adaptedContent)){
        adaptedContent=adaptedContent.split(/\r?\n/).filter(line=>!/^\s*(?:-\s*)?ECoT\s*[:：]\s*(?:["'][^"']*["']|[\w-]+)\s*$/i.test(line)&&!/^\s*\*{0,2}你的回复必须以ECoT开始[。.!]*\*{0,2}\s*$/i.test(line)&&!/^\s*ECoT\s*$/i.test(line)).join('\n');
        if(/\bECoT\b/i.test(adaptedContent)){reason='混合辅助输出要求尚不能可靠拆分；保留原件，不编译该条目';result.diagnostics.push({code:'auxiliary-unsupported',severity:'error',sourceId:prompt.identifier,message:reason});}
        else result.diagnostics.push({code:'auxiliary-adapted',severity:'info',sourceId:prompt.identifier,message:'仅移除辅助文本要求，正文语言与其他格式要求保留'});
      }
    }
    if(!profile.output.summary&&(/摘要/.test(prompt.name)||/<meow_FM>/i.test(prompt.content)))reason='当前模式关闭摘要';
    if(!profile.output.characters&&(/角色表|选择器/.test(prompt.name)||/<(?:profile|branches)>/i.test(prompt.content)))reason='当前模式关闭人物辅助信息/选项';
    if(!profile.output.scene&&(/状态栏|题记|序言/.test(prompt.name)||/<(?:status_bar|prologue|novel_header)>/i.test(prompt.content)))reason='当前模式关闭场景辅助块';
    if(reason){result.excluded.push({id:entry.identifier,reason});continue;}
    const source={sourceId:prompt.identifier,sourceName:prompt.name,orderIndex};
    if(prompt.marker){
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
      const content=resolver.resolve(replaceLength(adaptedContent,profile.length)).trim();
      if(!content)continue;
      const sourceIds=[...new Set([...resolver.referencedValues()].flatMap(key=>valueSources[key]||[]))];
      const message:FruitCompiledMessage={role:prompt.role,content,...source,sourceIds};
      if(prompt.position===1)injections.push({...message,depth:prompt.depth,injectionOrder:prompt.injectionOrder});else relative.push(message);
    }catch(e){resolver.restore(snapshot);result.excluded.push({id:prompt.identifier,reason:'宏未完整解析'});result.diagnostics.push({code:e instanceof FruitMacroError?e.code:'macro-error',severity:'error',sourceId:prompt.identifier,message:e instanceof Error?e.message:'宏处理失败'});}
  }
  const buckets=new Map<number,FruitCompiledMessage[]>();
  const priority={user:0,assistant:1,system:2};
  if(injections.length&&historyStart===null)result.diagnostics.push({code:'history-marker-required',severity:'error',message:'深度注入需要已启用的 Chat History Marker；未将条目随意追加到尾部'});
  else for(const message of injections){
    const index=(historyStart||0)+Math.max(0,historyCount-(message.depth||0));const bucket=buckets.get(index)||[];bucket.push(message);buckets.set(index,bucket);
    if((message.depth||0)>historyCount)result.diagnostics.push({code:'depth-clamped',severity:'warning',sourceId:message.sourceId,message:'测试历史短于注入深度，限定到该历史块开头；不是全量聊天历史'});
  }
  for(let i=0;i<=relative.length;i++){
    const bucket=buckets.get(i)||[];bucket.sort((a,b)=>priority[a.role]-priority[b.role]||(a.injectionOrder||0)-(b.injectionOrder||0)||a.orderIndex-b.orderIndex);
    result.messages.push(...bucket);if(i<relative.length)result.messages.push(relative[i]);
  }
  const guard=`Elsewhere ${context.mode==='meeting'?'Meeting Novel：保留真实 Canon 与当前人生连续性':'Theatre Performance：仅当前剧本和戏内身份，禁止演员私密知识进入戏内，戏内事件不改写演员 Canon'}。只使用已授权的来源，不将推测写成正式事实。正文以 <content> 包裹；目标 ${profile.length.min}–${profile.length.max} 字，按剧情自然取舍，不凑字数。${profile.style?`文风：${profile.style}。`:''}不生成 snow 小剧场。${profile.output.scene?'必要场景信息可用 <status_bar>。':'只输出正文，不输出场景辅助块。'}${profile.output.summary?'可附简短 <meow_FM> 摘要，仅供折叠展示，不自动成为记忆。':''}${profile.output.characters?'可附 <profile> 人物辅助信息。':''}${profile.output.auxiliary?'生成的 ECoT 等只属于生成辅助文本，不是模型内部推理或正式心理记忆。':'不输出 ECoT、思考过程或其他辅助思考块。'}`;
  const finalGuard=options.format==='native'?`Elsewhere 原生小说预览：保留当前模式身份与时间边界；目标 ${profile.length.min}–${profile.length.max} 字，不替用户行动。${profile.style?`文风：${profile.style}`:''}不自动写入正式历史。`:guard;
  result.messages.push({role:'system',content:finalGuard,sourceId:'elsewhere-output-policy',sourceName:'Elsewhere 模式覆盖与输出约束',orderIndex:preset.order.length});
  const used=new Set(result.messages.flatMap(m=>m.sourceIds||[]));
  result.memorySources=facts.filter(f=>used.has(f.id)).map(({id,layer,at,scope,knownBy})=>({id,layer,at,scope,knownBy}));
  result.memorySources.push(...history.filter(h=>used.has(h.id)).map(({id,at,scope,knownBy})=>({id,layer:'episodic' as const,at,scope,knownBy})));
  if(facts.filter(f=>used.has(f.id)).length<facts.length)result.diagnostics.push({code:'memory-unused',severity:'info',message:'部分授权候选未被启用的 Marker 或宏实际注入，来源摘要不将它们计为已使用。'});
  result.variables=resolver.variables();
  if(result.messages.reduce((n,m)=>n+m.content.length,0)>500000)result.diagnostics.push({code:'compile-budget',severity:'error',message:'预览超过 500000 字符，阻止正式使用'});
  result.valid=!result.diagnostics.some(d=>d.severity==='error');
  return result;
}
