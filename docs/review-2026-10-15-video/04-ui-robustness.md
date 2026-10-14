# 04 · UI 稳定性审查 —— 视频工作站（静态崩溃风险 + 生命周期审计）

- 范围：`src/renderer/src/components/VideoStudioView.tsx`（2229 行）、`components/video/`（AnnotateOverlay / usePreviewZoom / useSuperres / useVideoAudioEnhance / denoiseWorkletSource / superres / frameCapture / previewTransform / annotationModel / annotationRender / playlistProgress / MiniPlayerCard / RegionSnipOverlay）、`components/CaptureFilmstrip.tsx`、`components/SnipView.tsx`，以及 `src/main/denoiseService.ts`、`src/main/index.ts`（IPC 失败路径交叉核实）。
- 方法：纯静态审计（仓库只读）。每条含 file:line、触发条件、后果、修复草案、置信度（高/中/低）。React 19.2.5 + Electron 41.4；`main.tsx:90` StrictMode 已开启；App.tsx:784-788 keep-alive（`videoVisited` 挂载后常驻，`visible` 仅切 display）。

---

## Top 崩溃 / 泄漏风险排名

| # | 风险 | 位置 | 一句话 |
|---|------|------|--------|
| 1 | R-1 | VideoStudioView.tsx:1043 | player 快捷键豁免漏 TEXTAREA：标注器打字时空格/s/f/m/箭头被播放器劫持（空格直接打不出来） |
| 2 | R-2 | VideoStudioView.tsx:1211-1215 | trim 导出 `seeked` 等待无超时、无 catch；导出中换片 → 永久挂起 → 播放/暂停/进度全被 `trimExporting` 门禁锁死，keep-alive 下只有重启能解 |
| 3 | R-4 | useVideoAudioEnhance.ts:42-67 | `createMediaElementSource` 建图后永久接管音频：之后播远程 no-CORS 直链整段静音且无提示，预设关掉也救不回 |
| 4 | R-3 | VideoStudioView.tsx:507-535/617-653 | `getDisplayMedia/getUserMedia` 慢返回期间切模式/切视图 → 迟到的 `attachStream` 把采集流挂到已切走的 UI，摄像头/屏幕采集在后台常亮（隐私 + CPU） |
| 5 | R-6 | VideoStudioView.tsx:578-586/507 | 快速连改相机参数 → 并发 `startCamera`，`attachStream` 覆盖 `streamRef` 不停旧轨 → 轨道泄漏 |
| 6 | R-5 | useVideoAudioEnhance.ts:194-198 | AudioContext 卸载不 `close()`（低频：keep-alive 下仅真实卸载触发） |

---

## 发现清单

### R-1【高】player 快捷键豁免漏 TEXTAREA / contentEditable / IME
- 位置：`src/renderer/src/components/VideoStudioView.tsx:1043`（守卫仅 `INPUT`/`SELECT`）；对照 live 分支 486 行已正确包含 `TEXTAREA`。受害输入面：`AnnotateOverlay.tsx:693`（文字工具 `<textarea>`）、`:780`（OCR 结果 `<textarea>`）。
- 触发：mode==='player' 且 visible，AnnotateOverlay 打开（snip 确认后 / 胶片栏编辑），在文字框打字。
- 后果：每键先过 AnnotateOverlay 的 capture 监听（typing 直接 return、不 stopPropagation，AnnotateOverlay.tsx:500-520），事件继续冒泡到 VideoStudioView 的 window 监听：
  - 空格 → `preventDefault()+togglePlayerPlay()` → **空格字符无法输入**且视频被播放/暂停；
  - `s` → `startSnip()` → 在标注层底下再叠一层 RegionSnipOverlay（DOM 顺序 1604 在 1898 之前，被标注器盖住，形成不可见激活层）；
  - `f`/`m`/方向键 → 全屏/静音/±10s seek；IME 组合中的按键同样被吞（未查 `isComposing`）。
- 修复草案：1043 行守卫补 `|| tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable`，并在分支入口加 `if (e.nativeEvent.isComposing) return`。
- 置信度：高（静态链路完整，两处监听器行为均已核对）。

