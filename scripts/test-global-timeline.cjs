const assert=require('node:assert/strict');
const {main}=require('./test-fruit-novel-output.cjs');
const minute=60000,midnight=Date.parse('2026-11-06T08:00:00Z'),place='旧城的咖啡馆';
const saved=t=>t.p.evaluate(()=>JSON.parse(localStorage.getItem('elsewhere-v01')));
const records=r=>r.events.filter(e=>e.lifeRecord?.version===3);
const wire=p=>p.messages.map(m=>m.content).join('\n');
const turn=t=>t.p.locator('#message-form .send-btn');
const source=p=>{const {requestId,roleId}=JSON.parse(wire(p).split('[Elsewhere Timeline]').at(-1).match(/<elsewhere_private_state>(.*?)<\/elsewhere_private_state>/s)[1]);return {requestId,roleId};};
const side=(p,text,fields)=>text+'\n<elsewhere_private_state>'+JSON.stringify({...source(p),...fields})+'</elsewhere_private_state>';
function seed(r,w){
 w.worldTimeZone='America/Los_Angeles';w.settings.autonomousLife=true;
 r.place='旧城';r.profile='合成都市，常在旧城的咖啡馆读书。';
 r.diaries=Array.from({length:8},(_,i)=>{const at=midnight-(i+1)*86400000;return {id:'diary'+i,speaker:'char',source:'manual',text:'合成既有日记',at,dateKey:new Date(at).toISOString().slice(0,10)};});
 r.lastDiaryCheckDay='2026-11-06';
 r.lifeTasks=[{id:'life:'+encodeURIComponent(r.id)+':2026-11-06',roleId:r.id,dateKey:'2026-11-06',at:midnight+minute,from:midnight,to:midnight+minute,status:'quiet'}];
}
const current=t=>t.p.getByTestId('role-life-status');
async function app(t,label){
 await t.p.locator('[data-action=view][data-view=home],.chat-back').filter({visible:true}).first().click();
 await t.p.locator('[data-home-page="1"]').click();
 await t.p.getByRole('button',{name:'打开'+label}).click();
}
async function at(t,target){
 const current=await t.p.evaluate(()=>Date.now());assert.ok(target>current);await t.advance(target-current);
}
async function send(t,text){
 await t.p.locator('#message-input').fill(text);await turn(t).click();await t.advance(61000);
}
const past=(to)=>[
 {id:'sleep',from:0,to:480,action:'sleep',where:place},
 {id:'work',from:480,to,action:'work',where:place},
];
async function cases(run){
 let auxiliaryOutputEstimate=0;
 const {estimateTextTokens}=await import('../src/core/contextBudget.ts');
 await run('14:13 one phone request and two later monitor starts without POST',{
  phoneFirst:true,at:midnight+853*minute,alter:seed,response:p=>{
   const target=JSON.parse(wire(p).split('\n').at(-2).startsWith('{')?wire(p).split('\n').at(-2):wire(p).match(/\{"worldTimeZone"[^\n]+\}/)[0]);
   const to=target.missingElapsedMinutes[0][1];
   const content=side(p,'合成公开一句。|||合成公开第二句。',{
    life:[...past(to),{id:'read',from:900,to:930,action:'read',where:place},{id:'coffee',from:960,to:985,action:'drink',where:place}],
    thought:'我想继续坐一会。',thoughts:[{index:0,anchor:'合成公开一句。',text:'我还在想那封信。'}]});
   auxiliaryOutputEstimate=estimateTextTokens(content.slice(content.indexOf('<elsewhere_private_state>')));
   return content;
  },
 },async t=>{
  await t.p.locator('[data-action=focuschat]').click();await send(t,'说说今天吧');await t.waitPost();
  await t.p.getByText('合成公开第二句。',{exact:true}).waitFor();
  const avatars=t.p.locator('[data-action=reply-thought]');
  assert.equal(await avatars.count(),2);
  for(const [index,text] of ['我还在想那封信。','我想继续坐一会。'].entries()){
   await avatars.nth(index).click();
   await t.p.locator('dialog[open]').getByText(text,{exact:true}).waitFor();
   if(index)await t.p.locator('dialog[open]').getByText('这一轮回复的心声').waitFor();
   await t.p.getByRole('button',{name:'关闭心声'}).click();
  }
  assert.equal(t.posts.length,1);
  const r=(await saved(t)).roles[0],initial=records(r);
  assert.equal(initial.length,4);assert.equal(initial.filter(e=>e.lifeRecord.timeline.state==='ended').length,2);
  const head=wire(t.posts[0]).match(/\[Elsewhere Timeline\][\s\S]*?\[\/Elsewhere Timeline\]/)[0];
  console.log('MEASURE '+JSON.stringify({inputExtraEstimate:estimateTextTokens(head),auxiliaryOutputEstimate,outputLimitExtra:t.posts[0].max_tokens-2048,closedMinutes:initial.filter(e=>e.lifeRecord.timeline.state==='ended').reduce((n,e)=>n+(e.lifeRecord.until-e.at)/minute,0)}));
  await app(t,'监控');
  await at(t,midnight+900*minute+2000);await current(t).filter({hasText:'阅读'}).waitFor();
  await at(t,midnight+960*minute+2000);await current(t).filter({hasText:'喝咖啡'}).waitFor();
  assert.equal(t.posts.length,1);
  await t.p.locator('[data-action=view][data-view=home]').first().click();
  assert.match(await t.p.locator('.home-widget').innerText(),/喝咖啡/);
  await t.p.locator('[data-home-page="1"]').click();await t.p.getByRole('button',{name:'打开定位'}).click();
  assert.match(await t.p.getByTestId('role-location').innerText(),/喝咖啡[\s\S]*旧城的咖啡馆[\s\S]*16:00/);
  assert.equal((await saved(t)).roles[0].lifeTasks.length,1);assert.equal(t.posts.length,1);
 });
 await run('a late-day diary covers 15 complete hours and binds only validated candidates',{
  phoneFirst:true,at:midnight+21*60*minute,zone:'Asia/Tokyo',alter:seed,
  response:p=>side(p,'[[life:sleep]]\n\n[[life:work]]\n\n[[life:rejected]]\n\n[[life:tomorrow]]',{
   life:[...past(900),{id:'rejected',from:950,to:980,action:'pledge'},
    {id:'tomorrow',from:1320,to:1340,action:'read',where:place}],
  }),
 },async t=>{
  await app(t,'日记');await t.p.getByRole('button',{name:'生成今日日记 · 截至此刻'}).click();await t.waitPost();
  await t.p.getByText('我睡觉休息。', {exact:false}).last().waitFor();
  const data=await saved(t),role=data.roles[0],entry=role.diaries.find(d=>d.source==='ai');
  assert.ok(entry);assert.equal(entry.dateKey,'2026-11-06');assert.equal(data.worldTimeZone,'America/Los_Angeles');
  assert.match(entry.text,/我睡觉休息。\s+我做自己的日常工作。/);assert.doesNotMatch(entry.text,/pledge|承诺|阅读|life:/);
  assert.equal(entry.sourceEventIds.filter(id=>id.startsWith('timeline:')).length,2);
  assert.equal(records(role).filter(e=>e.lifeRecord.timeline.state==='ended').reduce((n,e)=>n+(e.lifeRecord.until-e.at)/minute,0),900);
  assert.equal(records(role).length,3);assert.equal(t.posts.length,1);
  console.log('MEASURE '+JSON.stringify({diaryInputExtraEstimate:estimateTextTokens(wire(t.posts[0]).match(/\[Elsewhere Timeline\][\s\S]*?\[\/Elsewhere Timeline\]/)[0]),diaryOutputLimitExtra:t.posts[0].max_tokens-4096,closedMinutes:900,rejected:1}));
 });
 await run('an unresolved same-call diary claim is kept as an unarchived draft without retry',{
  phoneFirst:true,at:midnight+21*60*minute,alter:seed,response:p=>side(p,'我答应了大额交易：[[life:bad]]',{life:[{id:'bad',from:0,to:900,action:'pledge'}]}),
 },async t=>{
  await app(t,'日记');await t.p.getByRole('button',{name:'生成今日日记 · 截至此刻'}).click();await t.waitPost();
  await t.p.getByRole('textbox',{name:'可复制的未确认回复'}).waitFor();
  const r=(await saved(t)).roles[0];assert.equal(r.diaries.filter(d=>d.source==='ai').length,0);assert.equal(records(r).length,0);assert.equal(t.posts.length,1);
 });
 await run('a live cafe state reaches phone and the actual meeting from the same source',{
  phoneFirst:true,at:midnight+939*minute,alter:seed,response:(p,n)=>n===1?side(p,'先等我一会。',{life:[
   {id:'coffee',from:940,to:980,action:'drink',where:place},
  ],thought:'我还没有告诉他我在犹豫。'}):n===2?'我在喝咖啡。':'现在你也来了。',
 },async t=>{
  await t.p.locator('[data-action=focuschat]').click();await send(t,'现在聊聊吧');await t.waitPost();
  await t.p.getByText('先等我一会。',{exact:true}).waitFor();
  // The original request crosses 15:40 while it runs; a persisted start is already visible by the next turn.
  await send(t,'你在干嘛？');await t.waitPost(2);
  await t.p.getByText('我在喝咖啡。',{exact:true}).waitFor();
  assert.match(wire(t.posts[1]),/喝咖啡/);assert.match(wire(t.posts[1]),/旧城的咖啡馆/);
  assert.match(wire(t.posts[1]),/对方不知道[^\n]+我还没有告诉他我在犹豫/);
  assert.ok((await saved(t)).roles[0].chats.every(m=>!m.text.includes('我还没有告诉他我在犹豫')));
  await t.p.locator('[data-action=chatpanel][data-panel=more]').click();await t.p.locator('[data-action=meet]').click();
  await t.p.locator('[data-scene-location]').filter({hasText:'旧城的咖啡馆'}).waitFor();
  await t.send();await t.waitPost(3);assert.match(wire(t.posts[2]),/见面开始时角色在旧城的咖啡馆，当时活动：喝咖啡/);
 });
 await run('a refused combined save leaks neither thought nor life facts and reloads without a second POST',{
  phoneFirst:true,at:midnight+853*minute,alter:seed,refuseReply:'合成拒写回包。',
  response:p=>side(p,'合成拒写回包。',{life:past(850),thought:'合成未保存心声。'}),
 },async t=>{
  await t.p.locator('[data-action=focuschat]').click();await send(t,'本轮写入会被拒绝');await t.waitPost();
  await t.advance(6000);
  const state=await saved(t),r=state.roles[0];
  assert.equal(r.chats.filter(m=>m.speaker==='char').length,0);
  assert.ok(r.chats.some(m=>m.text==='本轮写入会被拒绝'));
  assert.equal(records(r).length,0);
  assert.equal(await t.p.locator('[data-action=reply-thought]').count(),0);
  await t.p.reload();await t.ready();
  await t.p.locator('[data-action=enter][data-id=novel-role]').click();
  await t.p.locator('.dock [data-view=chat]').click();
  await t.advance(66000);
  assert.equal(t.posts.length,1);
  assert.equal(records((await saved(t)).roles[0]).length,0);
 });
 await run('a second tab cannot execute or dispatch the same persisted plan',{
  phoneFirst:true,at:midnight+853*minute,alter:seed,
  response:p=>side(p,'合成独占计划。',{life:[...past(850),{id:'read',from:900,to:930,action:'read',where:place}]}),
 },async t=>{
  await t.p.locator('[data-action=focuschat]').click();await send(t,'这轮只应派发一次');await t.waitPost();
  await t.p.getByText('合成独占计划。',{exact:true}).waitFor();
  const second=await t.ctx.newPage();await second.goto(t.p.url());
  await second.locator('#app[data-write-access=read-only]').waitFor();
  const plan=r=>records(r).filter(e=>e.lifeRecord.timeline.key==='read');
  assert.equal(plan((await saved(t)).roles[0])[0].lifeRecord.timeline.state,'pending');
  await at(t,midnight+900*minute+2000);
  await t.p.waitForFunction(()=>JSON.parse(localStorage.getItem('elsewhere-v01')).roles[0].events.some(e=>e.lifeRecord?.timeline?.key==='read'&&e.lifeRecord.timeline.state==='running'));
  assert.equal(plan((await saved(t)).roles[0]).length,1);
  await second.close();await t.p.reload();await t.ready();
  assert.equal(plan((await saved(t)).roles[0])[0].lifeRecord.timeline.state,'running');
  assert.equal(t.posts.length,1);
 });
 await run('closed overnight and reopened: one phone POST fills both world dates',{
  phoneFirst:true,at:Date.parse('2026-11-10T05:00:00Z'),zone:'Asia/Tokyo',alter:(r,w)=>{
   seed(r,w);
   const day=Date.parse('2026-11-09T08:00:00Z');
   r.diaries=Array.from({length:9},(_,i)=>{const at=day-i*86400000;return {id:'diary'+i,speaker:'char',source:'manual',text:'合成既有日记',at,dateKey:new Date(at).toISOString().slice(0,10)};});
   r.lastDiaryCheckDay='2026-11-09';
   r.proactive={attempts:[{id:'prior-contact',roleId:r.id,at:day+1259*minute,status:'skipped',topicId:'fixture',topic:'既有记录',topicVersion:'fixture',chatVersion:'fixture'}],sentTopics:[]};
   r.lifeTasks=[{id:'life:'+encodeURIComponent(r.id)+':2026-11-09',roleId:r.id,dateKey:'2026-11-09',at:day+1259*minute,from:day,to:day+1259*minute,status:'quiet'}];
   r.meetings=[{id:'archived-evening-meeting',where:place,startedAt:day+1200*minute,endedAt:day+1260*minute,messages:[{id:'face-to-face',speaker:'me',text:'旧城咖啡馆的既有见面。',at:day+1220*minute,status:'active'}]}];
  },
  response:(p,n)=>{
   const match=wire(p).match(/\{"worldTimeZone"[^\n]+\}/);
   assert.ok(match,'Unexpected fixture POST '+n+' '+wire(p).slice(0,280));
   const input=JSON.parse(match[0]);
   if(n===1)return side(p,'晚安，合成计划已安排。',{life:[
    {id:'confirmed',from:0,to:1200,action:'rest',where:place},
    {id:'missed-read',from:1320,to:1350,action:'read',where:place},
    {id:'missed-walk',from:1380,to:1410,action:'walk',where:place},
   ]});
   if(n===2){
    assert.equal(input.worldTimeZone,'America/Los_Angeles');
    assert.deepEqual(input.missingElapsedMinutes[0],[-180,854]);
    return side(p,'今天聊得正好。',{life:[
     {id:'duplicate',from:-1400,to:-1390,action:'eat',where:place},
     {id:'conflict',from:-210,to:-190,action:'work',where:'旧城的工作地点'},
     {id:'invented-pledge',from:-170,to:-150,action:'pledge',where:place},
     {id:'outside-world',from:-160,to:-150,action:'read',where:'另一城的书店'},
     {id:'late-evening',from:-180,to:-120,action:'read',where:place},
     {id:'overnight',from:-120,to:480,action:'sleep',where:place},
     {id:'breakfast',from:480,to:530,action:'eat',where:place},
     {id:'now-coffee',from:854,to:900,action:'drink',where:place},
    ]});
   }
   assert.deepEqual(input.missingElapsedMinutes,[[530,854]]);
   assert.match(wire(p),/喝咖啡/);assert.match(wire(p),/旧城的咖啡馆/);
   return side(p,'这次仍然只发一条。',{life:[
    {id:'replay-night',from:-120,to:480,action:'sleep',where:place},
    {id:'remaining',from:530,to:854,action:'work',where:place},
   ]});
  },
 },async t=>{
  const next=Date.parse('2026-11-10T08:00:00Z');
  const byKey=r=>Object.fromEntries(records(r).map(e=>[e.lifeRecord.timeline.key,e]));
  const report=r=>records(r).map(e=>({key:e.lifeRecord.timeline.key,state:e.lifeRecord.timeline.state,confirmed:e.lifeEvidence==='confirmed',from:(e.at-next)/minute,to:(e.lifeRecord.until-next)/minute,where:e.where}));
  const enter=async()=>{await t.p.locator('[data-action=enter][data-id=novel-role]').click();await t.p.locator('.dock [data-view=chat]').click();if(!(await saved(t)).roles[0].chatTiming?.focused)await t.p.locator('[data-action=focuschat]').click();};
  await t.p.locator('[data-action=focuschat]').click();await send(t,'安排今晚的普通活动');await t.waitPost();
  await t.p.getByText('晚安，合成计划已安排。',{exact:true}).waitFor();
  const before=(await saved(t)).roles[0],initial=byKey(before);
  assert.equal(initial['missed-read'].lifeRecord.timeline.state,'pending');
  assert.equal(initial['missed-walk'].lifeRecord.timeline.state,'pending');
  await t.reopen(next+853*minute);await enter();await t.advance(2000);
  const expired=byKey((await saved(t)).roles[0]);
  for(const id of ['missed-read','missed-walk']){assert.equal(expired[id].lifeRecord.timeline.state,'expired');assert.equal(expired[id].lifeEvidence,undefined);}
  assert.equal(t.posts.length,1);
  await send(t,'今天聊聊近况吧');await t.waitPost(2);
  await t.p.getByText('今天聊得正好。',{exact:true}).waitFor();
  const caught=(await saved(t)).roles[0],events=byKey(caught);
  assert.deepEqual(Object.keys(events).sort(),['confirmed','missed-read','missed-walk','late-evening','overnight','breakfast','now-coffee'].sort());
  assert.deepEqual(events.confirmed,initial.confirmed);assert.deepEqual(caught.meetings,before.meetings);
  assert.equal(events.overnight.at,next-120*minute);assert.equal(events.overnight.lifeRecord.until,next+480*minute);
  assert.equal(events['now-coffee'].lifeRecord.timeline.state,'running');
  await app(t,'监控');
  await current(t).filter({hasText:'喝咖啡'}).waitFor();
  await t.p.getByTestId('monitor-prev-day').click();
  await t.p.getByTestId('footprint-item').filter({hasText:'阅读'}).waitFor();
  await t.p.getByTestId('footprint-item').filter({hasText:'睡觉'}).waitFor();
  await t.p.locator('[data-action=view][data-view=home]').first().click();
  assert.match(await t.p.locator('.home-widget').innerText(),/喝咖啡/);
  await t.p.locator('[data-home-page="1"]').click();await t.p.getByRole('button',{name:'打开定位'}).click();
  assert.match(await t.p.getByTestId('role-location').innerText(),/喝咖啡[\s\S]*旧城的咖啡馆/);
  await t.reopen(next+856*minute);await enter();assert.equal(t.posts.length,2);
  assert.deepEqual(report((await saved(t)).roles[0]),report(caught));
  await send(t,'现在在做什么？');await t.waitPost(3);
  await t.p.getByText('这次仍然只发一条。',{exact:true}).waitFor();
  const final=(await saved(t)).roles[0];
  assert.equal(records(final).length,8);assert.equal(new Set(records(final).map(e=>e.id)).size,8);
  assert.equal(byKey(final)['remaining'].lifeRecord.timeline.state,'ended');
  assert.equal(byKey(final)['replay-night'],undefined);
  console.log('OVERNIGHT '+JSON.stringify({zone:'America/Los_Angeles',relativeTo:'2026-11-10 00:00',before:report(before),expired:report((await saved(t)).roles[0]).filter(e=>e.state==='expired'),catchUpRejected:['duplicate','conflict','invented-pledge','outside-world'],afterCatchUp:report(caught),final:report(final),modelPosts:t.posts.length,extraBackfillPosts:0}));
 });
 await run('invalid optional metadata keeps the normal reply and creates no thought',{
  phoneFirst:true,alter:seed,content:'正常正文保留。\n<elsewhere_private_state>{坏掉的JSON}</elsewhere_private_state>',
 },async t=>{
  await t.p.locator('[data-action=focuschat]').click();await send(t,'你好');await t.waitPost();await t.p.getByText('正常正文保留。',{exact:true}).waitFor();
  await t.p.locator('[data-action=reply-thought]').click();await t.p.getByText('这条回复没有保存心声。').waitFor();
  assert.equal(records((await saved(t)).roles[0]).length,0);assert.equal(t.posts.length,1);
 });
}
main(cases).catch(error=>{console.error(error);process.exitCode=1;});
