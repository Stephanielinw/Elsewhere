import {
  ActiveFocusSession,
  AppData,
  CompletedFocusSession,
  FocusMoment,
  FocusParticipantState,
  FocusRoleSummary,
  FocusState,
  RoleData,
} from './types';
import { toLocalDateKey as getLocalDayKey } from './diary';

export const FOCUS_MIN_MINUTES = 5;
export const FOCUS_MAX_MINUTES = 120;
export const FOCUS_STEP_MINUTES = 5;
export const FOCUS_DEFAULT_MINUTES = 25;

export function clampFocusMinutes(raw: number, snapToStep = true): number {
  const num = Number(raw);
  if (!Number.isFinite(num)) return FOCUS_DEFAULT_MINUTES;
  const clamped = Math.max(FOCUS_MIN_MINUTES, Math.min(FOCUS_MAX_MINUTES, Math.round(num)));
  if (!snapToStep) return clamped;
  const snapped = Math.round(clamped / FOCUS_STEP_MINUTES) * FOCUS_STEP_MINUTES;
  return Math.max(FOCUS_MIN_MINUTES, Math.min(FOCUS_MAX_MINUTES, snapped));
}

export function stepFocusMinutes(current: number, deltaSteps: number): number {
  const base = clampFocusMinutes(current, true);
  return clampFocusMinutes(base + deltaSteps * FOCUS_STEP_MINUTES, true);
}

export function normalizeFocusTasks(draftTasks: string[] | undefined, pendingInput?: string): string[] {
  const list: string[] = [];
  if (Array.isArray(draftTasks)) {
    for (const item of draftTasks) {
      const trimmed = String(item || '').trim();
      if (trimmed && !list.includes(trimmed)) {
        list.push(trimmed);
      }
    }
  }
  if (pendingInput) {
    const parts = String(pendingInput)
      .split(/[\n,，;；]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const part of parts) {
      if (!list.includes(part)) {
        list.push(part);
      }
    }
  }
  return list;
}

export function formatFocusTaskSummary(tasks: string[] | undefined): string {
  const valid = (tasks || []).map((t) => String(t || '').trim()).filter(Boolean);
  if (!valid.length) return '自由专注';
  return valid.join(' · ');
}

export function computeFocusElapsedMs(session: ActiveFocusSession | null | undefined, nowTs = Date.now()): number {
  if (!session) return 0;
  const base = Math.max(0, Number(session.elapsedMs) || 0);
  if (session.status !== 'running' || !session.runSince) {
    return Math.min(session.durationMs, base);
  }
  const delta = Math.max(0, nowTs - session.runSince);
  return Math.min(session.durationMs, base + delta);
}

export function computeFocusRemainingMs(session: ActiveFocusSession | null | undefined, nowTs = Date.now()): number {
  if (!session) return FOCUS_DEFAULT_MINUTES * 60000;
  return Math.max(0, session.durationMs - computeFocusElapsedMs(session, nowTs));
}

export function formatDurationMinutesAndSeconds(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins === 0) return `${secs} 秒`;
  if (secs === 0) return `${mins} 分钟`;
  return `${mins} 分 ${secs} 秒`;
}

export interface InvitationDecision {
  accepted: boolean;
  reason: string;
  initialStatus: string;
  initialThought: string;
}

function getFocusLocalHour(nowTs: number): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Asia/Shanghai',
    });
    const val = parseInt(fmt.format(new Date(nowTs)), 10);
    return Number.isFinite(val) ? val % 24 : new Date(nowTs).getHours();
  } catch {
    return new Date(nowTs).getHours();
  }
}

