# RGBBox 视觉/体感栈 架构与可扩展性评审报告（06-Architecture）

- 评审对象：`src/renderer/src/vision/*`、`src/renderer/src/visionHostMain.js`、`src/renderer/visionHost.html`、`src/renderer/src/components/vision/*`、`AiLabVisionTab.tsx`、`hooks/useVisionInput.ts`、`tests/vision/*`、vendor/models 资产
- 评审方式：**纯静态只读**（未运行测试/构建/应用；所有「测试通过」类结论均为 PRD 记录引用或静态推断，见 §10）
- 量化脚本：`C:\Users\tjf\AppData\Local\Temp\rgbbox-review-20261009\exp\vision-metrics.mjs`（本报告数字均可由它复现）
- 日期：2026-10-09 · 分支 review/vision-gesture-commercial（HEAD 539115a）

---

## 1. 摘要

**总评：6 / 10 ——「引擎内核产品级，消费/宿主边界 demo 级」。** 这套架构**能**承载从 demo 到商业产品的演进，但前提是先做一次「边界收编」：核心状态机不需要推倒，推倒过的（R136）恰恰是最成功的一层；真正拖后腿的是围绕内核的胶水层。

分维度（10 分制）：

| 维度 | 分 | 一句话依据 |
|---|---|---|
| 引擎内核设计 | 8.5 | 纯逻辑、无环依赖图、抗误触分层设计、ms 基确认窗（§2/§3） |
| 可测试性 | 7.0 | 引擎 73 用例含 Monte Carlo/不变式/延迟预算；但宿主胶水 179 行 0 测试（§7） |
| 类型安全 | 4.0 | d.ts 描述**死模块**、协议 18 种消息纯字符串两端对齐、无 ESLint（§5.1） |
| 横切一致性 | 4.0 | 0 日志、6 个 localStorage 键散落、错误三处吞掉（§5） |
| 扩展性 | 5.0 | 加"能力"内聚（和弦 1 行），加"入口"霰弹（每入口全量胶水）（§4） |
| 文档-代码同步 | 5.0 | architecture.md 基本准但留 schema TODO；PRD 3 处承诺与实现漂移（§7.3） |

