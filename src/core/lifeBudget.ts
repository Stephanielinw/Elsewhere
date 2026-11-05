import {decodeLifeJournal,lifeQuotaAvailable,type LifeTask} from './autonomousLife';

const database='elsewhere-life-budget-v1',store='journal',key='current';
function openBudget():Promise<IDBDatabase> {
 return new Promise((resolve,reject)=>{
  if(typeof indexedDB==='undefined'){reject(Error('此浏览器无法可靠保存生活额度，自动推进已暂停'));return;}
  let settled=false;
  const request=indexedDB.open(database,1),timer=setTimeout(()=>fail(),5000);
  function fail(){if(settled)return;settled=true;clearTimeout(timer);reject(Error('生活额度存储不可用，未发送请求'));}
  request.onupgradeneeded=()=>request.result.createObjectStore(store);
  request.onblocked=fail;request.onerror=fail;
  request.onsuccess=()=>{const db=request.result;if(settled){db.close();return;}settled=true;clearTimeout(timer);db.onversionchange=()=>db.close();resolve(db);};
 });
}
/** The receipt is never removed or refunded, even if the page closes before fetch. */
async function accessBudget(prior:LifeTask[],candidate?:LifeTask):Promise<{tasks:LifeTask[];claimed:boolean}> {
 for(const task of prior)decodeLifeJournal({version:1,tasks:[task]});
 prior=[...new Map(prior.map(t=>[t.id,t])).values()];
 if(candidate)decodeLifeJournal({version:1,tasks:[candidate]});
 const db=await openBudget();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction(store,'readwrite',{durability:'strict'}),journal=tx.objectStore(store),request=journal.get(key);
  let result:{tasks:LifeTask[];claimed:boolean}|undefined,reason='生活额度事务未完成，未发送请求';
  const timer=setTimeout(()=>{try{tx.abort();}catch{}reject(Error(reason));},5000);
  request.onsuccess=()=>{
   try{
    const saved=decodeLifeJournal(request.result),tasks=[...new Map([...prior,...saved].map(t=>[t.id,t])).values()];
    const claimed=!!candidate&&lifeQuotaAvailable(tasks,candidate.roleId,candidate.at);
    if(claimed)tasks.push(structuredClone(candidate!));
    journal.put({version:1,tasks},key);result={tasks,claimed};
   }catch{reason='生活额度记录不可验证，自动推进已暂停';tx.abort();}
  };
  tx.oncomplete=()=>{clearTimeout(timer);if(result)resolve(result);else reject(Error(reason));};
  tx.onabort=tx.onerror=()=>{clearTimeout(timer);reject(Error(reason));};
 });}finally{db.close();}
}
export async function syncLifeBudget(prior:LifeTask[]):Promise<LifeTask[]> {return (await accessBudget(prior)).tasks;}
export async function reserveLifeAttempt(task:LifeTask,prior:LifeTask[]):Promise<boolean> {return (await accessBudget(prior,task)).claimed;}
