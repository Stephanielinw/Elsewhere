import test from 'node:test';
import assert from 'node:assert/strict';
import {createRole,defaults,normalizeAndMigrateData} from './defaults';
import {routine} from './prompt';
import {createEncounter,updateEncounterLocation} from './encounter';
import {createNovelTasks} from './novelGeneration';
const at=new Date(2026,9,31,15).getTime();
function fixture(){const r=createRole('Telemachus','','古希腊伊萨卡王子','谨慎','伊萨卡');r.chats=[];r.events=[];r.diaries=[];r.scene={id:'live',where:'咖啡馆',startedAt:at-1000,messages:[{id:'old',speaker:'char',text:'原小说里曾出现咖啡馆',at:at-500}]};r.meetings=[{id:'archive',where:'旧咖啡馆记录',startedAt:at-3000,endedAt:at-2000,messages:[]}];return r;}
test('only explicit current-Scene correction changes place, preserving identity, original text, agreement and archives',()=>{
 const r=fixture(),scene=r.scene!,messages=JSON.stringify(scene.messages),archive=JSON.stringify(r.meetings);
 scene.agreement={status:'confirmed',where:'码头',proposedBy:'me',acceptedBy:['me','char'],sources:[]};const agreement=JSON.stringify(scene.agreement);
 assert.equal(scene.where,'咖啡馆');assert.equal(updateEncounterLocation(r,scene,'咖啡馆',' 伊萨卡王宫 ',at,()=>true),true);
 assert.equal(r.scene,scene);assert.equal(scene.id,'live');assert.equal(scene.where,'伊萨卡王宫');assert.equal(JSON.stringify(scene.messages),messages);assert.equal(JSON.stringify(r.meetings),archive);assert.equal(JSON.stringify(scene.agreement),agreement);assert.ok(r.events.at(-1)?.detail.includes('咖啡馆'));assert.ok(r.events.at(-1)?.knownBy?.includes(r.id));
 const data=defaults();data.roles=[r];assert.equal(normalizeAndMigrateData(JSON.parse(JSON.stringify(data))).roles[0].scene?.where,'伊萨卡王宫');
});
test('invalid, stale, closed or failed place edits never overwrite existing data',()=>{
 const r=fixture(),scene=r.scene!,before=JSON.stringify(r);
 for(const value of ['', '  ', 'a'.repeat(121), '王宫\n大殿'])assert.throws(()=>updateEncounterLocation(r,scene,'咖啡馆',value,at,()=>true));
 assert.throws(()=>updateEncounterLocation(r,scene,'其他旧值','王宫',at,()=>true));
 assert.throws(()=>updateEncounterLocation(r,scene,'咖啡馆','王宫',at,()=>false),/保存/);
 assert.equal(JSON.stringify(r),before);assert.equal(updateEncounterLocation(r,scene,'咖啡馆','咖啡馆',at,()=>true),false);
 r.scene=null;assert.throws(()=>updateEncounterLocation(r,scene,'咖啡馆','王宫',at,()=>true));assert.equal(scene.where,'咖啡馆');
});
test('a corrected location invalidates pending scene result without cancelling an unrelated play task',()=>{
 const r=fixture(),tasks=createNovelTasks(),sceneTask=tasks.begin(r,'scene');updateEncounterLocation(r,r.scene!,'咖啡馆','王宫',at,()=>true);assert.equal(tasks.valid(sceneTask,r,r.id),false);tasks.cancel(r.id,'scene');
 r.play={id:'play',title:'戏剧',world:'虚构',user:'乙',char:'甲',startedAt:at-1000,messages:[]};const playTask=tasks.begin(r,'play');assert.equal(tasks.cancel(r.id,'scene'),false);assert.equal(tasks.valid(playTask,r,r.id),true);tasks.cancel(r.id,'play');
});
test('new encounters use confirmed agreement or neutral unknown; legacy saved places are never automatically rewritten',()=>{
 const r=fixture();r.scene=null;const unknown=createEncounter(r,null,at,'manual');assert.equal(unknown?.where,'地点待确认');
 r.chats=[{id:'u',speaker:'me',text:'现在在伊萨卡王宫见面好吗？',at:at-1000},{id:'c',speaker:'char',text:'好，在伊萨卡王宫等你。',at:at-500}];const scene=createEncounter(r,null,at,'agreed');assert.equal(scene?.where,'伊萨卡王宫');
 for(let hour=0;hour<24;hour++)assert.doesNotMatch(JSON.stringify(routine(r,new Date(2026,9,31,hour).getTime())),/咖啡馆|下班|街区|工作地点/);
 assert.equal(r.meetings?.[0].where,'旧咖啡馆记录');
});
