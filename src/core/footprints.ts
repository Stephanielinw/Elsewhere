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
                  ? `<span class="fp-item-check">${it.checked ? '☑' : '☐'}</span>`
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

function buildGroundedArtifactForChat(
  role: RoleData,
  messages: ChatMessage[],
  clusterTimeLabel: string
): FootprintArtifact | null {
  const world = detectRoleWorldProfile(role);
  const combined = messages.map((m) => m.text).join('\n');

  if (world === 'ancient_west') {
    if (messages.length >= 2) {
      return validateAndSanitizeArtifact(
        {
          kind: 'memo',
          paperStyle: 'parchment',
          header: `${role.name}的羊皮纸记事`,
          subheader: role.place || '城邦记事',
          timeLabel: clusterTimeLabel,
          bodyText: `记录今日与你交谈的要事：${messages[messages.length - 1].text.slice(0, 56)}`,
          footerNote: '火漆封存 · 私人备忘',
        },
        role
      );
    }
    return null;
  }

  // Check for specific grounded topics in the actual chat messages
  if (/骰子|写信|寄到哪里|红棕色夹克|卡布奇诺|妈咪/.test(combined) && world === 'modern_us') {
    return validateAndSanitizeArtifact(
      {
        kind: 'dossier',
        paperStyle: 'dossier',
        header: 'FIELD NOTE · 随身夹页便签',
        subheader: 'Michigan · 个人口袋备忘',
        serialNo: 'MEMO-D6',
        timeLabel: clusterTimeLabel,
        items: [
          { name: '红色亚克力六面骰（1枚）', checked: true, note: '已收进夹克内袋' },
          { name: '待确认回信投递地址', checked: false, note: '对方仍未透露寄信去向' },
        ],
        footerNote: '字迹冷静克制，页角画了一枚小小的六面骰轮廓。',
      },
      role
    );
  }

  if (/咖啡|卡布奇诺|美式|拿铁|浓缩|茶室|茶馆|热茶|三明治|午饭|晚餐|甜点/.test(combined)) {
    if (world === 'modern_us') {
      return validateAndSanitizeArtifact(
        {
          kind: 'receipt',
          paperStyle: 'thermal',
          header: 'LAKEVIEW DINER & COFFEE',
          subheader: 'Michigan · Counter Service',
          serialNo: '#CHK-204',
          timeLabel: clusterTimeLabel,
          items: [
            { name: 'Hot Cappuccino (Regular)', qty: 'x1', price: '$4.75' },
            { name: 'Rye Toast & Drip Refill', qty: 'x1', price: '$3.50' },
          ],
          totalLabel: 'PAID (CASH)',
          currency: '$',
          totalAmount: '8.25',
          footerNote: '背面用钢笔写着：留作今日联络时的桌面书签。',
        },
        role
      );
    }
    if (world === 'classical_cn') {
      return validateAndSanitizeArtifact(
        {
          kind: 'memo',
          paperStyle: 'parchment',
          header: '茶寮雅座 · 竹笺小记',
          subheader: role.place || '旧城茶室',
          timeLabel: clusterTimeLabel,
          items: [
            { name: '春毫清茶一盏', qty: '壹份', note: '临窗木案' },
            { name: '苏式茶点一碟', qty: '壹份' },
          ],
          footerNote: '茶水微温时与你闲谈片刻，纸角沾着淡淡墨香。',
        },
        role
      );
    }
    return validateAndSanitizeArtifact(
      {
        kind: 'receipt',
        paperStyle: 'thermal',
        header: `${role.place || '街角'} · 咖啡小票`,
        subheader: '堂食单据',
        serialNo: '#NO-108',
        timeLabel: clusterTimeLabel,
        items: [{ name: '手冲热饮 / 简餐', qty: 'x1', price: '¥28.00' }],
        totalLabel: '合计',
        currency: '¥',
        totalAmount: '28.00',
        footerNote: '聊天的间隙顺手折好夹进了随身本子里。',
      },
      role
    );
  }

  if (/电影|盗梦空间|影院|放映|剧场|演出|票/.test(combined)) {
    return validateAndSanitizeArtifact(
      {
        kind: 'ticket',
        paperStyle: 'ticket',
        header: world === 'modern_us' ? 'STATE THEATRE · 晚场影票存根' : '艺术影院 · 放映票根',
        subheader: /盗梦空间/.test(combined) ? 'INCEPTION (35mm Re-run)' : '今日场次留存',
        serialNo: 'ROW G · SEAT 11',
        timeLabel: clusterTimeLabel,
        items: [
          {
            name: /盗梦空间/.test(combined) ? '《盗梦空间》重映场' : '电影放映场次',
            qty: 'ADMIT ONE',
            price: world === 'modern_us' ? '$11.50' : '¥45.00',
          },
        ],
        footerNote: '副券沿齿孔整齐撕下，票面保存得很平整。',
      },
      role
    );
  }

  if (/古籍|修复|书页|浆糊|宣纸|线装|装帧/.test(combined) || world === 'classical_cn') {
    return validateAndSanitizeArtifact(
      {
        kind: 'list',
        paperStyle: 'parchment',
        header: `${role.name}的案头修书笺`,
        subheader: `${role.place || '修复室'} · 手写工序单`,
        timeLabel: clusterTimeLabel,
        items: [
          { name: '配纸染旧 · 比对纸纤维纹理', checked: true },
          { name: '清理书叶折角与旧絮', checked: true },
          { name: '记下刚才与你聊起的事', checked: true },
        ],
        footerNote: '手工毛边纸裁成的窄笺，小楷字迹疏朗干净。',
      },
      role
    );
  }

  return null;
}

