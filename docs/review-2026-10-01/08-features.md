# 08 — 功能扩展机会评审（RGBBox · 2026-10-01）

> 角色：产品经理 + 资深工程师。范围：找出「更多有价值的功能」，先核实现状再提议。
> 方法：全读 CLAUDE.md / README.md / docs/architecture.md / docs/TODO-pending-tasks.md / docs/prd/README.md + PRD-0002 §R13–R16/R90/R164/R216–R219 + SRS games-upgrade 目录；代码侧读 App.tsx（view 路由）、shellModules.ts、useEngineLoop.ts、schedule.ts、gamesTelemetry.ts、swarmMeta.ts、SettingsView/AiLabView/EffectsView/DiagnosticsView 关键段、main/index.ts 托盘与热键段，grep 验证命令面板/GIF/HTTP/performanceMode/activeSceneId/_maskZone/altKey 等关键缺失项。仓库只读，未运行任何脚本。
> 置信度标注：【高】= grep/读码直接证实；【中】= 依据明确但未逐行读完；【低】= 推断。

---

## 1. 现有功能清单表

成熟度：**成熟**=有 UI 入口+持久化+测试；**可用**=能用但覆盖面/打磨有限；**骨架**=数据模型或局部管线在、无完整接线；**孤儿**=存在但无入口或无消费方。