export function evaluateRoleFocusInvitation(
  role: RoleData,
  tasks: string[],
  nowTs = Date.now(),
  forceOutcome?: 'accept' | 'decline'
): InvitationDecision {
  const taskLabel = formatFocusTaskSummary(tasks);
  const job = role.job || '手头的事';
  const place = role.place || '自己这边';

  if (forceOutcome === 'decline') {
    return {
      accepted: false,
      reason: `${role.name}现在正忙着处理紧急事务，暂时没法加入本次共同专注。`,
      initialStatus: '暂未参与',
      initialThought: `手头的事情还没收尾，这轮先不去打扰对方做「${taskLabel}」了。`,
    };
  }

  const localHour = getFocusLocalHour(nowTs);

  const isArchitect = /建筑|设计|画图|模型/.test(job);
  const isResearcher = /研究|档案|整理|学术|医|律师|编辑/.test(job);

  if (isArchitect) {
    return {
      accepted: true,
      reason: '已接受邀请，把图纸和草稿铺在桌边一起计时。',
      initialStatus: localHour >= 21 || localHour < 6
        ? `在${place}开着台灯改节点图，陪你一起推进「${taskLabel}」`
        : `在${place}对着立面图核尺寸，和你同步计时`,
      initialThought: `既然要弄「${taskLabel}」，这几十分钟就各忙各的，看谁先把进度推下去。`,
    };
  }

  if (isResearcher) {
    return {
      accepted: true,
      reason: '已接受邀请，将参考资料摊在案头安静陪同。',
      initialStatus: `在${place}翻阅${job}相关的卷宗，和你保持同一段专注节奏`,
      initialThought: `不用特意说话，各自把桌上的事处理完就好。`,
    };
  }

  return {
    accepted: true,
    reason: '已接受专注邀请，留在桌边各自处理手头事务。',
    initialStatus: `在${place}处理${job}，和你一起专注「${taskLabel}」`,
    initialThought: `看你准备做「${taskLabel}」，我也趁这段时间把手头的事理一理。`,
  };
}

/**
 * Computes the next Live Log interval in milliseconds.
 * Standard requirement: random attempt every 3–10 minutes.
 * For short sessions (e.g. 5–10 minutes), scales the first follow-up interval so at least 2+ logs occur during the session.
 */
export function computeNextLiveLogDelayMs(
  durationMs: number,
  existingMomentCount: number,
  rng: () => number = Math.random
): number {
  const r = Math.max(0, Math.min(1, rng()));
  const threeMin = 3 * 60 * 1000;
  const tenMin = 10 * 60 * 1000;

  if (durationMs <= 10 * 60 * 1000 && existingMomentCount <= 2) {
    // Ensure a 5–10 minute session still triggers a midpoint companion log around 35%–60% of duration
    const minDelay = Math.max(60 * 1000, Math.floor(durationMs * 0.35));
    const maxDelay = Math.max(minDelay + 30 * 1000, Math.floor(durationMs * 0.65));
    return Math.round(minDelay + r * (maxDelay - minDelay));
  }

  return Math.round(threeMin + r * (tenMin - threeMin));
}

export function buildInitialFocusLiveLogs(
  session: ActiveFocusSession,
  roles: RoleData[],
  nowTs = Date.now()
): FocusMoment[] {
  const safeAt = Math.min(nowTs, Date.now());
  const taskLabel = formatFocusTaskSummary(session.tasks);
  const participantIds = session.participantRoleIds || [];
  const moments: FocusMoment[] = [];

  if (participantIds.length === 0) {
    moments.push({
      id: `fm_${session.id}_init_solo`,
      source: 'focus-live-log',
      index: 0,
      at: safeAt,
      icon: '⏱️',
      title: `开始独自专注 · 计划 ${session.minutes} 分钟`,
      detail: `本次专注目标：${taskLabel}。手机通知已转入静音收拢，留出一段不被打断的时间。`,
      roleId: null,
      roleName: '独自专注',
    });
    return moments;
  }

  participantIds.forEach((roleId, idx) => {
    const role = roles.find((r) => r.id === roleId);
    const pState = (session.participants || []).find((p) => p.roleId === roleId);
    if (!role) return;

    const job = role.job || '手头的工作';
    const place = role.place || '桌前';
    const likeItem = '热饮';
    const isLaconic = /简短|少言|克制|冷淡|内敛/.test(String(role.traits || ''));

    const detail = isLaconic
      ? `${role.name}在${place}把手机调成静音扣在桌角，摊开${job}的资料，只低声留了一句：“开始吧，你先弄你的「${taskLabel}」。”`
      : `${role.name}在${place}旁放好一杯${likeItem}，顺手把通知切到免打扰：“计时开始了，你专心弄「${taskLabel}」，我也把今天${job}剩下的部分清掉。”`;

    const innerThought =
      pState?.currentThought ||
      `看你能安安静静推进多少「${taskLabel}」，这会儿先不打岔。`;

    moments.push({
      id: `fm_${session.id}_init_${role.id}_${idx}`,
      source: 'focus-live-log',
      index: idx,
      at: safeAt,
      icon: '⏳',
      title: `${role.name} · 进入专注状态`,
      detail,
      roleId: role.id,
      roleName: role.name,
      innerThought,
      isAiGenerated: false,
    });
  });

  return moments;
}