**「租界架构」假设判定：成立一半。** 它不是无序飞地——vision/*.js 内部纪律严明（头注释即设计文档、依赖图为 DAG）；「租界」体现在它与全仓主流基础设施的**边界**上：JS 岛（不入 tsc、不入覆盖率）、自有消息协议（不入 shared/ipc.ts 模式）、自有持久化（localStorage 不入 systemSettingsStore）、自有文案体系（引擎内中文 + 组件内双语字面量，不入 i18n 字典）。R131 当年为「整文件采纳上游 v2」（R134.1）保留 JS 原样是**合理的历史决策**，但 R136 推倒重设计后上游同步已实质终止（vision_input.js 成死代码），豁免的原始理由已消失。

**Top 10 结构性问题**（file:line 见 §3–§7 展开）：

1. **双实现并行**：`vision_input.js`（289 行）在 R136 后无任何运行时消费（仅 d.ts 类型被 import，`useVisionInput.ts:10` type-only），与活实现 `pipeline.js` 语义分叉（acquire/cam/maxFps 语义都在 vision_input 里、不在 pipeline 里）；d.ts 头注释「the runtime module is the source of truth」已失真。
2. **宿主协议无契约**：18 种消息类型 = `visionHostMain.js:159-177`（10 个 case）与 `useVisionInput.ts:188-235`（8 种 postMessage + 7 个接收分支）两端的字符串字面量，无共享 const/联合类型/运行时校验；改协议零编译期保护。architecture.md:499 自己也承认「`rgbbox-vision` 通道消息 schema 未读」。
3. **采集遥测断链（静态实锤）**：`visionHostMain.js:108` 算出 `pipeline.acquireStats`，但 `emit()` 用 `pipeline.stats()`（`pipeline.js:207-217`）覆盖快照 stats，该函数**不输出 acquire/cam**；宿主也从不读 `track.getSettings()`。后果：`VisionPad.tsx:140-145` 第三行（采集 p95 + 协商分辨率）、`VisionBanner.tsx:31-37` envCoach 的 dim-light/low-fps 建议、`AiLabVisionTab.tsx:420` statsText 永远空转——R134/R141-E0/R144 的承诺在现行架构下失效；组件测试（如 `MiniGamesView.test.tsx:423` dim-light 用例）直接注入 stats.acquire，**测试绿掩盖了链路死**。
4. **多消费方生命周期无仲裁**：3 个入口各自 `useVisionInput()`，任一实例 `disable()` 即 `visionHostClose()` 关掉全局唯一宿主窗（`useVisionInput.ts:244-262`）——「先离开者杀死所有人」。PRD R144.2 写的是「最后离开者关宿主」，与实现相反。
5. **组合语义 4 类 × 客户端复刻 8 处**：张掌保持 700ms ×4（`MiniGamesView.tsx:904/932/958` 三份近似拷贝 + `AiLabVisionTab.tsx:368`）、双捏合 900ms ×2（`MiniGamesView.tsx:840` + `AiLabVisionTab.tsx:326`）、握拳 clutch 250ms ×1、fist 判定 ×2（`VisionCursor.tsx:49-52` + `AiLabVisionTab.tsx:376`）。引擎没有「高级手势原语层」，魔法数 700/900/250/0.85 散落 6 处，R144 注释自己承认是「客户端复刻消费方语义」。
6. **校准反馈链断裂**：`session.js` 质量门的全部人话反馈（_gate 宽容扩展/重试理由，`session.js:198-306` 约 15 条）写入 `snapshot.status`，**没有任何 UI 消费 status**；`MiniGamesView.tsx:2120` 的 `!vision.label.startsWith('重试')` 判断永假（`label()` 返回 `校准 N/3:…`，不含「重试」）。R134 引以为傲的「宽容校准 + 具体提示」UX 在成品里不可见。
7. **d.ts 类型漂移**：`VisionFrame`（`vision_input.d.ts:42-70`）缺 `allHands/gapNorm/offHeld/stepIdx/faceBlend`（`session.js:541-573` _snapshot 实有）；`VisionStats` 声明的 `acquire/cam/lowFps` 活管线不产（见 #3）；类型与真源是两个平行宇宙。
8. **引擎中文硬编码**：`session.js` 含 360 个汉字（STATE_LABELS/CAL_STEPS/_gate 全部文案），`AiLabVisionTab.tsx:21-216` 24 行 ×3 字段双语字面量（`Bi` 类型只有 zh/en 两键），第三语言（如 ja）落地必改引擎 + 目录结构。
9. **持久化租界**：6 个 localStorage 键散在 3 个文件（`useVisionInput.ts:16-19` ×4 含 vgi-profile-v2、`VisionAssistant.tsx:16`、`MiniGamesView.tsx:266-270`），全部会话级，不入 systemSettingsStore / 设置镜像 / Profile 导出——商业产品「设置可备份可迁移」不满足；R153.6 还实证过这些键会污染 UI 快照基线。
10. **零日志零错误上抛**：vision/*.js + visionHostMain.js + useVisionInput **0 处 console/logger**（脚本实测 grep 0 命中）；错误范式 = `catch → post error 一次`（`visionHostMain.js:152-155`）+ 消费端三处 `.catch(() => undefined)` 静默吞（`VisionAssistant.tsx:66`、`MiniGamesView.tsx:2351`、`AiLabVisionTab.tsx:394`）。摄像头被拒/模型加载失败时用户只看到状态不动，无诊断入口（main 有 `shared/logger.ts` 文件日志体系，视觉栈完全没接）。

**商业化演进结论**：内核（手势/和弦/光标引擎 + 合成测试基建）经得起扩展；阻碍在边界——按现状加第 4 个消费入口（手势控灯）会再复制一份 300 行胶水并踩 #4/#5；建议先落 §9 的 R1+R2（S 级，堵类型与遥测黑洞）再做 R3+R4（会话管理器 + 手势原语层），之后商业场景 (c) 的接入成本从 🔴 降为 🟢。

---

## 2. 度量数据表

### 2.1 规模与复杂度（脚本实测 2026-10-09）

| 文件 | 行数 | if | 循环 | class | export | 汉字 | try |
|---|---|---|---|---|---|---|---|
| vision/session.js | 587 | 69 | 3 | 1 | 7 | **360** | 2 |
| vision/gesture_engine.js | 450 | 35 | 3 | 7 | 14 | 16 | 0 |
| vision/vision_input.js（**死代码**） | 290 | 13 | 2 | 1 | 3 | 0 | 2 |
| vision/pipeline.js | 219 | 18 | 0 | 1 | 2 | 6 | 1 |
| vision/fingerChords.js | 170 | 17 | 1 | 1 | 4 | 0 | 0 |
| vision/cursor.ts | 140 | 8 | 1 | 0 | 7 | 0 | 0 |
| vision/face_engine.js | 106 | 4 | 4 | 1 | 2 | 10 | 0 |
| vision/synthetic.js | 93 | 4 | 0 | 1 | 2 | 0 | 0 |
| vision/one_euro.js | 88 | 2 | 0 | 3 | 3 | 0 | 0 |
| vision/envCoach.ts | 34 | 4 | 0 | 0 | 3 | 0 | 0 |
| visionInput.d.ts + fingerChords.d.ts | 153 | — | — | — | — | 0 | — |
| visionHostMain.js（宿主胶水，0 测试） | 179 | — | — | — | — | 6 | — |
| hooks/useVisionInput.ts | 334 | 19 | — | — | — | 0 | 8 |
| components/vision/VisionPad.tsx | 338 | 14 | — | — | — | 2 | 1 |
| components/AiLabVisionTab.tsx | 622 | 21 | — | — | — | 24 行目录 | 2 |
| components/vision/VisionAssistant.tsx | 192 | 18 | — | — | — | 0 | 2 |
| components/vision/VisionCursor.tsx | 104 | 7 | — | — | — | 0 | 1 |
| components/vision/VisionBanner.tsx | 71 | 2 | — | — | — | 0 | 0 |
| MiniGamesView.tsx 中 vision 相关 | 164/3074 行提及 | — | — | — | — | 有 | — |

引擎合计 .js ≈ 2,056 行（其中 289 行死代码）+ TS 174 行；UI/胶水层 ≈ 1,840 行。**session.js 不是 God module**：587 行单一职责（会话状态机 + 三步校准 + 质量门），69 个 if 是状态机+门禁的本征复杂度，头注释即完整设计文档；职责簇拆解（已天然分层）：生命周期(111-163)/校准向导(165-342)/每帧分发(344-539)/快照(541-573)/工具函数(576-586)。真正的「God 味」在消费侧：pollVision 一个 callback 185 行跨 4 屏 4 个游戏分支（`MiniGamesView.tsx:789-974`）。

### 2.2 引擎内部依赖图（DAG，无环）

```text
one_euro ← gesture_engine ← session ← pipeline
face_engine ← session, pipeline          latency ← pipeline, (vision_input†)
gesture_engine(Median3) ← fingerChords ← pipeline
session ← vision_input†（†=死代码，运行时无人加载）
```

fan-in：face_engine 3、gesture_engine 2、session 2、latency 2、one_euro 1、fingerChords 1。低扇入、无环、单向（细粒度 ← 粗粒度），**结构健康**。

### 2.3 资产与提交

- vendor/mediapipe ≈ 23.5MB（wasm SIMD 11.76 + NoSIMD 10.96 + bundle 0.16 + loader js 0.65）+ models 11.58MB（hand 7.82 / face 3.76）≈ **35MB**，符合 ≤100MB 硬预算（R131.1 论证），asarUnpack 覆盖（package.json:84-88）。
- 视觉栈专属提交：**19 / 624**（git log 实测），全部集中在 2026-09-19→09-22 四天（R131→R153），≈4.75 commit/天——8 轮迭代是四天冲刺的产物，边界债与此节奏直接相关。
- `vision-game-input/` 源目录**不在仓库**（find 0 命中）——无双源漂移风险，PRD 中引用均为历史记录。

---

## 3. 分层与可测试性

### 3.1 DOM 依赖实测（grep 全量）

- `session/gesture_engine/fingerChords/one_euro/face_engine/latency/synthetic`：**0 处** DOM/浏览器 API——「纯逻辑层」名副其实。
- `pipeline.js`：仅 `performance.now()`（7 处，Node 全局可用）——node 可测（pipeline.test.mjs 实证）。
- `vision_input.js`：`document.baseURI`(73)、`navigator.mediaDevices`(110)、`requestAnimationFrame`(164)——浏览器胶水，但它已是死代码（§1#1）。**分界线画对了，只是画在了死模块上**：R136 后真正的浏览器边界在 `visionHostMain.js`（createElement('video')/getUserMedia/rVFC，81-115），该文件无任何测试。
- 结论：「引擎无 DOM」这一全仓约定在视觉栈**兑现**；未兑现的是宿主胶水的可测性（协议处理逻辑与 DOM 生命周期耦在一个 onmessage 里，无法在 node 下驱动）。

### 3.2 组件测试现状

- `tests/renderer/components/AiLabVisionTab.test.tsx` 13 用例、`tests/renderer/components/vision/VisionAssistant.test.tsx` 3 用例、`tests/renderer/hooks/useVisionInput.test.tsx` 12 用例、`MiniGamesView.test.tsx` 36 用例中约 10 条 vision 相关。VisionPad/VisionBanner/VisionCursor **无直接组件测试**（经 FakeHost 快照间接驱动）。
- 覆盖率：vitest coverage include（vitest.config.ts:25-33）**不含** `src/renderer/src/vision/**` 与 `visionHostMain.js`——R131.5 豁免至今，引擎 ~1,770 活行 + 宿主 179 行 = **0% 计入**；组件/hook 在 include 内但 MiniGamesView 被排除（R12 先例）。

### 3.3 synthetic.js 价值评估

合成源是本栈最有价值的测试基建：与真实管线共用 SessionController/pipeline（仅 landmark 来源不同），支撑了 `verify-r131-vision.mjs`（21 断言打包 E2E）与 `verify-r144-vision-lab.mjs`（26/27 断言）两条免摄像头 E2E，以及 helpers.mjs 的 `makeHand` 几何构造器 + mulberry32 种子噪声（Monte Carlo 可复现）。fixtures/*.json 3 份真实序列（diagonal-and-expressions / right-sweep-pinch / snake-turns）来自上游 VMosue 实拍。使用率高（reliability/prediction/pipeline/session 均直接驱动）。**强烈建议保留并作为 (c) 场景的验收基建**。

---

## 4. 扩展性走查（a–g，逐项追踪代码）

评级：🟢 单点内聚 / 🟡 多文件但路径清晰 / 🔴 霰弹式或踩结构债。

| 场景 | 需改动文件（实测定位） | 估计行数 | 编译期保护 | 评级 |
|---|---|---|---|---|
| **(a) 新增手势「握拳左移」** | `gesture_engine.js`(+60–80：fist×direction 组合引擎，且须重审 fingerChords.js:70-79 的 fist=中立形保护与 cursor.ts:63 的 clutch 语义冲突——握拳已被三处占用为「中立/clutch」)；`session.js:488 _activeFrame` 接线(+15)；`vision_input.d.ts` VisionEvent(+5)；`useVisionInput.ts` 事件归一(+5)；`MiniGamesView.tsx pollVision` 消费(+15)；`AiLabVisionTab.tsx` CAPS 行(+12)；i18n ×2(+4)；tests ×2(+40) | ~8 文件 / 160 行 | **无**（事件 kind 是运行时字符串；消费方 match 谓词靠人肉） | 🔴 新手势语义空间已拥挤（fist/palm/pinch/chord 互相谦让），无「手势注册表」，每加一个都要全链扫冲突 |
| **(b) 新增和弦指令** | `fingerChords.js:35-43 CHORD_VOCAB` **1 行**；`AiLabVisionTab.tsx` CAPS(+12)；消费方绑定（MiniGamesView.tsx:828 的 `cmd.startsWith('chord:')` 默认丢弃分支或 VisionAssistant.tsx:80-109）；`chords.test.mjs`(+8) | ~4-5 文件 / 40 行 | 部分（词表键 = pattern 字符串，拼错静默无效，但有测试模式可循） | 🟢 能力层设计好；「预留→消费」一步仍要动消费方 |
| **(c) 新增消费入口「手势控灯」**（挥手切灯效/捏合调亮度——最大商业场景） | 照 VisionAssistant 模式：新 App 级组件 ~200 行（useVisionInput + window bus 订阅 + localStorage + 生命周期 effect）；`App.tsx` 挂载 + 透传 `selectEffect`/亮度 props（App.tsx:199 已有 selectEffect 回调可复用）；i18n/styles/tests。**前置结构债**：#4 生命周期冲突（AI 实验室开着体检时控灯入口一 unmount 就全杀）、#5 组合语义再复刻一份、事件无路由（全局 window bus，4 个消费者互相听见） | ~6-8 文件 / 300+ 行 | **无** | 🔴 现状直连=再复制一份胶水并放大 #4/#5；**先做 R3(会话管理器)+R4(手势原语层)后降为 🟢**（届时 ≈1 组件 + 1 订阅声明） |
| **(d) 新增语言（引擎 i18n 化）** | `session.js` 文案外置：STATE_LABELS(54-59)/CAL_STEPS(48-52)/_gate·_finishStep 15 条(198-306)/label() 格式串(101-107) → cfg 注入 catalog（~120 行改造）；`AiLabVisionTab.tsx:21 Bi` 类型扩 lang + 24×3 字段迁移；`MiniGamesView.tsx:2120-2125` label 兜底（引擎中文原样上屏路径）改走 catalog；i18n/index.tsx 新语言表 | ~4 文件 / 120 行 + 翻译量 | TS 对 Bi 缺键有保护；引擎侧无 | 🟡 R131.6 留的债有清晰偿路径（catalog 注入与 storage 注入同构，session.js:45 已有先例），但必须动引擎 |
| **(e1) 新增灵敏度档位** | `pipeline.js:17-21 PIPELINE_SENSITIVITY`(+1)；`useVisionInput.ts:39 SENSITIVITY_CONFIRM_MS`(+1) + VisionSensitivity 联合(+1)；`MiniGamesView.tsx:2380` 三档循环三元(硬编码)；`AiLabVisionTab.tsx:598-603` select option；i18n ×2 | 6 文件 / 各 2-6 行 | **TS 联合类型可挡**（唯一有保护的场景） | 🟡 霰弹但每点极小；三档循环硬编码是坏味道 |
| **(e2) 新增校准步骤** | `session.js:48-52 CAL_STEPS` + `cfg.calSteps` + `_finishStep`(209-283) 新增门禁分支；`VisionBanner.tsx:49` **N/3 步号硬编码三元**（加第 4 步必错）；i18n hint 键；session.test.mjs | ~5 文件 / 60 行 | 无 | 🟡→🔴 VisionBanner 的 1/2/3 三元是隐性断言，需顺手改为 CAL_STEPS.length |
| **(f) 替换 MediaPipe 后端** | `pipeline.js` **零改动**（landmarker 注入式，pipeline.test.mjs 已用假 landmarker 驱动——设计正确）；锁点=`visionHostMain.js:38-65 loadLandmarkers`（28 行，HandLandmarker/FaceLandmarker API + GPU/CPU 回退）+ `useVisionInput.ts:192-195` URL 构造 + `mediaProtocol.ts` MIME + models 资产。**隐性锁 = 21 点位数据拓扑**：handGeometry(gesture_engine.js:36-44)/fingerStates(fingerChords.js:21-33)/HAND_BONES(VisionPad.tsx:27-34)/handOpenness 全按 MediaPipe 21 点约定，换后端若拓扑不同则引擎层全动 | API 面 3 文件 / ~60 行；拓扑面视后端 | 无 | 🟡 API 可换（注入边界已备）；数据拓扑是真实锁——选型时应要求 21 点兼容或写适配层 |
| **(g) 视觉设置持久化系统级化** | 6 键（`useVisionInput.ts:16-19` ×4、`VisionAssistant.tsx:16`、`MiniGamesView.tsx:266-270`）迁移 systemSettingsStore：shared/ipc.ts + preload 白名单 + main handler + `hooks/domains/useSettingsMirror` + 迁移 shim（旧键读一次即迁） | ~5-6 文件 / 120 行 | TS + IPC 联合类型全程有保护 | 🟡 仓内有完整先例（R145 AWS 凭证同路径），纯工作量 |

**三入口调用面重复度**（脚本实测）：三处 `useVisionInput()` + 三处 `window.addEventListener('vision-input')` + 各自 enable/disable/recalibrate 调用（MiniGamesView disable×4 / VisionAssistant×2 / AiLab×1）+ 各自生命周期 effect。重复的不是 init 细节（hook 已收口），而是**总线订阅 + 组合语义 + 生命周期策略**这三件每个入口重写一遍——这正是 (c) 的成本来源。

---

## 5. 横切一致性

### 5.1 错误处理
- 引擎层：不抛错、以事件流表达（releaseAll/onLost 模式）——**与引擎层范式一致且优于平均**。
- 宿主/消费层：`visionHostMain.js:152-155` catch→post 'error' 一次后**静默**；hook `start()` reject 后三处 `.catch(() => undefined)`（VisionAssistant.tsx:66、MiniGamesView.tsx:2351、AiLabVisionTab.tsx:394——AiLab 的 catch 有注释「camera denied — the state chip tells the story」，但状态芯片并不解释原因）。全仓 renderer 共 9 处 console.*，main 有 shared/logger.ts 文件日志——视觉栈两侧都没接。对比 main 进程 IPC handler 的错误分类范式（如 aiTestConnection auth 分类），视觉栈缺一个「错误→用户可读原因」的映射层。

### 5.2 日志
0 接入（grep 实测）。60fps 推理进程崩溃/降级 CPU delegate/相机协商失败这些商业支持场景的关键事件，无任何留痕（delegate 有 stats 直读算部分补偿）。

### 5.3 事件命名/魔法字符串
- BroadcastChannel 名 `'rgbbox-vision'` 在 hook(96)/visionHostMain(20) 两处字面量 + architecture.md 记载；18 种消息类型两端字符串（§1#2）。对照全仓约定：IPC 通道全部走 `shared/ipc.ts` `as const` + 联合类型——**视觉栈的消息协议是唯一不经契约层的重要通道**（BroadcastChannel 本不需进 ipc.ts，但类型与常量应共享）。
- window CustomEvent `'vision-input'` 4 处字面量；伪键前缀 `chord:` 3 处解析。

### 5.4 双测试体系
tests/vision/*.mjs（node:test→vitest 机械替换，保留 node:assert；node env）与 tests/renderer/*.tsx（happy-dom）并存。维护成本可接受（vitest include 已收编 .mjs，vitest.config.ts:5），真正的代价是**覆盖率体系看不见 .mjs 所测的 1,770 行引擎**——test exists but coverage says 0%，层阈值（vitest.config.ts:66-83）永久绕过这批代码。

---

## 6. 与全仓约定的张力清单（CLAUDE.md 逐条对照）

| CLAUDE.md 约定 | 视觉栈现状 | 豁免合理性评估 |
|---|---|---|
| engine 层纯 TS，无 DOM/Electron 依赖 | 纯逻辑✅ 但 **.js 非 TS**；无 DOM✅ | 无 DOM 兑现；「纯 TS」豁免的历史理由（R134 整文件同步上游）在 R136 重写后**已消失**——pipeline/fingerChords/cursor 本就是 RGBBox 原创（R136/R142 注释自证），却仍按移植格式写。**建议收编**（新代码一律 TS，存量按 R1 重写类型边界后再定） |
| IPC 通道统一 shared/ipc.ts（as const + 联合） | visionHostOpen/Close ✅ 已进 ipc.ts:123-124；BroadcastChannel 消息 18 种 ❌ 无契约 | 半合规。窗口生命周期走了正道；数据协议应补一个 `shared/visionProtocol.ts`（两端 import 同一 const + 类型） |
| renderer 不直连 electron | ✅ 全经 preload `window.rgbbox.visionHostOpen/Close` | 合规，无豁免 |
| i18n zh+en | UI chrome ✅（games.vision.* ~50 键 ×2 + ai.lab.vision.* 28 键）；引擎内中文 ❌（session.js 360 汉字）；CAPS 双语字面量 ❌（绕开字典，R144.3 自documented） | R131.6「首版不 i18n 化」当时合理（上游同步期），现已过期——见 §4(d) 路径 |
| 帧数据走 ref 不走 state | ✅ 范式模范生：frameRef 每帧写、pad/cursor 自持 rAF 读、label 4Hz 节流、handSeen 滞回（R138） | **值得全仓推广的实践** |
| 覆盖率门槛（R11.4 分层阈值） | vision/** + visionHostMain **不在 include** | R131.5 豁免。引擎有 73 用例行为覆盖，但门槛盲区=回归无红线。建议至少把 vision/*.js 纳入 include（现有用例已能撑起数字） |
| 单 PRD/R-N 流程 | ✅ 8 轮迭代全部有 R-N + 验收点 + 证据 | 流程合规是本栈最突出的优点 |

---

## 7. 测试体系与文档漂移

### 7.1 tests/vision 9 文件逐个（73 用例，R131 时 36 → 现 73，+103%）

| 文件 | 用例数 | 测什么 |
|---|---|---|
| session.test.mjs | 19 | 三步向导全流程/逐步参数推导/质量门扩展-重试/丢手宽限与重校准/pause/forceReady/profile 往返/自适应表情降频/requireFace 正反/ringCenter 快照 |
| engines.test.mjs | 17 | handGeometry 尺度不变/8 向映射/方向环滞回三件套/pinch 抖动-冷却/丢手释放/表情中立校准/OneEuro/Median3/低质帧冻结/漂移自愈不误伤保持 |
| dualhand.test.mjs | 9 | 双手分工/R149 单手提升/swapHands/GapEngine 滞回/OpenPalmHold/handOpenness |
| chords.test.mjs | 8 | 词表逐一释放恰发一次/中立形零发/pinch 形无冲突/瞬态不发/加宽无误发（R143 回归）/**Monte Carlo ≥97%**/文本模式正反 |
| pipeline.test.mjs | 6 | 镜像开合同一原始流方向相反（R136 决定性证明）/灵敏度映射/sport 即发/profile-save 恰一次/合成闭环 |
| prediction.test.mjs | 4 | geomPredicted 领先/收敛/丢手清零/hostNowMs |
| reliability.test.mjs | 6 | **FP-0/PH-0/SK-0 不变式 + 延迟预算 P95≤200/250ms + 15fps 降级**——产品级可靠性设计 |
| pickHands.test.mjs | 3 | R149 左手提升/右手不变/主手可换 |
| fixtures.test.mjs | 1 | 3 份实拍序列回放 |

