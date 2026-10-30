import {uiIcon} from './uiIcons';
import {escHtml as esc} from './core/footprints';
import {makeUid} from './core/revisions';
import {dateDayNumber,ddlCountdown,setTaskCompletion,splitTaskLists} from './core/homeTasks';
import type {SharedTaskItem,SharedTasksState} from './core/types';
type Kind='ddl'|'todo';
const label=(kind:Kind)=>kind==='ddl'?'DDL':'To-do';
const completedTime=(task:SharedTaskItem)=>Number.isFinite(task.completedAt)?new Date(task.completedAt!).toLocaleString('zh-CN'):'完成时间未记录';

export function createHomeTasks(hooks:{tasks:()=>SharedTasksState;save:()=>boolean;notify:(text:string)=>void;glyph:(id:string)=>string}) {
  let dialog:HTMLDialogElement|null=null;
  function renderCards():string {
    return (['ddl','todo'] as const).map(kind=>{
      const all=hooks.tasks()[kind],{current,completed}=splitTaskLists(kind,all,Date.now());
      return `<section class="home-task-card" data-home-task-card="${kind}" aria-label="${label(kind)}"><div class="home-task-heading"><h2>${hooks.glyph(kind==='ddl'?'deadline':'tasks')}${label(kind)}<span class="home-task-count" aria-label="${all.filter(t=>!t.done).length} 项未完成">${all.filter(t=>!t.done).length}</span></h2><button type="button" class="home-task-add" data-action="hometaskadd" data-kind="${kind}" aria-label="添加 ${label(kind)}">${uiIcon('plus')}</button></div><div class="home-task-list">${current.map(task=>`<div class="home-task-row ${task.done?'is-completed':''}" data-task-id="${esc(task.id)}"><button type="button" class="home-task-name" data-action="hometaskdetail" data-kind="${kind}" data-id="${esc(task.id)}"><span>${esc(task.text)}</span>${task.done?'<small>已完成 · 24 小时后归档</small>':''}</button>${kind==='ddl'?`<button type="button" class="home-task-due" data-action="hometaskdetail" data-kind="ddl" data-id="${esc(task.id)}">${ddlCountdown(task.due,Date.now())}</button>`:`<button type="button" class="home-task-check" role="checkbox" aria-checked="${task.done}" aria-label="${task.done?'撤销完成':'完成'} ${esc(task.text)}" data-action="hometasktoggle" data-kind="todo" data-id="${esc(task.id)}">${task.done?uiIcon('check'):''}</button>`}</div>`).join('')||`<p class="home-task-empty">${kind==='ddl'?'暂无待完成的 DDL':'暂无待办'}</p>`}</div><button type="button" class="home-task-archive" data-action="hometaskarchive" data-kind="${kind}">查看已完成 <span>${completed.length}</span><span aria-hidden="true">›</span></button></section>`;
    }).join('');
  }
  function refresh():void {
    const host=document.getElementById('home-task-cards');
    if (!host) return;
    const html=renderCards();
    if (host.innerHTML===html) return;
    const focus=document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const id=focus?.dataset.id,action=focus?.dataset.action;
    const scrolls=Array.from(host.querySelectorAll<HTMLElement>('.home-task-list')).map(el=>el.scrollTop);
    host.innerHTML=html;
    host.querySelectorAll<HTMLElement>('.home-task-list').forEach((el,i)=>el.scrollTop=scrolls[i]||0);
    if (id && action) Array.from(host.querySelectorAll<HTMLElement>('[data-action]')).find(el=>el.dataset.id===id&&el.dataset.action===action)?.focus({preventScroll:true});
  }
  function close():void { dialog?.close(); }
  function persist(kind:Kind,change:(items:SharedTaskItem[])=>SharedTaskItem[]):boolean {
    const tasks=hooks.tasks(),before=tasks[kind];
    tasks[kind]=change(before);
    if (!hooks.save()) {
      tasks[kind]=before;
      const error=dialog?.querySelector<HTMLElement>('[data-task-error]');
      if(error) error.textContent='保存失败，当前修改仍保留在表单中，请重试。';
      hooks.notify('保存失败，原任务已保留。');
      return false;
    }
    refresh();return true;
  }
  function open(kind:Kind,id?:string,archive=false):void {
    close();
    const task=id?hooks.tasks()[kind].find(t=>t.id===id):undefined;
    if(id&&!task)return;
    const title=archive?`已完成 ${label(kind)}`:task?`编辑 ${label(kind)}`:`添加 ${label(kind)}`;
    const el=document.createElement('dialog');dialog=el;el.className='home-task-dialog';el.setAttribute('aria-labelledby','home-task-dialog-title');
    el.innerHTML=`<div class="home-task-dialog-head"><h2 id="home-task-dialog-title">${title}</h2><button type="button" data-task-close aria-label="关闭">×</button></div>${archive?`<div class="home-task-archive-list">${splitTaskLists(kind,hooks.tasks()[kind],Date.now()).completed.map(t=>`<article><strong>${esc(t.text)}</strong>${kind==='ddl'?`<p>原截止日：${esc(t.due||'未设置')}</p>`:''}<p>${Number.isFinite(t.completedAt)?'完成于：':''}${esc(completedTime(t))}</p></article>`).join('')||'<p class="home-task-empty">还没有已完成项目</p>'}</div><div class="home-task-dialog-actions"><button type="button" class="btn secondary" data-task-close>关闭</button></div>`:`<form id="home-task-form"><label>${kind==='ddl'?'DDL 名称':'待办名称'}<input class="field" name="text" maxlength="140" required value="${esc(task?.text||'')}" autocomplete="off"></label>${kind==='ddl'?`<label>截止日期<input class="field" name="due" type="date" required value="${esc(task?.due||'')}"></label>`:''}${task?.done?`<p class="sub">已完成 · ${esc(completedTime(task))}</p>`:''}<p class="home-task-error" data-task-error role="alert"></p><div class="home-task-dialog-actions">${task?`<button class="btn secondary" type="button" data-task-complete>${task.done?'撤销完成':'标记完成'}</button>`:''}<button type="button" class="btn secondary" data-task-close>取消</button><button class="btn" type="submit">${task?'保存':'添加'}</button></div></form>`}`;
    el.addEventListener('close',()=>{el.remove();if(dialog===el)dialog=null;});
    el.addEventListener('click',event=>{
      const target=(event.target as Element).closest('button');
      if(target?.hasAttribute('data-task-close'))close();
      if(target?.hasAttribute('data-task-complete')&&task){
        if(persist(kind,items=>items.map(t=>t.id===task.id?setTaskCompletion(t,!t.done,Date.now()):t)))close();
      }
    });
    el.addEventListener('submit',event=>{
      event.preventDefault();const form=el.querySelector<HTMLFormElement>('form');if(!form||!form.reportValidity())return;
      const fd=new FormData(form),text=String(fd.get('text')||'').trim(),due=kind==='ddl'?String(fd.get('due')||''):undefined;
      if(!text||(kind==='ddl'&&dateDayNumber(due)===null)){el.querySelector<HTMLElement>('[data-task-error]')!.textContent='请填写名称和有效的截止日期。';return;}
      if(task&&!hooks.tasks()[kind].some(t=>t.id===task.id)){hooks.notify('该任务已不存在，请重新打开。');return;}
      const next:SharedTaskItem=task?{...task,text,due}:{id:makeUid('task'),text,due,done:false,at:Date.now()};
      if(persist(kind,items=>task?items.map(t=>t.id===task.id?next:t):[...items,next]))close();
    });
    document.body.append(el);el.showModal();
    el.querySelector<HTMLInputElement>('[name=text]')?.focus({preventScroll:true});
  }
  function handle(action:string,button:HTMLElement):void {
    const kind=button.dataset.kind;if(kind!=='ddl'&&kind!=='todo')return;
    if(action==='hometaskadd')open(kind);
    if(action==='hometaskdetail')open(kind,button.dataset.id);
    if(action==='hometaskarchive')open(kind,undefined,true);
    if(action==='hometasktoggle')persist(kind,items=>items.map(t=>t.id===button.dataset.id?setTaskCompletion(t,!t.done,Date.now()):t));
  }
  return {renderCards,refresh,handle,close,isOpen:()=>Boolean(dialog?.open)};
}