### R-2【高】exportTrimmedClip：`seeked` 等待无超时 + 全函数无 catch + `clearPlayerSource` 不复位 trimExporting
- 位置：`VideoStudioView.tsx:1211-1215`（`await new Promise(resolve => { el.addEventListener('seeked', onSeeked) })`，无超时、监听器无兜底移除）；`:1192-1269` 整个 async 函数只有 try/finally 无 catch；`:743-766` `clearPlayerSource` 重置了 trimMode/trimStart/trimEnd 但**不重置 `trimExporting`**。
- 触发：点击导出后、`seeked` 触发前切换播放列表项 / 打开新文件 / 加载 URL（`clearPlayerSource` 换 src，挂起的 seek 被丢弃，新源未必再补发 `seeked`）；另一路径是 readyState 不足时 `el.currentTime = start` 被忽略（`mediaLoaded` 仅判 `playerUrl!==''`，元数据未到也算"已加载"）。
- 后果：await 永久挂起 → `trimExporting` 永真 → `playerSeek`(983)、`togglePlayerPlay`(994)、快捷键(1045-1053) 全部早退；**换片也不能解锁**（clearPlayerSource 不碰它），keep-alive 下切视图也不卸载 —— 播放器控制面板实质砖化，仅重启应用可解。附带：`await el.play()`(1226) 在 src 被清后 reject → 无 catch → unhandled rejection（finally 能清 canvasStream/复位状态，此路径可自愈但无用户反馈）。
- 修复草案：① seeked 等待加 2-3s `setTimeout` 兜底（超时走 finish/abort 分支并移除监听器）；② `clearPlayerSource` 里 `setTrimExporting(false)` 并递增一个导出代数 ref，导出循环每次 tick 校验代数，变了就走 finish；③ 函数补 catch → `editorToast`。
- 置信度：机制高（React/HTML 语义明确）；触发概率中（需要导出窗口内换源/极端 seek 失败）。

### R-3【中高】流获取慢返回无代际守卫：模式/可见性切换后迟到 attach
- 位置：`VideoStudioView.tsx:617-653`（`startScreenCapture`: stopStream → await selectCaptureSource → await getDisplayMedia → attachStream）；`:552-572`（`startCamera` 同构）；`attachStream`(507-535) 无任何 mode/visible 校验；模式切换 stopStream 在 829-836、隐藏 stopStream 在 841-845。
- 触发：屏幕源选择器（getDisplayMedia 原生弹窗）打开期间切到 player/相机，或切走应用视图；用户随后确认选择器 → Promise 才 resolve。
- 后果：`attachStream` 照常执行：`streaming=true`、`streamRef` 持流。若已切到 player 模式，`videoRef` 不存在（player 分支不渲染 live `<video>`）→ 流不上屏但**持续采集**（屏幕共享指示灯/摄像头灯常亮、CPU/GPU 占用），REC 按钮被 `mode!=='player'` 隐藏，用户无感知无入口停止，直到回到 live 模式点停止或卸载（keep-alive 下几乎不卸载）。若切到相机模式则屏幕流直接挂上预览，UI 语义错乱。
- 修复草案：请求发起时记录代数（或捕获当时的 `mode`/`visible`），`attachStream` 前校验不符则 `stream.getTracks().forEach(t=>t.stop())` 丢弃。
- 置信度：高（纯静态可证；Electron 下 getDisplayMedia 选择器停留时间完全由用户控制，窗口很大）。

### R-4【中高】MediaElementAudioSourceNode 建图永久接管 → 远程 no-CORS 源会话级静音
- 位置：`useVideoAudioEnhance.ts:42-67`（`ensureGraph`：`createMediaElementSource(el)` 只判一次 `isRemoteNoCors`，建图后常驻，注释明言"一经建图常驻"）；`playerUrl`/源切换处无任何重验（VideoStudioView 全文无 audioFx 相关的 source-change 钩子）。
- 触发：用户开过任一 EQ 预设或降噪（建图）→ 之后 `loadStreamUrl` 加载 `http(s)` 直链（`playerCrossOrigin` 为 undefined，R92 注释确认远程保持 No-CORS）。
- 后果：按 WebAudio 规范，MediaElementAudioSourceNode 对跨域无 CORS 媒体输出静音 —— 该 `<video>` 之后**所有**远程流无声，`enhanceError` 不触发、预设切回 off 也无效（图仍连接 destination，元素直出已被永久改道）。
- 修复草案：在 `playerUrl` 变化时重验 `isRemoteNoCors()`：为真则 `ctxRef.current?.close()` 拆图重建（或至少 `setEnhanceError('ERR_REMOTE')` 提示用户当前源无法出声）。注意 close 后需清空 srcRef/bands/comp/gain/worklet 全套 ref。
- 置信度：中（规范行为明确；Electron 41 实际表现未真机验证）。

