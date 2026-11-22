import test from 'node:test';
import assert from 'node:assert/strict';
import {createRole} from './defaults';
import {lifeOverruledByMeeting} from './lifeExecution';
const hour=3600000,at=Date.parse('2026-11-22T02:25:00Z');
const role=()=>{
 const r=createRole('合成巡警','','巡警','认真','浣熊市');r.events=[];r.chats=[];r.diaries=[];
 r.meetings=[{id:'actual-date',where:'Lin家',startedAt:at-3*hour,endedAt:at,messages:[{id:'on-scene',speaker:'char',text:'今天并没有去看电影。',at:at-hour}]}];
 return r;
};
test('an old saved forecast must not overrule a later real scene or its actual ending',()=>{
 const r=role();
 // Forecast was generated before the real scene ended; future simulated drive is stale.
 assert.equal(lifeOverruledByMeeting(r,at-4*hour,at+hour,at+2*hour,at+hour),true);
 // Old simulated event claims the same occupied afternoon.
 assert.equal(lifeOverruledByMeeting(r,at-4*hour,at-2*hour,at-hour,at+hour),true);
 // Before the archived meeting ended, this hindsight exclusion cannot apply.
 assert.equal(lifeOverruledByMeeting(r,at-4*hour,at+hour,at+2*hour,at-hour),false);
});
test('completed life before the encounter and genuinely new plans after remain usable',()=>{
 const r=role();
 assert.equal(lifeOverruledByMeeting(r,at-5*hour,at-6*hour,at-4*hour,at+hour),false);
 assert.equal(lifeOverruledByMeeting(r,at+1000,at+hour,at+2*hour,at+hour),false);
 assert.equal(lifeOverruledByMeeting(r,at-4*hour,at+hour,at+2*hour,at+hour),true);
 const other=createRole('其他角色','','特工','','华盛顿特区');other.meetings=[];assert.equal(lifeOverruledByMeeting(other,at-4*hour,at+hour,at+2*hour,at+hour),false);
});
