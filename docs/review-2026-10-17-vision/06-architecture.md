# RGBBox 体感输入子系统 — 软件工程与商业级成熟度评审（06 架构篇）

> 评审基线：main @ `62d87d6`（2026-10-17，含 R305）。评审基准文档 `docs/architecture-vision.md` @ `8ac1490`。
> 方法：代码通读 + git 量化 + grep 核证。只读仓库，未构建/未跑测试（引用的测试数字均标注来源）。
> 置信度标注：【高】= 逐行读过或 grep 全量命中；【中】= 抽样核读；【低】= 推断。

---

## 0. 摘要

**架构健康度 8/10；商业流程成熟度 6.5/10。**

对核心问题「是否符合商业用途的设计流程」的直接回答：**工程内核已达商业级，流程外围未闭环。** 该子系统在架构决策记录（11 条 ADR）、测试纪律（tests/vision 112 用例精确、双层互补）、错误恢复分级（classifyVisionError 六类 + GPU→CPU 重建 + 心跳自愈）、可观测性（p50/p95 埋点贯穿采集→推理→握手）、隐私设计（docs/PRIVACY.md + 本地处理声明 + 隐藏即关摄像头）上达到甚至超过常见商业桌面软件水准——这些实践有 R-N 条款、提交根因链和测试证据三重锚定。差距集中在发布工程：CI 只有 typecheck+test 两档（六层发布门禁 `verify:release` 是本地手动命令）、无 CHANGELOG、无崩溃上报、无灰度/回滚通道、第三方许可 NOTICE 缺失、快照/通道协议无版本号。结论：**补齐外围（约 4 个 S + 3 个 M 工作量）即可宣称商业级流程；内核无需返工。**

### 分维度评分

| 维度 | 评分 | 一句话依据 |
|---|---|---|
| 结构与分层 | 9 | 隐藏宿主窗进程隔离 + 纯 JS 引擎岛 + 薄壳 128 行 |
| 可测试性 | 8.5 | 全注入缝（loader/相机/定时器/时钟）；node 全量可测 |
| 扩展性 | 8 | 七条走查五绿两黄；MediaPipe vendor 固化爆炸半径极小 |
| 横切一致性 | 7.5 | 码表化错误/消息；dist2d 双定义 + 魔数跨文件复制 |
| 测试体系 | 8.5 | 112 精确 + 蒙特卡洛 replay + 双端互补；缺真机自动化 |
| 文档同步 | 8 | 基准文档高度准确；§12 自标未读项诚实；3 处实质漂移 |
| 构建与发布 | 6 | CI 两档；六层门禁手动；无 CHANGELOG/崩溃上报/回滚 |
| 合规与可观测 | 7 | PRIVACY.md 亮点；缺 NOTICE/无障碍声明 |

### Top 10 结构性问题

