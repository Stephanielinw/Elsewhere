import {uiIcon} from '../uiIcons';
import type {
  ChatMessage,
  DailyFootprintItem,
  DailyFootprintsArchive,
  EventRecord,
  FootprintArtifact,
  FootprintArtifactItem,
  FootprintArtifactType,
  FootprintPaperStyle,
  RoleData,
  UserProfileData,
} from './types';
import {
  collectDailyDiaryFacts,
  getLocalDayBounds,
  parseDateKeyParts,
  toLocalDateKey,
} from './diary';
import {collectRoleLife} from './roleLife';
import {compactRoleMemory} from './memory';
import { formatMessageContentForModel, getActiveEvents, getActiveMessages } from './revisions';

export type RoleWorldProfile =
  | 'modern_us'
  | 'classical_cn'
  | 'ancient_west'
  | 'modern_cn';

export function escHtml(s: unknown): string {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (m) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[m] || m
  );
}

export function stripHtmlTags(raw: unknown): string {
  return String(raw ?? '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

export function detectRoleWorldProfile(role: RoleData): RoleWorldProfile {
  const haystack = [
    role.name,
    role.job,
    role.place,
    role.traits,
    role.profile,
    role.canonNotes,
  ]
    .filter(Boolean)
    .join(' ');

  if (
    /古希腊|雅典|斯巴达|奥林匹斯|神庙|城邦|古罗马|中世纪|骑士|魔法学院|精灵|剑与魔法/i.test(
      haystack
    )
  ) {
    return 'ancient_west';
  }
  if (
    /美国|密歇根|纽约|伦敦|英国|警探|间谍|Nain|奈恩|John|约翰|Michigan|New York/i.test(
      haystack
    )
  ) {
    return 'modern_us';
  }
  if (/古籍修复|苏州|茶室|宣纸|线装|碑帖|沈叙|江南|古琴|水墨|古典/i.test(haystack)) {
    return 'classical_cn';
  }
  return 'modern_cn';
}

export function formatNaturalTimeLabel(ts: number, preferFuzzy = false): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const period =
    h < 6
      ? '深夜'
      : h < 9
        ? '晨间'
        : h < 12
          ? '上午'
          : h < 14
            ? '午间'
            : h < 18
              ? '午后'
              : h < 21
                ? '傍晚'
                : '夜间';
  if (preferFuzzy) {
    return period;
  }
  return `${period} ${String(h).padStart(2, '0')}:${m}`;
}

const VALID_ARTIFACT_TYPES: FootprintArtifactType[] = [
  'receipt',
  'ticket',
  'memo',
  'list',
  'letter',
  'dossier',
];

const VALID_PAPER_STYLES: FootprintPaperStyle[] = [
  'thermal',
  'ticket',
  'sticky',
  'parchment',
  'dossier',
  'craft',
];

/**
 * Validates and sanitizes a structured FootprintArtifact.
 * - Strips all raw HTML tags (`<script>`, `<img onerror>`, etc.).
 * - Blocks anachronistic modern receipts/tickets for ancient/classical-west worlds.
 * - Enforces world-appropriate currency symbols (`$` for `modern_us`, `¥` for `modern_cn`).
 */
export function validateAndSanitizeArtifact(
  raw: unknown,
  role: RoleData
): FootprintArtifact | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const world = detectRoleWorldProfile(role);
  const rawKind = stripHtmlTags(obj.kind).toLowerCase() as FootprintArtifactType;
  let kind: FootprintArtifactType = VALID_ARTIFACT_TYPES.includes(rawKind)
    ? rawKind
    : 'memo';

  const rawPaper = stripHtmlTags(obj.paperStyle).toLowerCase() as FootprintPaperStyle;
  let paperStyle: FootprintPaperStyle = VALID_PAPER_STYLES.includes(rawPaper)
    ? rawPaper
    : kind === 'receipt'
      ? 'thermal'
      : kind === 'ticket'
        ? 'ticket'
        : kind === 'dossier'
          ? 'dossier'
          : kind === 'list'
            ? 'craft'
            : world === 'classical_cn' || world === 'ancient_west'
              ? 'parchment'
              : 'sticky';

  const header = stripHtmlTags(obj.header).slice(0, 80);
  if (!header) return null;

  const subheader = stripHtmlTags(obj.subheader).slice(0, 100) || undefined;
  const serialNo = stripHtmlTags(obj.serialNo).slice(0, 40) || undefined;
  const timeLabel = stripHtmlTags(obj.timeLabel).slice(0, 40) || undefined;
  const bodyText = stripHtmlTags(obj.bodyText).slice(0, 400) || undefined;
  const footerNote = stripHtmlTags(obj.footerNote).slice(0, 140) || undefined;
  let totalLabel = stripHtmlTags(obj.totalLabel).slice(0, 30) || undefined;
  let totalAmount = stripHtmlTags(obj.totalAmount).slice(0, 30) || undefined;
  let currency = stripHtmlTags(obj.currency).slice(0, 8) || undefined;

  // Era/World Anachronism Guard
  if (world === 'ancient_west') {
    const combinedText = `${header} ${subheader || ''} ${bodyText || ''} ${totalAmount || ''}`;
    if (/电影票|超市|收银|POS|扫码|支付宝|微信|美元|\$|¥|RMB|USD|卡布奇诺|拿铁/i.test(combinedText)) {
      return null;
    }
    if (kind === 'receipt' || kind === 'ticket' || paperStyle === 'thermal') {
      kind = 'memo';
      paperStyle = 'parchment';
      totalLabel = undefined;
      totalAmount = undefined;
      currency = undefined;
    }
  }

  if (world === 'modern_us' && currency === '¥') {
    currency = '$';
  } else if (world === 'modern_cn' && currency === '$') {
    currency = '¥';
  }

  const rawItems = Array.isArray(obj.items) ? obj.items : [];
  const items: FootprintArtifactItem[] = rawItems
    .slice(0, 8)
    .map((it): FootprintArtifactItem | null => {
      if (!it || typeof it !== 'object') return null;
      const rec = it as Record<string, unknown>;
      const name = stripHtmlTags(rec.name).slice(0, 60);
      if (!name) return null;
      const item: FootprintArtifactItem = { name };
      const qty = stripHtmlTags(rec.qty).slice(0, 16);
      if (qty) item.qty = qty;
      const price = stripHtmlTags(rec.price).slice(0, 24);
      if (price && world !== 'ancient_west') item.price = price;
      if (typeof rec.checked === 'boolean') item.checked = rec.checked;
      const note = stripHtmlTags(rec.note).slice(0, 60);
      if (note) item.note = note;
      return item;
    })
    .filter((it): it is FootprintArtifactItem => it !== null);

  if (!items.length && !bodyText) {
    return null;
  }

  return {
    kind,
    paperStyle,
    header,
    subheader,
    serialNo,
    timeLabel,
    items: items.length ? items : undefined,
    totalLabel,
    totalAmount,
    currency,
    bodyText,
    footerNote,
    groundedInEventIds: Array.isArray(obj.groundedInEventIds)
      ? obj.groundedInEventIds.map((id) => stripHtmlTags(id)).filter(Boolean)
      : undefined,
  };
}

