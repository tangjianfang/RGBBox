# T1 — 功能域 × 测试层覆盖矩阵 + 逃逸缺陷分类学（RGBBox 自动化测试专项评审）

日期：2026-10-01 · 分支 feat/app-review-fixes（HEAD fe9cd9d）· 方法：只读静态分析 + git 考古 + 仓库内 coverage 快照（未运行任何测试/脚本）

---

## 1. 摘要

- 量化基数：**155 个测试文件 / 1419 个 it() 调用点**（自数，含少量 test()；runner 实跑 1493 passed 含 it.each 展开，引自 fe9cd9d 提交信息）。分布：renderer/components 303 / main 293 / games 引擎 225 / engine 141（+根 effects 17+profileStore 12）/ domain 86 / vision 移植 73 / ai8 57 / shared 57 / hooks 42 / preload 30 / workers 19 / metrics 18 / integration 11 / gl 11 / 3d 3 / 杂项 9。
- 三道结构性洞（发布前无法靠现有自动化回答「功能全验证」）：
  1. **视图接线层无门禁**：四个逃逸锚点的宿主文件 `MiniGamesView.tsx`（3073 行）被 coverage 配置显式排除（vitest.config.ts:60），App.tsx/WorkspaceView/DiagnosticsView 同列排除或 0% 覆盖；App 顶层路由测试只剩 1 个 import-shape it + 3 个 it.skip（tests/renderer/App.test.tsx:21-24）。
  2. **发布链零门禁**：`dist:win = version patch && dist-clean && build && electron-builder`（package.json:21），不含 test/snapshot/CDP；CI 仅 typecheck 一档（.github/workflows/ci.yml）。55 个一次性 verify/probe/snapshot 脚本（scripts/ 68 个 .mjs 中）无统一入口、无 CI 挂载。
  3. **「引擎数学有锁、接线无锁」系统性模式**：四锚点全部属此类；其中②（tetris 竞速 won 不写 best）与 R221.2 agent 门禁精确匹配**修后仍未上锁**，LAN 链路（lanService/LanPanel/游戏 lanTetris wiring）为 0 测试大区。
- 覆盖率假象：hooks 57.4% 由 useVisionInput 92.2%/useAudioAnalyzer 98.1% 撑起，而引擎循环核心 useEngineLoop 仅 **4.6%**；全部组件测试跑在 `setupRendererMocks()` 全量替身 + FakeHost + noop ctx Proxy 上——行覆盖计「执行」不计「断言」。像素门禁 `CANVAS_MASK_ALL=true`（ui-snapshot.mjs:41）把游戏画布内容整体掩膜，R219 类绘制错位对快照门禁不可见。

---

## 2. 功能域 × 测试层矩阵

测试层缩写：**EU**=引擎/纯函数单测 · **CT**=组件测试(happy-dom) · **IT**=跨模块集成 · **CDP**=一次性 CDP 脚本 · **SNAP**=ui-snapshot 像素门禁。✅=有真断言锁；◐=烟测/浅；✗=无。

