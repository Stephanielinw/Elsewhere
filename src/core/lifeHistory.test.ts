import test from 'node:test';
import assert from 'node:assert/strict';
import {createRole,defaults,normalizeAndMigrateData} from './defaults';
import {claimLifeTask,prepareLifeTask,commitLifeTask,lifeTaskValid} from './autonomousLife';
import {collectRoleLife,personalContext,personalDiaries,preparePersonalReply,personalTicketValid} from './roleLife';
import {buildGroundedDailyFootprints} from './footprints';
import {monitorItemsForDisplay} from './monitorPresentation';
import {buildCharacterDiaryPrompt,toLocalDateKey} from './diary';
import {buildMessagesForModel,routine} from './prompt';
import {editMessage,retractMessage} from './revisions';
import {claimProactive,proactiveTaskValid} from './proactiveChat';
import type {EventRecord,RoleData} from './types';

const at=Date.parse('2026-11-06T22:00:00Z'),hour=3600000;
function fixture() {
  const data=defaults(),r=createRole('合成旧名','','医生','谨慎','旧港口');
  Object.assign(r,{id:'history-actor',profile:'整理医生手册。与朋友伊洛熟识。',relationship:'老朋友',notes:'合成笔记',
    chats:[],events:[],diaries:[],lifeAt:at,lastDiaryCheckDay:toLocalDateKey(at),firstMessageState:{status:'ready',updatedAt:at-4*hour}});
  data.roles=[r];data.selected=r.id;
  return {data,r};
}
function completed(basis=false) {
  const x=fixture(),{r}=x;
  if(basis){
    r.chats=[{id:'basis-message',speaker:'char',text:'合成材料已备好。',at:at-3*hour}];
    r.events=[{id:'basis-event',kind:'life',title:'合成材料',detail:'合成材料',at:at-3*hour,source:'confirmed',messageId:'basis-message',sourceRevision:0,lifeEvidence:'confirmed',knownBy:[r.id]}];
  }
  const task=claimLifeTask([r],r,at,true)!;
  assert.ok(task);
  const prepared=prepareLifeTask(r,x.data.user,task);
  const output={requestId:task.id,roleId:r.id,events:[{at:at-20*60000,action:basis?'read':'walk',durationMinutes:5,
    ...(basis?{focus:{sourceId:'event:basis-event',quote:'合成材料'}}:{location:{sourceId:'profile:'+r.id,quote:r.place}})}]};
  const [event]=commitLifeTask(r,task,prepared,JSON.stringify(output),at);
  return {...x,task,prepared,event};
}
const shown=(r:RoleData)=>monitorItemsForDisplay(r,defaults().user,buildGroundedDailyFootprints(r,toLocalDateKey(at),at).items,at);
test('completed history survives every profile field change without rewriting its stored evidence',()=>{
  const changes={name:'合成新名',job:'作家',traits:'外向',place:'新山城',profile:'写作和新的背景',relationship:'新关系',notes:'新笔记',canonNotes:'新的边界',avatarMediaId:'synthetic-image'};
  for(const [field,value]of Object.entries(changes)){
    const {data,r,event,task}=completed(),before=JSON.stringify({event,task});
    Object.assign(r,{[field]:value});
    assert.deepEqual(collectRoleLife(r,at).events.map(e=>e.id),[event.id],field);
    assert.equal(shown(r).length,1,field);
    assert.ok(personalContext(r,at).includes(event.id),field);
    assert.equal(JSON.stringify({event,task}),before);
    const loaded=normalizeAndMigrateData(JSON.parse(JSON.stringify(data))).roles[0];
    assert.deepEqual(collectRoleLife(loaded,at).events.map(e=>e.id),[event.id]);
    assert.equal(claimLifeTask([loaded],loaded,at+1000,true),null);
  }
});
test('old profile context never supplies current place and is marked in chat and diary materials',()=>{
  const {data,r,event}=completed();
  Object.assign(r,{job:'作家',place:'新山城',relationship:'新关系'});
  assert.equal(routine(r,at).where,'地点尚未确认');
  const chat=buildMessagesForModel(data,r,'chat','记得之前的生活吗',{nowTs:at}).map(m=>m.content).join('\n');
  const diary=buildCharacterDiaryPrompt(r,data.user,toLocalDateKey(at)).messages.map(m=>m.content).join('\n');
  for(const wire of [chat,diary]){
    assert.match(wire,/作家/);assert.match(wire,/新山城/);assert.match(wire,/新关系/);
    assert.ok(wire.includes('[生活记录 '+event.id+' ·'));
    assert.match(wire,/旧档案历史/);
  }
  assert.match(chat,/身份：作家/);
  assert.doesNotMatch(chat,/此刻地点：旧港口/);
  assert.equal(collectRoleLife(r,at).historicalProfileEventIds.has(event.id),true);
});
test('Scene retrieval validates against original evidence even when its source is omitted as an existing bridge',()=>{
  const {data,r,event}=completed(true);
  r.name='合成新名';
  const source=r.chats[0];
  r.scene={id:'history-scene',where:'当前见面地点',startedAt:source.at-1,messages:[
    {...source,id:'bridged-message',sourceMessageId:source.id,kind:'scene'},
  ]};
  const wire=buildMessagesForModel(data,r,'scene','合成材料',{nowTs:at}).map(m=>m.content).join('\n');
  assert.ok(wire.includes(event.id));
  assert.match(wire,/旧档案历史/);
  assert.match(wire,/此刻地点：当前见面地点/);
});
test('a well-formed profile JSON cannot replace the completed task and event ownership proof',()=>{
  const alterations:((r:RoleData,e:EventRecord)=>void)[]=[
    r=>{r.lifeTasks=[];},
    r=>{r.lifeTasks={} as never;},
    r=>{r.lifeTasks![0].status='attempted';},
    r=>{r.lifeTasks![0].roleId='another-role';},
    r=>{r.lifeTasks!.push(structuredClone(r.lifeTasks![0]));},
    r=>{r.lifeTasks![0].eventIds=[];},
    r=>{r.lifeTasks![0].eventIds=['foreign:event:0'];},
    r=>{r.lifeTasks![0].from=at;},
    r=>{r.lifeTasks![0].to=at-30*60000;},
    (r,e)=>{
      const task=r.lifeTasks![0];
      task.dateKey='2026-99-99';task.id='life:'+r.id+':'+task.dateKey;
      e.id=task.id+':event:0';task.eventIds=[e.id];
      e.source='autonomous-life-v1:'+task.id;e.lifeRecord!.taskId=task.id;
    },
    (r,e)=>{e.id='arbitrary-event-id';r.lifeTasks![0].eventIds=[e.id];},
    (_r,e)=>{e.lifeRecord!.roleId='another-role';},
    (_r,e)=>{e.lifeRecord!.taskId='another-task';},
    (_r,e)=>{e.lifeRecord!.sources[0].id='another-role';},
    (_r,e)=>{e.lifeRecord!.sources[0].at=at-1;},
    (_r,e)=>{e.lifeRecord!.sources[0].version='[]';},
    (_r,e)=>{e.lifeRecord!.sources[0].version='{"name":"合成"}';},
    (_r,e)=>{e.lifeRecord!.sources[0].version=JSON.stringify(['合成',1,null,null,null,null,null,null]);},
    (_r,e)=>{e.lifeRecord!.sources=[];},
    (_r,e)=>{e.source='unverified-cache';},
    (_r,e)=>{e.lifeEvidence=undefined;},
    (_r,e)=>{e.knownBy=['user'];},
    (_r,e)=>{e.status='retracted';},
    (_r,e)=>{e.status='deleted' as never;},
    (_r,e)=>{e.lifeRecord!.origin='guess' as never;},
    (_r,e)=>{e.lifeRecord!.action='death';},
    (_r,e)=>{e.lifeRecord!.until=e.at+hour;},
    (r,e)=>{r.events.push(structuredClone(e));},
  ];
  for(const [i,alter]of alterations.entries()){
    const {r,event}=completed();r.name='合成新名';alter(r,event);
    const before=JSON.stringify(r);
    assert.doesNotThrow(()=>collectRoleLife(r,at),String(i));
    assert.equal(collectRoleLife(r,at).events.length,0,'invalid proof '+i);
    assert.equal(JSON.stringify(r),before);
  }
});
test('edited and withdrawn actual sources stay invalid even after a profile update',()=>{
  for(const change of ['edit','retract','version','cycle']){
    const {r,event}=completed(true);
    assert.equal(collectRoleLife(r,at).events.length,2);
    r.name='合成新名';
    if(change==='edit')editMessage(r,'chat','basis-message','合成材料尚未备好。',at+1);
    if(change==='retract')retractMessage(r,'chat','basis-message',at+1);
    if(change==='version')event.lifeRecord!.sources.find(s=>s.kind==='event')!.version='wrong-version';
    if(change==='cycle')event.lifeRecord!.sources.push({kind:'event',id:event.id,at:event.at,version:'cycle'});
    assert.ok(!collectRoleLife(r,at+2).events.some(e=>e.id===event.id),change);
    assert.ok(r.events.some(e=>e.id===event.id),change);
  }
});
test('ongoing tasks retain strict current-profile validation while new tickets may cite dated history',()=>{
  const {r}=completed();r.name='合成新名';
  const ticket=preparePersonalReply(r,[],at,'next').ticket;
  assert.equal(personalTicketValid(r,ticket),true);
  r.job='新职业';
  assert.equal(personalTicketValid(r,ticket),false);
  const fresh=fixture(),task=claimLifeTask([fresh.r],fresh.r,at,true)!;
  const prepared=prepareLifeTask(fresh.r,fresh.data.user,task);
  fresh.r.relationship='请求期间改变';
  assert.equal(lifeTaskValid(fresh.r,task,prepared),false);
  assert.throws(()=>commitLifeTask(fresh.r,task,prepared,JSON.stringify({requestId:task.id,roleId:fresh.r.id,events:[]}),at));
  assert.deepEqual(fresh.r.events,[]);
});
test('new life uses a dated old event only as historical material, not current-location proof',()=>{
  const {data,r,event}=completed();
  r.place='新山城';
  const next=at+25*hour,task=claimLifeTask([r],r,next,true)!;
  assert.ok(task);
  const prepared=prepareLifeTask(r,data.user,task);
  const wire=JSON.parse(prepared.messages[1].content);
  assert.match(wire.sources.find((s:{id:string})=>s.id==='event:'+event.id).context,/旧档案历史/);
  assert.equal(lifeTaskValid(r,task,prepared),true);
  const output={requestId:task.id,roleId:r.id,events:[{at:next-hour,action:'walk',durationMinutes:5,location:{sourceId:'event:'+event.id,quote:'旧港口'}}]};
  assert.throws(()=>commitLifeTask(r,task,prepared,JSON.stringify(output),next));
  assert.equal(r.events.length,1);
});
test('foreign, missing and subjective records cannot gain historical standing through the adapter',()=>{
  const {r,event}=completed(),other=fixture().r;
  other.id='another-role';other.events=[structuredClone(event)];other.lifeTasks=structuredClone(r.lifeTasks);
  assert.deepEqual(collectRoleLife(other,at).events,[]);
  const sameId=fixture().r;sameId.events=[structuredClone(event)];
  assert.deepEqual(collectRoleLife(sameId,at).events,[]);
  assert.deepEqual(collectRoleLife(fixture().r,at).events,[]);
  const fake=structuredClone(event);delete fake.lifeRecord;
  r.events=[fake];assert.deepEqual(collectRoleLife(r,at).events,[]);
});
test('an existing event reserves its task identity without certifying an orphan or regenerating it',()=>{
  const {r,event}=completed();
  r.lifeTasks=[];
  const stored=JSON.stringify(r);
  assert.equal(claimLifeTask([r],r,at,true),null);
  assert.equal(collectRoleLife(r,at).events.length,0);
  assert.equal(r.events[0].id,event.id);
  assert.equal(JSON.stringify(r),stored);
});
test('a diary excerpt cannot restore an orphaned life event through its source-event list',()=>{
  const {r,event}=completed();
  r.lifeTasks=[];
  r.diaries=[{id:'derived-diary',speaker:'char',source:'ai',text:'UNVERIFIED_DIARY',at:at+1,generatedAt:at+1,sourceEventIds:[event.id]}];
  const before=JSON.stringify(r);
  assert.deepEqual(personalDiaries(r,at+2),[]);
  assert.doesNotMatch(personalContext(r,at+2),/UNVERIFIED_DIARY/);
  assert.equal(JSON.stringify(r),before);
});
test('preserved history cannot make an outreach prepared under obsolete current-profile context valid',()=>{
  for(const alreadyHistorical of [false,true]){
    const {r}=completed();
    r.chats=[{id:'prior-contact',speaker:'char',text:'合成的旧联系',at:at-8*hour}];
    if(alreadyHistorical)r.job='作家';
    const task=claimProactive([r],r,at,true)!;
    assert.ok(task);assert.equal(proactiveTaskValid(r,task),true);
    r.job='另一个新职业';
    assert.equal(collectRoleLife(r,at).events.length,1);
    assert.equal(proactiveTaskValid(r,task),false);
  }
});
