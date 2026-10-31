import test from 'node:test';
import assert from 'node:assert/strict';
import {bubbleSideCSS,retargetBubbleCSS,fontFileType,wallpaperFileType,safeFontUrl} from './appearance';
import {defaults} from './defaults';
import {collectReferencedMediaIds} from './media';

test('old mixed bubble CSS keeps both sides; a shared preset retargets only the chosen side',()=>{
 const mixed='.message.mine .bubble { background: pink; }\n.message.theirs .bubble { color: blue; }';
 assert.match(bubbleSideCSS(mixed,'mine'),/background: pink/);
 assert.doesNotMatch(bubbleSideCSS(mixed,'mine'),/color: blue/);
 const mine=retargetBubbleCSS('.message.theirs .bubble { color: blue; }','mine');
 assert.match(mine,/\.message.mine .bubble/);assert.doesNotMatch(mine,/theirs/);
 assert.throws(()=>retargetBubbleCSS('.message.mine .bubble {background:url(https://x.invalid)}','theirs'),/CSS/);
 assert.throws(()=>retargetBubbleCSS('body { color:red }','mine'),/CSS/);
});
test('font and wallpaper imports verify file signatures; font URLs reject executable sources and credentials',()=>{
 assert.equal(fontFileType(new Uint8Array([119,79,70,50,1])),'font/woff2');
 assert.equal(fontFileType(new Uint8Array([0,1,0,0,1])),'font/ttf');
 assert.throws(()=>fontFileType(new TextEncoder().encode('<script>bad</script>')),/字体/);
 assert.equal(wallpaperFileType(new Uint8Array([137,80,78,71,13,10,26,10])),'image/png');
 assert.throws(()=>wallpaperFileType(new TextEncoder().encode('<svg onload="x"/>')),/壁纸/);
 assert.equal(safeFontUrl('https://example.invalid/font.woff2'),'https://example.invalid/font.woff2');
 for(const url of ['javascript:alert(1)','data:text/html,x','https://user:pass@example.invalid/x','http://example.invalid/x'])assert.throws(()=>safeFontUrl(url),/字体/);
});
test('backup media references include new appearance media without replacing old avatar references',()=>{
 const data=defaults();data.roles[0].avatarMediaId='avatar';data.roles[0].wallpaperMediaId='wall';data.customFonts=[{id:'font1',name:'备注',mediaId:'font-media'}];
 assert.deepEqual(new Set(collectReferencedMediaIds(data)),new Set(['avatar','wall','font-media']));
});

test('appearance metadata import tolerates damaged new fields and preserves existing role settings',async()=>{
 const {normalizeAndMigrateData}=await import('./defaults');
 const original=defaults();original.roles[0].theme='pink';original.roles[0].bubbleCSS='.message.mine .bubble{color:blue}';
 const normalized=normalizeAndMigrateData({...original,customFonts:[null,{id:'font1',name:'有效备注',mediaId:'media1'},{id:5,name:'损坏'}],bubblePresets:[null,{id:'preset1',name:'样式',css:'.message.mine .bubble{color:blue}'},{id:'unsafe',name:'外部',css:'.message.mine .bubble{background:url(x)}'}]});
 assert.equal(normalized.customFonts?.length,1);
 assert.equal(normalized.bubblePresets?.length,1);
 assert.equal(normalized.roles[0].theme,'pink');
 assert.equal(normalized.roles[0].bubbleCSS,'.message.mine .bubble{color:blue}');
});
