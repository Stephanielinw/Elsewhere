## UI/UX 实机前修正 · 心声、幕间、表情与奈恩起点（2026-10-29）

- 监控离线模板与 AI 润色要求改为第一人称短心声，过滤分析报告式输出，并兼容旧缓存展示；原始溯源不变。
- 幕间讨论改为戏中戏右侧独立气泡窗口，发送仅存用户消息，爪印明确触发 AI；保留剧本修改、回退与正式演出数据。
- 删除八款内置表情资源与发送入口，保留用户 PNG／JPG／GIF／WebP 上传及复用，历史默认表情转为文字占位。
- 奈恩新存档不再预置开场，API 前不制造手机首条回复或演示日程／日记；旧原厂演示支持带恢复副本的一次性清理，其他历史需在角色资料核对后手动确认。
- 原有 56 项测试不变，新增 5 项，npm run verify 61/61 通过；三种版本共 30 条隔离浏览器流程通过。真实存档按用户选择由其自行刷新核对，详见 UI_UX_PRE_USE_REPORT.md。

## 预设内容开关 · 解除分类锁定（2026-10-29）

- 移除按 NSFW、成人或规避类名称／正文关键词强制禁用普通 Prompt 的规则；现有开关、编辑、自动保存和模式覆盖直接生效，原件及存储格式不变。
- 按用户补充选择继续关闭 snow 小剧场；保留 Marker、注入格式校验与第三方脚本／正则不执行规则。
- 更新与旧禁用规则冲突的测试期待，新增两项内容开关、覆盖继承及惰性展示测试。真实原件校验如实显示此前被分类过滤隐藏的 roll 等宏兼容缺口；未接入真实模型。
- npm run verify：56 项测试通过；三种版本共 18 条针对性交互验证通过，详见 PRESET_CONTROLS_REPORT.md。

## APP-UX · 独立预设 App 与自动保存（2026-10-29）

- 将同一套预设管理器移至手机「预设」App；终端仅保留 API 与模型连接，移除最大输出 Token 输入。桌面为日记、监控、预设，Dock 原四项不变。
- 移除定位、记忆、人物的独立前台入口；后台记忆、历史地点、角色／用户编辑保留。外观、头像框素材与备份等移至桌面「角色资料」页的手机设置区域。
- 按现有稳定预设 ID 与小说模式自动保存即时配置；串行写入、快速修改合并，切换与离开前等待。失败保留最新修改并允许重试，正文编辑仍需明确保存／取消。复用原有原件、迁移、更新及冲突保护，不改存储格式或果实编译器。
- 原生请求采用任务／模型对应的输出上限，忽略存档中的旧全局小上限；未知兼容服务的小说请求沿用服务端默认。返回长度上限信号时提示，无自动重试。
- 保留原有 51 个测试和断言，新增 3 个自动保存与请求参数测试；验证和截图见 APP_UX_REPORT.md。未接入真实果实小说生成。

## TERMINAL-UX · 统一连接、预设选择与 Prompt 管理（2026-10-29）

- 重组终端为 API 与模型 → 整套预设选择 → 当前预设编辑；移除旧分离入口和直接写入世界存档的预设控件，保留原生请求与历史附加预设数据。
- 增加显式 GET 模型发现、搜索下拉与手动 ID，保留兼容根路径和 /v1；超时、取消、鉴权和 CORS 错误脱敏，Key 只在本页内存。
- 私有 IndexedDB 升至版本 2，新增多预设库与修订冲突保护；保留旧 FRUIT-01 文档和迁移副本、原始字节与两个模式设置。
- Profile 支持正文/Role/注入编辑、相对排序与自建条目；真实参与隔离编译。更新原件需确认差异，兼容覆盖按 ID 继承，不兼容覆盖明确列出，成功后暂停启用。
- 原有 45 个测试不变，新增 6 个针对性测试；含真实原件验证 51/51 通过，三种运行形态共 33 条浏览器流程通过。详见 TERMINAL_UX_REPORT.md。