加 renderer 侧 vision 相关 ≈38（hook 12 + AiLab 13 + Assistant 3 + MiniGames ~10）→ 视觉栈测试合计 **≈111 用例**。

### 7.2 高风险零覆盖点
1. **visionHostMain.js 全文件 0 测试**（init 竞态/host-hello 重发/teardown/capture 切换/错误路径）——全靠打包 E2E 兜底且 E2E 脚本不在日常门禁。
2. **多消费方并发生命周期**：无任何「两个 hook 同时活着」的测试（#4 的先离开者杀全场无回归网）。
3. **disable 竞态**：disable() 与 in-flight start() 的交错（channelRef 置 null 与 ready resolve 时序）无测试。
4. **空 landmark/短数组**：chords.update 有 `lm.length < 21` 守卫（fingerChords.js:113），但 handGeometry/fingerStates 对短数组无守卫——上游约定可信，防御为零。
5. 体检台 24 能力有 13 组件用例 + 27 断言打包 E2E（R153.6）——**有自动化**，是三入口中覆盖最好的。

### 7.3 PRD 承诺 vs 兑现（抽样 5+1）
1. R134「pad 第三行采集 p95/协商分辨率直读」→ R136 迁移后**断链未再验证**（§1#3）❌（PRD R136 证据只验了 fps 60 与位移闭环）。
2. R131.5「vision JS 不入覆盖率」→ 兑现且延续至今 ✅（豁免本身成为债）。
3. R131.6「首版不 i18n 化引擎文案」→ 兑现 ✅（债未偿，§4d）。
4. R144.2「最后离开者关宿主（文档化）」→ 实现为任一 disable 即关 ❌ 文档与代码相反。
5. R142-E5「和弦字符直插焦点输入框」→ `VisionAssistant.tsx:75-113` 事件监听 effect 依赖数组缺 `textMode`（deps=[vision.enabled, menuOpen, menuSel, onNavigate]），textMode 翻转后监听器闭包仍是旧值——**静态推断该路径失效**（组件测试 3 例均未覆盖文本模式；engine/hook 层测试覆盖的是 chordBuffer 而非此组件路径）⚠️ 待运行验证。
6. R153「9 卡常驻 + 5 组折叠 + 24 [data-cap]」→ AiLabVisionTab.tsx:225 BOARD_IDS 9 项 ✅ 兑现。

