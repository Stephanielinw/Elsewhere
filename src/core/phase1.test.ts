import test from 'node:test';
import assert from 'node:assert/strict';
import type { AppData, RoleData } from './types';
import {
  buildQuoteMetadata,
  editMessage,
  getActiveEvents,
  getActiveMessages,
  makeUid,
  prepareRegenerateReply,
  retractMessage,
} from './revisions';
import {
  applyGeneratedCharacterDiary,
  buildCharacterDiaryPrompt,
  collectDailyDiaryFacts,
  createUserDiary,
  getLocalDayBounds,
  getRoleKnownEvents,
  getSharedUserDiariesForRole,
  hasCharacterDiaryForDate,
  listMissingDiaryDateKeys,
  markDiaryTaskFailed,
  shareDiaryWithRole,
  syncRoleDiaryTasks,
} from './diary';
import {
  applyGeneratedFirstMessage,
  buildFirstMessagePrompt,
  initNewRoleFirstMessageState,
} from './firstMessage';
import { shouldDeferFullRenderOnTick } from './domGuard';
import {
  buildMessagesForModel,
  retrieve,
  splitNaturalChatBubbles,
} from './prompt';
import {
  buildFootprintCalendarMonth,
  buildGroundedDailyFootprints,
  detectRoleWorldProfile,
  renderSafeFootprintArtifact,
  validateAndSanitizeArtifact,
} from './footprints';
import {
  AVATAR_FRAME_AUDIT_STATS,
  PRESET_AVATAR_FRAMES,
  filterPresetAvatarFrames,
  findPresetAvatarFrameById,
  isAllowedAvatarFrameSource,
} from './avatarFrames';
import { collectReferencedMediaIds } from './media';
import {
  clampFocusMinutes,
  computeFocusElapsedMs,
  computeFocusRemainingMs,
  createActiveFocusSession,
  ensureFocusStateNormalized,
  formatFocusTaskSummary,
  getFocusSessionsForDate,
  normalizeFocusTasks,
  settleActiveFocusSession,
  stepFocusMinutes,
  syncActiveFocusLiveLogs,
} from './focus';

function makeMockRole(name = '奈恩'): RoleData {
  return {
    id: 'role_nain',
    name,
    emoji: '',
    job: '英国情报人员；以纽约警探身份潜伏美国',
    traits: '冷静敏锐，幽默揶揄',
    place: '美国 · 密歇根',
    profile: '奈恩是创作者的原创角色。',
    relationship: '创作者与原创角色',
    canonNotes: '悲剧尚未发生。',
    notes: '',
    userAlias: '妈咪',
    preset: null,
    chats: [],
    diaries: [],
    events: [],
    plays: [],
    scene: null,
    play: null,
    lifeAt: 1000000,
    diaryDay: '',
    lastInvitation: 0,
    messageRevisions: [],
  };
}

function makeMockAppData(role: RoleData): AppData {
  return {
    version: 2,
    theme: 'coffee',
    font: 'system',
    offset: 0,
    roles: [role],
    user: {
      name: '火羽',
      pronouns: '她',
      identity: '创作者',
      background: '写故事的人',
      notes: '',
    },
    selected: role.id,
    settings: {
      mode: 'demo',
      endpoint: 'https://api.openai.com/v1',
      model: '',
      maxTokens: 550,
      temperature: 0.8,
    },
    preset: null,
    sharedTasks: { ddl: [], todo: [] },
    logs: [],
  };
}

test('P1-1: shouldDeferFullRenderOnTick protects active inputs, IME composition, and open panels', () => {
  assert.equal(
    shouldDeferFullRenderOnTick({
      isComposing: true,
      activeTagName: 'DIV',
      activeElementId: '',
      chatPanelOpen: false,
      editingMessageId: null,
      intermissionToolsOpen: false,
    }),
    true
  );

  assert.equal(
    shouldDeferFullRenderOnTick({
      isComposing: false,
      activeTagName: 'TEXTAREA',
      activeElementId: 'message-input',
      chatPanelOpen: false,
      editingMessageId: null,
      intermissionToolsOpen: false,
    }),
    true
  );

  assert.equal(
    shouldDeferFullRenderOnTick({
      isComposing: false,
      activeTagName: 'BODY',
      activeElementId: '',
      chatPanelOpen: true,
      editingMessageId: null,
      intermissionToolsOpen: false,
    }),
    true
  );

  assert.equal(
    shouldDeferFullRenderOnTick({
      isComposing: false,
      activeTagName: 'BODY',
      activeElementId: '',
      chatPanelOpen: false,
      editingMessageId: null,
      intermissionToolsOpen: false,
    }),
    false
  );
});

test('P1-2: editMessage updates message & event, archives old text, and removes old text from model context', () => {
  const role = makeMockRole();
  const appData = makeMockAppData(role);
  const m1Id = makeUid('msg');
  const now = 2000000;

  role.chats.push({
    id: m1Id,
    speaker: 'me',
    text: '我们去旧城区秘密基地见面吧',
    at: now,
    kind: 'chat',
    status: 'active',
  });
  role.events.push({
    id: makeUid('ev'),
    kind: 'chat',
    title: '你说过',
    detail: '我们去旧城区秘密基地见面吧',
    at: now,
    speaker: 'me',
    messageId: m1Id,
    status: 'active',
  });

  const res = editMessage(role, 'chat', m1Id, '我们去河岸咖啡馆见面吧', now + 5000);
  assert.equal(res.ok, true);
  assert.equal(role.chats[0].text, '我们去河岸咖啡馆见面吧');
  assert.equal(role.chats[0].revisionCount, 1);
  assert.equal(role.messageRevisions?.length, 1);
  assert.equal(role.messageRevisions?.[0].previousText, '我们去旧城区秘密基地见面吧');
  assert.equal(role.messageRevisions?.[0].newText, '我们去河岸咖啡馆见面吧');

  // Verify retrieval and model prompt do NOT contain the old text
  const hitsOld = retrieve(role, '秘密基地', 10, now + 6000);
  assert.equal(
    hitsOld.some((e) => e.detail.includes('秘密基地')),
    false
  );
  const prompt = buildMessagesForModel(appData, role, 'chat', '见面', { nowTs: now + 6000 });
  const serialized = JSON.stringify(prompt);
  assert.equal(serialized.includes('秘密基地'), false);
  assert.equal(serialized.includes('河岸咖啡馆'), true);
});

