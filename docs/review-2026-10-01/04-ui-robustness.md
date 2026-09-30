# 04 · UI 稳定性审计（崩溃/异常风险，静态代码审计）

- 审计对象：RGBBox @ HEAD `93d365f`（未发布；0.3.84 zip=03477e19 为更早版本，见「局限」）
- 范围：renderer UI 层（MiniGamesView/games 引擎接线/vision/各 view rAF 与订阅）、preload 桥接口面、main 侧崩溃门禁机制审阅
- 方法：全文精读 MiniGamesView.tsx(2939)/App.tsx(822)/survival.ts(2123)/sfx.ts/hdCanvas.ts/hud.ts/useVisionInput.ts/vision 四组件/crashLog.ts/main.tsx；近 8 提交逐一读 diff；全部 `window.rgbbox.on*`(14 处)、`JSON.parse`(30+ 处)、`requestAnimationFrame`(13 文件) 清点核对
- 纪律：每条发现均亲自读到 file:line；被推翻的假设单列；置信度三档

---

## 一、结论

**未发现"直接崩溃级"（P0）缺陷。** 203 次启动零崩溃与代码面自洽：核心游戏循环是纯数据操作、全部 localStorage/JSON.parse 有 try/catch、全部 rAF/on* 有 cleanup、preload 订阅全部返回反注册。**但存在 2 个 P1 级"单点失效无自愈、无观测"结构性缺口**（主游戏 rAF 循环无异常护栏；主窗口无 render-process-gone 处理）——任一未预期异常/渲染进程崩溃都会造成**静默冻结或白屏且不留任何日志**，与「无 dump、log 无 crash 条目」的取证现状互为因果：不是没风险，是出了事看不见。另有卡键类功能缺陷 2 项（P2）与若干 P3。

---

## 二、Top 风险排名（按崩溃可能性×后果）

| # | 风险 | 位置 | 触发→后果 | 置信度 |
|---|------|------|-----------|--------|
| 1 | 主游戏 rAF 循环无 try/catch，一帧抛错即永久死循环终止 | `MiniGamesView.tsx:1009-1311`（`frame = requestAnimationFrame(loop)` 是循环末句，异常跳过它） | tick/draw/hud 任意一帧 throw → 画面冻结、无提示无日志，effect 不重建（依赖未变） | 高（59a2f4b 提交信息已实证过同类：「addColorStop 抛错杀死 rAF 循环」） |
| 2 | 主窗口无 `render-process-gone`/`unresponsive` 处理 | `src/main/index.ts`（全仓 grep 仅 `snipManager.ts:167` 有） | renderer 崩溃 → 白屏 + 托盘僵尸 + rgbbox.log 零条目（仅 Crashpad dump） | 高 |
| 3 | 渲染层 JS 异常无前送通道 | `main.tsx`（无 window.onerror/unhandledrejection） | rAF 外异常只进 devtools console，crashLog 永远缺失 renderer 侧记录 | 高 |
| 4 | vision 中途 disable 不清引擎键池 → 飞船漂移 | `MiniGamesView.tsx:770-774` + `useVisionInput.ts:254` | 局中关视觉/窗口隐藏时按住方向 → keys 残留，船持续移动 | 高（代码路径），中（可感知性未真机验证） |
| 5 | hub 切换卡键残留（R96.1-N2 现代形态，PRD R96.4 明示遗留） | `MiniGamesView.tsx:1319-1419`（hub 态监听整体移除） | 按住键点"返回 hub"→ keyup 丢失 → 重进 running 局漂移/tetris 残留硬降 | 高（代码路径） |
| 6 | vision 初始化 reject 后通道卡死，无法再启用 | `useVisionInput.ts:179-237`（reject 不 close channel，`channelRef` 保持非 null） | 一次 init error → 之后 enable() 在 :165 守卫处静默 return，直到视图卸载 | 中 |
| 7 | 全仓 WebGL 零 `contextlost` 处理（grep 0 命中） | EffectsView/PreviewGrid/Preview3D/ArchitectureView/SplatViewer/OverlayCanvas/LEDMapper | GPU TDR/驱动重置 → 全部预览静默黑屏，需重启应用（不抛异常、不崩溃） | 高（缺失确证），影响中 |

---

## 三、发现清单

