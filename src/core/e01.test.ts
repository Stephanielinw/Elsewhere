import test from 'node:test';
import assert from 'node:assert/strict';
import {readCompletion} from './apiResponse';
import {buildMessagesForModel} from './prompt';
import {defaults,createRole} from './defaults';
import type {PresetData} from './types';

const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const choice=(content:unknown,extra:Record<string,unknown>={},message:Record<string,unknown>={})=>({choices:[{finish_reason:'stop',...extra,message:{role:'assistant',content,...message}}]});
test('valid assistant response and whitespace keepalive JSON are accepted',async()=>{
 assert.equal(await readCompletion(response(choice('  你好 ||| 晚上好  '))),'你好 ||| 晚上好');
 const encoder=new TextEncoder();const stream=new ReadableStream({start(c){c.enqueue(encoder.encode('\n\n'));c.enqueue(encoder.encode(JSON.stringify(choice('保活后回复'))));c.close()}});
 assert.equal(await readCompletion(new Response(stream)),'保活后回复');
});
test('technical errors, refusals, truncated and unsupported responses cannot become character content',async()=>{
 const bad=[response({error:{message:'SECRET_DO_NOT_ECHO'}}),response(choice('网络错误',{}, {role:'error'})),response(choice('')),response(choice(null,{}, {reasoning_content:'仅思考'})),response(choice('正文',{}, {refusal:'拒绝'})),response(choice('正文',{}, {tool_calls:[{id:'1'}]})),response(choice('正文',{finish_reason:'length'})),response(choice('正文',{finish_reason:'MAX_TOKENS'})),response(choice('正文',{finish_reason:'safety'})),response(choice('正文',{finish_reason:'future_reason'})),response(choice('正文',{finish_reason:null})),response({choices:[]}),response({},401),response({},503),new Response('data: invalid'),new Response(' \n')];
 for(const r of bad){await assert.rejects(readCompletion(r),e=>e instanceof Error && !e.message.includes('SECRET_DO_NOT_ECHO'));}
 await assert.rejects(readCompletion(response(choice('正文',{finish_reason:'future_reason'}))),/future_reason/);
});
function fixture(){
 const data=defaults(),r=createRole('测试角色','A','书店','话少，有主见','旧城');data.roles=[r];data.selected=r.id;data.user.name='测试用户';r.chats=[{id:'a',speaker:'char',text:'之前的话',at:1,status:'active'},{id:'u',speaker:'me',text:'真实用户新消息',at:2,status:'active',quote:{id:'a',speaker:'char',text:'之前的话',at:1}}];r.events=[{id:'old',kind:'chat',title:'角色说过',detail:'旧书约定',at:1,status:'active',knownBy:[r.id]},{id:'current',kind:'chat',title:'你说过',detail:'真实用户新消息',at:2,status:'active',messageId:'u',knownBy:[r.id]}];r.scene={id:'s',startedAt:1,where:'书店',messages:[]};r.play={id:'p',title:'演出',world:'舞台',user:'客人',char:'演员',startedAt:1,messages:[],intermissionMessages:[]};return {data,r};
}
test('chat keeps identity, memory, quote and character style while the actual user turn is last',()=>{
 const {data,r}=fixture(),m=buildMessagesForModel(data,r,'chat','真实用户新消息',{nowTs:3});
 assert.deepEqual(m.map(x=>x.role),['system','assistant','user']);assert.ok(m[0].content.includes('话少'));assert.ok(m[0].content.includes('旧书约定'));assert.ok(!m[0].content.includes('真实用户新消息'));assert.ok(m.at(-1)!.content.includes('引用 测试角色'));assert.ok(m.at(-1)!.content.endsWith('真实用户新消息'));assert.equal((m[0].content.match(/严禁混入小说式/g)||[]).length,1);
 const r2=createRole('外向角色','B','摄影师','活泼直率','街区');r2.chats=[{id:'u2',speaker:'me',text:'你好',at:2,status:'active'}];const m2=buildMessagesForModel(data,r2,'chat','你好',{nowTs:3});assert.ok(m2[0].content.includes('1 至 3 条'));assert.ok(m2[0].content.includes('活泼直率'));assert.equal(m2.at(-1)!.role,'user');
});
test('recalled older user chat stays attributed to the user rather than system instructions',()=>{
 const {data,r}=fixture();r.chats.unshift({id:'older',speaker:'me',text:'bookmarker 较早的真实用户内容',at:0,status:'active'});
 r.events.unshift({id:'ev-older',kind:'chat',title:'你说过',detail:'bookmarker 较早的真实用户内容',at:0,status:'active',speaker:'me',messageId:'older',knownBy:[r.id]});
 for(let i=0;i<30;i++)r.chats.splice(r.chats.length-1,0,{id:'mid'+i,speaker:'char',text:'普通历史'+i,at:1,status:'active'});
 r.chats.at(-1)!.text='bookmarker 想起来了';
 const messages=buildMessagesForModel(data,r,'chat','bookmarker 想起来了',{nowTs:3});
 assert.ok(!messages[0].content.includes('较早的真实用户内容'));
 assert.ok(messages.some(m=>m.role==='user'&&m.content.includes('较早的真实用户内容')&&m.content.includes('不是本轮发言')));
 assert.ok(messages.at(-1)!.content.endsWith('bookmarker 想起来了'));
});
test('ambiguous global and role legacy presets are retained but isolated from all modes',()=>{
 const {data,r}=fixture();const old:PresetData={name:'小说旧预设',prompts:[{identifier:'x',enabled:true,role:'user',content:'LEGACY_PRIVATE_SENTINEL'}]};
 for(const target of ['global','role']){data.preset=target==='global'?old:null;r.preset=target==='role'?old:null;for(const mode of ['chat','scene','play','intermission'] as const){const m=buildMessagesForModel(data,r,mode,'真实用户新消息',{nowTs:3});assert.ok(!JSON.stringify(m).includes('LEGACY_PRIVATE_SENTINEL'),target+' '+mode);}assert.equal((target==='global'?data.preset:r.preset),old);}
});
