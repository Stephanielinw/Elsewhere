import {escHtml as esc} from './core/footprints';
import {builtinPreset, emptyPresetLibrary, readElsewherePresetFile, unifyElsewherePreset, exportElsewherePreset, validateElsewherePreset, validatePresetLibrary, resolvePreset, importElsewherePreset, replaceSharedPreset, deletePreset, presetOverride, presetFilename, PRESET_MAX_BYTES, presetObject, type ElsewherePreset, type ElsewherePresetLibrary, type PresetItem} from './core/elsewherePreset';
import {ElsewherePresetRepository, encodeNativeLibraryBackup, decodeNativeLibraryBackup, legacyOriginals, type LegacyPresetArchive, type PresetUpgradeBackup} from './core/presetLibrary';
import {renderNativePromptEditor, renderNativePromptList} from './terminalPresetView';
import {uiIcon} from './uiIcons';

type Actor = {id: string; name: string};
export function createFruitManager(context: {currentRole: () => Actor | null; roles: () => Actor[]; leave: () => void; legacyExport?: () => unknown}) {
  const repository = new ElsewherePresetRepository();
  const drafts = new Map<string, {original: ElsewherePreset; edited: ElsewherePreset}>();
  const collapsed = new Set<string>();
  let host: HTMLElement | null = null;
  let actor: Actor | null = null;
  let library: ElsewherePresetLibrary | null = null;
  let archive: LegacyPresetArchive = {};
  let upgrade: PresetUpgradeBackup | undefined;
  let scope: 'role' | 'shared' = 'role';
  let busy = false, reload = true, status = '', search = '', onlyEnabled = false, dragId = '', fileRead = 0;
  let dialog: HTMLDialogElement | null = null;

  const effective = () => resolvePreset(library!, actor!.id);
  const base = () => library!.presets.find(p => p.id === effective().id)!;
  const key = () => JSON.stringify([actor?.id, actor && library ? effective().id : '', scope]);
  const original = () => scope === 'shared' ? base() : effective();
  const edited = () => drafts.get(key())?.edited || original();
  const locked = () => scope === 'shared' && base().id === 'native';
  const error = (e: unknown) => e instanceof Error ? e.message : '操作未完成，原数据保留。';
  const toolbar = (action: string, label: string, css = '') => `<button type="button" class="fruit-button ${css}" data-preset-action="${action}">${label}</button>`;
  const viewport = () => host?.closest<HTMLElement>('.viewport');
  const references = () => context.roles().filter(r => resolvePreset(library!, r.id).id === base().id).map(r => r.name);

  function feedback() {
    const node = host?.querySelector<HTMLElement>('[data-preset-status]');
    if (node) node.textContent = busy ? '正在保存或读取…' : status || (drafts.has(key()) ? '修改尚未保存' : '已保存');
    const retry = host?.querySelector<HTMLElement>('[data-preset-conflict-reload]');
    if (retry) retry.hidden = !/其他标签页|另一页面/.test(status);
    host?.setAttribute('aria-busy', String(busy));
    for (const control of host?.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('button,input,select') || []) {
      if (busy && !control.disabled) {
        control.disabled = true;
        control.dataset.presetBusy = 'true';
      } else if (!busy && control.dataset.presetBusy) {
        control.disabled = false;
        delete control.dataset.presetBusy;
      }
    }
  }
  function filter() {
    const query = search.trim().toLowerCase();
    for (const row of host?.querySelectorAll<HTMLElement>('[data-prompt-row]') || []) {
      row.hidden = !!(query && !row.dataset.search?.toLowerCase().includes(query)) || onlyEnabled && !row.querySelector<HTMLInputElement>('[data-prompt-enabled]')?.checked;
    }
    for (const group of host?.querySelectorAll<HTMLDetailsElement>('[data-prompt-group]') || []) {
      group.hidden = !group.querySelector('[data-prompt-row]:not([hidden])');
      group.open = !!query || !collapsed.has(group.dataset.promptGroup!);
    }
  }
  function renderList(focusId?: string) {
    const list = host?.querySelector('[data-terminal-list]');
    const vp = viewport(), scroll = vp?.scrollTop || 0;
    if (list) list.innerHTML = renderNativePromptList(edited(), base(), locked());
    filter();
    feedback();
    if (focusId) {
      const row = Array.from(list?.querySelectorAll<HTMLElement>('[data-prompt-row]') || []).find(row => row.dataset.promptRow === focusId);
      row?.querySelector<HTMLElement>('[data-prompt-edit]')?.focus({preventScroll: true});
    }
    if (vp) vp.scrollTop = scroll;
  }
  function options(id: string, inherit = false) {
    return (inherit ? `<option value="inherit" ${id === 'inherit' ? 'selected' : ''}>跟随默认预设</option>` : '') + library!.presets.map(p => `<option value="${esc(p.id)}" ${p.id === id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  }
  function render() {
    if (!host) return;
    const vp = viewport(), scroll = vp?.scrollTop || 0;
    const toolsOpen = host.querySelector<HTMLDetailsElement>('[data-preset-tools]')?.open;
    const backupOpen = host.querySelector<HTMLDetailsElement>('[data-preset-backups]')?.open;
    if (!library || !actor) {
      host.innerHTML = `<p class="terminal-library-status" role="status" data-preset-status></p>${toolbar('reload', '重新读取')}${toolbar('rescue', '导出旧预设归档备份')}`;
      feedback();
      return;
    }
    const p = edited();
    const originals = legacyOriginals(archive);
    host.innerHTML = `<div class="terminal-presets native-preset-panel"><section class="terminal-current">
      <div class="terminal-select-line"><label class="grow">${esc(actor.name)}的小说预设<select class="field" data-preset-select aria-label="角色小说预设">${options(library.bindings[actor.id]?.presetId || 'inherit', true)}</select></label></div>
      <h3 class="native-preset-title">${esc(p.name)}</h3>
      ${scope === 'shared' ? `<p class="terminal-caption" data-preset-scope-notice>正在修改共享本体。使用角色：${esc(references().join('、') || '无')}。</p>${toolbar('scope', '返回角色编辑')}` : ''}
      ${locked() ? `<p class="terminal-caption">内置预设可复制后编辑。</p>` : ''}
      <div class="terminal-list-toolbar">
        <button type="button" class="fruit-button fruit-primary" data-preset-action="save" data-testid="preset-save" ${locked() ? 'disabled' : ''}>保存预设</button>
        <button type="button" class="fruit-button" data-preset-action="add" ${locked() ? 'disabled' : ''}>${uiIcon('plus')} 添加 Prompt</button>
      </div>
      <div class="terminal-profile-state"><span role="status" aria-live="polite" data-preset-status></span><button type="button" class="fruit-button" data-preset-action="reload" data-preset-conflict-reload hidden>重新读取</button></div>
      <div class="terminal-list-filter"><input class="field" type="search" data-terminal-search placeholder="搜索 Prompt 名称" aria-label="搜索 Prompt" value="${esc(search)}"><label><input type="checkbox" data-terminal-only ${onlyEnabled ? 'checked' : ''}>只看已启用</label>${toolbar('fold', '折叠 / 展开全部')}</div>
      <div class="terminal-prompt-list" data-terminal-list></div>
      <details class="terminal-profile-settings" data-preset-tools ${toolsOpen ? 'open' : ''}><summary>预设管理</summary>
        <div class="terminal-preset-tools">
          ${toolbar('new','新建空白预设')}${toolbar('copy','复制预设')}${toolbar('scope',scope === 'shared' ? '返回角色编辑' : '编辑共享本体')}
          ${scope === 'shared' && !locked() ? toolbar('metadata','名称与简介') : ''}
          ${scope === 'role' ? toolbar('inherit','恢复角色继承值') : ''}
          <label class="fruit-button terminal-import">导入预设<input type="file" data-native-import aria-label="导入原生预设" accept=".json,application/json"></label>
          ${toolbar('export','导出 JSON')}${p.id !== 'native' ? toolbar('delete','删除预设') : ''}
        </div>
        <label class="terminal-label">全局默认预设<select class="field" data-preset-default>${options(library.defaultPresetId)}</select></label>
      </details>
      <details class="terminal-profile-settings" data-preset-backups ${backupOpen ? 'open' : ''}><summary>备份、恢复与旧预设归档</summary>
        ${upgrade ? '<p class="terminal-caption">已沿用选定的旧配置。升级前的面对面和戏中戏设置均可恢复。</p>' : ''}
        ${library.legacyNotice ? '<p class="terminal-caption">旧第三方原件与绑定保留在归档中。小说生成使用原生预设。</p>' : ''}
        <div class="terminal-preset-tools">${toolbar('export-library','导出私有库备份')}
          <label class="fruit-button terminal-import">恢复私有库备份<input type="file" data-preset-restore aria-label="恢复私有库备份" accept=".json,application/json"></label>
          ${toolbar('restore-previous','恢复上次修改前版本')}
          ${upgrade ? toolbar('export-upgrade','导出合并前备份') + toolbar('restore-upgrade','恢复合并前配置') + (upgrade.previous ? toolbar('export-upgrade-previous','导出升级前上一版本') : '') : ''}
          ${context.legacyExport ? toolbar('export-world-legacy','导出存档旧附加预设') : ''}
        </div>
        ${originals.map(a => `<p class="terminal-caption">${esc(a.name)} <button type="button" class="fruit-button" data-preset-action="legacy-raw" data-id="${esc(a.id)}">下载原件</button></p>`).join('')}
      </details>
    </section></div>`;
    renderList();
    if (vp) vp.scrollTop = scroll;
  }
  function openDialog(title: string, content: string) {
    status = '';
    feedback();
    dialog?.close();
    const focus = document.activeElement;
    const d = document.createElement('dialog');
    d.className = 'fruit-dialog native-preset-dialog';
    d.setAttribute('aria-labelledby', 'fruit-dialog-title');
    d.innerHTML = `<div class="fruit-dialog-top"><span>ELSEWHERE · 预设管理</span><button type="button" class="fruit-close" data-dialog-close aria-label="关闭弹窗">×</button></div><div class="fruit-dialog-body"><h2 id="fruit-dialog-title">${esc(title)}</h2>${content}</div>`;
    d.addEventListener('click', e => {
      if (e.target instanceof Element && e.target.closest('[data-dialog-close]')) d.close('cancel');
      else if (e.target === d) {
        const bounds = d.getBoundingClientRect();
        if (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom) d.close('cancel');
      }
    });
    d.addEventListener('close', () => {
      if (dialog === d) dialog = null;
      d.remove();
      if (focus instanceof HTMLElement && focus.isConnected) focus.focus({preventScroll: true});
    }, {once: true});
    dialog = d;
    document.body.append(d);
    d.showModal();
    return d;
  }
  function choose(title: string, body: string, choices: [string, string][]) {
    const d = openDialog(title, `<p class="fruit-dialog-lead">${esc(body)}</p><form method="dialog" class="terminal-editor-actions">${choices.map(([value, label]) => `<button class="fruit-button" value="${esc(value)}">${esc(label)}</button>`).join('')}</form>`);
    return new Promise<string>(resolve => d.addEventListener('close', () => resolve(d.returnValue || 'cancel'), {once: true}));
  }
  function download(bytes: Uint8Array, name: string) {
    const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], {type: 'application/json'}));
    const a = document.createElement('a');
    a.href = url;
    a.download = presetFilename(name.replace(/\.json$/i, ''));
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function updateDraft(next: ElsewherePreset) {
    const current = drafts.get(key());
    drafts.set(key(), {original: current?.original || original(), edited: validateElsewherePreset(next)});
    status = '';
  }
  function editEntry(id?: string) {
    const preset = edited();
    const entry = id ? preset.entries.find(e => e.id === id) : {id: crypto.randomUUID(), name: '', role: 'system' as const, enabled: true, content: ''};
    if (!entry || !id && locked()) return;
    const editKey = key();
    const d = openDialog(id ? '编辑 Prompt' : '添加 Prompt', renderNativePromptEditor(entry, !id, locked()));
    const form = d.querySelector<HTMLFormElement>('[data-prompt-editor]')!;
    form.querySelector<HTMLTextAreaElement>('textarea')!.value = entry.content;
    function apply(action: 'save' | 'copy' | 'delete') {
      try {
        if (!library || !actor || editKey !== key() || busy || locked()) throw Error('编辑对象已变化，请重新打开条目');
        const next = structuredClone(edited());
        if (action === 'delete') {
          if (!window.confirm(`删除「${entry!.name}」？${scope === 'role' ? '仅修改此角色。' : '保存后会影响使用此共享预设的角色。'}`)) return;
          next.entries = next.entries.filter(e => e.id !== id);
        } else {
          if (!form.reportValidity()) return;
          const fields = new FormData(form);
          const name = String(fields.get('prompt-name')).trim();
          const saved: PresetItem = {...entry!, id: action === 'copy' ? crypto.randomUUID() : entry!.id, name: action === 'copy' ? name.slice(0, 198) + '副本' : name, role: fields.get('prompt-role') as PresetItem['role'], content: String(fields.get('prompt-content')), group: String(fields.get('prompt-group')).trim()};
          const index = next.entries.findIndex(e => e.id === id);
          if (action === 'copy') next.entries.splice(index + 1, 0, saved);
          else if (index < 0) next.entries.push(saved);
          else next.entries[index] = saved;
        }
        updateDraft(next);
        d.close('saved');
        renderList(action === 'delete' ? undefined : id || next.entries.at(-1)?.id);
      } catch (e) {
        const node = form.querySelector<HTMLElement>('[data-editor-status]')!;
        node.hidden = false;
        node.textContent = error(e);
      }
    }
    form.addEventListener('submit', e => { e.preventDefault(); apply('save'); });
    form.addEventListener('click', e => {
      const action = (e.target as HTMLElement).dataset.entryAction;
      if (action === 'copy' || action === 'delete') apply(action);
    });
  }
  async function load() {
    if (busy) return;
    busy = true;
    status = '';
    feedback();
    try {
      let next = await repository.load();
      const migrated = repository.upgradePending;
      if (migrated || !next.revision) next = await repository.save(next, next.revision);
      archive = await repository.archive();
      upgrade = await repository.upgradeBackup();
      library = next;
      if (migrated) status = '已沿用原面对面配置。两套旧设置可在备份区恢复。';
      reload = false;
    } catch (e) { status = error(e); }
    finally { busy = false; render(); }
  }
  async function commit(candidate: ElsewherePresetLibrary, incomingArchive?: LegacyPresetArchive, importedBackup?: PresetUpgradeBackup) {
    if (!library || busy) return false;
    busy = true;
    feedback();
    try {
      library = await repository.save(candidate, library.revision, incomingArchive, importedBackup);
      if (incomingArchive) archive = incomingArchive;
      if (importedBackup && !upgrade) upgrade = importedBackup;
      status = '保存成功';
      return true;
    } catch (e) {
      status = error(e);
      return false;
    } finally { busy = false; feedback(); }
  }
  async function save() {
    const id = key();
    const draft = drafts.get(id);
    if (!draft) return true;
    if (JSON.stringify(draft.original) !== JSON.stringify(original())) {
      if (await choose('配置已经更新', '重新读取后发现当前配置有变化。确认后，当前草稿将替换这份配置。', [['save', '用草稿替换'], ['cancel', '继续核对']]) !== 'save') return false;
    }
    let next: ElsewherePresetLibrary;
    if (scope === 'shared') next = replaceSharedPreset(library!, draft.edited);
    else {
      next = structuredClone(library!);
      const presetId = next.bindings[actor!.id]?.presetId || 'inherit';
      next.bindings[actor!.id] = {presetId, overrides: presetOverride(base(), draft.edited)};
    }
    if (!await commit(next)) return false;
    drafts.delete(id);
    render();
    return true;
  }
  function move(id: string, to: number) {
    if (locked()) return;
    const next = structuredClone(edited());
    const from = next.entries.findIndex(e => e.id === id);
    if (from < 0 || to < 0 || to >= next.entries.length || from === to) return;
    next.entries.splice(to, 0, next.entries.splice(from, 1)[0]);
    updateDraft(next);
    renderList(id);
  }
  async function addPreset(p: ElsewherePreset) {
    const next = importElsewherePreset(library!, p);
    next.bindings[actor!.id] = {presetId: next.presets.at(-1)!.id, overrides: {}};
    if (await commit(next)) { scope = 'role'; render(); }
  }
  async function act(action: string, id?: string) {
    if (action === 'reload') { await load(); return; }
    if (action === 'rescue') {
      download(encodeNativeLibraryBackup(emptyPresetLibrary(), await repository.archive()), 'Elsewhere-旧预设抢救备份');
      return;
    }
    if (!library || !actor) return;
    if (action === 'add') { editEntry(); return; }
    if (action === 'save') { await save(); return; }
    if (action === 'scope') { scope = scope === 'role' ? 'shared' : 'role'; status = ''; render(); return; }
    if (action === 'fold') {
      const groups = Array.from(host?.querySelectorAll<HTMLDetailsElement>('[data-prompt-group]') || []);
      const fold = groups.some(g => g.open && !g.hidden);
      collapsed.clear();
      if (fold) for (const group of groups) collapsed.add(group.dataset.promptGroup!);
      if (search) {
        for (const group of groups) group.open = !fold;
      } else filter();
      return;
    }
    if (action === 'new' || action === 'copy') {
      const preset = action === 'new' ? {...builtinPreset(), name: '未命名预设', description: ''} : {...edited(), name: edited().name.slice(0, 198) + '副本'};
      await addPreset({...preset, id: crypto.randomUUID()});
      return;
    }
    if (action === 'metadata' && !locked()) {
      const p = edited();
      const d = openDialog('名称与简介', `<form><label class="terminal-label">预设名称<input class="field" name="name" required maxlength="200" value="${esc(p.name)}"></label><label class="terminal-label">简介<textarea class="field" name="description" maxlength="2000">${esc(p.description)}</textarea></label><button class="fruit-button fruit-primary">保存到草稿</button></form>`);
      d.querySelector('form')!.addEventListener('submit', e => {
        e.preventDefault();
        const values = new FormData(e.currentTarget as HTMLFormElement);
        try { updateDraft({...p, name: String(values.get('name')).trim(), description: String(values.get('description'))}); d.close(); render(); }
        catch (e) { status = error(e); feedback(); }
      });
      return;
    }
    if (action === 'delete') {
      const p = base();
      if (await choose('删除预设', `删除「${p.name}」？${library.defaultPresetId === p.id ? '全局默认将改为内置基础。' : ''}使用角色 ${references().join('、') || '无'}。受影响的角色将回退，恢复前版本保留。`, [['delete', '确认删除预设'], ['cancel', '取消']]) !== 'delete') return;
      if (await commit(deletePreset(library, p.id))) {
        for (const [k, draft] of drafts) if (draft.edited.id === p.id) drafts.delete(k);
        scope = 'role'; render();
      }
      return;
    }
    if (action === 'inherit') {
      if (await choose('恢复角色继承值', '清除此角色在当前预设上的独立覆盖。', [['restore', '恢复继承值'], ['cancel', '取消']]) !== 'restore') return;
      const next = structuredClone(library);
      if (next.bindings[actor.id]) next.bindings[actor.id].overrides = {};
      if (await commit(next)) { drafts.delete(key()); render(); }
      return;
    }
    if (action === 'export') {
      if (drafts.has(key())) {
        const option = await choose('还有未保存的修改', '导出当前编辑范围的 Prompt 条目。', [['save', '保存后导出'], ['saved', '导出已保存版本'], ['cancel', '取消']]);
        if (option === 'cancel' || option === 'save' && !await save()) return;
      }
      download(exportElsewherePreset(original()), original().name);
      return;
    }
    if (action === 'export-library') { download(encodeNativeLibraryBackup(library, archive, upgrade), 'Elsewhere-私有预设库备份'); return; }
    if (action === 'export-upgrade' && upgrade) { download(encodeNativeLibraryBackup(upgrade.library, archive), 'Elsewhere-合并前预设备份'); return; }
    if (action === 'export-upgrade-previous' && presetObject(upgrade?.previous)) {
      download(encodeNativeLibraryBackup(upgrade.previous.library, presetObject(upgrade.previous.archive) ? upgrade.previous.archive : archive), 'Elsewhere-升级前上一版本');
      return;
    }
    if (action === 'restore-upgrade' && upgrade) {
      const source = await choose('恢复合并前配置', '将按选定的旧配置重建整个共用预设库。当前库会保存为恢复点。', [['meeting','沿用原面对面'], ['theatre','沿用原戏中戏'], ['cancel','取消']]);
      if (source !== 'cancel' && await commit(validatePresetLibrary(upgrade.library, source === 'theatre' ? 'theatre' : 'meeting'))) { scope = 'role'; render(); }
      return;
    }
    if (action === 'restore-previous') {
      const previous = await repository.previous();
      if (!previous) throw Error('还没有修改前版本。');
      if (await choose('恢复上次修改前版本', '将恢复整个预设库与角色覆盖，当前库会保留为下一份恢复前版本。', [['restore','确认恢复'], ['cancel','取消']]) === 'restore' && await commit(previous.library, previous.archive)) { scope = 'role'; render(); }
      return;
    }
    if (action === 'legacy-raw') {
      const original = legacyOriginals(archive).find(a => a.id === id);
      if (original) download(original.raw, original.name);
    }
    if (action === 'export-world-legacy') download(new TextEncoder().encode(JSON.stringify(context.legacyExport?.(), null, 2)), 'Elsewhere-存档旧附加预设');
  }
  async function importFile(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const backup = input.hasAttribute('data-preset-restore');
    const limit = backup ? 64 * 1024 * 1024 : PRESET_MAX_BYTES;
    if (file.size > limit) throw Error('预设文件超过大小限制');
    const request = ++fileRead;
    const revision = library!.revision;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!host || request !== fileRead || library!.revision !== revision) return;
    if (backup) {
      let incoming = await decodeNativeLibraryBackup(bytes);
      if (!host || request !== fileRead || library!.revision !== revision) return;
      const choices: [string, string][] = incoming.upgradeBackup ? [['meeting','沿用原面对面'], ['theatre','沿用原戏中戏']] : [];
      const option = await choose('恢复私有预设库', '将替换整个预设库与角色覆盖，保留当前库作为恢复点。旧第三方原件恢复到归档。', [['restore','确认恢复'], ...choices, ['cancel','取消']]);
      if (option === 'cancel') return;
      if (option === 'theatre' || option === 'meeting') incoming = {...incoming, library: validatePresetLibrary(incoming.upgradeBackup!.library, option)};
      if (await commit(incoming.library, incoming.archive, incoming.upgradeBackup)) { scope = 'role'; render(); }
      return;
    }
    const imported = readElsewherePresetFile(bytes);
    const differs = 'settings' in imported && JSON.stringify(imported.settings.meeting) !== JSON.stringify(imported.settings.theatre);
    const description = `${imported.name} · ${imported.entries.length} 条 Prompt。${differs ? '两种旧设置不同。默认将面对面篇幅与文风转换为普通条目。' : ''}导入后用于当前角色。`;
    const choices: [string, string][] = [['meeting','确认导入']];
    if (differs) choices.push(['theatre','沿用原戏中戏']);
    const option = await choose('导入原生预设', description, [...choices, ['cancel','取消']]);
    if (option !== 'cancel') await addPreset(unifyElsewherePreset(imported, option === 'theatre' ? 'theatre' : 'meeting'));
  }
  async function changeSelection(select: HTMLSelectElement) {
    if (!library || !actor) return;
    const current = library.bindings[actor.id];
    const next = structuredClone(library);
    const value = select.value;
    if (select.hasAttribute('data-preset-default')) {
      for (const binding of Object.values(next.bindings)) {
        if (binding.presetId === 'inherit' && Object.keys(binding.overrides).length) binding.presetId = next.defaultPresetId;
      }
      next.defaultPresetId = value;
    } else {
      select.value = current?.presetId || 'inherit';
      if (current && Object.keys(current.overrides).length && await choose('切换小说预设', '切换后使用新预设的条目。当前角色覆盖保留在恢复前版本。', [['switch','确认切换'], ['cancel','取消']]) !== 'switch') return;
      next.bindings[actor.id] = {presetId: value, overrides: {}};
    }
    if (await commit(next)) scope = 'role';
    render();
  }
  const fail = (e: unknown) => { status = error(e); feedback(); };
  function click(event: Event) {
    event.stopPropagation();
    const target = event.target;
    if (!(target instanceof Element) || busy) return;
    const summary = target.closest('summary');
    const group = summary?.parentElement as HTMLDetailsElement | null;
    if (group?.dataset.promptGroup && !search) {
      if (group.open) collapsed.add(group.dataset.promptGroup); else collapsed.delete(group.dataset.promptGroup);
    }
    const button = target.closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    try {
      if (button.dataset.promptEdit) editEntry(button.dataset.promptEdit);
      else if (button.dataset.promptMove && button.dataset.id) move(button.dataset.id, edited().entries.findIndex(e => e.id === button.dataset.id) + (button.dataset.promptMove === 'up' ? -1 : 1));
      else if (button.dataset.presetAction) void act(button.dataset.presetAction, button.dataset.id).catch(fail);
    } catch (e) { fail(e); }
  }
  function change(event: Event) {
    event.stopPropagation();
    const target = event.target;
    if (busy) return;
    if (target instanceof HTMLInputElement) {
      if (target.type === 'file') { void importFile(target).catch(fail); return; }
      if (target.hasAttribute('data-terminal-only')) { onlyEnabled = target.checked; filter(); return; }
      if (target.dataset.promptEnabled && !locked()) {
        try {
          const next = structuredClone(edited());
          const item = next.entries.find(e => e.id === target.dataset.promptEnabled);
          if (item) item.enabled = target.checked;
          updateDraft(next);
          feedback(); filter();
        } catch (e) { fail(e); }
      }
    } else if (target instanceof HTMLSelectElement) void changeSelection(target).catch(fail);
  }
  function input(event: Event) {
    event.stopPropagation();
    if (event.target instanceof HTMLInputElement && event.target.hasAttribute('data-terminal-search')) { search = event.target.value; filter(); }
  }
  function dragstart(event: DragEvent) {
    const handle = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-prompt-drag]') : null;
    if (!handle?.draggable || busy) return;
    dragId = handle.dataset.promptDrag || '';
    event.dataTransfer?.setData('text/plain', dragId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }
  function dragover(event: DragEvent) {
    if (dragId && event.target instanceof Element && event.target.closest('[data-prompt-row]')) event.preventDefault();
  }
  function drop(event: DragEvent) {
    if (!dragId || busy || !(event.target instanceof Element)) return;
    event.preventDefault();
    const destination = event.target.closest<HTMLElement>('[data-prompt-row]')?.dataset.promptRow;
    const id = dragId;
    dragId = '';
    if (destination) try { move(id, edited().entries.findIndex(e => e.id === destination)); } catch (e) { fail(e); }
  }
  const dragend = () => { dragId = ''; };
  function detach() {
    if (!host) return;
    host.removeEventListener('click', click); host.removeEventListener('change', change); host.removeEventListener('input', input);
    host.removeEventListener('dragstart', dragstart); host.removeEventListener('dragover', dragover); host.removeEventListener('drop', drop); host.removeEventListener('dragend', dragend);
    host = null;
  }
  return {
    detach,
    hasUnsaved: () => drafts.size > 0 || !!dialog?.querySelector('[data-prompt-editor]'),
    async beforeLeave() {
      if (busy) return false;
      if (drafts.size && await choose('有未保存的修改', '保留当前标签页草稿并离开，或继续编辑。', [['leave','保留草稿并离开'], ['cancel','继续编辑']]) !== 'leave') return false;
      ++fileRead;
      dialog?.close();
      scope = 'role'; search = ''; onlyEnabled = false; collapsed.clear(); reload = true;
      return true;
    },
    mount(element: HTMLElement | null) {
      detach(); host = element;
      if (!host) return;
      const current = context.currentRole();
      if (actor?.id !== current?.id) { dialog?.close(); scope = 'role'; reload = true; }
      actor = current;
      host.addEventListener('click', click); host.addEventListener('change', change); host.addEventListener('input', input);
      host.addEventListener('dragstart', dragstart); host.addEventListener('dragover', dragover); host.addEventListener('drop', drop); host.addEventListener('dragend', dragend);
      render();
      if (reload) void load();
    },
  };
}
