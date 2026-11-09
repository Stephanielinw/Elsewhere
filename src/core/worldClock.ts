const day=86_400_000;
const days=new Map<string,{startMs:number;endMs:number;label:string;shortLabel:string}>();

export function validWorldZone(value:unknown):value is string {
 if(typeof value!=='string'||!value||value.length>100||/^[+-]/.test(value))return false;
 try{new Intl.DateTimeFormat('en',{timeZone:value});return true;}catch{return false;}
}

export function worldDate(at:number,zone:string):string {
 const parts=new Intl.DateTimeFormat('en',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(at);
 const part=(name:string)=>parts.find(p=>p.type===name)!.value;
 return [part('year'),part('month'),part('day')].join('-');
}

export function worldDay(key:string,zone:string) {
 const cacheKey=zone+'|'+key,existing=days.get(cacheKey);if(existing)return existing;
 const target=Date.parse(key+'T00:00:00Z');
 if(!Number.isFinite(target)||new Date(target).toISOString().slice(0,10)!==key)throw Error('世界日期无效');
 const find=(key:string,center:number)=>{
  let low=center-day,high=center+day;
  while(low<high){
   const middle=Math.floor((low+high)/2);
   if(worldDate(middle,zone)<key)low=middle+1;else high=middle;
  }
  return low;
 };
 const next=new Date(target+day).toISOString().slice(0,10);
 const startMs=find(key,target),endMs=find(next,target+day)-1;
 if(startMs>endMs)throw Error('世界日期不存在');
 const date=new Date(target),weekdays=['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
 const shortLabel=`${date.getUTCMonth()+1}月${date.getUTCDate()}日`;
 const result={startMs,endMs,label:`${date.getUTCFullYear()}年${shortLabel} · ${weekdays[date.getUTCDay()]}`,shortLabel};
 if(days.size>=80)days.clear();
 days.set(cacheKey,result);return result;
}

export function worldHour(at:number,zone:string):string {
 return new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'shortOffset'}).format(at);
}
