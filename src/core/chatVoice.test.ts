import test from 'node:test';
import assert from 'node:assert/strict';
import {createRole,defaults} from './defaults';
import {buildNativeContext,compileNativeConversation} from './prompt';
import {requestMessages} from './conversationPrompt';
import {editMessage,retractMessage} from './revisions';
import {createFruitState} from './fruit/preset';
import {normalizeAndMigrateData} from './defaults';
import {chatVoiceChoice,saveChatVoice,describeChatVoice,chatVoiceSummary} from './chatVoice';
import type {ChatMessage,EventRecord} from './types';

const at=Date.parse('2026-11-01T20:00:00Z');
function fixture(){const data=defaults(),r=createRole('合成守灯人','','守灯人','谨慎而寡言','合成群岛');r.chats=[];r.events=[];r.diaries=[];r.preset=null;r.canonNotes='CANON_KEPT';r.relationship='RELATIONSHIP_KEPT';data.preset=null;data.roles=[r];data.selected=r.id;return {data,r};}
function source(f:ReturnType<typeof fixture>,id='source',text='来源消息全文',offset=1000){
 const m:ChatMessage={id,speaker:'char',text,at:at-offset,status:'active'};f.r.chats.push(m);
 const e:EventRecord={id:'event-'+id,kind:'chat',title:'角色说过',detail:text,at:m.at,messageId:id,speaker:'char',knownBy:['user',f.r.id],status:'active'};f.r.events.push(e);return {m,e};
}

test('phone request provides recent message once, excludes its duplicate event and never changes stored records',()=>{
 const f=fixture(),s=source(f),before=structuredClone(f),ctx=buildNativeContext(f.data,f.r,'chat','',{nowTs:at});
 assert.equal(ctx.history.filter(m=>m.id===s.m.id).length,1);assert.ok(!ctx.facts.some(e=>e.id===s.e.id));
 const wire=JSON.stringify(requestMessages(compileNativeConversation(f.data,f.r,'chat','',{nowTs:at})));assert.equal(wire.split(s.m.text).length-1,1);assert.ok(wire.includes('CANON_KEPT')&&wire.includes('RELATIONSHIP_KEPT'));assert.deepEqual(f,before);
});

test('deduplication retains older unshown messages, distinct summaries and same-text events with another source ID',()=>{
 const f=fixture(),old=source(f,'outside','未展示但重要的旧消息',50000),shown=source(f,'shown','同文不同来源',100);
 f.r.chats.pop();f.r.chats.push({id:'unshown-source',speaker:'char',text:shown.m.text,at:at-49000});
 for(let i=0;i<30;i++)f.r.chats.push({id:'recent-'+i,speaker:'me',text:'近期'+i,at:at-900+i,status:'active'});
 f.r.chats.push(shown.m);f.r.events.push({...shown.e,id:'summary',detail:'这一事件带有独立摘要信息'},{...shown.e,id:'another-source',messageId:'unshown-source',at:at-49000}, {...shown.e,id:'relationship-fact',kind:'relationship'});
 const ctx=buildNativeContext(f.data,f.r,'chat','',{nowTs:at});assert.ok(!ctx.history.some(m=>m.id===old.m.id));
 for(const id of [old.e.id,'summary','another-source','relationship-fact'])assert.ok(ctx.facts.some(e=>e.id===id),id);assert.ok(!ctx.facts.some(e=>e.id===shown.e.id));
});

test('source projection retains existing permission, time, revision and theatre boundaries',()=>{
 const f=fixture(),a=source(f,'edited','EDITED_OLD'),b=source(f,'withdrawn','WITHDRAWN_OLD');editMessage(f.r,'chat',a.m.id,'当前有效正文',at-100);retractMessage(f.r,'chat',b.m.id,at-50);
 f.r.events.push({id:'private',kind:'life',title:'私密',detail:'PRIVATE',at:at-1000,knownBy:['other'],source:'private'}, {id:'future',kind:'chat',title:'未来',detail:'FUTURE',at:at+1000}, {id:'theatre',kind:'drama',title:'戏内',detail:'THEATRE_ONLY',at:at-1000});
 const ctx=buildNativeContext(f.data,f.r,'chat','',{nowTs:at}),text=JSON.stringify(ctx);for(const value of ['EDITED_OLD','WITHDRAWN_OLD','PRIVATE','FUTURE','THEATRE_ONLY'])assert.ok(!text.includes(value),value);
 assert.ok(ctx.history.some(m=>m.text==='当前有效正文'));assert.ok(f.r.chats.some(m=>m.id===b.m.id));assert.ok(f.r.events.some(e=>e.id===a.e.id));
});

