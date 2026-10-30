import type {
  ApiSettings,
  ChatMessage,
  DiaryEntry,
  DiaryFactSummary,
  DiaryGenerationTask,
  EventRecord,
  RoleData,
  UserProfileData,
} from './types';
import {
  formatMessageContentForModel,
  getActiveEvents,
  getActiveMessages,
  makeUid,
} from './revisions';
import { awaitingNainOpening, canUseRealModel } from './firstMessage';

export function toLocalDateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateKeyParts(dateKey: string): {
  year: number;
  month: number;
  day: number;
} | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || '').trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

export function getLocalDayBounds(dateKey: string): {
  startMs: number;
  endMs: number;
  label: string;
  shortLabel: string;
} {
  const parts = parseDateKeyParts(dateKey);
  if (!parts) {
    const fallbackNow = new Date();
    const fallbackKey = toLocalDateKey(fallbackNow.getTime());
    return getLocalDayBounds(fallbackKey);
  }
  const { year, month, day } = parts;
  const startDate = new Date(year, month - 1, day, 0, 0, 0, 0);
  const endDate = new Date(year, month - 1, day, 23, 59, 59, 999);
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const weekday = weekdays[startDate.getDay()] || '';
  return {
    startMs: startDate.getTime(),
    endMs: endDate.getTime(),
    label: `${year}年${month}月${day}日 · ${weekday}`,
    shortLabel: `${month}月${day}日`,
  };
}

export function shiftDateKey(dateKey: string, deltaDays: number): string {
  const parts = parseDateKeyParts(dateKey);
  if (!parts) return dateKey;
  // Use local noon (12:00) when shifting days to avoid any DST boundary drift
  const d = new Date(parts.year, parts.month - 1, parts.day + deltaDays, 12, 0, 0, 0);
  return toLocalDateKey(d.getTime());
}

export function countDiaryChars(text: string): number {
  return Array.from(String(text || '').replace(/\s+/g, '')).length;
}

export function stripLegacyTemplateDiaries(role: RoleData): number {
  if (!Array.isArray(role.diaries)) {
    role.diaries = [];
    return 0;
  }
  const before = role.diaries.length;
  role.diaries = role.diaries.filter(
    (d) => !(d && d.speaker === 'char' && d.source === 'life')
  );
  return before - role.diaries.length;
}

export function createUserDiary(
  role: RoleData,
  textRaw: string,
  nowTs = Date.now()
): DiaryEntry | null {
  const text = String(textRaw ?? '').trim();
  if (!text) return null;
  const diary: DiaryEntry = {
    id: makeUid('diary'),
    speaker: 'me',
    dateKey: toLocalDateKey(nowTs),
    text,
    at: nowTs,
    source: 'manual',
    sharedWith: [],
    sharedAt: {},
  };
  role.diaries.push(diary);
  // Private diary event: explicitly marked knownBy: ['user'] only, NOT known by the character!
  const ev: EventRecord = {
    id: makeUid('ev'),
    kind: 'diary',
    title: '你写了一篇私人日记',
    detail: '私人记录（未分享前角色不知情）',
    at: nowTs,
    diaryId: diary.id,
    status: 'active',
    knownBy: ['user'],
  };
  role.events.push(ev);
  return diary;
}

export function isDiarySharedWithRole(diary: DiaryEntry, roleId: string): boolean {
  if (diary.speaker !== 'me') return true;
  return Array.isArray(diary.sharedWith) && diary.sharedWith.includes(roleId);
}

/**
 * Explicitly shares a single user diary entry with the specified character.
 * Only after this action does the character gain legitimate knowledge of this diary entry,
 * and a traceable 'diary_share' event is recorded in the timeline.
 */
export function shareDiaryWithRole(
  role: RoleData,
  diaryId: string,
  nowTs = Date.now()
): { ok: boolean; reason?: string; event?: EventRecord } {
  const diary = (role.diaries || []).find((d) => d.id === diaryId && d.speaker === 'me');
  if (!diary) {
    return { ok: false, reason: '未找到该篇个人日记' };
  }
  if (!Array.isArray(diary.sharedWith)) {
    diary.sharedWith = [];
  }
  if (!diary.sharedAt || typeof diary.sharedAt !== 'object') {
    diary.sharedAt = {};
  }
  if (diary.sharedWith.includes(role.id)) {
    return { ok: false, reason: `已经分享给 ${role.name} 了` };
  }

  diary.sharedWith.push(role.id);
  diary.sharedAt[role.id] = nowTs;

  const ev: EventRecord = {
    id: makeUid('ev'),
    kind: 'diary_share',
    title: `你向${role.name}分享了一篇日记`,
    detail: `日记内容（写于 ${new Date(diary.at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}）：${diary.text}`,
    at: nowTs,
    speaker: 'me',
    diaryId: diary.id,
    status: 'active',
    knownBy: ['user', role.id],
  };
  role.events.push(ev);

  return { ok: true, event: ev };
}

