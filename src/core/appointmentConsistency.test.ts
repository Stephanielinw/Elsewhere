import test from 'node:test';
import assert from 'node:assert/strict';
import {createRole} from './defaults';
import {meetingPlan,createEncounter,appointmentReservation,appointmentOverlaps} from './encounter';
import {scenePlaceAt} from './messageProvenance';

const afternoon=new Date(2026,10,21,15,0).getTime();
const evening=new Date(2026,10,21,18,5).getTime();
function role() {
  const r=createRole('测试角色','','巡警','独立','现代美国');
  r.chats=[];r.events=[];r.diaries=[];r.meetings=[];
  return r;
}
function say(r:ReturnType<typeof role>,id:string,speaker:'me'|'char',text:string,at:number) {
  r.chats.push({id,speaker,text,at,kind:'chat'});
}

test('a pickup promise is a real, timed appointment and reserves the meeting window',()=>{
  const r=role();
  say(r,'u','me','今天傍晚在日落大道接我好吗？',afternoon);
  say(r,'c','char','好，我去日落大道接你。',afternoon+60000);
  const plan=meetingPlan(r,evening);
  assert.equal(plan?.status,'confirmed');
  assert.equal(plan?.where,'日落大道');
  const slot=appointmentReservation(r,evening);
  assert.equal(slot?.where,'日落大道');
  assert.equal(appointmentOverlaps(r,evening,evening,evening+60000),true);
  assert.equal(appointmentOverlaps(r,evening,afternoon,afternoon+60000),false);
  const scene=createEncounter(r,null,evening,'new');
  assert.equal(scene?.where,'日落大道');
  assert.equal(scene?.locationEvidence?.origin,'agreement');
  assert.equal(scene?.agreement?.status,'confirmed');
});

test('a manually opened meeting uses the place both discussed for pickup, without fabricating agreement',()=>{
  const r=role();
  say(r,'u','me','我要去日落大道看电影。',afternoon);
  say(r,'c','char','我来日落大道接你。',afternoon+60000);
  assert.equal(meetingPlan(r,afternoon+2*60000)?.status,'proposed');
  const scene=createEncounter(r,null,afternoon+3*60000,'new');
  assert.equal(scene?.where,'日落大道');
  assert.equal(scene?.locationEvidence?.origin,'generated');
  assert.equal(scene?.agreement,undefined);
  r.scene=scene!;
  assert.equal(scenePlaceAt(r,scene!,afternoon+3*60000),'日落大道');
});

test('one-sided pickup offers, cancellations and old messages never force the entry location',()=>{
  const r=role();
  say(r,'c','char','我来日落大道接你。',afternoon);
  assert.equal(createEncounter(r,null,afternoon+60000,'one-sided')?.where,'地点待确认');
  say(r,'u','me','不去了，取消见面。',afternoon+120000);
  assert.equal(meetingPlan(r,afternoon+180000)?.status,'cancelled');
  assert.equal(createEncounter(r,null,afternoon+180000,'cancelled')?.where,'地点待确认');

  const old=role();
  say(old,'u','me','我要去日落大道看电影。',afternoon-9*3600000);
  say(old,'c','char','我来日落大道接你。',afternoon-9*3600000+60000);
  assert.equal(createEncounter(old,null,afternoon,'old')?.where,'地点待确认');
});

test('opening another meeting cannot rewrite an existing live scene',()=>{
  const r=role(),existing={id:'existing',where:'郊区临街快速公路',startedAt:afternoon,messages:[]};
  r.scene=existing;
  say(r,'u','me','日落大道见面好吗？',afternoon);
  say(r,'c','char','好，在日落大道等你。',afternoon+60000);
  assert.equal(createEncounter(r,null,afternoon+120000,'new'),null);
  assert.equal(r.scene,existing);
  assert.equal(r.scene.where,'郊区临街快速公路');
});
