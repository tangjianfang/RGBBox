# 02 UI 线程卡顿/延迟审查报告 —— RGBBox（renderer 主线程视角）

> 审查对象：`main @ 93d365f`（HEAD，含 R219.7–R219.9；未发布）。已发布版为 `release/RGBBox-0.3.84-win.zip`（SHA256 前 16 位 `03477e1946a114c1`，2026-09-26，不含 R219.7–9），用户反馈史可能混有旧版表现，结论按 HEAD 归属。
> 用户真实规模：317×178@30fps、smoothing 0.9、brightnessLimit 2、saturationBoost 3、usePerformanceGuard true、renderStyle pixel、单 profile（638B，1 scene 1 层 Static）、203 次启动、音频工作站重度使用。
> 方法：全代码走读（App/MiniGamesView/survival/td/tetris/slash/hud/sfx/AudioStudio/VideoStudio/Workspace/EffectsView/PreviewGrid/Preview3D/effect3dGl/previewEngine/useEngineLoop/useAudioAnalyzer/useProfileManager/pcmSource/useAiAudioStream/audioAiService/main index+profileStore）＋ 用户日志 `logs/rgbbox.log` 只读统计 ＋ Temp 微基准（`bench-engine.cjs`，纯 Node 跑真实引擎/游戏模块，本次亲自复跑）＋ 交叉引用同日 `03-backend-perf.md`（后端组独立实测，仅采信其带命令输出佐证的条目）。

---

## 0. 摘要 —— Top 卡顿根因排名

| # | 根因 | 视图/场景 | 量级（当前规模 N） | 置信度 |
|---|---|---|---|---|
| 1 | **CPU LED 引擎每帧超预算 1~3 倍（单层 static 实测 31.7ms/帧，fire 100ms；后端组独立实测 66/137ms，五层默认场景 444~580ms≈2fps）**。worker 饱和 → workspace 预览实际 ~15fps、重效果 ~10fps，且整机 CPU 被吃掉一核 | workspace / effects hover 预览 / 任何 overlay 打开时 | 31.7~100ms/帧（30fps 预算 33.3ms） | **Confirmed（双源实测）** |
| 2 | **MiniGamesView 每 0.18s publish 快照重渲整个 2939 行组件树**（含商店/成就/图鉴/ready 抽屉等大列表），四作通用、运行中不停 | games 全部四作局中 | 每 0.18s 一次 2~6ms 级 React render+commit（估） | 机制 Confirmed / 量级 Likely |
| 3 | **EffectsView CPU 缩略卡每 vsync 逐像素渲染（48×27=1296 次 renderEffectPixel + 1296 次 `rgb()` 字符串 fillStyle + 1296 次 fillRect/卡/帧，无帧率上限）**，science 标签页 20 卡同屏 → 推算 15~46ms/帧，直接击穿 16.7ms 预算 | effects 浏览（尤其 science/custom 标签） | 0.73~2.3ms/卡/帧 × 可见卡数 | 机制 Confirmed / 量级 Likely（由 #1 实测单价推算） |
| 4 | **TD 画布 mousemove → `setTdHover` 全树重渲（指针事件率）+ 循环闭包 tdHover 陈旧（悬停射程圈冻结/失效）** —— 同一缺陷双重浪费 | games/td 局中移动鼠标 | 每次鼠标移动一次全树 render | Confirmed（闭包语义确凿；视觉冻结表现 Likely） |
| 5 | **AI 聆听时主进程被同步 AST 推理阻塞（mel 纯 JS FFT + ONNX 同步跑在 main，注释自证 `~1.4s/window`，1.2~3s 节奏 → duty cycle ~45%）** → 期间所有 IPC（overlay 帧中继、capture、profile 保存）排队，应用整体"冻"感 | audio/video 视图开 AI 聆听 | ~1.4s/窗口 的 main 阻塞 | Confirmed（代码+注释；后端组 B-2 同结论） |
| 6 | 游戏绘制残留热点：**TD 弹体逐弹 shadowBlur=10**（td.ts:759）、survival 精英敌 shadowBlur=14 / 复活珠 shadowBlur=12（R219.8 只换了珠/敌弹）、survival 冗余 clearRect 全幅 | games 局中后期 | 软件合成（RDP）下每弹 ~0.1-0.5ms | Confirmed（代码）/ 量级 Likely |
| 7 | **Preview3D（GPU 3D 效果）每 rAF 全画布 readPixels（GPU→CPU 同步失速）+ 每帧 169KB 新分配，且不按 sampling.fps 限频（恒 60Hz）** | 选中 6 种 3D 效果之一 | 每帧 1~5ms 失速 + ~20MB/s GC | 机制 Confirmed / 量级 Likely（未实测） |

"操作丝滑 0 延迟"的距离：游戏内键盘路径本身已达标（tick 0.003~0.05ms、draw 0.6ms、keydown O(1)）；剩余差距主要在 #2/#4/#6（周期性 micro-hitch）与 #1/#3（CPU 饱和）。UI 输入→反馈链路无 >100ms 级延迟（除 hover 预览设计即 300ms）。

---

## 1. 方法与证据来源

