type ViewportSample=Pick<VisualViewport,'height'|'offsetTop'|'scale'>;

export function visibleViewportFrame(v:ViewportSample,layoutHeight:number,editing:boolean,wasKeyboard:boolean){
 if(!Number.isFinite(v.height)||v.height<=0||!Number.isFinite(v.offsetTop)||Math.abs(v.scale-1)>.01)return null;
 // Toolbar motion alone is not a keyboard; keep the inset suppressed through the closing animation.
 return {height:v.height,top:Math.max(0,v.offsetTop),keyboard:layoutHeight-v.height>80&&(editing||wasKeyboard)};
}

/** Layout only: never focuses controls, scrolls the document, renders UI, or writes storage. */
export function installMobileViewport(){
 const root=document.documentElement,media=matchMedia('(any-pointer:coarse), (display-mode:standalone)'),viewport=window.visualViewport,abort=new AbortController();
 let raf=0,keyboard=false;
 function update(){
  raf=0;
  if(!media.matches||!viewport){root.style.removeProperty('--app-viewport-height');root.style.removeProperty('--app-viewport-top');delete root.dataset.keyboardOpen;keyboard=false;return;}
  const editing=Boolean(document.activeElement?.matches('textarea,select,input:not([type=button],[type=submit],[type=checkbox],[type=radio],[type=range],[type=file],[type=color]),[contenteditable]:not([contenteditable=false])'));
  const frame=visibleViewportFrame(viewport,root.clientHeight,editing,keyboard);if(!frame)return;
  const pane=document.querySelector<HTMLElement>('#scroll-area');
  const pinned=pane&&pane.scrollHeight-pane.clientHeight-pane.scrollTop<2;
  keyboard=frame.keyboard;root.dataset.keyboardOpen=String(keyboard);
  root.style.setProperty('--app-viewport-height',frame.height+'px');root.style.setProperty('--app-viewport-top',frame.top+'px');
  if(pane&&pinned)pane.scrollTop=pane.scrollHeight;
 }
 const schedule=()=>{if(!raf)raf=requestAnimationFrame(update);};
 for(const name of ['resize','scroll'])viewport?.addEventListener(name,schedule,{signal:abort.signal,passive:true});
 for(const name of ['resize','pageshow'])window.addEventListener(name,schedule,{signal:abort.signal,passive:true});
 for(const name of ['focusin','focusout'])document.addEventListener(name,schedule,{signal:abort.signal});
 media.addEventListener('change',schedule,{signal:abort.signal});update();
 return ()=>{abort.abort();cancelAnimationFrame(raf);root.style.removeProperty('--app-viewport-height');root.style.removeProperty('--app-viewport-top');delete root.dataset.keyboardOpen;};
}
