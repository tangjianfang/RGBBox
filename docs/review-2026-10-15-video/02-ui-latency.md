# RGBBox 视频工作站 UI 线程/渲染性能深度审查（02-ui-latency）

- 审查对象：`src/renderer/src/components/VideoStudioView.tsx`（2229 行）+ `components/video/` 9 文件 + `CaptureFilmstrip.tsx` + 主进程捕获/媒体链路
- 方式：静态评审（每条发现均读到 file:line）+ 临时目录微基准（Node 23.11 直跑纯函数循环，脚本在 `%TEMP%\rgbbox-review-video\bench\conv*.mjs`）。仓库未改动、应用未启动。
- 置信度标注：Confirmed = 代码路径逐行核实；Likely = 路径核实、量级推算；Speculative = 未实测。

---

## 一、Top 卡顿/耗内存根因排名

| # | 根因 | 置信度 | 量级 |
|---|------|--------|------|
| 1 | 超分每处理帧的 CPU 侧输出转换：`nchwToImageData` 纯 JS 循环 33MB/帧 + `new ImageData` 再拷贝 + `putImageData`，与推理后端无关地跑在 UI 线程 | **Confirmed**（代码+微基准：720p×2 输出 45ms、1080p×2 输出 **108ms/帧**） | 每处理帧主线程阻塞 50~115ms |
| 2 | R295 `fixWebmDuration` 在 `recorder.onstop` 里把整个录制 Blob 读成 ArrayBuffer 再做 EBML 逐子元素 `slice()` 拷贝，全程 UI 线程；内存峰值 ≈ 录制体积 3~4×，随录制时长线性放大 | **Confirmed**（库源码逐行读）；量级 Likely | 60s 录制约 0.2~0.5s 冻结；10min 录制多秒冻结 + GB 级内存尖峰 |
| 3 | 2229 行单组件在播放期以 ~4Hz（`timeupdate`）与录制期 4Hz（`recElapsed` 250ms interval）整树重渲染；全 components 目录 **0 处 `React.memo`**；keep-alive 隐藏后播放仍照常触发 | **Confirmed** | 每次 ~1~4ms × 4Hz；叠加 #1 时感知放大 |
| 4 | 胶片条缩略图按原生分辨率整图解码（`media://local` 直出全尺寸 PNG，显示尺寸仅 64px 高）；`onScroll` 每个滚动事件 setState 新对象触发整条重渲染 | 机制 **Confirmed**；当前用户数据实测量级小（5 条 ≈12MB 解码量） | 最坏（R290 原生分辨率窗口截图 × 200 条滚一遍）渲染进程提交内存可冲到 ~3GB |
| 5 | `canvas.toDataURL('image/png')` 同步编码全尺寸帧：拍照、框选确认、标注保存/复制、整图 OCR 全走它 | 路径 **Confirmed**；耗时 Likely | 1080p ≈50~150ms；4K ≈300~800ms UI 线程阻塞 |
| 6 | 标注器马赛克：每次重渲染（拖拽中每个 pointermove）对每个 mosaic 形状 `document.createElement('canvas')` 现造 stamp | **Confirmed** | 拖画期间持续 GC 压力，每帧 +1~3ms |
| 7 | R290 `snipCaptureWindow`：一次 `getSources` 给**所有**窗口以 3840×3840 封顶抓原生分辨率缩略图，只为命中一个窗口 | **Confirmed**（代码）；量级 Likely | 主进程瞬态数百 MB + 数百 ms 捕获时间 |
| 8 | 胶片条 clearAll：200 条 × 并发 `capturesDelete`，每条在主进程同步 read-modify-write `index.json` + unlink | **Confirmed**（代码）；量级 Likely | 主进程事件循环累计阻塞 ~0.5~2s，全应用 IPC 卡顿 |

---

## 二、发现清单