### 7.4 architecture.md vs 代码（核对 10 处）
| # | architecture.md | 代码 | 判 |
|---|---|---|---|
| 1 | L187-190 visionHost 隐藏进程 + pipeline | main/index.ts:1105-1134, visionHostMain.js | ✅ |
| 2 | L270 visionHostOpen/Close invoke | ipc.ts:123-124, index.ts:1110/1130 | ✅ |
| 3 | L283 rgbbox-vision 载荷「schema 未读，推断」 | 仍无 schema 文档（§1#2） | ⚠️ 诚实 TODO 未清 |
| 4 | L297 visionHost.html 永不显示 + backgroundThrottling:false | index.ts:1113/1119 | ✅ |
| 5 | L304 media://app 防 path traversal | mediaProtocol.ts（R131.4） | ✅ |
| 6 | 架构图 vp=pipeline | 真源是 pipeline ✅，但 vision_input.js 死代码未标注 | ⚠️ 遗漏 |
| 7 | 采集遥测相关描述（R134 语境） | acquire/cam 断链（§1#3） | ❌ 文档与 PRD 均未跟上 |
| 8 | §8.5 preload 分组含 vision host | preload 桥 ✅ | ✅ |
| 9 | README.md（双语产品概览） | **0 处**视觉/体感提及 | ⚠️ 产品级功能缺席于产品文档 |
| 10 | coverage 分层阈值文档语境（R163） | vision 层不存在于阈值表 | ⚠️ 与 §6 豁免同源 |

