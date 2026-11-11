import {AUTHOR_CARD_IDS} from './core/fruit/novelCards';
import {uiIcon,plainUiLabel} from './uiIcons';
import {escHtml as esc} from './core/footprints';
import {isPromptHeading,isPromptPinned} from './core/fruit/profile';
import type {PresetLibrary,PresetEntry} from './core/fruit/library';
import type {FruitMode,FruitPreset,FruitProfile,FruitPrompt} from './core/fruit/types';
import {fruitPre} from './fruitPresetView';
import {novelPresetReadiness} from './core/fruit/readiness';
import {rolePresetBinding,projectRoleNovelProfile,legacyNovelSnapshot,rolePresetReferences} from './core/fruit/roleProfiles';
import {selectRequestPreset} from './core/fruit/library';
import {nativePreset} from './core/fruit/nativePreset';
export const terminalModeName=(mode:FruitMode)=>mode==='meeting'?'见面小说':'戏中戏';
export const presetLabel=(entry:PresetEntry)=>plainUiLabel(entry.preset.name)||(entry.kind==='fruit'?'MoM 果实预设':entry.kind==='native'?'Elsewhere 原生预设':'导入预设');
export function presetGenerationStatus(preset:FruitPreset,profile:FruitProfile,mode:FruitMode,enabled:boolean){
 const state=novelPresetReadiness(preset,profile,mode,enabled);
 return `${state.ready?'可用于正式小说生成（请求时复核真实上下文）':'暂不能正式生成'}${state.diagnostics.length?'：'+state.diagnostics.map(d=>`${d.sourceId||'配置'} · ${d.code} · ${d.message}`).join('；'):''}。仅已核对的章节／状态卡进行安全展示适配；其余正则、QR 和第三方脚本未执行。`;
}
export function renderPresetList(preset:FruitPreset,profile:FruitProfile){
  const prompts=new Map(preset.prompts.map(p=>[p.identifier,p])),ordered=new Set(preset.order.map(p=>p.identifier));
  const items=[...preset.order.map(item=>({prompt:prompts.get(item.identifier)!,enabled:Object.hasOwn(profile.overrides,item.identifier)?profile.overrides[item.identifier]:item.enabled,ordered:true})),...preset.prompts.filter(p=>!ordered.has(p.identifier)).map(prompt=>({prompt,enabled:false,ordered:false}))];
  let html='',group='',run=0;
  for(const item of items){const p=item.prompt;if(!p)continue;const current=item.ordered?p.group:'未加入排序 · 只读';
    if(current!==group){if(group)html+='</div></details>';group=current;run++;html+=`<details class="terminal-prompt-group" data-prompt-group="${esc(group+'-'+run)}" open><summary>${esc(plainUiLabel(group)||'预设分组')}<span>折叠 / 展开</span></summary><div>`;}
    if(isPromptHeading(p)){html+=`<div class="terminal-prompt-divider">${esc(plainUiLabel(p.name.replace(/[━─—=]/g,'').trim())||'分组分隔')}</div>`;continue;}
    const reason=p.blockedReason||((p.position!==0&&p.position!==1)?'注入位置尚不兼容':!item.ordered?'未在原始排序中，不会编译':'');
    const modified=Object.hasOwn(profile.overrides,p.identifier)||Object.hasOwn(profile.edits||{},p.identifier)||(profile.customPrompts||[]).some(c=>c.identifier===p.identifier);
    html+=`<div class="terminal-prompt-row ${modified?'is-modified':''} ${reason?'is-protected':''}" data-prompt-row="${esc(p.identifier)}" data-search="${esc(p.name+' '+p.identifier+' '+p.group)}"><button type="button" class="terminal-drag" data-prompt-drag="${esc(p.identifier)}" draggable="${!reason&&!isPromptPinned(p)}" aria-label="拖动${esc(plainUiLabel(p.name)||'未命名条目')}" ${reason||isPromptPinned(p)?'disabled':''}>${uiIcon('drag')}</button><div class="terminal-prompt-name"><b>${esc(plainUiLabel(p.name)||'未命名条目')}</b>${(profile.customPrompts||[]).some(c=>c.identifier===p.identifier)?'<span>自建</span>':p.marker?'<span>必要上下文</span>':p.position===1?'<span>In-Chat</span>':''}<i data-row-dirty ${modified?'':'hidden'} title="此角色有覆盖">●</i></div><div class="terminal-prompt-actions"><button type="button" data-prompt-move="up" data-id="${esc(p.identifier)}" aria-label="上移${esc(plainUiLabel(p.name)||'未命名条目')}" ${reason||isPromptPinned(p)?'disabled':''}>${uiIcon('up')}</button><button type="button" data-prompt-move="down" data-id="${esc(p.identifier)}" aria-label="下移${esc(plainUiLabel(p.name)||'未命名条目')}" ${reason||isPromptPinned(p)?'disabled':''}>${uiIcon('down')}</button><label class="terminal-row-switch" title="${esc(reason||(p.marker?'必要 Marker 受保护':'启用 / 停用'))}"><input type="checkbox" class="fruit-switch" data-prompt-enabled="${esc(p.identifier)}" ${item.enabled&&!reason?'checked':''} ${reason||p.marker?'disabled':''} aria-label="启用${esc(plainUiLabel(p.name)||'未命名条目')}"></label><button type="button" data-prompt-edit="${esc(p.identifier)}" aria-label="编辑${esc(plainUiLabel(p.name)||'未命名条目')}">${uiIcon('edit')}</button></div></div>`;
  }
  return html+(group?'</div></details>':'');
}
export function roleGenerationStatus(library:PresetLibrary,roleId:string):string {
 try{
  const states=(['meeting','theatre']as const).map(mode=>{const selected=selectRequestPreset(library,mode,roleId),check=novelPresetReadiness(selected.preset,selected.profile,mode,true);return terminalModeName(mode)+'：'+(check.ready?'可正式生成':check.diagnostics.map(d=>d.sourceId+' · '+d.message).join('；'));});
  return '已保存配置 · '+states.join('；')+'。已核对的章节／状态模板可安全展示；其余正则、QR 和第三方脚本未执行。';
 }catch(e){return '已保存配置暂不能生成：'+(e instanceof Error?e.message:'请检查配置')+'。卡片展示另按模板版本核对，不执行任意正则或第三方脚本。';}
}
export function renderRoleMigration(library:PresetLibrary,owner:{id:string;name:string}){
 const legacy=legacyNovelSnapshot(library),label=(mode:FruitMode)=>presetLabel(library.entries.find(e=>e.id===legacy.defaults[mode])!);const saved=library.roleNovel?.[owner.id];
 return `<section class="terminal-current"><h3>当前角色：${esc(owner.name)}</h3><h4>合并这个角色的小说配置</h4><p>旧见面与演出设置不同，尚未替你选择。确认前，两种小说继续读取原来各自的配置。</p><p>原见面默认：${esc(label('meeting'))}<br>原戏中戏默认：${esc(label('theatre'))}</p><p class="fruit-notice">只为当前角色建立一份小说配置。两个旧 Profile 和原件备份均保留，不需要重新调整条目。手机及幕间不受影响。</p><div class="terminal-preset-tools"><button class="fruit-button fruit-primary" data-terminal-action="migrate-meeting">沿用原见面小说配置</button><button class="fruit-button" data-terminal-action="migrate-theatre">沿用原戏中戏配置</button>${saved?.useLegacy?'<button class="fruit-button" data-terminal-action="resume-shared">继续先前的角色共享配置</button>':''}<button class="fruit-button" data-terminal-action="cancel-migration">暂不合并，返回桌面</button></div></section>`;
}
export function renderRoleLibraryTools(library:PresetLibrary,roles:{id:string;name:string}[]){
 const names=(ids:string[])=>ids.map(id=>roles.find(r=>r.id===id)?.name||id).join('、');
 return `<details class="terminal-profile-settings"><summary>私有原件库与恢复<span>原件全局共享，角色配置独立</span></summary><p class="terminal-caption">此备份包含私有原件、版本及角色覆盖，仅下载到本地，不含 API Key 或聊天。旧游戏 JSON 不含预设库；恢复游戏不会清空这里，跨地址可另行恢复本库备份。</p><div class="terminal-preset-tools"><button class="fruit-button" data-terminal-action="export-library">导出私有预设库备份</button><label class="fruit-button terminal-import">恢复私有库备份<input type="file" accept=".json,application/json" data-library-restore aria-label="恢复私有预设库备份"></label><button class="fruit-button" data-terminal-action="undo-library-restore">查看恢复前的库备份</button></div>${library.entries.filter(e=>e.kind!=='native').map(e=>{const refs=rolePresetReferences(library,e.id,roles.map(r=>r.id));return `<div class="terminal-select-line"><span class="grow">${esc(presetLabel(e))}${e.archived?' · 已移出列表':''}<small>${refs.length?' 当前使用：'+esc(names(refs)):' 无角色正在使用'}</small></span><button class="fruit-button" type="button" data-terminal-action="${e.archived?'restore-library-entry':'remove-library-entry'}" data-id="${esc(e.id)}">${e.archived?'恢复到列表':'移出列表'}</button></div>`;}).join('')}</details>`;
}
export function renderTerminalPresetPanel(library:PresetLibrary,entry:PresetEntry,_mode:FruitMode,profile:FruitProfile,preset:FruitPreset,dirty:boolean,owner:{id:string;name:string}){
 const options=library.entries.filter(e=>!e.archived||e.id===entry.id).map(e=>`<option value="${esc(e.id)}" ${e.id===entry.id?'selected':''}>${esc(presetLabel(e))}${e.archived?'（已移出列表）':''}</option>`).join('');
 const length=profile.length,selected=length.min===150&&length.max===400?'short':length.min===600&&length.max===1200?'normal':length.min===1500&&length.max===3000?'long':'custom',binding=rolePresetBinding(library,owner.id,entry.id),newer=entry.kind!=='native'&&binding.baseHash!==entry.preset.sha256;
 let issues='';try{projectRoleNovelProfile(library,entry.id,binding);}catch(e){issues=e instanceof Error?e.message:'覆盖尚不兼容';}
 return `<div class="terminal-presets"><section><div class="terminal-heading"><span>01</span><div><h3>当前角色：${esc(owner.name)}</h3><p>见面小说与正式演出共用这一份配置；故事与记忆继续隔离。</p></div></div><div class="terminal-select-line"><label class="grow">小说预设<select class="field" data-preset-select aria-label="角色小说预设">${options}${library.entries.some(e=>e.kind==='fruit')?'':'<option disabled>果实尚未导入</option>'}</select></label><label class="fruit-button terminal-import">${uiIcon('upload')} 导入原件<input type="file" accept=".json,application/json" data-preset-import aria-label="导入新的预设 JSON"></label></div><p class="terminal-caption">选择即保存为本角色的正式小说预设。手机、幕间、日记、监控和 Focus 不加载此配置。</p></section>
 <section class="terminal-current"><div class="terminal-heading"><span>02</span><div><h3>${uiIcon(entry.kind==='fruit'?'presets':'file')} ${esc(presetLabel(entry))}</h3><p>${entry.kind==='native'?'原生小说规则 · 人物事实由系统动态注入':esc(entry.preset.version)+' · '+esc(new Date(entry.preset.importedAt).toLocaleString())} · ${preset.prompts.length} 条 Prompt / ${preset.order.length} 个排序项 / ${entry.preset.regex.length} 条正则</p></div></div><p class="terminal-caption">${esc(entry.preset.fileName)}</p>
 <div class="terminal-preset-tools">${entry.kind!=='native'?`<label class="terminal-active"><input type="checkbox" class="fruit-switch" data-preset-active ${entry.enabled?'checked':''}>此角色允许正式小说生成</label><label class="fruit-button terminal-import">更新全局原件<input type="file" accept=".json,application/json" data-preset-update aria-label="更新当前预设 JSON"></label><button class="fruit-button" data-terminal-action="export-raw">导出原始文件</button>`:''}<button class="fruit-button" data-terminal-action="compatibility">兼容性说明</button><button class="fruit-button" data-terminal-action="reload">重新读取已保存配置</button></div>
 ${newer?`<p class="fruit-notice">全局原件已更新。所有角色都使用上方新版，各自覆盖保持不变。${issues?'本角色暂不能生成：'+esc(issues):'本角色覆盖可兼容使用；新增作者条目沿用新版默认。'}<button type="button" class="fruit-button" data-terminal-action="review-update">复核新版覆盖</button></p>`:''}
 <p class="fruit-notice" data-generation-status role="status">${esc(roleGenerationStatus(library,owner.id))}</p>
 <form data-terminal-profile novalidate><details class="terminal-profile-settings"><summary>角色小说设置<span>文风、篇幅与输出 · 两种小说共用</span></summary><div class="terminal-field-grid"><label>正文篇幅<select class="field" data-terminal-length>${[['short','简短互动 · 150–400'],['normal','正常篇幅 · 600–1200'],['long','长篇叙事 · 1500–3000'],['custom','自定义']].map(([id,name])=>`<option value="${id}" ${selected===id?'selected':''}>${name}</option>`).join('')}</select></label><label>文风覆盖<input class="field" name="preset-style" maxlength="2000" value="${esc(profile.style)}" placeholder="留空继承原件"></label></div><div class="terminal-field-grid"><label>最少字数<input class="field" type="number" name="preset-min" min="1" max="50000" value="${length.min}"></label><label>最多字数<input class="field" type="number" name="preset-max" min="1" max="50000" value="${length.max}"></label></div>${entry.kind!=='native'?`<div class="terminal-output-options">${([['scene','场景信息'],['summary','摘要'],['characters','人物辅助'],['auxiliary','生成辅助文本']]as const).map(([key,name])=>`<label><input type="checkbox" name="preset-output-${key}" ${profile.output[key]?'checked':''}>${name}</label>`).join('')}</div><p class="terminal-caption">关闭的辅助块不展示、不保存；辅助文本不是真实内部推理或角色记忆。snow 小剧场继续关闭。</p>`:''}</details>
 <details class="terminal-profile-settings"><summary>角色正则与作者卡片<span>两种小说共用 · 章节／状态卡安全适配</span></summary><button type="button" class="fruit-button" data-terminal-action="regex-preview">本地预览作者卡片</button><p class="terminal-caption">仅 #19／#20 已核对模板可显示作者卡片，其他规则不执行。展示不改正文或历史；脚本、HTML 事件与远程资源不执行。原始规则完整保留。</p>${entry.preset.regex.map(r=>`<div class="terminal-prompt-row"><label class="grow"><input type="checkbox" data-regex-enabled="${esc(r.id)}" ${(profile.regexOverrides?.[r.id]??r.enabled)?'checked':''}>${esc(plainUiLabel(r.name)||'未命名规则')}</label><span>${Object.values(AUTHOR_CARD_IDS).some(id=>id===r.id)?'卡片适配器 · 预览核对版本':'未支持执行'}</span><details><summary>原始规则</summary>${fruitPre(r.pattern)}${fruitPre(r.replacement)}<p>位置：${esc(r.placement.join('、'))} · ${esc(r.side)}${r.hasExecutableMarkup?' · 含可执行标记，仍禁止脚本执行':''}</p></details></div>`).join('')||'<p>此原件没有正则。</p>'}</details>
 <div class="terminal-list-toolbar"><button class="fruit-button fruit-primary" data-testid="preset-save">立即保存 / 重试</button><button class="fruit-button" type="button" data-terminal-action="add">${uiIcon('plus')} 添加 Prompt</button><button class="fruit-button" type="button" data-terminal-action="undo">放弃失败的修改</button><button class="fruit-button" type="button" data-terminal-action="reset">恢复此角色默认</button><button class="fruit-button" type="button" data-terminal-action="preview">预览组装后的 Prompt</button></div><div class="terminal-profile-state"><span data-terminal-dirty>${dirty?'保存中…':'已保存'}</span><span>即时设置自动保存；正文确认后提交</span></div><div class="terminal-list-filter"><input class="field" type="search" data-terminal-search placeholder="搜索 Prompt 名称" aria-label="搜索 Prompt"><label><input type="checkbox" data-terminal-only>只看已启用</label><button type="button" class="fruit-button" data-terminal-action="fold">折叠全部</button></div><div class="terminal-prompt-list" data-terminal-list>${renderPresetList(preset,profile)}</div></form>
 <details class="terminal-profile-settings"><summary>迁移与更新恢复<span>保留旧配置，不改原件</span></summary><button type="button" class="fruit-button" data-terminal-action="restore-legacy">恢复迁移前双模式使用方式</button>${library.roleNovel?.[owner.id]?.previous?'<button type="button" class="fruit-button" data-terminal-action="restore-previous-shared">恢复上次共享配置</button>':''}${library.roleNovel?.[owner.id]?.backups?.[entry.id]?'<button type="button" class="fruit-button" data-terminal-action="restore-profile-backup">恢复本角色更新前覆盖</button>':''}<p class="terminal-caption">旧双模式快照始终保留。恢复旧覆盖不降级全局原件，不兼容时仍阻止生成。</p></details></section></div>`;
}
export function renderPromptEditor(prompt:FruitPrompt,original:FruitPrompt|undefined,isNew=false,reason=''){
  const locked=Boolean(reason||prompt.marker),disabled=locked?'disabled':'';
  return `<span class="fruit-eyebrow">${isNew?'CUSTOM PROMPT':'PROMPT EDITOR'}</span><h2 id="fruit-dialog-title">${isNew?'添加 Prompt':'编辑 Prompt'}</h2><p class="fruit-dialog-lead">只编辑当前角色小说覆盖，原始 JSON 保持不变。点击保存条目后才提交正文。</p>${reason?`<p class="fruit-notice">${esc(reason)}</p>`:''}${prompt.marker?'<p class="fruit-notice">必要 Marker 受保护，只读查看。</p>':''}<form data-prompt-editor novalidate><input type="hidden" name="identifier" value="${esc(prompt.identifier)}"><div class="terminal-field-grid"><label>Prompt 名称<input class="field" name="prompt-name" maxlength="500" value="${esc(prompt.name)}" ${disabled}></label><label>Role<select class="field" name="prompt-role" ${disabled}>${['system','assistant','user'].map(role=>`<option ${prompt.role===role?'selected':''}>${role}</option>`).join('')}</select></label></div><label class="terminal-label">Prompt 内容<textarea class="field terminal-prompt-editor" name="prompt-content" ${disabled}>${esc(prompt.content)}</textarea></label><label class="terminal-label">Position<select class="field" name="prompt-position" ${disabled}><option value="0" ${prompt.position===0?'selected':''}>Relative · 相对列表位置</option><option value="1" ${prompt.position===1?'selected':''}>In-Chat · 对话内注入</option></select></label><div class="terminal-field-grid" data-editor-depth ${prompt.position!==1?'hidden':''}><label>Depth<input class="field" name="prompt-depth" type="number" min="0" max="10000" value="${prompt.depth}" ${disabled}></label><label>Order<input class="field" name="prompt-order" type="number" min="0" max="10000" value="${prompt.injectionOrder}" ${disabled}></label></div><details class="fruit-subdetails"><summary>原始条目详情 · 高级设置</summary><dl class="fruit-technical"><dt>ID</dt><dd>${esc(prompt.identifier)}</dd><dt>分组</dt><dd>${esc(prompt.group)}</dd><dt>Marker</dt><dd>${prompt.marker?'是':'否'}</dd><dt>来源</dt><dd>${isNew||!original?'用户自建':'作者原件'}</dd></dl>${original?fruitPre(original.content):''}</details><p role="alert" data-editor-status class="fruit-notice" hidden></p><div class="terminal-editor-actions">${!locked?`<button class="fruit-button fruit-primary">保存条目</button>${original?'<button type="button" class="fruit-button" data-terminal-action="restore-entry">恢复此条原版</button>':''}`:''}<button type="button" class="fruit-button" data-terminal-action="close-dialog">取消 / 关闭</button></div></form>`;
}