- 代码走读：见上列表；所有 file:line 均为 HEAD 亲自读到。
- 微基准（本人复跑，`node bench-engine.cjs`，Node 22，热身后 120~2000 次迭代）：
  - renderPreviewFrame@317×178 单层：static 31.7ms / rainbow 37.2 / fire 100.4 / aurora 64.8 / audio-equalizer 46.2 / ripple 64.3 / plasma 48.6 / screen-ambient 68.7 ms/帧。
  - tickSurvival：0.003ms（600 迭代）；publishSurvival 浅拷贝：0.001ms。
  - LAN 快照 JSON.parse(JSON.stringify(td 态 40 弹/25 塔/30 弹体))：0.171ms。
  - ledColors Uint8Array.set(56,426×3B)：0.008ms。
- 用户日志 `C:\Users\tjf\AppData\Roaming\rgbbox\logs\rgbbox.log`（只读）：`stream feed failed` 共 1754 条（含 `Load model from file:///C:/Use…` ×1075 级 + `no active audio stream` ×442），时间戳呈精确 300ms 节奏（13:15:25.075→.374→.675）；`Saving active profile` ×560 + `Saving profile as` ×560 成对；`MediaProtocol filePath` ×967；`Application ready` ×203；overlay 仅 16 条且集中在 2026-09-12 一天。
- 交叉报告：`03-backend-perf.md`（B-1 引擎超预算、B-2 AST 主线程阻塞、B-6 textMask 220MB、B-10 games+overlay 并存），只引用其标注实测/代码佐证的条目。

---

## 2. 发现清单（U-1 …）

> 每条：位置 / 触发条件 / 频率 / 单次成本（N=当前规模）/ 是否 UI 线程 / 后果 / 修复草案 / 置信度。

### U-1〔Confirmed 机制｜Likely 量级〕MiniGamesView 0.18s 快照发布重渲全树
- 位置：`src/renderer/src/components/MiniGamesView.tsx:1275-1282`（snapshotTimer>0.18 → publish*）；publish 实现 :517-592（spread + 数组浅拷贝）；渲染树 :2183-2938（header ~10 按钮、games-stat-grid、recap、coach、td-ctl、canvas panel、ready-panel（难度 4 chip+角色+抽屉 ~12 chip+artifact 列表+avatar）、TD 塔卡列表+塔详情、survival 侧栏=图鉴按钮+库存+永久商店 PERM_UPGRADES+成就全列表、codex 覆盖层）。
- 触发：四作任意一局运行中（phase=running/levelup/roulette 也发）。
- 频率：5.56Hz，恒定；`runActive` 只加 CSS 类（.running 隐藏 header），DOM 仍全部渲染。
- 单次成本：快照浅拷贝实测 0.001ms（可忽略）；**真实成本是整树 React render+reconcile+commit**，按树规模（估 250~400 元素、百余次 t() 与 map）推 2~6ms。
- UI 线程：是（与 rAF 循环同线程）。
- 后果：局中每 ~180ms 一次 micro-hitch；在 RDP 33ms 呈现预算下足以顶掉一帧 —— 与"按住方向键移动卡顿"的周期性手感吻合（键路径本身 0.003ms）。
- 修复草案：①把运行态 HUD（stat-grid/td-ctl/侧栏商店等）拆成 `React.memo` 子组件并以快照字段做 props，或 ②publish 降频到 0.5s＋只在「DOM 可见字段变化」时发（diff score/level/hp 等），或 ③运行态直接用画布 HUD（R211 已有 fs 纯画布 HUD 先例）收编 stat-grid。
- 置信度：机制 Confirmed；2~6ms 量级 Likely（无 DOM 实测）。

### U-2〔Confirmed（双源实测）〕CPU LED 引擎每帧 31.7~100ms，worker 长期饱和
- 位置：`src/engine/previewEngine.ts:93-148`（每像素 new baseContext 对象、每像素 `String(layer.parameters._maskZone)`、mixColors/applyBrightness/adjustSaturationAndContrast/lerpColor 每像素分配返回对象）；`src/engine/effects.ts` 各 case 每像素重读参数。次生：`src/renderer/src/canvasTextMask.ts`（static 文本层每次重建 317×32 × 178×32 ≈ 220MB getImageData，按 key 有缓存、缓存无上限——后端组 B-6）。
- 触发：`activeView==='workspace'` 且窗口可见（useEngineLoop.ts:204-206 门控），或 overlay 打开。
- 频率：目标 30fps；实测单帧 31.7ms(static)~100.4ms(fire) → 实际 ~15fps/~10fps，worker 满轭一核，droppedTicks 常态化。
- 单次成本：见摘要；用户单 Static 层即 31.7ms（本次）/66ms（后端组 Node）。
- UI 线程：计算在 worker（UI 受保护），但 ①workspace 预览视觉卡（帧率≤15）＝"延迟"感主源之一；②整机 CPU 占用挤占渲染/GPU 进程（用户真机 4~8 核）；③metricsCollector 显示的 fps 与真实不符（roundTrip 口径）。
- 修复草案（后端所有权，报告移交）：每帧每层预解析参数（hex→rgb、Number、mask/slot 一次）、mixColors 内联写 scratch、直接写 pixels 消除每像素分配；热门效果整层快路径。预期 5~20×。
- 置信度：Confirmed（两份独立实测 + 代码机制）。

