# RGBBox 视觉 UI 层稳定性审查报告(崩溃 / 泄漏 / 生命周期风险)

- 审查对象:RGBBox @ branch `review/vision-gesture-commercial`(HEAD 539115a)
- 审查范围:`src/renderer/src/components/vision/*`、`src/renderer/src/hooks/useVisionInput.ts`、`src/renderer/src/components/AiLabVisionTab.tsx`、`MiniGamesView.tsx` vision 接线、`src/renderer/src/visionHostMain.js`、`src/renderer/src/vision/*`(引擎全文)、`src/main/index.ts` visionHost/media/crash 段、`src/main/crashLog.ts`、tests/vision + tests/renderer
- 方法:纯静态代码审计(只读;未启动/附加 electron)。每条发现均亲自读到代码,file:line 为证。
- 日期:2026-10-09

---

## 0. 结论表 —— 线索假设证实 / 证伪

| # | 线索假设 | 结论 | 证据 |
|---|---|---|---|
| A | R223.5 的 `dispose of undefined` 同类问题在真实运行时也存在 | **证实(V-4)** | `visionHostMain.js:175` `'stop'` → `pipeline.stop()` → `pipeline.js:98` `this.session.stop()`;init 失败后 `pipeline` 非 null 而 `session === null` → TypeError(async onmessage 内 → unhandledrejection)。与 R223.5 测试连环 TypeError 同构 |
| B | R131.3④「回 hub / 卸载 / 最小化 → vision.disable()」全部收敛 | **部分证伪(V-6)** | MiniGamesView 收敛齐(`MiniGamesView.tsx:1024-1030` hub/不可见、hook unmount effect `useVisionInput.ts:326`);**VisionAssistant(App 常驻)无最小化收敛**——`grep` 全 renderer 仅 MiniGamesView 订阅 `onMainWindowVisibilityChanged`。host `backgroundThrottling:false`(main/index.ts:1119)→ 最小化后摄像头 + 60fps 推理持续 |
| C | 连点开关可能开两个宿主窗口 | **证伪(窗口层)+ 证实(通道层,V-2)** | `main/index.ts:1111` `isDestroyed()` 单例守卫,窗口不会开两个;但 `useVisionInput.start()` 在 `await visionHostOpen()` 挂起期间 `channelRef` 未赋值,双击 enable → **两个 BroadcastChannel**,第一个泄漏且双收广播 → 命令双倍入队 |
| D | 项目无崩溃捕获覆盖视觉路径 | **部分证伪** | `crashLog.ts:28` `crashReporter.start({uploadToServer:false})` 在 app ready 前启动,**覆盖所有进程(含 vision host 渲染进程)**;主进程 uncaughtException/unhandledRejection 有 JSON 落盘。**真正缺口是 renderer 侧 JS 异常无捕获上报(V-11)**与 Crashpad 目录为空(无 native 崩溃发生,属好信号,但 JS 层不可见) |
| E | d.ts 与引擎实现漂移 | **证实(V-15,无崩溃)** | `vision_input.d.ts:25-39` 声明 `acquire/lowFps/cam` 为必有,host 管道 `pipeline.js:207-217` 的 `stats()` 不含这三个字段;消费端(VisionBanner:31、AiLabVisionTab:420-421)全用可选链,未爆 |
| F | 模型资产被打包排除导致 release 视觉必崩 | **证伪** | `package.json build.files` 仅排除 `assets/models/*.splat|*.ksplat|*.spz|*.ply`;`out/renderer/models/*.task` 与 `out/renderer/vendor/mediapipe/*` 均在产物中(实测 ls) |
| G | 任务描述「React 18」 | **勘误** | 实际 `react: 19.2.5`(package.json devDependencies)。StrictMode 语义相同(updater/双 effect) |

---

## 1. 摘要 —— 按风险排序 Top 风险

1. **整棵 React 树没有 ErrorBoundary(V-1)**:任何视觉组件渲染期抛错 = 整窗白屏,这是「0 崩溃」目标下最高杠杆的单点。
2. **宿主窗口消息处理三处无守卫(V-4/V-8/V-9/V-10)**:`'stop'` 在 session null 时 TypeError;rVFC tick 无 try/catch —— 任意一帧引擎异常即断帧回调链,**管道静默冻结**(客户端无 error 消息、UI 卡在最后状态);`'capture'` 分支 startCamera 失败成 unhandledrejection;摄像头流元数据失败 → init 永挂 → 客户端 enable 无超时永久 pending。
3. **多 hook 实例共享单例宿主,无仲裁(V-5)**:VisionAssistant(App 常驻)只对 games 视图让位;AI Lab 视图下两者并存 → AI Lab 的 enable 永挂(host 忽略二次 init 不回 ready)、AI Lab 的「停止」直接关掉 assistant 正在用的宿主(visionHostClose 无引用计数)→ 光标冻结 + enabled 仍 true,重启应用才恢复。
4. **enable/disable 状态机竞态(V-2/V-3)**:双击 enable → 双通道泄漏 + 手势命令双倍入队(游戏输入重复);enable 失败后 channelRef 不回滚 → 下次 enable 静默 no-op。
5. **最小化后摄像头不熄(V-6)+ window-all-closed 不关宿主(V-7)**:隐私/资源级泄漏,违反 PRD R131.3④ 验收点。