1. **发布门禁与 CI 脱节**：`scripts/verify-release.mjs` 六层（L0 类型/L1 全测/L2 构建/L3 视觉快照/L4 冒烟×2/L5 性能）存在且语义严谨（首败即停、exit code 三档），但 CI（`.github/workflows/ci.yml`）只跑 L0+L1——L2-L5 全靠开发者本机自觉。【高】
2. **vision_input.d.ts 合同漂移**：`VisionInput` 类/`VisionInputOptions`/`DEFAULT_CONFIG` 声明指向 R234 已拆除的运行时模块（死声明）；`VisionFrame.pinch` 字段无任何生产者（grep 全量确认），唯一消费者 `AiLabVisionTab.tsx:352` 的 fallback 永远 null；`allHands/faceBlend/gapNorm/offHeld` 四个实际快照字段（`session.js:668-675` 生产）未声明，消费方被迫自定义接口绕过。【高】
3. **gestureActions.js 孤儿模块**：R254 建的 48 格手势×场景决策矩阵 + 冲突校验器，生产代码零消费者（仅 `tests/vision/gestureActions.test.mjs`）；T17 宏系统至今未立项，属投机性地基。【高】
4. **几何代码重复**：`dist2d` 双定义（`gesture_engine.js:24` 导出 vs `fingerChords.js:18` 本地重定义）；`fingerStates`（fingerChords.js:21，1.08/1.15 系数）与 `handOpenness`（gesture_engine.js:331，无系数）是同一「tip-vs-PIP 距腕比」几何的两份实现。【高】
5. **魔数跨文件手工同步**：`VisionPad.tsx:24-25` 复制 DirectionRing 的 GAIN_X=1.4/GAIN_Y=1.6，注释自认 "keep in sync with gesture_engine.js"——无测试锁，改引擎增益 pad 显示即静默失真。【高】
6. **session.js 700 行多职责**：六个职责簇（见 §1 度量）——非 God object（无 DOM/传输/模型混杂，注释密度高、R-N 全锚定），但已达单文件舒适上限，校准向导可独立成模块。【中】
7. **通道协议无版本号**：`hostProtocol.js` 20 消息类型冻结但无 `protoVersion` 字段；宿主窗与主窗口同包同版本部署下无实害，一旦引入热更新/多窗口异版即成雷。【高】
8. **相机档位三套并存、文档只写两种**：init 640×480（`useVisionInput.ts:340`）、capture 低档 640×360（`:511`）、精修 960×540；hostMessenger 默认 cameraMode 640×360（`:58`）。architecture-vision.md §2/§10 只记载 480/540 两档。【高】
9. **.js 岛无 checkJs**：tsconfig 无 allowJs/checkJs（grep 确认零配置）；d.ts 桥仅覆盖 3/11 个 .js 文件（vision_input/hostProtocol/fingerChords），其余 8 个引擎文件对 TS 完全不可见，重构靠 vitest 兜底。【高】
10. **空 catch 23 处**：全部带原因注释（如 `/* already broken */`）且多属「清理路径吞二次异常」的合理设计，但 onboarding.ts 的 localStorage 失败无任何遥测——首次漏斗数据静默丢失。【中】

---

## 1. 结构度量

### 1.1 行数分布（实测 wc -l）

| 层 | 文件 | 行数 | 角色 |
|---|---|---|---|
| 引擎岛 | session.js | 700 | 会话状态机 + 校准 + profile + 快照 |
| 引擎岛 | gesture_engine.js | 454 | DirectionRing/PinchSwitch/OffHand/Gap |
| 接入层 | useVisionInput.ts | 561 | 通道生命周期 + 看门狗 + 发布节流 |
| 编排 | hostMessenger.js | 320 | 会话编排（注入式） |
| 引擎岛 | pipeline.js | 257 | 帧循环 + 预测 + 和弦注入 + 统计 |
| 消费 | AiLabVisionTab.tsx | 628 | 24 能力体检台 |
| 消费 | VisionAssistant.tsx | 346 | 全局手势助手 |
| 消费 | VisionOnboarding.tsx | 343 | 首用向导 |
| 消费 | VisionPad.tsx | 338 | 画布叠加层 |
| 域 | useGestureLightingDomain.ts | 239 | 灯效环 v2 |
| 引擎岛 | fingerChords.js | 173 | 和弦引擎 |
| 壳 | visionHostMain.js | 128 | DOM/electron 胶水（薄壳） |
| 引擎岛 | 其余 8 文件 | cursor 139 / face 105 / synthetic 92 / one_euro 87 / onboarding 83 / gestureActions 60 / latency 44 / envCoach 33 | |
| 合计 | 源码 | **~6,000**（引擎岛 3,068 + 消费/接入 2,927） | 另 tests/vision 2,539 |

### 1.2 session.js 职责簇（是否 God object？）

实测六个簇：① 配置/码表默认值（18-102）② 生命周期 start/stop/pause/recalibrate/forceReady（198-251）③ 三步校准 + 质量门禁 + extend/retry（253-406）④ profile 应用/持久化（408-443）⑤ 每帧状态机分发 + 主副手分配（445-649）⑥ 快照组装（651-687）。
**判定：中大型但内聚**——无越界职责（DOM/传输/模型加载全在外层），每簇有独立注释块与 R-N 锚定，22% 注释密度。700 行里码表默认值占 30 行、可迁出。真正的拆分候选是校准向导（~150 行，状态自包含）。【高】

