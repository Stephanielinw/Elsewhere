import {escHtml as esc} from './core/footprints';
import {builtinPreset,emptyPresetLibrary,parseElsewherePreset,exportElsewherePreset,validateElsewherePreset,resolvePreset,importElsewherePreset,replaceSharedPreset,deletePreset,presetFilename,PRESET_MAX_BYTES,type ElsewherePreset,type ElsewherePresetLibrary,type PresetMode,type PresetOverride} from './core/elsewherePreset';
import {ElsewherePresetRepository,encodeNativeLibraryBackup,decodeNativeLibraryBackup,legacyOriginals,type LegacyPresetArchive} from './core/presetLibrary';

type Tab='library'|'edit'|'import'|'export';
type Scope='shared'|PresetMode;
const modes:PresetMode[]=['meeting','theatre'];
const modeLabel=(m:PresetMode)=>m==='meeting'?'面对面':'戏中戏';
export function createFruitManager(context:{currentRole:()=>{id:string;name:string}|null;roles:()=>{id:string;name:string}[];leave:()=>void;legacyInfo?:()=>string;legacyExport?:()=>unknown}){
 const repository=new ElsewherePresetRepository(),drafts=new Map<string,ElsewherePreset>(),draftOriginals=new Map<string,ElsewherePreset>();
 let host:HTMLElement|null=null,library:ElsewherePresetLibrary|null=null,archive:LegacyPresetArchive={},tab:Tab='library',scope:Scope='shared',selected='native',actor:{id:string;name:string}|null=null,busy=false,status='',epoch=0;
 let importing:ElsewherePreset|undefined,dialog:HTMLDialogElement|null=null;
 const key=()=>JSON.stringify([actor?.id,selected,scope]);
 const base=()=>library?.presets.find(p=>p.id===selected);
 const original=()=>scope==='shared'?structuredClone(base()!):resolvePreset({...library!,defaults:{...library!.defaults,[scope]:selected},bindings:{...library!.bindings,[actor!.id]:{...library!.bindings[actor!.id],[scope]:{presetId:selected,overrides:(library!.bindings[actor!.id]?.[scope]?.presetId===selected||library!.bindings[actor!.id]?.[scope]?.presetId==='inherit'&&library!.defaults[scope]===selected)?library!.bindings[actor!.id]![scope]!.overrides:{}}}}},actor!.id,scope);
 const draft=()=>drafts.get(key())||original();
 const dirty=()=>drafts.has(key());
 const remember=()=>{if(!draftOriginals.has(key()))draftOriginals.set(key(),original());};
 const error=(e:unknown)=>e instanceof Error?e.message:'操作未完成，原数据保留。';
 function feedback(){if(!host)return;const node=host.querySelector<HTMLElement>('[data-preset-status]');if(node)node.textContent=status|| (dirty()?'修改尚未保存':'已保存');const reload=host.querySelector<HTMLElement>('[data-preset-conflict-reload]');if(reload)reload.hidden=!/其他标签页|另一页面/.test(status);host.setAttribute('aria-busy',String(busy));for(const button of host.querySelectorAll<HTMLButtonElement>('button'))button.disabled=busy||button.dataset.locked==='true';}
 function download(bytes:Uint8Array,name:string){const url=URL.createObjectURL(new Blob([Uint8Array.from(bytes)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=presetFilename(name.replace(/\.json$/i,''));a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
 function ask(title:string,body:string,choices:{id:string;label:string}[]):Promise<string>{
  dialog?.close();dialog?.remove();
  return new Promise(resolve=>{const d=document.createElement('dialog');dialog=d;d.className='fruit-dialog preset-dialog';d.innerHTML=`<div class="fruit-dialog-body"><h2>${esc(title)}</h2><p>${esc(body)}</p><div class="preset-actions">${choices.map(c=>`<button type="button" class="btn secondary" data-choice="${esc(c.id)}">${esc(c.label)}</button>`).join('')}</div></div>`;
   let done=false;const finish=(value:string)=>{if(done)return;done=true;d.close();d.remove();if(dialog===d)dialog=null;resolve(value);};d.addEventListener('cancel',event=>{event.preventDefault();finish('cancel');});d.addEventListener('click',event=>{const b=(event.target as Element).closest<HTMLElement>('[data-choice]');if(b)finish(b.dataset.choice!);else if(event.target===d)finish('cancel');});document.body.append(d);d.showModal();
  });
 }
 function snapshot(){const active=document.activeElement as HTMLTextAreaElement|HTMLInputElement|null;return {field:active&&host?.contains(active)?active.dataset.presetField:undefined,start:active?.selectionStart,end:active?.selectionEnd,scroll:host?.closest('.viewport')?.scrollTop||0};}
 function restore(s:ReturnType<typeof snapshot>){const container=host?.closest('.viewport');if(container)container.scrollTop=s.scroll;if(s.field){const field=Array.from(host?.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('[data-preset-field]')||[]).find(f=>f.dataset.presetField===s.field);if(field){field.focus({preventScroll:true});if(field instanceof HTMLTextAreaElement||field.type==='text')field.setSelectionRange(s.start||0,s.end||0);}}}
 function options(id:string,inherit=false){return (inherit?'<option value="inherit">跟随模式默认</option>':'')+library!.presets.map(p=>`<option value="${esc(p.id)}" ${p.id===id?'selected':''}>${esc(p.name)}</option>`).join('');}
 function references(id:string){return context.roles().flatMap(role=>modes.filter(mode=>resolvePreset(library!,role.id,mode).id===id).map(mode=>role.name+' · '+modeLabel(mode)));}
 function settingsHtml(p:ElsewherePreset){return modes.map(mode=>`<fieldset ${scope!=='shared'&&scope!==mode?'hidden':''}><legend>${modeLabel(mode)}设置</legend><div class="preset-length"><label>最少字数<input type="number" class="field" min="1" max="50000" data-preset-field="${mode}.min" value="${p.settings[mode].length.min}"></label><label>最多字数<input type="number" class="field" min="1" max="50000" data-preset-field="${mode}.max" value="${p.settings[mode].length.max}"></label></div><label>文风备注<textarea class="field" rows="2" data-preset-field="${mode}.style">${esc(p.settings[mode].style)}</textarea></label></fieldset>`).join('');}
 function render(){
  if(!host)return;const saved=snapshot();
  if(!library){host.innerHTML=`<p role="status" data-preset-status>${esc(status||'正在读取预设…')}</p><button class="btn secondary" data-preset-action="reload">重新读取</button><button class="btn secondary" data-preset-action="export-legacy-backup">导出旧库抢救备份</button>`;return;}
  const p=base()||library.presets[0];selected=p.id;
  let body='';
  if(tab==='library')body=`<div class="preset-actions"><button class="btn" data-preset-action="new">新建空白预设</button><button class="btn secondary" data-preset-action="builtin-copy">复制内置基础</button></div><section><h3>模式默认预设</h3>${modes.map(mode=>`<label>${modeLabel(mode)}<select class="field" data-preset-default="${mode}">${options(library!.defaults[mode])}</select></label>`).join('')}</section><section><h3>${esc(actor?.name||'当前角色')}的选择</h3>${modes.map(mode=>`<label>${modeLabel(mode)}<select class="field" data-preset-binding="${mode}">${options(library!.bindings[actor!.id]?.[mode]?.presetId||'inherit',true)}</select></label>`).join('')}</section><div class="preset-catalog">${library.presets.map(item=>`<article data-preset-id="${esc(item.id)}"><h3>${esc(item.name)}</h3><p>${esc(item.description)}</p><small>${item.entries.length} 个条目</small><div class="preset-actions"><button class="btn secondary" data-preset-action="edit" data-id="${esc(item.id)}">${item.id==='native'?'查看内置基础':'编辑预设'}</button><button class="btn secondary" data-preset-action="copy" data-id="${esc(item.id)}">复制预设</button>${item.id==='native'?'':`<button class="btn ghost" data-preset-action="delete" data-id="${esc(item.id)}">删除预设</button>`}</div></article>`).join('')}</div><details><summary>备份、恢复与旧预设归档</summary><p>旧原件与配置保留在本机，可下载备份。</p><div class="preset-actions"><button class="btn secondary" data-preset-action="export-library">导出私有库备份</button><label class="btn secondary">恢复私有库备份<input type="file" data-preset-restore accept=".json,application/json" hidden></label><button class="btn secondary" data-preset-action="restore-previous">恢复上次修改前版本</button>${context.legacyExport?'<button class="btn secondary" data-preset-action="export-world-legacy">导出存档旧附加预设</button>':''}</div>${legacyOriginals(archive).map(a=>`<p>${esc(a.name)} <button class="btn small secondary" data-preset-action="legacy-raw" data-id="${esc(a.id)}">下载原件</button></p>`).join('')||'<p>没有旧第三方原件。</p>'}</details>`;
  if(tab==='edit'){
   const d=draft(),locked=p.id==='native'&&scope==='shared',refs=references(p.id);
   body=`<label>编辑范围<select class="field" data-preset-scope><option value="shared" ${scope==='shared'?'selected':''}>修改共享预设本体</option>${modes.map(mode=>`<option value="${mode}" ${scope===mode?'selected':''}>${esc(actor?.name)} · ${modeLabel(mode)}独立覆盖</option>`).join('')}</select></label><div class="preset-scope-notice" data-preset-scope-notice>${scope==='shared'?`<b>修改会影响使用此预设的角色</b><p>${esc(refs.join('、')||'当前世界尚无角色使用')}。其他世界中使用同一预设的角色也会继承未覆盖的修改。</p>`:`<b>仅修改 ${esc(actor?.name)} · ${modeLabel(scope)}的独立覆盖</b><p>其他角色与模式继续使用各自配置。</p>`}</div>${locked?'<p>内置基础受保护，请复制后编辑。</p><button class="btn" data-preset-action="builtin-copy">复制内置基础</button>':''}<div class="preset-editor" data-editor-locked="${locked}"><label>预设名称<input type="text" class="field" data-preset-field="name" value="${esc(d.name)}" ${scope!=='shared'||locked?'disabled':''}></label><label>简介<textarea class="field" rows="2" data-preset-field="description" ${scope!=='shared'||locked?'disabled':''}>${esc(d.description)}</textarea></label><fieldset ${locked?'disabled':''}>${settingsHtml(d)}<div class="preset-entry-list">${d.entries.map((entry,i)=>`<article class="preset-entry" data-entry-id="${esc(entry.id)}"><div class="row between"><strong>条目 ${i+1}</strong><label><input type="checkbox" data-preset-field="entry.${i}.enabled" ${entry.enabled?'checked':''}> 启用</label></div><label>条目名称<input type="text" class="field" data-preset-field="entry.${i}.name" value="${esc(entry.name)}"></label><label>消息角色<select class="field" data-preset-field="entry.${i}.role">${['system','user','assistant'].map(role=>`<option ${entry.role===role?'selected':''}>${role}</option>`).join('')}</select></label><label>正文<textarea class="field preset-entry-content" rows="6" data-preset-field="entry.${i}.content">${esc(entry.content)}</textarea></label><div class="preset-actions"><button type="button" class="btn small secondary" data-preset-action="up" data-index="${i}" ${i===0?'data-locked="true" disabled':''} aria-label="上移条目 ${i+1}">上移</button><button type="button" class="btn small secondary" data-preset-action="down" data-index="${i}" ${i===d.entries.length-1?'data-locked="true" disabled':''} aria-label="下移条目 ${i+1}">下移</button>${scope==='shared'?`<button class="btn small secondary" data-preset-action="duplicate-entry" data-index="${i}">复制条目</button><button class="btn small ghost" data-preset-action="delete-entry" data-index="${i}">删除条目</button>`:''}</div></article>`).join('')}</div>${scope==='shared'?'<button type="button" class="btn secondary" data-preset-action="add-entry">新增条目</button>':''}</fieldset><div class="preset-actions"><button type="button" class="btn" data-preset-action="save" ${locked?'data-locked="true" disabled':''}>${scope==='shared'?'保存共享预设':'仅保存此角色覆盖'}</button>${scope!=='shared'?'<button class="btn secondary" data-preset-action="inherit">恢复继承值</button>':''}</div></div>`;
  }
  if(tab==='import')body=`<h3>导入预设</h3><p>选择 Elsewhere 原生预设 V1 JSON，文件仅在本机读取。</p><label class="btn secondary">选择 JSON 文件<input type="file" accept=".json,application/json" data-native-import aria-label="选择 JSON 文件" hidden></label>${importing?`<section data-import-preview><h3>${esc(importing.name)}</h3><p>${esc(importing.description)}</p><p>${importing.entries.length} 个条目 · 格式 V1</p>${library.presets.some(p=>p.id===importing!.id)?'<p>预设 ID 已存在，将以新 ID 加入副本。</p>':''}${library.presets.some(p=>p.name===importing!.name)?'<p>同名预设将附加编号。</p>':''}<button class="btn" data-preset-action="confirm-import">确认导入</button></section>`:''}`;
  if(tab==='export')body=`<h3>导出预设</h3><label>选择预设<select class="field" data-preset-export-select>${options(selected)}</select></label><p>${esc(p.name)} · ${p.entries.length} 个已保存条目</p><p>导出包含共享本体及两种模式基础设置。角色独立覆盖可通过私有库备份导出。</p><button class="btn" data-preset-action="export">导出 JSON</button>`;
  host.innerHTML=`<div class="native-presets"><nav class="preset-tabs" aria-label="预设导航">${(['library','edit','import','export'] as Tab[]).map((id,i)=>`<button type="button" data-preset-tab="${id}" class="${tab===id?'active':''}" aria-current="${tab===id?'page':'false'}">${['我的预设','编辑预设','导入预设','导出预设'][i]}</button>`).join('')}</nav><p role="status" aria-live="polite" data-preset-status></p><button class="btn small secondary" data-preset-action="reload" data-preset-conflict-reload hidden>重新读取</button>${library.legacyNotice?'<details class="preset-upgrade-notice"><summary>旧预设已安全归档</summary><p>旧第三方预设和旧附加预设已退出生成。可确认的原生字数与文风已保留；其他旧条目覆盖和原件可在备份区导出。</p></details>':''}${body}</div>`;
  feedback();restore(saved);
 }
 async function commit(candidate:ElsewherePresetLibrary,archiveOverride?:LegacyPresetArchive){
  if(!library||busy)return false;busy=true;feedback();
  try{library=await repository.save(candidate,library.revision,archiveOverride);if(archiveOverride)archive=archiveOverride;status='保存成功';return true;}
  catch(e){status=error(e);return false;}finally{busy=false;feedback();}
 }
 function overrides(p:ElsewherePreset,base:ElsewherePreset,mode:PresetMode):PresetOverride {
  const initial=draftOriginals.get(key())||original();
  const binding=library!.bindings[actor!.id]?.[mode];
  const existing=binding&&(binding.presetId===selected||binding.presetId==='inherit'&&library!.defaults[mode]===selected)?binding.overrides:{};
  const result=structuredClone(existing),entries=result.entries||{};
  for(const e of p.entries){
   const source=base.entries.find(item=>item.id===e.id),before=initial.entries.find(item=>item.id===e.id);
   if(!source||!before)throw Error('共享条目已变化，请核对草稿后恢复继承值。');
   const patch=entries[e.id]||{};
   for(const field of ['name','role','enabled','content']as const){
    if(e[field]===before[field])continue;
    if(e[field]===source[field])delete patch[field];else Object.assign(patch,{[field]:e[field]});
   }
   if(Object.keys(patch).length)entries[e.id]=patch;else delete entries[e.id];
  }
  result.entries=entries;
  if(JSON.stringify(p.entries.map(e=>e.id))!==JSON.stringify(initial.entries.map(e=>e.id)))result.order=p.entries.map(e=>e.id);
  const settings=result.settings||{},length=settings.length||{};
  if(p.settings[mode].style!==initial.settings[mode].style){if(p.settings[mode].style===base.settings[mode].style)delete settings.style;else settings.style=p.settings[mode].style;}
  for(const field of ['min','max']as const)if(p.settings[mode].length[field]!==initial.settings[mode].length[field]){if(p.settings[mode].length[field]===base.settings[mode].length[field])delete length[field];else length[field]=p.settings[mode].length[field];}
  if(Object.keys(length).length)settings.length=length;else delete settings.length;
  if(Object.keys(settings).length)result.settings=settings;else delete result.settings;
  return result;
 }
 async function saveDraft(){
  if(!library||!actor||!base())return false;const k=key(),d=structuredClone(draft());
  try{
   validateElsewherePreset(d);
   let candidate:ElsewherePresetLibrary;
   if(scope==='shared'){
    const initial=draftOriginals.get(k);
    if(initial&&JSON.stringify(initial)!==JSON.stringify(base())&&await ask('共享预设已经更新','其他页面或角色已保存新版本。确认后，当前草稿会替换这份共享预设，影响所有使用者。',[{id:'replace',label:'确认用草稿替换'},{id:'cancel',label:'保留新版本'}])!=='replace')return false;
    candidate=replaceSharedPreset(library,d);
   }
   else {if(context.currentRole()?.id!==actor.id)throw Error('角色已变化，请返回原角色保存。');candidate=structuredClone(library);(candidate.bindings[actor.id]??={})[scope]={presetId:(!library.bindings[actor.id]?.[scope]||library.bindings[actor.id]?.[scope]?.presetId==='inherit')&&library.defaults[scope]===selected?'inherit':selected,overrides:overrides(d,base()!,scope)};}
   if(!await commit(candidate))return false;
   if(JSON.stringify(drafts.get(k))===JSON.stringify(d)){drafts.delete(k);draftOriginals.delete(k);}render();return true;
  }catch(e){status=error(e);feedback();return false;}
 }
 async function load(){const id=++epoch;status='正在读取预设…';render();try{let value=await repository.load();if(id!==epoch)return;if(value.revision===0)value=await repository.save(value,0);const old=await repository.archive();if(id!==epoch)return;library=value;archive=old;actor=context.currentRole();selected=actor?resolvePreset(value,actor.id,'meeting').id:'native';status='';render();}catch(e){if(id!==epoch)return;status=error(e);render();}}
 const input=(event:Event)=>{event.stopPropagation();const target=event.target;if(!(target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement||target instanceof HTMLSelectElement)||!target.dataset.presetField||!library)return;
  remember();const d=structuredClone(draft()),field=target.dataset.presetField!.split('.');
  if(field[0]==='entry'){const e=d.entries[Number(field[1])];if(!e)return;const name=field[2];if(name==='enabled')e.enabled=(target as HTMLInputElement).checked;else if(name==='role'&&['system','user','assistant'].includes(target.value))e.role=target.value as typeof e.role;else if(name==='name'||name==='content')e[name]=target.value;}
  else if(field[0]==='meeting'||field[0]==='theatre'){const settings=d.settings[field[0]];if(field[1]==='style')settings.style=target.value;else if(field[1]==='min'||field[1]==='max')settings.length[field[1]]=Number(target.value);}
  else if(field[0]==='name'||field[0]==='description')d[field[0]]=target.value;
  drafts.set(key(),d);status='修改尚未保存';feedback();
 };
 const click=(event:Event)=>{event.stopPropagation();const b=(event.target as Element).closest<HTMLElement>('[data-preset-action],[data-preset-tab]');if(!b||busy)return;event.preventDefault();void act(b).catch(e=>{status=error(e);feedback();});};
 async function act(b:HTMLElement){
  const action=b.dataset.presetAction;if(b.dataset.presetTab){tab=b.dataset.presetTab as Tab;render();return;}
  if(action==='reload'){if(drafts.size&&await ask('重新读取','未保存的修改仍会保留在当前标签页。重新读取预设库？',[{id:'reload',label:'重新读取'},{id:'cancel',label:'取消'}])!=='reload')return;await load();return;}
  if(action==='export-legacy-backup'){download(encodeNativeLibraryBackup(emptyPresetLibrary(),await repository.archive()),'Elsewhere-旧预设抢救备份');return;}
  if(!library)return;
  const id=b.dataset.id||selected;
  if(action==='new'||action==='copy'||action==='builtin-copy'){
   const source=action==='new'?{...builtinPreset(),name:'未命名预设',description:''}:structuredClone(library.presets.find(p=>p.id===(action==='builtin-copy'?'native':id))!);
   source.id=crypto.randomUUID();if(action!=='new')source.name=source.name.slice(0,198)+'副本';
   const next=importElsewherePreset(library,source);if(await commit(next)){selected=next.presets.at(-1)!.id;scope='shared';tab='edit';render();}return;
  }
  if(action==='edit'){selected=id;scope='shared';tab='edit';render();return;}
  if(action==='save'){await saveDraft();return;}
  if(action==='delete'){
   const p=library.presets.find(p=>p.id===id)!;if(await ask('删除预设',`删除「${p.name}」？默认引用：${modes.filter(mode=>library!.defaults[mode]===id).map(modeLabel).join('、')||'无'}。以下角色将回退至内置基础：${references(id).join('、')||'当前世界无角色使用'}。其他世界中的绑定也会安全回退。`,[{id:'delete',label:'确认删除预设'},{id:'cancel',label:'取消'}])!=='delete')return;
   if(await commit(deletePreset(library,id))){for(const [k,p]of drafts)if(p.id===id)drafts.delete(k);selected='native';render();}return;
  }
  if(action==='add-entry'||action==='duplicate-entry'||action==='delete-entry'||action==='up'||action==='down'){
   if(selected==='native'&&scope==='shared')return;remember();const d=structuredClone(draft()),i=Number(b.dataset.index);
   if(action==='add-entry')d.entries.push({id:crypto.randomUUID(),name:'新条目',role:'system',enabled:true,content:''});
   else if(action==='duplicate-entry')d.entries.splice(i+1,0,{...d.entries[i],id:crypto.randomUUID(),name:d.entries[i].name.slice(0,198)+'副本'});
   else if(action==='delete-entry'){if(await ask('删除条目','删除此共享条目后，对应角色覆盖也会移除。恢复前版本会保留。',[{id:'delete',label:'删除条目'},{id:'cancel',label:'取消'}])!=='delete')return;d.entries.splice(i,1);}
   else {const j=i+(action==='up'?-1:1);if(j<0||j>=d.entries.length)return;[d.entries[i],d.entries[j]]=[d.entries[j],d.entries[i]];}
   if(d.entries.length>128)throw Error('最多 128 个条目');drafts.set(key(),d);status='修改尚未保存';render();return;
  }
  if(action==='inherit'&&scope!=='shared'){
   if(await ask('恢复继承值','仅清除此角色在当前模式的独立覆盖。',[{id:'restore',label:'恢复继承值'},{id:'cancel',label:'取消'}])!=='restore')return;
   const next=structuredClone(library);(next.bindings[actor!.id]??={})[scope]={presetId:selected,overrides:{}};if(await commit(next)){drafts.delete(key());draftOriginals.delete(key());render();}return;
  }
  if(action==='confirm-import'&&importing){const next=importElsewherePreset(library,importing);if(await commit(next)){selected=next.presets.at(-1)!.id;scope='shared';tab='edit';importing=undefined;render();}return;}
  if(action==='export'){
   const changed=[...drafts.values()].some(p=>p.id===selected);
   if(changed){const choice=await ask('还有未保存的修改','导出的是共享预设本体，角色覆盖通过私有库备份导出。',[{id:'save',label:'保存后导出'},{id:'saved',label:'导出已保存版本'},{id:'cancel',label:'取消'}]);if(choice==='cancel')return;if(choice==='save'){const sharedKey=JSON.stringify([actor?.id,selected,'shared']);if(drafts.has(sharedKey)){const previousScope=scope;scope='shared';const saved=await saveDraft();scope=previousScope;render();if(!saved)return;}else if(!dirty()){tab='edit';render();status='请打开有未保存修改的编辑范围，保存后再导出。';feedback();return;}else if(!await saveDraft())return;}}
   download(exportElsewherePreset(base()!),base()!.name);status='已导出保存的预设 JSON';feedback();return;
  }
  if(action==='export-library'){download(encodeNativeLibraryBackup(library,archive),'Elsewhere-私有预设库备份');return;}
  if(action==='restore-previous'){const previous=await repository.previous();if(!previous)throw Error('还没有修改前版本。');if(await ask('恢复上次修改前版本','恢复整个预设库与角色覆盖，当前库会保留为下一份恢复前版本。',[{id:'restore',label:'确认恢复'},{id:'cancel',label:'取消'}])==='restore'&&await commit(previous.library,previous.archive)){drafts.clear();draftOriginals.clear();selected='native';render();}return;}
  if(action==='legacy-raw'){const original=legacyOriginals(archive).find(a=>a.id===id);if(original)download(original.raw,original.name);return;}
  if(action==='export-world-legacy'){download(new TextEncoder().encode(JSON.stringify(context.legacyExport?.(),null,2)),'Elsewhere-存档旧附加预设');}
 }
 const change=(event:Event)=>{event.stopPropagation();const t=event.target;if(!(t instanceof HTMLInputElement||t instanceof HTMLSelectElement)||busy)return;void(async()=>{
  if(t instanceof HTMLInputElement&&t.type==='file'){
   const file=t.files?.[0];t.value='';if(!file)return;
   if(t.hasAttribute('data-preset-restore')){if(file.size>64*1024*1024)throw Error('库备份超过 64 MiB');const backup=await decodeNativeLibraryBackup(new Uint8Array(await file.arrayBuffer()));if(await ask('恢复私有预设库','这会替换当前库和角色覆盖，保留恢复前版本。旧第三方预设只恢复到可导出的归档，生成时使用原生基础。',[{id:'restore',label:'确认恢复'},{id:'cancel',label:'取消'}])==='restore'&&await commit(backup.library,backup.archive)){drafts.clear();draftOriginals.clear();selected='native';render();}}
   else {importing=undefined;render();if(file.size>PRESET_MAX_BYTES)throw Error('请选择不超过 8 MiB 的 JSON');importing=parseElsewherePreset(new Uint8Array(await file.arrayBuffer()));status='验证通过，请确认导入';render();}return;
  }
  if(t.hasAttribute('data-preset-scope')){scope=t.value as Scope;status='';render();return;}
  if(t.hasAttribute('data-preset-export-select')){selected=t.value;render();return;}
  if(!library||!actor)return;
  const mode=(t.dataset.presetDefault||t.dataset.presetBinding) as PresetMode;if(!modes.includes(mode))return;
  const next=structuredClone(library);
  if(t.hasAttribute('data-preset-default')){next.defaults[mode]=t.value;for(const slots of Object.values(next.bindings)){const binding=slots[mode];if(binding?.presetId==='inherit')binding.overrides={};}}
  else (next.bindings[actor.id]??={})[mode]={presetId:t.value,overrides:{}};
  if(await commit(next))render();else t.value=t.hasAttribute('data-preset-default')?library.defaults[mode]:library.bindings[actor.id]?.[mode]?.presetId||'inherit';
 })().catch(e=>{status=error(e);feedback();});};
 function detach(){++epoch;if(!host)return;host.removeEventListener('click',click);host.removeEventListener('input',input);host.removeEventListener('change',change);host=null;}
 return {detach,hasUnsaved:()=>drafts.size>0,async beforeLeave(){if(!drafts.size)return true;const choice=await ask('有未保存的修改','可以留在编辑器保存，或保留当前标签页草稿后离开。',[{id:'leave',label:'保留草稿并离开'},{id:'cancel',label:'继续编辑'}]);return choice==='leave';},mount(element:HTMLElement|null){detach();host=element;if(!host)return;host.addEventListener('click',click);host.addEventListener('input',input);host.addEventListener('change',change);const current=context.currentRole();if(actor?.id!==current?.id){actor=current;if(library&&actor)selected=resolvePreset(library,actor.id,'meeting').id;}if(!library)void load();else render();}};
}