---

## 2. 发现清单(V-1…V-18;不使用 R-N 前缀以免与 PRD 条款混淆)

### V-1 全 renderer 无 ErrorBoundary 【Confirmed|崩溃级】
- 位置:`src/renderer/src/main.tsx:73`(`React.StrictMode` 外无边界);`grep -rn "ErrorBoundary|componentDidCatch|getDerivedStateFromError" src/renderer/src` → **0 匹配**;挂载链 `App.tsx:816`。
- 触发:任何视觉组件(或任何组件)渲染/commit 期抛错 —— 例:V-16 的 localStorage 抛错发生在 `useState` 初始化(渲染期)、未来任一快照字段类型漂移。
- 后果:React 卸载整棵树 → 白屏;开发模式有 overlay,生产直接黑/白屏,且无上报(V-11)。
- 修复草案:App 根加全局 ErrorBoundary(fallback:轻量错误页 + 「复制诊断/重启」);对 `<VisionAssistant>` 与 games 视觉 overlay 单独包一层边界,视觉子系统故障不拖垮主 UI。`main.tsx` 挂载处为入口。
- 置信度:**Confirmed**(存在性 grep 零匹配;触发依赖前端异常,概率中等)。

### V-2 `start()` 并发竞态:双 BroadcastChannel 泄漏 + 命令双倍入队 【Confirmed|功能缺陷+泄漏】
- 位置:`src/renderer/src/hooks/useVisionInput.ts:164-177`。
```ts
const start = useCallback(async (mode) => {
  if (channelRef.current) return          // ← await 前检查
  await window.rgbbox.visionHostOpen()    // ← 挂起窗口期 channelRef 仍为 null
  const channel = new BroadcastChannel(VISION_CHANNEL)
  channelRef.current = channel            // ← 第二次调用覆盖第一次
```
- 触发:快速双击 games 顶栏 👁(`MiniGamesView.tsx:2350-2352` 两次 `vision.enable()`)或 AI Lab「开始体检」双击(按钮 `disabled={vision.enabled || busy}`,但 busy 在 await 之后才置 —— `AiLabVisionTab.tsx:392-395` 的 `setBusy(true)` 虽同步,React 18+ 事件内自动批处理使第二次 click 前按钮尚未禁用;连点窗口 ≥1 帧)。
- 后果:①第一个 channel 永不 close(泄漏,BroadcastChannel 持有闭包直到页面卸载);②**两个 channel 都收到宿主广播** → `onEvent` 双写 `queueRef` → 一次捏合 = 两次 `space`、一次方向 = 两步 —— 游戏输入加倍;③`disable()` 只 close `channelRef.current`(第二个)。
- 修复草案:`start` 加 in-flight promise 复用(`startingRef.current ??= doStart()`),或用 `channelRef.current === STARTING` 哨兵;`disable()` 期间设置 `stoppingRef` 屏蔽并发 enable。
- 置信度:**Confirmed**(代码路径确定;触发需双击时序,真实可复现)。

### V-3 `start()` 失败路径不回滚 → 后续 enable 静默 no-op 【Confirmed|死功能】
- 位置:`useVisionInput.ts:176-237`。`channelRef.current = channel`(177)先于握手;`msg.type === 'error'` → `reject(...)`(217-219)**但 channelRef/hostOpenRef 不清空**。
- 触发:摄像头拒绝 / wasm 加载失败 / 模型路径异常(任何 init error)。
- 后果:`enabled=false` 但 `channelRef.current` 非 null → 用户再点开启 → `start()` 首行 `if (channelRef.current) return` **直接返回,什么也不发生**(无日志无提示)。AI Lab 的恢复路径是先点「停止」(disable 清理);VisionAssistant 的 pill 处于 on 态但无光标,需关-开两步。测试 `useVisionInput.test.tsx:175-193` 断言了 reject,**没有覆盖「失败后再 enable 应可重试」**。
- 修复草案:reject 分支里 `channel.close(); channelRef.current = null; hostOpenRef=false; void visionHostClose()`;或 `start` 全程 try/catch 失败即自清理。
- 置信度:**Confirmed**。

