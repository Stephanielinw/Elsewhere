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
  const text=withoutBlock(generated,'ecot').text;
  const read=(tag:string,input=text)=>{
    const folded=ascii(input);
    const open=`<${ascii(tag)}>`,close=`</${ascii(tag)}>`;
    const start=folded.indexOf(open);if(start<0)return '';
    const end=folded.indexOf(close,start+open.length);return end<0?'':input.slice(start+open.length,end).trim();
  };
  const parsed=readNovelSections(text),sections=parsed.sections;
  const content=sections.filter(s=>s.type==='content').map(s=>s.text).join('\n\n');
  return {content,sections,scene:read('status_bar')||read('prologue')||read('novel_header')||read('角色状态面板'),summary:read('meow_FM'),characters:read('profile'),choices:read('branches'),generatedAuxiliary:read('ECoT',generated),snowDiscarded:snow.found,memoryEligible:false as const,
    diagnostics:content?[]:['未找到完整 content 正文标签；不将全段 HTML 当正文渲染']};
}
