# 体感输入子系统深度评审（多角色）— 2026-10-17

> **评审对象**：`docs/architecture-vision.md` 所述体感输入子系统及其实现（~6,000 行源码 + tests/vision 2,539 行）
> **基线**：main @ `62d87d6`（含 R305，v0.3.88）
> **用户核心问题**：「是否符合商业用途的设计流程」
> **附录**：`docs/review-2026-10-17-vision/`（06 架构 27KB / 08 产品 28KB 全文）

---

## 0. 一页结论

**直接回答：工程内核已达商业级，流程与产品外围未闭环。** 该子系统在架构决策记录（11 条 ADR 带 Alternatives）、测试纪律（112 用例精确 + 蒙特卡洛回放 + 双端互补）、错误恢复分级（六类分类 + GPU→CPU 重建 + 心跳自愈）、可观测性（采集→推理→握手全链 p95 埋点且对用户可见）、隐私设计（PRIVACY.md 五承诺 + 主进程权威可见性停流）五项上**达到或超过常见商业桌面软件水准**——且每项有 R-N 条款、根因链提交、测试证据三重锚定。差距集中在两处：**发布工程**（CI 仅 typecheck+test 两档，六层 verify:release 门禁未自动化；无 CHANGELOG/崩溃上报/第三方 NOTICE/协议版本号）与**产品化**（README 与产品页对体感零提及、宏系统停在孤儿矩阵、漏斗数据只埋不显）。

**因果链**：R227–R305 的 22+ 任务把 2026-10-09 上轮评审的「玩具 demo」五大差距修掉了四项 → 技术侧跨过商业门槛 → 但**商业化没有随之发生**（叙事零曝光、能力-用户接线断在最后一公里）→ 用户感知「功能全但没人知道、没法配置、没有质量证据」。

### 五维评分

| 维度 | 评分 | 一句话依据 |
|---|---|---|
| 稳定性 | 8.5/10 | 恢复分级+自愈+soak 门禁；无新崩溃（Crashpad 仅 10-11 旧档）；主审补位审计未发现崩溃级缺陷 |
| 流畅度 | 8/10 | 双侧预测（管线 50ms 前瞻+客户端积分重锚）设计正确；60fps 快照全量序列化与 60Hz hit-test 是两个未量化点（Likely 可接受） |
| 交互 | 7/10 | 6 词权威词汇+13.8s 向导收敛学习成本；但发现性是当前最大单点损失（三入口零门面曝光） |
| 工程质量 | 8/10 | 注释密度 22%、注入缝全覆盖、d.ts 合同 5 处漂移+死声明是唯一实质债 |
| 安全与边界 | 7.5/10 | contextIsolation+preload 白名单+media:// 白名单收口（R221.5）+隐私 by design；缺 CSP 与 E2E seam 生产门禁 |

### 最该先做的 10 件事（P0→P2）

1. **P0 产品叙事可见化**（S）：README/产品页/首启 hint 卡——所有后续投入的前提（08-C1）
2. **P0 CI 接 L2 构建档**（S）：脚本已存在，接线即消除「打包靠人肉」（06-R1）
3. **P0 d.ts 清理**（S）：删 VisionInput 死块/死 pinch 字段（注释谎称 "always present"）、补 4 真实字段+字段清单合同测试（06-R2）
4. **P1 CHANGELOG + 第三方 NOTICE**（S）：含 Apache-2.0 wasm 的分发物合规（06-R3）
5. **P1 协议版本字段**（S）：init/ready 带 protoVersion，防未来异版雷（06-R4）
6. **P1 手势宏编辑器 v1**（M）：48 格孤儿矩阵接上用户，灯效域改读矩阵删硬编码（08-C2，T17 遗愿）
7. **P1 质量面板+深度体检报告**（S-M）：funnel/延迟/召回外化，真机质量从口说到有据（08-C3/C4）
8. **P1 CSP + E2E seam 生产门禁**（S）：本报告安全节两条 Likely 加固
9. **P2 几何收敛**（S）：dist2d 单源、fingerStates/handOpenness 参数化、VisionPad 改 import 引擎常量（06-R5）
10. **P2 无障碍声明**（S）：最便宜的声誉资产（08-C12）