test('P1-2: retractMessage removes message and event from active context while preserving revision history', () => {
  const role = makeMockRole();
  const appData = makeMockAppData(role);
  const msgId = makeUid('msg');
  const now = 3000000;

  role.chats.push({
    id: msgId,
    speaker: 'me',
    text: '不小心发错的绝密口令9981',
    at: now,
    kind: 'chat',
    status: 'active',
  });
  role.events.push({
    id: makeUid('ev'),
    kind: 'chat',
    title: '你说过',
    detail: '不小心发错的绝密口令9981',
    at: now,
    speaker: 'me',
    messageId: msgId,
    status: 'active',
  });

  const res = retractMessage(role, 'chat', msgId, now + 1000);
  assert.equal(res.ok, true);
  assert.equal(getActiveMessages(role.chats).length, 0);
  assert.equal(getActiveEvents(role.events).length, 0);
  assert.equal(role.messageRevisions?.length, 1);
  assert.equal(role.messageRevisions?.[0].action, 'retract');
  assert.equal(role.messageRevisions?.[0].previousText, '不小心发错的绝密口令9981');

  const prompt = buildMessagesForModel(appData, role, 'chat', '口令', { nowTs: now + 2000 });
  assert.equal(JSON.stringify(prompt).includes('绝密口令9981'), false);
});

test('P1-2: prepareRegenerateReply supersedes AI reply and returns triggering user message', () => {
  const role = makeMockRole();
  const appData = makeMockAppData(role);
  const now = 4000000;

  role.chats.push(
    {
      id: 'u1',
      speaker: 'me',
      text: '约翰今天执勤顺利吗？',
      at: now,
      kind: 'chat',
      status: 'active',
    },
    {
      id: 'c1',
      speaker: 'char',
      text: '旧的AI回复：他去买三明治了。',
      at: now + 100,
      kind: 'chat',
      replyTo: 'u1',
      status: 'active',
    }
  );
  role.events.push(
    {
      id: 'ev_u1',
      kind: 'chat',
      title: '你说过',
      detail: '约翰今天执勤顺利吗？',
      at: now,
      messageId: 'u1',
      status: 'active',
    },
    {
      id: 'ev_c1',
      kind: 'chat',
      title: '奈恩说过',
      detail: '旧的AI回复：他去买三明治了。',
      at: now + 100,
      messageId: 'c1',
      status: 'active',
    }
  );

  const regen = prepareRegenerateReply(role, 'chat', 'c1', now + 500);
  assert.equal(regen.ok, true);
  assert.equal(regen.promptMessage?.id, 'u1');
  assert.equal(getActiveMessages(role.chats).length, 1);
  assert.equal(getActiveMessages(role.chats)[0].id, 'u1');
  assert.equal(role.messageRevisions?.length, 1);
  assert.equal(role.messageRevisions?.[0].action, 'regenerate');
  assert.equal(role.messageRevisions?.[0].previousText, '旧的AI回复：他去买三明治了。');

  const prompt = buildMessagesForModel(appData, role, 'chat', '约翰', { nowTs: now + 600 });
  assert.equal(JSON.stringify(prompt).includes('旧的AI回复'), false);
});

test('P1-2: quote metadata is attached and formatted for model prompt', () => {
  const role = makeMockRole();
  const appData = makeMockAppData(role);
  const now = 5000000;
  const charMsg = {
    id: 'c_quote_target',
    speaker: 'char' as const,
    text: '那枚红色骰子，我收好了。',
    at: now,
    kind: 'chat',
    status: 'active' as const,
  };
  role.chats.push(charMsg);
  const quote = buildQuoteMetadata(charMsg);
  role.chats.push({
    id: 'u_reply',
    speaker: 'me',
    text: '那就好，别弄丢了。',
    at: now + 1000,
    kind: 'chat',
    quote,
    status: 'active',
  });

  const prompt = buildMessagesForModel(appData, role, 'chat', '那就好', { nowTs: now + 2000 });
  const lastUserMsg = prompt.find((m) => m.role === 'user' && m.content.includes('那就好'));
  assert.ok(lastUserMsg);
  assert.ok(lastUserMsg.content.includes('[引用 奈恩 的消息：「那枚红色骰子，我收好了。」]'));
});

test('P1-3: new role initializes awaiting_api when API is not configured, and generates prompt with full character profile', () => {
  const newRole = makeMockRole('沈青');
  newRole.job = '古籍修复师';
  newRole.traits = '安静、细致、说话慢条斯理';
  newRole.place = '苏州老街';
  newRole.profile = '沈青在老街经营一间古籍修复工坊。';
  newRole.relationship = '刚通过朋友介绍认识的委托人';

  const appData = makeMockAppData(newRole);
  initNewRoleFirstMessageState(newRole, appData.settings, 6000000);
  // In demo/unconfigured mode, must NOT insert fake canned greeting
  assert.equal(newRole.chats.length, 0);
  assert.equal(newRole.firstMessageState?.status, 'awaiting_api');

  const prompt = buildFirstMessagePrompt(newRole, appData.user, '10月28日 21:30');
  assert.equal(prompt.length, 2);
  assert.ok(prompt[0].content.includes('古籍修复师'));
  assert.ok(prompt[0].content.includes('刚通过朋友介绍认识的委托人'));

  applyGeneratedFirstMessage(newRole, ['你好，我是沈青。听说你有一册旧书需要修复？'], 6001000);
  assert.equal(newRole.chats.length, 1);
  assert.equal(newRole.firstMessageState?.status, 'ready');
  assert.equal(newRole.chats[0].speaker, 'char');
});

