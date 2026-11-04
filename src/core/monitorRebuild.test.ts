import test from 'node:test';import assert from 'node:assert/strict';
import {createRole,defaults,normalizeAndMigrateData} from './defaults';import {buildGroundedDailyFootprints,getOrBuildDailyFootprints} from './footprints';import {monitorItemsForDisplay} from './monitorPresentation';import {toLocalDateKey,syncRoleDiaryTasks} from './diary';
const at=Date.parse('2026-11-03T20:00:00Z');
function fixture(){const data=defaults(),r=createRole('合成记录者','','海港档案记录者','谨慎','古代海港');r.id='actor';r.chats=[];r.events=[];r.diaries=[];r.profile='在海港整理航路记录，和馆员伊洛熟识。';r.canonNotes='远征尚未开始。';data.roles=[r];return {data,r};}
test('a source-confirmed life event survives monitor presentation and retains the same diary source',()=>{
 const {data,r}=fixture();r.events.push({id:'life',kind:'life',title:'航路笔记',detail:'整理了已有的航路笔记。',at:at-1000,source:'manual',lifeEvidence:'confirmed',knownBy:[r.id]});
 const a=buildGroundedDailyFootprints(r,toLocalDateKey(at),at),shown=monitorItemsForDisplay(r,data.user,a.items,at);assert.ok(shown.some(i=>i.confirmed&&i.summary.includes('航路笔记')));assert.ok(!shown.some(i=>i.innerThought));
});
test('many trivial chats do not become a screen of independent life records or fake thoughts',()=>{
 const {data,r}=fixture();for(let i=0;i<120;i++)r.chats.push({id:'m'+i,speaker:i%2?'char':'me',text:'嗯，收到。',at:at-18*3600000+i*500000});
 const before=JSON.stringify(r),a=buildGroundedDailyFootprints(r,toLocalDateKey(at),at);assert.equal(monitorItemsForDisplay(r,data.user,a.items,at).length,0);assert.ok(!JSON.stringify(a).includes('亮底牌'));assert.ok(!a.items.some(i=>i.innerThought));assert.equal(JSON.stringify(r),before);
});
test('old enrichment cache stays stored but cannot supply current facts or private thoughts',()=>{
 const {r}=fixture(),day=toLocalDateKey(at);r.footprintsByDate={[day]:{dateKey:day,updatedAt:at,sourceSignature:'old',aiGeneratedAt:at,items:[{id:'legacy',dateKey:day,timestamp:at,category:'life',title:'旧推测',summary:'UNVERIFIED_LEGACY',icon:'clock',timeLabel:'旧',sourceEventIds:[],sourceMessageIds:[],origin:'ai_enriched',innerThought:{thought:'硬编码想法',mood:'肯定',surfaceState:'假行为'}}]}};
 const before=JSON.stringify(r.footprintsByDate);assert.ok(!JSON.stringify(getOrBuildDailyFootprints(r,day,at)).includes('UNVERIFIED_LEGACY'));assert.equal(JSON.stringify(r.footprintsByDate),before);
});
test('legacy diaries are preserved by loading and daily scheduling without becoming trusted life',()=>{
 const {data,r}=fixture();r.diaries=[{id:'legacy',speaker:'char',source:'life',at:at-86400000,text:'旧版原文，保留归档。'}];const loaded=normalizeAndMigrateData(JSON.parse(JSON.stringify(data)));syncRoleDiaryTasks(loaded.roles[0],loaded.settings,at);assert.ok(loaded.roles[0].diaries.some(d=>d.id==='legacy'));
});
test('homepage activity cannot revive a life event whose confirmed source was edited',async()=>{
 const {r}=fixture(),{routine}=await import('./prompt'),{editMessage}=await import('./revisions');r.chats=[{id:'s',speaker:'char',text:'材料已到',at:at-2000}];r.events=[{id:'e',kind:'life',title:'整理材料',detail:'整理既有材料',at:at-1000,source:'manual',messageId:'s',sourceRevision:0,knownBy:[r.id],lifeEvidence:'confirmed'}];assert.equal(routine(r,at).label,'整理材料');editMessage(r,'chat','s','材料尚未到',at+1);assert.equal(routine(r,at+2).label,'当前活动未确认');
});
