import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,createRole} from './defaults';
import {worldDay,worldDate,worldHour} from './worldClock';
import {prepareTimeline,applyTimeline,advanceTimeline,timelineState,resolveDiaryLife,attachThoughts,replyThought} from './worldTimeline';
import {collectRoleLife} from './roleLife';
import {getRoleKnownEvents} from './diary';

const minute=60_000,hour=60*minute;
const midnight=Date.parse('2026-11-09T08:00:00Z'), zone='America/Los_Angeles';
function setup(){
 const data=defaults(),role=createRole('苏','', '','','旧城咖啡馆');
 role.chats=[];role.events=[];role.diaries=[];data.roles=[role];data.worldTimeZone=zone;
 return {data,role};
}

test('world day keeps stable absolute boundaries and distinguishes both repeated hours',()=>{
 assert.equal(worldDate(midnight,zone),'2026-11-09');
 assert.equal(worldDay('2026-11-09',zone).startMs,midnight);
 const fall=worldDay('2026-11-01',zone),spring=worldDay('2026-03-08',zone);
 assert.equal(fall.endMs-fall.startMs+1,25*hour);
 assert.equal(spring.endMs-spring.startMs+1,23*hour);
 assert.notEqual(worldHour(fall.startMs+hour,zone),worldHour(fall.startMs+2*hour,zone));
});

test('one response covers 15 hours and the local executor starts two plans without a task receipt',()=>{
 const {data,role}=setup(),at=midnight+15*hour;
 const prepared=prepareTimeline(data,role,at,'req','chat');
 assert.ok(prepared);
 assert.deepEqual(prepared.ticket.gaps,[[0,900]]);
 const result=applyTimeline(role,prepared.ticket,{
  requestId:'req',roleId:role.id,life:[
   {id:'sleep',from:0,to:480,action:'sleep',where:'旧城咖啡馆'},
   {id:'work',from:480,to:900,action:'work',where:'旧城咖啡馆'},
   {id:'coffee',from:940,to:955,action:'drink',where:'旧城咖啡馆'},
   {id:'shop',from:960,to:980,action:'shop',where:'旧城咖啡馆'},
  ],
 },at);
 assert.equal(result.accepted.size,4);
 assert.equal(collectRoleLife(role,at).events.length,2);
 assert.equal(getRoleKnownEvents(role).length,2);
 assert.equal(result.accepted.get('coffee')?.lifeEvidence,undefined);
 assert.equal(timelineState(role,at),undefined);
 advanceTimeline(role,midnight+940*minute,true);
 assert.equal(timelineState(role,midnight+941*minute)?.label,'喝咖啡');
 advanceTimeline(role,midnight+960*minute,true);
 assert.equal(timelineState(role,midnight+961*minute)?.label,'购买日用品');
 assert.equal(collectRoleLife(role,midnight+961*minute).events.length,4);
 assert.equal(role.lifeTasks?.length||0,0);
});

test('diary rejects unaccepted or future references without exposing them as facts',()=>{
 const {data,role}=setup(),at=midnight+21*hour,prepared=prepareTimeline(data,role,at,'diary','diary')!;
 const result=applyTimeline(role,prepared.ticket,{requestId:'diary',roleId:role.id,life:[
  {id:'sleep',from:0,to:480,action:'sleep'},
  {id:'unknown',from:480,to:500,action:'pledge'},
  {id:'future',from:1290,to:1320,action:'read'},
 ]},at);
 assert.equal(result.rejected,1);
 assert.equal(resolveDiaryLife('[[life:sleep]]\n\n[[life:unknown]]\n\n[[life:future]]',result,at),'我睡觉休息。');
 assert.equal(resolveDiaryLife('我答应了一个重大承诺：[[life:unknown]]',result,at),null);
});

test('thoughts bind individual bubbles and invalidate the whole response on revision',()=>{
 const {role}=setup();
 const a={id:'a',speaker:'char' as const,text:'在这里。',at:midnight,replyTurnId:'t'};
 const b={id:'b',speaker:'char' as const,text:'等我一会。',at:midnight,replyTurnId:'t'};
 role.chats=[a,b];
 attachThoughts(role,[a,b],{requestId:'req',roleId:role.id,thought:'我得缓一缓。',thoughts:[{index:0,anchor:'在这里。',text:'我不想离开。'}]},'req');
 assert.deepEqual(replyThought(role,a),{text:'我不想离开。',scope:'message'});
 assert.deepEqual(replyThought(role,b),{text:'我得缓一缓。',scope:'turn'});
 a.text='新版本。';
 assert.equal(replyThought(role,b),undefined);
});

test('running cafe activity passes verified location into the meeting and ends at its start',async()=>{
 const {data,role}=setup(),at=midnight+940*minute;
 const prepared=prepareTimeline(data,role,at,'cafe','chat')!;
 const result=applyTimeline(role,prepared.ticket,{requestId:'cafe',roleId:role.id,life:[{id:'drink',from:940,to:960,action:'drink',where:'旧城咖啡馆'}]},at);
 assert.equal(result.accepted.size,1);
 const {createEncounter,encounterEntryContext}=await import('./encounter');
 const {scenePlaceAt}=await import('./messageProvenance');
 const scene=createEncounter(role,null,at+minute,'new-scene');
 assert.equal(scene?.where,'旧城咖啡馆');role.scene=scene;
 advanceTimeline(role,at+minute+1000,true);
 assert.equal(result.accepted.get('drink')?.lifeRecord?.until,at+minute);
 assert.equal(scenePlaceAt(role,scene!,at+2*minute),'旧城咖啡馆');
 assert.match(encounterEntryContext(role,at+2*minute)!,/当时活动：喝咖啡/);
});

test('retroactive activity cannot jump to another location without time and travel',()=>{
 const {data,role}=setup(),at=midnight+15*hour;role.place='旧城';
 const {ticket}=prepareTimeline(data,role,at,'route','chat')!;
 const result=applyTimeline(role,ticket,{requestId:'route',roleId:role.id,life:[
  {id:'work',from:0,to:60,action:'work',where:'旧城的工作地点'},
  {id:'jump',from:60,to:65,action:'drink',where:'旧城的咖啡馆'},
  {id:'travel',from:65,to:85,action:'travel',where:'旧城的工作地点',destination:'旧城的咖啡馆'},
  {id:'drink',from:85,to:90,action:'drink',where:'旧城的咖啡馆'},
 ]},at);
 assert.deepEqual([...result.accepted.keys()],['work','travel','drink']);
 assert.equal(result.rejected,1);
});

test('only a truncation visibly inside the optional suffix can recover public text',async()=>{
 const {parseChatResponse}=await import('./chatBatchPrompt');
 const body=(content:string)=>({choices:[{finish_reason:'length',message:{role:'assistant',content}}]});
 assert.equal(parseChatResponse(body('公开正文。<elsewhere_private_state>{"thought":'),true),'公开正文。');
 assert.throws(()=>parseChatResponse(body('不完整的正文'),true));
 assert.throws(()=>parseChatResponse(body('公开正文。<elsewhere_private_state>{}'),false));
});

test('current location does not validate a candidate that contradicts the public action',()=>{
 const {data,role}=setup(),at=midnight+940*minute;
 const {ticket}=prepareTimeline(data,role,at,'current','chat')!;
 const result=applyTimeline(role,ticket,{requestId:'current',roleId:role.id,life:[
  {id:'coffee',from:940,to:970,action:'drink',where:'旧城咖啡馆'},
 ]},at,[],'我正在工作。等我一会。');
 assert.equal(result.accepted.size,0);
 assert.equal(result.rejected,1);
});