test('P1-4: user diary is strictly private until explicitly shared with a specific character', () => {
  const role = makeMockRole();
  const appData = makeMockAppData(role);
  const now = 7000000;

  const privateDiary = createUserDiary(role, '这是我绝对不想让任何人知道的私人秘密7749', now);
  const sharedDiary = createUserDiary(role, '今天在街角看到一只像奈恩的猫，想分享给他', now + 1000);
  assert.ok(privateDiary);
  assert.ok(sharedDiary);

  // Before sharing: neither diary is known by the role
  assert.equal(getSharedUserDiariesForRole(role).length, 0);
  assert.equal(
    getRoleKnownEvents(role).some((e) => e.detail.includes('7749') || e.detail.includes('像奈恩的猫')),
    false
  );
  const promptBefore = JSON.stringify(
    buildMessagesForModel(appData, role, 'chat', '日记 猫 秘密', { nowTs: now + 2000 })
  );
  assert.equal(promptBefore.includes('7749'), false);
  assert.equal(promptBefore.includes('像奈恩的猫'), false);

  // Share ONLY the second diary with Nain
  const shareRes = shareDiaryWithRole(role, sharedDiary.id, now + 3000);
  assert.equal(shareRes.ok, true);
  assert.equal(getSharedUserDiariesForRole(role).length, 1);

  const promptAfter = JSON.stringify(
    buildMessagesForModel(appData, role, 'chat', '日记 猫 秘密', { nowTs: now + 4000 })
  );
  // Private diary must STILL be invisible to Nain!
  assert.equal(promptAfter.includes('7749'), false);
  // Shared diary must now be visible in Nain's prompt & known events!
  assert.equal(promptAfter.includes('像奈恩的猫'), true);
});

test('UI 01-B: avatarMediaId is independent per user/role, collected for backup, and never sent to AI prompt', async () => {
  const { collectReferencedMediaIds } = await import('./media');
  const { normalizeAndMigrateData } = await import('./defaults');

  const nain = makeMockRole('奈恩');
  nain.avatarMediaId = 'ava_r_nain_01';
  const secondRole = makeMockRole('沈叙');
  secondRole.id = 'role_shenxu';
  secondRole.avatarMediaId = 'ava_r_shenxu_02';

  const appData = makeMockAppData(nain);
  appData.roles.push(secondRole);
  appData.user.avatarMediaId = 'ava_u_global_01';

  const mediaIds = collectReferencedMediaIds(appData);
  assert.deepEqual(mediaIds, ['ava_u_global_01', 'ava_r_nain_01', 'ava_r_shenxu_02']);

  // Verify changing secondRole's avatar does not affect Nain's avatar
  secondRole.avatarMediaId = 'ava_r_shenxu_replaced';
  assert.equal(nain.avatarMediaId, 'ava_r_nain_01');

  // Verify legacy save without avatarMediaId migrates cleanly to empty string
  const legacyRaw = JSON.parse(JSON.stringify(appData));
  delete legacyRaw.user.avatarMediaId;
  delete legacyRaw.roles[0].avatarMediaId;
  const migrated = normalizeAndMigrateData(legacyRaw);
  assert.equal(migrated.user.avatarMediaId, '');
  assert.equal(migrated.roles[0].avatarMediaId, '');
  assert.equal(migrated.roles[1].avatarMediaId, 'ava_r_shenxu_replaced');

  // Verify avatarMediaId is never injected into external AI model prompts
  const promptStr = JSON.stringify(
    buildMessagesForModel(appData, nain, 'chat', '你好', { nowTs: 8000000 })
  );
  assert.equal(promptStr.includes('ava_u_global_01'), false);
  assert.equal(promptStr.includes('ava_r_nain_01'), false);
});

test('Daily AI Diary 1 & 2: midnight rollover (00:00) & multi-day offline backfill enqueue once per dateKey without duplicates', () => {
  const role = makeMockRole('奈恩');
  const appData = makeMockAppData(role);

  // Simulate activity on 2026-10-27 and 2026-10-28, and current time at 2026-10-29 00:05 local time
  const day27 = getLocalDayBounds('2026-10-27');
  const day28 = getLocalDayBounds('2026-10-28');
  const nowOct29Midnight = new Date(2026, 9, 29, 0, 5, 0, 0).getTime();

  role.chats.push({
    id: 'm_oct27',
    speaker: 'me',
    text: '10月27日：今天密歇根冷吗？',
    at: day27.startMs + 14 * 3600000,
    kind: 'chat',
    status: 'active',
  });
  role.chats.push({
    id: 'm_oct28',
    speaker: 'me',
    text: '10月28日：约翰今天给你带咖啡了吗？',
    at: day28.startMs + 19 * 3600000,
    kind: 'chat',
    status: 'active',
  });
  // Also inject a legacy fake template diary to ensure it is stripped automatically
  role.diaries.push({
    id: 'legacy_fake_diary',
    speaker: 'char',
    at: day28.endMs,
    text: '今天有些事是按部就班的。有些话还没想好怎么讲。',
    source: 'life',
  });

  const missing = listMissingDiaryDateKeys(role, nowOct29Midnight);
  assert.deepEqual(missing, ['2026-10-27', '2026-10-28']);

  // First sync in demo mode -> tasks should be awaiting_api, legacy fake diary stripped
  const tasks1 = syncRoleDiaryTasks(role, appData.settings, nowOct29Midnight);
  assert.equal(
    role.diaries.some((d) => d.source === 'life'),
    false,
    'Legacy fake life template diary must be stripped'
  );
  assert.equal(tasks1.length, 2);
  assert.equal(tasks1[0].dateKey, '2026-10-27');
  assert.equal(tasks1[0].status, 'awaiting_api');
  assert.equal(tasks1[1].dateKey, '2026-10-28');
  assert.equal(tasks1[1].status, 'awaiting_api');

  // Re-running sync on refresh or tab switch must NOT duplicate tasks
  const tasks2 = syncRoleDiaryTasks(role, appData.settings, nowOct29Midnight + 30000);
  assert.equal(tasks2.length, 2);
  assert.equal(tasks2[0].id, tasks1[0].id);
  assert.equal(tasks2[1].id, tasks1[1].id);

  // Switching settings to real API mode promotes tasks from awaiting_api to pending
  appData.settings.mode = 'api';
  appData.settings.model = 'gpt-4o-mini';
  const tasks3 = syncRoleDiaryTasks(role, appData.settings, nowOct29Midnight + 60000);
  assert.equal(tasks3[0].status, 'pending');
  assert.equal(tasks3[1].status, 'pending');

  // Applying generated diary for 2026-10-28 marks task completed and prevents duplicate entries
  const res1 = applyGeneratedCharacterDiary(
    role,
    '2026-10-28',
    '10月28日，夜。\n\n约翰今天确实带了热咖啡，虽然那家店的美式一如既往地像刷锅水。',
    nowOct29Midnight + 70000
  );
  assert.equal(res1.ok, true);
  assert.equal(hasCharacterDiaryForDate(role, '2026-10-28'), true);
  assert.equal(
    role.diaries.filter((d) => d.speaker === 'char' && d.dateKey === '2026-10-28').length,
    1
  );

  // Calling applyGeneratedCharacterDiary again for the same date updates in place rather than duplicating
  applyGeneratedCharacterDiary(
    role,
    '2026-10-28',
    '10月28日，夜（修订后）。\n\n约翰今天带了热咖啡，妈咪在手机那头问起的时候我正好喝完最后一口。',
    nowOct29Midnight + 80000
  );
  assert.equal(
    role.diaries.filter((d) => d.speaker === 'char' && d.dateKey === '2026-10-28').length,
    1
  );
  assert.deepEqual(listMissingDiaryDateKeys(role, nowOct29Midnight + 90000), ['2026-10-27']);
});