### R-5【中】AudioContext 卸载不关闭
- 位置：`useVideoAudioEnhance.ts:194-198`：卸载清理只做 worklet disable + blob URL revoke + `denoiseStop`，未 `ctxRef.current?.close()`。
- 触发：用过 EQ/降噪后 VideoStudioView 真实卸载（keep-alive 下仅应用退出或 `videoVisited` 从未置位的路径；频率低）。
- 后果：AudioContext 及其渲染线程滞留至 GC；`createMediaElementSource` 绑定的元素若被复用还会抛 InvalidStateError（有 try/catch → ERR_CREATE，不崩溃）。
- 修复草案：卸载清理补 `ctxRef.current?.close().catch(()=>{})` 并置空全部节点 ref。
- 置信度：高（缺失明确）/ 影响低频。

### R-6【中】相机参数联动重启的并发覆盖泄漏
- 位置：`VideoStudioView.tsx:578-586`（`[resIndex, fps, deviceId]` effect 每次变更 `void startCameraRef.current()`）；`startCamera`(552-572) 先同步 `stopStream()` 再 await getUserMedia；`attachStream`(507) 赋值 `streamRef.current = stream` 前不停旧轨。
- 触发：流式使用中快速连续改设备/分辨率/帧率（两次 getUserMedia 并发在飞）。
- 后果：后发起的调用先 resolve、先 attach；先发起的调用后 resolve → 直接覆盖 `streamRef`，**前一条流的轨道无人停止**（摄像头双开占用、指示灯常亮）直到模式切换/卸载。
- 修复草案：`attachStream` 开头 `streamRef.current?.getTracks().forEach(t=>t.stop())`；或 startCamera 用串行队列/代数丢弃迟到者。
- 置信度：高。

### R-7【中低】AnnotateOverlay 底图解码失败无 onerror
- 位置：`AnnotateOverlay.tsx:80-90`（只挂 `img.onload`，`alive` 标志仅防卸载后 setState）。
- 触发：胶片栏编辑入口 `capturesRead` 返回的 media:// 文件损坏/被占用/半写入；或 snip 裁剪 dataURL 异常。
- 后果：`base=null`、`natural={0,0}`：画布空白但标注器照常打开；OCR 两个按钮因 `!base` 禁用无解释；`doSave` 里 `exportDataUrl` 对 canvas 源返回 `''` → **静默无动作**（string 源返回原图）。无任何提示。
- 修复草案：`img.onerror = () => { if (alive) { setBase(null); setLoadFailed(true) } }`，顶部渲染一条错误条 + 禁用保存。
- 置信度：高。

### R-8【中低】OCR 框选：setState updater 内执行副作用
- 位置：`AnnotateOverlay.tsx:749-755`：`setOcrRegionDraft(d => { if (d) finishOcrRegion(d.start, d.end); return null })` —— `finishOcrRegion` 内部再 setState + 发起 `ocrRecognize` IPC。
- 触发：框选识别拖完松手；StrictMode（main.tsx:90 已开）dev 下 updater 双调用；React 并发重放 updater 时同理。
- 后果：dev 下必现双份 `ocrRecognize` IPC（浪费、结果竞态后写胜出）；违反 updater 纯函数契约，属于埋雷式写法。
- 修复草案：把 draft 存 ref（如 `ocrDraftRef`），pointerup 里读 ref 值调用 `finishOcrRegion` 后手动清 ref+state。
- 置信度：高（契约违反确凿）/ 影响小。

### R-9【中低】HLS fatal 错误不可见（黑屏无提示）
- 位置：`VideoStudioView.tsx:796-798`（fatal → `setStreamError('HLS: …')`）；但错误文案只在 `!mediaLoaded` 的空态层显示（1582-1587），而 HLS 路径 `usingHls=true` → `mediaLoaded=true` → 空态层不渲染。
- 触发：m3u8 加载失败/网络中断/清单 404。
- 后果：黑屏 + 无任何错误反馈（streamError 已设置但无处展示）。
- 修复草案：空态 overlay 条件改为 `!mediaLoaded || streamError`（player 分支），或错误提示独立浮层。
- 置信度：高。