### 1.3 hostMessenger.js 编排职责清单（320 行实测）

init 编排（重复 init 回 ready / R305 face 原地升级 / 20s 超时）、consumerId 引用计数（acquire/release/stop）、rVFC 帧循环（maxFps 跳帧 + 采集延迟 p50/p95 埋点 + 错误升级链：连续 8 次→GPU→CPU 重建→仍败→干净关停）、5s 心跳、capture 模式切换（保 active + 失败回滚）、USB 拔出/devicechange（R239）、消息分派 switch。注入缝 9 个：post/pipelineApi/loadLandmarkers/startCamera/teardown/now/scheduleInterval/clearTimer/scheduleTimeout——**完备**，tests/vision/hostSession.test.mjs 19 用例全走 fake。【高】

### 1.4 .js vs .ts 混用

vision/ 目录 11 个 .js（3,068 行）+ 4 个 .ts（cursor/envCoach/onboarding/latency 旁）+ 3 个 .d.ts 桥。为何 .js：引擎岛是 VMosue 上游移植 + node 直跑单测（vitest 默认 node 环境），tsconfig.web 无 allowJs。d.ts 覆盖 3/11（vision_input 已死声明、hostProtocol 同步完好、fingerChords 14 行最小面）。**风险**：引擎 .js 改名/改签名时 TS 编译器不设防，只靠 112 用例兜底。【高】

### 1.5 重复代码扫描

- `dist2d` ×2（见 Top10-4）。
- `fingerStates` vs `handOpenness`：同为 tip-vs-PIP 距腕判定，系数不同（1.08×1.15 vs 1.0），语义有别（和弦判读 vs 张掌计数）——**共享一个带系数参数的助手即可收敛**。
- AiLab 自定义 `BusEvent`（AiLabVisionTab.tsx:26）与 d.ts `VisionEvent` 高度重叠（d.ts 其实已含 offhand/hands）。
- 键归一逻辑（useVisionInput.ts:238-241）与 MiniGamesView.normalizeKey 的等价性靠注释约定（"same names as MiniGamesView.normalizeKey"），无共享纯函数。【高】

---

## 2. 分层与可测试性

- **引擎层零 DOM/Electron：属实**。grep 10 个引擎文件（session/pipeline/gesture_engine/fingerChords/face_engine/one_euro/latency/synthetic/gestureActions/hostMessenger）中 `document.|window.|navigator.|localStorage|BroadcastChannel|getUserMedia`：仅命中注释与 storage 注入接口（session.js:48 `storage:null` 可选注入）。ADR-011 成立。【高】
- **注入缝完备性**：loader 注入（pipeline 构造 deps.loadLandmarkers）、相机注入（startCamera(mode)）、teardown 注入、定时器/时钟四缝（hostMessenger deps）、storage 注入（session cfg）。全齐——这是 112 用例能跑 node 的根基。【高】
- **d.ts 合同 vs 实际 snapshot 字段核对**（抽 12 字段）：state/label/status/statusKey/statusParams/ringCenter/stepId/stepProgress/score/geom/geomPredicted/pickedLandmarks/profile/provisionalCenter/hostNowMs/chordBuffer/chordPreview/stats —— 均一致；**不一致 5 项**：`pinch`（声明无生产）、`allHands`/`faceBlend`/`gapNorm`/`offHeld`（生产未声明）+ 整个 `VisionInput` 类块死声明。即 19 个核对字段中 14 个吻合、5 个漂移。【高】
- **覆盖矩阵**（tests/vision 15 文件 + tests/renderer）：
  - 有直接测试：session(23)、hostSession(19)、engines(18, 含 one_euro)、chords(9)、dualhand(9)、pipeline(7)、reliability(6)、hostProtocol(5)、prediction(4)、gestureActions(4)、pickHands(3)、replay(2)、confusion/landmarkRobustness/fixtures(蒙特卡洛/健壮性)、cursor.ts、envCoach.ts、onboarding（VisionOnboarding.test.tsx）、visionErrors、useVisionInput（FakeHost）、useGestureLightingDomain、AiLabVisionTab、VisionAssistant、VisionBanner、VisionLightControl。
  - **零直接测试**：synthetic.js（被 chords/pipeline 间接驱动）、latency.js（间接）、visionHostMain.js 薄壳（DOM 胶水，靠 E2E）、envCoach 的消费端 VisionBanner 有测试。
  - 任务清单猜测的「envCoach? cursor? onboarding? 零覆盖」**均不成立**——三者都有专项测试。【高】
