import {SYNTHETIC_NOVEL} from './core/fruit/novelCards';
import type {FruitPreset,FruitProfile} from './core/fruit/types';
import {parseFruitOutput} from './core/fruit/output';
import {permittedNovelSections} from './core/novelDocument';
import {runNovelCards,novelSectionsHtml,mountAuthorCards} from './novelDisplay';
import {escHtml as esc} from './core/footprints';
import {plainUiLabel} from './uiIcons';

export function regexPreviewHtml(preset:FruitPreset,profile:FruitProfile,actor:{name:string}):string{
 return `<h2 id="fruit-dialog-title">果实作者卡片 · 本地预览</h2><p>当前角色：${esc(actor.name)} · ${esc(preset.name)} ${esc(preset.version)}</p><p class="terminal-caption">合成小说，不调用模型、不写小说历史。仅核对过的 #19 章节／#20 状态模板适配；其他规则、Prompt 裁剪、snow 和第三方脚本不执行。远程字体与图片不加载。真实回复需包含对应字段；预览不改变 Prompt 条目开关。</p><div data-regex-preview><div class="regex-preview-layout"><section><h3>原始结构文本</h3><textarea class="field regex-preview-source" data-regex-source aria-label="合成小说结构文本" maxlength="100000">${esc(SYNTHETIC_NOVEL)}</textarea><button type="button" class="fruit-button" data-regex-theme>切换日／夜预览</button><p data-regex-preview-state role="status">正在本地解析…</p></section><section><h3>最终安全展示</h3><div data-regex-render></div></section></div><details open><summary>规则开关与支持状态 · 随当前角色自动保存</summary><div class="regex-preview-rules">${preset.regex.map(r=>`<label><input type="checkbox" data-regex-enabled="${esc(r.id)}" ${(profile.regexOverrides?.[r.id]??r.enabled)?'checked':''}><span>${esc(plainUiLabel(r.name)||'未命名规则')}<small>原始：${r.enabled?'启用':'关闭'} · <span data-regex-result="${esc(r.id)}">等待模板核对</span></small></span></label>`).join('')||'<p>此预设没有正则，正文保持安全文字显示。</p>'}</div></details></div><button type="button" class="fruit-button" data-terminal-action="close-dialog">关闭</button>`;
}
export function mountRegexPreview(root:HTMLElement,preset:FruitPreset,profile:()=>FruitProfile):()=>void{
 let lifetime=new AbortController(),job=new AbortController(),frames:()=>void=()=>{},night=true,timer:ReturnType<typeof setTimeout>|undefined;
 async function draw(){
  job.abort();frames();job=new AbortController();const signal=job.signal,target=root.querySelector<HTMLElement>('[data-regex-render]'),state=root.querySelector<HTMLElement>('[data-regex-preview-state]'),input=root.querySelector<HTMLTextAreaElement>('[data-regex-source]');if(!target||!state||!input||lifetime.signal.aborted)return;
  try{const parsed=parseFruitOutput(input.value),sections=permittedNovelSections(parsed.sections,profile());target.classList.toggle('regex-preview-night',night);target.innerHTML=novelSectionsHtml(sections);if(!parsed.content)throw Error('正文标签缺失或结构不完整，请检查合成文本');
   state.textContent='正在核对模板与字段…';const result=await runNovelCards({rules:preset.regex,sections,overrides:profile().regexOverrides||{},depth:0,isEdit:false,names:{char:'旅人甲',user:'旅人乙'},night},signal);if(signal.aborted||!root.isConnected)return;
   frames=mountAuthorCards(target,result,signal,()=>root.isConnected&&!lifetime.signal.aborted,night);
   for(const row of root.querySelectorAll<HTMLElement>('[data-regex-result]')){const d=result.diagnostics.find(d=>d.ruleId===row.dataset.regexResult);row.textContent=d?`${d.status==='matched'?'已适配并匹配':d.status==='disabled'?'已关闭':d.status==='unmatched'?'未匹配':d.status==='failed'?'已回退':d.status==='skipped'?'不适用':'未支持'} · ${d.reason}`:'未处理：预算或隔离执行失败';}
   state.textContent=result.diagnostics.some(d=>d.status==='failed')?result.diagnostics.find(d=>d.status==='failed')!.reason:`已本地展示 ${result.cards.length} 张作者卡片 · 模型请求 0 次`;
  }catch(e){state.textContent=e instanceof Error?e.message:'本地预览失败，原始配置和小说未改变';}
 }
 const change=(event:Event)=>{if(event.target instanceof HTMLInputElement&&event.target.dataset.regexEnabled){clearTimeout(timer);timer=setTimeout(()=>void draw(),0);}};
 const input=()=>{clearTimeout(timer);timer=setTimeout(()=>void draw(),180);};
 const click=(event:Event)=>{if(event.target instanceof Element&&event.target.closest('[data-regex-theme]')){night=!night;void draw();}};
 root.addEventListener('change',change);root.querySelector('[data-regex-source]')?.addEventListener('input',input);root.addEventListener('click',click);void draw();
 return ()=>{clearTimeout(timer);lifetime.abort();job.abort();frames();root.removeEventListener('change',change);root.querySelector('[data-regex-source]')?.removeEventListener('input',input);root.removeEventListener('click',click);};
}
