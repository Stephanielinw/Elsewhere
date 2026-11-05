import test from 'node:test';import assert from 'node:assert/strict';
import {defaults,STORAGE_KEY} from './defaults';
import {readStoredSave,SaveSession} from './storageSession';
function fixture(){const values=new Map<string,string>(),store={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};const raw=JSON.stringify(defaults());values.set(STORAGE_KEY,raw);return {values,store,raw};}
function loaded(store:Pick<Storage,'getItem'|'setItem'>){const r=readStoredSave(store);assert.equal(r.state,'loaded');if(r.state!=='loaded')throw Error('fixture');return new SaveSession(store,r);}
test('a valid stored snapshot is read without writing or changing original bytes',()=>{const f=fixture(),r=readStoredSave(f.store);assert.equal(r.state,'loaded');assert.equal(f.values.get(STORAGE_KEY),f.raw);});
test('missing storage is unverified empty; read exceptions are unavailable, never defaults',()=>{const f=fixture();f.values.delete(STORAGE_KEY);assert.equal(readStoredSave(f.store).state,'empty');assert.equal(readStoredSave({getItem:()=>{throw Error('denied');}}).state,'unavailable');assert.equal(f.values.has(STORAGE_KEY),false);});
test('malformed JSON and present but unusable records retain their exact bytes',()=>{for(const raw of ['', '{broken','null','[]','{}','{"roles":{}}','{"roles":[],"settings":null}']){const f=fixture();f.values.set(STORAGE_KEY,raw);assert.equal(readStoredSave(f.store).state,'invalid',raw);assert.equal(f.values.get(STORAGE_KEY),raw);}});
test('an unexpected null or another page update cannot be overwritten by a stale session',()=>{for(const changed of [null,JSON.stringify({...defaults(),selected:'OTHER_TAB'})]){const f=fixture(),s=loaded(f.store);if(changed===null)f.values.delete(STORAGE_KEY);else f.values.set(STORAGE_KEY,changed);assert.equal(s.write(JSON.stringify({...defaults(),selected:'STALE'})),false);assert.equal(f.store.getItem(STORAGE_KEY),changed);assert.equal(s.raw,f.raw);assert.equal(s.error,'changed');}});
test('write failure leaves the confirmed version unchanged and a later explicit retry can succeed',()=>{const f=fixture();let fail=true;const store={...f.store,setItem:(k:string,v:string)=>{if(fail)throw Error('quota');f.store.setItem(k,v);}},s=loaded(store),next=JSON.stringify({...defaults(),selected:'NEW'});assert.equal(s.write(next),false);assert.equal(s.raw,f.raw);assert.equal(f.store.getItem(STORAGE_KEY),f.raw);fail=false;assert.equal(s.write(next),true);assert.equal(s.raw,next);});
test('a write that actually committed before an exception is confirmed by exact readback',()=>{const f=fixture(),s=loaded({...f.store,setItem:(k:string,v:string)=>{f.store.setItem(k,v);throw Error('after commit');}}),next=JSON.stringify({...defaults(),selected:'COMMITTED'});assert.equal(s.write(next),true);assert.equal(s.raw,next);assert.equal(f.store.getItem(STORAGE_KEY),next);});
test('unknown commit outcome freezes writes instead of overwriting possibly committed state',()=>{const f=fixture();let unreadable=false;const store={getItem:(k:string)=>{if(unreadable)throw Error('read unavailable');return f.store.getItem(k);},setItem:(k:string,v:string)=>{f.store.setItem(k,v);unreadable=true;}},s=loaded(store),next=JSON.stringify({...defaults(),selected:'MAYBE_SAVED'});assert.equal(s.write(next),false);assert.equal(s.error,'uncertain');unreadable=false;assert.equal(s.write(f.raw),false);assert.equal(f.store.getItem(STORAGE_KEY),next);});
test('the existing migration adapter obeys the same main-key protection and preserves other keys',()=>{const f=fixture(),s=loaded(f.store);s.storage.setItem('synthetic-backup',f.raw);f.values.set(STORAGE_KEY,'ANOTHER_DOCUMENT');assert.throws(()=>s.storage.setItem(STORAGE_KEY,'replacement'));assert.equal(f.values.get(STORAGE_KEY),'ANOTHER_DOCUMENT');assert.equal(f.values.get('synthetic-backup'),f.raw);});

