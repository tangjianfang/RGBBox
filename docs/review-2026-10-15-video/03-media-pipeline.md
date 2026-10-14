# RGBBox 深度审查 · 分报告 03：视频工作站 捕获/录制/播放管线

- 审查人：并发与媒体管线工程师（Claude）
- 日期：2026-10-15
- 范围：`src/renderer/src/components/VideoStudioView.tsx`（2229 行）及 `components/video/*`、`src/main/{snipManager,captureStore,windowSnip,index.ts}.ts`、preload 桥、`fix-webm-duration` 库源码、`%APPDATA%\rgbbox\captures`（只读）。
- 方法：逐条读代码到 file:line；库行为读 `node_modules/fix-webm-duration/fix-webm-duration.js` 源码验证；未启动应用。
- 置信度：高=代码路径完整可循；中=依赖平台/Chromium 行为但有强代码证据；低=理论路径，触发条件苛刻。

## Top 风险排名

1. **M-1（高）** `attachStream` 无竞态守卫：切视图/切模式触发的 `stopStream` 挡不住"在途"的 getUserMedia/getDisplayMedia，流会在视图隐藏后落地并持续采集（摄像头灯常亮/屏幕捕获线程常驻），R91.2 的"隐私+CPU"目标被异步时序击穿。
2. **M-2（高）** R295 后处理链：`fix-webm-duration` 全量 `FileReader.readAsArrayBuffer` + EBML 结构拷贝（实测库源码，峰值 ≈3–4× 文件大小的 ArrayBuffer）在渲染主线程执行；且 `setRecording(false)`/计时器清理挂在完成回调上——停止后 REC 徽标继续走表、大文件期间录制按钮僵死；录制无时长/大小/码率上限。
3. **M-3（高）** HLS fatal 错误 UI 完全不可见：`mediaLoaded = playerUrl || usingHls`，fatal 后 `usingHls` 仍为 true，`streamError` 只渲染在 `!mediaLoaded` 的空态层。
4. **M-4（中）** `selectCaptureSource → getDisplayMedia` 跨进程一次性令牌竞态 + 主进程 `?? sources[0]` 兜底：快速连点两个源会静默捕错源（第二个流变成"整个屏幕 0"）。
5. **M-5（中）** `captureStore` 的 `index.json` 直写非原子：主进程崩溃/断电瞬间写坏 → `parseIndex` 静默回空 → 全部拍摄缓存条目丢失（文件成孤儿）；R267 已给 playlistStore 上原子写，captures 没跟上。

## 发现清单

### M-1 attachStream 竞态：隐藏视图后的"僵尸活流"（隐私/CPU）
- 位置：`src/renderer/src/components/VideoStudioView.tsx:507-535`（attachStream，直接覆写 `streamRef.current`，不停旧轨）、`:494-505`（stopStream）、`:841-845`（visible=false → stopStream）、`:830-836`（切模式 → stopStream）。
- 触发：点击"开始"（camera 或某窗口源）后立即切走视图/切模式。时序：`stopStream()`（此刻 `streamRef` 还是 null，空转）→ 在途的 `getUserMedia/getDisplayMedia` resolve → `attachStream` 照常执行：`streaming=true`、`srcObject` 挂上、`setStreamError(null)`。视图已隐藏（App.tsx:784-788 keep-alive 只 display:none，组件不卸载），无任何后续 stopStream 触发点，直到用户回到该视图手动停止。
- 后果：摄像头流 → 摄像头灯常亮、麦克风轨（camera 路径 `audio:true`）持续采集；屏幕/窗口流 → 捕获管线常驻 CPU/GPU。同类竞态还有：快速连点两个源（A 在途、B 已落地，A 后到覆写 B，B 的 track 永不停）。
- 修复：a) `attachStream` 入口先 `streamRef.current?.getTracks().forEach(t=>t.stop())`；b) 引入"请求代际 ref"（类似 useSuperres 的 `genRef`），resolve 后代际不符则立即 `stream.getTracks().forEach(stop)` 丢弃；c) `visible=false` effect 同时登记当前在途 Promise 以便取消。
- 置信度：高（纯渲染层时序，代码完整可循；keep-alive 不卸载由 App.tsx:780-788 证实）。