test('Daily AI Diary 3, 6, 7 & 10: fact collection & prompt enforce Nain Canon, exclude private unshared diaries, exclude retracted/edited messages, and block future day leaks', () => {
  const nain = makeMockRole('奈恩');
  nain.demoSample = true;
  const appData = makeMockAppData(nain);

  const day28 = getLocalDayBounds('2026-10-28');
  const day29 = getLocalDayBounds('2026-10-29');

  // 1. Active chat on Oct 28
  nain.chats.push({
    id: 'msg_active',
    speaker: 'me',
    text: '那枚红色亚克力骰子你还随身带着吗？',
    at: day28.startMs + 10 * 3600000,
    kind: 'chat',
    status: 'active',
  });

  // 2. Edited chat on Oct 28 (old text must never appear in diary prompt)
  nain.chats.push({
    id: 'msg_edited',
    speaker: 'me',
    text: '旧版本错误台词：我们去纽约时代广场吧',
    at: day28.startMs + 11 * 3600000,
    kind: 'chat',
    status: 'active',
  });
  editMessage(
    nain,
    'chat',
    'msg_edited',
    '正式修改后台词：密歇根今晚风很大，执勤注意安全',
    day28.startMs + 11 * 3600000 + 5000
  );

  // 3. Retracted chat on Oct 28 (must never appear in diary prompt)
  nain.chats.push({
    id: 'msg_retracted',
    speaker: 'me',
    text: '已撤回的绝密消息：暗语8848',
    at: day28.startMs + 12 * 3600000,
    kind: 'chat',
    status: 'active',
  });
  retractMessage(nain, 'chat', 'msg_retracted', day28.startMs + 12 * 3600000 + 3000);

  // 4. Private unshared user diary vs Shared user diary on Oct 28
  createUserDiary(
    nain,
    '用户未分享的私密日记：我其实藏着一份草稿9900',
    day28.startMs + 15 * 3600000
  );
  const sharedD = createUserDiary(
    nain,
    '用户主动分享的日记：今天重温了《盗梦空间》，想起你的陀螺与骰子',
    day28.startMs + 16 * 3600000
  );
  shareDiaryWithRole(nain, sharedD!.id, day28.startMs + 16 * 3600000 + 1000);

  // 5. Future chat on Oct 29 (must NOT leak when backfilling Oct 28 diary!)
  nain.chats.push({
    id: 'msg_future_oct29',
    speaker: 'me',
    text: '10月29日未来才发生的事：明天见到了新线人7711',
    at: day29.startMs + 9 * 3600000,
    kind: 'chat',
    status: 'active',
  });

  const { messages, facts } = buildCharacterDiaryPrompt(
    nain,
    appData.user,
    '2026-10-28'
  );
  const fullPrompt = JSON.stringify(messages);

  // Must include active Oct 28 chat and shared Oct 28 diary
  assert.equal(facts.summary.hasUserInteraction, true);
  assert.equal(facts.summary.chatCount, 2);
  assert.equal(facts.summary.sharedDiaryCount, 1);
  assert.equal(fullPrompt.includes('红色亚克力骰子'), true);
  assert.equal(fullPrompt.includes('密歇根今晚风很大'), true);
  assert.equal(fullPrompt.includes('重温了《盗梦空间》'), true);

  // Must strictly exclude edited old text, retracted text, unshared diary, and Oct 29 future chat
  assert.equal(fullPrompt.includes('纽约时代广场'), false);
  assert.equal(fullPrompt.includes('暗语8848'), false);
  assert.equal(fullPrompt.includes('草稿9900'), false);
  assert.equal(fullPrompt.includes('新线人7711'), false);

  // Must include Nain Canon guard (British spy, Michigan, John/警察先生, tragedy NOT happened, not cat shelter)
  assert.equal(fullPrompt.includes('英国情报人员'), true);
  assert.equal(fullPrompt.includes('警察先生'), true);
  assert.equal(fullPrompt.includes('尚未发生'), true);
  assert.equal(fullPrompt.includes('绝非《喵喵馆》猫舍工作人员'), true);
});

