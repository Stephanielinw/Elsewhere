import type {NovelDocument} from './novelDocument';
import type {PersonalThread,PersonalTicket,PersonalSource} from './roleLife';
import type {ProactiveState} from './proactiveChat';
import type {RoleMemoryLedger} from './memory';
import type {LifeTask,LifeRecord} from './autonomousLife';
import type {RoleLifePlan} from './lifeExecution';
export type ThemeName = 'blue' | 'green' | 'pink' | 'coffee' | 'night';

export type MessageKind = 'chat' | 'sticker' | 'photo' | 'voice' | 'packet' | 'scene' | 'play';

export type MessageStatus = 'active' | 'retracted';

export interface MessageQuote {
  id: string;
  speaker: 'me' | 'char' | 'note';
  text: string;
  at: number;
}

export interface ChatMessage {
  sceneReply?:SceneReplyTicket;
  id: string;
  speaker: 'me' | 'char' | 'note';
  text: string;
  at: number;
  kind?: MessageKind | string;
  status?: MessageStatus;
  editedAt?: number;
  revisionCount?: number;
  quote?: MessageQuote | null;
  sourceMessageId?: string;
  replyTo?: string;
  replyTurnId?: string;
  playSource?: {playId:string;endedAt:number;attemptId:string};
  replySourceIds?: string[];
  proactive?: boolean;
  novelOutput?: {document?:NovelDocument;presetId:string;mode:'meeting'|'theatre';scene?:string;summary?:string;characters?:string;choices?:string;generatedAuxiliary?:string;memoryEligible:false};
  // Media & rich message fields
  sticker?: string;
  mediaId?: string;
  caption?: string;
  seconds?: number;
  amount?: number;
  wish?: string;
}

export type RevisionActionType = 'edit' | 'retract' | 'regenerate';

export type RevisionScope = 'chat' | 'scene' | 'play' | 'intermission';

export interface MessageRevisionRecord {
  id: string;
  scope: RevisionScope;
  targetMessageId: string;
  action: RevisionActionType;
  speaker: 'me' | 'char' | 'note';
  previousText: string;
  newText?: string;
  at: number;
  reason?: string;
  supersededEventIds?: string[];
}

export interface EventRecord {
  lifeRecord?:LifeRecord;
  sourceRevision?: number;
  lifeEvidence?: 'confirmed';
  sceneChange?: {requestId:string;sceneId:string;sources:MeetingPlan['sources'];before:Pick<SceneData,'where'|'agreement'|'locationEvidence'>;after:Pick<SceneData,'where'|'agreement'|'locationEvidence'>};
  id: string;
  kind: 'life' | 'chat' | 'scene' | 'drama' | 'focus' | 'diary' | 'diary_share' | string;
  title: string;
  detail: string;
  at: number;
  speaker?: 'me' | 'char';
  where?: string;
  source?: string;
  messageId?: string;
  momentId?: string;
  diaryId?: string;
  status?: 'active' | 'superseded' | 'retracted';
  knownBy?: string[]; // Role IDs or 'user' that legitimately know this fact
}

export interface DiaryFactSummary {
  chatCount: number;
  sceneCount: number;
  dramaCount: number;
  focusCount: number;
  sharedDiaryCount: number;
  lifeRoutineCount: number;
  hasUserInteraction: boolean;
}

export type DiaryTaskStatus =
  | 'pending'
  | 'awaiting_api'
  | 'claimed'
  | 'generating'
  | 'uncertain'
  | 'ready'
  | 'stale'
  | 'completed'
  | 'failed';

export interface DiaryGenerationTask {
  id: string;
  roleId: string;
  dateKey: string; // YYYY-MM-DD local calendar date
  status: DiaryTaskStatus;
  attempts: number;
  requestAttempt?: string;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
  diaryId?: string;
  sourceMessageIds?: string[];
  sourceEventIds?: string[];
  factSummary?: DiaryFactSummary;
}