function buildGroundedArtifactForScene(
  role: RoleData,
  where: string,
  messages: ChatMessage[],
  timeLabel: string
): FootprintArtifact | null {
  const world = detectRoleWorldProfile(role);
  if (world === 'ancient_west') {
    return validateAndSanitizeArtifact(
      {
        kind: 'memo',
        paperStyle: 'parchment',
        header: `同行记事 · ${where}`,
        subheader: role.name,
        timeLabel,
        bodyText: `于「${where}」与你当面相见，共话 ${messages.length} 句。`,
        footerNote: '亲笔留存',
      },
      role
    );
  }

  if (world === 'modern_us') {
    return validateAndSanitizeArtifact(
      {
        kind: 'receipt',
        paperStyle: 'thermal',
        header: `${where.toUpperCase()} · TABLE STUB`,
        subheader: 'Michigan · In-Person Meet',
        serialNo: `#MT-${100 + (messages.length % 89)}`,
        timeLabel,
        items: [
          { name: 'Cappuccino & Table Service', qty: 'x2', price: '$9.50' },
        ],
        totalLabel: 'TOTAL',
        currency: '$',
        totalAmount: '9.50',
        footerNote: `在「${where}」与你见面后留下的桌面单据。`,
      },
      role
    );
  }

  if (world === 'classical_cn') {
    return validateAndSanitizeArtifact(
      {
        kind: 'ticket',
        paperStyle: 'parchment',
        header: `${where} · 雅集木牌与茶筹`,
        subheader: '当面相叙留念',
        serialNo: '竹筹·叁号',
        timeLabel,
        items: [{ name: `于「${where}」同坐叙谈`, qty: `共 ${messages.length} 段` }],
        footerNote: '木色温润，散席时特意收起这一纸茶笺。',
      },
      role
    );
  }

  return validateAndSanitizeArtifact(
    {
      kind: 'ticket',
      paperStyle: 'ticket',
      header: `${where} · 见面凭证存根`,
      subheader: `与 ${role.name} 同行`,
      serialNo: `#SC-${200 + (messages.length % 79)}`,
      timeLabel,
      items: [{ name: `「${where}」双人同行`, qty: 'x2', price: '¥56.00' }],
      totalLabel: '实付',
      currency: '¥',
      totalAmount: '56.00',
      footerNote: '见面结束时顺手塞进口袋的纪念票据。',
    },
    role
  );
}