### U-3〔Confirmed 机制｜Likely 量级〕EffectsView CPU 缩略卡无上限 60Hz 逐像素渲染
- 位置：`src/renderer/src/components/EffectsView.tsx:85-113`（EffectCard.draw：rAF 每帧 48×27 循环调 `renderEffectPixel(layer,{x,y,columns,rows,now})`＋模板串 fillStyle＋fillRect）；可见性由 IntersectionObserver 限制（:22-43），但同屏 science 标签 20 卡 + curated ≤12 卡。
- 频率：每可见卡每 vsync（60Hz），与 grid 大小/效果种类无关地上限。
- 单次成本：按 U-2 实测单价（0.56~1.78µs/px）推：0.73~2.3ms/卡/帧 → 20 卡同屏 15~46ms/帧（超 16.7ms 预算 1~3 倍）。另每卡每帧 1296 个 ctx 对象字面量分配（GC 压力）。
- UI 线程：是（与主循环、hover 预览、搜索输入同线程）。
- 后果：浏览效果库（尤其 science）必卡；滚动时新卡进入视口又触发 GL/CPU 初始化抖动。
- 修复草案：卡内渲染限频到 ~20fps（时间戳门）；fillStyle 按颜色分桶合并（先收集同色格再一次 fill）；或一次性渲染到离屏 ImageData（putImageData）；渲染改 worker 共享池。
- 置信度：机制 Confirmed；量级 Likely（推算）。

### U-4〔Confirmed〕TD 悬停：每次 mousemove 全树重渲 + 循环闭包 tdHover 陈旧（双缺陷）
- 位置：`src/renderer/src/components/MiniGamesView.tsx:1650`（`if (isTd) setTdHover(point)` 每次 mousemove setState）；`:2397` onMouseMove=handleUnifiedCanvasMove；消费端 `:1230-1246`（rAF 循环画射程圈读 `tdHover`）；**effect 依赖数组 `:1317` 不含 tdHover** → 循环闭包捕获的是 effect 上次创建时的值。
- 触发：TD 局中鼠标在画布上移动。
- 频率：指针事件率（Chromium 合并后仍可达 60Hz+）。
- 单次成本：一次全树 render（同 U-1 量级）×60/s。
- 后果：①性能：TD 局中鼠标移动 = 持续全树重渲；②正确性：悬停射程圈/有效性着色用的是陈旧坐标（首次进 TD 后 tdHover=null → 圈根本不画；直到 selectedTowerId/bgmOn/fullscreen/tdSpeed 变化触发 effect 重建才"跳"到当前位置）——F6 悬停预览实际处于半失效状态。
- 修复草案：tdHover 走 `tdHoverRef`（与 fsButtonsRef/hudHoverRef 同模式，:309-313 已有先例），mousemove 只写 ref，删除 setState；射程圈绘制改读 ref。
- 置信度：双缺陷 Confirmed（闭包语义与依赖数组均亲自核读）；"圈不画"表现 Likely（未上机）。

### U-5〔Confirmed 机制｜本用户低暴露〕games 视图 + overlay 并存时引擎照跑，挤占游戏帧预算
- 位置：`src/renderer/src/hooks/useEngineLoop.ts:204-206`（`overlayActive || previewVisible` 才跳过）；R38 设计如此。
- 触发：开着 LED overlay（物理屏投影）进游戏。
- 频率/成本：worker 以 U-2 成本持续 30fps 尝试（static 31.7ms/帧 → 一核满载）＋ overlay 每帧 IPC 中继（main `webContents.send` 克隆 ~196µs/跳，后端组测）。
- 后果：多核争用下游戏 rAF 被饿（后端组 B-10 同判）。
- 用户事实修正：日志仅 16 条 Overlay 行、集中 2026-09-12 → 该用户几乎不开 overlay，**此路径非其主诉卡顿来源**，降为低暴露。
- 修复草案：games 视图且无 audio-reactive 层时允许门控收紧；或 overlay 帧率随 performanceMode 降档。
- 置信度：Confirmed（代码）+ 暴露度低（日志）。

### U-6〔Confirmed 机制｜Likely 量级〕Preview3D：全画布 readPixels + 每帧 169KB 分配 + 不限频
- 位置：`src/renderer/src/gl/effect3dGl.ts:720-746`（readLEDs：`gl.readPixels(0,0,W,H,…)` 整个 drawingBuffer，再 new Uint8ClampedArray(columns*rows*3)）；`src/renderer/src/components/Preview3D.tsx:85-114`（rAF 恒 60Hz：draw→BroadcastChannel post→readLEDs→onFrame）。
- 触发：选中 6 种 GPU 3D 效果（sphere-pulse/warp-portal/neon-galaxy/lava-sphere/laser-show/hologram）。
- 频率：60Hz（无视 sampling.fps=30）。
- 单次成本：readPixels 强制 GPU 管线 flush（1~5ms 失速，取决于画布尺寸）＋169KB×2 分配/帧 ≈ 20MB/s GC。
- UI 线程：是。
- 修复草案：把 LED 采样渲染到一张 317×178 的小 FBO 再 readPixels（读 338KB 而非数 MB）；循环按 `max(16, 1000/fps)` 限频；pixelBuf/leds 复用（前者已复用）。
- 置信度：机制 Confirmed；失速毫秒数 Likely。

