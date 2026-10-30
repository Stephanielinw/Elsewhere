import test from 'node:test';
import assert from 'node:assert/strict';
import {createRole,defaults} from './defaults';
import {buildGroundedDailyFootprints} from './footprints';
import {toLocalDateKey} from './diary';
import {monitorItemsForDisplay,newestMonitorFirst} from './monitorPresentation';

test('monitor chat descriptions use the saved username and active evidence, without location or invented actions',()=>{
 const role=createRole('合成角色','','职业','自然','美国密歇根州'),user={...defaults().user,name:'当前姓名'},now=Date.now();role.chats=[{id:'u',speaker:'me',text:'那封信寄到哪里去？🙂',at:now-2000},{id:'c',speaker:'char',text:'我还没寄出。',at:now-1000}];role.events=[];role.userAlias='旧称呼';
 const archive=buildGroundedDailyFootprints(role,toLocalDateKey(now),now),before=JSON.stringify({role,archive});
 const shown=monitorItemsForDisplay(role,user,archive.items,now)[0];assert.ok(shown.summary.includes('与当前姓名线上联络'));assert.ok(shown.summary.includes('信件'));assert.ok(!shown.summary.includes('密歇根'));assert.ok(!shown.summary.includes('那封信寄到哪里去'));assert.equal(shown.innerThought?.surfaceState,shown.summary);assert.deepEqual(shown.rawTranscript,archive.items[0].rawTranscript);assert.equal(JSON.stringify({role,archive}),before);
 role.chats.forEach(m=>m.status='retracted');assert.equal(monitorItemsForDisplay(role,user,archive.items,now)[0].summary,'暂无可确认的活动记录');
});
test('monitor ignores future/private sources and unconfirmed routine projections even in cached AI cards',()=>{
 const role=createRole('合成角色','','职业','自然','地点'),user=defaults().user,now=Date.now();role.chats=[];role.events=[{id:'projection',kind:'life',title:'吃饭',detail:'正在国外吃饭',at:now-1000},{id:'secret',kind:'focus',title:'私密',detail:'私密',at:now-500,knownBy:['another-role']},{id:'future',kind:'focus',title:'未来',detail:'未来',at:now+10000}];
 const item=buildGroundedDailyFootprints(role,toLocalDateKey(now),now).items[0];assert.ok(item);item.summary='AI 声称已经出门消费';item.innerThought!.surfaceState='凭空编造的动作';
 for(const ids of [['projection'],['secret'],['future']]){const shown=monitorItemsForDisplay(role,user,[{...item,sourceEventIds:ids}],now)[0];assert.equal(shown.confirmed,false);assert.equal(shown.summary,'暂无可确认的活动记录');}
});
test('monitor newest-first sorting uses numeric timestamps and stable ID ties without mutating archives or transcripts',()=>{
 const rows=[{id:'b',timestamp:20},{id:'old',timestamp:3},{id:'a',timestamp:20}];const before=JSON.stringify(rows);assert.deepEqual(newestMonitorFirst(rows).map(x=>x.id),['a','b','old']);assert.equal(JSON.stringify(rows),before);
 assert.deepEqual(newestMonitorFirst([{id:'old',at:9},{id:'new',at:100}]).map(x=>x.id),['new','old']);
});
test('edited messages remain usable while superseded event copies and private sources do not become evidence',()=>{
 const role=createRole('合成角色','','职业','自然','地点'),user={...defaults().user,name:'新姓名'},now=Date.now();
 role.chats=[{id:'u',speaker:'me',text:'我相信明天会更好。',at:now-2000},{id:'c',speaker:'char',text:'嗯，我也是。',at:now-1000}];
 role.events=[{id:'old',kind:'chat',title:'旧版',detail:'旧版',at:now-2000,messageId:'u',status:'superseded',knownBy:[role.id]},{id:'new',kind:'chat',title:'新版',detail:role.chats[0].text,at:now-2000,messageId:'u',knownBy:[role.id]}];
 const archive=buildGroundedDailyFootprints(role,toLocalDateKey(now),now),shown=monitorItemsForDisplay(role,user,archive.items,now)[0];
 assert.equal(shown.summary,'与新姓名线上联络。');assert.equal(shown.confirmed,true);
 role.events.push({id:'private',kind:'chat',title:'无权',detail:'无权',at:now-1000,messageId:'c',knownBy:['other']});
 assert.equal(monitorItemsForDisplay(role,user,archive.items,now)[0].summary,'收到新姓名发来的线上消息。');
});
