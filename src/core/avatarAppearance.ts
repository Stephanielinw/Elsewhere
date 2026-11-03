import {findPresetFrameByIdOrUrl} from './avatarFrames';
import {FRAME_APERTURES} from './avatarFrameFits';

export interface AvatarFrameFields {
 frameId?:string;frameMediaId?:string;frameData?:string;
 frameScale?:number;frameX?:number;frameY?:number;frameLayoutVersion?:1;
}
export interface FrameDraft extends AvatarFrameFields {
 frameId:string;frameMediaId:string;frameData:string;frameScale:number;frameX:number;frameY:number;
}
export const DEFAULT_FRAME_SCALE=1.21;
const finite=(value:unknown,fallback:number)=>Number.isFinite(Number(value))?Number(value):fallback;

export function frameDraft(owner?:AvatarFrameFields|null):FrameDraft {
 const hasFrame=Boolean(owner?.frameData||owner?.frameMediaId||owner?.frameId&&owner.frameId!=='none');
 return {frameId:owner?.frameId||(hasFrame?'custom':'none'),frameMediaId:owner?.frameMediaId||'',frameData:owner?.frameData||'',
  frameScale:Math.max(.5,Math.min(3,finite(owner?.frameScale,hasFrame?1.25:DEFAULT_FRAME_SCALE)||1.25)),
  frameX:Math.max(-80,Math.min(80,finite(owner?.frameX,0))),frameY:Math.max(-80,Math.min(80,finite(owner?.frameY,0))),
  frameLayoutVersion:owner?.frameLayoutVersion===1||!hasFrame?1:undefined};
}

export function frameGeometry(owner?:AvatarFrameFields|null){
 const draft=frameDraft(owner),preset=findPresetFrameByIdOrUrl(draft.frameId)||findPresetFrameByIdOrUrl(draft.frameData);
 const fit=draft.frameLayoutVersion===1&&preset&&(!draft.frameData||draft.frameData===preset.url)?FRAME_APERTURES[preset.id]:undefined;
 // Old values are logical pixels of the original 68px picker, never device pixels.
 return {scale:draft.frameScale,xPercent:(draft.frameX+(fit?.[0]||0)*draft.frameScale/DEFAULT_FRAME_SCALE)*100/68,
  yPercent:(draft.frameY+(fit?.[1]||0)*draft.frameScale/DEFAULT_FRAME_SCALE)*100/68};
}
export function frameStyle(owner?:AvatarFrameFields|null){
 const p=frameGeometry(owner);return `--frame-size:${p.scale};--frame-x:${p.xPercent}%;--frame-y:${p.yPercent}%`;
}

export function saveFrameOnly(owner:AvatarFrameFields,draft:FrameDraft,persist:()=>boolean):boolean {
 const next=frameDraft(draft),keys=Object.keys(next),before=keys.map(key=>[key,Object.getOwnPropertyDescriptor(owner,key)] as const);
 Object.assign(owner,next);
 try {if(persist())return true;}catch{}
 for(const [key,descriptor]of before){if(descriptor)Object.defineProperty(owner,key,descriptor);else Reflect.deleteProperty(owner,key);}
 return false;
}