function deriveCharacterInnerThought(
  role: RoleData,
  category: DailyFootprintItem['category'],
  contextText: string
): { mood: string; thought: string; surfaceState: string } {
  const world = detectRoleWorldProfile(role);

  if (category === 'interaction') {
    if (/奈恩|Nain/i.test(role.name)) {
      return {
        surfaceState: `看着手机屏幕，指尖缓慢转动着口袋里的那枚红色六面骰`,
        mood: '冷静敏锐，带着一点习惯性的轻快揶揄与试探',
        thought: `${/约翰|John/i.test(contextText)?'约翰的事，我得再想想。先别急着把话都说透。':`${role.userAlias||'对面'}这话……我记住了。先别急着亮底牌。`}`,
      };
    }
    if (world === 'classical_cn') {
      return {
        surfaceState: '搁下镇纸与毛笔，垂眸翻看手机里的消息',
        mood: '温润平和，心思细腻',
        thought: `这话我且记下。案头这一页，还得再斟酌一遍。`,
      };
    }
    return {
      surfaceState: `在${role.place || '手边'}停下正在做的事，认真读完你的消息`,
      mood: '专注、自然、有所回应',
      thought: `我看到了……先把手头的事放一放。回些什么呢。`,
    };
  }

  if (category === 'scene') {
    return {
      surfaceState: '面对面交谈时目光专注，留意着你的神情与语气变化',
      mood: '投入而克制',
      thought: `我是不是说得太快了……先听听，别急着接话。`,
    };
  }

  if (category === 'focus') {
    return {
      surfaceState: '保持安静的工作步调，偶尔抬头确认你的专注进度',
      mood: '沉静、默契',
      thought: `我先把这点做完。这样安静待着，也挺好。`,
    };
  }

  if (category === 'drama') {
    return {
      surfaceState: '在戏中角色与自身性格之间游刃有余地切换',
      mood: '兴致盎然，带着一点清醒的观察欲',
      thought: `刚才那句，我还想换个演法。嗯，先听听怎么说。`,
    };
  }

  if (category === 'diary_share') {
    return {
      surfaceState: '反复读完了你主动分享过来的私人日记',
      mood: '珍视、若有所思',
      thought: `这一页是交给我的。我记着，不往没说的地方猜。`,
    };
  }

  return {
    surfaceState: `在${role.place || '日常住处'}按自己的节奏处理手头事务`,
    mood: '平稳、独立',
    thought: `我手头这点事还没完……先理清楚，再说别的。`,
  };
}


export function normalizeInnerMonologue(role:RoleData,value:unknown,fallback:string):string {
  const thought=stripHtmlTags(value).replace(/\s+/g,' ').trim();
  const name=role.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const analysis=new RegExp(`^(?:${name}|他|她|它|该角色|角色)(?:其实|在意|内心|心里|心理|觉得|认为|试图|正在|把|会|是|的|并|不|也|更|很|似乎|显得)`);
  return thought.length>=5&&thought.length<=90&&/[我咱俺吾]/.test(thought)&&!analysis.test(thought)&&
    !/这(?:表明|说明)|内心深处|关联片段|心理分析/.test(thought)?thought:fallback;
}

function groupChatMessagesIntoSessions(
  messages: ChatMessage[],
  maxGapMs = 45 * 60 * 1000
): ChatMessage[][] {
  const sorted = [...messages].sort((a, b) => a.at - b.at);
  const clusters: ChatMessage[][] = [];
  for (const msg of sorted) {
    const current = clusters[clusters.length - 1];
    if (!current || msg.at - current[current.length - 1].at > maxGapMs) {
      clusters.push([msg]);
    } else {
      current.push(msg);
    }
  }
  return clusters;
}

/**
 * Builds the grounded, third-person daily footprints archive for a role on `dateKey`.
 * Strictly enforces:
 * - Reads the exact same underlying history (`collectDailyDiaryFacts`) as the Daily AI Diary.
 * - Filters out any future events (`at > nowTs`).
 * - Consolidates chat sessions so Monitor never spams `"奈恩说过……"` / `"你说过……"` per line.
 * - Deduplicates routine life projections and allows calm days (`允许一天十分平静`).
 * - Attaches occasional, validated, paper-styled `FootprintArtifact`s (max 2 per day).
 */