| # | 功能 | 入口 | 成熟度 | 证据 |
|---|---|---|---|---|
| 1 | 虚拟 RGB 画布预览（网格/平滑双风格、quintic 插值、gap 线、全屏） | workspace | 成熟 | App.tsx frameRef + PreviewGrid/PreviewGl，R32/R34 |
| 2 | 55 种灯效：49 CPU（effects.ts case 计数=49，含 custom-paint/image-paint/screen-ambient）+ 6 GPU 3D；另 28 种 2D GPU 直通 shader | effects | 成熟 | effects.ts `case '` 49 处；architecture §10；R37-B2/B3 |
| 3 | 多图层叠加（opacity/blendMode/启用开关/_maskZone 区域遮罩 9 选） | workspace 图层面板 | 成熟 | profileUtils.updateLayer；WorkspaceView:725 zone 按钮 |
| 4 | 效果库：搜索（label/desc/kind 全文）+ 标签过滤 + 收藏星标 + 精选条带（默认层→经典→收藏→最近，cap12）+ 悬停预览（不污染物理屏）+ 🎲 inspire + 应用 toast 5s undo | effects view | 成熟 | EffectsView:374-461 搜索；App.tsx curatedKinds/previewOverride/appliedToast |
| 5 | Profile 命名槽位 + 复制/重命名/删除 + 全 profile 导入导出对话框 + **单图层包导出/导入**（layer pack） | workspace ProfileManager | 成熟 | useProfileManager.ts:123-159；exportLayerPack/handleImportLayerPack |
| 6 | 采样设置：fps/行列/密度/亮度/饱和度/平滑/performanceGuard/纵横比锁/FPS 估算提示 | workspace 采样面板 | 成熟 | useSamplingDomain；README |
| 7 | 屏幕采样投屏（screen-ambient，BGRA 点采样）+ 捕获 provider 抽象（desktopCapturer 常态，DXGI/SCK 永久 stub） | workspace | 可用 | captureProviders；RSK-2 |
| 8 | 多屏 overlay 投屏（每显示器一浮窗，全屏/预设/自定义区域拖拽，DPR 物理缓冲，GPU 直通效果物理分辨率重绘） | workspace DisplayMap | 成熟 | overlayManager；R62/R63/R67 |
| 9 | 视频墙（行列/bezel/旋转/fit 矩阵数学 + 面板帧采样 + 编辑器 UI） | workspace VideoWallEditor | 可用 | videoWall.ts/videoWallFrame.ts；R20-R22 |
| 10 | 定时氛围：白昼/傍晚/夜间 3 固定时段自动切当前层效果 | workspace 计划面板 | 可用 | schedule.ts（3 blocks 写死 8-18/18-22/22-8） |
| 11 | 参数自动化（sine/triangle/pulse，逐参数勾选）+ 智能随机器（4 模式+参数锁）+ Alt+方向/数字切换 | workspace | 成熟 | useAutomationDomain/useRandomizerDomain（altKey:59） |
| 12 | 音频响应：麦克风/系统回环、32 频段 FFT、60Hz ref 通道、audio-beat/audio-equalizer 效果（含 sensitivity 参数） | 顶栏音频开关 | 成熟 | useAudioAnalyzer；defaultProfile:91-100 |
| 13 | 音频工作站：曲库（20 首中文无损在用）、LRC 歌词、graphic/parametric EQ+预设、频谱/示波器/频谱图/VU 四可视化、8 种信号发生器、17 种场景音生成、WAV 导出、投屏 audioviz 独立窗 | audio view | 成熟 | AudioStudioView:29-145；R29/R51-R59 |
| 14 | 视频工作站：任意摄像头拍摄（参数）、录像、照片、屏幕/窗口源捕获、播放器（断点续播/模式记忆/HLS LIVE）、预览缩放套件、裁剪导出、电影 EQ+AI 降噪（DTLN utilityProcess）、标注器+OCR+局部截图、胶片栏 | video view | 成熟 | VideoStudioView；R70-R95 |
| 15 | 全局截图工具（自定义热键五选一、<500ms 预热链、冻结帧选区、标注、OCR、画廊 FIFO200） | 托盘+全局热键 | 成熟 | snipManager；R80-R82/R130 |
| 16 | OCR：本地 RapidOCR ONNX（det+rec）+ 框选识别 + AI 整理/翻译（云 LLM，多 profile） | snip/视频标注器 | 成熟 | rapidOcrService.ts；R82-R84 |
| 17 | AI 实验室 9 Tab：config（多 profile+safeStorage）/chat/ocr/audio(AST+VAD)/vision(体感体检)/svg/voice(VoiceScribe TTS+STT)/agent(工具型 agent+会话管理)/ai8(欧亿直连：对话/绘画/视频/批量 MD 成图) | ai view | 成熟 | AiLabView.tsx:24 tab 联合；main/agentService/ai8Provider/ttsService |
| 18 | 体感输入：隐藏 visionHost 窗 + BroadcastChannel，8 向手势/捏合/表情/双手/模拟量，全软件手势助手（VisionAssistant 光标+和弦文本+导航）、游戏输入源（4 作） | ai vision tab + games | 成熟 | VisionAssistant.tsx；R131-R144 |
| 19 | 迷你游戏 4 作：TD（词缀波+主动技能）、Survival（角色/轮盘/神器/成就/岛屿/敌人 8 种行为矩阵/大世界+摄像机/血条四档难度）、Tetris（现代化规则+危险条）、Slash（三心制/敌型）；4P 本地合作、LAN 联机（建房+Tetris 对战+插值）、每日挑战（种子）、永久成长（PERM 六维+金币）、BGM/BGM 张力、手柄全柄映射、HUD 共享体系、HD 画布 | games view | 成熟 | games/*.ts 13 模块 + swarmMeta/daily/gamesTelemetry；R198-R219 |
| 20 | 3D 高斯泼溅查看器 + LED Mapper + 按需模型下载（5 个 .splat） | architecture view（model3d 硬关） | 可用 | 3d/SplatViewer；MODEL3D_VIEW_ENABLED=false（App.tsx:59） |
| 21 | 诊断页：帧时序（avg/p95/worker/capture/output/dropped）、按进程 CPU、frame age 语义、捕获 provider 状态、音频 bass | diagnostics view | 成熟 | DiagnosticsView；R46-R48 |
| 22 | 崩溃可见性：crashReporter(submit:false)+rotated JSON+诊断卡+导出对话框 | diagnostics | 成熟 | crashLog.ts；R158.3 |
| 23 | 性能自测 harness：`--perf-selftest` 5 场景 PASS/FAIL JSON 报告 | CLI flag | 可用 | perfSelfTest.ts；main/index.ts:1693 |
| 24 | 电源与系统：防睡眠 powerSaveBlocker、开机自启、定时关机（OS 级+环形 HUD+失败透传）、屏保灯效（空闲状态机+锁定抑制） | settings+托盘 | 成熟 | shutdownScheduler/screensaverManager；R73/R74/R146/R214 |
| 25 | 托盘常驻（close-to-tray+气泡提示+双击还原+菜单）、snip 全局热键注册 | 系统 | 成熟 | index.ts:1497-1538 |
| 26 | 双语 i18n（zh/en，类型化词典 3033 行）+ 预设 labelKey 本地化、亮/暗/system 三档主题、五档字号 | 顶栏+settings | 成熟 | i18n/index.tsx；uiTheme；R148 S5/R159/R160 |
| 27 | UI 门禁资产：ui-snapshot 9 视图 pixelmatch 硬门禁、hex audit、双主题 contrast audit、CDP verify 脚本族 | scripts/（仅开发） | 成熟 | scripts/*.mjs 清单 |

**骨架/死部件（特别盘点）**：
- **`performanceMode`（battery/balanced/extreme）是死字段**：全 src 仅 4 处引用——默认值、类型、App.tsx:517 标签映射、WorkspaceView:860 **作为指标行显示**。引擎/previewEngine 无任何消费（grep 0 命中），也没有切换 UI。用户看到「模式：均衡」但无任何实际语义。【高】
- **`Profile.scenes[]` 多场景模型无 UI**：activeSceneId 全仓只有读取（`.find`）没有写入点；defaultProfile 仅单场景 'scene-desk'（defaultProfile.ts:368/381）。「场景档位」这个概念实际由 named profiles 顶替。【高】
- MetricsCollector（180 帧滚动窗口）目前只喂 dashboard fps 采样（1Hz）与诊断页——尚有余量做 HUD/自动化判据。【高】
- videoWall 引擎+编辑器完整，但与「真实多屏拼接排布」之间的日常使用入口较深（推断，未做使用统计）。

---

## 2. 文档 vs 代码差异（会误导提议的项）

| 差异 | 文档说 | 代码事实 | 置信度 |
|---|---|---|---|
| 特效数量 | README 双语均写「45 种内置特效」 | 55 kinds（49 CPU + 6 GPU3D）+ 28 种 2D GPU 直通 shader | 高 |
| 游戏规模 | README「单机小游戏…气球塔防竞技场」 | 4 作 + 4P 本地合作 + LAN + 每日 + 成就 + 永久成长 + 大世界摄像机（R198-R219） | 高 |
| 性能模式 | 工作区指标行呈现三档模式 | 无功能实现、无切换入口（§1 死字段） | 高 |
| 多场景 | 数据模型 Profile.scenes[] | 无切换/新增 UI，单场景 | 高 |
| TODO D 段 R160.6「三层漏斗待核对合流」 | 标注分支待合流 | 当前分支 App.tsx 已接线 curatedKinds/previewOverride/primaryParams（R164 已 ✅），TODO 项过期 | 高 |
| README Roadmap「DXGI/SCK 原生捕获」 | 列为路线图 | 永久 stub + 永久回退（architecture RSK-2） | 高 |
| postinstall 自动下载模型 | download-models.mjs 注释称有 | package.json 无该 hook（RSK-4） | 高 |
| R14.8/R16.12 状态 | ⏳ 待实施 | 与 D 段「不做真实硬件集成」裁决冲突标记一致，未动 | 高 |

---

## 3. 提议后放弃的功能（已存在/越界）

| 提议 | 处置 | 证据 |
|---|---|---|
| 效果库搜索 | **已存在**（R164.1 S1：搜索+标签过滤） | EffectsView:429-434 |
| 效果收藏/快速访问 | **已存在**（星标+精选条带+最近 8） | useRandomizerDomain/App.tsx:231 |
| 组合预设保存/导入导出 | **大部分已存在**：全 profile 导出/导入 + 单图层包导入导出；缺的仅是「社区分享格式/画廊」（R14.3.2，见卡片 F12） | useProfileManager:123-159 |
| 开机自启 | 已存在（settings 镜像 + systemSettingsStore） | App.tsx:369/629 |
| 托盘常驻/最小化到托盘 | 已存在 | index.ts:189-200 |
| 屏保灯效/定时关机/防睡眠 | 已存在 | R74/R73 |
| 定时场景切换（基础版） | 已存在 3 固定时段；候选仅做增量（自定义时段/更多档位/过渡） | schedule.ts:15-19 |
| 全局截图/OCR/标注 | 已存在 | R80-R84 |
| 手势控制整软件 | 已存在（VisionAssistant 光标+和弦+导航） | VisionAssistant.tsx |
| TTS/降噪/超分/LAN 联机/每日/成就 | 已存在 | R212/R91.3/R93/R209/daily.ts/R105 |
| 真实硬件出光（WLED/OpenRGB）重开 | **越界**：TODO §D 明确记录与「不做真实硬件集成」裁决冲突，用户处置中；本轮不提议实施，仅在 §8 给重开条件 | TODO D 段 R14.8 |
| EMG/腕带类体感硬件 | **越界**（用户终极约束，memory 已记） | memory |
| AST 音频→灯效（R90 P2）、语音指令（P3）、EdgeTAM（P4） | **用户 2026-09-14 无限期搁置，非用户主动要求不得启动**——游戏事件联动桥（F1）与之相邻但不含 ML 推理，仍建议立项前向用户点名确认 | PRD:880 |

---

## 4. 候选功能卡片总表

字段：价值 1-5｜频次｜成本 S/M/L（含可复用零件）｜风险｜依赖｜UI 复杂度｜验收要点｜优先级。

| ID | 功能 | 价值 | 频次 | 成本 | 可复用零件 / 需新增 | 风险 | UI | 优先级 |
|---|---|---|---|---|---|---|---|---|
| F1 | **游戏事件→灯效联动桥**（击杀泛光/受困红脉冲/boss 波变色） | 5 | 游戏时持续 | M | rippleBurstRef 事件注入模式（useEngineLoop:112-115）、overlay 分发、games 状态机、sfx 事件位 | 与 R90 P2 搁置先例相邻（无 ML，仍需用户点名）；事件洪峰污染帧路径 | 低（games 设置一开关） | **P0**（需用户确认先例） |
| F2 | **场景档位 + 定时切换 v2**：工作/游戏/睡眠多档位一键切换、自定义时段、淡入过渡 | 4 | 每日多次 | M | Profile.scenes[] 模型现成（补 UI）、schedule.ts 扩 N blocks、named profiles 机制 | scenes UI 是新状态面（keep-alive 模式约束 RSK-7） | 中 | **P0** |
| F3 | **性能模式自动化**：接线死字段 performanceMode——电池供电/全屏游戏/空闲 → 自动降 fps·网格·平滑 | 4 | 常驻后台 | S | powerMonitor（已有 IPC 面）、sampling 域 hook、MetricsCollector 判据 | 误判导致画质骤降（需 toast+手动覆盖） | 低 | **P1** |
| F4 | **灯效录制/导出 GIF/WebM**（R16.9.2 重开） | 4 | 分享时偶发 | M | frameRef 帧管线、视频工作站 MediaRecorder+canvas capture 既有模式、captureStore 落盘 | 长录制内存（限时长/降 fps）；打包体积（用系统编码器） | 低 | **P1** |
| F5 | **全局灯效热键 + 托盘快切**：托盘「上一个/下一个/收藏」子菜单 + 可配置全局热键 | 4 | 高频 | S | globalShortcut 注册（snip 先例）、trayMenu、favoriteKinds、selectEffect | 热键冲突（snip 已有降级+气泡先例） | 极低 | **P1** |
| F6 | **一键诊断包**：zip 打包 logs+crash+perf 报告+环境信息+profile 摘要 | 3 | 排障时 | S | crashLogList/Export、perf-selftest JSON、logger、原生另存对话框（R158.3 全套） | 无（纯本地）；隐私需过滤 AI key | 极低 | **P1** |
| F7 | **AI 灯效生成**（R14.4 轻量重开：prompt→效果参数 JSON） | 4 | 尝鲜后偶发 | M | aiChat 多 provider 桥（OpenAI 兼容/Bedrock/AI8）、paramMeta 参数模式、randomizer 兜底 | LLM 输出校验（schema 白名单钳制）；不新增本地模型=零预算压力 | 中（对话式入口） | **P2** |
| F8 | **音频-灯效敏感度调优向导**：播放校准音→逐步增益→自动定 sensitivity/平滑 | 3 | 一次性/换设备时 | S-M | audio analyzer ref、sensitivity 参数、AUdioStudio 发生器做校准源 | 校准结果主观性强（提供可复现默认） | 低 | P2 |
| F9 | **命令面板 Ctrl+K**：跳 view/切效果/开关 overlay/执行动作 | 3 | 中频 | S-M | View union、effectPresets、既有全操作回调；无需新库（自建列表过滤） | 键盘焦点管理；与 Alt 系热键共存 | 中 | P2 |
| F10 | **HTTP 本地伴侣接口**（127.0.0.1，供 Stream Deck/OBS 触发场景/效果） | 3 | 集成后高频 | M-L | lanService net 先例；需新 IPC 面+主进程 http server | **安全面扩大**：必须仅回环+token+默认关；与 R5.1 白名单无冲突（server 在 main，不经 renderer）但新通道必须 PR-1 立 R-N | 低 | P2 |
| F11 | **光敏安全开关**（R16.4.3 重开：glitch/lightning/strobe 降闪档） | 3 | 设置一次 | S | 效果参数层加全局 flashSafety 缩放 | 视觉回退需快照重立 | 极低 | **P1**（伦理+低成本） |
| F12 | **预设分享格式标准化**（.rgbbox 版本号+图层包合并为社区格式，先不做画廊） | 3 | 分享时 | S | exportProfileDialog/layer pack 现成 | 格式演进兼容（深合并已有） | 极低 | P2 |
| F13 | **屏幕分区采样编辑器**（screen-ambient 只采指定屏区/多区加权） | 2 | 设置时一次 | M | overlay 自定义区域编辑 UI 可借、captureScreenSample 参数 | 采样路径在 main（P0 集中点，需 R-N 谨慎） | 中 | Backlog |
| F14 | **多语言扩充**（日/韩/德/西） | 2 | — | M | i18n 架构就绪 | 3033 行词典×4 的内容质量（R159 教训：内容翻译要专项轮）；目标用户中文优先 | 低 | Backlog |
| F15 | **配置云同步（用户自有盘）**：profiles 目录监视+外部同步友好化 | 2 | 低频 | S | profileStore 目录已文件化 | 冲突合并语义弱（最后写入胜+备份） | 极低 | Backlog |
| F16 | **游戏下一迭代**（R218.5 S4 大世界多人等） | 3 | — | L | games 全套 | 见 §6「不做」——边际维护成本高、R219.8 性能债未消 | 中 | Backlog（用户裁决驱动） |
| F17 | **插件/效果 SDK**（R16.3） | 2 | — | L | engine 纯 TS 可导出 | 安全（动态加载）、API 冻结承诺、无社区规模支撑 | 中 | 不做（现阶段） |
| F18 | **Web/WASM Demo**（R16.1.3） | 3（营销向） | — | M | engine 无 DOM 依赖可直接编译 | worker/音频权限差异；维护第二入口 | 无 | Backlog（R13/R16 轨道时再做） |
| F19 | **性能 HUD**（工作区角落 fps/帧耗小徽标，诊断页数据前移） | 2 | 调优时 | S | MetricsCollector.snapshot + dashFps 先例 | 违反「帧路径零 setState」需 rAF 自拉模式（PreviewGrid 同款） | 极低 | P2 |

---

## 5. Top 10 推荐 + 实现草案

### #1 F1 游戏事件→灯效联动桥（P0，先过用户确认）
- **为什么第一**：目标用户「游戏时灯效联动」是核心日常；仓库是**双侧零件齐备的独占组合**——games 引擎（状态机/伤害/击杀/boss 波事件位齐全）+ 灯效引擎（55 效果+overlay 物理投屏）。市面上屏幕泛光（Ambilight 类）只做「随画面」，**「随游戏语义」**（受困泛红、升级泛金、boss 波红移）是差异化王牌，且零新模型、零新依赖。
- **接口**：`src/renderer/src/domain/gameLightingEvents.ts` 纯函数——事件枚举 `{type:'hit'|'kill'|'levelup'|'boss'|'danger'|'wave', intensity:0-1, colorHint?}` + `foldEvents(queue, now)` 窗口聚合（cap 32，语义合并防洪峰）。
- **数据流**：games tick 内（MiniGamesView 循环或各游戏 state 已有字段）写 `gameEventsRef`（ref 不走 state，R147 铁律同款）→ `useEngineLoop` tick 读取（与 rippleBurstRef 完全同构：useEngineLoop:112-115 先例）→ 序列化进 `WorkerInput.gameEvents` → previewEngine 在帧合成后叠一层可衰减事件 tint/flash（新纯函数 `applyEventTint(frame, events, dt)`，EMA 衰减，不动各效果公式）。
- **UI 入口**：games 工具栏 + settings「联动」组一个总开关 + 事件→颜色映射三预设（战况红/成长金/氛围青）。
- **测试策略**：foldEvents 聚合纯函数单测（洪峰/过期/合并）；applyEventTint 衰减单测；E2E：CDP 起 survival 打几秒断言 frameRef 像素方差变化；性能护栏见 §7。
- **风险与前置**：R90 P2（AST 灯效联动）曾被用户无限期搁置——本桥**不含音频 ML**，机制完全不同，但立项 R-N 时必须向用户点名区分并拿到确认。games view 本身有 R42 消费者门控（无 overlay 时引擎暂停）——联动价值恰以「开 overlay 打游戏」为主场景，门控语义天然成立；文档化即可。

### #2 F2 场景档位 + 定时切换 v2（P0）
- **为什么**：「工作/游戏/睡眠」档位切换是灯效软件日用第一入口；现状只有 3 个写死时段 + 单场景。`Profile.scenes[]` 模型已存在，等于**接线骨架**而非新造。
- **草案**：`domain/sceneSlots.ts`——把「档位」实现为 scenes[] 内多场景 + `setActiveSceneId` 写入点（新增，全仓首个）；schedule.ts 从 3 固定 blocks 泛化为 `ScheduleBlock[]`（可增删、自定义起止小时、每 block 绑 sceneId 而非单 kind）；切换时 800ms 交叉淡化（previewEngine 已有 EMA 平滑可复用为过渡器）。UI：工作区 header 档位 chips + settings「自动化」组时段编辑。测试：sceneSlots 纯函数、schedule 泛化单测（现有 scheduleBlockForHour 用例迁移）、快照重立。
- **风险**：scenes 多场景与 keep-alive/lazy 约束（RSK-7）无冲突（数据层）；注意 profile 深合并向后兼容（profileStore 已有默认值合并）。

### #3 F3 性能模式自动化（P1，S 成本修「展示性假功能」）
- **为什么**：目标用户「性能与电量顾虑」真实存在（R38-R48 五轮 CPU 治理史）；且现状是**误导 UI**——工作区显示「模式：均衡」但字段死。接线同时消一个质量瑕疵。
- **草案**：main 侧 powerMonitor（已有依赖，index.ts 已 import）新增 `powerSourceChanged` 推送（新 IPC 通道，PR-1 立 R-N）+ renderer 侧 fullscreenchange 监听 → `domain/perfPolicy.ts` 纯函数映射三档 → 写 sampling.fps/平滑/performanceGuard（用户手改过的不覆盖，toast 告知）。performanceMode 从死字段变为真实状态并补 settings 三选一。测试：perfPolicy 映射单测 + 「手动覆盖优先」用例；perf-selftest 加电池场景（模拟注入）。

### #4 F4 灯效录制/导出 GIF/WebM（P1）
- **为什么**：R16.9.2 原文即「最高杠杆低成本项」；「给朋友展示」是目标用户明确日常；同时反哺 R13.2 素材荒（README 0 截图）。
- **草案**：`components/recordFx.ts`——PreviewGrid 侧 rAF 拉帧旁路（不动帧管线）：可选源=虚拟画布帧或 overlay 物理帧；WebM 走 MediaRecorder+canvas capture（视频工作站 R70.6 已有完整看门狗/track 清理先例）；GIF 用两阶段（先 webm 后转码不可行——零新依赖约束下，GIF 走自写 256 色抖动 GIF 编码器或仅提供 WebM+PNG 序列，如实标注取舍）。落盘走 capturesStore 画廊复用。UI：预览面板右上录制按钮（12/24fps 档、时长上限 30s）。测试：录制状态机单测（起止/取消/上限）；产物字节头校验（webm magic）。

### #5 F5 全局灯效热键 + 托盘快切（P1）
- **为什么**：「桌面氛围灯随屏/随音乐」日常里最高频动作是切换；现在必须开主窗→进 effects。Alt+方向只在窗口聚焦时生效（useRandomizerDomain 键盘监听，非全局）。
- **草案**：trayMenu 加「下一个效果/上一个/收藏 ★/随机」子菜单（selectEffect 走 renderer——托盘事件经既有 mainWindow webContents 通道或复用 overlayEffectChanged 推送反向：新增 `trayCommand` 推送通道，PR-1 立 R-N）；全局热键注册复用 snip 的注册/冲突降级/持久化整套（R81 五选一模式）。测试：trayMenu 标签 i18n 快照；热键冲突降级单测（mock globalShortcut.isRegistered）。

### #6 F11 光敏安全开关（P1，半小时级成本）
- **为什么**：伦理+法律护城河（R16.4.3 原文「差异化卖点」）；对 glitch/lightning/explode/audio-beat 高闪效果的减闪需求真实。成本极小。
- **草案**：`domain/flashSafety.ts`——帧级时间维度限闪：记录上一帧亮度时间导数，超阈值钳制（或效果参数 speed/intensity 全局 ×0.5 档）；settings「外观」组开关+说明文案。测试：合成 60Hz 交替黑白帧断言被钳制；快照不受影响（默认关）。

### #7 F6 一键诊断包（P1）
- **为什么**：单人用户自助排障闭环；零件全齐（crashLog 导出、perf JSON、logger、原生对话框），只缺一个聚合 zip。
- **草案**：main 新增 `diagExportBundle` invoke——打包 `userData/logs/*`（perf 报告+崩溃 JSON+文件日志）+ 环境摘要（版本/拓扑/采样档/主题）+ profile 摘要（剥离 AI key——safeStorage 字段一律排除）为 zip（Node 无 zip 内建：用现有 7z 脚本依赖？不行——dist-archive7z 是外部工具。方案：目录树 JSON+多文件 dialog `defaultPath` 打包为 .zip 需新依赖；**替代**：导出为单文件 JSONL bundle，如实记录不引依赖）。UI：诊断页「导出诊断包」按钮。测试：内容脱敏断言（无 `enc:v1:`）。

### #8 F7 AI 灯效生成（P2）
- **为什么**：R14.4 判定的差异化方向；AI 实验室已有多 provider 文本推理桥（aiChat/Bedrock/AI8），**不新增任何本地模型**（≤100MB 预算零压力）。
- **草案**：`domain/aiEffectgen.ts`——把 paramMeta（参数名/范围/类型）编译成 JSON schema prompt → aiChat 返回参数 JSON → 白名单钳制（每参数 clamp 到 paramMeta 区间，非法丢弃回退 preset 默认）→ 走 applyAmbientPreset 同款 updateSelectedLayer 路径 + applied toast undo 复用。UI：effects view「✨ 描述你想要的效果」输入行（非新 view，不加重导航）。测试：钳制纯函数穷举；mock provider 返回垃圾时回退 preset。风险：输出不可控→钳制层兜底；频次低→P2。

### #9 F8 音频敏感度调优向导（P2）
- **为什么**：audio-beat/equalizer 只有裸 sensitivity 滑杆，新手不知调多少；目标用户曲库 20 首无损=音频是主场景之一。
- **草案**：向导三步（选设备→播放校准段（AudioStudio 发生器 1kHz sweep/粉噪现成）→ 实时显示 bass/mid/high 响应条，用户点「峰值合适」即写回 sensitivity 与平滑，公式=sensitivity = targetPeak/observedPeak）。`domain/audioCalib.ts` 纯函数。测试：合成频谱数据回归公式。

### #10 F9 命令面板 Ctrl+K（P2）
- **为什么**：9 view+9 AI tab+50 效果+设置项，深度用户肌肉记忆收益；自建列表过滤无需新依赖（ADR-006 无路由/(store) 库同理）。
- **草案**：`components/CommandPalette.tsx`——静态注册表（view 跳转、效果选择、overlay 开关、音频开关、主题切换、随机/inspire、录屏（若 F4 落地））+ 模糊过滤 + 键盘上下/回车/Esc；全局 keydown 捕获（与 Alt 系不冲突）。测试：注册表完整性（编译期 Record 穷举，shellModules 同款模式）、过滤纯函数、aria（role=dialog）。

（F10 HTTP 伴侣、F13-F19 未进前十，理由见卡片与 §6。）

---

## 6. 分阶段路线图

- **Now（1-2 个开发轮）**：F5 热键/托盘快切 → F11 光敏安全 → F6 诊断包 → F3 性能模式接线（消死字段）。共同点：S 成本、零新依赖、全走既有 R-N 流程。
- **Next（3-5 轮）**：F1 游戏联动桥（用户点名确认后首发 S1：受困红脉冲+击杀泛光两个事件）→ F2 场景档位+定时 v2 → F4 录制导出。
- **Later**：F7 AI 灯效生成 → F8 音频向导 → F9 命令面板 → F10 HTTP 伴侣（安全设计评审先行）→ F12 分享格式。
- **Backlog（有触发条件才动）**：F13 分区采样（多屏重用户反馈）；F14 多语言（开源推广轨道启动时）；F15 云同步（用户提出多机需求时）；F16 游戏迭代（仅按用户裁决，见下）；F18 Web Demo（R13 开源轨道启动时）。

---

## 7. 「不该做」清单

| 项 | 理由 | 置信度 |
|---|---|---|
| 真实硬件出光（WLED/OpenRGB，R14.1） | 与「不做真实硬件集成」用户裁决冲突（TODO §D 明确记录「用户处置」）；且违反「纯虚拟预览」产品定位。重开条件：用户主动推翻裁决；届时 WLED DDP 是最便宜适配器、previewEngine 帧缓冲现成 | 高 |
| R90 P2/P3/P4（AST 灯效联动/语音指令/EdgeTAM） | 用户 2026-09-14 明确「无限期搁置，非用户主动要求不得启动」；F1 需点名区分后才能动 | 高 |
| EMG/腕带等硬件体感方案 | 用户终极约束（memory） | 高 |
| 引入路由库/store 库、插件动态加载（现阶段 F17） | ADR-006 与安全基线；无社区规模支撑 API 冻结成本 | 高 |
| 游戏继续大扩（新玩法/新作） | 游戏已 4 作+LAN+meta（src 内 games 13 模块），R219.8 刚暴露性能债（开发机 30Hz 呈现天花板、帧预算挤压）；边际价值低于把联动桥（F1）这类跨模块价值做出来。S4 大世界多人仅当用户按 R218.5 主动裁决 | 中 |
| GLSL 全量移植 49 CPU 效果 / 4-worker 并行 | R34.2 已裁决「不做这个移植」（数量级工程、无必要收益）；已覆盖 28+6 直通 | 高 |
| 自建云同步服务 | 违 local-first 定位（ADR-015 精神）；只做 F15 文件级方案 | 高 |
| 多语言扩充（当前时点） | 中文优先单人用户无即时收益；R159 证明内容翻译是专项轮成本；放 Backlog 与开源轨道绑定 | 中 |
| 「按显示器分辨率逐像素计算效果」类需求 | R34.2 已澄清瓶颈在采样点数不在渲染分辨率 | 高 |

---

## 8. 性能护栏（针对会加重帧路径的功能）

全项目铁律基线：帧路径零 setState（R147）、worker single-flight、transferable 零拷贝、消费者门控（R42/R43）。新增功能叠加时：

1. **F1 联动桥**：事件走 ref 队列（不走 React）；foldEvents 在 tick 侧做窗口聚合+cap，worker 侧只消费 ≤32 条摘要；applyEventTint 为 O(像素) 单遍循环且与 EMA 平滑同 pass 合并；**事件通道默认关**，games 视图无 overlay 时引擎本就暂停（门控语义即护栏）；验收必须含 perf-selftest 对照（帧耗时 p95 不得高于基线 +10%）。
2. **F4 录制**：录制 rAF 旁路独立于引擎 tick（拉 frameRef 快照，不阻塞 worker 响应）；上限 30s+看门狗（复用 R70.6 模式）；MediaRecorder timeslice 落盘防内存累积。
3. **F19 HUD / F8 向导**：一律 rAF 自拉 ref（PreviewGrid 模式），严禁进 App render；HUD 1Hz 节流。
4. **F3 自动化**：档位切换幂等（只在档位变化时写 sampling）；full-screen 监听 debounce。
5. **F7 AI 生成**：纯用户触发，无任何常驻轮询；响应走既有 aiChat 超时/中止（R195 卡死治理先例）。
6. **F2 过渡**：交叉淡化用现有 EMA 状态，不新增双缓冲；档位切换后首帧丢弃（避免半档混合帧上 overlay）。
7. 所有新增域逻辑进 `domain/` 纯函数 + 单测；新增 IPC 通道一律 PR-1 立 R-N（F3 powerSource/F5 trayCommand/F10 全套）。

---

## 9. 特别加分：用现有零件拼装的机会（复核结论）

| 拼装 | 现成零件 | 结论 |
|---|---|---|
| rippleBurstRef → 通用事件注入通道（F1 的全部技术依据） | useEngineLoop:112-115 + worker input + effects burst | 【高】先例完整，风险最低的跨模块新功能 |
| 死字段 performanceMode 接线（F3） | 字段+标签+powerMonitor+sampling | 【高】修 UI 误导+真实价值二合一 |
| scenes[] 骨架接线（F2） | 数据模型+profileStore 深合并+schedule | 【高】等于把已付架构成本兑现 |
| MediaRecorder 先例 → 灯效录制（F4） | VideoStudio 导出管线（看门狗/track 清理） | 【高】 |
| crashLog+perf 报告+logger → 诊断包（F6） | 三件套各自成熟 | 【高】 |
| aiChat 桥 + paramMeta → AI 生成灯效（F7） | 文本推理零新增、参数模式表现成 | 【中】LLM JSON 钳制层是新关键件 |
| MetricsCollector → HUD/自动化判据（F19/F3） | 180 帧滚动窗口仅两处消费 | 【高】余量充足 |
| AudioStudio 发生器 → 音频校准源（F8） | 8 发生器+17 场景音 | 【高】 |
| trayMenu+globalShortcut snip 先例 → 热键快切（F5） | 注册/冲突降级/持久化/i18n 全套 | 【高】 |

---

## 10. 未验证项 / 局限

1. games 四作内部事件位（伤害/击杀/boss 回调的精确命名与可注入点）未逐行读 survival.ts/td.ts（各 >1500 行）——F1 的「零件齐备」判断基于 sfx.ts/juice.ts/gamesTelemetry 与 MiniGamesView import 面的证实 + 架构文档 §14 自认未读，**置信度中高**，立项时需一次定向 code read。
2. i18n「已有键未用」专项未做（词典 3033 行，收益低未投入）；R150.6 提到的历史遗留键大多已被 R159 承载清理（推断）。
3. vision pipeline 内部 schema（face/gesture engine）未读（架构文档 §14 同样标注）——不影响本轮任何候选。
4. 本机为 RDP 软件合成环境（R219.8 记录），无法对「游戏时灯效帧率」做真机预估；F1 验收必须在真机复测。
5. 未读用户数据（按约束），使用痕迹全部来自任务线索块转述。
6. package.json deps 未逐项核对（零新依赖判断基于对候选方案的自觉约束 + CLAUDE.md scripts 约束）。