---

## 1. 证据与方法

### 1.1 派发与执行实况（如实记录）

| # | 角色 | 结果 |
|---|---|---|
| 01 | 崩溃取证 | **裁剪**（Crashpad 仅 2026-10-11 两份旧档，早于当前代码一周，无新崩溃可取） |
| 02 | UI 性能 | ❌ API 周额度 429 击杀（限额 2026-10-20 22:01 重置）→ **主审补位** |
| 03 | 并发后台 | ❌ 同上 → **主审补位** |
| 04 | UI 稳定性 | ❌ 同上 → **主审补位** |
| 05 | 安全边界 | ❌ 同上 → **主审补位** |
| 06 | 架构 | ✅ **完整交付**（报告落盘于被杀前） |
| 07 | 交互 UX | ❌ 同上 → **主审补位（并入交互维度评分，未单列章节）** |
| 08 | 产品 | ✅ **完整交付** |

**主审补位的方法与局限**：主审在本会话（R305 调查）中一手逐行通读了 hostMessenger/pipeline/session/gesture_engine/fingerChords/useVisionInput/AiLabVisionTab/VisionAssistant/cursor.ts/VisionCursor.tsx/face_engine 绑定/主进程宿主窗与 media:// handler；本轮补充核查了 ci.yml、vision_input.d.ts、CSP、空 catch 计数。补位章节（§3）为**单视角**，未经第二代理交叉验证，全部结论带置信度，实验类验证（微基准/并发交错复现）未执行。

### 1.2 置信度约定

Confirmed＝主审/代理亲自读到代码且经复核；Likely＝机制确凿、量级靠推导；Speculative＝推断未验证。

### 1.3 主审独立复核表（对两份交付的 Top 结论）

| 结论 | 来源 | 复核手段 | 判定 |
|---|---|---|---|
| README 对体感 0 提及、产品页 1 命中 | 08 | grep 全文；index.html 唯一命中行 2128 为 "Mitosis **Spindle**…cell di**visio**n" ——**子串假阳性** | ✅ 成立（零提及结论反而更干净） |
| GESTURE_SCENE_MAP 孤儿（生产零消费） | 06/08 | grep 全 src 排除自身：0 消费者，仅 gestureActions.test.mjs | ✅ 成立 |
| funnel 只埋不显 | 08 | readFunnel 仅 E2E 缝 `__rgbboxAssistant.funnel()`；bumpFunnel 仅向导内部 | ✅ 成立 |
| CI 仅 typecheck+test 两档 | 06 | 读 ci.yml 全文：2 jobs（ubuntu, node22, frozen-lockfile）；注释自认「snapshot/electron 档待 runner 预热后补(P2)」 | ✅ 成立 |
| VisionFrame.pinch 死字段 | 06 | d.ts:70-71 声明且注释称 "always present for the pad"；session `_snapshot`/pipeline/hostMessenger 三处生产者逐键核对**均无顶层 pinch**；唯一消费 AiLabVisionTab:352 `f?.pinch ?? null` 永远 null | ✅ 成立（且注释为虚假陈述，比 06 报告写的更糟） |
| VisionCursor DOM 机制 = elementFromPoint+closest | 06 §7 核销① | 读 VisionCursor.tsx:79-88 全文 | ✅ 成立 |
| dist2d 双定义 / VisionPad GAIN 复制 / 相机三档并存 | 06 Top10-4/5/8 | 主审本会话一手读过全部四处 | ✅ 成立 |
| tests/vision = 112 用例 | 06 | 主审 2026-10-17 实跑 `yarn test tests/vision/`：15 文件 112 passed | ✅ 成立 |
| media://local 曾零校验，R221.5 已白名单收口 | （主审补查） | 读 main/index.ts:1693-1715：isMediaPathAllowed 白名单（userData/Downloads/Music/Videos/播放清单登记路径）+403+日志 | ✅ 已加固属实 |

### 1.4 更正记录

