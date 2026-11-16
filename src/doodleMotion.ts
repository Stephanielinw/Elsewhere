// Use one upstream filter while at least one home icon can be seen.
export function createDoodleMotion(animatedSvg:string) {
 const id='elsewhere-doodle-boil';
 const filterMarkup=animatedSvg.match(/<filter id="boil"[\s\S]*?<\/filter>/)?.[0].replace('id="boil"',`id="${id}"`);
 let detach=()=>{};
 return {mount(home:HTMLElement|null,drawOnEntry:boolean){
  detach();
  detach=()=>{};
  if(!home||!filterMarkup||typeof IntersectionObserver==='undefined')return;
  const icons=[...home.querySelectorAll<SVGSVGElement>('svg[data-doodle-app]')];
  if(!icons.length)return;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const visible=new Set<Element>();
  let first=drawOnEntry&&!document.hidden&&!reduced.matches;
  let suspended=false;
  let defs:SVGSVGElement|undefined;
  const enabled=()=>home.isConnected&&!suspended&&!document.hidden&&!reduced.matches;
  const sync=()=>{
   const active=enabled();
   if(active&&visible.size&&!defs){
    defs=document.createElementNS('http://www.w3.org/2000/svg','svg');
    defs.setAttribute('width','0');
    defs.setAttribute('height','0');
    defs.setAttribute('aria-hidden','true');
    defs.setAttribute('focusable','false');
    defs.classList.add('doodle-filter-defs');
    defs.innerHTML='<defs>'+filterMarkup+'</defs>';
    document.body.append(defs);
   }
   for(const svg of icons){
    const ink=svg.querySelector('g');
    if(active&&visible.has(svg))ink?.setAttribute('filter',`url(#${id})`);
    else{
     ink?.removeAttribute('filter');
     svg.classList.remove('is-doodle-drawing');
    }
   }
   if(!active||!visible.size){defs?.remove();defs=undefined;}
  };
  const observer=new IntersectionObserver(entries=>{
   for(const entry of entries){
    if(entry.isIntersecting&&entry.intersectionRatio>=.5){
     visible.add(entry.target);
     if(first&&enabled())entry.target.classList.add('is-doodle-drawing');
    }else visible.delete(entry.target);
   }
   first=false;
   sync();
  },{threshold:[.5]});
  const visibility=()=>{if(!enabled())first=false;sync();};
  const hide=()=>{first=false;suspended=true;sync();};
  const show=()=>{suspended=false;sync();};
  document.addEventListener('visibilitychange',visibility);
  reduced.addEventListener('change',visibility);
  window.addEventListener('pagehide',hide);
  window.addEventListener('pageshow',show);
  icons.forEach(svg=>observer.observe(svg));
  detach=()=>{
   observer.disconnect();
   document.removeEventListener('visibilitychange',visibility);
   reduced.removeEventListener('change',visibility);
   window.removeEventListener('pagehide',hide);
   window.removeEventListener('pageshow',show);
   hide();
  };
 }};
}
