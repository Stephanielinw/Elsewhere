import {safeBubbleCSS} from './bubbleCss';
export type BubbleSide='mine'|'theirs';
export const FONT_MAX_BYTES=20*1024*1024;
export const WALLPAPER_MAX_BYTES=10*1024*1024;
export function bubbleSideCSS(raw:string,side:BubbleSide):string {
  return safeBubbleCSS(raw).split('\n').filter(line=>line.startsWith(`.chat-view .message.${side} `)).map(line=>line.replace(/^\.chat-view /,'')).join('\n');
}
export function retargetBubbleCSS(raw:string,side:BubbleSide):string {
  const safe=safeBubbleCSS(raw);
  if(raw.trim()&&!safe)throw new Error('CSS 不受支持：请使用气泡选择器，不含外部资源或页面定位。');
  return safe.replace(/^\.chat-view /gm,'').replace(/\.message\.(?:mine|theirs)/g,`.message.${side}`);
}
export function fontFileType(bytes:Uint8Array):string {
  const tag=String.fromCharCode(...bytes.slice(0,4));
  if(tag==='wOF2')return 'font/woff2';
  if(tag==='wOFF')return 'font/woff';
  if(tag==='OTTO')return 'font/otf';
  if(bytes[0]===0&&bytes[1]===1&&bytes[2]===0&&bytes[3]===0)return 'font/ttf';
  throw new Error('请选择 WOFF2、WOFF、TTF 或 OTF 字体文件。');
}
export function wallpaperFileType(bytes:Uint8Array):string {
  if([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return 'image/png';
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(/^GIF8[79]a/.test(String.fromCharCode(...bytes.slice(0,6))))return 'image/gif';
  if(String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';
  throw new Error('请选择 PNG、JPG、GIF 或 WebP 壁纸。');
}
export function safeFontUrl(raw:string):string {
  let url:URL;try{url=new URL(raw.trim())}catch{throw new Error('请输入有效的字体文件 HTTPS URL。')}
  if((url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))||url.username||url.password)throw new Error('字体 URL 需使用 HTTPS，且不能包含账号密码。');
  return url.href;
}
export function customFontFamily(id:string):string {return `ElsewhereFont_${id.replace(/[^a-zA-Z0-9]/g,'')}`;}
