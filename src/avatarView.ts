import {escHtml as esc} from './core/footprints';
import {frameStyle,frameCompositionSpan,type FrameFields,type FrameAdjustment,type FrameFit} from './core/avatarFrameLayout';
import {findPresetAvatarFrameById, isAllowedAvatarFrameSource} from './core/avatarFrames';
export interface AvatarOwner extends FrameFields { id?:string; name?:string; emoji?:string; avatarMediaId?:string }
export function renderFrame(owner: AvatarOwner, defaults?: FrameAdjustment): string {
  const media=owner.frameMediaId,src=isAllowedAvatarFrameSource(owner.frameData||'')?owner.frameData:findPresetAvatarFrameById(owner.frameId||'')?.url;
  if(!media&&!src)return '';
  return `<img class="avatar-frame" alt="" ${media?`data-media-id="${esc(media)}"`:`src="${esc(src||'')}" loading="lazy"`} data-frame-id="${esc(owner.frameId||'custom')}" style="${frameStyle(owner,defaults)}">`;
}
export function renderAvatar(owner:AvatarOwner|null|undefined,kind:'user'|'role',cl:string,opts:{previewUrl?:string;removed?:boolean;fallbackName?:string;defaults?:FrameAdjustment & Pick<FrameFit,'bounds'>}={}):string {
  const frame=renderFrame(owner||{},opts.defaults),media=!opts.removed?owner?.avatarMediaId:'',image=opts.previewUrl||media;
  const span=frameCompositionSpan(owner||{},opts.defaults);
  const name=String(opts.fallbackName??owner?.name??(kind==='user'?'我':'?'));
  return `<span class="${cl} avatar-composite${image?' has-avatar-img':''}${opts.previewUrl?' avatar-loaded':''}${frame?' has-avatar-frame':''}" style="--composition-span:${span}" data-avatar-box="${kind}" ${kind==='role'?`data-role-id="${esc(owner?.id||'')}"`:''}><span class="avatar-fallback">${esc(Array.from(name.trim()||'?')[0])}</span>${image?`<img class="avatar-img" ${opts.previewUrl?`src="${esc(opts.previewUrl)}"`:`data-media-id="${esc(media||'')}"`} alt="${esc(name)}">`:''}${frame}</span>`;
}