### U-7〔Confirmed〕AudioAi：feed 失败不停源（300ms 风暴）+ 模型加载失败无负缓存/退避；AST 同步阻塞 main
- 位置：
  - 渲染层 `src/renderer/src/hooks/useAiAudioStream.ts:59-88`：`failures>10` 或 `hint==='not-downloaded'` 只 `setState(error)`，**pcm 源回调继续逐批 feed**，直到组件卸载/切源；
  - `src/renderer/src/components/AiListenOverlay.tsx:23`：audio/video 视图常驻挂载，modelsReady 后启用；
  - 主进程 `src/main/audioAiService.ts:71-84`：`getSession` 失败的 promise 不缓存（R90 fix 有意为之）→ 每次.feed 都重试 `ort.InferenceSession.create`；`:216-280` feedStreamInner；`index.ts:948-962` 每次 catch `log.warn('AudioAi','stream feed failed: …')`；
  - `src/main/audioAiService.ts:26-28`：AST mel+推理同步跑 main（注释自证 ~1.4s/window，`astBackoffUntil` 只覆盖 AST 失败，不覆盖 VAD 会话建立失败）。
- 触发：模型文件缺失/损坏（`Load model from file:///C:/Use…`），或 stop/start 竞态留下无会话的活跃源（`no active audio stream` ×442，日志尾样 2026-09-26 仍有）。
- 频率：精确 300ms（BATCH_MS）→ 3.3Hz，日志 1754 条。
- 单次成本：渲染侧 ~0（fire-and-forget promise）；主进程：失败的 session create 尝试 + log.warn 写盘（轻）。**真正重量级的是"模型能加载"时**：同步 AST ~1.4s/窗口把 main 打成 45% 占空比阻塞 → 期间 overlay 帧中继/capture/profile IPC 全排队（应用级冻感，后端组 B-2 Confirmed）。
- UI 线程：否（main），但后果经由 IPC 延迟反噬 UI 响应。
- 修复草案：①渲染侧连续 N 次失败即 `handle.stop()` + 停止 feed（保留错误态）；②主进程对 session-create 失败做负缓存＋指数退避（区别于"corrupt 不缓存"语义：按错误类型分流）；③AST 迁 utilityProcess（后端组方案）。
- 置信度：Confirmed（代码 + 日志节奏）。

### U-8〔Confirmed〕游戏绘制残留逐帧热点（R219.8 未覆盖面）
- 位置/内容：
  - `src/renderer/src/games/td.ts:759`：每个弹体 `shadowBlur=10` 发光填充（后波次 30~80 弹同屏）；`:628-634` drawPanelBackground 每帧 createLinearGradient（1 次/帧，可接受）；`:686` clearRect+全幅重绘（alpha:false 下 clear 为黑再覆盖，冗余一次全幅栅格化）；
  - `src/renderer/src/games/survival.ts:1878-1879`：精英敌 `shadowBlur=14`（R219.8 只替换了珠/敌弹/经验珠路径）；`:1843` 复活珠 `shadowBlur=12`；`:1660` 每玩家每帧尾焰 createLinearGradient；`:1764` clearRect 冗余（背景由 blit 全覆盖）；
  - `src/renderer/src/games/tetris.ts:780-783`：活动块 4 格 `shadowBlur=10`（小）；
  - `src/renderer/src/games/slash.ts:555`：道场背景每帧 createLinearGradient + ~15 条漂移线（小）；
  - `src/renderer/src/games/hud.ts:83,118`：血条线性渐变 ×3~7/帧、低血 vignette 全屏径向渐变填充（低血时 0.5~1.5ms）。
- 触发：对应游戏局中（TD 后期、survival 精英词缀波、低血）。
- UI 线程：是（2D canvas）。
- 修复草案：TD 弹体换 R219.8 同款双层假发光；精英/复活珠同法；删两处冗余 clearRect；低血 vignette 可预渲染一张渐变位图逐帧 blit＋globalAlpha。
- 置信度：Confirmed（代码）；各处毫秒量级 Likely（CDP 曾实测 shadowBlur 为主因，方向一致）。

### U-9〔Confirmed〕AI 聆听采集用 ScriptProcessorNode（主线程音频回调 + 每回调分配）
- 位置：`src/renderer/src/tools/pcmSource.ts:67-100`：`createScriptProcessor(4096,1,1)`，`onaudioprocess` 在 renderer 主线程按音频节拍触发，每次 `new Float32Array(copy)` + merged 数组分配；300ms 批定时器再 resample 分配。
- 触发：audio/video 视图 AI 聆听开启（用户重度使用音频工作站）。
- 频率：~12Hz（48k/4096）回调＋分配；成本每次微秒级但持续，加重 GC。
- 修复草案：迁 AudioWorklet（或 MediaRecorder+decode 分批）。
- 置信度：Confirmed。

### U-10〔Confirmed〕keep-alive 音频/视频视图随每次 App 状态变化重渲；关机倒计时 1Hz 全量重渲
- 位置：`src/renderer/src/App.tsx:774-790`（audioVisited/videoVisited 包裹层常驻，无 memo；全仓 components 无一处 `React.memo`，grep 证实）；`src/renderer/src/hooks/domains/useShutdownTimer.ts:26-36`（armed 时每秒 setShutdownInfo → App 整树）。
- 触发：一旦访问过 audio/video，之后任何 App 级 setState（windowVisible、shutdownInfo、lang、profile 变更…）都重渲隐藏的 2997/2187 行视图。
- 频率：低频（最坏 1Hz@armed；正常会话偶发）。
- 修复草案：`React.memo(AudioStudioView)`（props 含 visible，已天然可 memo）+ shutdown 倒计时下沉到面板组件本地 state。
- 置信度：Confirmed（重渲路径）；量级小（低频）。

