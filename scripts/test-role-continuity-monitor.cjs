const assert=require('node:assert/strict');
const {main}=require('./test-fruit-novel-output.cjs');
const at=Date.parse('2026-11-06T22:00:00Z'),key='elsewhere-v01';
const order='走。在我把那些杂物从大厅里清理干净之前，别让我再看见你踏进港口半步。';
const body='他放下手中的东西。'+('合成环境描写。'.repeat(400))+'他对你说：「'+order+'」';
const wire=t=>JSON.stringify(t.posts.at(-1).messages);
async function cases(run){
 const {archiveMeeting}=await import('../src/core/meetingHistory.ts');
 function archived(r,time=at){const current=r.scene;r.scene={id:'shared-visit',where:'合成大厅',startedAt:time-120000,messages:[{id:'public-order',speaker:'char',text:body,at:time-110000},{id:'private-inner',speaker:'me',text:'UNSPOKEN_SECRET 我心里藏着的事情。',at:time-100000}]};assert.ok(archiveMeeting(r,time-90000,()=>true));r.scene=current;}
 for(const fruit of [false,true])await run('same role reality memory reaches actual scene request '+fruit,{fruit,alter:r=>archived(r)},async t=>{await t.send();await t.p.locator('.passage.theirs').filter({hasText:'合成有效小说正文。'}).waitFor();assert.ok(wire(t).includes(order));assert.ok(wire(t).includes('消息=public-order'));assert.ok(!wire(t).includes('UNSPOKEN_SECRET'));assert.equal(t.posts.length,1);});
 await run('fruit body without optional metadata archives then reaches the real phone POST',{fruit:true,alter:r=>r.chatTiming={version:1,focused:true,generation:0,pending:[],quietUntil:0},response:(_,n)=>n===1?'<content>'+body+'</content>':'合成手机回复'},async t=>{
  await t.send();await t.p.locator('.passage.theirs').filter({hasText:order}).waitFor();const scene=await t.record();assert.equal(scene.messages.filter(m=>m.speaker==='char').length,1);
  await t.p.locator('[data-action=endnovel]').click();await t.p.locator('#message-input').fill('我已经离开，回到了房间。');await t.p.locator('#message-form .send-btn').click();await t.advance(75000);await t.waitPost(2);
  assert.ok(wire(t).includes(order));assert.ok(wire(t).includes('Scene=synthetic-scene'));assert.ok(wire(t).includes('角色原文'));assert.equal(t.posts.length,2);
  const role=await t.p.evaluate(key=>JSON.parse(localStorage.getItem(key)).roles[0],key);assert.equal(role.meetings[0].id,scene.id);assert.deepEqual(role.meetings[0].messages,scene.messages);assert.ok(role.memory.experiences.episodes.some(e=>e.containerId===scene.id&&e.sources.some(s=>s.id===scene.messages.at(-1).id)));
 });
 await run('backstage send costs zero and paw uses the same reality memory',{play:true,alter:r=>archived(r)},async t=>{await t.p.locator('[data-action=intermission]').click();await t.p.locator('#intermission-input').fill('刚才那次见面之后，我回到了房间。');await t.p.locator('#intermission-form button[type=submit]').click();assert.equal(t.posts.length,0);await t.p.locator('[data-action=intermissionreply]').click();await t.waitPost();assert.ok(wire(t).includes(order));assert.ok(!wire(t).includes('UNSPOKEN_SECRET'));assert.equal(t.posts.length,1);});
 await run('formal theatre request does not inherit real shared episodes',{fruit:true,play:true,alter:r=>archived(r)},async t=>{await t.send();await t.p.locator('.passage.theirs').filter({hasText:'合成有效小说正文。'}).waitFor();assert.ok(!wire(t).includes(order));assert.ok(!wire(t).includes('UNSPOKEN_SECRET'));assert.equal(t.posts.length,1);});
 await run('diary actual request uses the same source-owned episode',{alter:r=>{archived(r,at-86400000);r.diaries=r.diaries.filter(d=>d.dateKey!=='2026-11-05');r.diaryTasks=[{id:'prior-diary',roleId:r.id,dateKey:'2026-11-05',status:'failed',attempts:0,createdAt:at,updatedAt:at}];}},async t=>{await t.p.locator('[data-action=view][data-view=home]').first().click();await t.p.locator('[data-home-page="1"]').click();await t.p.getByRole('button',{name:'打开日记'}).click();await t.p.locator('[data-action=retrydiary][data-date="2026-11-05"]').click();await t.waitPost();assert.ok(wire(t).includes(order));assert.ok(wire(t).includes('消息=public-order'));assert.ok(!wire(t).includes('UNSPOKEN_SECRET'));assert.equal(t.posts.length,1);});
}
main(cases).catch(e=>{console.error(e);process.exitCode=1;});