/**
 * Returns all events that the given character legitimately has permission to know.
 * Private unshared user diaries (`kind === 'diary'` with `knownBy: ['user']`) are strictly excluded.
 */
export function getRoleKnownEvents(role: RoleData): EventRecord[] {
  return getActiveEvents(role.events).filter((e) => {
    if (e.kind === 'diary' && (!Array.isArray(e.knownBy) || !e.knownBy.includes(role.id))) {
      return false;
    }
    if (Array.isArray(e.knownBy) && e.knownBy.length > 0 && !e.knownBy.includes(role.id)) {
      return false;
    }
    return true;
  });
}

export function getSharedUserDiariesForRole(role: RoleData): DiaryEntry[] {
  return (role.diaries || []).filter(
    (d) => d.speaker === 'me' && isDiarySharedWithRole(d, role.id)
  );
}

export function getCharacterDiaryDateKey(diary: DiaryEntry): string {
  if (diary.dateKey && /^\d{4}-\d{2}-\d{2}$/.test(diary.dateKey)) {
    return diary.dateKey;
  }
  return toLocalDateKey(diary.at);
}

export function hasCharacterDiaryForDate(role: RoleData, dateKey: string): boolean {
  return (role.diaries || []).some(
    (d) =>
      d &&
      d.speaker === 'char' &&
      d.source !== 'life' &&
      getCharacterDiaryDateKey(d) === dateKey &&
      Boolean(String(d.text || '').trim())
  );
}

export interface DailyDiaryFacts {
  dateKey: string;
  dateLabel: string;
  shortLabel: string;
  startMs: number;
  endMs: number;
  chatMessages: ChatMessage[];
  sceneBlocks: { id: string; where: string; messages: ChatMessage[] }[];
  playBlocks: {
    id: string;
    title: string;
    world: string;
    userRole: string;
    charRole: string;
    messages: ChatMessage[];
    intermissionMessages: ChatMessage[];
  }[];
  focusEvents: EventRecord[];
  sharedUserDiaries: DiaryEntry[];
  knownEvents: EventRecord[];
  lifeRoutines: EventRecord[];
  sourceMessageIds: string[];
  sourceEventIds: string[];
  summary: DiaryFactSummary;
}

/**
 * Collects all legitimate, non-retracted facts for a character on a single target local calendar day.
 * Strictly enforces:
 * - Only active messages (`status !== 'retracted'`) within `[startMs, endMs]`.
 * - No unshared private user diaries (`knownBy: ['user']`).
 * - No user diaries shared AFTER `endMs` (prevents leaking future shares into historical backfills).
 * - No events or messages from after `endMs` (prevents leaking future days into historical backfills).
 * - Separates routine life projections (`kind === 'life'`) from real confirmed events.
 */
