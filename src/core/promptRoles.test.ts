import test from 'node:test';
import assert from 'node:assert/strict';
import {createRole,defaults} from './defaults';
import {buildMessagesForModel} from './prompt';
import {buildChatBatchMessages} from './chatBatchPrompt';
import {enqueueChat,prepareChatDue,claimChatBatch} from './chatScheduler';
import {retractMessage} from './revisions';

const at=Date.parse('2026-10-30T14:00:00Z');
function fixture(){
 const data=defaults(),r=createRole('角色甲','','合成职业','轻快而有主见','测试地点');
 data.roles=[r];data.user.name='测试用户';data.preset=null;
 r.chats=[];r.events=[];r.diaries=[];r.profile='合成身份资料';r.canonNotes='合成 Canon';
 return {data,r};
}
test('native phone controls precede real conversation without a trailing system message',()=>{
 const {data,r}=fixture();
 r.chats=[{id:'u1',speaker:'me',text:'今天发生了一件有趣的事。',at},
  {id:'a1',speaker:'char',text:'什么事？',at:at+1000},
  {id:'u2',speaker:'me',text:'我在路上遇见了一只猫。',at:at+2000}];
 const messages=buildMessagesForModel(data,r,'chat',r.chats[2].text,{nowTs:at+3000});
 assert.deepEqual(messages.map(m=>m.role),['system','user','assistant','user']);
 assert.match(messages[0].content,/合成身份资料/);assert.match(messages[0].content,/合成 Canon/);
 assert.match(messages[0].content,/日常聊天只展示手机消息正文/);
 assert.match(messages[0].content,/独立的手机消息气泡/);
 assert.match(messages[0].content,/轻快而有主见/);
 assert.equal(messages[1].content,r.chats[0].text);assert.equal(messages.at(-1)?.content,r.chats[2].text);
 assert.ok(!messages[0].content.includes(r.chats[2].text));
});
test('batch inputs keep individual IDs, timestamps and quotes; controls stay before history',()=>{
 const {data,r}=fixture();
 r.chats=[{id:'h1',speaker:'me',text:'历史问题',at},
  {id:'h2',speaker:'char',text:'历史回答',at:at+1000},
  {id:'b1',speaker:'me',text:'当前第一条',at:at+2000},
  {id:'b2',speaker:'me',text:'当前第二条',at:at+3000,quote:{id:'h2',speaker:'char',text:'历史回答',at:at+1000}}];
 enqueueChat(r,'b1',at+2000);enqueueChat(r,'b2',at+3000);prepareChatDue(r,at+63000,()=>0);
 const batch=claimChatBatch(r,at+63000,true)!;
 const messages=buildChatBatchMessages(data,r,batch,at+63000);
 assert.deepEqual(messages.map(m=>m.role),['system','user','assistant','user','user']);
 for(const [index,id] of ['b1','b2'].entries()){
  const source=r.chats[index+2],message=messages[index+3];
  assert.match(message.content,new RegExp(`ID=${id};`));assert.ok(message.content.includes(new Date(source.at).toISOString()));
  assert.equal(messages.filter(m=>m.content.includes(source.text)).length,1);
  assert.ok(!messages[0].content.includes(source.text));
 }
 assert.ok(messages.at(-1)!.content.includes('[引用 角色甲 的消息：「历史回答」]'));
 assert.deepEqual(r.chats.map(m=>m.id),['h1','h2','b1','b2']);
});
test('active assistant claims remain in history and distinct summaries, while retraction removes both',()=>{
 const {data,r}=fixture();const claim='你刚才提到了软件预设和格式规范';
 r.chats=[{id:'bad',speaker:'char',text:claim,at,status:'active'}];
 r.events=[{id:'claim',kind:'chat',title:'角色甲说过',detail:'尚无其他证据确认这段说法；角色声称：'+claim,at,messageId:'bad',speaker:'char',knownBy:[r.id],status:'active'}];
 const before=buildMessagesForModel(data,r,'chat','格式规范',{nowTs:at+1000});
 assert.ok(before.some(m=>m.role==='assistant'&&m.content===claim));
 assert.ok(before[0].content.includes(claim));
 retractMessage(r,'chat','bad',at+2000);
 const after=buildMessagesForModel(data,r,'chat','格式规范',{nowTs:at+3000});
 assert.ok(after.every(m=>!m.content.includes(claim)));
});
test('explicit legacy tail system keeps its role and source data; scene controls remain unchanged',()=>{
 const {data,r}=fixture();r.chats=[{id:'u1',speaker:'me',text:'真实测试输入',at}];
 data.preset={name:'合成旧预设',prompts:[{identifier:'tail',role:'system',enabled:true,content:'显式旧预设控制',injection_position:1,injection_depth:0}]};
 const original=structuredClone(data.preset);
 const messages=buildMessagesForModel(data,r,'chat','真实测试输入',{nowTs:at+1000});
 assert.deepEqual(messages.at(-1),{role:'system',content:'显式旧预设控制'});
 assert.equal(messages.find(m=>m.content==='真实测试输入')?.role,'user');
 assert.deepEqual(data.preset,original);
 data.preset=null;r.scene={id:'scene',where:'合成场景',startedAt:at,messages:[]};
 assert.deepEqual(buildMessagesForModel(data,r,'scene','测试',{nowTs:at+1000}).at(-1),{role:'system',content:'这是面对面的文字小说，仅描述自己和环境，不替用户行动。'});
});