import type {ElsewherePreset, PresetItem} from './core/elsewherePreset';

export function renderNativePromptList(preset: ElsewherePreset, base: ElsewherePreset, locked: boolean) {
  if (!preset.entries.length) return '<p class="terminal-caption" data-empty-prompts>还没有 Prompt。点击「添加 Prompt」开始。</p>';
  let html = '';
  let group = '';
  let run = 0;
  for (const [index, entry] of preset.entries.entries()) {
    const name = esc(entry.name);
    const id = esc(entry.id);
    const label = entry.group?.trim() || 'Prompt 条目';
    if (label !== group) {
      if (run) html += '</div></details>';
      group = label;
      html += `<details class="terminal-prompt-group" data-prompt-group="${esc(label + '-' + ++run)}" open><summary>${esc(label)}<span>折叠 / 展开</span></summary><div>`;
    }
    const original = base.entries.find(item => item.id === entry.id);
    const modified = preset !== base && JSON.stringify(original) !== JSON.stringify(entry);
    const disabled = locked ? 'disabled' : '';
    html += `<div class="terminal-prompt-row${modified ? ' is-modified' : ''}" data-prompt-row="${id}" data-search="${esc(entry.name + ' ' + label)}">
      <button type="button" class="terminal-drag" data-prompt-drag="${id}" draggable="${!locked}" aria-label="拖动${name}" ${disabled}>${uiIcon('drag')}</button>
      <button type="button" class="terminal-prompt-name native-prompt-name" data-prompt-edit="${id}"><b>${name}</b></button>
      <div class="terminal-prompt-actions">
        <button type="button" data-prompt-move="up" data-id="${id}" aria-label="上移${name}" ${locked || index === 0 ? 'disabled' : ''}>${uiIcon('up')}</button>
        <button type="button" data-prompt-move="down" data-id="${id}" aria-label="下移${name}" ${locked || index === preset.entries.length - 1 ? 'disabled' : ''}>${uiIcon('down')}</button>
        <label class="terminal-row-switch"><input type="checkbox" class="fruit-switch" data-prompt-enabled="${id}" aria-label="启用${name}" ${entry.enabled ? 'checked' : ''} ${disabled}></label>
        <button type="button" data-prompt-edit="${id}" aria-label="编辑${name}">${uiIcon('edit')}</button>
      </div>
    </div>`;
  }
  return html + '</div></details>';
}

