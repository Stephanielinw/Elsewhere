import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeLifeJournal,lifeQuotaAvailable,type LifeTask} from './autonomousLife';

const hour=3600000,at=Date.parse('2026-11-07T07:00:00Z');
const task=(dateKey='2026-11-06',stamp=at):LifeTask=>({id:'life:actor:'+dateKey,roleId:'actor',dateKey,at:stamp,from:stamp-3*hour,to:stamp,status:'attempted'});

test('original local dates survive both timezone directions without modifying legacy receipts',()=>{
 const old=process.env.TZ;
 try{
  for(const zone of ['America/Los_Angeles','Asia/Tokyo','Pacific/Kiritimati','Etc/GMT+12']){
   process.env.TZ=zone;
   for(const date of ['2026-11-06','2026-11-07']){
    const tasks=[task(date)],bytes=JSON.stringify(tasks);
    assert.equal(decodeLifeJournal({version:1,tasks}),tasks);
    assert.equal(JSON.stringify(tasks),bytes);
   }
  }
 }finally{if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}
});

test('global timezone compatibility has exact boundaries and never accepts impossible dates',()=>{
 const midnight=Date.parse('2026-11-06T00:00:00Z');
 for(const stamp of [midnight-14*hour,midnight+36*hour-1])assert.equal(decodeLifeJournal({version:1,tasks:[task('2026-11-06',stamp)]}).length,1);
 for(const stamp of [midnight-14*hour-1,midnight+36*hour])assert.throws(()=>decodeLifeJournal({version:1,tasks:[task('2026-11-06',stamp)]}));
 for(const date of ['2026-02-30','2026-13-01','yesterday','2026-1-06'])assert.throws(()=>decodeLifeJournal({version:1,tasks:[task(date)]}));
});

test('all consumed statuses block the same role through travel, clock rollback and midnight',()=>{
 const old=process.env.TZ;
 try{
  for(const status of ['attempted','completed','quiet','failed','cancelled'] as const){
   const receipt={...task(),status};
   for(const zone of ['Asia/Tokyo','Pacific/Kiritimati','Etc/GMT+12','America/Los_Angeles']){
    process.env.TZ=zone;
    for(const now of [at-2*hour,at,at+hour,at+23*hour])assert.equal(lifeQuotaAvailable([receipt],'actor',now),false);
   }
  }
 }finally{if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}
});

test('calendar compatibility does not extend or refund rolling application quotas',()=>{
 const old=process.env.TZ;
 try{
  process.env.TZ='Asia/Tokyo';
  const a=task(),b={...task('2026-11-07'),id:'life:second:2026-11-07',roleId:'second',status:'failed' as const};
  assert.equal(lifeQuotaAvailable([a,b],'third',at+23*hour),false);
  assert.equal(lifeQuotaAvailable([a,b],'actor',at+25*hour),true);
 }finally{if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}
});

test('DST transitions use elapsed time and keep original dates and IDs',()=>{
 for(const stamp of ['2026-03-08T09:30:00Z','2026-11-01T08:30:00Z']){
  const date=stamp.slice(0,10),receipt=task(date,Date.parse(stamp));
  assert.equal(decodeLifeJournal({version:1,tasks:[receipt]})[0],receipt);
  assert.equal(lifeQuotaAvailable([receipt],'actor',receipt.at+hour),false);
 }
});

test('malformed identity, timestamps, duplicate records and status still fail closed',()=>{
 for(const change of [{id:'forged'},{roleId:'other'},{at:Infinity},{from:at+1},{to:at+1},{status:'ready'},{dateKey:null}]){
  assert.throws(()=>decodeLifeJournal({version:1,tasks:[{...task(),...change}]}));
 }
 assert.throws(()=>decodeLifeJournal({version:1,tasks:[task(),task()]}));
});