export interface DiaryEntry {
  memoryState?: {version:1;factIds:string[];ignoredMessageIds:string[]};
  sourceMessageRevisions?: Record<string,number>;
  continuitySources?: PersonalSource[];
  id: string;
  speaker: 'char' | 'me';
  at: number;
  dateKey?: string; // Target calendar date YYYY-MM-DD for daily character diaries
  generatedAt?: number; // Real timestamp when AI generated this entry
  title?: string;
  text: string;
  wordCount?: number;
  source?: 'life' | 'manual' | 'ai';
  sourceIds?: string[];
  sourceMessageIds?: string[];
  sourceEventIds?: string[];
  factSummary?: DiaryFactSummary;
  // For user diaries: explicit list of role IDs that the user has shared this diary with
  sharedWith?: string[];
  sharedAt?: Record<string, number>;
}

export interface MeetingPlan {
  interpretation?: 'scene-state-v1';
  status: 'proposed' | 'confirmed' | 'declined' | 'cancelled';
  where?: string;
  timeText?: string;
  scheduledAt?: number;
  expiresAt?: number;
  proposedBy: 'me' | 'char';
  acceptedBy: ('me' | 'char')[];
  sources: {id:string;at:number;text:string;revisionCount:number}[];
}

export interface SceneReplyTicket {
  inputIds?:string[];
  eventStatus?:'missing'|'malformed';
  requestId:string;
  roleId:string;
  sceneId:string|null;
  at:number;
  stateHash:string;
  previousPlan:MeetingPlan|null;
  sourceIds:string[];
  contextIds:string[];
  payload?:string;
}

export type EncounterPhase = 'approaching' | 'nearby' | 'interacting';

export interface NovelAttempt {
  id:string;inputId?:string;regenerateId?:string;at:number;
  state:'not-sent'|'unknown'|'returned'|'archived';warning?:boolean;
  code?:'preset'|'compile'|'timeout'|'cancelled'|'provider'|'format'|'save'|'stale'|'connection';
  presetIssue?:import('./fruit/presetIssue').PresetIssue;
  httpStatus?:number;finishReason?:string;presetId?:string;timeoutMs:number;
}
export interface SceneData {
  attendance?:{from:number;to?:number}[];
  id: string;
  startedAt: number;
  endedAt?: number;
  where: string;
  entryPhase?: EncounterPhase;
  agreement?: MeetingPlan;
  locationEvidence?: {origin:'agreement'|'generated'|'movement'|'unknown'|'manual';at:number;sources:MeetingPlan['sources'];contextIds?:string[]};
  draft?: string;
  opening?: {roundId:string;entry:'scheduled'|'immediate';status:'unsent'|'unknown'|'archived'};
  novelAttempt?:NovelAttempt;
  messages: ChatMessage[];
}

export interface PlayRevision {
  id: string;
  at: number;
  kind: 'rollback' | string;
  messages: ChatMessage[];
}

export interface PlayData {
  attendance?:{from:number;to?:number}[];
  id: string;
  title: string;
  world: string;
  user: string;
  char: string;
  startedAt: number;
  endedAt?: number;
  paused?: boolean;
  messages: ChatMessage[];
  intermissionMessages?: ChatMessage[];
  intermissionQueue?: {ids:string[];dueAt:number;blocked?:boolean};
  intermissionAttempts?: Record<string,{id:string;revision:number;status:'unknown'|'archived';triggerId?:string;sources?:{id:string;revision:number}[]}>;
  curtainReply?: {attempts:{id:string;at:number;status:'unknown'|'archived'}[]};
  novelAttempt?:NovelAttempt;
  revisions?: PlayRevision[];
}

export interface ChatBatch {
  id: string;
  roundId?: string;
  entry?: 'scheduled' | 'immediate';
  roleId: string;
  generation: number;
  sources: ChatMessage[];
  quietUntil: number;
  replyDueAt: number;
  revisionKey: string;
  sceneId: string | null;
  playId: string | null;
}

export interface ChatTimingState {
  version: 1;
  focused: boolean;
  generation: number;
  pending: string[];
  round?: {id:string;entry?:'scheduled'|'immediate';locked?:boolean;phoneAttempted?:boolean};
  quietUntil: number;
  replyDueAt?: number;
  inFlight?: ChatBatch;
  blocked?: 'api' | 'failed';
  error?: string;
}

export interface PendingReplyJob {
  personalReply?: {ticket:PersonalTicket;payload:string};
  proactiveId?: string;
  sceneReply?:SceneReplyTicket;
  id: string;
  replyTo: string;
  replyTurnId?: string;
  bubbles: string[];
  sources?: ChatMessage[];
  chatBatchId?: string;
  dueAt: number;
}