- 08 报告「产品页 1 命中」的上下文经主审复核为子串假阳性（见上表）——结论不受影响，命中数应为 0。
- 06 报告空 catch 计 23 处；主审以 `catch {` 模式 grep 得 30 处（含 useVisionInput 8 vs 其 5）——口径差异（是否计嵌套/多行），方向一致：全部带原因注释、属清理路径合理吞并，无「吞业务异常」型。

---

## 2. 架构与商业流程（06 交付，主审已复核 Top 断言）

**架构健康度 8/10；商业流程成熟度 6.5/10**（06 摘要，主审认同）。

### 2.1 分维度评分（06 实测）

| 维度 | 分 | 依据 |
|---|---|---|
| 结构与分层 | 9 | 隐藏宿主窗进程隔离 + 纯 JS 引擎岛（grep 零 DOM/Electron 引用，ADR-011 实测成立）+ 薄壳 128 行 |
| 可测试性 | 8.5 | hostMessenger 9 注入缝 + loader/storage 注入 = 编排在 node 全量可测 |
| 扩展性 | 8 | 七条走查五绿两黄；MediaPipe vendor 固化把大版本升级爆炸半径压到 2 文件 |
| 横切一致性 | 7.5 | R235 码表化错误/消息是亮点；dist2d 双定义+魔数跨文件复制扣分 |
| 测试体系 | 8.5 | 纯逻辑/集成/蒙特卡洛/协议锁/兼容锁五层；缺口=真机自动化与性能 CI 档 |
| 文档同步 | 8 | architecture-vision.md 逐节核对 14/19 字段吻合；§12 待确认 6 条被 06 核销 5 条 |
| 构建与发布 | 6 | CI 两档；六层门禁手动；无 CHANGELOG/崩溃上报/回滚 |
| 合规与可观测 | 7 | PRIVACY.md 是亮点；缺 NOTICE/无障碍声明 |

### 2.2 Top 结构性问题（06 全文见附录；状态=主审复核）

| # | 问题 | 状态 |
|---|---|---|
| 1 | 发布门禁与 CI 脱节（L2-L5 全靠本机自觉） | ✅复核成立 |
| 2 | vision_input.d.ts 合同漂移：VisionInput 类死声明 + pinch 死字段（注释虚假）+ allHands/faceBlend/gapNorm/offHeld 四真字段未声明 | ✅复核成立 |
| 3 | gestureActions.js 孤儿（48 格矩阵零运行时消费，GESTURES 六 id 与引擎事件 kind 已不同名） | ✅复核成立 |
| 4 | 几何重复：dist2d ×2、fingerStates/handOpenness 同几何两实现 | ✅复核成立 |
| 5 | VisionPad GAIN_X/Y 手工复制引擎常量（注释自认 keep in sync，无 drift 测试） | ✅复核成立 |
| 6 | session.js 700 行六职责簇——内聚非 God object，校准向导（~150 行）是拆分候选 | 未逐簇复核（Likely） |
| 7 | 通道协议无 protoVersion（同包部署下无实害，热更/多窗口异版即雷） | ✅复核成立（hostProtocol 全文主审读过，无版本字段） |
| 8 | 相机档位三套并存（init 480 / capture 低档 360 / 精修 540），文档只载两档 | ✅复核成立（三处代码主审读过） |
| 9 | .js 岛无 checkJs，d.ts 桥覆盖 3/11 文件 | 未复核 tsconfig（Likely） |
| 10 | 空 catch 23-30 处（全部合理吞并带注释；onboarding 漏斗写失败无遥测是唯一缺口） | ✅复核成立（计数口径差异见 §1.4） |

### 2.3 商业级差距总表（06 §8 摘要）

| 缺失 | 影响 | 成本 |
|---|---|---|
| CI 缺 L2-L5 | 打包级回归靠人肉 | M |
| d.ts 死声明+5 字段漂移 | TS 消费者假安全感 | S |
| 无 CHANGELOG | 版本无叙事 | S |
| 无崩溃上报/符号 | 现场故障黑盒（现行通道=用户截图） | M |
| 无第三方 NOTICE | Apache-2.0 wasm 分发合规 | S |
| 协议无版本号 | 异版雷 | S-M |
| gestureActions 孤儿 | 投机抽象腐化起点 | S |
| checkJs 缺失 | 引擎重构类型不设防 | M |
| 真机自动化缺失 | 传感器层回归盲区 | L（本质难） |
| 无障碍未专项 | 上架审计风险 | S-M |