/**
 * Safely renders a validated FootprintArtifact into HTML without ever injecting raw HTML snippets.
 */
export function renderSafeFootprintArtifact(artifact: FootprintArtifact): string {
  const kindClass = `fp-artifact-${escHtml(artifact.kind)}`;
  const paperClass = `fp-paper-${escHtml(artifact.paperStyle)}`;

  const kindBadgeMap: Record<FootprintArtifactType, string> = {
    receipt: '单据存根',
    ticket: '票根留存',
    memo: '随手便签',
    list: '手写清单',
    letter: '短笺摘录',
    dossier: '案头记录',
  };
  const badgeText = kindBadgeMap[artifact.kind] || '生活物件';

  const itemsHtml =
    artifact.items && artifact.items.length
      ? `<div class="fp-artifact-items">
          ${artifact.items
            .map((it) => {
              const checkMark =
                typeof it.checked === 'boolean'
                  ? `<span class="fp-item-check">${uiIcon(it.checked?'checked':'square')}</span>`
                  : '';
              const qtyPart = it.qty
                ? `<span class="fp-item-qty">${escHtml(it.qty)}</span>`
                : '';
              const pricePart = it.price
                ? `<span class="fp-item-price">${escHtml(it.price)}</span>`
                : '';
              const notePart = it.note
                ? `<div class="fp-item-note">${escHtml(it.note)}</div>`
                : '';
              return `<div class="fp-artifact-row">
                <div class="fp-artifact-row-main">
                  <span class="fp-item-name">${checkMark}${escHtml(it.name)}</span>
                  <span class="fp-item-meta">${qtyPart}${pricePart}</span>
                </div>
                ${notePart}
              </div>`;
            })
            .join('')}
        </div>`
      : '';

  const bodyHtml = artifact.bodyText
    ? `<div class="fp-artifact-body">${escHtml(artifact.bodyText).replace(/\n/g, '<br>')}</div>`
    : '';

  const totalHtml =
    artifact.totalAmount || artifact.totalLabel
      ? `<div class="fp-artifact-total">
          <span>${escHtml(artifact.totalLabel || 'TOTAL')}</span>
          <strong>${escHtml(artifact.currency || '')}${escHtml(artifact.totalAmount || '')}</strong>
        </div>`
      : '';

  const footerHtml = artifact.footerNote
    ? `<div class="fp-artifact-footer">${escHtml(artifact.footerNote)}</div>`
    : '';

  return `<div class="fp-artifact-card ${kindClass} ${paperClass}" data-artifact-kind="${escHtml(artifact.kind)}" data-paper-style="${escHtml(artifact.paperStyle)}">
    <div class="fp-artifact-top">
      <div class="fp-artifact-heading">
        <span class="fp-artifact-badge">${escHtml(badgeText)}</span>
        <strong class="fp-artifact-title">${escHtml(artifact.header)}</strong>
      </div>
      ${artifact.serialNo ? `<span class="fp-artifact-serial">${escHtml(artifact.serialNo)}</span>` : ''}
    </div>
    ${artifact.subheader || artifact.timeLabel ? `<div class="fp-artifact-sub">${escHtml(artifact.subheader || '')}${artifact.subheader && artifact.timeLabel ? ' · ' : ''}${escHtml(artifact.timeLabel || '')}</div>` : ''}
    <div class="fp-artifact-divider"></div>
    ${itemsHtml}
    ${bodyHtml}
    ${totalHtml}
    ${footerHtml}
  </div>`;
}

