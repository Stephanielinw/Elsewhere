import {compileFruitPrompt} from './compiler';
import {makeFruitFixtureContext} from './fixture';
import {isNativePreset} from './nativePreset';
import {novelSamplingParameters} from '../novelGeneration';
import type {FruitMode,FruitPreset,FruitProfile,FruitDiagnostic} from './types';

/** Configuration check only; each request still verifies its actual role, sources and scene. */
export function novelPresetReadiness(preset:FruitPreset,profile:FruitProfile,mode:FruitMode,enabled=true){
 const diagnostics:FruitDiagnostic[]=[];
 try{
  const result=compileFruitPrompt(preset,profile,makeFruitFixtureContext(mode),{rng:()=>0.5});
  diagnostics.push(...result.diagnostics.filter(d=>d.severity==='error'));
  if(!isNativePreset(preset)){
   novelSamplingParameters(preset);
   if(!result.messages.some(m=>m.marker==='chatHistory'))diagnostics.push({code:'live-history-required',severity:'error',message:'必须启用 Chat History Marker 以保留当前真实输入'});
   if(!enabled)diagnostics.push({code:'preset-disabled',severity:'error',message:'本预设已停用；启用并保存后才可正式生成'});
  }
 }catch(error){diagnostics.push({code:'profile-invalid',severity:'error',message:error instanceof Error?error.message:'配置无法编译'});}
 return {ready:!diagnostics.length,diagnostics};
}