---

## 3. 主审补位：稳定性 / 并发 / UI 性能 / 安全（02/03/04/05）

> 单视角声明见 §1.1。发现按 U(延迟)/B(并发)/R(稳定性)/T(安全) 编号。

### 3.1 UI 延迟（02 补位）

**捏合确认全链路时间线**（代码常量推导，量级 Likely）：

| 阶段 | 现状（代码常量） | 估计耗时 |
|---|---|---|
| 相机帧龄 | presentationTime 差埋点（acquire p95 可视） | 5-30ms（MJPG@60） |
| rVFC→处理门 | `t - lastSend >= 1000/60 - 4` | ≤12.7ms |
| hand 推理 | adaptFaceRate 守卫目标 p95<22ms | 10-25ms（GPU） |
| Median3+PinchSwitch | confirmMs 60 + cooldown 150 | 60ms 确认窗 |
| BroadcastChannel→总线 | 小事件 structuredClone + dispatchEvent | <1ms |
| **合计（稳态确认延迟）** | | **~80-130ms** |

- **U-1（Likely）**：snapshot 每处理帧全量序列化（21×2 landmarks+stats+profile 引用），60fps 下是主窗口最大常驻消息成本。量级 KB 级/条，结构化克隆通常 <0.5ms——**未实测**，建议用 stats 面板加一条 BC 往返耗时埋点。
- **U-2（Likely）**：VisionCursor 每显示帧 `getBoundingClientRect`+`elementFromPoint`+`closest`（VisionCursor.tsx:60-82）——60Hz hit-test 可能强制布局。典型 sub-ms；量级未实测。
- **U-3（Confirmed 机制/Likely 量级）**：体检台 face:true 后 FaceLandmarker 以 faceEveryN（自适应 1→3）档在宿主窗推理；adaptFaceRate 在 p95>55ms 时自动降档（pipeline.js:173）——护栏在，真机 GPU 占用增量未测（原 02 代理的实验未执行）。
- **U-4（Confirmed）**：状态元组比较每帧 4 字段浅比+label 4Hz 节流（R136/R138 已修抖动风暴）——无剩余问题。
- **延迟预算表结论**：设计预算（确认毫秒制+双侧预测+死区滞回）与实现一致；唯一未闭环是**主窗口侧卡顿可观测性**（现有 stats 全在宿主侧，主窗 render stall 无指标）。

### 3.2 并发与生命周期（03 补位）

对派发时留下的两个假设的**主审判定**（代码推演，未跑交错实验——原 03 代理实验被击杀）：

- **假设 A（acquire 先于 init 到达）**：**不成立**。hook 的 `start()` 在 `ready` resolve 后才 postMessage acquire（useVisionInput.ts:398），BroadcastChannel 同源 FIFO，宿主 handleInit 先于 handle(acquire) 执行；重复 init 路径立即回 ready，顺序仍保持。[Confirmed-机制]
- **假设 B（teardown 与 in-flight tick 竞态致 video null 解引用）**：**大体不成立，留一个已记载的边缘**。tick 主体同步（processFrame 无 await），与 fullTeardown 在 JS 单线程上互斥；唯一异步段是 catch 路径的 `await reloadLandmarkers`，期间并发 capture 会换流——但旧 tick 重排队依赖旧 video 的新帧，流已停则链自然死亡；capture 路径 pipeline 存活（R305 保 active 语义）。残留边缘：reload 完成回调写在已被替换的 landmarker 上（无害覆盖）。[Likely]
- **B-1（Confirmed）**：心跳 5s/看门狗 15s 一次自愈的闭环完整（restartsRef 防风暴、二次走错误卡）——R244 测试在册，主审读码认同。
- **B-2（Confirmed）**：cameraEnded/onDeviceChange 双触发幂等（`if (!pipeline) return` 守卫）。
- **B-3（Likely）**：多消费方并发 enable 时三个 hook 实例各发 init——宿主去重正确（handleInit duplicate 路径），但三实例的 `startInFlightRef` 各自独立，瞬时双 enable 各建一个 BroadcastChannel 消费同一消息流——语义正确（BC 广播），无缺陷。