## FRUIT-UI-02 · 果实模式配置中心（2026-10-29）

- 将终端果实面板重做为模式配置中心：双模式分段切换、原件摘要、八类折叠卡片、胶囊开关、搜索与只看已启用；UUID 与注入字段默认隐藏。
- 新增 UI 命名／分组映射与视图模块，提供条目详情、分段 Prompt 预览、兼容报告弹层、当前模式覆盖导出；保留原件导出与原有保存行为。
- 搜索、启停、保存及高级视图状态同步采用局部更新；保存恢复焦点，模式切换保留独立草稿，弹层支持 Esc 与焦点返回。
- 果实核心导入、编译、存储、数据结构与原生页面源码保持不变；原有 43 个测试未修改，新增 2 个 UI 映射测试。具体三种运行形态验收与截图见 FRUIT_UI_02_REPORT.md。

## FRUIT-01 · 本地果实预设管理与隔离编译预览（2026-10-29）

- 终端新增 🍎 果实预设管理：本地 JSON 校验导入、原始字节导出、元数据、分组条目与兼容诊断；原始文件使用独立 IndexedDB，不进入公开资源或世界存档。
- 见面小说与正式演出共用原件，各自保存条目覆盖、文风、正文长度及输出选项；导入失败、写入失败和旧标签页冲突均保留已存配置。重新导入仅继承已保存设置。
- 独立模块实现 prompt_order、八类 Marker、有限深度注入与请求内宏变量；替换原固定正文长度，排除 snow、成人专属及安全规避条目。所有第三方正则和扩展脚本保持不执行。
- 编译预览使用四层测试上下文及现有关键词检索，展示 role、来源、变量与限制；不发送模型请求，不接入正式生成，不改变原生聊天、日记、Focus 等 Prompt 或用户数据结构。
- 原有 20 个测试保持原样，新增 23 个果实测试；指定真实私有文件时 43/43 通过，普通验证 42 通过、1 个私有文件测试显式跳过。开发、正式构建与离线 HTML 各通过 11 条隔离浏览器流程。
- 更新 README、FRUIT_01_REPORT.md 与验证证据；审计遗留问题未宣称修复，本批完成后停止。

## MAINT-002 · 开发环境修复与验证基线（2026-10-29）

- 将 esbuild 范围由 ^0.25.0 调整为 ^0.28.2，与现有 Vite 8.3.5 的 peer 要求兼容；其余依赖范围保留，生成 package-lock.json，并在新空目录通过正常 npm ci。
- 清除 18 条 TypeScript 诊断：Focus 使用现有 traits 与既有默认值，移除未接入资料结构的 mood 判断；足迹五处引用格式化补全姓名；补 CustomAvatarFrame 类型导入；两条测试事件改用 knownBy/where。
- 保持 RoleData、UserProfileData、AppData 和迁移结构不变，不新增虚假可选字段，不添加 any 或忽略指令。Focus Prompt 的人物性格输入调整见 MAINT_002_REPORT.md。
- 新增 typecheck、test、build:standalone、verify 命令；正式 build 先检查类型并刷新离线 HTML。类型错误会阻止两种构建和统一验证。
- 原 18 个测试断言保持不变，新增 2 个引用姓名与 Focus 人设回归；20/20 通过。完成三个构建入口的负向门禁检查，以及三种运行形态下聊天、终端、头像框和 Focus 基础页面验证。
- 更新 README 与 MAINT_002_REPORT.md；本轮没有整理目录、全面重构、修改记忆规则或接入果实。存档安全等审计问题继续保留。

## MAINT-001 · 项目目录整理与恢复基线（2026-10-29）

