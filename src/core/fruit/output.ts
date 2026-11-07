import {readNovelSections} from '../novelDocument';
/** All returned sections are untrusted plain text, never HTML or canonical memory. */
export function parseFruitOutput(raw:string) {
  if(raw.length>500000)throw new Error('输出超出 500000 字符解析限制');
  // ASCII folding preserves offsets even when text contains Unicode such as İ.
  const ascii=(value:string)=>value.replace(/[A-Z]/g,c=>c.toLowerCase());
  function withoutBlock(input:string,tag:string){
   const lower=ascii(input),parts:string[]=[];let cursor=0,depth=0,found=false;
   while(cursor<input.length){
    const start=lower.indexOf('<',cursor);
    if(start<0){if(!depth)parts.push(input.slice(cursor));break;}
    if(!depth)parts.push(input.slice(cursor,start));
    const closing=lower.startsWith('</'+tag,start),opening=lower.startsWith('<'+tag,start),prefix=tag.length+(closing?2:1);
    if((!closing&&!opening)||!/[\s/>]/.test(lower[start+prefix]||'')){
      if(!depth)parts.push('<');cursor=start+1;continue;
    }
    found=true;
    const end=lower.indexOf('>',start+prefix);if(end<0)break;
    if(closing)depth=Math.max(0,depth-1);else if(lower[end-1]!=='/')depth++;
    cursor=end+1;
   }
   return {text:parts.join(''),found};
  }
  const snow=withoutBlock(raw,'snow'),generated= snow.text;
  let text=withoutBlock(generated,'ecot').text;
  for(const tag of ['think','thinking','analysis','reasoning','chain_of_thought'])text=withoutBlock(text,tag).text;
  const read=(tag:string,input=text)=>{
    const folded=ascii(input);
    const open=`<${ascii(tag)}>`,close=`</${ascii(tag)}>`;
    const start=folded.indexOf(open);if(start<0)return '';
    const end=folded.indexOf(close,start+open.length);return end<0?'':input.slice(start+open.length,end).trim();
  };
  const parsed=readNovelSections(text);
  let sections=parsed.sections,copyText='';
  if(parsed.invalid){
   // Preserve only complete top-level bodies preceding a malformed optional suffix.
   let cursor=0,count=0;const folded=ascii(text);const recovered:typeof sections=[],completeBodies:string[]=[];
   while(cursor<text.length){
    const open=text.indexOf('<',cursor);if(open<0)break;
    const match=text.slice(open).match(/^<(content|novel_header|status_bar|prologue|角色状态面板|meow_fm|profile|branches)>/i);if(!match){if(!/^<\/?(?:novel_header|status_bar|prologue|角色状态面板|meow_fm|profile|branches)(?:[\s/>]|$)/i.test(text.slice(open)))recovered.length=0;break;}
    const tag=ascii(match[1]),close='</'+tag+'>',end=folded.indexOf(close,open+match[0].length);if(end<0){if(tag==='content')recovered.length=0;break;}
    if(++count>256){recovered.length=0;break;}
    const body=text.slice(open+match[0].length,end).trim();
    if(tag==='content'){if(/<\/?[\p{L}][^>]*(?:>|$)/u.test(body)){recovered.length=0;break;}recovered.push({type:'content',text:body});completeBodies.push(body);}
    cursor=end+close.length;
   }
   sections=recovered;copyText=completeBodies.join('\n\n');
  }
  if(!parsed.invalid&&!sections.length&&text.trim()&&!/<\/?[\p{L}][^>]*(?:>|$)/u.test(text))sections=[{type:'content',text:text.trim()}];
  const content=sections.filter(s=>s.type==='content').map(s=>s.text).join('\n\n');
  return {content,safeText:content||copyText||(text.trim().match(/^<content>([^<]+)$/i)?.[1].trim()||''),sections,scene:read('status_bar')||read('prologue')||read('novel_header')||read('角色状态面板'),summary:read('meow_FM'),characters:read('profile'),choices:read('branches'),generatedAuxiliary:read('ECoT',generated),snowDiscarded:snow.found,memoryEligible:false as const,
    diagnostics:content?(parsed.invalid?['optional-format-recovered']:[]):['未找到完整 content 正文标签；不将全段 HTML 当正文渲染']};
}
