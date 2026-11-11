import test from 'node:test';
import assert from 'node:assert/strict';
import {PRESET_MAX_BYTES,validatePresetLibrary,builtinPreset,parseElsewherePreset,exportElsewherePreset,resolvePreset,deletePreset,emptyPresetLibrary,importElsewherePreset,replaceSharedPreset} from './elsewherePreset';

test('Elsewhere JSON roundtrips literal content, ordered roles and optional groups',()=>{
 const preset={...builtinPreset(),id:'custom',name:'我的规则',entries:[
  {id:'b',name:'第二',group:'合成分组',role:'assistant' as const,enabled:false,content:'{{literal}}\n<script>inert()</script>'},
  {id:'a',name:'第一',role:'system' as const,enabled:true,content:'保留\n\n段落。'},
 ]};
 assert.deepEqual(parseElsewherePreset(exportElsewherePreset(preset)),preset);
 assert.throws(()=>parseElsewherePreset(new TextEncoder().encode('{"prompts":[],"prompt_order":[]}')),/Elsewhere/);
 assert.throws(()=>parseElsewherePreset(new TextEncoder().encode('{oops')),/JSON/);
 assert.throws(()=>parseElsewherePreset(new Uint8Array(PRESET_MAX_BYTES+1)),/大小限制/);
 assert.throws(()=>exportElsewherePreset({...preset,entries:[preset.entries[0],preset.entries[0]]}),/重复/);
 assert.throws(()=>exportElsewherePreset({...preset,apiKey:'must-not-export'}),/字段/);
});

test('shared edits propagate while role overrides stay independent',()=>{
 let library=emptyPresetLibrary();
 const preset={...builtinPreset(),id:'shared',name:'共享',entries:[{id:'a',name:'规则',role:'system' as const,enabled:true,content:'旧正文'}]};
 library=importElsewherePreset(library,preset);
 library.defaultPresetId='shared';
 library.bindings.A={presetId:'shared',overrides:{entries:{a:{content:'A独立正文'}}}};
 library=replaceSharedPreset(library,{...preset,entries:[{...preset.entries[0],content:'新共享正文'}]});
 assert.equal(resolvePreset(library,'A').entries[0].content,'A独立正文');
 assert.equal(resolvePreset(library,'B').entries[0].content,'新共享正文');
 const copy=importElsewherePreset(library,preset);assert.notEqual(copy.presets.at(-1)?.id,preset.id);
 const deleted=deletePreset(library,'shared');
 assert.equal(resolvePreset(deleted,'A').id,'native');
 assert.equal(deleted.defaultPresetId,'native');
 assert.throws(()=>deletePreset(deleted,'native'),/内置/);
});

import {parseNativeNovelText} from './nativeNovelOutput';
test('native output accepts ordinary paragraphs without third-party tags and excludes hidden blocks',()=>{
 const body='他推开窗。\n\n「请进。」\n保留最后一行。';
 assert.equal(parseNativeNovelText(body),body);
 assert.equal(parseNativeNovelText('<think>不可显示的内容</think>'+body),body);
 assert.equal(parseNativeNovelText('<content>'+body+'</content>'),body);
 assert.throws(()=>parseNativeNovelText('<think>只有隐藏内容'));
});

import {defaults,createRole} from './defaults';
import {compileNovelConversation,compileNativeConversation} from './prompt';
import {nativePreset} from './fruit/nativePreset';
import {requestMessages} from './conversationPrompt';
import {createFruitState} from './fruit/preset';
test('actual native request orders literal preset entries without turning them into history',()=>{
 const data=defaults(),r=createRole('合成角色','','工作','谨慎','旧城'),at=Date.parse('2026-11-10T20:00:00Z');
 r.chats=[];r.events=[];r.scene={id:'s',where:'旧城',startedAt:at-1000,messages:[{id:'u',speaker:'me',text:'合成本轮输入',at}]};data.roles=[r];
 const preset={...builtinPreset(),id:'custom',entries:[{id:'b',name:'乙',role:'assistant' as const,content:'LITERAL_B {{do_not_resolve}}',enabled:true},{id:'a',name:'甲',role:'system' as const,content:'LITERAL_A',enabled:true}]};
 const result=compileNovelConversation(data,r,'scene','合成本轮输入',{nowTs:at,preset:nativePreset('meeting'),profile:createFruitState().profiles.meeting,elsewherePreset:preset,skipLegacyOnce:true});
 const messages=requestMessages(result),b=messages.findIndex(m=>m.content.includes('LITERAL_B')),a=messages.findIndex(m=>m.content==='LITERAL_A');
 assert.ok(b>=0&&a>b);assert.equal(messages[b].role,'assistant');assert.match(messages[b].content,/\{\{do_not_resolve\}\}/);
 assert.ok(!result.memorySources.some(s=>s.id.includes('preset:')));
 assert.ok(messages.every(m=>!m.content.includes('600–1200')));
 assert.equal(result.messages[b].sourceId,'preset:custom:b');
 const phone=requestMessages(compileNativeConversation(data,r,'chat','你好',{nowTs:at,elsewherePreset:preset}));
 assert.ok(phone.every(m=>!m.content.includes('LITERAL_B')));
});

test('role additions, hidden rows and order survive edits to the shared preset',()=>{
 const rule=(id:string)=>({id,name:id,content:id,role:'system' as const,enabled:true});
 const shared={...builtinPreset(),id:'shared',entries:[rule('one'),rule('two')]};
 let library=importElsewherePreset(emptyPresetLibrary(),shared);
 library.defaultPresetId='shared';
 library.bindings.A={presetId:'inherit',overrides:{added:[rule('personal')],hidden:['two'],order:['personal','one']}};
 library=replaceSharedPreset(library,{...shared,entries:[rule('new'),{...rule('one'),content:'updated'},rule('two')]});
 assert.deepEqual(resolvePreset(library,'A').entries.map(e=>e.content),['personal','new','updated']);
 assert.deepEqual(resolvePreset(library,'B').entries.map(e=>e.content),['new','updated','two']);
});

