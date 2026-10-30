import type { AppData, EventRecord, RoleData } from './types';
import { formatMessageContentForModel, getActiveMessages } from './revisions';
import { getRoleKnownEvents, getSharedUserDiariesForRole } from './diary';

export const dt = (t: number): string =>
  new Date(t).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export const hm = (t: number): string =>
  new Date(t).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

export const dateStr = (t: number): string =>
  new Date(t).toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
  });

export function routine(
  r: Pick<RoleData, 'job'>,
  t: number
): { icon: string; where: string; doing: string; label: string } {
  const h = new Date(t).getHours();
  const jobStr = String(r?.job || '');
  if (h < 7)
    return {
      icon: '🌙',
      where: '住处',
      doing: '休息，手机调成了安静模式',
      label: '安静的夜晚',
    };
  if (h < 9)
    return {
      icon: '🏡',
      where: '住处',
      doing: '起床、洗漱，慢慢整理一天的安排',
      label: '晨间准备',
    };
  if (h < 12)
    return {
      icon: '📚',
      where: jobStr.includes('书') ? '书店' : '工作地点',
      doing: jobStr.includes('书') ? '整理书架和新到的书' : '处理工作，偶尔走神想别的事',
      label: '忙自己的工作',
    };
  if (h < 14)
    return {
      icon: '🍜',
      where: '小餐馆',
      doing: '午饭和片刻休息',
      label: '午间休息',
    };
  if (h < 18)
    return {
      icon: '📚',
      where: jobStr.includes('书') ? '书店' : '工作地点',
      doing: '继续忙自己的事，间或看看消息',
      label: '下午的工作',
    };
  if (h < 20)
    return {
      icon: '🌳',
      where: '街区',
      doing: '离开工作地点，沿熟悉的路慢慢走',
      label: '下班路上',
    };
  if (h < 22)
    return {
      icon: '☕',
      where: '咖啡馆',
      doing: '坐一会儿，整理今天发生的事情',
      label: '晚上的空闲',
    };
  return {
    icon: '🏡',
    where: '住处',
    doing: '回家，准备休息',
    label: '一天结束',
  };
}

export function keywords(s: string): string[] {
  return [
    ...new Set(
      String(s || '')
        .toLowerCase()
        .match(/[\p{Script=Han}]{2,5}|[\p{L}\p{N}]{3,}/gu) || []
    ),
  ];
}

/**
 * Retrieves relevant active & permitted events for a character.
 * Retracted/superseded events and private unshared user diaries are strictly excluded.
 */
export function retrieve(
  r: RoleData,
  query: string,
  limit = 9,
  nowTs = Date.now()
): EventRecord[] {
  const ks = keywords(query);
  const permittedEvents = getRoleKnownEvents(r);
  return permittedEvents
    .map((e) => ({
      e,
      score:
        (e.at > nowTs - 86400000 ? 3 : 0) +
        ks.reduce(
          (sum, k) =>
            sum +
            (String(e.detail || '').toLowerCase().includes(k) ? 4 : 0) +
            (String(e.title || '').toLowerCase().includes(k) ? 2 : 0),
          0
        ) +
        (e.kind === 'scene' || e.kind === 'drama' || e.kind === 'diary_share' ? 2 : 0),
    }))
    .sort((a, b) => b.score - a.score || b.e.at - a.e.at)
    .slice(0, limit)
    .map((x) => x.e)
    .sort((a, b) => a.at - b.at);
}

export function identityName(data: AppData, r?: RoleData | null): string {
  return String(r?.userAlias || data.user?.name || '用户').trim();
}

export function identityContext(data: AppData, r?: RoleData | null): string {
  const u = data.user || { name: '', pronouns: '', identity: '', background: '', notes: '' };
  return [
    `名字：${u.name || '未指定'}`,
    r?.userAlias ? `对${r.name}使用的称呼：${r.userAlias}` : '',
    u.pronouns ? `称呼与代词：${u.pronouns}` : '',
    u.identity ? `身份与性格：${u.identity}` : '',
    u.background ? `背景：${u.background}` : '',
    u.notes ? `其他自述：${u.notes}` : '',
    r?.notes ? `仅对${r.name}生效的身份补充与修订：${r.notes}` : '',
  ]
    .filter(Boolean)
    .join('；');
}