export function generateGroundedLiveLogMoment(
  session: ActiveFocusSession,
  roles: RoleData[],
  nowTs = Date.now(),
  stepNumber = 1
): FocusMoment | null {
  const safeAt = Math.min(nowTs, Date.now());
  const taskLabel = formatFocusTaskSummary(session.tasks);
  const elapsedMin = Math.max(1, Math.round(computeFocusElapsedMs(session, safeAt) / 60000));
  const participantIds = session.participantRoleIds || [];

  if (participantIds.length === 0) {
    const soloTemplates = [
      {
        icon: '📝',
        title: `专注进行中 · 已过 ${elapsedMin} 分钟`,
        detail: `周围很安静，注意力持续留在「${taskLabel}」上，外界消息已自动暂存。`,
      },
      {
        icon: '🍃',
        title: `节奏保持 · 第 ${elapsedMin} 分钟`,
        detail: `计时器平稳走字，继续按自己的步调推进「${taskLabel}」。`,
      },
    ];
    const pick = soloTemplates[(stepNumber - 1) % soloTemplates.length];
    return {
      id: `fm_${session.id}_solo_${stepNumber}_${safeAt}`,
      source: 'focus-live-log',
      index: session.moments.length,
      at: safeAt,
      icon: pick.icon,
      title: pick.title,
      detail: pick.detail,
      roleId: null,
      roleName: '独自专注',
    };
  }

  // Pick a participating character in round-robin order so every invited participant gets organic logs
  const roleId = participantIds[(stepNumber - 1) % participantIds.length];
  const role = roles.find((r) => r.id === roleId);
  if (!role) return null;

  const job = role.job || '手头的事';
  const place = role.place || '书桌边';
  const likeItem = '咖啡';
  const isArchitect = /建筑|设计|画图|模型/.test(job);
  const isLaconic = /简短|少言|克制|冷淡|内敛/.test(String(role.traits || ''));

  // Diverse companion behaviors: quiet own work, brief glance, characteristic quip, or own small distraction
  const variant = (stepNumber - 1) % 4;
  let icon = '✒️';
  let title = `${role.name} · 各自忙碌`;
  let detail = '';
  let innerThought = '';
  let statusUpdate = '';

  if (variant === 0) {
    // Quietly doing own work (no speech needed)
    icon = '📐';
    title = `${role.name} · 专注处理手头事务`;
    if (isArchitect) {
      detail = `${role.name}在${place}用比例尺量过一页草图，铅笔在纸面上划出很轻的沙沙声，没有抬头打扰你做「${taskLabel}」。`;
      innerThought = `这处结构节点的尺寸终于对上了……对面做「${taskLabel}」看着也挺稳。`;
      statusUpdate = `在${place}低头核对草图尺寸，安静陪你计时`;
    } else {
      detail = `${role.name}在${place}翻过一页${job}的资料，顺手在页边记下一行批注，全程保持着安静。`;
      innerThought = `先把这一章弄完，不去打断对面「${taskLabel}」的思路。`;
      statusUpdate = `在${place}安静整理${job}批注`;
    }
  } else if (variant === 1) {
    // Occasional progress check / brief natural remark
    icon = '👀';
    title = `${role.name} · 抬眼看了看时间`;
    if (isLaconic) {
      detail = `${role.name}端起手边的${likeItem}抿了一口，朝你的方向看了一眼：“已经过 ${elapsedMin} 分钟了。卡壳的话先记下来，别硬耗。”`;
      innerThought = `看表情还在推进「${taskLabel}」，应该不用多问。`;
      statusUpdate = `喝了一口${likeItem}，继续处理${job}`;
    } else {
      detail = `${role.name}伸了个懒腰，活动了一下手腕，压低声音问了一句：“「${taskLabel}」还顺手吗？我已经把最麻烦的一小节啃完了。”`;
      innerThought = `连续盯了 ${elapsedMin} 分钟屏幕，希望对方肩膀别绷太紧。`;
      statusUpdate = `刚处理完一节${job}，偶尔留意你的动静`;
    }
  } else if (variant === 2) {
    // Character's own small worry or work hiccup (not a generic study supervisor!)
    icon = '💭';
    title = `${role.name} · 手头的小插曲`;
    detail = `${role.name}对着自己面前的${job}皱了下眉，小声嘀咕了一句数据有点出入，翻找出一份旧记录重新比对，没顾上说话。`;
    innerThought = `奇怪，上周记的这组参数怎么差了一点……算了，趁这轮计时还在走，干脆彻底查清楚。`;
    statusUpdate = `正专注排查${job}里的一处小问题`;
  } else {
    // Brief care / quiet companion gesture
    icon = '☕';
    title = `${role.name} · 桌边的陪伴`;
    detail = `${role.name}把桌边偏掉的台灯光线往外拨了一点，又确认了一眼倒计时屏幕：“快到后半程了，按你自己的节奏收尾就行。”`;
    innerThought = `能这样各忙各的待一会儿，比干聊还踏实一点。`;
    statusUpdate = `在${place}进入收尾阶段，陪你完成本轮倒计时`;
  }

  // Update participant's current status & thought in session
  const pState = (session.participants || []).find((p) => p.roleId === role.id);
  if (pState) {
    pState.statusText = statusUpdate;
    pState.currentThought = innerThought;
  }

  return {
    id: `fm_${session.id}_log_${role.id}_${stepNumber}_${safeAt}`,
    source: 'focus-live-log',
    index: session.moments.length,
    at: safeAt,
    icon,
    title,
    detail,
    roleId: role.id,
    roleName: role.name,
    innerThought,
    isAiGenerated: false,
  };
}

