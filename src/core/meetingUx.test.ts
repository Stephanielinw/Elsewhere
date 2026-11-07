import test from 'node:test';
import assert from 'node:assert/strict';
import {createRole,defaults,normalizeAndMigrateData} from './defaults';
import {meetingTimeline,archiveMeeting} from './meetingHistory';
import {logsForDay,logDays,logTimestamp} from './systemLogs';
import {createNovelTasks} from './novelGeneration';
const at=new Date(2026,9,31,15).getTime();
function fixture(){const r=createRole('合成角色','','职业','自然','地点');r.chats=[{id:'phone',speaker:'me',text:'PHONE_ONLY',at:at-2000}];r.events=[];r.meetings=[];r.scene={id:'scene-1',startedAt:at-1000,where:'约定庭院',messages:[{id:'a',speaker:'me',text:'SCENE_ONLY',at:at-500},{id:'b',speaker:'char',text:'已保存小说',at}]};return r;}
test('meeting archive is atomic, idempotent and never copies novel text into phone messages',()=>{
 const r=fixture(),before=JSON.stringify(r),phone=JSON.stringify(r.chats);
 assert.throws(()=>archiveMeeting(r,at+1000,()=>false),/保存/);assert.equal(JSON.stringify(r),before);
 const scene=archiveMeeting(r,at+1000,()=>true);assert.equal(scene?.id,'scene-1');assert.equal(r.scene,null);assert.equal(r.meetings?.length,1);assert.equal(JSON.stringify(r.chats),phone);
 assert.equal(archiveMeeting(r,at+2000,()=>true),null);assert.equal(r.meetings?.length,1);
});
test('timeline references archives by Scene ID, preserves chronology and survives backup normalization',()=>{
 const r=fixture();archiveMeeting(r,at+1000,()=>true);r.chats.push({id:'later',speaker:'char',text:'LATER_PHONE',at:at+2000});
 const data=defaults();data.roles=[r];const restored=normalizeAndMigrateData(JSON.parse(JSON.stringify(data))).roles[0];
 const items=meetingTimeline(restored);assert.deepEqual(items.map(v=>v.kind),['message','meeting','message']);
 assert.equal(items[1].kind==='meeting'&&items[1].scene.id,'scene-1');assert.equal(items[1].at,at+1000);
 restored.meetings!.push(structuredClone(restored.meetings![0]));assert.equal(meetingTimeline(restored).filter(v=>v.kind==='meeting').length,1);
});
test('navigation or draft changes do not invalidate scene task, but ending does',()=>{
 const r=fixture(),tasks=createNovelTasks(),task=tasks.begin(r,'scene');r.scene!.draft='未发送草稿';
 assert.equal(tasks.valid(task,r,r.id),true);const id=r.scene!.id;assert.equal(r.scene!.id,id);
 archiveMeeting(r,at+1000,()=>true);assert.equal(tasks.valid(task,r,r.id),false);
});
test('daily logs use local calendar dates, preserve history and stable timestamp order without mutation',()=>{
 const yesterday=new Date(2026,9,30,23,59).getTime(),today=new Date(2026,9,31,0,0).getTime();
 const logs=[{id:'a',at:yesterday,roleId:null,type:'test',detail:'yesterday'},{id:'b',at:today,roleId:null,type:'test',detail:'today'},{id:'c',at:today,roleId:null,type:'test',detail:'same time'}],before=JSON.stringify(logs);
 assert.deepEqual(logsForDay(logs,'2026-10-31').map(l=>l.id),['c','b']);assert.deepEqual(logsForDay(logs,'2026-10-30').map(l=>l.id),['a']);assert.deepEqual(logDays(logs,today),['2026-10-31','2026-10-30']);
 assert.equal(JSON.stringify(logs),before);assert.match(logTimestamp(today),/2026.*10.*31.*00:00/);
});

import {meetingCardHtml,meetingRecordHtml} from '../meetingHistoryView';
import {retractMessage} from './revisions';
test('archive view is readonly, escapes novel content, and respects active revisions',()=>{
 const r=fixture();r.scene!.messages[1].text='<img src=x onerror=alert(1)>正文';r.scene!.messages.push({id:'gone',speaker:'char',text:'RETRACTED_TEXT',at,status:'retracted'});
 const scene=archiveMeeting(r,at+1000,()=>true)!;const html=meetingRecordHtml(r,scene),card=meetingCardHtml(scene,r);
 assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));assert.ok(!html.includes('RETRACTED_TEXT'));assert.ok(!/data-action="(?:regenmsg|starteditmsg|resume)|<form/.test(html));
 assert.ok(card.includes('data-id="scene-1"'));assert.ok(!card.includes('正文'));assert.ok(card.includes('约定庭院'));
 assert.match(card,/^<button type="button"/);assert.match(card,/data-action="viewmeeting"/);assert.ok(card.includes(r.name));assert.ok(!card.includes('<details'));
 retractMessage({...r,scene},'scene','a',at+2000);assert.ok(!meetingRecordHtml(r,scene).includes('SCENE_ONLY'));
});
test('draft and archive references survive original JSON backup normalization without mutating preset or phone data',()=>{
 const data=defaults(),r=fixture();r.scene!.draft='未发送的现场草稿';data.roles=[r];const before=JSON.stringify(data.preset);
 const restored=normalizeAndMigrateData(JSON.parse(JSON.stringify(data))).roles[0];assert.equal(restored.scene?.draft,'未发送的现场草稿');assert.equal(restored.scene?.id,'scene-1');assert.equal(restored.chats[0].text,'PHONE_ONLY');assert.equal(JSON.stringify(data.preset),before);
});
test('archive collision and thrown save failure retain original live scene and all existing records',()=>{
 const r=fixture(),live=r.scene;r.meetings=[structuredClone(r.scene!)];const before=JSON.stringify(r);assert.throws(()=>archiveMeeting(r,at+1000,()=>true),/ID/);assert.equal(JSON.stringify(r),before);
 r.meetings=[];const state=JSON.stringify(r);assert.throws(()=>archiveMeeting(r,at+1000,()=>{throw Error('save failed');}),/save failed/);assert.equal(JSON.stringify(r),state);assert.equal(r.scene,live);
});