### M-2 R295 录制后处理：内存 ×3–4、主线程阻塞、录制状态回收挂在异步尾部
- 位置：`VideoStudioView.tsx:713-732`（onstop 内 `fixWebmDuration` 链）、`:719`（`void fixWebmDuration(raw, elapsed, {logger:false})`）；库源码 `node_modules/fix-webm-duration/fix-webm-duration.js:490-503`（`reader.readAsArrayBuffer(blob)` 全量入内存）、`:335-364`（`updateBySource` 对 Segment 每个子元素 `slice` 拷贝）、`:395-401`（`updateByData` 再全量重建一份 `Uint8Array`）。
- 触发/后果：
  1. 长录制（无上限，见 M-8）产生大 blob；onstop 后渲染主线程同步做全文件 memcpy 级 EBML 解析（100ms timeslice → 每秒 ~10 个 Cluster，均被逐个读 id/len+拷贝），UI 卡顿随文件线性增长；峰值内存 ≈ 原 blob + 解析中间拷贝 + 重建 buffer ≈ 3–4× 文件大小。1GB 级录制有渲染进程 OOM 风险。
  2. `setRecording(false)`、`recTimerRef` 清理、下载全部在 `.then()` 尾部（:729-731）：从点停止到下载完成之间 REC 徽标仍在、`recElapsed` 继续增长（interval 未清，:738）；"开始录制"按钮不可达，大文件期间用户被锁在"停止"按钮上（点击是 noop，:694-698 只查 state）。
  3. 若 fix Promise 永不 settle（极端），`recording` 永久 true——本视图 keep-alive 常驻不卸载（App.tsx:784），录制功能永久失效，仅重启应用可解。无兜底超时。
- 修复：`stopRecording`/`stopStream` 里同步 `setRecording(false)`+清 interval（状态回收与文件落盘解耦）；fix 阶段给独立 "处理中" 提示；超时（如 15s）兜底落原 blob；长录制考虑改 main 侧流式落盘（fs 写 chunk）而非渲染层 blob 聚合。
- 置信度：高（库源码逐行读过；UI 状态机时序代码完整）。

### M-3 HLS fatal 错误不可见 + 实例不回收不恢复
- 位置：`VideoStudioView.tsx:287`（`const mediaLoaded = playerUrl !== '' || usingHls`）、`:796-798`（fatal → 仅 `setStreamError`）、`:1582-1587`（错误文案只渲染在 `!mediaLoaded` 空态）。
- 触发：加载 m3u8 → 网络断/清单 404 → hls fatal。`usingHls` 保持 true → `mediaLoaded` true → 错误层不显示；用户看到的是冻住的最后一帧或黑屏，无任何反馈。且 fatal 后未 `hls.destroy()` 也未 `startLoad()` 重试，实例保持 attach 状态。
- 对比：直接 URL（mp4 等）失败走 `<video onError>`（:1401-1410，R168）→ `clearPlayerSource()` → 空态显示错误，链路健康——HLS 是唯一缺口。
- 修复：fatal 时 `setUsingHls(false)`+`hls.destroy()`（让 mediaLoaded 归零复用现有空态），或单独常驻错误 toast；网络类 fatal 可选 `hls.startLoad()` 重试。
- 置信度：高。