### R-10【中低】音量/静音状态在 `<video>` 重挂后失真
- 位置：`VideoStudioView.tsx:874-879` effect deps `[playerVolume, playerMuted]` 缺 `playerUrl`；元素以 `key={playerCrossOrigin ? 'cors':'nocors'}`（1387）在 local(blob:/media:) ↔ remote(http) 源切换时**重挂**。
- 触发：本地文件音量调低（或静音）→ 加载远程 URL。
- 后果：新元素回退默认 `volume=1 / muted=false`，effect 不重跑 → 远程流以满音量播出（惊吓级 UX；对照 playbackRate effect 853 行 deps 含 playerUrl，无此问题）。
- 修复草案：deps 补 `playerUrl`。
- 置信度：高。

### R-11【低】字幕 FileReader 无 onerror/onabort
- 位置：`VideoStudioView.tsx:964-975`。触发：文件读取失败 → 静默无字幕无提示。修复：`reader.onerror = () => editorToast(...)`。置信度高/影响低。

### R-12【低】录制 processing 阶段状态机不闭合（REC 徽章/时钟漂移）
- 位置：`VideoStudioView.tsx:713-731`：`setRecording(false)` 与 `recTimerRef` 清理都在 `fixWebmDuration().then()` 异步链内。
- 触发：停止录制后 blob 后处理期间（大文件可达数秒）。
- 后果：① REC 徽章与时钟继续走，读数超过实际录制时长；② 停止按钮仍可点但 no-op（recorder 已 inactive），无反馈；③ 若 `fixWebmDuration` 永不 settle，250ms interval 永续（无害泄漏）。无双 recorder 风险（见"被推翻假设 #3"）。
- 修复草案：`onstop` 同步段先 `setRecording(false)` + 清 interval，再做异步后处理。
- 置信度：高（行为）/ 影响低。

### R-13【低】localStorage 视频缓存无 schema 校验 → 渲染崩溃路径
- 位置：`VideoStudioView.tsx:85-97`（`loadVideoCache` 直接 `JSON.parse` 返回）+ `:347`（`videoCache.groups || []` 未验数组）+ `:2042`（`videoGroups.map`）。
- 触发：`rgbbox-video-playlist-config` 被写坏（版本迁移残留/手改/磁盘损坏）且 `groups` 为非数组。
- 后果：渲染抛 TypeError → main.tsx 的 ErrorBoundary 兜底但整个应用 UI 换 fallback（播放中的音频一并丢失）。对照组：`rgbbox:videoMode`(243-246)、MiniPlayerCard `loadPos`(26-34) 都做了类型校验，此处漏了。
- 修复草案：`Array.isArray(videoCache.groups) ? … : []`，playlist 数组同理。
- 置信度：高（代码）/ 触发低。

### R-14【低】exportTrimmedClip 的 `getContext('2d')!` 非空断言与裸 MediaRecorder 引用
- 位置：`VideoStudioView.tsx:1220`（`canvas.getContext('2d')!`，首个使用点 1245 `drawImage` 抛 TypeError）+ `:1206-1208`（直接引用 `MediaRecorder.isTypeSupported`，极旧平台 ReferenceError）。两者都在 try 内但**无 catch** → unhandled rejection；finally 已能清 `canvasStream`（1221 已赋值）与状态。
- 修复草案：判空 + 顶部 `typeof MediaRecorder === 'undefined'` 守卫 + catch→toast。置信度高/触发极低（Electron 41 恒有 2D ctx 与 MediaRecorder）。

---

## 资源配对审计表