### V-4 宿主 `'stop'` → `pipeline.stop()` → `session.stop()` on null 【Confirmed|TypeError, R223.5 同类】
- 位置:`src/renderer/src/visionHostMain.js:130-156, 175`;`src/renderer/src/vision/pipeline.js:96-100`。
```js
pipeline = new VisionPipeline({...})   // 133:pipeline 先赋值
await pipeline.init(msg.cfg)           // 140:抛错(摄像头/模型)→ catch → post error
...
case 'stop': teardown(); pipeline.stop(); break   // 175:pipeline 非 null 但 session === null
// pipeline.js:98  const events = this.session.stop()  → TypeError: Cannot read properties of null
```
- 触发:init 失败(用户拒绝摄像头)后用户关闭体感开关。
- 后果:TypeError 发生在 **async 的 `channel.onmessage`** 内 → unhandledrejection(宿主控制台,无上报);`'stop'` 的 `pipeline.stop()` 未完成、`pipeline` 未置 null —— 同一宿主窗口若复用(窗口未被销毁的场景)后续 `'init'` 被 `if (pipeline) return`(131)吞掉。这正是 R223.5 修的「host 未赋值连环 TypeError」在**产品代码**中的对应物。
- 修复草案:`pipeline.stop()` 改 `pipeline?.stop?.(); pipeline = null`;`VisionPipeline.stop()` 首行 `if (!this.session) return []`;`onmessage` 整体 try/catch → `post({type:'error'})`。
- 置信度:**Confirmed**。

### V-5 双 hook 实例共享单例宿主,无引用计数/仲裁 【Confirmed|死功能+状态错乱】
- 位置:`main/index.ts:1110-1134`(`visionHostOpen` 单例 / `visionHostClose` 直接 close);`useVisionInput.ts`(每个组件实例独立 `channelRef`);`VisionAssistant.tsx:64-72`(只对 `activeView === 'games'` 让位);App 常驻挂载 `App.tsx:816`;AI Lab 挂载于 ai 视图。
- 场景 1(挂死):assistantOn=1 时进入 AI Lab 点「开始体检」→ tab 的 `start()`:宿主已初始化 → 宿主 `if (pipeline) return`(visionHostMain.js:131)**不回 ready**(host-hello 只在窗口加载时广播一次)→ `start()` 的 `await new Promise` **永挂** → `busy` 永久 true,按钮永久禁用。
- 场景 2(互相拆台):用户在 AI Lab 点「停止」→ tab 的 `disable()`:`channelRef` 为 null(start 挂死时未赋值)→ postMessage no-op,但 `hostOpenRef.current`…(同样 false,visionHostClose 不调)。**若场景 1 之前 assistant 已 enable**:AI Lab start 挂死期间点「停止」→ `disable()` → `visionHostClose()` **关掉 assistant 正在用的宿主** → assistant 的 channel 无消息、`enabled` 仍 true → VisionCursor rAF 继续跑但 frame 永不更新 → 光标冻结在屏上,直到重启应用(无 host-hello/watchdog 重连)。
- 修复草案(择一或组合):①模块级 `VisionHostArbiter`(acquire/release 引用计数,最后一个 release 才 `visionHostClose`);②宿主侧对重复 `init` 回 `ready`(幂等)而不是静默忽略;③VisionAssistant 对 `ai` 视图也让位(与 games 同款互斥);④客户端握手加超时(8s)→ reject + 自动 visionHostClose 重试一次。
- 置信度:**Confirmed**(协议行为逐行可推演,无需运行时)。

### V-6 VisionAssistant 无「窗口最小化/隐藏」收敛 —— 摄像头持续占用 【Confirmed|隐私/资源泄漏,违反 R131.3④】
- 位置:全 renderer 仅 `MiniGamesView.tsx:1028-1030` 订阅 `onMainWindowVisibilityChanged` → `vision.disable()`;`VisionAssistant.tsx` 无对应 effect;宿主窗口 `backgroundThrottling:false`(`main/index.ts:1119`,注释明言「keep rVFC/the synthetic timer running while hidden」)。
- 触发:assistantOn=1(非 games 视图)→ 最小化主窗口 / close-to-tray。
- 后果:隐藏宿主窗口继续 getUserMedia + 60fps 推理 + 每帧 BroadcastChannel 广播(没人消费);摄像头指示灯常亮。PRD R131.3④ 验收点「窗口最小化 → 摄像头轨道 stop」只覆盖了 games 路径。
- 修复草案:`useVisionInput` 内统一订阅 `onMainWindowVisibilityChanged`(不可见 → `disable()` 或至少 `setPaused(true)` + 宿主 `teardown()`);或在 hook 层提供 `useVisionLifecycle` 包装(见 §5)。
- 置信度:**Confirmed**。

