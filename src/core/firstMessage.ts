import type { ApiSettings, ChatMessage, RoleData, UserProfileData } from './types';
import { makeUid } from './revisions';

export function awaitingFirstMessage(role: RoleData): boolean {
  return Boolean(role.firstMessageState && role.firstMessageState.status !== 'ready' &&
    !role.chats.some(m => m.speaker === 'char' && m.status !== 'retracted'));
}

export function awaitingNainOpening(role:RoleData):boolean {
  return (role.name==='奈恩'||role.demoSample===true)&&awaitingFirstMessage(role);
}

export function canUseRealModel(settings: ApiSettings | undefined): boolean {
  if (!settings) return false;
  return (
    settings.mode === 'api' &&
    /^https?:\/\//.test(String(settings.endpoint || '').trim()) &&
    Boolean(String(settings.model || '').trim())
  );
}

/**
 * Initializes a newly created role's chat & first-message state according to Bible 03 & P1-3:
 * - Never inserts a fake generic welcome line that pretends to be an AI response or violates canon.
 * - If real API is configured, marks status as 'generating' so the caller immediately invokes the model.
 * - If API is not configured (demo/unconnected), marks status as 'awaiting_api' so the UI transparently
 *   shows the waiting-for-connection card and lets the user connect API or trigger generation once connected.
 */
export function initNewRoleFirstMessageState(
  role: RoleData,
  settings: ApiSettings | undefined,
  nowTs = Date.now()
): void {
  role.chats = [];
  if (canUseRealModel(settings)) {
    role.firstMessageState = {
      status: 'generating',
      updatedAt: nowTs,
    };
  } else {
    role.firstMessageState = {
      status: 'awaiting_api',
      updatedAt: nowTs,
    };
  }
}

export function buildFirstMessagePrompt(
  role: RoleData,
  user: UserProfileData,
  nowFormatted: string
): { role: 'system' | 'user'; content: string }[] {
  const userSummary = [
    user?.name ? `名字：${user.name}` : '',
    role.userAlias ? `你对TA的称呼：${role.userAlias}` : '',
    user?.pronouns ? `代词：${user.pronouns}` : '',
    user?.identity ? `身份与性格：${user.identity}` : '',
    user?.background ? `背景：${user.background}` : '',
    role.notes ? `专属设定补充：${role.notes}` : '',
  ]
    .filter(Boolean)
    .join('；');

  return [
    {
      role: 'system',
      content: `你在扮演名为「${role.name}」的角色（不是AI助手）。
角色职业与身份：${role.job || '未指定'}
性格与表达习惯：${role.traits || '自然真实'}
所在区域/世界观：${role.place || '未指定'}
完整人物设定与过去：${role.profile || '以基本信息为准'}
前史与时间线边界：${role.canonNotes || '以当前设定为准，不剧透尚未发生的未来'}
你与用户的当前关系与故事起点：${role.relationship || '刚刚建立联系，关系尚待发展'}
用户已知信息：${userSummary || '尚不了解详细秘密'}
当前时间：${nowFormatted}

任务要求：
这是你们在这个手机聊天里的第一条消息，由你主动发出。
1. 必须严格符合你的性格、说话习惯、所处世界观以及你们目前的关系起点（若设定是陌生或初识，不要突然表现得像老熟人；若设定已有深厚前史，则自然承接前史）。
2. 采用纯手机短消息格式（1～3小段自然文字），绝对不要写小说式环境旁白、动作括号描写、时间戳或角色名前缀。
3. 不要使用千篇一律的“你好，很高兴认识你”客服腔。`,
    },
    {
      role: 'user',
      content: '（请根据你的角色设定、所处情境与我们的关系起点，向我发送第一条手机消息。）',
    },
  ];
}

export function applyGeneratedFirstMessage(
  role: RoleData,
  bubbles: string[],
  nowTs = Date.now()
): ChatMessage[] {
  const clean = bubbles.map((b) => String(b || '').trim()).filter(Boolean);
  const created: ChatMessage[] = [];
  for (let i = 0; i < clean.length; i++) {
    const at = nowTs + i;
    const msg: ChatMessage = {
      id: makeUid('msg'),
      speaker: 'char',
      text: clean[i],
      at,
      kind: 'chat',
      proactive: true,
      status: 'active',
    };
    role.chats.push(msg);
    role.events.push({
      id: makeUid('ev'),
      kind: 'chat',
      title: `${role.name}发来首条消息`,
      detail: clean[i],
      at,
      speaker: 'char',
      messageId: msg.id,
      status: 'active',
      knownBy: ['user', role.id],
    });
    created.push(msg);
  }
  role.firstMessageState = {
    status: 'ready',
    updatedAt: nowTs,
  };
  return created;
}