### M-4 selectCaptureSource 令牌竞态 + `sources[0]` 兜底捕错源
- 位置：主 `src/main/index.ts:130`（`pendingCaptureSourceId`）、`:1206-1209`（select 写入）、`:1652-1669`（display-media handler 读取后即清空，`?? sources[0]` 兜底）；渲染 `VideoStudioView.tsx:617-653`（select→getDisplayMedia 两步非原子）。
- 触发：连点源 A、源 B 快于 handler 执行：selectA(pending=A) → selectB(pending=B) → handlerA 读到 B（A 的流捕了 B 的内容）并清空 → handlerB 读到 null → `sources[0]`（整屏 0）。叠加 M-1 的 attachStream 覆写 → 一个流泄漏 + 一个流内容错。另：select 成功但 getDisplayMedia 从未被调用时，陈旧 pending 会留给"下一次"无关调用。
- 修复：handler 读不到精确 id 时 `callback({})` 拒绝（Electron 下 getDisplayMedia reject 后渲染层已有 legacy fallback 与报错路径），删除 `?? sources[0]`；或把令牌改为一次性自增 ID 校验。
- 置信度：竞态机制高；实际触发概率中低（handler 通常几十 ms 内执行）。

### M-5 captureStore `index.json` 非原子写：崩溃即全库索引丢失
- 位置：`src/main/captureStore.ts:97-99`（`writeFileSync` 直写）、`:31-44`（parseIndex 失败/截断 → 返回 `[]`）。
- 触发/后果：写索引瞬间崩溃/断电 → 文件截断 → 下次启动解析失败静默回空 → 200 条拍摄记录"消失"（PNG 仍在磁盘成永久孤儿，不受 FIFO evict 管理，只增不减）。R267 已把 playlistStore 改为"串行队列+原子写"（index.ts:1464 注释），captures 未同步改造。
- 修复：tmp 文件 + `renameSync` 原子替换（同 playlistStore 惯例）；启动时对"目录里有文件但索引为空"做一次 reconcile。
- 置信度：高。

### M-6 `capture:get-sources` 无重试/无超时，撞已证实的 Windows stall
- 位置：`src/main/index.ts:1183-1200`（裸 `desktopCapturer.getSources`）；对照 `src/main/snipManager.ts:210-224`（R112.3 专为同 API 的 51s stall 写了 3s×3 重试器并导出）；渲染 `VideoStudioView.tsx:589-599`（`refreshSources` 无超时，`loadingSources` 转圈）。
- 后果：Video Studio 源列表可能转圈最长 51s（若 stall 复现）无任何提示；snip/windowSnip 都有重试保护，唯独此入口裸奔。
- 修复：改用 `getSourcesWithRetry`；渲染层加超时+错误文案（现有 catch 会 setStreamError，但只在 !streaming 空态显示，可接受）。
- 置信度：高（代码差异确凿）；stall 在当前 Electron 版本是否复现——低（未实测）。

### M-7 屏幕录制无声（设计缺口）
- 位置：`VideoStudioView.tsx:626-629`（getDisplayMedia `audio:false`）、`:635-644`（legacy 同样 false）；主 `index.ts:1659`（handler 只回 `video`）。camera 路径 `audio:true`（:556）录麦克风。
- 后果：窗口/屏幕录制产物无系统声音。Windows 上 Electron 可 `audio:'loopback'`（callback `{video, audio:'loopback'}`）补齐。
- 置信度：高（代码事实）；修复方案平台相关性中。

### M-8 录制无码率/时长/内存上限
- 位置：`VideoStudioView.tsx:700-739`（startRecording 未设 `videoBitsPerSecond`、无 max duration）；`:712`（chunks 100ms 粒度无限累积，数小时录制 = 数万 Blob 分片）。
- 后果：文件大小完全由 Chromium 默认码率决定（UA 相关，1–2.5Mbps 量级）——4K 屏录画质受限且大小不可控；长录制放大 M-2 的内存/卡顿问题；chunks 虽会页出到磁盘，最终 `new Blob` + FileReader 全量读仍是硬峰值。
- 修复：显式 `videoBitsPerSecond`；可选最大时长自动 stop + 提示。
- 置信度：机制高；默认码率具体数值低（未实测）。

