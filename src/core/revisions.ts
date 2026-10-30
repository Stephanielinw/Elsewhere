import type {
  ChatMessage,
  EventRecord,
  MessageQuote,
  MessageRevisionRecord,
  RevisionScope,
  RoleData,
} from './types';

export function makeUid(prefix = 'e'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function ensureRevisionsList(role: RoleData): MessageRevisionRecord[] {
  if (!Array.isArray(role.messageRevisions)) {
    role.messageRevisions = [];
  }
  return role.messageRevisions;
}

export function getScopeMessages(role: RoleData, scope: RevisionScope): ChatMessage[] {
  if (scope === 'chat') return role.chats;
  if (scope === 'scene') return role.scene?.messages || [];
  if (scope === 'play') return role.play?.messages || [];
  return [];
}

/**
 * Returns only formal, active messages (excluding retracted/deleted/superseded messages).
 * Used by both UI rendering and model prompt assembly.
 */
export function getActiveMessages(messages: ChatMessage[] | undefined | null): ChatMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages.filter((m) => m && m.status !== 'retracted');
}

/**
 * Returns only formal, active events (excluding retracted or superseded events).
 * Used by memory retrieval, monitor timeline, and memories view.
 */
export function getActiveEvents(events: EventRecord[] | undefined | null): EventRecord[] {
  if (!Array.isArray(events)) return [];
  return events.filter((e) => e && e.status !== 'retracted' && e.status !== 'superseded');
}

function findLinkedEvents(role: RoleData, msg: ChatMessage): EventRecord[] {
  if (!Array.isArray(role.events)) return [];
  return role.events.filter((e) => {
    if (e.status === 'retracted' || e.status === 'superseded') return false;
    if (e.messageId && e.messageId === msg.id) return true;
    // Fallback matching for legacy events created before messageId was attached
    if (e.detail === msg.text && Math.abs((e.at || 0) - (msg.at || 0)) <= 1000) return true;
    return false;
  });
}

export function editMessage(
  role: RoleData,
  scope: RevisionScope,
  messageId: string,
  newTextRaw: string,
  nowTs = Date.now()
): {
  ok: boolean;
  reason?: string;
  revision?: MessageRevisionRecord;
  hadPendingReply?: boolean;
} {
  const newText = String(newTextRaw ?? '').trim();
  if (!newText) return { ok: false, reason: '消息内容不能为空' };

  const list = getScopeMessages(role, scope);
  const msg = list.find((m) => m.id === messageId && m.status !== 'retracted');
  if (!msg) return { ok: false, reason: '未找到目标消息' };
  if (msg.text === newText) return { ok: false, reason: '内容未发生变化' };

  const prevText = msg.text;
  const linked = findLinkedEvents(role, msg);
  const supersededEventIds: string[] = [];

  for (const ev of linked) {
    ev.status = 'superseded';
    supersededEventIds.push(ev.id);
    // Insert updated formal event preserving original occurrence timestamp
    role.events.push({
      ...ev,
      id: makeUid('ev'),
      detail: newText,
      messageId: msg.id,
      status: 'active',
    });
  }

  msg.text = newText;
  msg.editedAt = nowTs;
  msg.revisionCount = (msg.revisionCount || 0) + 1;

  // Also update any quote snapshots referencing this message so UI stays coherent
  for (const m of list) {
    if (m.quote?.id === msg.id) {
      m.quote.text = newText.slice(0, 160);
    }
  }

  // If this user message had a stale pending reply queued from the old text, drop it so caller can regenerate
  let hadPendingReply = false;
  if (scope === 'chat' && msg.speaker === 'me' && Array.isArray(role.pendingReplies)) {
    const beforeLen = role.pendingReplies.length;
    role.pendingReplies = role.pendingReplies.filter((job) => job.replyTo !== msg.id);
    hadPendingReply = role.pendingReplies.length < beforeLen;
  }

  const revision: MessageRevisionRecord = {
    id: makeUid('rev'),
    scope,
    targetMessageId: msg.id,
    action: 'edit',
    speaker: msg.speaker,
    previousText: prevText,
    newText,
    at: nowTs,
    supersededEventIds,
  };
  ensureRevisionsList(role).push(revision);

  return { ok: true, revision, hadPendingReply };
}

export function retractMessage(
  role: RoleData,
  scope: RevisionScope,
  messageId: string,
  nowTs = Date.now()
): { ok: boolean; reason?: string; revision?: MessageRevisionRecord } {
  const list = getScopeMessages(role, scope);
  const msg = list.find((m) => m.id === messageId && m.status !== 'retracted');
  if (!msg) return { ok: false, reason: '未找到可撤回的消息' };

  const linked = findLinkedEvents(role, msg);
  const supersededEventIds: string[] = [];
  for (const ev of linked) {
    ev.status = 'retracted';
    supersededEventIds.push(ev.id);
  }

  msg.status = 'retracted';
  msg.editedAt = nowTs;

  // Cancel any pending delayed reply that was triggered by this message
  if (scope === 'chat' && Array.isArray(role.pendingReplies)) {
    role.pendingReplies = role.pendingReplies.filter((job) => job.replyTo !== msg.id);
  }

  const revision: MessageRevisionRecord = {
    id: makeUid('rev'),
    scope,
    targetMessageId: msg.id,
    action: 'retract',
    speaker: msg.speaker,
    previousText: msg.text,
    at: nowTs,
    supersededEventIds,
  };
  ensureRevisionsList(role).push(revision);

  return { ok: true, revision };
}