- **fake 漂移风险**：useVisionInput.test 的 FakeHost 只实现「init→ready + 脚本消息」，与真实 hostMessenger 的 20 消息语义（超时/升级/心跳）天然不同——但 hostSession.test.mjs 19 用例测真编排，双层互补设计已承认并覆盖该风险（R305 修复即两file同加测试）。残余风险：两层之间的**协议拼装**（真实 hostMessenger 发的消息形状 vs FakeHost 发的形状）无合同测试锁（hostProtocol.test 键列表锁了一部分）。【中】

---

## 3. 扩展性走查（逐条实测）

| # | 场景 | 需改动文件（实测锚点） | 估计 | 评级 |
|---|---|---|---|---|
| a | **新增一个手势能力**（参照 R305 实测：8 文件 +128/-3 行） | 引擎（fingerChords CHORD_VOCAB +1 行 或 hostMessenger 语义）+ useVisionInput（如需 opts）+ AiLabVisionTab CAPS +1 行 + hostProtocol USER_VOCAB（若入核心词汇）+ i18n + 测试（tests/vision + tests/renderer）+ E2E 脚本断言 | ~120 行/6-8 文件 | 🟢-🟡 词汇表驱动，CAPS/USER_VOCAB 皆是数据行；但「引擎→体检台→i18n→测试」四点缺一即静默断链（无 lint 锁词汇一致性） |
| b | **新增一个消费方**（如音乐页手势） | `useVisionInput()` 一行持有 + window 'vision-input' 订阅 + frameRef/heldRef/queueRef 读取（VisionAssistant 204 行为范本：事件订阅 + ref 轮询 + 卸载 disable）；refcount/让位规则已内建（R228 acquire/release + games 让位约定） | ~100-200 行/1-2 文件 | 🟢 接入成本被 hostMessenger 引用计数完全吸收；唯一坑是「games 视图让位」是约定不是机制（VisionAssistant.tsx:144-146 手写） |
| c | **新增一种表情绑定** | face_engine.js DEFAULT_BINDINGS +1 条（face_engine.js:6-18）+ AiLab CAPS 表 +1 行 + 测试。注意：`useVisionInput` init 的 sessionCfg **未传 faceBindings**（useVisionInput.ts:345-351）→ 走引擎默认表，无法运行时注入 | ~10 行/3 文件 | 🟢-🟡 数据行级；但配置注入缝（cfg.faceBindings 已存在却无人用）名存实亡，新绑定必须改引擎源码 |
| d | **换 MediaPipe 大版本** | 替换 `src/renderer/public/vendor/mediapipe/`（vision_bundle.js + 2 组 wasm）+ `visionHostMain.js:40-73` loadLandmarkers（API 面 34 行）+ `pipeline.js:149-169` detectForVideo 返回解析 + 模型 .task 文件 + fixture 重录 | ~100 行集中在 2 文件 | 🟢 vendor 固化把爆炸半径压到极小（不经过 npm 依赖链）；风险：vendor 目录**无版本标记文件**（无 VERSION/来源 URL 记录，grep scripts/download-models.mjs 不含 mediapipe）——升级时无从对账 |
| e | **新增一个运行时参数**（参照 sensitivity 全链实测） | UI select（AiLab 快调区范本 :615）+ hook setter（localStorage 持久化 + postMessage settings patch，useVisionInput.ts:514-518 范本）+ hostProtocol 无需改 + pipeline/session applySettings 已通用透传 | ~30 行/2 文件 | 🟢 settings patch 是逃生舱，引擎侧零改动 |
| f | **gestureActions 决策矩阵被谁消费** | 生产代码零消费者（grep 全仓：仅自身 + gestureActions.test.mjs）。R254 建为 T17 宏系统地基，T17 未立项 | — | 🔴 孤儿模块。48 格 + validateGestureSceneMap + 4 用例质量不差，但「closed action set」无消费者即无演进压力——六个月后会与真实词汇表漂移（GESTURES 6 词 vs 引擎实际产出事件 6 类**已不同名**：dir8/pinch/palm/chord-menu/chord-light/double-pinch vs direction/pinch/offhand/hands/chord/face） |
| g | **多语言新增**（如日语） | R235 后引擎发稳定码：i18n 补 `games.vision.engine.*` 34 键 + UI chrome 键。**引擎内残留中文实测 38 行非注释**：26 行 = DEFAULT_SESSION_MESSAGES 码表默认值（设计内：不注入 messages 即回退 zh，兼容锁有测试）；6 行 = USER_VOCAB 双语数据；3 行 = PIPELINE_SENSITIVITY label（**死字段**——grep 确认 label 无任何消费者，仅测试读 confirmMs）；AiLab CAPS ~72 条双语字面量（R144.3 显式决策：避免 i18n 字典 +72 键） | i18n 34+ 键 | 🟢 码表架构正确且 i18n zh/en 34 键**逐键核对无缺失**（实测 missing=[]）；新语言不动引擎。债在 CAPS 字面量（第三语言要改组件）与死 label 字段 |