- 在项目外建立完整原始快照，并实际解包校验全部 139 个文件后再移动。
- 将旧原型和参考资料移出 public，归档历史截图、录屏、Bible、独立审计报告及证据；74 个文件移动、65 个保留原位，不删除历史副本。
- 保留 src、现有测试、正式构建脚本和单文件 HTML 的位置与内容；37 个用途待确认的 AI Studio 媒体原位保留。
- 更新 README、审计证据链接与五个调查脚本的输出路径；提供前后清单、恢复说明及 MAINT_001_FOLDER_REPORT.md。
- 仅整理目录，不修复业务缺陷，不初始化 Git；FRUIT-00 / FRUIT-01 继续暂停。
## Track B · 头像框选择弹窗局部刷新 Bug 修复（Avatar Frame Modal In-Place DOM Patching）
- ROOT CAUSE: 原先在头像框弹窗内点击任意预设/自定义头像框缩略图（`selectpresetframe` / `selectcustomframe`）、展开缩放微调抽屉（`toggleframeadjust`）、翻页（`framepage`）、切换标签页（`framesourcetab`）或输入搜索词（`#frame-search-input`）时，均直接调用了整页重绘函数 `render(false)`。`render(false)` 会先执行 `clearMediaURLs()`（吊销全页所有 `blob:` ObjectURL）再重写 `#app.innerHTML`，导致背景整个人物编辑页（`#role-form` / `#user-profile-form`）、毛玻璃遮罩层以及弹窗内 36 张 GIF 缩略图节点被整棵销毁重建，从而引发每次点击缩略图时整页明显闪动/重挂载。
- IN-PLACE SURGICAL UPDATE (`patchFrameModalSelectionInPlace` / `updateAvatarBoxFrameInPlace`): 重构弹窗全部交互为精准局部 DOM 更新——点击头像框缩略图时，仅原地更新弹窗顶部实时预览容器（`.frame-live-preview`）内的叠加层 `<img class="avatar-frame">`（含 `src`、`--frame-size`、`--frame-x`、`--frame-y`）、顶栏状态文案（`[data-testid="frame-active-status-*"]`）、「📥 离线缓存」按钮显隐及网格缩略图 `.frame-cell.selected` 高亮类名；完全不触发 `render()`、`#app.innerHTML` 重写或父级 `#role-form` 重挂载，也不吊销已有头像的 `blob:` URL。
- PRESERVED STATE & TWO-TIER DRAFT (`openFrameModalInPlace` / `applyFrameModalInPlace` / `closeFrameModalInPlace`): 切换头像框、搜索、翻页、展开/收起缩放微调抽屉以及点击「取消 / 应用」均在局部 DOM 完成，100% 保留当前缩放比例与 X/Y 偏移参数、弹窗 `.frame-modal-body` 滚动位置、背景 `.viewport` 滚动位置、输入框焦点以及人物编辑表单中尚未保存的文本与头像修改草稿，严格维持「弹窗草稿 (`modalFrameDraft`) → 表单草稿 (`draftRoleFrame`) → 保存角色修改 (`localStorage`)」双层草稿机制。

