import {readCompletion} from './core/apiResponse';
import {buildRegenerationPlan} from './core/regeneration';
import {startReplyTask as startScopedReplyTask} from './core/replyTask';
import {renderAvatar} from './avatarView';
import {frameCompositionSpan,framePlacement,frameStyle,frameKey,rememberFrame,type FrameAdjustment,type FrameFields} from './core/avatarFrameLayout';
import {PRESET_FRAME_FITS} from './core/avatarFrameFits';
import {inspectFrameBlob,persistAppearance} from './core/avatarAppearance';
import {safeBubbleCSS, BUBBLE_CSS_LIMIT} from './core/bubbleCss';
import {completionLimit} from './core/outputBudget';
import {uploadedStickers} from './core/stickers';
import {migrateUntouchedNainDemo,resetNainStart,NAIN_BACKUP_PREFIX} from './core/nainStart';
import { createTerminalApi } from './terminalApi';
import { createFruitManager } from './fruitManager';
import type {
  ActiveFocusSession,
  AppData,
  ChatMessage,
  CustomAvatarFrame,
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
  mediaDelete,
  mediaGet,
  mediaPut,
  restoreMediaFromBackup,
} from './core/media';
import {
  buildQuoteMetadata,
  editMessage,
  ensureRevisionsList,
  getActiveEvents,
  getActiveMessages,
  getScopeMessages,
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
  applyAiDailyFootprints,
  buildDailyFootprintsAiPrompt,
  buildFootprintCalendarMonth,
  getOrBuildDailyFootprints,
  renderSafeFootprintArtifact,
  resolveSafeMonitorDateKey,
} from './core/footprints';
import {
  applyGeneratedCharacterDiary,
  buildCharacterDiaryPrompt,
  collectDailyDiaryFacts,
  createUserDiary,
  getCharacterDiaryDateKey,
  getLocalDayBounds,
  getRoleKnownEvents,
  hasCharacterDiaryForDate,
  isDiarySharedWithRole,
  markDiaryTaskFailed,
   parseDateKeyParts,
  shareDiaryWithRole,
  shiftDateKey,
  syncRoleDiaryTasks,
  toLocalDateKey,
} from './core/diary';
import {
  applyGeneratedFirstMessage,
  buildFirstMessagePrompt,
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
  buildMessagesForModel,
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

export function initElsewhereApp(): void {
  const fruitManager = createFruitManager(()=>{const p=role()?.preset||data.preset;return p?`旧版附加预设「${p.name}」（${p.prompts.length} 条）用途未确认，已保留原配置并暂停所有正式模式注入；新版预设仍仅用于预览。`:'';});
  const terminalApi = createTerminalApi({settings:()=>data.settings,key:()=>token,save:(settings,key)=>{
    data.settings=settings;token=key;
    for(const item of data.roles)syncRoleDiaryTasks(item,data.settings,now());
    save();
    if(canUseRealModel(data.settings))void processDiaryQueue();
  }});
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

  let rawLoaded: unknown = null;
  let originalSave: string | null = null;
  try {
    originalSave=localStorage.getItem(STORAGE_KEY);
    rawLoaded = JSON.parse(originalSave || 'null');
  } catch {
    rawLoaded = null;
  }
  const normalizedData=normalizeAndMigrateData(rawLoaded);
  const nainMigration=originalSave?migrateUntouchedNainDemo(normalizedData,localStorage,Date.now(),originalSave):{data:normalizedData,cleaned:false,error:undefined};
  let data: AppData = nainMigration.data;

  let view = 'landing';
  let lastRenderedView = 'landing';
  let roleFormReturnView: 'chat' | 'roleinfo' | 'landing' = 'landing';
  let pendingScrollAnchorSelector = '';
  let diaryTab: 'char' | 'me' = 'char';
  let formMode: 'new' | 'edit' = 'new';
  let editingRoleId: string | null = null;
  let deleteRoleId: string | null = null;
  const busyRoles = new Set<string>();
  const isBusy = (): boolean => Boolean(role() && busyRoles.has(role()!.id));
  const replyGenerations = new Map<string, number>();
  const startReplyTask = (r:RoleData, scope:RevisionScope, message:ChatMessage): (()=>boolean) =>
    startScopedReplyTask(()=>data.roles,replyGenerations,r,scope,message);
  // shortcut: retries live only in memory; persist recovery with the E-03 task state.
  const failedChatReplies = new Map<string,{roleId:string; messageId:string; text:string; revision:number}>();
  const failedNovelReplies = new Map<string,{roleId:string; messageId:string; text:string; revision:number; kind:'scene'|'play'; sessionId:string}>();
  let token = '';
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let focusedRole: string | null = null;
  let chatPanel = '';
  let chatDraft = '';
  let novelDraft = '';
  let intermissionDraft = '';
  let voiceRecorder: MediaRecorder | null = null;
  let voiceStart = 0;
  let voiceCancelled = false;
  const mediaURLs = new Map<string,string>();
  const mediaReads = new Map<string,Promise<Blob|undefined>>();
  let detailId = '';

  // Phase 1 state: IME composition guard, inline message editing, quote replying, revision history drawer
  let isComposing = false;
  let editingMessageId: string | null = null;
  let editingMessageScope: RevisionScope = 'chat';
  let editingMessageDraft = '';
  let quotingMessage: MessageQuote | null = null;
  let showRevisionsDrawer = false;

  interface StagedFrameState {
    frameId: string;
    frameMediaId: string;
    frameData: string;
    frameScale: number;
    frameX: number;
    frameY: number;
    frameAdjustments?: Record<string,FrameAdjustment>;
  }

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
  let monitorTab: 'footprints' | 'raw' = 'footprints';
  let showFootprintCalendar = false;
  let footprintCalYear = new Date(now()).getFullYear();
  let footprintCalMonth = new Date(now()).getMonth() + 1;
  let footprintAiBusy = false;

  // Track B, UI 02 & UI 03-A state: Preset & Custom Avatar Frame Modal Picker
  let frameGallerySourceTab: 'preset' | 'custom' = 'preset';
  let frameGallerySearch = '';
  let frameGalleryPage = 0;
  const FRAME_PAGE_SIZE = 36;
  let frameModalOwner: 'role' | 'user' | null = null;
  let modalFrameDraft: StagedFrameState | null = null;
  let frameModalAdjustOpen = false;
  let frameModalSaving = false;
  let frameSelection = 0;

  // UI 03-B state: Focus companion system (task input draft, history date picker, settlement modal, AI summary retry)
  let focusTaskInputDraft = '';
  let focusHistoryDateKey = toLocalDateKey(now());
  let focusSettlementModalSessionId: string | null = null;
  let focusSummaryAiBusy = false;

  function frameDefaults(owner:FrameFields):FrameAdjustment {
    const preset=findPresetFrameByIdOrUrl(owner.frameId||owner.frameData);
    return (preset&&PRESET_FRAME_FITS[preset.id])||(data.customFrames||[]).find(x=>x.id===owner.frameId||Boolean(owner.frameMediaId&&x.mediaId===owner.frameMediaId))?.fit||{scale:1.25,x:0,y:0};
  }
  function buildStagedFrameFromOwner(owner?:FrameFields|null):StagedFrameState {
    const fields={frameId:owner?.frameId||(owner?.frameData||owner?.frameMediaId?'custom':'none'),frameMediaId:owner?.frameMediaId||'',frameData:owner?.frameData||''};
    const p=framePlacement(owner||{},frameDefaults(fields));
    return {...fields,frameScale:p.scale,frameX:p.x,frameY:p.y,frameAdjustments:{...owner?.frameAdjustments}};
  }
  function selectFrame(staged:StagedFrameState,source:Pick<StagedFrameState,'frameId'|'frameMediaId'|'frameData'>):void {
    rememberFrame(staged);Object.assign(staged,source);frameSelection++;
    const key=frameKey(staged);let p=Object.hasOwn(staged.frameAdjustments||{},key)?staged.frameAdjustments![key]:frameDefaults(staged);
    if(!p||![p.scale,p.x,p.y].every(Number.isFinite))p=frameDefaults(staged);
    staged.frameScale=p.scale;staged.frameX=p.x;staged.frameY=p.y;
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

  function closeFrameModal(): void {
    frameSelection++;frameModalSaving=false;
    frameModalOwner = null;
    modalFrameDraft = null;
    frameModalAdjustOpen = false;
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
    } | null
  ): string {
    const savedNorm = buildStagedFrameFromOwner(savedOwner);
    const isModified =
      staged.frameId !== savedNorm.frameId ||
      staged.frameMediaId !== savedNorm.frameMediaId ||
      staged.frameData !== savedNorm.frameData ||
      Number(staged.frameScale) !== Number(savedNorm.frameScale) ||
      Number(staged.frameX) !== Number(savedNorm.frameX) ||
      Number(staged.frameY) !== Number(savedNorm.frameY);
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
    if (draftUserAvatarPreviewUrl) {
      URL.revokeObjectURL(draftUserAvatarPreviewUrl);
    }
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
    if (draftRoleAvatarPreviewUrl) {
      URL.revokeObjectURL(draftRoleAvatarPreviewUrl);
    }
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

  function userAvatarTag(u?:UserProfileData|null,cl='avatar',opts?:{previewUrl?:string;removed?:boolean;fallbackName?:string}):string {
    return renderAvatar(u,'user',cl,{...opts,defaults:frameDefaults(u||{})});
  }
  function avatarTag(r?:RoleData|null,cl='avatar',opts?:{previewUrl?:string;removed?:boolean;fallbackName?:string}):string {
    return renderAvatar(r,'role',cl,{...opts,defaults:frameDefaults(r||{})});
  }

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
        staged.frameScale = Math.max(0.25, Math.min(4, parsed));
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
        ? `当前预览：${activePresetItem.label}`
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

  function renderFrameAdjustDrawerHtml(ownerType:'role'|'user',staged:StagedFrameState):string {
    return `<div id="frame-adjust-${ownerType}" data-frame-adjust-owner="${ownerType}" data-testid="frame-adjust-drawer" class="frame-adjust-drawer"><div class="frame-adjust-grid">
      <label>大小<input class="field" data-frame-adjust-input="size" data-owner="${ownerType}" name="size" type="number" min="0.25" max="4" step="0.05" value="${staged.frameScale}"></label>
      <label>左右<input class="field" data-frame-adjust-input="x" data-owner="${ownerType}" name="x" type="number" min="-80" max="80" value="${staged.frameX}"></label>
      <label>上下<input class="field" data-frame-adjust-input="y" data-owner="${ownerType}" name="y" type="number" min="-80" max="80" value="${staged.frameY}"></label></div>
      <button class="btn small ghost" type="button" data-action="resetframeadjust" data-owner="${ownerType}" data-testid="frame-adjust-reset-btn">恢复默认</button>
      ${computeFrameModalStatusInfo(staged).isRemoteActive?`<details class="frame-secondary"><summary>离线使用</summary><button type="button" class="btn small ghost" data-action="cacheactiveframe" data-owner="${ownerType}" data-testid="frame-cache-btn-${ownerType}">缓存当前素材</button></details>`:''}</div>`;
  }

  function frameThumbnail(ownerType:'role'|'user',source:Pick<StagedFrameState,'frameId'|'frameMediaId'|'frameData'>,staged:StagedFrameState):string {
    const {baseOwner,displayName}=getModalBaseOwnerAndDisplayName(ownerType),selected=frameKey(source)===frameKey(staged);
    const stored=Object.hasOwn(staged.frameAdjustments||{},frameKey(source))?staged.frameAdjustments![frameKey(source)]:null;
    const fields=selected?staged:{...source,frameScale:stored?.scale??1.25,frameX:stored?.x??0,frameY:stored?.y??0,frameAdjustments:stored?{[frameKey(source)]:stored}:{}};
    const owner={...baseOwner,...fields,name:displayName},opts={previewUrl:ownerType==='user'?draftUserAvatarPreviewUrl:draftRoleAvatarPreviewUrl,removed:ownerType==='user'?draftUserAvatarRemove:draftRoleAvatarRemove};
    return ownerType==='user'?userAvatarTag(owner as UserProfileData,'avatar frame-thumb-avatar',opts):avatarTag(owner as RoleData,'avatar frame-thumb-avatar',opts);
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
                  ${frameThumbnail(ownerType,{frameId:item.id,frameData:item.url,frameMediaId:''},staged)}
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
    const customList = (Array.isArray(data.customFrames)?data.customFrames:[]).filter(x=>!frameGallerySearch||x.name.toLowerCase().includes(frameGallerySearch.toLowerCase()));
    const baseChar = Array.from(String(displayName).trim() || '?')[0] || '?';

    if (frameGallerySourceTab === 'preset') {
      const { gridHtml, paginationHtml } = renderFramePresetGridAndPaginationHtml(
        ownerType,
        displayName,
        staged
      );
      return `<div class="frame-preset-section">
        <div class="frame-grid" data-testid="preset-frame-grid">${gridHtml}</div>
        <div class="frame-pagination" data-testid="frame-pagination">${paginationHtml}</div>
      </div>`;
    }

    return `<div class="frame-custom-section" data-testid="custom-frame-section">
      <div class="row between" style="margin-bottom:10px;flex-wrap:wrap;gap:8px">
        <span class="tiny muted">我的头像框 · ${customList.length} 款</span>
        <label class="btn small ghost" style="cursor:pointer" data-testid="upload-custom-frame-label">
          ＋ 上传头像框
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
                        ${frameThumbnail(ownerType,{frameId:cf.id,frameMediaId:cf.mediaId||'',frameData:cf.dataUrl||''},staged)}
                      </div>
                      <span class="frame-cell-label">${esc(cf.name)}</span>
                    </button>

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
    avatarBoxEl.style.setProperty('--composition-span',String(frameCompositionSpan(staged,frameDefaults(staged))));

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
    frameImg.style.cssText=frameStyle(staged,frameDefaults(staged));
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

    if(frameModalAdjustOpen)patchFrameModalAdjustDrawerInPlace(ownerType);
    // 1. Update only the overlay <img class="avatar-frame"> inside the top preview
    const livePreviewEl =
      modalSheet.querySelector<HTMLElement>('.frame-live-preview');
    updateAvatarBoxFrameInPlace(livePreviewEl, staged);

    // 2. Update status label in modal header
    const statusEl = modalSheet.querySelector<HTMLElement>(
      `[data-testid="frame-active-status-${ownerType}"]`
    );
    if (statusEl) {
      statusEl.textContent = currentStatusText.replace('当前预览：','');
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
      toggleBtn.textContent = frameModalAdjustOpen?'收起调整':'调整位置与大小';
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
      presetTabBtn.textContent = '预设';
    }
    if (customTabBtn) {
      customTabBtn.classList.toggle('active', frameGallerySourceTab === 'custom');
      customTabBtn.textContent = '我的上传';
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
    frameSelection++;
    if (ownerType === 'role') {
      draftRoleFormValues = captureFormValues('role-form');
      const formDraft = getOrInitRoleFrameDraft(baseOwner as RoleData | null);
      modalFrameDraft = { ...formDraft,frameAdjustments:{...formDraft.frameAdjustments} };
    } else {
      draftUserFormValues = captureFormValues('user-profile-form');
      const formDraft = getOrInitUserFrameDraft();
      modalFrameDraft = { ...formDraft,frameAdjustments:{...formDraft.frameAdjustments} };
    }
    frameModalOwner = ownerType;
    frameModalAdjustOpen = false;

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
      modalBackdrop.querySelector<HTMLButtonElement>('.frame-modal-close')?.focus({preventScroll:true});
    }
  }

  function closeFrameModalInPlace(): void {
    const owner=frameModalOwner;
    closeFrameModal();
    document
      .querySelector<HTMLElement>('[data-testid="avatar-frame-modal-backdrop"]')
      ?.remove();
    clearMediaURLs();
    document.querySelector<HTMLButtonElement>(`[data-testid="open-${owner}-frame-modal-btn"]`)?.focus({preventScroll:true});
  }

  async function applyFrameModalInPlace(ownerType:'role'|'user'):Promise<void>{
    if(!modalFrameDraft||frameModalSaving)return;
    const draft=modalFrameDraft;syncModalAdjustInputsToStaged(ownerType,draft);rememberFrame(draft);
    const {baseOwner}=getModalBaseOwnerAndDisplayName(ownerType),selection=frameSelection;
    const patch={...draft,frameAdjustments:{...draft.frameAdjustments}};
    if(!baseOwner){draftRoleFrame=patch;closeFrameModalInPlace();patchProfileAppearance(ownerType,patch);notify('已选好头像框，创建角色时一并保存。');return;}
    const blob=ownerType==='user'?draftUserAvatarBlob:draftRoleAvatarBlob;
    const remove=ownerType==='user'?draftUserAvatarRemove:draftRoleAvatarRemove;
    frameModalSaving=true;
    const sheet=document.querySelector<HTMLElement>('[data-testid="avatar-frame-modal"]');
    sheet?.setAttribute('aria-busy','true');
    sheet?.querySelectorAll<HTMLInputElement|HTMLButtonElement>('button,input').forEach(el=>{if(el.dataset.action!=='cancelframemodal')el.disabled=true});
    const status=sheet?.querySelector<HTMLElement>('[data-frame-save-status]');if(status)status.textContent='正在保存…';
    try{
      const ok=await persistAppearance(baseOwner,patch,{blob,remove},{put:mediaPut,remove:mediaDelete,save,uid:()=>makeUid('ava'),current:()=>frameSelection===selection&&modalFrameDraft===draft&&(ownerType==='user'?data.user===baseOwner&&draftUserAvatarBlob===blob:data.roles.includes(baseOwner as RoleData)&&draftRoleAvatarBlob===blob)});
      if(!ok)return;
      const previousUrl=ownerType==='user'?draftUserAvatarPreviewUrl:draftRoleAvatarPreviewUrl;
      if(ownerType==='user'){draftUserAvatarBlob=null;draftUserAvatarRemove=false;draftUserAvatarPreviewUrl='';draftUserFrame=buildStagedFrameFromOwner(baseOwner);}
      else{draftRoleAvatarBlob=null;draftRoleAvatarRemove=false;draftRoleAvatarPreviewUrl='';draftRoleFrame=buildStagedFrameFromOwner(baseOwner);}
      closeFrameModalInPlace();patchProfileAppearance(ownerType,buildStagedFrameFromOwner(baseOwner));
      const box=document.querySelector<HTMLElement>(`[data-testid="${ownerType==='user'?'user':'role'}-avatar-editor"] .avatar-preview-box`);
      if(box&&(blob||remove)){
        box.querySelector('.avatar-img')?.remove();box.classList.remove('has-avatar-img','avatar-loaded');
        if(baseOwner.avatarMediaId){const img=document.createElement('img');img.className='avatar-img';img.alt='头像';img.dataset.mediaId=baseOwner.avatarMediaId;box.append(img);box.classList.add('has-avatar-img');await hydrateMedia(box);}
      }
      if(previousUrl)URL.revokeObjectURL(previousUrl);
      const label=document.querySelector<HTMLElement>(`[data-testid="${ownerType==='user'?'user':'role'}-avatar-status"]`);if(label)label.textContent='头像装扮已保存';
      notify('头像装扮已保存');
    }catch(error){if(frameSelection===selection&&status)status.textContent='保存失败，选择仍保留，请重试。';notify('头像装扮未保存：'+(error instanceof Error?error.message:String(error)));}
    finally{if(frameSelection===selection){frameModalSaving=false;sheet?.removeAttribute('aria-busy');sheet?.querySelectorAll<HTMLInputElement|HTMLButtonElement>('button,input').forEach(el=>el.disabled=false);}}
  }
  function patchProfileAppearance(ownerType:'role'|'user',staged:StagedFrameState):void {
    const card=document.querySelector<HTMLElement>(`[data-testid="${ownerType==='user'?'user':'role'}-avatar-editor"]`);
    updateAvatarBoxFrameInPlace(card?.querySelector('.avatar-preview-box')||null,staged);
    const label=card?.querySelector<HTMLElement>(`[data-testid="${ownerType==='user'?'user':'role'}-frame-current-label"]`);
    if(label)label.textContent=formatFrameDraftSummary(staged,getModalBaseOwnerAndDisplayName(ownerType).baseOwner);
  }

  function renderAvatarFrameModal(ownerType:'role'|'user',baseOwner?:RoleData|UserProfileData|null):string {
    const staged=getActiveModalOrFormFrameDraft(ownerType,baseOwner as RoleData|null),name=getModalBaseOwnerAndDisplayName(ownerType).displayName;
    const owner={...baseOwner,...staged,name},opts={previewUrl:ownerType==='user'?draftUserAvatarPreviewUrl:draftRoleAvatarPreviewUrl,removed:ownerType==='user'?draftUserAvatarRemove:draftRoleAvatarRemove};
    const avatar=ownerType==='user'?userAvatarTag(owner as UserProfileData,'avatar frame-live-preview',opts):avatarTag(owner as RoleData,'avatar frame-live-preview',opts);
    const title=computeFrameModalStatusInfo(staged).currentStatusText;
    return `<div class="frame-modal-backdrop" data-testid="avatar-frame-modal-backdrop"><div class="frame-modal-sheet" role="dialog" aria-modal="true" aria-label="选择头像框" data-testid="avatar-frame-modal" data-frame-owner="${ownerType}">
      <div class="frame-modal-header"><h3 class="frame-modal-title">选择头像框</h3><button type="button" class="frame-modal-close" data-action="cancelframemodal" aria-label="关闭头像框弹窗">×</button></div>
      <div class="frame-modal-preview"><div class="frame-preview-avatar-wrap">${avatar}</div><div class="frame-preview-info"><b data-testid="frame-active-status-${ownerType}">${esc(title.replace('当前预览：',''))}</b><button type="button" class="btn small ghost frame-adjust-toggle" data-action="toggleframeadjust" data-testid="toggle-frame-adjust-btn" aria-expanded="${frameModalAdjustOpen}">调整位置与大小</button></div></div>
      ${frameModalAdjustOpen?renderFrameAdjustDrawerHtml(ownerType,staged):''}
      <input type="search" id="frame-search-input" data-testid="frame-search-input" class="field frame-search-field" placeholder="搜索头像框编号或名称" value="${esc(frameGallerySearch)}" aria-label="搜索头像框">
      <div class="tabs frame-source-tabs" role="tablist" aria-label="头像框来源"><button type="button" data-action="framesourcetab" data-tab="preset" data-testid="frame-tab-preset" class="${frameGallerySourceTab==='preset'?'active':''}">预设</button><button type="button" data-action="framesourcetab" data-tab="custom" data-testid="frame-tab-custom" class="${frameGallerySourceTab==='custom'?'active':''}">我的上传</button></div>
      <div class="frame-modal-body">${renderFrameModalBodyInnerHtml(ownerType,name,staged)}</div>
      <div class="frame-modal-footer"><span class="tiny muted" role="status" data-frame-save-status>${baseOwner?'仅保存头像装扮，其他资料不变':'创建角色时一并保存'}</span><button type="button" class="btn secondary frame-modal-btn" data-action="cancelframemodal" data-testid="cancel-frame-modal-btn">取消</button><button type="button" class="btn frame-modal-btn" data-action="applyframemodal" data-testid="apply-frame-modal-btn">${baseOwner?'确认使用':'用于新角色'}</button></div>
    </div></div>`;
  }

  async function storeCustomFrame(blob:Blob,name:string,sourceUrl?:string,current:()=>boolean=()=>true):Promise<CustomAvatarFrame|null>{
    const mediaId=makeUid('frm_u');
    try{
      const preset=sourceUrl?findPresetFrameByIdOrUrl(sourceUrl):undefined;
      const measured=(preset&&PRESET_FRAME_FITS[preset.id])||await inspectFrameBlob(blob);
      const fit=measured?{...measured,scale:Number(measured.scale.toFixed(3)),x:Number(measured.x.toFixed(2)),y:Number(measured.y.toFixed(2))}:undefined;
      await mediaPut(mediaId,blob);
      if(!current()){await mediaDelete(mediaId).catch(()=>{});return null;}
      const item:CustomAvatarFrame={id:makeUid('cf'),name,mediaId,createdAt:now(),...(sourceUrl?{sourceUrl}:{}),...(fit?{fit}:{})};
      if(!Array.isArray(data.customFrames))data.customFrames=[];data.customFrames.unshift(item);
      if(!save()){data.customFrames=data.customFrames.filter(x=>x!==item);throw new Error('图库写入失败');}
      return item;
    }catch(error){await mediaDelete(mediaId).catch(()=>{});throw error;}
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
                  <span class="avatar large has-avatar-frame frame-live-preview">
                    <span class="avatar-fallback">预</span>
                    <img class="avatar-frame" src="${esc(
                      stagedTerminalFramePreviewUrl
                    )}" alt="待入库头像框预览" style="--frame-size:1.25;--frame-x:0px;--frame-y:0px">
                  </span>
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
                    <button type="button" class="btn small" data-action="confirmterminalframeupload" data-testid="terminal-frame-confirm-btn">✓ 确认加入头像框图库</button>
                    <button type="button" class="btn small ghost" data-action="cancelterminalframeupload" data-testid="terminal-frame-cancel-btn">✕ 取消上传</button>
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
    Boolean(r && focusedRole === r.id);
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
    const h = new Date(t).getHours();
    if (r.scene || r.play) {
      return {
        type: 'later' as const,
        dueAt: t + 3600000,
        reason: '我这边还有事没结束，等会儿找你。',
      };
    }
    if (h >= 22 || h < 7) {
      return {
        type: 'declined' as const,
        dueAt: t + (((7 - h + 24) % 24) || 24) * 3600000,
        reason: '有点晚了，我想先休息。明天我们再好好聊？',
      };
    }
    if (h >= 9 && h < 12) {
      return {
        type: 'later' as const,
        dueAt: t + (12 - h) * 3600000 - new Date(t).getMinutes() * 60000,
        reason: '我还在忙工作，午休有空的话再找你，好吗？',
      };
    }
    if (h >= 14 && h < 20) {
      return {
        type: 'later' as const,
        dueAt: t + (20 - h) * 3600000 - new Date(t).getMinutes() * 60000,
        reason: '我现在还走不开。等晚点有空了，我来问你。',
      };
    }
    return {
      type: 'accepted' as const,
      dueAt: null,
      reason: '我现在有空。来，认真聊一会儿。',
    };
  }

  const save = (): boolean => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch {
      notify('存储空间不足，请先导出或清理数据');
      return false;
    }
  };

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
      { speaker, messageId, knownBy: ['user', r.id] }
    );
  }

  function charNote(r: RoleData, msg: string, at = now()): void {
    if(awaitingNainOpening(r))return;
    const id = uid();
    r.chats.push({
      id,
      speaker: 'char',
      text: msg,
      at,
      kind: 'chat',
      status: 'active',
    });
    eMemory(r, msg, 'char', 'chat', at, id);
  }

  function resolveChatInvite(r?: RoleData): boolean {
    const inv = r?.chatInvite;
    if (!r || !inv || !inv.dueAt || now() < inv.dueAt) return false;
    if (inv.status === 'later') {
      inv.status = 'offered';
      inv.dueAt = null;
      charNote(r, '我现在忙完了。之前说好晚点找你——你还想专心聊一会儿吗？');
      save();
      return true;
    }
    if (inv.status === 'declined') {
      r.chatInvite = null;
      save();
      return true;
    }
    return false;
  }

  function requestChatFocus(r: RoleData): void {
    if(awaitingNainOpening(r)){notify('请先连接 API 并生成首条消息，再邀请专心聊。');return;}
    if (isFocused(r)) {
      focusedRole = null;
      r.chatInvite = null;
      syslog('chat', `退出专心聊 (${r.name})`);
      save();
      render(false);
      notify('已退出专心聊，恢复日常联系');
      return;
    }
    resolveChatInvite(r);
    if (r.chatInvite?.status === 'offered') {
      r.chatInvite = null;
      focusedRole = r.id;
      charNote(r, '好，那现在就专心聊。');
      save();
      render();
      return;
    }
    if (r.chatInvite?.status === 'later' || r.chatInvite?.status === 'declined') {
      const nudgeMsgId = uid();
      const nudgeAt = now();
      r.chats.push({
        id: nudgeMsgId,
        speaker: 'me',
        text: '还是想现在和你专心聊几句，方便吗？',
        at: nudgeAt,
        kind: 'chat',
        status: 'active',
      });
      eMemory(r, '再次邀请对方进入专心聊天', 'me', 'chat', nudgeAt, nudgeMsgId);
      charNote(
        r,
        '好吧，看你这么想聊，我就先放下手头的事，专心陪你聊一会儿。'
      );
      r.chatInvite = null;
      focusedRole = r.id;
      save();
      render();
      return;
    }
    const available = chatAvailability(r);
    const inviteMsgId = uid();
    const inviteAt = now();
    r.chats.push({
      id: inviteMsgId,
      speaker: 'me',
      text: '现在方便专心聊一会儿吗？',
      at: inviteAt,
      kind: 'chat',
      status: 'active',
    });
    eMemory(r, '邀请对方进入专心聊天', 'me', 'chat', inviteAt, inviteMsgId);
    charNote(r, available.reason);
    if (available.type === 'accepted') {
      focusedRole = r.id;
      r.chatInvite = null;
    } else {
      focusedRole = null;
      r.chatInvite = { status: available.type, dueAt: available.dueAt };
    }
    save();
    render();
  }

  async function requestAiLiveLogForActiveSession(
    sessionId: string,
    momentId: string,
    roleId: string
  ): Promise<void> {
    if (!canUseRealModel(data.settings)) return;
    const f = activeFocus();
    if (!f || f.id !== sessionId || f.status !== 'running' || f.liveLogBusy) return;
    const roleItem = data.roles.find((r) => r.id === roleId);
    if (!roleItem) return;

    f.liveLogBusy = true;
    try {
      const s = data.settings;
      const url = s.endpoint.trim().replace(/\/+$/, '');
      const elapsedMin = Math.max(1, Math.round(focusElapsed(f) / 60000));
      const promptText = buildFocusLiveLogAiPrompt(roleItem, f, elapsedMin);
      const res = await fetch(url + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
        body: JSON.stringify({
          model: s.model,
          messages: [{ role: 'user', content: promptText }],
          temperature: +s.temperature || 0.7,
          ...completionLimit(s,'focus-log'),
        }),
      });
      const raw = await readCompletion(res);
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('模型未返回有效的专注动态数据');
      const parsed = JSON.parse(match[0]);

      // Strictly bind to session.id so late API responses never pollute an ended session
      const currentSession = activeFocus();
      if (!currentSession || currentSession.id !== sessionId) return;
      const targetMoment = (currentSession.moments || []).find((m) => m.id === momentId);
      if (targetMoment && parsed.detail) {
        if (parsed.title) targetMoment.title = String(parsed.title).slice(0, 48);
        targetMoment.detail = String(parsed.detail).slice(0, 220);
        if (parsed.innerThought) {
          targetMoment.innerThought = String(parsed.innerThought).slice(0, 120);
        }
        targetMoment.isAiGenerated = true;
      }
      if (parsed.statusText) {
        const pState = (currentSession.participants || []).find(
          (p) => p.roleId === roleId
        );
        if (pState) {
          pState.statusText = String(parsed.statusText).slice(0, 60);
          if (parsed.innerThought) {
            pState.currentThought = String(parsed.innerThought).slice(0, 120);
          }
        }
      }
      save();
      if (view === 'focus') render(false);
    } catch (err) {
      syslog('error', `专注动态润色失败：${err instanceof Error ? err.message : String(err)}`);
      if (view === 'focus') notify('AI 动态生成失败，已保留原有专注记录。');
    } finally {
      const currentSession = activeFocus();
      if (currentSession && currentSession.id === sessionId) {
        currentSession.liveLogBusy = false;
      }
    }
  }

  async function requestAiFocusSummariesForSession(
    sessionId: string,
    manualTrigger = false
  ): Promise<void> {
    ensureFocusData();
    const rec = (data.focus?.completed || []).find((c) => c.id === sessionId);
    if (!rec) return;
    const participantIds = rec.participantRoleIds || [];
    if (!participantIds.length) return;

    if (!canUseRealModel(data.settings)) {
      rec.summaryStatus = 'ready';
      rec.summaryError = undefined;
      save();
      if (manualTrigger) {
        notify('当前为本地演示模式，已展示基于角色人设与真实计时构建的专注小结');
      }
      render(false);
      return;
    }

    if (focusSummaryAiBusy) return;
    focusSummaryAiBusy = true;
    rec.summaryStatus = 'generating';
    rec.summaryError = undefined;
    save();
    render(false);

    let summaryFailed = false;
    try {
      const s = data.settings;
      const url = s.endpoint.trim().replace(/\/+$/, '');
      for (const roleId of participantIds) {
        const roleItem = data.roles.find((r) => r.id === roleId);
        if (!roleItem) continue;
        const promptText = buildFocusSummaryAiPrompt(roleItem, rec);
        const res = await fetch(url + '/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: 'Bearer ' + token } : {}),
          },
          body: JSON.stringify({
            model: s.model,
            messages: [{ role: 'user', content: promptText }],
            temperature: +s.temperature || 0.7,
            ...completionLimit(s,'focus-summary'),
          }),
        });
        const text = await readCompletion(res);
        const latestRec = (data.focus?.completed || []).find(
          (c) => c.id === sessionId
        );
        if (!latestRec) return;
        if (!Array.isArray(latestRec.roleSummaries)) {
          latestRec.roleSummaries = [];
        }
        const idx = latestRec.roleSummaries.findIndex((x) => x.roleId === roleId);
        const updatedSummary = {
          roleId: roleItem.id,
          roleName: roleItem.name,
          text: text.slice(0, 320),
          at: now(),
          source: 'ai' as const,
        };
        if (idx >= 0) latestRec.roleSummaries[idx] = updatedSummary;
        else latestRec.roleSummaries.push(updatedSummary);
      }
      const latestRec = (data.focus?.completed || []).find(
        (c) => c.id === sessionId
      );
      if (latestRec) {
        latestRec.summaryStatus = 'ready';
        latestRec.summaryError = undefined;
      }
      save();
      if (manualTrigger) notify('已更新 AI 角色专注小结');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const latestRec = (data.focus?.completed || []).find(
        (c) => c.id === sessionId
      );
      if (latestRec) {
        latestRec.summaryStatus = 'failed';
        latestRec.summaryError = `AI 小结请求未完成（${msg}），已保留本次真实计时归档与基础小结，可随时点击重试。`;
      }
      syslog('error', `专注角色小结生成失败：${msg}`);
      save();
      summaryFailed = true;
    } finally {
      focusSummaryAiBusy = false;
      render(false);
      if (manualTrigger && summaryFailed) notify('AI 角色小结生成失败，可点击重试');
    }
  }

  function syncFocusMoments(): boolean {
    const f = activeFocus();
    if (!f || f.status !== 'running') return false;
    const added = syncActiveFocusLiveLogs(f, data.roles, now());
    if (added.length > 0) {
      save();
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
    save();
    if (
      canUseRealModel(data.settings) &&
      (settled.participantRoleIds || []).length > 0
    ) {
      void requestAiFocusSummariesForSession(settled.id, false);
    }
    return true;
  }

  function startCompanionFocus(): void {
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
    if (!f || f.status !== 'running') return;
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
    if (!f || f.status !== 'paused') return;
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
    if (!f) return;
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
      if (
        canUseRealModel(data.settings) &&
        (settled.participantRoleIds || []).length > 0
      ) {
        void requestAiFocusSummariesForSession(settled.id, false);
      }
    }
    save();
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
            <span class="focus-moment-icon">${esc(m.icon || '⏳')}</span>
            <div class="focus-moment-body">
              <div class="focus-moment-head">
                <b>${esc(m.title)}</b>
                <time>${hm(m.at)}</time>
              </div>
              <p>${esc(m.detail)}</p>
              ${
                m.innerThought
                  ? `<div class="focus-moment-thought">💭 内心：${esc(
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
    const bubbles = splitNaturalChatBubbles(text, r || role());
    return bubbles.length ? bubbles : [String(text || '').trim()].filter(Boolean);
  }

  function deliverPending(r?: RoleData): boolean {
    if (!r?.pendingReplies?.length) return false;
    const remaining = [];
    let changed = false;
    for (const job of r.pendingReplies) {
      if (job.sourceRevision !== undefined && !getActiveMessages(r.chats).some(m => m.id === job.replyTo && m.speaker === 'me' && (m.revisionCount || 0) === job.sourceRevision)) {
        changed = true;
        continue;
      }
      if (job.dueAt > Date.now()) {
        remaining.push(job);
        continue;
      }
      const turnId = job.replyTurnId || job.id;
      const baseAt = now();
      (job.bubbles || []).forEach((bubble, idx) => {
        const at = baseAt + idx;
        const item: ChatMessage = {
          id: uid(),
          speaker: 'char',
          text: bubble,
          at,
          kind: 'chat',
          replyTo: job.replyTo,
          replyTurnId: turnId,
          status: 'active',
        };
        r.chats.push(item);
        if(r.firstMessageState?.status!=='ready')r.firstMessageState={status:'ready',updatedAt:at};
        eMemory(r, bubble, 'char', 'chat', at, item.id);
      });
      changed = true;
    }
    r.pendingReplies = remaining;
    if (changed) save();
    return changed;
  }

  function queueChatReply(
    r: RoleData,
    text: string,
    replyTo: string,
    focused: boolean
  ): void {
    const bubbles = splitChatBubbles(text, r);
    if (!bubbles.length) return;
    const turnId = makeUid('turn');
    const sourceRevision = r.chats.find(m => m.id === replyTo && m.speaker === 'me')?.revisionCount || 0;
    if (!r.pendingReplies) r.pendingReplies = [];

    if (focused || bubbles.length === 1) {
      r.pendingReplies.push({
        id: uid(),
        replyTo,
        replyTurnId: turnId,
        bubbles,
        dueAt: Date.now(),
        sourceRevision,
      });
      deliverPending(r);
      return;
    }

    // Deliver the first bubble immediately for responsive feel, and stagger follow-up bubbles naturally
    r.pendingReplies.push({
      id: uid(),
      replyTo,
      replyTurnId: turnId,
      bubbles: [bubbles[0]],
      dueAt: Date.now(),
      sourceRevision,
    });
    deliverPending(r);

    const followUps = bubbles.slice(1);
    const staggerMs = 240;
    r.pendingReplies.push({
      id: uid(),
      replyTo,
      replyTurnId: turnId,
      bubbles: followUps,
      dueAt: Date.now() + staggerMs,
      sourceRevision,
    });
    save();
    setTimeout(() => {
      if (deliverPending(r)) {
        if (view === 'chat' && role()?.id === r.id) {
          const sc = document.querySelector<HTMLElement>('#scroll-area');
          if (sc && sc.dataset.roleId === r.id && !editingMessageId) {
            clearMediaURLs();
            sc.innerHTML = renderChatMessagesHtml(r);
            hydrateMedia();
            sc.scrollTop = sc.scrollHeight;
            return;
          }
        }
        safeRenderWhenNotTyping();
      }
    }, staggerMs + 30);
  }

  function simulate(r: RoleData): void {
    const end = now();
    if(awaitingNainOpening(r)){r.lifeAt=end;return;}
    if (!Number.isFinite(r.lifeAt)) r.lifeAt = end;
    if (end <= r.lifeAt) return;
    if (r.scene) {
      r.lifeAt = end;
      return;
    }
    const gap = end - r.lifeAt;
    const step = 60 * 60000;
    let from = Math.floor(r.lifeAt / step) * step + step;
    const n = Math.floor((end - from) / step) + 1;
    if (n > 50) from = end - 49 * step;
    for (let t = from; t <= end; t += step) {
      const f = activeFocus();
      if (
        f &&
        isRoleInActiveFocus(r, f) &&
        (f.status === 'running' || f.status === 'paused') &&
        t >= f.startedAt
      ) {
        continue;
      }
      const a = routine(r, t);
      entry(r, 'life', a.label, `${a.where} · ${a.doing}`, t, {
        where: a.where,
      });
    }
    r.lifeAt = end;
    const activeChats = getActiveMessages(r.chats);
    if (
      gap > 90 * 60000 &&
      activeChats.length &&
      end - (r.lastInvitation || 0) > 6 * 3600000
    ) {
      const h = new Date(end).getHours();
      if (
        h > 8 &&
        h < 22 &&
        activeChats
          .slice(-2)
          .every((x) => x.speaker !== 'char' || end - x.at > 45 * 60000)
      ) {
        const a = routine(r, end);
        const invitation = h >= 18 && h <= 21 && new Date(end).getDate() % 3 === 0;
        const msg = invitation
          ? `刚离开${a.where}，想起一件想当面和你说的事。你今天有空出来坐坐吗？如果你不方便也没关系。`
          : `刚刚在${a.where}忙了一阵。${
              r.name === '奈恩'
                ? '今天想起了以前在伦敦的一件趣事。'
                : '今天有件事让我想到你。'
            } 你那边怎么样？`;
        const msgId = uid();
        r.chats.push({
          id: msgId,
          speaker: 'char',
          text: msg,
          at: end,
          kind: 'chat',
          proactive: true,
          status: 'active',
        });
        entry(r, 'chat', '主动发来消息', msg, end, {
          speaker: 'char',
          messageId: msgId,
        });
        r.lastInvitation = end;
      }
    }
    syncRoleDiaryTasks(r, data.settings, end);
    if (canUseRealModel(data.settings)) {
      void processDiaryQueue();
    }
  }

  const glyph = (name: string): string => {
    const paths: Record<string, string> = {
      chat: '<path d="M4 5.5h16v10.5H9l-5 4v-4z"/><path d="M8 10h8"/>',
      diary: '<path d="M6 3.5h13v17H6z"/><path d="M9 3.5v17M12 8h4m-4 4h4"/>',
      focus: '<circle cx="12" cy="13" r="8"/><path d="M12 7.5v5.5l3.3 2M10 2h4"/>',
      monitor:
        '<rect x="3.5" y="5.5" width="17" height="13" rx="3"/><circle cx="12" cy="12" r="3.2"/><path d="M7.5 5.5l1-2h7l1 2"/>',

      presets:'<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8m-8 4h8m-8 4h5"/>',
      drama:
        '<path d="M4 5c2 0 4 1 7 1s5-1 7-1v7c0 5-3 8-7 9-4-1-7-4-7-9z"/><path d="M7 10h2m4 0h2m-7 4c2 1.5 5 1.5 7 0"/>',

      terminal:
        '<path d="m5 8 4 4-4 4M11 17h8"/><rect x="2.5" y="3.5" width="19" height="17" rx="3"/>',

      tasks:
        '<rect x="4" y="4" width="16" height="17" rx="3"/><path d="M8 9l1.6 1.6L12 8m2 2h3M8 16l1.6 1.6L12 15m2 2h3"/>',
      deadline:
        '<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 10h16m-8 3v3l2 1"/>',
    };
    return `<svg class="app-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${
      paths[name] || paths.chat
    }</svg>`;
  };

  const header = (title: string, back = 'home', right = ''): string =>
    `<div class="top"><button class="back-btn" data-action="view" data-view="${esc(
      back
    )}" aria-label="返回">‹ <span>返回</span></button><div class="grow"><h1>${esc(
      title
    )}</h1></div>${right}</div>`;

  const status = (): string =>
    `<div class="status"><span class="status-time">${hm(
      Date.now()
    )}</span><span class="status-right"><svg viewBox="0 0 44 16" width="44" height="16" aria-hidden="true"><path d="M1 11h3v4H1zm5-3h3v7H6zm5-3h3v10h-3zm5-3h3v13h-3z" fill="currentColor"/><path d="M25 6a10 10 0 0 1 13 0M28 9a6 6 0 0 1 7 0M31.6 12h.4" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg><span class="battery"><i></i></span></span></div>`;

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
        : view === 'novel'
        ? 'novel-view'
        : view === 'intermission'
        ? 'novel-view intermission-view'
        : view === 'chat'
        ? 'chat-view'
        : 'app-view'
    } theme-${esc(
      role()?.theme || 'blue'
    )}"><div class="wallpaper" aria-hidden="true"></div>${status()}${content}${
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
      frameAdjustments:stagedFrame.frameAdjustments,
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
      ? '新头像待确认，可与头像框一并确认使用'
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
      )}</textarea></div><button class="btn full" type="submit" data-testid="save-user-profile-btn">保存我的资料</button><button class="btn full secondary" type="button" data-action="canceluserprofile" data-testid="cancel-user-profile-btn" style="margin-top:8px">放弃未保存的资料并返回</button></div></form>
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
      frameAdjustments:stagedFrame.frameAdjustments,
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
      frameAdjustments:stagedFrame.frameAdjustments,
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
      }</button><button class="btn full secondary" type="button" data-action="cancelroleform" data-testid="cancel-role-form-btn" style="margin-top:8px">放弃未保存的资料并返回</button></form>${
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
      `<div class="home-desktop"><div class="home-toolbar"><span>ELSEWHERE <button class="user-shortcut" data-action="view" data-view="userprofile" aria-label="编辑我的资料">我的资料</button> <button class="user-shortcut" data-action="view" data-view="roleinfo">角色资料</button></span><button data-action="view" data-view="landing" aria-label="切换角色">${esc(
        avatar(r)
      )} <span>切换角色</span>⌄</button></div>
 <div class="homescreen-clock"><div class="homescreen-date">${
   when.getMonth() + 1
 }月${when.getDate()}日 · ${
        weekdays[when.getDay()]
      }</div><div class="homescreen-time">${hm(Date.now())}</div></div>
 <button class="home-widget" data-action="view" data-view="chat"><div class="home-widget-top"><div class="widget-person">${avatarTag(
   r,
   'widget-avatar'
 )}<div><b>${esc(r.name)}</b><small>${esc(a.label)} · ${esc(
        a.where
      )}</small></div></div><span class="widget-arrow">›</span></div><div class="widget-divider"></div><div class="widget-bottom"><span class="widget-caption">${captionText}</span><span class="widget-action">打开聊天 →</span></div></button>
 <div class="shared-widgets">
 ${(
   [
     ['ddl', 'DDL', 'deadline'],
     ['todo', 'To-do', 'tasks'],
   ] as const
 )
   .map(
     ([kind, label, ic]) =>
       `<section class="mini-widget" aria-label="${label}"><div class="mini-head">${glyph(
         ic
       )}<strong>${label}</strong><span>${
         data.sharedTasks![kind].filter((x) => !x.done).length
       }</span></div><div class="mini-list" tabindex="0">${
         data
           .sharedTasks![kind].slice()
           .sort(
             (a, b) =>
               Number(a.done) - Number(b.done) ||
               String(a.due || '').localeCompare(String(b.due || ''))
           )
           .map(
             (t) =>
               `<div class="mini-task"><button title="切换完成" data-action="tasktoggle" data-kind="${kind}" data-id="${esc(
                 t.id
               )}" class="task-check ${t.done ? 'is-done' : ''}">${
                 t.done ? '✓' : ''
               }</button><span class="${t.done ? 'task-done' : ''}">${esc(
                 t.text
               )}${
                 t.due ? `<small>${esc(t.due)}</small>` : ''
               }</span><button title="删除" class="task-delete" data-action="taskdelete" data-kind="${kind}" data-id="${esc(
                 t.id
               )}">×</button></div>`
           )
           .join('') || '<div class="mini-empty">还没有项目</div>'
       }</div><form data-task-add="${kind}" class="mini-add"><input name="text" maxlength="140" required placeholder="${
         kind === 'ddl' ? '添加截止任务' : '添加待办'
       }" aria-label="${label} 新项目">${
         kind === 'ddl'
           ? '<input name="due" type="date" aria-label="截止日期">'
           : ''
       }<button aria-label="添加">＋</button></form></section>`
   )
   .join('')}
 </div>
 <div class="home-apps">${[
   ['diary', '日记'],
   ['monitor', '监控'],
   ['presets', '预设'],
 ]
   .map(([id, name]) => appTile(id, name))
   .join('')}</div>
 ${
   activeFocus()
     ? `<button class="home-ongoing" data-action="view" data-view="focus">专注 · 正在${
         activeFocus()!.phase === 'break' ? '休息' : '专注'
       } · 继续计时 <span>›</span></button>`
     : ''
 }
 ${
   ongoing(r)
     ? `<button class="home-ongoing" data-action="resume">✦ 继续${
         r.play ? '未落幕的戏剧' : '面对面的相处'
       } <span>›</span></button>`
     : ''
 }
 <div class="page-dots"><span></span><span></span></div></div>`
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
        ['sticker', '表情包'],
        ['photo', '照片'],
        ['packet', '红包'],
      ]
        .map(
          ([id, label]) =>
            `<button data-action="chatpanel" data-panel="${id}">${attachmentIcon(
              id
            )}<span>${label}</span></button>`
        )
        .join('')}</div></section>`;
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
      return `<section class="chat-drawer" aria-label="发送语音">${bar}<p class="drawer-note">点击录音，再点击结束并发送；也可以选择音频文件。请允许浏览器使用麦克风。</p><input class="caption-field" id="voice-caption" placeholder="可选：语音的文字内容（角色才能理解）" maxlength="800"><div class="voice-actions"><button data-action="recordtoggle" class="record-btn">${attachmentIcon(
        'voice'
      )} ${
        voiceRecorder?.state === 'recording' ? '结束并发送' : '开始录音'
      }</button>${
        voiceRecorder?.state === 'recording'
          ? '<button data-action="recordcancel" class="minor-btn">取消</button>'
          : ''
      }</div><label class="file-pick">${attachmentIcon(
        'voice'
      )} 选择现有音频文件（最大 8MB）<input type="file" id="audio-upload" accept="audio/*" class="file-input"></label><p class="drawer-note">没有文字内容的语音可以播放，但当前 AI 无法听懂；不会假装已经听过。</p></section>`;
    }
    if (chatPanel === 'packet') {
      return `<section class="chat-drawer" aria-label="虚拟红包">${bar}<form id="packet-form"><div class="packet-fields"><label>金额（虚拟 ¥）<input name="amount" type="number" inputmode="decimal" required min="0.01" max="200" step="0.01" placeholder="6.66"></label><label>祝福语<input name="wish" maxlength="100" placeholder="收下这份心意" value="收下这份心意"></label></div><p class="drawer-note">仅故事内的趣味红包，不扣除真实货币，不连接支付服务或钱包。</p><button class="packet-submit" ${
        isBusy() ? 'disabled' : ''
      }>发送虚拟红包</button></form></section>`;
    }
    return '';
  }

  function renderFirstMessageCard(r: RoleData): string {
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
            isBusy() ? 'disabled' : ''
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
          isBusy() ? 'disabled' : ''
        }>由模型生成首条消息</button>
        <button type="button" class="btn small secondary" data-action="view" data-view="terminal">前往终端配置 API</button>
      </div>
    </div>`;
  }

  function renderChatMessagesHtml(r: RoleData): string {
    const activeChats = getActiveMessages(r.chats);
    const failedChatReply=failedChatReplies.get(r.id);
    const failure = failedChatReply?.roleId === r.id && activeChats.some(m => m.id === failedChatReply?.messageId && m.text === failedChatReply?.text && (m.revisionCount || 0) === failedChatReply?.revision) ? failedChatReply : null;
    const pending = pendingFor(r);
    return `<div class="chat-privacy">你与 ${esc(
      r.name
    )} 的私人对话 · ${esc(dateStr(now()))}</div>
    ${renderFirstMessageCard(r)}
    ${failure ? `<div class="reply-pending" role="alert">回复生成失败，消息已保存。<button type="button" class="btn small secondary" data-action="retrychatreply" ${isBusy()?'disabled':''}>重试回复</button></div>` : ''}
    ${activeChats
      .map((m, i) => {
        const dayChanged =
          i === 0 ||
          new Date(activeChats[i - 1].at).toDateString() !==
            new Date(m.at).toDateString();
        const isEditingThis =
          editingMessageId === m.id && editingMessageScope === 'chat';
        const canEditText = !m.kind || m.kind === 'chat';
        return `${
          dayChanged ? `<div class="daymark">${dateStr(m.at)}</div>` : ''
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
                          isBusy() ? 'disabled' : ''
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
      .join('')}${
      pending
        ? `<div class="reply-pending">${esc(
            r.name
          )}稍后会回复 · ${pending} 条待发</div>`
        : isBusy()
        ? '<div class="reply-pending">正在生成回复…</div>'
        : ''
    }`;
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

  function renderChatInteractionsHtml(r: RoleData): string {
    const focused = isFocused(r);
    const invite = r.chatInvite;
    const revCount = ensureRevisionsList(r).filter(
      (x) => x.scope === 'chat'
    ).length;
    const label = focused
      ? '专心聊天中'
      : invite?.status === 'offered'
      ? '邀请你继续聊天'
      : invite?.status === 'later'
      ? '忙完再聊（可再次点击右上角猫爪印邀约）'
      : invite?.status === 'declined'
      ? '暂时不方便（可再次点击右上角猫爪印邀约）'
      : '日常联系';
    return `<span class="chat-mode-label" data-testid="chat-mode-label"><span class="online-point"></span>${label}</span>
      <button type="button" class="chat-focus-action" data-action="togglerevisions" aria-label="查看修订记录">修订记录${
        revCount ? ` (${revCount})` : ''
      }</button>${
      invite?.status === 'offered'
        ? '<button type="button" class="chat-focus-action" data-action="focuschat">接受邀请</button><button type="button" class="chat-focus-action" data-action="declinechat">暂不</button>'
        : ''
    }`;
  }

  function screenChat(): string {
    const r = role()!;
    const focused = isFocused(r);
    const pawStateClass = focused ? 'is-dark' : 'is-light';
    const pawTitle = focused
      ? '当前处于专心聊（深色猫爪印）· 点击退出专心聊'
      : '当前为日常联系（浅色猫爪印）· 点击邀请角色专心聊';
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
      )}</button><button type="button" class="chat-more" data-action="chatroleedit" data-testid="chat-role-edit-btn" aria-label="进入角色修改页面" title="编辑当前角色资料">•••</button></div></div>
 <div class="chat-interactions">${renderChatInteractionsHtml(r)}</div>${(r.preset || data.preset) ? '<p class="tiny muted" role="status">旧版附加预设用途未确认，原配置已保留；暂不注入正式聊天或小说。</p>' : ''}
 ${renderRevisionsDrawer(r, 'chat')}
 <div class="chat-conversation" id="scroll-area" data-role-id="${esc(r.id)}">${renderChatMessagesHtml(
   r
 )}</div>
 <div class="chat-shortcuts"><button data-action="view" data-view="focus">${glyph(
        'focus'
      )} <span>一起专注</span></button><button data-action="view" data-view="drama">${glyph(
        'drama'
      )} <span>戏剧</span></button></div>
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
 <form class="compose" id="message-form"><button type="button" class="compose-plus" data-action="chatpanel" data-panel="more" aria-label="打开聊天功能" aria-expanded="${Boolean(
   chatPanel
 )}">${
        chatPanel ? attachmentIcon('close') : attachmentIcon('more')
      }</button><textarea id="message-input" rows="1" placeholder="发送信息" aria-label="输入消息">${esc(
        chatDraft
      )}</textarea><button type="button" class="compose-sticker" data-action="chatpanel" data-panel="sticker" aria-label="发送表情包">${attachmentIcon(
        'sticker'
      )}</button><button class="send-btn" ${
        isBusy() ? 'disabled' : ''
      } aria-label="发送消息">↑</button></form>`,
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
                       ? '<span class="diary-task-badge generating">⏳ 正在生成…</span>'
                       : t.status === 'failed'
                       ? '<span class="diary-task-badge failed">⚠️ 生成失败</span>'
                       : t.status === 'awaiting_api'
                       ? '<span class="diary-task-badge awaiting">🔌 待连接 API 补写</span>'
                       : '<span class="diary-task-badge pending">🕒 待补写队列</span>';
                   return `<div class="card diary-task-card" data-diary-task-date="${esc(
                     t.dateKey
                   )}" data-diary-task-status="${esc(t.status)}">
                     <div class="diary-task-head">
                       <div>
                         <b class="diary-task-title">📅 ${esc(bounds.label)}（${esc(
                     t.dateKey
                   )}）</b>
                         <div class="diary-task-sub">${esc(factText)}</div>
                       </div>
                       ${statusBadge}
                     </div>
                     ${
                       t.status === 'failed' && t.lastError
                         ? `<div class="diary-task-error">原因：${esc(
                             t.lastError
                           )}</div>`
                         : t.status === 'awaiting_api'
                         ? `<div class="diary-task-note">未使用假模板代替生成。请在「终端」配置自定义 API 与模型后点击生成。</div>`
                         : ''
                     }
                     <div class="diary-task-actions">
                       <button type="button" class="btn small ${
                         t.status === 'failed' ? '' : 'secondary'
                       }" data-action="retrydiary" data-date="${esc(
                     t.dateKey
                   )}" ${
                     t.status === 'generating' || diaryQueueBusy ? 'disabled' : ''
                   }>${
                     t.status === 'generating'
                       ? '正在生成…'
                       : t.status === 'failed'
                       ? '重试生成'
                       : '立即生成'
                   }</button>
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
                      <time class="diary-archive-date">📅 ${esc(
                        bounds.label
                      )}（${esc(dKey)}）</time>
                      <span class="diary-char-meta">${
                        e.wordCount ? `${e.wordCount} 字 · ` : ''
                      }${
                    e.generatedAt ? `写于 ${dt(e.generatedAt)}` : dt(e.at)
                  }</span>
                    </div>
                    <div class="diary-body-text">${esc(e.text)}</div>
                    <div class="diary-entry-foot">
                      <span class="diary-fact-badge">✦ ${esc(sourceSummary)}</span>
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
                            ? `<span class="shared-badge">✓ 已主动分享给 ${esc(
                                r.name
                              )} · 对方已知情</span>`
                            : `<span class="privacy-badge">🔒 私密日记（${esc(
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
          ${cell.hasActivity ? '<span class="fp-cal-paw" title="当天有生活足迹">🐾</span>' : '<span class="fp-cal-dot"></span>'}
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
        <span class="tiny muted">🐾 表示当天有已记录的互动或生活足迹</span>
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
    const r = role()!;
    const nowTs = now();
    const todayKey = toLocalDateKey(nowTs);
    monitorDateKey = resolveSafeMonitorDateKey(monitorDateKey, nowTs);
    const isToday = monitorDateKey === todayKey;
    const bounds = getLocalDayBounds(monitorDateKey);
    const prevDateKey = shiftDateKey(monitorDateKey, -1);
    const nextDateKey = shiftDateKey(monitorDateKey, 1);
    const canGoNext = monitorDateKey < todayKey;

    const a = activity(r, nowTs);
    const archive = getOrBuildDailyFootprints(r, monitorDateKey, nowTs);
    const facts = collectDailyDiaryFacts(r, monitorDateKey);

    const rawEvents = getActiveEvents(r.events)
      .filter((x) => {
        if (x.at > nowTs) return false;
        const dKey = toLocalDateKey(x.at);
        if (dKey !== monitorDateKey) return false;
        return (
          x.kind === 'life' ||
          x.kind === 'scene' ||
          x.kind === 'chat' ||
          x.kind === 'focus' ||
          x.kind === 'diary_share' ||
          x.kind === 'drama'
        );
      })
      .sort((x, y) => y.at - x.at);

    const categoryBadgeMap: Record<string, string> = {
      interaction: '线上联络',
      scene: '当面相处',
      focus: '共同专注',
      drama: '小剧场共创',
      diary_share: '日记分享',
      life: '日常起居',
      quiet: '平静日常',
    };

    const footprintsListHtml = archive.items.length
      ? archive.items
          .map((item) => {
            const catLabel = categoryBadgeMap[item.category] || '日常足迹';
            const artifactHtml = item.artifact
              ? renderSafeFootprintArtifact(item.artifact)
              : '';
            const transcriptCount = item.rawTranscript?.length || 0;

            return `<article class="card footprint-card fp-cat-${esc(
              item.category
            )}" data-testid="footprint-item" data-fp-category="${esc(
              item.category
            )}" data-fp-id="${esc(item.id)}">
              <div class="fp-card-head">
                <div class="fp-time-group">
                  <span class="fp-icon" aria-hidden="true">${esc(item.icon)}</span>
                  <time class="fp-time-badge">${esc(item.timeLabel)}</time>
                  ${
                    item.durationLabel
                      ? `<span class="fp-duration-tag">${esc(
                          item.durationLabel
                        )}</span>`
                      : ''
                  }
                </div>
                <span class="fp-category-pill">${esc(catLabel)}${
              item.where ? ` · ${esc(item.where)}` : ''
            }</span>
              </div>

              <h3 class="fp-card-title">${esc(item.title)}</h3>
              <p class="fp-card-summary">${esc(item.summary)}</p>

              ${artifactHtml}

              <details class="footprint-omniscient-box" data-testid="footprint-omniscient-details">
                <summary class="fp-omniscient-summary">
                  <span>👁️ 上帝视角 · 角色状态读心${
                    transcriptCount ? `与 ${transcriptCount} 条关联原始记录` : ''
                  }</span>
                  <span class="fp-omniscient-arrow">⌄</span>
                </summary>
                <div class="fp-omniscient-body">
                  ${
                    item.innerThought
                      ? `<div class="fp-thought-panel" data-testid="footprint-inner-thought">
                          <div class="fp-thought-row"><b>外在状态：</b><span>${esc(
                            item.innerThought.surfaceState
                          )}</span></div>
                          <div class="fp-thought-row"><b>当前情绪：</b><span>${esc(
                            item.innerThought.mood
                          )}</span></div>
                          <div class="fp-thought-row fp-thought-monologue"><b>内心独白：</b><span>${esc(
                            item.innerThought.thought
                          )}</span></div>
                        </div>`
                      : ''
                  }
                  ${
                    transcriptCount
                      ? `<div class="fp-transcript-panel" data-testid="footprint-raw-transcript">
                          <div class="fp-transcript-title">关联原始对话 / 真实事件溯源（共 ${transcriptCount} 条）</div>
                          <div class="fp-transcript-list">
                            ${item
                              .rawTranscript!.map(
                                (tr) =>
                                  `<div class="fp-transcript-line">
                                    <span class="fp-tr-meta">[${hm(tr.at)}] <b>${esc(
                                    tr.speakerLabel
                                  )}</b>：</span>
                                    <span class="fp-tr-text">${esc(tr.text)}</span>
                                  </div>`
                              )
                              .join('')}
                          </div>
                        </div>`
                      : ''
                  }
                </div>
              </details>
            </article>`;
          })
          .join('')
      : `<div class="card fp-empty-card" data-testid="footprint-calm-empty">
          <div class="fp-calm-icon">🍃</div>
          <h3>今日步调十分平静</h3>
          <p>${esc(
            archive.calmDayNote ||
              `这一天没有喧嚣的插曲，${r.name}在${r.place || '日常居所'}按自己的步调安静度过。`
          )}</p>
        </div>`;

    return shell(
      `${header(
        '生活监控',
        'home'
      )}<div class="viewport"><div class="row between"><div><div class="label">DAILY FOOTPRINTS · 日常足迹</div><div class="h2" style="margin-bottom:4px">${hm(
        nowTs
      )}</div><div class="tiny muted">第三人称生活概览 · 偶发生活票据 · 可展开上帝视角读心</div></div><div class="pill"><span class="dot"></span>${
        isToday ? '今日同步' : '历史足迹'
      }</div></div>

      <div class="card fp-current-status-card"><div class="row">${avatarTag(
        r,
        'avatar large'
      )}<div><h3>${esc(a.where)}</h3><p>${esc(r.name)}：${esc(
        a.doing
      )}</p></div></div></div>

      <div class="fp-date-bar" data-testid="monitor-date-bar">
        <button type="button" class="btn small secondary fp-nav-btn" data-action="monitordate" data-date="${esc(
          prevDateKey
        )}" data-testid="monitor-prev-day" aria-label="前一天">‹ 前一天</button>
        <button type="button" class="fp-date-display" data-action="togglefootprintcal" data-testid="monitor-date-display" title="点击打开足迹日历">
          <strong>📅 ${esc(bounds.label)}</strong>
          <small>${esc(monitorDateKey)} · ${
            isToday ? '今天' : '历史归档'
          } · 点击展开日历 ▾</small>
        </button>
        <button type="button" class="btn small secondary fp-nav-btn" data-action="monitordate" data-date="${esc(
          nextDateKey
        )}" data-testid="monitor-next-day" ${
          canGoNext ? '' : 'disabled'
        } aria-label="后一天">后一天 ›</button>
      </div>

      ${renderFootprintCalendarDrawer(r, monitorDateKey)}

      <div class="tabs fp-mode-tabs" style="margin:10px 0">
        <button type="button" data-action="monitortab" data-tab="footprints" class="${
          monitorTab === 'footprints' ? 'active' : ''
        }" data-testid="monitor-tab-footprints">🐾 日常足迹概览 (${
          archive.items.length
        })</button>
        <button type="button" data-action="monitortab" data-tab="raw" class="${
          monitorTab === 'raw' ? 'active' : ''
        }" data-testid="monitor-tab-raw">👁️ 完整原始事件流 (${
          rawEvents.length
        })</button>
      </div>

      ${
        monitorTab === 'footprints'
          ? `<div class="fp-overview-toolbar">
              <div class="tiny muted" data-testid="footprint-fact-consistency">
                真实历史同源：当日 ${facts.summary.chatCount} 条聊天已聚合 · ${
                  facts.summary.sceneCount
                } 条见面 · ${facts.summary.focusCount} 次共同专注（与每日 AI 日记共享同一套底层事实）
              </div>
              <button type="button" class="btn small ghost" data-action="enrichfootprints" data-date="${esc(
                monitorDateKey
              )}" data-testid="enrich-footprints-btn" ${
                footprintAiBusy ? 'disabled' : ''
              }>${
                footprintAiBusy
                  ? '⏳ 正在润色…'
                  : archive.aiGeneratedAt
                  ? '✦ 重新 AI 润色足迹'
                  : '✦ AI 润色今日足迹细节'
              }</button>
            </div>
            ${
              archive.calmDayNote && archive.items.length > 0
                ? `<div class="hint fp-calm-banner" data-testid="footprint-calm-banner">🌿 ${esc(
                    archive.calmDayNote
                  )}</div>`
                : ''
            }
            <div class="footprints-list" data-testid="footprints-list">
              ${footprintsListHtml}
            </div>`
          : `<div class="hint">完整原始事件流保留了每一条已发生聊天、见面、共同专注与日程投影的底层时间线记录。</div>
            <div class="timeline" data-testid="monitor-raw-timeline">${
              rawEvents.length
                ? rawEvents
                    .map(
                      (e) =>
                        `<div class="event"><div class="time">${dt(
                          e.at
                        )}</div><div class="desc"><b>${esc(
                          e.title
                        )}</b><div>${esc(e.detail)}</div></div><div class="via">来源：${
                          e.kind === 'life'
                            ? '确定性日程投影'
                            : e.kind === 'chat'
                            ? '聊天记录'
                            : e.kind === 'focus'
                            ? '已确认的共同专注'
                            : e.kind === 'diary_share'
                            ? '你主动分享的日记'
                            : e.kind === 'drama'
                            ? '小剧场共创'
                            : '已结束的见面'
                        }</div></div>`
                    )
                    .join('')
                : '<div class="sub">当天暂无原始事件记录。</div>'
            }</div>`
      }</div>`
    );
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
              isCompleted ? '✓ 已完成' : '⏹ 提前结束'
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
              <strong class="stat-val" data-testid="settlement-durations">计划 ${plannedMin} 分钟 · 实际 ${esc(
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
                      focusSummaryAiBusy ? 'disabled' : ''
                    }>${
                      focusSummaryAiBusy
                        ? '正在生成…'
                        : rec.summaryStatus === 'failed'
                        ? '↻ 重试生成角色小结'
                        : '↻ 重新生成小结'
                    }</button>`
                  : ''
              }
            </div>
            ${
              rec.summaryError
                ? `<div class="hint" style="margin-bottom:8px" data-testid="settlement-summary-error">${esc(
                    rec.summaryError
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
                    <span class="focus-moment-icon">${esc(
                      m.icon || '⏳'
                    )}</span>
                    <div class="focus-moment-body">
                      <div class="focus-moment-head">
                        <b>${esc(m.title)}</b>
                        <time>${hm(m.at)}</time>
                      </div>
                      <p>${esc(m.detail)}</p>
                      ${
                        m.innerThought
                          ? `<div class="focus-moment-thought">💭 内心：${esc(
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
                    <span>计划 ${f.minutes} 分钟</span>
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
                                        ? `<div class="focus-participant-thought">💭 内心：${esc(
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
                    draftInvited.length === 0 ? '✓ 当前独自专注' : '切换为独自专注'
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
                              isSelected ? '✓ 已邀请' : '点击邀请'
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
                          <span>有效专注 ${esc(durLabel)}（计划 ${
                        rec.plannedMinutes || rec.minutes
                      } 分钟） · ${
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
            }">↩ ${
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
    const p = r.play || r.scene;
    const isPlay = Boolean(r.play);
    const scope: RevisionScope = isPlay ? 'play' : 'scene';
    if (!p) {
      view = 'home';
      return screenHome();
    }
    const title = isPlay ? (p as PlayData).title : `与${r.name}的见面`;
    const showBackstage=isPlay&&Boolean((p as PlayData).paused);
    if(showBackstage)view='intermission';
    const activeMessages = getActiveMessages(p.messages);
    const failedNovelReply=failedNovelReplies.get(r.id);
    const failed = failedNovelReply?.roleId === r.id && failedNovelReply.sessionId === p.id && activeMessages.some(m => m.id === failedNovelReply?.messageId && m.text === failedNovelReply?.text && (m.revisionCount || 0) === failedNovelReply?.revision) ? failedNovelReply : null;
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
      }</button></div>${(r.preset || data.preset) ? '<p class="tiny muted" role="status">旧版附加预设用途未确认，原配置已保留；暂不注入正式聊天或小说。</p>' : ''}
      ${renderRevisionsDrawer(r, scope)}
      ${failed ? `<div class="reply-pending" role="alert">回复生成失败，原发言已保存。<button type="button" class="btn small secondary" data-action="retrynovelreply" ${isBusy()?'disabled':''}>重试回复</button></div>` : ''}
      <div class="novel" id="scroll-area"><div class="chapter">${
        isPlay ? 'theatre / act one' : 'a moment together'
      }</div><h2 class="scene-title">${esc(title)}</h2>${activeMessages
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
          }${m.editedAt ? ' · 已编辑' : ''}</span>${quoteBubbleHtml(m, r)}${esc(
            m.text
          )}
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
                            )}" ${isBusy()||showBackstage ? 'disabled' : ''}>重抽</button>`
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
      <form class="compose" id="novel-form"><textarea id="novel-input" ${showBackstage?'disabled':''} placeholder="写下你说的话或行动..." rows="1">${esc(
        novelDraft
      )}</textarea><button class="btn" ${
        isBusy()||showBackstage ? 'disabled' : ''
      }>➤</button></form></section>${showBackstage?renderIntermissionPanel(r,p as PlayData):''}</div>`,
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
    const lastTurns = getActiveMessages(p.messages).filter(
      (m) => m.speaker === 'me' || m.speaker === 'char'
    );
    return `<aside class="intermission-panel" aria-labelledby="intermission-title" data-testid="intermission-panel"><header class="intermission-panel-top"><div><small>BACKSTAGE · 演出暂停</small><h2 id="intermission-title">幕间讨论 · ${esc(r.name)}</h2></div><button type="button" class="btn small secondary" data-action="resumeplay" aria-label="关闭幕间并返回演出">回到演出 ×</button></header>
 <p class="intermission-hint">戏外本人 · 发送仅保存你的发言，点爪印才请 AI 回复。未发送的草稿不进入请求。</p>
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
 <form class="compose intermission-compose" id="intermission-form"><textarea id="intermission-input" placeholder="和戏外的${esc(r.name)}聊聊……" rows="1" required ${isBusy()?'disabled':''}>${esc(intermissionDraft)}</textarea><button class="btn" type="submit" ${isBusy()?'disabled':''} aria-label="发送幕间消息（不触发 AI）" title="仅发送你的消息">发送</button><button type="button" class="btn intermission-paw" data-action="intermissionreply" ${isBusy()?'disabled':''} aria-label="让 AI 回复幕间讨论" title="仅点爪印才触发 AI 回复">${catPawSvg(true)}<span>AI 回复</span></button></form></aside>`;
  }

  function submitIntermission(text:string):void {
    const r=role(),p=r?.play;
    if(!r||!p||isBusy()||!p.paused||!text.trim())return;
    ensureIntermission(p);
    const message:ChatMessage={id:uid(),speaker:'me',text:text.trim(),at:now(),status:'active'};
    p.intermissionMessages!.push(message);
    if(!save()){p.intermissionMessages!.pop();intermissionDraft=text;const input=$<HTMLTextAreaElement>('#intermission-input');if(input)input.value=text;return;}
    intermissionDraft='';
    syslog('intermission','幕间用户发言已保存；等待爪印触发回复',{source:p.id});
    render(false);const area=$('#intermission-scroll');if(area)area.scrollTop=area.scrollHeight;
    $<HTMLTextAreaElement>('#intermission-input')?.focus({preventScroll:true});
  }

  async function requestIntermissionReply():Promise<void> {
    const r=role(),p=r?.play;
    if(!r||!p||isBusy()||!p.paused)return;
    if(intermissionDraft.trim()){notify('这段文字尚未发送，请先点发送，再点爪印。');return;}
    const latest=getActiveMessages(p.intermissionMessages||[]).filter(m=>m.speaker==='me').at(-1);
    if(!latest){notify('先发送一条幕间消息，再点爪印请 AI 回复。');return;}
    if(getActiveMessages(p.intermissionMessages||[]).some(m=>m.speaker==='char' && m.replyTo===latest.id)){notify('这条发言已有回复，请先发送新的发言。');return;}
    if(!canUseRealModel(data.settings)){notify('请先在终端连接 API；当前发言已保存在本地。');return;}
    const revision=latest.revisionCount||0, text=latest.text;
    busyRoles.add(r.id);render(false);let generationError='';
    try {
      const reply=await apiReply(r,'intermission',latest.text);
      if(!data.roles.includes(r)||r.play!==p||!p.paused||!getActiveMessages(p.intermissionMessages||[]).some(m=>m.id===latest.id && m.text===text && (m.revisionCount||0)===revision))return;
      for(const text of splitChatBubbles(reply,r))p.intermissionMessages!.push({id:uid(),speaker:'char',text,at:now(),status:'active',replyTo:latest.id});
      syslog('intermission','用户通过爪印触发戏外 AI 回复',{source:p.id});save();
    }catch(e){generationError=e instanceof Error?e.message:String(e);}
    finally{busyRoles.delete(r.id);render(false);if(generationError && role()?.id===r.id)notify('幕间回复失败：'+generationError+'；你的发言已保留。');const area=$('#intermission-scroll');if(area)area.scrollTop=area.scrollHeight;}
  }

  function rollBackPlay(): void {
    const r = role();
    const p = r?.play;
    if (!r || !p || !p.paused || isBusy()) return;
    ensureIntermission(p);
    const lastMe = p.messages
      .map((m, i) => (m.speaker === 'me' && m.status !== 'retracted' ? i : -1))
      .filter((x) => x >= 0)
      .at(-1);
    if (lastMe == null) {
      notify('还没有可回退的戏内回合');
      return;
    }
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
    syslog('intermission', `回退一轮戏内互动：${entryIds.size} 条消息`, {
      source: p.id,
    });
    save();
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
    return `<section class="card nain-preflight"><h3>奈恩 · 实机前起点</h3><p class="sub">${r.demoStartResetAt?'已完成一次性清档。角色资料、头像与头像框保留。':awaitingFirstMessage(r)&&!r.chats.length?'尚未发出首条消息，等待连接 API。':'仅原厂演示开场会自动清理。其他历史无法自动认定为演示，请核对后再决定。'}</p>${!r.demoStartResetAt?`<p class="sub">一次性清理会移除当前奈恩的全部聊天（${r.chats.length} 条）、日记（${r.diaries.length} 篇）、事件（${r.events.length} 条）及见面／戏剧／待回复／足迹状态。若有真实记录请勿清理。先保存本地恢复副本，不删除媒体或其他角色。</p><button class="btn small secondary" data-action="nainpreflight" ${isBusy()?'disabled':''}>核对后一次性清理奈恩互动</button>`:''}${hasBackup?'<button class="btn small secondary" data-action="exportnainbackup">导出清档前恢复副本（含媒体）</button>':''}</section>`;
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
            }</time><p>${esc(m.text)}</p></div>`
        )
        .join('')}</div>`
    );
  }

  function screenTerminal(): string {
    const cards = phoneSettingsCards();
    return shell(`${header('终端','home')}<div class="viewport terminal-page"><div class="card terminal-api-card" id="terminal-api-root"></div><h2 class="terminal-section-title">02｜外观与主题</h2>${cards.appearance}<h2 class="terminal-section-title">03｜聊天气泡自定义</h2>${cards.bubble}<details class="terminal-other-settings"><summary>04｜其他手机设置</summary>${cards.frames}${cards.logs}${cards.backup}</details></div>`);
  }
  function screenPresets(): string {
    return shell(`${header('预设','home')}<div class="viewport"><div class="h2">预设</div><p class="sub">独立管理小说模式。即时设置自动保存；正文确认后才提交。当前仍只做隔离预览。</p><div class="card" id="fruit-preset-root"></div></div>`);
  }
  function phoneSettingsCards() {
    const r=role()!;
    return { appearance: `<div class="card"><h3>外观</h3><div class="theme-swatches">${[
        ['blue', '蓝色'],
        ['green', '绿色'],
        ['pink', '粉色'],
        ['coffee', '卡布奇诺'],
        ['night', '夜晚'],
      ]
        .map(
          ([id, label]) =>
            `<button class="swatch swatch-${id} ${
              (r.theme || 'blue') === id ? 'active' : ''
            }" data-action="theme" data-theme="${id}"><i></i>${label}</button>`
        )
        .join(
          ''
        )}</div><label class="sub">字体</label><select class="field" id="font-select"><option value="system" ${
        (r.font || data.font) === 'system' ? 'selected' : ''
      }>系统字体</option><option value="serif" ${
        (r.font || data.font) === 'serif' ? 'selected' : ''
      }>衬线字体</option></select></div>`, logs: `<div class="card"><h3>系统 Log</h3><p>查看本地事件、API 请求状态、模式切换和错误；不会记录 API Key。详细 Prompt 仅在本次请求记录一份脱敏摘要。</p><div class="row"><button class="btn small secondary" data-action="exportlogs">导出日志 JSON</button><button class="btn small ghost" data-action="clearlogs">清空日志</button></div><div class="log-list">${
        (data.logs || [])
          .slice(-35)
          .reverse()
          .map(
            (l) =>
              `<details class="log-row"><summary>${esc(hm(l.at))} · ${esc(
                l.type
              )} · ${esc(l.detail.slice(0, 75))}</summary><pre>${esc(
                JSON.stringify(l, null, 2)
              )}</pre></details>`
          )
          .join('') || '<p class="sub">暂无日志，开始聊天或切换主题后会出现记录。</p>'
      }</div></div>`,
      frames: renderTerminalFrameAssetManagerCard(),
      bubble: `<div class="card"><h3>聊天气泡 CSS（当前角色独立）</h3><p>支持仅针对 .message.mine .bubble 和 .message.theirs .bubble 的 CSS；不允许外部资源或全局页面选择器。保存后进入聊天查看效果。</p><form id="bubble-form"><label class="btn small ghost bubble-css-import">导入 CSS 文件<input id="bubble-css-file" type="file" accept=".css,text/css" hidden></label><p class="sub">导入只填入编辑器，点击应用后才保存。最多 12KB。</p><textarea class="field bubble-editor" name="css" spellcheck="false" placeholder=".message.mine .bubble { background: #ffd9eb; border-radius: 22px; }">${esc(
        r.bubbleCSS || ''
      )}</textarea><div class="row"><button class="btn small">应用气泡 CSS</button><button class="btn small secondary" type="button" data-action="resetbubble">恢复默认气泡</button></div></form></div>`, backup: `<div class="card"><h3>数据与跨环境迁移</h3><p>各角色互相隔离。支持导出 / 导入本地 JSON 备份（包含全部角色、修订档案、日记分享状态与 IndexedDB 媒体附件，不包含 API Key）。</p><div class="row" style="margin-top:11px;flex-wrap:wrap"><button class="btn small secondary" data-action="export">导出备份</button><label class="btn small ghost" style="cursor:pointer">导入备份<input id="backup-file" type="file" accept=".json" hidden></label></div></div><p class="tiny muted">当前角色：${esc(
        r.name
      )} · v1 Phase 1</p>` };
  }

  function applyTheme(): void {
    const root = document.documentElement;
    const palettes: Record<ThemeName, [string, string, string, string, string, string]> = {
      blue: ['#edf6ff', '#ffffff', '#deecfb', '#568bbd', '#254767', '#6885a3'],
      green: ['#ecf8ee', '#ffffff', '#dbf0e1', '#659d78', '#2f5946', '#678b77'],
      pink: ['#fff0f6', '#ffffff', '#fbe1ed', '#d27fa6', '#6e3d59', '#a1788f'],
      coffee: ['#f8f1e8', '#ffffff', '#efe2d4', '#a88161', '#654b3b', '#9a8372'],
      night: ['#22273a', '#30364c', '#3b435d', '#b2b6ee', '#f2f1ff', '#afb4cc'],
    };
    const legacyMap: Record<string, ThemeName> = {
      violet: 'pink',
      sand: 'coffee',
    };
    const rawTheme =
      role()?.theme || legacyMap[data.theme] || data.theme || 'blue';
    const key: ThemeName = palettes[rawTheme as ThemeName]
      ? (rawTheme as ThemeName)
      : 'blue';
    const a = palettes[key];
    (['--bg', '--surface', '--surface2', '--accent', '--ink', '--muted'] as const).forEach(
      (n, i) => root.style.setProperty(n, a[i])
    );
    if (root.dataset) root.dataset.theme = key;
    root.style.fontFamily =
      (role()?.font || data.font) === 'serif'
        ? 'Georgia,"Songti SC",serif'
        : '-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
  }

  function clearMediaURLs(force=false):void {
    if(force){for(const url of mediaURLs.values())URL.revokeObjectURL(url);mediaURLs.clear();mediaReads.clear();return;}
    queueMicrotask(()=>{
      const live=new Set(Array.from(document.querySelectorAll<HTMLElement>('[data-media-id]'),el=>el.dataset.mediaId));
      for(const [key,url] of mediaURLs)if(!live.has(key)){URL.revokeObjectURL(url);mediaURLs.delete(key)}
    });
  }
  async function hydrateMedia(rootEl:ParentNode=document):Promise<void>{
    rootEl.querySelectorAll<HTMLImageElement>('.avatar-frame[src],.frame-thumb-img[src]').forEach(img=>{
      if(img.dataset.fallbackBound)return;img.dataset.fallbackBound='1';
      img.addEventListener('error',()=>img.classList.add('frame-img-error'));
      img.addEventListener('load',()=>img.classList.remove('frame-img-error'));
    });
    await Promise.all(Array.from(rootEl.querySelectorAll<HTMLImageElement|HTMLAudioElement>('[data-media-id]'),async item=>{
      const key=item.dataset.mediaId;if(!key)return;
      if(item.dataset.hydratedKey===key&&item.getAttribute('src')&&mediaURLs.has(key))return;
      try{
        let url=mediaURLs.get(key);
        if(!url){
          let pending=mediaReads.get(key);if(!pending){pending=mediaGet(key);mediaReads.set(key,pending);void pending.finally(()=>{if(mediaReads.get(key)===pending)mediaReads.delete(key)}).catch(()=>{});}
          const blob=await pending;
          if(!item.isConnected||item.dataset.mediaId!==key)return;
          if(!blob)throw new Error('媒体未找到');
          url=mediaURLs.get(key);if(!url){url=URL.createObjectURL(blob);mediaURLs.set(key,url);}
        }
        if(!item.isConnected||item.dataset.mediaId!==key)return;
        item.dataset.hydratedKey=key;item.src=url;
        if(item.classList.contains('avatar-img'))item.closest('.has-avatar-img')?.classList.add('avatar-loaded');
      }catch{
        if(!item.isConnected||item.dataset.mediaId!==key)return;
        if(item.classList.contains('avatar-img')){item.closest('.has-avatar-img')?.classList.remove('has-avatar-img','avatar-loaded');item.remove();}
        else if(item.classList.contains('avatar-frame')||item.classList.contains('frame-thumb-img'))item.remove();
        else item.replaceWith(document.createTextNode('媒体存储不可用'));
      }
    }));
    clearMediaURLs();
  }

  /**
   * Surgical DOM patch when a background timer tick needs to update dynamic regions
   * while the user is actively typing, composing with IME, or has a drawer/panel open.
   */
  function patchDynamicRegionsOnTick(): void {
    document
      .querySelectorAll<HTMLElement>('.status-time, .homescreen-time')
      .forEach((el) => {
        el.textContent = hm(Date.now());
      });
    const r = role();
    if (!r) return;
    if (view === 'chat') {
      const inter = document.querySelector<HTMLElement>('.chat-interactions');
      if (inter) inter.innerHTML = renderChatInteractionsHtml(r);
      if (!editingMessageId) {
        const sc = document.querySelector<HTMLElement>('#scroll-area');
        if (sc) {
          const wasAtBottom =
            sc.scrollHeight - sc.scrollTop - sc.clientHeight < 60;
          clearMediaURLs();
          sc.innerHTML = renderChatMessagesHtml(r);
          hydrateMedia();
          if (wasAtBottom) sc.scrollTop = sc.scrollHeight;
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

  function render(scroll = true): void {
    if (view === 'chat' && $('#message-input')) {
      chatDraft = ($('#message-input') as HTMLTextAreaElement).value;
    }
    if (view === 'novel' && $('#novel-input')) {
      novelDraft = ($('#novel-input') as HTMLTextAreaElement).value;
    }
    if (view === 'intermission' && $('#intermission-input')) {
      intermissionDraft = ($('#intermission-input') as HTMLTextAreaElement).value;
    }
    if (editingMessageId && $('#inline-edit-form textarea')) {
      editingMessageDraft = (
        $('#inline-edit-form textarea') as HTMLTextAreaElement
      ).value;
    }

    const uiSnap = captureUIState(document);

    ensureFocusData();
    completeFocusIfDue();
    if (role()) resolveChatInvite(role());
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
        : view === 'playdetail'
        ? screenPlayDetail()
        : view === 'presets'
        ? screenPresets()
        : view === 'terminal'
        ? screenTerminal()
        : screenHome();

    const sameView = view === lastRenderedView;
    lastRenderedView = view;

    clearMediaURLs();
    fruitManager.detach();
    terminalApi.detach();
    app.innerHTML = markup;
    if(view==='terminal')terminalApi.mount(document.getElementById('terminal-api-root'));
    if(view==='presets')fruitManager.mount(document.getElementById('fruit-preset-root'));
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
  window.addEventListener('beforeunload',(event)=>{if(fruitManager.hasUnsaved()){event.preventDefault();event.returnValue='';}});
  function go(v: string): void {
    const preserveStage=(view==='novel'&&v==='intermission')||(view==='intermission'&&v==='novel');
    if(['location','memories','profile'].includes(v))v='home';
    if(view==='presets'&&v!==view){
      if(leavingPresets)return;
      leavingPresets=true;void fruitManager.beforeLeave().then(ok=>{if(ok){view='home';go(v);}}).finally(()=>{leavingPresets=false;});return;
    }
    completeFocusIfDue();
    if (activeFocus()?.phase === 'work' && v !== 'focus' && v !== 'novel') {
      view = 'focus';
      render();
      notify('专注期间已锁定，先结束本轮才能切换手机');
      return;
    }
    if (view === 'chat' && $('#message-input')) {
      chatDraft = ($('#message-input') as HTMLTextAreaElement).value;
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
    if (v !== 'chat') {
      chatPanel = '';
      if (voiceRecorder?.state === 'recording') stopRecording(true);
    }
    if (v === 'landing') {
      focusedRole = null;
      chatDraft = '';
    }
    if (!role() && !['roleform', 'userprofile', 'deleterole'].includes(v)) {
      v = 'landing';
    }
    if (
      role() &&
      !['landing', 'roleform', 'userprofile', 'deleterole'].includes(v)
    ) {
      simulate(role()!);
      deliverPending(role());
    }
    view = v;
    save();
    render(!preserveStage);
  }

  function messagesForModel(
    r: RoleData,
    kind: 'chat' | 'scene' | 'play' | 'intermission',
    input: string
  ) {
    return buildMessagesForModel(data, r, kind, input, {
      isFocused: isFocused(r),
      nowTs: now(),
    });
  }

  async function apiReply(
    r: RoleData,
    kind: 'chat' | 'scene' | 'play' | 'intermission',
    input: string,
    override?: {role:string;content:string}[]
  ): Promise<string> {
    const s = data.settings;
    const url = s.endpoint.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//.test(url)) {
      throw new Error('API 地址必须以 http(s) 开头');
    }
    if (!s.model.trim()) {
      throw new Error('请先在终端填写模型 ID');
    }
    if (kind === 'chat' && !override) {
      const latest = getActiveMessages(r.chats).filter(m => m.speaker !== 'note').at(-1);
      if (!latest || latest.speaker !== 'me' || latest.text !== input) throw new Error('当前聊天上下文已变化，请检查消息后重试');
    }
    const prompt = override || messagesForModel(r, kind, input);
    syslog('api', `请求 ${kind} · ${s.model}`, {
      messages: prompt.length,
      chars: prompt.reduce((n, m) => n + m.content.length, 0),
    });
    const res = await fetch(url + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: JSON.stringify({
        model: s.model,
        messages: prompt,
        temperature: +s.temperature,
        ...completionLimit(s,kind),
      }),
    });
    const text = await readCompletion(res);
    syslog('api', `返回成功 ${kind}`);
    return text;
  }

  async function generateRoleFirstMessage(r: RoleData): Promise<void> {
    if (busyRoles.has(r.id)||getActiveMessages(r.chats).some(m=>m.speaker==='char')) return;
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
    busyRoles.add(r.id);
    r.firstMessageState = {
      status: 'generating',
      updatedAt: now(),
    };
    save();
    render();
    let generationError='';
    try {
      const s = data.settings;
      const url = s.endpoint.trim().replace(/\/+$/, '');
      const prompt = buildFirstMessagePrompt(r, data.user, dt(now()));
      syslog('api', `生成角色首条消息 · ${r.name} · ${s.model}`, {
        messages: prompt.length,
      });
      const res = await fetch(url + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
        body: JSON.stringify({
          model: s.model,
          messages: prompt,
          temperature: +s.temperature,
          ...completionLimit(s,'first-message'),
        }),
      });
      const rawText = await readCompletion(res);
      if (!data.roles.includes(r) || getActiveMessages(r.chats).some(m=>m.speaker==='char')) return;
      const bubbles = splitChatBubbles(rawText,r);
      if(!bubbles.length)throw new Error('模型未返回有效的手机消息');
      applyGeneratedFirstMessage(r, bubbles, now());
      syslog('role', `${r.name} 已生成首条开场消息`);
      save();
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      r.firstMessageState = {
        status: 'failed',
        error: errMsg,
        updatedAt: now(),
      };
      syslog('error', `首条消息生成失败：${errMsg}`);
      generationError=errMsg;
      save();
    } finally {
      busyRoles.delete(r.id);
      render();
      if(generationError && role()?.id===r.id)notify('首条消息生成失败：'+generationError);
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
    r: RoleData,
    dateKey: string,
    manualTrigger = false
  ): Promise<boolean> {
    syncRoleDiaryTasks(r, data.settings, now());
    if (!manualTrigger && hasCharacterDiaryForDate(r, dateKey)) {
      return false;
    }
    if (!canUseRealModel(data.settings)) {
      const task = (r.diaryTasks || []).find((t) => t.dateKey === dateKey);
      if (task) {
        task.status = 'awaiting_api';
        task.updatedAt = now();
      }
      save();
      safeRenderWhenNotTyping();
      if (manualTrigger) {
        notify('请先在「终端」切换为自定义 API 并填写模型 ID 后再生成日记');
      }
      return false;
    }

    let task = (r.diaryTasks || []).find((t) => t.dateKey === dateKey);
    if (!task) {
      const facts = collectDailyDiaryFacts(r, dateKey);
      task = {
        id: uid(),
        roleId: r.id,
        dateKey,
        status: 'generating',
        attempts: 1,
        createdAt: now(),
        updatedAt: now(),
        sourceMessageIds: facts.sourceMessageIds,
        sourceEventIds: facts.sourceEventIds,
        factSummary: facts.summary,
      };
      if (!Array.isArray(r.diaryTasks)) r.diaryTasks = [];
      r.diaryTasks.push(task);
    } else {
      task.status = 'generating';
      task.attempts = (task.attempts || 0) + 1;
      task.lastError = undefined;
      task.updatedAt = now();
    }
    save();
    safeRenderWhenNotTyping();

    try {
      const s = data.settings;
      const url = s.endpoint.trim().replace(/\/+$/, '');
      const { messages: prompt, facts } = buildCharacterDiaryPrompt(
        r,
        data.user,
        dateKey,
        userTasksSummary(data)
      );
      syslog('diary', `请求生成角色每日日记 · ${r.name} · ${dateKey}`, {
        model: s.model,
        dateKey,
        chatCount: facts.summary.chatCount,
        sceneCount: facts.summary.sceneCount,
        focusCount: facts.summary.focusCount,
        sharedDiaryCount: facts.summary.sharedDiaryCount,
        sourceMessageIds: facts.sourceMessageIds,
        sourceEventIds: facts.sourceEventIds,
      });

      const res = await fetch(url + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
        body: JSON.stringify({
          model: s.model,
          messages: prompt,
          temperature: +s.temperature || 0.8,
          ...completionLimit(s,'diary'),
        }),
      });
      const rawText = await readCompletion(res);
      const applied = applyGeneratedCharacterDiary(r, dateKey, rawText, now());
      if (!applied.ok) {
        throw new Error(applied.reason || '模型返回日记内容为空');
      }
      syslog(
        'diary',
        `已归档 ${r.name} 的每日日记 (${dateKey}) · ${
          applied.diary?.wordCount || 0
        } 字`,
        {
          dateKey,
          diaryId: applied.diary?.id,
          wordCount: applied.diary?.wordCount,
        }
      );
      save();
      safeRenderWhenNotTyping();
      if (manualTrigger) {
        notify(`已生成并归档 ${r.name} 在 ${dateKey} 的私人日记`);
      }
      return true;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      markDiaryTaskFailed(r, dateKey, errMsg, now());
      syslog('error', `角色日记生成失败 (${r.name} · ${dateKey})：${errMsg}`);
      save();
      safeRenderWhenNotTyping();
      if (manualTrigger) {
        notify('日记生成失败：' + errMsg);
      }
      return false;
    }
  }

  async function processDiaryQueue(): Promise<void> {
    if (diaryQueueBusy) return;
    for (const roleItem of data.roles) {
      syncRoleDiaryTasks(roleItem, data.settings, now());
    }
    if (!canUseRealModel(data.settings)) {
      save();
      return;
    }
    diaryQueueBusy = true;
    try {
      let guard = 0;
      while (guard < 25) {
        guard++;
        if (!canUseRealModel(data.settings)) break;
        const orderedRoles = [
          ...(role() ? [role()!] : []),
          ...data.roles.filter((x) => x.id !== role()?.id),
        ];
        let nextPair: { r: RoleData; dateKey: string } | null = null;
        for (const roleItem of orderedRoles) {
          const pendingTask = (roleItem.diaryTasks || [])
            .filter(
              (t) =>
                t.status === 'pending' &&
                !hasCharacterDiaryForDate(roleItem, t.dateKey)
            )
            .sort((a, b) => a.dateKey.localeCompare(b.dateKey))[0];
          if (pendingTask) {
            nextPair = { r: roleItem, dateKey: pendingTask.dateKey };
            break;
          }
        }
        if (!nextPair) break;
        await generateCharacterDiaryForDate(nextPair.r, nextPair.dateKey, false);
      }
    } finally {
      diaryQueueBusy = false;
      safeRenderWhenNotTyping();
    }
  }

  async function triggerDiaryTaskForRole(
    r: RoleData,
    dateKey: string
  ): Promise<void> {
    if (diaryQueueBusy) {
      notify('日记队列正在生成中，请稍候');
      return;
    }
    diaryQueueBusy = true;
    try {
      await generateCharacterDiaryForDate(r, dateKey, true);
    } finally {
      diaryQueueBusy = false;
      safeRenderWhenNotTyping();
    }
    if (canUseRealModel(data.settings)) {
      void processDiaryQueue();
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

  function isArrival(r: RoleData, text: string): boolean {
    const t = String(text).replace(/\s/g, '');
    if (
      /(我到了.{0,12}(你在哪|在哪儿|你人呢)|我到(楼下|门口|你这|咖啡馆)|我看见你了|我已经在你面前|我就在你旁边)/.test(
        t
      )
    ) {
      return true;
    }
    const recent = getActiveMessages(r.chats)
      .slice(-10)
      .map((x) => x.text)
      .join(' ');
    return (
      /(我到了|我已经到了|到啦)/.test(t) &&
      /(见面|等你|过来|楼下|门口|咖啡馆|到了|碰面)/.test(recent)
    );
  }

  function isFarewell(text: string): boolean {
    return /(我(先|要)?(回家|走了|离开|告辞)|再见|我得走了|我们(分开|道别))/.test(
      String(text)
    );
  }

  function beginEncounter(r: RoleData, arrival: string): void {
    const a = routine(r, now());
    const place = a.where;
    r.scene = {
      id: uid(),
      startedAt: now(),
      where: place,
      messages: [
        {
          id: uid(),
          speaker: 'note',
          text: `${place}。你终于到了约定的地方，你们真正进入同一场景。`,
          at: now(),
          status: 'active',
        },
      ],
    };
    entry(
      r,
      'scene',
      '由聊天自动进入面对面',
      `触发：${arrival}；位置暂采用演示日程：${place}`,
      now(),
      { source: r.scene.id }
    );
    syslog('mode', `自动切换：聊天 → 面对面 (${r.name})`, {
      cause: 'arrived',
      source: r.scene.id,
    });
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

  function demoRichReply(r: RoleData, m: ChatMessage): string {
    if (m.kind === 'sticker') {
      return m.sticker === 'dice'
        ? '这枚骰子看着还挺眼熟的。你想让我再掷一次？'
        : '哪儿找来的表情？你是想用它代替回答吗？';
    }
    if (m.kind === 'packet') {
      return `虚拟红包？你还真会制造惊喜。上面写着「${
        m.wish || '收下这份心意'
      }」，我看到了。`;
    }
    if (m.kind === 'photo') {
      return m.caption
        ? `照片上的说明我看到了：${m.caption.slice(
            0,
            70
          )}。不过图片内容我现在没法确认。`
        : '照片收到。不过这版演示还不能看图，你得跟我描述一下。';
    }
    if (m.kind === 'voice') {
      return m.caption
        ? `语音我收到了，你写的内容是「${m.caption.slice(0, 70)}」。`
        : '收到语音了。不过我现在没法识别音频，能用文字跟我说一下吗？';
    }
    return demoReply(r, 'chat', m.text);
  }

  async function sendRichMessage(partial: Partial<ChatMessage>): Promise<void> {
    const r = role();
    if (!r || isBusy()) return;
    const item: ChatMessage = {
      ...partial,
      id: uid(),
      at: now(),
      speaker: 'me',
      text: mediaNote(partial),
      status: 'active',
      quote: quotingMessage || null,
    };
    quotingMessage = null;
    busyRoles.add(r.id);
    chatPanel = '';
    r.chats.push(item);
    const validTask = startReplyTask(r, 'chat', item);
    eMemory(r, item.text, 'me', 'chat', item.at, item.id);
    syslog('chat', `发送${item.kind}消息`, { source: item.id });
    save();
    render();
    if(awaitingNainOpening(r)&&!canUseRealModel(data.settings)){busyRoles.delete(r.id);render(false);notify('你的消息已保存；连接 API 后才能生成角色首条回复。');return;}
    const focused = isFocused(r);
    let generationError = '';
    try {
      const reply =
        data.settings.mode === 'api'
          ? await apiReply(r, 'chat', item.text)
          : demoRichReply(r, item);
      if (!validTask()) return;
      failedChatReplies.delete(r.id);
      queueChatReply(r, reply, item.id, focused);
    } catch (err) {
      if (!validTask()) return;
      const msg = err instanceof Error ? err.message : String(err);
      syslog('error', `附件消息回应失败：${msg}`);
      generationError=msg;
      failedChatReplies.set(r.id,{roleId:r.id,messageId:item.id,text:item.text,revision:item.revisionCount||0});
    } finally {
      busyRoles.delete(r.id);
      save();
      render();
      if(generationError && role()?.id===r.id)notify('消息已保存，但回复失败：'+generationError);
    }
  }

  async function sendFileAttachment(
    file: File | undefined,
    kind: 'photo' | 'sticker' | 'voice',
    caption = ''
  ): Promise<void> {
    if (!file) return;
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
    if (isBusy()) {
      notify('请等当前消息处理结束');
      return;
    }
    const id = uid();
    try {
      await mediaPut(id, file);
      await sendRichMessage({
        kind,
        mediaId: id,
        caption: caption.trim().slice(0, 800),
        seconds: 0,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      notify('文件保存失败：' + msg);
    }
  }

  async function beginRecording(): Promise<void> {
    if (isBusy()) {
      notify('当前正在处理消息');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      notify('浏览器不支持直接录音；请使用「选择音频文件」');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const allowed = [
        'audio/webm;codecs=opus',
        'audio/mp4',
        'audio/webm',
        'audio/ogg',
      ].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(
        stream,
        allowed ? { mimeType: allowed } : {}
      );
      const chunks: BlobPart[] = [];
      voiceCancelled = false;
      voiceRecorder = rec;
      voiceStart = Date.now();
      const content =
        ($('#voice-caption') as HTMLInputElement | null)?.value || '';
      rec.ondataavailable = (e) => {
        if (e.data?.size) chunks.push(e.data);
      };
      rec.onerror = () => notify('录音过程中发生错误');
      rec.onstop = async () => {
        const elapsed = Math.round((Date.now() - voiceStart) / 1000);
        stream.getTracks().forEach((t) => t.stop());
        voiceRecorder = null;
        if (voiceCancelled) {
          voiceCancelled = false;
          render();
          return;
        }
        const blob = new Blob(chunks, {
          type: rec.mimeType || 'audio/webm',
        });
        if (!blob.size) {
          notify('录音为空，未发送');
          render();
          return;
        }
        if (blob.size > 8 * 1024 * 1024) {
          notify('语音超过 8MB，未发送');
          render();
          return;
        }
        const id = uid();
        try {
          await mediaPut(id, blob);
          await sendRichMessage({
            kind: 'voice',
            mediaId: id,
            seconds: elapsed,
            caption: content.trim(),
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          notify('录音保存失败：' + msg);
          render();
        }
      };
      rec.start(300);
      render();
    } catch {
      notify('无法开始录音：请允许麦克风权限，或上传音频文件。');
    }
  }

  function stopRecording(cancel = false): void {
    if (!voiceRecorder || voiceRecorder.state !== 'recording') return;
    voiceCancelled = cancel;
    voiceRecorder.stop();
  }

  async function submitText(
    kind: 'chat' | 'scene' | 'play',
    text: string
  ): Promise<void> {
    const r = role();
    if (!r || isBusy() || !text.trim()) return;
    busyRoles.add(r.id);
    const focused = kind === 'chat' && isFocused(r);
    const at = now();
    const obj: ChatMessage = {
      id: uid(),
      speaker: 'me',
      text: text.trim(),
      at,
      kind: kind === 'chat' ? 'chat' : kind,
      status: 'active',
      quote: quotingMessage || null,
    };
    quotingMessage = null;
    let useKind: 'chat' | 'scene' | 'play' = kind;
    let sourceMessage = obj;
    if (kind === 'play' && r.play?.paused) {
      busyRoles.delete(r.id);
      go('intermission');
      notify('正在幕间，需先返回戏剧才能推进剧情');
      return;
    }
    if (kind === 'chat') {
      r.chats.push(obj);
      eMemory(r, obj.text, 'me', 'chat', at, obj.id);
      if (isArrival(r, obj.text)) {
        beginEncounter(r, obj.text);
        useKind = 'scene';
        view = 'novel';
        const sceneMsgId = uid();
        sourceMessage = {
          id: sceneMsgId,
          speaker: 'me',
          text: obj.text,
          at,
          status: 'active',
        };
        r.scene!.messages.push(sourceMessage);
      }
    } else {
      const p = kind === 'play' ? r.play! : r.scene!;
      p.messages.push(obj);
      entry(
        r,
        kind === 'play' ? 'drama' : 'scene',
        '你在' + (kind === 'play' ? '戏里' : '见面时') + '说过',
        obj.text,
        at,
        { source: p.id, messageId: obj.id, speaker: 'me' }
      );
    }
    const validTask = startReplyTask(r, useKind, sourceMessage);
    syslog('chat', `${useKind} 用户消息已提交`, { source: sourceMessage.id });
    save();
    render();
    if(awaitingNainOpening(r)&&!canUseRealModel(data.settings)){busyRoles.delete(r.id);render(false);notify('你的消息已保存；连接 API 后才能生成角色首条回复。');return;}
    let generationError = '';
    try {
      const reply =
        data.settings.mode === 'api'
          ? await apiReply(r, useKind, obj.text)
          : demoReply(r, useKind, obj.text);
      if (!validTask()) return;
      if (useKind === 'chat') {
        failedChatReplies.delete(r.id);
        queueChatReply(r, reply, obj.id, focused);
      } else {
        failedNovelReplies.delete(r.id);
        const p = useKind === 'play' ? r.play : r.scene;
        if (!p) throw new Error('当前场景已关闭');
        const item: ChatMessage = {
          id: uid(),
          speaker: 'char',
          text: reply,
          at: now(),
          replyTo: sourceMessage.id,
          status: 'active',
        };
        p.messages.push(item);
        entry(
          r,
          useKind === 'play' ? 'drama' : 'scene',
          `${r.name}的回复`,
          reply,
          item.at,
          { source: p.id, messageId: item.id, speaker: 'char' }
        );
        if (useKind === 'scene' && isFarewell(obj.text) && role()?.id===r.id) {
          endNovel();
          syslog('mode', '自动切换：面对面 → 手机聊天', { cause: 'farewell' });
        }
        save();
      }
    } catch (e) {
      if (!validTask()) return;
      const msg = e instanceof Error ? e.message : String(e);
      syslog('error', `生成失败：${msg}`);
      generationError=msg;
      if (useKind === 'chat') failedChatReplies.set(r.id,{roleId:r.id,messageId:obj.id,text:obj.text,revision:obj.revisionCount||0});
      else { const p=useKind==='play'?r.play:r.scene; const m=p && getActiveMessages(p.messages).filter(x=>x.speaker!=='note').at(-1); if(p && m?.speaker==='me' && m.text===obj.text) failedNovelReplies.set(r.id,{roleId:r.id,messageId:m.id,text:m.text,revision:m.revisionCount||0,kind:useKind,sessionId:p.id}); }
    } finally {
      busyRoles.delete(r.id);
      render();
      if(generationError && role()?.id===r.id)notify('生成失败：'+generationError+'。你的输入已保存。');
    }
  }

  async function retryChatReply(): Promise<void> {
    const r=role(), failed=r && failedChatReplies.get(r.id);
    if (!failed || !r || isBusy() || r.id!==failed.roleId) return;
    if (data.settings.mode !== 'api') { notify('请先连接 API 后再重试'); return; }
    const valid=()=>data.roles.includes(r) && getActiveMessages(r.chats).some(m=>m.id===failed.messageId && m.speaker==='me' && m.text===failed.text && (m.revisionCount||0)===failed.revision);
    if (!valid()) { failedChatReplies.delete(r.id); render(false); notify('原消息已变化，无法重试'); return; }
    const original = r.chats.find(m=>m.id===failed.messageId)!;
    const validTask=startReplyTask(r,'chat',original);
    busyRoles.add(r.id); render(false); let error='';
    try {
      const reply=await apiReply(r,'chat',failed.text);
      if (!valid() || !validTask()) throw new Error('原消息已变化，回复未保存');
      queueChatReply(r,reply,failed.messageId,isFocused(r));
      if (failedChatReplies.get(r.id)===failed) failedChatReplies.delete(r.id);
    } catch(e) { error=e instanceof Error?e.message:String(e); syslog('error',`重试回复失败：${error}`); }
    finally { busyRoles.delete(r.id); save(); render(false); if(error && role()?.id===r.id)notify('回复生成失败：'+error); }
  }

  async function retryNovelReply():Promise<void> {
    const r=role(), failed=r && failedNovelReplies.get(r.id);
    if(!failed||!r||isBusy()||r.id!==failed.roleId)return;
    if(data.settings.mode!=='api'){notify('请先连接 API 后再重试');return;}
    const p=failed.kind==='play'?r.play:r.scene;
    const valid=()=>{const current=failed.kind==='play'?r.play:r.scene;const last=current && getActiveMessages(current.messages).filter(m=>m.speaker!=='note').at(-1);return data.roles.includes(r) && current===p && current?.id===failed.sessionId && last?.id===failed.messageId && last.text===failed.text && (last.revisionCount||0)===failed.revision;};
    if(!p||!valid()){failedNovelReplies.delete(r.id);render(false);notify('原场景或发言已变化，无法重试');return;}
    const original=p.messages.find(m=>m.id===failed.messageId)!;
    const validTask=startReplyTask(r,failed.kind,original);
    busyRoles.add(r.id);render(false);let error='';
    try{
      const reply=await apiReply(r,failed.kind,failed.text);
      if(!valid()||!validTask())throw new Error('原场景或发言已变化，回复未保存');
      const item:ChatMessage={id:uid(),speaker:'char',text:reply,at:now(),replyTo:failed.messageId,status:'active'};
      p.messages.push(item);entry(r,failed.kind==='play'?'drama':'scene',`${r.name}的回复`,reply,item.at,{source:p.id,messageId:item.id,speaker:'char'});
      if(failedNovelReplies.get(r.id)===failed)failedNovelReplies.delete(r.id);save();
      if(failed.kind==='scene' && data.selected===r.id && isFarewell(failed.text))endNovel();
    }catch(e){error=e instanceof Error?e.message:String(e);syslog('error',`重试回复失败：${error}`);}
    finally{busyRoles.delete(r.id);render(false);if(error && role()?.id===r.id)notify('回复生成失败：'+error);}
  }

  async function regenerateMessageReply(scope: RevisionScope, charMessageId: string): Promise<void> {
    const r = role();
    if (!r || isBusy()) return;
    const plan = buildRegenerationPlan(data,r,scope,charMessageId);
    if (!plan) { notify('此回合缺少可验证的来源，原消息未改变。'); return; }
    const session = scope==='scene' ? r.scene : scope==='play' ? r.play : null;
    const source = plan.sourceId ? getScopeMessages(r,scope).find(m=>m.id===plan.sourceId) : undefined;
    const validTask = source ? startReplyTask(r,scope,source) : () => data.roles.includes(r);
    const valid = () => data.roles.includes(r) && validTask() &&
      (scope==='chat' || (scope==='scene' ? r.scene : r.play)===session) &&
      plan.contextSignature(getScopeMessages(r,scope))===plan.signature;
    busyRoles.add(r.id);
    render(false);
    let regenerationError='';
    try {
      const reply=data.settings.mode==='api'
        ? await apiReply(r,scope,plan.sourceText || '',plan.messages)
        : demoReply(r,scope,plan.sourceText || '开场');
      if (!valid()) return;
      const trial=prepareRegenerateReply(JSON.parse(JSON.stringify(r)) as RoleData,scope,charMessageId,now());
      if (!trial.ok || JSON.stringify(trial.supersededMessageIds)!==JSON.stringify(plan.supersededIds)) return;
      const list=getScopeMessages(r,scope);
      const insertion=Math.max(0,...plan.supersededIds.map(id=>list.findIndex(m=>m.id===id)))+1;
      const prep=prepareRegenerateReply(r,scope,charMessageId,now());
      if (!prep.ok) return;
      const before=list.length;
      if (scope==='chat') {
        if (plan.sourceId) queueChatReply(r,reply,plan.sourceId,true);
        else applyGeneratedFirstMessage(r,splitChatBubbles(reply,r),now());
      } else {
        const p=scope==='play'?r.play:r.scene;
        if (!p) throw new Error('当前场景已关闭');
        const item:ChatMessage={id:uid(),speaker:'char',text:reply,at:now(),replyTo:plan.sourceId,status:'active'};
        p.messages.push(item);
        entry(r,scope==='play'?'drama':'scene',`${r.name}的回复`,reply,item.at,{source:p.id,messageId:item.id,speaker:'char'});
      }
      const inserted=list.splice(before);
      inserted.forEach((message,index)=>{
        message.at=plan.targetAt+index;
        for (const event of r.events) if (event.messageId===message.id) event.at=message.at;
      });
      list.splice(insertion,0,...inserted);
      syslog('revision',`重抽 ${scope} 角色回复`,{targetMessageId:charMessageId,revisionId:prep.revision?.id});
      save();
      if(role()?.id===r.id)notify('已重新生成；旧版本与后续回合均保留。缺少快照的历史记忆和待办未带入。');
    } catch(e) {
      const msg=e instanceof Error?e.message:String(e);
      syslog('error',`重抽失败：${msg}`);
      regenerationError=msg;
    } finally {
      busyRoles.delete(r.id);
      render(false);
      if(regenerationError && role()?.id===r.id)notify('重抽失败，原回复保留：'+regenerationError);
    }
  }

  function meet(): void {
    const r = role();
    if (!r) return;
    if (ongoing(r)) {
      go('novel');
      return;
    }
    simulate(r);
    const a = routine(r, now());
    const scene = {
      id: uid(),
      startedAt: now(),
      where: a.where,
      messages: [
        {
          id: uid(),
          speaker: 'note' as const,
          text: `${a.where}。空气里有些平凡的声音。你们终于在同一个地方见到了面。`,
          at: now(),
          status: 'active' as const,
        },
        {
          id: uid(),
          speaker: 'char' as const,
          text: `“你来了。”${r.name}抬起头，“刚好我有点时间。要不要坐一会儿？”`,
          at: now(),
          status: 'active' as const,
        },
      ],
    };
    r.scene = scene;
    entry(r, 'scene', '你们开始见面', `地点：${a.where}`, now(), {
      source: scene.id,
    });
    go('novel');
  }

  function endNovel(): void {
    const r = role();
    if (!r) return;
    if (r.play) {
      const p = r.play;
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
    } else if (r.scene) {
      entry(
        r,
        'scene',
        '这次见面结束',
        `在${r.scene.where}告别；开始于${dt(r.scene.startedAt)}，结束于${dt(
          now()
        )}。见面过程有独立保存的原始对白。`,
        now(),
        { source: r.scene.id }
      );
      r.scene.endedAt = now();
      r.lifeAt = now();
      if (!r.meetings) r.meetings = [];
      r.meetings.push(r.scene);
      r.scene = null;
    }
    save();
    go('chat');
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

  function importBackup(file: File | undefined): void {
    if (!file) return;
    const fr = new FileReader();
    fr.onload = async () => {
      try {
        const d = JSON.parse(String(fr.result));
        if (!Array.isArray(d.roles) || !d.settings) {
          throw new Error('不是 Elsewhere 备份');
        }
        await restoreMediaFromBackup(d._media);
        clearMediaURLs(true);
        delete d._media;
        data = normalizeAndMigrateData(d);
        data.selected = null;
        save();
        go('landing');
        notify('已导入备份及媒体附件');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        notify('备份导入失败：' + msg);
      }
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
    if(frameModalSaving&&b.closest('[data-testid=avatar-frame-modal]')&&act!=='cancelframemodal')return;
    let r = role();

    if(act==='nainpreflight'){
      if(!r||isBusy()||diaryQueueBusy||footprintAiBusy){notify('请等待当前请求结束后再清档。');return;}
      if(!window.confirm(`仅清理当前奈恩的互动：${r.chats.length} 条聊天、${r.diaries.length} 篇日记、${r.events.length} 条事件，以及见面／戏剧／足迹状态。若有真实记录请取消。角色资料与其他角色保留；先创建恢复副本。本操作仅执行一次，确认继续？`))return;
      const result=resetNainStart(data,r.id,localStorage,now());
      data=result.data;
      if(result.cleaned){chatDraft='';novelDraft='';intermissionDraft='';focusedRole=null;render(false);notify('奈恩已恢复到等待 API 首条消息的起点，恢复副本已保存。');}
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
    if(act==='intermissionreply'){void requestIntermissionReply();return;}
    if (act === 'chatpanel') {
      chatPanel = chatPanel === b.dataset.panel ? '' : b.dataset.panel || '';
      render(false);
      return;
    }
    if (act === 'closepanel') {
      chatPanel = '';
      render(false);
      return;
    }
    if(act==='senduploadedsticker'){
      const item=uploadedStickers(r?.chats||[]).find(item=>item.mediaId===b.dataset.mediaId);
      if(item&&!isBusy())void sendRichMessage({kind:'sticker',mediaId:item.mediaId,caption:item.caption});
      return;
    }
    if (act === 'recordtoggle') {
      if (voiceRecorder?.state === 'recording') stopRecording();
      else beginRecording();
      return;
    }
    if (act === 'recordcancel') {
      stopRecording(true);
      return;
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
      if (activeFocus()?.phase === 'work') {
        go('focus');
        return;
      }
      focusedRole = null;
      data.selected = b.dataset.id || null;
      r = role();
      if (r) {
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
      if ($('#message-input')) {
        chatDraft = ($('#message-input') as HTMLTextAreaElement).value;
      }
      formMode = 'edit';
      editingRoleId = r.id;
      roleFormReturnView = 'chat';
      resetRoleAvatarDraft();
      draftRoleFrame = buildStagedFrameFromOwner(r);
      go('roleform');
      return;
    }
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
    if (act === 'focuschat') {
      if (r) requestChatFocus(r);
      return;
    }
    if (act === 'declinechat') {
      if (r?.chatInvite?.status === 'offered') {
        r.chatInvite = null;
        save();
        render();
      }
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
      const res = shareDiaryWithRole(r, b.dataset.id, now());
      if (!res.ok) {
        notify(res.reason || '分享失败');
        return;
      }
      syslog('diary', `向 ${r.name} 主动分享了一篇个人日记`, {
        diaryId: b.dataset.id,
      });
      save();
      render(false);
      notify(`已将这篇日记分享给 ${r.name}`);
      return;
    }
    if (act === 'retrydiary') {
      const dateKey = b.dataset.date || '';
      if (!r || !dateKey) return;
      void triggerDiaryTaskForRole(r, dateKey);
      return;
    }
    if (act === 'genfirstmsg') {
      if (r) generateRoleFirstMessage(r);
      return;
    }
    if (act === 'togglerevisions') {
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
    if (act === 'retrychatreply') { void retryChatReply(); return; }
    if (act === 'retrynovelreply') { void retryNovelReply(); return; }
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
      const res = retractMessage(r, scope, b.dataset.id, now());
      if (!res.ok) {
        notify(res.reason || '撤回失败');
        return;
      }
      if (quotingMessage?.id === b.dataset.id) quotingMessage = null;
      if (editingMessageId === b.dataset.id) editingMessageId = null;
      syslog('revision', `撤回 ${scope} 消息`, {
        targetMessageId: b.dataset.id,
        revisionId: res.revision?.id,
      });
      save();
      render(false);
      notify('消息及直接关联的回复已移出正式上下文；后续历史保留。');
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
      r.play.paused = true;
      syslog('intermission', '用户主动暂停演出', { source: r.play.id });
      save();
      go('intermission');
      return;
    }
    if (act === 'resumeplay') {
      if (!r?.play) return;
      r.play.paused = false;
      syslog('intermission', '返回戏内演出', { source: r.play.id });
      save();
      go('novel');
      return;
    }
    if (act === 'rollbackplay') {
      rollBackPlay();
      return;
    }
    if (act === 'resume') {
      if (ongoing(r)) go(r?.play?.paused ? 'intermission' : 'novel');
      return;
    }
    if (act === 'meet') {
      meet();
      return;
    }
    if (act === 'endnovel') {
      if (isBusy()) {
        notify('请先完成当前回复，再结束场景');
        return;
      }
      endNovel();
      return;
    }
    if (act === 'theme') {
      if (!r) return;
      r.theme = (b.dataset.theme as ThemeName) || 'blue';
      syslog('ui', `切换 ${r.name} 的主题：${r.theme}`);
      save();
      render();
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
      data.logs = [];
      save();
      render();
      return;
    }
    if (act === 'clearframe') {
      if (!r) return;
      r.frameId = 'none';
      r.frameData = '';
      r.frameMediaId = '';
      save();
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
    if (act === 'monitortab') {
      monitorTab = b.dataset.tab === 'raw' ? 'raw' : 'footprints';
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
    if (act === 'enrichfootprints') {
      if (!r || footprintAiBusy) return;
      const targetDate = resolveSafeMonitorDateKey(
        b.dataset.date || monitorDateKey,
        now()
      );
      if (!canUseRealModel(data.settings)) {
        notify('当前处于本地演示模式，已展示基于真实互动构建的日常足迹；如需 AI 深度润色，请在「终端」配置自定义 API');
        return;
      }
      footprintAiBusy = true;
      render(false);
      void (async () => {
        let resultNotice = '';
        try {
          const s = data.settings;
          const url = s.endpoint.trim().replace(/\/+$/, '');
          const prompt = buildDailyFootprintsAiPrompt(r!, data.user, targetDate, now());
          syslog('monitor', `请求 AI 润色日常足迹 · ${r!.name} · ${targetDate}`, {
            model: s.model,
          });
          const res = await fetch(url + '/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: 'Bearer ' + token } : {}),
            },
            body: JSON.stringify({
              model: s.model,
              messages: prompt,
              temperature: +s.temperature || 0.7,
              ...completionLimit(s,'footprints'),
            }),
          });
          const rawText = await readCompletion(res);
          const applied = applyAiDailyFootprints(r!, targetDate, rawText, now());
          if (!applied.ok) {
            throw new Error(applied.reason || '未能解析 AI 足迹响应');
          }
          save();
          resultNotice = `已完成 ${r!.name} 在 ${targetDate} 的日常足迹细节润色`;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          syslog('error', `AI 润色日常足迹失败：${msg}`);
          resultNotice = 'AI 润色足迹失败：' + msg;
        } finally {
          footprintAiBusy = false;
          render(false);
          if (resultNotice) notify(resultNotice);
        }
      })();
      return;
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
      void applyFrameModalInPlace(ownerType);
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
      const defaults=frameDefaults(staged);staged.frameScale=defaults.scale;staged.frameX=defaults.x;staged.frameY=defaults.y;rememberFrame(staged);frameSelection++;
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
      if (frameId === 'none') {
        selectFrame(staged,{frameId:'none',frameData:'',frameMediaId:''});
        patchFrameModalSelectionInPlace(ownerType);
        return;
      }
      const presetItem = PRESET_AVATAR_FRAMES.find((x) => x.id === frameId);
      if (!presetItem) return;
      selectFrame(staged,{frameId:presetItem.id,frameData:presetItem.url,frameMediaId:''});
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
      selectFrame(staged,{frameId:cf.id,frameMediaId:cf.mediaId||'',frameData:cf.dataUrl||''});
      patchFrameModalSelectionInPlace(ownerType);
      return;
    }
    if (act === 'confirmterminalframeupload') {
      const blob=stagedTerminalFrameBlob;if(!blob)return;
      const name=(document.querySelector<HTMLInputElement>('#terminal-staged-frame-name')?.value||stagedTerminalFrameName||'自定义头像框').trim().slice(0,36);
      b.setAttribute('disabled','');
      void storeCustomFrame(blob,name,undefined,()=>stagedTerminalFrameBlob===blob).then(item=>{
        if(!item)return;resetStagedTerminalFrame();render(false);notify('已加入头像框图库');
      }).catch(error=>notify('入库失败：'+(error instanceof Error?error.message:String(error)))).finally(()=>b.removeAttribute('disabled'));
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
      const [removed] = list.splice(idx, 1);
      if (removed.mediaId) {
        if (data.user.frameMediaId === removed.mediaId) {
          data.user.frameMediaId = '';
          data.user.frameId = 'none';
        }
        if (draftUserFrame?.frameMediaId === removed.mediaId) {
          draftUserFrame.frameMediaId = '';
          draftUserFrame.frameId = 'none';
        }
        for (const roleItem of data.roles) {
          if (roleItem.frameMediaId === removed.mediaId) {
            roleItem.frameMediaId = '';
            roleItem.frameId = 'none';
          }
        }
        if (draftRoleFrame?.frameMediaId === removed.mediaId) {
          draftRoleFrame.frameMediaId = '';
          draftRoleFrame.frameId = 'none';
        }
        if (modalFrameDraft?.frameMediaId === removed.mediaId) {
          modalFrameDraft.frameMediaId = '';
          modalFrameDraft.frameId = 'none';
        }
        mediaDelete(removed.mediaId).catch(() => {});
      }
      save();
      if (frameModalOwner && document.querySelector('[data-testid="avatar-frame-modal"]')) {
        patchFrameModalBodyAndTabsInPlace(frameModalOwner);
      } else {
        render(false);
      }
      notify('已删除该自定义头像框素材');
      return;
    }
    if (act === 'cacheactiveframe') {
      const ownerType=b.dataset.owner==='user'?'user':'role',staged=getActiveModalOrFormFrameDraft(ownerType,formMode==='edit'?data.roles.find(x=>x.id===editingRoleId):r),url=staged.frameData,selection=frameSelection;
      if(!url||!/^https:\/\//i.test(url))return;
      b.setAttribute('disabled','');
      void (async()=>{try{
        const response=await fetch(url,{mode:'cors'});if(!response.ok)throw new Error('素材下载失败');
        const item=await storeCustomFrame(await response.blob(),'离线缓存 · '+(findPresetFrameByIdOrUrl(staged.frameId)?.label||'头像框'),url);if(!item)return;
        if(frameSelection===selection&&frameModalOwner===ownerType){staged.frameMediaId=item.mediaId||'';patchFrameModalSelectionInPlace(ownerType);}
        notify('已缓存原始素材，动画保持不变');
      }catch{notify('缓存失败，可继续使用远程素材，或在终端上传本地原件。')}finally{b.removeAttribute('disabled')}})();
      return;
    }
    if (act === 'resetbubble') {
      if (!r) return;
      const previous = r.bubbleCSS;
      r.bubbleCSS = '';
      syslog('ui', '清除角色 CSS');
      if (!save()) { r.bubbleCSS = previous; return; }
      const editor = document.querySelector<HTMLTextAreaElement>('#bubble-form [name="css"]');
      if (editor) editor.value = '';
      render(false);
      return;
    }
    if (act === 'tasktoggle' || act === 'taskdelete') {
      const kind = b.dataset.kind as 'ddl' | 'todo';
      const list = data.sharedTasks?.[kind];
      if (!Array.isArray(list)) return;
      const i = list.findIndex((x) => x.id === b.dataset.id);
      if (i < 0) return;
      if (act === 'tasktoggle') list[i].done = !list[i].done;
      else list.splice(i, 1);
      syslog(
        'task',
        `${kind} ${act === 'tasktoggle' ? '完成状态调整' : '删除'}项目`
      );
      save();
      render(false);
      return;
    }
    if (act === 'export') {
      exportData();
      return;
    }
    if (act === 'removeuseravatar') {
      draftUserFormValues = captureFormValues('user-profile-form');
      if (draftUserAvatarPreviewUrl) {
        URL.revokeObjectURL(draftUserAvatarPreviewUrl);
      }
      draftUserAvatarBlob = null;
      draftUserAvatarPreviewUrl = '';
      draftUserAvatarRemove = true;
      render(false);
      notify('已标记移除个人头像，保存资料后生效');
      return;
    }
    if (act === 'removeroleavatar') {
      draftRoleFormValues = captureFormValues('role-form');
      if (draftRoleAvatarPreviewUrl) {
        URL.revokeObjectURL(draftRoleAvatarPreviewUrl);
      }
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
      const newText = String(fd.get('editText') || '').trim();
      const res = editMessage(r, scope, msgId, newText, now());
      if (!res.ok) {
        notify(res.reason || '修改失败');
        return;
      }
      editingMessageId = null;
      editingMessageDraft = '';
      syslog('revision', `编辑 ${scope} 消息`, {
        targetMessageId: msgId,
        revisionId: res.revision?.id,
      });
      const edited = scope === 'chat' ? r.chats.find(m=>m.id===msgId && m.speaker==='me') : undefined;
      if (edited && (res.hadPendingReply || isBusy())) {
        failedChatReplies.set(r.id,{roleId:r.id,messageId:edited.id,text:edited.text,revision:edited.revisionCount||0});
      }
      save();
      render(false);
      notify('消息已修改；直接关联的旧回复已归档，后续历史保留。');
      return;
    }

    if (f.dataset.taskAdd) {
      const kind = f.dataset.taskAdd as 'ddl' | 'todo';
      const text = String(fd.get('text') || '').trim();
      if (text && data.sharedTasks?.[kind]) {
        data.sharedTasks[kind].push({
          id: uid(),
          text,
          due: kind === 'ddl' ? String(fd.get('due') || '') : '',
          done: false,
          at: Date.now(),
        });
        syslog('task', `新增${kind}项目`);
        f.reset();
        save();
        render(false);
      }
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
      const owner=data.user,patch:Partial<UserProfileData>={};
      for(const k of ['name','pronouns','identity','background','notes'] as const)patch[k]=String(fd.get(k)||'').trim().slice(0,10000);
      if(draftUserFrame){syncModalAdjustInputsToStaged('user',draftUserFrame);rememberFrame(draftUserFrame);Object.assign(patch,draftUserFrame);}
      const blob=draftUserAvatarBlob,remove=draftUserAvatarRemove;
      try{
        const ok=await persistAppearance(owner,patch,{blob,remove},{put:mediaPut,remove:mediaDelete,save,uid:()=>makeUid('ava_u'),current:()=>f.isConnected&&data.user===owner&&draftUserAvatarBlob===blob});
        if(!ok)return;
        resetUserAvatarDraft();syslog('identity','更新用户全局资料与头像框');go('landing');notify('我的资料与头像装扮已保存');
      }catch(error){notify('资料未保存：'+(error instanceof Error?error.message:String(error)));}
      return;
    }

    if (f.id === 'role-form') {
      const name=String(fd.get('name')||'').trim();if(!name)return;
      const existing=formMode==='edit'?data.roles.find(x=>x.id===editingRoleId):undefined;
      const owner=existing||createRole(name,'',String(fd.get('job')||''),String(fd.get('traits')||''),String(fd.get('place')||''));
      if(!existing){owner.relationship='';initNewRoleFirstMessageState(owner,data.settings,now());}
      const patch:Partial<RoleData>={};for(const k of ['name','job','traits','place','profile','relationship','canonNotes'] as const)patch[k]=String(fd.get(k)||'').trim().slice(0,20000);
      if(draftRoleFrame){syncModalAdjustInputsToStaged('role',draftRoleFrame);rememberFrame(draftRoleFrame);Object.assign(patch,draftRoleFrame);}
      const blob=draftRoleAvatarBlob,remove=draftRoleAvatarRemove,selected=data.selected;
      try{
        const ok=await persistAppearance(owner,patch,{blob,remove},{put:mediaPut,remove:mediaDelete,uid:()=>makeUid('ava_r'),current:()=>f.isConnected&&draftRoleAvatarBlob===blob,save:()=>{
          if(!existing)data.roles.push(owner);data.selected=owner.id;
          if(save())return true;
          if(!existing)data.roles=data.roles.filter(x=>x!==owner);data.selected=selected;return false;
        }});
        if(!ok)return;
        resetRoleAvatarDraft();syslog('role',`${existing?'编辑':'创建'}角色：${owner.name}`);go(existing?roleFormReturnView:'home');notify(existing?'角色资料与头像装扮已保存':`已创建角色 ${owner.name}`);
        if(formMode!=='edit'&&canUseRealModel(data.settings))void generateRoleFirstMessage(owner);
      }catch(error){notify('角色资料未保存：'+(error instanceof Error?error.message:String(error)));}
      return;
    }

    if (f.id === 'delete-role-form') {
      const target = data.roles.find((x) => x.id === deleteRoleId);
      if (!target) return;
      if (String(fd.get('confirmName') || '').trim() !== target.name) {
        notify('名字不匹配，未删除角色');
        return;
      }
      ensureFocusData();
      if (data.focus?.active) {
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
      for (const m of target.chats || []) {
        if (m.mediaId) mediaDelete(m.mediaId).catch(() => {});
      }
      if (
        target.avatarMediaId &&
        !data.roles.some(
          (other) =>
            other.id !== target.id && other.avatarMediaId === target.avatarMediaId
        )
      ) {
        mediaDelete(target.avatarMediaId).catch(() => {});
      }
      data.roles = data.roles.filter((x) => x.id !== target.id);
      data.logs = (data.logs || []).filter((x) => x.roleId !== target.id);
      data.selected = null;
      editingRoleId = null;
      deleteRoleId = null;
      focusedRole = null;
      syslog('role', `已删除角色及其存档：${target.name}`);
      save();
      go('landing');
      notify('已删除角色');
      return;
    }

    if (f.id === 'message-form') {
      const inputEl = $('#message-input') as HTMLTextAreaElement | null;
      const t = inputEl?.value || '';
      if (!role() || isBusy() || isComposing || !t.trim()) {
        if (isBusy()) notify('请等待当前回复完成，输入内容已保留。');
        return;
      }
      chatDraft = '';
      if (inputEl) inputEl.value = '';
      submitText('chat', t);
      return;
    }

    if (f.id === 'intermission-form') {
      const inputEl = $('#intermission-input') as HTMLTextAreaElement | null;
      const t = String(fd.get('text') || inputEl?.value || '').trim();
      if (!role()?.play?.paused || isBusy() || isComposing || !t) return;
      intermissionDraft = '';
      if (inputEl) inputEl.value = '';
      submitIntermission(t);
      return;
    }

    if (f.id === 'intermission-settings-form') {
      const p = role()?.play;
      if (!p || !p.paused) return;
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
      syslog('intermission', '幕间修改剧本设定', { source: p.id });
      save();
      render();
      notify('设定已保存，返回演出后生效');
      return;
    }

    if (f.id === 'novel-form') {
      const inputEl = $('#novel-input') as HTMLTextAreaElement | null;
      const t = inputEl?.value || '';
      const current = role();
      if (!current || isBusy() || isComposing || !t.trim() || (!current.play && !current.scene) || current.play?.paused) return;
      novelDraft = '';
      if (inputEl) inputEl.value = '';
      submitText(role()?.play ? 'play' : 'scene', t);
      return;
    }

    if (f.id === 'diary-form') {
      const r = role();
      const text = String(fd.get('text') || '').trim();
      if (!r || !text) return;
      createUserDiary(r, text, now());
      f.reset();
      syslog('diary', '保存了一篇私人日记（默认未向角色公开）');
      save();
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
      save();
      go('novel');
      return;
    }

    if (f.dataset.frameAdjustOwner || f.id === 'frame-adjust') {
      const ownerType = f.dataset.frameAdjustOwner === 'user' ? 'user' : 'role';
      const targetOwner = ownerType === 'user' ? data.user : role();
      if (!targetOwner) return;
      targetOwner.frameScale = Math.max(
        0.5,
        Math.min(3, Number(fd.get('size')) || 1.25)
      );
      targetOwner.frameX = Math.max(-80, Math.min(80, Number(fd.get('x')) || 0));
      targetOwner.frameY = Math.max(-80, Math.min(80, Number(fd.get('y')) || 0));
      save();
      render(false);
      notify('头像框尺寸与偏移位置已保存');
      return;
    }

    if (f.id === 'bubble-form') {
      const r = role();
      if (!r) return;
      const css = String(fd.get('css') || '');
      if (css.length > BUBBLE_CSS_LIMIT || (css.trim() && !safeBubbleCSS(css))) {
        notify('CSS 未保存：最多 12000 字符，请使用支持的气泡选择器，不含外部资源或定位覆盖。');
        return;
      }
      const previous = r.bubbleCSS;
      r.bubbleCSS = css;
      syslog('ui', '更新角色聊天气泡 CSS');
      if (!save()) { r.bubbleCSS = previous; return; }
      render(false);
      notify('气泡样式已保存');
      return;
    }

    if (f.id === 'profile-form') {
      const r = role();
      if (!r) return;
      r.profile = String(fd.get('profile') || '');
      r.traits = String(fd.get('traits') || '');
      r.relationship = String(fd.get('relationship') || '');
      r.notes = String(fd.get('notes') || '');
      r.userAlias = String(fd.get('userAlias') || '').trim();
      save();
      render(false);
      notify('人设已保存');
      return;
    }
  });

  appRoot.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    if (el.id === 'bubble-css-file' && el.files?.[0]) {
      const file = el.files[0];
      el.value = '';
      const editor = document.querySelector<HTMLTextAreaElement>('#bubble-form [name="css"]');
      if (!editor) return;
      if (!/\.css$/i.test(file.name) || file.size > BUBBLE_CSS_LIMIT) {
        notify('请选择 12KB 以内的 .css 文件；当前样式未改变。');
        return;
      }
      const owner = role()?.id, before = editor.value;
      void file.text().then(css => {
        if (!editor.isConnected || role()?.id !== owner || editor.value !== before) return;
        if (!css.trim() || !safeBubbleCSS(css)) {
          notify('未导入：未找到支持的气泡规则，或包含外部资源／不安全 CSS。当前样式未改变。');
          return;
        }
        editor.value = css;
        editor.focus({preventScroll:true});
        notify('CSS 已载入编辑器，点击「应用气泡 CSS」才会保存。');
      }).catch(() => notify('CSS 文件读取失败；当前样式未改变。'));
      return;
    }
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
      draftUserFormValues = captureFormValues('user-profile-form');
      if (draftUserAvatarPreviewUrl) {
        URL.revokeObjectURL(draftUserAvatarPreviewUrl);
      }
      draftUserAvatarBlob = f;
      draftUserAvatarPreviewUrl = URL.createObjectURL(f);
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
      draftRoleFormValues = captureFormValues('role-form');
      if (draftRoleAvatarPreviewUrl) {
        URL.revokeObjectURL(draftRoleAvatarPreviewUrl);
      }
      draftRoleAvatarBlob = f;
      draftRoleAvatarPreviewUrl = URL.createObjectURL(f);
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
      el.value='';
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

      const selection=frameSelection;
      void storeCustomFrame(f,f.name.replace(/\.[^.]+$/,'').slice(0,32)||'自定义头像框').then(item=>{
        if(!item)return;
        if(frameSelection===selection&&frameModalOwner===ownerType){selectFrame(staged,{frameId:item.id,frameMediaId:item.mediaId||'',frameData:''});patchFrameModalBodyAndTabsInPlace(ownerType);}
        notify('已加入我的上传，确认使用后保存头像装扮');
      }).catch(error=>notify('上传失败：'+(error instanceof Error?error.message:String(error))));
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
    if (el.id === 'font-select') {
      const r = role();
      if (r) {
        r.font = (el.value as 'system' | 'serif') || 'system';
        save();
        render(false);
      }
    }

  });

  appRoot.addEventListener('input', (e) => {
    const el = e.target as HTMLTextAreaElement | HTMLInputElement;
    if (el.id === 'message-input') chatDraft = el.value;
    if (el.id === 'novel-input') novelDraft = el.value;
    if (el.id === 'intermission-input') intermissionDraft = el.value;
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
      if(frameModalSaving)return;
      const ownerType = el.dataset.owner === 'user' ? 'user' : 'role';
      const staged = getActiveModalOrFormFrameDraft(
        ownerType,
        formMode === 'edit' ? data.roles.find((x) => x.id === editingRoleId) : role()
      );
      const field = el.dataset.frameAdjustInput;
      if (field === 'size') {
        staged.frameScale = Math.max(0.25, Math.min(4, Number(el.value) || 1.25));
      } else if (field === 'x') {
        staged.frameX = Math.max(-80, Math.min(80, Number(el.value) || 0));
      } else if (field === 'y') {
        staged.frameY = Math.max(-80, Math.min(80, Number(el.value) || 0));
      }
      rememberFrame(staged);frameSelection++;
      const box=document.querySelector<HTMLElement>('.frame-live-preview');
      updateAvatarBoxFrameInPlace(box,staged);
      document.querySelectorAll<HTMLElement>('.frame-cell.selected .avatar-composite').forEach(el=>updateAvatarBoxFrameInPlace(el,staged));
    }
    if (el.id === 'frame-search-input') {
      const ownerType = frameModalOwner || 'role';
      frameGallerySearch = el.value;
      frameGalleryPage = 0;
      if(frameGallerySourceTab==='preset')patchFrameModalPresetGridInPlace(ownerType);else patchFrameModalBodyAndTabsInPlace(ownerType);
      return;
    }

  });

  appRoot.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    const frameDialog=document.querySelector<HTMLElement>('[data-testid="avatar-frame-modal"]');
    if(frameDialog){
      if(e.key==='Escape'&&!e.isComposing){e.preventDefault();closeFrameModalInPlace();return;}
      if(e.key==='Tab'){
        const controls=Array.from(frameDialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),summary')).filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
        const first=controls[0],last=controls.at(-1);
        if(first&&last&&(!frameDialog.contains(target)||(e.shiftKey?target===first:target===last))){e.preventDefault();(e.shiftKey?last:first).focus();}
      }
      return;
    }
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

  for (const roleItem of data.roles) {
    syncRoleDiaryTasks(roleItem, data.settings, now(), { resetGenerating: true });
  }
  save();
  if (canUseRealModel(data.settings)) {
    void processDiaryQueue();
  }

  if (typeof setInterval === 'function') {
    setInterval(() => {
      const r = role();
      let update = syncFocusMoments();
      if (r) {
        update = deliverPending(r) || update;
        update = resolveChatInvite(r) || update;
      }
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
        .querySelectorAll<HTMLElement>('.status-time, .homescreen-time')
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
        !isBusy()
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
        if (deferFullRender) {
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