| 功能域 | EU | CT | IT | CDP/E2E | SNAP | it() 证据（file:line 级） | 判定 |
|---|---|---|---|---|---|---|---|
| **引擎 CPU 49 效果** | ✅ | — | ◐ | ✗ | ◐(画布掩膜) | tests/effects.test.ts 17 it + engine/effects-visual-floor.test.ts 3 it；effects.ts 行覆盖 97.4% | 每效果≈0.35 it，采样断言浅 |
| **引擎 previewEngine/videoWall/text** | ✅ | — | ✗ | ✗ | ◐ | previewEngine 19 / videoWall 24 / videoWallFrame 8 / textRenderer 17 / color 35 it；engine 层 97.5% 行 | 最厚实一层 |
| **workers previewEngineWorker** | ✅ | — | ◐ | ✗ | ✗ | workers 19 it；行覆盖 100/85 阈值达标 | 协议+zero-copy 有锁 |
| **metricsCollector** | ✅ | — | ✗ | ✗ | ✗ | metrics 18 it | — |
| **视图 dashboard** | ◐ | ✅ | ✗ | 一次性 | ✅ | DashboardView.test.tsx 6 it | 磁贴/入口级 |
| **视图 workspace（主工作区）** | ✗ | **✗** | ✗ | 一次性 | ✅ | WorkspaceView.tsx 1112 行**无同名测试文件、行覆盖 0.0%**（coverage-summary） | **主视图零组件测试** |
| **视图 effects** | ◐ | ✅ | ✗ | 一次性 | ✅ | EffectsView.test.tsx 8 it；行覆盖 35.5% | 选择/切换有锁，参数面板浅 |
| **视图 video** | ◐ | ✅ | ✗ | 一次性 | ✅ | VideoStudioView 11 it + video/superres 15；view 本体 1 it+skip 族 | 播放器本体基本烟测 |
| **视图 audio** | ◐ | ✅ | ✗ | 一次性 | ✅ | AudioStudioView.test.tsx **1 it**（+4 skip）；AudioMeters 1 it | 近乎烟测 |
| **视图 model3d** | ✗ | ✗ | ✗ | 一次性 | ✗(不在 9 视图列表) | Model3DView 无测试文件；行覆盖 8.0% | 空洞 |
| **视图 games（4 作+shell）** | ✅ | ✅ | ✗ | 一次性(r219-verify 等) | ◐(画布掩膜) | 引擎侧 survival 77+tetris 32+slash 25+td 22+meta/evolve/autoPick 等 225 it；视图侧 MiniGamesView.test.tsx 36 it；**但 MiniGamesView.tsx 被 coverage 排除(vitest.config.ts:60)** | 引擎厚、**接线薄**（见 §3） |
| **视图 diagnostics** | ✗ | **✗** | ✗ | 一次性 | ✅ | DiagnosticsView 无测试文件、行覆盖 0.0% | 空洞 |
| **视图 architecture/ai/settings** | ◐ | ◐/✅/✅ | ✗ | 一次性 | ✅/✅/✗ | Architecture 1 it(+3 skip)；AiLab 系 19+18+13+…；SettingsView 7 it | ai 最厚 |
| **App 装配/路由/boot** | ◐(tabNavigation 100%) | **✗** | ✗ | 一次性 | ✅ | App.test.tsx 1 it + 3 it.skip；App.smoke 1 it；App.tsx 822 行被 coverage 排除(:63) | **路由锁缺失** |
| **hooks 域（10 个 domains）** | ◐ | ◐ | ✗ | ✗ | ✗ | 仅 5 个同名测试文件；domains 全部无直接测试，靠组件测试间接覆盖：useLayerActions 24.4% / useProfileManager 24.8% / useRandomizer 40.5% / useSampling 42.9%；**useEngineLoop 4.6%** | **接线重灾区** |
| **domain 纯函数（18 文件）** | ✅ | — | ✗ | ✗ | ✗ | 11 个测试文件 86 it；7 文件无测试（paramMeta/curatedEffects 等） | 较厚 |
| **IPC 骨架（shared/ipc.ts 138 通道）** | — | — | ✅ | ✗ | ✗ | integration/ipcChannels.test.ts 11 it：通道唯一性+preload 双向同步 | **契约有锁、行为无锁** |
| **preload 桥** | — | — | ✅ | ✗ | ✗ | preload/index.test.ts 30 it（mock contextBridge/ipcRenderer） | 签名级 |
| **main index.ts（1793 行/109 个 ipcMain 挂载）** | ✗ | — | ✗ | probe-runtime.mjs | ✗ | 无同名测试；coverage 排除(vitest.config.ts:52) | **全部 handler 接线无锁** |
| **overlay 浮窗管理** | ✅ | ◐ | ✗ | 一次性 | ✗ | overlayManager.test.ts 32 it（含 pushFrameToOverlays/ForDisplay:299-332）；OverlayCanvas.test 5 it；renderer 侧帧循环门（R42/43，在 App.tsx）无锁 | main 厚、**renderer 侧薄** |
| **托盘/菜单** | ✅ | — | ✗ | ✗ | ✗ | trayMenu.test.ts 3 it | 浅 |
| **media:// 协议** | ✅ | — | ✗ | ✗ | ✗ | mediaProtocol.test.ts 19 it；R221.5 白名单在 index.ts（无锁） | 白名单本体未锁 |
| **profile 持久化** | ✅ | ✅ | ◐ | ✗ | ✗ | profileStore.test.ts 12 it + atomicJson.test.ts 9 it + ProfileManager 5 it；systemSettingsStore 行覆盖仅 18.2% | 原子写新锁已上 |
| **截图/标注/胶片栏/snip** | ✅ | ✅ | ✗ | 一次性(verify-r94 族) | ✗ | AnnotateOverlay 20 / SnipView 12 / CaptureFilmstrip 9 / annotationModel 16 it；snipManager 行覆盖 12.4% | UI 厚、main 薄 |
| **OCR/AI 整理/AI8** | ✅ | ✅ | ✗ | 一次性(verify-r11x 族) | ✗ | ocrService 7 / aiCleanupService 20 / aiProfileStore 17 / ai8 系 57 it | 服务层厚 |
| **agent 工作台** | ✅ | ✅ | ✗ | ✗ | ✗ | agentService 8+agentTools 9+kernel/sse/lifecycle 等 ~30 it；**审批门禁安全语义 0 it**（tests/main/agentService.test.ts 全为 parse/WAV/prompt） | 门禁未锁 |
| **TTS/语音** | ✅ | ✅ | ✗ | ✗ | ✗ | tts 系 ~25 it + voiceScribe；ttsService 72.7% | 中等 |
| **音频 AI（AST/VAD/DTLN）** | ✅ | ◐ | ✗ | ✗ | ✗ | audioAiService 11 it；**denoiseService 15.2% / denoiseProcessor 0%** | utilityProcess 接线无锁 |
| **vision 手势（宿主窗口+管线）** | ✅ | ✅ | ◐ | r131/r144 脚本 | ✗ | 移植测试 73 it + useVisionInput 12 it(92.2%) + MiniGamesView seam 6 it + cursor/envCoach 12 it | **管线厚、游戏接线是逃逸①现场** |
| **LAN 联机（R209）** | ◐ | **✗** | ✗ | ✗ | ✗ | shared/lanProtocol.test.ts 12 it（协议数学）；**lanService.ts 无测试、行覆盖不计入（在 index 侧装配）；LanPanel 无测试文件；游戏侧 lanTetris/lanRole/publish* 全仓 grep tests/ = 0 命中** | **全链仅协议一层** |
| **定时关机/屏保/电源** | ◐ | ✗ | ✗ | ✗ | ✗ | shutdownScheduler 6 it **只测 3 个纯函数**（build*Args），状态机/spawn/IPC 行覆盖 7.5%；screensaverManager 14.3%（8 it 同模式） | **数学锁≠状态机锁** |
| **全局热键/截图工具** | ◐ | ◐ | ✗ | 一次性 | ✗ | snipManager 12.4%；hotkey 预设无 renderer 测试 | 薄 |
| **gl/WebGL 预览+6×3D** | ✅(itGl 条件) | ✗ | ✗ | ✗ | ✗ | gl 11 it 真跑像素断言（R163）；3d 目录 3 it | 条件化后可用 |