export function buildGroundedDailyFootprints(
  role: RoleData,
  dateKey: string,
  nowTs = Date.now()
): DailyFootprintsArchive {
  const facts = collectDailyDiaryFacts(role, dateKey);
  const userLabel = role.userAlias || '你';

  // Filter strictly to <= nowTs so future events on the current day never leak early
  const chatMsgs = facts.chatMessages.filter((m) => m.at <= nowTs);
  const focusEvents = facts.focusEvents.filter((e) => e.at <= nowTs);
  const sharedDiaries = facts.sharedUserDiaries.filter((d) => {
    const shareTs = d.sharedAt?.[role.id] ?? d.at;
    return shareTs <= nowTs;
  });
  const lifeRoutines = facts.lifeRoutines.filter((e) => e.at <= nowTs);

  const items: DailyFootprintItem[] = [];
  let artifactCount = 0;
  const maxArtifactsPerDay = 2;

  // 1. Consolidated Chat Sessions
  const chatClusters = groupChatMessagesIntoSessions(chatMsgs);
  chatClusters.forEach((cluster, idx) => {
    const firstAt = cluster[0].at;
    const lastAt = cluster[cluster.length - 1].at;
    const spanMinutes = Math.max(1, Math.round((lastAt - firstAt) / 60000));
    const userMsgCount = cluster.filter((m) => m.speaker === 'me').length;
    const charMsgCount = cluster.filter((m) => m.speaker === 'char').length;
    const timeLabel = formatNaturalTimeLabel(firstAt, false);

    const previewSamples = cluster
      .slice(-2)
      .map((m) => {
        const clean = formatMessageContentForModel(m, role.name, userLabel).replace(/\s+/g, ' ').trim();
        return clean.length > 48 ? `${clean.slice(0, 48)}…` : clean;
      })
      .join(' / ');

    const isTwoWay = userMsgCount > 0 && charMsgCount > 0;
    const title = isTwoWay
      ? `与${userLabel}线上联络 · 共 ${cluster.length} 条消息`
      : charMsgCount > 0
        ? `${role.name}发来线上消息（${cluster.length} 条）`
        : `${userLabel}发来线上消息（${cluster.length} 条）`;

    const summary = isTwoWay
      ? `${role.name}在${role.place || '手边'}与${userLabel}进行了线上交谈（往来 ${cluster.length} 条消息），谈及：「${previewSamples}」`
      : `${role.name}在手机上留下了给${userLabel}的讯息：「${previewSamples}」`;

    let artifact: FootprintArtifact | null = null;
    if (artifactCount < maxArtifactsPerDay) {
      artifact = buildGroundedArtifactForChat(role, cluster, timeLabel);
      if (artifact) artifactCount += 1;
    }

    items.push({
      id: `fp_chat_${dateKey}_${idx}_${cluster[0].id}`,
      dateKey,
      timestamp: lastAt,
      timeLabel,
      durationLabel: cluster.length > 1 ? `持续约 ${spanMinutes} 分钟` : undefined,
      icon: '💬',
      category: 'interaction',
      title,
      summary,
      where: role.place || '线上联络',
      innerThought: deriveCharacterInnerThought(
        role,
        'interaction',
        cluster.map((m) => m.text).join(' ')
      ),
      artifact,
      sourceEventIds: [],
      sourceMessageIds: cluster.map((m) => m.id),
      rawTranscript: cluster.map((m) => ({
        speaker: m.speaker,
        speakerLabel: m.speaker === 'me' ? userLabel : m.speaker === 'char' ? role.name : '旁白',
        text: formatMessageContentForModel(m, role.name, userLabel),
        at: m.at,
      })),
      origin: 'grounded',
    });
  });

  // 2. Face-to-Face Scenes
  for (const sc of facts.sceneBlocks) {
    const msgs = sc.messages.filter((m) => m.at <= nowTs);
    if (!msgs.length) continue;
    const firstAt = msgs[0].at;
    const lastAt = msgs[msgs.length - 1].at;
    const timeLabel = formatNaturalTimeLabel(firstAt, false);
    const sample = formatMessageContentForModel(msgs[msgs.length - 1], role.name, userLabel)
      .replace(/\s+/g, ' ')
      .slice(0, 64);

    let artifact: FootprintArtifact | null = null;
    if (artifactCount < maxArtifactsPerDay) {
      artifact = buildGroundedArtifactForScene(role, sc.where, msgs, timeLabel);
      if (artifact) artifactCount += 1;
    }

    items.push({
      id: `fp_scene_${sc.id}`,
      dateKey,
      timestamp: lastAt,
      timeLabel,
      icon: '📍',
      category: 'scene',
      title: `于「${sc.where}」与${userLabel}当面相处`,
      summary: `${role.name}与${userLabel}在「${sc.where}」见面，共留下 ${msgs.length} 段现场互动：「${sample}」`,
      where: sc.where,
      innerThought: deriveCharacterInnerThought(role, 'scene', sample),
      artifact,
      sourceEventIds: [],
      sourceMessageIds: msgs.map((m) => m.id),
      rawTranscript: msgs.map((m) => ({
        speaker: m.speaker,
        speakerLabel: m.speaker === 'me' ? userLabel : m.speaker === 'char' ? role.name : '现场描写',
        text: formatMessageContentForModel(m, role.name, userLabel),
        at: m.at,
      })),
      origin: 'grounded',
    });
  }

  // 3. Companion Focus Sessions
  if (focusEvents.length > 0) {
    const firstFocus = focusEvents[0];
    const lastFocus = focusEvents[focusEvents.length - 1];
    const timeLabel = formatNaturalTimeLabel(lastFocus.at, false);

    let artifact: FootprintArtifact | null = null;
    if (artifactCount < maxArtifactsPerDay) {
      artifact = validateAndSanitizeArtifact(
        {
          kind: 'list',
          paperStyle: detectRoleWorldProfile(role) === 'classical_cn' ? 'parchment' : 'craft',
          header: `${role.name}的案头陪伴便签`,
          subheader: `与${userLabel}共同专注记录`,
          timeLabel,
          items: focusEvents.slice(0, 4).map((ev) => ({
            name: ev.title,
            checked: true,
            note: ev.detail.slice(0, 42),
          })),
          footerNote: '安静陪伴期间顺手勾选的桌面清单。',
        },
        role
      );
      if (artifact) artifactCount += 1;
    }

    items.push({
      id: `fp_focus_${dateKey}_${firstFocus.id}`,
      dateKey,
      timestamp: lastFocus.at,
      timeLabel,
      icon: '⏱️',
      category: 'focus',
      title: `与${userLabel}共同专注 · ${focusEvents.length} 项记录`,
      summary: focusEvents.map((e) => `${e.title}（${e.detail}）`).join('；'),
      where: role.place || '案头',
      innerThought: deriveCharacterInnerThought(role, 'focus', lastFocus.detail),
      artifact,
      sourceEventIds: focusEvents.map((e) => e.id),
      sourceMessageIds: [],
      rawTranscript: focusEvents.map((e) => ({
        speaker: 'note',
        speakerLabel: '专注记录',
        text: `${e.title}：${e.detail}`,
        at: e.at,
      })),
      origin: 'grounded',
    });
  }

  // 4. Drama / Plays
  for (const pl of facts.playBlocks) {
    const msgs = pl.messages.filter((m) => m.at <= nowTs);
    const interMsgs = pl.intermissionMessages.filter((m) => m.at <= nowTs);
    if (!msgs.length && !interMsgs.length) continue;
    const allPlMsgs = [...msgs, ...interMsgs].sort((a, b) => a.at - b.at);
    const lastAt = allPlMsgs[allPlMsgs.length - 1].at;
    const timeLabel = formatNaturalTimeLabel(lastAt, false);

    items.push({
      id: `fp_play_${pl.id}`,
      dateKey,
      timestamp: lastAt,
      timeLabel,
      icon: '🎭',
      category: 'drama',
      title: `小剧场共创《${pl.title}》`,
      summary: `${role.name}（饰演「${pl.charRole}」）与${userLabel}（饰演「${pl.userRole}」）进行了 ${msgs.length} 幕演出${interMsgs.length ? `，并在幕间进行了 ${interMsgs.length} 条后台交流` : ''}。`,
      where: pl.world || '剧场舞台',
      innerThought: deriveCharacterInnerThought(role, 'drama', pl.title),
      artifact: null,
      sourceEventIds: [],
      sourceMessageIds: allPlMsgs.map((m) => m.id),
      rawTranscript: allPlMsgs.map((m) => ({
        speaker: m.speaker,
        speakerLabel: m.speaker === 'me' ? userLabel : m.speaker === 'char' ? role.name : '舞台提示',
        text: formatMessageContentForModel(m, role.name, userLabel),
        at: m.at,
      })),
      origin: 'grounded',
    });
  }

  // 5. Explicitly Shared User Diaries
  for (const d of sharedDiaries) {
    const shareTs = d.sharedAt?.[role.id] ?? d.at;
    const timeLabel = formatNaturalTimeLabel(shareTs, false);
    const snippet = d.text.replace(/\s+/g, ' ').slice(0, 68);
    items.push({
      id: `fp_shared_diary_${d.id}`,
      dateKey,
      timestamp: shareTs,
      timeLabel,
      icon: '📖',
      category: 'diary_share',
      title: `读完了${userLabel}分享的私人日记`,
      summary: `${userLabel}主动向${role.name}分享了一篇日记：「${snippet}${d.text.length > 68 ? '…' : ''}」`,
      where: role.place || '随身阅读',
      innerThought: deriveCharacterInnerThought(role, 'diary_share', d.text),
      artifact: null,
      sourceEventIds: [],
      sourceMessageIds: [],
      rawTranscript: [
        {
          speaker: 'me',
          speakerLabel: `${userLabel}分享的日记原文`,
          text: d.text,
          at: shareTs,
        },
      ],
      origin: 'grounded',
    });
  }

  // 6. Deduplicated Autonomous Daily Life Moments (at most 2 distinct items so we never spam hourly routine logs!)
  const seenRoutineTitles = new Set<string>();
  const uniqueLifeRoutines: EventRecord[] = [];
  for (const ev of lifeRoutines) {
    const key = `${ev.title}|${ev.where || ''}`;
    if (seenRoutineTitles.has(key)) continue;
    seenRoutineTitles.add(key);
    uniqueLifeRoutines.push(ev);
  }

  for (const ev of uniqueLifeRoutines.slice(-2)) {
    const timeLabel = formatNaturalTimeLabel(ev.at, true);
    items.push({
      id: `fp_life_${ev.id}`,
      dateKey,
      timestamp: ev.at,
      timeLabel,
      icon: '🌿',
      category: 'life',
      title: `${ev.title}${ev.where ? ` · ${ev.where}` : ''}`,
      summary: ev.detail,
      where: ev.where || role.place,
      innerThought: deriveCharacterInnerThought(role, 'life', ev.detail),
      artifact: null,
      sourceEventIds: [ev.id],
      sourceMessageIds: [],
      origin: 'grounded',
    });
  }

  items.sort((a, b) => a.timestamp - b.timestamp);

  const calmDayNote =
    items.length === 0
      ? `这一天十分平静，没有喧嚣的插曲，${role.name}在${role.place || '自己的步调里'}安静度过。`
      : items.length === 1 && items[0].category === 'life'
        ? `今天大部分时间都很安静，${role.name}按平日的步调过完了一天。`
        : undefined;

  const sourceSignature = [
    dateKey,
    `m:${chatMsgs.length}`,
    `s:${facts.sceneBlocks.length}`,
    `f:${focusEvents.length}`,
    `p:${facts.playBlocks.length}`,
    `d:${sharedDiaries.length}`,
    `l:${uniqueLifeRoutines.length}`,
  ].join('|');

  return {
    dateKey,
    updatedAt: nowTs,
    sourceSignature,
    calmDayNote,
    items,
  };
}