export function userTasksSummary(data: AppData): string {
  const v = data.sharedTasks || { ddl: [], todo: [] };
  return [...(v.ddl || []), ...(v.todo || [])]
    .filter((x) => !x.done)
    .slice(0, 16)
    .map((x) => `${x.due || '待办'}：${x.text}`)
    .join('；');
}

export function buildMessagesForModel(
  data: AppData,
  r: RoleData,
  kind: 'chat' | 'scene' | 'play' | 'intermission',
  input: string,
  options: { isFocused?: boolean; nowTs?: number } = {}
): { role: string; content: string }[] {
  const nowTs = options.nowTs ?? Date.now();
  const isFocused = Boolean(options.isFocused);
  let base = '';
  let facts = '';

  if (kind === 'intermission') {
    const p = r.play!;
    const activePlayMsgs = getActiveMessages(p.messages);
    base = `你是戏外真实角色${r.name}，而不是戏内角色。你的身份:${r.job}，性格:${r.traits}，完整人设:${r.profile}。用户身份:${identityContext(data, r)}。你现在与用户一起排演《${p.title}》，你知道你扮演的角色设定:${p.char}；剧内世界:${p.world}；用户扮演:${p.user}。你知道已经演过的内容，但不能预知未发生的故事。此刻是幕间讨论，戏内情节冻结，只进行戏外自然交谈、交流对戏与修订想法。不要替用户决定，也不在这一轮推进戏内剧情。剧中人格不能覆盖戏外自我。以下为已演片段：${activePlayMsgs
      .slice(-18)
      .map((m) => m.speaker + '：' + m.text)
      .join(' / ')
      .slice(0, 8000)}；此前尝试过的废弃片段:${(p.revisions || [])
      .slice(-3)
      .map((v) => v.messages.map((m) => m.text).join(' / '))
      .join(' / ')
      .slice(0, 2000)}。保持自身性格，回答要像一个真实的演员。`;
  } else if (kind === 'play') {
    const p = r.play!;
    base = `你正在参与一段独立、封闭的虚构戏剧。仅作为剧中角色行动，不知道剧外的手机、聊天、角色本人真实身份、用户真实身份、日记或其他生活记录。剧名：${p.title}。世界规则与开场：${p.world}。用户在剧内的身份：${p.user}。你在剧内的身份：${p.char}。推进场景、表现人物心理与自身动作，不代替用户做出选择。剧内角色之间的关系仅以剧本及本场对白为准。使用中文进行自然的沉浸式叙事。`;
  } else {
    const a = routine(r, nowTs);
    facts = retrieve(r, input, 12, nowTs)
      .map((e) => `[${dt(e.at)} | ${e.kind} | ${e.id}] ${e.title}: ${e.detail}`)
      .join('\n');
    const sharedDiaries = getSharedUserDiariesForRole(r)
      .slice(-5)
      .map((d) => `[${dt(d.at)} 用户主动分享给你的日记] ${d.text}`)
      .join('\n');

    const isLaconic = /话少|寡言|惜字如金|简短|冷淡/.test(
      `${r.traits || ''} ${r.profile || ''}`
    );
    base = `你在扮演名为${r.name}的虚构人物（不是AI助手），有独立生活、工作、偏好和主观感受。身份：${r.job}。性格：${r.traits}。人设：${r.profile}。前史节点与未发生剧情边界：${r.canonNotes || '以用户设定为准'}。用户身份设定：${identityContext(data, r)}。你和用户目前的关系：${r.relationship}。此刻地点：${r.scene?.where || a.where}。正在做：${r.scene ? '与用户当面交谈' : a.doing}。当前日期时间：${dt(nowTs)}。保持人设一致，但不要机械附和，不替用户决定行为。禁止假装知道没有获悉的私事。所附历史是有来源的部分检索结果，不确定时不要编造。回复使用自然中文。`;
    base +=
      kind === 'chat'
        ? `你正在用手机和用户发消息。请按你本人的打字与说话习惯组织回复：${
            isLaconic
              ? '你平时打字偏简短克制，通常发 1 条（必要时最多 2 条）自然短消息即可。'
              : '一次回复可以由 1 至 3 条（偶尔最多 4 条）独立的手机消息气泡组成，每条气泡用换行符（\\n）或 ||| 分隔，表现自然的短句、回应、补充或追问；不要机械地按每个句号切碎，也不必每次强行拆成多条。'
          }日常聊天只展示手机消息正文，严禁混入小说式第三人称旁白、神态动作描写（如*动作*或括号动作）、时间戳或「${r.name}：」前缀。${
            isFocused
              ? '当前处于「专心聊」状态，双方都在手机前专注交谈，请自然连贯地回应；仍保有自己的性格与主见。'
              : '你仍在照常生活，不必总是立刻有空；但不要声称已执行未发生的行动。'
          }`
        : '你正在和用户面对面相处，采用文字小说式描写场景与自己的言语动作。只写你自己的回应，不替用户行动。';
    base += `\n\n玩家共享 DDL / 待办（所有角色可见，只能关心提醒，不得擅自改动）：${userTasksSummary(data) || '无'}。`;
    if (sharedDiaries) {
      base += `\n\n用户曾主动分享给你的个人日记（未在此列出的私人日记你不知情）：\n${sharedDiaries}`;
    }
    base += `\n\n可检索的剧外经历（并非保证完整，剧内虚构剧情不等于现实历史）：\n${facts || '暂无'}`;
  }

  const messages: { role: string; content: string }[] = [{ role: 'system', content: base }];
  const rawArr =
    kind === 'chat'
      ? r.chats
      : kind === 'scene'
      ? r.scene?.messages || []
      : kind === 'intermission'
      ? r.play?.intermissionMessages || []
      : r.play?.messages || [];

  const activeArr = getActiveMessages(rawArr);
  const userName = identityName(data, r);
  const history = activeArr
    .slice(-30)
    .filter((m) => m.speaker !== 'note')
    .map((m) => ({
      role: m.speaker === 'me' ? 'user' : 'assistant',
      content: formatMessageContentForModel(m, r.name, userName),
    }));

  const allowedRole = (roleStr?: string): string =>
    roleStr && ['system', 'user', 'assistant'].includes(roleStr) ? roleStr : 'system';

  const macros = (str: string): string =>
    String(str || '').replace(
      /\{\{(char|user|time|date|personality|description)\}\}/gi,
      (_, key: string) =>
        ({
          char: kind === 'play' ? r.play!.char : r.name,
          user: kind === 'play' ? r.play!.user : userName,
          time: hm(nowTs),
          date: dateStr(nowTs),
          personality: kind === 'play' ? r.play!.char : r.traits,
          description: kind === 'play' ? r.play!.world : r.profile,
        }[key.toLowerCase() as 'char' | 'user' | 'time' | 'date' | 'personality' | 'description'] ||
        '')
    );

  const preset = (r?.preset || data.preset)?.prompts || [];
  let historyInserted = false;
  const tail: { depth: number; item: { role: string; content: string } }[] = [];

  for (const p of preset) {
    if (!p.enabled) continue;
    if (p.marker) {
      if (/chatHistory/i.test(String(p.identifier || '')) && !historyInserted) {
        messages.push(...history);
        historyInserted = true;
      }
      continue;
    }
    if (!p.content) continue;
    const item = { role: allowedRole(p.role), content: macros(p.content) };
    if (Number(p.injection_position) === 1) {
      tail.push({ depth: Math.max(0, Number(p.injection_depth) || 0), item });
    } else {
      messages.push(item);
    }
  }

  if (!historyInserted) messages.push(...history);
  for (const { depth, item } of tail) {
    const at = Math.max(1, messages.length - depth);
    messages.splice(at, 0, item);
  }

  messages.push({
    role: 'system',
    content:
      kind === 'chat'
        ? '输出必须是纯文字手机聊天消息（可用换行或 ||| 分隔自然的多条气泡），严禁包含小说场景旁白、动作描写或角色名前缀。'
        : kind === 'scene'
        ? '这是面对面的文字小说，仅描述自己和环境，不替用户行动。'
        : kind === 'intermission'
        ? '这里是幕间讨论。你是戏外演员本人；不推进戏内剧情，不擅自操控用户。'
        : '这是独立戏剧世界，严格遵守本剧角色人设；不要透露戏外知识。',
  });

  return messages;
}

