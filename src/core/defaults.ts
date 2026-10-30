import type { AppData, RoleData } from './types';
import { makeUid } from './revisions';
import { initNewRoleFirstMessageState } from './firstMessage';

export const STORAGE_KEY = 'elsewhere-v01';

export function createRole(
  name: string,
  emoji: string,
  job: string,
  traits: string,
  place: string
): RoleData {
  return {
    id: makeUid('e'),
    name,
    emoji,
    job,
    traits,
    place,
    profile: `${name}有自己的生活、习惯和情绪；对话自然，能主动提起正在发生的事，也会有不同意见。`,
    relationship: '熟悉但彼此仍有很多未知',
    notes: '',
    preset: null,
    chats: [
      {
        id: makeUid('e'),
        speaker: 'char',
        text: '今天路过一家新开的店，门口的灯有点像电影里那种布景。你今天怎么样？',
        at: Date.now() - 12 * 60000,
        kind: 'chat',
        status: 'active',
      },
    ],
    diaries: [],
    events: [],
    plays: [],
    scene: null,
    play: null,
    lifeAt: Date.now() - 2 * 3600000,
    diaryDay: '',
    lastInvitation: 0,
    messageRevisions: [],
  };
}

export function makeNain(): RoleData {
  const r = createRole(
    '奈恩',
    '',
    '英国情报人员；以纽约警探身份潜伏美国',
    '冷静敏锐，调查与观察能力强；学会了伪装亲切与圆滑，但说话常有轻快的揶揄和英国式幽默；真正爱上约翰后，感情不再只是表演',
    '美国 · 密歇根'
  );
  r.demoSample = true;
  r.theme = 'coffee';
  r.userAlias = '妈咪';
  r.profile = `奈恩（Nain）是创作者的原创角色，绝非猫舍工作人员。原为伦敦受训的英国间谍，教官强调潜伏时不可感情用事。他最初并不爱笑，为融入他人刻意练习亲和与圆滑，逐渐有了“好人奈恩”的表面形象；真正的他冷静、敏锐、懂观察与潜伏，偶尔脱口而出尖锐但机灵的玩笑，不是模板化的开朗治愈系。带着与真名相同名、不同姓的纽约警探掩护身份来到美国，赴密歇根调查金博尔相关线索。曾陷入封闭洞穴，遇见道格拉斯·金博尔，被告知可能困在那里；后来被一名警察找到。奈恩一直称那名警察为“警察先生”，他的名字是约翰（John）；二人从相识、互相试探到逐渐相爱。奈恩偶尔顽皮地故意烦约翰，偷吃他午饭，送槲寄生、准备戒指，也可能在重要场合有些笨拙和谨慎。喜欢用轻快揶揄绕开沉重话题，但不是没有真实的愤怒、悲伤和道德冲突。说话需要机智与反应，不要反复套用“我理解你”的机器人安慰话术。他最喜欢的电影是《盗梦空间》。现阶段选在与约翰恋爱已持续一段时间、悲剧尚未发生的节点；本人并不知道故事作者所写的后来结局。`;
  r.relationship =
    '创作者与原创角色：奈恩知道你写过他的过去，曾与你在一间特殊的咖啡厅相会。他有自己的判断，不总是附和你；偶尔揶揄地称你为“妈咪”。他与约翰是恋人，和创作者不是恋人。';
  r.canonNotes =
    '特殊前史：奈恩曾在日落时与自己的创作者于一间窗外白茫茫、近似假设空间的咖啡厅相见；他穿着红棕色夹克，喝卡布奇诺，曾提到约翰。二人把创作权、角色的真实自由、生活中已经与尚未发生的事情当作谈资；奈恩会用带点嘲讽的口吻称作者为“妈咪”，观察对方神情并追问约翰的命运。创作者拒绝透露未来，送给他一枚红色亚克力六面骰，希望他自己决定今后的故事，奈恩收下并离开。作者另写过一段更晚的悲剧与告别，包括约翰的死亡和奈恩的悲痛，但那是创作者稿件里的可能未来，不是此时的已发生事实；不得自动给角色加载未来的记忆或让他接受已经发生。';
  r.place = '美国 · 密歇根';
  r.notes = '';
  initNewRoleFirstMessageState(r, undefined);
  r.lifeAt = Date.now();
  return r;
}

export function defaults(): AppData {
  return {
    version: 2,
    theme: 'coffee',
    font: 'system',
    offset: 0,
    roles: [makeNain()],
    user: { name: '', pronouns: '', identity: '', background: '', notes: '' },
    selected: null,
    settings: {
      mode: 'demo',
      endpoint: 'https://api.openai.com/v1',
      model: '',
      maxTokens: 550,
      temperature: 0.8,
    },
    preset: null,
  };
}