## Track B · UI 改造 03-B：Focus 专注系统改造（陪伴专注计时、真实 Live Log、结算报告与归档）
- SIMPLIFIED FOCUS SETUP (`src/core/focus.ts` + `screenFocus`): 删除旧版「POMODORO＋新的一轮」大卡片及重复时长设置，解决顶部 25 分钟与下方新的一轮 30 分钟冲突问题；主界面按顺序重构为：(1) 顶部大型专注时间（默认 `25:00`，明确标注 `25 分钟`，支持 `5–120` 分钟、`5` 分钟步进按钮、滑块与快捷预设芯片）；(2) 「我正在专注什么」（支持自由输入单条任务或点击「＋ 添加」列出多项待办任务，不强制固定类别）；(3) 「邀请谁一起专注」（支持跨角色多选陪伴，也支持一键切换为「独自专注」）；(4) 底部明确的「开始专注」主按钮。默认单轮专注结束后直接进入结算归档，不再强制配置休息轮次或自动循环；不引入 G 币、好感度数值或切屏惩罚规则。
- REAL-TIME LIVE LOG & PAUSE/RESUME (`syncActiveFocusLiveLogs` + `generateGroundedLiveLogMoment`): 移除旧版按 25%/60%/90% 进度插入的固定三段模板，改为基于真实生成时间戳（`at <= Date.now()`）与角色人设/当下状态的 **Live Log（实时陪伴动态）**；展示各参与角色的当前状态、简短内心想法（`💭 内心：...`）以及多样化陪伴行为（各自安静忙工作、抬头看进度、处理自己手头的小插曲或简短叮嘱），严禁虚构用户已完成任务；支持暂停与恢复计时，暂停期间冻结有效时长且不继续生成新的 Live Log；受邀角色若处于「不可打扰/离线」等忙碌状态可自然婉拒并展示原因，不影响用户独自与其他已接受角色开始专注。
- FOCUS SETTLEMENT MODAL (`settleActiveFocusSession` + `renderFocusSettlementModal`): 倒计时自然归零（`completed`）或点击「提前结束」（`ended_early`）时，自动弹出 Liquid Glass 专注结算报告弹窗，完整展示专注任务、计划与实际有效专注时长、开始与结束时间、完成状态徽标、共同专注角色、可展开查看的完整 Live Log 时间线，以及各参与角色的专属专注小结（支持配置自定义 API 后独立点击「↻ 重新生成小结」重试）；独自专注完成时仅生成个人专注完成报告，绝不虚构角色评论；按会话 `id` 幂等保护，不重复结算。
- DAILY TIMER RECORDS & MEMORY ISOLATION (`getFocusSessionsForDate` + `role.events`): 新增「我的计时记录」日期归档区，支持通过「‹ 前一天」、日期选择器与「后一天 ›」按本地日历日（`YYYY-MM-DD`）筛选查看全部已完成与提前结束记录及当日累计有效时长，点击任意记录即可重新打开完整结算报告弹窗；严格遵守知情权限边界——仅将共同专注经历（`kind: 'focus'`，`knownBy: ['user', role.id]`）写入实际参与角色的 `events` 记忆并联动角色每日 AI 日记（`collectDailyDiaryFacts`），未受邀或婉拒的角色绝不获得该次专注记忆。

## Track B · UI 改造 03-A：头像框弹窗选择器（Avatar Frame Modal Picker）
- MODAL INTERACTION (`screenRoleForm` / `screenUserProfile` + `renderAvatarFrameModal`): 移除人物编辑页与全局「我的资料」页中原先独立占满版面的大号「头像框选择＋实时预览」卡片，彻底消除页面上下两个重复头像预览区域的冗余；在「角色独立头像」与「个人头像（全局用户资料）」卡片内保留「上传头像 / 更换头像」，并在其右侧并排新增「选择头像框」按钮，点击后在当前页弹出 Liquid Glass 风格头像框选择窗口（`role="dialog"`，不跳转页面）。
- LIVE PREVIEW & COLLAPSIBLE CONTROLS: 弹窗顶部展示当前头像（含未保存的新上传头像草稿）与所选头像框的实时叠加预览；下方展示缩略图网格，点击任意缩略图或「不使用头像框」立即更新弹窗顶部预览；仅保留「预设头像框 (363)」与「用户上传的头像框」两个标签，不增加任何主题分类；保留动态 GIF 播放、缩放比例（`0.5`～`3.0`）与水平/垂直偏移（`X` / `Y`）微调，并将高级微调控件默认折叠为「⚙ 缩放与位置微调」抽屉，避免挤占主浏览区。
- TWO-LEVEL DRAFT PROTECTION (`modalFrameDraft` → `draftRoleFrame` / `draftUserFrame` → 正式保存): 弹窗底部提供明确的「取消」与「应用」按钮：点击「取消」（或点击右上角 `×`、遮罩层）仅关闭弹窗并丢弃本次弹窗内改动，绝不覆盖表单既有头像框草稿或存档设置；点击「应用」将弹窗草稿写入当前表单编辑草稿并实时更新表单头像预览与状态文案，最终仍以点击表单底部「保存角色修改」或「保存我的资料」为准；「终端」继续仅负责本地头像框素材上传、预览、确认入库与删除。

