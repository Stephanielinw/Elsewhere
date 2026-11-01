// @ts-check
// Fixed adapters for reviewed template hashes; imported regexes and scripts are never evaluated.
const channel=/** @type {{onmessage:((event:{data:import('./novelCards').NovelCardJob})=>void)|null;postMessage:(value:import('./novelCards').NovelCardResult)=>void}} */(/** @type {unknown} */(globalThis));
channel.onmessage=async({data:job})=>{
 /** @type {import('./novelCards').NovelCardResult} */
 const result={cards:[],diagnostics:[]},start=performance.now();
 /** @type {Record<string,{kind:string;hash:string;type:string}>} */
 const supported={
  '591b44bf-955e-4c2b-a862-345da140f623':{kind:'chapter',hash:'4af63a4ca7d732a187fe3baf545857aeaa5510b8fa66a6ddd7fe91c3d21aacdd',type:'novel_header'},
  'd3aab2ca-6dd1-4570-85ff-332781e7dff0':{kind:'status',hash:'8ed1062263ed83a178b8f433c2afa18495d21ace07043a587d544e89bca6dcc2',type:'status_bar'},
 };
 /** @param {string} s */
 const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
 /** @param {string} s */
 const field=s=>{if(s.length>4096)throw Error('字段超过 4096 字符');return esc(s.trim());};
 /** @param {string} raw */
 function chapter(raw){
  const keys=['CHAP','TITLE','CP','LOC','TAGS','PREFACE'],values=[];let cursor=0;
  if(!raw.trimStart().startsWith('[CHAP]'))return '';
  for(let i=0;i<keys.length;i++){const at=raw.indexOf('['+keys[i]+']',cursor);if(at<0)return '';const from=at+keys[i].length+2,to=i===keys.length-1?raw.length:raw.indexOf('['+keys[i+1]+']',from);if(to<0)return '';values.push(raw.slice(from,to).trim());cursor=to;}
  if(!values[0]||!values[1])return '';values.forEach(field);
  const [number,title,cp,place,tags,preface]=values,groups=cp.split(/[,，]/).filter(Boolean);
  const pairs=groups.map(g=>g.split(/\s*[×xX&]\s*/).map(n=>`<span class="novel-cp-name">${field(n)}</span>`).join('<span class="novel-cp-relation">×</span>'));
  const location=place?`<div class="novel-meta-card"><span class="novel-meta-label">AT</span><span>${field(place)}</span></div>`:'';
  const meta=groups.length>1?`<div class="novel-meta-multi-row"><div class="novel-cp-row"><span class="novel-cp-row-label">CP</span>${pairs.map(p=>`<div class="novel-cp-group">${p}</div>`).join('')}</div>${location}</div>`:`<div class="novel-meta-single-row">${cp?`<div class="novel-meta-card"><span class="novel-meta-label">CP</span><div class="novel-cp-inline">${pairs.join('')}</div></div>`:''}${location}</div>`;
  return `<div class="novel-header-container ${job.night?'night-mode':''}" id="novel-container"><button type="button" class="theme-toggle-btn" data-card-theme aria-label="切换日夜" title="切换日夜"><span class="toggle-icon">☀</span></button><span class="novel-chapter-num">${field(number)}</span><div class="novel-title">${field(title)}</div><div id="novel-meta-container">${meta}</div><div class="novel-tags-wrapper" id="novel-tags-container">${tags.split(/[\/，,]/).filter(Boolean).map(t=>`<span class="novel-tag">${field(t)}</span>`).join('')}</div>${preface?`<div class="novel-preface">${field(preface)}</div>`:''}</div>`;
 }
 /** @param {string} raw @param {string} template */
 function status(raw,template){
  /** @type {Record<string,string>} */const f={};
  /** @type {Record<string,string>} */
  const keys={日期:'date',时间:'time',天气:'weather',地点:'place',位置:'place',题记:'quote',之间:'between'};
  for(const rawLine of raw.replace(/\r/g,'').split('\n')){
   const line=rawLine.replace(/\*\*/g,'').replace(/^[\s\[【［(（「〔]+|[\]】］)）」〕\s]+$/g,'').trim();
   const old=line.match(/^(Info|Quote|Outfit)\s*[|｜]\s*([\s\S]*)$/i);
   if(old){const p=old[2].split(/\s*[|｜]\s*/);switch(old[1].toLowerCase()){case 'info':[f.date,f.time,f.weather,f.place]=p;break;case 'quote':f.quote=p.join('，');break;default:[f.outfitChar,f.outfitUser]=p;}continue;}
   const kv=line.match(/^([^：:|｜]{1,6}?)\s*[：:|｜]\s*([\s\S]*)$/);if(kv&&Object.hasOwn(keys,kv[1].trim()))f[keys[kv[1].trim()]]=kv[2].trim();
  }
  if(!Object.values(f).some(Boolean))return '';Object.values(f).forEach(v=>field(v||''));
  const grid=[['date','DATE'],['time','TIME'],['place','LOC.'],['weather','WTHR']].filter(([k])=>f[k]).map(([k,label])=>`<div class="fate-grid-item"><span class="fate-grid-label">${label}</span><span class="fate-grid-value" data-f="${k}">${field(f[k])}</span></div>`).join('');
  let first=true;const quote=[...(f.quote||'')].map((c,i)=>{if(c===' ')return '&nbsp;';if(first){first=false;return `<span class="movie-huge-text">${esc(c)}</span>`;}return `<span class="char-wrap ${['shift-down','shift-up','shift-none'][i%3]} ${['op-mid','op-light','op-dark'][i%3]}">${esc(c)}</span>`;}).join('');
  const bottom=f.between?`<div class="fate-between" data-f="between">${field(f.between)}</div>`:f.outfitChar||f.outfitUser?`<div class="fate-outfit-container"><div class="fate-outfit-char">${field(f.outfitChar||'')}</div><div class="fate-vertical-divider"></div><div class="fate-outfit-user">${field(f.outfitUser||'')}</div></div>`:'';
  const footer=template.match(/<div class="fate-bottom-en">([^<]{0,1024})<\/div>/)?.[1]||'';
  return `<div class="fate-status-wrapper ${job.night?'night-mode':''}"><button type="button" class="fate-theme-toggle" data-card-theme aria-label="切换日夜" title="切换日夜">☾</button>${grid?`<div class="fate-top-grid">${grid}</div>`:''}${quote?`<div class="fate-movie-quote-container processed" id="movie-quote-render"><div class="movie-line-content"><span class="movie-deco-eng">SCENE</span>${quote}</div></div>`:''}${bottom?`<div class="fate-bottom-section"><div class="fate-outfit-label">—— ${field(job.names.char)} × ${field(job.names.user)} ——</div>${bottom}</div>`:''}<div class="fate-bottom-en">${field(footer)}</div></div>`;
 }
 try{
  if(!Array.isArray(job.sections)||job.sections.length>256||job.sections.reduce((n,s)=>n+s.text.length,0)>100000||job.rules.length>200)throw Error('展示输入超过安全预算');
  for(const rule of job.rules){
   const at=performance.now();let state='unsupported',reason='尚未适配；原始规则和开关保留，不执行';
   const spec=Object.hasOwn(supported,rule.id)?supported[rule.id]:null;
   if((job.overrides[rule.id]??rule.enabled)===false){state='disabled';reason='角色开关已关闭';}
   else if(!rule.placement.includes(2)){state='skipped';reason='不适用于 AI 输出位置';}
   else if(!rule.markdownOnly){state='skipped';reason='Prompt 侧规则不在展示阶段执行';}
   else if((rule.minDepth!==null&&rule.minDepth>=0&&job.depth<rule.minDepth)||(rule.maxDepth!==null&&rule.maxDepth>=0&&job.depth>rule.maxDepth)){state='skipped';reason='不在原始深度范围';}
   else if(job.isEdit&&!rule.runOnEdit){state='skipped';reason='规则不在编辑时运行';}
   else if(spec){
    if(rule.pattern.length+rule.replacement.length>64000)throw Error('模板超过长度预算');
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([rule.pattern,rule.replacement]))),hash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
    if(hash!==spec.hash){reason='模板版本未核对，使用安全文字展示';}
    else if(rule.substituteRegex!==0||rule.trimStrings.length){reason='此模板的宏或 trim 覆盖尚未适配';}
    else{
     // Only the reviewed stylesheet bytes are eligible; no imported DOM, events, scripts or links.
     const css=[...rule.replacement.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m=>m[1]).join('\n').replace(/@import[^;]+;/g,'');
     state='unmatched';reason='没有完整可展示字段';
     for(let i=0;i<job.sections.length;i++)if(job.sections[i].type===spec.type){const html=spec.kind==='chapter'?chapter(job.sections[i].text):status(job.sections[i].text,rule.replacement);if(html){if(result.cards.length>=8||html.length+css.length>128000)throw Error('匹配数量或展示输出超过预算');result.cards.push({sectionIndex:i,kind:spec.kind==='chapter'?'chapter':'status',css,html});state='matched';reason='已用作者 CSS 和可信字段适配器展示；未执行原始脚本';}}
    }
   }
   const elapsedMs=performance.now()-at;if(elapsedMs>120||performance.now()-start>400)throw Error('展示处理超时');
   result.diagnostics.push({ruleId:rule.id,status:/** @type {import('./novelCards').NovelCardDiagnostic['status']} */(state),reason,elapsedMs});
  }
  if(result.cards.reduce((n,c)=>n+c.css.length+c.html.length,0)>256000)throw Error('总展示输出超过预算');
 }catch(e){result.cards=[];result.diagnostics.push({ruleId:'display',status:'failed',reason:e instanceof Error?e.message:'展示处理失败',elapsedMs:performance.now()-start});}
 channel.postMessage(result);
};