---

## 4. 横切一致性

- **错误处理范式**：三层——引擎错误码表（R235 34 键）+ `classifyVisionError`（domain/visionErrors.ts，六类 denied/no-device/occupied/detached/timeout/generic 驱动恢复卡 CTA）+ 宿主错误升级链（status→error 分级：可恢复 status / 致命 error）。真实错误消息刻意不翻译透传（R227 决策）。范式统一。【高】
- **空 catch 分布**：23 处（hostMessenger 6 / useVisionInput 5 / onboarding 6 / session 2 / pipeline 1 / 其余散布）。逐条目检：全部属「清理路径二次异常」「私有模式 localStorage」「corrupt profile 回默认」类合理吞并，20/23 有注释。无「吞业务异常」型。唯一遥测缺口：onboarding 漏斗写失败静默。【高】
- **注释密度**：vision .js 岛 531/2384 行 = **22%**，且大量是「为什么」型（VMosue 结论、R-N 根因、单位约定）——质量高于平均水平。【高】
- **魔数集中度**：阈值集中于各引擎 cfg 默认对象（DirectionRing/PinchSwitch/FaceEngine/GapEngine 均可 cfg 覆盖）——好；例外：VisionPad GAIN 复制（Top10-5）、hostMessenger 错误升级 `errStreak >= 8` 硬编码、useVisionInput 心跳 5000/15000 常量带注释未集中。【中】
- **命名一致性**：术语三轨（vision / vision-input / 体感）在代码层一致（VISION_CHANNEL 'rgbbox-vision'、'vision-input' 总线、i18n games.vision.* + ai.lab.vision.*）；文档中英混排自然。事件 kind 六类 vs gestureActions GESTURES 六 id 不同名（见 3f）是唯一系统性命名断层。【中】

---

## 5. 构建与质量基建（商业流程核心）