### U-11〔Confirmed，量级微〕MetricsCollector.add 每帧计算被丢弃的 snapshot
- 位置：`src/renderer/src/engine/metricsCollector.ts:9-14`（add 返回 `this.snapshot()`：2×map(180)+sort(180)+reduce）；唯一热路径调用 `src/renderer/src/hooks/useEngineLoop.ts:171` 丢弃返回值。
- 频率：30fps（worker 每响应一次）；单次 ~5-15µs。修复：add 拆出轻量插入，snapshot 按需（dashboard 1s 取样处已按需）。置信度：Confirmed（非根因，卫生项）。

### U-12〔Confirmed，可接受〕profile 自动保存双写（quick+named），400ms 防抖
- 位置：`src/renderer/src/hooks/domains/useProfileManager.ts:54-68`（一次变更 → `saveProfile` + `saveProfileAs` 两个 IPC，主进程两次 `JSON.stringify(profile,null,2)` + 异步 writeFile，`src/main/profileStore.ts:29,69`）；日志 560+560 成对、每次 `log.info`（`index.ts:985,1157`）。
- 频率：每串参数调整停下后 1 次；560/203 启动 ≈ 2.8 次/会话。主进程异步写，无 UI 阻塞。
- 修复草案：named 槽写与 quick 槽合并节流（同 400ms 窗口内只写一次落两处）；`log.info` 降 debug。置信度：Confirmed。

### U-13〔Confirmed，量级小〕media:// 每请求 2 条 debug 日志（生产 minLevel=debug）
- 位置：`src/main/index.ts:1621,1628`（filePath + streaming 两条 `log.debug`）；`index.ts:53` `initLogger(...,{minLevel:'debug'})` 恒开。日志 `[MediaProtocol] filePath` ×967。
- 频率：Chromium 媒体管道每个 Range 请求（音频流式播放期间连续）。主进程字符串拼接+写盘，微秒~毫秒级/条，与 AST 阻塞叠加时放大 IPC 延迟。
- 修复草案：诊断开关化（Diagnostics 打开才 debug）或 minLevel 随构建定。置信度：Confirmed。

### U-14〔Confirmed，设计已半优化〕AudioStudio 进度 10Hz 重渲 + 坏 RIFF wav 全量取回解码
- 位置：`src/renderer/src/components/AudioStudioView.tsx:1519-1543`（100ms setInterval setProgress/setDuration → 10Hz 重渲 2997 行树；已按 `visible` 门控，隐藏时不跑——R70.10 修复有效 ✓）；`:1753-1754`（duration 不可信的 wav 走 `fetch(media://…).arrayBuffer()` 全量入内存 + `decodeAudioData`，大文件内存尖峰，异步不卡 UI）。
- 修复草案：进度条拆 memo 子组件承接 10Hz；wav 探测改读头部/限制上限。置信度：Confirmed。

### U-15〔推翻级，记录在案〕worker 每帧 postMessage 结构化克隆 profile —— 用户规模下可忽略
- 位置：`src/renderer/src/hooks/useEngineLoop.ts:135-140`。实测用户 profile 序列化仅 638B（1 scene/1 layer）→ 克隆成本微秒级；`applyParameterAutomation`（automation.ts:60）在 automation 关闭时原样返回引用（用户未开）→ 零深拷贝。默认多场景 profile 亦仅数 KB。不构成根因。

### U-16〔推翻级〕LAN 快照 JSON 往返 —— 0.171ms@15Hz，仅 host 且有 peer 时
- 位置：`MiniGamesView.tsx:1039-1044`（0.066s 累计触发，`JSON.parse(JSON.stringify(s))` + IPC）。客端 `extrapolateBalloons` 每帧 O(balloons) 浅映射，小。可接受；如要优化可 structuredClone 替代 JSON（再省 ~40%）。

### U-17〔确认良好项〕
- `useAudioAnalyzer`（60Hz setInterval 分析写 ref，R45 门控，status 仅迁移时 setState）✓；topbar VU 走 subscribe+CSS 变量零重渲（App.tsx:574）✓。
- PreviewGrid 变更检测（frame!==drawn 才画）✓；SceneCard 缩略 16×9 成本可忽略 ✓。
- games rAF 循环本体：tick 0.003ms + draw 0.6ms + pollGamepad/pollVision O(1)（CDP 与本次基准一致）✓。
- 启动路径：`show:false`+ready-to-show（index.ts:151,171）、boot 9 IPC 并行（App.tsx:359-398）、重视图 lazy（App.tsx:22-27）、games/audio/video 均按需 chunk ✓。i18n 3597 行在主包（解析 ~10-20ms，一次）——可 lazy 但非卡顿源。
- 音频可视化 rAF：typed array 复用、visible/projecting 门控（AudioStudioView.tsx:1363-1419）✓。
- 视频超分 pump：busy/媒体时钟门控，fps 读数 2Hz（useSuperres.ts:134-178）✓。