| 资源（acquire → release） | 获取点 | 释放点 | 正常/错误/卸载/切换 | 结论 |
|---|---|---|---|---|
| getUserMedia/getDisplayMedia 轨道 | startCamera:556 / startScreenCapture:626,645 | stopStream:498 / 卸载:1068 | 切换✓ 错误✓（catch 内不再持流） | ✗ 慢返回竞态（R-3）、并发覆盖（R-6） |
| player blob: URL | onPlayerFile:774 / playVideoItem(media:// 不经此) | clearPlayerSource 函数式 revoke:751 + 卸载 playerUrlRef 镜像:1063-1074 | ✓（R70.5 已修卸载路径） | ✓ |
| 录制/裁剪产物 object URL | 728 / 1258 | 10s setTimeout revoke:728,1263 | ✓ | ✓（下载完成前足够） |
| MediaRecorder（录制） | startRecording:707 | stopRecording:696 / stopStream:495 / 卸载经停轨触发 onstop | ✓ | ✓（onstop 必达；处理链无卸载守卫但无害） |
| MediaRecorder+captureStream（trim） | 1221-1223 | finish() 单出口 + watchdog:1252 + finally 停轨:1266 | ✓ | ✗ seeked 挂起在 watchdog 布防之前（R-2） |
| AudioContext / MediaElementSource | ensureGraph:51-52 | **无 close**（常驻设计） | — | ✗ R-5 + R-4（永久接管） |
| AudioWorklet + blob module | enableDenoise:151-161 | 卸载 revoke:196 + worklet disable | disable 保图常驻（设计） | ✓（泄漏面归 AudioContext） |
| superres 引擎/rAF | enable:99 / pump:165 | pump cleanup:166-169 + 卸载 dispose:181-185 | disable 保 session（设计，注释明确） | ✓ |
| rAF 循环 | MiniPlayerCard:97-99 / trim drawFrame:1246 | cancel:99 / watchdog+finally | ✓ | ✓ |
| interval/timeout | recTimer:738 / fps:176 / editorToast:426 / controlsHide:936 / watchdog:1252 | onstop 链:730 / cleanup:177 / 卸载:1075-1077 / clearTimeout:1255,1265 | ✓ | ✓（recTimer 清理时机偏晚 → R-12） |
| hls.js 实例 | loadStreamUrl:794 | clearPlayerSource:744 + 卸载:1069 | ✓ | ✓（fatal 后靠库自停，可接受） |
| ResizeObserver | usePreviewZoom:59 / AnnotateOverlay:102 / CaptureFilmstrip:57 | 各自 disconnect | ✓（R92 晚绑重测） | ✓ |
| window keydown 订阅 | player:1056 / live-S:489 / annotate:544 / snip:72 / ESC-fs:1283 | 全部 effect cleanup 成对 | ✓ | ✓（player 守卫缺陷 → R-1） |
| IPC 订阅（onModelDownloadProgress / onDenoiseFrames / snipOnFrame） | useSuperres:73 / useVideoAudioEnhance:125 / SnipView:47 | off()/unsubscribe 成对 | ✓ | ✓ |
| pointer capture | annotate canvas:299 / snip SVG:92 / SnipView SVG:157 | pointerup/cancel 隐式释放 | 无 lostpointercapture 兜底 | ✓（可接受；seek 滑块反而有 onLostPointerCapture:1643） |

---

## 被推翻的假设 / 已验证无问题

1. **"denoiseStop/denoiseStart IPC 乱序会杀掉新会话导致永久静音"** —— 推翻。`denoiseService.ts:112-120` stop 先捕获 `const s = session` 再延迟 500ms kill，只杀旧 child；start 有 `if (session) return {ok:true}` 幂等；`child.on('exit')`(66-69) 以 `session?.child === child` 比对防误清。渲染侧 enable/disable 无 gen 守卫存在理论交错，但主进程侧收敛。
2. **"152 个 hooks 里存在 ref 化函数误入 deps / stale closure 实锤"** —— 抽查未发现。`usePreviewZoom`（RO 每渲染比对重挂、wheel/pan 监听 deps 正确）、`useSuperres`（gen 代数 + busy 门 + ref 化 pump）、`useVideoAudioEnhance`（rewire 依赖 presetId 正确）均为规范写法；VideoStudioView 三处 `eslint-disable exhaustive-deps`（582 相机重启、929 播放器事件、171 帧泵）均以 ref 读写、语义正确。录制计时器/播放器回调均读 ref 或经 effect 重挂，无旧 state 读取路径。
3. **"processing 中再点录制可产生双 MediaRecorder"** —— 推翻。`recording` 直到 onstop 异步链完成才置 false，期间 REC 按钮不渲染，无双实例路径（代价是 R-12 的漂移）。
4. **"AnnotateOverlay undo/redo 栈有越界/重复"** —— 推翻。`annotationModel.ts:266-286`：past `slice(-49)`、future `slice(0,50)` 双向封顶；空栈直返原值；拖拽结束以 `h.present === pre` 引用比对防重复入栈（AnnotateOverlay.tsx:445）。
5. **"底图 naturalSize=0 有除零/NaN"** —— 推翻。`k = view.w>0 ? view.w/Math.max(1,natural.w) : 1`（AnnotateOverlay.tsx:152）、fit 门禁 `natural.w>0`（137）、pointerdown `!base` 早退（294）、`buildMosaicTile` 对 natural≤0 返回 null（annotationRender.ts:45）。全链有防护（解码失败无提示的问题归 R-7）。
6. **"snipFinish/capturesAdd/capturesRead/snipCaptureWindow 的 reject 会成为未捕获 Promise"** —— 推翻。UI 侧全部 `.catch` + toast（477、690、1829-1831、1903、1908-1910）；SnipView `finish` 有 catch+finally snipCancel（120-130）。主进程侧 `snipCaptureWindow` 对非法 id 返回 `{ok:false,code}` 而非 reject（index.ts:360-364）。
7. **"导出 canvas 超大尺寸会崩"** —— 未发现问题：导出恒为 natural 尺寸（AnnotateOverlay.tsx:551-553），输入来自视频帧/截图，上限 4K 级；仅内存峰值，无越界。
8. **"live 模式 S 快捷键也会和输入冲突"** —— 推翻（live 分支 486 行已查 TEXTAREA），缺陷仅在 player 分支（R-1）。
9. **"fixWebmDuration 失败会毁录制"** —— 推翻（R295 已修：`.catch(() => raw)` 兜底原样下载，719-721）。

---

## 已检查安全清单

- `pickMimeType` 全不支持（旧平台）：返回 `''` → MediaRecorder 走默认参数、onstop Blob type 兜底 `video/webm`（142-153, 707-714）；`new MediaRecorder` 构造失败有 try/catch（706-711）。
- `canvas.getContext('2d')` null：capturePhoto(671)、AnnotateOverlay 渲染(203)、exportDataUrl(554)、buildMosaicTile(50)、cropToDataUrl(44)、freezeVideoFrame(16) 均判空；唯一漏网是 exportTrimmedClip:1220（R-14）。
- toDataURL 跨域 taint：capturePhoto / finishSnip / exportDataUrl 全部 try/catch + `video.capture.fail` toast（R92 链路）。
- `video canplay 永不触发`：空态 UI 只依赖 `mediaLoaded`（URL 态），不挂 canplay；无加载超时属 UX 缺口非稳定性。
- 卸载全量清理（1067-1078）：tracks / hls / player.pause / blob revoke / recTimer / controlsHideTimer / editorToastTimer —— 成对。
- keep-alive `visible=false`：stopStream + cancelSnip（841-845）；superres `active` 门控停帧泵；播放器快捷键 `!visible` 不劫持（1038）。
- MiniPlayerCard：rAF 随 playing 起停、拖拽/缩放监听挂自身节点随卸载回收、`clampPos` 持续夹取屏幕内。
- RegionSnipOverlay / SnipView：capture 阶段 ESC/Enter + stopPropagation 压过播放器快捷键；SnipView finish 的 IPC 失败有 catch+finally snipCancel（R112 已修路径维持）；`snipOnFrame` 订阅成对。
- AnnotateOverlay 文字输入：Enter/blur 双路径提交幂等（`!inp.value.trim()` 守卫 + setTextInput(null) 先行）、IME `isComposing` 豁免、textarea 挂载 rAF 补焦（防同击 blur）。
- `usePreviewZoom`：R92 晚绑元素每渲染重测；wheel passive:false 正确；pan 4px 阈值避免吞 click。
- IPC 持久化（videoSavePaths/capturesList）：全 best-effort catch；`videoGetSavedPaths` 恢复有 cancelled 标志（1320-1338）。
- 测试基线核实：VideoStudioView 11 用例覆盖 render/持久化/断点续播/MiniPlayer/自动恢复/音频面板；**录制状态机、trim 导出、模式切换竞态、快捷键豁免、AnnotateOverlay 键盘交互均无护栏**（R-1/R-2/R-3/R-6 修复时应补测试）。

---

## 未验证项（静态审计无法确认，需真机）

1. R-4 的 WebAudio 跨域静音在 Electron 41（Chromium 日常行为同规范）实际表现，及 `ctx.close()` 后重建图对正在播放元素的影响。
2. R-2 中 Chromium 对"src 被清后挂起 seek 不再补发 seeked"的确切行为（机制推断自媒体元素规范 abort 算法）。
3. `fixWebmDuration` 对长录制大 blob 的耗时分布（是否会让 R-12 的 processing 窗口拉长到可感知）。
4. display:none 祖先下 rAF 节流对 trim 导出/MiniPlayerCard 镜像的实际帧率影响（逻辑上有 watchdog/单帧兜底）。
5. `startCamera` 的 `audio:true` 在无麦克风设备上是否导致 getUserMedia 整体拒绝（Electron 通常自动授权，未验证）。
6. denoise utilityProcess 异常退出时渲染侧 `denoiseStatus==='on'` 与 worklet wet 空转（输出静音）的表现 —— 主进程 `child.on('exit')` 只清 session，无向渲染层推送失败事件的通道。