test('Daily AI Diary 4, 5 & 8: zero-interaction day writes independent character life, multi-role styles differ, and failed task records error for safe retry', () => {
  const shenXu = makeMockRole('沈叙');
  shenXu.id = 'role_shenxu';
  shenXu.demoSample = false;
  shenXu.job = '苏州古籍修复师';
  shenXu.traits = '安静内敛、讲究章法、对纸张气味敏感';
  shenXu.place = '苏州平江路';
  shenXu.profile = '沈叙在平江路尽头守着一间老旧的古籍修复室，习惯在夜里听雨记事。';
  shenXu.relationship = '相识不久的旧书委托人';
  shenXu.canonNotes = '只知道目前修复的宋版残页，不知道委托人的私人过往。';
  shenXu.userAlias = '林小姐';

  const appData = makeMockAppData(shenXu);
  const day28 = getLocalDayBounds('2026-10-28');

  // Only routine life projection on Oct 28, zero user chats/scenes/focus
  shenXu.events.push({
    id: 'ev_life_1',
    kind: 'life',
    title: '下午的工作',
    detail: '修复工坊 · 调制浆糊，修补一册明代方志的虫蛀书叶',
    at: day28.startMs + 15 * 3600000,
    where: '修复工坊',
    status: 'active',
  });

  const { messages, facts } = buildCharacterDiaryPrompt(
    shenXu,
    appData.user,
    '2026-10-28'
  );
  assert.equal(facts.summary.hasUserInteraction, false);
  assert.equal(facts.summary.chatCount, 0);
  assert.equal(facts.summary.lifeRoutineCount, 1);

  const promptStr = JSON.stringify(messages);
  assert.equal(promptStr.includes('苏州古籍修复师'), true);
  assert.equal(promptStr.includes('当日无手机聊天记录'), true);
  assert.equal(
    promptStr.includes('自然书写你自己这一天的工作、生活细节与私人思绪，绝不要强行围绕用户抒情'),
    true
  );

  // Simulate API failure -> task marked failed with error, not completed
  const failedTask = markDiaryTaskFailed(
    shenXu,
    '2026-10-28',
    '接口返回 503: Service Temporarily Unavailable',
    day28.endMs + 10000
  );
  assert.equal(failedTask.status, 'failed');
  assert.equal(failedTask.lastError, '接口返回 503: Service Temporarily Unavailable');
  assert.equal(hasCharacterDiaryForDate(shenXu, '2026-10-28'), false);

  // Subsequent retry succeeds -> task becomes completed and diary is archived
  const retryRes = applyGeneratedCharacterDiary(
    shenXu,
    '2026-10-28',
    '十月廿八，夜，平江路微雨。\n\n今日工坊里很静，林小姐并未发来消息。午后调了新浆，将那册明代方志第三卷的虫蛀边缘逐寸托平。',
    day28.endMs + 25000
  );
  assert.equal(retryRes.ok, true);
  assert.equal(retryRes.task?.status, 'completed');
  assert.equal(retryRes.task?.lastError, undefined);
  assert.equal(hasCharacterDiaryForDate(shenXu, '2026-10-28'), true);
});

test('Track A 1 & 2: Monitor Daily Footprints consolidates chat sessions without per-line spam while preserving omniscient inner thoughts and verbatim transcripts', () => {
  const nain = makeMockRole('奈恩');
  const day28 = getLocalDayBounds('2026-10-28');

  // Multiple chat messages within a 45-min window + routine life events
  nain.chats.push(
    {
      id: 'm1',
      speaker: 'me',
      text: '今天在密歇根的雪停了吗？',
      at: day28.startMs + 14 * 3600000 + 10 * 60000,
    },
    {
      id: 'm2',
      speaker: 'char',
      text: '刚停，公路边还结着薄冰。我刚从路边餐馆买了一杯黑咖啡。',
      at: day28.startMs + 14 * 3600000 + 12 * 60000,
    },
    {
      id: 'm3',
      speaker: 'me',
      text: '晚上别忘了去重温《盗梦空间》。',
      at: day28.startMs + 14 * 3600000 + 18 * 60000,
    },
    {
      id: 'm4',
      speaker: 'char',
      text: '票已经夹在大衣口袋里了，陀螺我也带了。',
      at: day28.startMs + 14 * 3600000 + 20 * 60000,
    }
  );

  // Repetitive routine logs in the same slot + a 23:00 future event
  nain.events.push(
    {
      id: 'ev_r1',
      kind: 'life',
      title: '上午的工作',
      detail: '工作地点 · 处理手头事务，偶尔想到你',
      at: day28.startMs + 10 * 3600000,
      where: '工作地点',
    },
    {
      id: 'ev_r2',
      kind: 'life',
      title: '上午的工作',
      detail: '工作地点 · 处理手头事务，偶尔想到你',
      at: day28.startMs + 10 * 3600000 + 1800000,
      where: '工作地点',
    },
    {
      id: 'ev_future',
      kind: 'life',
      title: '深夜回家',
      detail: '家里 · 整理线索笔记',
      at: day28.startMs + 23 * 3600000,
      where: '家里',
    }
  );

  // At 16:00 on 2026-10-28:
  const recordAt16 = buildGroundedDailyFootprints(
    nain,
    '2026-10-28',
    day28.startMs + 16 * 3600000
  );

  // 4 chat messages in the 14:10-14:20 window are consolidated into 1 interaction footprint item
  const chatItems = recordAt16.items.filter((it) => it.category === 'interaction');
  assert.equal(chatItems.length, 1);
  assert.equal(chatItems[0].sourceMessageIds.length, 4);
  assert.equal(chatItems[0].title.includes('线上联络'), true);
  // Summary is third-person overview, NOT "奈恩说过……" / "你说过……" spam
  assert.equal(chatItems[0].summary.includes('奈恩说过'), false);
  assert.equal(chatItems[0].summary.includes('你说过'), false);
  // Omniscient inner thought and verbatim transcript are both preserved for expandable inspection
  assert.equal(Boolean(chatItems[0].innerThought && chatItems[0].innerThought.thought.length > 10), true);
  assert.equal((chatItems[0].rawTranscript || []).length, 4);
  assert.equal(chatItems[0].rawTranscript?.[0].text.includes('今天在密歇根的雪停了吗'), true);

  // Duplicate routine events with same title|where are deduplicated, and the 23:00 future event is hidden at 16:00
  const lifeItemsAt16 = recordAt16.items.filter((it) => it.category === 'life');
  assert.equal(lifeItemsAt16.length, 1);
  assert.equal(recordAt16.items.some((it) => it.title.includes('深夜回家')), false);

  // At 23:30 on 2026-10-28, the 23:00 event becomes visible
  const recordAt2330 = buildGroundedDailyFootprints(
    nain,
    '2026-10-28',
    day28.startMs + 23.5 * 3600000
  );
  assert.equal(recordAt2330.items.some((it) => it.title.includes('深夜回家')), true);
});

