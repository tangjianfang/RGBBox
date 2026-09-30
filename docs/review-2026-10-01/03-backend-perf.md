# 03 后端性能审查报告 —— 后台线程 / 引擎 worker / 外部进程 / 缓存 / 捕获

- 审查对象：RGBBox @ main 93d365f（未发布）；已发布 0.3.84 zip（文件哈希 03477e1946a114c1，09-26）。关键修复版本归属已逐条核对 git。
- 方法：全部发现亲自读到代码；用户真实日志/配置只读测量；引擎成本在**本机（=用户机器）** Node 23 下实测（esbuild 打包 src/engine 纯 TS，临时目录运行，未启动应用）。
- 置信度分档：Confirmed（代码+实测/日志双证）/ Likely（代码证，成本未实测）/ Speculative。

---

## 0. 摘要：对「整体严重卡顿延迟」的后端归因（按证据强度）

| # | 归因 | 强度 | 证据 |
|---|---|---|---|
| 1 | **CPU 引擎每帧成本超预算 2~17 倍**：317×178（56,426 px）下单层 static 实测 66ms/帧（30fps 预算 33.3ms）；fire 137ms；默认 scene-desk 五层全开 444~580ms/帧（≈2fps）。病灶是「每像素重复解析参数 + 每像素对象/闭包分配」 | **Confirmed（实测）** | §3 基准表 |
| 2 | **AST 音频推理阻塞主进程**：onnxruntime-node 在 main 进程同步推理，代码注释自认 ~1.4s/3s 窗口（占空比 ~45%），期间全部 IPC（overlay 帧中继、captureScreenSample、profile 保存）排队。用户已缓存 ast_audioset_int8.onnx（90.6MB）且 09-14~09-26 在用该管线 | **Confirmed（代码自证）** | B-2 |
| 3 | screen-ambient 时**每 tick 在主进程跑 desktopCapturer.getSources**（全屏缩略图），与 #2 同一事件循环 | Confirmed（机制）/ Likely（成本） | B-3 |
| 4 | AudioAi 失败路径**无熔断**：feed 失败后渲染层永不停喂（日志 ×587 "no active audio stream" 持续到 09-26）；session-create 失败无退避（历史上 ×1075 风暴） | Confirmed（日志+代码） | B-4 |
| 5 | 引擎 worker 崩溃后 `tickPending` 永不复位 → 引擎静默死锁 | Confirmed（代码路径，触发罕见） | B-5 |

用户当前 profile（scene-desk 单 static 层）实际引擎成本 ≈66ms/帧 ≈ 15fps——即使用最便宜的效果也只有一半帧率；一旦切默认五层场景或重效果即跌至 2~7fps。这是「卡顿」的主导后端因素；#2 在开启 AI 聆听时叠加主进程级冻结。

---

## 1. 发现清单（B-1…）

### B-1【P0】引擎公共路径每像素做「应按帧做」的事 —— 引擎过载根因
- **位置**：`src/engine/previewEngine.ts:93-147`（每像素 new baseContext/screenPixel/previousColor 对象、每层每像素 `String()`×2+`parseInt`）；`src/engine/effects.ts:185-235` 等（每像素 `String(layer.parameters.text)`、`hexToRgb(String(color))` 字符串解析、`Number()`×4~5）；`src/engine/color.ts:58-78`（`mixColors` 每次调用创建 `blendChannel` 闭包 + 返回新 `{r,g,b}`；applyBrightness/adjustSaturationAndContrast/lerpColor 又各分配一个）。
- **量化**：56,426 px × (~1.2µs/px) = 66ms/帧（static 单层）；基线对照（同形分配循环）仅 0.53ms/帧 → **公共路径比裸循环慢 ~125 倍**，与效果种类几乎无关（各效果 444~580ms 全开、离散度 <15% 也印证）。GC 压力：每帧 ~30-40 万次小对象分配，fire p95=267ms（med 124ms）的抖动即 GC 停顿。
- **后果**：30fps 预算 33.3ms 全线击穿；single-flight 丢帧（droppedTicks）成为常态；worker 忙轭持 CPU 一核。
- **修复**：① renderPreviewFrame 每帧每层预解析参数（颜色 hex→{r,g,b} 一次、Number() 一次、maskZone/displaySlot 一次）并传入预构建 ctx；② mixColors 按模式内联消除闭包、输出写入复用的 scratch 对象或直接写 pixels；③ 顶部效果（fire/aurora/lightning/rainbow）提供整层快路径（fire 已有列缓存先例 effects.ts:157-163）。预期 5~20×。
- **置信度：Confirmed**（本机实测 + 代码）。