### M-9 track 意外结束无 UI 反馈（streaming 状态滞留）
- 位置：`VideoStudioView.tsx:257-260`（无 `track.onended` 处理）；预览空态只在 `!streaming` 显示（:1761-1766）。
- 触发：被捕窗口关闭/摄像头拔出/共享被系统终止 → track ended → 预览冻住在最后一帧，`streaming` 仍 true，UI 无提示。幸运点：MediaRecorder 依规范会在 all-tracks-ended 时自动 stop+flush → onstop → 文件仍会下载（未实测，见未验证项）。
- 修复：`track.onended = () => { setStreaming(false); setStreamError(...) }`（在 attachStream 内挂）。
- 置信度：滞留机制高；自动落盘依赖规范行为，中。

### M-10 `recorder.onerror` 未挂、`recorder.start` 未包 try
- 位置：`VideoStudioView.tsx:705-711`（try 只包构造函数）、`:733`（`recorder.start(100)` 裸调用）、全文件无 onerror。
- 后果：编码器中途 error 时无提示；对已 ended 的流 start 可能抛同步异常 → 事件回调内未捕获异常（React 记录错误，录制状态未置位）。
- 修复：挂 `recorder.onerror`（提示+按 onstop 兜底 flush）；start 包 try。
- 置信度：代码事实高；error 实际触发率低。

### M-11 修剪导出无声 + 实时导出
- 位置：`VideoStudioView.tsx:1217-1226`（`canvas.captureStream(30)` 无音轨，mime 却选了 opus）、`:1226-1255`（rAF 实时播放式导出）。
- 后果：剪出的片段没有声音；导出耗时≈片段时长。watchdog/finally 停轨（R70.6）已做好，无泄漏。
- 修复：`el.captureStream()` 合并音频轨（需 CORS 干净源）或提示用户此限制。
- 置信度：高。

### M-12 WebAudio 图常驻后换远程 no-CORS 源 → 静音
- 位置：`src/renderer/src/components/video/useVideoAudioEnhance.ts:42-67`（ensureGraph 只在建图时检查 `isRemoteNoCors`）、`:200-204`（注释自认"一经建图常驻"）。
- 触发：用户开过影院 EQ（图已建）→ 之后 `loadStreamUrl` 载入远程无 CORS 的 http 流 → MediaElementSource 对 no-CORS 媒体输出静音（直连输出也被切断）→ 整个片无声，且 `enhanceError` 不会更新（只在建图时设）。
- 修复：换源时（clearPlayerSource 或 currentSrc 变化）若 no-CORS 且图存在 → 断开/重建路由并提示，或 revert 预设。
- 置信度：代码路径高；Chromium 静音行为是规范明文（中高）。

### M-13 windowSnip 3840 cap 对全部窗口做全尺寸位图快照
- 位置：`src/main/windowSnip.ts:27-39`（对 sources 里**每个**窗口以 thumbnailSize 3840×3840 请求，再 find 目标 id）。
- 后果：一次点击 = 所有窗口各出一张最高原生分辨率位图（30 个 1080p 窗 ≈ 250MB 瞬时 NativeImage 内存 + 全量捕获 CPU），主进程尖峰；对比 `capture:get-sources` 用 320×180（index.ts:1189）。
- 修复：Electron 无按 id 单源捕获 API（已知限制），可先小尺寸 getSources 校验 id 存在，再二次 3840 请求（stall 代价×2，需权衡）；或接受现状并在 UI 上节流。
- 置信度：内存机制高；量级估算中。

### M-14 captureStore 残留物与磁盘满的静默失败
- 位置：`captureStore.ts:100-104`（evict unlink 失败吞掉→孤儿文件）、`:132`（delete 同）、`:106-116`（addBuffer `writeFileSync` 磁盘满抛出→IPC reject）；渲染 `VideoStudioView.tsx:690`、`:477`（`.catch(() => {})` 吞掉，无 toast）。
- 后果：磁盘满时"拍照/截图入缓存"静默失败（下载仍成功，用户感知不到缓存没进）；孤儿 PNG 永久累积。`finishSnip`（snipManager.ts:311-322）同类失败有 log+false 返回，但渲染端 SnipView 是否提示未查。
- 修复：add 失败时 renderer toast；定期 reconcile 目录与索引。
- 置信度：高。