## Track B · UI/UX 改造 02：聊天交互、头像框入口与终端修复
- MULTI-BUBBLE CHAT (`src/core/prompt.ts` + `src/core/revisions.ts` + `src/elsewhereApp.ts`): 支持一次 AI 角色回复由 1～多条自然手机消息气泡组成（`splitNaturalChatBubbles`），支持结构化 JSON 数组、`<bubble>`、`|||`、自然换行及自然话轮转折解析；结合角色性格区分话少角色（保持单条短句）与健谈角色（自然分 2～3 条发送），自动剥离误混入的动作旁白；每条气泡拥有独立 `id` 并共享 `replyTurnId` 与 `replyTo`，在同轮任意气泡上点击「重抽」会整轮作废该次 AI 回复的全部气泡、待投递队列与关联 `role.events` 记忆。
- CHAT TOP-RIGHT HEADER (`screenChat`): 移除互动栏旧文字按钮「邀请专心聊／结束专心聊」，在聊天顶栏右上角 `•••` 左侧新增 SVG 矢量猫爪印按钮（`[data-testid="chat-focus-paw-btn"]`）：浅色猫爪印（`is-light`）代表普通日常联系，点击发起「专心聊」邀请；角色拒绝或延后时保持浅色猫爪印并支持再次点击追邀；仅在角色同意进入「专心聊」后切换为深色猫爪印（`is-dark`），点击深色猫爪印即退出「专心聊」恢复浅色。右上角 `•••`（`[data-testid="chat-role-edit-btn"]`）改为直接进入当前角色的「角色修改页面（`screenRoleForm`）」，点击返回或取消直接回到聊天且完整保留未发送输入草稿与聊天状态。
- AVATAR FRAME ENTRY REALLOCATION (`screenRoleForm` / `screenUserProfile` / `screenTerminal`): 将角色头像框的实际选用与缩放/X/Y 位置调节收归「人物编辑页」（及全局「我的资料」页），采用草稿态（`draftRoleFrame` / `draftUserFrame`）实时预览，点击「保存」才正式写入，点击「取消修改并返回」或左上角返回完全保留原设置；「终端」页重构为纯粹的「头像框素材管理」（选择本地透明 PNG/SVG/GIF/WebP -> 预览框检查 -> 点击「确认加入头像框图库」写入 IndexedDB 与 `data.customFrames`，或点击「取消上传」丢弃，绝不直接改动任何角色正在使用的头像框）；彻底移除无依据的「猫耳 / 丝带 / 花环 / 科技 / 编号特效」臆测主题分类，仅保留「预设头像框 (363)」与「用户上传的头像框」两个来源切换。
- FIX TERMINAL SCROLL JUMP (`src/core/domGuard.ts` + `src/elsewhereApp.ts`): 修复 `captureUIState` / `restoreUIState` 对 `.viewport:0` 键名的忽略以及同视图重绘（`sameView`）未保持 `.viewport` 滚动位置的问题；在终端页面中部或底部修改输入框、切换下拉框、勾选预设开关或提交设置表单后，页面均稳定停留在当前滚动位置，不再自动跳回顶部。