**「只有引擎数学锁、无接线锁」域清单**（逃逸模式①③的现役候选）：games 视图接线（settle/键池/LAN/手柄摇杆）、useEngineLoop→OverlayCanvas 帧链、App 路由/boot、main index.ts 全部 handler、LAN、denoise utilityProcess、关机/屏保状态机、media:// 白名单、agent 门禁。

---

## 3. 逃逸缺陷分类学（4 锚点 + 近 30 提交 fix 归类）

| 类 | 缺失层 | 锚点/实例 | 证据 | 修后是否上锁 |
|---|---|---|---|---|
| **E1 视图输入接线** | CT（DOM 事件→键池→跨帧驻留） | ①R221.7 pollVision 每帧清键，WASD 全失效 | 修 fe9cd9d；宿主 MiniGamesView.tsx 被 coverage 排除（vitest.config.ts:60） | ✅ 已上锁：跨帧键驻留 it（MiniGamesView.test.tsx:276） |
| **E2 结算/持久化挂钩** | CT（phase→settleBest 挂点） | ②Tetris 40 行竞速 'won' 不写 best（用户零记录根因） | 挂点 MiniGamesView.tsx:1280-1283；同族 R220.1⑧ backToHub 按 lost 结算 | ❌ **仍无锁**（MiniGamesView.test.tsx grep settle/best=0 命中；tetris.test.ts 32 it 全引擎数学） |
| **E3 引擎激活点死代码** | EU（集成态：配方→升级池投放） | ③R202 EVOLUTIONS 有配方测试，接线死三周 | swarmEvolve.test.ts 自 R202(cae8c94) 存在；激活在 c59d402 | ✅ 已上锁：swarmEvolve.test.ts:30「配方就绪→升级池让位进化单卡」 |
| **E4 绘制层序/表现层** | EU/CT（CTM 变换序断言） | ④R219 世界实体画在摄像机层 restore 后，开局即错位 | 修 7d089b4 | ✅ 已上锁：trackCtx 设备空间断言（survival.test.ts:1033-1143）；**但 TD/Slash/Tetris 无同类锁**；R220.4 渲染卫生+种子 RNG（bb705ea）落地 0 新测试 |
| **E5 新护栏自身缺陷** | 新增防御代码未带测试 | R221.4 rAF try/catch 护栏：throw 跳过续帧调度→单帧异常杀死循环，由 R221.7 顺手修 | fe9cd9d 提交信息 | ❌ 续帧语义无独立锁 |
| **E6 安全/门禁语义** | EU（越权样本拒绝） | R221.2 agent 门禁 startsWith→includes（`npm install` 批准放行 `npm install; shutdown /s`） | 2270ac4；agentService.test.ts 8 it 无一触及审批门禁 | ❌ **仍无锁** |
| **E7 一次性验证资产** | CI/发布链挂载 | 55 个 verify/probe/snapshot 脚本按 R-N 一次性编写（如 diag-input.mjs、r219-verify.mjs 真机取证含 fps/像素检测），无统一入口 | scripts/ 清点；dist:win(package.json:21) 无门禁 | ❌ 结构性缺失 |

