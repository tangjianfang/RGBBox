# RGBBox 视觉宿主进程 / 摄像头管线 / Worker 调度 / 跨进程消息 —— 并发与后端性能审查

> 审查范围:`src/renderer/visionHost.html`、`src/renderer/src/visionHostMain.js`、`src/renderer/src/vision/*`、`src/renderer/src/hooks/useVisionInput.ts`、三个消费端(MiniGamesView / AiLabVisionTab / VisionAssistant)、`src/main/index.ts` visionHostOpen/Close 与权限段。
> 方法:全量代码阅读 + 纯 Node 量化实验(临时目录,复用 tests/vision 脚本化 landmarker)+ 最小复现脚本。仓库只读,未启动应用。
> 实验脚本:`C:\Users\tjf\AppData\Local\Temp\rgbbox-review-20261009\{exp1_pipeline,exp2_channel,exp3_fuzz,repro_paused_crash}.mjs`

---

## 摘要 —— Top 风险与「玩具 demo」归因

按证据强度排序:

1. **B-1(Confirmed,可复现)** `session.js:364` 调用了**从未导入**的 `handOpenness` → paused+双手可见即抛 `ReferenceError`;宿主 tick 无 try/catch,一次异常即**永久杀死帧循环**:摄像头灯常亮、手势无响应、零错误提示、无自愈。触发链就在主路径上(TD 屏自动 pause + 左手入镜)。
2. **B-2/B-3/B-7(Confirmed,逻辑链完备)** 单宿主单会话协议无所有权模型:第二个消费者的 `init` 被静默忽略 → `enable()` **无限挂起**(无超时);enable 失败一次后 `channelRef` 不清理 → **按钮永久死锁**;任一消费者 `stop` 连坐杀死所有消费者。
3. **B-4/B-5/B-15(Confirmed,代码缺失)** 摄像头设备生命周期完全裸奔:无 `track.onended`、无 `devicechange`、无 rVFC 停摆看门狗、无 deviceId 选择、占用失败无退避重试。拔线/被 Zoom 抢占 = 静默冻结。
4. **B-6(Confirmed)** VisionAssistant 不响应主窗可见性:助手开启 + 主窗最小化/收托盘 → **托盘态摄像头常亮 + 60Hz 推理照跑**(games 视图做了,assistant 没做)。
5. **B-8/B-9(Confirmed)** 资源调度回归:pause 状态推理照跑 60Hz(R133「TD 停泊跳过推理」在 R136 迁移时丢失);games 路径无条件加载并每 3 帧跑 FaceLandmarker(R132「faceless 减半预算」被推翻)。

「玩具 demo」的本层归因:**架构骨架(独立渲染进程 + BroadcastChannel 传 landmarks 而非帧)是对的且有实测数字支撑;垮在生命周期与异常路径——所有 happy path 有测试,所有 unhappy path(异常/热插拔/多消费者/崩溃)要么静默死要么永久死**。商业级产品的差距不在算法,在自愈。

---

## 发现清单

### B-1 paused+双手 → ReferenceError → 帧循环永久死亡(摄像头常亮)
- **位置**:`src/renderer/src/vision/session.js:364`(`handOpenness(secondary.landmarks)`);import 列表在 `session.js:12` 只有 `HandEngine, OffHandEngine, GapEngine, handGeometry`,**无 handOpenness**(它 export 于 `gesture_engine.js:326`)。放大器:`src/renderer/src/visionHostMain.js:98-115` tick 无 try/catch,`requestVideoFrameCallback` 重排在 `processFrame` 之后(`:113`),异常即不再调度。
- **触发**:①MiniGamesView 进入 TD 屏 → `vision.setPaused(true)`(`MiniGamesView.tsx:1005`);②dualHand.enabled=true(useVisionInput.ts:208)下摄像头看到**两只手**(secondary 非空);③session 进 paused 分支(`session.js:361-366`)→ 抛错。已有测试没抓住:`tests/vision/session.test.mjs:143-156` pause 时只喂单手。
- **后果**:rVFC 循环死亡但 `pipeline.running` 仍 true、stream 未 stop → **摄像头灯常亮 + 手势全无响应 + 无任何错误 surfaced**;唯一恢复 = disable/enable(重建窗口)。
- **验证**:`repro_paused_crash.mjs` 输出 `THROWN: ReferenceError handOpenness is not defined`(单手 paused 不抛,与生产触发条件精确吻合);exp3 fuzz 155k 帧中 12458 帧抛此异常。
- **修复草案**:①`import { handOpenness }` 补进 session.js;②host tick 包 try/catch:单帧错误→`post status` 并继续重排;连续 30 帧错→`post error` + 自 teardown(释放摄像头);③补回归测试「paused + 双手 + resume 手势」。
- **置信度:Confirmed**(静态代码 + 可运行复现双重证据)。