### R-1（P1）主游戏 rAF 循环无异常护栏
- **位置**：`src/renderer/src/components/MiniGamesView.tsx:1009-1311`（loop 函数；`frame = requestAnimationFrame(loop)` 在 :1309，位于函数末尾）
- **触发**：循环体内任意 throw——tickGame/tickSurvival/tickTetris/tickSlash、drawGame/drawSurvival/drawTetris/drawSlash、fsDrawRef HUD、bgCache 重建、头像 drawImage 等，任何一处未预期异常（形状回归、NaN 尺寸、未来 noop-ctx 类回归）。
- **后果**：`requestAnimationFrame` 不再被调度 → 游戏画面冻结在最后一帧；无任何用户可见反馈、不落日志；React 不重挂该 effect（deps 未变）→ 无自愈。BGM/输入监听仍在（假活状态）。
- **实证**：commit 59a2f4b 信息原文记录了同类事故——happy-dom noop ctx 的 `addColorStop` 抛错"杀死 rAF 循环连带 R137/R138/R139 三用例失败"。该修复只给 hud.ts/scene.ts/tetris.ts 的渐变调用加了守卫，未给循环本身加护栏；`VisionPad.tsx:79-84` 与 `VisionCursor.tsx:38-92` 反而已有"never take the game down"的 try/catch 先例。
- **修复**：loop 体包 try/catch（catch 中可计数降频上报），对齐 VisionPad 模式；`requestAnimationFrame(loop)` 移到 finally 语义位置。
- **置信度**：高。

### R-2（P1）主窗口无 renderer 崩溃处理
- **位置**：`src/main/index.ts`（mainWindow 装配处无 `webContents.on('render-process-gone'|'unresponsive')`；全仓仅 `src/main/snipManager.ts:167` 对 snip 窗口有）
- **触发/后果**：renderer 进程崩溃（native OOM、GPU、V8）→ 主窗白屏；主进程与托盘继续运行（close→tray 设计）→ 用户看到"假死"应用；rgbbox.log 不写任何条目。crashReporter（`crashLog.ts:26`，uploadToServer:false）会留 minidump，但 Crashpad 目录现状为空，说明该路径从未被走到或从未被验证过。
- **机制审阅**（清单⑦）：主进程侧 `uncaughtException`/`unhandledRejection` → rotated JSON（crashLog.ts:27-28，KEEP=20，写入自身再套 try，:52 swallow by design）——机制可用且防递归；renderer 侧完全无对应物。
- **修复**：mainWindow 挂 `render-process-gone` → `recordCrashEvent('renderer-gone', details)` + 可选 `reload()`；顺带 `unresponsive` 记录。
- **置信度**：高。

### R-3（P2）渲染层异常无前送
- **位置**：`src/renderer/src/main.tsx`（boot 处无 onerror）；与 R-2 合并构成"renderer 侧零崩溃可见性"。
- **修复**：boot 挂 `window.addEventListener('error'/'unhandledrejection')` → 经 ipc 前送 `recordCrashEvent('renderer', …)`；Diagnostics 已有 crashLogList 展示，零新增 UI。
- **置信度**：高。

### R-4（P2）vision disable 不清引擎键池
- **位置**：`MiniGamesView.tsx:770-774`（pollVision 每帧把 `vision.heldRef` 镜像进 `survivalRef.current.keys`）；`useVisionInput.ts:244-262`（disable 只 `heldRef.current.clear()`，不清引擎侧）。
- **触发**：survival 运行中按手势方向移动时 ①关视觉开关 ②窗口最小化/隐藏（:942 `onMainWindowVisibilityChanged(!visible) → vision.disable()`）③回 hub（:939）。最后镜像进 keys 的方向键残留。
- **后果**：飞船持续漂移+可能持续开火（rAF 因 backgroundThrottling:false 仍在跑，tickSurvival 消费残留键）。R136 验收④只锁了 vision 自身 heldRef 清空，未覆盖引擎侧镜像。
- **修复**：disable 路径对 `VISION_PASSTHROUGH_KEYS` 逐键 `survivalRef.current.keys.delete(k)`（或 pollVision 在 `!vision.enabled` 时也执行一次 delete 镜像）。
- **置信度**：代码路径高；用户可感知性未真机验证。

