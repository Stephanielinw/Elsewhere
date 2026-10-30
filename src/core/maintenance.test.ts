import test from 'node:test';
import assert from 'node:assert/strict';
import type { ChatMessage } from './types';
import { createRole, defaults } from './defaults';
import { getLocalDayBounds } from './diary';
import { buildQuoteMetadata } from './revisions';
import { buildGroundedDailyFootprints } from './footprints';
import {
  buildFocusLiveLogAiPrompt,
  buildFocusSummaryAiPrompt,
  createActiveFocusSession,
  ensureFocusStateNormalized,
  settleActiveFocusSession,
} from './focus';

test('MAINT-002: footprints label quoted user and character messages across chat, scene and theater', () => {
  const role = createRole('审计角色', '', '研究员', '克制', '书房');
  role.userAlias = '测试用户';
  const day = getLocalDayBounds('2026-10-28');
  const at = day.startMs + 12 * 3600000;
  const messages = (scope: string): ChatMessage[] => {
    const user: ChatMessage = { id: scope + '_u', speaker: 'me', text: '用户原句', at };
    const char: ChatMessage = { id: scope + '_c', speaker: 'char', text: '角色原句', at: at + 1 };
    return [user, char,
      { id: scope + '_ru', speaker: 'char', text: '回应用户', at: at + 2, quote: buildQuoteMetadata(user) },
      { id: scope + '_rc', speaker: 'me', text: '回应角色', at: at + 3, quote: buildQuoteMetadata(char) },
    ];
  };
  role.chats = messages('chat');
  role.scene = { id: 'scene', startedAt: at, where: '书房', messages: messages('scene') };
  role.play = {
    id: 'play', title: '测试剧目', world: '虚构舞台', user: '旅人', char: '守门人',
    startedAt: at, messages: messages('play'), intermissionMessages: messages('backstage'),
  };
  const archive = buildGroundedDailyFootprints(role, '2026-10-28', day.endMs);
  for (const category of ['interaction', 'scene', 'drama']) {
    const item = archive.items.find((i) => i.category === category);
    assert.ok(item, category);
    const transcript = item.rawTranscript?.map((m) => m.text).join('\n') || '';
    assert.ok(transcript.includes('[引用 测试用户 的消息：「用户原句」]'), category);
    assert.ok(transcript.includes('[引用 审计角色 的消息：「角色原句」]'), category);
    assert.ok(!transcript.includes('undefined'), category);
    assert.ok(!item.summary.includes('undefined'), category);
  }
});

test('MAINT-002: Focus uses the saved persona in AI prompts without adding profile fields', () => {
  const data = defaults();
  const role = data.roles[0];
  role.traits = '少言克制，先核实再表达';
  const roleKeys = Object.keys(role).sort();
  const userBefore = structuredClone(data.user);
  const startedAt = Date.now() - 120000;
  const session = createActiveFocusSession({
    minutes: 25, tasks: ['核对资料'], invitedRoleIds: [role.id], roles: [role], nowTs: startedAt,
  });
  assert.deepEqual(session.participantRoleIds, [role.id]);
  assert.ok(buildFocusLiveLogAiPrompt(role, session, 1).includes(role.traits));
  data.focus = ensureFocusStateNormalized(data.focus, data.roles);
  data.focus.active = session;
  const record = settleActiveFocusSession(data, 'ended_early', startedAt + 60000);
  assert.ok(record);
  assert.ok(buildFocusSummaryAiPrompt(role, record).includes(role.traits));
  assert.deepEqual(Object.keys(role).sort(), roleKeys);
  assert.deepEqual(data.user, userBefore);
});
