import type {SharedTaskItem} from './types';

export function dateDayNumber(value:string|undefined):number|null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y,m,d]=value.split('-').map(Number),date=new Date(0);
  date.setUTCFullYear(y,m-1,d);date.setUTCHours(0,0,0,0);
  return date.getUTCFullYear()===y && date.getUTCMonth()===m-1 && date.getUTCDate()===d ? date.getTime()/86400000 : null;
}
export function ddlCountdown(due:string|undefined,now:number):string {
  const target=dateDayNumber(due),today=new Date(now);
  if (target===null) return '未设截止日';
  const local=new Date(0);local.setUTCFullYear(today.getFullYear(),today.getMonth(),today.getDate());local.setUTCHours(0,0,0,0);
  const days=target-local.getTime()/86400000;
  return days===0?'今天截止':days>0?`还剩 ${days} 天`:`已逾期 ${-days} 天`;
}
export function splitTaskLists(kind:'ddl'|'todo',items:SharedTaskItem[],now:number):{current:SharedTaskItem[];completed:SharedTaskItem[]} {
  // Old completed records have no reliable completion timestamp; keep them in the archive without inventing one.
  const archived=(item:SharedTaskItem)=>item.done && (kind==='ddl' || !Number.isFinite(item.completedAt) || now-item.completedAt!>=86400000);
  const current=items.filter(item=>!archived(item)).sort((a,b)=>Number(a.done)-Number(b.done) || (kind==='ddl'?(dateDayNumber(a.due)??Infinity)-(dateDayNumber(b.due)??Infinity):0) || a.at-b.at);
  const completed=items.filter(archived).sort((a,b)=>(b.completedAt??0)-(a.completedAt??0));
  return {current,completed};
}
export function setTaskCompletion(item:SharedTaskItem,done:boolean,now:number):SharedTaskItem {
  const result={...item,done};
  if(done) result.completedAt=now;else delete result.completedAt;
  return result;
}