test('deleting an explicit selection falls back to builtin even if another custom default exists',()=>{
 let l=importElsewherePreset(emptyPresetLibrary(),{...builtinPreset(),id:'p',name:'P'});
 l=importElsewherePreset(l,{...builtinPreset(),id:'q',name:'Q'});l.defaultPresetId='q';
 l.bindings.A={presetId:'p',overrides:{}};
 const next=deletePreset(l,'p');assert.equal(resolvePreset(next,'A').id,'native');assert.equal(next.defaultPresetId,'q');
});

test('a maximum-size valid preset still exports a reimportable file',()=>{
 const p={...builtinPreset(),id:'large',entries:Array.from({length:66},(_,i)=>({id:'e'+i,name:'Entry',role:'system' as const,enabled:true,content:i<65?'x'.repeat(128000):''}))};
 const remaining=PRESET_MAX_BYTES-new TextEncoder().encode(JSON.stringify(p)).length;
 assert.ok(remaining>0&&remaining<128000);p.entries[65].content='x'.repeat(remaining);
 const bytes=exportElsewherePreset(p);assert.ok(bytes.length<=PRESET_MAX_BYTES);assert.deepEqual(parseElsewherePreset(bytes),p);
});

import {migrateElsewhereLibrary} from './presetLibrary';
test('upgrade preserves identifiable native settings but retires explicit third-party role bindings',()=>{
 const profiles=createFruitState().profiles;profiles.meeting.style='旧原生文风';profiles.meeting.length.max=1900;
 const personal={...profiles.meeting,style:'角色原生文风'};
 const old={entries:[{kind:'native',profiles}],defaults:{meeting:'native',theatre:'native'},roleNovel:{A:{presetId:'native',profiles:{native:{profile:personal}}},B:{presetId:'old-fruit'}}};
 const before=structuredClone(old),l=migrateElsewhereLibrary({library:old});
 assert.ok(resolvePreset(l,'C').entries.some(e=>e.content==='文风：旧原生文风'));
 assert.ok(resolvePreset(l,'C').entries.some(e=>e.content.includes('600–1900')));
 assert.ok(resolvePreset(l,'A').entries.some(e=>e.content==='文风：角色原生文风'));
 assert.equal(resolvePreset(l,'B').id,'native');assert.deepEqual(old,before);
});

import {decodeNativeLibraryBackup} from './presetLibrary';
import {encodePresetLibraryBackup} from './fruit/library';
test('existing private library backups restore into native settings and a retained legacy archive',async()=>{
 const p=nativePreset('meeting'),old={schema:2 as const,revision:1,selectedId:'native',defaults:{meeting:'native',theatre:'native'},entries:[{id:'native',kind:'native' as const,preset:p,profiles:createFruitState().profiles,enabled:true}]};
 const backup=encodePresetLibraryBackup(old),restored=await decodeNativeLibraryBackup(backup);
 assert.equal(restored.library.schemaVersion,2);assert.ok(restored.archive.library);
 assert.equal(resolvePreset(restored.library,'A').id,'native');
});

test('dual-mode libraries use the meeting selection and retain the theatre configuration for explicit recovery',()=>{
 const prefs={length:{min:600,max:1200},style:''};
 const native={...builtinPreset(),settings:{meeting:prefs,theatre:prefs}};
 const shared={...native,id:'shared',settings:{meeting:{length:{min:800,max:1500},style:'面对面文风'},theatre:{length:{min:900,max:2000},style:'演出文风'}}};
 const legacy={schemaVersion:1,revision:7,presets:[native,shared],defaults:{meeting:'shared',theatre:'native'},bindings:{A:{meeting:{presetId:'inherit',overrides:{settings:{style:'角色文风'}}},theatre:{presetId:'shared',overrides:{}}}}};
 const snapshot=structuredClone(legacy),upgraded=validatePresetLibrary(legacy);
 assert.equal(upgraded.schemaVersion,2);
 assert.equal(upgraded.defaultPresetId,'shared');
 assert.deepEqual(resolvePreset(upgraded,'A').entries.map(e=>e.name),['正文篇幅','文风要求']);
 assert.deepEqual(resolvePreset(upgraded,'A').entries.map(e=>e.content),['目标 800–1500 字，按剧情自然取舍，不凑字数。','文风：角色文风']);
 const restored=validatePresetLibrary(legacy,'theatre');
 assert.equal(restored.defaultPresetId,'native');
 assert.equal(resolvePreset(restored,'A').entries.at(-1)?.content,'文风：演出文风');
 assert.deepEqual(legacy,snapshot);
});

test('older V1 files import saved length and style as removable ordinary entries',()=>{
 const old={...builtinPreset(),id:'old',settings:{meeting:{length:{min:200,max:420},style:'旧文字风格'},theatre:{length:{min:900,max:1200},style:'旧演出风格'}}};
 const parsed=parseElsewherePreset(new TextEncoder().encode(JSON.stringify(old)));
 assert.equal('settings' in parsed,false);
 assert.deepEqual(parsed.entries.map(e=>e.content),['目标 200–420 字，按剧情自然取舍，不凑字数。','文风：旧文字风格']);
 assert.deepEqual(parseElsewherePreset(exportElsewherePreset({...parsed,entries:[]})).entries,[]);
});