### R-5（P2）hub 切换卡键残留（R96.1-N2 遗留）
- **位置**：`MiniGamesView.tsx:1319-1419`：键盘 effect 在 hub（非 fs）整体 return → keydown/keyup 监听移除；`enterGame`/`backToHub`（:1447-1460）不清 `survivalRef.current.keys/inputs`、`tetrisRef.current.commands/keys`。
- **触发/后果**：按住移动键的同时点"返回 hub"→ keyup 无人接收；重进游戏若 phase 仍 'running'（组件未卸载、状态保留）→ 漂移；tetris 的 commands 队列残留 → 重进瞬间意外硬降。game↔game 直切无此问题（同 commit 内 cleanup→setup 无间隙，且 `up` 处理器跨引擎删键 :1399-1412）。
- **佐证**：PRD R96.4 明确将"N2 切游戏卡键"列为裁切后遗留、后续 R-N 立项——至今未见对应 R-N。
- **修复**：screen effect（:435）切换时统一 `releaseAllInputs()` 纯函数 + 单测。
- **置信度**：高。

### R-6（P2）useVisionInput 初始化失败后卡死
- **位置**：`useVisionInput.ts:179-237`：`msg.type === 'error'` → `reject(...); return`，但 channel 不 close、`channelRef.current` 保持非 null、`hostOpenRef` 不回滚。
- **触发/后果**：host init 失败一次（如 wasm 加载失败）→ 调用方 `enable().catch(()=>undefined)` 静默 → 此后 `enable()` 在 :165 `if (channelRef.current) return` 直接返回，`enabled` 永 false，视觉开关变摆设，直到离开 games view 卸载。BroadcastChannel 仍在收消息并 setState（无害但脏）。
- **修复**：reject 前调用 disable()（close channel、置 null、visionHostClose）。
- **置信度**：中（路径确定，实际 init 失败频率未知）。

### R-7（P2）WebGL contextlost 全仓缺失
- **位置**：grep `contextlost|webglcontextlost|CONTEXT_LOST` 于 `src/renderer/src` **0 命中**。涉及：EffectsView（每卡片独立 context，:112-115 等）、PreviewGrid、Preview3D、ArchitectureView(:531 附近)、SplatViewer、LEDMapper、OverlayCanvas（物理屏投影，最关键）。
- **后果**：Windows GPU TDR/驱动重置后 context 丢失，Chromium 语义下后续 gl 调用变 no-op 不抛异常 → 黑屏/停更，需重启应用。属"运行稳定"缺口，非崩溃。
- **修复**：`gl/` 下加 `attachContextLoss(canvas, rebuild?)` helper：`contextlost` preventDefault + `contextrestored` 重建资源；OverlayCanvas/EffectsView 优先接入。
- **置信度**：缺失事实高；触发频率依赖机型（未验证）。

### R-8（P3）loop effect 闭包过期值：R201 悬停预览失效
- **位置**：`MiniGamesView.tsx:1230-1231` 读 `tdHover`/`selectedTower`（render 域 state），但 effect 依赖表 `:1317` 为 `[bgmOn, fullscreen, pollGamepad, pollVision, publishTd, publishSurvival, publishTetris, screen, selectedTowerId, settleBest, tdSpeed]`——**无 tdHover/selectedTower/t**。
- **后果**：悬停射程圈（R201 F6）在窗口态基本不显示（闭包里 tdHover 冻结为 effect 运行时的值，通常是 null；仅当 selectedTowerId/fullscreen 等依赖变化时短暂"解冻"一次）；切语言后 ready 标题串过期。非崩溃。`buildTowerAt` 用的是 `selectedTowerRef`（:1582），实际落塔不受影响。
- **修复**：tdHover 提升 ref（tdHoverRef）；`t` 已有类似问题但影响极小。
- **置信度**：高（依赖表可直接验证）；"完全不显示"的观感结论未真机确认。

### R-9（P3）LAN snap 处理无形状校验
- **位置**：`MiniGamesView.tsx:1611-1618`：`e.detail as GameState` 直接赋 `tdStateRef.current`，随后 `.balloons.map(...)`。host→guest 的 detail 经主进程 LanService 中继；host 侧自身 `JSON.parse(JSON.stringify(s))`（:1043，有 try）保证 JSON 安全，但跨版本联机或中继层畸形会在此 throw（IPC 回调内 uncaught，不崩进程）。对照：garbage 指令已 clamp（:1593）、cmd 字段有 typeof 门（:1591-1609）。
- **修复**：snap 分支 try/catch + `Array.isArray(detail?.balloons)` 校验。
- **置信度**：中。