| 门槛 | 现状（实测） | 商业级判定 |
|---|---|---|
| CI | `.github/workflows/ci.yml` 两 job：typecheck + 全量 test（ubuntu, node22, frozen-lockfile, push/PR main）。注释自述 R221→R222.2 演进（node20 曾全红）。另有 pages.yml | ✅ 存在（推翻「全仓无 CI」预设）；❌ 不含构建/快照/冒烟 |
| 发布门禁 | `scripts/verify-release.mjs` 六层 L0-L5，首败即停，exit 0/1/2/124 语义，30min 总超时；`yarn verify:release --full` 手动触发 | 设计 ✅ 商业级；**自动化 ❌**（未进 CI/未挂钩 dist 前强制） |
| 版本管理 | `predist:*`: `npm version patch --no-git-tag-version`（dist:win/mac/dir 每次自动 patch）；无 CHANGELOG、无 release notes 生成 | ❌ 单调 patch 无人为版本叙事 |
| 打包 | dist:win(zip x64)/dist:mac(dmg)/dist:dir；`dist-clean.mjs` 前置；`afterPack.mjs` 钩子；模型资产 electron-builder.files 排除 | ✅ 基本盘齐 |
| 依赖锁定 | yarn.lock 存在（258KB, 2026-10-15）；总依赖 35 个 | ✅ |
| 许可证 | 根 LICENSE（MIT）+ package.json license MIT；**无 THIRD-PARTY-NOTICES**（MediaPipe wasm Apache-2.0、@mkkellogg 0.4.7 等需随分发物声明） | ⚠️ 上架合规缺口 |
| 符号/崩溃报告 | 无 sentry/bugsnag/crashReporter 配置（grep 零命中）；R305 类「用户报障+截图」是现行现场debug通道 | ❌ |
| 灰度/回滚 | 无渠道/降级机制（GitHub Release 单渠道）；models 走 releases tag 分发 | ❌（桌面单机产品影响中低） |
| 数据迁移 | profile 键 `vgi-profile-v2` 版本后缀 + loadProfile 容错回默认 = 轻量向后兼容；协议无版本号（Top10-7） | ⚠️ 半套 |
| 隐私合规 | `docs/PRIVACY.md`（32 行）+ `settings.privacy.note`（zh/en）「画面不出本机、零上传零落盘、关即停」+ 最小化即停（R227.5 主进程权威可见性） | ✅ **超出预期的亮点** |
| 无障碍 | vision 组件 aria 基础在（radial role=dialog+aria-label、按钮 aria-label、光标画布 aria-hidden）；无手势替代路径声明、对比度未专项审计 | ⚠️ 基础档 |

---

## 6. 测试体系

- **112 用例精确成立**：tests/vision 15 文件逐文件 `it/test` 行首计数合计 = 112（9+1+9+18+1+4+5+19+1+3+7+4+6+2+23），与 architecture-vision.md §1/ADR-011 声称一致。【高】
- **分层**：纯逻辑（engines/chords/dualhand/pickHands/prediction）、集成（session/pipeline/hostSession——真编排+fake DOM 缝）、蒙特卡洛（confusion/landmarkRobustness + variantFactory/replay-harness + fixtures-replay 回放语料）、协议锁（hostProtocol 键列表 ↔ session 码表 ↔ 恒等表三向一致）、兼容锁（session 不传 messages 字节等价）。
- **renderer 侧**：useVisionInput（FakeHost 扮演宿主）、组件测试（AiLabVisionTab/VisionAssistant/VisionOnboarding/VisionBanner/VisionLightControl）、cursor/envCoach 纯函数测试。fake 漂移见 §2。
- **E2E**：`verify-r131-vision.mjs`（合成管线过游戏）、`verify-r144-vision-lab.mjs`（27/27，R305 自纠 tab 数）、`r246/r247-vision-*walkthrough`（CDP 走查）、smoke-app/smoke-games、e2e:journeys、ui:snapshot 视觉基线。**缝机制**：`__rgbboxVision`/`__rgbboxVisionLab`/`__rgbboxAssistant.startSynthetic()` 免摄像头驱动真实管线——成熟设计。
- **缺口**：① 无真机摄像头自动化（synthetic 不覆盖传感器协商/曝光/USB 层——PRD 各 R-N 均自认「真机验收留用户」）；② 无性能回归 CI 档（L5 perf 仅 --full）；③ AI Lab CAPS 24 行能力无「每行至少一次 E2E 点亮」断言（部分行有）。
- 引用证据（不自行复跑）：R305 提交信息「全量 201 files / 1854 passed / 0 失败；R144.7 E2E 27/27 PASS」（2026-10-17）；PRD R235.7「162 files / 1550 passed」；R249「168 files / 1581 passed」。