### B-2 第二个消费者 enable 无限挂起(握手无超时,init 被静默忽略)
- **位置**:`src/renderer/src/visionHostMain.js:130-131`(`if (pipeline) return`——已初始化则对后续 init **零响应**,不重发 ready);`src/renderer/src/hooks/useVisionInput.ts:179-237`(promise 只在收到 `ready`/`error` 时 settle,**无超时**)。
- **触发**:a) 助手开启(VisionAssistant.tsx:64-67,App 级常驻 `App.tsx:816`)→ 用户进 AI Lab 体感 Tab 点「开始体检」(AiLabVisionTab.tsx:392-395):visionHostOpen 返回 true(窗已存在)→ init 被忽略 → `busy` 永久 true、按钮死;b) 主窗 renderer 崩溃自愈重载(`src/main/index.ts:188-193`,R221.4)后宿主仍活着 → 重载后的 hook enable → 同样挂起;c) 任何 host-hello 之前的时序错位被 hello 机制掩盖,但「同窗二次 init」没有任何掩盖。
- **后果**:功能静默死锁、无错误提示;用户对「商业级」的直接负体验。
- **修复草案**:host 收到 init 且已 ready → **幂等重发 ready**;client init 握手 5s 超时 reject;进一步:消息带 client-id,host 维护会话表。
- **置信度:Confirmed**(代码逻辑链完整;未起真机但协议行为由 BroadcastChannel 语义决定)。

### B-3 enable 失败一次 → start() 永久早退(重试按钮死锁)
- **位置**:`useVisionInput.ts:165`(`if (channelRef.current) return`)与 `:176-177`(channel 先建、await 后置),reject 路径(`:217-219`)**不清理 channelRef**。
- **触发**:摄像头被占用(NotReadableError,主进程权限 handler 恒允许 `index.ts:1587-1593`,所以「被 Zoom 抢占」是现实主路径)/模型加载失败 → host post error → client reject → 调用方 `MiniGamesView.tsx:2351`、`AiLabVisionTab.tsx:394` 均 `catch(() => undefined)` 吞掉 → 再点按钮 → start 早退,零反馈。
- **后果**:一次失败后按钮假活,必须切视图/回 hub 才能恢复。
- **修复草案**:reject 分支 `channel.close(); channelRef.current = null`;错误信息透出到 UI(横幅/状态芯片)。
- **置信度:Confirmed**。

### B-4 摄像头热插拔/抢占零处理
- **位置**:全仓 vision 栈无 `onended`/`devicechange`/`readyState` 检查(rg 证实:devicechange 仅 `App.tsx:431` 音频设备、VideoStudio);host tick 依赖 rVFC 持续回调,流断即**静默停摆**。
- **触发**:拔 USB 摄像头 / 摄像头被浏览器/会议软件抢占后释放。
- **后果**:管线 running=true 但零帧;客户端 UI 停在旧状态;无重连、无提示。商业级要求 devicechange 监听 + 自动重开流(退避)+ 用户可见状态。
- **修复草案**:track.onended → post `status: camera-lost` + 尝试重开(指数退避 ×5);`navigator.mediaDevices.addEventListener('devicechange')` 兜底;客户端 snapshot 心跳缺失 2s → 「视觉链路中断」提示 + 重试按钮。
- **置信度:Confirmed(缺失类,静态证实)**。