### R-10（P3）`window.rgbbox.` 非可选直调 181 处，与 `?.` 风格混用
- **位置**：如 `App.tsx:160/361-369`、`MiniGamesView.tsx:942` 等直调；同文件 374/1043 等又用 `?.`。
- **后果**：生产环境 preload（contextIsolation，先于页面脚本执行）必在，不构成崩溃面；仅当桥缺方法（版本错配的 overlay 窗口加载旧缓存页面等边缘）或测试 mock 不全时暴露。一致性问题。
- **修复**：统一约定（要么全 `?.`，要么启动时一次性断言桥完整性并 fast-fail）。
- **置信度**：低风险、高确定性。

### R-11（P3）LAN 角色不随退出复位
- **位置**：`enterGame`/`backToHub`（:1447-1460）不清 `lanRole/lanGame/lanPeers`；`MiniGamesView.tsx:1611` 的 snap 分支只判 `lanRoleRef.current==='guest'`。
- **后果**：guest 退回 hub 后 snap 仍持续替换 tdStateRef 并 `publishTd()` → hub 态无谓重渲（游戏状态被远端覆盖）。功能脏态，非崩溃。
- **置信度**：中。

### R-12（P3）音频生命周期小瑕疵
- `sfx.ts:11/96`：`audioCtx` 模块级单例永不 `close()`（设计取舍，常驻 ~1 个 context，可接受）。
- `MiniGamesView.tsx:1317`：loop effect cleanup `stopBgm()` + setup `startBgm()`——fullscreen/tdSpeed/selectedTowerId 每变一次 BGM 从第 0 步重头播。听感瑕疵，非崩溃。
- **置信度**：高。

---

## 四、近期 8 提交逐条复核

| 提交 | 内容 | 复核结论 |
|------|------|----------|
| `93d365f` R219.9 单人固定视口 | survival.ts diff 全读：`initialSurvivalState` 初始位 vp 中心（原世界中心）、`deployPlayers` count<2 分支钉 vp 中心/相机、count≥2 迁世界中心、tick 单人钳 `boundMaxX/Y=vp-16`、单人分支跳过 updateCamera/软推 | **未发现崩溃级缺陷**。注意点：开局瞬间 `state.vp` 是上一帧 loop 写入值（首帧即纠正，无 NaN 路径——vp 每帧 :1019 重写，canvas 尺寸恒 ≥1px）。测试 +2 锁定（1P 固定/2P 跟随） |
| `dafa3b1` R219.8 性能三项 | MiniGamesView diff 全读：`getContext('2d',{alpha:false})`（slash 分支 :1158 二次 getContext('2d') 返回同一 ctx，无害）；bgCache 键=场景\|岛\|backing 尺寸，复用 offscreen、resize 有界重画；CSS 定值宽 `width:min(100%,calc((100vh-430px)*900/520))` 消除本征反馈梯子 | **未发现崩溃级缺陷**。RO→backing 环已终止（见「已验证无问题」⑤） |
| `7f937d5` R219.7 fs 真铺满+态同步 | 终态精读：vp 语义进引擎、applyHdSize 分支、`fullscreenchange` 同步（:964-968）+ requestFullscreen 失败回落 focus（:954-959）；Enter/R 运行态门控（:1363-1370） | **未发现崩溃级缺陷**。两处 fullscreenchange 监听（:891 与 :964）冗余但幂等无害 |
| `7d089b4` R219 表现层修复轮 | survival.ts 绘制层归位（粒子/血条/飘字/飞船入摄像机层——终态 :1701+ drawSurvival 结构确认）；contain-fit；ready 面板迁移；+97 行测试（含变换跟踪 ctx 断言） | **未发现崩溃级缺陷**。该轮修复的正是 2f7200d 合并引入的回归，且已补测试锁——worktree 合并回归风险已被针对性加固 |
| `e9c3431` R218 终回写 | docs/PRD/截图/脚本为主，代码面即四分支合并汇总 | 合并产物=当前 HEAD 终态，已被本轮全文审计覆盖；未单独逐行追 diff（局限） |
| `76f9da8` R218 合并适配 | diff 全读：shim 块删除改真实参数表（TD 直写 lives/coins、Tetris 重建 initialTetrisState(seed,d)、Survival 第 4 参、头像 worldToViewport） | **未发现崩溃级缺陷**。头像当时固定 WIDTH/HEIGHT，R219.7 已修为读 vp（追踪确认） |
| `2f7200d` merge wt-r218-sv | survival 全量（敌矩阵/大世界/摄像机/juice/难度） | survival.ts 终态全文读：早退路径齐全（juice 冻结 :1194 return、全员倒下 :1228/:1513 return）、syncRoster 三入口维持别名不变量（:1186/:1703/:732）、寿命过滤全覆盖无无界增长。**未发现崩溃级缺陷**；O(n²) 敌分离环（:1518-1534）纯性能面 |
| `59a2f4b` hud.ts 渐变防御 | 终态确认 `drawHealthBar`/`drawAlertVignette` 的 g 空值守卫在位（hud.ts:83-91/107-113） | 防御有效；该提交同时是 R-1 风险等级的实证（rAF 循环被一个异常杀死） |

