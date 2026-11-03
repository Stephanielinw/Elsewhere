import test from 'node:test';
import assert from 'node:assert/strict';
import {frameDraft,frameGeometry,saveFrameOnly} from './avatarAppearance';
import {createMediaSources} from './media';
import {avatarView} from '../avatarView';
import {FRAME_APERTURES} from './avatarFrameFits';
import {PRESET_AVATAR_FRAMES} from './avatarFrames';

test('legacy -7 keeps the 68px picker composition and scales to small avatars without changing saved values',()=>{
 const owner={frameId:'preset_frame_085',frameScale:1.25,frameX:3,frameY:-7};
 const actual=frameGeometry(owner);
 assert.equal(actual.scale,1.25);assert.ok(Math.abs(actual.xPercent-4.41176470588)<1e-9);assert.ok(Math.abs(actual.yPercent+10.29411764706)<1e-9);
 assert.equal(owner.frameY,-7);assert.equal(frameDraft(owner).frameLayoutVersion,undefined);
});

test('new zero adjustments use the measured aperture while legacy manual offsets keep their original reference',()=>{
 const current={frameId:'preset_frame_085',frameScale:1.21,frameX:0,frameY:0,frameLayoutVersion:1 as const};
 assert.ok(Math.abs(frameGeometry(current).yPercent+6.99813235294)<1e-9);
 assert.equal(frameGeometry({...current,frameLayoutVersion:undefined}).yPercent,0);
 assert.equal(frameGeometry({...current,frameId:'custom'}).yPercent,0);
 assert.equal(frameGeometry({...current,frameData:'data:image/png;base64,AA=='}).yPercent,0);
});

test('frame-only save neither submits text/avatar drafts nor loses previous fields when persistence fails',()=>{
 const owner={name:'saved',profile:'canon',avatarMediaId:'original',frameId:'preset_frame_004',frameX:2};const before=structuredClone(owner),next=frameDraft({frameId:'preset_frame_085',frameY:-7,frameScale:1.25});
 assert.equal(saveFrameOnly(owner,next,()=>false),false);assert.deepEqual(owner,before);
 assert.equal(saveFrameOnly(owner,next,()=>{throw Error('quota')}),false);assert.deepEqual(owner,before);
 assert.equal(saveFrameOnly(owner,next,()=>true),true);assert.equal(owner.frameId,'preset_frame_085');assert.equal(owner.name,'saved');assert.equal(owner.profile,'canon');assert.equal(owner.avatarMediaId,'original');
});

test('local GIF media reuses its original blob URL; leaving an unresolved source does not revive it',async()=>{
 let reads=0;const bytes=new Blob(['GIF89a'],{type:'image/gif'}),cache=createMediaSources(async()=>{reads++;return bytes;});
 const [a,b]=await Promise.all([cache.get('gif'),cache.get('gif')]);assert.equal(a,b);assert.equal(reads,1);
 cache.prune(new Set(['gif']));assert.equal(await cache.get('gif'),a);assert.equal(reads,1);cache.clear();assert.notEqual(await cache.get('gif'),a);cache.clear();
 let finish:(blob:Blob)=>void=()=>{};const delayed=createMediaSources(()=>new Promise<Blob>(resolve=>finish=resolve));const old=delayed.get('old');delayed.prune(new Set());finish(bytes);assert.equal(await old,undefined);
});


test('frame calibration references existing assets and does not apply a guessed correction to unsupported uploads',()=>{
 assert.equal(PRESET_AVATAR_FRAMES.length,363);
 for(const [id,offset] of Object.entries(FRAME_APERTURES)){
  assert.ok(PRESET_AVATAR_FRAMES.some(p=>p.id===id));
  assert.ok(offset.every(n=>Number.isFinite(n)&&Math.abs(n)<34));
 }
 const custom={frameId:'custom',frameScale:1.21,frameX:0,frameY:0,frameLayoutVersion:1 as const};
 assert.equal(frameGeometry(custom).xPercent,0);assert.equal(frameGeometry(custom).yPercent,0);
});

test('shared avatar rendering escapes names and rejects executable frame URLs',()=>{
 const html=avatarView({id:'actor',name:'<img onerror=alert(1)>',frameData:'javascript:alert(1)'},'role','avatar');
 assert.ok(!html.includes('class="avatar-frame"'));assert.ok(!html.includes('<img onerror'));
 const framed=avatarView({frameId:'preset_frame_085',frameMediaId:'cached" onerror="bad',name:'<合成>'},'role','avatar');
 assert.ok(framed.includes('data-media-id="cached&quot; onerror=&quot;bad"'));
 assert.ok(framed.includes('&lt;合成&gt;'));
});

test('decoded avatar readiness is shared and evicted together with its Blob URL',async()=>{
 const original=globalThis.Image;let finish!:()=>void;
 globalThis.Image=class {src='';decode(){return new Promise<void>(resolve=>finish=resolve);}} as unknown as typeof Image;
 try {
  const cache=createMediaSources(async()=>new Blob(['image']));
  const first=cache.getDecoded('photo');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(cache.peek('photo'),undefined);
  const second=cache.getDecoded('photo');finish();
  const [a,b]=await Promise.all([first,second]);assert.equal(a,b);assert.equal(cache.peek('photo'),a);
  cache.clear();assert.equal(cache.peek('photo'),undefined);await assert.rejects(fetch(a!));
 }finally{globalThis.Image=original;}
});

test('failed image decoding does not mark the source ready and can retry without rereading its Blob',async()=>{
 const original=globalThis.Image;let fail=true,reads=0;
 globalThis.Image=class {src='';decode(){return fail?Promise.reject(new Error('decode')):Promise.resolve();}} as unknown as typeof Image;
 const cache=createMediaSources(async()=>{reads++;return new Blob(['image']);});
 try {
  await assert.rejects(cache.getDecoded('photo'),/decode/);assert.equal(cache.peek('photo'),undefined);
  fail=false;const source=await cache.getDecoded('photo');assert.ok(source);assert.equal(cache.peek('photo'),source);assert.equal(reads,1);
 }finally{cache.clear();globalThis.Image=original;}
});