/**
 * Syncs Live Logs for a running session based on real elapsed time and scheduled nextLiveLogDueAt.
 * Never generates logs when paused. Never generates future timestamps.
 */
export function syncActiveFocusLiveLogs(
  session: ActiveFocusSession,
  roles: RoleData[],
  nowTs = Date.now(),
  rng: () => number = Math.random
): FocusMoment[] {
  if (!session || session.status !== 'running') return [];
  const safeNow = Math.min(nowTs, Date.now());
  const elapsed = computeFocusElapsedMs(session, safeNow);
  const added: FocusMoment[] = [];

  // Ensure initial log exists
  if (!Array.isArray(session.moments) || session.moments.length === 0) {
    const initLogs = buildInitialFocusLiveLogs(session, roles, session.startedAt || safeNow);
    session.moments = [...initLogs];
    added.push(...initLogs);
  }

  const participantCount = Math.max(1, (session.participantRoleIds || []).length);
  const nonInitCount = Math.floor(Math.max(0, session.moments.length - participantCount));

  // Trigger a new Live Log if:
  // 1) nextLiveLogDueAt has been reached in wall-clock time, OR
  // 2) elapsed time has crossed 45% of planned duration and only initial logs exist so far
  const dueByClock = typeof session.nextLiveLogDueAt === 'number' && safeNow >= session.nextLiveLogDueAt;
  const dueByProgress = elapsed >= session.durationMs * 0.42 && nonInitCount === 0;

  if (dueByClock || dueByProgress) {
    const stepNumber = nonInitCount + 1;
    const moment = generateGroundedLiveLogMoment(session, roles, safeNow, stepNumber);
    if (moment) {
      session.moments.push(moment);
      added.push(moment);
    }
    session.nextLiveLogDueAt = safeNow + computeNextLiveLogDelayMs(session.durationMs, session.moments.length, rng);
  } else if (typeof session.nextLiveLogDueAt !== 'number') {
    session.nextLiveLogDueAt = safeNow + computeNextLiveLogDelayMs(session.durationMs, session.moments.length, rng);
  }

  return added;
}

