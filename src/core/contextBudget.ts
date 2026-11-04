// Local planning estimate, not a provider tokenizer; never use it to discard Canon or identity corrections.
export function estimateTextTokens(text:string):number {
 const han=text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu)?.length||0;
 return Math.ceil(han*1.2+new TextEncoder().encode(text.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu,'')).length/4);
}
function memoryTerms(query:string):string[] {
 const terms=new Set<string>(),normalized=query.normalize('NFKC').toLowerCase();
 for(const run of normalized.match(/[\p{Script=Han}]+/gu)||[])for(let i=0;i<run.length-1;i++)terms.add(run.slice(i,i+2));
 for(const word of normalized.replace(/[\p{Script=Han}]/gu,' ').match(/[\p{L}\p{N}]{3,}/gu)||[])terms.add(word);
 return [...terms].slice(0,64);
}
export function memoryRelevance(text:string,query:string):number {
 const value=text.normalize('NFKC').toLowerCase();return memoryTerms(query).reduce((n,term)=>n+Number(value.includes(term)),0);
}
export const asksPastExperience=(query:string)=>/记得|那次|上次|当时|曾经|回忆|过去|说过|原话|remember|last time|previous/i.test(query);
/** An extract remains attributed original text, never an invented factual summary. */
export function memoryExcerpt(text:string,query:string,budget=90):string {
 if(estimateTextTokens(text)<=budget)return text;
 const sentences=text.match(/[^。！？.!?\n]+[。！？.!?\n]*|[。！？.!?\n]+/gu)||[text];
 let best=0;for(let i=1;i<sentences.length;i++)if(memoryRelevance(sentences[i],query)>memoryRelevance(sentences[best],query))best=i;
 let excerpt=sentences[best];
 if(best>0&&estimateTextTokens(sentences[best-1]+excerpt)<=budget)excerpt=sentences[best-1]+excerpt;
 if(estimateTextTokens(excerpt)>budget){
  const chars=Array.from(excerpt),radius=Math.max(8,Math.floor(budget/2.4));
  const positions=memoryTerms(query).flatMap(term=>{const i=excerpt.toLowerCase().indexOf(term);return i<0?[]:[Array.from(excerpt.slice(0,i)).length];});
  const center=positions.sort((a,b)=>memoryRelevance(chars.slice(Math.max(0,b-radius),b+radius).join(''),query)-memoryRelevance(chars.slice(Math.max(0,a-radius),a+radius).join(''),query))[0]||0;
  const start=Math.max(0,center-Math.floor(radius/2));let lo=0,hi=chars.length-start;
  while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(estimateTextTokens(chars.slice(start,start+mid).join(''))<=budget)lo=mid;else hi=mid-1;}excerpt=chars.slice(start,start+lo).join('');
 }
 return '〔原文节选〕'+excerpt+'〔节选结束〕';
}
export function selectMemoryItems<T>(items:T[],text:(item:T)=>string,budget:number,count:number):T[] {
 let used=0;const selected:T[]=[];
 for(const item of items){const cost=estimateTextTokens(text(item));if(used+cost>budget)continue;selected.push(item);used+=cost;if(selected.length===count)break;}
 return selected;
}