test('Track A 3, 4 & 5: Structured life artifacts strip XSS, enforce world/era rules, and share consistent facts with Daily AI Diary', () => {
  const nain = makeMockRole('奈恩');
  const shenXu = makeMockRole('沈叙');
  shenXu.id = 'role_shenxu';
  shenXu.job = '苏州古籍修复师';
  shenXu.place = '苏州平江路';
  shenXu.profile = '在平江路尽头守着古籍修复室。';

  const greekRole = makeMockRole('阿波罗多洛斯');
  greekRole.id = 'role_greek';
  greekRole.job = '雅典城邦哲学学者';
  greekRole.place = '古希腊 · 雅典卫城下';
  greekRole.profile = '古典时代城邦学者，记录羊皮卷与神庙碑铭。';

  assert.equal(detectRoleWorldProfile(nain), 'modern_us');
  assert.equal(detectRoleWorldProfile(shenXu), 'classical_cn');
  assert.equal(detectRoleWorldProfile(greekRole), 'ancient_west');

  // Ancient Greece strictly blocks modern receipts and tickets with modern currency/coffee
  const blockedReceipt = validateAndSanitizeArtifact(
    {
      kind: 'receipt',
      paperStyle: 'thermal',
      header: 'Starbucks Coffee · 卡布奇诺',
      items: [{ name: 'Latte', price: '$5.50' }],
    },
    greekRole
  );
  assert.equal(blockedReceipt, null);

  // Ancient Greece allows parchment notes while coercing thermal->parchment and stripping XSS tags
  const safeParchment = validateAndSanitizeArtifact(
    {
      kind: 'memo',
      paperStyle: 'thermal', // coerced to parchment for ancient_west
      header: '<script>alert(1)</script>卫城日晷手记',
      items: [{ name: '陶片铭文 <img src=x onerror=alert(1)>', note: '卫城西坡出土' }],
      footerNote: '雅典学园',
    },
    greekRole
  );
  assert.equal(Boolean(safeParchment), true);
  assert.equal(safeParchment?.paperStyle, 'parchment');
  assert.equal(safeParchment?.header.includes('<script>'), false);
  assert.equal(safeParchment?.items?.[0].name.includes('<img'), false);

  const renderedHtml = renderSafeFootprintArtifact(safeParchment!);
  assert.equal(renderedHtml.includes('<script>'), false);
  assert.equal(renderedHtml.includes('onerror='), false);
  assert.equal(renderedHtml.includes('fp-paper-parchment'), true);

  // Consistency between Monitor footprints and Character Daily AI Diary facts
  const day28 = getLocalDayBounds('2026-10-28');
  nain.chats.push({
    id: 'c_fact_1',
    speaker: 'char',
    text: '我在底特律郊外的旧书店买了一本1974年的旧地图册。',
    at: day28.startMs + 13 * 3600000,
  });
  const diaryFacts = collectDailyDiaryFacts(nain, '2026-10-28');
  const footprintRecord = buildGroundedDailyFootprints(
    nain,
    '2026-10-28',
    day28.endMs
  );
  assert.equal(diaryFacts.chatMessages.length, 1);
  assert.equal(
    footprintRecord.items[0].rawTranscript?.[0].text.includes('1974年的旧地图册'),
    true
  );

  // Calendar month builder marks active days with footprints
  const calMonth = buildFootprintCalendarMonth(nain, 2026, 10, '2026-10-28', day28.endMs);
  const cell28 = calMonth.cells.find((c) => c.dateKey === '2026-10-28');
  assert.equal(cell28?.hasActivity, true);
  assert.equal(cell28?.isSelected, true);
});

test('Track B & UI/UX 02: Preset Avatar Frame Gallery audits 363 unique frames without inferred theme categories, filters by keyword, and collects custom frame media IDs', () => {
  assert.equal(AVATAR_FRAME_AUDIT_STATS.rawArrayCount, 365);
  assert.equal(AVATAR_FRAME_AUDIT_STATS.rawFrameEntryCount, 364);
  assert.equal(AVATAR_FRAME_AUDIT_STATS.uniqueUrlCount, 363);
  assert.equal(AVATAR_FRAME_AUDIT_STATS.duplicateUrlCount, 1);
  assert.equal(PRESET_AVATAR_FRAMES.length, 363);

  // All preset IDs must be unique (preset_frame_001 .. preset_frame_363)
  const idSet = new Set(PRESET_AVATAR_FRAMES.map((f) => f.id));
  assert.equal(idSet.size, 363);
  assert.equal(findPresetAvatarFrameById('preset_frame_001')?.rawId, 'frame_cat_ear');
  assert.equal(findPresetAvatarFrameById('preset_frame_363')?.index, 363);

  // Keyword search filtering (no inferred theme categories)
  const allFrames = filterPresetAvatarFrames('');
  assert.equal(allFrames.length, 363);

  const search72 = filterPresetAvatarFrames('5578');
  assert.equal(search72.length, 1);

  // Allowlist check for frame sources
  assert.equal(isAllowedAvatarFrameSource('https://i.postimg.cc/wM439v4v/IMG-6872.gif'), true);
  assert.equal(isAllowedAvatarFrameSource('data:image/png;base64,iVBORw0KGgo='), true);
  assert.equal(isAllowedAvatarFrameSource('javascript:alert(1)'), false);

  // Backup media reference collection includes user.frameMediaId, role.frameMediaId, and customFrames
  const nain = makeMockRole('奈恩');
  nain.frameMediaId = 'media_role_frame_1';
  const appData = makeMockAppData(nain);
  appData.user.frameMediaId = 'media_user_frame_1';
  appData.customFrames = [
    {
      id: 'custom_frame_1',
      name: '我的自定义框',
      mediaId: 'media_custom_gallery_1',
      createdAt: 1000,
    },
  ];
  const mediaIds = collectReferencedMediaIds(appData);
  assert.equal(mediaIds.includes('media_role_frame_1'), true);
  assert.equal(mediaIds.includes('media_user_frame_1'), true);
  assert.equal(mediaIds.includes('media_custom_gallery_1'), true);
});