---

## 7. 文档债：architecture-vision.md 逐节核对

| 节 | 核对结论 |
|---|---|
| §1 Overview/112 项 | ✅ 112 精确吻合（实测） |
| §2 相机档位 | ⚠️ **漂移**：写「640×480@60（游戏）/960×540（精修）」；实际 init=640×480、capture 低档=640×360（useVisionInput.ts:511）、hostMessenger 默认 cameraMode=640×360（:58）——360 档存在且是切换回退档，文档未载 |
| §3/§4 进程与分层图 | ✅ 与代码结构一致（逐文件核对） |
| §5 职责表 | ✅ 抽查 6 行全部属实（含 R305 新增 capture 保 active/face 升级两格） |
| §8 状态机 | ✅ 与 session.js 逐转移核对一致（含 paused 的 off-hand resume、R305 forceReady 路径） |
| §9 接口表 | ✅ 13 HOST_MSG + 8 HOST_REPLY 与 hostProtocol.js/hook 逐条一致；⚠️ 补充：snapshot 字段清单省略 allHands/faceBlend/gapNorm/offHeld（生产存在） |
| §11 ADR 11 条 | ✅ 全部与代码锚点吻合（ADR-011 零 DOM 实测成立） |
| §12 待确认项 6 条 | **本次全部核销 5 条**：① VisionCursor DOM 机制 = `document.elementFromPoint + closest('button,a[href],input,select,[role=button]')` hover/click（VisionCursor.tsx:79-88），推断标记可除；② useGestureLightingDomain 全文已读，ADJUST_HOLD_MS 600/双捏合 900ms/Y 轴映射与文档一致；③ pollVision 接线点确认（MiniGamesView.tsx:867-1060，命令映射未逐行——仍留）；④ visionHostMain 胶水全文已读，devicechange/onended 接线确认；⑤ one_euro（LowPass+OneEuroFilter 参数 2.5/0.5 在调用处）/latency（300 样本 p50/p95）/synthetic（相位感知）确认无意外；⑥ 真机 p95 依旧无法核实（维持） |
| PRD R-N 证据一致性 | ✅ R305 条款三处代码锚点（enable({face:true})+resumeActive @AiLabVisionTab:392-399；face 原地升级 @hostMessenger:160-178；capture 保 active @:259-279）逐条吻合；测试数引用与提交信息一致 |

---

## 8. 商业级差距总表

| # | 缺失 | 影响 | 补齐成本 |
|---|---|---|---|
| 1 | CI 缺 L2-L5（构建/快照/冒烟/性能） | 打包级回归靠人肉跑 verify:release | M（脚本已存在，接线即可；快照基线跨平台是主要工作量） |
| 2 | vision_input.d.ts 死声明 + 5 字段漂移 | TS 消费者假安全感；重构误判 | S（一次清理 + 单测锁字段清单） |
| 3 | 无 CHANGELOG/release notes | 用户与支持侧无法对版本 | S（conventional commits 已齐，加生成器即可） |
| 4 | 无崩溃上报/符号 | 现场故障黑盒，依赖用户截图 | M（最小方案：electron crashReporter 本地落盘+导出按钮） |
| 5 | 无第三方 NOTICE | 含 Apache-2.0 wasm 的分发物许可合规 | S（electron-builder extraFiles 附一份生成清单） |
| 6 | 通道/snapshot 协议无版本号 | 未来热更/多窗口异版即雷 | S-M（init 增 protoVersion + 不匹配报错） |
| 7 | gestureActions 孤儿 + gestureActions.GESTURES 与引擎事件名不同名 | 投机抽象腐化起点 | S（接第一消费方或显式冻结注释） |
| 8 | .js 岛无 checkJs/d.ts 覆盖 3/11 | 引擎重构类型不设防 | M（checkJs 渐进开启，先 pipeline/session） |
| 9 | 真机摄像头自动化缺失 | 传感器层回归盲区（曝光/协商/USB） | L（本质难；缓解=真机冒烟 checklist + soak 脚本已有） |
| 10 | 无障碍未专项（对比度/手势替代路径声明） | 上架/无障碍审计风险 | S-M |

