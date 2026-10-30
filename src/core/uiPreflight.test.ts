import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,makeNain,createRole,STORAGE_KEY} from './defaults';
import {awaitingFirstMessage,awaitingNainOpening,applyGeneratedFirstMessage} from './firstMessage';
import {migrateUntouchedNainDemo,resetNainStart,NAIN_BACKUP_PREFIX} from './nainStart';
import {buildGroundedDailyFootprints,getOrBuildDailyFootprints,buildDailyFootprintsAiPrompt,applyAiDailyFootprints,normalizeInnerMonologue} from './footprints';
import {syncRoleDiaryTasks,toLocalDateKey} from './diary';
import {uploadedStickers} from './stickers';
import type {ChatMessage} from './types';

const seed='那枚红色骰子，我收好了，妈咪。\n\n你让我记得写信，却没告诉我该寄到哪里去。';
const legacy=()=>{const data=defaults(),r=data.roles[0];r.chats=[{id:'demo-seed',speaker:'char',text:seed,at:1000}];r.firstMessageState={status:'ready',updatedAt:1000};return data;};
const store=()=>{const values=new Map<string,string>();return {values,getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};};

test('Nain starts empty with full canon, no diary backfill before opening, and a real opening is applied once',()=>{
  const nain=makeNain(),data=defaults();assert.equal(nain.chats.length,0);assert.equal(awaitingFirstMessage(nain),true);
  assert.equal(nain.firstMessageState?.status,'awaiting_api');assert.ok(nain.profile.includes('约翰'));assert.ok(nain.canonNotes?.includes('不是此时的已发生事实'));
  assert.deepEqual(syncRoleDiaryTasks(nain,{...data.settings,mode:'api',model:'test'},Date.now(),{ensureYesterday:true}),[]);
  applyGeneratedFirstMessage(nain,['真实模型返回的开场'],Date.now());assert.equal(awaitingFirstMessage(nain),false);assert.equal(nain.firstMessageState?.status,'ready');
});

test('one-time seed cleanup saves original first, retains character/media configuration and leaves other roles untouched',()=>{
  const data=legacy(),nain=data.roles[0],other=createRole('其他角色','','测试','','测试地点');data.roles.push(other);
  nain.avatarMediaId='avatar';nain.frameMediaId='frame';nain.frameScale=1.7;nain.notes='用户正式设定';nain.events=[{id:'routine',kind:'life',title:'演示日程',detail:'演示',at:1100}];
  const before=structuredClone(nain),storage=store(),raw=JSON.stringify(data);storage.setItem(STORAGE_KEY,raw);
  const result=migrateUntouchedNainDemo(data,storage,2000,raw);assert.equal(result.cleaned,true);assert.equal(result.data.roles[1],other);assert.deepEqual(nain,before);
  const clean=result.data.roles[0];assert.equal(clean.id,nain.id);assert.equal(clean.profile,nain.profile);assert.equal(clean.canonNotes,nain.canonNotes);assert.equal(clean.relationship,nain.relationship);assert.equal(clean.notes,nain.notes);
  assert.equal(clean.avatarMediaId,'avatar');assert.equal(clean.frameMediaId,'frame');assert.equal(clean.frameScale,1.7);assert.equal(clean.chats.length,0);assert.deepEqual(clean.events,[]);assert.deepEqual(clean.diaryTasks,[]);assert.equal(clean.firstMessageState?.status,'awaiting_api');
  assert.equal(storage.getItem(NAIN_BACKUP_PREFIX+nain.id+':2000'),raw);
  clean.chats.push({id:'real-later',speaker:'char',text:'后来的真实消息',at:3000});
  assert.equal(resetNainStart(result.data,nain.id,storage,4000).cleaned,false);assert.equal(clean.chats[0].id,'real-later');assert.equal(storage.values.size,3);
  const restored=JSON.parse(raw);assert.equal(migrateUntouchedNainDemo(restored,storage,5000).cleaned,false);assert.equal(restored.roles[0].chats[0].id,'demo-seed');
});

