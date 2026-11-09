const assert=require('node:assert/strict');
const {main}=require('./test-fruit-novel-output.cjs');
const action=(t,name)=>t.p.locator(`[data-action="${name}"]`);
const saved=t=>t.p.evaluate(()=>JSON.parse(localStorage.getItem('elsewhere-v01')).roles[0]);
const wire=(t,i=-1)=>t.posts.at(i).messages.map(m=>m.content).join('\n');
const phone=async(t,text)=>{
 await t.p.locator('#message-input').fill(text);
 await t.p.locator('#message-form .send-btn').click();
};
const backstage=async(t,text)=>{
 await t.p.locator('#intermission-input').fill(text);
 await t.p.locator('#intermission-form .send-btn').click();
};
const stage=async(t,text)=>{
 await t.p.locator('#novel-input').fill(text);
 await t.submit.click();
};
const settle=async(t,n,text)=>{
 await t.waitPost(n);
 await t.p.getByText(text,{exact:true}).last().waitFor();
};
const meet=async t=>{
 await t.p.locator('[data-action=chatpanel][data-panel=more]').click();
 await action(t,'meet').click();
 await t.p.locator('#novel-form').waitFor();
};
const agreement='今晚见面，记得把蓝色的信交给我。', order='请你现在离开港口，等我处理完这里的事再回来。';
const performance='在月亮车站扮演守门人。', backstageText='守门人这段也太严肃了吧！', realRecall='刚才我们在港口为什么吵起来了？';
const firstReply='我记得那封蓝色的信。', stageReply='守门人打开了月亮车站的门。', outsideReply='你那句吐槽我听到了。我记得港口的事。', finale='今天那场守门人，我到现在还在想你说的那句。';
const savedStage={speaker:'char',id:'earlier-stage',at:Date.parse('2026-11-06T21:59:59.500Z'),text:stageReply};
async function cases(run){
 await run('phone agreement, real Scene, backstage, stage, curtain and next real Scene',{
  phoneFirst:true,response:(_,n)=>[firstReply,'他对你说：「'+order+'」','我记得在港口对你说过什么。',stageReply,outsideReply,'守门人检查了车票。',finale,'蓝信的事情还没处理完。','他抬眼看向你。'][n-1]
 },async t=>{
  await action(t,'focuschat').click();
  await phone(t,agreement);await t.advance(61000);await settle(t,1,firstReply);
  await meet(t);await stage(t,'我推开门问：你为什么不让我留下？');await settle(t,2,'他对你说：「'+order+'」');
  assert.ok(wire(t).includes(agreement));
  await action(t,'endnovel').click();await phone(t,'我已经离开港口，回到房间了。');await t.advance(61000);await settle(t,3,'我记得在港口对你说过什么。');
  assert.ok(wire(t).includes(order));assert.match(wire(t),/见面原文 · Scene=/);
  await t.p.locator('.chat-back').click();await t.p.locator('.dock [data-view=drama]').click();
  await t.p.locator('#play-start [name=title]').fill('月亮车站');await t.p.locator('#play-start button').click();
  await stage(t,performance);await settle(t,4,stageReply);
  assert.ok(!wire(t).includes(agreement));assert.ok(!wire(t).includes(order));
  await action(t,'intermission').click();
  assert.equal(await t.p.locator('#novel-form').count(),0);assert.equal(t.posts.length,4);
  const playId=(await saved(t)).play.id;
  await backstage(t,backstageText);await t.advance(15000);await backstage(t,realRecall);
  await t.advance(29000);assert.equal(t.posts.length,4);
  await t.advance(1200);await settle(t,5,outsideReply);
  for(const text of [agreement,order,stageReply,backstageText,realRecall,'你一直是同一个戏外角色本人','不要写小说旁白'])assert.ok(wire(t).includes(text),text);
  const stageBefore=(await saved(t)).play.messages;
  assert.equal((await saved(t)).play.intermissionMessages.length,3);
  const attempt=Object.values((await saved(t)).play.intermissionAttempts)[0];
  assert.equal(attempt.status,'archived');assert.equal(attempt.sources.length,2);
  await action(t,'resumeplay').click();assert.equal(t.posts.length,5);
  assert.deepEqual((await saved(t)).play.messages,stageBefore);
  await stage(t,'我把剧里的票交给守门人。');await settle(t,6,'守门人检查了车票。');
  for(const text of [agreement,order,backstageText,outsideReply])assert.ok(!wire(t).includes(text),text);
  await action(t,'endnovel').click();await settle(t,7,finale);
  const ended=await saved(t),p=ended.plays.find(p=>p.id===playId);
  assert.equal(ended.play,null);assert.ok(p.endedAt);assert.equal(p.intermissionMessages.length,3);
  assert.equal(p.curtainReply.attempts.length,1);
  assert.deepEqual(ended.chats.find(m=>m.text===finale).playSource,{playId,endedAt:p.endedAt,attemptId:p.curtainReply.attempts[0].id});
  assert.ok(!ended.chats.some(m=>m.text.includes('挺有意思的。')));
  for(const text of [order,stageReply,backstageText,playId])assert.ok(wire(t).includes(text),text);
  await phone(t,'谢谢你和我演戏。蓝色的信还在吗？');await t.advance(61000);await settle(t,8,'蓝信的事情还没处理完。');
  assert.ok(wire(t).includes(finale));
  await meet(t);await stage(t,'我回来了。');await settle(t,9,'他抬眼看向你。');
  for(const text of [order,backstageText,finale])assert.ok(wire(t).includes(text),text);
  await t.p.reload();await t.ready();await action(t,'enter').click();await action(t,'openconversation').click();
  await t.p.getByText('他抬眼看向你。',{exact:true}).waitFor();assert.equal(t.posts.length,9);
 });
 await run('paused queue follows original deadline, editing restarts it and withdrawal removes a source',{
  play:true,alter:r=>r.play.messages.push(savedStage)
 },async t=>{
  await action(t,'intermission').click();
  await backstage(t,'需要撤回的幕间话。');await backstage(t,'需要编辑的幕间话。');
  const r=await saved(t),[a,b]=r.play.intermissionMessages;
  await t.advance(20000);
  await t.p.locator(`[data-msg-id="${a.id}"] [data-action=retractmsg]`).click();
  await t.p.locator(`[data-msg-id="${b.id}"] [data-action=starteditmsg]`).click();
  await t.p.locator('#inline-edit-form textarea').fill('修改后的有效幕间话。');
  await t.p.locator('#inline-edit-form button[type=submit]').click();
  const due=(await saved(t)).play.intermissionQueue.dueAt;
  await action(t,'resumeplay').click();await t.advance(31000);assert.equal(t.posts.length,0);
  await action(t,'intermission').click();assert.equal(t.posts.length,0);
  assert.equal((await saved(t)).play.intermissionQueue.dueAt,due);
  await t.advance(1000);await settle(t,1,'合成有效小说正文。');
  assert.match(wire(t),/修改后的有效幕间话/);assert.doesNotMatch(wire(t),/需要撤回|需要编辑/);
  assert.deepEqual(Object.values((await saved(t)).play.intermissionAttempts)[0].sources,[{id:b.id,revision:1}]);
  await t.p.locator(`[data-msg-id="${b.id}"] [data-action=retractmsg]`).click();await t.advance(31000);
  assert.equal(t.posts.length,1);assert.equal((await saved(t)).play.intermissionMessages.find(m=>m.speaker==='char').status,'retracted');
 });
 await run('entering backstage freezes an in-flight stage turn without blocking chat',{play:true,fault:'body'},async t=>{
  await stage(t,performance);await t.waitPost();await t.p.waitForFunction(()=>typeof window.novelBodyRelease==='function');
  await action(t,'intermission').click();await backstage(t,backstageText);
  assert.equal((await saved(t)).play.intermissionMessages.length,1);
  await action(t,'resumeplay').click();
  await t.p.evaluate(()=>window.novelBodyRelease({choices:[{finish_reason:'stop',message:{role:'assistant',content:'已暂停的旧戏内回复'}}]}));
  await t.advance(31000);
  const p=(await saved(t)).play;assert.equal(p.messages.filter(m=>m.speaker==='char').length,0);
  assert.equal(p.novelAttempt.state,'unknown');assert.equal(t.posts.length,1);
 });
 await run('return to theatre invalidates a dispatched reply and keeps its receipt',{play:true,fault:'body'},async t=>{
  await action(t,'intermission').click();await backstage(t,backstageText);await t.advance(31000);
  await t.waitPost();await t.p.waitForFunction(()=>typeof window.novelBodyRelease==='function');
  await action(t,'resumeplay').click();
  await t.p.evaluate(()=>window.novelBodyRelease({choices:[{finish_reason:'stop',message:{role:'assistant',content:'不应归档的迟到回复'}}]}));
  await action(t,'intermission').click();await t.advance(100000);
  assert.equal(t.posts.length,1);
  const r=await saved(t);assert.equal(r.play.intermissionMessages.length,1);
  assert.equal(Object.values(r.play.intermissionAttempts)[0].status,'unknown');
 });
 await run('rollback evidence stays backstage and is excluded from resumed theatre',{play:true,alter:r=>{
  r.play.messages.push({...savedStage,id:'played-me',speaker:'me',text:'这个版本的剧内动作。'},savedStage);
 }},async t=>{
  await action(t,'intermission').click();await t.p.locator('.intermission-tools summary').click();await action(t,'rollbackplay').click();
  await backstage(t,'刚才那一版怎么演？');await t.advance(31000);await settle(t,1,'合成有效小说正文。');
  assert.match(wire(t),/已废弃，不属于正式剧情/);assert.ok(wire(t).includes(stageReply));
  await action(t,'resumeplay').click();assert.equal(t.posts.length,1);
  await stage(t,'另起一段戏内演出。');await t.waitPost(2);
  assert.ok(!wire(t).includes(stageReply));assert.doesNotMatch(wire(t),/刚才那一版怎么演/);
 });
 await run('curtain archive rejection keeps the stage and sends nothing',{play:true,refuseCurtain:true,alter:r=>r.play.messages.push(savedStage)},async t=>{
  const before=await saved(t);
  await action(t,'endnovel').click();await t.advance(100000);
  assert.equal(t.posts.length,0);await t.p.locator('#novel-form').waitFor();
  const after=await saved(t);assert.equal(after.play.id,before.play.id);assert.deepEqual(after.play.messages,before.play.messages);assert.deepEqual(after.plays,[]);
 });
 await run('curtain with no model configuration archives silently with a manual entry',{play:true,alter:(r,world)=>{
  r.play.messages.push(savedStage);world.settings.mode='demo';
 }},async t=>{
  await action(t,'endnovel').click();await action(t,'retry-curtain').waitFor();await t.advance(100000);
  const r=await saved(t);assert.equal(r.play,null);assert.equal(r.plays.length,1);assert.deepEqual(r.plays[0].curtainReply.attempts,[]);assert.deepEqual(r.chats,[]);assert.equal(t.posts.length,0);
 });
 await run('curtain failure keeps the archive and requires confirmation after reload',{play:true,status:503,alter:r=>r.play.messages.push(savedStage)},async t=>{
  await action(t,'endnovel').click();await t.waitPost();await action(t,'retry-curtain').waitFor();
  const before=await saved(t);assert.equal(before.play,null);assert.equal(before.plays[0].curtainReply.attempts[0].status,'unknown');assert.deepEqual(before.chats,[]);
  await t.p.reload();await t.ready();await action(t,'enter').click();await t.p.locator('.dock [data-view=chat]').click();await t.advance(100000);
  assert.equal(t.posts.length,1);
  t.p.once('dialog',async d=>{assert.match(d.message(),/再次产生费用/);await d.dismiss();});await action(t,'retry-curtain').click();
  assert.equal(t.posts.length,1);assert.deepEqual((await saved(t)).plays,before.plays);
 });
 await run('curtain save refusal offers scoped copy without archiving a phone reply',{play:true,content:finale,refuseReply:finale,alter:r=>r.play.messages.push(savedStage)},async t=>{
  await action(t,'endnovel').click();await t.waitPost();await action(t,'copy-curtain').click();
  assert.equal(await t.p.getByRole('textbox',{name:'可复制的未确认回复'}).inputValue(),finale);
  const r=await saved(t);assert.equal(r.play,null);assert.equal(r.plays[0].curtainReply.attempts[0].status,'unknown');assert.deepEqual(r.chats,[]);
  await t.advance(100000);assert.equal(t.posts.length,1);
 });
}
main(cases).catch(e=>{console.error(e);process.exitCode=1;});