### B-5 摄像头占用/失败无退避重试,权限路径单一
- **位置**:`visionHostMain.js:84-91` getUserMedia 一次性失败即终止;无重试;错误经 `error` 消息一次性抛给 B-3 的死锁路径。
- **修复草案**:NotReadableError → 1s/2s/4s 退避重试 + 「摄像头被占用,重试中」状态。
- **置信度:Confirmed**。

### B-6 托盘/最小化态摄像头常亮(assistant 路径)
- **位置**:`MiniGamesView.tsx:1028-1030` 订阅了 `onMainWindowVisibilityChanged(!visible → disable)`;**VisionAssistant.tsx 没有任何可见性订阅**(只有 games 视图边界处理 `:70-72`);主窗 `minimize`/close-to-tray 均发可见性 false(`src/main/index.ts:200` 及 R38 注释段)。
- **触发**:任何非 games 视图开启助手 → 点关闭按钮收托盘/最小化。
- **后果**:宿主窗口存活、摄像头开、60Hz 推理 + 消息广播照跑(收件人已隐藏)。隐私(指示灯)+ 功耗双硬伤,商业级致命伤级别。
- **修复草案**:VisionAssistant 同样订阅 `onMainWindowVisibilityChanged` → disable(回到前台按 localStorage 记忆自动 re-enable)。
- **置信度:Confirmed(代码级;指示灯现象未实测,但 teardown 缺失是确定的)**。

### B-7 单宿主无所有权模型:stop 连坐 + 窗口复用不可重入
- **位置**:`visionHostMain.js:175`('stop' 无条件 teardown+stop——影响所有广播接收者);`:131`(stop 后同窗 `init` 被忽略,pipeline 不可重置);`useVisionInput.ts:244-251`(每个消费者 disable 都关共享窗口)。
- **触发**:多消费者并存期(见 B-2 场景)任一方 unmount/disable。
- **后果**:另一消费者的流被静默杀死且其 `enabled` state 仍 true(VisionCursor 冻结、无恢复路径)。
- **修复草案**:短期——客户端 disable 前 Drain 自己的会话;中期——host 端 client-id 注册/注销引用计数,最后一个注销才 teardown+关窗。
- **置信度:Confirmed(逻辑链)**。

### B-8 pause 不降推理预算(R133 优化在 R136 迁移时回归)
- **位置**:legacy `vision_input.js:174-177` `_tick` 先查 `session.paused` 跳过推理;新 `pipeline.js:122-161` `processFrame` **无 paused 检查**,推理(detectForVideo)先跑、`session.onFrame` 才 early-return(`session.js:358`);host tick(`visionHostMain.js:98-115`)也不查。
- **触发**:TD 屏自动 pause;任何 pause 消息。
- **后果**:暂停态仍 60Hz 全量推理+摄像头;而 paused 分支只消费 off-hand 张掌 resume 手势,10Hz 足够。
- **修复草案**:pipeline 增加 `paused` 快速路径:paused 时推理降频到 10Hz(丢帧保新,pad/横幅不需要),resume 即回满速。
- **置信度:Confirmed**。

### B-9 games 路径白跑 FaceLandmarker(每 3 帧一次)
- **位置**:`useVisionInput.ts:195` 恒传 `faceModel`;`visionHostMain.js:55,61` 有 faceModel 即创建;`pipeline.js:150-155` 每 faceEveryN 帧同步跑 face 推理。games 的 init cfg `requireFace:false, faceEveryN:3`(useVisionInput.ts:205-208),MiniGamesView 不消费表情事件(R131「表情预留」)。
- **后果**:与 R132「faceless 减半推理预算」条款直接相悖;3.7MB 模型常驻 + 1/3 帧的额外推理 + faceMeter 开销,游戏场景纯浪费。
- **修复草案**:games 的 init cfg `faceModel: null`(host 已支持 null 跳过);AI Lab/assistant 场景保留。
- **置信度:Confirmed**。