### 其他小项（低）
- `stopStream` 不清 `activeSourceId`：停止后源卡片仍高亮（`VideoStudioView.tsx:275,494-505`）。外观问题。
- camera `audio:true` 在无麦克风设备机器上会导致整个 getUserMedia 失败（视频也起不来），`VideoStudioView.tsx:556-564`。可 `audio:{ideal:true}` 或失败降级重试纯视频。
- `exportTrimmedClip` seek 到相同位置时 `seeked` 是否触发不确定（`VideoStudioView.tsx:1211-1215`），watchdog +5s 兜底存在。
- `videoOpenFiles/videoOpenFolder` 用 `mainWindow!`（index.ts:1475,1485），窗口销毁后调用会 dialog 挂 null——实际主窗常驻，理论路径。

## 生命周期表（对象 × 创建 × 释放路径 × 泄漏点）

| 对象 | 创建 | 释放路径 | 泄漏点/备注 |
|---|---|---|---|
| camera MediaStream | `startCamera` (VideoStudioView.tsx:552-572) | stopStream / 切模式(:830) / visible=false(:841) / unmount(:1067) | **M-1 在途流绕过全部释放点**；无 track.onended（M-9） |
| screen/window MediaStream | `startScreenCapture` (:617-653)，现代/legacy 双路径 | 同上 | 同上 + M-4 令牌竞态可致内容错捕 |
| MediaRecorder（工作站） | `startRecording` (:700-739) | stopRecording / stopStream 显式 stop；track 全 ended 时规范自动 stop | 状态回收挂在 fix 完成回调（M-2）；onerror 缺失（M-10）；应用退出时在录内容必丢（渲染进程即死） |
| trim 导出 canvasStream | `exportTrimmedClip` (:1221) | finally 停轨 (:1264-1268, R70.6) | 无（验证通过） |
| hls 实例 | `loadStreamUrl` (:793-802) | `clearPlayerSource` destroy (:744) / unmount (:1069) | fatal 后不 destroy 不恢复（M-3 的一部分） |
| playerUrl blob: | `onPlayerFile`/`playVideoItem` | clearPlayerSource 函数式 revoke (:751) + unmount 镜像 ref (:1063-1074, R70.5) | 无（双保险到位） |
| recTimer / controlsHide / editorToast 定时器 | :738 / :936 / :426 | onstop.then(:730) / unmount(:1075-1077) | recTimer 回收延迟=M-2；fix 挂起则泄漏至 unmount |
| AudioContext+MediaElementSource | `ensureGraph`（懒） | **从不 close**（keep-alive 有意为之） | 图常驻后 no-CORS 源静音（M-12）；AudioContext 数量=1，可接受 |
| denoise utility 进程/回调 | `enableDenoise` / 订阅 (:123-129) | unmount 停止+revoke worklet URL (:194-198) | 无（验证通过） |
| superres 引擎/RAF | enable / 帧泵 effect | 帧泵 effect cleanup + unmount dispose (:181-185) | 无（genRef 代际防护到位，反而是 M-1 该抄的范式） |
| snip 会话窗口/全局 Esc | `startSnip`→presentSnipDisplay (snipManager.ts:196-290) | cancelSnip(:324)/closed 级联/display 变化(:94) | 无；allSnipWindows 兜孤儿窗口（R112.3）验证通过 |
| snip 预热窗口池 | warmSnipStack→rebuildSnipPool (:350-366) | display 变化推倒 / disposeSnipManager (index.ts:1847, before-quit) | 每屏常驻一个隐藏渲染进程（内存换延迟，设计取舍） |
| captureStore 文件/索引 | addBuffer/addPng/importFiles | delete/evict (FIFO 200) | unlink 失败孤儿、索引非原子（M-5/M-14） |
| 录制 object URL | onstop 下载 (:722-728) | `revokeObjectURL` 10s 后 | 无（10s 足够下载启动） |
| `pendingCaptureSourceId` | selectCaptureSource | handler 读取即清 (:1657) | select 后 gDM 未发起则陈旧残留（M-4 附带） |