近 30 提交归类：R221 轮 5 fix（2270ac4+fe9cd9d 等）中 4 个属 E1/E5/E6；R220 轮 4 fix（14801a4/c59d402/bb705ea）十一项里 E2×2、E3×2、E4×3、E1×2；R219 轮 4 fix（7d089b4…93d365f）全 E4。**约 13/17 fix 落在「引擎或数学已测、接线/表现层无断言」象限**（Likely，按提交说明归类）。

每类最小测试形态：
- E1/E2：组件级「事件→状态→跨帧/跨 phase」断言（照抄 R221.7 锁与 swarmEvolve:30 形态），S。
- E3：引擎集成态测试——构造 state 走 tick/开局，断言新内容**真的会被投放**（不是表存在），S。
- E4：CTM 跟踪 ctx（survival.test.ts:1036 trackCtx 已是可复制模板），S。
- E5：异常注入（tick 内 throw 一次→循环仍续帧），S。
- E6：越权样本参数化拒绝断言，S。
- E7：把 ui:snapshot+test 挂进 dist 前置/CI，M。

---

## 4. 覆盖率数字 vs 实际保护的落差

1. **逃逸文件根本不在统计口径内**：MiniGamesView.tsx(3073 行)/App.tsx(822 行)/AudioStudioView/VideoStudioView/OverlayCanvas/Preview3D/ArchitectureView/3d/gl 全部列于 coverage exclude（vitest.config.ts:47-66）。「hooks 57% 但 R221.7 逃逸」的答案是：**出事的行从未被任何阈值看管**（Confirmed）。
2. **聚合均值掩盖结构性短板**：hooks 57.4% 中 useVisionInput 92.2%、useAudioAnalyzer 98.1%、tabNavigation 100% 撑盘；核心 useEngineLoop 4.6%、domains 5 个在 24-46%（coverage-summary，2026-09-26 快照）。分层阈值 hooks 55/28 是「水位下 2-3pt」校准线（vitest.config.ts:67-77 注释自述），是**债务可见化装置而非质量闸**。
3. **v8 行覆盖计「执行」不计「断言」**：全部组件测试跑在 setupRendererMocks() 全量 window.rgbbox 替身（tests/renderer/_helpers.tsx:16 起）+ FakeHost BroadcastChannel（MiniGamesView.test.tsx:29-46）+ all-noop ctx Proxy 上。接线行（如 keys.add）在替身下执行即记覆盖，但「跨帧驻留/跨进程契约」无断言——这正是 R163 实施记录里自证的坑：setup.ts:142 全局 vi.mock 曾让 GL 测试「15 用例全绿但从未执行真类」（PRD R163.7 调试实录）。
4. **快照门禁对游戏画布失明**：ui-snapshot.mjs:41 `CANVAS_MASK_ALL = true`——canvas 是「舞台」被整体掩膜，只门 UI chrome；R219 类画布内容错位天然逃逸（设计取舍，已在脚本注释言明）。
5. **coverage 快照过期且不在门禁链**：coverage/coverage-summary.json mtime 2026-09-26 17:47，早于 R219-R221（10-01）三轮改动；且 dist:win/CI 均不跑 test:coverage（Confirmed）。

---

## 5. 发布前必测清单 v1（按风险排序；形态=建议测试层，S≤半天 / M≈1-2 天）