---

## 8. 值得保留的实践（重构时不可丢）

1. **synthetic.js + makeLandmarks + fixtures + mulberry32**：免摄像头全链路测试/打包 E2E 基建——(c) 商业场景的验收底座。
2. **reliability.test.mjs 的不变式测试**（SK-0 无卡键 / FP-0 / PH-0 / 延迟预算 P95 / 15fps 降级）：把「抗误触」写成可回归的合同，全仓独一份。
3. **三步校准 + 质量门 + 宽容扩展（_gate）**：先延长保留样本再重试的工业级设计（虽 UI 链路断，引擎侧是对的——修 #6 即可兑现）。
4. **pipeline 注入式 landmarker 加载器**：后端可替换性的全部希望所在。
5. **R136 独立渲染进程宿主 + BroadcastChannel + host-hello 竞态握手**：结构性解决主线程争抢（E2E 实证 game rAF 60fps），且败因考古（Worker 三连败）写入条款防止重蹈——最成功的一次推倒。
6. **帧数据 ref 化范式**（frameRef 每帧 / label 4Hz / handSeen 滞回 / pad·cursor 自持 rAF）：与 R147 全仓约定同源且执行最彻底。
7. **无 OS 输入注入边界**（每帧轮询写 refs）：安全边界清晰，商业化不留合规隐患。
8. **AiLabVisionTab 的 CAPS 目录**：24 能力双语目录事实上是唯一的「能力清单活文档」——i18n 化时应保留其「单一事实源」地位。