### U-1 超分输出转换是主线程大头，GPU 后端救不了（Confirmed）
- 位置：`src/renderer/src/components/video/superres.ts:299-347`（`processFrame`），调用方 `useSuperres.ts:134-171` rAF 泵。
- 每处理帧的 UI 线程成本链：
  1. `ictx.drawImage(video,…)` 把视频帧缩到输入画布（`willReadFrequently` CPU 画布）；
  2. `getImageData`（superres.ts:318）CPU 回读 ~2.4MB；
  3. `imageDataToNchw`（:324）实测 3.9~7.0ms；
  4. `session.run` —— WebGPU/WebGL 时推理在 GPU，但输出张量是 `outW×outH×3` 的 Float32Array（1080p×2 时 3840×2160×3 = **99MB 瞬态分配/帧**）；
  5. `nchwToImageData`（:342）纯 JS 循环 —— **实测 720p×2 输出 45.2ms、1080p×2 输出 107.8ms（best-of-3，本机 Node 23.11）**；
  6. `new ImageData(this.rgbaOut,…)`（:345）按 spec 会再拷贝一份 33MB；
  7. `putImageData` 33MB。
- 频率：rAF 泵 busy 门控（useSuperres.ts:141）保证同时只有一帧在飞，但只要视频在播，转换块就背靠背出现 → 输入事件延迟长期处于 50~115ms；叠加 4Hz 全树重渲染（U-3）时点击/拖动可感知掉帧。面板 fps 读数（useSuperres.ts:174-178）只会显示 ~6-20，与 `backendLabel` 宣称的 GPU 档不符。
- 修复草案：
  - 输出侧改为 GPU 通路：ORT webgpu 输出直接落 GPUCanvasTexture / 或至少用 WebGL `texImage2D` 从 Float32Array 上传 + shader 内做 NCHW→RGBA，避免 33MB×2 的 CPU 拷贝与 putImageData；
  - 短平快方案：把显示 scale 限制在「输入预算内直出」——`planSuperresPass` 的 `maxInputPx` 已经限制输入，输出却是 in×4，可对输出再设显示上限（例如输出 ≤1080p 等效像素），转换成本按面积线性下降；
  - `nchwToImageData` 循环可拆 3 通道平面循环提升缓存局部性（当前逐像素跨平面读），预计 2~3× 提速，但仍是 CPU 搬运。

### U-2 停止录制 → fixWebmDuration 全量解析：UI 冻结 + 内存峰值随录制时长线性（Confirmed 路径 / Likely 量级）
- 位置：`VideoStudioView.tsx:713-731`（onstop 链）；库源码 `node_modules/fix-webm-duration/fix-webm-duration.js`。
- 事实链（库源码核实）：`new WebmFile(new Uint8Array(reader.result))` —— FileReader 把整个 Blob 读成 ArrayBuffer（第 1 份全量拷贝）；`WebmContainer.updateBySource`（:336-345）对 Segment 的每个子元素做 `source.slice()`（typed-array slice = 拷贝，Cluster 累计 = 第 2 份全量）；`toBlob` 里 `new Blob([this.source.buffer])`（第 3 份）。全部在渲染进程主线程同步执行。
- 连带：`setRecording(false)` 与定时器清理在 `.then` 里（VideoStudioView.tsx:729-730）——修复期间 REC 徽标不消失、`recElapsed` 计时继续走，用户看到「停不下来」。
- 频率：每次停止录制一次；WebM 默认 vp9 8Mbps 下 10min ≈ 600MB → 峰值 ~2GB、多秒冻结，还有 OOM 风险（32 位不复存在但内存压力真实）。
- 修复草案：把修复挪到 Worker（fix-webm-duration 需要 FileReader/Blob，Worker 均可用）或主进程（Node 侧流式 EBML 补写只碰 Segment Info 头部，无需全量解析——自写 ~60 行）；立刻先 `setRecording(false)` 再后台修复；超阈值（如 >200MB）跳过修复直接下载并提示。