export function isUntouchedSample(r: RoleData | undefined): boolean {
  if (!r) return false;
  return (
    ['林澈', '阿遥'].includes(r.name) &&
    Array.isArray(r.chats) &&
    r.chats.length === 1 &&
    !r.scene &&
    !r.play &&
    !r.meetings?.length &&
    !r.plays?.length &&
    !(r.diaries || []).some((d) => d.source !== 'life') &&
    !(r.events || []).some((e) => e.kind !== 'life') &&
    !r.preset &&
    !r.notes &&
    !r.bubbleCSS &&
    !r.frameData &&
    !r.userAlias &&
    r.relationship === '熟悉但彼此仍有很多未知' &&
    r.profile ===
      `${r.name}有自己的生活、习惯和情绪；对话自然，能主动提起正在发生的事，也会有不同意见。` &&
    ((r.name === '林澈' &&
      r.job === '插画师' &&
      r.traits === '慢热、爱观察小细节、嘴上不太认输' &&
      r.place === '旧城区') ||
      (r.name === '阿遥' &&
        r.job === '书店职员' &&
        r.traits === '温和、独立、有自己的安排、偶尔幽默' &&
        r.place === '河岸区')) &&
    Boolean(r.chats[0]?.text?.startsWith('今天路过一家新开的店'))
  );
}

export function normalizeAndMigrateData(raw: unknown): AppData {
  let data = raw as AppData;
  if (!data || typeof data !== 'object' || !Array.isArray(data.roles)) {
    data = defaults();
  }
  if (!data.user || typeof data.user !== 'object') {
    data.user = {
      name: '',
      pronouns: '',
      identity: '',
      background: '',
      notes: '',
      avatarMediaId: '',
    };
  }
  for (const k of ['name', 'pronouns', 'identity', 'background', 'notes'] as const) {
    if (typeof data.user[k] !== 'string') data.user[k] = '';
  }
  if (typeof data.user.avatarMediaId !== 'string') {
    data.user.avatarMediaId = '';
  }
  if (typeof data.user.frameId !== 'string') {
    data.user.frameId = '';
  }
  if (typeof data.user.frameMediaId !== 'string') {
    data.user.frameMediaId = '';
  }
  if (typeof data.user.frameData !== 'string') {
    data.user.frameData = '';
  }
  if (!Array.isArray(data.customFrames)) {
    data.customFrames = [];
  }
  if (
    data.roles.length === 2 &&
    data.roles.every(isUntouchedSample) &&
    !data.sampleMigrated
  ) {
    data.roles = [makeNain()];
    data.selected = null;
    data.sampleMigrated = true;
  }
  if (!data.focus || typeof data.focus !== 'object') {
    data.focus = { workMinutes: 25, breakMinutes: 5, active: null, completed: [] };
  }
  if (!Array.isArray(data.focus.completed)) data.focus.completed = [];
  if (!data.sharedTasks || typeof data.sharedTasks !== 'object') {
    data.sharedTasks = { ddl: [], todo: [] };
  }
  if (!Array.isArray(data.sharedTasks.ddl)) data.sharedTasks.ddl = [];
  if (!Array.isArray(data.sharedTasks.todo)) data.sharedTasks.todo = [];
  if (!Array.isArray(data.logs)) data.logs = [];
  if (data.offset) {
    data.logs.push({
      id: makeUid('e'),
      at: Date.now(),
      roleId: null,
      type: 'migration',
      detail: '旧版演示时间快进已停用；后续世界时钟重新同步现实。',
    });
    data.offset = 0;
  }
  for (const r of data.roles) {
    if (!Array.isArray(r.chats)) r.chats = [];
    if (!Array.isArray(r.diaries)) r.diaries = [];
    // Remove legacy fixed-template diaries (source === 'life') so only real AI character diaries or user manual diaries remain
    r.diaries = r.diaries.filter(
      (d) => !(d && d.speaker === 'char' && d.source === 'life')
    );
    if (!Array.isArray(r.events)) r.events = [];
    if (!Array.isArray(r.plays)) r.plays = [];
    if (!Array.isArray(r.messageRevisions)) r.messageRevisions = [];
    if (!Array.isArray(r.diaryTasks)) r.diaryTasks = [];
    if (typeof r.avatarMediaId !== 'string') r.avatarMediaId = '';
    if (typeof r.frameId !== 'string') r.frameId = '';
    if (typeof r.frameMediaId !== 'string') r.frameMediaId = '';
    if (!r.footprintsByDate || typeof r.footprintsByDate !== 'object') {
      r.footprintsByDate = {};
    }
  }
  return data;
}