/**
 * Returns the daily footprints for `role` on `dateKey`, preserving any AI-enriched items
 * if the underlying event/chat signature has not changed, or rebuilding grounded footprints when new events occur.
 */
export function getOrBuildDailyFootprints(
  role: RoleData,
  dateKey: string,
  nowTs = Date.now()
): DailyFootprintsArchive {
  if (!role.footprintsByDate || typeof role.footprintsByDate !== 'object') {
    role.footprintsByDate = {};
  }
  const fresh = buildGroundedDailyFootprints(role, dateKey, nowTs);
  const existing = role.footprintsByDate[dateKey];
  if (
    existing &&
    existing.aiGeneratedAt &&
    existing.sourceSignature === fresh.sourceSignature &&
    Array.isArray(existing.items) &&
    existing.items.length > 0
  ) {
    // Filter by timestamp <= nowTs even for cached AI items
    return {
      ...existing,
      items: existing.items.filter((it) => it.timestamp <= nowTs).map(it=>{
        const fallback=deriveCharacterInnerThought(role,it.category,it.summary);
        return {...it,innerThought:it.innerThought?{...it.innerThought,thought:normalizeInnerMonologue(role,it.innerThought.thought,fallback.thought)}:fallback};
      }),
    };
  }
  role.footprintsByDate[dateKey] = fresh;
  return fresh;
}

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