---

## 9. 演进路线图（按 ROI 排序；全部可逐 commit 渐进落地）

| # | 项 | 动机（对应问题） | 做法 | 量 | 风险 | 收益 |
|---|---|---|---|---|---|---|
| **R1** | 删死模块 + 协议契约化 | #1 #2 #7 | ①删 `vision_input.js`；②新 `src/shared/visionProtocol.ts`：消息类型 const + 载荷 interface（从 visionHostMain/useVisionInput 两端现有字面量提取）；③`vision_input.d.ts` 重写为 re-export 协议类型，VisionFrame 补 allHands/gapNorm/offHeld/stepIdx/faceBlend、删不实的 acquire/cam 或标记实现状态 | S（1 天） | 低（type-only 改动 + 删无引用文件；tsc 全程把门） | 编译期协议保护，消除双实现漂移源 |
| **R2** | 修采集遥测断链 + 校准反馈上屏 | #3 #6 | ①visionHostMain emit 时 `stats = pipeline.stats({acquire: this.acquireStats, cam: negotiated})` + startCamera 读 `track.getSettings()`；②hook 把 snapshot.status 并入发布（label 滞后则 status 优先）；③删 MiniGamesView.tsx:2120 永假判断；④补一条「经 FakeHost 全链 acquire 到达 pad 文案」测试 | S（0.5 天） | 低 | R134/R141 承诺复活，envCoach 三条建议真正生效，校准失败有可诊断反馈 |
| **R3** | VisionSessionManager（宿主会话单例 + 订阅路由） | #4 + (c) 前置 | 新 `hooks/vision/useVisionSession.ts`：模块级 refcount（acquire/release），消费方声明订阅谓词替代全局 window bus 盲听；现有 useVisionInput 退化为它的适配层（对外 API 不变，三入口零改动迁移） | M（2-3 天） | 中（生命周期语义变化需 E2E 回归：hub 关停/最小化/TD 暂停用例已存在） | 多入口共存正确性；(c) 接入成本从 🔴→🟢 |
| **R4** | 手势原语层进引擎 | #5 + (a)(c) | pipeline.js（或新 vision/primitives.js）内建 doublePinch/palmHold/fistClutch/fist 事件（阈值进 cfg），删 8 处客户端复刻；AiLab CAPS 的 match 谓词改订阅原语 | M（2 天） | 低（引擎层补 4 组单测，行为有既有用例可对照） | 手势语义单一事实源；新手势不再全链扫冲突 |
| **R5** | 引擎文案 catalog 注入（i18n 化） | #8 + (d) | session.js cfg 增 `messages`（默认中文表保持上游兼容），zh/en 表放 i18n 字典；AiLab `Bi` 扩 lang 键 | M（2 天） | 低（默认表=现值，纯增量） | 第三语言路径打通，360 汉字出引擎 |
| **R6** | 设置系统级化 | #9 + (g) | 6 个 localStorage 键迁 systemSettingsStore + useSettingsMirror + 一次性迁移 shim；vision 设置进设置页（主手/镜像/灵敏度/助手开关） | S-M（1-2 天） | 低（R145 同路径先例） | 商业产品设置可备份；快照污染根因之一消除（R153.6） |
| **R7** | 日志与错误映射 | #10 | 宿主 onStatus/错误经协议上抛 → hook 打 `console.info('[vision]',…)`（复用 R147 前缀惯例）+ 错误→用户文案映射（相机拒绝/模型失败/GPU 回退）；`.catch(()=>undefined)` 三处改为 setLabel(原因) | S（0.5 天） | 低 | 支持可诊断；摄像头失败不再是黑箱 |
| **R8** | visionHostMain 补测试 + 纳入覆盖率 | §7.2 | 把 onmessage 协议处理抽纯函数（handleHostMessage(pipeline, msg)）→ node 直测 init 竞态/teardown/capture；coverage include 加 `src/renderer/src/vision/**` | M（1-2 天） | 低 | 179 行 0 测试胶水进门禁；引擎回归有红线 |
| **R9** | （可选，最后）引擎 TS 化 | §6 | 仅新代码强制 TS；存量 .js 待 R1 类型边界稳固后逐文件迁移（cursor.ts 已示范） | L | 中 | 非阻塞项——保留 JS + 强 d.ts 亦为可接受终态（上游同步已停，理由只剩惯性） |