| # | 必绿断言 | 形态 | 量 |
|---|---|---|---|
| 1 | **发布链门禁**：dist 前强制 `yarn test` + `yarn ui:snapshot`（CI 加 test job 或 dist script 前置） | 工具链 | M |
| 2 | **四作键盘操控**（vision 关常态）：各作 keydown→键池→≥2 帧后位移>0（现仅 survival 一作有锁） | CT | S |
| 3 | **Tetris 竞速 won→best/daily/telemetry 写入**（E2 逃逸修后仍未锁） | CT | S |
| 4 | **agent 审批门禁安全**：批准 `npm install` 不得放行 `npm install; shutdown /s`；非首词命令拒绝 | EU 参数化 | S |
| 5 | **LAN 最小会话**：lanService host/join/leave/spectate 状态机 + 快照广播（现全链 0 测试，仅协议 12 it） | EU+IT | M |
| 6 | **useEngineLoop tick 接线**：启动/暂停/恢复/卸载后回调节奏（4.6%→核心路径有锁） | CT(renderHook) | M |
| 7 | **overlay 全链一次真桥**：renderer invoke openOverlay→推帧→main webContents.send 断言（跨 mock 边界的 IT，一次性） | IT(CDP 或 ipc 桩) | M |
| 8 | **App 9 视图路由**：rail 点击→lazy 视图挂载（解掉 App.test.tsx 3 个 it.skip，视图 mock） | CT | M |
| 9 | **WorkspaceView 主旅程**：选效果→调参→预览帧变化 一条链（1112 行 0% 覆盖） | CT | M |
| 10 | **rAF 续帧语义**：单帧 throw 后循环存活（R221.4/R221.7 教训，E5） | CT 异常注入 | S |
| 11 | **游戏绘制层序 TD/Slash/Tetris**：trackCtx CTM 模板复制（E4 残留面） | EU | S |
| 12 | **media:// 白名单越界 403**（R221.5，现无锁） | EU | S |
| 13 | **profile 损坏恢复端到端**：坏 JSON→.bad 备份→{} 重建→SettingsView 可存（atomicJson 单元已有，缺串联） | IT | S |
| 14 | **49 效果逐效果像素断言**（参数化，非抽样；现 17+3 it） | EU | M |
| 15 | **关机/屏保状态机**：arm→status→cancel 生命周期（现只测 build*Args 纯函数，7.5%/14.3%） | EU | S |
| 16 | **屏幕采样→ambient 胶水**：captureScreenSample 返回→previewEngine 输入契约 | IT(桩) | S |
| 17 | **手柄摇杆移动四作**（Start 已覆盖，移动轴未锁） | CT | S |
| 18 | **AudioViz/投影窗口开闭**（0% 组件族冒烟） | CT/CDP | S |

合计 ≈ 6S×11 + M×7 的体量；#1/#2/#3/#4 建议随下一发布阻塞执行。

---

## 6. 已验证无问题（复核过、确有锁）

- preload↔IPC 契约双向同步锁：tests/integration/ipcChannels.test.ts（11 it，通道↔方法映射 + 唯一性）+ tests/preload/index.test.ts（30 it）。
- overlayManager 全状态机 + 双通道推帧：tests/main/overlayManager.test.ts:299-332。
- 原子 JSON 落盘：tests/main/atomicJson.test.ts（9 it：坏样本/根类型/原子写/.bad 备份）。
- 逃逸①③④修后均已补回归锁：MiniGamesView.test.tsx:276 / swarmEvolve.test.ts:30 / survival.test.ts:1033-1143。
- GL 条件化真跑：itGl + readPixels 像素断言（R163.7，15 用例）。
- ui:snapshot 9 视图 0.1% 门禁存在且 R221.6 记录 9/9 GATE PASS（PRD §R221.6 证据）。
- engine 层 10/10 源文件有同名测试（effects 在 tests/effects.test.ts），行覆盖 97.5%。

## 7. 未验证 / 局限

- 未运行 `yarn test`/`test:coverage`（任务禁启动应用/跑脚本；1493 passed 与覆盖率均取自仓库快照/提交信息——coverage 快照已过期 5 天， hooks/components 当前真实值可能更低）。
- it() 计数为调用点数（1419），与 runner 的 1493（含 it.each 展开）口径差 ~5%，不影响结论。
- 155 个测试文件的断言质量未逐条审读（抽样 ~30 个）；「Math 锁但接线无锁」判定基于测试名 grep + 抽读，个别域可能低估（Speculative 部分：denoise/audio-viz 实际使用频率低，风险排序可能偏高）。
- scripts 55/68 为 verify 族（口径含 inspect/diag/audit；任务线索 47 为 narrower 口径）。
- 「全仓无 LAN wiring 测试」断言基于 `grep -rn "lanTetris|lanRole|lanSnapshot|lanCmd" tests/` = 0 命中（Confirmed）。

*分析脚本：count_tests.py / cov_layers.py（本目录）；仓库零改动。*