export interface ChatInviteState {
  status: 'later' | 'declined' | 'offered';
  dueAt: number | null;
}

export interface PresetPromptItem {
  identifier?: string;
  name?: string;
  role?: string;
  content?: string;
  enabled?: boolean;
  marker?: boolean;
  injection_position?: number;
  injection_depth?: number;
  [key: string]: unknown;
}

export interface PresetData {
  name: string;
  prompts: PresetPromptItem[];
  sourceOptions?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    min_p?: number;
    max_tokens?: number;
  };
}

export interface FirstMessageState {
  status: 'ready' | 'awaiting_api' | 'generating' | 'failed';
  error?: string;
  updatedAt: number;
}

export type FootprintArtifactType =
  | 'receipt'
  | 'ticket'
  | 'memo'
  | 'list'
  | 'letter'
  | 'dossier';

export type FootprintPaperStyle =
  | 'thermal'
  | 'ticket'
  | 'sticky'
  | 'parchment'
  | 'dossier'
  | 'craft';

export interface FootprintArtifactItem {
  name: string;
  qty?: string;
  price?: string;
  checked?: boolean;
  note?: string;
}

export interface FootprintArtifact {
  kind: FootprintArtifactType;
  paperStyle: FootprintPaperStyle;
  header: string;
  subheader?: string;
  serialNo?: string;
  timeLabel?: string;
  items?: FootprintArtifactItem[];
  totalLabel?: string;
  totalAmount?: string;
  currency?: string;
  bodyText?: string;
  footerNote?: string;
  groundedInEventIds?: string[];
}

export interface DailyFootprintItem {
  id: string;
  dateKey: string; // YYYY-MM-DD
  timestamp: number;
  timeLabel: string;
  durationLabel?: string;
  icon: string;
  category:
    | 'interaction'
    | 'scene'
    | 'focus'
    | 'drama'
    | 'diary_share'
    | 'life'
    | 'quiet';
  title: string;
  summary: string;
  where?: string;
  innerThought?: {
    mood: string;
    thought: string;
    surfaceState: string;
  };
  artifact?: FootprintArtifact | null;
  sourceEventIds: string[];
  sourceMessageIds: string[];
  rawTranscript?: {
    speaker: 'me' | 'char' | 'note';
    speakerLabel: string;
    text: string;
    at: number;
  }[];
  origin: 'grounded' | 'ai_enriched';
}

export interface DailyFootprintsArchive {
  dateKey: string;
  updatedAt: number;
  sourceSignature: string;
  calmDayNote?: string;
  items: DailyFootprintItem[];
  aiGeneratedAt?: number;
}

export interface CustomAvatarFrame {
  id: string;
  name: string;
  mediaId?: string;
  dataUrl?: string;
  sourceUrl?: string;
  createdAt: number;
}

export interface RoleData {
  lifePlans?:RoleLifePlan[];
  lifeTasks?:LifeTask[];
  memory?: RoleMemoryLedger;
  proactive?: ProactiveState;
  personalThreads?: PersonalThread[];
  id: string;
  name: string;
  emoji: string;
  job: string;
  traits: string;
  place: string;
  profile: string;
  relationship: string;
  canonNotes?: string;
  notes: string;
  userAlias?: string;
  demoSample?: boolean;
  demoStartResetAt?: number;
  theme?: ThemeName;
  font?: 'system' | 'serif';
  customFontId?: string;
  wallpaperMediaId?: string;
  bubbleCSS?: string;
  avatarMediaId?: string;
  frameId?: string;
  frameMediaId?: string;
  frameData?: string;
  frameScale?: number;
  frameX?: number;
  frameY?: number;
  frameLayoutVersion?: 1;
  preset: PresetData | null;
  chats: ChatMessage[];
  diaries: DiaryEntry[];
  events: EventRecord[];
  plays: PlayData[];
  meetings?: SceneData[];
  scene: SceneData | null;
  play: PlayData | null;
  lifeAt: number;
  diaryDay: string;
  lastInvitation: number;
  pendingReplies?: PendingReplyJob[];
  chatTiming?: ChatTimingState;
  chatVoice?: 'A' | 'B';
  chatInvite?: ChatInviteState | null;
  meetingPlan?: MeetingPlan | null;
  messageRevisions?: MessageRevisionRecord[];
  firstMessageState?: FirstMessageState;
  diaryTasks?: DiaryGenerationTask[];
  lastDiaryCheckDay?: string;
  footprintsByDate?: Record<string, DailyFootprintsArchive>;
}