### V-7 `window-all-closed` 清理列表不含 visionHost 【Confirmed|孤儿进程风险】
- 位置:`main/index.ts:1794-1802` —— 关 `closeAllOverlays/closeAllAudioVizWindows/closeAllScreensaverWindows`,**无 visionHostWindow**。
- 触发:主窗口真正销毁而宿主还开着(如未来去掉 close-to-tray、或主窗口 destroy 路径)。
- 后果:`window-all-closed` 永不触发(仍有隐藏窗口存活)→ app 不退出 → 孤儿渲染进程 + 摄像头常亮。当前 close-to-tray 默认拦了 close,风险潜伏但结构存在。
- 修复草案:`window-all-closed` 与 `before-quit` 补 `if (visionHostWindow && !visionHostWindow.isDestroyed()) visionHostWindow.destroy()`(destroy 而非 close,避免又触发 closed 钩子歧义)。
- 置信度:**Confirmed**(结构缺陷;当前默认配置下触发面窄)。

### V-8 宿主 rVFC `tick()` 无 try/catch —— 单帧异常冻结整条管道 【Confirmed|静默功能死】
- 位置:`visionHostMain.js:98-115`。
```js
const tick = (now, meta) => {
  ...
  const r = pipeline.processFrame(now, { source: video })  // ← 无守卫
  emit(r.events, r.snapshot)
  ...
  if (pipeline?.running) vfcId = video.requestVideoFrameCallback(tick)
}
```
- 触发:`processFrame` 内任意异常 —— `detectForVideo` 偶发抛错(MediaPipe 已知在时间戳/上下文丢失时会 throw)、`session.onFrame` → `handGeometry`(gesture_engine.js:36-44 **直接索引 `lm[0]/lm[5]…` 无长度守卫**,`_pickHands`(session.js:411)只校验 `h.landmarks` 存在与 score)、`chords.update`(有长度守卫)、`emit` 序列化异常。
- 后果:tick 抛错 → 本次回调结束 → **`requestVideoFrameCallback` 链断裂**(下一行不再执行)→ 宿主不再产出任何 snapshot/event;客户端 `frameRef` 停更、UI 卡在最后状态,**无任何 error 通道**。对照组:旧主线程版 `vision_input.js:190-194` 有 `catch → onStatus('frame error')`,R136 迁移到宿主时该防御**丢失**。
- 修复草案:tick 主体包 try/catch(计数,连续 ≥N 错 `post({type:'error'})` 并 `teardown()`);`handGeometry` 首行加 `if (!lm || lm.length < 21) return null` 并在调用侧跳过该手。
- 置信度:**Confirmed**(防御缺失确定;实际触发频率依赖 MediaPipe 运行时,未测)。

### V-9 `channel.onmessage` 为 async 且无整体捕获 【Confirmed|unhandledrejection + 静默死】
- 位置:`visionHostMain.js:128-178`。`case 'capture'`(168-174):`teardown(); await startCamera(msg.camera)` —— getUserMedia 失败(设备拔出/占用)→ rejected promise 无人接 → unhandledrejection;此时 `pipeline.running` 仍 true 但 video 已移除 → 管道冻结,客户端无感知。其余 case(`settings/pause/forceReady…`)同样直通引擎方法。
- 修复草案:onmessage 主体 try/catch → `post({type:'error', message})`;capture 失败需回滚(恢复旧流或 post error 让 UI 提示)。
- 置信度:**Confirmed**。

### V-10 `startCamera` 元数据等待无错误分支;客户端握手无超时 【Confirmed|永久挂起】
- 位置:`visionHostMain.js:93` `await new Promise((r) => { video.onloadedmetadata = r })`(无 onerror/timeout);客户端 `useVisionInput.ts:179-237` `await new Promise` 无超时。
- 触发:摄像头流协商后元数据不达(驱动异常)、宿主脚本加载失败(loadURL 失败则连 host-hello 都没有)。
- 后果:enable() 永久 pending —— AI Lab `busy` 永久 true(按钮禁用)、VisionAssistant `.catch(() => undefined)` 静默;用户只能重启。
- 修复草案:两端超时(如宿主 5s / 客户端 10s → reject + cleanup);客户端 reject 后走 V-3 的回滚。
- 置信度:**Confirmed**(结构确定,触发依赖硬件异常)。