test('ambiguous Nain histories are not auto-cleared; backup or main-write failures retain original data',()=>{
  const edited=legacy();edited.roles[0].chats[0].editedAt=2000;assert.equal(migrateUntouchedNainDemo(edited,store(),3000).cleaned,false);
  const ambiguous=legacy();ambiguous.roles[0].chats.push({id:'user',speaker:'me',text:'不可误删',at:2000});const storage=store();
  assert.equal(migrateUntouchedNainDemo(ambiguous,storage,3000).cleaned,false);assert.equal(storage.values.size,0);
  ambiguous.roles[0].demoSample=false;const explicit=resetNainStart(ambiguous,ambiguous.roles[0].id,storage,3000);assert.equal(explicit.cleaned,true);assert.equal(awaitingNainOpening(explicit.data.roles[0]),true);
  const direct=legacy(),raw=JSON.stringify(direct),oldStore=store(),cleaned=resetNainStart(direct,direct.roles[0].id,oldStore,3000,raw);
  migrateUntouchedNainDemo(cleaned.data,oldStore,4000);
  assert.equal(migrateUntouchedNainDemo(JSON.parse(raw),oldStore,5000).cleaned,false);
  for(const failMain of [false,true]){
    const data=legacy(),before=structuredClone(data),raw=JSON.stringify(data),storage=store();storage.setItem(STORAGE_KEY,raw);
    const failed=resetNainStart(data,data.roles[0].id,{getItem:storage.getItem,setItem:(key,value)=>{if(failMain?key===STORAGE_KEY:key.startsWith(NAIN_BACKUP_PREFIX))throw new Error('quota');storage.setItem(key,value);}},3000,raw);
    assert.equal(failed.cleaned,false);assert.ok(failed.error);assert.deepEqual(data,before);assert.equal(storage.getItem(STORAGE_KEY),raw);
  }
});

test('first-person monologues replace analytical AI/cache text without changing raw transcripts',()=>{
  const role=makeNain(),at=Date.now(),day=toLocalDateKey(at);role.chats=[{id:'one',speaker:'me',text:'约翰刚才说什么？',at:at-1000}];
  const grounded=buildGroundedDailyFootprints(role,day,at),item=grounded.items.find(i=>i.category==='interaction')!;
  assert.ok(item.innerThought?.thought.includes('我'));assert.ok(!item.innerThought?.thought.includes('关联片段'));assert.ok(item.innerThought!.thought.length<=90);
  const transcript=structuredClone(item.rawTranscript),fallback=item.innerThought!.thought;
  assert.equal(normalizeInnerMonologue(role,'他其实在意的是我是否认同他。',fallback),fallback);
  assert.equal(normalizeInnerMonologue(role,'我先听着……这句话得记住。',fallback),'我先听着……这句话得记住。');
  const old=structuredClone(grounded);old.aiGeneratedAt=at;old.items[0].innerThought!.thought='奈恩其实在意的是我的态度。';role.footprintsByDate={[day]:old};
  const shown=getOrBuildDailyFootprints(role,day,at);assert.ok(shown.items[0].innerThought?.thought.includes('我'));assert.ok(!shown.items[0].innerThought?.thought.includes('其实在意'));assert.deepEqual(shown.items[0].rawTranscript,transcript);
  const enriched=applyAiDailyFootprints(role,day,JSON.stringify({enrichmentByIndex:[{index:0,innerThought:{surfaceState:'看着屏幕',mood:'平静',thought:'他其实是在分析我。'}}]}),at);
  assert.ok(enriched.archive.items[0].innerThought?.thought.includes('我'));assert.ok(!enriched.archive.items[0].innerThought?.thought.includes('其实'));assert.deepEqual(enriched.archive.items[0].rawTranscript,transcript);
  assert.ok(JSON.stringify(buildDailyFootprintsAiPrompt(role,defaults().user,day,at)).includes('第一人称'));
});

test('sticker gallery is empty by default and only reuses active user-uploaded media without changing histories',()=>{
  assert.deepEqual(uploadedStickers(makeNain().chats),[]);
  const messages:ChatMessage[]=[{id:'old',speaker:'me',kind:'sticker',sticker:'cat',text:'旧表情',at:1},{id:'one',speaker:'me',kind:'sticker',mediaId:'upload',caption:'我的图',text:'',at:2},{id:'two',speaker:'me',kind:'sticker',mediaId:'upload',caption:'我的图',text:'',at:3},{id:'char',speaker:'char',kind:'sticker',mediaId:'not-user',text:'',at:4},{id:'gone',speaker:'me',kind:'sticker',mediaId:'retracted',text:'',at:5,status:'retracted'}];
  const before=structuredClone(messages);assert.deepEqual(uploadedStickers(messages),[{mediaId:'upload',caption:'我的图'}]);assert.deepEqual(messages,before);
});
