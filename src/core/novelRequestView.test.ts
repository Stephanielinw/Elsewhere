import test from 'node:test';
import assert from 'node:assert/strict';
import {novelControl,novelFailureDetails} from '../novelRequestView';

test('novel control is a stop during preparation/transport but never during final persistence',()=>{
 for(const phase of ['preparing','compiling','checking','requesting','reading','parsing'] as const)assert.deepEqual(novelControl(true,phase),{label:'停止本次等待',icon:'square',stop:true,disabled:false});
 for(const phase of ['saving','archived'] as const){assert.equal(novelControl(true,phase).stop,false);assert.equal(novelControl(true,phase).disabled,true);}
 assert.equal(novelControl(false,'failed').label,'发送描写');
});
test('novel error copy distinguishes unsent, uncertain, returned and invalid sources using safe codes',()=>{
 assert.ok(!novelFailureDetails({state:'not-sent',code:'preset'}).recovery.includes('可能已经计费'));
 assert.ok(novelFailureDetails({state:'unknown',code:'timeout'}).recovery.includes('再次产生费用'));
 assert.ok(novelFailureDetails({state:'returned',code:'save'}).recovery.includes('优先保留'));
 assert.ok(novelFailureDetails({state:'unknown',code:'stale'}).recovery.includes('不能直接重试'));
 for(const code of ['preset','compile','timeout','cancelled','provider','format','save','stale','connection'] as const)assert.match(novelFailureDetails({state:'unknown',code}).code,/^NOVEL_[A-Z]+$/);
});

test('imported unrecognized error data cannot become a public error code',()=>{
 assert.equal(novelFailureDetails({state:'unknown',code:'PRIVATE_URL_OR_OUTPUT' as never}).code,'NOVEL_CONNECTION');
});

import {createNovelTasks} from './novelGeneration';
import {createRole} from './defaults';
test('runtime novel ownership distinguishes attempts even for the same role',()=>{
 const r=createRole('合成角色','','','',''),tasks=createNovelTasks();
 r.scene={id:'a',where:'合成地点',startedAt:1,messages:[]};const a=tasks.begin(r,'scene');
 assert.equal(tasks.has(r.id,a.id),true);tasks.cancel(r.id);
 r.play={id:'b',title:'合成戏剧',world:'合成世界',user:'用户',char:'演员',startedAt:2,messages:[]};const b=tasks.begin(r,'play');
 assert.equal(tasks.has(r.id,a.id),false);assert.equal(tasks.has(r.id,b.id),true);tasks.finish(a);assert.equal(tasks.has(r.id,b.id),true);tasks.finish(b);assert.equal(tasks.has(r.id),false);
});