### V-11 renderer 无全局 error / unhandledrejection 捕获 【Confirmed|可观测性缺失】
- 位置:`grep window.onerror|addEventListener('error'|unhandledrejection src/renderer/src` → 仅 `useEngineLoop.ts:228`(worker error → console.warn)与 audio 元素 error。主进程有 `crashLog.ts:29-30`,renderer 无对应物。
- 后果:视觉路径所有 JS 异常(含 V-4/V-9 的宿主侧、渲染层事件回调)只进 devtools 控制台;「Crashpad 空 + 日志无 Vision 错误」与此互证 —— **不是没出错,是出了也看不见**(商业级盲区)。
- 修复草案:入口(main.tsx)注册 `window.addEventListener('error'/'unhandledrejection')` → 经 preload 白名单 IPC 写入主进程文件日志(复用 shared/logger 通道);视觉事件额外打 `vision` 标签。
- 置信度:**Confirmed**。

### V-12 相对光标 NaN 永久污染,无自愈 【Likely|功能死,不崩】
- 位置:`src/renderer/src/vision/cursor.ts:87-103, 112-123`;入口 `VisionCursor.tsx:44-54`;状态宿主 `VisionAssistant.tsx:31` `useRef(createCursorState())`(组件常驻 → state 不重建)。
- 链路:某帧 landmark 坐标 NaN(MediaPipe 极端帧)→ `handGeometry` 产出 NaN palm → `cursorSnapshot`:`Number.isNaN(s.prevPalmX)` 首帧把 prevPalm 赋成 NaN;下一帧 `dx = x - NaN = NaN`,`dist < deadZone` 对 NaN 恒 false → `anchorX = clamp01(NaN) = NaN`(Math.min/max 不滤 NaN)→ `cursorIntegrate`:`s.x = nx + (NaN - nx) * pull = NaN` **永久**;`palm=null` 分支只清 vel/prevPalm 不清 anchor → 无恢复路径。对照:DirectionRing 有 `releaseAll → smooth.reset()`(丢手即自愈),cursor 无 reset 调用点。
- 后果:光标静默消失(canvas 对 NaN 不画、elementFromPoint(NaN) 得 null),不崩溃;assistant 存续期内不可恢复。
- 修复草案:`cursorSnapshot` 对 `!Number.isFinite(palm.x/y)` 直接按 null 处理 + `resetAnchor(s)`;`geomPredicted` 生成处(pipeline.js:184-187)同样加 isFinite 守卫。
- 置信度:**Likely**(传播链确定;NaN 源头频率未实测)。

### V-13 `setState` updater 内做副作用(StrictMode 双调用) 【Likely|低危】
- 位置:`VisionAssistant.tsx:43-51`(toggleTextMode:`vision.setChordTextMode` + `setTyped/setTrainer` 在 updater 内)、`53-60`(toggle:`localStorage.setItem` + `vision.disable()` 在 updater 内)。
- 触发:dev StrictMode(main.tsx:73)updater 双调用;React 19 保留该语义。
- 后果:`disable()/setChordTextMode` 幂等暂无害;但 updater 内再调 `setTyped('')/setTrainer(...)` 违反纯函数契约,React 并发特性(重放/中断恢复)下 trainer 状态可能错乱;生产构建不受 StrictMode 影响。
- 修复草案:副作用移出 updater(`onClick` 里先算 next 再依次调用)。
- 置信度:**Likely**(代码模式确定;实际错乱窗口小)。

### V-14 `pipeline.setPrimaryHand` 直捣嵌套字段 【Likely|TypeError 潜伏】
- 位置:`pipeline.js:112` `this.session.cfg.dualHand.primaryHand = side` —— `session === null`(未 init 时收到 primaryHand 消息,`visionHostMain.js:158` 的 `if (!pipeline) return` 挡不住 pipeline 非 null 而 session null 的中间态)或 sessionCfg 缺 dualHand(外部注入 cfg)→ TypeError → V-9 链。
- 修复草案:`if (!this.session?.cfg?.dualHand) return`。
- 置信度:**Likely**(当前 UI 恒传 dualHand;防御缺失)。

### V-15 `vision_input.d.ts` 与 host 管道 stats 漂移 【Confirmed|文档性,无崩溃】
- 位置:`vision_input.d.ts:25-39` 声明 `acquire/lowFps/cam` 必有;`pipeline.js:207-217` `stats()` 只给 `infer/hand/face/fps:0/inferFps/delegate`。消费端 `VisionBanner.tsx:31`(可选链)、`AiLabVisionTab.tsx:419-421`(条件)均安全。另:`VisionInput` 类(R131 主线程版)仍留在 d.ts,实际 host 用 `VisionPipeline` —— 双轨声明易误导。
- 修复草案:d.ts 标注可选 + 注明 host 管道为真源;或直接为 pipeline.js 写 d.ts。
- 置信度:**Confirmed**(漂移确定,当前无崩溃路径)。

