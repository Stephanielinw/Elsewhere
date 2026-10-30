import test from 'node:test';import assert from 'node:assert/strict';
import {framePlacement,frameStyle,frameCompositionSpan,rememberFrame,analyzeFramePixels} from './avatarFrameLayout';
import {PRESET_FRAME_FITS} from './avatarFrameFits';
import {persistAppearance} from './avatarAppearance';
import {renderAvatar} from '../avatarView';

test('one relative coordinate model preserves old manual values across avatar sizes',()=>{
 const owner={frameId:'preset_frame_004',frameScale:1.4,frameX:8,frameY:9};
 assert.deepEqual(framePlacement(owner,PRESET_FRAME_FITS[owner.frameId]),{scale:1.4,x:8,y:9});
 assert.ok(frameStyle(owner).includes(`${8/68*100}%`));
 for(const size of [28,33,43,64,112])assert.equal((8/68*size)/size,8/68);
 const body=renderAvatar({...owner,avatarMediaId:'ava'},'user','avatar');
 assert.ok(body.includes('avatar-composite'));assert.ok(body.includes('data-media-id="ava"'));assert.ok(body.includes(frameStyle(owner)));
 assert.ok(!renderAvatar({name:'<script>bad()</script>'},'user','avatar').includes('<script>'));
});
test('authored size is not inferred from opening diameter; explicit per-material preferences win',()=>{
 assert.equal(Object.keys(PRESET_FRAME_FITS).length,363);
 for(const fit of Object.values(PRESET_FRAME_FITS)){assert.equal(fit.scale,1.21);assert.ok([fit.x,fit.y,fit.width,fit.height].every(Number.isFinite));}
 const owner={frameId:'preset_frame_004',frameScale:1.25,frameX:0,frameY:0,frameAdjustments:{}};
 assert.equal(framePlacement(owner,PRESET_FRAME_FITS[owner.frameId]).scale,1.21);
 rememberFrame(owner);assert.equal(framePlacement(owner,PRESET_FRAME_FITS[owner.frameId]).scale,1.25);
 assert.ok(!frameStyle({}, {scale:Number.NaN,x:Number.POSITIVE_INFINITY,y:Number.NaN}).includes('NaN'));
});
test('opening detection distinguishes a central slot from open decorations and opaque images',()=>{
 const width=100,height=100,pixels=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(Math.hypot(x-50,y-55)>30&&Math.hypot(x-50,y-55)<35)pixels[(y*width+x)*4+3]=255;
 const fit=analyzeFramePixels(width,height,pixels);assert.equal(fit.method,'opening');assert.ok(fit.y<0);
 assert.equal(analyzeFramePixels(width,height,new Uint8Array(pixels.length)).method,'canvas');
 pixels.fill(255);assert.equal(analyzeFramePixels(width,height,pixels).method,'canvas');
});
test('appearance persistence rolls back failed world writes and only deletes newly created media',async()=>{
 const owner={avatarMediaId:'old',frameId:'old-frame',notes:'keep'},removed:string[]=[],put:string[]=[];
 await assert.rejects(persistAppearance(owner,{frameId:'new'}, {blob:new Blob(['new']),remove:false},{uid:()=> 'new-avatar',put:async id=>{put.push(id)},remove:async id=>{removed.push(id)},save:()=>false,current:()=>true}));
 assert.deepEqual(owner,{avatarMediaId:'old',frameId:'old-frame',notes:'keep'});assert.deepEqual(put,['new-avatar']);assert.deepEqual(removed,['new-avatar']);
 const ok=await persistAppearance(owner,{frameId:'new'},{blob:null,remove:false},{uid:()=>'',put:async()=>{},remove:async id=>{removed.push(id)},save:()=>true,current:()=>true});assert.equal(ok,true);assert.equal(owner.notes,'keep');assert.equal(owner.avatarMediaId,'old');
});
test('transparent outer padding does not shrink the visible composition preview',()=>{
 const fit={scale:3,x:0,y:0,bounds:{left:-.2,right:.2,top:-.2,bottom:.2}};
 assert.ok(Math.abs(frameCompositionSpan({},fit)-1.2)<.00001);
 assert.ok(frameCompositionSpan({frameScale:4,frameX:34},fit)>2);
 assert.equal(frameCompositionSpan({frameScale:1.4,frameX:8,frameY:9}),1.4+18/68);
});
test('cancelled or failed old async writes cannot undo newer owner state',async()=>{
 const owner={avatarMediaId:'old',frameId:'old-frame'};let release:()=>void=()=>{};
 const gate=new Promise<void>(r=>{release=r});let current=true;
 const pending=persistAppearance(owner,{frameId:'stale'},{blob:new Blob(['new']),remove:false},{uid:()=> 'new',put:async()=>{await gate;throw new Error('late failure')},remove:async()=>{},save:()=>true,current:()=>current});
 owner.frameId='newer-confirmed';current=false;release();await assert.rejects(pending);assert.equal(owner.frameId,'newer-confirmed');
});