**测试没锁住的回归面**（跨提交观察）：①悬停预览（R-8）无任何用例；②卡键清理（R-4/R-5）无用例；③rAF 循环异常存活无用例；④LAN 畸形消息容错无用例。现有 154 文件 1477+ 用例对"正常路径数值"覆盖好，对"异常路径存活"覆盖薄。

---

## 五、系统性加固方案

1. **useRafLoop helper**（`try/catch + onError 上报 + cleanup`）：替换裸 rAF；MiniGamesView 主循环最先接，VisionPad/VisionCursor 已是事实模板。
2. **统一 useSubscribe**：约定 `window.rgbbox.on*` 只出现在 `useEffect` return 或 `const off =` 模式（现状已 100% 合规，固化成 grep 闸防回归：`rgbbox\.on[A-Z]` 不允许出现在 JSX/事件回调体内）。
3. **RO 终止守卫**：RO 回调写尺寸前先比对（VisionCursor.tsx:61-64 已是模板：值变才写）；`applyHdSize` 建议加 `if (canvas.width===w&&canvas.height===h) return` 幂等守卫；RO 创建必须伴 `disconnect`（现状合规）。
4. **WebGL contextlost**：`gl/` 加 `attachContextLoss(canvas, rebuild?)`；OverlayCanvas（物理屏）> EffectsView（多 context）> 其余。
5. **crash 自检行**：renderer boot 挂 onerror/unhandledrejection → ipc `recordCrashEvent('renderer')`；主窗 `render-process-gone` 同记录 + 可选 reload。Diagnostics 现成展示，零 UI 成本。
6. **输入清理不变量**：`releaseAllInputs()` 纯函数（survival keys/inputs[0..3]、tetris keys/commands、vision 键镜像），挂在 screen 切换 effect 与 vision.disable 路径；配单测直接锁 R96.1-N2 类。
7. **可机器检查的 grep 闸**（CI/pre-commit）：①`new ResizeObserver` ↔ `disconnect` 对账；②`addEventListener`/`removeEventListener` 数量对账（白名单：一次性 document/window 级）；③`JSON.parse(localStorage` 必须 try 内（当前 100% 合规，闸防回归）；④`getContext(` 后必须判空（现状基本合规）；⑤`requestAnimationFrame` 循环体内不允许裸业务调用（须在 try 内或走 helper）。
8. **回归测试思路**：异常注入（mock drawGame 抛错→断言下一帧仍调度）；卡键（挂键→切 hub→重进→断言 keys 空）；vision disable 按键清理；LAN 畸形 snap；`webglcontextlost` 派发→断言重建路径（jsdom 可派发事件）。

---

## 六、修复顺序

- **P0**：无。
- **P1**：R-1（循环护栏）、R-2（render-process-gone）。
- **P2**：R-3（renderer 异常前送）、R-4（vision 键清理）、R-5（hub 卡键）、R-6（vision init 卡死）、R-7（contextlost）。
- **P3**：R-8（闭包过期）、R-9（LAN snap 校验）、R-10（桥风格统一）、R-11（lanRole 复位）、R-12（BGM 重启）。

---

## 七、已检查且安全清单（含被推翻的假设）

