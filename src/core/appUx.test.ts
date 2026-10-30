import test from 'node:test';import assert from 'node:assert/strict';
import {createProfileAutosave} from './profileAutosave';
import {completionLimit} from './outputBudget';
test('autosave coalesces per preset+mode and flush waits for serial writes',async()=>{
 const writes:{key:string;value:number}[]=[],states:string[]=[];let release:()=>void=()=>{};
 const gate=new Promise<void>(r=>{release=r});const saver=createProfileAutosave<number>(async(key,value)=>{if(!writes.length)await gate;writes.push({key,value});},(_,state)=>states.push(state),1000);
 saver.enqueue('A:meeting',1);saver.enqueue('A:meeting',2);const flushing=saver.flush();saver.enqueue('A:meeting',3);saver.enqueue('B:meeting',4);saver.enqueue('A:theatre',5);assert.equal(saver.hasPending(),true);release();assert.equal(await flushing,true);assert.deepEqual(writes,[{key:'A:meeting',value:2},{key:'A:meeting',value:3},{key:'B:meeting',value:4},{key:'A:theatre',value:5}]);assert.equal(saver.state('A:meeting'),'saved');assert.equal(saver.hasPending(),false);
});
test('autosave failure blocks flush, keeps latest changes and retries explicitly without overwriting other keys',async()=>{
 let fail=true;const writes:number[]=[];const saver=createProfileAutosave<number>(async(_,n)=>{if(fail)throw new Error('quota');writes.push(n);},()=>{},1000);
 saver.enqueue('A:meeting',1);assert.equal(await saver.flush(),false);saver.enqueue('A:meeting',2);assert.equal(await saver.flush(),false);assert.equal(saver.state('A:meeting'),'failed');assert.deepEqual(writes,[]);fail=false;assert.equal(await saver.flush(true),true);assert.deepEqual(writes,[2]);
});
test('task/model token limits ignore legacy global maxTokens and keep novel budgets separate',()=>{
 const base={endpoint:'https://api.openai.com/v1',model:'gpt-4o',maxTokens:1};assert.deepEqual(completionLimit(base,'scene'),{max_completion_tokens:16384});assert.ok(completionLimit(base,'chat').max_completion_tokens!>550);assert.deepEqual(completionLimit({...base,model:'o3'},'play'),{max_completion_tokens:32768});assert.deepEqual(completionLimit({...base,endpoint:'http://localhost:9999/v1',model:'unknown'},'scene'),{});assert.deepEqual(completionLimit({...base,endpoint:'http://localhost:9999/v1'},'focus-log'),{max_tokens:320});
});
