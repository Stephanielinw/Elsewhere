import test from 'node:test';
import assert from 'node:assert/strict';
import {createFruitState,parseFruitPreset} from './fruit/preset';
import {nativePreset} from './fruit/nativePreset';
import {initializeRoleNovel,rolePresetBinding,selectRoleRequestPreset,saveRoleNovelProfile} from './fruit/roleProfiles';
import {decodePresetLibrary,serializePresetLibrary,type PresetLibrary} from './fruit/library';
import {novelSamplingParameters} from './novelGeneration';
import {PresetPreparationError} from './fruit/presetIssue';

async function fixture(){
 const native=nativePreset('meeting'),preset=await parseFruitPreset(new TextEncoder().encode(JSON.stringify({prompts:[
  {identifier:'a',name:'合成正文',role:'system',content:'合成规则'},
  {identifier:'blocked',name:'合成小剧场',role:'system',content:'<snow>不启用</snow>'},
  {identifier:'unused',name:'未排序项',role:'system',content:'合成未启用条目'},
  {identifier:'chatHistory',marker:true},
 ],prompt_order:[{order:[{identifier:'a',enabled:true},{identifier:'blocked',enabled:false},{identifier:'chatHistory',enabled:true}]}]})),'synthetic.json',1);
 const old:PresetLibrary={schema:2,revision:1,selectedId:'fruit',defaults:{meeting:'fruit',theatre:'fruit'},entries:[{id:'native',kind:'native',preset:native,enabled:true,profiles:createFruitState().profiles},{id:'fruit',kind:'fruit',preset,enabled:true,profiles:createFruitState().profiles}]};
 const library=initializeRoleNovel(old,'actor'),binding=library.roleNovel!.actor.profiles.fruit;
 binding.profile={...binding.profile,overrides:{a:true,blocked:false,unused:false},style:'合成自定义文风',length:{min:2200,max:2500}};
 return {library,binding,native,preset};
}
test('same original keeps valid disabled and unordered overrides across decoding and saving',async()=>{
 const f=await fixture(),before=structuredClone(f.library),raw=f.preset.raw.slice();
 const decoded=await decodePresetLibrary(serializePresetLibrary(f.library),f.native);
 for(const mode of ['meeting','theatre']as const)assert.deepEqual(selectRoleRequestPreset(decoded,mode,'actor').profile,f.binding.profile);
 const saved=saveRoleNovelProfile(decoded,'actor','fruit',f.binding.profile);assert.deepEqual(rolePresetBinding(saved,'actor').profile,f.binding.profile);
 assert.deepEqual(f.library,before);assert.deepEqual(f.preset.raw,raw);
});
for(const kind of ['missing reference','blocked enabled','unordered enabled','invalid profile','invalid order','invalid edit','invalid regex','invalid enabled']as const)test('same hash still rejects '+kind,async()=>{
 const f=await fixture(),p=f.binding.profile;
 if(kind==='missing reference')p.overrides.missing=false;
 if(kind==='blocked enabled')p.overrides.blocked=true;
 if(kind==='unordered enabled')p.overrides.unused=true;
 if(kind==='invalid profile')p.length.max=NaN;
 if(kind==='invalid order')p.order=['missing'];
 if(kind==='invalid edit')p.edits={chatHistory:{content:'不能修改 Marker'}};
 if(kind==='invalid regex')p.regexOverrides={missing:false};
 if(kind==='invalid enabled')f.binding.enabled='true' as unknown as boolean;
 assert.throws(()=>selectRoleRequestPreset(f.library,'meeting','actor'));
});
test('disabled selection, missing versions and model parameters stay fail closed',async()=>{
 const f=await fixture();f.binding.enabled=false;assert.throws(()=>selectRoleRequestPreset(f.library,'meeting','actor'),e=>e instanceof PresetPreparationError&&e.issue==='preset-disabled');
 f.binding.enabled=true;f.binding.baseHash='missing';assert.throws(()=>selectRoleRequestPreset(f.library,'meeting','actor'),e=>e instanceof PresetPreparationError&&e.issue==='version-missing');
 f.binding.baseHash=f.preset.sha256;f.preset.modelParameters.top_p=5;assert.throws(()=>novelSamplingParameters(selectRoleRequestPreset(f.library,'meeting','actor').preset));
});
test('serialized malformed binding never gains trust merely by having the same hash',async()=>{
 const f=await fixture(),document=serializePresetLibrary(f.library);document.roleNovel!.actor.profiles.fruit.enabled='true' as unknown as boolean;
 await assert.rejects(decodePresetLibrary(document,f.native));
});