### B-2【P0】AST 推理同步阻塞主进程（占空比 ~45%）
- **位置**：`src/main/audioAiService.ts:26-28,154-158`——注释原文：AST "runs mel (pure-JS FFT) + inference synchronously on the main thread"、"`~1.4s/window`; at 1.2s cadence the main thread was back-to-back blocked. 3s keeps duty cycle ~45% until the worker-threads offload (parked with P2)"。`astMelSpectrogram`（main/audio/melSpectrogram）+ `session.run` 都在 main。
- **触发**：AiLabAudioTab 或 **AiListenOverlay**（`src/renderer/src/components/AiListenOverlay.tsx:23`，`enabled && modelsReady` 时启用 'system' 回放监听）→ `audioAiStreamFeed`（index.ts:948）→ feedStreamInner AST 分支（audioAiService.ts:269-291）。
- **后果**：主进程每 3s 冻结 ~1.4s → 期间 overlay 帧中继（`webContents.send`）、captureScreenSample、profile 保存、托盘/窗口 IPC 全部排队 → 「整体」卡顿感（不限于 AI 页面）。
- **修复**：迁 utilityProcess（`denoiseService.ts` 已有 fork+postMessage 先例，16k 块协议可直接套）；过渡期把 AST 窗口降到 2s/占空比封顶、AiListenOverlay 默认关。
- **置信度：Confirmed**（代码注释自证 + 用户已缓存模型且日志证明在用）。

### B-3【P1】screen-ambient 每 tick 触发主进程 getSources（无节流）
- **位置**：`src/renderer/src/hooks/useEngineLoop.ts:91-107`（每 tick `await window.rgbbox.captureScreenSample`）→ `src/main/index.ts:1000-1010` → `screenCapture.ts:46-77` → `captureProviders/desktopCaptureProvider.ts:19-48`（`desktopCapturer.getSources`，缩略图 317×4=1268 × 178×4=712）。多屏 linked 模式更对每屏各抓一次。
- **后果**：getSources 是全屏捕获+缩放（Electron 在 Windows 走 DDA/GDI 路径），典型 15-80ms/次（未实测，判 Likely），且跑在主进程——与 B-2 同一事件循环，叠加时 IPC 延迟雪崩。single-flight 会把实际捕获频率压到「每完成一帧一次」（过载时反而自保护），但 66ms/帧的 static 场景下仍 ~15Hz 持续捕获。
- **修复**：最小间隔节流（如 ≥150ms 才真捕，其余复用上一帧样本）；中期换常驻 capturer 流（getDisplayMedia 帧回调）替代逐次 getSources；DXGI/SCK stub（captureProviders/dxgiProvider.ts）落地后天然解决。
- **置信度：Confirmed（机制）/ Likely（单次成本，未实测——不许启动应用）**。

### B-4【P1】AudioAi 失败路径无熔断/退避（×1075 + ×587 的触发链结论）
- **×1075 "Load model from file:///…"**：全部集中在 2026-09-14 13:15:34→13:32:03（988 秒内 1075 次 ≈ 每 920ms 一次）。触发链：当时版本 findCached 返回 file:// URL → onnxruntime-node 无法加载 → **`getSession`（audioAiService.ts:71-84）不缓存失败 promise（防 sticky rejection 的设计）且 VAD 路径无退避** → 渲染层每批继续 feed → 每次重新尝试 InferenceSession.create（读+解析 639KB 模型，主进程同步开销）。**根因（file:// URL）已于 00c0941（09-14）修复，日志至 09-30 无复发——修复在野外验证有效**。但「create 失败→每 feed 重试」的机制仍在：若模型存在但无效（±10% 字节校验漏过的损坏），同样风暴会重演。AST 分支已有 10s 退避（audioAiService.ts:284-291），VAD 分支没有。
- **×433+×154 "no active audio stream"（09-14→09-26 持续）**：渲染层 `useAiAudioStream.ts:59-72` 在 feed 失败后仅累计 failures、置 stage='error'（>10 次），**从不停止 pcm 回调/teardown** → 主侧会话已 null（stopStream 计数归零）后仍每 300ms 打一次 IPC+WARN 日志，直到组件卸载。这是「失败→显示错误但管道继续空转」的确认缺陷。
- **×233 "Non-zero status code … LSTM Input X {1,1,1,128,3}"**：VAD 分块尺寸 bug（>512 样本/块导致 LSTM 秩爆炸），同日已由 VAD_CHUNK=512 修复（audioAiService.ts:17-21 注释），日志无复发。
- **修复**：① getSession 失败退避（复用 astBackoffUntil 模式）；② useAiAudioStream 在 failures>10 时执行 teardown（停源）；③ feedStreamInner 每个 await 后重验 `stream` 非空（见 B-6）。
- **置信度：Confirmed**（日志时间序列 + 代码）。