function sanitizeSingleBubbleText(
  raw: string,
  roleName?: string
): string {
  let s = String(raw || '').trim();
  if (!s) return '';
  // Strip markdown code fences if a model wrapped output
  s = s.replace(/^```(?:json|text)?\s*/i, '').replace(/\s*```$/i, '').trim();
  // Strip leading speaker prefix like "奈恩：" or "[奈恩]:"
  if (roleName) {
    const escapedName = roleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp(`^\\[?${escapedName}\\]?\\s*[:：]\\s*`), '');
  }
  // Strip inline asterisk stage directions like *笑了笑* or *放下手机*
  s = s.replace(/\*[^*\n]{1,40}\*/g, '').trim();
  // Strip standalone or leading stage direction in parentheses like （叹了口气） or （把风衣搭在椅背上）
  if (/^[（(][^）)\n]{1,50}[）)]$/.test(s)) {
    return '';
  }
  s = s.replace(/^[（(][^）)\n]{1,50}[）)]\s*/g, '').trim();
  return s.trim();
}

/**
 * Splits a raw AI chat reply into 1..4 natural phone message bubbles
 * while respecting character typing habits and stripping accidental stage narration.
 */
export function splitNaturalChatBubbles(
  rawText: string,
  role?: Pick<RoleData, 'name' | 'traits' | 'profile'> | null
): string[] {
  const input = String(rawText || '').trim();
  if (!input) return [];

  const roleName = role?.name || '';
  const traitsText = `${role?.traits || ''} ${role?.profile || ''}`;
  const isLaconic = /话少|寡言|惜字如金|简短|冷淡/.test(traitsText);
  const maxBubbles = isLaconic ? 2 : 4;

  let segments: string[] = [];

  // 1. Check structured JSON array or {"bubbles": [...]} format
  if (
    (input.startsWith('[') && input.endsWith(']')) ||
    (input.startsWith('{') && input.endsWith('}'))
  ) {
    try {
      const parsed = JSON.parse(input);
      const arr = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.bubbles)
        ? parsed.bubbles
        : Array.isArray(parsed?.messages)
        ? parsed.messages
        : null;
      if (arr) {
        segments = arr
          .map((x: unknown) =>
            typeof x === 'string'
              ? x
              : typeof (x as { text?: unknown })?.text === 'string'
              ? String((x as { text: string }).text)
              : ''
          )
          .map((x: string) => sanitizeSingleBubbleText(x, roleName))
          .filter(Boolean);
      }
    } catch {
      // Fallback to text parsing
    }
  }

  // 2. Check <bubble>...</bubble> tags
  if (!segments.length && /<bubble>[\s\S]*?<\/bubble>/i.test(input)) {
    const matches = [...input.matchAll(/<bubble>([\s\S]*?)<\/bubble>/gi)];
    segments = matches
      .map((m) => sanitizeSingleBubbleText(m[1], roleName))
      .filter(Boolean);
  }

  // 3. Check explicit ||| delimiter or newline splits
  if (!segments.length) {
    const rawParts = input.includes('|||')
      ? input.split(/\s*\|\|\|\s*/g)
      : input.split(/\n+/g);
    segments = rawParts
      .map((x) => sanitizeSingleBubbleText(x, roleName))
      .filter(Boolean);
  }

  // 4. If still a single segment and character is not laconic, check if there is a natural conversational transition or follow-up question
  if (segments.length === 1 && !isLaconic && segments[0].length >= 26) {
    const single = segments[0];
    // Split on natural topic-shift discourse markers after sentence-ending punctuation
    const markerSplit = single
      .split(/(?<=[。！？!?…~～])\s*(?=(?:对了|不过|话说|说起来|另外|至于|顺便|还有|而且|那么|你呢|那你))/g)
      .map((x) => x.trim())
      .filter(Boolean);
    if (markerSplit.length > 1) {
      segments = markerSplit;
    } else {
      // Or if there is a statement followed by a trailing question (not splitting every period!)
      const trailingQ = single.match(/^(.{12,}?[。！!…])\s*([^。！!？?]{4,}[？?~～]*[？?])$/);
      if (trailingQ) {
        segments = [trailingQ[1].trim(), trailingQ[2].trim()];
      }
    }
  }

  if (!segments.length) {
    const fallback = sanitizeSingleBubbleText(input, roleName) || input;
    return [fallback];
  }

  // Cap at maxBubbles by merging any trailing overflow into the last bubble
  if (segments.length > maxBubbles) {
    const head = segments.slice(0, maxBubbles - 1);
    const tailMerged = segments.slice(maxBubbles - 1).join(' ');
    return [...head, tailMerged];
  }

  return segments;
}