test('same-source projection change applies only to phone, leaving native novel retrieval intact',()=>{
 const f=fixture(),s=source(f);f.r.scene={id:'stage',where:'合成地点',startedAt:at-5000,messages:[]};
 const scene=buildNativeContext(f.data,f.r,'scene','',{nowTs:at});assert.ok(scene.facts.some(e=>e.id===s.e.id));
});

test('B changes only native expression principles; A remains the default and returns exactly on restore',()=>{
 const f=fixture();source(f);f.r.chats.push({id:'user',speaker:'me',text:'不想改原来的安排也可以。',at:at-100});
 const profile=createFruitState().profiles.meeting,settingsBefore=structuredClone(f.data.settings),original=structuredClone(profile);
 const a=compileNativeConversation(f.data,f.r,'chat','',{profile,nowTs:at});
 f.r.chatVoice='B';const b=compileNativeConversation(f.data,f.r,'chat','',{profile,nowTs:at});
 assert.notDeepEqual(a.messages,b.messages);assert.equal(a.messages.length,b.messages.length);
 assert.deepEqual(a.messages.slice(1),b.messages.slice(1));assert.deepEqual(a.memorySources,b.memorySources);
 for(const rule of ['你正在用手机和用户发消息','回复使用自然中文']){assert.ok(a.messages[0].content.includes(rule));assert.ok(b.messages[0].content.includes(rule));}
 for(const token of ['CANON_KEPT','RELATIONSHIP_KEPT',f.r.profile])assert.ok(b.messages[0].content.includes(token));
 assert.ok(!b.messages[0].content.includes('回应—感想—反问'));assert.ok(a.messages[0].content.includes('回应—感想—反问'));
 f.r.chatVoice='A';assert.deepEqual(compileNativeConversation(f.data,f.r,'chat','',{profile,nowTs:at}).messages,a.messages);assert.deepEqual(profile,original);assert.deepEqual(f.data.settings,settingsBefore);
});

test('B never replaces explicit user expression edits, including a saved macro or a disabled entry',()=>{
 const f=fixture(),profile=createFruitState().profiles.meeting;profile.edits={'native.chat.voice':{content:'CUSTOM_VOICE'},'native.chat.bubbles':{content:'CUSTOM_BUBBLES {{native_bubbles}}'}};
 const before=structuredClone(profile),a=compileNativeConversation(f.data,f.r,'chat','',{profile,nowTs:at});f.r.chatVoice='B';
 const b=compileNativeConversation(f.data,f.r,'chat','',{profile,nowTs:at});assert.deepEqual(b.messages,a.messages);assert.deepEqual(profile,before);
 profile.overrides['native.chat.voice']=false;profile.overrides['native.chat.bubbles']=false;const text=JSON.stringify(requestMessages(compileNativeConversation(f.data,f.r,'chat','',{profile,nowTs:at})));assert.ok(!text.includes('CUSTOM_VOICE')&&!text.includes('CUSTOM_BUBBLES'));assert.ok(text.includes('CANON_KEPT'));
});

test('voice choice is per role, survives normal restore and leaves scene/play/intermission rules unchanged',()=>{
 const f=fixture(),other=fixture().r;other.id='other-role';f.data.roles.push(other);const originalOther=compileNativeConversation(f.data,other,'chat','',{nowTs:at});
 f.r.scene={id:'s',where:'地点',startedAt:at-1000,messages:[]};f.r.play={id:'p',title:'剧本',world:'戏内世界',char:'戏内甲',user:'戏内乙',startedAt:at-1000,messages:[]};
 const modes=['scene','play','intermission']as const,previous=modes.map(kind=>compileNativeConversation(f.data,f.r,kind,'',{nowTs:at}).messages);
 f.r.chatVoice='B';assert.deepEqual(compileNativeConversation(f.data,other,'chat','',{nowTs:at}).messages,originalOther.messages);
 modes.forEach((kind,i)=>assert.deepEqual(compileNativeConversation(f.data,f.r,kind,'',{nowTs:at}).messages,previous[i]));
 const restored=normalizeAndMigrateData(JSON.parse(JSON.stringify(f.data)));assert.equal(restored.roles[0].chatVoice,'B');assert.notEqual(restored.roles[1].chatVoice,'B');
});

