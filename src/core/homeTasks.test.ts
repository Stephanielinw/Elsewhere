import test from 'node:test';
import assert from 'node:assert/strict';
import {ddlCountdown,splitTaskLists,setTaskCompletion} from './homeTasks';
import type {SharedTaskItem} from './types';
const item=(id:string,extra:Partial<SharedTaskItem>={}):SharedTaskItem=>({id,text:id,done:false,at:1,...extra});

test('DDL countdown uses local calendar days through midnight, DST and overdue dates',()=>{
  assert.equal(ddlCountdown('2026-11-06',new Date(2026,10,1,23,59).getTime()),'还剩 5 天');
  assert.equal(ddlCountdown('2026-11-01',new Date(2026,10,1,23,59).getTime()),'今天截止');
  assert.equal(ddlCountdown('2026-10-30',new Date(2026,10,1).getTime()),'已逾期 2 天');
  assert.equal(ddlCountdown('2026-11-02',new Date(2026,10,1,0,1).getTime()),'还剩 1 天');
  assert.equal(ddlCountdown('2026-03-09',new Date(2026,2,8,0,1).getTime()),'还剩 1 天');
  assert.equal(ddlCountdown('2026-03-09',new Date(2026,2,9).getTime()),'今天截止');
  assert.equal(ddlCountdown('2026-02-30',0),'未设截止日');
});
test('DDL archives only completed records and retains original due and completion time',()=>{
  const a=item('overdue',{due:'2020-01-01'}),b=setTaskCompletion(item('done',{due:'2026-11-01'}),true,1000);
  const result=splitTaskLists('ddl',[b,a],1001);
  assert.deepEqual(result.current.map(x=>x.id),['overdue']);
  assert.equal(result.completed[0].due,'2026-11-01');assert.equal(result.completed[0].completedAt,1000);
});
test('To-do leaves completed records visible for exactly 24 elapsed hours including reload',()=>{
  const done=setTaskCompletion(item('a'),true,1000),stored=JSON.parse(JSON.stringify([done]));
  assert.equal(splitTaskLists('todo',stored,86400999).current.length,1);
  assert.equal(splitTaskLists('todo',stored,86401000).completed.length,1);
  assert.equal(stored.length,1);assert.equal(stored[0].completedAt,1000);
  const undone=setTaskCompletion(done,false,2000);assert.equal(undone.done,false);assert.equal(undone.completedAt,undefined);
  assert.equal(splitTaskLists('todo',[undone],999999999).current.length,1);
  assert.equal(setTaskCompletion(undone,true,3000).completedAt,3000);
});
test('legacy completed data is preserved without inventing a completion date',()=>{
  const old=item('legacy',{done:true}),noDate=item('no-date');const before=JSON.stringify([old,noDate]);
  const result=splitTaskLists('todo',[old,noDate],5000);
  assert.equal(result.completed[0].completedAt,undefined);
  assert.deepEqual(result.current.map(x=>x.id),['no-date']);
  assert.equal(JSON.stringify([old,noDate]),before);
});