export function normalizeInnerMonologue(role:RoleData,value:unknown,fallback:string):string {
  const thought=stripHtmlTags(value).replace(/\s+/g,' ').trim();
  const name=role.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const analysis=new RegExp(`^(?:${name}|他|她|它|该角色|角色)(?:其实|在意|内心|心里|心理|觉得|认为|试图|正在|把|会|是|的|并|不|也|更|很|似乎|显得)`);
  return thought.length>=5&&thought.length<=90&&/[我咱俺吾]/.test(thought)&&!analysis.test(thought)&&
    !/这(?:表明|说明)|内心深处|关联片段|心理分析/.test(thought)?thought:fallback;
}

/** Derived views never write events, thoughts or legacy AI caches. */
export function buildGroundedDailyFootprints(role:RoleData,dateKey:string,nowTs=Date.now()):DailyFootprintsArchive {
 const facts=collectDailyDiaryFacts(role,dateKey,true),cutoff=Math.min(nowTs,facts.endMs),userLabel=role.userAlias||'对方';
 const all=[...role.chats,...(role.scene?.messages||[]),...(role.meetings||[]).flatMap(s=>s.messages),...(role.play?.messages||[]),...(role.play?.intermissionMessages||[]),...(role.plays||[]).flatMap(p=>[...p.messages,...(p.intermissionMessages||[])])];
 const transcript=(messages:ChatMessage[])=>messages.filter(m=>m.at<=cutoff&&m.speaker!=='note').map(m=>{
  const original=m.quote?getActiveMessages(all).find(s=>s.id===m.quote!.id&&s.speaker===m.quote!.speaker&&s.at===m.quote!.at&&s.text.startsWith(m.quote!.text)):undefined;
  const safe=m.quote&&!original?{...m,quote:null}:m;
  return {speaker:m.speaker,speakerLabel:m.speaker==='me'?userLabel:role.name,text:formatMessageContentForModel(safe,role.name,userLabel),at:m.at};
 });
 const items:DailyFootprintItem[]=collectRoleLife(role,cutoff).events.filter(e=>e.at>=facts.startMs).map(e=>({id:'fp_life_'+e.id,dateKey,timestamp:e.at,timeLabel:formatNaturalTimeLabel(e.at),icon:'leaf',category:'life',title:e.title,summary:e.detail,where:e.where,sourceEventIds:[e.id],sourceMessageIds:e.messageId?[e.messageId]:[],rawTranscript:[{speaker:'note',speakerLabel:e.lifeRecord?'生活模拟记录':'已确认事件',text:e.detail,at:e.at}],origin:'grounded'}));
 // One hidden source index retains full quotation provenance; ordinary chat is not a life footprint.
 const chat=getActiveMessages(facts.chatMessages).filter(m=>m.at<=cutoff&&m.speaker!=='note');
 if(chat.length)items.push({id:'fp_chat_'+dateKey,dateKey,timestamp:chat.at(-1)!.at,timeLabel:formatNaturalTimeLabel(chat.at(-1)!.at),icon:'chat',category:'interaction',title:'手机交谈来源',summary:'',sourceEventIds:[],sourceMessageIds:chat.map(m=>m.id),rawTranscript:transcript(chat),origin:'grounded'});
 for(const f of compactRoleMemory(role,cutoff).facts.filter(f=>f.mutual&&f.at>=facts.startMs)){
  const sources=chat.filter(m=>m.id===f.source.id||m.id===f.contextSource?.id);
  items.push({id:'fp_relation_'+f.id,dateKey,timestamp:f.at,timeLabel:formatNaturalTimeLabel(f.at),icon:'heart',category:'interaction',title:'关系有了明确变化',summary:`与${userLabel}明确确认了「${f.value}」的关系。`,sourceMessageIds:sources.map(m=>m.id),sourceEventIds:[],rawTranscript:transcript(sources),origin:'grounded'});
 }
 for(const scene of facts.sceneBlocks){const messages=scene.messages.filter(m=>m.at<=cutoff);if(messages.length)items.push({id:'fp_scene_'+scene.id,dateKey,timestamp:messages.at(-1)!.at,timeLabel:formatNaturalTimeLabel(messages.at(-1)!.at),icon:'pin',category:'scene',title:'见面相处',summary:`${role.name}在「${scene.where}」与${userLabel}见面。`,where:scene.where,sourceMessageIds:messages.map(m=>m.id),sourceEventIds:[],rawTranscript:transcript(messages),origin:'grounded'});}
 if(facts.focusEvents.length){const events=facts.focusEvents.filter(e=>e.at<=cutoff);if(events.length)items.push({id:'fp_focus_'+dateKey,dateKey,timestamp:events.at(-1)!.at,timeLabel:formatNaturalTimeLabel(events.at(-1)!.at),icon:'focus',category:'focus',title:'专注片刻',summary:`${role.name}留出了一段专注的时间。`,sourceEventIds:events.map(e=>e.id),sourceMessageIds:[],rawTranscript:events.map(e=>({speaker:'note',speakerLabel:'专注记录',text:e.title+'：'+e.detail,at:e.at})),origin:'grounded'});}
 for(const play of facts.playBlocks){const messages=[...play.messages,...play.intermissionMessages].filter(m=>m.at<=cutoff).sort((a,b)=>a.at-b.at);if(messages.length)items.push({id:'fp_play_'+play.id,dateKey,timestamp:messages.at(-1)!.at,timeLabel:formatNaturalTimeLabel(messages.at(-1)!.at),icon:'drama',category:'drama',title:'一段排演',summary:`${role.name}参与了《${play.title}》的排演；戏内经历不属于现实人生。`,sourceMessageIds:messages.map(m=>m.id),sourceEventIds:[],rawTranscript:transcript(messages),origin:'grounded'});}
 return {dateKey,updatedAt:nowTs,sourceSignature:JSON.stringify(items.map(i=>[i.id,i.timestamp,i.summary,i.sourceEventIds,i.sourceMessageIds])),items,calmDayNote:items.some(i=>i.category!=='interaction')?undefined:'没有已归档的独立生活记录；这不代表已经确认整天无事发生。'};
}
export function getOrBuildDailyFootprints(role:RoleData,dateKey:string,nowTs=Date.now()):DailyFootprintsArchive {return buildGroundedDailyFootprints(role,dateKey,nowTs);}