/**
 * Builds a strict prompt for optional AI enrichment of a day's footprints.
 * Never fabricates unconfirmed purchases or contradicts real history; outputs structured JSON only (no raw HTML).
 */
export function buildDailyFootprintsAiPrompt(
  role: RoleData,
  user: UserProfileData,
  dateKey: string,
  nowTs = Date.now()
): { role: string; content: string }[] {
  const grounded = buildGroundedDailyFootprints(role, dateKey, nowTs);
  const { label } = getLocalDayBounds(dateKey);
  const world = detectRoleWorldProfile(role);
  const userLabel = role.userAlias || user.name || '你';

  const worldConstraint =
    world === 'modern_us'
      ? '角色身处美国密歇根/现代英语环境，涉及票据货币统一使用美元 `$`，店名/小票可带自然英文，但严禁生造与已发生事件矛盾的消费。'
      : world === 'classical_cn'
        ? '角色身处古典江南/古籍修复环境，票据物件应为宣纸修书笺、茶室竹笺、书目清单（paperStyle: "parchment"），严禁出现现代超市热敏条码。'
        : world === 'ancient_west'
          ? '角色身处古典西方/古代世界，严禁出现任何现代电影票、美元/人民币、热敏小票，物件仅限羊皮纸便签或手写清单（paperStyle: "parchment"）。'
          : '物件风格需严格契合角色所处城市与职业日常。';

  const groundedLines = grounded.items.map(
    (it, i) =>
      `${i + 1}. [${it.timeLabel}] (${it.category}) ${it.title} —— ${it.summary}`
  );

  return [
    {
      role: 'system',
      content: `你是 Elsewhere 的「日常足迹与生活侧写」记录器。
请根据角色设定与 ${label}（${dateKey}）已发生的真实事件，整理该角色这一天的「日常足迹」JSON。

【核心规则】
1. 必须以已发生的真实互动和事件为骨架，允许一天十分平静（1～4 条记录即可），绝不凑数或按小时机械报时。
2. 严禁输出任何 HTML 代码（不要输出 html_snippet）；所有视觉物件必须使用结构化字段 \`artifact\`，由前端安全组件渲染。
3. 视觉物件（artifact）只能偶发出现（全天最多 1～2 个），且必须源于当天真实事件或角色常驻习惯。${worldConstraint}
4. summary 保持客观第三人称；innerThought.surfaceState 为外在动作，mood 为情绪词。
5. innerThought.thought 必须是角色本人第一人称的即时心声，用“我”等自称，15–60字，一两句短促、自然、可带停顿的脑内自言自语。遵循人设与口吻，奈恩保持冷静、机敏、轻微揶揄。禁止“他其实在意的是”“角色内心”等分析报告腔，不要解释人物，不要附关联片段或复述溯源。这是人设推演，不得把推测写入正式事实。`,
    },
    {
      role: 'user',
      content: `【角色档案】
姓名：${role.name}
职业/身份：${role.job}
常驻地点：${role.place}
性格特点：${role.traits}
详细设定：${role.profile}
${role.canonNotes ? `Canon 边界：${role.canonNotes}` : ''}
对用户的称呼：${userLabel}

【${dateKey} 当天已确认的真实足迹骨架】
${groundedLines.length ? groundedLines.join('\n') : `（当天暂无特殊互动，${grounded.calmDayNote || '十分平静'}）`}

请输出纯 JSON 对象（不要用 Markdown 代码块包裹多余解释），格式如下：
{
  "calmDayNote": "可选，若当天平静可写一句自然总结",
  "enrichmentByIndex": [
    {
      "index": 0,
      "title": "润色后的简短标题（保留真实事件核心）",
      "summary": "第三人称生活化叙述，自然克制，符合人设",
      "innerThought": {
        "surfaceState": "此时此刻的外在动作或神态细节",
        "mood": "当前情绪关键词",
        "thought": "第一人称即时心声，含自称，15–60字，短促自然，不写第三人称分析"
      },
      "artifact": {
        "kind": "receipt | ticket | memo | list | letter | dossier",
        "paperStyle": "thermal | ticket | sticky | parchment | dossier | craft",
        "header": "物件主标题",
        "subheader": "副标题/地点",
        "serialNo": "编号",
        "items": [{ "name": "条目名", "qty": "x1", "price": "$4.50", "checked": true }],
        "totalLabel": "TOTAL",
        "currency": "$",
        "totalAmount": "4.50",
        "bodyText": "如果是便签/短笺可填写正文",
        "footerNote": "页脚小字细节"
      }
    }
  ]
}`,
    },
  ];
}

