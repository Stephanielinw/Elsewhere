import {compileConversationPrompt} from '../conversationPrompt';
import type {FruitCompilation,FruitContext,FruitLength,FruitPreset,FruitProfile} from './types';
export function compileFruitPrompt(preset:FruitPreset,profile:FruitProfile,context:FruitContext,options:{lengthOverride?:FruitLength;rng?:()=>number;format?:'native'}={}):FruitCompilation {
 if(context.source!=='isolated-fixture')throw new Error('FRUIT-01 仅允许隔离测试上下文；尚未接入正式记忆');
 return {...compileConversationPrompt(preset,profile,context,options),mode:context.mode,previewOnly:true,sendAllowed:false};
}