### U-3 大组件 4Hz 整树重渲染 + 全目录零 memo（Confirmed）
- 高频 state（都在 VideoStudioView 顶层）：
  - `playerCurrentTime`：`onTimeUpdate`（:893-904）无节流，Chromium ~250ms 一次（ Likely，浏览器行为）→ 播放全程 4Hz 全树 render；
  - `recElapsed`：`setInterval 250ms`（:738）→ 录制全程 4Hz 全树 render，REC 徽标是唯一消费者；
  - `recording`、`playerControlsVisible` 等低频项无碍。
- 整树 = 三种模式面板 + 播放列表分组 + `CaptureFilmstrip`（200 `<img>`）+ 过滤器面板。`CaptureFilmstrip` 收到的 `onEdit/onDelete/onImport/onToggleCollapsed/onClearAll` 全是内联箭头（:1816-1838），即使加 memo 也会失效；全 `src/renderer/src/components` 无一处 `React.memo`（grep 证实）。
- 隐藏态照样烧：keep-alive `display:none` 不影响 React——`onTimeUpdate` 不检查 `visible`（:893），隐藏播放（MiniPlayerCard 场景）时 2229 行树仍 4Hz 重渲染。
- 成本估计：每次 reconcile 约 300~800 个宿主元素，~1~4ms（Likely）；单独不致命，与 U-1/U-4 叠加时把帧预算吃穿。
- 修复草案：`recElapsed` 徽标拆成小组件 + `useSyncExternalStore`/ref 直写 DOM；`playerCurrentTime` 用 rAF 节流到 ~4Hz 已然是事实频率，重点是**把它下沉**到 `<PlayerControls>` 子组件（props 用 ref/外部 store），或对 `CaptureFilmstrip`/面板做 memo + 稳定回调；`onTimeUpdate` 加 `if (!visible) return` 写 ref 不 setState（MiniPlayerCard 已另拿 currentTime prop，可改为订阅式）。

### U-4 胶片条：整图解码 + 滚动事件级重渲染（机制 Confirmed / 量级分辨率依赖）
- 解码：`CaptureFilmstrip.tsx:109-117` `<img src="media://local?p=…">`；`src/main/index.ts:1680-1745` 的 media 协议按 Range 流式直出**原始文件字节**，无缩略图旁路。CSS 显示 64px 高（app.css:6095-6101）。实测量：用户当前 5 条 PNG 为 871×291 ~ 1918×601，解码量合计 ≈12MB——今日无感。但 R290 `snipCaptureWindow`（windowSnip.ts:15,29-32）落的是**原生分辨率**窗口 PNG（thumbnailSize 封顶 3840），一条 2560×1440 即 14.7MB 解码位图，200 条上限（captureStore.ts:26）滚过一遍理论 ~2.95GB 解码量（Chromium 为可丢弃内存，压力下可回收，但提交内存会先冲高）。
- 「200 条 ≈740MB」原假设：**部分推翻**——740MB 恰是 200×1280×720×4 的算术；机制（无降采样整图解码）成立，数字不成立（见 §五）。
- 滚动重渲染：`CaptureFilmstrip.tsx:48-60` `measure` 里 `setCanNav(computeCanNav(…))` 每次返回新对象 → `onScroll`（:101）每个滚动事件必重渲染整条（200 img + 工具按钮）；`onLoad={measure}`（:115）每张图解码完成再补一刀。高分辨率滚轮（125Hz）下即 ~25k 元素 diff/s。
- 修复草案：主进程加缩略图（`capturesList` 时顺手生成 ~160px JPEG/PNG 旁文件，或 `img` 改 `srcset`/`sizes`）；`measure` 里先比较新旧 `{left,right}` 相同则不 setState；`onScroll` 用 rAF 合并。