export function applyAiDailyFootprints(
  role: RoleData,
  dateKey: string,
  rawResponse: string,
  nowTs = Date.now()
): { ok: boolean; archive: DailyFootprintsArchive; reason?: string } {
  const base = buildGroundedDailyFootprints(role, dateKey, nowTs);
  const text = String(rawResponse || '').trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { ok: false, archive: base, reason: '模型返回格式不含有效 JSON' };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    if (typeof parsed.calmDayNote === 'string' && parsed.calmDayNote.trim()) {
      base.calmDayNote = stripHtmlTags(parsed.calmDayNote).slice(0, 140);
    }

    const enrichments = Array.isArray(parsed.enrichmentByIndex)
      ? parsed.enrichmentByIndex
      : [];
    let artifactCount = 0;

    for (const entry of enrichments) {
      if (!entry || typeof entry !== 'object') continue;
      const rec = entry as Record<string, unknown>;
      const idx = Number(rec.index);
      if (!Number.isInteger(idx) || idx < 0 || idx >= base.items.length) continue;

      const target = base.items[idx];
      const newTitle = stripHtmlTags(rec.title).slice(0, 80);
      const newSummary = stripHtmlTags(rec.summary).slice(0, 320);
      if (newTitle) target.title = newTitle;
      if (newSummary) target.summary = newSummary;

      if (rec.innerThought && typeof rec.innerThought === 'object') {
        const it = rec.innerThought as Record<string, unknown>;
        const surfaceState = stripHtmlTags(it.surfaceState).slice(0, 120);
        const mood = stripHtmlTags(it.mood).slice(0, 60);
        const thought = normalizeInnerMonologue(role,it.thought,target.innerThought?.thought||deriveCharacterInnerThought(role,target.category,target.summary).thought);
        if (surfaceState && thought) {
          target.innerThought = {
            surfaceState,
            mood: mood || target.innerThought?.mood || '平静',
            thought,
          };
        }
      }

      if (rec.artifact && artifactCount < 2) {
        const validated = validateAndSanitizeArtifact(rec.artifact, role);
        if (validated) {
          target.artifact = validated;
          artifactCount += 1;
        }
      }
      target.origin = 'ai_enriched';
    }

    base.aiGeneratedAt = nowTs;
    base.updatedAt = nowTs;
    if (!role.footprintsByDate) role.footprintsByDate = {};
    role.footprintsByDate[dateKey] = base;
    return { ok: true, archive: base };
  } catch (err) {
    return {
      ok: false,
      archive: base,
      reason: err instanceof Error ? err.message : '解析 AI 足迹 JSON 失败',
    };
  }
}

export function resolveSafeMonitorDateKey(
  candidate: string | undefined,
  nowTs = Date.now()
): string {
  const todayKey = toLocalDateKey(nowTs);
  if (!candidate || !parseDateKeyParts(candidate)) return todayKey;
  return candidate > todayKey ? todayKey : candidate;
}