export function collectDailyDiaryFacts(
  role: RoleData,
  dateKey: string
): DailyDiaryFacts {
  const { startMs, endMs, label, shortLabel } = getLocalDayBounds(dateKey);

  // 1. Active chat messages in [startMs, endMs]
  const chatMessages = getActiveMessages(role.chats || []).filter(
    (m) => m.at >= startMs && m.at <= endMs
  );

  // 2. Active face-to-face scene messages in [startMs, endMs]
  const allScenes = [
    ...(Array.isArray(role.meetings) ? role.meetings : []),
    ...(role.scene ? [role.scene] : []),
  ];
  const seenSceneIds = new Set<string>();
  const sceneBlocks: { id: string; where: string; messages: ChatMessage[] }[] = [];
  for (const sc of allScenes) {
    if (!sc || seenSceneIds.has(sc.id)) continue;
    seenSceneIds.add(sc.id);
    const msgs = getActiveMessages(sc.messages || []).filter(
      (m) => m.at >= startMs && m.at <= endMs
    );
    if (msgs.length > 0) {
      sceneBlocks.push({
        id: sc.id,
        where: sc.where || role.place || '见面地点',
        messages: msgs,
      });
    }
  }

  // 3. Active drama plays & intermission messages in [startMs, endMs]
  const allPlays = [
    ...(Array.isArray(role.plays) ? role.plays : []),
    ...(role.play ? [role.play] : []),
  ];
  const seenPlayIds = new Set<string>();
  const playBlocks: DailyDiaryFacts['playBlocks'] = [];
  for (const pl of allPlays) {
    if (!pl || seenPlayIds.has(pl.id)) continue;
    seenPlayIds.add(pl.id);
    const msgs = getActiveMessages(pl.messages || []).filter(
      (m) => m.at >= startMs && m.at <= endMs
    );
    const interMsgs = getActiveMessages(pl.intermissionMessages || []).filter(
      (m) => m.at >= startMs && m.at <= endMs
    );
    if (msgs.length > 0 || interMsgs.length > 0) {
      playBlocks.push({
        id: pl.id,
        title: pl.title || '无题之戏',
        world: pl.world || '',
        userRole: pl.user || '搭档',
        charRole: pl.char || role.name,
        messages: msgs,
        intermissionMessages: interMsgs,
      });
    }
  }

  // 4. User diaries explicitly shared with this role on `dateKey`
  const sharedUserDiaries = getSharedUserDiariesForRole(role).filter((d) => {
    const shareTs = d.sharedAt?.[role.id] ?? d.at;
    return shareTs >= startMs && shareTs <= endMs;
  });

  // 5. Legitimately known events on `dateKey`
  const permittedEventsOnDay = getRoleKnownEvents(role).filter(
    (e) => e.at >= startMs && e.at <= endMs
  );
  const focusEvents = permittedEventsOnDay.filter((e) => e.kind === 'focus');
  const lifeRoutines = permittedEventsOnDay.filter((e) => e.kind === 'life');
  const knownEvents = permittedEventsOnDay.filter((e) => e.kind !== 'life');

  const sourceMessageIds = [
    ...chatMessages.map((m) => m.id),
    ...sceneBlocks.flatMap((b) => b.messages.map((m) => m.id)),
    ...playBlocks.flatMap((b) => [
      ...b.messages.map((m) => m.id),
      ...b.intermissionMessages.map((m) => m.id),
    ]),
  ];
  const sourceEventIds = permittedEventsOnDay.map((e) => e.id);

  const sceneMsgCount = sceneBlocks.reduce((acc, b) => acc + b.messages.length, 0);
  const dramaMsgCount = playBlocks.reduce(
    (acc, b) => acc + b.messages.length + b.intermissionMessages.length,
    0
  );

  // Check if there was actual user interaction on this date
  // Note: A lone initial greeting generated automatically without user reply or interaction is still the character's own message,
  // whereas any 'me' message, scene, play, focus session, or shared diary is a confirmed two-way interaction.
  const hasUserChat = chatMessages.some((m) => m.speaker === 'me');
  const hasAnyChat = chatMessages.length > 0;
  const hasUserInteraction =
    hasUserChat ||
    hasAnyChat ||
    sceneMsgCount > 0 ||
    dramaMsgCount > 0 ||
    focusEvents.length > 0 ||
    sharedUserDiaries.length > 0;

  const summary: DiaryFactSummary = {
    chatCount: chatMessages.length,
    sceneCount: sceneMsgCount,
    dramaCount: dramaMsgCount,
    focusCount: focusEvents.length,
    sharedDiaryCount: sharedUserDiaries.length,
    lifeRoutineCount: lifeRoutines.length,
    hasUserInteraction,
  };

  return {
    dateKey,
    dateLabel: label,
    shortLabel,
    startMs,
    endMs,
    chatMessages,
    sceneBlocks,
    playBlocks,
    focusEvents,
    sharedUserDiaries,
    knownEvents,
    lifeRoutines,
    sourceMessageIds,
    sourceEventIds,
    summary,
  };
}

