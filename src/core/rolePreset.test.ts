import test from 'node:test';
import assert from 'node:assert/strict';
import {selectRequestPreset} from './fruit/library';
import {createFruitState,parseFruitPreset} from './fruit/preset';
import {makeNativePreset} from './fruit/nativePreset';
async function fixture(){
 const native=await makeNativePreset('meeting'),preset=await parseFruitPreset(new TextEncoder().encode(JSON.stringify({name:'Synthetic shared novel',extensions:{regex_scripts:[{id:'r',scriptName:'原规则',findRegex:'/x/g',replaceString:'y',placement:[2]}]},prompts:[{identifier:'a',name:'A',role:'system',content:'NOVEL_RULE_A'},{identifier:'b',name:'B',role:'system',content:'NOVEL_RULE_B'},{identifier:'chatHistory',marker:true}],prompt_order:[{order:['a','b','chatHistory'].map(identifier=>({identifier,enabled:true}))}]})),'synthetic-role.json',1);
 const profile=createFruitState().profiles.meeting;
 return {native,preset,profile,library:{schema:3 as const,revision:1,selectedId:'native',defaults:{meeting:'native',theatre:'native'},entries:[{id:'native',kind:'native' as const,preset:native,enabled:true,profiles:createFruitState().profiles},{id:'a',kind:'st' as const,preset,enabled:true,profiles:createFruitState().profiles}],roleNovel:{A:{presetId:'a',sourceMode:'meeting' as const,profiles:{a:{baseHash:preset.sha256,profile:{...profile,overrides:{b:false},style:'毛姆'},enabled:true}}},B:{presetId:'native',sourceMode:'meeting' as const,profiles:{}}}}};
}
test('a role uses its one saved novel profile for meeting and theatre; another role and native tasks stay independent',async()=>{
 const {library}=await fixture();
 const meeting=selectRequestPreset(library,'meeting','A'),theatre=selectRequestPreset(library,'theatre','A');
 assert.equal(meeting.requestedPresetId,'a');assert.equal(meeting.actualPresetId,'a');assert.equal(theatre.actualPresetId,'a');assert.deepEqual(meeting.profile,theatre.profile);assert.equal(meeting.profile.overrides.b,false);assert.equal(theatre.profile.style,'毛姆');
 assert.equal(selectRequestPreset(library,'meeting','B').actualPresetId,'native');assert.equal(selectRequestPreset(library,'chat','A').actualPresetId,'native');assert.equal(selectRequestPreset(library,'intermission','A').actualPresetId,'native');
 meeting.profile.overrides.b=true;assert.equal(selectRequestPreset(library,'theatre','A').profile.overrides.b,false);
});
test('regex choices remain data, preserve replacement metadata, and reject unsafe override keys',async()=>{
 const {profile}=await fixture(),{validateProfile}=await import('./fruit/preset');const checked=validateProfile({...profile,regexOverrides:{r:false}});assert.deepEqual(checked.regexOverrides,{r:false});assert.throws(()=>validateProfile({...profile,regexOverrides:{r:'yes'}}));
 const raw=new TextEncoder().encode(JSON.stringify({prompts:[{identifier:'a',content:'a'}],prompt_order:[{order:[{identifier:'a',enabled:true}]}],extensions:{regex_scripts:[{id:'r',scriptName:'原始规则',findRegex:'/x/g',replaceString:'<b>替换</b>',placement:[2]}]}}));const p=await parseFruitPreset(raw,'regex.json',1);assert.equal(p.regex[0].replacement,'<b>替换</b>');assert.deepEqual(p.raw,raw);
});
import {initializeRoleNovel,legacyNovelAgrees,selectRoleNovelPreset,saveRoleNovelProfile,rolePresetBinding,useLegacyNovel,restorePreviousRoleNovel} from './fruit/roleProfiles';
import {decodePresetLibrary} from './fruit/library';
function oldLibrary(f:Awaited<ReturnType<typeof fixture>>){return {schema:2 as const,revision:1,selectedId:'a',defaults:{meeting:'a',theatre:'native'},entries:structuredClone(f.library.entries)};}
test('different old modes keep original requests until a role chooses; cancellation is non-mutating and restoration keeps the shared draft',async()=>{
 const f=await fixture(),old=oldLibrary(f),before=structuredClone(old);old.entries[1].profiles.meeting.style='OLD_MEETING';old.entries[1].profiles.theatre.style='OLD_STAGE';const original=structuredClone(old);
 const pending=initializeRoleNovel(old,'A');assert.equal(pending.schema,3);assert.equal(pending.roleNovel?.A,undefined);assert.equal(selectRequestPreset(pending,'meeting','A').actualPresetId,'a');assert.equal(selectRequestPreset(pending,'theatre','A').actualPresetId,'native');assert.equal(selectRequestPreset(pending,'meeting','A').profile.style,'OLD_MEETING');assert.deepEqual(old,original);
 let shared=initializeRoleNovel(pending,'A','meeting');assert.equal(selectRequestPreset(shared,'theatre','A').actualPresetId,'a');assert.equal(selectRequestPreset(shared,'theatre','A').profile.style,'OLD_MEETING');
 shared=saveRoleNovelProfile(shared,'A','a',{...rolePresetBinding(shared,'A').profile,style:'PERSONAL'});const legacy=useLegacyNovel(shared,'A',true);assert.equal(selectRequestPreset(legacy,'meeting','A').profile.style,'OLD_MEETING');assert.equal(selectRequestPreset(legacy,'theatre','A').actualPresetId,'native');const resumed=useLegacyNovel(legacy,'A',false);assert.equal(selectRequestPreset(resumed,'theatre','A').profile.style,'PERSONAL');assert.deepEqual(resumed.legacyNovel,pending.legacyNovel);assert.deepEqual(before.entries.map(e=>e.preset.raw),old.entries.map(e=>e.preset.raw));
 const changedChoice=initializeRoleNovel(legacy,'A','theatre');assert.equal(selectRequestPreset(changedChoice,'meeting','A').actualPresetId,'native');assert.equal(selectRequestPreset(restorePreviousRoleNovel(changedChoice,'A'),'meeting','A').profile.style,'PERSONAL');
 const decoded=await decodePresetLibrary({...pending,versions:[],entries:pending.entries.map(e=>({id:e.id,kind:e.kind,enabled:e.enabled,profiles:e.profiles,raw:e.preset.raw,fileName:e.preset.fileName,importedAt:e.preset.importedAt}))},f.native);assert.equal(selectRequestPreset(decoded,'meeting','A').profile.style,'OLD_MEETING');
});
test('equal legacy modes auto-initialize isolated profiles and preset A→B→A restores personal switches and regex choices',async()=>{
 const f=await fixture(),old=oldLibrary(f);old.defaults={meeting:'a',theatre:'a'};assert.equal(legacyNovelAgrees(old),true);
 let l=initializeRoleNovel(initializeRoleNovel(old,'A'),'B');const p=rolePresetBinding(l,'A').profile;l=saveRoleNovelProfile(l,'A','a',{...p,overrides:{a:false},regexOverrides:{r:false},style:'A_STYLE'});
 assert.equal(selectRequestPreset(l,'theatre','A').profile.overrides.a,false);assert.equal(selectRequestPreset(l,'meeting','B').profile.overrides.a,undefined);assert.equal(selectRequestPreset(l,'meeting','B').profile.regexOverrides,undefined);
 l=selectRoleNovelPreset(l,'A','native');l=selectRoleNovelPreset(l,'A','a');assert.equal(rolePresetBinding(l,'A').profile.style,'A_STYLE');assert.deepEqual(rolePresetBinding(l,'A').profile.regexOverrides,{r:false});assert.deepEqual(old.entries[1].profiles.meeting.overrides,{});
});
test('native shared novels preserve built-in mode boundaries and original mobile/backstage configuration',async()=>{
 const f=await fixture(),old=oldLibrary(f);old.defaults={meeting:'native',theatre:'native'};old.entries[0].profiles.meeting.edits={'native.chat.voice':{content:'OLD_PHONE_VOICE'}};const l=initializeRoleNovel(old,'A','meeting'),profile=rolePresetBinding(l,'A').profile;assert.equal(profile.edits?.['native.chat.voice'],undefined);
 const next=saveRoleNovelProfile(l,'A','native',{...profile,edits:{'native-base':{content:'SHARED_NOVEL_VOICE'}},style:'NOVEL_ONLY'});assert.equal(selectRequestPreset(next,'meeting','A').profile.style,'NOVEL_ONLY');assert.equal(selectRequestPreset(next,'theatre','A').profile.edits?.['native-base'].content,'SHARED_NOVEL_VOICE');assert.equal(selectRequestPreset(next,'chat','A').profile.edits?.['native.chat.voice'].content,'OLD_PHONE_VOICE');assert.equal(selectRequestPreset(next,'intermission','A').profile.style,'');
});
import {planRolePresetUpdate,archiveRolePreset,rolePresetReferences} from './fruit/roleProfiles';
test('a raw update is shared by all roles without rewriting their overlays; incompatible overlays block rather than disappear',async()=>{
 const f=await fixture(),old=oldLibrary(f);old.defaults={meeting:'a',theatre:'a'};let l=initializeRoleNovel(initializeRoleNovel(old,'A'),'B');l=saveRoleNovelProfile(l,'A','a',{...rolePresetBinding(l,'A').profile,overrides:{b:false}});l=saveRoleNovelProfile(l,'B','a',{...rolePresetBinding(l,'B').profile,overrides:{a:false},style:'B_PRIVATE'});const beforeB=structuredClone(l.roleNovel!.B),rawBefore=f.preset.raw.slice();
 const doc=JSON.parse(new TextDecoder().decode(f.preset.raw));doc.prompts[0].content='NEW_RULE_A';const nextPreset=await parseFruitPreset(new TextEncoder().encode(JSON.stringify(doc)),'synthetic V2.json',2);const plan=planRolePresetUpdate(l,'A','a',nextPreset);l=plan.next;assert.deepEqual(l.roleNovel!.B,beforeB);assert.equal(l.versions?.length,1);assert.deepEqual(l.versions![0].raw,rawBefore);assert.deepEqual(selectRequestPreset(l,'meeting','B').preset.raw,nextPreset.raw);assert.equal(selectRequestPreset(l,'theatre','B').profile.overrides.a,false);assert.equal(selectRequestPreset(l,'theatre','B').profile.style,'B_PRIVATE');assert.equal(selectRequestPreset(l,'meeting','B').presetHash,nextPreset.sha256);assert.throws(()=>selectRequestPreset(l,'meeting','A'),/停用/);
 const broken=JSON.parse(new TextDecoder().decode(nextPreset.raw));broken.prompts=broken.prompts.filter((p:{identifier:string})=>p.identifier!=='a');broken.prompt_order[0].order=broken.prompt_order[0].order.filter((p:{identifier:string})=>p.identifier!=='a');const v3=await parseFruitPreset(new TextEncoder().encode(JSON.stringify(broken)),'synthetic V3.json',3);
 l=planRolePresetUpdate(l,'A','a',v3).next;assert.deepEqual(l.roleNovel!.B,beforeB);assert.throws(()=>selectRequestPreset(l,'theatre','B'),/不兼容.*a/);assert.equal(l.roleNovel!.B.profiles.a.profile.overrides.a,false);assert.deepEqual(f.preset.raw,rawBefore);
});
test('removing a referenced preset is blocked; unreferenced removal is reversible and retains original bytes and cached profiles',async()=>{
 const f=await fixture(),old=oldLibrary(f);old.defaults={meeting:'native',theatre:'native'};let l=initializeRoleNovel(old,'A');l=selectRoleNovelPreset(l,'A','a');assert.deepEqual(rolePresetReferences(l,'a',['A']),['A']);assert.throws(()=>archiveRolePreset(l,'a',['A']),/正在使用/);l=selectRoleNovelPreset(l,'A','native');const before=structuredClone(l.roleNovel!.A.profiles.a);l=archiveRolePreset(l,'a',['A']);assert.equal(l.entries.find(e=>e.id==='a')?.archived,true);assert.deepEqual(l.roleNovel!.A.profiles.a,before);l=archiveRolePreset(l,'a',['A'],false);l=selectRoleNovelPreset(l,'A','a');assert.deepEqual(rolePresetBinding(l,'A'),before);assert.deepEqual(l.entries.find(e=>e.id==='a')!.preset.raw,f.preset.raw);
});
import * as libraryIO from './fruit/library';
test('private library backup restores both legacy and role profiles with exact raw bytes; invalid backup never mutates source',async()=>{
 const f=await fixture(),old=oldLibrary(f);old.defaults={meeting:'a',theatre:'a'};let l=initializeRoleNovel(old,'A');l=saveRoleNovelProfile(l,'A','a',{...rolePresetBinding(l,'A').profile,regexOverrides:{r:false},style:'BACKUP_STYLE'});const raw=f.preset.raw.slice(),before=structuredClone(l);
 const backup=libraryIO.encodePresetLibraryBackup(l),decoded=await libraryIO.decodePresetLibraryBackup(backup,f.native);assert.deepEqual(decoded.entries.find(e=>e.id==='a')!.preset.raw,raw);assert.equal(selectRequestPreset(decoded,'theatre','A').profile.style,'BACKUP_STYLE');assert.deepEqual(selectRequestPreset(decoded,'meeting','A').profile.regexOverrides,{r:false});assert.deepEqual(decoded.legacyNovel,l.legacyNovel);
 await assert.rejects(()=>libraryIO.decodePresetLibraryBackup(new TextEncoder().encode('{broken'),f.native));assert.deepEqual(l,before);
});
import {renderTerminalPresetPanel} from '../terminalPresetView';
import {applyFruitProfile} from './fruit/profile';
test('the preset page names the role, has one novel selector, and keeps regex metadata inert',async()=>{
 const f=await fixture(),p=rolePresetBinding(f.library,'A').profile,e=f.library.entries[1];const html=renderTerminalPresetPanel(f.library,e,'meeting',p,applyFruitProfile(f.preset,p),false,{id:'A',name:'Telemachus'});
 assert.match(html,/当前角色[：:]?\s*Telemachus/);assert.match(html,/小说预设/);assert.ok(!html.includes('data-preset-default='));assert.ok(!html.includes('data-terminal-mode='));assert.match(html,/data-regex-enabled="r"/);assert.match(html,/正则.*未执行/);
});
test('regex switches keep stable unique identities through insertion, duplicate or blank source IDs',async()=>{
 const f=await fixture(),doc=JSON.parse(new TextDecoder().decode(f.preset.raw));
 doc.extensions.regex_scripts=[{scriptName:'First',findRegex:'/first/g'},{scriptName:'Second',findRegex:'/second/g'},{id:'same',scriptName:'X',findRegex:'/x/g'},{id:'same',scriptName:'Y',findRegex:'/y/g'},{id:'',scriptName:'Blank',findRegex:'/blank/g'}];
 const old=await parseFruitPreset(new TextEncoder().encode(JSON.stringify(doc)),'idless.json');
 assert.equal(new Set(old.regex.map(r=>r.id)).size,5);assert.ok(old.regex.every(r=>r.id));
 f.library.entries[1].preset=old;f.library.roleNovel.A.profiles.a.baseHash=old.sha256;f.library.roleNovel.A.profiles.a.profile.regexOverrides={[old.regex[0].id]:false};
 doc.extensions.regex_scripts.unshift({scriptName:'Inserted',findRegex:'/new/g'});const next=await parseFruitPreset(new TextEncoder().encode(JSON.stringify(doc)),'new.json');
 assert.equal(next.regex.find(r=>r.name==='First')!.id,old.regex[0].id);assert.notEqual(next.regex[0].id,old.regex[0].id);
 const updated=planRolePresetUpdate(f.library,'A','a',next);assert.deepEqual(updated.dropped,[]);const p=updated.next.roleNovel!.A.profiles.a.profile;
 assert.equal(p.regexOverrides?.[next.regex.find(r=>r.name==='First')!.id],false);assert.equal(p.regexOverrides?.[next.regex[0].id],undefined);
});