export function createActiveFocusSession(options: {
  minutes: number;
  tasks: string[];
  invitedRoleIds: string[];
  roles: RoleData[];
  nowTs?: number;
  forceDecisionByRoleId?: Record<string, 'accept' | 'decline'>;
  rng?: () => number;
}): ActiveFocusSession {
  const nowTs = Math.min(options.nowTs ?? Date.now(), Date.now());
  const minutes = clampFocusMinutes(options.minutes, false);
  const durationMs = minutes * 60 * 1000;
  const normalizedTasks = normalizeFocusTasks(options.tasks);
  const tasks = normalizedTasks.length > 0 ? normalizedTasks : ['自由专注'];

  const uniqueInvited = Array.from(new Set((options.invitedRoleIds || []).filter(Boolean)));
  const participants: FocusParticipantState[] = [];
  const participantRoleIds: string[] = [];

  for (const roleId of uniqueInvited) {
    const role = options.roles.find((r) => r.id === roleId);
    if (!role) continue;
    const forced = options.forceDecisionByRoleId?.[roleId];
    const decision = evaluateRoleFocusInvitation(role, tasks, nowTs, forced);
    participants.push({
      roleId: role.id,
      roleName: role.name,
      accepted: decision.accepted,
      reason: decision.reason,
      statusText: decision.initialStatus,
      currentThought: decision.initialThought,
    });
    if (decision.accepted) {
      participantRoleIds.push(role.id);
    }
  }

  const session: ActiveFocusSession = {
    id: `focus_${nowTs}_${Math.random().toString(36).slice(2, 7)}`,
    ownerId: participantRoleIds[0] || null,
    phase: 'work',
    minutes,
    durationMs,
    elapsedMs: 0,
    runSince: nowTs,
    status: 'running',
    startedAt: nowTs,
    companion: participantRoleIds.length > 0,
    moments: [],
    tasks,
    invitedRoleIds: uniqueInvited,
    participantRoleIds,
    participants,
    liveLogBusy: false,
  };

  session.moments = buildInitialFocusLiveLogs(session, options.roles, nowTs);
  session.nextLiveLogDueAt =
    nowTs + computeNextLiveLogDelayMs(durationMs, session.moments.length, options.rng || Math.random);

  return session;
}

export function buildGroundedRoleFocusSummary(
  role: RoleData,
  record: CompletedFocusSession,
  nowTs = Date.now()
): FocusRoleSummary {
  const taskLabel = formatFocusTaskSummary(record.tasks);
  const actualDurationText = formatDurationMinutesAndSeconds(record.actualElapsedMs || record.minutes * 60000);
  const isCompleted = record.completionStatus !== 'ended_early';
  const isLaconic = /简短|少言|克制|冷淡|内敛/.test(String(role.traits || ''));
  const job = role.job || '手头的工作';

  let text = '';
  if (isCompleted) {
    if (isLaconic) {
      text = `这 ${actualDurationText} 很安静。你一直在推进「${taskLabel}」，我也顺便把${job}里压着的一小块收了尾。先歇会儿，喝口水。`;
    } else {
      text = `刚才这 ${actualDurationText} 过得比想象中快，看你一直专注在「${taskLabel}」上，我这边处理${job}的效率也跟着高了不少。计划时间到了，起来活动一下肩膀吧。`;
    }
  } else {
    if (isLaconic) {
      text = `这轮「${taskLabel}」先停在 ${actualDurationText} 也行。状态不对或者有别的事打断的时候，不用硬撑着凑满钟点。`;
    } else {
      text = `虽然这次在 ${actualDurationText} 提前结束了，但能静下心碰一会儿「${taskLabel}」也算开了个头。有临时状况就先去处理，等空下来我们再约下一轮。`;
    }
  }

  return {
    roleId: role.id,
    roleName: role.name,
    text,
    at: Math.min(nowTs, Date.now()),
    source: 'grounded',
  };
}

