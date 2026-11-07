import type {AvatarFrameFields} from './core/avatarAppearance';
import {frameStyle} from './core/avatarAppearance';
import {findPresetFrameByIdOrUrl,isAllowedFrameSource} from './core/avatarFrames';
import {escHtml as esc} from './core/footprints';

type AvatarOwner=AvatarFrameFields&{id?:string;name?:string;avatarMediaId?:string};
export interface AvatarOptions {previewUrl?:string;removed?:boolean;fallbackName?:string;framePreviewUrl?:string;loadedUrl?:string}

export function renderAvatarFrameHtml(owner?:AvatarFrameFields|null,previewUrl=''):string {
 if(!owner)return '';
 const style=esc(frameStyle(owner)),id=esc(owner.frameId||'');
 if(owner.frameMediaId&&!previewUrl)return `<img class="avatar-frame" alt="" data-media-id="${esc(owner.frameMediaId)}" data-frame-id="${id}" style="${style}">`;
 const src=previewUrl||(isAllowedFrameSource(owner.frameData)?owner.frameData:findPresetFrameByIdOrUrl(owner.frameId)?.url);
 return src?`<img class="avatar-frame" alt="" src="${esc(src)}" loading="eager" data-frame-id="${id}" style="${style}">`:'';
}

export function avatarView(owner:AvatarOwner|null|undefined,kind:'role'|'user',classes:string,opts:AvatarOptions={}):string {
 const name=opts.fallbackName??owner?.name??(kind==='user'?'我':'?'),fallback=Array.from(name.trim()||(kind==='user'?'我':'?'))[0];
 const mediaId=opts.removed?'':owner?.avatarMediaId,src=opts.previewUrl||opts.loadedUrl;
 const frame=renderAvatarFrameHtml(owner,opts.framePreviewUrl);
 const photo=src||mediaId?`<img class="avatar-img" ${src?`src="${esc(src)}"`:""} ${mediaId&&!opts.previewUrl?`data-media-id="${esc(mediaId)}" ${src?`data-hydrated-key="${esc(mediaId)}"`:""}`:""} alt="${esc(name)}">`:'';
 const key=JSON.stringify([kind,owner?.id,classes,name,mediaId,src,opts.framePreviewUrl,frame]);
 return `<span class="${classes}${photo?' has-avatar-img':''}${src?' avatar-loaded':''}${frame?' has-avatar-frame':''}" data-avatar-box="${kind}" ${kind==='role'?`data-role-id="${esc(owner?.id||'')}"`:''} data-avatar-render-key="${esc(key)}"><span class="avatar-fallback">${esc(fallback)}</span>${photo}${frame}</span>`;
}

/** Retain avatar branches and, when requested, the live chat subtree. */
export function renderWithAvatars(root:HTMLElement,html:string,preserveChat=false):void {
 const template=document.createElement('template');template.innerHTML=html;
 const retainedSelector=preserveChat?'[data-avatar-box],.chat-conversation':'[data-avatar-box]';
 const hasAvatar=(node:Node)=>node instanceof Element&&(node.matches(retainedSelector)||Boolean(node.querySelector(retainedSelector)));
 const key=(node:Node)=>{
  if(!(node instanceof Element))return node.nodeName;
  if(preserveChat){
   if(node.hasAttribute('data-chat-key'))return node.tagName+':'+node.getAttribute('data-chat-key');
   if(node.hasAttribute('data-media-id'))return node.tagName+':media:'+node.getAttribute('data-media-id');
  }
  if(node.matches('[data-avatar-box]'))return `avatar:${node.getAttribute('data-avatar-box')}:${node.getAttribute('data-role-id')||''}:${node.classList[0]}`;
  return `${node.tagName}:${node.id||node.getAttribute('data-msg-id')||node.classList[0]||''}`;
 };
 const attributes=(old:Element,next:Element,photo=false)=>{
  for(const attr of [...old.attributes]){
   if(photo&&['src','data-hydrated-key','data-fallback-bound'].includes(attr.name))continue;
   if(!next.hasAttribute(attr.name))old.removeAttribute(attr.name);
  }
  for(const attr of [...next.attributes])if(old.getAttribute(attr.name)!==attr.value)old.setAttribute(attr.name,attr.value);
  if(photo&&!next.hasAttribute('data-media-id'))old.removeAttribute('data-hydrated-key');
 };
 const patch=(parent:Node,incoming:Node)=>{
  const chat=preserveChat&&parent instanceof Element&&Boolean(parent.closest('.chat-conversation'));
  if(chat){const wanted=new Set([...incoming.childNodes].map(key));for(const node of [...parent.childNodes])if(!wanted.has(key(node)))node.remove();}
  const pool=new Map<string,ChildNode[]>();
  for(const node of [...parent.childNodes]){const k=key(node);pool.set(k,[...(pool.get(k)||[]),node]);}
  let cursor=parent.firstChild;
  for(const next of [...incoming.childNodes]){
   const prior=pool.get(key(next))?.shift();let node=next;
   if(prior instanceof Element&&next instanceof Element&&prior.tagName===next.tagName){
    if(chat&&prior.isEqualNode(next))node=prior;
    else if(prior.matches('.avatar-img')&&prior.closest('[data-avatar-box]')){
     attributes(prior,next,true);node=prior;
    }else if(prior.matches('.avatar-frame')&&prior.closest('[data-avatar-box]')){
     const sameSource=next.hasAttribute('data-media-id')?prior.getAttribute('data-media-id')===next.getAttribute('data-media-id'):prior.getAttribute('src')===next.getAttribute('src');
     if(sameSource&&prior.classList.contains('frame-img-error'))next.classList.add('frame-img-error');
     attributes(prior,next,true);node=prior;
    }else if(chat){
     const media=prior.hasAttribute('data-media-id')&&prior.getAttribute('data-media-id')===next.getAttribute('data-media-id');
     if(prior.matches('[data-avatar-box]')&&prior.classList.contains('avatar-loaded')&&next.querySelector('.avatar-img'))next.classList.add('avatar-loaded');
     attributes(prior,next,media);if(!media)patch(prior,next);node=prior;
    }else if(hasAvatar(prior)&&hasAvatar(next)){
     if(prior.matches('[data-avatar-box]')&&prior.classList.contains('avatar-loaded')&&next.querySelector('.avatar-img'))next.classList.add('avatar-loaded');
     attributes(prior,next);patch(prior,next);node=prior;
    }
   }else if(chat&&prior&&prior.nodeType===next.nodeType&&!(prior instanceof Element)){
    if(prior.nodeValue!==next.nodeValue)prior.nodeValue=next.nodeValue;node=prior;
   }
   if(node===cursor)cursor=cursor.nextSibling;
   else {parent.insertBefore(node,cursor);if(prior===cursor){cursor=prior.nextSibling;prior.remove();}}
  }
  while(cursor){const next=cursor.nextSibling;cursor.remove();cursor=next;}
 };
 patch(root,template.content);
}