export function renderNativePromptEditor(entry: PresetItem, isNew: boolean, locked: boolean) {
  const disabled = locked ? 'disabled' : '';
  return `<form data-prompt-editor>
    <div class="terminal-field-grid">
      <label>Prompt 名称<input class="field" name="prompt-name" required maxlength="200" value="${esc(entry.name)}" ${disabled}></label>
      <label>Role<select class="field" name="prompt-role" ${disabled}>${['system','assistant','user'].map(role => `<option ${entry.role === role ? 'selected' : ''}>${role}</option>`).join('')}</select></label>
    </div>
    <label class="terminal-label">Prompt 内容<textarea class="field terminal-prompt-editor" name="prompt-content" maxlength="128000" ${disabled}></textarea></label>
    <label class="terminal-label">分组（可选）<input class="field" name="prompt-group" maxlength="100" value="${esc(entry.group || '')}" ${disabled}></label>
    <p role="alert" data-editor-status class="fruit-notice" hidden></p>
    <div class="terminal-editor-actions">
      ${locked ? '' : `<button class="fruit-button fruit-primary">保存条目</button>${isNew ? '' : '<button type="button" class="fruit-button" data-entry-action="copy">复制条目</button><button type="button" class="fruit-button" data-entry-action="delete">删除条目</button>'}`}
      <button type="button" class="fruit-button" data-dialog-close>${locked ? '关闭' : '取消 / 关闭'}</button>
    </div>
  </form>`;
}