1. **localStorage/JSON.parse**：renderer 全量 30+ 处，逐条/抽查 12 处全部 try/catch（readBest/readReadyPrefs/readDifficulty/gamesTelemetry/ai8 localStore×3/AiLabAgentTab×2/AudioStudioView/VideoStudioView/AudioVizProjector/MiniPlayerCard/usePersistedState/ProfileManager 导入/WorkspaceView 像素数据）。
2. **rAF cancel 完整**：MiniGamesView(:1312-1316 含 ro.disconnect+stopBgm)、VisionPad(:93)、VisionBanner(:43)、VisionCursor(:96-99 含 vision-hover class 摘除)、EffectsView×3、AudioStudioView(:1416)、ArchitectureView/SplatViewer/LEDMapper/Preview3D/PreviewGrid/MiniPlayerCard/useSuperres 模式一致。
3. **on* 订阅 14 处全部有 cleanup**：App.tsx:160、MiniGamesView:942、OverlayCanvas:171/217、useOverlayTopology×4(:53/67/74/81)、useModelStore:109、AiLabAgentTab:242、AiLabAudioTab:70、AiLabVoiceTab:66、AiListenOverlay:38、useVideoAudioEnhance:125、useSuperres:73；preload 侧统一返回反注册（如 onLanEvent，preload:382-387）。
4. **useEngineLoop**：cancelled 标志 + clearTimeout + removeEventListener + single-flight 双路解锁（:219-221 posted===false 与 catch 都复位 tickPending）。Worker App 卸载 terminate（App.tsx:353-356）。
5. **〔被推翻〕RO 写 canvas.width 会形成反馈环**：R219.8 后 CSS 宽为定值（min(100%,calc(...))），backing 不参与布局；computeHdSize 有下限 900×520、dpr 钳 2，无零尺寸/无 NaN；fs-survival 分支 Math.max(1,...)。收敛。
6. **〔被推翻〕killEnemy 分裂体 push 破坏迭代**：`for...of` 会访问新推元素，但子体 hp>0 不会被再次 killEnemy，gen=1 不再裂变（survival.ts:1166-1176/1536-1538）；survival 其余遍历用 filter/rebuild，td 用 remaining 数组重建，tetris while 下落环有界，slash 反向 splice。
7. **〔被推翻〕LAN 快照替换后 selectedTowerId 悬挂会崩**：upgradeSelected/sellSelected find 不到即 return（:1519-1537）；GameState 全字段 JSON-safe。
8. **别名不变量**：syncRoster 三入口（tick:1186/draw:1703/deploy:732）维持 player≡players[0]/player2≡players[1]/keys2≡inputs[1]/axes 长度对齐；键路由双向一致（down :1336-1346 / up :1399-1411 跨引擎删键）。
9. **头像**：AvatarPicker 全 try/catch；refreshAvatars onload/onerror 双 resolve 无悬挂 Promise；卸载后 setAvatars 无害（React 18+）。
10. **Esc 分层无死角**（:1424-1445）：hub 早退 → 专注退出 → fs 暂停 → 非 fs 运行态暂停 → 兜底退出全屏；Enter/R 与按钮条同门控（:1363-1370）。
11. **退出路径**：before-quit flush/dispose、window-all-closed 关浮窗群（architecture §9.4 + index.ts 装配确认）；crashReporter uploadToServer:false + 主进程 uncaught/rejection rotated JSON，机制本身可用。
12. **StrictMode**：仅主窗分支启用（main.tsx），double-mount 对上述全部 cleanup 安全（vision unmount→disable 幂等）。
13. **hud.ts/tetris.ts/scene.ts 渐变与 roundRect 守卫**（59a2f4b/tetris:570-585/scene:55-59）在位。

---

## 八、局限

1. 静态审计为主：未运行应用、未跑 CDP/快照（角色约束只读，未执行 scripts/ 下任何脚本）。
2. **版本归属**：结论仅对 HEAD `93d365f`（未发布）。已发布 0.3.84（03477e19，09-26）**不含** R219.7-9 三个提交，用户实际运行版本的风险面与本报告不同（R219 系列恰是修复合并回归的轮次，0.3.84 更接近"回归未修净"状态——若要评估发布版需另开 diff 比对，本次未做）。
3. R-4/R-5/R-8 的用户可感知程度未真机复现（代码路径确定，现象为推断）。
4. `gl/effectGl.ts` 内部、`LanService`（main）全文、AudioStudioView/VideoStudioView/SnipView 逐行未做（只审了 rAF/订阅/JSON 面）；overlay 热插拔 renderer 侧重开路径沿用 architecture §14 待确认项。
5. e9c3431（docs 为主）与 2f7200d（merge 提交）按"合并产物=终态"方式复核，未逐 hunk 追溯三方 diff。
6. R-1 的"历史上是否真的发生过生产冻结"无法从现有日志证实（恰是 R-2/R-3 缺失所致——观测盲区本身即发现）。