### B-10 宿主渲染进程崩溃 = 僵尸窗口,客户端无限等待
- **位置**:`src/main/index.ts:1110-1134` 仅 `closed` 处理;**无 `render-process-gone`/`unresponsive`**(主窗口在 R221.4 有,`index.ts:188-199`——同一文件内的不对称)。
- **触发**:宿主 OOM/GPU reset/内核崩溃。
- **后果**:visionHostWindow 仍 non-destroyed → 下次 visionHostOpen 返回 true 复用死窗 → 新客户端等 hello 永不来(B-2 同款挂起);已连接客户端零感知(VisionCursor 冻结)。
- **修复草案**:宿主窗 `render-process-gone` → 销毁重建(或置 null 让下次 open 重建)并广播复位;客户端心跳(B-4 草案)兼作崩溃检测。
- **置信度:Confirmed(缺失类)**。

### B-11 校准态无缺席退出:人走开即无限「继续采样/重试」
- **位置**:`session.js:443-486` `_calibrateFrame` 无 handLost 路径(仅 active 态有 `handLostRecalFrames`,`:500-505`);gate 的 extend(`:198-207`)一次翻倍后 retry 重开同 step,缺席时永远凑不齐数据。
- **验证**:exp3 fuzz 300 loop 中 149 loop 在 50 帧全缺席(~800ms)后仍处 `calibrating`;stateHist 155k 帧中 calibrating 96893(随机输入下大量滞留)。
- **后果**:用户中途离开/手一直不出画面 → 向导永不回 searching,横幅卡在当前步骤;需手动重校准。
- **修复草案**:校准态累计缺席 ≥ handLostRecalFrames → `_enterSearching()`。
- **置信度:Confirmed**。

### B-12 LatencyMeter.stats() 每帧 ~5 次全量复制排序(约 2.7% 单核纯浪费)
- **位置**:`pipeline.js:159`(`adaptFaceRate` 参数里调 2 次 `stats()`)、`pipeline.js:207-217` + `visionHostMain.js:70`(emit 里 `stats()` 内 3 次)。
- **实测**:stats() 89.5µs/次(300 样本复制+排序);60Hz × 5 ≈ 27ms/s,且每次分配新数组(GC churn)。
- **修复草案**:stats 缓存 250ms;或 LatencyMeter 增量维护有序结构。
- **置信度:Confirmed(量小但纯浪费)**。

### B-13 'capture' 精度切换重启流无错误防护
- **位置**:`visionHostMain.js:168-174` `await startCamera(msg.camera)` 无 try/catch(async onmessage 内 → unhandled rejection)。
- **触发**:切换瞬间摄像头被抢占。
- **后果**:teardown 已执行、新流未建立 → running=true 无帧,静默死亡(与 B-4 同症状不同入口)。
- **置信度:Confirmed**。

### B-14 「MediaPipe 内部 worker」表述不实:推理同步于宿主渲染主线程
- **位置**:`visionHostMain.js:1-8` 注释与 PRD R136 均称 MediaPipe 自带内部 worker;静态证据:**vendored `vision_bundle.js` / `vision_wasm_internal.js` 中 `new Worker`/`Worker` 出现 0 次**。
- **含义**:进程隔离(独立渲染进程)成立——游戏窗口主线程确实零视觉成本(R136 E2E 实测 rAF 60fps);但**线程隔离不成立**:宿主内 detectForVideo 期间,BroadcastChannel 的 `settings/pause/mirror` 消息、rVFC 重排全部被阻塞单帧推理时长(CPU fallback 下可达 30-80ms)。future 调度优化(如消息优先级)必须基于这一事实。
- **置信度:Likely**(bundle 静态证据确凿;未在真机 hook MediaPipe 运行时证实零 worker)。

### B-15 无多摄像头选择
- **位置**:`visionHostMain.js:75-91` startCamera 无 deviceId 参数(legacy `vision_input.js:103-110` 有——迁移时丢失);亦无 enumerateDevices 的 UI 入口。
- **后果**:多摄像头用户被强制用系统默认设备,无法纠错(商业缺口,与 R136「镜像开关」同类用户纠错诉求)。
- **置信度:Confirmed**。

### B-16(并入 B-10/B-4 表述)宿主 hang(非 crash)无 watchdog
- pipeline.running 仍 true、无消息产出、无人检测。客户端心跳方案一并覆盖。

---

## 量化实验结果(临时目录脚本,Node 23.11.1)

