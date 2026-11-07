import type {AppData,RoleData} from './core/types';
import {meetingTimeline} from './core/meetingHistory';
import {chatWindow,CHAT_PAGE_SIZE,timelineKey,type ChatPosition} from './core/chatWindow';

type Anchor={key:string;offset:number};
type ViewState={oldest?:ChatPosition;anchor?:Anchor;bottom:boolean;top:number};
export function createChatHistory(hooks:{world:()=>AppData;owner:()=>RoleData|undefined;isChat:()=>boolean;refresh:()=>void}){
 const worlds=new WeakMap<AppData,Map<string,ViewState>>();
 type Instance={world:AppData;owner:RoleData;pane:HTMLElement;state:ViewState;version:number;expectedTop:number;lastTop:number;events:AbortController};
 let instance:Instance|undefined;
 const storageKey=(world:AppData,owner:RoleData)=>world.draftWorldId?'elsewhere-chat-view-v1:'+world.draftWorldId+':'+owner.id:'';
 function state(owner:RoleData):ViewState{
  const world=hooks.world();let roles=worlds.get(world);if(!roles){roles=new Map();worlds.set(world,roles);}
  let saved=roles.get(owner.id);
  if(!saved){
   saved={bottom:true,top:0};
   try{
    const key=storageKey(world,owner),raw=key?sessionStorage.getItem(key):null,value=raw?JSON.parse(raw):null;
    if(value&&typeof value.bottom==='boolean'&&Number.isFinite(value.top)){
     saved={bottom:value.bottom,top:value.top};
     if(typeof value.oldest?.key==='string'&&Number.isFinite(value.oldest.at))saved.oldest=value.oldest;
     if(typeof value.anchor?.key==='string'&&Number.isFinite(value.anchor.offset))saved.anchor=value.anchor;
    }
   }catch{}
   roles.set(owner.id,saved);
  }
  return saved;
 }
 const valid=(item:Instance)=>instance===item&&hooks.isChat()&&hooks.world()===item.world&&hooks.owner()===item.owner&&item.pane.isConnected&&document.getElementById('scroll-area')===item.pane;
 const elements=(pane:HTMLElement)=>Array.from(pane.querySelectorAll<HTMLElement>('[data-msg-id],[data-meeting-id]'));
 const elementKey=(el:HTMLElement)=>el.dataset.msgId!==undefined?'message:'+el.dataset.msgId:'meeting:'+el.dataset.meetingId;
 function readAnchor(pane:HTMLElement):Anchor|undefined{
  const top=pane.getBoundingClientRect().top;
  const el=elements(pane).find(el=>el.getBoundingClientRect().bottom>top+1);
  return el?{key:elementKey(el),offset:el.getBoundingClientRect().top-top}:undefined;
 }
 function remember(item:Instance):void{
  item.state.anchor=readAnchor(item.pane);item.state.top=item.pane.scrollTop;
  item.state.bottom=item.pane.scrollHeight-item.pane.clientHeight-item.pane.scrollTop<60;
  try{const key=storageKey(item.world,item.owner);if(key)sessionStorage.setItem(key,JSON.stringify(item.state));}catch{}
 }
 function setTop(item:Instance,top:number):void{
  item.pane.scrollTop=top;item.expectedTop=item.pane.scrollTop;item.lastTop=item.pane.scrollTop;
 }
 function snapshot(item:Instance){return {instance:item,version:item.version,anchor:readAnchor(item.pane),top:item.pane.scrollTop,bottom:item.pane.scrollHeight-item.pane.clientHeight-item.pane.scrollTop<60};}
 type Snapshot=ReturnType<typeof snapshot>;
 function restore(saved:Snapshot):void{
  const item=saved.instance;if(!valid(item)||item.version!==saved.version)return;
  if(saved.bottom)setTop(item,item.pane.scrollHeight);
  else{
   const el=elements(item.pane).find(el=>elementKey(el)===saved.anchor?.key);
   setTop(item,el&&saved.anchor?item.pane.scrollTop+el.getBoundingClientRect().top-item.pane.getBoundingClientRect().top-saved.anchor.offset:saved.top);
  }
  remember(item);
 }
 function leave():void{
  if(!instance)return;
  remember(instance);instance.events.abort();
  instance.pane.querySelectorAll('audio').forEach(audio=>{if(!audio.paused)audio.pause();});
  instance=undefined;
 }
 function windowFor(owner:RoleData){const current=state(owner),result=chatWindow(meetingTimeline(owner),current.oldest);current.oldest=result.oldest;return result;}
 function older():void{
  const item=instance;if(!item||!valid(item))return;
  const all=meetingTimeline(item.owner),range=chatWindow(all,item.state.oldest),first=all[Math.max(0,range.start-CHAT_PAGE_SIZE)];
  if(!range.start||!first)return;
  item.state.oldest={key:timelineKey(first),at:first.at};hooks.refresh();
 }
 function begin():Snapshot|undefined{
  if(!instance)return;
  if(!valid(instance)){leave();return;}
  instance.version++;return snapshot(instance);
 }
 function mount():void{
  const pane=document.querySelector<HTMLElement>('.chat-conversation'),owner=hooks.owner();
  if(!pane||!owner||!hooks.isChat())return;
  if(instance&&valid(instance))return;
  leave();
  const item:Instance={pane,owner,world:hooks.world(),state:state(owner),version:0,expectedTop:0,lastTop:0,events:new AbortController()};instance=item;
  const signal=item.events.signal;
  const intent=()=>{if(valid(item))item.version++;};
  for(const event of ['wheel','touchstart','pointerdown'])pane.addEventListener(event,intent,{passive:true,signal});
  pane.addEventListener('keydown',event=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))intent();},{signal});
  pane.addEventListener('scroll',()=>{
   if(!valid(item))return;
   const previous=item.lastTop,top=pane.scrollTop,user=Math.abs(top-item.expectedTop)>1;
   if(user)item.version++;
   item.lastTop=top;remember(item);
   if(user&&top<=80&&top<previous)older();
  },{passive:true,signal});
 }
 function finish(saved?:Snapshot):void{
  mount();if(!instance)return;
  if(saved&&saved.instance===instance)restore(saved);
  else restore({instance,version:instance.version,anchor:instance.state.anchor,top:instance.state.top,bottom:instance.state.bottom});
 }
 function followEnd():void{if(instance&&valid(instance)){instance.version++;setTop(instance,instance.pane.scrollHeight);remember(instance);}}
 function locate(id:string):boolean{
  const item=instance;if(!item||!valid(item))return false;
  const all=meetingTimeline(item.owner),matches=all.filter(entry=>entry.kind==='message'&&entry.id===id);
  if(matches.length!==1)return false;
  const index=all.indexOf(matches[0]),range=chatWindow(all,item.state.oldest);
  if(index<range.start){const start=all[Math.max(0,index-10)];item.state.oldest={key:timelineKey(start),at:start.at};hooks.refresh();}
  if(!valid(item))return false;
  const target=elements(item.pane).find(el=>el.dataset.msgId===id);if(!target)return false;
  item.version++;setTop(item,item.pane.scrollTop+target.getBoundingClientRect().top-item.pane.getBoundingClientRect().top-16);remember(item);return true;
 }
 return {windowFor,begin,finish,leave,older,locate,followEnd,mediaGuard(pane:HTMLElement|null){
  const item=instance;if(!item||pane!==item.pane||!valid(item))return ()=>{};
  const saved=snapshot(item);return ()=>restore(saved);
 }};
}
