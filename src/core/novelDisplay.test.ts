import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFruitOutput} from './fruit/output';
import {parseFruitPreset,createFruitState} from './fruit/preset';
import {readNovelResponse} from './novelGeneration';
const reply=(content:string)=>new Response(JSON.stringify({choices:[{message:{role:'assistant',content},finish_reason:'stop'}]}));
test('novel output preserves section types and order and merges every complete body block',async()=>{
 const raw='<novel_header>[CHAP]1[TITLE]合成标题</novel_header><content>第一段「对白」。</content><status_bar>地点：合成塔</status_bar><content>第二段 3 < 5 & “引号”。</content>';
 const p=parseFruitOutput(raw);assert.equal(p.content,'第一段「对白」。\n\n第二段 3 < 5 & “引号”。');assert.deepEqual(p.sections.map(s=>s.type),['novel_header','content','status_bar','content']);
 const r=await readNovelResponse(reply(raw),createFruitState().profiles.meeting,true);assert.equal(r.text,p.content);assert.ok(r.sections);assert.deepEqual(r.sections.map(s=>s.type),['novel_header','content','status_bar','content']);
});
test('novel parser rejects malformed recognized nesting while ignoring disabled opaque snow',async()=>{
 for(const raw of ['<content>a<content>b</content>c</content>','<content>a<status_bar>x</status_bar></content>','</content><content>body</content>','<content>body</content><content','<content>body</content></content'])await assert.rejects(()=>readNovelResponse(reply(raw),createFruitState().profiles.meeting,true));
 for(const raw of ['<content>a</content><novel_header>unclosed','<content>body</content><status_bar']){const result=await readNovelResponse(reply(raw),createFruitState().profiles.meeting,true);assert.equal(result.text,raw.startsWith('<content>a')?'a':'body');assert.ok(result.warnings.includes('optional-format-recovered'));assert.ok(result.sections?.every(s=>s.type==='content'));}
 assert.equal(parseFruitOutput('<content>正文</content><snow>unclosed secret').content,'正文');assert.ok(!JSON.stringify(parseFruitOutput('<snow><content>SECRET</content></snow><content>正文</content>')).includes('SECRET'));
});
test('closed display blocks are not retained when auxiliary output is disabled',async()=>{
 const p=createFruitState().profiles.meeting;p.output={scene:false,summary:false,characters:false,auxiliary:false};const r=await readNovelResponse(reply('<novel_header>PRIVATE_HEADER</novel_header><status_bar>PRIVATE_PLACE</status_bar><ECoT>PRIVATE_AUX</ECoT><meow_FM>PRIVATE_SUMMARY</meow_FM><content>正文</content>'),p,true);
 assert.deepEqual(r.sections,[{type:'content',text:'正文'}]);assert.ok(!JSON.stringify(r).includes('PRIVATE_'));
});
test('regex metadata retains both sides, depth, edit, capture, macro and ordering semantics',async()=>{
 const raw=new TextEncoder().encode(JSON.stringify({prompts:[{identifier:'a',content:'x'}],prompt_order:[{order:[{identifier:'a',enabled:true}]}],extensions:{regex_scripts:[{id:'r',scriptName:'fixture',findRegex:'/(?<who>hi)(.+)/g',replaceString:'$1 $2 {{char}}',placement:[2,6],markdownOnly:true,promptOnly:true,minDepth:0,maxDepth:5,runOnEdit:true,trimStrings:['x'],substituteRegex:2}]}}));
 const r=(await parseFruitPreset(raw,'synthetic.json')).regex[0];assert.equal(r.markdownOnly,true);assert.equal(r.promptOnly,true);assert.equal(r.minDepth,0);assert.equal(r.maxDepth,5);assert.equal(r.runOnEdit,true);assert.deepEqual(r.trimStrings,['x']);assert.equal(r.substituteRegex,2);assert.equal(r.orderIndex,0);assert.equal(r.captureGroupCount,2);assert.deepEqual(r.namedCaptureGroups,['who']);assert.deepEqual(r.macros,['char']);
});
import {bindNovelDocument,validNovelDocument} from './novelDocument';
import type {ChatMessage} from './types';
test('display documents bind to exact owner, story, message, revision and original without entering model text',()=>{
 const d=bindNovelDocument([{type:'novel_header',text:'[TITLE]标题'},{type:'content',text:'正文'}],{roleId:'A',stageId:'scene-A',messageId:'m',mode:'meeting',revisionCount:0,createdAt:1,presetId:'p',presetHash:'a'.repeat(64)});
 const m:ChatMessage={id:'m',speaker:'char',text:'正文',at:1,novelOutput:{presetId:'p',mode:'meeting',memoryEligible:false,document:d}};
 assert.equal(validNovelDocument(m,'A','scene-A','meeting'),d);assert.equal(validNovelDocument(m,'B','scene-A','meeting'),null);assert.equal(validNovelDocument(m,'A','play-A','theatre'),null);assert.equal(validNovelDocument({...m,revisionCount:1},'A','scene-A','meeting'),null);assert.equal(validNovelDocument({...m,text:'已编辑'},'A','scene-A','meeting'),null);assert.equal(validNovelDocument({...m,status:'retracted'},'A','scene-A','meeting'),null);
});