### Exp1 单帧管线全链耗时(不含 wasm;脚本化 landmarker 返回 2 手 + 52 维 blendshape)
| 指标 | 值 |
|---|---|
| p50 | **0.222 ms** |
| p95 | **0.458 ms** |
| p99 | 0.675 ms |
| max | 5.38 ms |
| mean | 0.252 ms |

3600 帧(模拟 60s@60fps),其中 LatencyMeter.stats() 占 ~90µs/次。**结论:JS 框架层开销不构成瓶颈(60Hz 下 ~15ms/s);端到端延迟瓶颈必在 wasm 推理本身**(真机值可在 AI Lab 体检台 `infer p95` 读出,本次未启动应用)。

### Exp2 BroadcastChannel 负载成本(结构化克隆,Node 进程内实测)
| 载载 | 成本 | 60Hz 折算 |
|---|---|---|
| snapshot(实测 JSON 6.47KB:2×21 landmarks + 52 blendshape + stats + profile)structuredClone | **117.7 µs** | 7.1 ms/s |
| 同上经 BroadcastChannel postMessage(20000 条全送达) | **155.3 µs** | 9.3 ms/s |
| 对照:640×480 RGBA 帧 structuredClone | 892.3 µs | 53.5 ms/s(+巨量 GC) |

**结论:现设计(传 landmarks 不传帧)正确且余量充足;events+snapshot 双消息 60Hz 合计 ~19ms/s 发送侧 + 同量级接收侧,无堆积风险**(BroadcastChannel 无接收者即丢弃,不缓存)。

### Exp3 状态机 fuzz(300 loop / 155,041 随机帧:随机手数/分数/位置/时间跳变/pause/recalibrate 交错)
- 非法状态:0;stop() 后残留按住键:0;chord buffer 无失控(200k 帧 811 字符,均在事件驱动内)。
- **异常 12,458 帧全部源于 B-1 的 handOpenness**(唯一异常源)。
- 50 帧全缺席后仍滞留 calibrating:**149/300 loop**(B-11 证据)。

---

## 商业级差距清单(demo 现状 vs 商业要求)

| # | 维度 | demo 现状 | 商业级要求 | 差距量级 |
|---|---|---|---|---|
| 1 | 异常自愈 | 单帧异常永久死循环、摄像头常亮(B-1);宿主崩溃=僵尸窗(B-10) | tick 容错+连续错误熔断+崩溃自动重建+状态恢复 | **从无到有,P0** |
| 2 | 设备生命周期 | 拔线/抢占静默冻结,失败一次按钮死(B-3/4/5) | onended+devicechange+退避重连+可见状态+多摄像头选择 | **大,P0-P1** |
| 3 | 资源/隐私治理 | 托盘态摄像头常亮(B-6);pause 照跑 60Hz(B-8);games 白跑 face 模型(B-9) | 不可见即停;暂停降频;按需加载 | **大(隐私硬伤),P0-P1** |
| 4 | 多消费者会话 | 全局单会话先到先得,互踩互杀(B-2/7) | 所有权租约/引用计数,或宿主常驻多路复用 | **架构级,P1-P2** |
| 5 | 握手健壮性 | 无超时无重试无幂等 ready(B-2) | 超时+退避+幂等握手 | 中,P0(便宜) |
| 6 | 校准鲁棒性 | 走开即无限卡校准(B-11) | 缺席超时回 searching | 中,P1 |
| 7 | 性能余量 | 框架 0.25ms/帧、通道 155µs/条——**充裕** | 保持;修 B-12(2.7% 浪费) | 小,P2 |
| 8 | 可观测性 | 宿主零心跳零错误上报;文案级 status | 心跳+错误分级上报+诊断页呈现 | 中,P1 |

---

## 调度重构方案(每步可独立合入)

- **S0 止血(全部 ≤20 行/处)**
  1. session.js 补 `import { handOpenness }`(B-1);2. host tick try/catch:单帧错→status+继续,连续 30 错→error+自 teardown 释放摄像头(B-1/B-16);3. client reject 路径清 channelRef+错误透出 UI(B-3);4. init 握手 5s 超时 + host 幂等重发 ready(B-2);5. VisionAssistant 订阅主窗可见性(B-6)。
