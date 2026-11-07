import test from 'node:test';
import assert from 'node:assert/strict';
import {chatWindow,timelineKey} from './chatWindow';
import type {MeetingTimelineItem} from './meetingHistory';
const items=(count:number):MeetingTimelineItem[]=>Array.from({length:count},(_,i)=>({kind:'message',id:'m'+i,at:i,message:{id:'m'+i,speaker:'me',at:i,text:String(i)}}));
test('initial window is 80 entries and older windows retain every stored item',()=>{
 const all=items(6000),original=JSON.stringify(all);let first=chatWindow(all);
 assert.equal(first.start,5920);assert.equal(first.items.length,80);
 while(first.start>0)first=chatWindow(all,{key:timelineKey(all[Math.max(0,first.start-80)]),at:all[Math.max(0,first.start-80)].at});
 assert.equal(first.items.length,6000);assert.equal(JSON.stringify(all),original);
});
test('append, withdrawal and regeneration keep an existing oldest identity',()=>{
 const all=items(200),start={key:timelineKey(all[120]),at:120};
 assert.equal(chatWindow([...all,...items(1).map(i=>({...i,id:'new',at:201}))],start).items.length,81);
 assert.equal(chatWindow(all.filter(x=>x.id!=='m2'),start).items[0].id,'m120');
 assert.equal(chatWindow(all.filter(x=>x.id!=='m120'),start).items[0].id,'m121');
});
test('meeting/message identities and equal timestamps do not collapse records',()=>{
 const all=items(3);all.splice(1,0,{kind:'meeting',id:'m0',at:0,scene:{id:'m0'} as never});all.push({...all[0]});
 assert.notEqual(timelineKey(all[0]),timelineKey(all[1]));assert.equal(chatWindow(all).items.length,5);
});