### V-16 `primaryHand` 初始化裸读 localStorage 【Speculative|渲染期异常源】
- 位置:`useVisionInput.ts:300-302` —— 相邻的 `readBool/readSensitivity`(21-37)均有 try/catch,此处没有。localStorage 抛错(极端:策略禁用/存储损坏)→ **渲染期异常** → 直接命中 V-1(无 ErrorBoundary)→ 白屏。
- 修复草案:套同款 try/catch + 白名单校验(`raw === 'Left' ? raw : 'Right'` 也顺带防脏值)。
- 置信度:**Speculative**(Electron renderer localStorage 常态可用;R223.6 证明测试环境曾有空壳问题)。

### V-17 引擎层 landmark 数组无长度/元素校验 【Likely|经 V-8 放大为管道冻结】
- 位置:`gesture_engine.js:36-44`(`handGeometry` 直接 `lm[0].x…lm[17].x`)、`fingerChords.js:21-33`(`fingerStates` 直接索引;`ChordEngine.update` 有 `lm.length < 21` 守卫但**组件直调的 `fingerStates`** 依赖调用方守卫 —— VisionCursor.tsx:49 与 AiLabVisionTab:357 均有守卫 ✓)。`_pickHands`(session.js:411)只查 `landmarks` 真值与 score,长度 <21 或元素 null/undefined 的数组可直达 `handGeometry`。
- 后果:TypeError → V-8(宿主帧链断)。渲染侧消费(VisionPad:152 `Array.isArray && length===21` 后 `hand[i].x` 仍有元素级风险,但整段在 try/catch 内 ✓)。
- 修复草案:`_pickHands` 过滤条件加 `h.landmarks.length === 21`;`handGeometry/fingerStates` 入口防御。
- 置信度:**Likely**(MediaPipe 正常输出恒 21 点;防御纵深缺失)。

### V-18 宿主 `pipeline` 停止后不置 null(复用语义破坏) 【Confirmed|设计陷阱】
- 位置:`visionHostMain.js:175` `'stop'` 后 `pipeline` 保留;131 行 `if (pipeline) return` 以「已初始化」为由吞掉后续 init。当前依赖「disable 必关窗口」的隐含契约才正确;一旦 V-7 修成窗口复用、或 close 失败,后续 enable 全部挂死(同 V-5 机理)。
- 修复草案:`'stop'` 分支收尾 `pipeline = null`(连同 V-4 的 stop 守卫一起修)。
- 置信度:**Confirmed**(代码确定;当前主流程被窗口销毁掩盖)。

---

## 3. 生命周期成对性盘点表

| 句柄/资源 | 创建点 | 清理点 | 漏清理路径 |
|---|---|---|---|
| rAF 循环(VisionCursor) | VisionCursor.tsx:95 | 同 effect cleanup:97-99(cancel + 移除 vision-hover class) | ✓ 无(循环体整体 try/catch:38-92) |
| rAF 循环(VisionBanner) | VisionBanner.tsx:42 | cleanup:43 | 无 try/catch 但操作面窄(style.width/envAdvice);state 异常值仅产生 NaN% 无效 CSS,不崩 |
| rAF 循环(VisionPad) | VisionPad.tsx:93 | cleanup:94 | ✓ draw 整体 try/catch:86-90 |
| setInterval(AiLab 120ms ticker) | AiLabVisionTab.tsx:348 | cleanup:389 | ✓ |
| setInterval(宿主 synthetic) | visionHostMain.js:144 | teardown():121 | ✓(stop/init 失败均走 teardown) |
| rVFC(宿主视频帧回调) | visionHostMain.js:115 | teardown():119-120 | **V-8:tick 内异常断链,teardown 永不被调**(客户端只等窗口销毁) |
| getUserMedia tracks | visionHostMain.js:84 | teardown():122(`t.stop()`) | **V-6:assistant 路径最小化不触发**;**V-7:app 退出路径依赖窗口销毁兜底** |
| BroadcastChannel(客户端) | useVisionInput.ts:176 | disable():246 | **V-2(双开泄漏)、V-3(失败残留)** |
| BroadcastChannel(宿主) | visionHostMain.js:20 | 窗口销毁隐式释放 | ✓(单窗口生命周期内常驻是设计意图) |
| 宿主隐藏窗口 | main visionHostOpen:1112 | visionHostClose:1131 / 'closed':1122 | **V-5(无引用计数)、V-7(window-all-closed 漏)、V-6(无人调)** |
| window 'vision-input' 监听 | VisionAssistant:111 / AiLab:341 / MiniGames:763 | 各自 removeEventListener | ✓ 三处成对 |
| onMainWindowVisibilityChanged | 仅 MiniGamesView:1028 | preload 返回的反注册 | **V-6:assistant/AiLab 无订阅** |
| MediaPipe landmarker 实例 | 宿主 loadLandmarkers:38-65 | 无显式 close(HandLandmarker.close() 未调) | 窗口销毁即释放 ✓;若未来窗口复用则泄漏(与 V-18 联动) |
| localStorage 写入 | useVisionInput 各 setter | n/a(持久化是目的) | ✓ 全部 try/catch |
| setTimeout(退出提示 2.5s) | MiniGamesView:1018 | cleanup:1019 | ✓ |
| React state setter after unmount | channel.onmessage 闭包 | disable 先 close channel → 消息不再投递 | ✓(React 19 无警告且无害);StrictMode 双挂载靠 disable 幂等承受 ✓ |