---

## 3. 对线索块的逐条回应

| 线索 | 结论 | 证据 |
|---|---|---|
| 「游戏卡顿已修净吗」 | **未修净，但残因已收窄**。R219.8/9 已消：背景逐帧重绘、珠/敌弹 shadowBlur、alpha 合成、本征尺寸反馈梯子、单人零滚动。**残留**：U-1（0.18s 全树重渲＝周期 hitch）、U-4（TD 鼠标路径）、U-8（TD 弹体/精英敌 shadowBlur 等绘制残留）、U-5（overlay 并存，本用户低暴露）。单人 survival 无 overlay 时循环自身 ~0.7ms/帧，卡顿感受主要来自 U-1 的 5.5Hz 重渲尖峰与 RDP 30Hz 呈现天花板（环境项） | §2 U-1/U-4/U-5/U-8 |
| 「AudioAi 风暴是否拖累全局」 | **不直接卡 UI 线程**（渲染侧 fire-and-forget，每次 ~0）；**真正全局影响**是模型可用时 AST 同步阻塞 main ~1.4s/窗口（B-2，Confirmed）→ 期间一切 IPC（含 overlay 帧中继）排队；风暴本身（1754 条）= 每.feed 重试 session create + log.warn，主进程持续小损耗 + 日志噪音。修复点在"停源 + 负缓存退避 + AST 出 main" | §2 U-7 |
| R219.8 三项是否覆盖所有路径 | 覆盖 survival 珠/敌弹与四作 alpha；**未覆盖**：TD 弹体 shadowBlur、survival 精英敌/复活珠、tetris 活动块、两处冗余 clearRect | §2 U-8 |
| useEngineLoop R42/R43 门控 | Confirmed 生效：`useEngineLoop.ts:204-206`，games 视图且无 overlay 时整 tick 跳过（含 postMessage）；缺口仅 overlay 分支（设计如此） | §2 U-5 |
| publishSurvival/publishTd 的 spread+数组拷贝成本 | 拷贝本身 0.001ms（实测）——**成本在 React 整树重渲**，不在拷贝 | §2 U-1 |
| LAN 快照 JSON 往返 | 0.171ms@15Hz，可忽略（host-only） | §2 U-16 |
| 560×2 次 Profile Saving 触发链 | useProfileManager 400ms 防抖双写（quick+named），每次参数变更收敛后 1 对；有防抖、异步写、无 UI 阻塞；频率 2.8 次/会话——正常 | §2 U-12 |
| 461MB 模型加载路径 | 模型不随启动加载（`initAudioAi` 只建 state，session 惰性创建）；首次使用时 create 才读文件。3D splat 模型 release 包排除、仅本地 dev。**不构成启动/运行常态成本** | audioAiService.ts:49-51,71-84 |
| metricsCollector | 每帧多算一次被丢弃的 snapshot（µs 级卫生项） | §2 U-11 |

---

## 4. 「选择一个条目时发生什么」——时间线表（阶段×估计耗时）

### 4.1 EffectsView 点击效果卡 → 应用并切回 workspace
| 阶段 | 代码 | 估计耗时 |
|---|---|---|
| click → hoverKind(null)+setPreviewingKind(null)+onPreviewEffect(null) | EffectsView.tsx:350-353 | <1ms（2 次 setState 本帧合并） |
| selectEffect：effectPresets.find + updateSelectedLayer setProfile | App.tsx:199-204,186-188 | <1ms |
| App+EffectsView 重渲（~35 卡轻树）+appliedToast | App.tsx:550-558 | 2~5ms |
| setActiveView('workspace')：EffectsView 卸载（各卡 rAF 取消）+ WorkspaceView 挂载（首访含 lazy chunk 50~200ms；树 render 5~15ms）+ PreviewGrid GL 上下文创建/着色器编译 | App.tsx:738-760, PreviewGrid.tsx:118 | 首访 80~250ms；后续 10~30ms |
| 引擎取新 profile：下一 tick（≤33ms）+ worker 单帧 | useEngineLoop.ts:81-140 | 33ms + **31.7ms(static)~100ms** ← 主导 |
| 400ms 防抖后 profile 双写盘 | useProfileManager.ts:54-68 | main 异步 ~2-5ms（不卡 UI） |
| **端到端（点击→预览变色）** | | **首访 ~150~350ms；后续 ~80~150ms，其中引擎单帧占 1/2~2/3** |

### 4.2 MiniGamesView 进入 survival 并开局
| 阶段 | 代码 | 估计耗时 |
|---|---|---|
| hub 点击 tile → setScreen | MiniGamesView.tsx:1447-1454 | 首访 lazy chunk 30~100ms；effect 挂载（initialSurvivalState×1、initialState、readBest×4、loadRuns…）2~8ms |
| rAF 循环启动 + 背景缓存 miss（drawSurvivalBackground 整幅一次） | :970-1002,1119-1133 | 一次 2~5ms |
| 点「开局」：initialSurvivalState + deployPlayers + startSurvival + publishSurvival | :1675-1695 | 1~3ms + 一次全树重渲 2~6ms |
| 首帧 tick+draw | 循环 | ~0.7ms/帧（之后恒定） |
| 运行中每 0.18s publish 全树重渲 | :1275-1282 | 2~6ms 尖刺@5.5Hz |