test('UI/UX 02.1: Natural multi-bubble reply splitter respects persona habits, parses structured/newline replies, and strips stage narration', () => {
  const nain = makeMockRole('奈恩');
  const laconicRole = makeMockRole('沈默');
  laconicRole.traits = '沉默寡言，话少，惜字如金';

  const jsonBubbles = splitNaturalChatBubbles(
    '["刚从警局出来，雨终于停了。", "你晚饭吃了吗？要不要我顺路带点宵夜？"]',
    nain
  );
  assert.deepEqual(jsonBubbles, [
    '刚从警局出来，雨终于停了。',
    '你晚饭吃了吗？要不要我顺路带点宵夜？',
  ]);

  const lineBubbles = splitNaturalChatBubbles(
    '（把风衣搭在椅背上）我刚忙完手头的案卷。\n你那边今天还顺利吗？\n要是困了就先睡，别硬撑着等我。',
    nain
  );
  assert.equal(lineBubbles.length, 3);
  assert.equal(lineBubbles[0].includes('把风衣搭在椅背上'), false);
  assert.equal(lineBubbles[0], '我刚忙完手头的案卷。');

  const silentBubbles = splitNaturalChatBubbles('到了。在楼下等你。', laconicRole);
  assert.equal(silentBubbles.length, 1);
  assert.equal(silentBubbles[0], '到了。在楼下等你。');
});

test('UI/UX 02.2: Regenerating any bubble in a multi-bubble AI reply turn invalidates the entire turn and all linked memories', () => {
  const role = makeMockRole('奈恩');
  role.chats.push(
    {
      id: 'u_turn_1',
      speaker: 'me',
      text: '今天警局忙不忙？',
      at: 1000,
    },
    {
      id: 'c_turn_1_b1',
      speaker: 'char',
      text: '刚把1974年那份卷宗归档完。',
      at: 1500,
      replyTo: 'u_turn_1',
      replyTurnId: 'turn_abc',
    },
    {
      id: 'c_turn_1_b2',
      speaker: 'char',
      text: '顺便去街角买了杯热美式。',
      at: 1501,
      replyTo: 'u_turn_1',
      replyTurnId: 'turn_abc',
    },
    {
      id: 'c_turn_1_b3',
      speaker: 'char',
      text: '你今天在家乖不乖？',
      at: 1502,
      replyTo: 'u_turn_1',
      replyTurnId: 'turn_abc',
    }
  );
  role.events.push(
    {
      id: 'ev_b1',
      kind: 'chat',
      knownBy: [role.id, 'user'],
      where: '美国 · 密歇根',
      title: '聊了一会儿',
      detail: '刚把1974年那份卷宗归档完。',
      at: 1500,
      messageId: 'c_turn_1_b1',
    },
    {
      id: 'ev_b2',
      kind: 'chat',
      knownBy: [role.id, 'user'],
      where: '美国 · 密歇根',
      title: '聊了一会儿',
      detail: '顺便去街角买了杯热美式。',
      at: 1501,
      messageId: 'c_turn_1_b2',
    }
  );

  const regen = prepareRegenerateReply(role, 'chat', 'c_turn_1_b2', 2500);
  assert.equal(regen.ok, true);
  assert.equal(regen.promptMessage?.text, '今天警局忙不忙？');
  assert.equal(regen.supersededMessageIds?.length, 3);

  const activeChats = getActiveMessages(role.chats);
  assert.equal(activeChats.length, 1);
  assert.equal(activeChats[0].id, 'u_turn_1');

  const activeEvents = getActiveEvents(role.events);
  assert.equal(activeEvents.length, 0);
});