export interface UserProfileData {
  name: string;
  pronouns: string;
  identity: string;
  background: string;
  notes: string;
  avatarMediaId?: string;
  frameId?: string;
  frameMediaId?: string;
  frameData?: string;
  frameScale?: number;
  frameX?: number;
  frameY?: number;
  frameLayoutVersion?: 1;
}

export interface FocusMoment {
  id: string;
  source: string;
  index: number;
  at: number;
  icon: string;
  title: string;
  detail: string;
  roleId?: string | null;
  roleName?: string;
  innerThought?: string;
  isAiGenerated?: boolean;
  aiAttempt?: {id:string;status:'unknown'|'archived'};
}

export interface FocusParticipantState {
  roleId: string;
  roleName: string;
  accepted: boolean;
  reason: string;
  statusText: string;
  currentThought?: string;
}

export interface FocusRoleSummary {
  roleId: string;
  roleName: string;
  text: string;
  at: number;
  source: 'grounded' | 'ai';
  error?: string;
}

export interface ActiveFocusSession {
  id: string;
  ownerId: string | null;
  phase: 'work' | 'break';
  minutes: number;
  durationMs: number;
  elapsedMs: number;
  runSince: number | null;
  status: 'running' | 'paused';
  startedAt: number;
  companion: boolean;
  moments: FocusMoment[];
  tasks?: string[];
  invitedRoleIds?: string[];
  participantRoleIds?: string[];
  participants?: FocusParticipantState[];
  nextLiveLogDueAt?: number;
  liveLogBusy?: boolean;
}

export interface CompletedFocusSession {
  id: string;
  ownerId: string | null;
  phase: 'work' | 'break';
  minutes: number;
  companion: boolean;
  startedAt: number;
  finishedAt: number;
  moments: FocusMoment[];
  dateKey?: string;
  plannedMinutes?: number;
  actualElapsedMs?: number;
  actualMinutes?: number;
  completionStatus?: 'completed' | 'ended_early';
  tasks?: string[];
  invitedRoleIds?: string[];
  participantRoleIds?: string[];
  participants?: FocusParticipantState[];
  roleSummaries?: FocusRoleSummary[];
  summaryStatus?: 'none' | 'ready' | 'generating' | 'failed';
  summaryError?: string;
  summaryRun?: {
    remainingRoleIds: string[];
    pendingRoleId?: string;
    pendingAttemptId?: string;
  };
}

export interface FocusState {
  workMinutes: number;
  breakMinutes: number;
  active: ActiveFocusSession | null;
  completed: CompletedFocusSession[];
  draftTasks?: string[];
  draftInvitedRoleIds?: string[];
  lastSettlementSessionId?: string | null;
}

export interface SharedTaskItem {
  completedAt?: number;
  id: string;
  text: string;
  due?: string;
  done: boolean;
  at: number;
}

export interface SharedTasksState {
  ddl: SharedTaskItem[];
  todo: SharedTaskItem[];
}

export interface SystemLogRecord {
  id: string;
  at: number;
  roleId: string | null;
  type: string;
  detail: string;
  [key: string]: unknown;
}

export interface ApiSettings {
  autonomousLife?:boolean;
  mode: 'demo' | 'api';
  endpoint: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface AppData {
  version: number;
  diaryWorldId?: string;
  draftWorldId?: string;
  theme: ThemeName;
  font: 'system' | 'serif';
  offset: number;
  roles: RoleData[];
  user: UserProfileData;
  selected: string | null;
  settings: ApiSettings;
  preset: PresetData | null;
  sampleMigrated?: boolean;
  focus?: FocusState;
  sharedTasks?: SharedTasksState;
  logs?: SystemLogRecord[];
  customFrames?: CustomAvatarFrame[];
  customFonts?: {id:string;name:string;mediaId:string}[];
  bubblePresets?: {id:string;name:string;css:string}[];
}