### 3.3 UI 稳定性（04 补位）

- **R-1（Confirmed）**：所有 `vision-input` 监听器成对卸载（AiLabVisionTab/VisionAssistant/useGestureLightingDomain）；AiLab ticker、看门狗 interval、双 rAF 全部有清理；VisionCursor 额外有 hover class 清理（:98）与整循环 try/catch 兜底（:90-92）。
- **R-2（Confirmed）**：R305 diff 复核——`start()` catch 空吞后不调 resumeActive 是**正确语义**（camera denied 不应 forceReady）；`enable({face:true})` 全部调用点（仅体检台）typecheck 双绿佐证。
- **R-3（Likely）**：VisionAssistant 和弦字符直接改 `document.activeElement.value`+dispatch input（VisionAssistant.tsx:176-180）——对 React 受控输入，走 patched value setter + input 事件是标准可行做法；非 React 输入亦兼容。未见不同步缺陷；建议补一条受控输入的组件测试锁语义。
- **R-4（Confirmed）**：卸载不变式（disable→release→heldRef.clear）三消费方均在（hook `useEffect(() => disable)` 模式）。
- **R-5（Speculative）**：StrictMode 双挂载下 hook 双 enable/disable 往返——startInFlightRef 去重（R227.4）覆盖；未实测 dev 模式。
- **R-6（Confirmed）**：全局 seam（`__rgbboxVision*`/`__rgbboxAssistant`/`__rgbboxVisionLab`）卸载置 undefined——见安全节 T-2 的生产暴露问题。

### 3.4 安全与边界（05 补位；威胁模型=本机同用户会话）

- **T-1（Confirmed 已加固）**：media://local 任意路径读取已在 R221.5 白名单收口（isMediaPathAllowed：userData/Downloads/Music/Videos/播放清单登记路径，越界 403+日志）；media://app 走 traversal-guard 解析器（resolveAppAssetPath，mediaProtocol 纯函数有测试）。
- **T-2（Confirmed）**：E2E seam（`__rgbboxVision`/`__rgbboxVisionLab`/`__rgbboxAssistant`）**生产构建无条件挂载**——任何能在主窗口执行 JS 的向量（诱导 DevTools 粘贴、未来 XSS）可 startSynthetic/读 funnel/驱动管线。能力面有限（不触文件系统写、不出网），但商业发布应按 `import.meta.env.PROD` 门禁或仅 DEV 挂载。修复 S。
- **T-3（Confirmed 缺失）**：全仓无 Content-Security-Policy（main/index.ts / renderer index.html / visionHost.html grep 零命中）。缓解在位（contextIsolation+nodeIntegration:false+仅加载本地内容），但 CSP 是商业加固标配，一条 meta 即可锁 script-src 'self'。修复 S。
- **T-4（Likely 可达性低）**：BroadcastChannel 'rgbbox-vision' 无鉴权——主窗口不加载远端 URL（本地优先），同源伪造需先有 XSS；叠加 T-2/T-3 修复后攻击面收敛。协议无版本号（06 Top10-7）与之叠加才是真风险。
- **T-5（Confirmed 闭环）**：摄像头隐私——主进程权威可见性推送→disable（R227.5/R250）；cameraEnded/devicechange 清理；宿主崩溃→主进程关窗→心跳超时自愈。唯一感知缺口：无托盘/全局「摄像头使用中」指示（UI 徽标仅助手模式有）——P3 打磨项。
- **T-6（Confirmed 防御在）**：畸形 landmark 过滤（21 点/NaN/0..1/score 有限）+ 低置信冻结；`_applyProfile` 对 corrupt profile try/catch 回默认。**未做**：settings patch 消息的参数范围校验（confirmMs 负数/巨大值、activeZone>1 会直接进引擎 cfg）——同源威胁模型下属低危，纵深防御可加 clamp。Likely。

---

## 4. 产品与商业定位（08 交付，主审已复核 Top 断言）