/**
 * Lists all YYYY-MM-DD dates up to `nowTs` that have any footprints, messages, or events for the Footprint Calendar.
 */
export function listFootprintActiveDates(role: RoleData, nowTs = Date.now()): Set<string> {
  const dates = new Set<string>();
  dates.add(toLocalDateKey(nowTs));

  for (const m of getActiveMessages(role.chats || [])) {
    if (m.at <= nowTs) dates.add(toLocalDateKey(m.at));
  }
  for (const sc of [...(role.meetings || []), ...(role.scene ? [role.scene] : [])]) {
    if (!sc) continue;
    for (const m of getActiveMessages(sc.messages || [])) {
      if (m.at <= nowTs) dates.add(toLocalDateKey(m.at));
    }
  }
  for (const pl of [...(role.plays || []), ...(role.play ? [role.play] : [])]) {
    if (!pl) continue;
    for (const m of getActiveMessages(pl.messages || [])) {
      if (m.at <= nowTs) dates.add(toLocalDateKey(m.at));
    }
  }
  for (const ev of getActiveEvents(role.events || [])) {
    if (ev.at <= nowTs && ev.kind !== 'diary') {
      dates.add(toLocalDateKey(ev.at));
    }
  }
  if (role.footprintsByDate) {
    for (const k of Object.keys(role.footprintsByDate)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k)) dates.add(k);
    }
  }
  return dates;
}