test('saving voice selection restores exact previous data on false/throw and keeps roles isolated',()=>{
 const f=fixture(),other=fixture().r;assert.equal(chatVoiceChoice(undefined),'A');assert.equal(chatVoiceChoice('bad'),'A');
 const before=structuredClone(f.r);assert.equal(saveChatVoice(f.r,'B',()=>false),false);assert.deepEqual(f.r,before);
 assert.equal(saveChatVoice(f.r,'B',()=>{throw Error('quota')}),false);assert.deepEqual(f.r,before);
 let persisted='';assert.equal(saveChatVoice(f.r,'B',()=>{persisted=JSON.stringify(f.r);return true}),true);assert.equal(JSON.parse(persisted).chatVoice,'B');assert.equal(chatVoiceChoice(other.chatVoice),'A');
 assert.equal(saveChatVoice(f.r,'A',()=>false),false);assert.equal(f.r.chatVoice,'B');
});

test('read-only configuration diagnostics describe actual sources, switches/order, legacy precedence and contain no history or credentials',()=>{
 const f=fixture(),profile=createFruitState().profiles.meeting;f.r.chats.push({id:'private-chat',speaker:'me',text:'PRIVATE_CHAT_BODY',at});f.data.settings.endpoint='PRIVATE_ENDPOINT';
 profile.edits={'native.chat.voice':{name:'自定义表达',content:'PRIVATE_RULE_TEXT'}};profile.overrides['native.chat.bubbles']=false;
 f.r.chatVoice='B';f.r.preset={name:'PRIVATE_PRESET_NAME',prompts:[{enabled:true,content:'PRIVATE_LEGACY_TEXT',role:'developer',injection_position:9,injection_depth:-2},{enabled:false,content:'DISABLED_LEGACY_TEXT'}]};
 const before=structuredClone({f,profile}),info=describeChatVoice(profile,f.r,{name:'global',prompts:[]});assert.equal(info.choice,'B');assert.equal(info.legacySource,'role');assert.equal(info.legacy[1].enabled,false);
 assert.equal(info.legacy[0].role,'system');assert.equal(info.legacy[0].position,0);assert.equal(info.legacy[0].depth,0);
 const voice=info.rules.find(r=>r.id==='native.chat.voice')!,bubbles=info.rules.find(r=>r.id==='native.chat.bubbles')!;
 assert.equal(voice.source,'user-edit');assert.equal(voice.content,'PRIVATE_RULE_TEXT');assert.equal(bubbles.source,'candidate-b');assert.equal(bubbles.enabled,false);assert.ok(voice.order<bubbles.order);
 const diagnostic=JSON.stringify(info),summary=JSON.stringify(chatVoiceSummary(info));assert.ok(!diagnostic.includes('PRIVATE_CHAT_BODY')&&!diagnostic.includes('PRIVATE_ENDPOINT'));
 const fallback=chatVoiceSummary(info,true);assert.equal(fallback.legacySource,'none');assert.equal(fallback.legacyCount,0);assert.equal(fallback.legacySkippedOnce,true);assert.equal(info.legacy.length,2);
 for(const secret of ['PRIVATE_RULE_TEXT','PRIVATE_LEGACY_TEXT','PRIVATE_PRESET_NAME','PRIVATE_CHAT_BODY','PRIVATE_ENDPOINT'])assert.ok(!summary.includes(secret),secret);assert.deepEqual({f,profile},before);
 f.r.preset={name:'empty',prompts:[]};assert.equal(describeChatVoice(profile,f.r,f.data.preset).legacySource,'role');assert.equal(describeChatVoice(profile,f.r,f.data.preset).legacy.length,0);
});