test('declared history arrays with invalid shapes are not silently replaced by empty defaults',()=>{
 for(const field of ['chats','diaries','events','plays','meetings','pendingReplies','footprintsByDate']){const f=fixture(),d=defaults();(d.roles[0] as unknown as Record<string,unknown>)[field]='CORRUPT_EXISTING_CONTENT';const raw=JSON.stringify(d);f.values.set(STORAGE_KEY,raw);assert.equal(readStoredSave(f.store).state,'invalid',field);assert.equal(f.values.get(STORAGE_KEY),raw);}
});

test('invalid user facts and shared task containers cannot be normalized into empty saved data',()=>{
 for(const field of ['identity','notes','name']){const f=fixture(),d=defaults();(d.user as unknown as Record<string,unknown>)[field]={retained:'ORIGINAL'};const raw=JSON.stringify(d);f.values.set(STORAGE_KEY,raw);assert.equal(readStoredSave(f.store).state,'invalid');assert.equal(f.values.get(STORAGE_KEY),raw);}
 for(const field of ['avatarMediaId','frameId','frameMediaId']){const f=fixture(),d=defaults();(d.roles[0] as unknown as Record<string,unknown>)[field]={retained:'ORIGINAL_MEDIA_REFERENCE'};const raw=JSON.stringify(d);f.values.set(STORAGE_KEY,raw);assert.equal(readStoredSave(f.store).state,'invalid',field);assert.equal(f.values.get(STORAGE_KEY),raw);}
 const f=fixture(),d=defaults();d.sharedTasks={ddl:'ORIGINAL_TASK_BYTES',todo:[]} as never;f.values.set(STORAGE_KEY,JSON.stringify(d));assert.equal(readStoredSave(f.store).state,'invalid');
});

test('API settings keep an unconfigured old save and unrelated fields without inventing an address',()=>{
 const f=fixture();
 for(const endpoint of [undefined,'','   ']){
  const raw=JSON.stringify({version:1,roles:[],settings:{endpoint,otherSetting:{retained:true}},otherWorldField:'keep'});
  f.values.set(STORAGE_KEY,raw);
  const snapshot=readStoredSave(f.store);
  assert.equal(snapshot.state,'loaded');
  if(snapshot.state!=='loaded')throw Error('valid legacy save');
  assert.deepEqual(snapshot.value.settings,{endpoint:'',mode:'demo',model:'',temperature:0.8,maxTokens:550,otherSetting:{retained:true}});
  assert.equal(snapshot.value.otherWorldField,'keep');
  assert.equal(f.values.get(STORAGE_KEY),raw);
 }
});

test('invalid known API fields and Focus display numbers are blocked while original bytes remain intact',()=>{
 const f=fixture();
 const invalidSettings=[
  {temperature:'"><img onerror=void(0)>'},{temperature:'0.8'},{temperature:-0.1},{temperature:2.1},
  {endpoint:'javascript:void(0)'},{endpoint:'https://a.invalid/?test=1'},{endpoint:'https://user@a.invalid/'},
  {mode:'remote'},{model:[]},{model:'x'.repeat(513)},{maxTokens:0},{maxTokens:1.5},{autonomousLife:'false'},
 ];
 const candidates=invalidSettings.map(fields=>({...defaults(),settings:{...defaults().settings,...fields}}));
 candidates.push({...defaults(),focus:{workMinutes:25,breakMinutes:5,active:{minutes:'<img onerror=void(0)>'} as never,completed:[]}});
 candidates.push({...defaults(),focus:{workMinutes:25,breakMinutes:5,active:null,completed:[{plannedMinutes:'<img onerror=void(0)>'} as never]}});
 candidates.push({...defaults(),focus:{workMinutes:{toString:null,valueOf:null} as never,breakMinutes:5,active:null,completed:[]}});
 candidates.push({...defaults(),focus:{workMinutes:25,breakMinutes:5,active:{minutes:25,phase:'work',status:'running',runSince:1,durationMs:{toString:null,valueOf:null}} as never,completed:[]}});
 for(const candidate of candidates){
  const raw=JSON.stringify(candidate);
  f.values.set(STORAGE_KEY,raw);
  assert.equal(readStoredSave(f.store).state,'invalid');
  assert.equal(f.values.get(STORAGE_KEY),raw);
 }
});