### B-5【P1】worker 崩溃后引擎死锁：tickPending 永不复位
- **位置**：`useEngineLoop.ts:66/148/215-224`——tickPending 仅在 `onWorkerMessage` 里清零；`worker.addEventListener('error')`（:228）只 console.warn，`messageerror` 未监听。若 worker 抛未捕获异常死亡或反序列化失败 → 无响应 → tickPending 卡 true → 之后所有 tick 全部记为 droppedTicks，引擎静默停摆，直到用户切 running/profile 触发 effect 重建。
- **修复**：error/messageerror 里 `tickPending = false`；加看门狗（N×周期无响应 → terminate + 重建 worker）。
- **置信度：Confirmed（代码路径；触发条件罕见）**。

### B-6【P2】stopStream/feedStream 数据竞争
- **位置**：`audioAiService.ts:225-248`——feedStreamInner 入口检查 `if (!stream) throw` 后，VAD 循环内 `await session.run(...)` 让出事件循环；期间 `stopStream()`（:192-195）将 `stream=null`，恢复后 `stream.vadState = ...`（:245）/`stream.carry = ...`（:248）抛 `Cannot set properties of null`。**日志确认发生 ×2**（grep 实证）。
- **修复**：把判空快照为局部 const 并在写回前校验，或 stopStream 也经 feedChain 串行化。
- **置信度：Confirmed**。

### B-7【P2】shutdown 重复布防被当作 spawn-failed
- **位置**：`src/main/shutdownScheduler.ts:51-81`。日志 4 次失败（09-29 16:55:46/49…）stderr 实为 GBK 的「已经计划系统关机。(1190)」——Windows ERROR_SHUTDOWN_IN_PROGRESS：**用户在已布防状态下再次布防**，属正常业务态却被归类 `error:'spawn-failed'` 且 UI 无「已布防，是否重设」分流。execFile 无 timeout（shutdown.exe 秒退，风险低）；无子进程树（单命令，无需杀树）；quit 不撤销计时器是特性设计（:9-14 注释）。
- **修复**：arm 前先查 getShutdownStatus；检测 1190 → 自动 `/a` 再重布防或返回 'already-armed'；日志 stderr 按 GBK 解码避免乱码。
- **置信度：Confirmed**（日志 stderr + 代码）。

### B-8【P2】Profile 双写放大 + 非原子写
- **触发链结论（×560×2）**：`useProfileManager.ts:54-68`——profile 对象身份每次变化后 400ms debounce，然后**同毫秒双写**：`saveProfile`（config/profile.json）+ `saveProfileAs`（config/profiles/<id>.json），日志两行时间差 1ms 证实。560 次保存事件 = 1120 行/1120 次文件写；峰值 36 次/分钟（=72 写/min，09-23 17:17，对应参数拖拽）。203 次启动 vs 560 次保存 ≈ 2.8 次/启动/天——**无失控循环**，成本可忽略（单文件 ~1KB）。真正问题：①双写是设计上的写放大（P3 级）；②`profileStore.ts:27-31/65-71` 用 `writeFile` 直写**非原子**——崩溃/断电可截断 profile.json（loadProfile 的 catch 会静默回落 defaultProfile，用户丢配置且无感知）。
- **修复**：tmp+rename 原子写；named 槽位改为「切换/退出时」延迟落盘。
- **置信度：Confirmed**（日志 + 代码）。

### B-9【P2】computeTextMask 一次性 ~220MB 瞬时分配 + 无界缓存
- **位置**：`src/renderer/src/canvasTextMask.ts:28-50`——canvas 固定 32px/格：317×32=10144 × 178×32=5696 → `getImageData` = 10144×5696×4 ≈ **220MB**（worker 内单次），fillText 也是万级像素画布。按 key 缓存（text|grid|pos|scale|weight）→ 静态文本只算一次（automation 白名单 `automation.ts:9` 不含 textX/textY/textScale，键不会逐帧变化——已排除风暴场景）。`cache = new Map()`（:9）**无上限**，多文本/多网格切换只增不减（每条 ~56KB boolean）。
- **修复**：过采样降到 2-4px/格（10k 网格 → <4MB，位图字体 5×7 分辨率本就用不了 32×）；缓存 LRU cap。
- **置信度：Confirmed（算术）/ 影响频度 Low**。