## Track A · 监控与自主生活记录呈现优化（日常足迹＋安全纸质物件）
- REFACTOR (`src/core/footprints.ts` + `screenMonitor`): 将监控默认视图重构为第三人称「日常足迹概览」，按 45 分钟会话窗口自动合并线上联络（如「与妈咪线上联络 · 共 N 条消息」），消除旧版逐条重复展示「奈恩说过……」「你说过……」与机械按小时报时的问题；允许一天十分平静，并严格按 `timestamp <= now()` 过滤未来时刻记录。
- OMNISCIENT & RAW STREAM (读心未完成说明): 每条足迹卡片提供可展开的关联原始对话明细，顶部保留「👁 完整原始事件流」切换标签。**注意（未完成项）：当前卡片内的「角色状态读心（`innerThought`）」仅由 `deriveCharacterInnerThought` 根据角色设定与文本摘要在构建足迹时作规则推测（或事后点击 AI 润色生成），尚未实现「对话/事件发生当下同步生成并归档真实角色心理状态」，故正式监控读心闭环标记为未完成（◐）。**
- SAFE ARTIFACTS: 摒弃参考代码中直接注入 AI 原始 `html_snippet` 的 XSS 风险，采用强类型结构化 `FootprintArtifact`（`receipt` / `ticket` / `memo` / `list` / `letter` / `dossier`）与 6 种纸质样式（`thermal` / `ticket` / `sticky` / `parchment` / `dossier` / `craft`）安全转义渲染；内置时代/世界观守卫（奈恩密歇根美元 `$` 单据/电影票根/探案随身夹页便签、沈叙苏州平江路宣纸修书笺、古希腊/古典西方严禁现代小票与货币符号）。
- CALENDAR & DIARY SYNC: 新增足迹日历抽屉支持按月回看历史日期（标有 `🐾` 印记），并与角色每日 AI 日记共用 `collectDailyDiaryFacts` 同一套真实历史事实源。

## Track B · 预设头像框图库导入与自定义上传（363 款去重＋角色/用户独立）
- AUDIT & IMPORT (`src/core/avatarFrames.ts`): 完整审计 `avatar-frames.js` 全部 365 条记录（1 条 `"none"` + 364 条 URL，剔除 rawIndex 72/73 的 1 条重复 URL `IMG-5578.gif` 后共导入 **363 款唯一动态 GIF 头像框**），分配唯一稳定 ID `preset_frame_001`..`preset_frame_363` 解决原文件 `frame_14` 等重复 ID 冲突。
- GALLERY UI (`renderAvatarFrameGalleryCard`): 在「终端」（角色专属，并在「人物」页提供快捷跳转入口）与「我的资料」（全局用户专属）提供统一头像框图库，分为「预设头像框图库 (363)」与「自定义上传」，支持分类筛选（全部 / 猫耳 / 丝带 / 花环 / 科技 / 编号特效）、关键词搜索、分页懒加载（每页 36 款）、实时叠加预览、设为「无头像框」、缩放（`size`）与水平/垂直偏移（`x` / `y`）调节。
- VERIFIED PERSISTENCE & CACHE: 经浏览器实测验证：(1) 预设 GIF 选中、保存位置并刷新重载后正常保持显示；(2) 本地透明图片（SVG/PNG）上传至 IndexedDB 并在刷新重载后正常恢复显示；(3) `i.postimg.cc` 远程 GIF 实测支持 `fetch(..., { mode: 'cors' })`（HTTP 200，`image/gif`）并可成功写入本地 IndexedDB 缓存。

## Track A · 核心系统专项：角色每日 AI 日记系统
- REMOVE: 彻底移除 `simulate()` 中基于固定模板（`今天有些事是按部就班的……有些话还没想好怎么讲。`）的伪造日记生成，并在加载与迁移时自动清理旧模板残留。
- ADD (DAILY SCHEDULER & BACKFILL): 新增当地时间 `00:00` 跨日检测与离线打开顺序补写队列（`role.diaryTasks`），为每名角色每个日历日（`YYYY-MM-DD`）严格归档唯一一篇正式 AI 私人日记；刷新、切换页面或重复打开不会重复生成或重复计费。
- ADD (FACT & CANON ISOLATION): 新增 `collectDailyDiaryFacts` 与 `buildCharacterDiaryPrompt`，按目标日期 `[00:00:00, 23:59:59.999]` 提取有效聊天、面对面叙事、共同专注、戏剧及用户已主动分享日记；严格剔除未分享私密日记、已撤回/已编辑覆盖的旧消息及目标日期之后的未来记录；内置奈恩（Nain）专属 Canon 防 OOC 与防剧透保护。
- UI (`screenDiary`): 在保持 Liquid Glass 风格的前提下，展示待连接 API / 排队待补写 / 生成中 / 生成失败状态卡片与一键重试，归档日记按日期倒序展示目标日期、字数、生成时间与事实溯源摘要，并优化长文阅读排版。