### U-5 同步 `toDataURL` 全尺寸 PNG 编码散布四个入口（Confirmed 路径 / Likely 耗时）
- 拍照：`VideoStudioView.tsx:665-691`（`capturePhoto`，canvas=videoWidth×videoHeight）。
- 框选确认：`:456-479`（`finishSnip`）。
- 标注导出/复制/整图 OCR：`AnnotateOverlay.tsx:549-562`（`exportDataUrl`）、`:631`（`runOcr`）。OCR 还要把 dataURL base64（4K PNG ~11MB 字符串）structured-clone 过 IPC。
- 全部在 UI 线程同步编码：1080p ≈50~150ms、4K ≈300~800ms（Likely，同类工作负载经验值；frameCapture.ts:55 注释自证 4K 仅 BGRA 交换就要 20-40ms）。
- 修复草案：`toBlob`（异步、可 WebCodecs/OffscreenCanvas 化）+ IPC 直传 Blob/ArrayBuffer 替代 base64 dataURL；`capturesAdd` 接口扩展二进制通道（windowSnip 的 `addBuffer` 已有先例，captureStore.ts:106-116）。

### U-6 标注器：全量重绘模型 + 马赛克 stamp 每帧新建画布（Confirmed）
- 渲染 effect：`AnnotateOverlay.tsx:194-214` —— 任何 state 变化（拖拽中每个 pointermove 经 `setDragging(x=>!x)` :390，或 move/resize 的 `setHist` :393/:402/:408）都清空整画布重画：`drawImage(base)`（全尺寸底图）+ `renderAnnotations` 全形状 + 选中态。
- 马赛克：`annotationRender.ts:164-166` 在 `renderAnnotations` 内对每个 mosaic 形状调 `buildMosaicStamp`（:68-91）——`document.createElement('canvas')` + 两次 drawImage + destination-in 描边，**每帧每形状**重做，结果从不缓存。拖马赛克期间持续分配。
- 笔画点列：`AnnotateOverlay.tsx:388` `d.draft.points = [...d.draft.points, p]` O(N) 展开每 move（长笔画 O(N²) 总拷贝，数百点量级可忍）。
- hover 命中：`updateHoverCursor`（:273-289）每 move 对全部形状做 `hitShapeBorder`+`hitTestRotated`（annotationModel.ts:84-101 逐段距离），好在不 setState、直写 cursor。
- undo/redo 内存：**已验证无问题**——past/future 各限 50（annotationModel.ts:266-283），快照数组共享 shape 引用，拖拽期间不进历史（快照在 endDrag :441-446 才入栈）。
- 修复草案：形状级缓存（每 shape 离屏 canvas/路径，拖拽时只重画受影响层）；`buildMosaicStamp` 结果按 shape.id+points.length 缓存；pen 点列用 push+计数，避免展开。

### U-7 windowSnip 全窗口 3840 缩略图风暴（Confirmed / 量级 Likely）
- `src/main/windowSnip.ts:15,29-32`：每次点击相机按钮 = `getSources({types:['window'], thumbnailSize:{3840,3840}})`，Chromium 为**每个**窗口生成原生分辨率缩略图（≤窗口物理尺寸）。20 个 1440p 窗口 ≈ 300MB 瞬态 + 数百 ms；随后只对命中项 `toPNG()`。
- 修复草案：Electron 无按 id 单窗捕获 API，但可以先把 thumbnailSize 降到目标窗口实际尺寸（渲染层已知 `CaptureSource`，暂无尺寸字段——可在 `getCaptureSources` 时把 `thumb` 尺寸一并带回），或复用 snipManager 的冻结帧管线（BGRA 直传）替代 PNG 编码路径。同进程内是 async，不直接阻塞渲染层，但与 UI 竞争 DWM 捕获栈。

### U-8 clearAll → 主进程同步 IO 风暴（Confirmed / 量级 Likely）
- `VideoStudioView.tsx:1817-1823`：`Promise.allSettled(captures.map(it => capturesDelete(it.id)))` 一次发 200 个 IPC；每个 handler（index.ts:331-332 → captureStore.ts:128-135）同步 `loadIndex()`（readFileSync）→ unlink → `saveIndex()`（writeFileSync）。索引 ~200 条每轮全量重写，200 轮 = 200×(读+写 JSON) + 200 unlink，全在主进程事件循环上排队。
- 修复草案：加 `capturesClear` 批量通道（一次 loadIndex、批量 unlink、一次 saveIndex）。

