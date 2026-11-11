/** Native fiction is plain text. Explicit hidden blocks never become visible prose. */
export function parseNativeNovelText(raw:string):string {
 if(raw.length>500000)throw Error('小说正文过长，未归档');
 let text=raw;
 for(const tag of ['think','thinking','analysis','reasoning','chain_of_thought','ecot']){
  const pattern=new RegExp('<\\/?'+tag+'(?=[\\s/>])[^>]*>','ig');
  const parts:string[]=[];let cursor=0,depth=0;
  for(const match of text.matchAll(pattern)){
   if(!depth)parts.push(text.slice(cursor,match.index));
   if(match[0].startsWith('</'))depth=Math.max(0,depth-1);else if(!match[0].endsWith('/>'))depth++;
   cursor=match.index!+match[0].length;
  }
  if(!depth)parts.push(text.slice(cursor));text=parts.join('');
  text=text.replace(new RegExp('<'+tag+'(?:\\s[^>]*)?$','i'),'');
 }
 const body=/^\s*<content>\s*([\s\S]*?)\s*<\/content>\s*$/i.exec(text);
 if(body)text=body[1];
 if(/<\/?[\p{L}][^>]*(?:>|$)/u.test(text))throw Error('正文包含无法确认的格式，未归档');
 if(!text.trim())throw Error('未收到可显示的小说正文');return text.trim();
}