function formatHm(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Builds the model prompt messages for a character's daily private diary on `dateKey`.
 */
export function buildCharacterDiaryPrompt(
  role: RoleData,
  user: UserProfileData,
  dateKey: string,
  sharedTasksText = ''
): {
  messages: { role: string; content: string }[];
  facts: DailyDiaryFacts;
} {
  const facts = collectDailyDiaryFacts(role, dateKey);
  const userName = String(role.userAlias || user?.name || '你').trim() || '你';

  const userIdentityLines = [
    user?.name ? `用户名：${user.name}` : '',
    role.userAlias ? `你在私下或当面对TA的惯用称呼：${role.userAlias}` : '',
    user?.pronouns ? `代词：${user.pronouns}` : '',
    user?.identity ? `身份与性格：${user.identity}` : '',
    user?.background ? `背景：${user.background}` : '',
    user?.notes ? `补充说明：${user.notes}` : '',
    role.notes ? `仅对你（${role.name}）生效的身份补充：${role.notes}` : '',
  ]
    .filter(Boolean)
    .join('；');

  const isNain = role.name === '奈恩' || Boolean(role.demoSample);
  const nainCanonGuard = isNain
    ? `\n【奈恩（Nain）专属 Canon 铁律（严禁违背）】
1. 身份与背景：你是原在伦敦受训的英国情报人员，现以纽约警探掩护身份潜伏在美国密歇根调查金博尔相关线索。你绝非《喵喵馆》猫舍工作人员，严禁出现任何猫舍打工或通用治愈系客服话术。
2. 性格与文风：你冷静、敏锐、观察力极强，懂得伪装亲切与圆滑，但私下日记里的独白真实、克制、带着英式冷幽默与轻微揶揄，偶尔流露潜伏者的审视、道德冲突或笨拙的真情。
3. 人物关系与时间线边界：你的恋人是警察约翰（John，你常在心里或嘴上叫他“警察先生”），你现在正处于与约翰稳定相爱的时期，未来的悲剧（约翰的死亡与告别）在当前时间线【尚未发生】，你本人对此毫不知情，严禁在日记中剧透、预言或哀悼尚未发生的未来悲剧。
4. 对用户（创作者）的态度：你知道用户是写下你过去故事的创作者，你们曾在窗外白茫茫的假设空间咖啡厅见过，你收下了TA给你的红色亚克力六面骰；你常带点揶揄地称呼TA为“${
        role.userAlias || '妈咪'
      }”，你和创作者是“被创造者与作者”的奇妙张力关系，而非恋人关系。`
    : '';

  // Assemble concrete factual blocks
  const chatTranscript = facts.chatMessages
    .map(
      (m) =>
        `[${formatHm(m.at)}] ${
          m.speaker === 'me' ? userName : role.name
        }：${formatMessageContentForModel(m, role.name, userName)}`
    )
    .join('\n');

  const sceneTranscript = facts.sceneBlocks
    .map(
      (b) =>
        `地点：${b.where}\n` +
        b.messages
          .map(
            (m) =>
              `[${formatHm(m.at)}] ${
                m.speaker === 'me'
                  ? userName
                  : m.speaker === 'char'
                  ? role.name
                  : '场景旁白'
              }：${formatMessageContentForModel(m, role.name, userName)}`
          )
          .join('\n')
    )
    .join('\n---\n');

  const playTranscript = facts.playBlocks
    .map((p) => {
      const playLines = p.messages
        .slice(-16)
        .map((m) => `${m.speaker === 'me' ? userName : role.name}：${m.text}`)
        .join(' / ');
      const interLines = p.intermissionMessages
        .slice(-10)
        .map((m) => `${m.speaker === 'me' ? userName : role.name}：${m.text}`)
        .join(' / ');
      return `剧目《${p.title}》（戏内设定：${p.world}；${role.name}饰「${p.charRole}」，${userName}饰「${p.userRole}」）\n戏内片段：${playLines || '无'}\n幕间讨论（戏外真实身份交流）：${interLines || '无'}\n（注：戏剧是你们一起排演的虚构故事，日记中若提及，应以“今天和TA排演了这出戏”的戏外真实视角回顾，切勿把戏内虚构情节当成现实发生的事）`;
    })
    .join('\n---\n');

  const focusTranscript = facts.focusEvents
    .map((e) => `[${formatHm(e.at)}] ${e.title}：${e.detail}`)
    .join('\n');

  const sharedDiaryTranscript = facts.sharedUserDiaries
    .map(
      (d) =>
        `[${formatHm(d.sharedAt?.[role.id] ?? d.at)} ${userName}主动分享给你的日记] ${d.text}`
    )
    .join('\n');

  const routineSummary = facts.lifeRoutines
    .slice(-8)
    .map((e) => `[${formatHm(e.at)}] ${e.title}（${e.detail}）`)
    .join('；');

  const otherKnownEvents = facts.knownEvents
    .filter((e) => e.kind !== 'focus')
    .slice(-12)
    .map((e) => `[${formatHm(e.at)} | ${e.kind}] ${e.title}：${e.detail}`)
    .join('\n');

  const systemPrompt = `你正在扮演 ${role.name}，现在是当地时间深夜，你正在写一篇属于你自己的【私人日记】，归档日期为 ${facts.dateLabel}（${facts.dateKey}）。

【角色核心档案】
- 姓名：${role.name}
- 身份与职业：${role.job || '独立生活者'}
- 常驻地点：${role.place || '未知地点'}
- 性格特征：${role.traits || '有自己的节奏与判断'}
- 完整人设与过往经历：${role.profile || '按角色既有设定行动'}
- 前史节点与未发生剧情边界（Canon）：${role.canonNotes || '严格遵守已发生事实，不预知未来'}
- 你与用户（${userName}）的关系：${role.relationship || '熟悉但各自独立'}
- 用户身份背景：${userIdentityLines || '未特别披露'}${nainCanonGuard}

【私人日记写作准则（极其重要）】
1. 视角与性质：这是你（${role.name}）写给自己看的私人文字，必须使用第一人称“我”书写。它不是系统的客观摘要，不是交给用户的汇报，也不是客服式的温柔总结。
2. 语气与文风：完全贴合你的性格、职业习惯、说话方式、心理防御机制与生活处境。不同角色必须有截然不同的笔触。不要使用千篇一律的“今天也是充实的一天”“我理解你的感受”等 AI 模板套话。
3. 内容优先级：
   - 第一优先：${facts.dateKey} 当天你与 ${userName} 实际发生的互动（聊天、当面相处、共同专注、排演戏剧、或对方主动分享给你的日记）。
   - 第二优先：你对这些互动的真实主观感受、揣测、怀疑、期待、未说出口的话或保留意见。
   - 第三优先：你当天在自己生活中确认发生的事（工作、观察到的细节、自身人际与处境）。
   - 第四优先：你的私人念头、习惯与未解决的事。
4. 事实与知识权限边界（防幻觉与防越权）：
   - 只能把下方【${facts.dateKey} 当日真实记录】中列出的互动当作今天实际发生过的事。
   - 若下方没有任何与 ${userName} 的互动记录，说明今天你们没有联系或没有深聊——请自然书写你自己这一天的工作、生活细节与私人思绪，绝不要强行围绕用户抒情，更不要编造“今天我们聊了很多/见了面”等虚假互动。
   - 【日常作息投影】仅代表你今天大致去过哪里、做过什么日常工作，可作为环境与生活质感的轻背景，严禁凭空编造重大突发事件凑字数。
   - 严禁假装知道用户未主动分享的私密日记，严禁引用已被撤回或修改前的废弃消息，严禁剧透当前时间线尚未发生的未来剧情。
5. 篇幅要求：
   - 当日素材丰富时，目标长度约 1,000 个汉字（建议范围 800–1,200 字），分段自然，细节充实，有真实的心理层次。
   - 若当日真实素材较少，允许自然缩短（如 450–800 字），严禁为了凑字数凭空捏造无意义的虚假事件。
6. 输出格式：直接输出日记正文（可在首行自然写上日期、时间或地点简记，如“${facts.shortLabel}，夜”），不要输出任何 Markdown 代码块标记、不要写“好的，这是日记”等前缀说明。`;

  const userPrompt = `请根据以下归档于【${facts.dateLabel}（${facts.dateKey}）】的真实记录，以 ${role.name} 的第一人称写下这一天的私人日记：

=== 一、当日与 ${userName} 的手机聊天记录（${facts.chatMessages.length} 条） ===
${chatTranscript || '（当日无手机聊天记录）'}

=== 二、当日面对面相处记录（${facts.sceneBlocks.length} 场） ===
${sceneTranscript || '（当日无面对面见面记录）'}

=== 三、当日共同专注陪伴记录（${facts.focusEvents.length} 条） ===
${focusTranscript || '（当日无共同专注记录）'}

=== 四、当日戏剧排演与幕间交流（${facts.playBlocks.length} 场） ===
${playTranscript || '（当日无戏剧排演记录）'}

=== 五、当日 ${userName} 主动分享给你的个人日记（${facts.sharedUserDiaries.length} 篇） ===
${sharedDiaryTranscript || '（当日对方未向你分享个人日记；对方未分享的任何私密日记你均不知情）'}

=== 六、当日其他已确认事件与日常作息投影 ===
- 已确认事件：
${otherKnownEvents || '（无额外事件）'}
- 日常作息背景投影（仅作地点与日常工作参考，勿夸大编造）：
${routineSummary || `在 ${role.place || '常驻地'} 照常度过一天`}
${sharedTasksText ? `- 玩家共享待办面板（公开可见背景）：${sharedTasksText}` : ''}

请现在开始以 ${role.name} 的口吻写下 ${facts.dateKey} 的私人日记正文：`;

  return {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    facts,
  };
}

/**
 * Lists all past calendar dates (`< toLocalDateKey(nowTs)`) that should have a character diary
 * for `role` but do not yet have a completed official character diary.
 */
export function listMissingDiaryDateKeys(
  role: RoleData,
  nowTs = Date.now(),
  maxBackfillDays = 7
): string[] {
  const todayKey = toLocalDateKey(nowTs);
  const { startMs: todayStartMs } = getLocalDayBounds(todayKey);
  const yesterdayKey = shiftDateKey(todayKey, -1);
  const minAllowedKey = shiftDateKey(todayKey, -Math.max(1, maxBackfillDays));

  const candidateDateKeys = new Set<string>();

  // 1. Check if midnight rolled over since role.lastDiaryCheckDay
  if (
    role.lastDiaryCheckDay &&
    /^\d{4}-\d{2}-\d{2}$/.test(role.lastDiaryCheckDay) &&
    role.lastDiaryCheckDay < todayKey
  ) {
    let cursor =
      role.lastDiaryCheckDay < minAllowedKey ? minAllowedKey : role.lastDiaryCheckDay;
    let guard = 0;
    while (cursor < todayKey && guard < 14) {
      candidateDateKeys.add(cursor);
      cursor = shiftDateKey(cursor, 1);
      guard++;
    }
  }

  // 2. Collect timestamps from all active historical records prior to todayStartMs
  const pastTimestamps: number[] = [];
  for (const m of getActiveMessages(role.chats || [])) {
    if (m.at > 0 && m.at < todayStartMs) pastTimestamps.push(m.at);
  }
  for (const e of getRoleKnownEvents(role)) {
    if (e.at > 0 && e.at < todayStartMs) pastTimestamps.push(e.at);
  }
  for (const sc of [
    ...(Array.isArray(role.meetings) ? role.meetings : []),
    ...(role.scene ? [role.scene] : []),
  ]) {
    if (!sc) continue;
    for (const m of getActiveMessages(sc.messages || [])) {
      if (m.at > 0 && m.at < todayStartMs) pastTimestamps.push(m.at);
    }
  }
  for (const pl of [
    ...(Array.isArray(role.plays) ? role.plays : []),
    ...(role.play ? [role.play] : []),
  ]) {
    if (!pl) continue;
    for (const m of getActiveMessages(pl.messages || [])) {
      if (m.at > 0 && m.at < todayStartMs) pastTimestamps.push(m.at);
    }
  }
  for (const d of role.diaries || []) {
    if (d && d.at > 0 && d.at < todayStartMs) {
      pastTimestamps.push(d.at);
    }
  }

  if (pastTimestamps.length > 0) {
    const earliestTs = Math.min(...pastTimestamps);
    const earliestKeyRaw = toLocalDateKey(earliestTs);
    let cursor = earliestKeyRaw < minAllowedKey ? minAllowedKey : earliestKeyRaw;
    let guard = 0;
    while (cursor <= yesterdayKey && guard < 14) {
      candidateDateKeys.add(cursor);
      cursor = shiftDateKey(cursor, 1);
      guard++;
    }
  }

  // 3. Also include any existing non-completed task dateKeys on the role
  for (const t of role.diaryTasks || []) {
    if (t && t.dateKey && t.dateKey < todayKey && t.dateKey >= minAllowedKey) {
      candidateDateKeys.add(t.dateKey);
    }
  }

  return Array.from(candidateDateKeys)
    .filter((k) => k < todayKey && !hasCharacterDiaryForDate(role, k))
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Synchronizes a character's daily diary generation tasks (`role.diaryTasks`).
 * - Strips any legacy `source === 'life'` template diaries.
 * - Detects missed past calendar days (including midnight `00:00` rollover and multi-day offline backfill).
 * - Deduplicates by `(role.id, dateKey)` so refreshing or switching views never creates duplicate tasks.
 * - Updates task status between `'pending'` and `'awaiting_api'` depending on whether a real API is configured.
 */
export function syncRoleDiaryTasks(
  role: RoleData,
  settings: ApiSettings,
  nowTs = Date.now(),
  options: {
    resetGenerating?: boolean;
    ensureYesterday?: boolean;
    maxBackfillDays?: number;
  } = {}
): DiaryGenerationTask[] {
  if(awaitingNainOpening(role))return role.diaryTasks||[];
  stripLegacyTemplateDiaries(role);
  if (!Array.isArray(role.diaryTasks)) {
    role.diaryTasks = [];
  }

  const todayKey = toLocalDateKey(nowTs);
  const yesterdayKey = shiftDateKey(todayKey, -1);
  const apiReady = canUseRealModel(settings);

  const missingKeys = new Set(
    listMissingDiaryDateKeys(role, nowTs, options.maxBackfillDays ?? 7)
  );
  if (options.ensureYesterday && !hasCharacterDiaryForDate(role, yesterdayKey)) {
    missingKeys.add(yesterdayKey);
  }

  // Mark any existing tasks whose dateKey already has a formal character diary as completed
  for (const task of role.diaryTasks) {
    if (hasCharacterDiaryForDate(role, task.dateKey)) {
      const existingDiary = (role.diaries || []).find(
        (d) =>
          d.speaker === 'char' &&
          d.source !== 'life' &&
          getCharacterDiaryDateKey(d) === task.dateKey
      );
      task.status = 'completed';
      if (existingDiary) task.diaryId = existingDiary.id;
      task.lastError = undefined;
    } else {
      if (options.resetGenerating && task.status === 'generating') {
        task.status = apiReady ? 'pending' : 'awaiting_api';
        task.updatedAt = nowTs;
      } else if (task.status === 'awaiting_api' && apiReady) {
        task.status = 'pending';
        task.updatedAt = nowTs;
      } else if (task.status === 'pending' && !apiReady) {
        task.status = 'awaiting_api';
        task.updatedAt = nowTs;
      }
    }
  }

  // Deduplicate existing tasks by dateKey
  const byDate = new Map<string, DiaryGenerationTask>();
  for (const task of role.diaryTasks) {
    if (!task || !/^\d{4}-\d{2}-\d{2}$/.test(task.dateKey)) continue;
    const prev = byDate.get(task.dateKey);
    if (!prev || task.status === 'completed' || task.updatedAt > prev.updatedAt) {
      byDate.set(task.dateKey, task);
    }
  }

  for (const dateKey of Array.from(missingKeys).sort()) {
    const facts = collectDailyDiaryFacts(role, dateKey);
    const existing = byDate.get(dateKey);
    if (existing) {
      existing.factSummary = facts.summary;
      existing.sourceMessageIds = facts.sourceMessageIds;
      existing.sourceEventIds = facts.sourceEventIds;
    } else {
      const created: DiaryGenerationTask = {
        id: makeUid('dtask'),
        roleId: role.id,
        dateKey,
        status: apiReady ? 'pending' : 'awaiting_api',
        attempts: 0,
        createdAt: nowTs,
        updatedAt: nowTs,
        sourceMessageIds: facts.sourceMessageIds,
        sourceEventIds: facts.sourceEventIds,
        factSummary: facts.summary,
      };
      byDate.set(dateKey, created);
    }
  }

  role.diaryTasks = Array.from(byDate.values()).sort((a, b) =>
    a.dateKey.localeCompare(b.dateKey)
  );
  role.lastDiaryCheckDay = todayKey;
  return role.diaryTasks;
}

export function cleanGeneratedDiaryText(raw: string): string {
  let text = String(raw || '').trim();
  // Strip outer markdown code fences if model wrapped the diary
  text = text.replace(/^```(?:markdown|text|txt)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
  return text.trim();
}

/**
 * Saves the AI-generated diary for `(role, dateKey)` and marks its task as `'completed'`.
 * Strictly enforces at most ONE official character diary per `(role.id, dateKey)`.
 */
export function applyGeneratedCharacterDiary(
  role: RoleData,
  dateKey: string,
  rawText: string,
  nowTs = Date.now()
): {
  ok: boolean;
  reason?: string;
  diary?: DiaryEntry;
  task?: DiaryGenerationTask;
} {
  const text = cleanGeneratedDiaryText(rawText);
  if (!text) {
    return { ok: false, reason: '模型返回的日记内容为空' };
  }

  stripLegacyTemplateDiaries(role);
  if (!Array.isArray(role.diaries)) role.diaries = [];
  if (!Array.isArray(role.diaryTasks)) role.diaryTasks = [];

  const facts = collectDailyDiaryFacts(role, dateKey);
  const wordCount = countDiaryChars(text);

  // Check if a formal character diary already exists for this dateKey
  let diary = role.diaries.find(
    (d) =>
      d &&
      d.speaker === 'char' &&
      d.source !== 'life' &&
      getCharacterDiaryDateKey(d) === dateKey
  );

  if (diary) {
    diary.text = text;
    diary.dateKey = dateKey;
    diary.at = facts.endMs;
    diary.generatedAt = nowTs;
    diary.wordCount = wordCount;
    diary.source = 'ai';
    diary.sourceIds = [...facts.sourceEventIds, ...facts.sourceMessageIds];
    diary.sourceMessageIds = facts.sourceMessageIds;
    diary.sourceEventIds = facts.sourceEventIds;
    diary.factSummary = facts.summary;
  } else {
    diary = {
      id: makeUid('diary'),
      speaker: 'char',
      dateKey,
      at: facts.endMs,
      generatedAt: nowTs,
      text,
      wordCount,
      source: 'ai',
      sourceIds: [...facts.sourceEventIds, ...facts.sourceMessageIds],
      sourceMessageIds: facts.sourceMessageIds,
      sourceEventIds: facts.sourceEventIds,
      factSummary: facts.summary,
    };
    role.diaries.push(diary);
  }

  // Ensure no duplicate character diaries exist for this dateKey
  const seenSameDate = new Set<string>();
  role.diaries = role.diaries.filter((d) => {
    if (d.speaker !== 'char') return true;
    const k = getCharacterDiaryDateKey(d);
    if (k !== dateKey) return true;
    if (seenSameDate.has(k)) return false;
    seenSameDate.add(k);
    return true;
  });

  let task = role.diaryTasks.find((t) => t.dateKey === dateKey);
  if (!task) {
    task = {
      id: makeUid('dtask'),
      roleId: role.id,
      dateKey,
      status: 'completed',
      attempts: 1,
      createdAt: nowTs,
      updatedAt: nowTs,
    };
    role.diaryTasks.push(task);
  }
  task.status = 'completed';
  task.diaryId = diary.id;
  task.lastError = undefined;
  task.updatedAt = nowTs;
  task.sourceMessageIds = facts.sourceMessageIds;
  task.sourceEventIds = facts.sourceEventIds;
  task.factSummary = facts.summary;

  role.diaryDay = dateKey;
  return { ok: true, diary, task };
}

export function markDiaryTaskFailed(
  role: RoleData,
  dateKey: string,
  errorMsg: string,
  nowTs = Date.now()
): DiaryGenerationTask {
  if (!Array.isArray(role.diaryTasks)) role.diaryTasks = [];
  const facts = collectDailyDiaryFacts(role, dateKey);
  let task = role.diaryTasks.find((t) => t.dateKey === dateKey);
  if (!task) {
    task = {
      id: makeUid('dtask'),
      roleId: role.id,
      dateKey,
      status: 'failed',
      attempts: 1,
      lastError: errorMsg,
      createdAt: nowTs,
      updatedAt: nowTs,
      sourceMessageIds: facts.sourceMessageIds,
      sourceEventIds: facts.sourceEventIds,
      factSummary: facts.summary,
    };
    role.diaryTasks.push(task);
  } else {
    task.status = 'failed';
    task.lastError = errorMsg;
    task.updatedAt = nowTs;
    task.sourceMessageIds = facts.sourceMessageIds;
    task.sourceEventIds = facts.sourceEventIds;
    task.factSummary = facts.summary;
  }
  return task;
}