### U-9 播放器进度条拖动 = 每个input 事件真实 seek + 全树渲染（Confirmed）
- `VideoStudioView.tsx:1630-1645`：受控 `<input type=range value={playerCurrentTime}>`，`onChange` → `playerSeek`（:978-986）直接 `el.currentTime = time`。拖动期间每个 input 事件（可达 60Hz）触发一次 demuxer seek + media:// 新 Range 请求（主进程 createReadStream churn，index.ts:1723-1734）+ `setPlayerCurrentTime` 全树渲染。`seekDraggingRef`（:312,897）只防了回写抖动，没防 seek 风暴。
- 修复草案：拖动中仅更新本地 UI 值，`onPointerUp`/防抖 150ms 才落 `currentTime`（视频类应用标准做法）。

### U-10 隐藏播放时 keep-alive 树 + MiniPlayerCard 常驻 4Hz（Confirmed）
- `onTimeUpdate` 无 `visible` 门控（:893-904）→ 隐藏期间全树 4Hz；`MiniPlayerCard.tsx:93-100` rAF 镜像 480 宽 canvas（本身 ~0.5-1ms/帧，可接受），但其 effect deps 含 `currentTime` → 每 250ms 拆/重挂 rAF 循环（无功能问题，纯 churn）。
- 修复草案：同 U-3 —— 隐藏时 timeupdate 走 ref，MiniPlayerCard 自行订阅 video 元素事件。

### U-11 预览 `<video>` 恒挂非空 CSS filter 串（Speculative）
- `filterCss`（:118-129）默认也返回 `brightness(100%) contrast(100%) …` 全串，绑在 `style.filter`（:1392,:1730）。恒非空 filter 可能强制合成器为视频层分配中间 render surface（4K 下多一遍纹理往返）；Chromium 对恒等 filter 是否短路未证实。
- 修复草案（零风险）：`filterCss` 全默认时返回 `'none'`。

### U-12 `resetControlsTimer` 每 mousemove 建/销 setTimeout（Confirmed，微小）
- `:932-938`：播放器 wrap 上每次 mousemove clearTimeout+setTimeout。~µs 级，列此仅因与 U-3 同源（鼠标在视频上移动时叠加）。

---

## 三、已验证无问题 / 被推翻的假设

1. **「直播预览每帧做 drawImage/滤镜叠加」——不成立。** camera/screen 预览直接 `<video srcObject>` 合成（:1726-1740），镜像走 CSS transform（:1731），滤镜走 CSS filter（GPU 侧）；live 路径零 canvas、零 rAF、零 drawImage。丢帧策略由解码/合成管线自理。
2. **「MediaRecorder timeslice 100ms 造成 chunk 频率卡顿」——不成立。** `ondataavailable` 只 push 进 `chunksRef`（:712），无 state 更新、无重渲染；10Hz Blob 引用追加成本可忽略。
3. **「录制期间 recElapsed 250ms interval 触发大重渲染」——机制成立但归因要准**：是全树无 memo 的结构问题（U-3），不是 interval 本身；且页面隐藏时 `visible` effect 会 `stopStream`→`recorder.stop()`（:841-845），不存在隐藏后台录制。
4. **「胶片条 200 条 ≈740MB」——数字推翻、机制保留**（见 U-4）：实测当前 `%APPDATA%\rgbbox\captures` 5 条、合计解码量 ≈12MB；740MB 是 720p 假设的算术；R290 之后的最坏情况比它更糟（1440p 窗口截图 ×200 ≈2.95GB），`loading="lazy"` 把初始解码限制在近视口，但滚动过的都会解码并驻留（可丢弃内存）。
5. **「undo/redo 无上限会涨内存」——不成立**：past/future 各 50 帧（annotationModel.ts:270,276,282）。
6. **「隐藏时 superres 帧泵继续烧 GPU」——不成立**：`active: mode==='player' && visible`（:322）门控，rAF 清理正确（useSuperres.ts:166-169）。
7. **denoise worklet 每帧成本——无问题**：DTLN 推理在主进程 utilityProcess；渲染侧 worklet 每 128 样本 hop 组批、每 2 hop（≈31Hz）postMessage + IPC 中继（denoiseWorkletSource.ts:55,119-132），2KB 级载荷；旁路直通逐通道拷贝（:105-115）。EQ 链懒建常驻、off=bypass（useVideoAudioEnhance.ts:42-107）。
8. **playlist 持久化——无问题**：进度 1Hz 写 ref、磁盘 10s 节流（:373-391），`videoSavePaths` 走主进程串行队列（index.ts:1469-1470 playlistStore）。