**核心结论**：上轮「玩具 demo」五大差距已修四项，技术侧跨过商业门槛；**产品侧停在门前**。正确定位是三层——**日常层**（灯效环=免提控灯，6 词词汇直控主场景）、**展示层**（游戏四作/演示素材）、**声誉层**（无障碍辅助输入，竞品 LAMP/SignalRGB 均无摄像头条线）——不是「可选购炫技模块」。

- 现状清单 22 项：成熟 12 / 可用 5 / 骨架 5 / 孤儿 1（GESTURE_SCENE_MAP）。骨架+孤儿的共同特征：**能力在、用户面为零**。
- 用户假设检验：「学习成本 vs 收益不成比例」方向成立但已被 R247 灯效环 v2 + 13.8s 向导**大幅修正**——剩余问题是发现性（零曝光），不是设计。
- Top 行动：P0=叙事可见化（30 秒 wow 时刻 hint 卡）；P1=宏编辑器（接孤儿矩阵）+质量面板/深度体检报告（funnel 外化）；P2=演示录制回放（fixtures-replay 现成零件）+per-app 灯效联动（**控自家灯效而非注入 OBS**——边界重定义）。
- 「不做」清单 9 项（含硬件方案终极约束、OS 注入、云端处理、和弦打字推广）见附录。

---

## 5. 综合路线图

| 优先级 | 项 | 维度 | 规模 | 预期结果（Likely） |
|---|---|---|---|---|
| **P0 本周** | 产品叙事可见化（README/产品页/hint 卡） | 产品 | S | 「装完第一次知道有体感」；发现性单点损失消除 |
| **P0 本周** | CI 接 L2 构建档 | 工程 | S | 打包级回归进 CI |
| **P0 本周** | d.ts 清理+字段合同测试 | 工程 | S | TS 消费者假安全感消除 |
| **P1 1-2 周** | CHANGELOG+NOTICE / 协议 protoVersion / CSP+seam 门禁 / settings clamp | 工程+安全 | S×4 | 商业合规与加固闭环 |
| **P1 1-2 周** | 手势宏编辑器 v1（矩阵接线） | 产品 | M | 孤儿地基接用户；per-mood 套装 |
| **P1 1-2 周** | 质量面板+深度体检报告 | 产品 | S-M | 真机质量从口说到有据；客服自诊断素材 |
| **P2 1 月** | 几何收敛 / checkJs 渐进 / 崩溃上报最小闭环 / 无障碍声明 | 工程 | S-M×4 | 重构安全网与声誉资产 |
| **P2 1 月** | 演示录制回放 / per-app 灯效联动 | 产品 | M×2 | 内容创作与直播场景 |
| **P3 季度** | 真机冒烟 checklist / session.js 拆校准向导（先决=R2/R7）/ 摄像头使用指示 | 工程 | L/M/S | 传感器盲区缓解 |

---

## 6. 待用户确认 / 未验证 / 局限

1. **5 路子代理被 API 周额度击杀**（02/03/04/05/07）——§3 为主审单视角补位，未经交叉验证与实验（微基准、并发交错复现、截图目检均未执行）。额度 2026-10-20 22:01 重置后可原提示词重发补全。
2. 真机体感 p95/召回/GPU 占用（face:true 增量）——全部质量数字来自合成门禁与 soak（R237/R252），R305 真机验收仍待用户回报。
3. MiniGamesView.pollVision 逐行映射、VisionOnboarding/VisionLightControl 组件内部——沿 architecture-vision.md §12 口径（06 已部分核销）。
4. 主窗口 render stall 可观测性建议（U-1 附件）需实现后才有数据。
5. 数据卫生声明：主审全程只读（仓库与 %APPDATA%\rgbbox）；未启动/结束任何进程；唯一写入为本报告与附录目录。

---

## 附录索引

- `docs/review-2026-10-17-vision/06-architecture.md` — 架构与商业流程全文（27KB）
- `docs/review-2026-10-17-vision/08-features.md` — 产品与商业定位全文（28KB）
- 上轮评审：`docs/REVIEW-VISION-2026-10-09.md` + `docs/review-2026-10-09-vision/`
