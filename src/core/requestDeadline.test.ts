import assert from 'node:assert/strict';
import {test} from 'node:test';
import {startRequestDeadline} from './requestDeadline';

function deferred<T>() {
  let resolve!: (value:T)=>void;
  let reject!: (reason:Error)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}

test('a reply at the last millisecond wins and later cancellation cannot change it',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
  const read=deferred<string>();
  const request=startRequestDeadline(()=>read.promise);
  t.mock.timers.tick(89999);
  read.resolve('complete');
  assert.equal(await request.result,'complete');
  request.cancel();
  t.mock.timers.tick(1);
  assert.equal(await request.result,'complete');
});

test('absolute deadline rejects a late body even before the timer callback runs',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
  const read=deferred<string>();
  let signal!:AbortSignal;
  const request=startRequestDeadline(s=>{signal=s;return read.promise;});
  t.mock.timers.setTime(91000);
  read.resolve('too late');
  await assert.rejects(request.result,{name:'TimeoutError'});
  assert.equal(signal.aborted,true);
});

test('resuming after a throttled deadline can stop the wait without a timer tick',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
  const read=deferred<string>();
  const request=startRequestDeadline(()=>read.promise);
  t.mock.timers.setTime(91001);
  request.check();
  await assert.rejects(request.result,{name:'TimeoutError'});
  read.resolve('late body');
});

test('timer and parent cancellation settle despite a network read that ignores abort',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
  const read=deferred<string>();
  const timed=startRequestDeadline(()=>read.promise);
  t.mock.timers.tick(90000);
  await assert.rejects(timed.result,{name:'TimeoutError'});
  read.reject(Error('late network failure'));

  const parent=new AbortController();
  const pending=deferred<string>();
  const cancelled=startRequestDeadline(()=>pending.promise,parent.signal);
  pending.resolve('completion queued');
  parent.abort();
  await assert.rejects(cancelled.result,{name:'AbortError'});
  t.mock.timers.tick(90000);
  await assert.rejects(cancelled.result,{name:'AbortError'});

  let reads=0;
  const unsent=startRequestDeadline(async()=>{reads++;return '';},parent.signal);
  await assert.rejects(unsent.result,{name:'AbortError'});
  assert.equal(reads,0);
});

test('novel deadlines can be extended without changing the existing ninety-second default',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});const body=deferred<string>();const task=startRequestDeadline(()=>body.promise,undefined,240000);t.mock.timers.tick(90000);body.resolve('complete');assert.equal(await task.result,'complete');
 const hung=startRequestDeadline(()=>new Promise<string>(()=>{}),undefined,30000);t.mock.timers.tick(30000);await assert.rejects(hung.result,{name:'TimeoutError'});assert.throws(()=>startRequestDeadline(async()=>'',undefined,Infinity));
});
