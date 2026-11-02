import {escHtml as esc} from './core/footprints';
import {uiIcon} from './uiIcons';
import {chatVoiceChoice,describeChatVoice,saveChatVoice} from './core/chatVoice';
import type {RoleData,PresetData} from './core/types';
import type {FruitProfile} from './core/fruit/types';

interface Hooks {
 role:()=>RoleData|null|undefined;
 globalPreset:()=>PresetData|null;
 load:(roleId:string)=>Promise<{profile:FruitProfile;revision:number}>;
 save:()=>boolean;
 trace:(roleId:string)=>unknown;
}
const sourceLabel:Record<string,string>={'builtin-a':'A · 原生默认','candidate-b':'B · 候选默认','user-edit':'原生预设中已保存的正文覆盖（共享，优先保留）'};
export function createChatVoiceDialog(hooks:Hooks){
 let current:HTMLDialogElement|undefined;
 function open():void {
  current?.close();const selected=hooks.role();if(!selected)return;const role:RoleData=selected;
  const dialog=document.createElement('dialog');current=dialog;dialog.className='fruit-dialog chat-voice-dialog';dialog.setAttribute('aria-label','聊天表达与有效配置');
  dialog.innerHTML=`<div class="fruit-dialog-top"><b>聊天表达</b><button type="button" class="fruit-close" data-voice-close aria-label="关闭聊天表达">${uiIcon('close')}</button></div><div class="fruit-dialog-body"><h2>${esc(role.name)}</h2><p class="sub">选择后保存，仅用于这个角色的后续手机生成。正在生成的回复沿用发出时的配置。</p><fieldset class="chat-voice-options" aria-label="手机聊天表达方案"><legend class="sr-only">表达方案</legend><label><input type="radio" name="chat-voice" value="A"><span><b>A · 当前规则</b><small>默认保留现有表达</small></span></label><label><input type="radio" name="chat-voice" value="B"><span><b>B · 角色驱动</b><small>候选方案，尚无真实质量结论</small></span></label></fieldset><p class="chat-voice-status" role="status" data-voice-status>读取已保存配置…</p><div data-voice-config></div><button type="button" class="btn secondary" data-voice-refresh>重新读取配置</button></div>`;
  const status=dialog.querySelector<HTMLElement>('[data-voice-status]')!,host=dialog.querySelector<HTMLElement>('[data-voice-config]')!;
  let generation=0;
  const active=()=>current===dialog&&dialog.isConnected&&hooks.role()===role;
  function radios(){dialog.querySelectorAll<HTMLInputElement>('input[name=chat-voice]').forEach(input=>input.checked=input.value===chatVoiceChoice(role.chatVoice));}
  async function refresh():Promise<void>{
   const ticket=++generation;
   try{
    const snapshot=await hooks.load(role.id);if(!active()||ticket!==generation)return;
    const info=describeChatVoice(snapshot.profile,role,hooks.globalPreset()),trace=hooks.trace(role.id),used=info.rules.filter(r=>r.enabled&&r.source==='candidate-b').length;
    host.innerHTML=`<section class="chat-voice-rules" aria-label="有效表达配置"><h3>当前有效配置 · 只读</h3><p class="sub">原生 Profile 沿用已有共享设置；A/B 选择按角色保存。配置修订 ${snapshot.revision}。${info.choice==='B'?`B 作用于 ${used} 个已启用的默认表达条目；已保存正文和停用状态不被替换。`:'A 沿用当前原生规则及已保存的个性化覆盖。'}</p>${info.rules.map(r=>`<details data-voice-rule="${esc(r.id)}"><summary>${esc(r.name)} · ${r.enabled?'已启用':'已停用'}</summary><p>${esc(sourceLabel[r.source])} · 预设顺序 ${r.order} · ${esc(r.role)}</p><pre class="fruit-code">${esc(r.content)}</pre><small>位置 ${r.position===1?'In-Chat':'相对'}${r.position===1?' · 深度 '+r.depth:''}。内置分条宏已展开，其他自定义宏按发送时上下文解析；读取配置不代表已通过编译。</small></details>`).join('')}<details data-voice-legacy><summary>旧附加预设 · ${info.legacySource==='role'?'角色配置':info.legacySource==='global'?'全局配置':'无'} · ${info.legacy.length} 项</summary><p class="sub">${esc(info.legacyName)}${info.legacy.length?'。这些条目仍按原规则生效，可能与表达方案重复或冲突；不会自动禁用。':'。角色空配置仍可覆盖全局配置。'}以下顺序是旧预设内部顺序；深度注入的最终位置以请求结构为准。</p>${info.legacy.map(r=>`<details><summary>${r.order}. ${esc(r.name)} · ${r.enabled?'已启用':'已停用'}${r.marker?' · Marker':''}</summary><p>${esc(r.role)} · ${r.position===1?'深度 '+r.depth:'相对位置'}</p><pre class="fruit-code">${esc(r.content||'（无正文）')}</pre></details>`).join('')}</details><details data-voice-trace><summary>本会话实际发送的手机请求结构</summary><p class="sub">仅角色、顺序和来源，不含聊天、人物资料、规则正文或 Key。打开面板不会生成请求。</p><pre class="fruit-code">${esc(trace?JSON.stringify(trace,null,2):'此会话暂无可用的已发送手机请求。')}</pre></details></section>`;
    if(!status.dataset.state)status.textContent='配置已读取；查看不调用模型，也不保存预设。';
   }catch(error){if(active()&&ticket===generation){status.textContent='读取失败：'+(error instanceof Error?error.message:'请重试')+'。原配置保留。';status.dataset.state='error';}}
  }
  dialog.addEventListener('change',event=>{
   const input=event.target;if(!(input instanceof HTMLInputElement)||input.name!=='chat-voice')return;
   if(!active()){dialog.close();return;}
   status.textContent='保存中…';status.dataset.state='saving';
   const saved=saveChatVoice(role,input.value==='B'?'B':'A',hooks.save);radios();
   status.dataset.state=saved?'saved':'error';status.textContent=saved?'已保存 · 从下次手机生成生效。':'保存失败，原选择已恢复；可重新选择后重试。';
   void refresh();
  });
  dialog.addEventListener('click',event=>{const target=event.target instanceof Element?event.target.closest('button'):null;if(target?.hasAttribute('data-voice-close'))dialog.close();if(target?.hasAttribute('data-voice-refresh')){delete status.dataset.state;status.textContent='读取配置…';void refresh();}});
  dialog.addEventListener('close',()=>{generation++;dialog.remove();if(current===dialog)current=undefined;});
  document.body.append(dialog);radios();dialog.showModal();void refresh();
 }
 return {open};
}