### B-10【P3】useEngineLoop 消费门禁的正确性与缺口
- **位置**：`useEngineLoop.ts:204-206`：`overlayActive || (windowVisible && view==='workspace')`。已验证：最小化/隐藏/非 workspace 视图（含 games）→ 正确暂停 ✓（windowVisibleRef 由主进程 IPC 喂，index.ts:184-199）。**缺口**：games 视图 + overlay 开着时引擎照跑（R38 设计如此）——叠加默认五层场景 ≈460ms/帧 worker 载荷会直接挤占游戏帧预算（跨报告线索：游戏组应实测此场景）。
- **置信度：Confirmed（逻辑）；后果频度取决于用户组合**。

### B-11【P3】LAN 快照三重序列化
- **位置**：`MiniGamesView.tsx:1043`（`JSON.parse(JSON.stringify(s))` 预克隆）→ IPC 结构化克隆 → `lanProtocol.ts:126-127` encodeFrame 再 JSON.stringify。15Hz、td 状态体积小，实测影响可忽略；纯属可省的一次序列化。主侧 `lanService.ts` 心跳/判死/世代/超限帧丢弃/房间清理（teardown :359-380）检查无泄漏。
- **置信度：Confirmed（机制）/ 影响可忽略**。

### B-12【P3】杂项（均已核实代码）
- `index.ts:214-229`：F2 的 `before-input-event` 注册了**两次**（一开一 toggle），每次按键双触发，净效果不确定——删一个。
- `agentTools.ts:174-209`（coding-agent 的 bash 工具）：有超时 kill + 16MB 输出上限 ✓；但 Windows 下 `child.kill()` 不杀孙进程（bash -c 的子树）——补 `taskkill /T /PID`。该功能仅在 AI 工作台显式使用，非常驻。
- `ocrService.ts:11-21` execFile（RapidOCR）与 vision host（隐藏 BrowserWindow，index.ts:1083-1107）：vision 生命周期核实**无泄漏**——unmount/切视图/隐藏都会 `visionHostClose()`（useVisionInput.ts:326, MiniGamesView.tsx:939,943,2220）。
- `usePerformanceGuard` 实际语义核实（previewEngine.ts:141）：**只控制 EMA 平滑是否生效，不存在任何降级（降帧/降分辨率）路径**——名字承诺大于实现，用户以为开了保护，实际无保护。

---

## 2. 已验证无问题 / 被推翻的假设

| 假设 | 结论 |
|---|---|
| postMessage 全量 profile 序列化是热点 | **推翻**：structuredClone(profile) 实测 65µs/call ×30fps ≈ 2ms/s，可忽略 |
| worker↔renderer 帧传输不是零拷贝 | **推翻**：双向均 transfer（useEngineLoop.ts:137 转入 screenSample、previewEngineWorker.ts:137 转出 frame）。仅有两处小拷贝：ledColorsRef.set 165KB/帧（~30µs）、overlay IPC 中继克隆 196µs/跳/帧 |
| file:// 模型加载 bug 仍在 | **推翻**：00c0941（09-14）已修，日志至 09-30 无复发 |
| silero_vad ×9 下载失败=永久坏缓存 | **推翻**：文件 639KB 完整在盘（±10% 校验通过）；下载器有 4 次退避重试 + Range 断点续传（index.ts:1280-1334），环境网络问题的应用侧设防已合格 |
| 560 次保存=失控写循环 | **推翻**：400ms debounce 工作正常，~8 次/天，峰值 36 次/min 属拖拽突发 |
| vision host 泄漏 | **推翻**：见 B-12 |
| Crashpad 配置 | **验证正确**：`crashReporter.start({ uploadToServer:false })`（crashLog.ts:26-29）为 Electron 41 的 local-only 正确写法 |
| LAN 房间/套接字泄漏 | **验证正常**：teardown 全清 + 世代防误记 |

**未验证/局限**：getSources 单次成本与 overlay 端渲染成本（不得启动应用）；Chromium worker 内 JIT 与 Node 的绝对差值（方向与量级可信）；真实 droppedTicks 序列（仅 Diagnostics 视图可见）；日志中 "Non-zero status code" 归属 audioAi（已按时间簇归因 09-14 旧版）。

---

## 3. 量化实验（本机 = 用户机器，Node 23.11，esbuild 打包直跑 src/engine）