---

## 四、延迟预算表（现状估计 vs 16ms 交互 / 100ms 反馈目标）

| 场景 | 主导链路 | 现状估计 | 目标 | 判定 |
|---|---|---|---|---|
| 打开视图→摄像头起流 | lazy chunk（首访）+ getUserMedia + attachStream + loadedmetadata | 300ms~1s（硬件主导） | 100ms | 超标（不可全控） |
| 选窗口/屏→预览出画 | selectCaptureSource IPC + getDisplayMedia | 150~400ms | 100ms | 临界 |
| 点录制→REC 徽标显示 | `setRecording` 同步 render | <16ms | 16ms | ✅ |
| 录制期间 UI 稳态 | 4Hz 全树 render（U-3）+ 10Hz chunk push | ~1-4ms×4Hz | 16ms/帧 | ✅（勉强） |
| 停止录制→文件落盘下载 | onstop → Blob 合成 → fixWebmDuration 全量解析（U-2） | 60s 录制 0.2~0.5s 冻结；10min 多秒 + GB 内存尖峰；期间 REC 不消失 | 100ms | ❌ 严重超标 |
| 框选确认→进标注器首帧 | crop canvas + toDataURL（U-5）+ capturesAdd IPC + refresh + 全量首绘 | 1080p 100~250ms；4K 400~900ms | 100ms | ❌ 超标 |
| 标注器画一笔→显示 | pointermove→全量重绘（U-6） | 1~5ms（含底图 drawImage） | 16ms | ✅；马赛克/长笔迹退化 |
| 播放本地视频→首帧 | blob: URL → loadedmetadata → 解码首帧 | 100~300ms（解码器主导） | 100ms | 临界 ✅ |
| 播放中周期成本 | timeupdate 4Hz 全树 | ~1-4ms×4Hz | — | 可忍，建议下沉 |
| 超分开启后交互 | 每处理帧 50~115ms 主线程块（U-1） | 输入延迟长期 >100ms | 16ms | ❌ 严重超标 |
| 整图 OCR / 保存标注 | exportDataUrl 全尺寸 PNG + base64 IPC（U-5） | 100~800ms | 100ms | ❌ 超标 |
| 胶片条滚动 | 每滚动事件整条重渲染（U-4） | 弱机上可感掉帧 | 16ms | ⚠️ |

---

## 五、未验证项（诚实清单）

1. `putImageData` 与 `new ImageData` 拷贝的 canvas 侧实耗（Node 无法 bench；U-1 总量按转换循环下界估计）。
2. WebGPU/WebGL 后端 `session.run` 的真实推理时长与输出张量 GPU→CPU 回读时间（需实机）。
3. Chromium `timeupdate` 实际频率（按规范 15-250ms、常见 250ms 推断 ~4Hz）。
4. 恒等 CSS filter 串对视频合成层的实耗（U-11，Speculative）。
5. 胶片条解码驻留的实机内存曲线（Chromium 可丢弃内存的回收时机依赖压力）。
6. hls.js `lowLatencyMode:true`（:794）对 VOD m3u8 的分片请求开销（本次未展开）。
7. `fixWebmDuration` 的实测冻结时长（未录真机样本；量级按源码结构推算）。
