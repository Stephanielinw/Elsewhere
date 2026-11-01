import workerSource from './core/fruit/novelCard.worker.js?raw';
import type {NovelCardJob,NovelCardResult,NovelCard} from './core/fruit/novelCards';
import {AUTHOR_CARD_IDS} from './core/fruit/novelCards';
import {validNovelDocument,permittedNovelSections} from './core/novelDocument';
import type {NovelSection} from './core/novelDocument';
import type {ChatMessage} from './core/types';
import type {FruitPreset,FruitProfile,FruitMode} from './core/fruit/types';
import {PresetLibraryRepository} from './core/fruit/library';
import {nativePreset} from './core/fruit/nativePreset';
import {presetVersion,rolePresetBinding,legacyNovelSnapshot} from './core/fruit/roleProfiles';
import {escHtml as esc} from './core/footprints';
import {novelAuxiliaryHtml} from './novelOutputView';

export function runNovelCards(job:NovelCardJob,signal?:AbortSignal,timeoutMs=1000):Promise<NovelCardResult>{
 return new Promise(resolve=>{
  let worker:Worker|undefined,url='',timer:ReturnType<typeof setTimeout>|undefined,done=false;
  const finish=(result:NovelCardResult)=>{if(done)return;done=true;clearTimeout(timer);worker?.terminate();if(url)URL.revokeObjectURL(url);signal?.removeEventListener('abort',abort);resolve(result);};
  const fail=(reason:string)=>finish({cards:[],diagnostics:[{ruleId:'display',status:'failed',reason,elapsedMs:0}]});
  const abort=()=>fail('展示已取消，未改变原始记录');
  if(signal?.aborted){abort();return;}
  try{url=URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'}));worker=new Worker(url);signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>fail('展示 Worker 超时，已中止并回退文字'),Math.min(1000,Math.max(1,timeoutMs)));worker.onmessage=event=>finish(event.data);worker.onerror=event=>{event.preventDefault();fail('展示 Worker 不可用，已回退文字');};worker.postMessage(job);}catch{fail('浏览器无法运行隔离展示，已回退文字');}
 });
}

/** Imported DOM/scripts never enter this document. Only fixed adapter DOM and hash-verified CSS do. */
export function authorCardFrame(card:NovelCard,token:string,nonce:string,night:boolean):string{
 const csp=`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
 const bridge=`(()=>{const token=${JSON.stringify(token)};const send=()=>parent.postMessage({type:'elsewhere-card-size',token,height:Math.ceil(document.body.getBoundingClientRect().height)+8},'*');new ResizeObserver(send).observe(document.body);document.querySelector('[data-card-theme]')?.addEventListener('click',()=>{document.querySelector('.novel-header-container,.fate-status-wrapper')?.classList.toggle('night-mode');send()});addEventListener('load',send);send()})()`;
 return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${esc(csp)}"><style>html{color-scheme:normal;background:transparent;--SmartThemeBodyColor:${night?'#f0e6d8':'#493c35'}}body{margin:0;padding:4px;box-sizing:border-box;background:transparent;font-size:16px}*,*::before,*::after{box-sizing:border-box}body>div{max-width:100%;overflow-wrap:anywhere}${card.css}</style><body>${card.html}<script nonce="${nonce}">${bridge}</script></body></html>`;
}
export interface NovelDisplayOwner {roleId:string;stageId:string;mode:FruitMode;message:ChatMessage;depth:number;names:{char:string;user:string}}
const titles:Record<NovelSection['type'],string>={content:'正文',novel_header:'章节信息',status_bar:'场景信息',prologue:'序言',角色状态面板:'人物状态',meow_fm:'剧情摘要',profile:'人物辅助',branches:'剧情选项'};
export function novelSectionsHtml(sections:NovelSection[]):string{
 return sections.map((s,i)=>s.type==='content'?`<div class="novel-body-text" data-novel-section="${i}">${esc(s.text)}</div>`:`<section class="novel-display-section" data-novel-section="${i}" data-section-type="${s.type}"><details class="novel-raw-section"${['novel_header','status_bar','prologue','角色状态面板'].includes(s.type)?' open':''}><summary>${titles[s.type]}</summary><div>${esc(s.text)}</div></details></section>`).join('');
}
export function mountAuthorCards(target:HTMLElement,result:NovelCardResult,signal:AbortSignal,valid:()=>boolean,night:boolean):()=>void{
 const frames=new Map<Window,{frame:HTMLIFrameElement;token:string;section:HTMLElement;fallback:string}>();
 for(const card of result.cards){if(signal.aborted||!valid())break;const section=target.querySelector<HTMLElement>(`[data-novel-section="${card.sectionIndex}"]`);if(!section||section.dataset.sectionType!==(card.kind==='chapter'?'novel_header':'status_bar'))continue;
  const fallback=section.innerHTML,frame=document.createElement('iframe'),token=crypto.randomUUID(),nonce=crypto.randomUUID();frame.className='novel-author-card';frame.title=card.kind==='chapter'?'果实作者章节卡':'果实作者状态与题记';frame.setAttribute('sandbox','allow-scripts');frame.setAttribute('referrerpolicy','no-referrer');frame.setAttribute('scrolling','no');frame.dataset.authorCard=card.kind;frame.srcdoc=authorCardFrame(card,token,nonce,night);section.replaceChildren(frame);if(frame.contentWindow)frames.set(frame.contentWindow,{frame,token,section,fallback});
 }
 const onMessage=(event:MessageEvent)=>{const item=event.source?frames.get(event.source as Window):undefined,v=event.data;if(!item||signal.aborted||!valid()||!item.frame.isConnected||!v||v.type!=='elsewhere-card-size'||v.token!==item.token||typeof v.height!=='number'||!Number.isFinite(v.height)||v.height<1)return;if(v.height>4096){item.section.innerHTML=item.fallback;frames.delete(event.source as Window);return;}item.frame.style.height=Math.ceil(v.height)+'px';};
 window.addEventListener('message',onMessage);const clean=()=>{window.removeEventListener('message',onMessage);frames.clear();};signal.addEventListener('abort',clean,{once:true});return clean;
}

export function createNovelDisplay(resolve:(roleId:string,stageId:string,mode:FruitMode,messageId:string)=>NovelDisplayOwner|null){
 let controller=new AbortController(),observer:IntersectionObserver|undefined;
 const cache=new Map<string,NovelCardResult>();let priorRole='';
 function detach(){controller.abort();observer?.disconnect();observer=undefined;}
 function mount(root:HTMLElement){
  detach();controller=new AbortController();const signal=controller.signal,targets=[...root.querySelectorAll<HTMLElement>('[data-novel-document]')];if(!targets.length)return;
  const role=targets[0].dataset.roleId||'';if(priorRole!==role){cache.clear();priorRole=role;}
  const library=new PresetLibraryRepository(nativePreset('meeting')).load(false).catch(()=>null);let queue=Promise.resolve();
  async function display(target:HTMLElement){
   const {roleId='',stageId='',mode='',novelDocument=''}=target.dataset;if(mode!=='meeting'&&mode!=='theatre')return;
   const owner=resolve(roleId,stageId,mode,novelDocument);if(!owner)return;
   const before={text:owner.message.text,editedAt:owner.message.editedAt,revision:owner.message.revisionCount,output:owner.message.novelOutput};
   const valid=()=>!signal.aborted&&target.isConnected&&resolve(roleId,stageId,mode,novelDocument)?.message===owner.message&&owner.message.text===before.text&&owner.message.editedAt===before.editedAt&&owner.message.revisionCount===before.revision&&owner.message.novelOutput===before.output;
   try{
    const l=await library;if(!valid())return;if(!l)throw Error('展示原件暂不可用');
    const profile=l.roleNovel?.[roleId]&&!l.roleNovel[roleId].useLegacy?rolePresetBinding(l,roleId,owner.message.novelOutput!.presetId).profile:legacyNovelSnapshot(l).entries[owner.message.novelOutput!.presetId]?.profiles[mode];
    if(!profile)throw Error('此历史的角色配置已不可用');
    const doc=validNovelDocument(owner.message,roleId,stageId,mode),output=owner.message.novelOutput!;
    if(!doc){if(output.document){target.textContent=owner.message.text;return;}if(!owner.message.editedAt)target.innerHTML=esc(owner.message.text)+novelAuxiliaryHtml({...owner.message,novelOutput:{...output,scene:profile.output.scene?output.scene:undefined,summary:profile.output.summary?output.summary:undefined,characters:profile.output.characters?output.characters:undefined,choices:profile.output.characters?output.choices:undefined,generatedAuxiliary:profile.output.auxiliary?output.generatedAuxiliary:undefined}});return;}
    const sections=permittedNovelSections(doc.sections,profile);target.innerHTML=novelSectionsHtml(sections);target.dataset.displayState='plain';
    const preset=presetVersion(l,doc.presetId,doc.presetHash,mode),night=document.documentElement.dataset.theme==='night'||document.body.dataset.theme==='night';
    const key=JSON.stringify([doc,profile.output,sections,profile.regexOverrides||{},owner.depth,owner.names,night]);let result=cache.get(key);
    if(!result){result=await runNovelCards({rules:preset.regex,sections,overrides:profile.regexOverrides||{},depth:owner.depth,isEdit:false,names:owner.names,night},signal);if(!valid())return;if(cache.size>=24)cache.delete(cache.keys().next().value!);cache.set(key,result);}
    if(!valid())return;mountAuthorCards(target,result,signal,valid,night);target.dataset.displayState=result.cards.length?'author-cards':'plain';
    const warnings=result.diagnostics.filter(d=>(Object.values(AUTHOR_CARD_IDS).includes(d.ruleId as typeof AUTHOR_CARD_IDS.chapter)||d.ruleId==='display')&&d.status!=='matched');
    if(warnings.length&&sections.some(s=>s.type==='novel_header'||s.type==='status_bar'))target.insertAdjacentHTML('beforeend',`<details class="novel-display-diagnostics"><summary>展示兼容说明</summary>${warnings.map(w=>`<p>${esc(w.reason)}</p>`).join('')}</details>`);
    if(profile.output.auxiliary&&output.generatedAuxiliary)target.insertAdjacentHTML('beforeend',novelAuxiliaryHtml({...owner.message,novelOutput:{...output,scene:undefined,summary:undefined,characters:undefined,choices:undefined}}));
   }catch{if(valid())target.insertAdjacentHTML('beforeend','<small class="novel-display-diagnostics">展示原件或配置暂不可用，已保留安全正文；未补发模型请求。</small>');}
  }
  if(typeof IntersectionObserver==='undefined'){for(const target of targets)queue=queue.then(()=>display(target));return;}
  observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer?.unobserve(entry.target);queue=queue.then(()=>display(entry.target as HTMLElement));}},{rootMargin:'300px'});for(const target of targets)observer.observe(target);
 }
 return {mount,detach};
}
