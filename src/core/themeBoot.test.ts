import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');

test('saved theme is restored before the application loads, without changing saved data',()=>{
 const script=html.match(/<script id="theme-boot">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script,'first-paint theme bootstrap');
 assert.ok(html.indexOf('href="/src/styles.css"')<html.indexOf('id="theme-boot"'));
 for(const [saved,expected] of [
  [{theme:'coffee',selected:'a',roles:[{id:'a',theme:'night'}]},'night'],
  [{theme:'night',selected:null,roles:[]},'night'],
  [{theme:'sand'},'coffee'],[{theme:'violet'},'pink'],[{theme:'invalid'},'blue'],
  [null,'blue'],['broken-json','blue'],
 ] as const){
  const root={dataset:{} as Record<string,string>,style:{colorScheme:''}},meta={content:''},scheme={content:''};let reads=0;
  runInNewContext(script,{document:{documentElement:root,querySelector:(s:string)=>s.includes('color-scheme')?scheme:meta,addEventListener(){},removeEventListener(){}},localStorage:{getItem(key:string){assert.equal(key,'elsewhere-v01');reads++;return typeof saved==='string'?saved:JSON.stringify(saved);}},getComputedStyle:()=>({getPropertyValue:()=> '#22273a'})});
  assert.equal(root.dataset.theme,expected);assert.equal(meta.content,'#22273a');assert.equal(reads,1);
  assert.equal(root.style.colorScheme,expected==='night'?'dark':'light');assert.equal(scheme.content,root.style.colorScheme);
 }
});

test('production stylesheet arriving after the bootstrap still updates the browser tint',()=>{
 const script=html.match(/<script id="theme-boot">([\s\S]*?)<\/script>/)?.[1];assert.ok(script);
 const root={dataset:{},style:{colorScheme:''}},meta={content:'#edf6ff'},scheme={content:''};let color='',loaded=()=>{},removed=false;
 runInNewContext(script,{document:{documentElement:root,querySelector:(s:string)=>s.includes('color-scheme')?scheme:meta,addEventListener(_name:string,fn:()=>void){loaded=fn;},removeEventListener(){removed=true;}},localStorage:{getItem:()=>JSON.stringify({theme:'night'})},getComputedStyle:()=>({getPropertyValue:()=>color})});
 assert.equal(scheme.content,'dark');assert.equal(root.style.colorScheme,'dark');
 assert.equal(meta.content,'#edf6ff');assert.equal(removed,false);
 color='#22273a';loaded();assert.equal(meta.content,color);assert.equal(removed,true);
});

test('theme bootstrap tolerates unavailable storage and keeps user zoom enabled',()=>{
 const script=html.match(/<script id="theme-boot">([\s\S]*?)<\/script>/)?.[1];assert.ok(script);
 assert.doesNotThrow(()=>runInNewContext(script,{localStorage:{getItem(){throw Error('unavailable');}}}));
 assert.match(html,/viewport-fit=cover/);assert.doesNotMatch(html,/user-scalable=no|maximum-scale=1/);
});