export function buildFocusSummaryAiPrompt(role: RoleData, record: CompletedFocusSession): string {
  const taskLabel = formatFocusTaskSummary(record.tasks);
  const actualDurationText = formatDurationMinutesAndSeconds(record.actualElapsedMs || 0);
  const statusLabel = record.completionStatus === 'ended_early' ? '提前结束' : '完整完成';
  const roleMoments = (record.moments || [])
    .filter((m) => !m.roleId || m.roleId === role.id)
    .map((m) => `- ${m.title}: ${m.detail}`)
    .join('\n');

  return [
    `你是「${role.name}」（职业/身份：${role.job || '未知'}；所在地：${role.place || '未知'}；说话风格：${role.traits || '自然克制'}）。`,
    `刚才你受邀陪伴用户进行了一轮专注计时：`,
    `- 用户专注任务：${taskLabel}`,
    `- 计划时长：${record.plannedMinutes || record.minutes} 分钟`,
    `- 实际有效专注时长：${actualDurationText}`,
    `- 完成状态：${statusLabel}`,
    roleMoments ? `- 专注期间的真实 Live Log 记录：\n${roleMoments}` : '',
    `请以「${role.name}」本人的口吻，写一段简短的专注结算小结（60-110字左右，纯正文，不要加引号或标题前缀）。`,
    `严格要求：`,
    `1. 必须符合你的性格与说话习惯，允许自然、克制、毒舌或平淡，不要写成千篇一律的温柔夸奖机器。`,
    `2. 严禁虚构用户已经做完某事，只根据“用户为「${taskLabel}」投入了 ${actualDurationText}（${statusLabel}）”这一真实事实说话。`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildFocusLiveLogAiPrompt(
  role: RoleData,
  session: ActiveFocusSession,
  elapsedMin: number
): string {
  const taskLabel = formatFocusTaskSummary(session.tasks);
  const prevLogs = (session.moments || [])
    .slice(-3)
    .map((m) => `- ${m.title}: ${m.detail}`)
    .join('\n');

  return [
    `你是「${role.name}」（职业：${role.job || '未知'}；所在地：${role.place || '未知'}；性格：${String(role.traits || '自然')}）。`,
    `你正在和用户一起进行专注计时（计划 ${session.minutes} 分钟，目前已专注 ${elapsedMin} 分钟）。`,
    `用户正在专注的任务是：「${taskLabel}」。`,
    prevLogs ? `最近的 Live Log：\n${prevLogs}` : '',
    `请生成一条此刻的真实陪伴动态，返回严格的 JSON 格式：`,
    `{"title":"简短标题，如：${role.name} · 翻阅资料","detail":"50-90字的动态或简短话语（不一定非要说话，可以是在忙自己的事、偶尔看一眼进度或自然叮嘱）","innerThought":"20-45字的角色此刻简短内心想法","statusText":"15-30字的角色当前状态"}`,
    `严禁虚构用户已经完成任务，严禁写成统一的学习监督员口吻。`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Settles the current active focus session (either 'completed' or 'ended_early').
 * Idempotent by session.id: never settles or writes memories twice.
 * Only writes shared focus memories to actually participating characters (`participantRoleIds`).
 */
export function settleActiveFocusSession(
  data: AppData,
  completionStatus: 'completed' | 'ended_early',
  nowTs = Date.now()
): CompletedFocusSession | null {
  if (!data.focus) return null;
  const active = data.focus.active;
  if (!active) return null;

  const safeNow = Math.min(nowTs, Date.now());
  if (!Array.isArray(data.focus.completed)) {
    data.focus.completed = [];
  }

  // Idempotency check
  const existing = data.focus.completed.find((c) => c.id === active.id);
  if (existing) {
    data.focus.active = null;
    data.focus.lastSettlementSessionId = existing.id;
    return existing;
  }

  const rawElapsed = computeFocusElapsedMs(active, safeNow);
  const actualElapsedMs =
    completionStatus === 'completed' ? active.durationMs : Math.min(active.durationMs, rawElapsed);
  const actualMinutes = Math.max(0, Math.round((actualElapsedMs / 60000) * 10) / 10);

  // Ensure a completed session has at least 2 Live Log entries so the timeline shows start + progression/completion
  const participantIds = active.participantRoleIds || [];
  if (completionStatus === 'completed') {
    const minExpected = Math.max(2, participantIds.length + 1);
    let safetyStep = 1;
    while (active.moments.length < minExpected && safetyStep <= 3) {
      const m = generateGroundedLiveLogMoment(active, data.roles || [], safeNow, safetyStep);
      if (m) active.moments.push(m);
      safetyStep += 1;
    }
    active.moments.push({
      id: `fm_${active.id}_done_${safeNow}`,
      source: 'focus-live-log',
      index: active.moments.length,
      at: safeNow,
      icon: '🔔',
      title: `专注计时完成 · 共 ${active.minutes} 分钟`,
      detail:
        participantIds.length > 0
          ? `倒计时归零，本轮「${formatFocusTaskSummary(active.tasks)}」专注结束。`
          : `独自专注倒计时结束，本轮「${formatFocusTaskSummary(active.tasks)}」已完成。`,
      roleId: null,
      roleName: '系统计时',
    });
  } else {
    active.moments.push({
      id: `fm_${active.id}_early_${safeNow}`,
      source: 'focus-live-log',
      index: active.moments.length,
      at: safeNow,
      icon: '⏹️',
      title: `提前结束专注 · 已专注 ${formatDurationMinutesAndSeconds(actualElapsedMs)}`,
      detail: `在计划 ${active.minutes} 分钟中途结束了本轮「${formatFocusTaskSummary(active.tasks)}」计时。`,
      roleId: null,
      roleName: '系统计时',
    });
  }

  const dateKey = getLocalDayKey(safeNow);
  const record: CompletedFocusSession = {
    id: active.id,
    ownerId: participantIds[0] || null,
    phase: 'work',
    minutes: active.minutes,
    companion: participantIds.length > 0,
    startedAt: active.startedAt,
    finishedAt: safeNow,
    moments: [...active.moments].sort((a, b) => a.at - b.at),
    dateKey,
    plannedMinutes: active.minutes,
    actualElapsedMs,
    actualMinutes,
    completionStatus,
    tasks: [...(active.tasks || ['自由专注'])],
    invitedRoleIds: [...(active.invitedRoleIds || [])],
    participantRoleIds: [...participantIds],
    participants: [...(active.participants || [])],
    roleSummaries: [],
    summaryStatus: participantIds.length > 0 ? 'ready' : 'none',
  };

  // Build grounded summaries for participating characters ONLY
  if (participantIds.length > 0) {
    for (const roleId of participantIds) {
      const role = (data.roles || []).find((r) => r.id === roleId);
      if (!role) continue;
      record.roleSummaries!.push(buildGroundedRoleFocusSummary(role, record, safeNow));
    }
  }

  // Write episodic memory ONLY to actually participating characters (`participantRoleIds`)
  const taskLabel = formatFocusTaskSummary(record.tasks);
  const durationLabel = formatDurationMinutesAndSeconds(actualElapsedMs);
  const statusLabel = completionStatus === 'completed' ? '完成了' : '进行了（提前结束）';

  for (const roleId of participantIds) {
    const role = (data.roles || []).find((r) => r.id === roleId);
    if (!role) continue;
    if (!Array.isArray(role.events)) role.events = [];
    role.events.unshift({
      id: `ev_focus_${record.id}_${role.id}`,
      at: safeNow,
      kind: 'focus',
      where: role.place || '桌边',
      source: 'focus-settlement',
      status: 'active',
      title: `共同专注 · ${taskLabel}`,
      detail: `${role.name}陪伴${data.user?.name || '你'}一起${statusLabel} ${durationLabel} 的专注计时（任务：${taskLabel}）。`,
      knownBy: ['user', role.id],
    });
  }

  data.focus.completed.unshift(record);
  data.focus.completed = data.focus.completed.slice(0, 120);
  data.focus.active = null;
  data.focus.lastSettlementSessionId = record.id;

  return record;
}

export function getFocusSessionDateKey(session: CompletedFocusSession): string {
  if (session.dateKey && /^\d{4}-\d{2}-\d{2}$/.test(session.dateKey)) {
    return session.dateKey;
  }
  return getLocalDayKey(session.finishedAt || session.startedAt || Date.now());
}

export function getFocusSessionsForDate(
  completed: CompletedFocusSession[] | undefined,
  dateKey: string
): CompletedFocusSession[] {
  if (!Array.isArray(completed)) return [];
  return completed
    .filter((item) => getFocusSessionDateKey(item) === dateKey)
    .sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
}

export function ensureFocusStateNormalized(focus: FocusState | undefined, roles: RoleData[]): FocusState {
  const workMinutes = clampFocusMinutes(focus?.workMinutes || FOCUS_DEFAULT_MINUTES, false);
  const completed: CompletedFocusSession[] = Array.isArray(focus?.completed)
    ? focus!.completed.map((item) => {
        const participantRoleIds = Array.isArray(item.participantRoleIds)
          ? item.participantRoleIds
          : item.companion && item.ownerId
          ? [item.ownerId]
          : [];
        const plannedMinutes = item.plannedMinutes || item.minutes || FOCUS_DEFAULT_MINUTES;
        const actualElapsedMs =
          typeof item.actualElapsedMs === 'number'
            ? item.actualElapsedMs
            : Math.max(0, (item.finishedAt || 0) - (item.startedAt || 0)) || plannedMinutes * 60000;
        const completionStatus = item.completionStatus || 'completed';
        const tasks = Array.isArray(item.tasks) && item.tasks.length > 0 ? item.tasks : ['自由专注'];
        const record: CompletedFocusSession = {
          ...item,
          dateKey: getFocusSessionDateKey(item),
          plannedMinutes,
          actualElapsedMs,
          actualMinutes:
            typeof item.actualMinutes === 'number'
              ? item.actualMinutes
              : Math.round((actualElapsedMs / 60000) * 10) / 10,
          completionStatus,
          tasks,
          invitedRoleIds: Array.isArray(item.invitedRoleIds) ? item.invitedRoleIds : [...participantRoleIds],
          participantRoleIds,
          participants: Array.isArray(item.participants) ? item.participants : [],
          moments: Array.isArray(item.moments) ? item.moments : [],
          summaryStatus: item.summaryStatus || (participantRoleIds.length > 0 ? 'ready' : 'none'),
        };
        if (!Array.isArray(record.roleSummaries)) {
          record.roleSummaries = participantRoleIds
            .map((rid) => {
              const r = roles.find((role) => role.id === rid);
              return r ? buildGroundedRoleFocusSummary(r, record, record.finishedAt || Date.now()) : null;
            })
            .filter((s): s is FocusRoleSummary => Boolean(s));
        }
        return record;
      })
    : [];

  return {
    workMinutes,
    breakMinutes: 5,
    active: focus?.active || null,
    completed,
    draftTasks: Array.isArray(focus?.draftTasks) ? focus!.draftTasks : [],
    draftInvitedRoleIds: Array.isArray(focus?.draftInvitedRoleIds)
      ? focus!.draftInvitedRoleIds
      : roles[0]
      ? [roles[0].id]
      : [],
    lastSettlementSessionId: focus?.lastSettlementSessionId ?? null,
  };
}
