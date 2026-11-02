import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleViewportFrame} from '../mobileViewport';

test('visible frame follows keyboard height and pan without assuming a keyboard size',()=>{
 assert.deepEqual(visibleViewportFrame({height:494,offsetTop:34,scale:1},844,true,false),{height:494,top:34,keyboard:true});
 assert.deepEqual(visibleViewportFrame({height:614,offsetTop:0,scale:1},844,true,false),{height:614,top:0,keyboard:true});
});
test('blur retains keyboard inset until viewport recovers; chrome alone does not open keyboard state',()=>{
 assert.equal(visibleViewportFrame({height:494,offsetTop:0,scale:1},844,false,true)?.keyboard,true);
 assert.equal(visibleViewportFrame({height:844,offsetTop:0,scale:1},844,false,true)?.keyboard,false);
 assert.equal(visibleViewportFrame({height:770,offsetTop:0,scale:1},844,true,false)?.keyboard,false);
 assert.equal(visibleViewportFrame({height:494,offsetTop:0,scale:1},844,false,false)?.keyboard,false);
});
test('pinch zoom and invalid viewport samples do not resize or reposition app',()=>{
 for(const v of [{height:240,offsetTop:20,scale:2},{height:0,offsetTop:0,scale:1},{height:NaN,offsetTop:0,scale:1},{height:400,offsetTop:Infinity,scale:1}])assert.equal(visibleViewportFrame(v,844,true,false),null);
 assert.equal(visibleViewportFrame({height:844,offsetTop:-1,scale:1},844,false,false)?.top,0);
});
