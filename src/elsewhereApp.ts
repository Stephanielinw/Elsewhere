import {SAVE_ACCESS_EVENT,traceStorage,validateStoredWorld,type SaveSession} from './core/storageSession';
import {avatarView,renderWithAvatars} from './avatarView';
import {frameDraft,frameStyle,saveFrameOnly,DEFAULT_FRAME_SCALE,type FrameDraft,type AvatarFrameFields} from './core/avatarAppearance';
import {meetingTimeline,archiveMeeting} from './core/meetingHistory';
import {meetingCardHtml,meetingRecordHtml} from './meetingHistoryView';
import {logsForDay,logDays,logTimestamp} from './core/systemLogs';
import {meetingPlan,createEncounter,isFarewell,encounterHistory,updateEncounterLocation,commitSceneDecision} from './core/encounter';
import {createSceneObservation,sceneStateKey} from './core/sceneState';
import {prepareSceneReply,splitSceneReply,sceneReplyMatches,resolveSceneReply} from './core/sceneReply';
import {phoneMessagesAt} from './core/messageProvenance';
import {identityName,identityContext,buildNativeContext,compileNativeConversation,compileNovelConversation,compileOpeningPrompt,type NativePromptOptions} from './core/prompt';
import {ConversationCompileError,requestMessages,promptStructure,type ConversationCompilation} from './core/conversationPrompt';
import {loadRequestPreset} from './core/fruit/library';
import type {FruitPreset} from './core/fruit/types';
import {createNovelTasks,commitNovelReply,prepareNovelRegeneration,parseNovelResponse,readNovelResponse,novelSamplingParameters,type NovelKind} from './core/novelGeneration';
import {monitorItemsForDisplay} from './core/monitorPresentation';
import {uiIcon,plainUiLabel} from './uiIcons';
import {chatTiming,setChatFocused,enqueueChat,prepareChatDue,claimChatBatch,canChooseChatScene,chatSceneEntry,setChatScene,chatBatchValid,chatRevisionKey,completeChatBatch,failChatBatch,recoverChatTiming,retryChatTiming,reviseChatTiming,sourceStillValid} from './core/chatScheduler';
import {compileChatBatchPrompt,buildPhoneRegeneration,parseChatResponse,readChatResponse,readChatResponseBody} from './core/chatBatchPrompt';
import {startRequestDeadline} from './core/requestDeadline';
import {describeChatVoice,chatVoiceSummary} from './core/chatVoice';
import {preparePersonalReply,splitPersonalReply,applyPersonalReply,personalTicketValid,collectRoleLife} from './core/roleLife';
import {syncLifeBudget,reserveLifeAttempt} from './core/lifeBudget';
import {diaryRequestKey,diarySourceHash,readDiaryReceipt,replaceDiaryReceipt,type DiaryReceipt} from './core/diaryRequests';
import {claimLifeTask,prepareLifeTask,commitLifeTask,readLifeJournal,writeLifeJournal,lifeTaskState,LIFE_MAX_OUTPUT,type LifeTask} from './core/autonomousLife';
import {syncRoleMemory} from './core/memory';
import {claimProactive,proactiveTaskValid,finishProactive,recordProactiveDelivery,recoverProactive,proactiveInstruction,parseProactiveReply,type ProactiveTask} from './core/proactiveChat';
import {createChatVoiceDialog} from './chatVoiceView';
import {createHomeTasks} from './homeTasksView';
import {createHomePager} from './homePager';
import {novelMessageHtml} from './novelOutputView';
import {bindNovelDocument} from './core/novelDocument';
import {createNovelDisplay} from './novelDisplay';
import {safeBubbleCSS} from './core/bubbleCss';
import {DEVICE_API_KEY,readDeviceApiKey,saveDeviceApiKey} from './core/deviceApiKey';
import {normalizeApiBase} from './core/modelDiscovery';
import {createTerminalAppearance,appearanceFontFamily,hydrateAppearanceFont} from './terminalAppearance';
import {completionLimit} from './core/outputBudget';
import {uploadedStickers} from './core/stickers';
import {migrateUntouchedNainDemo,resetNainStart,NAIN_BACKUP_PREFIX} from './core/nainStart';
import { createTerminalApi } from './terminalApi';
import { createFruitManager } from './fruitManager';
import type {
  ActiveFocusSession,
  ChatBatch,
  SceneData,
  AppData,
  ChatMessage,
  CustomAvatarFrame,
  DiaryTaskStatus,
  EventRecord,
  MessageQuote,
  PlayData,
  RevisionScope,
  RoleData,
  ThemeName,
  UserProfileData,
} from './core/types';
import {
  STORAGE_KEY,
  createRole,
  defaults,
  normalizeAndMigrateData,
} from './core/defaults';
import {
  buildBackupPayload,
  createMediaSources,
  mediaGet,
  mediaPut,
  stageBackupMedia,
  validateBackupAttachments,
} from './core/media';
import {
  buildQuoteMetadata,
  editMessage,
  ensureRevisionsList,
  getActiveEvents,
  getActiveMessages,
  makeUid,
  prepareRegenerateReply,
  retractMessage,
} from './core/revisions';
import {
  AVATAR_FRAME_AUDIT_STATS,
  PRESET_AVATAR_FRAMES,
  filterPresetAvatarFrames,
  findPresetFrameByIdOrUrl,
  isAllowedFrameSource,
} from './core/avatarFrames';
import {
  buildFootprintCalendarMonth,
  getOrBuildDailyFootprints,
  resolveSafeMonitorDateKey,
} from './core/footprints';
import {
  applyGeneratedCharacterDiary,
  buildCharacterDiaryPrompt,
  collectDailyDiaryFacts,
  cleanGeneratedDiaryText,
  createUserDiary,
  getCharacterDiaryDateKey,
  getLocalDayBounds,
  hasCharacterDiaryForDate,
  isDiarySharedWithRole,
   parseDateKeyParts,
  shareDiaryWithRole,
  shiftDateKey,
  syncRoleDiaryTasks,
  toLocalDateKey,
} from './core/diary';
import {
  applyGeneratedFirstMessage,
  canUseRealModel,
  initNewRoleFirstMessageState,
  awaitingFirstMessage,
  awaitingNainOpening,
} from './core/firstMessage';
import {
  captureUIState,
  restoreUIState,
  shouldDeferFullRenderOnTick,
} from './core/domGuard';
import {
  dateStr,
  dt,
  hm,
  retrieve,
  routine,
  splitNaturalChatBubbles,
  userTasksSummary,
} from './core/prompt';
import {
  FOCUS_DEFAULT_MINUTES,
  buildFocusLiveLogAiPrompt,
  buildFocusSummaryAiPrompt,
  clampFocusMinutes,
  computeFocusElapsedMs,
  computeFocusRemainingMs,
  createActiveFocusSession,
  ensureFocusStateNormalized,
  formatDurationMinutesAndSeconds,
  formatFocusTaskSummary,
  getFocusSessionsForDate,
  normalizeFocusTasks,
  settleActiveFocusSession,
  stepFocusMinutes,
  syncActiveFocusLiveLogs,
} from './core/focus';

export function initElsewhereApp(saveSession:SaveSession): void {
  const novelDisplay=createNovelDisplay((roleId,stageId,mode,messageId)=>{
    const r=data.roles.find(r=>r.id===roleId);if(!r||data.selected!==roleId)return null;
    const stages=mode==='meeting'?[r.scene,...(r.meetings||[])]:[r.play,...(r.plays||[])];
    const stage=stages.find(s=>s?.id===stageId);if(!stage)return null;
    const messages=mode==='meeting'?encounterHistory(r,stage.messages):getActiveMessages(stage.messages),index=messages.findIndex(m=>m.id===messageId);if(index<0)return null;
    return {roleId,stageId,mode,message:messages[index],depth:messages.slice(index+1).filter(m=>m.speaker!=='note').length,names:mode==='theatre'&&'char'in stage?{char:stage.char,user:stage.user}:{char:r.name,user:identityName(data,r)}};
  });
  const fruitManager = createFruitManager({currentRole:()=>{const r=role();return r?{id:r.id,name:r.name}:null;},roles:()=>data.roles.map(r=>({id:r.id,name:r.name})),leave:()=>go('home'),legacyInfo:()=>{const p=role()?.preset||data.preset;return p?`旧版原生附加预设仍按既有存档生效：${p.name}（${p.prompts.length} 条）。小说选择不改写它，不将果实注入手机聊天。`:'';}});
  const terminalApi = createTerminalApi({settings:()=>data.settings,key:()=>token,notify:message=>notify(message),save:(settings,key)=>{
    if(!saveSession.current())throw new Error(saveError());
    const previous=data.settings,previousKey=localStorage.getItem(DEVICE_API_KEY);
    try {
      saveDeviceApiKey(localStorage,settings.endpoint,key);
      data.settings={...settings,autonomousLife:previous.autonomousLife};
      if(!save())throw new Error('设置保存失败，原配置已保留。');
    } catch {
      data.settings=previous;
      try { if(previousKey===null)localStorage.removeItem(DEVICE_API_KEY);else localStorage.setItem(DEVICE_API_KEY,previousKey); } catch { throw new Error('本地存储不可用，无法保存设置。请检查浏览器存储权限。'); }
      throw new Error('设置保存失败，原配置和 Key 已保留。');
    }
    const nextKey=key.trim();
    if(nextKey!==token||previous.endpoint!==settings.endpoint||previous.model!==settings.model
      ||previous.mode!==settings.mode||previous.temperature!==settings.temperature||previous.maxTokens!==settings.maxTokens)apiConnectionVersion++;
    token=nextKey;
    for(const item of data.roles)syncRoleDiaryTasks(item,data.settings,now());
    if(canUseRealModel(data.settings))void processDiaryQueue();
  }});
  const terminalAppearance=createTerminalAppearance({data:()=>data,role:()=>role(),save:()=>save(),saveError:()=>saveError(),apply:()=>applyTerminalAppearance(),notify:message=>notify(message)});
  const $ = <T extends HTMLElement = HTMLElement>(s: string): T | null =>
    document.querySelector<T>(s);
  const esc = (s: unknown): string =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        }[c] || c)
    );
  const uid = (): string => makeUid('e');
  const now = (): number => Date.now();

  const rawLoaded=saveSession.initial.value,originalSave=saveSession.raw;
  const stored=rawLoaded as Partial<AppData>|null;
  const appearanceCounts=[stored?.customFonts?.length||0,stored?.bubblePresets?.length||0];
  const normalizedData=normalizeAndMigrateData(rawLoaded);
  if((normalizedData.customFonts?.length||0)<appearanceCounts[0]||(normalizedData.bubblePresets?.length||0)<appearanceCounts[1]){traceStorage('normalization-rejected',{reason:'appearance-list-loss'});throw Error('unsafe-normalization');}
  const nainMigration=originalSave&&saveSession.hasWriter()?migrateUntouchedNainDemo(normalizedData,saveSession.storage,Date.now(),originalSave):{data:normalizedData,cleaned:false,error:undefined};
  let data: AppData = nainMigration.data;

  let view = 'landing';
  let lastRenderedView = 'landing';
  let roleFormReturnView: 'chat' | 'roleinfo' | 'landing' = 'landing';
  let pendingScrollAnchorSelector = '';
  let diaryTab: 'char' | 'me' = 'char';
  let formMode: 'new' | 'edit' = 'new';
  let editingRoleId: string | null = null;
  let deleteRoleId: string | null = null;
  let busy = false;
  const activeModelReads=new Map<Pick<ReturnType<typeof startRequestDeadline>,'cancel'|'check'>,boolean>();
  let modelPageEpoch=0;
  let modelPageHidden=false;
  const intermissionOperations=new WeakMap<PlayData,AbortController>();
  const intermissionRecovery=new WeakMap<PlayData,{sourceId:string;text:string}>();
  let token = readDeviceApiKey(localStorage,data.settings.endpoint);
  let apiConnectionVersion = 0;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  const activeChatRequests = new Map<string,AbortController>();
  const chatTyping = new Set<string>();
  let chatPanel = '';
  type DraftMode = 'chat' | NovelKind | 'intermission';
  type DraftBinding = {
    world:AppData; owner:RoleData; mode:DraftMode; stage:SceneData|PlayData|null;
    form:HTMLFormElement; input:HTMLTextAreaElement;
  };
  const draftMemory = new Map<string,string>();
  const draftWorldCandidates = new WeakMap<AppData,string>();
  let mountedDrafts:DraftBinding[] = [];
  let novelViewKind:NovelKind='scene';
  let systemLogDate:string|null=null;
  type VoiceOperation = {
    id:number;world:AppData;owner:RoleData;
    phase:'waiting'|'recording'|'finishing'|'saving'|'done';
    recoveryOnly:boolean;recoveryOffered?:boolean;stream?:MediaStream;recorder?:MediaRecorder;
    startedAt:number;seconds:number;caption:string;quote:ChatMessage['quote'];
    stopTimer?:ReturnType<typeof setTimeout>;
  };
  const voiceLimit=8*1024*1024;
  let voiceOperation:VoiceOperation|null=null,voiceSequence=0,voicePageHidden=false;
  const voiceFinishing=new Map<VoiceOperation,Blob|null>();
  const voiceRecoveries=new WeakMap<RoleData,Map<number,{world:AppData;blob:Blob|null}>>();
  const mediaSources = createMediaSources(mediaGet);
  const avatarLoadingIds=new Set<string>();
  const avatarPreviewURLs=new Map<string,boolean>();
  let roleAvatarUploadVersion=0,userAvatarUploadVersion=0;

  async function makeAvatarPreview(blob:Blob):Promise<string>{
    const url=URL.createObjectURL(blob);avatarPreviewURLs.set(url,true);
    try{const image=new Image();image.src=url;await image.decode();return url;}
    catch(error){avatarPreviewURLs.delete(url);URL.revokeObjectURL(url);throw error;}
  }

  async function stageAvatarPhoto(blob:Blob):Promise<string>{
    const id=makeUid('ava');avatarLoadingIds.add(id);
    try{
      await mediaPut(id,blob);
      if(!await mediaSources.getDecoded(id))throw new Error('头像尚未解码');
      return id;
    }finally{avatarLoadingIds.delete(id);}
  }
  const profileSaves=new WeakSet<HTMLFormElement>();
  async function stageFormAvatar(form:HTMLFormElement,blob:Blob):Promise<string>{
    profileSaves.add(form);
    const submit=form.querySelector<HTMLButtonElement>('[type="submit"]');
    if(submit)submit.disabled=true;
    try{return await stageAvatarPhoto(blob);}
    finally{profileSaves.delete(form);if(submit)submit.disabled=false;}
  }
  let detailId = '';

  // Phase 1 state: IME composition guard, inline message editing, quote replying, revision history drawer
  let isComposing = false;
  let editingMessageId: string | null = null;
  let editingMessageScope: RevisionScope = 'chat';
  let editingMessageDraft = '';
  let quotingMessage: MessageQuote | null = null;
  let showRevisionsDrawer = false;

  type StagedFrameState = FrameDraft;

  // UI 01-B & UI 02 state: staged avatar & avatar frame draft for UserProfile and RoleForm
  let draftUserAvatarBlob: Blob | null = null;
  let draftUserAvatarPreviewUrl = '';
  let draftUserAvatarRemove = false;
  let draftUserFormValues: Record<string, string> | null = null;
  let draftUserFrame: StagedFrameState | null = null;

  let draftRoleAvatarBlob: Blob | null = null;
  let draftRoleAvatarPreviewUrl = '';
  let draftRoleAvatarRemove = false;
  let draftRoleFormValues: Record<string, string> | null = null;
  let draftRoleFrame: StagedFrameState | null = null;

  // UI 02 state: Terminal staged custom avatar frame asset upload preview
  let stagedTerminalFrameBlob: Blob | null = null;
  let stagedTerminalFramePreviewUrl = '';
  let stagedTerminalFrameName = '';

  // Daily AI Diary sequential queue state & local calendar day watcher
  let diaryQueueBusy = false;
  let lastObservedLocalDay = toLocalDateKey(now());

  // Track A state: Monitor Daily Footprints date, tab, calendar drawer, and AI enrichment state
  let monitorDateKey = toLocalDateKey(now());
  let showFootprintCalendar = false;
  let footprintCalYear = new Date(now()).getFullYear();
  let footprintCalMonth = new Date(now()).getMonth() + 1;

  // Track B, UI 02 & UI 03-A state: Preset & Custom Avatar Frame Modal Picker
  let frameGallerySourceTab: 'preset' | 'custom' = 'preset';
  let frameGallerySearch = '';
  let frameGalleryPage = 0;
  const FRAME_PAGE_SIZE = 36;
  let frameModalOwner: 'role' | 'user' | null = null;
  let modalFrameDraft: StagedFrameState | null = null;
  let frameModalAdjustOpen = false;
  const modalFrameChoices = new Map<string, StagedFrameState>();

  // UI 03-B state: Focus companion system (task input draft, history date picker, settlement modal, AI summary retry)
  let focusTaskInputDraft = '';
  let focusHistoryDateKey = toLocalDateKey(now());
  let focusSettlementModalSessionId: string | null = null;
  let focusSummaryOperation: {world:AppData} | null = null;
  let focusLiveOperation: {world:AppData;session:ActiveFocusSession} | null = null;

  function buildStagedFrameFromOwner(owner?: AvatarFrameFields | null): StagedFrameState {
    return frameDraft(owner);
  }

  function getOrInitUserFrameDraft(): StagedFrameState {
    if (!draftUserFrame) {
      draftUserFrame = buildStagedFrameFromOwner(data.user);
    }
    return draftUserFrame;
  }

  function getOrInitRoleFrameDraft(r?: RoleData | null): StagedFrameState {
    if (!draftRoleFrame) {
      draftRoleFrame = buildStagedFrameFromOwner(r);
    }
    return draftRoleFrame;
  }

  function getActiveModalOrFormFrameDraft(
    ownerType: 'role' | 'user',
    r?: RoleData | null
  ): StagedFrameState {
    if (frameModalOwner === ownerType && modalFrameDraft) {
      return modalFrameDraft;
    }
    return ownerType === 'user'
      ? getOrInitUserFrameDraft()
      : getOrInitRoleFrameDraft(r);
  }

  function selectModalFrame(staged:StagedFrameState,asset:Pick<StagedFrameState,'frameId'|'frameData'|'frameMediaId'>):void {
    if(staged.frameId===asset.frameId) return;
    modalFrameChoices.set(staged.frameId,{...staged});
    Object.assign(staged,modalFrameChoices.get(asset.frameId)||{...asset,frameScale:DEFAULT_FRAME_SCALE,frameX:0,frameY:0,frameLayoutVersion:1});
  }

  function closeFrameModal(): void {
    frameModalOwner = null;
    modalFrameDraft = null;
    frameModalAdjustOpen = false;
    modalFrameChoices.clear();
  }

  function formatFrameDraftSummary(
    staged: StagedFrameState,
    savedOwner?: {
      frameId?: string;
      frameMediaId?: string;
      frameData?: string;
      frameScale?: number;
      frameX?: number;
      frameY?: number;
      frameLayoutVersion?: 1;
    } | null
  ): string {
    const savedNorm = buildStagedFrameFromOwner(savedOwner);
    const isModified =
      staged.frameId !== savedNorm.frameId ||
      staged.frameMediaId !== savedNorm.frameMediaId ||
      staged.frameData !== savedNorm.frameData ||
      Number(staged.frameScale) !== Number(savedNorm.frameScale) ||
      Number(staged.frameX) !== Number(savedNorm.frameX) ||
      Number(staged.frameY) !== Number(savedNorm.frameY) || staged.frameLayoutVersion !== savedNorm.frameLayoutVersion;
    const suffix = isModified ? '（待保存草稿）' : '';
    if (
      staged.frameId === 'none' ||
      (!staged.frameData &&
        !staged.frameMediaId &&
        (!staged.frameId || staged.frameId === 'none'))
    ) {
      return `当前头像框：不使用头像框${suffix}`;
    }
    const preset = findPresetFrameByIdOrUrl(staged.frameId || staged.frameData);
    if (preset) {
      return `当前头像框：${preset.label}${suffix}`;
    }
    const customItem = (data.customFrames || []).find(
      (x) =>
        x.id === staged.frameId ||
        (x.mediaId && x.mediaId === staged.frameMediaId)
    );
    if (customItem) {
      return `当前头像框：${customItem.name}${suffix}`;
    }
    return `当前头像框：自定义头像框${suffix}`;
  }

  function resetUserAvatarDraft(): void {
    userAvatarUploadVersion++;
    draftUserAvatarBlob = null;
    draftUserAvatarPreviewUrl = '';
    draftUserAvatarRemove = false;
    draftUserFormValues = null;
    draftUserFrame = null;
    if (frameModalOwner === 'user') {
      closeFrameModal();
    }
  }

  function resetRoleAvatarDraft(): void {
    roleAvatarUploadVersion++;
    draftRoleAvatarBlob = null;
    draftRoleAvatarPreviewUrl = '';
    draftRoleAvatarRemove = false;
    draftRoleFormValues = null;
    draftRoleFrame = null;
    if (frameModalOwner === 'role') {
      closeFrameModal();
    }
  }

  function resetStagedTerminalFrame(): void {
    if (stagedTerminalFramePreviewUrl) {
      URL.revokeObjectURL(stagedTerminalFramePreviewUrl);
    }
    stagedTerminalFrameBlob = null;
    stagedTerminalFramePreviewUrl = '';
    stagedTerminalFrameName = '';
  }

  function captureFormValues(formId: string): Record<string, string> | null {
    const formEl = document.getElementById(formId) as HTMLFormElement | null;
    if (!formEl) return null;
    const fd = new FormData(formEl);
    const out: Record<string, string> = {};
    fd.forEach((val, key) => {
      if (typeof val === 'string') out[key] = val;
    });
    return out;
  }

  function ensureFocusData(): void {
    data.focus = ensureFocusStateNormalized(data.focus, data.roles);
  }
  ensureFocusData();
  // Legacy busy carried no receipt. Only newly scheduled moments are eligible for dispatch.
  if(data.focus?.active)delete data.focus.active.liveLogBusy;

  const avatar = (r?: RoleData | null): string =>
    Array.from(String(r?.name || '?').trim() || '?')[0] || '?';

  const userAvatarChar = (u?: UserProfileData | null): string =>
    Array.from(String(u?.name || '我').trim() || '我')[0] || '我';

  function installBubbleCSS(): void {
    const previous = document.querySelector('#elsewhere-bubbles-css');
    if (previous) previous.remove();
    const currentRole = role();
    if (
      !currentRole?.bubbleCSS ||
      typeof document.createElement !== 'function' ||
      !document.head?.append
    ) {
      return;
    }
    const el = document.createElement('style');
    el.id = 'elsewhere-bubbles-css';
    el.textContent = safeBubbleCSS(currentRole.bubbleCSS);
    document.head.append(el);
  }

  function syslog(
    type: string,
    detail: string,
    extra: Record<string, unknown> = {}
  ) {
    if (!Array.isArray(data.logs)) data.logs = [];
    const record = {
      id: uid(),
      at: Date.now(),
      roleId: data.selected || null,
      type,
      detail: String(detail).slice(0, 1100),
      ...extra,
    };
    data.logs.push(record);
    if (data.logs.length > 500) data.logs.splice(0, data.logs.length - 500);
    return record;
  }

  const userAvatarTag = (u?: UserProfileData | null, cl='avatar', opts?: Parameters<typeof avatarView>[3]) => avatarView(u,'user',cl,{...opts,loadedUrl:opts?.removed||opts?.previewUrl?undefined:mediaSources.peek(u?.avatarMediaId||'')});
  const avatarTag = (r?: RoleData | null, cl='avatar', opts?: Parameters<typeof avatarView>[3]) => avatarView(r,'role',cl,{...opts,loadedUrl:opts?.removed||opts?.previewUrl?undefined:mediaSources.peek(r?.avatarMediaId||'')});

  function syncModalAdjustInputsToStaged(
    ownerType: 'role' | 'user',
    staged: StagedFrameState
  ): void {
    const wrap = document.getElementById(`frame-adjust-${ownerType}`);
    if (!wrap) return;
    const sizeEl = wrap.querySelector<HTMLInputElement>('[name="size"]');
    const xEl = wrap.querySelector<HTMLInputElement>('[name="x"]');
    const yEl = wrap.querySelector<HTMLInputElement>('[name="y"]');
    if (sizeEl && sizeEl.value !== '') {
      const parsed = Number(sizeEl.value);
      if (Number.isFinite(parsed)) {
        staged.frameScale = Math.max(0.5, Math.min(3, parsed));
      }
    }
    if (xEl && xEl.value !== '') {
      const parsed = Number(xEl.value);
      if (Number.isFinite(parsed)) {
        staged.frameX = Math.max(-80, Math.min(80, parsed));
      }
    }
    if (yEl && yEl.value !== '') {
      const parsed = Number(yEl.value);
      if (Number.isFinite(parsed)) {
        staged.frameY = Math.max(-80, Math.min(80, parsed));
      }
    }
  }

  function computeFrameModalStatusInfo(staged: StagedFrameState): {
    activeFrameId: string;
    activePresetItem: ReturnType<typeof findPresetFrameByIdOrUrl>;
    activeCustomItem: CustomAvatarFrame | undefined;
    isRemoteActive: boolean;
    currentStatusText: string;
  } {
    const activeFrameId =
      staged.frameId ||
      (staged.frameData
        ? findPresetFrameByIdOrUrl(staged.frameData)?.id || 'custom'
        : staged.frameMediaId
        ? 'custom'
        : 'none');
    const activePresetItem = findPresetFrameByIdOrUrl(
      staged.frameId || staged.frameData
    );
    const activeCustomItem = (data.customFrames || []).find(
      (x) =>
        x.id === staged.frameId ||
        (x.mediaId && x.mediaId === staged.frameMediaId)
    );
    const isRemoteActive = Boolean(
      staged.frameData && /^https:\/\//i.test(staged.frameData) && !staged.frameMediaId
    );
    const currentStatusText =
      activeFrameId === 'none' ||
      (!staged.frameData &&
        !staged.frameMediaId &&
        (!staged.frameId || staged.frameId === 'none'))
        ? '当前预览：不使用头像框'
        : activePresetItem
        ? `当前预览：${activePresetItem.label} (#${String(
            activePresetItem.index
          ).padStart(3, '0')})${
            staged.frameMediaId ? ' · 本地缓存' : ' · GIF 素材'
          }`
        : activeCustomItem
        ? `当前预览：${activeCustomItem.name}（用户上传）`
        : '当前预览：自定义头像框';

    return {
      activeFrameId,
      activePresetItem,
      activeCustomItem,
      isRemoteActive,
      currentStatusText,
    };
  }

  function renderFrameAdjustDrawerHtml(
    ownerType: 'role' | 'user',
    staged: StagedFrameState
  ): string {
    return `<div id="frame-adjust-${ownerType}" data-frame-adjust-owner="${ownerType}" data-testid="frame-adjust-drawer" class="frame-adjust-drawer">
      <div class="frame-adjust-grid">
        <label>缩放比例 <input class="field" data-frame-adjust-input="size" data-owner="${ownerType}" name="size" type="number" min="0.5" max="3" step="0.05" value="${
          Number(staged.frameScale) || 1.25
        }"></label>
        <label>水平偏移 X <input class="field" data-frame-adjust-input="x" data-owner="${ownerType}" name="x" type="number" min="-80" max="80" value="${
          Number(staged.frameX) || 0
        }"></label>
        <label>垂直偏移 Y <input class="field" data-frame-adjust-input="y" data-owner="${ownerType}" name="y" type="number" min="-80" max="80" value="${
          Number(staged.frameY) || 0
        }"></label>
      </div>
      <div class="row between" style="margin-top:8px;gap:8px">
        <span class="tiny muted">调整数值将实时同步至上方预览</span>
        <div class="row" style="gap:6px">
          <button class="btn small ghost" type="button" data-action="resetframeadjust" data-owner="${ownerType}" data-testid="frame-adjust-reset-btn">重置默认</button>
          <button class="btn small secondary" type="button" data-action="applyframedraftadjust" data-owner="${ownerType}" data-testid="frame-adjust-apply-btn-${ownerType}">更新位置预览</button>
        </div>
      </div>
    </div>`;
  }

  function renderFramePresetGridAndPaginationHtml(
    ownerType: 'role' | 'user',
    displayName: string,
    staged: StagedFrameState
  ): { gridHtml: string; paginationHtml: string } {
    const { activeFrameId } = computeFrameModalStatusInfo(staged);
    const filteredPresets = filterPresetAvatarFrames({
      query: frameGallerySearch,
    });
    const totalPages = Math.max(
      1,
      Math.ceil(filteredPresets.length / FRAME_PAGE_SIZE)
    );
    const safePage = Math.max(0, Math.min(totalPages - 1, frameGalleryPage));
    const pageSlice = filteredPresets.slice(
      safePage * FRAME_PAGE_SIZE,
      (safePage + 1) * FRAME_PAGE_SIZE
    );
    const baseChar = Array.from(String(displayName).trim() || '?')[0] || '?';

    const gridHtml = `${
      safePage === 0 && !frameGallerySearch
        ? `<button type="button" class="frame-cell frame-cell-none ${
            activeFrameId === 'none' ? 'selected' : ''
          }" data-action="selectpresetframe" data-owner="${ownerType}" data-frame-id="none" data-testid="preset-frame-none">
            <div class="frame-thumb-box"><span class="frame-none-glyph">∅</span></div>
            <span class="frame-cell-label">不使用头像框</span>
            <small class="frame-cell-tag">默认无框</small>
          </button>`
        : ''
    }${
      pageSlice.length
        ? pageSlice
            .map((item) => {
              const isSel =
                staged.frameId === item.id || staged.frameData === item.url;
              return `<button type="button" class="frame-cell ${
                isSel ? 'selected' : ''
              }" data-action="selectpresetframe" data-owner="${ownerType}" data-frame-id="${esc(
                item.id
              )}" data-testid="preset-frame-item-${esc(
                item.id
              )}" title="${esc(item.label)} (${esc(item.fileHint)})">
                <div class="frame-thumb-box">
                  <span class="frame-thumb-base">${esc(baseChar)}</span>
                  <img class="frame-thumb-img" src="${esc(
                    item.url
                  )}" alt="${esc(item.label)}" loading="lazy">
                </div>
                <span class="frame-cell-label">${esc(item.label)}</span>
                <small class="frame-cell-tag">#${String(item.index).padStart(
                  3,
                  '0'
                )} · ${esc(item.fileHint)}</small>
              </button>`;
            })
            .join('')
        : `<div class="sub" style="grid-column:1/-1;text-align:center;padding:16px 0">没有找到匹配的预设头像框，试试清空搜索词。</div>`
    }`;

    const paginationHtml = `<button type="button" class="btn small secondary" data-action="framepage" data-delta="-1" ${
      safePage <= 0 ? 'disabled' : ''
    }>‹ 上一页</button>
    <span class="tiny muted">第 ${safePage + 1} / ${totalPages} 页（共 ${
      filteredPresets.length
    } 款）</span>
    <button type="button" class="btn small secondary" data-action="framepage" data-delta="1" ${
      safePage >= totalPages - 1 ? 'disabled' : ''
    }>下一页 ›</button>`;

    return { gridHtml, paginationHtml };
  }

  function renderFrameModalBodyInnerHtml(
    ownerType: 'role' | 'user',
    displayName: string,
    staged: StagedFrameState
  ): string {
    const { activeFrameId } = computeFrameModalStatusInfo(staged);
    const customList = Array.isArray(data.customFrames) ? data.customFrames : [];
    const baseChar = Array.from(String(displayName).trim() || '?')[0] || '?';

    if (frameGallerySourceTab === 'preset') {
      const { gridHtml, paginationHtml } = renderFramePresetGridAndPaginationHtml(
        ownerType,
        displayName,
        staged
      );
      return `<div class="frame-preset-section">
        <div class="frame-filter-bar">
          <input type="search" id="frame-search-input" data-testid="frame-search-input" class="field frame-search-field" placeholder="搜索编号（如 #001、#073）或文件名（如 IMG-5574）…" value="${esc(
            frameGallerySearch
          )}">
        </div>
        <div class="frame-grid" data-testid="preset-frame-grid">${gridHtml}</div>
        <div class="frame-pagination" data-testid="frame-pagination">${paginationHtml}</div>
      </div>`;
    }

    return `<div class="frame-custom-section" data-testid="custom-frame-section">
      <div class="row between" style="margin-bottom:10px;flex-wrap:wrap;gap:8px">
        <span class="tiny muted">已入库的自定义头像框素材（共 ${
          customList.length
        } 款，可在「终端」批量管理）</span>
        <label class="btn small ghost" style="cursor:pointer" data-testid="upload-custom-frame-label">
          ＋ 直接上传素材并选用
          <input type="file" id="frame-file-${ownerType}" data-frame-upload-owner="${ownerType}" accept="image/png,image/svg+xml,image/gif,image/webp,.svg,.gif" hidden>
        </label>
      </div>
      ${
        customList.length
          ? `<div class="frame-grid" data-testid="custom-frame-grid">
              <button type="button" class="frame-cell frame-cell-none ${
                activeFrameId === 'none' ? 'selected' : ''
              }" data-action="selectpresetframe" data-owner="${ownerType}" data-frame-id="none" data-testid="custom-tab-frame-none">
                <div class="frame-thumb-box"><span class="frame-none-glyph">∅</span></div>
                <span class="frame-cell-label">不使用头像框</span>
                <small class="frame-cell-tag">默认无框</small>
              </button>
              ${customList
                .map((cf) => {
                  const isSel =
                    staged.frameId === cf.id ||
                    (cf.mediaId && staged.frameMediaId === cf.mediaId) ||
                    (cf.dataUrl && staged.frameData === cf.dataUrl);
                  return `<div class="frame-cell custom-frame-cell ${
                    isSel ? 'selected' : ''
                  }" data-testid="custom-frame-item-${esc(cf.id)}">
                    <button type="button" class="frame-custom-pick" data-action="selectcustomframe" data-owner="${ownerType}" data-custom-id="${esc(
                      cf.id
                    )}">
                      <div class="frame-thumb-box">
                        <span class="frame-thumb-base">${esc(baseChar)}</span>
                        ${
                          cf.mediaId
                            ? `<img class="frame-thumb-img" data-media-id="${esc(
                                cf.mediaId
                              )}" alt="${esc(cf.name)}">`
                            : `<img class="frame-thumb-img" src="${esc(
                                cf.dataUrl || ''
                              )}" alt="${esc(cf.name)}">`
                        }
                      </div>
                      <span class="frame-cell-label">${esc(cf.name)}</span>
                    </button>
                    <button type="button" class="frame-custom-del" title="删除自定义框" data-action="deletecustomframe" data-custom-id="${esc(
                      cf.id
                    )}">×</button>
                  </div>`;
                })
                .join('')}
            </div>`
          : `<div class="sub" style="padding:14px 0;text-align:center">还没有已上传的自定义头像框素材。可在「终端 → 头像框素材管理」上传预览并加入图库，或点击上方按钮上传。</div>`
      }
    </div>`;
  }

  function updateAvatarBoxFrameInPlace(
    avatarBoxEl: HTMLElement | null,
    staged: StagedFrameState
  ): void {
    if (!avatarBoxEl) return;
    delete avatarBoxEl.dataset.avatarRenderKey;

    let resolvedMediaId = '';
    let resolvedUrl = '';
    let resolvedFrameId = staged.frameId || '';

    if (staged.frameMediaId) {
      resolvedMediaId = staged.frameMediaId;
      if (!resolvedFrameId) resolvedFrameId = 'custom_media';
    } else if (staged.frameData && isAllowedFrameSource(staged.frameData)) {
      resolvedUrl = staged.frameData;
    } else if (staged.frameId && staged.frameId !== 'none') {
      const preset = findPresetFrameByIdOrUrl(staged.frameId);
      if (preset) {
        resolvedUrl = preset.url;
        resolvedFrameId = preset.id;
      }
    }

    const hasFrame = Boolean(resolvedMediaId || resolvedUrl);
    if (!hasFrame) {
      avatarBoxEl.classList.remove('has-avatar-frame');
      avatarBoxEl.querySelector<HTMLElement>('img.avatar-frame')?.remove();
      return;
    }

    avatarBoxEl.classList.add('has-avatar-frame');
    let frameImg = avatarBoxEl.querySelector<HTMLImageElement>('img.avatar-frame');
    if (!frameImg) {
      frameImg = document.createElement('img');
      frameImg.className = 'avatar-frame';
      frameImg.alt = '';
      avatarBoxEl.appendChild(frameImg);
    }

    frameImg.classList.remove('frame-img-error');
    frameImg.style.cssText = frameStyle(staged);
    frameImg.dataset.frameId = resolvedFrameId;

    if (resolvedMediaId) {
      frameImg.dataset.mediaId = resolvedMediaId;
      void hydrateMedia(avatarBoxEl);
    } else {
      delete frameImg.dataset.mediaId;
      delete frameImg.dataset.hydratedKey;
      if (frameImg.getAttribute('src') !== resolvedUrl) {
        frameImg.setAttribute('src', resolvedUrl);
      }
      void hydrateMedia(avatarBoxEl);
    }
  }

  function getModalBaseOwnerAndDisplayName(ownerType: 'role' | 'user'): {
    baseOwner: RoleData | UserProfileData | null;
    displayName: string;
  } {
    if (ownerType === 'role') {
      const baseRole =
        formMode === 'edit'
          ? data.roles.find((x) => x.id === editingRoleId) || null
          : null;
      const nameInput = document.querySelector<HTMLInputElement>(
        '#role-form [name="name"]'
      );
      const displayName =
        nameInput?.value.trim() ||
        draftRoleFormValues?.name ||
        baseRole?.name ||
        '新角色';
      return { baseOwner: baseRole, displayName };
    }
    const nameInput = document.querySelector<HTMLInputElement>(
      '#user-profile-form [name="name"]'
    );
    const displayName =
      nameInput?.value.trim() ||
      draftUserFormValues?.name ||
      data.user.name ||
      '我';
    return { baseOwner: data.user, displayName };
  }

  function patchFrameModalSelectionInPlace(ownerType: 'role' | 'user'): void {
    const modalSheet = document.querySelector<HTMLElement>(
      '[data-testid="avatar-frame-modal"]'
    );
    if (!modalSheet) return;
    const { baseOwner } = getModalBaseOwnerAndDisplayName(ownerType);
    const staged = getActiveModalOrFormFrameDraft(
      ownerType,
      baseOwner as RoleData | null
    );
    const { activeFrameId, isRemoteActive, currentStatusText } =
      computeFrameModalStatusInfo(staged);

    // 1. Update only the overlay <img class="avatar-frame"> inside the top preview
    const livePreviewEl =
      modalSheet.querySelector<HTMLElement>('.frame-live-preview');
    updateAvatarBoxFrameInPlace(livePreviewEl, staged);

    // 2. Update status label in modal header
    const statusEl = modalSheet.querySelector<HTMLElement>(
      `[data-testid="frame-active-status-${ownerType}"]`
    );
    if (statusEl) {
      statusEl.textContent = currentStatusText;
    }

    // 3. Update offline cache button in preview actions row
    const actionsRow = modalSheet.querySelector<HTMLElement>(
      '.frame-modal-preview .frame-preview-info .row'
    );
    const existingCacheBtn = modalSheet.querySelector<HTMLElement>(
      `[data-testid="frame-cache-btn-${ownerType}"]`
    );
    if (isRemoteActive && !existingCacheBtn && actionsRow) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn small ghost';
      btn.dataset.action = 'cacheactiveframe';
      btn.dataset.owner = ownerType;
      btn.dataset.testid = `frame-cache-btn-${ownerType}`;
      btn.innerHTML = uiIcon('download')+' 离线缓存';
      actionsRow.appendChild(btn);
    } else if (!isRemoteActive && existingCacheBtn) {
      existingCacheBtn.remove();
    }

    // 4. Update .selected state on thumbnail cells in-place without rebuilding the grid
    modalSheet.querySelectorAll<HTMLElement>('.frame-cell').forEach((cell) => {
      if (cell.dataset.action === 'selectpresetframe') {
        const fid = cell.dataset.frameId || 'none';
        if (fid === 'none') {
          cell.classList.toggle('selected', activeFrameId === 'none');
        } else {
          const presetItem = findPresetFrameByIdOrUrl(fid);
          const isSel =
            staged.frameId === fid ||
            Boolean(presetItem && staged.frameData === presetItem.url);
          cell.classList.toggle('selected', isSel);
        }
      } else if (cell.classList.contains('custom-frame-cell')) {
        const pickBtn = cell.querySelector<HTMLElement>(
          '[data-action="selectcustomframe"]'
        );
        const cid = pickBtn?.dataset.customId || '';
        const cf = (data.customFrames || []).find((x) => x.id === cid);
        const isSel = Boolean(
          cf &&
            (staged.frameId === cf.id ||
              (cf.mediaId && staged.frameMediaId === cf.mediaId) ||
              (cf.dataUrl && staged.frameData === cf.dataUrl))
        );
        cell.classList.toggle('selected', isSel);
      }
    });
    patchFrameModalAdjustDrawerInPlace(ownerType);
  }

  function patchFrameModalAdjustDrawerInPlace(ownerType: 'role' | 'user'): void {
    const modalSheet = document.querySelector<HTMLElement>(
      '[data-testid="avatar-frame-modal"]'
    );
    if (!modalSheet) return;
    const { baseOwner } = getModalBaseOwnerAndDisplayName(ownerType);
    const staged = getActiveModalOrFormFrameDraft(
      ownerType,
      baseOwner as RoleData | null
    );
    const toggleBtn = modalSheet.querySelector<HTMLElement>(
      '[data-testid="toggle-frame-adjust-btn"]'
    );
    if (toggleBtn) {
      toggleBtn.classList.toggle('active', frameModalAdjustOpen);
      toggleBtn.setAttribute(
        'aria-expanded',
        frameModalAdjustOpen ? 'true' : 'false'
      );
      toggleBtn.innerHTML = `${uiIcon('settings')} 缩放与位置微调 ${
        frameModalAdjustOpen ? '▴' : '▾'
      }`;
    }
    const existingDrawer = document.getElementById(`frame-adjust-${ownerType}`);
    if (frameModalAdjustOpen) {
      if (!existingDrawer) {
        const previewBlock = modalSheet.querySelector<HTMLElement>(
          '.frame-modal-preview'
        );
        previewBlock?.insertAdjacentHTML(
          'afterend',
          renderFrameAdjustDrawerHtml(ownerType, staged)
        );
      } else {
        const sizeEl = existingDrawer.querySelector<HTMLInputElement>('[name="size"]');
        const xEl = existingDrawer.querySelector<HTMLInputElement>('[name="x"]');
        const yEl = existingDrawer.querySelector<HTMLInputElement>('[name="y"]');
        if (sizeEl) sizeEl.value = String(Number(staged.frameScale) || 1.25);
        if (xEl) xEl.value = String(Number(staged.frameX) || 0);
        if (yEl) yEl.value = String(Number(staged.frameY) || 0);
      }
    } else if (existingDrawer) {
      existingDrawer.remove();
    }
  }

  function patchFrameModalPresetGridInPlace(ownerType: 'role' | 'user'): void {
    const modalSheet = document.querySelector<HTMLElement>(
      '[data-testid="avatar-frame-modal"]'
    );
    if (!modalSheet) return;
    const { baseOwner, displayName } = getModalBaseOwnerAndDisplayName(ownerType);
    const staged = getActiveModalOrFormFrameDraft(
      ownerType,
      baseOwner as RoleData | null
    );
    const gridEl = modalSheet.querySelector<HTMLElement>(
      '[data-testid="preset-frame-grid"]'
    );
    const pageEl = modalSheet.querySelector<HTMLElement>(
      '[data-testid="frame-pagination"]'
    );
    if (!gridEl || !pageEl) return;
    const { gridHtml, paginationHtml } = renderFramePresetGridAndPaginationHtml(
      ownerType,
      displayName,
      staged
    );
    gridEl.innerHTML = gridHtml;
    pageEl.innerHTML = paginationHtml;
    const modalBody = modalSheet.querySelector<HTMLElement>('.frame-modal-body');
    if (modalBody) modalBody.scrollTop = 0;
    void hydrateMedia(gridEl);
  }

  function patchFrameModalBodyAndTabsInPlace(ownerType: 'role' | 'user'): void {
    const modalSheet = document.querySelector<HTMLElement>(
      '[data-testid="avatar-frame-modal"]'
    );
    if (!modalSheet) return;
    const { baseOwner, displayName } = getModalBaseOwnerAndDisplayName(ownerType);
    const staged = getActiveModalOrFormFrameDraft(
      ownerType,
      baseOwner as RoleData | null
    );
    const customList = Array.isArray(data.customFrames) ? data.customFrames : [];

    const presetTabBtn = modalSheet.querySelector<HTMLElement>(
      '[data-testid="frame-tab-preset"]'
    );
    const customTabBtn = modalSheet.querySelector<HTMLElement>(
      '[data-testid="frame-tab-custom"]'
    );
    if (presetTabBtn) {
      presetTabBtn.classList.toggle('active', frameGallerySourceTab === 'preset');
      presetTabBtn.textContent = `预设头像框 (${AVATAR_FRAME_AUDIT_STATS.uniqueUrls})`;
    }
    if (customTabBtn) {
      customTabBtn.classList.toggle('active', frameGallerySourceTab === 'custom');
      customTabBtn.textContent = `用户上传的头像框 (${customList.length})`;
    }

    const modalBody = modalSheet.querySelector<HTMLElement>('.frame-modal-body');
    if (modalBody) {
      modalBody.innerHTML = renderFrameModalBodyInnerHtml(
        ownerType,
        displayName,
        staged
      );
      modalBody.scrollTop = 0;
      void hydrateMedia(modalBody);
    }
    patchFrameModalSelectionInPlace(ownerType);
  }

  function openFrameModalInPlace(ownerType: 'role' | 'user'): void {
    const { baseOwner } = getModalBaseOwnerAndDisplayName(ownerType);
    if (ownerType === 'role') {
      draftRoleFormValues = captureFormValues('role-form');
      const formDraft = getOrInitRoleFrameDraft(baseOwner as RoleData | null);
      modalFrameDraft = { ...formDraft };
    } else {
      draftUserFormValues = captureFormValues('user-profile-form');
      const formDraft = getOrInitUserFrameDraft();
      modalFrameDraft = { ...formDraft };
    }
    frameModalOwner = ownerType;
    frameModalAdjustOpen = false;
    modalFrameChoices.clear();

    document
      .querySelector<HTMLElement>('[data-testid="avatar-frame-modal-backdrop"]')
      ?.remove();
    const phoneHost = document.querySelector<HTMLElement>('.phone') || $('#app');
    if (!phoneHost) {
      render(false);
      return;
    }
    phoneHost.insertAdjacentHTML(
      'beforeend',
      renderAvatarFrameModal(ownerType, baseOwner)
    );
    const modalBackdrop = phoneHost.querySelector<HTMLElement>(
      '[data-testid="avatar-frame-modal-backdrop"]'
    );
    if (modalBackdrop) {
      void hydrateMedia(modalBackdrop);
    }
  }

  function closeFrameModalInPlace(): void {
    closeFrameModal();
    document
      .querySelector<HTMLElement>('[data-testid="avatar-frame-modal-backdrop"]')
      ?.remove();
    clearMediaURLs();
  }

  function applyFrameModalInPlace(ownerType: 'role' | 'user'): boolean {
    if (!modalFrameDraft) return false;
    syncModalAdjustInputsToStaged(ownerType, modalFrameDraft);
    const appliedDraft: StagedFrameState = { ...modalFrameDraft };
    const { baseOwner } = getModalBaseOwnerAndDisplayName(ownerType);
    if (baseOwner && !saveFrameOnly(baseOwner, appliedDraft, save)) {
      return false;
    }

    if (ownerType === 'role') {
      draftRoleFrame = appliedDraft;
    } else {
      draftUserFrame = appliedDraft;
    }

    closeFrameModalInPlace();

    // Surgically update the avatar preview box and summary label on the underlying form without re-rendering #role-form / #user-profile-form
    const editorSelector =
      ownerType === 'role'
        ? '[data-testid="role-avatar-editor"]'
        : '[data-testid="user-avatar-editor"]';
    const editorCard = document.querySelector<HTMLElement>(editorSelector);
    if (editorCard) {
      const formPreviewBox =
        editorCard.querySelector<HTMLElement>('.avatar-preview-box');
      updateAvatarBoxFrameInPlace(formPreviewBox, appliedDraft);
    }

    const labelSelector =
      ownerType === 'role'
        ? '[data-testid="role-frame-current-label"]'
        : '[data-testid="user-frame-current-label"]';
    const labelEl = document.querySelector<HTMLElement>(labelSelector);
    if (labelEl) {
      labelEl.textContent = formatFrameDraftSummary(appliedDraft, baseOwner);
    }
    return true;
  }

  function renderAvatarFrameModal(
    ownerType: 'role' | 'user',
    baseOwner?: RoleData | UserProfileData | null
  ): string {
    const staged = getActiveModalOrFormFrameDraft(
      ownerType,
      baseOwner as RoleData | null
    );
    const displayName =
      ownerType === 'role'
        ? draftRoleFormValues?.name || (baseOwner as RoleData | null)?.name || '新角色'
        : draftUserFormValues?.name || (baseOwner as UserProfileData | null)?.name || '我';
    const ownerLabel =
      ownerType === 'role'
        ? `角色头像框 · ${displayName}`
        : `个人头像框 · ${displayName}`;

    const mergedOwner = {
      ...(baseOwner || {}),
      name: displayName,
      frameId: staged.frameId,
      frameMediaId: staged.frameMediaId,
      frameData: staged.frameData,
      frameScale: staged.frameScale,
      frameX: staged.frameX,
      frameY: staged.frameY,
      frameLayoutVersion: staged.frameLayoutVersion,
    };

    const { isRemoteActive, currentStatusText } =
      computeFrameModalStatusInfo(staged);
    const customList = Array.isArray(data.customFrames) ? data.customFrames : [];

    const previewAvatarHtml =
      ownerType === 'role'
        ? avatarTag(mergedOwner as RoleData, 'avatar large frame-live-preview', {
            previewUrl: baseOwner ? undefined : draftRoleAvatarPreviewUrl,
            removed: baseOwner ? false : draftRoleAvatarRemove,
            fallbackName: displayName,
          })
        : userAvatarTag(mergedOwner as UserProfileData, 'avatar large frame-live-preview', {
            previewUrl: baseOwner ? undefined : draftUserAvatarPreviewUrl,
            removed: baseOwner ? false : draftUserAvatarRemove,
            fallbackName: displayName,
          });

    return `<div class="frame-modal-backdrop" data-testid="avatar-frame-modal-backdrop">
      <div class="frame-modal-sheet" role="dialog" aria-modal="true" aria-label="${esc(
        ownerLabel
      )}" data-testid="avatar-frame-modal" data-frame-owner="${ownerType}">
        <div class="frame-modal-header">
          <div>
            <h3 class="frame-modal-title">${esc(ownerLabel)}</h3>
            <div class="tiny muted" data-testid="frame-active-status-${ownerType}">${esc(
              currentStatusText
            )}</div>
          </div>
          <button type="button" class="frame-modal-close" data-action="cancelframemodal" aria-label="关闭头像框弹窗">×</button>
        </div>

        <div class="frame-modal-preview">
          <div class="frame-preview-avatar-wrap">
            ${previewAvatarHtml}
          </div>
          <div class="frame-preview-info">
            <b>实时叠加预览 · ${esc(displayName)}</b>
            <p class="tiny muted">${baseOwner ? '应用后立即保存头像框；姓名、人设和新头像草稿仍需单独保存。' : '应用到新角色草稿，创建角色后正式保存。'}</p>
            <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:6px">
              <button type="button" class="btn small secondary" data-action="selectpresetframe" data-owner="${ownerType}" data-frame-id="none" data-testid="frame-clear-btn-${ownerType}">不使用头像框</button>
              <button type="button" class="btn small ghost frame-adjust-toggle ${
                frameModalAdjustOpen ? 'active' : ''
              }" data-action="toggleframeadjust" data-testid="toggle-frame-adjust-btn" aria-expanded="${
                frameModalAdjustOpen ? 'true' : 'false'
              }">${uiIcon('settings')} 缩放与位置微调 ${frameModalAdjustOpen ? '▴' : '▾'}</button>
              ${
                isRemoteActive
                  ? `<button type="button" class="btn small ghost" data-action="cacheactiveframe" data-owner="${ownerType}" data-testid="frame-cache-btn-${ownerType}">${uiIcon('download')} 离线缓存</button>`
                  : ''
              }
            </div>
          </div>
        </div>

        ${
          frameModalAdjustOpen
            ? renderFrameAdjustDrawerHtml(ownerType, staged)
            : ''
        }

        <div class="tabs frame-source-tabs" role="tablist" aria-label="头像框来源切换">
          <button type="button" data-action="framesourcetab" data-tab="preset" class="${
            frameGallerySourceTab === 'preset' ? 'active' : ''
          }" data-testid="frame-tab-preset">预设头像框 (${
            AVATAR_FRAME_AUDIT_STATS.uniqueUrls
          })</button>
          <button type="button" data-action="framesourcetab" data-tab="custom" class="${
            frameGallerySourceTab === 'custom' ? 'active' : ''
          }" data-testid="frame-tab-custom">用户上传的头像框 (${customList.length})</button>
        </div>

        <div class="frame-modal-body">
          ${renderFrameModalBodyInnerHtml(ownerType, displayName, staged)}
        </div>

        <div class="frame-modal-footer">
          <button type="button" class="btn secondary frame-modal-btn" data-action="cancelframemodal" data-testid="cancel-frame-modal-btn">取消</button>
          <button type="button" class="btn frame-modal-btn" data-action="applyframemodal" data-testid="apply-frame-modal-btn">${baseOwner ? '应用' : '应用到创建草稿'}</button>
        </div>
      </div>
    </div>`;
  }

  function renderTerminalFrameAssetManagerCard(): string {
    const customList = Array.isArray(data.customFrames) ? data.customFrames : [];
    const hasStaged = Boolean(stagedTerminalFrameBlob && stagedTerminalFramePreviewUrl);
    return `<div class="card frame-asset-manager-card" data-testid="terminal-frame-asset-manager">
      <div class="row between" style="align-items:flex-start;gap:10px">
        <div>
          <h3 style="margin-bottom:4px">头像框素材管理（图库上传与维护）</h3>
          <div class="tiny muted">终端仅负责本地头像框素材的上传预览、入库与清理，<strong>不会直接改动任何角色正在使用的头像框</strong>。若要为角色更换头像框，请前往该角色的「人物编辑页」。</div>
        </div>
        <span class="pill" data-testid="terminal-custom-frame-count">已入库 ${customList.length} 款</span>
      </div>

      <div class="row between" style="margin:12px 0 10px;flex-wrap:wrap;gap:8px">
        <label class="btn small secondary" style="cursor:pointer" data-testid="terminal-stage-frame-label">
          ＋ 选择本地头像框文件预览 (PNG / SVG / GIF / WebP)
          <input type="file" id="terminal-frame-file-input" data-testid="terminal-frame-file-input" accept="image/png,image/svg+xml,image/gif,image/webp,.svg,.gif" hidden>
        </label>
        <span class="tiny muted">预设图库共内置 ${AVATAR_FRAME_AUDIT_STATS.uniqueUrls} 款去重动态 GIF（<code>preset_frame_001..363</code>）</span>
      </div>

      ${
        hasStaged
          ? `<div class="frame-staging-preview-box" data-testid="terminal-frame-staging-box">
              <div class="frame-preview-stage" style="margin:0">
                <div class="frame-preview-avatar-wrap frame-checkerboard">
                  ${avatarView({name:'预',frameLayoutVersion:1},'role','avatar large frame-live-preview',{framePreviewUrl:stagedTerminalFramePreviewUrl})}
                </div>
                <div class="frame-preview-info" style="flex:1">
                  <b>待确认素材预览 · 尚未写入图库</b>
                  <p class="tiny muted">请检查透明通道与动态效果。确认无误后点击「确认加入头像框图库」；点击「取消上传」将直接丢弃，不会写入 IndexedDB。</p>
                  <div class="fieldrow" style="margin:6px 0">
                    <label class="tiny">素材名称</label>
                    <input class="field" id="terminal-staged-frame-name" data-testid="terminal-staged-frame-name" value="${esc(
                      stagedTerminalFrameName
                    )}" maxlength="36" placeholder="输入头像框名称">
                  </div>
                  <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px">
                    <button type="button" class="btn small" data-action="confirmterminalframeupload" data-testid="terminal-frame-confirm-btn">${uiIcon('check')} 确认加入头像框图库</button>
                    <button type="button" class="btn small ghost" data-action="cancelterminalframeupload" data-testid="terminal-frame-cancel-btn">${uiIcon('close')} 取消上传</button>
                  </div>
                </div>
              </div>
            </div>`
          : ''
      }

      <div class="section" style="margin-top:12px">已上传的自定义头像框素材 · ${customList.length} 款</div>
      ${
        customList.length
          ? `<div class="frame-grid" data-testid="terminal-custom-frame-grid">
              ${customList
                .map(
                  (cf) => `<div class="frame-cell custom-frame-cell" data-testid="terminal-custom-frame-item-${esc(
                    cf.id
                  )}">
                    <div class="frame-custom-pick" style="cursor:default">
                      <div class="frame-thumb-box frame-checkerboard">
                        <span class="frame-thumb-base">样</span>
                        ${
                          cf.mediaId
                            ? `<img class="frame-thumb-img" data-media-id="${esc(
                                cf.mediaId
                              )}" alt="${esc(cf.name)}">`
                            : `<img class="frame-thumb-img" src="${esc(
                                cf.dataUrl || ''
                              )}" alt="${esc(cf.name)}">`
                        }
                      </div>
                      <span class="frame-cell-label">${esc(cf.name)}</span>
                    </div>
                    <button type="button" class="frame-custom-del" title="从图库删除该素材" data-action="deletecustomframe" data-custom-id="${esc(
                      cf.id
                    )}" data-testid="terminal-delete-custom-frame-${esc(cf.id)}">×</button>
                  </div>`
                )
                .join('')}
            </div>`
          : `<div class="sub" style="padding:10px 0">图库中暂无用户上传的自定义头像框素材。</div>`
      }
    </div>`;
  }

  const role = (): RoleData | undefined =>
    data.roles.find((r) => r.id === data.selected);

  const ongoing = (r?: RoleData | null): boolean => Boolean(r?.scene || r?.play);
  const isFocused = (r?: RoleData | null): boolean =>
    Boolean(r?.chatTiming?.focused);
  const pendingFor = (r?: RoleData | null): number =>
    (r?.pendingReplies || []).length;
  const activeFocus = (): ActiveFocusSession | null => data.focus?.active || null;

  function isRoleInActiveFocus(r: RoleData, f = activeFocus()): boolean {
    if (!f) return false;
    if (Array.isArray(f.participantRoleIds)) {
      return f.participantRoleIds.includes(r.id);
    }
    return Boolean(f.companion && f.ownerId === r.id);
  }

  function activity(r: RoleData, t: number) {
    const a = routine(r, t);
    if(awaitingNainOpening(r))return {...a,label:'等待首条消息',where:r.place,doing:'尚未开始正式互动'};
    const f = activeFocus();
    if (
      f &&
      isRoleInActiveFocus(r, f) &&
      (f.status === 'running' || f.status === 'paused')
    ) {
      const pState = (f.participants || []).find((p) => p.roleId === r.id);
      return {
        ...a,
        doing:
          f.status === 'paused'
            ? '共同专注暂时暂停，稍作休息'
            : pState?.statusText || '和你各自在自己的地方专注，暂时少看手机',
        label: f.status === 'paused' ? '共同专注暂停' : '共同专注',
      };
    }
    return a;
  }

  function focusElapsed(f: ActiveFocusSession): number {
    return computeFocusElapsedMs(f, Date.now());
  }

  const focusRemaining = (f: ActiveFocusSession): number =>
    computeFocusRemainingMs(f, Date.now());

  function chatAvailability(r: RoleData, t = now()) {
    const af = activeFocus();
    if (af && isRoleInActiveFocus(r, af) && af.status === 'running') {
      return {
        type: 'later' as const,
        dueAt: now() + focusRemaining(af),
        reason: '我们不是说好先专心做自己的事吗？等这一轮结束再聊。',
      };
    }
    if (r.scene || r.play) return {
      type: 'later' as const,
      dueAt: t + 3600000,
      reason: '当前场景还没有结束。',
    };
    return {
      type: 'accepted' as const,
      dueAt: null,
      reason: '我现在有空。来，认真聊一会儿。',
    };
  }

  const saveError = ():string => {
    switch(saveSession.error){
      case 'uncertain':return '存档写入结果不确定，请刷新核对。新旧附件均保留。';
      case 'changed':return '此页面的存档版本已过期，未覆盖。请先复制未保存内容，再重新读取。';
      case 'read-only':return '当前页面只有读取权限。请保留草稿。若有其他 Elsewhere 标签页，请关闭后重新读取；若浏览器无法安全协调写入，则继续只读。';
      case 'unavailable':return '无法读取当前存档，未写入。请刷新后继续。';
      default:return '存档未保存，原记录保留。';
    }
  };
  function refreshSaveAccess():void{
    const notice=$<HTMLElement>('[data-world-save-notice]');
    if(!notice)return;
    const current=saveSession.current();
    notice.hidden=current;
    if(!current)notice.querySelector('span')!.textContent=saveError();
  }
  function postModel(url:string,options:RequestInit,onDispatch?:()=>void):Promise<Response>{
    if(!saveSession.current())return Promise.reject(new Error('请求尚未发送。'+saveError()));
    onDispatch?.();
    return fetch(url,options);
  }
  async function readModelBeforeDeadline<T>(read:(signal:AbortSignal)=>Promise<T>,parent?:AbortSignal,keepOnBFCache=false):Promise<T>{
    if(modelPageHidden)throw new DOMException('页面已离开，未发送请求','AbortError');
    const request=startRequestDeadline(read,parent);
    activeModelReads.set(request,keepOnBFCache);
    try{return await request.result;}
    finally{activeModelReads.delete(request);}
  }
  function checkWriteAccess():boolean{
    if(saveSession.current())return true;
    notify(saveError());refreshSaveAccess();
    return false;
  }
  const save = (world=data): boolean => {
    const originalId=world.draftWorldId;
    let assigned=false,confirmed=false;
    try {
      if(!draftNamespace(world)&&saveSession.hasWriter()){
        const candidate=draftWorldCandidates.get(world)||crypto.getRandomValues(new Uint32Array(4))
          .reduce((id,part)=>id+part.toString(16).padStart(8,'0'),'');
        draftWorldCandidates.set(world,candidate);
        world.draftWorldId=candidate;
        assigned=true;
      }
      if(!saveSession.write(JSON.stringify(world))){notify(saveError());refreshSaveAccess();return false;}
      confirmed=true;
      if(assigned&&world===data){
        for(const [scope,value] of draftMemory)storeDraft(scope,value);
      }
      return true;
    } catch {
      notify('存档无法序列化，未写入。');
      return false;
    } finally {
      if(assigned&&!confirmed){
        if(originalId===undefined)delete world.draftWorldId;
        else world.draftWorldId=originalId;
      }
    }
  };
  function saveLogged(type:string,detail:string,extra?:Record<string,unknown>):boolean{
    const logs=data.logs;
    data.logs=[...(logs||[])];
    syslog(type,detail,extra);
    if(save())return true;
    data.logs=logs;
    return false;
  }
  function restoreFields<T extends object>(value:T,snapshot:T):void{
    for(const key of Object.keys(value))if(!Object.hasOwn(snapshot,key))Reflect.deleteProperty(value,key);
    Object.assign(value,snapshot);
  }

  const notify = (msg: string): void => {
    if (typeof document.createElement !== 'function') return;
    document.querySelector('.toast')?.remove();
    const host = $('.phone');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    host.append(el);
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 3200);
  };
  function offerUnstoredReply(text:string,sourcesChanged=false):void{
    const dialog=document.createElement('dialog');
    dialog.className='fruit-dialog';
    dialog.innerHTML='<form method="dialog" class="fruit-dialog-body"><h2>回复已返回，保存未确认</h2><p>可以先复制这次的回复，再重新读取存档核对。应用不会因保存失败自动重发这条请求。</p><textarea class="field" aria-label="可复制的未确认回复" readonly rows="5"></textarea><button class="btn">关闭</button></form>';
    if(sourcesChanged){
      dialog.querySelector('h2')!.textContent='日记正文的来源已变化';
      dialog.querySelector('p')!.textContent='这份正文仅供复制，未归档，也不会作为后续记忆。查看和复制不重新请求。';
    }
    dialog.querySelector('textarea')!.value=text;
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    document.body.append(dialog);
    dialog.showModal();
  }

  const entry = (
    r: RoleData,
    kind: EventRecord['kind'],
    title: string,
    detail: string,
    at = now(),
    extra: Partial<EventRecord> = {}
  ): EventRecord => {
    const e: EventRecord = {
      id: uid(),
      kind,
      title,
      detail,
      at,
      status: 'active',
      ...extra,
    };
    r.events.push(e);
    return e;
  };

  function eMemory(
    r: RoleData,
    text: string,
    speaker: 'me' | 'char',
    kind: EventRecord['kind'] = 'chat',
    at = now(),
    messageId?: string
  ): EventRecord {
    return entry(
      r,
      kind,
      speaker === 'me' ? '你说过' : `${r.name}说过`,
      text,
      at,
      { speaker, messageId, knownBy: ['user', r.id],...(messageId?{sourceRevision:r.chats.find(m=>m.id===messageId)?.revisionCount||0}:{}) }
    );
  }

  function requestChatFocus(r:RoleData):void {
    const before=r.chatTiming?structuredClone(r.chatTiming):undefined;
    setChatFocused(r,!isFocused(r));
    if(!save()){r.chatTiming=before;return;}
    render(false);pumpChatSchedules();
  }

  function chatDelay(r:RoleData,quietAt:number):number {
    const availability=chatAvailability(r,quietAt);
    if(availability.dueAt)return Math.max(1000,availability.dueAt-quietAt);
    const characterOffset=Array.from(r.name+r.traits).reduce((sum,char)=>sum+char.charCodeAt(0),0)%30001;
    return 30000+characterOffset;
  }

  const novelTasks=createNovelTasks();
  const applyingSceneReplies=new Set<string>();
  async function applySavedSceneReply(r:RoleData,item:ChatMessage):Promise<void> {
    const ticket=item.sceneReply;if(!ticket||applyingSceneReplies.has(ticket.requestId))return;
    if(ticket.sceneId===null&&r.pendingReplies?.some(job=>job.replyTurnId===item.replyTurnId))return;
    traceStorage('scene-ticket-found',{pending:r.pendingReplies?.length||0,hasScene:!!r.scene});
    applyingSceneReplies.add(ticket.requestId);
    let retryable=false;
    const messages=ticket.sceneId===null?r.chats:r.scene?.id===ticket.sceneId?r.scene.messages:[];
    const replies=item.replyTurnId?messages.filter(m=>m.replyTurnId===item.replyTurnId):messages.filter(m=>m===item);
    try{
      traceStorage('scene-validation-started');
      if(!data.roles.includes(r)||ticket.sceneId===null&&(r.chatTiming?.pending.length||r.chatTiming?.inFlight)||!await sceneReplyMatches(r,data.user,ticket,replies))throw new Error('场景事件来源已变化');
      if(item.sceneReply!==ticket) return;
      delete item.sceneReply;
      const parsed=ticket.payload?resolveSceneReply(r,data.user,ticket,replies,now()):null;
      const decision=parsed?.action==='arrive'||ticket.sceneId===null&&parsed?.action!=='plan'?null:parsed;
      if(!decision){if(!save())throw new Error('状态确认保存失败');return;}
      retryable=true;
      traceStorage('scene-save-started');
      const result=commitSceneDecision(r,decision,now(),uid(),save,{requestId:ticket.requestId,replyIds:replies.map(m=>m.id),contextIds:ticket.contextIds});
      traceStorage('scene-save-confirmed',{hasScene:!!r.scene,result});
      if(result==='left'){
        if(!archiveScene(r))throw new Error('见面归档未完成');
        if(role()===r&&view==='novel'&&novelViewKind==='scene')go('chat');
      }else if(result==='none'&&!save())throw new Error('状态确认保存失败');
      if(result!=='none')syslog('scene-state','同次生成的场景事件已保存',{roleId:r.id,action:decision.action,source:ticket.sceneId||r.scene?.id});
      if(role()===r&&(view==='home'||view==='novel'&&novelViewKind==='scene'))render(false);
    }catch{
      traceStorage('scene-apply-failed',{reason:retryable?'save-failed':'source-invalid'});
      if(retryable)item.sceneReply=ticket;else delete item.sceneReply;
      syslog('scene-state','场景事件未采用；正文及已有状态保留，不追加模型请求',{roleId:r.id,requestId:ticket.requestId,code:retryable?'scene-state-save-failed':'scene-event-stale-or-invalid'});save();
    }finally{applyingSceneReplies.delete(ticket.requestId);}
  }
  function resumeLocalSceneReplies(r:RoleData):void {
    if(!saveSession.current())return;
    for(const item of [...r.chats,...(r.scene?.messages||[])])if(item.sceneReply)void applySavedSceneReply(r,item);
  }
  type RequestPromptOptions=NativePromptOptions&{preset:FruitPreset;presetId:string};
  const promptTraces=new Map<string,ReturnType<typeof promptStructure>&{profileRevision:number;requestedPresetId:string;actualPresetId:string;profileOwnerRoleId:string;profileSource:string;actualPresetHash:string;profileBaseHash:string;sentAt?:number;voice?:ReturnType<typeof chatVoiceSummary>}>();
  const chatVoiceDialog=createChatVoiceDialog({role,globalPreset:()=>data.preset,load:id=>loadRequestPreset('chat',id),save,trace:id=>{const t=promptTraces.get(id);return t?.mode==='chat'&&t.sentAt?t:undefined;}});
  function includeScenePromptTrace(r:RoleData):void {
    const trace=promptTraces.get(r.id);
    if(trace)trace.messages=[{order:1,role:'system',source:'同次场景事件控制'},...trace.messages.map(m=>({...m,order:m.order+1}))];
  }
  async function promptRecovery(r:RoleData,error:ConversationCompileError):Promise<'retry'|'native'|'cancel'>{
    return new Promise(resolve=>{
      const dialog=document.createElement('dialog');dialog.className='fruit-dialog';
      const problems=error.compilation.diagnostics.filter(d=>d.severity==='error'),legacyOnly=problems.length>0&&problems.every(d=>d.sourceId?.startsWith('legacy:'));
      dialog.innerHTML=`<div class="fruit-dialog-body"><h2>这次请求尚未发送</h2><p>配置和已发送消息均已保留。请检查下列条目；不会自动换用其他预设。</p><ul>${problems.map(d=>`<li>${esc(d.sourceId||'配置')} · ${esc(d.code)}：${esc(d.message)}</li>`).join('')}</ul><div class="row"><button class="btn" data-prompt-recover="retry">重试</button>${legacyOnly?'<button class="btn secondary" data-prompt-recover="native">本次仅使用原生</button><button class="btn secondary" data-prompt-recover="export">导出旧配置</button>':''}<button class="btn ghost" data-prompt-recover="cancel">取消</button></div></div>`;
      const finish=(choice:'retry'|'native'|'cancel')=>{dialog.close();dialog.remove();resolve(choice);};
      dialog.addEventListener('cancel',e=>{e.preventDefault();finish('cancel');});
      dialog.addEventListener('click',event=>{const action=event.target instanceof Element?event.target.closest<HTMLElement>('[data-prompt-recover]')?.dataset.promptRecover:'';
        if(action==='export'){const legacy=r.preset||data.preset;if(!legacy){notify('当前没有旧附加预设');return;}const url=URL.createObjectURL(new Blob([JSON.stringify(legacy,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='Elsewhere-legacy-preset.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
        if(action==='retry'||action==='native'||action==='cancel')finish(action);
      });document.body.append(dialog);dialog.showModal();
    });
  }
  async function compileRequest(r:RoleData,kind:'chat'|'scene'|'play'|'intermission',build:(options:RequestPromptOptions)=>ConversationCompilation,valid:()=>boolean){
    let skipLegacyOnce=false;
    while(true){
      const mode=kind==='scene'?'meeting':kind==='play'?'theatre':kind,snapshot=await loadRequestPreset(mode,r.id);
      if(!valid())throw new Error('请求来源已变化，未发送');
      try{
        const compilation=build({profile:snapshot.profile,skipLegacyOnce,preset:snapshot.preset,presetId:snapshot.actualPresetId});
        promptTraces.set(r.id,{...promptStructure(compilation),profileRevision:snapshot.revision,requestedPresetId:snapshot.requestedPresetId,actualPresetId:snapshot.actualPresetId,profileOwnerRoleId:snapshot.roleId,profileSource:snapshot.configSource,actualPresetHash:snapshot.presetHash,profileBaseHash:snapshot.profileBaseHash,...(kind==='chat'?{voice:chatVoiceSummary(describeChatVoice(snapshot.profile,r,data.preset),skipLegacyOnce)}:{})});
        const messages=requestMessages(compilation);
        if(!valid())throw new Error('请求来源已变化，未发送');
        return messages;
      }catch(error){
        if(!(error instanceof ConversationCompileError))throw error;
        const action=await promptRecovery(r,error);if(action==='cancel')throw new Error('Prompt 编译未完成，请在预设 App 检查配置；原消息保留');
        if(action==='native')skipLegacyOnce=true;
      }
    }
  }

  async function requestPhoneReply(r:RoleData,messages:{role:string;content:string}[],signal:AbortSignal,task:'chat'|'first-message'='chat'):Promise<string> {
      const settings={...data.settings};
      const pendingResponse=postModel(settings.endpoint.trim().replace(/\/+$/,'')+'/chat/completions',{
        method:'POST',signal,
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
        body:JSON.stringify({model:settings.model,messages,stream:false,temperature:+settings.temperature,...completionLimit(settings,task)}),
      });
      const trace=promptTraces.get(r.id);if(trace?.mode==='chat')trace.sentAt=now();
      chatTyping.add(r.id);
      if(view==='chat'&&role()?.id===r.id)patchDynamicRegionsOnTick();
      return readChatResponse(await pendingResponse);
  }

  async function runChatBatch(r:RoleData,batch:ChatBatch):Promise<void> {
    const controller=new AbortController();activeChatRequests.set(r.id,controller);
    try{
      const compiled:{value?:ConversationCompilation}={};
      const messages=await compileRequest(r,'chat',options=>{const result=compileChatBatchPrompt(data,r,batch,now(),options);compiled.value=result;return result;},()=>data.roles.includes(r)&&chatBatchValid(r,batch));
      let prepared:Awaited<ReturnType<typeof prepareSceneReply>>|undefined;
      if(!r.scene&&!r.play&&compiled.value){const at=now(),context=buildNativeContext(data,r,'chat','',{nowTs:at,currentInputs:batch.sources});prepared=await prepareSceneReply(r,data.user,createSceneObservation(r,context),compiled.value,{requestId:batch.id,now:at,inputIds:batch.sources.map(m=>m.id)});}
      if(!data.roles.includes(r)||!chatBatchValid(r,batch))return;
      if(prepared)includeScenePromptTrace(r);
      const usedIds=new Set(compiled.value?.messages.flatMap(m=>m.sourceIds||[])||[]);
      const personal=preparePersonalReply(r,prepared?.messages||messages,now(),batch.id,'',r.chats.filter(m=>usedIds.has(m.id)),'chat',true);
      const privateReply=splitPersonalReply(await requestPhoneReply(r,personal.messages,controller.signal));
      const extracted=splitSceneReply(privateReply.text),text=extracted.text;
      if(!data.roles.includes(r)||!chatBatchValid(r,batch)){
        if(r.chatTiming?.inFlight?.id===batch.id){reviseChatTiming(r,now());save();}
        return;
      }
      const bubbles=splitChatBubbles(text,r);
      if(!bubbles.length)throw new Error('回复中没有有效的手机消息');
      const timingBefore=structuredClone(r.chatTiming),outboxBefore=r.pendingReplies;
      if(!completeChatBatch(r,batch))return;
      const turnId=makeUid('turn'),base=now();
      r.pendingReplies=[...(r.pendingReplies||[]),...bubbles.map((bubble,i)=>({id:uid(),replyTo:batch.sources.at(-1)!.id,replyTurnId:turnId,bubbles:[bubble],dueAt:base+i*240,sources:batch.sources,chatBatchId:batch.id,...(i===bubbles.length-1&&privateReply.payload?{personalReply:{ticket:personal.ticket,payload:privateReply.payload}}:{}),...(prepared&&extracted.payload&&i===bubbles.length-1?{sceneReply:{...prepared.ticket,payload:extracted.payload}}:{})}))];
      if(!save()){r.chatTiming=timingBefore;r.pendingReplies=outboxBefore;offerUnstoredReply(bubbles.join('\n'));throw new Error('回复已返回，保存未确认；重新发送可能再次计费');}
      deliverPending(r);
    }catch(error){
      if(data.roles.includes(r)&&r.chatTiming?.inFlight?.id===batch.id){
        const reason=error instanceof Error && error.name!=='AbortError'?error.message:'回复请求已中断，请重试';
        failChatBatch(r,batch,reason);save();
      }
    }finally{
      if(activeChatRequests.get(r.id)===controller){activeChatRequests.delete(r.id);chatTyping.delete(r.id);}
      if(view==='chat'&&role()?.id===r.id)patchDynamicRegionsOnTick();
    }
  }

  function pumpChatSchedules():void {
    if(!saveSession.current())return;
    for(const r of data.roles){
      if(!r.chatTiming)continue;
      const before=structuredClone(r.chatTiming),at=now();
      prepareChatDue(r,at,quietAt=>chatDelay(r,quietAt));
      const sceneWaiting=chatSceneEntry(r.chatTiming);
      const batch=activeChatRequests.has(r.id)||sceneWaiting&&(busy||document.hidden||role()!==r||view!=='chat'||r.pendingReplies?.length)
        ?null:claimChatBatch(r,at,Boolean(token.trim())&&canUseRealModel(data.settings));
      if(JSON.stringify(r.chatTiming)!==JSON.stringify(before)){
        if(!save()){
          r.chatTiming=before;
          if(batch){before.blocked='failed';before.error='调度未能确认保存，本次请求尚未发送。';}
          if(view==='chat'&&role()?.id===r.id)patchDynamicRegionsOnTick();
          return;
        }
        if(view==='chat'&&role()?.id===r.id)patchDynamicRegionsOnTick();
      }
      if(batch?.entry)void runMeetingRound(r,batch);
      else if(batch)void runChatBatch(r,batch);
    }
  }

  let proactiveBusy=false;
  async function runProactive(r:RoleData,task:ProactiveTask):Promise<void> {
    const controller=new AbortController();activeChatRequests.set(r.id,controller);
    const valid=()=>data.roles.includes(r)&&proactiveTaskValid(r,task);
    try{
      const messages=await compileRequest(r,'chat',options=>compileNativeConversation(data,r,'chat','',{...options,nowTs:now(),openingTask:proactiveInstruction(task)}),valid);
      if(!valid())return;
      const personal=preparePersonalReply(r,messages,now(),task.id);
      const response=parseProactiveReply(await requestPhoneReply(r,personal.messages,controller.signal),task);
      if(!valid())return;
      if(!response.send){
        const previous=structuredClone(r.proactive),privateBefore=r.personalThreads;
        if(response.payload)applyPersonalReply(r,personal.ticket,response.payload,now());
        finishProactive(r,task,'skipped');
        if(!save()){r.proactive=previous;r.personalThreads=privateBefore;throw new Error('私人关注未能保存');}
        return;
      }
      const bubbles=splitChatBubbles(response.text,r);if(!bubbles.length)throw new Error('主动联系没有有效正文');
      const outbox=r.pendingReplies,previous=structuredClone(r.proactive),base=now();
      r.pendingReplies=[...(outbox||[]),...bubbles.map((bubble,i)=>({id:uid(),replyTo:'',replyTurnId:task.id,proactiveId:task.id,bubbles:[bubble],dueAt:base+i*240,...(i===bubbles.length-1&&response.payload?{personalReply:{ticket:personal.ticket,payload:response.payload}}:{})}))];
      finishProactive(r,task,'queued');
      if(!save()){r.pendingReplies=outbox;r.proactive=previous;throw new Error('主动消息未能保存');}
      deliverPending(r);
      syslog('chat-contact','角色自主联系已入队',{roleId:r.id,source:task.id});
    }catch(error){
      finishProactive(r,task,'failed',error instanceof Error?error.message:'联系失败');save();
      syslog('chat-contact','主动联系未发送；保留冷却，不自动重试',{roleId:r.id,code:'contact-failed'});
    }finally{
      const saved=r.proactive?.attempts.find(t=>t.id===task.id);
      if(saved?.status==='attempted'){finishProactive(r,task,'cancelled');save();}
      if(activeChatRequests.get(r.id)===controller){activeChatRequests.delete(r.id);chatTyping.delete(r.id);}
      proactiveBusy=false;
      if(view==='chat'&&role()?.id===r.id)patchDynamicRegionsOnTick();
    }
  }
  function pumpProactive():void {
    if(document.hidden||proactiveBusy||busy||diaryQueueBusy||lifeBusy||activeChatRequests.size||!token.trim()||!canUseRealModel(data.settings))return;
    for(const r of data.roles){
      if(isRoleInActiveFocus(r))continue;
      const previous=r.proactive?structuredClone(r.proactive):undefined,task=claimProactive(data.roles,r,now(),true);
      if(!task)continue;
      if(!save()){r.proactive=previous;return;}
      proactiveBusy=true;void runProactive(r,task);return;
    }
  }

  // The journal is only a durable cost ledger; formal life remains in role.events.
  let lifeBusy=false,lifeLastCheck=0,lifeController:AbortController|null=null,lifeJournalError='';
  let lifeClaims:LifeTask[]=[];
  const lifeEnabled=()=>data.settings.autonomousLife!==false;
  const lifeVersion=(r:RoleData)=>JSON.stringify([r.chats,r.scene,r.play,r.events,r.personalThreads,r.memory,r.name,r.profile,r.job,r.traits,r.place,r.relationship,r.canonNotes,r.notes]);
  function storedLifeVersion(id:string):string {
    const stored=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null') as AppData|null;
    const r=stored?.roles?.find(r=>r.id===id);if(!r)throw Error('生活来源已变化');return lifeVersion(r);
  }
  function pumpRoleLife():void {
    if(document.hidden||lifeJournalError||lifeBusy||busy||diaryQueueBusy||proactiveBusy||activeChatRequests.size||!token.trim()||!canUseRealModel(data.settings)||data.settings.autonomousLife===false||now()-lifeLastCheck<60000)return;
    lifeLastCheck=now();
    if(!navigator.locks){lifeJournalError='此浏览器无法安全协调多标签页，自动推进已暂停。';return;}
    lifeBusy=true;
    void navigator.locks.request('elsewhere-life-budget-v1',{ifAvailable:true},async lock=>{
      if(!lock)return;
      let journal:LifeTask[];try{journal=await syncLifeBudget([...readLifeJournal(localStorage),...data.roles.flatMap(r=>r.lifeTasks||[])]);lifeClaims=journal;}catch{lifeJournalError='生活调用额度记录无法核验，自动推进已暂停。';return;}
      if(localStorage.getItem(STORAGE_KEY)!==saveSession.raw){lifeJournalError='其他标签页更新了存档，请刷新后继续生活推进。';return;}
      const roles=[...data.roles].sort((a,b)=>(a.id===data.selected?-1:b.id===data.selected?1:0));
      for(const r of roles){
        if(isRoleInActiveFocus(r))continue;
        const previous=r.lifeTasks?structuredClone(r.lifeTasks):undefined;
        const task=claimLifeTask(data.roles,r,now(),true,journal);if(!task)continue;
        try{if(!await reserveLifeAttempt(task,journal)){r.lifeTasks=previous;return;}}catch{r.lifeTasks=previous;lifeJournalError='生活额度无法可靠占用，未发送请求。';return;}
        journal=[...journal,task];lifeClaims=journal;
        try{writeLifeJournal(localStorage,journal);}catch{r.lifeTasks=previous;lifeJournalError='无法保存生活调用额度，未发送请求。';return;}
        let maySave=true,version='';const hadThreads=Array.isArray(r.personalThreads);
        const controller=new AbortController();lifeController=controller;
        const timeout=setTimeout(()=>controller.abort(),90000);
        try{
          if(!data.roles.includes(r)||r.scene||r.play||r.chatTiming?.pending.length||r.chatTiming?.inFlight||!lifeEnabled()||localStorage.getItem(STORAGE_KEY)!==saveSession.raw||!save())throw Error('生活任务未能保存');
          const prepared=prepareLifeTask(r,data.user,task),settings={...data.settings};version=lifeVersion(r);
          if(storedLifeVersion(r.id)!==version)throw Error('生活来源已变化');
          syslog('life','独立生活推进已开始',{roleId:r.id,taskId:task.id});
          const res=await postModel(settings.endpoint.trim().replace(/\/+$/,'')+'/chat/completions',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({model:settings.model,messages:prepared.messages,temperature:settings.temperature,max_tokens:LIFE_MAX_OUTPUT,stream:false})});
          const raw=await readChatResponse(res);
          maySave=localStorage.getItem(STORAGE_KEY)===saveSession.raw&&storedLifeVersion(r.id)===version;
          if(controller.signal.aborted||!maySave||!data.roles.includes(r)||lifeVersion(r)!==version||data.settings.autonomousLife===false||isRoleInActiveFocus(r))throw Error('生活来源或任务已变化');
          commitLifeTask(r,task,prepared,raw,now());
          if(localStorage.getItem(STORAGE_KEY)!==saveSession.raw||!save())throw Error('生活记录保存失败');
          syslog('life',task.status==='quiet'?'该窗口没有需要单独记录的生活事件':'独立生活已归档',{roleId:r.id,taskId:task.id});
        }catch(error){
          r.events=r.events.filter(e=>e.lifeRecord?.taskId!==task.id);
          if(r.personalThreads){r.personalThreads=r.personalThreads.filter(t=>t.requestId!==task.id);if(!hadThreads&&!r.personalThreads.length)delete r.personalThreads;}
          try{maySave=maySave&&localStorage.getItem(STORAGE_KEY)===saveSession.raw;}catch{maySave=false;}
          task.status=controller.signal.aborted?'cancelled':'failed';
          // Never log a model body or arbitrary transport error into diagnostics.
          task.error=controller.signal.aborted?'已取消或超时':error instanceof Error&&error.message==='生活记录保存失败'?'本地保存失败':'响应或来源未通过校验';
          if(maySave)save();
          syslog('life','独立生活未归档，额度已占用，不自动重试',{roleId:r.id,code:task.status});
        }finally{
          clearTimeout(timeout);lifeController=null;
          try{writeLifeJournal(localStorage,journal);}catch{lifeJournalError='生活调用记录保存失败，自动推进已暂停。';}
          if(view==='monitor'&&role()?.id===r.id)render(false);
        }
        return;
      }
    }).catch(()=>{lifeJournalError='生活任务协调失败，自动推进已暂停。';}).finally(()=>{lifeBusy=false;});
  }

  function acceptPhoneMessage(r:RoleData,item:ChatMessage,updateComposer=true):boolean {
    const timing=r.chatTiming;
    if(timing?.inFlight?.entry||timing?.pending.length&&chatSceneEntry(timing)&&item.at>=timing.quietUntil){
      notify('本轮线下聚合已结束，未发送的内容仍保留。');return false;
    }
    const timingBefore=r.chatTiming?structuredClone(r.chatTiming):undefined;
    const chatsBefore=r.chats.length,eventsBefore=r.events.length,planBefore=r.meetingPlan,memoryBefore=r.memory;
    r.chats.push(item);eMemory(r,item.text,'me','chat',item.at,item.id);syncRoleMemory(r,item.at);enqueueChat(r,item.id,item.at);r.meetingPlan=meetingPlan(r,item.at);
    if(!save()){r.chats.length=chatsBefore;r.events.length=eventsBefore;r.chatTiming=timingBefore;r.meetingPlan=planBefore;r.memory=memoryBefore;return false;}
    if(r.proactive?.attempts.some(t=>t.status==='attempted'))activeChatRequests.get(r.id)?.abort();
    if(updateComposer&&role()===r)quotingMessage=null;
    // Accepted sends reveal the new bubble after the caller restores its draft/focus.
    queueMicrotask(()=>{
      const pane=$<HTMLElement>('#scroll-area');
      if(view==='chat'&&role()?.id===r.id&&pane?.dataset.roleId===r.id)pane.scrollTop=pane.scrollHeight;
    });
    return true;
  }

  function revisePhoneSchedule(r:RoleData,cancel=true,editedOrWithdrawnId?:string):void {
    if(cancel){activeChatRequests.get(r.id)?.abort();chatTyping.delete(r.id);}
    r.meetingPlan=meetingPlan(r,now());
    if(!r.chatTiming)return;
    reviseChatTiming(r,now(),editedOrWithdrawnId);
  }

  async function requestAiLiveLogForActiveSession(
    sessionId: string,
    momentId: string,
    roleId: string
  ): Promise<void> {
    const world=data,f=activeFocus();
    if(!f||f.id!==sessionId||f.status!=='running'||modelPageHidden||
      focusLiveOperation?.session===f||!canUseRealModel(world.settings)||!saveSession.current())return;
    const roleItem=world.roles.find(r=>r.id===roleId);
    const moment=f.moments.find(m=>m.id===momentId&&m.roleId===roleId);
    if(!roleItem||!moment||moment.aiAttempt||!f.participantRoleIds?.includes(roleId))return;

    const settings=world.settings,credential=token,connection=apiConnectionVersion,epoch=modelPageEpoch;
    const elapsedMin=Math.max(1,Math.round(focusElapsed(f)/60000));
    const promptText=buildFocusLiveLogAiPrompt(roleItem,f,elapsedMin);
    const basis=()=>JSON.stringify([f.runSince,f.tasks,roleItem.name,roleItem.job,roleItem.place,roleItem.traits,moment.title,moment.detail]);
    const source=basis();
    const attempt={id:uid(),status:'unknown' as const};
    moment.aiAttempt=attempt;
    if(!save()){delete moment.aiAttempt;return;}

    const operation={world,session:f};
    focusLiveOperation=operation;
    const current=()=>data===world&&activeFocus()===f&&f.status==='running'&&
      focusLiveOperation===operation&&epoch===modelPageEpoch&&world.roles.includes(roleItem)&&
      f.participantRoleIds?.includes(roleId)&&f.moments.includes(moment)&&moment.aiAttempt===attempt&&basis()===source;
    try {
      if(!current()||connection!==apiConnectionVersion||settings!==world.settings||credential!==token||!saveSession.current())return;
      const json=await readModelBeforeDeadline(async signal=>{
        const res=await postModel(settings.endpoint.trim().replace(/\/+$/,'')+'/chat/completions',{
          method:'POST',signal,
          headers:{'Content-Type':'application/json',...(credential?{Authorization:'Bearer '+credential}:{})},
          body:JSON.stringify({model:settings.model,messages:[{role:'user',content:promptText}],temperature:+settings.temperature||0.7,...completionLimit(settings,'focus-log')}),
        });
        if(!res.ok)throw Error('Focus 实况请求未完成');
        return res.json();
      });
      const raw=String(json.choices?.[0]?.message?.content||'').trim();
      const match=raw.match(/\{[\s\S]*\}/);
      if(!match||!current()||!saveSession.current())return;
      const parsed=JSON.parse(match[0]);
      const previous={...moment};
      const newer=f.moments.slice(f.moments.indexOf(moment)+1).some(m=>m.roleId===roleId);
      const participant=newer?undefined:f.participants?.find(p=>p.roleId===roleId);
      const previousParticipant=participant&&{...participant};
      if(parsed.detail){
        if(parsed.title)moment.title=String(parsed.title).slice(0,48);
        moment.detail=String(parsed.detail).slice(0,220);
        if(parsed.innerThought)moment.innerThought=String(parsed.innerThought).slice(0,120);
        moment.isAiGenerated=true;
      }
      if(participant&&parsed.statusText){
        participant.statusText=String(parsed.statusText).slice(0,60);
        if(parsed.innerThought)participant.currentThought=String(parsed.innerThought).slice(0,120);
      }
      moment.aiAttempt={...attempt,status:'archived'};
      if(!save()){
        restoreFields(moment,previous);
        if(participant&&previousParticipant)restoreFields(participant,previousParticipant);
        return;
      }
      if(view==='focus')render(false);
    }catch{
      // Keep the grounded moment and its receipt. Only a newly scheduled moment can send again.
    }finally{
      if(focusLiveOperation===operation)focusLiveOperation=null;
    }
  }

  async function requestAiFocusSummariesForSession(sessionId: string, manualTrigger = false): Promise<void> {
    const world=data,epoch=modelPageEpoch;
    if(focusSummaryOperation?.world===world||modelPageHidden)return;
    ensureFocusData();
    const rec = world.focus?.completed.find(item => item.id === sessionId);
    const membership = [...(rec?.participantRoleIds || [])];
    const participants = new Map(world.roles.filter(r => membership.includes(r.id)).map(r => [r.id, r]));
    if (!rec || !participants.size) return;
    if (!canUseRealModel(world.settings)) {
      if (manualTrigger) notify('尚未连接可用 API，原专注小结已保留。');
      return;
    }

    const previousRun = rec.summaryRun;
    const legacyInterrupted = !previousRun && (rec.summaryStatus === 'generating' || rec.summaryStatus === 'failed');
    if (!manualTrigger && (previousRun || legacyInterrupted)) return;
    const savedIds = new Set(rec.roleSummaries?.filter(item => item.source === 'ai').map(item => item.roleId));
    const remaining = [...new Set(previousRun?.remainingRoleIds || membership.filter(id => !legacyInterrupted || !savedIds.has(id)))]
      .filter(id => participants.has(id));
    const pendingRoleId = previousRun?.pendingRoleId;
    const pending = pendingRoleId && remaining.includes(pendingRoleId) ? pendingRoleId : undefined;
    if (remaining.length && (pending || legacyInterrupted)
      && !window.confirm('上次请求可能已被服务商处理，重试可能再次计费。确认继续？')) return;
    if (!remaining.length) {
      rec.summaryStatus = 'ready';
      delete rec.summaryError;
      delete rec.summaryRun;
      save();
      render(false);
      return;
    }

    const settings = Object.freeze({...world.settings, endpoint:normalizeApiBase(world.settings.endpoint)});
    const connection = Object.freeze({settings, key:token, version:apiConnectionVersion});
    let storedCredential: string|null;
    try {storedCredential = localStorage.getItem(DEVICE_API_KEY);}
    catch {notify('无法核对设备凭据，未发送专注小结请求。');return;}
    if (readDeviceApiKey(localStorage, settings.endpoint) !== connection.key || !saveSession.current()) {
      notify('连接或存档已变化，请重新读取后再生成小结。');
      return;
    }
    const connectionCurrent = () => {
      if(data!==world||epoch!==modelPageEpoch||connection.version!==apiConnectionVersion||!saveSession.current())return false;
      try {return localStorage.getItem(DEVICE_API_KEY) === storedCredential;}
      catch {return false;}
    };
    const progress: NonNullable<typeof rec.summaryRun> = {
      remainingRoleIds:pending?[pending,...remaining.filter(id=>id!==pending)]:remaining,
      ...(pending?{pendingRoleId:pending,pendingAttemptId:previousRun?.pendingAttemptId}:{}),
    };
    const original = {summaryRun:previousRun, summaryStatus:rec.summaryStatus, summaryError:rec.summaryError};
    rec.summaryRun = progress;
    rec.summaryStatus = 'generating';
    delete rec.summaryError;
    if (!save()) {Object.assign(rec,original);return;}

    const operation={world};
    focusSummaryOperation=operation;
    const currentRecord = () => data === world && focusSummaryOperation === operation
      && [...participants.values()].every(participant => world.roles.includes(participant))
      ? world.focus?.completed.find(item => item.id === sessionId && item.summaryRun === progress && item.summaryStatus === 'generating'
        && item.participantRoleIds?.length === membership.length && membership.every((id,index)=>item.participantRoleIds?.[index]===id))
      : undefined;
    let failure = 'AI 小结请求未完成。';
    try {
      render(false);
      for (const roleId of progress.remainingRoleIds) {
        const roleItem = participants.get(roleId)!;
        const current = currentRecord();
        if (!current) return;
        if (!connectionCurrent()) {failure = '连接或存档已变化，已停止发送剩余小结。';break;}

        const prompt = buildFocusSummaryAiPrompt(roleItem, current);
        const previousPending=progress.pendingRoleId,previousAttempt=progress.pendingAttemptId;
        const attemptId=uid();
        const restorePending=()=>{
          progress.pendingRoleId=previousPending;
          progress.pendingAttemptId=previousAttempt;
        };
        // A refresh after this commit cannot tell whether the POST left the browser.
        progress.pendingRoleId = roleId;
        progress.pendingAttemptId=attemptId;
        if(!save()){restorePending();failure='小结领取未能确认保存。';break;}
        if (!connectionCurrent()) {
          restorePending();
          failure = '连接或存档已变化，已停止发送剩余小结。';
          break;
        }
        const json=await readModelBeforeDeadline(async signal=>{
          const res=await postModel(settings.endpoint + '/chat/completions', {
            method: 'POST',
            signal,
            redirect: 'error',
            headers: {
              'Content-Type': 'application/json',
              ...(connection.key ? {Authorization:'Bearer ' + connection.key} : {}),
            },
            body: JSON.stringify({
              model:settings.model,
              messages:[{role:'user',content:prompt}],
              temperature:+settings.temperature || 0.7,
              ...completionLimit(settings,'focus-summary'),
            }),
          });
          if(!res.ok){failure=`AI 小结请求未完成（HTTP ${res.status}）。`;throw Error(failure);}
          return res.json();
        });
        const text = String(json.choices?.[0]?.message?.content || '').trim();
        if (!text) {failure = '模型未返回有效小结。';break;}
        const latest = currentRecord();
        if(!latest||epoch!==modelPageEpoch||progress.pendingAttemptId!==attemptId||
          buildFocusSummaryAiPrompt(roleItem,latest)!==prompt||!saveSession.current())return;

        const previousSummaries = latest.roleSummaries, previousRemaining = progress.remainingRoleIds;
        const summaries = [...(previousSummaries || [])];
        const index = summaries.findIndex(item=>item.roleId===roleId);
        const summary = {roleId,roleName:roleItem.name,text:text.slice(0,320),at:now(),source:'ai' as const};
        if (index >= 0) summaries[index] = summary;
        else summaries.push(summary);
        latest.roleSummaries = summaries;
        progress.remainingRoleIds = previousRemaining.filter(id => id !== roleId);
        delete progress.pendingRoleId;
        delete progress.pendingAttemptId;
        const complete = !progress.remainingRoleIds.length;
        if (complete) {
          latest.summaryStatus = 'ready';
          delete latest.summaryRun;
        }
        if (!save()) {
          latest.roleSummaries = previousSummaries;
          latest.summaryStatus = 'generating';
          latest.summaryRun = progress;
          progress.remainingRoleIds = previousRemaining;
          progress.pendingRoleId = roleId;
          progress.pendingAttemptId=attemptId;
          failure = '小结写入未确认。';
          break;
        }
        if (complete) {
          if (manualTrigger) notify('已更新 AI 角色专注小结');
          return;
        }
      }
    } catch(error) {
      if(error instanceof Error&&error.name==='TimeoutError')failure='AI 小结响应超时。';
    } finally {
      const current = currentRecord();
      if(current&&epoch===modelPageEpoch&&saveSession.current()){
        current.summaryStatus = 'failed';
        current.summaryError = failure + (progress.pendingRoleId
          ? '请求可能已被服务商处理。结果未确认，未自动重试。'
          : '已保存的小结保留，剩余请求尚未发送。');
        save();
        if (manualTrigger) notify(current.summaryError);
      }
      if(focusSummaryOperation===operation){
        focusSummaryOperation=null;
        if (data === world) render(false);
      }
    }
  }

  function syncFocusMoments(): boolean {
    const f = activeFocus();
    if (!f || f.status !== 'running') return false;
    const previous=f.moments,previousCount=previous?.length||0,previousDue=f.nextLiveLogDueAt;
    const participants=f.participants?.map(p=>({...p}));
    const added = syncActiveFocusLiveLogs(f, data.roles, now());
    if (added.length > 0) {
      if(!save()){
        f.moments=previous;
        if(previous)previous.length=previousCount;
        f.nextLiveLogDueAt=previousDue;
        f.participants=participants;
        return false;
      }
      const latest = added[added.length - 1];
      if (latest.roleId && canUseRealModel(data.settings)) {
        void requestAiLiveLogForActiveSession(f.id, latest.id, latest.roleId);
      }
      return true;
    }
    return false;
  }

  function completeFocusIfDue(): boolean {
    const f = activeFocus();
    if (!f || f.status !== 'running' || focusRemaining(f) > 0) return false;
    syncFocusMoments();
    const settled = settleActiveFocusSession(data, 'completed', now());
    if (!settled) return false;
    focusSettlementModalSessionId = settled.id;
    focusHistoryDateKey = settled.dateKey || toLocalDateKey(now());
    syslog(
      'focus',
      `完成专注计时 ${settled.plannedMinutes} 分钟（任务：${formatFocusTaskSummary(
        settled.tasks
      )}）`
    );
    const saved=save();
    if (
      saved && canUseRealModel(data.settings) &&
      (settled.participantRoleIds || []).length > 0
    ) {
      void requestAiFocusSummariesForSession(settled.id, false);
    }
    return true;
  }

  function startCompanionFocus(): void {
    if(!checkWriteAccess())return;
    ensureFocusData();
    completeFocusIfDue();
    if (activeFocus()) {
      notify('已有正在进行的计时，先结束它。');
      return;
    }
    const taskInputEl = document.getElementById(
      'focus-task-input'
    ) as HTMLInputElement | null;
    if (taskInputEl) {
      focusTaskInputDraft = taskInputEl.value;
    }
    const tasks = normalizeFocusTasks(
      data.focus!.draftTasks,
      focusTaskInputDraft
    );
    const finalTasks = tasks.length > 0 ? tasks : ['自由专注'];
    const minutes = clampFocusMinutes(
      data.focus!.workMinutes || FOCUS_DEFAULT_MINUTES,
      false
    );
    const invitedRoleIds = [...(data.focus!.draftInvitedRoleIds || [])].filter(
      (id) => data.roles.some((r) => r.id === id)
    );

    const session = createActiveFocusSession({
      minutes,
      tasks: finalTasks,
      invitedRoleIds,
      roles: data.roles,
      nowTs: now(),
    });

    data.focus!.active = session;
    data.focus!.draftTasks = [];
    focusTaskInputDraft = '';
    focusSettlementModalSessionId = null;
    view = 'focus';

    const participantNames = (session.participantRoleIds || [])
      .map((rid) => data.roles.find((r) => r.id === rid)?.name)
      .filter(Boolean)
      .join('、');

    syslog(
      'focus',
      `开始专注计时 ${minutes} 分钟 · 任务：${formatFocusTaskSummary(
        finalTasks
      )} · 陪伴：${participantNames || '独自专注'}`
    );
    save();
    render(false);
  }

  function pauseFocus(): void {
    const f = activeFocus();
    if (!f || f.status !== 'running' || !checkWriteAccess()) return;
    syncFocusMoments();
    completeFocusIfDue();
    if (!activeFocus()) return;
    f.elapsedMs = focusElapsed(f);
    f.runSince = null;
    f.status = 'paused';
    save();
    render(false);
  }

  function resumeFocus(): void {
    const f = activeFocus();
    if (!f || f.status !== 'paused' || !checkWriteAccess()) return;
    const nowTs = Date.now();
    f.runSince = nowTs;
    f.status = 'running';
    // Shift nextLiveLogDueAt forward if it was in the past during pause
    if (typeof f.nextLiveLogDueAt === 'number' && f.nextLiveLogDueAt <= nowTs) {
      f.nextLiveLogDueAt = nowTs + 3 * 60 * 1000;
    }
    save();
    render(false);
  }

  function stopFocus(): void {
    const f = activeFocus();
    if (!f || !checkWriteAccess()) return;
    if (f.status === 'running') syncFocusMoments();
    const settled = settleActiveFocusSession(data, 'ended_early', now());
    if (settled) {
      focusSettlementModalSessionId = settled.id;
      focusHistoryDateKey = settled.dateKey || toLocalDateKey(now());
      syslog(
        'focus',
        `提前结束专注计时 · 实际有效时长 ${formatDurationMinutesAndSeconds(
          settled.actualElapsedMs || 0
        )}`
      );
    }
    if(save()&&settled?.participantRoleIds?.length&&canUseRealModel(data.settings)){
      void requestAiFocusSummariesForSession(settled.id,false);
    }
    render(false);
  }

  function renderFocusMomentsHtml(f: ActiveFocusSession): string {
    const moments = (f.moments || []).slice().sort((a, b) => a.at - b.at);
    if (!moments.length) {
      return '<p class="sub">正在准备各自手头的事务…</p>';
    }
    return moments
      .map(
        (m, i) =>
          `<div class="focus-moment ${
            i === moments.length - 1 ? 'latest' : ''
          }" data-testid="focus-live-log-item-${i}">
            <span class="focus-moment-icon">${uiIcon(m.icon || 'hourglass')}</span>
            <div class="focus-moment-body">
              <div class="focus-moment-head">
                <b>${esc(m.title)}</b>
                <time>${hm(m.at)}</time>
              </div>
              <p>${esc(m.detail)}</p>
              ${
                m.innerThought
                  ? `<div class="focus-moment-thought">${uiIcon('chat')} 内心：${esc(
                      m.innerThought
                    )}</div>`
                  : ''
              }
            </div>
          </div>`
      )
      .join('');
  }

  function renderFocusTick(): void {
    const el = document.querySelector('#focus-clock');
    if (!el) return;
    const f = activeFocus();
    if (!f) return;
    const ms = focusRemaining(f);
    const sec = Math.ceil(ms / 1000);
    el.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(
      sec % 60
    ).padStart(2, '0')}`;
    const ring = document.querySelector<HTMLElement>('#focus-ring');
    if (ring?.style?.setProperty) {
      ring.style.setProperty(
        '--progress',
        String(Math.min(100, 100 * (1 - ms / f.durationMs))) + '%'
      );
    }
  }

  function splitChatBubbles(text: string, r?: RoleData | null): string[] {
    text=splitSceneReply(text).text;
    const bubbles = splitNaturalChatBubbles(text, r || role());
    return bubbles.length ? bubbles : [String(text || '').trim()].filter(Boolean);
  }

  function deliverPending(r?:RoleData):boolean {
    if(!r?.pendingReplies?.length||!data.roles.includes(r))return false;
    const before=r.pendingReplies,chats=r.chats.length,events=r.events.length,firstMessage=r.firstMessageState,planBefore=r.meetingPlan,privateBefore=r.personalThreads,memoryBefore=r.memory,proactiveBefore=r.proactive?structuredClone(r.proactive):undefined;
    const remaining=[];let changed=false;
    for(const job of before){
      const contact=job.proactiveId?r.proactive?.attempts.find(t=>t.id===job.proactiveId):undefined;
      if(job.proactiveId&&(!contact||!proactiveTaskValid(r,contact))){if(contact)finishProactive(r,contact,'cancelled');changed=true;continue;}
      if(job.sources&&((r.scene||r.play)||!job.sources.every(source=>sourceStillValid(r,source)))){changed=true;continue;}
      if(job.dueAt>now()){remaining.push(job);continue;}
      const turnId=job.replyTurnId||job.id;
      for(const [index,bubble] of job.bubbles.entries()){
        const at=now()+index,item:ChatMessage={id:uid(),speaker:'char',text:bubble,at,kind:'chat',replyTo:job.replyTo,replyTurnId:turnId,status:'active',...(job.proactiveId?{proactive:true}:{}),...(job.sources?{replySourceIds:job.sources.map(m=>m.id)}:{})};
        if(job.sceneReply&&index===job.bubbles.length-1)item.sceneReply=job.sceneReply;
        r.chats.push(item);eMemory(r,bubble,'char','chat',at,item.id);
        if(r.firstMessageState?.status!=='ready')r.firstMessageState={status:'ready',updatedAt:at};
      }
      if(contact)recordProactiveDelivery(r,contact);
      if(job.personalReply)applyPersonalReply(r,job.personalReply.ticket,job.personalReply.payload,now(),r.chats.filter(m=>m.replyTurnId===turnId));
      if(contact&&before.filter(other=>other.proactiveId===contact.id).at(-1)===job)finishProactive(r,contact,'sent');
      changed=true;
    }
    r.pendingReplies=remaining;
    if(changed){r.meetingPlan=meetingPlan(r,now());syncRoleMemory(r,now());}
    if(changed&&!save()){r.pendingReplies=before;r.chats.length=chats;r.events.length=events;r.firstMessageState=firstMessage;r.meetingPlan=planBefore;r.personalThreads=privateBefore;r.memory=memoryBefore;r.proactive=proactiveBefore;return false;}
    if(changed)resumeLocalSceneReplies(r);
    return changed;
  }

  function simulate(r: RoleData): void {
    const end = now();
    if(awaitingNainOpening(r)){r.lifeAt=end;return;}
    if (!Number.isFinite(r.lifeAt)) r.lifeAt = end;
    if (end <= r.lifeAt) return;
    // Elapsed time advances without fabricating hourly life events or proactive messages.
    r.lifeAt = end;
    syncRoleDiaryTasks(r, data.settings, end);
    if (canUseRealModel(data.settings)) {
      void processDiaryQueue();
    }
  }

  const glyph = (name:string):string => uiIcon(name,'app-symbol');

  const header = (title: string, back = 'home', right = ''): string =>
    `<div class="top"><button class="back-btn" data-action="view" data-view="${esc(
      back
    )}" aria-label="返回">‹ <span>返回</span></button><div class="grow"><h1>${esc(
      title
    )}</h1></div>${right}${back!=='home'?`<button type="button" class="icon-btn mobile-home" data-action="home" aria-label="返回手机桌面">${uiIcon('home')}</button>`:''}</div>`;

  const appTile = (id: string, name: string): string =>
    `<button class="app-icon" data-action="view" data-view="${id}" aria-label="打开${name}"><span class="tile tile-${id}">${glyph(
      id
    )}</span><span class="app-name">${name}</span></button>`;

  const dock = (): string =>
    `<nav class="dock" aria-label="常用应用">${[
      ['chat', '聊天'],
      ['focus', '专注'],
      ['drama', '戏剧'],
      ['terminal', '终端'],
    ]
      .map(([id, name]) => appTile(id, name))
      .join('')}</nav>`;

  const shell = (content: string, hasDock = true): string =>
    `<div class="shell"><div class="phone ${
      view === 'home'
        ? 'home-view'
        : view === 'landing'
        ? 'landing-view'
        : view === 'novel' || view === 'meetingdetail'
        ? 'novel-view'+(view==='meetingdetail'?' meeting-record-view':'')
        : view === 'intermission'
        ? 'novel-view intermission-view'
        : view === 'chat'
        ? 'chat-view'
        : 'app-view'
    } theme-${esc(
      role()?.theme || 'blue'
    )}"><div class="wallpaper${role()?.wallpaperMediaId?' has-custom-wallpaper':''}" aria-hidden="true">${role()?.wallpaperMediaId?`<img class="wallpaper-image" data-media-id="${esc(role()?.wallpaperMediaId)}" alt="">`:''}</div><aside class="world-save-notice" data-world-save-notice hidden><span role="status"></span> <button class="btn small secondary" data-action="reloadworld">重新读取</button></aside>${content}${
      hasDock && view === 'home' ? dock() : ''
    }<button class="home-indicator" data-action="home" aria-label="返回手机桌面"><span></span></button></div></div>`;

  function screenLanding(): string {
    const u = data.user || {
      name: '',
      pronouns: '',
      identity: '',
      background: '',
      notes: '',
    };
    const hasUserDetails = Boolean(
      (u.identity && u.identity.trim()) ||
        (u.background && u.background.trim()) ||
        (u.notes && u.notes.trim())
    );
    const userSub = u.pronouns
      ? `${u.pronouns} · 名字、身份、背景、性格及其他设定`
      : '名字、身份、背景、性格及其他设定';

    return shell(
      `<div class="landing" data-testid="landing-page">
        <div class="landing-heading">
          <div class="landing-mark">e.</div>
          <div class="logo">ELSEWHERE / PERSONAL SPACE</div>
          <div class="brand">欢迎回来。</div>
          <p class="lead">选择一个角色，打开你们的手机。</p>
        </div>

        <section class="landing-card landing-profile-card" data-testid="card-my-profile" aria-label="我的资料">
          <div class="landing-card-header">
            <div class="landing-card-title-group">
              <h2 class="landing-card-title">我的资料</h2>
              <span class="landing-card-subtitle">全世界通用 · 可逐角色覆写</span>
            </div>
            <button type="button" class="btn small ghost landing-card-action" data-action="view" data-view="userprofile">编辑资料</button>
          </div>
          <div class="landing-card-body landing-profile-scroll" data-testid="profile-scroll-area">
            <button type="button" class="role profile-entry-row" data-action="view" data-view="userprofile">
              ${userAvatarTag(u, 'avatar')}
              <span class="login-role-info">
                <span class="who">${esc(u.name || '填写我自己的信息')}</span>
                <span class="about">${esc(userSub)}</span>
              </span>
              <span class="right">›</span>
            </button>${
              hasUserDetails
                ? `<div class="landing-user-details" data-testid="profile-details-content">${
                    u.identity && u.identity.trim()
                      ? `<div class="landing-user-detail-item"><span class="detail-label">现实/通用身份</span><div class="detail-text">${esc(
                          u.identity
                        )}</div></div>`
                      : ''
                  }${
                    u.background && u.background.trim()
                      ? `<div class="landing-user-detail-item"><span class="detail-label">背景与经历</span><div class="detail-text">${esc(
                          u.background
                        )}</div></div>`
                      : ''
                  }${
                    u.notes && u.notes.trim()
                      ? `<div class="landing-user-detail-item"><span class="detail-label">性格、习惯与边界</span><div class="detail-text">${esc(
                          u.notes
                        )}</div></div>`
                      : ''
                  }</div>`
                : ''
            }
          </div>
        </section>

        <section class="landing-card landing-roles-card" data-testid="card-my-roles" aria-label="我的角色">
          <div class="landing-card-header">
            <div class="landing-card-title-group">
              <h2 class="landing-card-title">我的角色</h2>
              <span class="landing-role-count" data-testid="role-count-badge">${
                data.roles.length
              } 个</span>
            </div>
            <button type="button" class="btn small landing-create-btn" data-action="newrole" data-testid="create-role-btn">＋ 创建角色</button>
          </div>
          <div class="landing-card-body landing-roles-scroll" data-testid="roles-scroll-area">
            ${
              data.roles.length
                ? data.roles
                    .map(
                      (r, idx) =>
                        `<div class="role role-row" data-role-index="${idx}" data-role-id="${esc(
                          r.id
                        )}"><button type="button" class="role-main" data-action="enter" data-id="${esc(
                          r.id
                        )}">${avatarTag(
                          r,
                          'avatar'
                        )}<span class="login-role-info"><span class="who">${esc(
                          r.name
                        )}</span><span class="about">${esc(r.job)} · ${esc(
                          r.place
                        )}</span></span><span class="right">›</span></button><button type="button" class="role-edit" aria-label="编辑${esc(
                          r.name
                        )}" title="编辑角色" data-action="editrole" data-id="${esc(
                          r.id
                        )}">${glyph('profile')}</button></div>`
                    )
                    .join('')
                : `<div class="landing-empty-roles">还没有角色，点击右上角「创建角色」开始一段新的人生。</div>`
            }
          </div>
        </section>

        <section class="landing-backup-bar" data-testid="landing-backup-section" aria-label="存档与跨地址迁移">
          <div class="landing-backup-info">
            <strong class="landing-backup-title">存档与跨地址迁移</strong>
            <span>支持从旧版或本地备份一键恢复角色与媒体附件，或下载单文件离线版</span>
          </div>
          <div class="landing-backup-actions">
            <button type="button" class="btn small secondary" data-action="export">导出备份</button>
            <label class="btn small ghost" style="cursor:pointer">恢复备份<input id="landing-backup-file" type="file" accept=".json" hidden></label>
            <button type="button" class="btn small ghost" data-action="downloadstandalone">下载独立离线版 (.html)</button>
          </div>
        </section>

        <div class="footer-note">演示仅预设原创角色奈恩；旧版本已有存档不会被强行删除。</div>
      </div>`,
      false
    );
  }

  function screenUserProfile(): string {
    const u = data.user;
    const stagedFrame = getOrInitUserFrameDraft();
    const previewUser: UserProfileData = {
      ...u,
      frameId: stagedFrame.frameId,
      frameMediaId: stagedFrame.frameMediaId,
      frameData: stagedFrame.frameData,
      frameScale: stagedFrame.frameScale,
      frameX: stagedFrame.frameX,
      frameY: stagedFrame.frameY,
      frameLayoutVersion: stagedFrame.frameLayoutVersion,
    };
    const fv = draftUserFormValues || {
      name: u.name || '',
      pronouns: u.pronouns || '',
      identity: u.identity || '',
      background: u.background || '',
      notes: u.notes || '',
    };
    const hasActiveUserAvatar = Boolean(
      draftUserAvatarPreviewUrl || (!draftUserAvatarRemove && u.avatarMediaId)
    );
    const statusLabel = draftUserAvatarPreviewUrl
      ? '已选择新头像（点击下方「保存我的资料」后生效）'
      : draftUserAvatarRemove
      ? '已标记移除头像（保存后恢复默认占位头像）'
      : u.avatarMediaId
      ? '当前已设置全局个人头像'
      : '默认占位头像 · 支持 PNG / JPG / WebP / GIF';

    const userFrameSummary = formatFrameDraftSummary(stagedFrame, u);

    return shell(
      `${header(
        '我的资料',
        'landing'
      )}<div class="viewport"><div class="h2">在这些世界里，你是谁？</div><p class="sub">全局资料是每个角色默认认识的你。针对某个角色的不同身份、称呼或秘密，可在该角色的「人物」页面单独填写；不要把不想透露的秘密写在全局资料里。</p><form id="user-profile-form">
        <div class="card avatar-editor-card" data-testid="user-avatar-editor">
          <div class="avatar-editor-row">
            ${userAvatarTag(previewUser, 'avatar large avatar-preview-box', {
              previewUrl: draftUserAvatarPreviewUrl,
              removed: draftUserAvatarRemove,
              fallbackName: fv.name || u.name || '我',
            })}
            <div class="avatar-editor-meta">
              <div class="avatar-editor-title">个人头像（全局用户资料）</div>
              <div class="avatar-editor-sub" data-testid="user-avatar-status">${esc(
                statusLabel
              )}</div>
              <div class="avatar-editor-sub tiny" data-testid="user-frame-current-label" style="margin-top:2px">${esc(
                userFrameSummary
              )}</div>
              <div class="avatar-editor-actions">
                <label class="btn small secondary avatar-upload-label" data-testid="user-avatar-upload-btn">
                  ${hasActiveUserAvatar ? '更换头像' : '上传头像'}
                  <input type="file" id="user-avatar-input" data-testid="user-avatar-input" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
                </label>
                <button type="button" class="btn small secondary" data-action="openframemodal" data-owner="user" data-testid="open-user-frame-modal-btn">选择头像框</button>
                ${
                  hasActiveUserAvatar
                    ? `<button type="button" class="btn small ghost" data-action="removeuseravatar" data-testid="remove-user-avatar-btn">移除头像</button>`
                    : ''
                }
              </div>
            </div>
          </div>
          <div class="avatar-privacy-hint">本地图片保存在浏览器 IndexedDB 媒体库，支持备份导出与恢复；个人头像框与各角色头像框彼此独立。</div>
        </div>
        <div class="card"><div class="fieldrow"><label>我的名字 / 称呼</label><input class="field" name="name" value="${esc(
          fv.name
        )}" maxlength="80" placeholder="角色应该怎样叫我？"></div><div class="fieldrow"><label>代词 / 称谓（可选）</label><input class="field" name="pronouns" value="${esc(
        fv.pronouns
      )}" maxlength="100" placeholder="例如：她 / 他 / TA"></div><div class="fieldrow"><label>我的性格、身份与自我介绍</label><textarea class="field long-field" name="identity" placeholder="我是谁、我的性格、习惯、边界……">${esc(
        fv.identity
      )}</textarea></div><div class="fieldrow"><label>过往经历 / 背景</label><textarea class="field long-field" name="background" placeholder="角色应该知道的背景……">${esc(
        fv.background
      )}</textarea></div><div class="fieldrow"><label>其他补充</label><textarea class="field" name="notes" placeholder="补充描述……">${esc(
        fv.notes
      )}</textarea></div><button class="btn full" type="submit" data-testid="save-user-profile-btn">保存我的资料</button><button class="btn full secondary" type="button" data-action="canceluserprofile" data-testid="cancel-user-profile-btn" style="margin-top:8px">取消修改并返回</button></div></form>
      </div>${frameModalOwner === 'user' ? renderAvatarFrameModal('user', u) : ''}`,
      false
    );
  }

  function screenRoleForm(): string {
    const r =
      formMode === 'edit' ? data.roles.find((x) => x.id === editingRoleId) : null;
    const stagedFrame = getOrInitRoleFrameDraft(r);
    const previewRole = r
      ? ({
          ...r,
          frameId: stagedFrame.frameId,
          frameMediaId: stagedFrame.frameMediaId,
          frameData: stagedFrame.frameData,
          frameScale: stagedFrame.frameScale,
          frameX: stagedFrame.frameX,
          frameY: stagedFrame.frameY,
          frameLayoutVersion: stagedFrame.frameLayoutVersion,
        } as RoleData)
      : ({
          id: 'new_role_preview',
          name: draftRoleFormValues?.name || '新',
          frameId: stagedFrame.frameId,
          frameMediaId: stagedFrame.frameMediaId,
          frameData: stagedFrame.frameData,
          frameScale: stagedFrame.frameScale,
          frameX: stagedFrame.frameX,
          frameY: stagedFrame.frameY,
          frameLayoutVersion: stagedFrame.frameLayoutVersion,
        } as RoleData);
    const fv = draftRoleFormValues || {
      name: r?.name || '',
      job: r?.job || '',
      traits: r?.traits || '',
      place: r?.place || '',
      profile: r?.profile || '',
      relationship: r?.relationship || '',
      canonNotes: r?.canonNotes || '',
    };
    const hasActiveRoleAvatar = Boolean(
      draftRoleAvatarPreviewUrl || (!draftRoleAvatarRemove && r?.avatarMediaId)
    );
    const roleAvatarStatus = draftRoleAvatarPreviewUrl
      ? '已选择新角色头像（点击下方保存按钮后生效）'
      : draftRoleAvatarRemove
      ? '已标记删除头像（保存后恢复角色名首字占位头像）'
      : r?.avatarMediaId
      ? '当前已设置该角色专属头像'
      : '默认首字占位头像 · 支持独立上传与更换';
    const roleFrameSummary = formatFrameDraftSummary(stagedFrame, r);

    const backTarget = r ? roleFormReturnView : 'landing';

    return shell(
      `${header(
        r ? '编辑角色' : '创建角色',
        backTarget
      )}<div class="viewport"><div class="h2">${
        r ? '修订角色资料' : '新的一段故事'
      }</div><p class="sub">${
        r
          ? '仅修改作者设定、头像与头像框，保留全部聊天、记忆、日记与时间线；未点击保存直接返回不会覆盖原设置。'
          : '新增一个有独立历史、记忆和生活的角色。创建后将依据角色设定与关系起点由角色主动发送首条消息。'
      }</p><form id="role-form">
        <div class="card avatar-editor-card" data-testid="role-avatar-editor">
          <div class="avatar-editor-row">
            ${avatarTag(previewRole, 'avatar large avatar-preview-box', {
              previewUrl: draftRoleAvatarPreviewUrl,
              removed: draftRoleAvatarRemove,
              fallbackName: fv.name || r?.name || '新',
            })}
            <div class="avatar-editor-meta">
              <div class="avatar-editor-title">角色独立头像</div>
              <div class="avatar-editor-sub" data-testid="role-avatar-status">${esc(
                roleAvatarStatus
              )}</div>
              <div class="avatar-editor-sub tiny" data-testid="role-frame-current-label" style="margin-top:2px">${esc(
                roleFrameSummary
              )}</div>
              <div class="avatar-editor-actions">
                <label class="btn small secondary avatar-upload-label" data-testid="role-avatar-upload-btn">
                  ${hasActiveRoleAvatar ? '更换头像' : '上传头像'}
                  <input type="file" id="role-avatar-input" data-testid="role-avatar-input" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
                </label>
                <button type="button" class="btn small secondary" data-action="openframemodal" data-owner="role" data-testid="open-role-frame-modal-btn">选择头像框</button>
                ${
                  hasActiveRoleAvatar
                    ? `<button type="button" class="btn small ghost" data-action="removeroleavatar" data-testid="remove-role-avatar-btn">删除头像</button>`
                    : ''
                }
              </div>
            </div>
          </div>
          <div class="avatar-privacy-hint">每个角色头像与头像框彼此独立并联动角色选择页、桌面、聊天与人物页；修改头像不会重置人设、聊天、记忆或头像框。</div>
        </div>
        <div class="fieldrow"><label>名字</label><input class="field" name="name" required maxlength="60" value="${esc(
          fv.name
        )}" placeholder="角色名字"></div><div class="fieldrow"><label>职业 / 日常身份</label><input class="field" name="job" maxlength="150" value="${esc(
        fv.job
      )}" placeholder="角色如何生活"></div><div class="fieldrow"><label>性格与表达习惯</label><textarea class="field" name="traits" placeholder="不要只写标签，也可以写行为习惯">${esc(
        fv.traits
      )}</textarea></div><div class="fieldrow"><label>生活区域 / 世界</label><input class="field" name="place" maxlength="150" value="${esc(
        fv.place
      )}"></div><div class="fieldrow"><label>完整角色定义 / 原作设定</label><textarea class="field long-field" name="profile" placeholder="角色完整过去、性格、行动边界、世界观……">${esc(
        fv.profile
      )}</textarea></div><div class="fieldrow"><label>当前关系与故事起点</label><textarea class="field" name="relationship" placeholder="例如：初识的邻居 / 多年前的搭档">${esc(
        fv.relationship
      )}</textarea></div><div class="fieldrow"><label>背景补充 / 原作时间线说明</label><textarea class="field" name="canonNotes">${esc(
        fv.canonNotes
      )}</textarea></div><button class="btn full" type="submit" data-testid="save-role-form-btn">${
        r ? '保存角色修改' : '创建并进入'
      }</button><button class="btn full secondary" type="button" data-action="cancelroleform" data-testid="cancel-role-form-btn" style="margin-top:8px">取消修改并返回</button></form>${
        r
          ? `<div class="card danger-zone"><h3>删除这个角色</h3><p>会连同该角色的聊天、日记、记忆、戏剧与个人手机设置一并删除。请先导出完整备份。</p><div class="row"><button class="btn small secondary" data-action="export">导出备份</button><button class="btn small danger-btn" data-action="askdelete" data-id="${esc(
              r.id
            )}">删除 ${esc(r.name)}</button></div></div>`
          : ''
      }</div>${frameModalOwner === 'role' ? renderAvatarFrameModal('role', r) : ''}`,
      false
    );
  }

  function screenDeleteRole(): string {
    const r = data.roles.find((x) => x.id === deleteRoleId);
    if (!r) {
      view = 'landing';
      return screenLanding();
    }
    return shell(
      `${header(
        '确认删除',
        'roleform'
      )}<div class="viewport"><div class="h2">真的要删除 ${esc(
        r.name
      )} 吗？</div><div class="card danger-zone"><p>这会清除角色本地的全部聊天、角色日记、四层记忆索引、戏剧档案与独立手机外观。共享的 DDL、To-do 和用户全局资料不会受到影响。</p><p><b>删除后无法撤销。</b> 建议先导出备份。</p><form id="delete-role-form"><div class="fieldrow"><label>输入角色名字「${esc(
        r.name
      )}」确认</label><input class="field" name="confirmName" autocomplete="off" required placeholder="输入完整名字"></div><button class="btn full danger-btn">确认永久删除</button></form><button class="btn full secondary" data-action="canceldelete" style="margin-top:10px">取消，保留角色</button></div></div>`,
      false
    );
  }

  const homePager=createHomePager();
  const homeTasks=createHomeTasks({tasks:()=>data.sharedTasks!,save,notify,glyph});

  function screenHome(): string {
    const r = role()!;
    const a = activity(r, now());
    const pending = pendingFor(r);
    const when = new Date(Date.now());
    const weekdays = [
      '星期日',
      '星期一',
      '星期二',
      '星期三',
      '星期四',
      '星期五',
      '星期六',
    ];
    const activeChats = getActiveMessages(r.chats);
    const awaitingFirst =
      !activeChats.length && r.firstMessageState?.status === 'awaiting_api';
    const captionText = pending
      ? `${pending} 条消息等待回复`
      : awaitingFirst
      ? '等待连接模型生成首条消息'
      : esc(a.doing);

    return shell(
      `<div class="home-launcher"><div class="home-topbar-area"><div class="home-topbar-shell"><div class="home-topbar-glass" aria-hidden="true"></div><nav class="home-topbar-content" aria-label="首页导航"><span class="home-topbar-brand">ELSEWHERE</span><div class="home-topbar-links"><button type="button" class="home-topbar-button" data-action="view" data-view="userprofile" aria-label="编辑我的资料">我的资料</button><button type="button" class="home-topbar-button" data-action="view" data-view="roleinfo">角色资料</button></div><button type="button" class="home-topbar-button home-role-switch" data-action="view" data-view="landing" aria-label="切换角色" title="当前角色：${esc(r.name)}"><b class="home-role-name">${esc(r.name)}</b><span>切换角色</span>${uiIcon('down')}</button></nav></div></div><div class="home-pages" tabindex="0" aria-label="手机桌面分页"><section class="home-page" aria-label="第一页：时钟与任务"><div class="home-desktop">
 <div class="homescreen-clock"><div class="homescreen-date">${
   when.getMonth() + 1
 }月${when.getDate()}日 · ${
        weekdays[when.getDay()]
      }</div><div class="homescreen-time">${hm(Date.now())}</div></div>
 <button class="home-widget" data-action="openconversation" data-role-id="${esc(r.id)}"><div class="home-widget-top"><div class="widget-person">${avatarTag(
   r,
   'widget-avatar'
 )}<div><b>${esc(r.name)}</b><small>${esc(a.label)} · ${esc(
        a.where
      )}</small></div></div><span class="widget-arrow">›</span></div><div class="widget-divider"></div><div class="widget-bottom"><span class="widget-caption">${captionText}</span><span class="widget-action">${r.scene&&r.scene.endedAt===undefined?'返回见面':'打开聊天'} →</span></div></button>
 <div class="shared-widgets" id="home-task-cards">${homeTasks.renderCards()}</div>

 ${
   activeFocus()
     ? `<button class="home-ongoing" data-action="view" data-view="focus">专注 · 正在${
         activeFocus()!.phase === 'break' ? '休息' : '专注'
       } · 继续计时 <span>›</span></button>`
     : ''
 }
 ${r.play?`<button class="home-ongoing" data-action="resume">${uiIcon('drama')} 继续未落幕的戏剧 <span>›</span></button>`:''}

 </div></section><section class="home-page home-page-apps" aria-label="第二页：应用"><div class="home-desktop">
 <div class="home-apps">${[
   ['diary', '日记'],
   ['monitor', '监控'],
   ['presets', '预设'],
 ]
   .map(([id, name]) => appTile(id, name))
   .join('')}</div>
 </div></section></div></div><nav class="page-dots" aria-label="桌面分页"><button type="button" data-home-page="0" aria-label="第一页：时钟与任务"><span></span></button><button type="button" data-home-page="1" aria-label="第二页：日记、监控与预设"><span></span></button></nav>`
    );
  }

  const legacyStickerNames:Record<string,string>={cat:'猫咪',bear:'小熊',heart:'爱心',sparkle:'闪亮',coffee:'咖啡',moon:'晚安',flower:'花花',dice:'骰子'};

  function attachmentIcon(kind: string): string {
    const paths: Record<string, string> = {
      voice:
        '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4m-4 0h8"/>',
      photo:
        '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m5 18 5-5 3 3 3-4 4 5"/>',
      sticker:
        '<rect x="4" y="3" width="16" height="18" rx="4"/><path d="M8 11h.1M16 11h.1M9 15q3 3 6 0"/>',
      packet:
        '<rect x="3" y="6" width="18" height="15" rx="3"/><path d="M3 10h18M9 6l3-4 3 4M12 11v7"/>',
      more: '<path d="M12 4v16M4 12h16"/>',
      close: '<path d="M5 5l14 14M19 5 5 19"/>',
    };
    return `<svg class="attachment-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${
      paths[kind] || paths.more
    }</svg>`;
  }

  function quoteBubbleHtml(m: ChatMessage, r: RoleData): string {
    if (!m.quote) return '';
    const who = m.quote.speaker === 'me' ? '我' : r.name;
    return `<div class="bubble-quote"><b>引用 ${esc(who)}</b>${esc(
      m.quote.text
    )}</div>`;
  }

  function bubbleContent(m: ChatMessage, r: RoleData): string {
    const qHtml = quoteBubbleHtml(m, r);
    if (m.kind === 'sticker') {
      return m.mediaId
        ? `${qHtml}<div class="image-sticker"><img data-media-id="${esc(
            m.mediaId
          )}" alt="自定义表情包" loading="lazy"><span>${esc(
            m.caption || '自定义表情'
          )}</span></div>`
        : `${qHtml}<div class="legacy-sticker-note">[旧版表情：${esc(legacyStickerNames[m.sticker||'']||'贴纸')}]</div>`;
    }
    if (m.kind === 'photo') {
      return `${qHtml}<div class="image-attachment"><img data-media-id="${esc(
        m.mediaId || ''
      )}" alt="聊天照片" loading="lazy">${
        m.caption
          ? `<div class="attachment-caption">${esc(m.caption)}</div>`
          : ''
      }</div>`;
    }
    if (m.kind === 'voice') {
      return `${qHtml}<div class="voice-attachment"><div class="voice-title">${attachmentIcon(
        'voice'
      )} <span>语音消息 ${
        m.seconds ? `· ${Number(m.seconds)} 秒` : ''
      }</span></div><audio controls preload="metadata" data-media-id="${esc(
        m.mediaId || ''
      )}" aria-label="播放语音消息"></audio>${
        m.caption
          ? `<div class="attachment-caption">文字说明：${esc(m.caption)}</div>`
          : ''
      }</div>`;
    }
    if (m.kind === 'packet') {
      return `${qHtml}<div class="packet-bubble"><div class="packet-top">${attachmentIcon(
        'packet'
      )} <span>虚拟红包</span></div><div class="packet-amount">¥${Number(
        m.amount || 0
      ).toFixed(2)}</div><div class="packet-wish">${esc(
        m.wish || '给你一个红包'
      )}</div><div class="packet-foot">游戏内互动 · 非真实转账 · 已送达</div></div>`;
    }
    return `${qHtml}${esc(m.text)}`;
  }

  function renderRevisionsDrawer(r: RoleData, scope: RevisionScope): string {
    if (!showRevisionsDrawer) return '';
    const list = ensureRevisionsList(r)
      .filter((rev) => rev.scope === scope)
      .slice()
      .reverse();
    const actionLabel: Record<string, string> = {
      edit: '已编辑',
      retract: '已撤回',
      regenerate: '重抽替换',
    };
    return `<section class="revision-drawer" aria-label="修订历史记录">
      <div class="drawer-heading">
        <b>修订历史档案 · ${list.length} 条记录（旧版本已退出模型上下文与记忆检索）</b>
        <button type="button" data-action="togglerevisions" aria-label="关闭修订历史">${attachmentIcon(
          'close'
        )}</button>
      </div>
      <div class="revision-list">
        ${
          list.length
            ? list
                .map(
                  (rev) => `<div class="revision-item">
              <div class="revision-item-head">
                <span><span class="revision-badge">${esc(
                  actionLabel[rev.action] || rev.action
                )}</span>${rev.speaker === 'me' ? '我' : esc(r.name)}</span>
                <time>${dt(rev.at)}</time>
              </div>
              <div class="revision-old">原内容：${esc(rev.previousText)}</div>
              ${
                rev.newText
                  ? `<div class="revision-new">修订后：${esc(rev.newText)}</div>`
                  : ''
              }
            </div>`
                )
                .join('')
            : '<div class="sub" style="text-align:center;padding:12px 0">暂无编辑、撤回或重抽记录。</div>'
        }
      </div>
    </section>`;
  }

  function chatDrawer(): string {
    if (!chatPanel) return '';
    const titles: Record<string, string> = {
      more: '发送什么？',
      voice: '语音消息',
      sticker: '表情包',
      photo: '发送照片',
      packet: '发虚拟红包',
    };
    const bar = `<div class="drawer-heading"><b>${
      titles[chatPanel] || '聊天工具'
    }</b><button data-action="closepanel" aria-label="关闭聊天工具">${attachmentIcon(
      'close'
    )}</button></div>`;
    if (chatPanel === 'more') {
      return `<section class="chat-drawer" aria-label="聊天工具菜单">${bar}<div class="chat-tool-grid">${[
        ['voice', '语音'],
        ['photo', '照片'],
        ['sticker', '表情包'],
        ['packet', '红包'],
      ]
        .map(
          ([id, label]) =>
            `<button data-action="chatpanel" data-panel="${id}">${attachmentIcon(
              id
            )}<span>${label}</span></button>`
        )
        .join('')}<button data-action="meet">${glyph('profile')}<span>${role()?.chatTiming?.pending.length?'立即见面并使用本轮消息':'见面'}</span></button><button data-action="view" data-view="focus">${glyph('focus')}<span>一起专注</span></button><button data-action="view" data-view="drama">${glyph('drama')}<span>戏剧</span></button><button data-action="chatvoice">${glyph('chat')}<span>聊天表达</span></button></div></section>`;
    }
    if (chatPanel === 'sticker') {
      const gallery=uploadedStickers(role()?.chats||[]);
      return `<section class="chat-drawer" aria-label="表情包选择">${bar}${gallery.length?`<div class="sticker-grid">${gallery.map(item=>`<button data-action="senduploadedsticker" data-media-id="${esc(item.mediaId)}"><img data-media-id="${esc(item.mediaId)}" alt="${esc(item.caption)}"><small>${esc(item.caption)}</small></button>`).join('')}</div>`:'<p class="drawer-note">还没有表情包，上传你的第一张吧。</p>'}<label class="file-pick">${attachmentIcon('photo')} 上传你的表情包（PNG / JPG / GIF / WebP）<input type="file" id="sticker-upload" accept="image/png,image/jpeg,image/gif,image/webp" class="file-input"></label><input class="caption-field" id="sticker-caption" placeholder="自定义表情名字（可选）" maxlength="80" aria-label="表情包名字"></section>`;
    }
    if (chatPanel === 'photo') {
      return `<section class="chat-drawer" aria-label="发送照片">${bar}<p class="drawer-note">选择照片后直接发送。当前文字模型不能自动看懂图片，说明文字会传给角色。</p><input class="caption-field" id="photo-caption" placeholder="给照片写一句说明（可选）" maxlength="300"><label class="file-pick">${attachmentIcon(
        'photo'
      )} 选择照片（最大 8MB）<input type="file" id="photo-upload" accept="image/png,image/jpeg,image/gif,image/webp" class="file-input"></label></section>`;
    }
    if (chatPanel === 'voice') {
      const owner=role(),phase=voiceOperation?.phase;
      const waiting=phase==='waiting',recording=phase==='recording',finishing=phase==='finishing'||phase==='saving';
      const label=waiting?'等待麦克风授权':recording?'结束并发送':finishing?'正在收尾或保存':'开始录音';
      const recovery=owner?[...(voiceRecoveries.get(owner)||[])].filter(([,item])=>item.world===data):[];
      const recoveryMarkup=recovery.map(([id,item])=>`<div class="drawer-note" role="status">${item.blob?`
        语音保存未确认。可以下载录音并核对聊天记录。
        <button type="button" class="minor-btn" data-action="download-voice-recovery" data-id="${id}">下载未确认的录音</button>
        <button type="button" class="minor-btn" data-action="discard-voice-recovery" data-id="${id}">移除恢复项</button>
      `:'浏览器尚未交付录音结尾，无法确认录音完整。'}</div>`).join('');
      return `<section class="chat-drawer" aria-label="发送语音">${bar}
        <p class="drawer-note">点击录音，再点击结束并发送；也可以选择音频文件。请允许浏览器使用麦克风。</p>
        <input class="caption-field" id="voice-caption" placeholder="可选：语音的文字内容（角色才能理解）" maxlength="800">
        <div class="voice-actions">
          <button data-action="recordtoggle" class="record-btn" ${waiting||finishing?'disabled':''}>${attachmentIcon('voice')} ${label}</button>
          ${waiting||recording?'<button data-action="recordcancel" class="minor-btn">取消</button>':''}
        </div>
        ${recoveryMarkup}
        <label class="file-pick">${attachmentIcon('voice')} 选择现有音频文件（最大 8MB）<input type="file" id="audio-upload" accept="audio/*" class="file-input"></label>
        <p class="drawer-note">没有文字内容的语音可以播放，但当前 AI 无法听懂；不会假装已经听过。</p>
      </section>`;
    }
    if (chatPanel === 'packet') {
      return `<section class="chat-drawer" aria-label="虚拟红包">${bar}<form id="packet-form"><div class="packet-fields"><label>金额（虚拟 ¥）<input name="amount" type="number" inputmode="decimal" required min="0.01" max="200" step="0.01" placeholder="6.66"></label><label>祝福语<input name="wish" maxlength="100" placeholder="收下这份心意" value="收下这份心意"></label></div><p class="drawer-note">仅故事内的趣味红包，不扣除真实货币，不连接支付服务或钱包。</p><button class="packet-submit" ${
        busy ? 'disabled' : ''
      }>发送虚拟红包</button></form></section>`;
    }
    return '';
  }

  function renderFirstMessageCard(r: RoleData): string {
    if(chatTyping.has(r.id)||r.chatTiming?.pending.length||r.chatTiming?.inFlight)return '';
    const activeChats = getActiveMessages(r.chats);
    if (activeChats.some(m=>m.speaker==='char')) return '';
    const fm = r.firstMessageState;
    if (!fm || fm.status === 'ready') return '';
    if (fm.status === 'generating') {
      return `<div class="first-message-card" data-testid="first-message-card">
        <h3>正在生成 ${esc(r.name)} 的首条消息…</h3>
        <p>正在根据「${esc(r.name)}」的人设、世界观与你们的关系起点生成第一条开场白。</p>
      </div>`;
    }
    if (fm.status === 'failed') {
      return `<div class="first-message-card" data-testid="first-message-card">
        <h3>首条消息生成未成功</h3>
        <p>原因：${esc(
          fm.error || '请求失败'
        )}。系统不会使用固定模板冒充角色发言，请检查「终端」API 设置后重试。</p>
        <div class="first-message-actions">
          <button type="button" class="btn small" data-action="genfirstmsg" ${
            busy ? 'disabled' : ''
          }>重试生成首条消息</button>
          <button type="button" class="btn small secondary" data-action="view" data-view="terminal">前往终端检查 API</button>
        </div>
      </div>`;
    }
    return `<div class="first-message-card" data-testid="first-message-card">
      <h3>等待 ${esc(r.name)} 发送第一条消息</h3>
      <p>新角色已创建。根据项目规范，首条消息须基于「${esc(
        r.name
      )}」的实际人设与关系由真实模型生成；当前尚未配置 API，因此系统<strong>不会编造固定欢迎语冒充 AI 回复</strong>。你可以先前往终端配置 API 并点击下方按钮生成，或直接由你先发消息。</p>
      <div class="first-message-actions">
        <button type="button" class="btn small" data-action="genfirstmsg" ${
          busy ? 'disabled' : ''
        }>由模型生成首条消息</button>
        <button type="button" class="btn small secondary" data-action="view" data-view="terminal">前往终端配置 API</button>
      </div>
    </div>`;
  }

  function renderChatMessagesHtml(r: RoleData): string {
    const timeline=meetingTimeline(r);
    return `<div class="chat-privacy">你与 ${esc(
      r.name
    )} 的私人对话 · ${esc(dateStr(now()))}</div>
    ${renderFirstMessageCard(r)}
    ${timeline
      .map((item, i) => {
        const m=item.kind==='message'?item.message:null;
        const dayChanged=i===0||new Date(timeline[i-1].at).toDateString()!==new Date(item.at).toDateString();
        const daymark=dayChanged?`<div class="daymark">${dateStr(item.at)}</div>`:'';
        if(item.kind==='meeting')return daymark+meetingCardHtml(item.scene);
        if(!m)return '';
        const isEditingThis =
          editingMessageId === m.id && editingMessageScope === 'chat';
        const canEditText = !m.kind || m.kind === 'chat';
        return `${
          daymark
        }<div class="message ${
          m.speaker === 'me' ? 'mine' : 'theirs'
        }" data-msg-id="${esc(m.id)}">${
          m.speaker === 'char' ? `${avatarTag(r, 'avatar sm')}` : ''
        }<div class="message-inner"><div class="bubble ${
          m.kind && m.kind !== 'chat' ? 'bubble-' + esc(m.kind) : ''
        }">${bubbleContent(m, r)}</div>
        ${
          isEditingThis
            ? `<form id="inline-edit-form" class="inline-edit-form" data-scope="chat" data-id="${esc(
                m.id
              )}">
                <textarea name="editText" required aria-label="编辑消息内容">${esc(
                  editingMessageDraft
                )}</textarea>
                <div class="inline-edit-actions">
                  <button type="button" class="btn small secondary" data-action="canceleditmsg">取消</button>
                  <button type="submit" class="btn small">保存修改</button>
                </div>
              </form>`
            : `<div class="message-meta-row">
                <small>${hm(m.at)}${m.proactive ? ' · 主动消息' : ''}${
                m.editedAt ? ' · <span class="edited-tag">已编辑</span>' : ''
              }</small>
                <span class="msg-actions">
                  <button type="button" class="msg-action-btn" data-action="quotemsg" data-scope="chat" data-id="${esc(
                    m.id
                  )}" aria-label="引用消息">引用</button>
                  ${
                    canEditText
                      ? `<button type="button" class="msg-action-btn" data-action="starteditmsg" data-scope="chat" data-id="${esc(
                          m.id
                        )}" aria-label="编辑消息">编辑</button>`
                      : ''
                  }
                  ${
                    m.speaker === 'char'
                      ? `<button type="button" class="msg-action-btn" data-action="regenmsg" data-scope="chat" data-id="${esc(
                          m.id
                        )}" aria-label="重抽回复" ${
                          busy ? 'disabled' : ''
                        }>重抽</button>`
                      : ''
                  }
                  <button type="button" class="msg-action-btn" data-action="retractmsg" data-scope="chat" data-id="${esc(
                    m.id
                  )}" aria-label="撤回消息">撤回</button>
                </span>
              </div>`
        }
        </div></div>`;
      })
      .join('')}${renderChatTyping(r)}`;
  }

  function catPawSvg(isDark: boolean): string {
    return `<svg class="cat-paw-svg ${
      isDark ? 'paw-dark' : 'paw-light'
    }" viewBox="0 0 24 24" aria-hidden="true">
      <ellipse class="paw-toe" cx="6.2" cy="9.4" rx="2.0" ry="2.6" transform="rotate(-22 6.2 9.4)"/>
      <ellipse class="paw-toe" cx="10.1" cy="6.8" rx="2.0" ry="2.7" transform="rotate(-7 10.1 6.8)"/>
      <ellipse class="paw-toe" cx="14.3" cy="6.8" rx="2.0" ry="2.7" transform="rotate(8 14.3 6.8)"/>
      <ellipse class="paw-toe" cx="18.0" cy="9.5" rx="2.0" ry="2.6" transform="rotate(22 18.0 9.5)"/>
      <path class="paw-pad" d="M8.1 13.3c1.1-1.6 2.3-2.3 3.9-2.3s2.8.7 3.9 2.3c1.3 1.8 1.9 3.6 1.1 5.0-.7 1.3-2.3 1.7-3.6 1.4-.6-.1-1.1-.3-1.4-.3s-.8.2-1.4.3c-1.3.3-2.9-.1-3.6-1.4-.8-1.4-.2-3.2 1.1-5.0Z"/>
    </svg>`;
  }

  function renderChatFeedback(r:RoleData):string {
    const state=r.chatTiming;
    if(!state?.blocked)return '';
    return `<details class="chat-error-notice"><summary>${uiIcon('warning')}${state.blocked==='api'?'消息已保存，尚未连接':'回复未完成'} · 查看详情</summary><p>${esc(state.blocked==='api'?'请在终端连接 API，待回复消息会保留。':state.error||'连接未成功，待回复消息已保留。')}</p>${state.blocked==='failed'?'<button type="button" class="chat-focus-action" data-action="retrychatbatch">重试回复</button>':''}</details>`;
  }

  function renderChatTyping(r:RoleData):string {
    return chatTyping.has(r.id)&&!ongoing(r)?'<div class="chat-typing" data-testid="chat-typing" role="status" aria-live="polite"><span class="chat-typing-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>对方正在输入中…</span></div>':'';
  }

  function screenChat(): string {
    const r = role()!;
    const offline=!!(chatSceneEntry(r.chatTiming)||r.chatTiming?.inFlight?.entry);
    const focused = isFocused(r);
    const pawStateClass = focused ? 'is-dark' : 'is-light';
    const pawTitle = focused
      ? '热聊模式 · 点击切换为日常联系'
      : '日常联系 · 点击开启热聊模式';
    return shell(
      `<div class="chat-header"><button class="chat-back" data-action="view" data-view="home" aria-label="返回桌面">‹<small>桌面</small></button><div class="chat-contact">${avatarTag(
        r,
        'chat-contact-avatar'
      )}<b>${esc(r.name)}</b><small><i></i>${esc(
        activity(r, now()).label
      )}</small></div><div class="chat-header-actions"><button type="button" class="chat-paw-btn ${pawStateClass}" data-action="focuschat" data-testid="chat-focus-paw-btn" data-paw-state="${
        focused ? 'dark' : 'light'
      }" aria-pressed="${focused}" aria-label="${pawTitle}" title="${pawTitle}">${catPawSvg(
        focused
      )}</button><button type="button" class="chat-more" data-action="chatroleedit" data-testid="chat-role-edit-btn" aria-label="进入角色修改页面" title="编辑当前角色资料">${uiIcon('ellipsis')}</button></div></div>
 <div class="chat-feedback" data-chat-feedback ${r.chatTiming?.blocked?'':'hidden'}>${renderChatFeedback(r)}</div>
 <div class="chat-conversation" id="scroll-area" data-role-id="${esc(r.id)}">${renderChatMessagesHtml(
   r
 )}</div>
 ${chatDrawer()}
 ${
   quotingMessage
     ? `<div class="compose-quote-bar">
        <div class="quote-preview">正在引用 ${esc(
          quotingMessage.speaker === 'me' ? '我' : r.name
        )}：「${esc(quotingMessage.text)}」</div>
        <button type="button" data-action="cancelquote" aria-label="取消引用">取消引用</button>
      </div>`
     : ''
 }
 <form class="compose" id="message-form"><textarea id="message-input" data-scoped-draft rows="1" placeholder="发送信息" aria-label="输入消息"></textarea><button type="button" class="compose-plus" data-action="chatpanel" data-panel="more" aria-label="打开聊天功能" aria-expanded="${chatPanel==='more'}">${chatPanel==='more'?attachmentIcon('close'):attachmentIcon('more')}</button><button type="button" class="compose-offline" data-action="offline-round" aria-label="线下模式" aria-pressed="${offline}" ${canChooseChatScene(r.chatTiming,now())&&!ongoing(r)?'':'disabled'} title="选择本轮聚合结束后进入面对面">线下</button><button class="send-btn" aria-label="发送消息">${uiIcon('send')}</button></form>`,
      false
    );
  }

  function screenDiary(): string {
    const r = role()!;
    syncRoleDiaryTasks(r, data.settings, now());
    const entries = [...r.diaries]
      .filter((x) => x.speaker === diaryTab && !(x.speaker === 'char' && x.source === 'life'))
      .sort((a, b) => {
        if (diaryTab === 'char') {
          const ka = getCharacterDiaryDateKey(a);
          const kb = getCharacterDiaryDateKey(b);
          if (ka !== kb) return kb.localeCompare(ka);
        }
        return b.at - a.at;
      });
    const pendingTasks =
      diaryTab === 'char'
        ? (r.diaryTasks || [])
            .filter(
              (t) =>
                t.status !== 'completed' && !hasCharacterDiaryForDate(r, t.dateKey)
            )
            .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
        : [];

    return shell(
      `${header(
        '日记',
        'home'
      )}<div class="viewport"><div class="h2">那些没有说出口的话。</div><div class="tabs"><button data-action="diarytab" data-tab="char" class="${
        diaryTab === 'char' ? 'active' : ''
      }">${esc(
        r.name
      )}的日记</button><button data-action="diarytab" data-tab="me" class="${
        diaryTab === 'me' ? 'active' : ''
      }">我的日记</button></div>${
        diaryTab === 'me'
          ? `<form id="diary-form"><textarea name="text" class="field" placeholder="写下今天的事。你的私人日记默认完全私密，只有点击「分享」后角色才会知晓。" required></textarea><button class="btn small" style="margin-top:8px">保存私人日记</button></form>`
          : `<div class="hint">每天当地时间 00:00，系统会基于前一天真实发生的聊天、见面、共同专注与角色生活，由 AI 以 ${esc(
              r.name
            )} 的第一人称归档一篇私人日记。你读过日记，不等于角色知道你读过。</div>`
      }${
        diaryTab === 'char' && pendingTasks.length
          ? `<div class="section">待补写与生成状态 · ${pendingTasks.length} 篇</div>
             <div class="diary-task-list" data-testid="diary-task-list">
               ${pendingTasks
                 .map((t) => {
                   const bounds = getLocalDayBounds(t.dateKey);
                   const sum =
                     t.factSummary || collectDailyDiaryFacts(r, t.dateKey).summary;
                   const factText = sum.hasUserInteraction
                     ? `当日素材：${sum.chatCount} 条聊天${
                         sum.sceneCount ? ` · ${sum.sceneCount} 条见面记录` : ''
                       }${sum.focusCount ? ` · ${sum.focusCount} 次共同专注` : ''}${
                         sum.sharedDiaryCount
                           ? ` · ${sum.sharedDiaryCount} 篇你分享的日记`
                           : ''
                       }`
                     : '当日无直接用户互动 · 将书写角色独立日常与思绪';
                   const statusBadge =
                     t.status === 'generating'
                       ? `<span class="diary-task-badge generating">${uiIcon('hourglass')} 正在生成…</span>`
                       : t.status === 'ready'
                       ? `<span class="diary-task-badge pending">正文已生成 · 待保存</span>`
                       : t.status === 'stale'
                       ? `<span class="diary-task-badge pending">正文待复制 · 来源已变化</span>`
                       : t.status === 'claimed'
                       ? `<span class="diary-task-badge awaiting">已领取 · 发送状态待核对</span>`
                       : t.status === 'uncertain'
                       ? `<span class="diary-task-badge failed">请求结果未确认 · 可能已计费</span>`
                       : t.status === 'failed'
                       ? `<span class="diary-task-badge failed">${uiIcon('warning')} 生成失败</span>`
                       : t.status === 'awaiting_api'
                       ? `<span class="diary-task-badge awaiting">${uiIcon('plug')} 待连接 API 补写</span>`
                       : `<span class="diary-task-badge pending">${uiIcon('clock')} 待补写队列</span>`;
                   return `<div class="card diary-task-card" data-diary-task-date="${esc(
                     t.dateKey
                   )}" data-diary-task-status="${esc(t.status)}">
                     <div class="diary-task-head">
                       <div>
                         <b class="diary-task-title">${uiIcon('deadline')} ${esc(bounds.label)}（${esc(
                     t.dateKey
                   )}）</b>
                         <div class="diary-task-sub">${esc(factText)}</div>
                       </div>
                       ${statusBadge}
                     </div>
                     ${
                       t.lastError
                         ? `<div class="diary-task-error">原因：${esc(
                             t.lastError
                           )}</div>`
                         : t.status === 'awaiting_api'
                         ? `<div class="diary-task-note">未使用假模板代替生成。请在「终端」配置自定义 API 与模型后点击生成。</div>`
                         : ''
                     }
                     <div class="diary-task-actions">
                       <button type="button" class="btn small ${
                     ['failed','uncertain','ready','stale'].includes(t.status) ? '' : 'secondary'
                       }" data-action="retrydiary" data-date="${esc(
                     t.dateKey
                   )}" ${
                     t.status === 'generating' || diaryQueueBusy ? 'disabled' : ''
                   }>${
                     t.status === 'generating'
                       ? '正在生成…'
                       : t.status === 'ready'
                       ? '保存已有结果'
                       : t.status === 'stale'
                       ? '查看并复制正文'
                       : ['claimed','uncertain','failed'].includes(t.status)
                       ? '核对状态或恢复'
                       : '立即生成'
                   }</button>
                       ${t.status==='ready'? `<button type="button" class="btn small ghost" data-action="regeneratediary" data-date="${esc(t.dateKey)}" ${diaryQueueBusy?'disabled':''}>重新生成</button>`:''}
                       ${
                         t.status === 'awaiting_api'
                           ? `<button type="button" class="btn small ghost" data-action="view" data-view="terminal">前往终端配置 API</button>`
                           : ''
                       }
                     </div>
                   </div>`;
                 })
                 .join('')}
             </div>`
          : ''
      }<div class="section">日记档案 · ${entries.length} 篇</div>${
        entries.length
          ? entries
              .map((e) => {
                if (e.speaker === 'char') {
                  const dKey = getCharacterDiaryDateKey(e);
                  const bounds = getLocalDayBounds(dKey);
                  const sum = e.factSummary;
                  const sourceSummary = sum
                    ? sum.hasUserInteraction
                      ? `基于当日 ${sum.chatCount} 条聊天${
                          sum.sceneCount ? ` · ${sum.sceneCount} 段见面` : ''
                        }${sum.focusCount ? ` · ${sum.focusCount} 次共同专注` : ''}${
                          sum.sharedDiaryCount
                            ? ` · ${sum.sharedDiaryCount} 篇分享日记`
                            : ''
                        }`
                      : '基于角色当日独立生活与思绪'
                    : 'AI 归档私人日记';
                  return `<article class="entry diary-char-entry" data-diary-id="${esc(
                    e.id
                  )}" data-diary-date="${esc(dKey)}">
                    <div class="diary-entry-head">
                      <time class="diary-archive-date">${uiIcon('deadline')} ${esc(
                        bounds.label
                      )}（${esc(dKey)}）</time>
                      <span class="diary-char-meta">${
                        e.wordCount ? `${esc(e.wordCount)} 字 · ` : ''
                      }${
                    e.generatedAt ? `写于 ${dt(e.generatedAt)}` : dt(e.at)
                  }</span>
                    </div>
                    <div class="diary-body-text">${esc(e.text)}</div>
                    <div class="diary-entry-foot">
                      <span class="diary-fact-badge">${uiIcon('sparkles')} ${esc(sourceSummary)}</span>
                    </div>
                  </article>`;
                }
                const isShared = isDiarySharedWithRole(e, r.id);
                return `<div class="entry" data-diary-id="${esc(
                  e.id
                )}"><time>${dt(e.at)}</time><div class="diary-body-text">${esc(
                  e.text
                )}</div><div class="diary-entry-foot">
                        ${
                          isShared
                            ? `<span class="shared-badge">${uiIcon('check')} 已主动分享给 ${esc(
                                r.name
                              )} · 对方已知情</span>`
                            : `<span class="privacy-badge">${uiIcon('lock')} 私密日记（${esc(
                                r.name
                              )}不知情）</span>
                               <button type="button" class="btn small secondary" data-action="sharediary" data-id="${esc(
                                 e.id
                               )}">分享给 ${esc(r.name)}</button>`
                        }
                      </div></div>`;
              })
              .join('')
          : `<div class="card"><p>${
              diaryTab === 'char'
                ? `还没有已归档的${esc(
                    r.name
                  )}私人日记。系统会在每天当地时间 00:00 自动为刚结束的前一天生成日记。`
                : '还没有私人日记。写下的内容默认仅你自己可见。'
            }</p></div>`
      }</div>`
    );
  }

  function renderFootprintCalendarDrawer(r: RoleData, selectedDateKey: string): string {
    if (!showFootprintCalendar) return '';
    const cal = buildFootprintCalendarMonth(
      r,
      footprintCalYear,
      footprintCalMonth,
      selectedDateKey,
      now()
    );
    const todayKey = toLocalDateKey(now());
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const emptyCells = Array.from({ length: cal.leadingEmptyDays })
      .map(() => `<span class="fp-cal-empty"></span>`)
      .join('');
    const dayCells = cal.cells
      .map((cell) => {
        const cls = [
          'fp-cal-day',
          cell.isSelected ? 'is-selected' : '',
          cell.isToday ? 'is-today' : '',
          cell.hasActivity ? 'has-activity' : '',
          cell.isFuture ? 'is-future' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return `<button type="button" class="${cls}" data-action="monitordate" data-date="${esc(
          cell.dateKey
        )}" data-testid="fp-cal-day-${esc(cell.dateKey)}" ${
          cell.isFuture ? 'disabled title="未来日期尚未发生"' : ''
        }>
          <span class="fp-cal-num">${cell.day}</span>
          ${cell.hasActivity ? `<span class="fp-cal-paw" title="当天有生活足迹">${uiIcon('paw')}</span>` : '<span class="fp-cal-dot"></span>'}
        </button>`;
      })
      .join('');

    return `<section class="card fp-calendar-drawer" data-testid="footprint-calendar-drawer" aria-label="足迹日历">
      <div class="fp-cal-header">
        <button type="button" class="btn small secondary" data-action="footprintcalmonth" data-delta="-1" data-testid="fp-cal-prev-month">‹ 上月</button>
        <strong class="fp-cal-title">${esc(cal.monthLabel)} · 足迹日历</strong>
        <button type="button" class="btn small secondary" data-action="footprintcalmonth" data-delta="1" data-testid="fp-cal-next-month">下月 ›</button>
      </div>
      <div class="fp-cal-weekdays">
        ${weekdays.map((w) => `<span>${w}</span>`).join('')}
      </div>
      <div class="fp-cal-grid">
        ${emptyCells}${dayCells}
      </div>
      <div class="fp-cal-footer">
        <span class="tiny muted">${uiIcon('paw')} 表示当天有保留的历史资料</span>
        <div class="row" style="gap:6px">
          <button type="button" class="btn small ghost" data-action="monitordate" data-date="${esc(
            todayKey
          )}">回到今天</button>
          <button type="button" class="btn small secondary" data-action="togglefootprintcal">收起日历</button>
        </div>
      </div>
    </section>`;
  }

  function screenMonitor(): string {
    const r=role()!,at=now(),today=toLocalDateKey(at);
    monitorDateKey=resolveSafeMonitorDateKey(monitorDateKey,at);
    const bounds=getLocalDayBounds(monitorDateKey),cutoff=Math.min(at,bounds.endMs);
    const archive=getOrBuildDailyFootprints(r,monitorDateKey,at);
    const items=monitorItemsForDisplay(r,data.user,archive.items,at),life=collectRoleLife(r,cutoff);
    let state=lifeJournalError;
    if(!state)try{state=lifeTaskState(data.roles,r,at,Boolean(token.trim())&&canUseRealModel(data.settings),data.settings.autonomousLife!==false,[...readLifeJournal(localStorage),...lifeClaims.map(t=>data.roles.find(r=>r.id===t.roleId)?.lifeTasks?.find(x=>x.id===t.id)||t)],lifeBusy&&Boolean(lifeController));}catch{state='生活调用额度记录无法核验，自动推进已暂停。';}
    const list=items.map(item=>{
      const event=item.category==='life'?life.events.find(e=>e.id===item.sourceEventIds[0]):undefined;
      const source=event?.lifeRecord?'生活模拟 · 已归档'+(life.historicalProfileEventIds.has(event.id)?' · 旧档案历史':''):item.category==='life'?'有来源的生活记录':item.category==='drama'?'排演参与 · 不计作戏内人生':'有效互动';
      return `<article class="card footprint-card" data-testid="footprint-item" data-fp-category="${esc(item.category)}" data-fp-id="${esc(item.id)}">
        <div class="row between"><time class="fp-time-badge">${esc(hm(item.timestamp))}</time><span class="tiny muted">${esc(source)}</span></div>
        <h3>${esc(item.title)}</h3><p class="life-narrative">${esc(item.summary)}</p>${item.where?`<div class="tiny muted">${uiIcon('pin')}${esc(item.where)}</div>`:''}
        <details class="life-provenance"><summary>来源与记录</summary><p class="tiny muted">${esc(dt(item.timestamp))} · ${esc(source)}</p>
          ${(item.rawTranscript||[]).slice(0,3).map(t=>`<p class="tiny">${esc(t.speakerLabel)} · ${esc(t.text.slice(0,240))}</p>`).join('')}
          ${event?.lifeRecord?`<div class="tiny muted">${event.lifeRecord.sources.map(s=>esc(s.kind+':'+s.id)).join(' · ')}</div><button class="btn small ghost" data-action="retractlife" data-id="${esc(event.id)}">撤回此模拟记录</button>`:''}
        </details></article>`;
    }).join('');
    const thoughts=life.threads.filter(t=>t.at<=cutoff).slice(0,3);
    return shell(`${header('生活监控','home')}<div class="viewport monitor-life">
      <div class="row between"><div><div class="label">DAILY FOOTPRINTS</div><h2>日常足迹</h2></div>${avatarTag(r,'avatar large')}</div>
      <p class="sub">发生在${esc(r.name)}自己世界里的生活。没有记录的时段保持未知。</p>
      <div class="fp-date-bar" data-testid="monitor-date-bar">
        <button class="btn small secondary fp-nav-btn" data-action="monitordate" data-date="${esc(shiftDateKey(monitorDateKey,-1))}" data-testid="monitor-prev-day" aria-label="前一天">‹ 前一天</button>
        <button class="fp-date-display" data-action="togglefootprintcal" data-testid="monitor-date-display"><strong>${esc(bounds.label)}</strong><small>${esc(monitorDateKey)} · ${monitorDateKey===today?'今天':'历史归档'} ▾</small></button>
        <button class="btn small secondary fp-nav-btn" data-action="monitordate" data-date="${esc(shiftDateKey(monitorDateKey,1))}" data-testid="monitor-next-day" ${monitorDateKey<today?'':'disabled'} aria-label="后一天">后一天 ›</button>
      </div>${renderFootprintCalendarDrawer(r,monitorDateKey)}
      <div class="footprints-list" data-testid="footprints-list">${list||`<div class="card fp-empty-card" data-testid="footprint-calm-empty">${uiIcon('leaf')}<h3>尚无已归档的生活记录</h3><p>这不代表已确认整天无事发生。API 不可用时，不会补造活动。</p></div>`}</div>
      ${thoughts.length?`<details class="card life-private" data-testid="life-private"><summary>私人关注 · 主观想法</summary><p class="tiny muted">这是${esc(r.name)}自己记下的想法、计划或判断，不等于外部事实，也不表示已经告诉了你。</p>${thoughts.map(t=>`<p>${esc(t.text)}<br><time class="tiny muted">${esc(dt(t.at))}</time></p>`).join('')}</details>`:''}
      <details class="card life-settings" data-testid="life-settings"><summary>生活推进与调用额度</summary><p data-testid="life-state">${esc(state)}</p><p class="tiny muted">仅在网页打开且空闲时推进当天最近一段生活。每角色每天最多 1 次，全应用每天及最近 24 小时最多 2 次；失败计入额度，不自动重试。普通聊天与每篇日记仍各使用原有一次请求，额度独立计算。</p><button class="btn small secondary" data-action="toggleautonomouslife">${data.settings.autonomousLife===false?'恢复自动推进':'暂停自动推进'}</button></details>
    </div>`);
  }

  function renderFocusSettlementModal(): string {
    if (!focusSettlementModalSessionId) return '';
    ensureFocusData();
    const rec = (data.focus?.completed || []).find(
      (c) => c.id === focusSettlementModalSessionId
    );
    if (!rec) return '';

    const isCompleted = rec.completionStatus !== 'ended_early';
    const taskLabel = formatFocusTaskSummary(rec.tasks);
    const plannedMin = rec.plannedMinutes || rec.minutes || FOCUS_DEFAULT_MINUTES;
    const actualDurationText = formatDurationMinutesAndSeconds(
      typeof rec.actualElapsedMs === 'number'
        ? rec.actualElapsedMs
        : plannedMin * 60000
    );
    const participantIds = rec.participantRoleIds || [];
    const participantRoles = participantIds
      .map((rid) => data.roles.find((r) => r.id === rid))
      .filter((r): r is RoleData => Boolean(r));
    const declinedParticipants = (rec.participants || []).filter(
      (p) => !p.accepted
    );
    const moments = (rec.moments || []).slice().sort((a, b) => a.at - b.at);
    const summaries = rec.roleSummaries || [];

    return `<div class="frame-modal-backdrop focus-settlement-backdrop" data-testid="focus-settlement-modal" role="dialog" aria-modal="true" aria-label="专注结算报告">
      <div class="frame-modal-sheet focus-settlement-sheet">
        <div class="frame-modal-header">
          <div class="frame-modal-title-wrap">
            <span class="frame-modal-kicker">FOCUS REPORT · 专注结算与归档</span>
            <h3 class="frame-modal-title">${
              isCompleted ? '本轮专注已完成' : '本轮专注已提前结束'
            }</h3>
          </div>
          <button type="button" class="frame-modal-close" data-action="closesettlementmodal" data-testid="close-settlement-modal-btn" aria-label="关闭专注报告">×</button>
        </div>

        <div class="focus-settlement-body">
          <div class="focus-settlement-status-row">
            <span class="focus-status-badge ${
              isCompleted ? 'is-completed' : 'is-early'
            }" data-testid="settlement-status-badge">${
              isCompleted ? `${uiIcon('check')} 已完成` : `${uiIcon('square')} 提前结束`
            }</span>
            <span class="focus-settlement-date">${esc(
              rec.dateKey || toLocalDateKey(rec.finishedAt)
            )}</span>
          </div>

          <div class="focus-settlement-grid">
            <div class="focus-settlement-stat">
              <span class="stat-label">专注任务</span>
              <strong class="stat-val" data-testid="settlement-tasks">${esc(
                taskLabel
              )}</strong>
            </div>
            <div class="focus-settlement-stat">
              <span class="stat-label">计划 / 实际有效时长</span>
              <strong class="stat-val" data-testid="settlement-durations">计划 ${esc(plannedMin)} 分钟 · 实际 ${esc(
                actualDurationText
              )}</strong>
            </div>
            <div class="focus-settlement-stat">
              <span class="stat-label">开始与结束时间</span>
              <span class="stat-sub">${hm(rec.startedAt)} – ${hm(
                rec.finishedAt
              )}（${dt(rec.finishedAt)}）</span>
            </div>
            <div class="focus-settlement-stat">
              <span class="stat-label">共同专注角色</span>
              <span class="stat-sub" data-testid="settlement-participants">${
                participantRoles.length > 0
                  ? esc(participantRoles.map((r) => r.name).join('、'))
                  : '独自专注（无角色参与）'
              }</span>
            </div>
          </div>

          ${
            declinedParticipants.length > 0
              ? `<div class="focus-declined-note" data-testid="settlement-declined-note">
                  ${declinedParticipants
                    .map(
                      (p) =>
                        `<div>• ${esc(p.roleName)} 未参与：${esc(
                          p.reason
                        )}（未写入共同专注记忆）</div>`
                    )
                    .join('')}
                </div>`
              : ''
          }

          <div class="focus-settlement-summaries-box">
            <div class="row between" style="margin-bottom:8px">
              <h4 style="margin:0;font-size:13px">${
                participantRoles.length > 0 ? '角色专注小结' : '专注完成报告'
              }</h4>
              ${
                participantRoles.length > 0
                  ? `<button type="button" class="btn small ghost" data-action="retryfocussummary" data-session-id="${esc(
                      rec.id
                    )}" data-testid="retry-focus-summary-btn" ${
                      focusSummaryOperation?.world === data ? 'disabled' : ''
                    }>${
                      focusSummaryOperation?.world === data
                        ? '正在生成…'
                        : rec.summaryRun || rec.summaryStatus === 'failed' || rec.summaryStatus === 'generating'
                        ? '↻ 重试生成角色小结'
                        : '↻ 重新生成小结'
                    }</button>`
                  : ''
              }
            </div>
            ${
              rec.summaryError || (rec.summaryRun?.pendingRoleId&&focusSummaryOperation?.world!==data)
                ? `<div class="hint" style="margin-bottom:8px" data-testid="settlement-summary-error">${esc(
                    rec.summaryError||'此前小结请求的结果未确认，可能已计费。未自动重试。'
                  )}</div>`
                : ''
            }
            ${
              participantRoles.length > 0
                ? `<div class="focus-role-summary-list" data-testid="settlement-role-summaries">
                    ${participantRoles
                      .map((pRole) => {
                        const sumItem = summaries.find(
                          (s) => s.roleId === pRole.id
                        );
                        const requestState = rec.summaryRun?.pendingRoleId === pRole.id
                          ? '可能已发送 · 结果未确认'
                          : rec.summaryRun?.remainingRoleIds.includes(pRole.id)
                            ? '尚未发送'
                            : sumItem?.source === 'ai' ? '已成功保存' : '';
                        return `<div class="focus-role-summary-card" data-testid="settlement-summary-${esc(
                          pRole.id
                        )}">
                          <div class="row" style="gap:8px;margin-bottom:6px">
                            ${avatarTag(pRole, 'avatar sm')}
                            <div>
                              <b>${esc(pRole.name)}</b>
                              <div class="tiny muted">${esc(
                                pRole.job || ''
                              )} · ${
                                sumItem?.source === 'ai'
                                  ? 'AI 实时小结'
                                  : '人设纪实小结'
                              }</div>
                            </div>
                          </div>
                          <p class="focus-role-summary-text">${esc(
                            sumItem?.text ||
                              `${pRole.name}陪你记录下了这段 ${actualDurationText} 的「${taskLabel}」专注时光。`
                          )}</p>
                          ${requestState ? `<small data-focus-request-state>${esc(requestState)}</small>` : ''}
                        </div>`;
                      })
                      .join('')}
                  </div>`
                : `<div class="focus-solo-summary-card" data-testid="settlement-solo-summary">
                    <p>这是一段属于你自己的独自专注时间。你在「${esc(
                      taskLabel
                    )}」上有效投入了 ${esc(
                    actualDurationText
                  )}（${
                    isCompleted ? '已完成计划时长' : '提前结束'
                  }），本次记录已归档至「我的计时记录」。</p>
                  </div>`
            }
          </div>

          <details class="focus-settlement-livelog" open data-testid="settlement-livelog-details">
            <summary>展开查看本次专注 Live Log（${moments.length} 条记录）</summary>
            <div class="focus-moments settlement-moments-list">
              ${moments
                .map(
                  (m) => `<div class="focus-moment">
                    <span class="focus-moment-icon">${uiIcon(m.icon || 'hourglass')}</span>
                    <div class="focus-moment-body">
                      <div class="focus-moment-head">
                        <b>${esc(m.title)}</b>
                        <time>${hm(m.at)}</time>
                      </div>
                      <p>${esc(m.detail)}</p>
                      ${
                        m.innerThought
                          ? `<div class="focus-moment-thought">${uiIcon('chat')} 内心：${esc(
                              m.innerThought
                            )}</div>`
                          : ''
                      }
                    </div>
                  </div>`
                )
                .join('')}
            </div>
          </details>
        </div>

        <div class="frame-modal-footer">
          <button type="button" class="btn full" data-action="closesettlementmodal" data-testid="confirm-settlement-modal-btn">完成并收起报告</button>
        </div>
      </div>
    </div>`;
  }

  function screenFocus(): string {
    ensureFocusData();
    const f = activeFocus();
    const work = clampFocusMinutes(
      data.focus!.workMinutes || FOCUS_DEFAULT_MINUTES,
      false
    );
    const draftTasks = data.focus!.draftTasks || [];
    const draftInvited = data.focus!.draftInvitedRoleIds || [];
    const todayKey = toLocalDateKey(now());
    const selectedDateKey = focusHistoryDateKey || todayKey;
    const dayRecords = getFocusSessionsForDate(
      data.focus!.completed,
      selectedDateKey
    );
    const dayTotalElapsedMs = dayRecords.reduce(
      (acc, item) =>
        acc +
        (typeof item.actualElapsedMs === 'number'
          ? item.actualElapsedMs
          : (item.minutes || 0) * 60000),
      0
    );

    const activeParticipants = (f?.participants || []).filter(
      (p) => p.accepted
    );
    const declinedParticipants = (f?.participants || []).filter(
      (p) => !p.accepted
    );

    return shell(
      `${header(
        '专注',
        'home'
      )}<div class="viewport" data-testid="focus-screen">
        <div class="label">FOCUS · 陪伴专注计时</div>
        <div class="h2">给自己留一段安静的时间。</div>
        <p class="sub">设置本次计划时长、当前专注事项与陪伴角色；计时按真实时间戳推进，结束后自动结算归档。</p>

        ${
          f
            ? `<div class="focus-card focus-active-card" data-testid="focus-active-card">
                <div class="focus-kicker">${
                  f.status === 'paused'
                    ? '已暂停 · 暂停期间不累计有效时长'
                    : '专注计时中 · 手机通知已静音收拢'
                }</div>
                <div class="focus-ring" id="focus-ring" style="--progress:${Math.round(
                  100 * (1 - focusRemaining(f) / f.durationMs)
                )}%">
                  <div class="focus-ring-inner">
                    <strong id="focus-clock" data-testid="focus-running-clock">${String(
                      Math.floor(Math.ceil(focusRemaining(f) / 1000) / 60)
                    ).padStart(2, '0')}:${String(
                      Math.ceil(focusRemaining(f) / 1000) % 60
                    ).padStart(2, '0')}</strong>
                    <span>计划 ${esc(f.minutes)} 分钟</span>
                  </div>
                </div>

                <div class="focus-active-task-banner" data-testid="focus-active-tasks">
                  <span class="focus-task-kicker">我正在专注</span>
                  <div class="focus-task-pills">
                    ${(f.tasks && f.tasks.length ? f.tasks : ['自由专注'])
                      .map(
                        (t) => `<span class="focus-task-chip">${esc(t)}</span>`
                      )
                      .join('')}
                  </div>
                </div>

                <div class="focus-participants-panel" data-testid="focus-active-participants">
                  <div class="focus-panel-title">
                    <b>${
                      activeParticipants.length > 0
                        ? `正在陪伴的角色（${activeParticipants.length} 人）`
                        : '独自专注模式'
                    }</b>
                    <span class="focus-live-indicator">${
                      f.status === 'paused' ? 'PAUSED' : 'LIVE LOG'
                    }</span>
                  </div>
                  ${
                    activeParticipants.length > 0
                      ? `<div class="focus-participant-cards">
                          ${activeParticipants
                            .map((p) => {
                              const pRole = data.roles.find(
                                (x) => x.id === p.roleId
                              );
                              return `<div class="focus-participant-card" data-testid="focus-participant-${esc(
                                p.roleId
                              )}">
                                <div class="row" style="gap:10px;align-items:flex-start">
                                  ${
                                    pRole
                                      ? avatarTag(pRole, 'avatar sm')
                                      : `<span class="avatar sm">${esc(
                                          p.roleName[0] || '?'
                                        )}</span>`
                                  }
                                  <div class="grow">
                                    <div class="row between">
                                      <b>${esc(p.roleName)}</b>
                                      <span class="tiny muted">${esc(
                                        pRole?.place || ''
                                      )}</span>
                                    </div>
                                    <div class="focus-participant-status">${esc(
                                      f.status === 'paused'
                                        ? '计时已暂停，正在桌边稍作休息'
                                        : p.statusText
                                    )}</div>
                                    ${
                                      p.currentThought
                                        ? `<div class="focus-participant-thought">${uiIcon('chat')} 内心：${esc(
                                            p.currentThought
                                          )}</div>`
                                        : ''
                                    }
                                  </div>
                                </div>
                              </div>`;
                            })
                            .join('')}
                        </div>`
                      : `<p class="sub" style="margin:6px 0 0">本轮未邀请角色或无角色参与，安静投入自己的节奏。</p>`
                  }
                  ${
                    declinedParticipants.length > 0
                      ? `<div class="focus-declined-note" data-testid="focus-active-declined">
                          ${declinedParticipants
                            .map(
                              (p) =>
                                `<div>• ${esc(p.roleName)} 暂未参与：${esc(
                                  p.reason
                                )}（不会写入共同专注记忆）</div>`
                            )
                            .join('')}
                        </div>`
                      : ''
                  }
                </div>

                <div class="focus-companion" data-testid="focus-live-log-section">
                  <div class="row between" style="margin-bottom:8px">
                    <div>
                      <b style="font-size:13px">实时陪伴动态 · Live Log</b>
                      <div class="tiny muted">按真实时间顺序记录陪伴状态与角色心绪</div>
                    </div>
                    <button type="button" class="btn small ghost" data-action="focusrefreshlog" data-testid="focus-refresh-log-btn" ${
                      f.status === 'paused' ? 'disabled' : ''
                    }>＋ 记录此刻动态</button>
                  </div>
                  <div class="focus-moments" id="focus-moments" data-testid="focus-live-log-list" aria-live="polite">
                    ${renderFocusMomentsHtml(f)}
                  </div>
                </div>

                <div class="focus-buttons">
                  <button type="button" class="btn secondary" data-action="focuspause" data-testid="focus-pause-btn">${
                    f.status === 'running' ? '暂停' : '继续'
                  }</button>
                  <button type="button" class="btn ghost" data-action="focusstop" data-testid="focus-stop-btn">提前结束</button>
                </div>
              </div>`
            : `<div class="focus-card focus-setup-hero-card" data-testid="focus-duration-card">
                <div class="focus-kicker">FOCUS TIMER · 点击或滑动设置本次计划专注时长</div>
                <div class="focus-duration-stepper">
                  <button type="button" class="btn small secondary focus-step-btn" data-action="focusstepminutes" data-delta="-1" data-testid="focus-minus-btn" aria-label="减少 5 分钟">− 5</button>
                  <div class="focus-standby-wrap">
                    <div class="focus-standby" data-testid="focus-planned-clock">${String(
                      work
                    ).padStart(2, '0')}:00</div>
                    <div class="focus-planned-badge" data-testid="focus-planned-label">${work} 分钟</div>
                  </div>
                  <button type="button" class="btn small secondary focus-step-btn" data-action="focusstepminutes" data-delta="1" data-testid="focus-plus-btn" aria-label="增加 5 分钟">＋ 5</button>
                </div>
                <div class="focus-slider-wrap">
                  <input type="range" id="focus-minutes-slider" min="5" max="120" step="5" value="${work}" data-testid="focus-minutes-slider" aria-label="专注时长滑块（5至120分钟）">
                </div>
                <div class="focus-preset-chips">
                  ${[5, 15, 25, 45, 60, 90, 120]
                    .map(
                      (m) =>
                        `<button type="button" class="focus-preset-chip ${
                          work === m ? 'active' : ''
                        }" data-action="focussetminutes" data-minutes="${m}" data-testid="focus-preset-${m}">${m} 分钟</button>`
                    )
                    .join('')}
                </div>
              </div>

              <div class="card focus-setup-tasks-card" data-testid="focus-tasks-card">
                <div class="row between" style="margin-bottom:6px">
                  <h3 style="margin:0">我正在专注什么</h3>
                  <span class="tiny muted">支持自由输入或添加多项任务</span>
                </div>
                <div class="focus-task-input-row">
                  <input type="text" id="focus-task-input" class="field" placeholder="输入任务名称，如：整理方案、阅读文献..." value="${esc(
                    focusTaskInputDraft
                  )}" data-testid="focus-task-input">
                  <button type="button" class="btn small secondary" data-action="addfocustask" data-testid="focus-add-task-btn">＋ 添加</button>
                </div>
                ${
                  draftTasks.length > 0
                    ? `<div class="focus-draft-task-list" data-testid="focus-draft-tasks">
                        ${draftTasks
                          .map(
                            (t, idx) =>
                              `<span class="focus-draft-task-tag" data-testid="focus-draft-task-${idx}">
                                <span>${esc(t)}</span>
                                <button type="button" data-action="removefocustask" data-index="${idx}" aria-label="移除任务">×</button>
                              </span>`
                          )
                          .join('')}
                      </div>`
                    : `<p class="sub" style="margin:6px 0 0">可直接输入一项任务开始专注，也可点击「＋ 添加」列出本次多项待办。</p>`
                }
              </div>

              <div class="card focus-setup-roles-card" data-testid="focus-roles-card">
                <div class="row between" style="margin-bottom:8px">
                  <div>
                    <h3 style="margin:0">邀请谁一起专注</h3>
                    <span class="tiny muted">支持多选角色陪伴，也可不选独自专注</span>
                  </div>
                  <button type="button" class="btn small ghost ${
                    draftInvited.length === 0 ? 'active' : ''
                  }" data-action="focusclearroles" data-testid="focus-solo-btn">${
                    draftInvited.length === 0 ? `${uiIcon('check')} 当前独自专注` : '切换为独自专注'
                  }</button>
                </div>
                <div class="focus-invite-role-list" data-testid="focus-invite-role-list">
                  ${data.roles
                    .map((roleItem) => {
                      const isSelected = draftInvited.includes(roleItem.id);
                      const curRoutine = routine(roleItem, now());
                      return `<button type="button" class="focus-role-select-card ${
                        isSelected ? 'is-selected' : ''
                      }" data-action="focustogglerole" data-role-id="${esc(
                        roleItem.id
                      )}" data-testid="focus-invite-role-${esc(roleItem.id)}">
                        ${avatarTag(roleItem, 'avatar sm')}
                        <div class="grow" style="text-align:left">
                          <div class="row between">
                            <b>${esc(roleItem.name)}</b>
                            <span class="focus-role-check">${
                              isSelected ? `${uiIcon('check')} 已邀请` : '点击邀请'
                            }</span>
                          </div>
                          <div class="tiny muted">${esc(roleItem.job)} · ${esc(
                        curRoutine.doing
                      )}</div>
                        </div>
                      </button>`;
                    })
                    .join('')}
                </div>
              </div>

              <button type="button" class="btn full focus-start-main-btn" data-action="startfocus" data-testid="start-focus-btn">开始专注 · ${work} 分钟</button>`
        }

        <div class="card focus-history-card" data-testid="focus-history-section">
          <div class="row between" style="margin-bottom:8px">
            <div>
              <h3 style="margin:0">我的计时记录</h3>
              <span class="tiny muted">按日期归档全部已完成与提前结束记录 · 点击查看完整报告</span>
            </div>
            ${
              selectedDateKey !== todayKey
                ? `<button type="button" class="btn small ghost" data-action="focushistorydate" data-date="${esc(
                    todayKey
                  )}" data-testid="focus-date-today">回到今天</button>`
                : ''
            }
          </div>

          <div class="focus-date-bar">
            <button type="button" class="btn small secondary" data-action="focushistorydate" data-date="${esc(
              shiftDateKey(selectedDateKey, -1)
            )}" data-testid="focus-date-prev">‹ 前一天</button>
            <input type="date" id="focus-history-date-input" class="field focus-date-input" value="${esc(
              selectedDateKey
            )}" data-testid="focus-date-input" aria-label="选择计时记录日期">
            <button type="button" class="btn small secondary" data-action="focushistorydate" data-date="${esc(
              shiftDateKey(selectedDateKey, 1)
            )}" data-testid="focus-date-next">后一天 ›</button>
          </div>

          <div class="focus-day-summary" data-testid="focus-day-summary">
            <span>${esc(selectedDateKey)} · 共 <b>${
              dayRecords.length
            }</b> 次专注记录</span>
            <span>累计有效时长 <b>${esc(
              formatDurationMinutesAndSeconds(dayTotalElapsedMs)
            )}</b></span>
          </div>

          <div class="focus-history-list" data-testid="focus-history-list">
            ${
              dayRecords.length > 0
                ? dayRecords
                    .map((rec) => {
                      const isDone = rec.completionStatus !== 'ended_early';
                      const tLabel = formatFocusTaskSummary(rec.tasks);
                      const durLabel = formatDurationMinutesAndSeconds(
                        typeof rec.actualElapsedMs === 'number'
                          ? rec.actualElapsedMs
                          : (rec.minutes || 0) * 60000
                      );
                      const pNames = (rec.participantRoleIds || [])
                        .map((rid) => data.roles.find((r) => r.id === rid)?.name)
                        .filter(Boolean)
                        .join('、');
                      return `<button type="button" class="focus-history-item" data-action="openfocusrecord" data-session-id="${esc(
                        rec.id
                      )}" data-testid="focus-record-item-${esc(rec.id)}">
                        <div class="row between" style="width:100%;margin-bottom:4px">
                          <b class="focus-history-task">${esc(tLabel)}</b>
                          <span class="focus-status-badge ${
                            isDone ? 'is-completed' : 'is-early'
                          }">${isDone ? '已完成' : '提前结束'}</span>
                        </div>
                        <div class="row between tiny muted" style="width:100%">
                          <span>有效专注 ${esc(durLabel)}（计划 ${esc(
                        rec.plannedMinutes || rec.minutes
                      )} 分钟） · ${
                        pNames ? `与 ${esc(pNames)} 共同专注` : '独自专注'
                      }</span>
                          <span>${hm(rec.startedAt)}–${hm(rec.finishedAt)} ›</span>
                        </div>
                      </button>`;
                    })
                    .join('')
                : `<div class="sub" style="padding:12px 0;text-align:center" data-testid="focus-history-empty">该日期（${esc(
                    selectedDateKey
                  )}）暂无专注计时记录。</div>`
            }
          </div>
        </div>
      </div>
      ${renderFocusSettlementModal()}`
    );
  }

  function screenDrama(): string {
    const r = role()!;
    return shell(
      `${header(
        '戏剧',
        'home'
      )}<div class="viewport"><div class="h2">排演另一个世界。</div><p class="sub">你负责设置世界与角色；戏剧中的故事与日常现实分开保存。退出后，${esc(
        r.name
      )}能记得「我们演过这出戏」，并和你讨论它。</p><div class="card"><h3>开始一出新戏</h3><form id="play-start"><div class="fieldrow"><label>剧本名称</label><input name="title" class="field" placeholder="无题之夜" value="另一座城的来信"></div><div class="fieldrow"><label>世界观 / 开场</label><textarea name="world" class="field" required placeholder="故事发生在哪里，有什么规则？">一座常年下雨的城市。两个人在最后一班列车上偶遇。</textarea></div><div class="fieldrow"><label>我的角色设定</label><textarea name="user" class="field" required>正在寻找一封遗失的信的人</textarea></div><div class="fieldrow"><label>${esc(
        r.name
      )}的戏内角色设定</label><textarea name="char" class="field" required>知道这座城市很多秘密，却不愿轻易开口的人</textarea></div><button class="btn full" ${
        r.play ? 'disabled title="请先结束或继续当前戏剧"' : ''
      }>开幕 · 进入文字小说</button></form></div>${
        r.play
          ? `<button class="btn full secondary" data-action="${
              r.play.paused ? 'intermission' : 'resume'
            }">${uiIcon('undo')} ${
              r.play.paused
                ? '继续幕间讨论'
                : '继续未落幕的《' + esc(r.play.title) + '》'
            }</button>`
          : ''
      }<div class="section">已存档的戏剧 · ${r.plays.length} 场</div>${
        r.plays
          .slice()
          .reverse()
          .map(
            (p) =>
              `<div class="card"><div class="row between"><div><b>${esc(
                p.title
              )}</b><p>${dateStr(
                p.endedAt || p.startedAt
              )}</p></div><button class="btn small secondary" data-action="viewplay" data-id="${esc(
                p.id
              )}">查看</button></div></div>`
          )
          .join('') || '<div class="sub">尚未有剧本存档。</div>'
      }</div>`
    );
  }

  function screenNovel(): string {
    const r = role()!;
    const isPlay=novelViewKind==='play';
    const p=isPlay?r.play:r.scene;
    const scope: RevisionScope = isPlay ? 'play' : 'scene';
    if (!p) {
      view = 'home';
      return screenHome();
    }
    const title = isPlay ? (p as PlayData).title : `与${r.name}的见面`;
    const showBackstage=isPlay&&Boolean((p as PlayData).paused);
    const opening=isPlay?undefined:r.scene?.opening;
    const openingPending=opening&&opening.status!=='archived';
    if(showBackstage)view='intermission';
    const activeMessages = isPlay?getActiveMessages(p.messages):encounterHistory(r,p.messages);
    const revCount = ensureRevisionsList(r).filter(
      (x) => x.scope === scope
    ).length;

    return shell(
      `<div class="theatre-layout ${showBackstage?'has-backstage':''}"><section class="theatre-main" aria-label="${isPlay?'戏中戏正式内容':'面对面'}"><div class="top"><button class="back-btn" data-action="view" data-view="home" aria-label="离开但保留进度">‹</button><div class="grow"><h1>${esc(
        isPlay ? '戏剧 · ' + title : '面对面'
      )}</h1><div class="small">${
        isPlay ? showBackstage?'幕间讨论中 · 演出暂停':'戏内时间与现实隔离' : '时间按现实流速 · ' + hm(now())
      }</div></div>
      <button type="button" class="btn small secondary" data-action="togglerevisions">修订${
        revCount ? `(${revCount})` : ''
      }</button>
      ${
        isPlay
          ? `<button class="btn small secondary intermission-open" data-action="intermission">幕间讨论</button>`
          : ''
      }<button class="btn small secondary" data-action="endnovel">${
        isPlay ? '落幕' : '结束见面'
      }</button></div>
      ${renderRevisionsDrawer(r, scope)}
      <div class="novel" id="scroll-area"><div class="chapter">${
        isPlay ? 'theatre / act one' : 'a moment together'
      }</div><h2 class="scene-title">${esc(title)}</h2>${!isPlay?`<div class="row between"><span data-scene-location>地点：${esc(r.scene!.where)}</span><details><summary>场景选项</summary><button type="button" class="btn small secondary" data-action="edit-meeting-place" data-role-id="${esc(r.id)}" data-scene-id="${esc(p.id)}">备用地点纠错</button></details></div>`:''}${activeMessages
        .map((m) => {
          const isEditingThis =
            editingMessageId === m.id && editingMessageScope === scope;
          return `<div class="passage ${
            m.speaker === 'me'
              ? 'mine'
              : m.speaker === 'char'
              ? 'theirs'
              : 'note'
          }" data-msg-id="${esc(m.id)}"><span class="speaker">${
            m.speaker === 'me' ? '你' : m.speaker === 'char' ? esc(r.name) : '场景'
          }${m.editedAt ? ' · 已编辑' : ''}</span>${quoteBubbleHtml(m, r)}${novelMessageHtml(m,r.id,p.id,isPlay?'theatre':'meeting')}
          ${
            m.speaker !== 'note'
              ? isEditingThis
                ? `<form id="inline-edit-form" class="inline-edit-form" data-scope="${scope}" data-id="${esc(
                    m.id
                  )}">
                    <textarea name="editText" required>${esc(
                      editingMessageDraft
                    )}</textarea>
                    <div class="inline-edit-actions">
                      <button type="button" class="btn small secondary" data-action="canceleditmsg">取消</button>
                      <button type="submit" class="btn small">保存修改</button>
                    </div>
                  </form>`
                : `<div class="message-meta-row">
                    <span class="msg-actions">
                      <button type="button" class="msg-action-btn" data-action="quotemsg" data-scope="${scope}" data-id="${esc(
                    m.id
                  )}">引用</button>
                      <button type="button" class="msg-action-btn" data-action="starteditmsg" data-scope="${scope}" data-id="${esc(
                    m.id
                  )}">编辑</button>
                      ${
                        m.speaker === 'char'
                          ? `<button type="button" class="msg-action-btn" data-action="regenmsg" data-scope="${scope}" data-id="${esc(
                              m.id
                            )}" ${busy||showBackstage ? 'disabled' : ''}>重抽</button>`
                          : ''
                      }
                      <button type="button" class="msg-action-btn" data-action="retractmsg" data-scope="${scope}" data-id="${esc(
                    m.id
                  )}">撤回</button>
                    </span>
                  </div>`
              : ''
          }
          </div>`;
        })
        .join('')}</div>
      ${
        quotingMessage
          ? `<div class="compose-quote-bar">
              <div class="quote-preview">正在引用 ${esc(
                quotingMessage.speaker === 'me' ? '你' : r.name
              )}：「${esc(quotingMessage.text)}」</div>
              <button type="button" data-action="cancelquote">取消引用</button>
            </div>`
          : ''
      }
      ${openingPending?`<div class="chat-feedback" role="status" data-scene-opening="${esc(opening.status)}"><p>${busy?'正在准备或生成本轮面对面回复。':opening.status==='unsent'?'场景已保存，首次请求尚未发送。':'首次请求或保存结果未确认。可先刷新核对，重试可能再次计费。'}</p>${busy?'':`<button type="button" class="btn secondary" data-action="resume-scene-opening">${opening.status==='unsent'?'继续本轮':'重新发送首次请求'}</button>`}</div>`:''}
      <form class="compose" id="novel-form" data-role-id="${esc(r.id)}" data-scene-id="${isPlay?'':esc(p.id)}"><textarea id="novel-input" data-scoped-draft ${showBackstage?'disabled':''} placeholder="写下你说的话或行动..." rows="1"></textarea><button class="btn" ${
        busy||showBackstage||openingPending ? 'disabled' : ''
      }>${uiIcon('send')}</button>${data.settings.mode==='api'&&!showBackstage&&!openingPending&&activeMessages.at(-1)?.speaker==='me'?`<button type="button" class="btn secondary" data-action="retry-novel" ${busy?'disabled':''} title="不重复添加用户消息">重试回复</button>`:''}</form></section>${showBackstage?renderIntermissionPanel(r,p as PlayData):''}</div>`,
      false
    );
  }

  function ensureIntermission(p: PlayData): PlayData {
    if (!Array.isArray(p.intermissionMessages)) p.intermissionMessages = [];
    if (!Array.isArray(p.revisions)) p.revisions = [];
    return p;
  }

  function screenIntermission():string {return screenNovel();}

  function renderIntermissionPanel(r:RoleData,p:PlayData):string {
    ensureIntermission(p);
    const messages = getActiveMessages(p.intermissionMessages!);
    const latest=messages.filter(m=>m.speaker==='me').at(-1);
    const attempt=latest&&intermissionAttempt(p,latest.id);
    const pending=intermissionOperations.has(p);
    const locked=busy||pending;
    const lastTurns = getActiveMessages(p.messages).filter(
      (m) => m.speaker === 'me' || m.speaker === 'char'
    );
    return `<aside class="intermission-panel" aria-labelledby="intermission-title" data-testid="intermission-panel"><header class="intermission-panel-top"><div><small>BACKSTAGE · 演出暂停</small><h2 id="intermission-title">幕间讨论 · ${esc(r.name)}</h2></div><button type="button" class="btn small secondary" data-action="resumeplay" aria-label="关闭幕间并返回演出">回到演出 ×</button></header>
 <p class="intermission-hint">戏外本人 · 发送仅保存你的发言，点爪印才请 AI 回复。未发送的草稿不进入请求。</p>
 ${pending?'<p class="sub" role="status">正在等待幕间回复…</p>':attempt?.status==='unknown'?'<p class="sub" role="status">幕间请求结果未确认，可能已计费。再次请求需要确认。</p>':''}
 ${intermissionRecovery.has(p)?'<button type="button" class="btn small secondary" data-action="copy-intermission-reply">查看可复制的未保存幕间回复</button>':''}
 <div class="intermission-history" id="intermission-scroll" aria-live="polite">
 ${
   messages.length
     ? messages
         .map(
           (m) =>
             `<div class="offstage-message ${
               m.speaker === 'me' ? 'offstage-me' : 'offstage-actor'
             }"><div class="offstage-name">${
               m.speaker === 'me'
                 ? '我'
                 : m.speaker === 'note'
                 ? '修订记录'
                 : esc(r.name)
             }</div><div class="offstage-bubble">${esc(
               m.text
             )}</div><time>${hm(m.at)}</time></div>`
         )
         .join('')
     : `<div class="intermission-empty">幕布暂时落下了。你可以聊剧情、吐槽刚才的表演，或者修改接下来的方向。</div>`
 }
 </div>
 <details class="intermission-tools"><summary>剧本调整与回退 <span>⌄</span></summary><form id="intermission-settings-form"><label>戏剧世界与规则</label><textarea name="world" class="field">${esc(
   p.world || ''
 )}</textarea><label>我的戏内角色</label><textarea name="user" class="field">${esc(
        p.user || ''
      )}</textarea><label>${esc(
        r.name
      )}的戏内角色</label><textarea name="char" class="field">${esc(
        p.char || ''
      )}</textarea><button class="btn small full">保存修改后的演出设定</button></form><button class="btn secondary full" data-action="rollbackplay" ${
        lastTurns.length ? '' : 'disabled'
      }>回退刚才一轮戏内互动</button><p class="sub">仅回退戏内已演的最后一轮；旧版本留在幕间修订档案，戏内正式剧情不再引用它。演员仍可能记得你们试过另一种演法。</p></details>
 <form class="compose intermission-compose" id="intermission-form"><textarea id="intermission-input" data-scoped-draft placeholder="和戏外的${esc(r.name)}聊聊……" rows="1" required ${locked?'disabled':''}></textarea><button class="btn" type="submit" ${locked?'disabled':''} aria-label="发送幕间消息（不触发 AI）" title="仅发送你的消息">发送</button><button type="button" class="btn intermission-paw" data-action="intermissionreply" ${locked?'disabled':''} aria-label="让 AI 回复幕间讨论" title="仅点爪印才触发 AI 回复">${catPawSvg(true)}<span>AI 回复</span></button></form></aside>`;
  }

  function submitIntermission(draft:DraftBinding,text:string):void {
    const p=draft.owner.play!;
    if(intermissionOperations.has(p))return;
    ensureIntermission(p);
    const message:ChatMessage={id:uid(),speaker:'me',text:text.trim(),at:now(),status:'active'};
    p.intermissionMessages!.push(message);
    if(!save()){p.intermissionMessages!.pop();return;}
    clearSubmittedDraft(draft);
    syslog('intermission','幕间用户发言已保存；等待爪印触发回复',{source:p.id});
    render(false);const area=$('#intermission-scroll');if(area)area.scrollTop=area.scrollHeight;
    $<HTMLTextAreaElement>('#intermission-input')?.focus({preventScroll:true});
  }

  function intermissionAttempt(p:PlayData,id:string) {
    const attempts=p.intermissionAttempts;
    return attempts&&Object.hasOwn(attempts,id)?attempts[id]:undefined;
  }

  async function requestIntermissionReply(form:HTMLFormElement|null):Promise<void> {
    const draft=form&&currentDraft(form);
    if(!draft||draft.mode!=='intermission'||busy||modelPageHidden)return;
    const world=data,r=draft.owner,p=r.play!,epoch=modelPageEpoch;
    if(intermissionOperations.has(p))return;
    if(draft.input.value.trim()){notify('这段文字尚未发送，请先点发送，再点爪印。');return;}
    const messages=getActiveMessages(p.intermissionMessages);
    const latest=messages.filter(m=>m.speaker==='me').at(-1);
    if(!latest){notify('先发送一条幕间消息，再点爪印请 AI 回复。');return;}
    if(!token.trim()||!canUseRealModel(data.settings)){notify('请先在终端连接 API；当前发言已保存在本地。');return;}
    if(!checkWriteAccess())return;
    const previous=intermissionAttempt(p,latest.id),revision=latest.revisionCount||0;
    if(previous?.status==='archived'&&previous.revision===revision||
      !previous&&messages.some(m=>m.speaker==='char'&&m.replyTo===latest.id&&m.at>=(latest.editedAt||latest.at))){
      notify('这条幕间发言已有回复。');return;
    }
    if(previous?.status==='unknown'&&!window.confirm('上次幕间请求可能已被服务商处理。再次生成可能再次计费，确定继续？'))return;
    const operation=new AbortController(),connection=apiConnectionVersion;
    const context=()=>JSON.stringify([p.title,p.world,p.user,p.char,p.messages,p.revisions,getActiveMessages(p.intermissionMessages)]);
    const basis=context(),visible=()=>data===world&&role()===r&&r.play===p&&view==='intermission';
    const current=()=>data===world&&epoch===modelPageEpoch&&world.roles.includes(r)&&r.play===p&&p.paused===true&&!p.endedAt&&
      intermissionOperations.get(p)===operation&&!operation.signal.aborted&&context()===basis;
    intermissionOperations.set(p,operation);
    render(false);
    let sent=false;
    let claimed:PlayData['intermissionAttempts'];
    const oldAttempts=p.intermissionAttempts;
    try {
      const valid=()=>current()&&apiConnectionVersion===connection&&saveSession.current();
      let compileSource:(()=>ConversationCompilation)|undefined;
      const prompt=await compileRequest(r,'intermission',options=>{
        const snapshot={...options,isFocused:isFocused(r),nowTs:now()};
        compileSource=()=>compileNativeConversation(world,r,'intermission',latest.text,snapshot);
        return compileSource();
      },valid);
      if(!valid())throw Error('幕间任务或连接已变化');
      const attempt:NonNullable<PlayData['intermissionAttempts']>[string]={id:uid(),revision,status:'unknown'};
      p.intermissionAttempts={...oldAttempts,[latest.id]:attempt};
      if(!save()){p.intermissionAttempts=oldAttempts;throw Error('幕间领取未确认');}
      claimed=p.intermissionAttempts;
      const body=await readModelBeforeDeadline(async signal=>{
        const response=requestSceneCompletion(prompt,'intermission',{},signal,{roleId:r.id,onDispatch:()=>{sent=true;}});
        return readChatResponseBody(await response);
      },operation.signal);
      const reply=parseChatResponse(body);
      if(!current()||intermissionAttempt(p,latest.id)!==attempt)return;
      if(!compileSource||JSON.stringify(requestMessages(compileSource()))!==JSON.stringify(prompt))return;
      if(!saveSession.current()){
        intermissionRecovery.set(p,{sourceId:latest.id,text:reply});
        if(visible())notify('幕间正文已返回，存档已变化。可以复制这次回复。');
        return;
      }
      const count=p.intermissionMessages!.length;
      p.intermissionAttempts[latest.id]={...attempt,status:'archived'};
      for(const text of splitChatBubbles(reply,r))p.intermissionMessages!.push({id:uid(),speaker:'char',text,at:now(),status:'active',replyTo:latest.id});
      if(!saveLogged('intermission','用户通过爪印触发戏外 AI 回复',{source:p.id,roleId:r.id})){
        p.intermissionMessages!.length=count;
        p.intermissionAttempts[latest.id]=attempt;
        intermissionRecovery.set(p,{sourceId:latest.id,text:reply});
        if(visible())notify('幕间正文已返回，保存未确认。可以复制这次回复。');
      }else if(intermissionRecovery.get(p)?.sourceId===latest.id)intermissionRecovery.delete(p);
    }catch(error){
      if(!sent&&claimed&&current()&&p.intermissionAttempts===claimed&&saveSession.current()){
        p.intermissionAttempts=oldAttempts;
        if(!save())p.intermissionAttempts=claimed;
      }
      if(visible()&&epoch===modelPageEpoch){
        const reason=error instanceof Error&&error.name==='TimeoutError'?'幕间请求超时。':'幕间请求未完成。';
        notify(reason+(sent?'结果未确认，可能已计费。':'本次请求未发送。')+'你的发言已保留。');
      }
    }finally{
      if(intermissionOperations.get(p)===operation){
        intermissionOperations.delete(p);
        if(visible()){render(false);const area=$('#intermission-scroll');if(area)area.scrollTop=area.scrollHeight;}
      }
    }
  }

  function rollBackPlay(): void {
    const r = role();
    const p = r?.play;
    if (!r || !p || !p.paused || busy) return;
    ensureIntermission(p);
    const lastMe = p.messages
      .map((m, i) => (m.speaker === 'me' && m.status !== 'retracted' ? i : -1))
      .filter((x) => x >= 0)
      .at(-1);
    if (lastMe == null) {
      notify('还没有可回退的戏内回合');
      return;
    }
    const previous={...p,messages:p.messages.slice(),revisions:p.revisions?.slice(),intermissionMessages:p.intermissionMessages?.slice()};
    const events=r.events;
    const rejected = p.messages.splice(lastMe);
    const entryIds = new Set(rejected.map((m) => m.id));
    r.events = r.events.filter(
      (e) =>
        !(
          e.kind === 'drama' &&
          e.source === p.id &&
          e.at >= rejected[0].at &&
          (entryIds.has(e.messageId || '') || /你在戏里说过|的回复/.test(e.title))
        )
    );
    p.revisions!.push({
      id: uid(),
      at: now(),
      kind: 'rollback',
      messages: rejected,
    });
    p.intermissionMessages!.push({
      id: uid(),
      speaker: 'note',
      text: `已回退一轮演出（${rejected.length} 条戏内消息），旧版本保存在修订记录。`,
      at: now(),
      status: 'active',
    });
    if(!saveLogged('intermission', `回退一轮戏内互动：${entryIds.size} 条消息`, {
      source: p.id,
    })){
      restoreFields(p,previous);
      r.events=events;
      return;
    }
    render();
    notify('戏内回合已回退，幕间保留修订记录');
  }

  function screenRoleInfo(): string {
    const r = role()!;
    return shell(
      `${header(
        '角色资料与手机设置',
        'home'
      )}<div class="viewport"><div class="row" style="margin:10px 0 25px">${avatarTag(
        r,
        'avatar large'
      )}<div><div class="h2">${esc(r.name)}</div><div class="sub">${esc(
        r.job
      )} · ${esc(
        r.place
      )}</div><div class="row" style="gap:6px;flex-wrap:wrap;margin-top:9px"><button class="btn small secondary" data-action="editrole" data-id="${esc(
        r.id
      )}">编辑角色 / 头像 / 删除</button><button class="btn small ghost" type="button" data-action="editroleframe" data-id="${esc(
        r.id
      )}" data-testid="profile-goto-frame-gallery">更换头像框</button></div></div></div><form id="profile-form"><div class="fieldrow"><label>角色身份 / 原作设定</label><textarea class="field" name="profile">${esc(
        r.profile
      )}</textarea></div><div class="fieldrow"><label>性格与语言风格</label><textarea class="field" name="traits">${esc(
        r.traits
      )}</textarea></div><div class="fieldrow"><label>当前关系描述</label><textarea class="field" name="relationship">${esc(
        r.relationship
      )}</textarea></div><div class="card"><div class="row" style="margin-bottom:8px">${userAvatarTag(
        data.user,
        'avatar sm'
      )}<h3 style="margin:0">在 ${esc(
        r.name
      )} 面前的我</h3></div><p class="sub">通用资料与个人头像来自「我的资料」，这里可以覆盖称呼，并增加只有该角色知道的背景。其他角色不会自动获得这段补充。</p><div class="fieldrow"><label>只对这个角色使用的称呼（留空则用全局名字）</label><input class="field" name="userAlias" value="${esc(
        r.userAlias || ''
      )}" placeholder="该角色怎么称呼我"></div><div class="fieldrow"><label>只对这个角色生效的个人设定</label><textarea class="field" name="notes">${esc(
        r.notes || ''
      )}</textarea></div><button class="btn small secondary" type="button" data-action="view" data-view="userprofile">修改全局「我的资料」、头像与头像框</button></div><button class="btn full">保存人设与专属身份</button></form>${nainPreflightCard(r)}${Object.values(phoneSettingsCards()).join('')}</div>`
    );
  }

  function nainPreflightCard(r:RoleData):string {
    if(r.name!=='奈恩')return '';
    const hasBackup=r.demoStartResetAt&&localStorage.getItem(NAIN_BACKUP_PREFIX+r.id+':'+r.demoStartResetAt);
    return `<section class="card nain-preflight"><h3>奈恩 · 实机前起点</h3><p class="sub">${r.demoStartResetAt?'已完成一次性清档。角色资料、头像与头像框保留。':awaitingFirstMessage(r)&&!r.chats.length?'尚未发出首条消息，等待连接 API。':'仅原厂演示开场会自动清理。其他历史无法自动认定为演示，请核对后再决定。'}</p>${!r.demoStartResetAt?`<p class="sub">一次性清理会移除当前奈恩的全部聊天（${r.chats.length} 条）、日记（${r.diaries.length} 篇）、事件（${r.events.length} 条）及见面／戏剧／待回复／足迹状态。若有真实记录请勿清理。先保存本地恢复副本，不删除媒体或其他角色。</p><button class="btn small secondary" data-action="nainpreflight" ${busy?'disabled':''}>核对后一次性清理奈恩互动</button>`:''}${hasBackup?'<button class="btn small secondary" data-action="exportnainbackup">导出清档前恢复副本（含媒体）</button>':''}</section>`;
  }

  function screenPlayDetail(): string {
    const r = role()!;
    const p = r.plays.find((x) => x.id === detailId);
    if (!p) {
      view = 'drama';
      return screenDrama();
    }
    return shell(
      `${header('戏剧档案', 'drama')}<div class="viewport"><div class="h2">${esc(
        p.title
      )}</div><div class="card"><p>世界：${esc(p.world)}</p><p>我的人设：${esc(
        p.user
      )}</p><p>${esc(r.name)}的人设：${esc(p.char)}</p></div>${getActiveMessages(
        p.messages
      )
        .map(
          (m) =>
            `<div class="entry"><time>${
              m.speaker === 'me' ? '你' : m.speaker === 'char' ? esc(r.name) : '场景'
            }</time><div>${novelMessageHtml(m,r.id,p.id,'theatre')}</div></div>`
        )
        .join('')}</div>`
    );
  }

  function screenMeetingDetail():string {
    const r=role()!,scene=(r.meetings||[]).find(p=>p.id===detailId&&p.endedAt!==undefined);
    return shell(`${header('见面档案','chat')}${scene?meetingRecordHtml(r,scene):'<div class="viewport"><p class="sub">未找到本角色的已结束见面记录。</p></div>'}`,false);
  }

  function systemLogsHtml():string {
    const date=systemLogDate||toLocalDateKey(now()),logs=data.logs||[];
    return `<h3>系统 Log</h3><p>按本地日期查看连接与模式诊断；不记录 API Key、Prompt 或聊天全文。</p><div class="row"><button class="btn small secondary" data-action="exportlogs">导出日志 JSON</button><button class="btn small ghost" data-action="clearlogs">清空日志</button></div><details><summary>最近请求结构 · 当前角色</summary><pre>${esc(JSON.stringify(promptTraces.get(role()!.id)||{status:'当前会话尚无请求'},null,2))}</pre></details><div class="row between"><b>${esc(date)}${systemLogDate?'':' · 今日'}</b><button type="button" class="btn small ghost" data-action="logtoday">今日日志</button></div><details data-log-history><summary>历史日志</summary><label>选择日期<select class="field" data-log-date aria-label="日志日期">${logDays(logs,now()).map(day=>`<option value="${day}" ${date===day?'selected':''}>${day}</option>`).join('')}</select></label></details><div class="log-list">${logsForDay(logs,date).map(l=>`<details class="log-row" data-log-id="${esc(l.id)}"><summary>${esc(logTimestamp(l.at))} · ${esc(l.type)} · ${esc(l.detail.slice(0,75))}</summary><pre>${esc(JSON.stringify(l,null,2))}</pre></details>`).join('')||'<p class="sub">这一天暂无日志。</p>'}</div>`;
  }
  function refreshSystemLogs():void {
    const root=$('#system-log-root');if(!root)return;
    const key=JSON.stringify([systemLogDate,toLocalDateKey(now()),data.logs?.length,data.logs?.at(-1)?.id,role()?.id,promptTraces.get(role()!.id)]);
    if(root.dataset.logKey===key)return;
    const opened=new Set([...root.querySelectorAll<HTMLDetailsElement>('details[open]')].map(el=>el.dataset.logId||el.querySelector('summary')?.textContent));
    root.innerHTML=systemLogsHtml();root.dataset.logKey=key;
    root.querySelectorAll<HTMLDetailsElement>('details').forEach(el=>{if(opened.has(el.dataset.logId||el.querySelector('summary')?.textContent))el.open=true;});
  }

  function screenTerminal(): string {
    const cards = phoneSettingsCards();
    return shell(`${header('终端','home')}<div class="viewport terminal-page"><details class="card terminal-settings" open><summary><span>01｜API 与模型</span>${uiIcon('down')}</summary><div id="terminal-api-root"></div></details><details class="card terminal-settings" data-style-panel><summary><span>02｜外观与主题</span>${uiIcon('down')}</summary><div data-style-body="appearance"></div></details><details class="card terminal-settings" data-style-panel><summary><span>03｜聊天气泡自定义</span>${uiIcon('down')}</summary><div data-style-body="bubbles"></div></details><details class="card terminal-other-settings terminal-settings"><summary><span>04｜其他手机设置</span>${uiIcon('down')}</summary>${cards.frames}${cards.logs}${cards.backup}</details></div>`);
  }
  function screenPresets(): string {
    return shell(`${header('预设','home')}<div class="viewport"><div class="h2">预设</div><p class="sub">为当前角色选择一份小说预设，见面与正式演出共用。手机与幕间保持原生；正则和第三方脚本不执行。即时设置自动保存，正文确认后提交。</p><div class="card" id="fruit-preset-root"></div></div>`);
  }
  function phoneSettingsCards() {
    const r=role()!;
    return { logs: `<div class="card" id="system-log-root">${systemLogsHtml()}</div>`,
      frames: renderTerminalFrameAssetManagerCard(),
      backup: `<div class="card"><h3>数据与跨环境迁移</h3><p>各角色互相隔离。支持导出 / 导入本地 JSON 备份（包含全部角色、修订档案、日记分享状态与 IndexedDB 媒体附件，不包含 API Key）。</p><div class="row" style="margin-top:11px;flex-wrap:wrap"><button class="btn small secondary" data-action="export">导出备份</button><label class="btn small ghost" style="cursor:pointer">导入备份<input id="backup-file" type="file" accept=".json" hidden></label></div></div><p class="tiny muted">当前角色：${esc(
        r.name
      )} · v1 Phase 1</p>` };
  }

  function applyTheme(): void {
    const root = document.documentElement;
    const legacyMap: Record<string, ThemeName> = {
      violet: 'pink',
      sand: 'coffee',
    };
    const rawTheme =
      role()?.theme || legacyMap[data.theme] || data.theme || 'blue';
    const key: ThemeName = ['blue','green','pink','coffee','night'].includes(rawTheme)
      ? (rawTheme as ThemeName)
      : 'blue';
    if (root.dataset) root.dataset.theme = key;
    let themeColor=document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if(!themeColor){themeColor=document.createElement('meta');themeColor.name='theme-color';document.head.append(themeColor);}
    themeColor.content=getComputedStyle(root).getPropertyValue('--bg').trim();
    root.style.fontFamily=appearanceFontFamily(data,role());
    void hydrateAppearanceFont(data,role()).catch(()=>{});
  }

  function applyTerminalAppearance(): void {
    applyTheme();
    installBubbleCSS();
    const phone=$('.phone'),wallpaper=$('.wallpaper');
    if (phone) {
      for (const name of [...phone.classList]) if (name.startsWith('theme-')) phone.classList.remove(name);
      phone.classList.add(`theme-${role()?.theme||'blue'}`);
    }
    if (!wallpaper) return;
    const mediaId=role()?.wallpaperMediaId||'';
    if ((wallpaper.querySelector<HTMLElement>('.wallpaper-image')?.dataset.mediaId||'')===mediaId) return;
    wallpaper.replaceChildren();
    wallpaper.classList.toggle('has-custom-wallpaper',Boolean(mediaId));
    if (mediaId) {
      const image=document.createElement('img');
      image.className='wallpaper-image';
      image.dataset.mediaId=mediaId;
      image.alt='';
      wallpaper.append(image);
      void hydrateMedia(wallpaper);
    }
    clearMediaURLs();
  }

  function clearMediaURLs(): void {
    const active=new Set([...avatarLoadingIds,data.user.avatarMediaId,role()?.avatarMediaId,data.user.frameMediaId,role()?.frameMediaId].filter((id):id is string=>Boolean(id)));
    document.querySelectorAll<HTMLElement>('[data-media-id]').forEach(el=>{active.add(el.dataset.mediaId!);if(el.dataset.hydratedKey)active.add(el.dataset.hydratedKey);});
    mediaSources.prune(active);
    const previewSources=new Set([draftUserAvatarPreviewUrl,draftRoleAvatarPreviewUrl,...[...document.querySelectorAll<HTMLImageElement>('.avatar-img[src]')].map(img=>img.src)]);
    for(const [url,pending]of avatarPreviewURLs)if(!pending&&!previewSources.has(url)){URL.revokeObjectURL(url);avatarPreviewURLs.delete(url);}
  }

  async function hydrateMedia(rootEl: ParentNode = document): Promise<void> {
    clearMediaURLs();
    const pinnedPanes=new Map<HTMLElement,number>();
    // Attach graceful fallback handlers for remote preset avatar frames & thumbnails
    rootEl
      .querySelectorAll<HTMLImageElement>('.avatar-frame[src], .frame-thumb-img[src]')
      .forEach((imgEl) => {
        if (imgEl.dataset.fallbackBound === '1') return;
        imgEl.dataset.fallbackBound = '1';
        imgEl.addEventListener('error', () => {
          imgEl.classList.add('frame-img-error');
          const cell = imgEl.closest('.frame-cell');
          if (cell) {
            cell.classList.add('frame-remote-error');
          }
        });
      });

    const all = [
      ...rootEl.querySelectorAll<HTMLImageElement | HTMLAudioElement>(
        '[data-media-id]'
      ),
    ];
    for (const item of all) {
      const key = item.dataset.mediaId;
      if (!key) continue;
      if (item.dataset.hydratedKey === key && item.getAttribute('src')) continue;
      const isAvatarImg = item.classList.contains('avatar-img');
      const isFrameImg =
        item.classList.contains('avatar-frame') ||
        item.classList.contains('frame-thumb-img');
      try {
        const url = await (isAvatarImg ? mediaSources.getDecoded(key) : mediaSources.get(key));
        if (!item.isConnected || item.dataset.mediaId !== key) continue;
        if (item.dataset.hydratedKey===key && item.getAttribute('src')===url) continue;
        if (!url) {
          if(isAvatarImg&&item instanceof HTMLImageElement&&item.naturalWidth>0)continue;
          if (isAvatarImg) {
            const box = item.closest('.has-avatar-img');
            box?.classList.remove('has-avatar-img', 'avatar-loaded');
            item.remove();
          } else if (isFrameImg) {
            item.remove();
          } else {
            item.replaceWith(document.createTextNode('附件未找到（请检查备份）'));
          }
          continue;
        }
        item.dataset.hydratedKey = key;
        const pane=item.closest<HTMLElement>('#scroll-area');
        if(item instanceof HTMLImageElement&&pane){
          if(pane.scrollHeight-pane.clientHeight-pane.scrollTop<60)pinnedPanes.set(pane,pane.scrollTop);
          item.addEventListener('load',()=>{
            const top=pinnedPanes.get(pane);
            // Follow image growth only while the reader has stayed pinned in this chat.
            if(top!==undefined&&Math.abs(pane.scrollTop-top)<1&&pane.isConnected&&view==='chat'&&pane.dataset.roleId===role()?.id){
              pane.scrollTop=pane.scrollHeight;pinnedPanes.set(pane,pane.scrollTop);
            }else pinnedPanes.delete(pane);
          },{once:true});
        }
        if(item.getAttribute('src')!==url)item.src = url;
        if (isAvatarImg) {
          item.closest('.has-avatar-img')?.classList.add('avatar-loaded');
        }
      } catch {
        if (item.isConnected && item.dataset.mediaId === key) {
          if(isAvatarImg&&item instanceof HTMLImageElement&&item.naturalWidth>0)continue;
          if (isAvatarImg) {
            const box = item.closest('.has-avatar-img');
            box?.classList.remove('has-avatar-img', 'avatar-loaded');
            item.remove();
          } else if (isFrameImg) {
            item.remove();
          } else {
            item.replaceWith(document.createTextNode('媒体存储不可用'));
          }
        }
      }
    }
    clearMediaURLs();
  }

  /**
   * Surgical DOM patch when a background timer tick needs to update dynamic regions
   * while the user is actively typing, composing with IME, or has a drawer/panel open.
   */
  function patchDynamicRegionsOnTick(): void {
    document
      .querySelectorAll<HTMLElement>('.homescreen-time')
      .forEach((el) => {
        el.textContent = hm(Date.now());
      });
    const r = role();
    if (!r) return;
    if (view === 'chat') {
      const offline=$<HTMLButtonElement>('[data-action=offline-round]');
      if(offline){
        offline.disabled=!canChooseChatScene(r.chatTiming,now())||ongoing(r);
        offline.setAttribute('aria-pressed',String(!!(chatSceneEntry(r.chatTiming)||r.chatTiming?.inFlight?.entry)));
      }
      const feedback = document.querySelector<HTMLElement>('[data-chat-feedback]');
      if(feedback){feedback.hidden=!r.chatTiming?.blocked;feedback.innerHTML=renderChatFeedback(r);}
      if (!editingMessageId) {
        const sc = document.querySelector<HTMLElement>('#scroll-area');
        if (sc && sc.dataset.roleId===r.id) {
          const wasAtBottom =
            sc.scrollHeight - sc.scrollTop - sc.clientHeight < 60;
          const readingTop=sc.scrollTop;
          renderWithAvatars(sc,renderChatMessagesHtml(r));
          clearMediaURLs();
          hydrateMedia();
          sc.scrollTop = wasAtBottom ? sc.scrollHeight : readingTop;
        }
      }
    } else if (view === 'focus') {
      renderFocusTick();
      const f = activeFocus();
      const momentsEl = document.querySelector<HTMLElement>('#focus-moments');
      if (f && momentsEl) {
        momentsEl.innerHTML = renderFocusMomentsHtml(f);
      }
    } else if (view === 'home') {
      const cap = document.querySelector<HTMLElement>('.widget-caption');
      if (cap) {
        const pending = pendingFor(r);
        const a = activity(r, now());
        cap.textContent = pending ? `${pending} 条消息等待回复` : a.doing;
      }
    }
  }

  function draftNamespace(world:AppData):string {
    const id=world.draftWorldId;
    return typeof id==='string'&&/^[a-f0-9]{32}$/.test(id)?`elsewhere-draft-v1:${id}:`:'';
  }

  function draftScope(owner:RoleData,mode:DraftMode,stage:SceneData|PlayData|null):string {
    return JSON.stringify([owner.id,mode,stage?.id??null]);
  }

  function readDraft({world,owner,mode,stage}:DraftBinding):string {
    const scope=draftScope(owner,mode,stage),namespace=draftNamespace(world);
    let value=draftMemory.get(scope);
    if(value===undefined&&namespace){
      try{value=sessionStorage.getItem(namespace+scope)??undefined;}catch{/* Keep drafts in this document. */}
    }
    return value??(mode==='scene'?(stage as SceneData).draft??'':'');
  }

  function storeDraft(scope:string,value:string):void {
    draftMemory.set(scope,value);
    const namespace=draftNamespace(data);
    if(namespace){
      try{sessionStorage.setItem(namespace+scope,value);}catch{/* Keep drafts in this document. */}
    }
  }

  function clearDrafts(matches:(scope:string)=>boolean):void {
    for(const scope of draftMemory.keys())if(matches(scope))draftMemory.delete(scope);
    const namespace=draftNamespace(data);
    if(!namespace)return;
    try{
      for(const key of Object.keys(sessionStorage)){
        if(key.startsWith(namespace)&&matches(key.slice(namespace.length)))sessionStorage.removeItem(key);
      }
    }catch{/* Tab storage is optional. */}
  }

  function clearRoleDrafts(r:RoleData):void {
    const prefix=JSON.stringify([r.id]).slice(0,-1)+',';
    clearDrafts(scope=>scope.startsWith(prefix));
  }

  function clearSubmittedDraft(draft:DraftBinding):void {
    draft.input.value='';
    const scope=draftScope(draft.owner,draft.mode,draft.stage);
    clearDrafts(key=>key===scope);
    // A failed tab-storage removal must not restore sent text in this document.
    draftMemory.set(scope,'');
  }

  function draftIsMounted(draft:DraftBinding):boolean {
    const {world,owner,mode,stage,form,input}=draft;
    return world===data&&data.roles.includes(owner)&&appRoot.contains(form)&&form.contains(input)&&
      (mode==='chat'||(mode==='scene'?owner.scene:owner.play)===stage);
  }

  function captureDrafts(target?:EventTarget|null):void {
    for(const draft of mountedDrafts){
      if(draftIsMounted(draft)&&(target===draft.input||target===undefined&&draft.input.value!==readDraft(draft))){
        storeDraft(draftScope(draft.owner,draft.mode,draft.stage),draft.input.value);
      }
    }
  }

  function bindDrafts():void {
    mountedDrafts=[];
    const owner=role();
    if(!owner)return;
    const bind=(id:string,mode:DraftMode,stage:SceneData|PlayData|null)=>{
      const input=$<HTMLTextAreaElement>(id),form=input?.form;
      if(!input||!form)return;
      const draft={world:data,owner,mode,stage,form,input};
      input.value=readDraft(draft);
      mountedDrafts.push(draft);
    };
    if(view==='chat')bind('#message-input','chat',null);
    if((view==='novel'||view==='intermission')&&novelViewKind==='play'&&owner.play){
      bind('#novel-input','play',owner.play);
      bind('#intermission-input','intermission',owner.play);
    }
    if(view==='novel'&&novelViewKind==='scene'&&owner.scene)bind('#novel-input','scene',owner.scene);
  }

  function currentDraft(form:HTMLFormElement):DraftBinding|undefined {
    const draft=mountedDrafts.find(d=>d.form===form);
    if(!draft||!draftIsMounted(draft)||draft.owner!==role())return;
    if(draft.stage?.endedAt!==undefined)return;
    const {owner,mode}=draft;
    if(mode==='chat'&&view==='chat')return draft;
    if(mode==='intermission'&&view==='intermission'&&owner.play?.paused)return draft;
    if(view!=='novel'||mode!==novelViewKind)return;
    if(mode==='play'&&!owner.play?.paused)return draft;
    if(mode==='scene'&&(!owner.scene?.opening||owner.scene.opening.status==='archived'))return draft;
  }

  function archiveScene(r:RoleData):SceneData|null {
    const scene=r.scene;
    if(!scene)return null;
    const previous=scene.draft;
    const archived=archiveMeeting(r,now(),()=>{
      delete scene.draft;
      if(save())return true;
      if(previous!==undefined)scene.draft=previous;
      return false;
    });
    if(archived){
      const scope=draftScope(r,'scene',scene);
      clearDrafts(key=>key===scope);
    }
    return archived;
  }

  function render(scroll = true): void {
    captureDrafts();
    if(view==='home' && homeTasks.isOpen()){homeTasks.refresh();return;}
    if (editingMessageId && $('#inline-edit-form textarea')) {
      editingMessageDraft = (
        $('#inline-edit-form textarea') as HTMLTextAreaElement
      ).value;
    }

    const uiSnap = captureUIState(document);

    ensureFocusData();
    completeFocusIfDue();
    applyTheme();
    const app = $('#app');
    if (!app) return;
    installBubbleCSS();
    if (
      !data.selected &&
      !['roleform', 'userprofile', 'deleterole'].includes(view)
    ) {
      view = 'landing';
    }
    if(voiceOperation&&(view!=='chat'||role()!==voiceOperation.owner||!voiceOwnerCurrent(voiceOperation)))leaveVoicePanel();
    const markup =
      view === 'landing'
        ? screenLanding()
        : view === 'roleform'
        ? screenRoleForm()
        : view === 'userprofile'
        ? screenUserProfile()
        : view === 'deleterole'
        ? screenDeleteRole()
        : view === 'home'
        ? screenHome()
        : view === 'chat'
        ? screenChat()
        : view === 'diary'
        ? screenDiary()
        : view === 'focus'
        ? screenFocus()
        : view === 'monitor'
        ? screenMonitor()
        : view === 'drama'
        ? screenDrama()
        : view === 'novel'
        ? screenNovel()
        : view === 'intermission'
        ? screenIntermission()
        : view === 'roleinfo'
        ? screenRoleInfo()
        : view === 'meetingdetail'
        ? screenMeetingDetail()
        : view === 'playdetail'
        ? screenPlayDetail()
        : view === 'presets'
        ? screenPresets()
        : view === 'terminal'
        ? screenTerminal()
        : screenHome();

    const sameView = view === lastRenderedView;
    lastRenderedView = view;

    fruitManager.detach();
    terminalApi.detach();
    terminalAppearance.detach();
    homePager.detach();
    renderWithAvatars(app,markup);
    bindDrafts();
    refreshSaveAccess();
    clearMediaURLs();
    novelDisplay.mount(app);
    if(view==='terminal'){terminalApi.mount(document.getElementById('terminal-api-root'));terminalAppearance.mount(document.querySelector('.terminal-page'));}
    if(view==='presets')fruitManager.mount(document.getElementById('fruit-preset-root'));
    if(view==='home')homePager.mount(document.querySelector<HTMLElement>('.home-view')!);
    restoreUIState(uiSnap, !scroll, document, sameView);
    hydrateMedia();
    if (pendingScrollAnchorSelector) {
      const anchor = document.querySelector<HTMLElement>(pendingScrollAnchorSelector);
      const vp = document.querySelector<HTMLElement>('.viewport');
      if (anchor && vp) {
        vp.scrollTop = Math.max(0, anchor.offsetTop - 16);
      }
      pendingScrollAnchorSelector = '';
    } else if (scroll) {
      const sc = $('#scroll-area');
      if (sc) sc.scrollTop = sc.scrollHeight;
    }
  }

  let leavingPresets=false;
  window.addEventListener('beforeunload',(event)=>{captureDrafts();if(fruitManager.hasUnsaved()){event.preventDefault();event.returnValue='';}});
  function go(v: string,kind?:NovelKind,persist=true,settlingScene=false): void {
    if(kind)novelViewKind=kind;
    if(v==='intermission')novelViewKind='play';
    captureDrafts();
    if(v!=='home')homeTasks.close();
    if(v==='landing'&&data.selected&&novelTasks.cancel(data.selected))busy=false;
    const preserveStage=(view==='novel'&&v==='intermission')||(view==='intermission'&&v==='novel');
    if(['location','memories','profile'].includes(v))v='home';
    if(view==='presets'&&v!==view){
      if(leavingPresets)return;
      leavingPresets=true;void fruitManager.beforeLeave().then(ok=>{if(ok){view='home';go(v);}}).finally(()=>{leavingPresets=false;});return;
    }
    if(!settlingScene&&saveSession.hasWriter())completeFocusIfDue();
    if (activeFocus()?.phase === 'work' && v !== 'focus' && v !== 'novel') {
      setChatPanel('');
      view = 'focus';
      render();
      notify('专注期间已锁定，先结束本轮才能切换手机');
      return;
    }
    if (v !== view) {
      editingMessageId = null;
      editingMessageDraft = '';
      quotingMessage = null;
      showRevisionsDrawer = false;
      if (view === 'userprofile' && v !== 'userprofile') {
        resetUserAvatarDraft();
      }
      if (view === 'roleform' && v !== 'roleform' && v !== 'deleterole') {
        resetRoleAvatarDraft();
      }
      if (view === 'roleinfo' && v !== 'roleinfo') {
        resetStagedTerminalFrame();
      }
    }
    if (!role() && !['roleform', 'userprofile', 'deleterole'].includes(v)) {
      v = 'landing';
    }
    if(v!=='chat')setChatPanel('');
    if (
      !settlingScene && role() && saveSession.current() &&
      !['landing', 'roleform', 'userprofile', 'deleterole'].includes(v)
    ) {
      simulate(role()!);
      deliverPending(role());
    }
    view = v;
    if(persist&&saveSession.hasWriter())save();
    render(!preserveStage);
    if(!settlingScene&&role())resumeLocalSceneReplies(role()!);
    const diaryOwner=role();
    if(v==='diary'&&diaryOwner)void inspectDiaryRecovery(diaryOwner);
  }

  async function requestSceneCompletion(messages:{role:string;content:string}[],kind:'scene'|'play'|'intermission',sampling:Record<string,number>={},signal?:AbortSignal,owner?:{roleId:string;onDispatch:()=>void}):Promise<Response> {
    const settings={...data.settings},requestToken=token,url=settings.endpoint.trim().replace(/\/+$/,'');
    if(!/^https?:\/\//.test(url)||!settings.model.trim()||!requestToken.trim())throw new Error('请先在终端连接 API、选择模型并保存 Key；原消息保留');
    syslog('api',`请求 ${kind}`,{messages:messages.length,...(owner?{roleId:owner.roleId}:{})});
    return postModel(url+'/chat/completions',{method:'POST',signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+requestToken},body:JSON.stringify({model:settings.model,messages,stream:false,temperature:+settings.temperature,...sampling,...completionLimit(settings,kind)})},owner?.onDispatch);
  }

  async function generateNovelReply(r:RoleData,kind:NovelKind,input:string,regenerateId?:string,opening?:{scene:SceneData;batch?:ChatBatch}):Promise<void> {
    const world=data,connection=apiConnectionVersion,credential=token,batch=opening?.batch,scene=opening?.scene;
    const before=batch?sceneStateKey(r):null;
    const draft=batch?{...r,scene:scene!,events:r.events.slice()}:r;
    if(batch)entry(draft,'scene','你选择进入面对面',`地点：${scene!.where}`,scene!.startedAt,{source:scene!.id,knownBy:['user',r.id]});
    const epoch=modelPageEpoch;
    let attached=!batch,dispatched=false;
    let openingClaim:SceneData['opening'];
    const task=novelTasks.begin(draft,kind),userRevision=JSON.stringify([data.user,data.sharedTasks]);
    const valid=()=>data===world&&world.roles.includes(r)&&userRevision===JSON.stringify([world.user,world.sharedTasks])
      && (attached?novelTasks.valid(task,r,data.selected):view==='chat'&&!document.hidden&&chatBatchValid(r,batch!)&&sceneStateKey(r)===before&&novelTasks.valid(task,draft,data.selected))
      && (!opening||epoch===modelPageEpoch&&!modelPageHidden&&(dispatched||(saveSession.current()&&connection===apiConnectionVersion&&credential===token&&!!credential.trim()&&canUseRealModel(world.settings))))
      && (!scene||openingSourcesValid(attached?r:draft,scene));
    try{
      const regeneration=regenerateId?prepareNovelRegeneration(r,kind,regenerateId):undefined;
      if(regenerateId&&!regeneration)throw new Error('原回复不可重抽，记录已保留');
      const source=regeneration?.role||draft,at=regeneration?.targetAt??now(),selected:{value?:RequestPromptOptions;compiled?:ConversationCompilation}={};
      const messages=await compileRequest(r,kind,options=>{
        selected.value=options;
        const result=compileNovelConversation(data,source,kind,input,{...options,nowTs:at});
        if(options.presetId!=='native')try{novelSamplingParameters(options.preset);}catch(error){result.valid=false;result.status='blocked';result.diagnostics.push({code:'model-parameter-invalid',severity:'error',message:error instanceof Error?error.message:'预设采样参数无效'});}
        selected.compiled=result;return result;
      },valid);
      const options=selected.value;if(!options?.profile||!valid())throw new Error('场景来源已变化，未发送');
      const thirdParty=options.presetId!=='native';
      let prepared:Awaited<ReturnType<typeof prepareSceneReply>>|undefined;
      if(kind==='scene'&&!regenerateId&&!source.play&&selected.compiled){const context=buildNativeContext(data,source,'scene',input,{nowTs:at});prepared=await prepareSceneReply(source,data.user,createSceneObservation(source,context,buildNativeContext(data,source,'chat','',{nowTs:at}),identityContext(data,source)),selected.compiled,{requestId:task.id,now:at});}
      if(!valid())throw new Error('场景来源已变化，未发送');
      if(prepared)includeScenePromptTrace(r);
      const sampling=thirdParty?novelSamplingParameters(options.preset):{};
      if(batch&&scene){
        const timing=structuredClone(r.chatTiming),events=r.events,previous=r.scene;
        if(!completeChatBatch(r,batch))throw Error('本轮已经变化，未创建见面');
        r.scene=scene;r.events=draft.events;
        traceStorage('scene-save-started');
        if(!save()){r.scene=previous;r.events=events;r.chatTiming=timing;throw Error(saveError());}
        attached=true;
        traceStorage('scene-save-confirmed',{hasScene:true,result:'entered'});
        go('novel','scene',false,true);
      }
      if(scene?.opening){
        if(!valid())throw Error('连接或场景已变化，本次请求尚未发送');
        const prior=scene.opening;
        openingClaim={...prior,status:'unknown'};
        scene.opening=openingClaim;
        if(!save()){scene.opening=prior;throw Error(saveError());}
        // A crash after this receipt and before fetch is indistinguishable from an interrupted request.
        dispatched=true;
      }
      const wire=prepared?.messages||messages;
      const result=scene?.opening
        ?parseNovelResponse(parseChatResponse(await readModelBeforeDeadline(async signal=>readChatResponseBody(await requestSceneCompletion(wire,kind,sampling,signal)),task.controller.signal)),options.profile,thirdParty)
        :await readNovelResponse(await requestSceneCompletion(wire,kind,sampling,task.controller.signal),options.profile,thirdParty);
      if(!valid()||openingClaim&&scene?.opening!==openingClaim){
        if(scene&&data===world&&role()===r)offerUnstoredReply(result.text);
        throw new Error('场景或消息已变化，迟到回复未写入');
      }
      const lastInput=(kind==='scene'?encounterHistory(r,task.stage.messages):getActiveMessages(task.stage.messages)).filter(m=>m.speaker==='me').at(-1);
      const item:ChatMessage={id:uid(),speaker:'char',text:result.text,at:regeneration?regeneration.targetAt:now(),status:'active',replyTo:regeneration?regeneration.sourceId:lastInput?.id,kind,
        ...(thirdParty?{novelOutput:{presetId:options.presetId,mode:kind==='play'?'theatre' as const:'meeting' as const,memoryEligible:false as const,...result.auxiliary}}:{})};
      if(thirdParty&&result.sections&&item.novelOutput)item.novelOutput.document=bindNovelDocument(result.sections,{roleId:r.id,stageId:task.stage.id,messageId:item.id,mode:kind==='play'?'theatre':'meeting',revisionCount:item.revisionCount||0,createdAt:item.at,presetId:options.presetId,presetHash:options.preset.sha256});
      if(prepared&&result.sceneEvent)item.sceneReply={...prepared.ticket,payload:result.sceneEvent};
      commitNovelReply(r,task,item,()=>{
        if(scene?.opening)scene.opening.status='archived';
        if(save())return true;
        if(scene?.opening)scene.opening.status='unknown';
        offerUnstoredReply(result.text);
        return false;
      },regeneration||undefined,now());
      if(item.sceneReply)await applySavedSceneReply(r,item);
      syslog('api',`小说回复已保存 ${kind}`,{presetId:options.presetId});
      if(regenerateId)notify('已重新生成；原版本及修订记录保留');
    }finally{novelTasks.finish(task);}
  }

  function openingSourcesValid(r:RoleData,scene:SceneData):boolean {
    const originals=scene.messages.filter(m=>m.sourceMessageId);
    const effective=encounterHistory(r,scene.messages,now());
    return originals.length>0&&originals.every(m=>m.speaker==='me'&&effective.some(e=>e.id===m.id));
  }

  async function runMeetingOpening(r:RoleData,scene:SceneData,batch?:ChatBatch):Promise<void> {
    const world=data;
    busy=true;
    try{
      await generateNovelReply(r,'scene',encounterHistory({...r,scene},scene.messages,now()).filter(m=>m.sourceMessageId).at(-1)?.text||'',undefined,{scene,batch});
    }catch(error){
      if(data===world&&world.roles.includes(r)){
        const reason=error instanceof Error&&error.name!=='AbortError'?error.message:'请求已中断';
        if(batch&&r.chatTiming?.inFlight?.id===batch.id){failChatBatch(r,batch,'线下请求尚未发送。'+reason);save();}
        if(role()===r)notify(reason+(scene.opening?.status==='unknown'?'。请求结果未确认，可能已计费。':'。本次请求尚未发送。'));
      }
    }finally{
      if(data===world&&role()===r){
        busy=novelTasks.has(r.id);
        if(view==='chat'||view==='novel')render(false);
      }
    }
  }

  function runMeetingRound(r:RoleData,batch:ChatBatch):void {
    const at=now(),scene=createEncounter(r,null,at,uid());
    const eligible=phoneMessagesAt(r,at);
    if(!scene||!batch.entry||!batch.sources.every(source=>eligible.some(m=>m.id===source.id))){
      failChatBatch(r,batch,'当前消息来源无法确认，未发送线下请求。');save();return;
    }
    scene.messages[0].text=`${scene.where}。你选择转入线下，延续原话中的行动。`;
    scene.messages.push(...batch.sources.map(m=>({...m,id:`${scene.id}:phone:${m.id}`,sourceMessageId:m.id,kind:'scene' as const})));
    scene.opening={roundId:batch.roundId||batch.id,entry:batch.entry,status:'unsent'};
    void runMeetingOpening(r,scene,batch);
  }

  async function generateRoleFirstMessage(r: RoleData): Promise<void> {
    if (!token.trim()||r.chatTiming?.pending.length||r.chatTiming?.inFlight){notify('请先连接 API，或等待当前聊天批次完成。');return;}
    if (busy||activeChatRequests.has(r.id)||getActiveMessages(r.chats).some(m=>m.speaker==='char')) return;
    if (!canUseRealModel(data.settings)) {
      r.firstMessageState = {
        status: 'awaiting_api',
        updatedAt: now(),
      };
      save();
      render();
      notify('请先在「终端」将模式切换为自定义 API 并填写模型 ID');
      return;
    }
    busy = true;
    const controller=new AbortController(),revision=chatRevisionKey(r),scene=r.scene,play=r.play;
    activeChatRequests.set(r.id,controller);
    r.firstMessageState = {
      status: 'generating',
      updatedAt: now(),
    };
    save();
    render();
    try {
      const prompt=await compileRequest(r,'chat',options=>compileOpeningPrompt(data,r,now(),options),()=>data.roles.includes(r)&&chatRevisionKey(r)===revision&&r.scene===scene&&r.play===play);
      const personal=preparePersonalReply(r,prompt,now(),makeUid('opening-private'));
      const raw=splitPersonalReply(await requestPhoneReply(r,personal.messages,controller.signal,'first-message')),rawText=raw.text;
      if(!data.roles.includes(r)||chatRevisionKey(r)!==revision||r.scene!==scene||r.play!==play)throw new Error('聊天状态已变化，首条消息未写入');
      const bubbles = splitChatBubbles(rawText,r);
      if(!bubbles.length)throw new Error('模型未返回有效的手机消息');
      const chatsBefore=r.chats.length,eventsBefore=r.events.length,firstBefore=r.firstMessageState,privateBefore=r.personalThreads;
      const created=applyGeneratedFirstMessage(r, bubbles, now());
      if(raw.payload)applyPersonalReply(r,personal.ticket,raw.payload,now(),created);
      if(!save()){r.chats.length=chatsBefore;r.events.length=eventsBefore;r.firstMessageState=firstBefore;r.personalThreads=privateBefore;offerUnstoredReply(bubbles.join('\n'));throw new Error('首条消息已返回，保存未确认；重新发送可能再次计费');}
      syslog('role', `${r.name} 已生成首条开场消息`);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      r.firstMessageState = {
        status: 'failed',
        error: errMsg,
        updatedAt: now(),
      };
      syslog('error', `首条消息生成失败：${errMsg}`);
      notify('首条消息生成失败：' + errMsg);
      save();
    } finally {
      if(activeChatRequests.get(r.id)===controller){activeChatRequests.delete(r.id);chatTyping.delete(r.id);}
      busy = false;
      render();
    }
  }

  function safeRenderWhenNotTyping(): void {
    const activeEl = document.activeElement as HTMLElement | null;
    const intermissionTools = document.querySelector<HTMLDetailsElement>(
      'details.intermission-tools'
    );
    const deferFullRender = shouldDeferFullRenderOnTick({
      isComposing,
      activeTagName: activeEl?.tagName || '',
      activeElementId: activeEl?.id || '',
      chatPanelOpen: Boolean(chatPanel),
      editingMessageId,
      intermissionToolsOpen: Boolean(intermissionTools?.open),
    });
    if (!deferFullRender) {
      render(false);
    }
  }

  async function generateCharacterDiaryForDate(
    r:RoleData,dateKey:string,action:'auto'|'recover'|'replace'|'inspect'='auto'
  ):Promise<boolean> {
    const manualTrigger=action==='recover'||action==='replace';
    const world=data,epoch=modelPageEpoch;
    const owned=()=>data===world&&world.roles.includes(r)&&world.roles.filter(item=>item.id===r.id).length===1;
    const valid=()=>owned()&&!modelPageHidden&&saveSession.current()&&!hasCharacterDiaryForDate(r,dateKey);
    if(!owned()||!saveSession.current()){if(manualTrigger)notify('请求尚未发送。'+saveError());return false;}
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)||toLocalDateKey(getLocalDayBounds(dateKey).startMs)!==dateKey||dateKey>=toLocalDateKey(now())){if(manualTrigger)notify('这一天尚未结束，跨日后再归档。');return false;}
    if(hasCharacterDiaryForDate(r,dateKey)){if(manualTrigger)notify('这一天已有归档日记，原文保留。');return true;}
    syncRoleDiaryTasks(r,world.settings,now());
    const task=r.diaryTasks?.find(item=>item.dateKey===dateKey&&item.roleId===r.id);
    if(!task)return false;
    const status=(state:DiaryTaskStatus,message?:string)=>{
      if(!valid()||!r.diaryTasks?.includes(task))return false;
      if(task.status===state&&task.lastError===message)return true;
      const previous={...task};
      task.status=state;task.lastError=message;task.updatedAt=now();
      if(save())return true;
      restoreFields(task,previous);return false;
    };
    const copyResult=(text:string,sourcesChanged=false)=>{
      if(owned()&&role()===r)offerUnstoredReply(text,sourcesChanged);
    };
    let wireResult:string|undefined;
    try{
      if(typeof world.diaryWorldId!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(world.diaryWorldId)){
        if(action==='inspect')return false;
        if(!token.trim()||!canUseRealModel(world.settings)){if(manualTrigger)notify('请先在终端配置 API。');return false;}
        const previous=world.diaryWorldId;
        world.diaryWorldId=crypto.randomUUID();
        if(!save()){world.diaryWorldId=previous;return false;}
      }
      const key=diaryRequestKey(world.diaryWorldId,r.id,dateKey);
      let receipt=await readDiaryReceipt(key);
      if(!valid())return false;
      const recovering=receipt?.state==='ready'&&action!=='replace';
      if(action==='inspect'&&(!recovering||!task.requestAttempt||task.requestAttempt!==receipt?.attempt))return false;
      if(action==='recover'&&['ready','stale'].includes(task.status)&&!recovering){
        notify('未找到可恢复的正文，本次未发送请求。');
        return false;
      }
      if(action==='recover'&&task.status==='stale'&&receipt?.result){
        copyResult(receipt.result.text,true);
        return false;
      }
      // Old archives can contain a generating marker without a receipt. Treat it as possibly billed.
      const legacyRisk=!receipt&&(task.attempts>0||!!task.requestAttempt||task.status==='uncertain');
      if(action==='auto'&&!recovering&&(receipt||legacyRisk)){
        if(receipt?.state==='claimed'&&!receipt.priorDispatch)return status('claimed','已确认尚未发送，可以手动重新领取。');
        return status('uncertain','此前请求可能已经计费，自动补写不会重复发送。');
      }
      if(!recovering&&(!token.trim()||!canUseRealModel(world.settings))){
        if(manualTrigger)notify('请先在终端配置 API。');
        return false;
      }
      const feeRisk=legacyRisk||!!receipt&&(receipt.state!=='claimed'||!!receipt.priorDispatch);
      if(!recovering&&feeRisk&&!window.confirm('此日期的日记此前可能已经计费。再次生成可能产生第二次费用。'+
        (receipt?.state==='ready'?'这会替换目前保留的未归档正文。':'')+'确定继续？'))return false;
      const {messages,facts,personal}=buildCharacterDiaryPrompt(r,world.user,dateKey);
      const snapshot=JSON.stringify([world.user,facts]);
      const sourcesMatch=()=>snapshot===JSON.stringify([world.user,collectDailyDiaryFacts(r,dateKey,true)])&&personalTicketValid(r,personal);
      const sourceHash=await diarySourceHash(JSON.stringify([snapshot,{...personal,id:''}]));
      if(!valid()||!recovering&&(epoch!==modelPageEpoch||!sourcesMatch()))return false;
      if(!recovering){
        const claim:DiaryReceipt={attempt:crypto.randomUUID(),state:'claimed',priorDispatch:feeRisk};
        await replaceDiaryReceipt(key,receipt,claim);
        if(!valid()||!sourcesMatch())return false;
        const previous={...task};
        task.status='claimed';task.attempts=(Number.isSafeInteger(task.attempts)?task.attempts:0)+1;
        task.requestAttempt=claim.attempt;task.lastError=undefined;task.updatedAt=now();
        if(!save()){restoreFields(task,previous);return false;}
        if(!token.trim()||!canUseRealModel(world.settings))return false;
        const settings=world.settings,credential=token;
        const sent:DiaryReceipt={...claim,state:'sent'};
        await replaceDiaryReceipt(key,claim,sent);
        // This marker is durable before fetch. A crash in the remaining gap is treated as potentially billed.
        if(!valid()||epoch!==modelPageEpoch||!sourcesMatch()||world.settings!==settings||token!==credential){
          await replaceDiaryReceipt(key,sent,claim);
          return false;
        }
        let text:string,payload:string|undefined;
        task.status='generating';
        syslog('diary',`请求生成角色每日日记 · ${r.name} · ${dateKey}`,{model:settings.model,dateKey,chatCount:facts.summary.chatCount,sceneCount:facts.summary.sceneCount});
        try{
          const pending=readModelBeforeDeadline(async signal=>readChatResponseBody(await postModel(settings.endpoint.trim().replace(/\/+$/,'')+'/chat/completions',{
            method:'POST',signal,
            headers:{'Content-Type':'application/json',...(credential?{Authorization:'Bearer '+credential}:{})},
            body:JSON.stringify({model:settings.model,messages,temperature:+settings.temperature||0.8,...completionLimit(settings,'diary')}),
          })),undefined,true);
          safeRenderWhenNotTyping();
          const result=splitPersonalReply(parseChatResponse(await pending));
          text=cleanGeneratedDiaryText(result.text);payload=result.payload;
          if(!text)throw Error('empty diary');
        }catch(error){
          // An unloading document must leave the dispatched receipt intact for the next writer.
          if(!(modelPageHidden&&error instanceof Error&&error.name==='AbortError')){
            await replaceDiaryReceipt(key,sent,{...sent,state:'failed'});
          }
          const message='请求结果未确认，可能已计费。再次生成需手动确认。';
          if(!status('uncertain',message)&&owned()&&r.diaryTasks?.includes(task)&&
            task.requestAttempt===sent.attempt&&task.status==='generating'){
            // The receipt is durable even if pagehide released the main-store writer.
            task.status='uncertain';task.lastError=message;
          }
          if(manualTrigger&&owned())notify('日记请求结果未确认，可能已计费。');
          return false;
        }
        wireResult=text;
        receipt={...sent,state:'ready',result:{text,payload,sourceHash,requestId:personal.id}};
        await replaceDiaryReceipt(key,sent,receipt);
      }
      if(!receipt?.result)return false;
      const result=receipt.result;
      const sourcesChanged=!sourcesMatch()||result.sourceHash!==sourceHash||
        Boolean(recovering?task.requestAttempt&&task.requestAttempt!==receipt.attempt:task.requestAttempt!==receipt.attempt);
      if(!valid()||sourcesChanged){
        if(sourcesChanged)status('stale','正文基于已变化的来源或任务，仅供复制，不能归档。');
        if(wireResult&&owned()&&r.diaryTasks?.includes(task)&&task.requestAttempt===receipt.attempt&&task.status==='generating'){
          task.status=sourcesChanged?'stale':'ready';
          task.lastError=sourcesChanged?'正文基于已变化的来源，仅供复制。':'正文已保留，可以保存已有结果。';
        }
        if(manualTrigger||wireResult)copyResult(result.text,sourcesChanged);
        if(owned())notify('日记正文已保留，存档或资料已变化，未归档。');
        return false;
      }
      if(recovering&&!manualTrigger){
        status('ready','正文已生成，可以直接保存已有结果。自动补写已暂停。');
        return false;
      }
      const before={diaries:structuredClone(r.diaries),diaryTasks:structuredClone(r.diaryTasks),diaryDay:r.diaryDay,personalThreads:r.personalThreads};
      const applied=applyGeneratedCharacterDiary(r,dateKey,result.text,now());
      if(!applied.ok)return false;
      const ticket={...personal,id:result.requestId};
      if(applied.diary)applied.diary.continuitySources=ticket.sources;
      if(result.payload&&applied.diary)applyPersonalReply(r,ticket,result.payload,facts.endMs,[applied.diary]);
      if(!saveLogged('diary',`已归档 ${r.name} 的每日日记 (${dateKey}) · ${applied.diary?.wordCount||0} 字`,{dateKey,diaryId:applied.diary?.id,wordCount:applied.diary?.wordCount})){
        Object.assign(r,before);
        const pending=r.diaryTasks?.find(item=>item.dateKey===dateKey);
        if(pending){pending.status='ready';pending.lastError='正文已生成，主档保存失败。可直接恢复已有结果。';}
        copyResult(result.text);
        return false;
      }
      if(manualTrigger&&owned())notify(`已生成并归档 ${r.name} 在 ${dateKey} 的私人日记`);
      wireResult=undefined;
      await replaceDiaryReceipt(key,receipt,{attempt:receipt.attempt,state:'archived'});
      return true;
    }catch{
      if(wireResult)copyResult(wireResult);
      if(owned()){
        if(task.status==='generating'){task.status='uncertain';task.lastError='结果未能确认。请核对费用及本地状态。';}
        notify('日记任务记录无法确认，自动补写已暂停。');
      }
      return false;
    }
  }

  async function inspectDiaryRecovery(r:RoleData,onlyUncertain=false):Promise<boolean> {
    const world=data;
    let changed=false;
    for(const task of r.diaryTasks||[]){
      if(!saveSession.current()||data!==world||!world.roles.includes(r))break;
      if(task.requestAttempt&&(task.status==='uncertain'||!onlyUncertain&&['claimed','generating','ready'].includes(task.status))){
        const {status,lastError}=task;
        await generateCharacterDiaryForDate(r,task.dateKey,'inspect');
        changed ||= task.status!==status||task.lastError!==lastError;
      }
    }
    if(changed&&view==='diary'&&role()===r)safeRenderWhenNotTyping();
    return changed;
  }

  async function processDiaryQueue(): Promise<void> {
    if(diaryQueueBusy||lifeBusy||modelPageHidden||!saveSession.current())return;
    const epoch=modelPageEpoch;
    for (const roleItem of data.roles) {
      syncRoleDiaryTasks(roleItem, data.settings, now());
    }
    if (!token.trim()||!canUseRealModel(data.settings)) {
      save();
      return;
    }
    diaryQueueBusy = true;
    try {
      // A saved IDB result can outlive a failed main-store status update.
      for(const r of data.roles){
        if(r.diaryTasks?.some(t=>t.status==='uncertain'&&t.requestAttempt)&&await inspectDiaryRecovery(r,true))return;
      }
      let guard = 0;
      while (guard < 25) {
        guard++;
        if(epoch!==modelPageEpoch||!canUseRealModel(data.settings)||!saveSession.current())break;
        const orderedRoles = [
          ...(role() ? [role()!] : []),
          ...data.roles.filter((x) => x.id !== role()?.id),
        ];
        const candidates=orderedRoles.flatMap(r=>(r.diaryTasks||[])
          .filter(t=>(t.status==='pending'||t.status==='ready'||t.status==='claimed'&&!t.lastError)&&!hasCharacterDiaryForDate(r,t.dateKey))
          .map(task=>({r,task})));
        // Check unresolved writes before dispatching a different date or role.
        const next=candidates.find(({task})=>task.status!=='pending')||candidates[0];
        if(!next||!await generateCharacterDiaryForDate(next.r,next.task.dateKey))break;
      }
    } finally {
      diaryQueueBusy = false;
      safeRenderWhenNotTyping();
    }
  }

  async function triggerDiaryTaskForRole(
    r: RoleData,
    dateKey: string,replaceResult=false
  ): Promise<void> {
    if (diaryQueueBusy) {
      notify('日记队列正在生成中，请稍候');
      return;
    }
    diaryQueueBusy = true;
    try {
      await generateCharacterDiaryForDate(r,dateKey,replaceResult?'replace':'recover');
    } finally {
      diaryQueueBusy = false;
      safeRenderWhenNotTyping();
    }
  }

  function demoReply(
    r: RoleData,
    kind: 'chat' | 'scene' | 'play',
    input: string
  ): string {
    const a = activity(r, now());
    if (kind === 'play') {
      return `车窗外的雨声渐渐密了。${r.name}看了你一眼，像是在衡量该不该回答。\n\n“${
        input.includes('信')
          ? '那封信也许没有你想的那么简单。'
          : '如果你真的想知道，我可以告诉你一部分。'
      }”`;
    }
    if (kind === 'scene') {
      return `${r.name}放下手里的东西，认真听完你的话。\n\n“${
        input.includes('今天')
          ? '今天确实发生了不少事。'
          : '你这么说，我倒是想起了刚才路上碰到的一件小事。'
      }”\n\n窗外有人经过，谈话却没有急着结束。`;
    }
    const activeChats = getActiveMessages(r.chats);
    const recent = activeChats.filter((m) => m.speaker === 'me').length;
    const low = input.toLowerCase();
    const isLaconic = /话少|寡言|惜字如金|简短|冷淡/.test(
      `${r.traits || ''} ${r.profile || ''}`
    );
    if (isLaconic) {
      if (/见面|一起|咖啡|出来/.test(low)) {
        return `可以。等到了告诉我。`;
      }
      if (/工作|忙|做什么|在哪/.test(low)) {
        return `在${a.where}，${a.doing}。`;
      }
      return [
        `嗯，我看到了。`,
        `我明白你的意思。\n等忙完手头的事再细说。`,
        `不一定，得看具体情况。`,
      ][recent % 3];
    }
    if (/见面|一起|咖啡|出来/.test(low)) {
      return r.demoSample
        ? '咖啡馆？可别又打算用一枚骰子替我决定人生，妈咪。\n说说看，这次你想约哪一家？'
        : `可以啊，我大概${
            new Date(now()).getHours() < 18 ? '傍晚' : '明天'
          }有空。\n等你到了跟我说一声。`;
    }
    if (/记得|上次|之前|忘|日记/.test(low)) {
      const hits = retrieve(r, input, 3).filter((x) => x.kind !== 'life');
      return hits.length
        ? `我记得一点——${hits.at(-1)!.title}：${hits
            .at(-1)!
            .detail.slice(0, 60)}。\n不过我们当时对这事的理解可能不太一样，你怎么突然提起这个？`
        : '我现在翻不到对应的记录，不想随便编一个糊弄你。\n你再提醒我一点细节？';
    }
    if (/工作|忙|做什么|在哪/.test(low)) {
      return `我现在在${a.where}，${a.doing}。\n倒也不是不能回消息，只是手头正好有一点事，你直说就行。`;
    }
    if (/戏剧|剧本|演戏/.test(low)) {
      return '你又想到什么新剧本了？\n我愿意陪你演，不过如果你给我安排一个太离谱的人设，我可是会在幕间吐槽的。';
    }
    return [
      `刚刚想了一下你说的“${input.slice(0, 14)}${
        input.length > 14 ? '…' : ''
      }”。\n我好像能理解你的意思，不过我也有另一种想法。`,
      `嗯，这个我得稍微想一想。\n对了，我现在还在${a.where}，刚才旁边有件小事让我分了下神。\n你那边今天忙不忙？`,
      `你说到这个，我突然想起今天路上碰到的事。\n手机上两句说不清，我们下次见面可以慢慢聊。`,
      `也不一定吧？我觉得得看当时具体发生了什么。`,
    ][recent % 4];
  }

  function mediaNote(item: Partial<ChatMessage>): string {
    if (item.kind === 'sticker') {
      return item.caption
        ? `[发送自定义表情包：${item.caption}]`
        : `[发送表情包：${legacyStickerNames[item.sticker || ''] || '贴纸'}]`;
    }
    if (item.kind === 'packet') {
      return `[发送虚拟红包：¥${Number(item.amount).toFixed(2)}；祝福语：${
        item.wish
      }。这是故事中的虚拟互动，不是真实货币。]`;
    }
    if (item.kind === 'photo') {
      return `[发送照片${
        item.caption
          ? '，用户的文字说明：' + item.caption
          : '。当前模型无法识别图片画面，不应假装看到了'
      }]`;
    }
    if (item.kind === 'voice') {
      return `[发送语音消息${item.seconds ? '，' + item.seconds + '秒' : ''}${
        item.caption
          ? '，用户提供的文字内容：' + item.caption
          : '。当前模型无法识别语音，不应假装听懂了'
      }]`;
    }
    return item.text || '';
  }

  function sendRichMessage(partial:Partial<ChatMessage>,r=role(),updateComposer=true):boolean {
    if(!r||!data.roles.includes(r))return false;
    const item:ChatMessage={...partial,id:uid(),at:now(),speaker:'me',text:mediaNote(partial),status:'active',quote:partial.quote===undefined?(role()?.id===r.id?quotingMessage:null):partial.quote};
    if(!acceptPhoneMessage(r,item,updateComposer))return false;
    if(view==='chat'&&role()===r){
      if(updateComposer){setChatPanel('');render(false);}
      else patchDynamicRegionsOnTick();
    }
    return true;
  }

  async function sendFileAttachment(
    file: File | undefined,
    kind: 'photo' | 'sticker' | 'voice',
    caption = ''
  ): Promise<void> {
    const owner=role(),quote=quotingMessage,composerOperation=voiceOperation;
    if (!file||!owner) return;
    const allowed =
      kind === 'voice'
        ? file.type.startsWith('audio/')
        : ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(
            file.type
          );
    if (!allowed) {
      notify('不支持此文件格式');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      notify('附件不能超过 8MB');
      return;
    }
    const id = uid();
    try {
      await mediaPut(id, file);
      sendRichMessage({
        kind,
        mediaId: id,
        caption: caption.trim().slice(0, 800),
        seconds: 0,quote,
      },owner,voiceOperation===composerOperation);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      notify('文件保存失败：' + msg);
    }
  }

  function voiceOwnerCurrent(op:VoiceOperation):boolean {
    return data===op.world&&data.roles.includes(op.owner);
  }

  function releaseVoiceStream(op:VoiceOperation):void {
    const stream=op.stream;
    op.stream=undefined;
    stream?.getTracks().forEach(track=>track.stop());
  }

  function clearVoiceOperation(op:VoiceOperation):void {
    op.phase='done';
    clearTimeout(op.stopTimer);
    voiceFinishing.delete(op);
    if(voiceOperation===op)voiceOperation=null;
    if(op.recorder){op.recorder.ondataavailable=null;op.recorder.onstop=null;op.recorder.onerror=null;}
    op.recorder=undefined;
  }

  function cancelVoiceOperation(op:VoiceOperation):void {
    const recorder=op.recorder;
    clearVoiceOperation(op);
    try{if(recorder&&recorder.state!=='inactive')recorder.stop();}
    catch{/* The device still needs to be released if stop fails. */}
    finally{releaseVoiceStream(op);}
  }

  function leaveVoicePanel():void {
    const op=voiceOperation;
    voiceOperation=null;
    if(op&&(op.phase==='waiting'||op.phase==='recording'))cancelVoiceOperation(op);
  }

  function setChatPanel(next:string):void {
    if(next!=='voice')leaveVoicePanel();
    chatPanel=next;
  }

  function voicePanelCurrent(op:VoiceOperation):boolean {
    return voiceOwnerCurrent(op)&&!voicePageHidden&&!document.hidden&&role()===op.owner&&view==='chat'&&chatPanel==='voice';
  }

  function renderVoiceResult(op:VoiceOperation):void {
    if(voicePanelCurrent(op)&&(!voiceOperation||voiceOperation===op))render(false);
  }

  function retainVoice(op:VoiceOperation,blob:Blob|null):void {
    if(!voiceOwnerCurrent(op)||op.recoveryOffered)return;
    const recovery=voiceRecoveries.get(op.owner)||new Map<number,{world:AppData;blob:Blob|null}>();
    recovery.set(op.id,{world:op.world,blob});
    voiceRecoveries.set(op.owner,recovery);
    if(blob)op.recoveryOffered=true;
  }

  function suspendVoiceOperations(retainEnding:boolean):void {
    leaveVoicePanel();
    for(const [op,blob] of voiceFinishing){
      op.recoveryOnly=true;
      releaseVoiceStream(op);
      if(retainEnding)retainVoice(op,blob);
    }
  }

  async function persistRecording(op:VoiceOperation,blob:Blob):Promise<void> {
    const canWrite=()=>!op.recoveryOnly&&!voicePageHidden&&voiceOwnerCurrent(op)&&saveSession.current();
    let sent=false,updateComposer=false;
    try{
      if(!canWrite())return;
      const mediaId=uid();
      await mediaPut(mediaId,blob);
      if(!canWrite())return;
      updateComposer=voiceOperation===op&&voicePanelCurrent(op)&&quotingMessage===op.quote;
      sent=sendRichMessage({kind:'voice',mediaId,seconds:op.seconds,caption:op.caption,quote:op.quote},op.owner,updateComposer);
    }catch{
      // The Blob remains available when media storage or the main save cannot be confirmed.
    }finally{
      if(!sent)retainVoice(op,blob);
      clearVoiceOperation(op);
      if(!sent||!updateComposer)renderVoiceResult(op);
    }
  }

  async function beginRecording():Promise<void> {
    const owner=role();
    if(!owner||voiceOperation||view!=='chat'||chatPanel!=='voice'||voicePageHidden||document.hidden)return;
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){
      notify('浏览器不支持直接录音；请使用「选择音频文件」');return;
    }
    const op:VoiceOperation={id:++voiceSequence,world:data,owner,phase:'waiting',recoveryOnly:false,startedAt:0,seconds:0,caption:'',quote:null};
    voiceOperation=op;
    render(false);
    try{
      op.stream=await navigator.mediaDevices.getUserMedia({audio:true});
      if(voiceOperation!==op||!voicePanelCurrent(op)){cancelVoiceOperation(op);return;}
      const type=['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg'].find(t=>MediaRecorder.isTypeSupported(t));
      const recorder=op.recorder=new MediaRecorder(op.stream,type?{mimeType:type}:{});
      const chunks:Blob[]=[];
      let size=0;
      const fail=(message:string)=>{
        const visible=voiceOperation===op&&voicePanelCurrent(op);
        cancelVoiceOperation(op);
        if(visible){render(false);notify(message);}
      };
      recorder.ondataavailable=event=>{
        if(op.phase!=='recording'&&op.phase!=='finishing'||!event.data?.size)return;
        size+=event.data.size;
        if(size>voiceLimit){fail('语音超过 8MB，未发送');return;}
        chunks.push(event.data);
      };
      recorder.onerror=()=>fail('录音过程中发生错误，未发送');
      recorder.onstop=()=>{
        if(op.phase!=='finishing'){fail('录音已中断，未发送');return;}
        clearTimeout(op.stopTimer);
        releaseVoiceStream(op);
        if(!size){
          voiceRecoveries.get(op.owner)?.delete(op.id);
          fail('录音为空，未发送');return;
        }
        op.phase='saving';
        recorder.onstop=null;recorder.ondataavailable=null;recorder.onerror=null;
        const blob=new Blob(chunks,{type:recorder.mimeType||chunks[0].type||'audio/webm'});
        voiceFinishing.set(op,blob);
        void persistRecording(op,blob);
      };
      op.phase='recording';op.startedAt=now();
      recorder.start(300);
      render(false);
    }catch{
      const visible=voiceOperation===op&&voicePanelCurrent(op);
      cancelVoiceOperation(op);
      if(visible){render(false);notify('无法开始录音：请允许麦克风权限，或上传音频文件。');}
    }
  }

  function stopRecording(cancel=false):void {
    const op=voiceOperation;
    if(!op)return;
    if(cancel&&(op.phase==='waiting'||op.phase==='recording')){
      cancelVoiceOperation(op);render(false);return;
    }
    if(cancel||op.phase!=='recording'||!op.recorder||!voicePanelCurrent(op))return;
    op.phase='finishing';
    op.seconds=Math.max(0,Math.round((now()-op.startedAt)/1000));
    op.caption=($<HTMLInputElement>('#voice-caption')?.value||'').trim();
    op.quote=quotingMessage;
    voiceFinishing.set(op,null);
    op.stopTimer=setTimeout(()=>{
      op.recoveryOnly=true;
      releaseVoiceStream(op);
      voiceFinishing.delete(op);
      retainVoice(op,null);
      if(voiceOperation===op)voiceOperation=null;
      renderVoiceResult(op);
    },5000);
    try{op.recorder.stop();render(false);}
    catch{cancelVoiceOperation(op);render(false);notify('无法确认录音结尾，未发送。');}
  }

  async function submitText(draft:DraftBinding,text:string):Promise<void> {
    const {mode:kind,owner:r,stage:p}=draft;
    if(kind==='intermission')return;
    if(kind==='chat'){
      const item:ChatMessage={id:uid(),speaker:'me',text:text.trim(),at:now(),kind:'chat',status:'active',quote:quotingMessage||null};
      if(acceptPhoneMessage(r,item)){
        clearSubmittedDraft(draft);
        render(false);
      }
      return;
    }
    if(!p)return;
    const scene=kind==='scene'?p as SceneData:null,legacyDraft=scene?.draft;
    const events=r.events.length,at=now(),useKind=kind;
    const obj:ChatMessage={id:uid(),speaker:'me',text:text.trim(),at,kind,status:'active',quote:quotingMessage||null};
    busy=true;quotingMessage=null;
    p.messages.push(obj);
    entry(r,kind==='play'?'drama':'scene',kind==='play'?'你在戏里说过':'你在见面时说过',obj.text,at,{source:p.id,messageId:obj.id,speaker:'me',knownBy:['user',r.id]});
    if(scene)delete scene.draft;
    if(!saveLogged('chat',`${useKind} 用户消息已提交`,{source:obj.id})){
      p.messages.pop();r.events.length=events;quotingMessage=obj.quote||null;
      if(scene&&legacyDraft!==undefined)scene.draft=legacyDraft;
      busy=false;render(false);return;
    }
    clearSubmittedDraft(draft);
    render();
    if(awaitingNainOpening(r)&&!canUseRealModel(data.settings)){busy=false;render(false);notify('你的消息已保存；连接 API 后才能生成角色首条回复。');return;}
    const submittedStage=useKind==='scene'?r.scene:r.play;
    try {
      if(data.settings.mode==='api')await generateNovelReply(r,useKind,obj.text);
      else {
        const p=useKind==='play'?r.play:r.scene;if(!p)throw new Error('当前场景已关闭');
        const item:ChatMessage={id:uid(),speaker:'char',text:demoReply(r,useKind,obj.text),at:now(),replyTo:obj.id,status:'active'};
        p.messages.push(item);entry(r,useKind==='play'?'drama':'scene',`${r.name}的回复`,item.text,item.at,{source:p.id,messageId:item.id,speaker:'char',knownBy:['user',r.id]});save();
      }
      if(useKind==='scene'&&isFarewell(obj.text)&&role()===r&&r.scene===submittedStage)endNovel('scene',view==='novel'&&novelViewKind==='scene');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      syslog('error', `生成失败：${msg}`);
      notify('生成失败：' + msg + '。你的输入已保存，可继续发送。');
    } finally {
      busy = novelTasks.has(data.selected||'');
      if(view==='novel'&&role()?.id===r.id)render();
      else if(view==='chat'&&role()?.id===r.id)patchDynamicRegionsOnTick();
    }
  }

  async function regeneratePhoneReply(r:RoleData,id:string):Promise<void> {
    if(activeChatRequests.has(r.id)||r.chatTiming?.inFlight||r.chatTiming?.pending.length){notify('请等待当前消息批次回复完成后再重抽。');return;}
    if(!token.trim()||!canUseRealModel(data.settings)){notify('请先连接 API，原回复已保留。');return;}
    const regenerated:{plan:ReturnType<typeof buildPhoneRegeneration>}={plan:null};
    const controller=new AbortController(),revision=chatRevisionKey(r),scene=r.scene,play=r.play;
    activeChatRequests.set(r.id,controller);
    if(view==='chat'&&role()?.id===r.id)patchDynamicRegionsOnTick();
    try{
      const promptMessages=await compileRequest(r,'chat',options=>{regenerated.plan=buildPhoneRegeneration(data,r,id,now(),options);if(!regenerated.plan)throw new Error('有效来源不完整，原记录已保留');return regenerated.plan.compilation;},()=>data.roles.includes(r)&&chatRevisionKey(r)===revision&&r.scene===scene&&r.play===play);
      const plan=regenerated.plan;if(!plan)throw new Error('有效来源不完整');
      const text=splitPersonalReply(await requestPhoneReply(r,promptMessages,controller.signal)).text;
      if(!data.roles.includes(r)||chatRevisionKey(r)!==revision||r.scene!==scene||r.play!==play||!getActiveMessages(r.chats).some(m=>m.id===id))return;
      const bubbles=splitChatBubbles(text,r);
      if(!bubbles.length)throw new Error('回复中没有有效的手机消息');
      const before={chats:structuredClone(r.chats),events:structuredClone(r.events),messageRevisions:structuredClone(r.messageRevisions),pendingReplies:structuredClone(r.pendingReplies),firstMessageState:structuredClone(r.firstMessageState)};
      const sceneBefore=r.scene?structuredClone({where:r.scene.where,agreement:r.scene.agreement,locationEvidence:r.scene.locationEvidence}):null;
      const insertAt=Math.max(...plan.targetIds.map(target=>r.chats.findIndex(m=>m.id===target)))+1;
      if(!prepareRegenerateReply(r,'chat',id,now()).ok)return;
      const turnId=makeUid('turn'),messages=bubbles.map((bubble,i):ChatMessage=>({id:uid(),speaker:'char',kind:'chat',text:bubble,at:plan.targetAt+i,status:'active',replyTurnId:turnId,replyTo:plan.sourceIds.at(-1),replySourceIds:plan.sourceIds}));
      r.chats.splice(insertAt,0,...messages);
      for(const item of messages)eMemory(r,item.text,'char','chat',item.at,item.id);
      r.firstMessageState={status:'ready',updatedAt:now()};
      if(!save()){Object.assign(r,before);if(r.scene&&sceneBefore){r.scene.where=sceneBefore.where;if(sceneBefore.agreement)r.scene.agreement=sceneBefore.agreement;else delete r.scene.agreement;if(sceneBefore.locationEvidence)r.scene.locationEvidence=sceneBefore.locationEvidence;else delete r.scene.locationEvidence;}throw new Error('重抽回复未能保存，原回复已保留');}
    }catch(error){notify('重抽未完成：'+(error instanceof Error&&error.name!=='AbortError'?error.message:'来源已变化或请求已中断'));}
    finally{
      if(activeChatRequests.get(r.id)===controller){activeChatRequests.delete(r.id);chatTyping.delete(r.id);}
      if(view==='chat'&&role()?.id===r.id)patchDynamicRegionsOnTick();
    }
  }

  async function regenerateMessageReply(
    scope: RevisionScope,
    charMessageId: string
  ): Promise<void> {
    const r = role();
    if (!r) return;
    if(scope==='chat'){
      await regeneratePhoneReply(r,charMessageId);return;
    }
    if(busy)return;
    if(data.settings.mode!=='api'){notify('请先连接 API；原回复已保留。');return;}
    busy=true;render(false);
    try{await generateNovelReply(r,scope,'',charMessageId);}
    catch(error){notify('重抽未完成：'+(error instanceof Error?error.message:'连接异常'));}
    finally{busy=novelTasks.has(data.selected||'');if(view==='novel'&&role()===r)render(false);}
  }

  function editMeetingPlace(): void {
    const owner=role(),scene=owner?.scene;
    if(!owner||!scene||scene.endedAt!==undefined)return;
    const expectedWhere=scene.where,dialog=document.createElement('dialog');
    dialog.className='home-task-dialog';dialog.setAttribute('aria-labelledby','meeting-place-title');
    dialog.innerHTML=`<div class="home-task-dialog-head"><h2 id="meeting-place-title">修改见面地点</h2><button type="button" data-place-close aria-label="关闭">×</button></div><form><label>当前实际地点<input class="field" name="where" value="${esc(scene.where)}" maxlength="120" required autocomplete="off"></label><p class="sub">不改写已有对白、小说正文或原始约定。</p><p class="home-task-error" data-place-error role="alert"></p><div class="home-task-dialog-actions"><button type="button" class="btn secondary" data-place-close>取消</button><button class="btn" type="submit">保存地点</button></div></form>`;
    dialog.addEventListener('close',()=>dialog.remove());
    dialog.addEventListener('click',event=>{if((event.target as Element).closest('[data-place-close]'))dialog.close();});
    dialog.addEventListener('submit',event=>{
      event.preventDefault();const form=dialog.querySelector('form')!;if(!form.reportValidity())return;
      try{
        if(role()!==owner||!data.roles.includes(owner))throw new Error('当前角色已变化，未保存地点');
        const changed=updateEncounterLocation(owner,scene,expectedWhere,String(new FormData(form).get('where')||''),now(),save);
        if(changed&&novelTasks.cancel(owner.id,'scene'))busy=false;
        dialog.close();
        if(view==='novel'&&novelViewKind==='scene')render(false);
        notify(changed?'见面地点已保存':'地点未改变');
      }catch(error){dialog.querySelector<HTMLElement>('[data-place-error]')!.textContent=error instanceof Error?error.message:'保存失败，原地点已保留';}
    });
    document.body.append(dialog);dialog.showModal();dialog.querySelector<HTMLInputElement>('[name=where]')?.focus({preventScroll:true});
  }

  function meet(): void {
    const r = role();
    if (!r) return;
    if (ongoing(r)) {
      go('novel',r.scene?'scene':'play');
      return;
    }
    if(!checkWriteAccess())return;
    if(activeChatRequests.has(r.id)||r.chatTiming?.inFlight||r.pendingReplies?.length||busy){
      notify('请等正在处理的回复完成后再见面。');return;
    }
    if(r.chatTiming?.pending.length){
      if(!token.trim()||!canUseRealModel(data.settings)){notify('请先在终端连接 API。本轮消息仍保留，未发送请求。');return;}
      const before=structuredClone(r.chatTiming);
      const batch=claimChatBatch(r,now(),true,true);
      if(!batch){notify('本轮已有未确认的回复，请先处理该轮再见面。');return;}
      if(!save()){r.chatTiming=before;return;}
      runMeetingRound(r,batch);
      return;
    }
    const scene=createEncounter(r,null,now(),uid());if(!scene)return;
    const eventsBefore=r.events.length;
    r.scene=scene;
    entry(r,'scene','你们开始见面',`地点：${scene.where}`,now(),{source:scene.id,knownBy:['user',r.id]});
    if(!save()){r.scene=null;r.events.length=eventsBefore;return;}
    go('novel','scene',false);
  }

  function endNovel(kind:NovelKind=novelViewKind,returnToChat=true): void {
    const r = role();
    if(r&&novelTasks.cancel(r.id))busy=false;
    if (!r) return;
    if (kind==='play'&&r.play) {
      const p = r.play;
      const {endedAt}=p,plays=r.plays.length,events=r.events.length,chats=r.chats.length;
      p.endedAt = now();
      r.plays.push(p);
      const activePlayMsgs = getActiveMessages(p.messages);
      entry(
        r,
        'drama',
        `一起演过《${p.title}》`,
        `戏剧设定：${p.world}；双方的戏内设定：你是${p.user}，${
          r.name
        }是${p.char}。剧中主要对白：${activePlayMsgs
          .filter((m) => m.speaker !== 'note')
          .slice(-8)
          .map(
            (m) =>
              (m.speaker === 'me' ? '用户' : '角色') +
              '：' +
              m.text.slice(0, 140)
          )
          .join(' / ')}。幕间讨论：${(p.intermissionMessages || [])
          .filter((m) => m.speaker !== 'note')
          .slice(-8)
          .map(
            (m) =>
              (m.speaker === 'me' ? '用户' : '戏外角色') +
              '：' +
              m.text.slice(0, 130)
          )
          .join(' / ')}。注意：戏剧内容不等于日常发生的事实。`,
        now(),
        { source: p.id }
      );
      const afterMsgId = uid();
      if(!(awaitingNainOpening(r)))r.chats.push({
        id: afterMsgId,
        speaker: 'char',
        text: `刚演完《${p.title}》，我还在想你为什么给我安排“${p.char.slice(
          0,
          26
        )}”这种设定。挺有意思的。`,
        at: now(),
        kind: 'chat',
        status: 'active',
      });
      r.play = null;
      if(!save()){
        p.endedAt=endedAt;
        r.play=p;
        r.plays.length=plays;
        r.events.length=events;
        r.chats.length=chats;
        return;
      }
      const performance=draftScope(r,'play',p),backstage=draftScope(r,'intermission',p);
      intermissionOperations.get(p)?.abort();
      intermissionRecovery.delete(p);
      clearDrafts(scope=>scope===performance||scope===backstage);
    } else if (kind==='scene'&&r.scene) {
      try{archiveScene(r);}catch(error){notify(error instanceof Error?error.message:'见面未能归档，现场已保留');return;}
      if(returnToChat)go('chat');
      else if(view==='home')render(false);
      else if(view==='chat')patchDynamicRegionsOnTick();
      else refreshSystemLogs();
      return;
    }
    go('chat',undefined,false);
  }

  async function exportData(): Promise<void> {
    try {
      const pack = await buildBackupPayload(data);
      const blob = new Blob([JSON.stringify(pack, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `elsewhere-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      notify('附件备份失败：' + msg);
    }
  }

  let restoringBackup=false;
  function importBackup(file: File | undefined): void {
    if (!file||restoringBackup) return;
    restoringBackup=true;
    const fr = new FileReader();
    fr.onerror=()=>{restoringBackup=false;notify('无法读取备份文件。');};
    fr.onload = async () => {
      try {
        const previous=data,baseline=saveSession.raw;
        if(!saveSession.current())throw Error(saveError());
        let parsed: unknown;
        try {parsed = JSON.parse(String(fr.result));}
        catch {throw new Error('备份不是有效的 JSON');}
        const d = validateStoredWorld(parsed);
        const attachments = validateBackupAttachments(d._media);
        delete d._media;
        const fontCount=Array.isArray(d.customFonts)?d.customFonts.length:0;
        const bubbleCount=Array.isArray(d.bubblePresets)?d.bubblePresets.length:0;
        const next = normalizeAndMigrateData(d);
        if((next.customFonts?.length||0)<fontCount||(next.bubblePresets?.length||0)<bubbleCount)throw Error('备份中的外观记录无法完整恢复。');
        try {next.focus = ensureFocusStateNormalized(next.focus,next.roles);}
        catch {throw new Error('专注备份结构无效');}
        if(next.focus.active)delete next.focus.active.liveLogBusy;
        next.selected = null;
        delete next.draftWorldId;
        await stageBackupMedia(next,attachments);
        if(data!==previous||saveSession.raw!==baseline)throw Error('暂存期间世界已变化，未替换存档。');
        if(!save(next))throw Error(saveError());
        clearDrafts(()=>true);
        suspendVoiceOperations(false);
        modelPageEpoch++;
        for(const owner of previous.roles){
          if(novelTasks.cancel(owner.id))busy=false;
        }
        data = next;
        mediaSources.clear();
        document.querySelectorAll<HTMLElement>('[data-hydrated-key]').forEach(el=>delete el.dataset.hydratedKey);
        token = readDeviceApiKey(localStorage,data.settings.endpoint);
        terminalApi.reset();
        go('landing',undefined,false);
        notify('已导入备份及媒体附件');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        notify('备份导入失败：' + msg);
      } finally {restoringBackup=false;}
    };
    fr.readAsText(file);
  }

  const appRoot = $('#app')!;

  // Track IME composition to prevent clobbering Chinese/Japanese input candidates
  appRoot.addEventListener('compositionstart', () => {
    isComposing = true;
  });
  appRoot.addEventListener('compositionend', () => {
    isComposing = false;
  });

  appRoot.addEventListener('click', (e) => {
    const targetEl = e.target as HTMLElement | null;
    if (targetEl?.classList.contains('frame-modal-backdrop')) {
      if (targetEl.classList.contains('focus-settlement-backdrop')) {
        focusSettlementModalSessionId = null;
        render(false);
        return;
      }
      if (view === 'roleform') draftRoleFormValues = captureFormValues('role-form');
      if (view === 'userprofile') draftUserFormValues = captureFormValues('user-profile-form');
      closeFrameModalInPlace();
      return;
    }
    const b = targetEl?.closest<HTMLElement>('[data-action]');
    if (!b) return;
    const act = b.dataset.action;
    let r = role();
    if(act==='reloadworld'){
      if(window.confirm('重新读取会关闭当前页面的未保存草稿。请先复制需要保留的内容。现在重新读取？'))location.reload();
      return;
    }

    if(act==='nainpreflight'){
      if(!r||busy||diaryQueueBusy||lifeBusy){notify('请等待当前请求结束后再清档。');return;}
      if(!window.confirm(`仅清理当前奈恩的互动：${r.chats.length} 条聊天、${r.diaries.length} 篇日记、${r.events.length} 条事件，以及见面／戏剧／足迹状态。若有真实记录请取消。角色资料与其他角色保留；先创建恢复副本。本操作仅执行一次，确认继续？`))return;
      const result=resetNainStart(data,r.id,saveSession.storage,now());
      if(data!==result.data){suspendVoiceOperations(false);modelPageEpoch++;}
      data=result.data;
      if(result.cleaned){clearRoleDrafts(r);render(false);notify('奈恩已恢复到等待 API 首条消息的起点，恢复副本已保存。');}
      else notify(result.error||'当前角色已经清理过，未重复执行。');
      return;
    }
    if(act==='exportnainbackup'&&r?.demoStartResetAt){
      const raw=localStorage.getItem(NAIN_BACKUP_PREFIX+r.id+':'+r.demoStartResetAt);
      if(!raw){notify('未找到清档前恢复副本。');return;}
      void(async()=>{try{
        const snapshot=JSON.parse(raw) as AppData;
        const payload=await buildBackupPayload(snapshot),blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
        link.href=url;link.download='Elsewhere_奈恩清档前恢复副本.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }catch{notify('恢复副本导出失败，原副本仍保留。');}})();return;
    }
    if(act==='resume-scene-opening'){
      const scene=r?.scene;
      if(!r||!scene?.opening||scene.opening.status==='archived'||busy||!checkWriteAccess())return;
      if(!openingSourcesValid(r,scene)){notify('原话的有效版本已变化，本轮无法继续。可保留现场或结束见面。');return;}
      if(!token.trim()||!canUseRealModel(data.settings)){notify('请先在终端连接 API。');return;}
      if(scene.opening.status!=='unsent'&&!window.confirm('首次请求可能已被服务商处理。重新发送可能再次计费，确定继续？'))return;
      void runMeetingOpening(r,scene);render(false);return;
    }
    if(act==='retry-novel'){
      const current=role(),kind:NovelKind=novelViewKind,p=current&&(kind==='play'?current.play:current.scene);
      const latest=getActiveMessages(p?.messages).at(-1);
      if(!current||!p||busy||latest?.speaker!=='me')return;
      busy=true;render(false);
      void generateNovelReply(current,kind,latest.text).catch(error=>notify('生成未完成：'+(error instanceof Error?error.message:'连接异常'))).finally(()=>{busy=novelTasks.has(data.selected||'');if(view==='novel'&&role()===current)render(false);});return;
    }
    if(act==='intermissionreply'){void requestIntermissionReply(b.closest('form'));return;}
    if(act==='copy-intermission-reply'){
      const p=r?.play,text=p&&intermissionRecovery.get(p)?.text;
      if(view==='intermission'&&p?.paused&&text)offerUnstoredReply(text);
      return;
    }
    if (act === 'chatpanel') {
      setChatPanel(chatPanel===b.dataset.panel?'':b.dataset.panel||'');
      render(false);
      return;
    }
    if (act === 'closepanel') {
      setChatPanel('');
      render(false);
      return;
    }
    if(act==='senduploadedsticker'){
      const item=uploadedStickers(r?.chats||[]).find(item=>item.mediaId===b.dataset.mediaId);
      if(item)void sendRichMessage({kind:'sticker',mediaId:item.mediaId,caption:item.caption});
      return;
    }
    if (act === 'recordtoggle') {
      if(voiceOperation?.phase==='recording')stopRecording();
      else if(!voiceOperation)void beginRecording();
      return;
    }
    if (act === 'recordcancel') {
      stopRecording(true);
      return;
    }
    if(act==='download-voice-recovery'||act==='discard-voice-recovery'){
      const recovery=r&&voiceRecoveries.get(r),id=Number(b.dataset.id),item=recovery?.get(id);
      if(view!=='chat'||chatPanel!=='voice'||item?.world!==data||!item.blob)return;
      if(act==='discard-voice-recovery'){recovery?.delete(id);render(false);return;}
      const url=URL.createObjectURL(item.blob),link=document.createElement('a');
      const ext=({'audio/mp4':'m4a','audio/webm':'webm','audio/ogg':'ogg','audio/wav':'wav'} as Record<string,string>)[item.blob.type.split(';')[0]]||'audio';
      link.href=url;link.download='Elsewhere-未确认语音.'+ext;link.click();
      setTimeout(()=>URL.revokeObjectURL(url),30000);return;
    }
    if (act === 'view') {
      go(b.dataset.view || 'home');
      return;
    }
    if (act === 'home') {
      if (role()) go('home');
      return;
    }
    if (act === 'enter') {
      captureDrafts();
      if (activeFocus()?.phase === 'work') {
        go('focus');
        return;
      }
      if(data.selected&&novelTasks.cancel(data.selected))busy=false;
      data.selected = b.dataset.id || null;
      r = role();
      if (r&&saveSession.current()) {
        simulate(r);
        deliverPending(r);
      }
      go('home');
      return;
    }
    if (act === 'newrole') {
      formMode = 'new';
      editingRoleId = null;
      roleFormReturnView = 'landing';
      resetRoleAvatarDraft();
      go('roleform');
      return;
    }
    if (act === 'editrole') {
      const target = data.roles.find((x) => x.id === b.dataset.id);
      if (!target) return;
      formMode = 'edit';
      editingRoleId = target.id;
      data.selected = target.id;
      roleFormReturnView = view === 'landing' ? 'landing' : 'roleinfo';
      resetRoleAvatarDraft();
      draftRoleFrame = buildStagedFrameFromOwner(target);
      go('roleform');
      return;
    }
    if (act === 'editroleframe') {
      const target = data.roles.find((x) => x.id === (b.dataset.id || data.selected));
      if (!target) return;
      formMode = 'edit';
      editingRoleId = target.id;
      data.selected = target.id;
      roleFormReturnView = view === 'chat' ? 'chat' : view === 'landing' ? 'landing' : 'roleinfo';
      resetRoleAvatarDraft();
      draftRoleFrame = buildStagedFrameFromOwner(target);
      frameModalOwner = 'role';
      modalFrameDraft = { ...draftRoleFrame };
      frameModalAdjustOpen = false;
      go('roleform');
      return;
    }
    if (act === 'chatroleedit') {
      if (!r) return;
      formMode = 'edit';
      editingRoleId = r.id;
      roleFormReturnView = 'chat';
      resetRoleAvatarDraft();
      draftRoleFrame = buildStagedFrameFromOwner(r);
      go('roleform');
      return;
    }
    if(act==='chatvoice'){chatVoiceDialog.open();return;}
    if (act === 'cancelroleform') {
      resetRoleAvatarDraft();
      go(formMode === 'edit' ? roleFormReturnView : 'landing');
      return;
    }
    if (act === 'canceluserprofile') {
      resetUserAvatarDraft();
      go('landing');
      return;
    }
    if (act === 'askdelete') {
      deleteRoleId = b.dataset.id || null;
      go('deleterole');
      return;
    }
    if (act === 'canceldelete') {
      deleteRoleId = null;
      go('roleform');
      return;
    }
    if(act==='offline-round'){
      if(!r||view!=='chat'||ongoing(r)||!checkWriteAccess())return;
      const before=structuredClone(r.chatTiming);
      if(setChatScene(r,now())){
        if(!save())r.chatTiming=before;
        render(false);
      }else patchDynamicRegionsOnTick();
      return;
    }
    if(act==='retrychatbatch'){
      if(r&&checkWriteAccess()){
        const before=structuredClone(r.chatTiming);
        retryChatTiming(r);
        if(save()){render(false);pumpChatSchedules();}else r.chatTiming=before;
      }
      return;
    }
    if (act === 'focuschat') {
      if (r) requestChatFocus(r);
      return;
    }
    if (act === 'startfocus') {
      startCompanionFocus();
      return;
    }
    if (act === 'focusstepminutes') {
      ensureFocusData();
      const taskInputEl = document.getElementById('focus-task-input') as HTMLInputElement | null;
      if (taskInputEl) focusTaskInputDraft = taskInputEl.value;
      const delta = Number(b.dataset.delta) || 0;
      data.focus!.workMinutes = stepFocusMinutes(
        data.focus!.workMinutes || FOCUS_DEFAULT_MINUTES,
        delta
      );
      save();
      render(false);
      return;
    }
    if (act === 'focussetminutes') {
      ensureFocusData();
      const taskInputEl = document.getElementById('focus-task-input') as HTMLInputElement | null;
      if (taskInputEl) focusTaskInputDraft = taskInputEl.value;
      data.focus!.workMinutes = clampFocusMinutes(
        Number(b.dataset.minutes) || FOCUS_DEFAULT_MINUTES,
        false
      );
      save();
      render(false);
      return;
    }
    if (act === 'addfocustask') {
      ensureFocusData();
      const taskInputEl = document.getElementById('focus-task-input') as HTMLInputElement | null;
      const rawText = (taskInputEl ? taskInputEl.value : focusTaskInputDraft).trim();
      if (!rawText) {
        notify('请先输入要添加的任务名称');
        return;
      }
      data.focus!.draftTasks = normalizeFocusTasks(data.focus!.draftTasks, rawText);
      focusTaskInputDraft = '';
      save();
      render(false);
      return;
    }
    if (act === 'removefocustask') {
      ensureFocusData();
      const taskInputEl = document.getElementById('focus-task-input') as HTMLInputElement | null;
      if (taskInputEl) focusTaskInputDraft = taskInputEl.value;
      const idx = Number(b.dataset.index);
      if (Array.isArray(data.focus!.draftTasks) && idx >= 0) {
        data.focus!.draftTasks.splice(idx, 1);
      }
      save();
      render(false);
      return;
    }
    if (act === 'focustogglerole') {
      ensureFocusData();
      const taskInputEl = document.getElementById('focus-task-input') as HTMLInputElement | null;
      if (taskInputEl) focusTaskInputDraft = taskInputEl.value;
      const roleId = b.dataset.roleId || '';
      if (!roleId) return;
      const current = new Set(data.focus!.draftInvitedRoleIds || []);
      if (current.has(roleId)) current.delete(roleId);
      else current.add(roleId);
      data.focus!.draftInvitedRoleIds = Array.from(current);
      save();
      render(false);
      return;
    }
    if (act === 'focusclearroles') {
      ensureFocusData();
      const taskInputEl = document.getElementById('focus-task-input') as HTMLInputElement | null;
      if (taskInputEl) focusTaskInputDraft = taskInputEl.value;
      data.focus!.draftInvitedRoleIds = [];
      save();
      render(false);
      return;
    }
    if (act === 'focusrefreshlog') {
      const f = activeFocus();
      if (!f || f.status !== 'running') return;
      f.nextLiveLogDueAt = now() - 1;
      syncFocusMoments();
      render(false);
      return;
    }
    if (act === 'focushistorydate') {
      const taskInputEl = document.getElementById('focus-task-input') as HTMLInputElement | null;
      if (taskInputEl) focusTaskInputDraft = taskInputEl.value;
      const targetDate = b.dataset.date || toLocalDateKey(now());
      if (/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
        focusHistoryDateKey = targetDate;
      }
      render(false);
      return;
    }
    if (act === 'openfocusrecord') {
      const sid = b.dataset.sessionId || '';
      if (sid) {
        focusSettlementModalSessionId = sid;
        render(false);
      }
      return;
    }
    if (act === 'closesettlementmodal') {
      focusSettlementModalSessionId = null;
      render(false);
      return;
    }
    if (act === 'retryfocussummary') {
      const sid = b.dataset.sessionId || focusSettlementModalSessionId || '';
      if (sid) {
        void requestAiFocusSummariesForSession(sid, true);
      }
      return;
    }
    if (act === 'focuspause') {
      if (activeFocus()?.status === 'running') pauseFocus();
      else resumeFocus();
      return;
    }
    if (act === 'focusstop') {
      stopFocus();
      return;
    }
    if (act === 'diarytab') {
      diaryTab = (b.dataset.tab as 'char' | 'me') || 'char';
      render();
      return;
    }
    if (act === 'sharediary') {
      if (!r || !b.dataset.id) return;
      const diary=r.diaries.find(d=>d.id===b.dataset.id&&d.speaker==='me');
      const previous=diary?structuredClone(diary):undefined,eventCount=r.events.length;
      const res = shareDiaryWithRole(r, b.dataset.id, now());
      if (!res.ok) {
        notify(res.reason || '分享失败');
        return;
      }
      if(!saveLogged('diary', `向 ${r.name} 主动分享了一篇个人日记`, {
        diaryId: b.dataset.id,
      })){
        if(diary&&previous)restoreFields(diary,previous);
        r.events.length=eventCount;
        return;
      }
      render(false);
      notify(`已将这篇日记分享给 ${r.name}`);
      return;
    }
    if (act === 'retrydiary'||act==='regeneratediary') {
      const dateKey = b.dataset.date || '';
      if (!r || !dateKey) return;
      void triggerDiaryTaskForRole(r,dateKey,act==='regeneratediary');
      return;
    }
    if (act === 'genfirstmsg') {
      if (r) generateRoleFirstMessage(r);
      return;
    }
    if (act === 'togglerevisions') {
      if(view==='chat')return;
      showRevisionsDrawer = !showRevisionsDrawer;
      render(false);
      return;
    }
    if (act === 'quotemsg') {
      if (!r || !b.dataset.id) return;
      const scope = (b.dataset.scope as RevisionScope) || 'chat';
      const list =
        scope === 'chat'
          ? r.chats
          : scope === 'play'
          ? r.play?.messages || []
          : r.scene?.messages || [];
      const msg = list.find(
        (m) => m.id === b.dataset.id && m.status !== 'retracted'
      );
      if (!msg) return;
      quotingMessage = buildQuoteMetadata(msg);
      render(false);
      const inputEl = $(
        scope === 'chat' ? '#message-input' : '#novel-input'
      ) as HTMLTextAreaElement | null;
      inputEl?.focus();
      return;
    }
    if (act === 'cancelquote') {
      quotingMessage = null;
      render(false);
      return;
    }
    if (act === 'starteditmsg') {
      if (!r || !b.dataset.id) return;
      const scope = (b.dataset.scope as RevisionScope) || 'chat';
      const list =
        scope === 'chat'
          ? r.chats
          : scope === 'play'
          ? r.play?.messages || []
          : r.scene?.messages || [];
      const msg = list.find(
        (m) => m.id === b.dataset.id && m.status !== 'retracted'
      );
      if (!msg) return;
      editingMessageId = msg.id;
      editingMessageScope = scope;
      editingMessageDraft = msg.text;
      render(false);
      return;
    }
    if (act === 'canceleditmsg') {
      editingMessageId = null;
      editingMessageDraft = '';
      render(false);
      return;
    }
    if (act === 'retractmsg') {
      if (!r || !b.dataset.id) return;
      const scope = (b.dataset.scope as RevisionScope) || 'chat';
      const previous=structuredClone(r);
      const res = retractMessage(r, scope, b.dataset.id, now());
      if (!res.ok) {
        notify(res.reason || '撤回失败');
        return;
      }
      if(scope==='chat')revisePhoneSchedule(r,false,b.dataset.id);
      if(!saveLogged('revision',`撤回 ${scope} 消息`,{targetMessageId:b.dataset.id,revisionId:res.revision?.id})){
        restoreFields(r,previous);
        return;
      }
      if(scope==='chat'){activeChatRequests.get(r.id)?.abort();chatTyping.delete(r.id);}
      if (quotingMessage?.id === b.dataset.id) quotingMessage = null;
      if (editingMessageId === b.dataset.id) editingMessageId = null;
      render(false);
      notify('消息已撤回，已从正式上下文与记忆中移除');
      return;
    }
    if (act === 'regenmsg') {
      if (!r || !b.dataset.id) return;
      const scope = (b.dataset.scope as RevisionScope) || 'chat';
      regenerateMessageReply(scope, b.dataset.id);
      return;
    }
    if (act === 'intermission') {
      if (!r?.play) {
        notify('只有正在进行的戏剧才有幕间');
        return;
      }
      ensureIntermission(r.play);
      const previous=r.play.paused;
      r.play.paused = true;
      if(!saveLogged('intermission','用户主动暂停演出',{source:r.play.id})){r.play.paused=previous;return;}
      go('intermission',undefined,false);
      return;
    }
    if (act === 'resumeplay') {
      if (!r?.play) return;
      const previous=r.play.paused;
      r.play.paused = false;
      if(!saveLogged('intermission','返回戏内演出',{source:r.play.id})){r.play.paused=previous;return;}
      intermissionOperations.get(r.play)?.abort();
      go('novel','play',false);
      return;
    }
    if (act === 'rollbackplay') {
      rollBackPlay();
      return;
    }
    if(act==='openconversation'){
      if(r&&r.id===b.dataset.roleId){if(r.scene&&r.scene.endedAt===undefined)go('novel','scene');else go('chat');}return;
    }
    if(act==='edit-meeting-place'){
      if(r&&r.id===b.dataset.roleId&&r.scene?.id===b.dataset.sceneId)editMeetingPlace();return;
    }
    if(act==='viewmeeting'){
      if(r?.meetings?.some(p=>p.id===b.dataset.id&&p.endedAt!==undefined)){detailId=b.dataset.id!;go('meetingdetail');}return;
    }
    if(act==='logtoday'){systemLogDate=null;refreshSystemLogs();return;}
    if (act === 'resume') {
      if (ongoing(r)) go(r?.play?.paused?'intermission':'novel',r?.play?'play':'scene');
      return;
    }
    if (act === 'meet') {
      meet();
      return;
    }
    if (act === 'endnovel') {
      if (busy&&(!r||!novelTasks.has(r.id))) {
        notify('请先完成当前回复，再结束场景');
        return;
      }
      endNovel();
      return;
    }
    if (act === 'viewplay') {
      detailId = b.dataset.id || '';
      go('playdetail');
      return;
    }
    if (act === 'exportlogs') {
      const payload = JSON.stringify(data.logs || [], null, 2);
      const a = document.createElement('a');
      const url = URL.createObjectURL(
        new Blob([payload], { type: 'application/json' })
      );
      a.href = url;
      a.download = 'elsewhere-system-log.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return;
    }
    if (act === 'clearlogs') {
      const previous=data.logs;
      data.logs = [];
      if(!save()){data.logs=previous;return;}
      render();
      return;
    }
    if (act === 'clearframe') {
      if (!r) return;
      const previous={frameId:r.frameId,frameData:r.frameData,frameMediaId:r.frameMediaId};
      r.frameId = 'none';
      r.frameData = '';
      r.frameMediaId = '';
      if(!save()){Object.assign(r,previous);return;}
      render(false);
      notify('已移除当前角色头像框');
      return;
    }
    if (act === 'monitordate') {
      const targetDate = b.dataset.date || '';
      monitorDateKey = resolveSafeMonitorDateKey(targetDate, now());
      const parts = parseDateKeyParts(monitorDateKey);
      if (parts) {
        footprintCalYear = parts.year;
        footprintCalMonth = parts.month;
      }
      showFootprintCalendar = false;
      render(false);
      return;
    }
    if (act === 'togglefootprintcal') {
      showFootprintCalendar = !showFootprintCalendar;
      if (showFootprintCalendar) {
        const parts = parseDateKeyParts(monitorDateKey);
        if (parts) {
          footprintCalYear = parts.year;
          footprintCalMonth = parts.month;
        }
      }
      render(false);
      return;
    }
    if (act === 'footprintcalmonth') {
      const delta = Number(b.dataset.delta) || 0;
      const d = new Date(footprintCalYear, footprintCalMonth - 1 + delta, 1);
      footprintCalYear = d.getFullYear();
      footprintCalMonth = d.getMonth() + 1;
      render(false);
      return;
    }
    if(act==='toggleautonomouslife'){
      const previous=data.settings.autonomousLife;data.settings.autonomousLife=previous===false;
      if(!save()){data.settings.autonomousLife=previous;return;}
      if(data.settings.autonomousLife===false)lifeController?.abort();
      render(false);return;
    }
    if(act==='retractlife'){
      const event=r?.events.find(e=>e.id===b.dataset.id&&e.kind==='life'&&e.lifeRecord);
      if(!event||!confirm('撤回这条模拟生活记录？原文会保留，后续聊天和日记不再把它当作有效生活事实。'))return;
      const before=event.status;event.status='retracted';if(!save())event.status=before;render(false);return;
    }
    if (act === 'openframemodal') {
      const ownerType = b.dataset.owner === 'user' ? 'user' : 'role';
      openFrameModalInPlace(ownerType);
      return;
    }
    if (act === 'cancelframemodal') {
      if (view === 'roleform') draftRoleFormValues = captureFormValues('role-form');
      if (view === 'userprofile') draftUserFormValues = captureFormValues('user-profile-form');
      closeFrameModalInPlace();
      return;
    }
    if (act === 'applyframemodal') {
      const ownerType = frameModalOwner;
      if (!ownerType || !modalFrameDraft) {
        closeFrameModalInPlace();
        return;
      }
      if (ownerType === 'role') draftRoleFormValues = captureFormValues('role-form');
      else draftUserFormValues = captureFormValues('user-profile-form');
      const existing=Boolean(getModalBaseOwnerAndDisplayName(ownerType).baseOwner);
      if(applyFrameModalInPlace(ownerType)) notify(existing ? '头像框已保存并应用' : '已更新头像框草稿，创建角色后保存');
      return;
    }
    if (act === 'toggleframeadjust') {
      const ownerType = frameModalOwner || 'role';
      const { baseOwner } = getModalBaseOwnerAndDisplayName(ownerType);
      const staged = getActiveModalOrFormFrameDraft(
        ownerType,
        baseOwner as RoleData | null
      );
      syncModalAdjustInputsToStaged(ownerType, staged);
      frameModalAdjustOpen = !frameModalAdjustOpen;
      patchFrameModalAdjustDrawerInPlace(ownerType);
      return;
    }
    if (act === 'resetframeadjust') {
      const ownerType = b.dataset.owner === 'user' ? 'user' : 'role';
      const staged = getActiveModalOrFormFrameDraft(
        ownerType,
        formMode === 'edit' ? data.roles.find((x) => x.id === editingRoleId) : r
      );
      staged.frameScale = DEFAULT_FRAME_SCALE;
      staged.frameX = 0;
      staged.frameY = 0;
      staged.frameLayoutVersion = 1;
      patchFrameModalAdjustDrawerInPlace(ownerType);
      patchFrameModalSelectionInPlace(ownerType);
      notify('已恢复默认缩放与位置');
      return;
    }
    if (act === 'framesourcetab') {
      const ownerType = frameModalOwner || 'role';
      const { baseOwner } = getModalBaseOwnerAndDisplayName(ownerType);
      const staged = getActiveModalOrFormFrameDraft(
        ownerType,
        baseOwner as RoleData | null
      );
      syncModalAdjustInputsToStaged(ownerType, staged);
      frameGallerySourceTab = b.dataset.tab === 'custom' ? 'custom' : 'preset';
      patchFrameModalBodyAndTabsInPlace(ownerType);
      return;
    }
    if (act === 'framepage') {
      const ownerType = frameModalOwner || 'role';
      const { baseOwner } = getModalBaseOwnerAndDisplayName(ownerType);
      const staged = getActiveModalOrFormFrameDraft(
        ownerType,
        baseOwner as RoleData | null
      );
      syncModalAdjustInputsToStaged(ownerType, staged);
      const delta = Number(b.dataset.delta) || 0;
      frameGalleryPage = Math.max(0, frameGalleryPage + delta);
      patchFrameModalPresetGridInPlace(ownerType);
      return;
    }
    if (act === 'applyframedraftadjust') {
      const ownerType = b.dataset.owner === 'user' ? 'user' : 'role';
      const staged = getActiveModalOrFormFrameDraft(
        ownerType,
        formMode === 'edit' ? data.roles.find((x) => x.id === editingRoleId) : r
      );
      syncModalAdjustInputsToStaged(ownerType, staged);
      patchFrameModalSelectionInPlace(ownerType);
      notify('已更新弹窗内头像框位置预览');
      return;
    }
    if (act === 'selectpresetframe') {
      const ownerType = b.dataset.owner === 'user' ? 'user' : 'role';
      const staged = getActiveModalOrFormFrameDraft(
        ownerType,
        formMode === 'edit' ? data.roles.find((x) => x.id === editingRoleId) : r
      );
      syncModalAdjustInputsToStaged(ownerType, staged);
      const frameId = b.dataset.frameId || 'none';
      const presetItem = PRESET_AVATAR_FRAMES.find((x) => x.id === frameId);
      if(frameId !== 'none' && !presetItem) return;
      selectModalFrame(staged, {frameId,frameData:presetItem?.url||'',frameMediaId:''});
      patchFrameModalSelectionInPlace(ownerType);
      return;
    }
    if (act === 'selectcustomframe') {
      const ownerType = b.dataset.owner === 'user' ? 'user' : 'role';
      const staged = getActiveModalOrFormFrameDraft(
        ownerType,
        formMode === 'edit' ? data.roles.find((x) => x.id === editingRoleId) : r
      );
      syncModalAdjustInputsToStaged(ownerType, staged);
      const customId = b.dataset.customId || '';
      const cf = (data.customFrames || []).find((x) => x.id === customId);
      if (!cf) return;
      selectModalFrame(staged, {frameId:cf.id,frameMediaId:cf.mediaId||'',frameData:cf.sourceUrl||cf.dataUrl||''});
      patchFrameModalSelectionInPlace(ownerType);
      return;
    }
    if (act === 'confirmterminalframeupload') {
      if (!stagedTerminalFrameBlob) return;
      const blobToSave = stagedTerminalFrameBlob,world=data;
      const nameInput = document.getElementById(
        'terminal-staged-frame-name'
      ) as HTMLInputElement | null;
      const cleanName =
        (nameInput?.value || stagedTerminalFrameName || '自定义头像框')
          .trim()
          .slice(0, 36) || '自定义头像框';
      void (async () => {
        try {
          const mediaId = makeUid('frm_u');
          await mediaPut(mediaId, blobToSave);
          if(data!==world||stagedTerminalFrameBlob!==blobToSave)return;
          const customId = makeUid('cf');
          const previous=data.customFrames;
          data.customFrames=[{
            id: customId,
            name: cleanName,
            mediaId,
            createdAt: now(),
          },...(previous||[])];
          if(!saveLogged('ui',`终端入库自定义头像框素材：${cleanName}`)){
            data.customFrames=previous;
            return;
          }
          resetStagedTerminalFrame();
          render(false);
          notify(`已将「${cleanName}」加入头像框图库，可在人物编辑页选用`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          notify('入库自定义头像框失败：' + msg);
        }
      })();
      return;
    }
    if (act === 'cancelterminalframeupload') {
      resetStagedTerminalFrame();
      render(false);
      notify('已取消上传，未写入头像框图库');
      return;
    }
    if (act === 'deletecustomframe') {
      const customId = b.dataset.customId || '';
      const list = data.customFrames || [];
      const idx = list.findIndex((x) => x.id === customId);
      if (idx < 0) return;
      const removed=list[idx];
      const sharesMedia=list.some(item=>item!==removed&&item.mediaId&&item.mediaId===removed.mediaId);
      const sharesData=list.some(item=>item!==removed&&item.dataUrl&&item.dataUrl===removed.dataUrl);
      const usesAsset=(owner:AvatarFrameFields)=>owner.frameId===removed.id || Boolean(!sharesMedia&&removed.mediaId&&owner.frameMediaId===removed.mediaId) || Boolean(!sharesData&&removed.dataUrl&&owner.frameData===removed.dataUrl);
      const affected=[data.user,...data.roles,draftUserFrame,draftRoleFrame,modalFrameDraft].filter((owner):owner is RoleData|UserProfileData|StagedFrameState=>Boolean(owner)&&usesAsset(owner!));
      const snapshots=affected.map(owner=>({owner,frameId:owner.frameId,frameMediaId:owner.frameMediaId,frameData:owner.frameData}));
      list.splice(idx,1);
      for(const owner of affected) Object.assign(owner,{frameId:'none',frameMediaId:'',frameData:''});
      if(!save()){
        list.splice(idx,0,removed);
        for(const {owner,...fields}of snapshots)Object.assign(owner,fields);
        return;
      }
      for(const [key,choice]of modalFrameChoices)if(usesAsset(choice))modalFrameChoices.delete(key);
      if (frameModalOwner && document.querySelector('[data-testid="avatar-frame-modal"]')) {
        patchFrameModalBodyAndTabsInPlace(frameModalOwner);
      } else {
        render(false);
      }
      notify('已删除该自定义头像框素材');
      return;
    }
    if (act === 'cacheactiveframe') {
      const ownerType = b.dataset.owner === 'user' ? 'user' : 'role';
      const staged = getActiveModalOrFormFrameDraft(
        ownerType,
        formMode === 'edit' ? data.roles.find((x) => x.id === editingRoleId) : r
      );
      syncModalAdjustInputsToStaged(ownerType, staged);
      const remoteUrl = staged?.frameData || '';
      if (!staged || !/^https:\/\//i.test(remoteUrl)) return;
      const selectionId=staged.frameId,world=data;
      void (async () => {
        try {
          const resp = await fetch(remoteUrl, { mode: 'cors' });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const blob = await resp.blob();
          const mediaId = makeUid('frm_cache');
          await mediaPut(mediaId, blob);
          if(data!==world)return;
          if (!Array.isArray(data.customFrames)) data.customFrames = [];
          const presetInfo = findPresetFrameByIdOrUrl(
            selectionId || remoteUrl
          );
          const cachedFrame:CustomAvatarFrame={
            id: makeUid('cf'),
            name: presetInfo ? `离线缓存 · ${presetInfo.label}` : '离线缓存头像框',
            mediaId,
            sourceUrl: remoteUrl,
            createdAt: now(),
          };
          data.customFrames.unshift(cachedFrame);
          if(!save()){data.customFrames=data.customFrames.filter(item=>item!==cachedFrame);return;}
          if(frameModalOwner!==ownerType || modalFrameDraft!==staged || staged.frameId!==selectionId || staged.frameData!==remoteUrl){notify('素材已缓存，当前新选择保持不变');return;}
          staged.frameMediaId=mediaId;
          if (frameModalOwner && document.querySelector('[data-testid="avatar-frame-modal"]')) {
            patchFrameModalBodyAndTabsInPlace(ownerType);
          } else {
            render(false);
          }
          notify('已将该头像框缓存至浏览器本地 IndexedDB');
        } catch {
          notify(
            '远程图床未开放跨域读取或当前处于离线状态；将继续以远程链接加载，你也可以在「终端 → 头像框素材管理」上传本地文件'
          );
        }
      })();
      return;
    }
    if (act?.startsWith('hometask')) { homeTasks.handle(act,b); return; }
    if (act === 'export') {
      exportData();
      return;
    }
    if (act === 'removeuseravatar') {
      draftUserFormValues = captureFormValues('user-profile-form');
      userAvatarUploadVersion++;
      draftUserAvatarBlob = null;
      draftUserAvatarPreviewUrl = '';
      draftUserAvatarRemove = true;
      render(false);
      notify('已标记移除个人头像，保存资料后生效');
      return;
    }
    if (act === 'removeroleavatar') {
      draftRoleFormValues = captureFormValues('role-form');
      roleAvatarUploadVersion++;
      draftRoleAvatarBlob = null;
      draftRoleAvatarPreviewUrl = '';
      draftRoleAvatarRemove = true;
      render(false);
      notify('已标记删除角色头像，保存角色后生效');
      return;
    }
    if (act === 'downloadstandalone') {
      const a = document.createElement('a');
      a.href = './Elsewhere_Phase1_Standalone.html';
      a.download = 'Elsewhere_v1_Phase1_Standalone.html';
      a.click();
      notify('正在下载免 Node.js 独立离线版 HTML');
      return;
    }
  });

  appRoot.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target as HTMLFormElement;
    const fd = new FormData(f);

    if (f.id === 'inline-edit-form') {
      const r = role();
      const msgId = f.dataset.id || editingMessageId;
      const scope = (f.dataset.scope as RevisionScope) || editingMessageScope;
      if (!r || !msgId) return;
      const previous=structuredClone(r);
      const newText = String(fd.get('editText') || '').trim();
      const res = editMessage(r, scope, msgId, newText, now());
      if (!res.ok) {
        notify(res.reason || '修改失败');
        return;
      }
      if(scope==='chat'){syncRoleMemory(r,now());revisePhoneSchedule(r,false,msgId);}
      if(!saveLogged('revision', `编辑 ${scope} 消息`, {
        targetMessageId: msgId,
        revisionId: res.revision?.id,
      })){
        restoreFields(r,previous);
        return;
      }
      if(scope==='chat'){activeChatRequests.get(r.id)?.abort();chatTyping.delete(r.id);}
      editingMessageId = null;
      editingMessageDraft = '';
      render(false);
      notify('消息已修改，旧版本已归档并从正式上下文移除');
      return;
    }

    if (f.id === 'packet-form') {
      const amount = Math.round(Number(fd.get('amount')) * 100) / 100;
      const wish = String(fd.get('wish') || '收下这份心意')
        .trim()
        .slice(0, 100);
      if (!Number.isFinite(amount) || amount < 0.01 || amount > 200) {
        notify('请输入 0.01 至 200 的虚拟金额');
        return;
      }
      sendRichMessage({ kind: 'packet', amount, wish });
      return;
    }

    if (f.id === 'user-profile-form') {
      if(profileSaves.has(f))return;
      const world=data,version=userAvatarUploadVersion;
      let avatarId=draftUserAvatarRemove?'':undefined;
      if(draftUserAvatarBlob){
        try{avatarId=await stageFormAvatar(f,draftUserAvatarBlob);}
        catch{notify('个人头像暂存失败，资料未修改。');return;}
        if(data!==world||version!==userAvatarUploadVersion||!f.isConnected)return;
      }
      const previous=data.user;
      data.user={...previous};
      if(avatarId!==undefined)data.user.avatarMediaId=avatarId;
      for (const k of [
        'name',
        'pronouns',
        'identity',
        'background',
        'notes',
      ] as const) {
        data.user[k] = String(fd.get(k) || '')
          .trim()
          .slice(0, 10000);
      }
      if (draftUserFrame) {
        const wrap = document.getElementById('frame-adjust-user');
        if (wrap) {
          const sizeEl = wrap.querySelector<HTMLInputElement>('[name="size"]');
          const xEl = wrap.querySelector<HTMLInputElement>('[name="x"]');
          const yEl = wrap.querySelector<HTMLInputElement>('[name="y"]');
          if (sizeEl) draftUserFrame.frameScale = Math.max(0.5, Math.min(3, Number(sizeEl.value) || 1.25));
          if (xEl) draftUserFrame.frameX = Math.max(-80, Math.min(80, Number(xEl.value) || 0));
          if (yEl) draftUserFrame.frameY = Math.max(-80, Math.min(80, Number(yEl.value) || 0));
        }
        data.user.frameId = draftUserFrame.frameId;
        data.user.frameMediaId = draftUserFrame.frameMediaId;
        data.user.frameData = draftUserFrame.frameData;
        data.user.frameScale = draftUserFrame.frameScale;
        data.user.frameX = draftUserFrame.frameX;
        data.user.frameY = draftUserFrame.frameY;
        data.user.frameLayoutVersion = draftUserFrame.frameLayoutVersion;
      }
      if(!saveLogged('identity','更新用户全局资料与头像框')){data.user=previous;return;}
      resetUserAvatarDraft();
      go('landing',undefined,false);
      notify('我的资料与头像框已保存');
      return;
    }

    if (f.id === 'role-form') {
      const name=String(fd.get('name')||'').trim();
      if(!name||profileSaves.has(f))return;
      const world=data,version=roleAvatarUploadVersion,isNew=formMode!=='edit';
      let r=isNew?undefined:data.roles.find(x=>x.id===editingRoleId);
      if(!isNew&&!r)return;
      let avatarId=draftRoleAvatarRemove?'':undefined;
      if(draftRoleAvatarBlob){
        try{avatarId=await stageFormAvatar(f,draftRoleAvatarBlob);}
        catch{notify('角色头像暂存失败，资料未修改。');return;}
        if(data!==world||version!==roleAvatarUploadVersion||!f.isConnected||r&&!world.roles.includes(r))return;
      }
      const rolesBefore=data.roles,selectedBefore=data.selected,roleBefore=r?{...r}:undefined;
      if (!r) {
        r = createRole(
          name,
          '',
          String(fd.get('job') || ''),
          String(fd.get('traits') || ''),
          String(fd.get('place') || '')
        );
        r.relationship = '';
        initNewRoleFirstMessageState(r, data.settings, now());
        data.roles=[...rolesBefore,r];
      }
      for (const k of [
        'name',
        'job',
        'traits',
        'place',
        'profile',
        'relationship',
        'canonNotes',
      ] as const) {
        r[k] = String(fd.get(k) || '')
          .trim()
          .slice(0, 20000);
      }
      if(avatarId!==undefined)r.avatarMediaId=avatarId;
      if (draftRoleFrame) {
        const wrap = document.getElementById('frame-adjust-role');
        if (wrap) {
          const sizeEl = wrap.querySelector<HTMLInputElement>('[name="size"]');
          const xEl = wrap.querySelector<HTMLInputElement>('[name="x"]');
          const yEl = wrap.querySelector<HTMLInputElement>('[name="y"]');
          if (sizeEl) draftRoleFrame.frameScale = Math.max(0.5, Math.min(3, Number(sizeEl.value) || 1.25));
          if (xEl) draftRoleFrame.frameX = Math.max(-80, Math.min(80, Number(xEl.value) || 0));
          if (yEl) draftRoleFrame.frameY = Math.max(-80, Math.min(80, Number(yEl.value) || 0));
        }
        r.frameId = draftRoleFrame.frameId;
        r.frameMediaId = draftRoleFrame.frameMediaId;
        r.frameData = draftRoleFrame.frameData;
        r.frameScale = draftRoleFrame.frameScale;
        r.frameX = draftRoleFrame.frameX;
        r.frameY = draftRoleFrame.frameY;
        r.frameLayoutVersion = draftRoleFrame.frameLayoutVersion;
      }
      data.selected=r.id;
      if(!saveLogged('role',`${isNew?'创建':'编辑'}角色：${r.name}`)){
        if(roleBefore)restoreFields(r,roleBefore);
        data.roles=rolesBefore;
        data.selected=selectedBefore;
        return;
      }
      resetRoleAvatarDraft();
      go(isNew?'home':roleFormReturnView,undefined,false);
      notify(formMode === 'edit' ? '角色资料与头像框修改已保存' : `已创建角色 ${r.name}`);
      if (isNew && canUseRealModel(data.settings)) {
        generateRoleFirstMessage(r);
      }
      return;
    }

    if (f.id === 'delete-role-form') {
      const target = data.roles.find((x) => x.id === deleteRoleId);
      if (!target) return;
      if (String(fd.get('confirmName') || '').trim() !== target.name) {
        notify('名字不匹配，未删除角色');
        return;
      }
      const previous={focus:data.focus,roles:data.roles,logs:data.logs,selected:data.selected};
      ensureFocusData();
      if (data.focus?.active) {
        data.focus.active={...data.focus.active};
        data.focus.active.participantRoleIds = (
          data.focus.active.participantRoleIds || []
        ).filter((id) => id !== target.id);
        data.focus.active.invitedRoleIds = (
          data.focus.active.invitedRoleIds || []
        ).filter((id) => id !== target.id);
        data.focus.active.participants = (
          data.focus.active.participants || []
        ).filter((p) => p.roleId !== target.id);
        if (data.focus.active.ownerId === target.id) {
          data.focus.active.ownerId =
            data.focus.active.participantRoleIds[0] || null;
        }
      }
      if (Array.isArray(data.focus?.draftInvitedRoleIds)) {
        data.focus!.draftInvitedRoleIds = data.focus!.draftInvitedRoleIds.filter(
          (id) => id !== target.id
        );
      }
      data.roles = data.roles.filter((x) => x.id !== target.id);
      data.logs = (data.logs || []).filter((x) => x.roleId !== target.id);
      data.selected = null;
      if(!saveLogged('role',`已删除角色及其存档：${target.name}`)){Object.assign(data,previous);return;}
      if(novelTasks.cancel(target.id))busy=false;
      if(target.play)intermissionOperations.get(target.play)?.abort();
      clearRoleDrafts(target);
      editingRoleId = null;
      deleteRoleId = null;
      go('landing',undefined,false);
      notify('已删除角色');
      return;
    }

    if (f.id==='message-form'||f.id==='novel-form'||f.id==='intermission-form') {
      const draft=currentDraft(f);
      if(!draft||isComposing||draft.mode!=='chat'&&busy)return;
      const text=draft.input.value;
      if(!text.trim())return;
      captureDrafts(draft.input);
      if(!checkWriteAccess())return;
      if(draft.mode==='intermission')submitIntermission(draft,text);
      else void submitText(draft,text);
      return;
    }

    if (f.id === 'intermission-settings-form') {
      const p = role()?.play;
      if (!p || !p.paused) return;
      const previous={...p,intermissionMessages:p.intermissionMessages?.slice()};
      ensureIntermission(p);
      for (const field of ['world', 'user', 'char'] as const) {
        p[field] = String(fd.get(field) || '')
          .trim()
          .slice(0, 20000);
      }
      p.intermissionMessages!.push({
        id: uid(),
        speaker: 'note',
        text: '已在幕间更新戏剧设定；之后的演出以新设定继续。',
        at: now(),
        status: 'active',
      });
      if(!saveLogged('intermission','幕间修改剧本设定',{source:p.id})){restoreFields(p,previous);return;}
      render();
      notify('设定已保存，返回演出后生效');
      return;
    }

    if (f.id === 'diary-form') {
      const r = role();
      const text = String(fd.get('text') || '').trim();
      if (!r || !text) return;
      const diaryCount=r.diaries.length,eventCount=r.events.length;
      createUserDiary(r,text,now());
      if(!saveLogged('diary','保存了一篇私人日记（默认未向角色公开）')){
        r.diaries.length=diaryCount;
        r.events.length=eventCount;
        return;
      }
      f.reset();
      render();
      notify('私人日记已保存');
      return;
    }

    if (f.id === 'play-start') {
      const r = role();
      if (!r) return;
      if (r.play) {
        notify('请先完成当前戏剧；不会覆盖未落幕的演出');
        return;
      }
      const previous=r.play;
      r.play = {
        id: uid(),
        title: String(fd.get('title') || '无题'),
        world: String(fd.get('world') || ''),
        user: String(fd.get('user') || ''),
        char: String(fd.get('char') || ''),
        startedAt: now(),
        messages: [
          {
            id: uid(),
            speaker: 'note',
            text: `${String(fd.get('world') || '故事开始了。')}\n\n帷幕升起。`,
            at: now(),
            status: 'active',
          },
        ],
      };
      if(!save()){r.play=previous;return;}
      go('novel','play',false);
      return;
    }

    if (f.dataset.frameAdjustOwner || f.id === 'frame-adjust') {
      const ownerType = f.dataset.frameAdjustOwner === 'user' ? 'user' : 'role';
      const targetOwner = ownerType === 'user' ? data.user : role();
      if (!targetOwner) return;
      const previous={frameScale:targetOwner.frameScale,frameX:targetOwner.frameX,frameY:targetOwner.frameY};
      targetOwner.frameScale = Math.max(
        0.5,
        Math.min(3, Number(fd.get('size')) || 1.25)
      );
      targetOwner.frameX = Math.max(-80, Math.min(80, Number(fd.get('x')) || 0));
      targetOwner.frameY = Math.max(-80, Math.min(80, Number(fd.get('y')) || 0));
      if(!save()){Object.assign(targetOwner,previous);return;}
      render(false);
      notify('头像框尺寸与偏移位置已保存');
      return;
    }

    if (f.id === 'profile-form') {
      const r = role();
      if (!r) return;
      const previous={profile:r.profile,traits:r.traits,relationship:r.relationship,notes:r.notes,userAlias:r.userAlias};
      r.profile = String(fd.get('profile') || '');
      r.traits = String(fd.get('traits') || '');
      r.relationship = String(fd.get('relationship') || '');
      r.notes = String(fd.get('notes') || '');
      r.userAlias = String(fd.get('userAlias') || '').trim();
      if(!save()){Object.assign(r,previous);return;}
      render(false);
      notify('人设已保存');
      return;
    }
  });

  appRoot.addEventListener('change', async (e) => {
    const el = e.target as HTMLInputElement;
    if(el.matches('[data-log-date]')){systemLogDate=el.value===toLocalDateKey(now())?null:el.value;refreshSystemLogs();return;}
    if (el.id === 'focus-minutes-slider') {
      ensureFocusData();
      const taskInputEl = document.getElementById('focus-task-input') as HTMLInputElement | null;
      if (taskInputEl) focusTaskInputDraft = taskInputEl.value;
      data.focus!.workMinutes = clampFocusMinutes(Number(el.value) || FOCUS_DEFAULT_MINUTES, true);
      save();
      render(false);
      return;
    }
    if (el.id === 'focus-history-date-input') {
      const taskInputEl = document.getElementById('focus-task-input') as HTMLInputElement | null;
      if (taskInputEl) focusTaskInputDraft = taskInputEl.value;
      if (/^\d{4}-\d{2}-\d{2}$/.test(el.value)) {
        focusHistoryDateKey = el.value;
        render(false);
      }
      return;
    }
    if (el.id === 'user-avatar-input' && el.files?.[0]) {
      const f = el.files[0];
      if (f.size > 8 * 1024 * 1024 || !f.type.startsWith('image/')) {
        notify('请选择 8MB 以内的图片文件（PNG / JPG / WebP / GIF）');
        return;
      }
      const version=++userAvatarUploadVersion;
      let preview:string;
      try{preview=await makeAvatarPreview(f);}catch{notify('图片无法解码，请选择有效的头像图片');return;}
      if(version!==userAvatarUploadVersion||view!=='userprofile'){avatarPreviewURLs.set(preview,false);clearMediaURLs();return;}
      draftUserFormValues = captureFormValues('user-profile-form');
      draftUserAvatarBlob = f;
      draftUserAvatarPreviewUrl = preview;
      avatarPreviewURLs.set(preview,false);
      draftUserAvatarRemove = false;
      render(false);
      notify('已预览新个人头像，点击「保存我的资料」后生效');
      return;
    }
    if (el.id === 'role-avatar-input' && el.files?.[0]) {
      const f = el.files[0];
      if (f.size > 8 * 1024 * 1024 || !f.type.startsWith('image/')) {
        notify('请选择 8MB 以内的图片文件（PNG / JPG / WebP / GIF）');
        return;
      }
      const version=++roleAvatarUploadVersion;
      const targetRole=editingRoleId;
      let preview:string;
      try{preview=await makeAvatarPreview(f);}catch{notify('图片无法解码，请选择有效的头像图片');return;}
      if(version!==roleAvatarUploadVersion||view!=='roleform'||editingRoleId!==targetRole){avatarPreviewURLs.set(preview,false);clearMediaURLs();return;}
      draftRoleFormValues = captureFormValues('role-form');
      draftRoleAvatarBlob = f;
      draftRoleAvatarPreviewUrl = preview;
      avatarPreviewURLs.set(preview,false);
      draftRoleAvatarRemove = false;
      render(false);
      notify('已预览新角色头像，点击下方保存按钮后生效');
      return;
    }
    if (el.id === 'terminal-frame-file-input' && el.files?.[0]) {
      const f = el.files[0];
      const allowedTypes = [
        'image/png',
        'image/svg+xml',
        'image/gif',
        'image/webp',
      ];
      if (f.size > 4 * 1024 * 1024 || !allowedTypes.includes(f.type)) {
        notify('请使用 4MB 以内的 PNG / SVG / GIF / WebP 头像框图片');
        return;
      }
      resetStagedTerminalFrame();
      stagedTerminalFrameBlob = f;
      stagedTerminalFramePreviewUrl = URL.createObjectURL(f);
      stagedTerminalFrameName =
        f.name.replace(/\.[^.]+$/, '').slice(0, 32) || '自定义头像框';
      render(false);
      notify('已加载头像框素材预览，请点击「确认加入头像框图库」或「取消上传」');
      return;
    }
    if (
      (el.id === 'frame-file' || el.dataset.frameUploadOwner) &&
      el.files?.[0]
    ) {
      const f = el.files[0];
      const allowedTypes = [
        'image/png',
        'image/svg+xml',
        'image/gif',
        'image/webp',
      ];
      if (f.size > 4 * 1024 * 1024 || !allowedTypes.includes(f.type)) {
        notify('请使用 4MB 以内的 PNG / SVG / GIF / WebP 头像框图片');
        return;
      }
      const ownerType =
        el.dataset.frameUploadOwner === 'user' ? 'user' : 'role';
      const staged = getActiveModalOrFormFrameDraft(
        ownerType,
        formMode === 'edit' ? data.roles.find((x) => x.id === editingRoleId) : role()
      );
      syncModalAdjustInputsToStaged(ownerType, staged);
      const selectionId=staged.frameId,world=data;

      void (async () => {
        try {
          const mediaId = makeUid('frm_u');
          await mediaPut(mediaId, f);
          if(data!==world)return;
          const customId = makeUid('cf');
          const cleanName = f.name.replace(/\.[^.]+$/, '').slice(0, 32) || '自定义头像框';
          if (!Array.isArray(data.customFrames)) data.customFrames = [];
          data.customFrames.unshift({
            id: customId,
            name: cleanName,
            mediaId,
            createdAt: now(),
          });
          if(!save()){data.customFrames=data.customFrames.filter(item=>item.id!==customId);return;}
          if(frameModalOwner!==ownerType || modalFrameDraft!==staged || staged.frameId!==selectionId){notify('素材已加入图库，当前新选择保持不变');return;}
          selectModalFrame(staged,{frameId:customId,frameMediaId:mediaId,frameData:''});
          if (frameModalOwner && document.querySelector('[data-testid="avatar-frame-modal"]')) {
            patchFrameModalBodyAndTabsInPlace(ownerType);
          } else {
            render(false);
          }
          notify(`已上传「${cleanName}」并放入当前弹窗预览（点击「应用」确认）`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          notify('上传自定义头像框失败：' + msg);
        }
      })();
      return;
    }
    if (el.id === 'photo-upload') {
      sendFileAttachment(
        el.files?.[0],
        'photo',
        ($('#photo-caption') as HTMLInputElement | null)?.value || ''
      );
    }
    if (el.id === 'sticker-upload') {
      sendFileAttachment(
        el.files?.[0],
        'sticker',
        ($('#sticker-caption') as HTMLInputElement | null)?.value || ''
      );
    }
    if (el.id === 'audio-upload') {
      sendFileAttachment(
        el.files?.[0],
        'voice',
        ($('#voice-caption') as HTMLInputElement | null)?.value || ''
      );
    }
    if (el.id === 'backup-file' || el.id === 'landing-backup-file') {
      importBackup(el.files?.[0]);
    }


  });

  appRoot.addEventListener('input', (e) => {
    const el = e.target as HTMLTextAreaElement | HTMLInputElement;
    if(el.hasAttribute('data-scoped-draft')){captureDrafts(el);return;}
    if (el.id === 'focus-task-input') {
      focusTaskInputDraft = el.value;
      return;
    }
    if (el.id === 'focus-minutes-slider') {
      ensureFocusData();
      const mins = clampFocusMinutes(Number(el.value) || FOCUS_DEFAULT_MINUTES, true);
      data.focus!.workMinutes = mins;
      const clockEl = document.querySelector<HTMLElement>('[data-testid="focus-planned-clock"]');
      if (clockEl) clockEl.textContent = `${String(mins).padStart(2, '0')}:00`;
      const labelEl = document.querySelector<HTMLElement>('[data-testid="focus-planned-label"]');
      if (labelEl) labelEl.textContent = `${mins} 分钟`;
      const startBtnEl = document.querySelector<HTMLElement>('[data-testid="start-focus-btn"]');
      if (startBtnEl) startBtnEl.textContent = `开始专注 · ${mins} 分钟`;
      return;
    }
    if (el.id === 'terminal-staged-frame-name') {
      stagedTerminalFrameName = el.value;
      return;
    }
    if (el.dataset.frameAdjustInput) {
      const ownerType = el.dataset.owner === 'user' ? 'user' : 'role';
      const staged = getActiveModalOrFormFrameDraft(
        ownerType,
        formMode === 'edit' ? data.roles.find((x) => x.id === editingRoleId) : role()
      );
      const field = el.dataset.frameAdjustInput;
      if (field === 'size') {
        staged.frameScale = Math.max(0.5, Math.min(3, Number(el.value) || 1.25));
      } else if (field === 'x') {
        staged.frameX = Math.max(-80, Math.min(80, Number(el.value) || 0));
      } else if (field === 'y') {
        staged.frameY = Math.max(-80, Math.min(80, Number(el.value) || 0));
      }
      document
        .querySelectorAll<HTMLElement>('.frame-live-preview .avatar-frame')
        .forEach((imgEl) => {
          imgEl.style.cssText = frameStyle(staged);
          const box=imgEl.closest<HTMLElement>('[data-avatar-box]');
          if(box) delete box.dataset.avatarRenderKey;
        });
      return;
    }
    if (el.id === 'frame-search-input') {
      const ownerType = frameModalOwner || 'role';
      frameGallerySearch = el.value;
      frameGalleryPage = 0;
      patchFrameModalPresetGridInPlace(ownerType);
      return;
    }

  });

  appRoot.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if (
      target.id === 'focus-task-input' &&
      e.key === 'Enter' &&
      !isComposing &&
      !e.isComposing
    ) {
      e.preventDefault();
      const addBtn = document.querySelector<HTMLButtonElement>('[data-testid="focus-add-task-btn"]');
      addBtn?.click();
      return;
    }
    if (
      target.tagName === 'TEXTAREA' &&
      (target.id === 'message-input' ||
        target.id === 'novel-input' ||
        target.id === 'intermission-input') &&
      e.key === 'Enter' &&
      !e.shiftKey &&
      !isComposing &&
      !e.isComposing
    ) {
      e.preventDefault();
      target.closest('form')?.requestSubmit();
    }
  });

  if(saveSession.hasWriter()){
    for (const roleItem of data.roles) {
      recoverChatTiming(roleItem);
      recoverProactive(roleItem);
      syncRoleDiaryTasks(roleItem, data.settings, now(), { resetGenerating: true });
    }
    traceStorage('app-recovery-started',{scenes:data.roles.filter(r=>r.scene).length,tickets:data.roles.reduce((n,r)=>n+r.chats.filter(m=>m.sceneReply).length,0)});
    if(!save()){traceStorage('startup-save-failed');throw Error('startup-storage-unconfirmed');}
    traceStorage('startup-save-confirmed');
    for(const item of data.roles)resumeLocalSceneReplies(item);
    if(canUseRealModel(data.settings))void processDiaryQueue();
  }
  window.addEventListener('storage',event=>{if(event.key===STORAGE_KEY||event.key===null)refreshSaveAccess();});
  window.addEventListener('pagehide',event=>{
    modelPageHidden=true;
    modelPageEpoch++;
    // A dispatched diary can still store its existing F05 receipt on BFCache return.
    for(const [request,keepOnBFCache] of activeModelReads){
      if(!event.persisted||!keepOnBFCache)request.cancel();
    }
    captureDrafts();
    voicePageHidden=true;
    suspendVoiceOperations(true);
  });
  window.addEventListener('pageshow',event=>{
    modelPageHidden=false;
    for(const request of activeModelReads.keys())request.check();
    if(!event.persisted)return;
    voicePageHidden=false;
    if(view==='chat'&&chatPanel==='voice')render(false);
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden&&(voiceOperation?.phase==='waiting'||voiceOperation?.phase==='recording'))leaveVoicePanel();
    else if(!document.hidden&&!voicePageHidden&&view==='chat'&&chatPanel==='voice')render(false);
    if(document.hidden)captureDrafts();
    if(!document.hidden){
      for(const request of activeModelReads.keys())request.check();
      refreshSaveAccess();if(view==='home')homeTasks.refresh();
    }
  });
  window.addEventListener(SAVE_ACCESS_EVENT,refreshSaveAccess);
  queueMicrotask(()=>{if(saveSession.current()){pumpChatSchedules();pumpProactive();pumpRoleLife();}});

  if (typeof setInterval === 'function') {
    setInterval(() => {
      if(!saveSession.current())return;
      refreshSystemLogs();
      if(view==='home')homeTasks.refresh();
      pumpChatSchedules();
      pumpProactive();
      pumpRoleLife();
      let chatDelivered=false;for(const item of data.roles){if(deliverPending(item)&&item.id===data.selected)chatDelivered=true;}
      let update = syncFocusMoments() || chatDelivered;
      update = completeFocusIfDue() || update;

      // Midnight (00:00) local calendar date rollover detection
      const currentLocalDay = toLocalDateKey(now());
      if (currentLocalDay !== lastObservedLocalDay) {
        lastObservedLocalDay = currentLocalDay;
        for (const roleItem of data.roles) {
          syncRoleDiaryTasks(roleItem, data.settings, now(), {
            ensureYesterday: true,
          });
        }
        syslog('diary', `跨日检测 (00:00)：已为各角色排入前一日私人日记生成队列`);
        save();
        if (canUseRealModel(data.settings)) {
          void processDiaryQueue();
        }
        update = true;
      }

      // Always keep visible clocks fresh without re-rendering
      document
        .querySelectorAll<HTMLElement>('.homescreen-time')
        .forEach((el) => {
          const next = hm(Date.now());
          if (el.textContent !== next) el.textContent = next;
        });

      if (
        update &&
        (view === 'chat' ||
          view === 'focus' ||
          view === 'home' ||
          view === 'monitor' ||
          view === 'diary') &&
        !busy
      ) {
        const activeEl = document.activeElement as HTMLElement | null;
        const intermissionTools = document.querySelector<HTMLDetailsElement>(
          'details.intermission-tools'
        );
        const deferFullRender = shouldDeferFullRenderOnTick({
          isComposing,
          activeTagName: activeEl?.tagName || '',
          activeElementId: activeEl?.id || '',
          chatPanelOpen: Boolean(chatPanel),
          editingMessageId,
          intermissionToolsOpen: Boolean(intermissionTools?.open),
        });
        if (deferFullRender || view==='chat') {
          patchDynamicRegionsOnTick();
        } else {
          render();
        }
      } else if (view === 'focus') {
        renderFocusTick();
      }
    }, 850);
  }

  render();
  if(nainMigration.cleaned)notify('奈恩的演示开场已清理，角色资料保留，清档前副本已保存。');
  else if(nainMigration.error)notify(nainMigration.error);
}