### 4.3 WorkspaceView 拖参数滑条（每 input 事件）
| 阶段 | 代码 | 估计耗时 |
|---|---|---|
| onChange → setLayerParameter → setProfile → App+WorkspaceView 全树重渲 | WorkspaceView.tsx:281-283, useLayerActions | 2~8ms/事件 ×拖拽率(≤60Hz) |
| engineConfigRef 刷新（render 期）→ 下一 tick postMessage | App.tsx:309-310 | ≤33ms |
| worker 单帧（新参数生效并上屏） | previewEngine | **31.7~100ms** ← 主导 |
| **端到端（滑条→预览变化）** | | **~65~135ms**（引擎占大头）——"滑条跟手感差"的真因是 U-2 不是 React |

### 4.4 VideoStudio 加载片源
videoOpenFiles→addTracksFromPaths（同步构造 URL，<1ms）→ `<video>` 原生解码（media:// Range 流式，main createReadStream）→ 无逐帧 JS 参与（超分 pump 见 U-17 良好项）。取消：切源仅换 src，旧流由 GC/媒体管道回收——无请求堆积。音频侧坏 wav 才走全量 decode（U-14）。

---

## 5. 延迟预算表（现状估计 → 目标 → 差距与责任代码）

| 操作 | 现状估计 | 目标 | 差距 | 责任代码 |
|---|---|---|---|---|
| 启动→首屏（dashboard） | 500ms~1.5s（ready-to-show+9 IPC 并行+主包解析） | <1.5s | 达标 | （i18n 主包可再省 ~20ms） |
| 切视图 effects→workspace | 80~250ms（首访含 chunk） | <100ms | 首访超 | lazy 预取可消 |
| 进游戏开局（点击→第一帧） | <20ms（非首访） | <100ms | 达标 | — |
| 游戏逐帧（60Hz 预算 16.7ms） | 基线 ~1.4ms + 0.18s 尖刺 2~6ms + elite/弹体 shadowBlur 尖刺 | p95<16.7ms | 尖刺超 | U-1/U-4/U-8 |
| TD 局中移动鼠标 | 每鼠标事件 2~6ms 全树重渲 | ≈0 | 超 | U-4 |
| 选层改参数（滑条→预览） | 65~135ms | <50ms | 超 2~3× | U-2（引擎） |
| 效果卡 hover 预览 | 300ms 防抖（设计）+33ms tick+31.7~100ms 引擎 ≈ 365~435ms | 设计即 300ms；引擎部分应 <70ms | 超 | U-2 |
| Effects 浏览逐帧 | 20 卡同屏 15~46ms/帧 | <16.7ms | 超 1~3× | U-3 |
| 3D 效果预览逐帧 | draw+readPixels 失速 1~5ms+20MB/s GC@60Hz | <16.7ms@30fps | 临界 | U-6 |
| 音频分析开启（60Hz ref 通道） | ~0 重渲；分析 tick µs 级 | 0 | 达标 | — |
| AI 聆听开启（会话期） | main 每 1.2~3s 阻塞 ~1.4s（AST）→ 全应用 IPC 停摆 45% 时间 | 0 阻塞 | 严重超 | U-7（后端） |
| 视频解码投屏 | 原生解码+Range 流；无 JS 逐帧 | <16.7ms | 达标 | — |
| 关窗（隐藏到托盘） | hide+IPC visibility；tick 门控即时停（无 overlay） | <50ms | 达标 | index.ts:191-201, useEngineLoop:204 |

---

## 6. 卡顿可观测性方案（建议 R-N 落地）

1. **主线程 stall watchdog**：renderer 挂 `PerformanceObserver({entryTypes:['longtask']})`（阈值 50ms）＋自校验心跳 `setInterval(()=>{drift=performance.now()-due}, 200ms)`，超阈值记录（当前 view、任务时长、最近 3 次 rAF 间隔）到环形缓冲（100 条），Diagnostics 视图展示 + 超 200ms 时 `console.warn`/文件日志。Electron renderer 支持 longtask（Chromium 内建）。
2. **逐帧耗时直方图**：games rAF 循环与 PreviewGrid rAF 各自记 `now-last`，分桶（<8/8-16/16-33/33-66/>66ms）滚动 180 帧窗口（复用 MetricsCollector 骨架）；Diagnostics 显示 p50/p95/p99 与尖刺时刻对齐的事件（publish/levelup/boss）。
3. **内置 perf HUD**（游戏内 F3 开关）：rAF p95、tick/draw 分项、上次 publish 重渲 ms（`performance.mark` 包住 setState 前后的 `requestAnimationFrame` 提交）、React commit 数（`Profiler onRender` 仅 HUD 开启时挂）、worker roundTripMs/droppedTicks（已有口径，直接读 metricsCollectorRef）。
4. **启动自检行**（main 日志 + Diagnostics 首行）：GPU 进程状态（`app.getAppMetrics()` GPU 进程 cpu/内存）、`devicePixelRatio`、`backgroundThrottling` 生效开关、RDP 检测（Windows：`process.env.SESSIONNAME` 含 `RDP` 或注册表 `GetSystemMetrics(SM_REMOTESESSION)` 经 powershell 一次性查询）、CPU 核数——用于区分"环境天花板"与"代码回归"（本次 RDP 30Hz 呈现天花板的教训）。
5. **现有资产接线**：Diagnostics 已有 metrics（avg/p95/droppedTicks），补「重渲计数」与「longtask」两个维度即可低成本闭环。