- **S1 生命周期自愈**:宿主窗 render-process-gone→销毁重建+复位广播,客户端自动重 enable(storedProfile 恢复,校准不丢);客户端 2s snapshot 心跳缺失→「链路中断+重试」。
- **S2 设备管线**:track.onended + devicechange 自动重开流(1s/2s/4s/8s/16s 退避);capture 重启包 try/catch;enumerateDevices+设置面板摄像头选择;games init `faceModel:null`。
- **S3 调度策略**:paused→推理降 10Hz(resume 手势裕量),resume 恢复 60Hz;CPU delegate 下按 inferP95 自适应降 maxFps(保 pad 30Hz 而非硬顶 60);LatencyMeter.stats 缓存 250ms。
- **S4 架构演进(评估后再动)**:宿主常驻会话管理器(client-id 注册/引用计数停机,消灭 enable/disable 全窗重建的 300-800ms 冷启动与连坐);探索 MediaPipe 迁 utilityProcess(注意 R136 记录的 worker 三连败:file:///blob 内嵌套加载失败,utilityProcess 无 DOM 风险同级,需 spike 验证)。

## 修复顺序

- **P0**:S0 全部(B-1 优先——它同时是功能性 bug 与摄像头常亮来源)+ B-9 一行(faceModel:null)。
- **P1**:S1、S2(设备生命周期+多摄像头)、B-11。
- **P2**:S3、S4、B-12、B-15 UI。

---

## 被推翻的假设 / 已验证无问题

**被推翻:**
1. 「视觉宿主进程常驻,不用时也占内存/CPU」——**不成立**:宿主窗口严格随 enable/disable 开/关(`index.ts:1110-1134`),disable 即 close 销毁。唯一例外是 B-6(assistant+托盘隐藏)。
2. 「主窗口与宿主双份加载 MediaPipe」——**不成立**:主窗对 vision 模块仅 `import type`(编译期擦除),bundle 只在宿主动态 import;无重复 11.7MB wasm 加载。
3. 「WASM 推理有真正的 worker 线程隔离」——**不成立**(静态证据,见 B-14):推理同步跑在宿主渲染主线程;成立的是进程级隔离。

**已验证无问题:**
- BroadcastChannel 负载设计与量级(Exp2:landmarks 155µs/条,无堆积;传帧才是反模式)。
- JS 层无内存泄漏点:LatencyMeter/acquire 均 cap 300;校准累加器按 step 重建;chordBuffer 事件驱动;flip 每帧 ~100 小对象的 GC churn 属正常量级。
- stop()/releaseAll 键释放语义(fuzz:0 残留);_pickHands 连续性排序、时间戳单调守卫、OneEuro 时钟跳变重播种均正确。
- rVFC 自背压:慢帧时天然丢帧保新(重排在处理后),不会排队膨胀。
- 状态机在合法输入域内 0 非法状态、0 死键(唯一异常源即 B-1)。

## 未验证 / 局限

1. **真机 wasm 推理耗时与 GPU delegate 在 Electron 41(Chromium ~142)的实际可用性/回退率**——未启动应用(禁令);AI Lab 体检台有 `infer p95 / delegate` 读数,建议主审会话实机采集。CPU fallback 下无 SharedArrayBuffer(bundle 无相关引用,页面未开 COI)→ 单线程推理的量级未实测。
2. BroadcastChannel 打包 file:// 下跨窗口送达时延——Exp2 为 Node 进程内量级参考,未在双 BrowserWindow 实测(架构文档 §14 亦标推断)。
3. 30 分钟长跑内存曲线(MediaPipe/GPU 侧无法静态判定;JS 侧未见无界结构)。
4. 摄像头指示灯实际行为(代码推定:正常路径 teardown 完整;B-1/B-6/B-10 异常路径常亮)。
5. legacy `vision_input.js`(289 行)为死代码(仅 type import)——是否被打进产物未验证(out/ 可查);其 camera 约束/deviceId 逻辑与宿主实现的分叉(B-15)属维护债。
6. exp3 的 "stuckAfterAbsenceOrStop" 计数含 paused 态(设计如此),已人工甄别为 B-11 的 calibrating 滞留证据。
