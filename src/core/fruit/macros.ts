export class FruitMacroError extends Error {
  constructor(public code: string,message: string){super(message);}
}
interface Expanded { text: string; references: Set<string> }
const union=(sets:Iterable<Set<string>>)=>new Set([...sets].flatMap(s=>[...s]));
export class FruitMacroResolver {
  private local=new Map<string,string>();
  private global=new Map<string,string>();
  private localRefs=new Map<string,Set<string>>();
  private globalRefs=new Map<string,Set<string>>();
  private lastRefs=new Set<string>();
  private operations=0;
  private visitedChars=0;
  private emittedChars=0;
  constructor(private values:Record<string,string>,private rng:()=>number=Math.random,private overrides:Record<string,string>={}){for(const [key,value]of Object.entries(overrides))this.local.set(key,value);}
  snapshot(){return {local:new Map(this.local),global:new Map(this.global),localRefs:new Map(this.localRefs),globalRefs:new Map(this.globalRefs)};}
  restore(snapshot:ReturnType<FruitMacroResolver['snapshot']>){this.local=new Map(snapshot.local);this.global=new Map(snapshot.global);this.localRefs=new Map(snapshot.localRefs);this.globalRefs=new Map(snapshot.globalRefs);}
  variables(){return {local:Object.fromEntries(this.local),global:Object.fromEntries(this.global)};}
  referencedValues(){return new Set(this.lastRefs);}
  resolve(input:string):string {
    const value=this.expand(input,0);this.emittedChars+=value.text.length;
    if(this.emittedChars>500000)throw new FruitMacroError('macro-budget','整次编译文本超出安全限制');
    this.lastRefs=value.references;return value.text;
  }
  private expand(input:string,level:number):Expanded {
    this.visitedChars+=input.length;
    if(level>32||input.length>500000||this.visitedChars>1000000)throw new FruitMacroError('macro-budget','宏嵌套或文本超出安全限制');
    let output='',cursor=0;const outputRefs=new Set<string>();
    while(cursor<input.length){
      const start=input.indexOf('{{',cursor);
      if(start<0){output+=input.slice(cursor);break;}
      output+=input.slice(cursor,start);
      let depth=1,end=start+2;
      for(;end<input.length&&depth;end++){
        if(input.startsWith('{{',end)){depth++;end++;}
        else if(input.startsWith('}}',end)){depth--;if(depth)end++;}
      }
      if(depth)throw new FruitMacroError('macro-syntax','宏缺少闭合 }}');
      const body=input.slice(start+2,end-1);cursor=end+1;
      if(++this.operations>10000)throw new FruitMacroError('macro-budget','宏求值数量超出安全限制');
      if(body.trimStart().startsWith('//'))continue;
      const parts:string[]=[];let partStart=0,nesting=0;
      for(let i=0;i<body.length;i++){
        if(body.startsWith('{{',i)){nesting++;i++;}
        else if(body.startsWith('}}',i)){nesting--;i++;}
        else if(!nesting&&body.startsWith('::',i)){parts.push(body.slice(partStart,i));partStart=i+2;i++;}
      }
      parts.push(body.slice(partStart));
      let head=parts.shift()?.trim()||'';
      if(!parts.length&&/^(?:getvar|getglobalvar)\s+/i.test(head)){const split=head.indexOf(' ');parts.push(head.slice(split+1));head=head.slice(0,split);}
      const name=head.toLowerCase();
      if(name==='trim'&&!parts.length){output=output.replace(/[\r\n]+$/,'');while(/[\r\n]/.test(input[cursor]||' '))cursor++;continue;}
      const expanded=parts.map(p=>this.expand(p,level+1)),args=expanded.map(p=>p.text);
      let references=union(expanded.map(x=>x.references)),value:string;
      if(name==='setvar'||name==='setglobalvar'){
        if(args.length<2)throw new FruitMacroError('macro-syntax',`${name} 需要名称和值`);
        const key=args[0].trim();if(!key||key.length>200||['__proto__','constructor','prototype'].includes(key))throw new FruitMacroError('macro-syntax','变量名称无效');
        value=args.slice(1).join('::');
        if(/snow|小剧场/i.test(key)){value='';references=new Set();}
        if(Object.hasOwn(this.overrides,key)){value=this.overrides[key];references=new Set();}
        (name==='setvar'?this.local:this.global).set(key,value);
        (name==='setvar'?this.localRefs:this.globalRefs).set(key,new Set(references));
        value='';references=new Set();
      }else if(name==='getvar'||name==='getglobalvar'){
        const key=args[0]?.trim()||'',map=name==='getvar'?this.local:this.global;
        if(args.length!==1||!map.has(key))throw new FruitMacroError('macro-variable',`变量 ${key||'（空）'} 未初始化；该条目不能编译`);
        value=map.get(key)||'';
        references=union([references,(name==='getvar'?this.localRefs:this.globalRefs).get(key)||new Set()]);
      }else if(name==='random'){
        const choices=args.length===1?args[0].split(','):args;
        if(!choices.length)throw new FruitMacroError('macro-syntax','random 需要候选值');
        const pick=this.rng();if(!Number.isFinite(pick))throw new FruitMacroError('macro-budget','随机源无效');
        const index=Math.min(choices.length-1,Math.floor(Math.max(0,Math.min(1,pick))*choices.length));
        value=choices[index];references=new Set(expanded[args.length===1?0:index]?.references||[]);
      }else if(Object.hasOwn(this.values,name)&&!args.length){value=this.values[name];references.add(name);}
      else if(['日期','时间','天气','地点','题记','之间'].includes(head)&&!args.length){value=`[由场景填写：${head}]`;}
      else throw new FruitMacroError('macro-unsupported',`不支持宏 ${head||'（空）'}；保留原件并阻断该条目`);
      output+=value;for(const ref of references)outputRefs.add(ref);
      if(output.length>500000)throw new FruitMacroError('macro-budget','宏展开文本超出安全限制');
    }
    return {text:output,references:outputRefs};
  }
}