test('UI/UX 03-B.1: Focus setup clamps duration (5-120 min, 5-min steps), normalizes multi-item tasks, and handles multi-role accept vs decline with strict memory isolation', () => {
  assert.equal(clampFocusMinutes(25), 25);
  assert.equal(clampFocusMinutes(2), 5);
  assert.equal(clampFocusMinutes(150), 120);
  assert.equal(stepFocusMinutes(25, 1), 30);
  assert.equal(stepFocusMinutes(25, -1), 20);

  const tasks = normalizeFocusTasks(['整理章节大纲'], '背单词，写测试报告');
  assert.deepEqual(tasks, ['整理章节大纲', '背单词', '写测试报告']);
  assert.equal(formatFocusTaskSummary(tasks), '整理章节大纲 · 背单词 · 写测试报告');

  const nain = makeMockRole('奈恩');
  nain.id = 'role_nain';
  const shenXu = makeMockRole('沈叙');
  shenXu.id = 'role_shenxu';
  shenXu.job = '苏州古籍修复师';
  shenXu.place = '苏州平江路';
  const thirdRole = makeMockRole('陆沉');
  thirdRole.id = 'role_luchen';

  const appData = makeMockAppData(nain);
  appData.roles = [nain, shenXu, thirdRole];

  const startTs = Date.now() - 20 * 60 * 1000;
  // Invite nain (accepts) and shenXu (declines), leave thirdRole uninvited
  const session = createActiveFocusSession({
    minutes: 15,
    tasks,
    invitedRoleIds: ['role_nain', 'role_shenxu'],
    roles: appData.roles,
    nowTs: startTs,
    forceDecisionByRoleId: {
      role_nain: 'accept',
      role_shenxu: 'decline',
    },
    rng: () => 0.2,
  });

  assert.deepEqual(session.invitedRoleIds, ['role_nain', 'role_shenxu']);
  assert.deepEqual(session.participantRoleIds, ['role_nain']);
  assert.equal(session.participants?.length, 2);
  assert.equal(session.participants?.[0].accepted, true);
  assert.equal(session.participants?.[1].accepted, false);

  // Initial Live Log generated only for accepted participant (nain), with real timestamp and innerThought
  assert.equal(session.moments.length, 1);
  assert.equal(session.moments[0].roleId, 'role_nain');
  assert.equal(Boolean(session.moments[0].innerThought), true);
  assert.equal(session.moments[0].at <= Date.now(), true);

  // Advance running session and sync Live Logs -> produces >= 2 distinct Live Logs
  const midTs = startTs + 8 * 60 * 1000;
  const addedMid = syncActiveFocusLiveLogs(session, appData.roles, midTs, () => 0.3);
  assert.equal(addedMid.length, 1);
  assert.equal(session.moments.length >= 2, true);
  assert.notEqual(session.moments[0].detail, session.moments[1].detail);

  // Pause session -> effective focus time stops accumulating and no new Live Logs are generated while paused
  session.elapsedMs = computeFocusElapsedMs(session, midTs);
  session.runSince = null;
  session.status = 'paused';
  const pausedElapsed1 = computeFocusElapsedMs(session, midTs + 60 * 1000);
  const pausedElapsed2 = computeFocusElapsedMs(session, midTs + 300 * 1000);
  assert.equal(pausedElapsed1, pausedElapsed2);
  const addedWhilePaused = syncActiveFocusLiveLogs(
    session,
    appData.roles,
    midTs + 600 * 1000
  );
  assert.equal(addedWhilePaused.length, 0);

  // Resume and complete session -> settleActiveFocusSession writes memory ONLY to nain, never to declined shenXu or uninvited thirdRole
  session.status = 'running';
  session.runSince = midTs + 600 * 1000;
  appData.focus = ensureFocusStateNormalized(appData.focus, appData.roles);
  appData.focus.active = session;

  const endTs = Date.now();
  const settled = settleActiveFocusSession(appData, 'completed', endTs);
  assert.equal(Boolean(settled), true);
  assert.equal(settled?.completionStatus, 'completed');
  assert.equal(settled?.plannedMinutes, 15);
  assert.equal(settled?.actualElapsedMs, 15 * 60 * 1000);
  assert.equal((settled?.moments.length || 0) >= 2, true);
  assert.equal(settled?.roleSummaries?.length, 1);
  assert.equal(settled?.roleSummaries?.[0].roleId, 'role_nain');

  // Verify strict memory isolation: nain has 1 focus event, shenXu (declined) and thirdRole (uninvited) have 0 focus events
  assert.equal(nain.events.filter((e) => e.kind === 'focus').length, 1);
  assert.equal(shenXu.events.filter((e) => e.kind === 'focus').length, 0);
  assert.equal(thirdRole.events.filter((e) => e.kind === 'focus').length, 0);

  // Verify Daily Character AI Diary fact collector recognizes the settled focus event for nain
  const todayKey = settled!.dateKey!;
  const nainDiaryFacts = collectDailyDiaryFacts(nain, todayKey);
  const shenDiaryFacts = collectDailyDiaryFacts(shenXu, todayKey);
  assert.equal(nainDiaryFacts.summary.focusCount, 1);
  assert.equal(shenDiaryFacts.summary.focusCount, 0);
});

test('UI/UX 03-B.2: Solo focus report never fabricates character summaries, early-ended sessions archive real elapsed time, and dateKey filter works across days', () => {
  const nain = makeMockRole('奈恩');
  const appData = makeMockAppData(nain);
  appData.focus = ensureFocusStateNormalized(appData.focus, appData.roles);

  const startTs = Date.now() - 6 * 60 * 1000;
  // Solo focus (invitedRoleIds = [])
  const soloSession = createActiveFocusSession({
    minutes: 25,
    tasks: ['独立阅读文献'],
    invitedRoleIds: [],
    roles: appData.roles,
    nowTs: startTs,
  });
  appData.focus.active = soloSession;

  // End early after 6 minutes
  const earlySettled = settleActiveFocusSession(
    appData,
    'ended_early',
    startTs + 6 * 60 * 1000
  );
  assert.equal(Boolean(earlySettled), true);
  assert.equal(earlySettled?.completionStatus, 'ended_early');
  assert.equal(earlySettled?.plannedMinutes, 25);
  assert.equal(earlySettled?.actualElapsedMs, 6 * 60 * 1000);
  assert.equal(earlySettled?.participantRoleIds?.length, 0);
  assert.equal(earlySettled?.roleSummaries?.length, 0);
  assert.equal(earlySettled?.summaryStatus, 'none');
  assert.equal(nain.events.filter((e) => e.kind === 'focus').length, 0);

  // Verify dateKey filtering for '我的计时记录'
  const dayKey = earlySettled!.dateKey!;
  const onDay = getFocusSessionsForDate(appData.focus.completed, dayKey);
  const otherDay = getFocusSessionsForDate(appData.focus.completed, '2020-01-01');
  assert.equal(onDay.length, 1);
  assert.equal(onDay[0].id, earlySettled?.id);
  assert.equal(otherDay.length, 0);
});