---

## 4. 近期 5 个视觉提交逐条复核

| 提交 | 复核结论 |
|---|---|
| `977d19c` R153 vision-lab 核心看板 | **未发现崩溃级缺陷**。BOARD_IDS 看板/折叠组渲染全部经 `rows[cap.id]` 可选访问;`hidden` 行保留 DOM;13 项组件测试。遗留:间接消费 V-5(与 assistant 共存挂死)非本提交引入。 |
| `dea8b98` R149 左手瘫痪修复 | **未发现崩溃级缺陷**。`_pickHands` 单手晋升(session.js:419-422)逻辑闭合;新增 setPrimaryHand 全链有 V-14 防御缺失(本提交引入该链路)。 |
| `8e0bb50` R142-E4b app 级手势助手 | **本提交是 V-5/V-6/V-13 的引入者**:常驻 App 根的第二 useVisionInput 实例 + 只对 games 让位的互斥 + 无最小化订阅 + updater 副作用。单实例内自洽(测试 3 用例全绿),多实例/最小化两条边界未设防。 |
| `a387fdc` R143 cursor prediction + fist clutch | **V-12 引入者**:两时钟架构(cursorSnapshot/cursorIntegrate)无 NaN 自愈路径;fist 判定 `lm.length===21` 守卫 ✓;commit-on-release 引擎(fingerChords)边界干净。 |
| `cbc4519` R142-E1 60fps 捕获 | **放大器而非引入者**:camera 640×480@60 + maxFps 60 + `backgroundThrottling:false` 使 V-6 的最小化泄漏从「低频推理」升级为「满速推理+摄像头」;geomPredicted 的 clamp(pipeline.js:184-187)不滤 NaN,为 V-12 供源。握手 host-hello 重发机制本身正确(修过首版挂起)。 |

---

## 5. 系统性加固方案

1. **ErrorBoundary 两层**(修 V-1):全局边界(App 外壳 fallback)+ 视觉子系统边界(`<VisionAssistant>`、games 的 Banner/Pad/Cursor 组)。fallback 需带「重试」(remount key)与诊断上报。
2. **useVisionLifecycle / 状态机化 useVisionInput**(修 V-2/V-3/V-5/V-6):enable 的 in-flight 复用、失败自回滚、握手超时、模块级宿主仲裁器(引用计数 acquire/release);`onMainWindowVisibilityChanged` 收敛进 hook 本体,所有消费者(assistant/AiLab/games)自动获得。
3. **宿主消息层防御**(修 V-4/V-8/V-9/V-10/V-18):onmessage 整体 try/catch → post error;tick try/catch + 连续错误熔断;stop 幂等 + pipeline=null;startCamera 错误分支;handGeometry 长度守卫(V-17)。原则:**任何引擎异常必须映射为 `{type:'error'}` 让 UI 可见,不允许静默冻结**。
4. **可观测性**(修 V-11):renderer 全局 error/unhandledrejection → 主进程文件日志(与 crashLog.ts 同目录);宿主窗口同样注册。视觉事件打 tag,便于「日志无 Vision 错误」变成可靠结论。
5. **数值防御**(修 V-12/V-15):isFinite 门(handGeometry 出口、geomPredicted、cursorSnapshot);d.ts 与实现对齐。
6. **进程生命周期**(修 V-7):window-all-closed / before-quit 显式 destroy 宿主。crashReporter 已覆盖(crashLog.ts:28 在 app ready 前 start,app 级含宿主),无需新增 —— 本项保持现状。