---

## 9. 值得保留的工程实践（商业级资产）

1. **R-N PRD 纪律 + 根因链提交**：R305 提交信息（① ② ③ ④ 根因 → 修复 → 证据）是可复制范本；每行关键代码有 R-N 锚定，决策可溯源。
2. **ADR 表带 Alternatives**：11 条 ADR 记录「为什么不用 Web Worker/帧计数/绝对映射」——防止未来重蹈已付费的坑。
3. **注入缝全覆盖**：hostMessenger 9 缝 + 引擎 loader/storage 注入 = 编排在 node 全量可测。
4. **码表注入式 i18n**（R235）：恒等表使引擎发稳定码、消费端按语言本地化、zh 默认值字节兼容锁有测试——引擎 i18n 的教科书解法。
5. **vendor 固化第三方 wasm**：MediaPipe 不进 npm 依赖链，大版本升级爆炸半径 ≤2 文件。
6. **E2E 合成管线缝**：`__rgbboxVision*` 免摄像头驱动真实管线，打包产物可验证。
7. **双端互补测试**：真编排（hostSession）+ FakeHost（客户端）分层承认并管理 fake 漂移。
8. **发布门禁六层首败即停 + exit code 语义**（只差 CI 接线）。
9. **隐私 by design**：主进程权威可见性推送关摄像头 + 明文本地处理声明。
10. **遥测贯穿**：采集年龄 p95（presentationTime）→ 推理 p95 → 握手心跳，体检台直接可视化给终端用户（多数商业软件都不给用户看这个）。

## 10. 演进路线图（按 ROI 排序，可逐 commit）

- **R1（S）CI 接 L2 构建**：ci.yml 增 build job——最快消除「打包靠人肉」。
- **R2（S）d.ts 清理**：删 VisionInput 死块、补 4 字段、删 pinch 死字段 + 测试锁快照字段清单（协议合同测试）。
- **R3（S）CHANGELOG + 第三方 NOTICE**。
- **R4（S）协议版本字段**：init/ready 带 protoVersion，不匹配显式报错。
- **R5（S）几何收敛**：dist2d 单源 + fingerStates/handOpenness 参数化合一 + VisionPad 改 import 引擎常量（附 drift 测试）。
- **R6（S）gestureActions 处置**：接一个真实消费方（如 radial 菜单场景裁剪）或冻结注释 + 事件名对齐。
- **R7（M）checkJs 渐进**：先 session/pipeline 两文件。
- **R8（M）崩溃上报最小闭环**：crashReporter 本地落盘 + 设置页导出。
- **R9（M，谨慎）session.js 拆校准向导**：仅在 R2/R7 落地（合同+类型保护）后做。
- **R10（L）真机冒烟 checklist 文档化**（soak/smoke-videos 脚本已有，补人工流程）。

## 11. 未验证项与局限

1. 未运行任何测试/构建（约束）；引用的通过数均来自提交信息与 PRD 证据，标注日期 2026-10-17。
2. MiniGamesView.pollVision 命令映射未逐行读（:867-1060 抽样）；五游戏各自映射细节未核。
3. VisionOnboarding.tsx/VisionLightControl.tsx/VisionBanner.tsx 未全文读（props + 依赖纯模块 + 测试存在性已核）。
4. 真机 GPU delegate p95、暗光表现、USB 拔插实测——代码路径已核，物理行为未验证（与文档 §12-⑥ 同）。
5. i18n en 侧译文质量未逐条审（键存在性已逐键核）。
6. `.claude/worktrees/` 下有三份旧 worktree 副本（不影响主树判定，建议清理）。