## Track B · UI/UX 改造 01-B：头像管理
- ADD: 「我的资料」全局个人头像管理（本地图片上传、实时预览、保存、更换、移除），存储于 IndexedDB（`user.avatarMediaId`），默认显示首字占位图，保存后同步展示于角色选择页「我的资料」卡片及角色手机「人物」页。
- ADD: 「我的角色」独立角色头像管理（在创建角色与编辑角色页面支持上传、实时预览、更换、删除），存储于 IndexedDB（`role.avatarMediaId`），同步联动角色选择页、桌面小组件、聊天、专注陪伴、人物页与终端头像框预览。
- STORAGE & PRIVACY: 头像资源统一走 IndexedDB `blobs` 存储，避免 Base64 撑爆 `localStorage`；完整支持 JSON 备份导出与恢复；删除角色时仅清理该角色独有头像与聊天媒体；本地头像绝不发送给外部 AI。
- COMPAT: 保持既有透明 PNG/SVG 头像框及缩放/偏移叠加、逐角色身份覆盖、聊天记录与四层记忆完全不受修改头像影响。

## Track B · UI/UX 改造 01：角色选择页（Landing / Character Selector）
- UI: 将角色选择页拆分为两个独立的 Liquid Glass 卡片（「卡片 A：我的资料」与「卡片 B：我的角色」固定顶栏＋右上角创建入口）及底部独立存档迁移栏。
- SCROLL: 实现整页纵向滚动与两张卡片内容区域的独立纵向滚动，适配 10 / 30+ 角色与长文本个人资料。

## Track A · Phase 1：基础架构、输入保护、消息修订、首条消息与私人日记分享
- ARCH (P1-1): 完成 Vite + TypeScript 模块化架构与单文件免 Node.js 离线版构建（`Elsewhere_Phase1_Standalone.html`），加入 `domGuard` 保护中文输入法 IME 组合输入、焦点输入框与展开面板不被 850ms 定时器重置。
- REVISION (P1-2): 日常聊天与面对面叙事支持编辑、撤回、重抽 AI 回复、引用回复与修订历史抽屉；被撤回/替换内容退出模型上下文与记忆检索。
- FIRST MSG (P1-3): 新建角色首条消息基于角色设定与模型生成；未配置 API 时显示诚实待连接状态卡片，不伪造固定模板欢迎语。
- DIARY (P1-4): 用户私人日记默认严格私密，支持按篇主动分享给当前角色并写入知情事件。
- NEXT (Track A 待推进): SillyTavern / MoM 果实 V6.13 预设深度兼容（宏扩展、正则脚本、Quick Replies、注入深度与诊断报告）。

---

# Alpha 4 · 2026-10-28

- FIX: 剧场顶部「幕间讨论」新入口；修复通用 `.top .small` 误隐藏动作按钮。
- ADD: 幕间专属窗口、戏外角色提示词/演示回复、独立存档、用户主动暂停/返回。
- ADD: 幕间更改世界、双方戏内人设；最近戏内一轮回退，保存废弃版本；日常记忆不把废弃戏内互动当正式事实。
- FIX: 返回桌面不再结束戏剧；进行中剧本不可被直接覆盖。
- UI: 五套主题延续，玻璃质感全屏 UI；上方五 APP、Dock 四 APP，去重复。
- CONSISTENCY: 移除现实世界与开发模拟相冲突的演示时间快进入口；同步时钟。
- DOC: 完整 `ELSEWHERE_BIBLE_V1.md`，附实现对照和验收边界。
- TEST: 新幕间测试通过、Alpha 3 媒体测试、人物编辑测试与迁移测试。