## 6. 修复顺序

- **P0(0 崩溃门槛)**:V-1、V-8+V-17、V-4+V-18、V-2/V-3、V-5(至少 AI Lab 让位 + 握手超时)、V-6。
- **P1**:V-7、V-9、V-10、V-11、V-12。
- **P2**:V-13、V-14、V-15、测试缺口(见 §7)。
- **P3**:V-16、d.ts 双轨清理、i18n undefined-key 回退验证(已验:`i18n/index.tsx:3622-3624` `?? key` 回退,安全 —— 移入已验清单)。

## 7. 回归测试缺口清单(现有:tests/vision 9 引擎文件 + useVisionInput.test 13 用例 + VisionAssistant.test 3 + AiLabVisionTab.test 13)

| 缺口 | 建议用例 |
|---|---|
| visionHostMain.js 宿主协议 **0 测试** | init 失败→stop 不抛;stop 后再 init;tick 抛错后管道不死(修复后);capture 失败回 error |
| useVisionInput 竞态 0 测试 | 并发双 enable 只开一通道;失败后 enable 可重试(V-3 回归);双实例共享宿主互斥 |
| VisionCursor/VisionPad/VisionBanner 组件 0 测试 | draw 循环空 frame/NaN landmark 不抛;卸载后 rAF 停(计数 mock) |
| 空/短 landmark 注入 0 测试 | landmarks=[]、长度 5、元素 null 过 session.onFrame 不抛 |
| 最小化收敛 | assistant 场景 visibility→false 断言 visionHostClose(修 V-6 后) |
| NaN 快照 | geom.palm NaN → 光标恢复(修 V-12 后) |

## 8. 已检查且安全清单

- VisionCursor / VisionPad 绘制循环整体 try/catch(VisionCursor.tsx:38-92、VisionPad.tsx:86-90)。
- 三处 `vision-input` window 总线监听全部成对移除。
- `disable()` 幂等(null 安全 + 全状态复位),StrictMode 双挂载下无害。
- `visionHostOpen` 窗口单例守卫(不会开两个窗口);`visionHostClose` 同步置 null 避免了 close/open 竞态。
- host-hello 握手重发(R136 修)逻辑正确,`initSent` 守卫防重复 init 配套。
- storedProfile 损坏链:`useVisionInput.ts:168-171` try/catch + `pipeline.js:69-73` `_applyProfile` try/catch 双兜底;旧结构注入最坏产生 NaN 行为,不崩。
- vision 资产打包完整性(models/*.task + vendor/mediapipe 不在排除列表,out/ 实测存在)。
- crashReporter 覆盖:`crashLog.ts:28` app 级启动(含宿主进程);主进程 uncaught/unhandled 落盘且防递归、轮转。
- i18n `t()` 对未知 key 回退 key 字符串(index.tsx:3622-3624),非法 state 字符串渲染安全。
- `LatencyMeter.push` 有 NaN/离群过滤(latency.js:10);`ChordEngine.update` 有长度守卫;AiLab 的 `fingerStates` 调用有守卫。
- MiniGamesView:hub 收敛、卸载收敛(hook 自身)、TD 屏 setPaused、退出提示 timer 清理、`releaseAllEngineInputs`(R220.1⑨)放键不变式。

## 9. 未验证项与局限

1. **未运行时验证**(约束禁启 electron):V-8 的 MediaPipe detectForVideo 实际抛错频率、V-12 的 NaN 出现率、V-2 双击可复现窗口宽度,均为静态推断(路径确定、概率未测)。
2. 用户环境 Crashpad 空只能证明「无 native 崩溃」,**JS 异常因 V-11 本就不可见**,不能据此断言视觉路径零异常。
3. `face_engine.js`、`synthetic.js`、`envCoach.ts`、`App.tsx` 全文(仅视觉相关段)未逐行审;非本任务主链路,风险面小。
4. CSS 层级(径向菜单/光标 canvas 在全屏游戏下的 z-index 残留)未验证 —— 组件条件渲染(`activeView !== 'games'` 时不渲染)覆盖了主要场景。
5. 双实例挂死(V-5)的完整时序在真实 React 调度下的表现(理论上 await 排队后必然挂死,未实测确认 UI 表现细节)。
6. tests/vision 9 个引擎测试文件只核对主题覆盖(session/engines/chords/pickHands/pipeline/prediction/reliability/dualhand/fixtures),未逐条重跑(约束:只读,yarn test 可跑但未获准运行 —— 未执行任何仓库脚本)。

---

*审查人:Claude(UI 稳定性审查工程师)。全部发现基于只读代码审计;每条含 file:line 可独立复核。*