**「最快把玩具变产品」的第一周**：R1 + R2 + R7（合计 ~2 天，全是边界修复，零行为设计）→ 立即获得：可契约的协议、可见的采集/校准诊断、可上报的错误。第二周 R3 + R4 后，手势控灯（(c)）变成「一个组件 + 一份订阅声明」的 🟢 操作——那才是这套栈的商业化主线该有的接入成本。

---

## 10. 未验证项与局限

1. **未运行任何测试/构建/应用**（按约束）：「73+38≈111 用例存在且结构覆盖如 §7.1 所述」为静态统计；「1511 全量用例」引自主审实测（2026-10-09），本报告未复跑。
2. **两处 stale-closure 为静态阅读结论，未经运行验证**：①VisionAssistant.tsx:75-113 textMode 缺依赖（§7.3-5）；②useVisionInput.ts:164-239 `start` 闭包捕获 `primaryHand`（:208）但 deps（:239）未含之——同会话先切主手再 enable 时 init cfg 可能携带旧值（有 localStorage 重读兜底，影响限单次 init）。两者均需真机/组件测试证实，建议各补一条用例（红→绿）再修。
3. **acquire/cam 断链**为静态数据流追踪结论（visionHostMain.js:67-73/103-108 ↔ pipeline.js:207-217 ↔ 三个消费点），有旁证（FakeHost 测试在消费端注入 stats.acquire 而非宿主端产出），但未运行 E2E 实证 pad 第三行为空。
4. PRD/文档结论依赖其自述的「实施证据」（如 E2E 21/21、26/26、27/27 PASS）——这些证据当时的 out/ 产物与当前 HEAD 的对应关系未验证。
5. 真机行为（延迟体感、相机协商、GPU/CPU 回退频率、多消费方同开实况）超出静态评审范围；用户数据目录 `C:\Users\tjf\AppData\Roaming\RGBBox` 未检视（本报告不需要）。
6. 行数/圈复杂度由脚本粗算（if/loop 计数非标准 cyclomatic）；MiniGamesView 中「vision 相关 164 行」按行提及统计，含注释，仅供量级参考。
