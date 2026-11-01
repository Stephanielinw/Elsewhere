import type {SystemLogRecord} from './types';
import {toLocalDateKey} from './diary';
export function logsForDay(logs:readonly SystemLogRecord[],dateKey:string):SystemLogRecord[]{
 return logs.map((log,index)=>({log,index})).filter(v=>Number.isFinite(v.log.at)&&toLocalDateKey(v.log.at)===dateKey).sort((a,b)=>b.log.at-a.log.at||b.index-a.index).map(v=>v.log);
}
export function logDays(logs:readonly SystemLogRecord[],at:number):string[]{
 return [...new Set([toLocalDateKey(at),...logs.filter(l=>Number.isFinite(l.at)).map(l=>toLocalDateKey(l.at))])].sort().reverse();
}
export function logTimestamp(at:number):string {
 const d=new Date(at),pad=(n:number)=>String(n).padStart(2,'0');
 return `${toLocalDateKey(at)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