---

## 7. 修复顺序建议（收益/成本，含工作量估计）

| 序 | 修复 | 对应 | 工作量 | 预期收益 |
|---|---|---|---|---|
| 1 | tdHover 改 ref（一处 state→ref + 循环读 ref） | U-4 | 0.5h | TD 鼠标路径归零 + 悬停圈功能复活（正确性+性能双赢） |
| 2 | publish* 收窄：运行态 HUD 拆 memo 子组件或降频 0.5s+字段 diff | U-1 | 0.5~1d | 消除局中 5.5Hz 周期尖刺（用户主诉"按方向键卡顿"的最可能残留） |
| 3 | EffectsView 卡渲染限频 20fps + 颜色分桶/离屏 ImageData | U-3 | 0.5~1d | effects 浏览帧预算回正（15~46ms→<8ms） |
| 4 | 引擎每帧预解析+去每像素分配（后端所有权，移交 03 报告 B-1 方案） | U-2 | 2~3d | workspace 预览 15fps→30fps；滑条/hover 端到端延迟 3~10× 改善 |
| 5 | AudioAi 停源+负缓存退避（渲染+main 各一小改） | U-7 前半 | 0.5d | 消 3.3Hz 风暴与日志噪音 |
| 6 | AST 迁 utilityProcess（后端，B-2） | U-7 后半 | 2d | 聆听期全局解冻 |
| 7 | 游戏绘制残留：TD 弹体假发光/删 clearRect/精英敌假发光 | U-8 | 0.5d | 软件合成与弱 GPU 下帧尖刺消除 |
| 8 | Preview3D 小 FBO readLEDs + fps 限频 | U-6 | 0.5d | 3D 效果路径 GC/失速消除 |
| 9 | AudioStudio/VideoStudio `React.memo` + shutdown 倒计时本地化 | U-10 | 1h | 低频重渲消除 |
| 10 | MetricsCollector 轻量 add；media:// debug 开关化 | U-11/U-13 | 1h | 卫生项 |
| 11 | 可观测性套件（§6）先行植入，为 2/3/4 验收提供基线 | — | 1d | 防"修了又回" |

---

## 8. 被推翻的怀疑 / 已验证无问题

- 「worker↔renderer 帧传输非零拷贝」——**推翻**：双向 transfer（useEngineLoop.ts:137 转入 screenSample；previewEngineWorker.ts:137 转出 frame）；仅 ledColorsRef.set 165KB（实测 0.008ms）与 overlay 中继克隆（~196µs/跳，后端组测）两处小拷贝。
- 「publishSurvival 的 spread+数组拷贝本身贵」——**推翻**：实测 0.001ms；贵的是 React 整树重渲（U-1）。
- 「LAN 快照 JSON 往返贵」——**推翻**：0.171ms@15Hz，仅 host 有 peer 时发生。
- 「applyParameterAutomation 每 tick 深拷贝 profile」——**推翻（用户配置下）**：automation 关闭时原样返回引用（automation.ts:60）；用户 profile 仅 638B，即使开启克隆也微小。
- 「AudioAi 风暴直接卡 UI 线程」——**推翻**：渲染侧 fire-and-forget；影响在 main（且重量级场景是 AST 同步推理而非失败重试本身）。
- 「keydown 处理重」——**推翻**：MiniGamesView keydown 为 O(1) Set/Map 操作＋少量分支（:1321-1412）。
- 「R42/R43 门控有漏（games 仍跑引擎）」——**无漏**（无 overlay 前提下整 tick 跳过，useEngineLoop.ts:204-212 亲自核读）；overlay 分支为设计保留。
- 「音频分析开启拖累 UI」——**无问题**：双通道设计（ref+subscribe，status 仅迁移）落实良好（useAudioAnalyzer.ts 全文）。
- 「10Hz 进度重渲后台空转」——**已修**（R70.10 visible 门控，AudioStudioView.tsx:1524 亲自确认）。
- 「启动被 461MB 模型拖慢」——**无问题**：模型惰性加载，不随 boot。

## 9. 未验证 / 局限

- 不得启动应用：React 渲染毫秒数（U-1/U-3/U-4/U-10 的 ms 估计）、EffectsView 多卡实测帧耗、readPixels 实测失速、RDP 与真机差值——均为代码机制＋微基准外推，标注 Likely。
- 用户是否曾在开 overlay 状态下玩游戏无法从日志判定（overlay 仅 16 条且集中一天）→ U-5 暴露度按"低"处理。
- 用户主诉可能部分来自已发布 0.3.84（无 R219.7-9）；本报告残因清单按 HEAD 归属，真机复测建议以 §6 观测器数据为准。
- vision 相关 rAF（VisionBanner/VisionPad/VisionCursor，默认关）与 AiLab 各 tab、DiagnosticsView 轮询未逐行审（低暴露）；`effects.ts` 49 case 未逐个计时（以 8 种采样外推）。
- 微基准为 Node（V8 版本与 Electron worker 存在差异，方向与量级可信，绝对值±2×）。