### 3.1 30fps 引擎预算表（317×178 = 56,426 px，用户实际采样）

| 阶段 | 单帧成本 | 33.3ms 预算占比 | 备注 |
|---|---|---|---|
| 机器基线（同形分配循环） | 0.53 ms | 1.6% | 证明机器不慢 |
| **static 单层（用户现状）** | **66 ms（med 65.6）** | **198%** | 最高 ~15.2fps |
| aurora 单层 | 88.5 ms | 265% | ~11.3fps |
| fire 单层 | 137 ms（p95 267） | 411% | ~7.3fps，GC 抖动大 |
| scene-desk 默认五层全开 | 444~580 ms | 1334~1742% | ≈1.7~2.2fps（首轮 120 帧实测） |
| profile 克隆（每 tick postMessage） | 0.065 ms | 0.2% | 非热点 |
| frame 克隆（165KB/跳） | 0.196 ms | 0.6%/跳 | renderer→main + main→每 overlay 各一跳 |
| capture（getSources，估） | 15~80 ms | 45~240% | 未实测，判 Likely；仅 screen-ambient 且无 overlay 时 |
| AST 推理（main 进程） | ~1400 ms/3s | —（阻塞 IPC） | 代码注释自证，B-2 |

结论：**在 30fps 目标下，计算侧单独就超预算 2~17 倍**；修复优先级应为「每帧预解析/去每像素分配」这一处公共路径（B-1），一处改动惠及全部 49 种 CPU 效果。

### 3.2 实验文件
- `C:\Users\tjf\AppData\Local\Temp\rgbbox-review-20261001\03-exp\bench.ts / bench.cjs`（首轮：五层全开各效果）
- `C:\Users\tjf\AppData\Local\Temp\rgbbox-review-20261001\03-exp\bench2.ts / bench2.cjs`（单层隔离 + 基线 + 克隆成本）

---

## 4. 调度重构方案（分级）

**分级原则**：捕获与推理分级（重活出主进程/出渲染主线程）；一切失败退避化；暂停语义按「谁在消费」完整化。

1. **计算分级**：B-1 参数预解析 + 消除每像素分配/闭包（renderer worker 内，一处公共路径）；长期按效果提供整层快路径。
2. **推理分级**：AST/VAD 迁 utilityProcess（denoise 先例）；session-create 失败统一退避（B-2/B-4）。
3. **捕获分级**：captureScreenSample 最小间隔节流 + 常驻流替代逐次 getSources（B-3）；DXGI 落地后替换 provider 即可。
4. **按视图暂停完整性**：门禁本身正确（B-10）；补 games+overlay 场景的降帧策略（overlay 投影时可降到 15fps，视觉无损于灯带）。
5. **失败退避/熔断清单**：VAD create、feed 持久失败停源、worker 看门狗（B-5）、shutdown 1190 分流（B-7）。
6. **最小改动路径**（不动架构）：B-1（纯 engine 内改，测试齐全可护航）→ B-4②③+ B-6（几行）→ B-5（两行）→ B-3 节流（十行内）→ B-2 迁移（最大件，单列 R-N）。

## 5. 修复顺序

- **P0**：B-1（引擎公共路径）、B-2（AST 出主进程）
- **P1**：B-3（捕获节流）、B-4（AudioAi 熔断）、B-5（worker 看门狗）
- **P2**：B-6、B-7、B-8（原子写）、B-9、B-10（games+overlay 降帧）
- **P3**：B-11、B-12 杂项

## 6. 应用缺陷 vs 用户环境固有

- **环境固有**：模型下载 ECONNRESET/ETIMEDOUT ×9（网络）——应用已有退避+续传+完整性校验，设防合格；仅建议把「持续失败」在 UI 常驻提示（现为一次性进度错误）。
- **应用缺陷**：B-1（在用户硬件上预算爆表是代码问题）、B-2、B-4、B-5、B-6、B-7、B-8②。

## 7. 跨报告线索

- 给渲染/前端组：overlay `webContents.send` 每帧克隆（0.6%/跳，非首恶但可改 SharedArrayBuffer）；computeTextMask 220MB 在 worker 的 GC 停顿会放大 droppedTicks；metrics 里 droppedTicks/roundTripMs 可直接复证 B-1。
- 给游戏组：games+overlay 并存时引擎循环照跑（B-10）——默认五层场景下 ~460ms/帧会直接吃掉游戏帧预算，建议实测该组合。
- 给主进程组：F2 双注册、logger GBK stderr 乱码（B-7 附带）。