## 被推翻的假设 / 已验证无问题

1. **"chunksRef 跨录制残留会混文件"——不成立（当前 UI 下）**：开始录制按钮与停止按钮互斥渲染（:1887-1890），`recording` 只在 onstop 完成回调置 false，旧 recorder 的 dataavailable/onstop 必然先于新录制可达 → 无交叉污染。但这是**状态门禁而非代码守卫**：`startRecording` 不查 `recorderRef.current?.state`，未来加录制热键即破。建议补一行守卫。
2. **"stopStream 停 track 会丢录制尾部"——不成立**：stopStream 先显式 `recorder.stop()`（:495-497）再停 track，顺序正确，onstop 正常 flush。
3. **"录制中切模式/切源/隐藏视图会丢文件"——不成立**：都走 stopStream → recorder.stop() → onstop 下载；甚至 unmount 停 track 也大概率经规范自动 stop 落盘（中置信）。真正丢文件的只有**应用退出**（渲染进程死亡，onstop 无从执行）。
4. **"captureStore index.json 有读写并发竞争"——不成立**：所有 handler 用同步 fs（captureStore.ts:87-104），主进程事件循环天然串行，读-改-写不可交错；`capturesImport` 的 await 只在 dialog 前。
5. **"hls 实例泄漏"——不成立**：clearPlayerSource 与 unmount 双路径 destroy（:744, :1069）。问题只在 fatal 后不 destroy/不恢复（M-3）。
6. **"trim 导出泄漏 canvas 流"——不成立**：finally 停轨（R70.6 修复已在）。
7. **"filmstrip 缩略图走 base64 IPC 大负载"——不成立**：`CaptureFilmstrip.tsx:111` 用 `media://local?p=` 流式加载（且 captures 目录在 userData 白名单内）。
8. **"fixWebmDuration 遇 mp4 会死循环/产出损坏文件"——不成立**（读库源码验证，fix-webm-duration.js:335-364）：未知元素不递归、长度被 `Math.min` 钳制、异常被 try/catch 吞掉返回原 blob——`.catch(()=>raw)` 兜底成立。仅当文件里已存在**正的** Duration 值时库会放弃修复（:446-453），此残留场景未在 Chromium 流式输出中观测到。
9. **"`%APPDATA%\rgbbox\captures` 有孤儿/膨胀"——当前健康**：实测 5 个 PNG（776B 索引 + 5 文件一一对应，最新 2026-10-15 00:57），无孤儿、无越界类型；kind=annotated/snip 与代码路径吻合。

## 未验证项

1. **MediaRecorder 在 all-tracks-ended 时自动 stop+flush**：规范行为，未在本应用实测（仓只读约束）。M-9 的"文件仍会落盘"结论依赖它。
2. **Chromium 默认 `videoBitsPerSecond` 具体数值**（M-8 的大小估算）。
3. **desktopCapturer.getSources 的 51s stall 在当前 Electron 版本是否仍复现**（M-6 的实际触发率）。
4. **`el.currentTime = 相同值` 时 seeked 事件是否触发**（trim 导出启动挂起；watchdog +5s 兜底存在，风险低）。
5. **SnipView 渲染端对 finishSnip 返回 false 的反馈**（M-14 关联，未读 SnipView）。
6. **media:// 的 ACAO:\* 与 crossOrigin=anonymous 的实机配合**（信任 R92 注释 + mediaProtocol.ts:134 代码）。