export interface FootprintCalendarCell {
  dateKey: string;
  day: number;
  hasActivity: boolean;
  isSelected: boolean;
  isToday: boolean;
  isFuture: boolean;
}

export function buildFootprintCalendarMonth(
  role: RoleData,
  year: number,
  month: number, // 1-12
  selectedDateKey: string,
  nowTs = Date.now()
): {
  year: number;
  month: number;
  monthLabel: string;
  leadingEmptyDays: number;
  cells: FootprintCalendarCell[];
} {
  const activeDates = listFootprintActiveDates(role, nowTs);
  const todayKey = toLocalDateKey(nowTs);
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay(); // 0 (Sun) - 6 (Sat)
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells: FootprintCalendarCell[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({
      dateKey,
      day: d,
      hasActivity: activeDates.has(dateKey),
      isSelected: dateKey === selectedDateKey,
      isToday: dateKey === todayKey,
      isFuture: dateKey > todayKey,
    });
  }

  return {
    year,
    month,
    monthLabel: `${year}年 ${month}月`,
    leadingEmptyDays: firstDayOfWeek,
    cells,
  };
}

/** Legacy API retained for import tools; it no longer mutates live records or promotes cached prose. */
export function buildDailyFootprintsAiPrompt(_role:RoleData,_user:UserProfileData,_date:string,_now=Date.now()):{role:string;content:string}[]{throw Error('旧足迹润色已停用，请使用独立生活推进');}
export function applyAiDailyFootprints(role:RoleData,dateKey:string,_raw:string,nowTs=Date.now()):{ok:boolean;archive:DailyFootprintsArchive;reason?:string}{return {ok:false,archive:buildGroundedDailyFootprints(role,dateKey,nowTs),reason:'旧润色缓存只保留原件，不作为新的生活事实'};}

export function resolveSafeMonitorDateKey(
  candidate: string | undefined,
  nowTs = Date.now()
): string {
  const todayKey = toLocalDateKey(nowTs);
  if (!candidate || !parseDateKeyParts(candidate)) return todayKey;
  return candidate > todayKey ? todayKey : candidate;
}