export function prepareRegenerateReply(
  role: RoleData,
  scope: RevisionScope,
  charMessageId: string,
  nowTs = Date.now()
): {
  ok: boolean;
  reason?: string;
  promptMessage?: ChatMessage;
  isOpeningOrProactive?: boolean;
  revision?: MessageRevisionRecord;
  supersededMessageIds?: string[];
} {
  const list = getScopeMessages(role, scope);
  const active = getActiveMessages(list);
  const targetIdx = active.findIndex((m) => m.id === charMessageId);
  if (targetIdx < 0) return { ok: false, reason: '未找到要重抽的回复' };

  const targetMsg = active[targetIdx];
  if (targetMsg.speaker !== 'char') {
    return { ok: false, reason: '只能重抽角色的回复' };
  }

  // Walk backward to find the start of this AI reply turn (including preceding bubbles in the same turn)
  let turnStartIdx = targetIdx;
  while (turnStartIdx > 0) {
    const prev = active[turnStartIdx - 1];
    if (prev.speaker !== 'char') break;
    const sameTurnId =
      Boolean(targetMsg.replyTurnId) && prev.replyTurnId === targetMsg.replyTurnId;
    const sameReplyTo =
      Boolean(targetMsg.replyTo) && prev.replyTo === targetMsg.replyTo;
    const bothOpeningOrUnlinked = !targetMsg.replyTo && !prev.replyTo;
    if (sameTurnId || sameReplyTo || bothOpeningOrUnlinked) {
      turnStartIdx--;
    } else {
      break;
    }
  }

  // Find the nearest preceding user message in active history (if any) before this reply turn
  let promptMsg: ChatMessage | undefined;
  for (let i = turnStartIdx - 1; i >= 0; i--) {
    if (active[i].speaker === 'me') {
      promptMsg = active[i];
      break;
    }
  }

  // Group all character bubbles belonging to this reply turn (both before and after targetIdx)
  const toSupersedeMap = new Map<string, ChatMessage>();
  for (const m of active) {
    if (m.speaker === 'char') {
      if (targetMsg.replyTurnId && m.replyTurnId === targetMsg.replyTurnId) {
        toSupersedeMap.set(m.id, m);
      } else if (targetMsg.replyTo && m.replyTo === targetMsg.replyTo) {
        toSupersedeMap.set(m.id, m);
      }
    }
  }
  for (let i = turnStartIdx; i < active.length; i++) {
    const m = active[i];
    if (m.speaker === 'me') break;
    if (m.speaker === 'char') {
      if (
        !targetMsg.replyTo ||
        !m.replyTo ||
        m.replyTo === targetMsg.replyTo ||
        (targetMsg.replyTurnId && m.replyTurnId === targetMsg.replyTurnId) ||
        m.id === targetMsg.id
      ) {
        toSupersedeMap.set(m.id, m);
      }
    }
  }
  if (!toSupersedeMap.size) toSupersedeMap.set(targetMsg.id, targetMsg);

  const toSupersede = Array.from(toSupersedeMap.values());
  const supersededEventIds: string[] = [];
  const combinedPrevText = toSupersede.map((m) => m.text).join('\n\n');

  for (const m of toSupersede) {
    m.status = 'retracted';
    m.editedAt = nowTs;
    const linked = findLinkedEvents(role, m);
    for (const ev of linked) {
      ev.status = 'superseded';
      supersededEventIds.push(ev.id);
    }
  }

  // Also clear any pending reply bubbles belonging to this turn
  if (scope === 'chat' && Array.isArray(role.pendingReplies)) {
    role.pendingReplies = role.pendingReplies.filter((job) => {
      if (targetMsg.replyTurnId && job.replyTurnId === targetMsg.replyTurnId) {
        return false;
      }
      if (targetMsg.replyTo && job.replyTo === targetMsg.replyTo) {
        return false;
      }
      if (promptMsg && job.replyTo === promptMsg.id) {
        return false;
      }
      return true;
    });
  }

  const revision: MessageRevisionRecord = {
    id: makeUid('rev'),
    scope,
    targetMessageId: targetMsg.id,
    action: 'regenerate',
    speaker: 'char',
    previousText: combinedPrevText,
    at: nowTs,
    supersededEventIds,
  };
  ensureRevisionsList(role).push(revision);

  return {
    ok: true,
    promptMessage: promptMsg,
    isOpeningOrProactive: !promptMsg,
    revision,
    supersededMessageIds: toSupersede.map((m) => m.id),
  };
}

export function buildQuoteMetadata(msg: ChatMessage): MessageQuote {
  return {
    id: msg.id,
    speaker: msg.speaker,
    text: String(msg.text || '').slice(0, 160),
    at: msg.at,
  };
}

export function formatMessageContentForModel(
  msg: ChatMessage,
  roleName: string,
  userName: string
): string {
  if (!msg.quote) return msg.text;
  const quotedWho = msg.quote.speaker === 'me' ? userName || '用户' : roleName;
  return `[引用 ${quotedWho} 的消息：「${msg.quote.text}」]\n${msg.text}`;
}
