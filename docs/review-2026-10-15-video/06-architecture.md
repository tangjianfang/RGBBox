# 06 · 视频工作站模块 — 架构与可维护性评审

> 评审对象:`VideoStudioView.tsx` + `components/video/` 域 + `CaptureFilmstrip`/`SnipView` + main 侧 snip/capture 设施。
> 方法:静态阅读全文 + grep/wc/git 量化,未构建未跑测试(凡推断均标注)。仓库只读,零改动。
> 置信度图例:🟢=直接读码/命令实测;🟡=启发式脚本或估算;🔴=静态推断未运行验证。

---

## 0. 健康度评分与 Top 结构问题

**综合 5.5 / 10**。分裂明显:

| 层 | 评分 | 一句话 |
|---|---|---|
| `components/video/` 子模块(3297 行) | 8/10 | hooks/纯函数/哑组件分层清晰,数学集中在 previewTransform,多数有专测 |
| `VideoStudioView.tsx`(2229 行) | 4/10 | 单函数 1997 行、56 个 useState,但内部按注释分节、有回归测试钉 |
| main 侧(snip/capture/playlists,668 行) | 7.5/10 | 独立模块化 + 3 个专测文件,但 handler 注册仍集中在 index.ts |
| IPC 契约 | 8/10 | 单源名册 + R253 双测试(名册+preload 同步),唯错误码无统一规范 |

**Top 5 结构问题**(按维护成本排序):

1. **`VideoStudioView` 是 R147 之前的活化石**:App.tsx 拆分规范(CLAUDE.md:「功能状态在 hooks/domains/,纯逻辑在 domain/,view 在 components/」)完全适用于它,但它仍以单组件承载 10 个语义域、56 state、29 ref、40 callback。全项目 3044 行的 `AudioStudioView` 是唯一更大的同类文件——两个 God Component 同构复制(见 §4)。
2. **~154 行纯函数被锁死在组件文件内且未导出**:字幕解析器(`parseVtt`/`parseSrt`/`stripTags`,L155-228)、`filterCss`/`pickMimeType`/`formatElapsed`(L118-153)、缓存读写(L85-97)都是零 DOM 依赖的纯函数,只因内嵌未导出而无法单测。
3. **上帝重置函数**:`clearPlayerSource`(L743-766)一次调用 **15 个 setter**,横跨播放器/字幕/trim/断点续播 4 个语义域;`stopStream`(L494-505)横跨流/录制/摄像头硬件 3 域。任何新域状态都要记得来这里登记——R71.4 注释自述了漏登记的后果。
4. **模式互斥无语言级表达**:28 处 `mode ===` 条件(camera×8、player×13、screen×4、`!== 'player'`×3)散布于 effect/handler/JSX,共享资源与独占资源靠约定区分(见 §2 矩阵)。
5. **跨视图复制粘贴双份维护**:播放列表三件套(add/remove/group)与 `AudioStudioView` 结构级同构,R70.3 注释逐字复制在两个文件;JSX 复用 `audio-*` CSS 类 21 处。

---

## 1. 结构度量(2229 行组件)

### 1.1 基础度量 🟢

| 指标 | 值 | 采集方式 |
|---|---|---|
| 总行数 | 2229 | `wc -l` |
| 组件函数体 | L233-2229 = **1997 行**(单函数) | 读码定位 |
| useState / useCallback / useEffect / useRef / useMemo | **56 / 40 / 26 / 29 / 3** = 154 | `grep -oE '\b<kind>\s*(<|\()'` |
| 自定义 hook | 5(`useI18n`、`usePreviewZoom`×2、`useVideoAudioEnhance`、`useSuperres`) | 读码 |
| return JSX 块 | L1353-2228 ≈ **876 行(占 44%)** | 读码定位 |
| 静默吞错 `.catch(() => {...})` | **18 处** | grep 正则 |
| `mode ===` 条件散布 | 28 处 | grep 计数 |
| 成长轨迹 | 627 行(2026-05-29 cff8a40)→ 2229 行(2026-10-15),25 commits,**3.5×** | `git log --follow` |
| AudioStudioView 对照 | 3044 行 / useState 42 / useCallback 26 / useEffect 20 | 同法实测 |

### 1.2 函数长度 / 圈复杂度 Top 🟡(行距实测;复杂度为手工分支计数启发式,未用工具)

| 函数/块 | 位置 | 行数 | 估圈复杂度 | 备注 |
|---|---|---|---|---|
| `VideoStudioView` 整体 | L233-2229 | 1997 | >120(不可测) | 唯一导出符号 |
| return JSX | L1353-2228 | 876 | — | 其中 Player 舞台 L1376-1721 ≈346 行、Inspector L1917-2200 ≈284 行、Live 舞台 L1722-1809 ≈88 行 |
| `exportTrimmedClip` | L1192-1269 | **78** | ~15 | R70.6 watchdog + rAF 循环 + 双 Promise,时序最难测 |
| player 事件 effect | L882-929 | 48 | ~12 | 6 事件 × 6 监听器,含 R71.5/R71.6 特判 |
| `startRecording` | L700-739 | 40 | ~8 | R295 fix-webm-duration 异步链 |
| `startScreenCapture` | L617-653 | 37 | ~7 | 现代/legacy 双路径回退 |
| `attachStream` | L507-535 | 29 | ~9 | camera/screen 共用,含硬件能力探测循环 |
| `capturePhoto` | L665-691 | 27 | ~8 | |
| `clearPlayerSource` | L743-766 | 24 | — | **15 setter 一口气**(L751-765 连续 13 个 + 上方 2 个) |
| `loadStreamUrl` / `finishSnip` / 键盘 effect | L784/L456/L1035 | 各 24 | ~6-9 | |

### 1.3 state 耦合簇(天然域边界)🟢

按「哪些 state 被同一批 useCallback/effect 共同读写」聚类,10 个簇:

| # | 域簇 | state(数量) | 配套 ref | 锚点证据 |
|---|---|---|---|---|
| 1 | 播放器 | playerUrl/playerName/playerRate/playerLoop/streamUrl/usingHls/playerPlaying/playerCurrentTime/playerDuration/playerVolume/playerMuted/playerControlsVisible/playerLive/miniDismissed(14) | playerRef/hlsRef/seekDraggingRef/controlsHideTimerRef/playerUrlRef | L279-323、事件 effect L882-929 |
| 2 | 摄像头 | devices/deviceId/resIndex/fps/mirror/trackCaps/trackVals(7) | startCameraRef/streamingRef | L263-269、约束重启 effect L582-586 |
| 3 | 屏幕捕获 | sources/sourceFilter/loadingSources/activeSourceId(4) | — | L272-275、L589-653 |
| 4 | 流共享 | streaming/streamError/streamInfo(3) | streamRef | L258-260、stopStream/attachStream |
| 5 | 录制 | recording/recElapsed(2) | recorderRef/chunksRef/recStartRef/recTimerRef | L337-342、L694-739 |
| 6 | 播放列表+续播 | videoPlaylist/videoGroups/playlistVisible/filmstripVisible/currentVideoIndex/videoIsRestored/resumePrompt(7) | progressRef/activeItemIdRef/pendingSeekRef/lastNoteRef/lastPersistRef/playlistRef | L344-367、L1097-1338 |
| 7 | trim | trimMode/trimStart/trimEnd/trimExporting/trimQuality(5) | — | L404-408、L1192-1269 |
| 8 | 截图/标注 | snipActive/snipFrame/annotateSource/editorToastMsg/captures(5) | editorToastTimerRef | L413-479、L1813-1913 |
| 9 | 字幕 | subCues/subFilename/currentSubText(3) | subFileInputRef | L326-328、L954-975 |
| 10 | 视图 | mode/fullscreen/filtersOpen/filters(4) | studioRef/prevModeRef | L243-334 |

跨簇粘连点(拆分时的焊缝):`startSnip` L440-449 同时读 mode+两个 video ref+filterStyle+mirror(簇 8×1×10);`capturePhoto` L665-691 同构;`noteProgress` L373-391 挂在 player 事件上但写簇 6 的 ref。这些是拆分后需要显式传参的接口。

---

## 2. 模式机:camera / screen / player

**结论:JSX 顶层是清晰二分(live vs player),逻辑层是 if/else 交织。** 舞台 JSX 只有一处顶层三元(L1376 `mode === 'player' ?` / L1722 else),Inspector 是三个平铺 mode 块;但 effect/handler 里 28 处条件各自为政,互斥性靠注释约定而非类型。

### 模式 × 资源矩阵 🟢(读码归纳)

| 资源 | camera | screen | player | 生命周期证据 |
|---|---|---|---|---|
| `streamRef` + `videoRef`(live 流) | ● 独占 | ● 独占 | — | 切离 live 模式 → `stopStream`(prevModeRef effect L830-836) |
| `recorderRef`(录制) | ● | ● | — | `mode !== 'player'` 门控按钮(L1886-1890);但 `stopStream` 内也强行 stop recorder(L495-497)——隐式跨域 |
| `trackCaps/trackVals`(硬件轨控) | ● | ◐* | — | *`attachStream` 是共享代码,screen 流同样跑 TRACK_CONTROLS 探测(L516-534),仅 UI 只在 camera 面板露出 |
| `hlsRef` / `playerUrl`(blob) | — | — | ● 独占 | `clearPlayerSource` L743 + unmount L1067-1078(R70.5) |
| `audioFx`(EQ 链) | — | — | ● | hook 自持;面板门控 `mode==='player' && mediaLoaded`(L1447) |
| `superres`(超分帧泵) | — | — | ● | `active: mode === 'player' && visible`(L322)——**模式门控做在 hook 参数里,是全文件最干净的独占表达** |
| `liveZoom` / `playerZoom` | ● / — | ● / — | — / ● | 两套 `usePreviewZoom` 实例(L256/L315),各自喂 loadedmetadata |
| filters/filterStyle + 胶片条 + snip/annotate | ● 共享 | ● 共享 | ● 共享 | 三模式通用按钮区 L1881-1892 |
| trim / 字幕 / MiniPlayer | — | — | ● | |
| keep-alive(`visible=false`) | 流停+snip 取消 | 同左 | **播放继续**,MiniPlayerCard 接管 | L841-850(R91.2) |

值得注意的正面设计:`superres` 的 `active` 门控、`prevModeRef` 单点模式切换清理、R91.2 的 visible 语义(捕获停、播放不停)都是清晰的领域规则——问题只在它们以 26 个 effect 的形式平铺,而非聚在 3 个模式 hook 里。

---

## 3. 测试金字塔缺口

### 3.1 现状修正(线索部分不成立)🟢

「video/ 域仅 frameCapture+superres 两个专测文件」**已被推翻**。实际专测文件:

- `tests/renderer/components/video/`:frameCapture、superres(2)
- `tests/renderer/components/`:annotationModel、annotationRender、audioEnhance、previewTransform、usePreviewZoom、playlistProgress、AnnotateOverlay、RegionSnipOverlay、PreviewZoomBar、CaptureFilmstrip、SnipView、VideoStudioView(12)
- `tests/main/`:snipManager、windowSnip、playlistStore、ipcContract(4)

即:**video/ 目录 15 个 ts 模块中 11 个有专测**;真正无专测的 renderer 模块只有 `useSuperres.ts`、`useVideoAudioEnhance.ts`、`MiniPlayerCard.tsx`、`denoiseWorkletSource.ts`。

### 3.2 VideoStudioView 11 用例覆盖了什么 🟢

`tests/renderer/components/VideoStudioView.test.tsx`(206 行):渲染冒烟×4(header/buttons/无存档/有存档)+ 7 个**回归钉**——R70.4 空列表持久化、R92 crossOrigin、R91.1 模式持久化与续播提示、R91.2 MiniPlayer 显隐、R94 自动恢复、R91.3 音频面板。全部是「修完 bug 钉住」性质,覆盖了持久化/恢复/keep-alive 三条数据流,质量高于典型冒烟集。

### 3.3 无测核心路径清单(按 R147 先例该有域 hook 单测)🟡

| 无测路径 | 现位置 | 拆出后应测点 | 风险 |
|---|---|---|---|
| **录制状态机**:`startRecording`→ondataavailable→onstop→fixWebmDuration→下载→timer 清理 | L694-739 | `useRecorder` + fake MediaRecorder/fake timers:stop 后 setRecording(false)、timer 清理、R295 失败兜底原样下载 | 高(异步+计时器) |
| **流生命周期**:`startCamera` 约束热重启 effect(仅 resIndex/fps/deviceId 变更且已 streaming 时)、`startScreenCapture` 现代→legacy 回退 | L552-586、L617-653 | `useCameraStream`/`useScreenCapture`:mock getUserMedia/getDisplayMedia 断言回退顺序与错误落点 | 高 |
| **播放器加载**:`clearPlayerSource` 15-setter 重置完备性、`loadStreamUrl` HLS 分支(错误→streamError)、blob URL revoke | L743-807 | `useVideoPlayer`:换源后旧字幕/trim/续播提示必须清空(R71.4 回归类) | 中 |
| **trim 导出循环**:watchdog 超时、自然结束、`finish()` 单出口 | L1192-1269 | `useVideoTrim`:fake rAF/clock,卡死 3s 内 watchdog 触发 stop | 高(R70.6 曾翻车) |
| **字幕解析**:parseVtt/parseSrt/stripTags | L155-228(未导出) | `domain/subtitleParser` 纯函数,测成本最低 | 低 |
| 键盘快捷键矩阵(player 8 键 + live S 键 + 输入框豁免) | L1035-1058、L482-491 | 域 hook 测试 | 中 |

---

## 4. 重复与漂移(与 AudioStudioView)

### 4.1 已证实的结构性复制 🟢

| 重复对 | video 侧 | audio 侧 | 漂移证据 |
|---|---|---|---|
| add-from-paths | `addVideoFromPaths` L1097-1112 | `addTracksFromPaths` L1565-1585 | id 生成 `${Date.now()}-${i}-${rand}`、组归并算法、`media://local?p=` URL 拼接**三处逐字相同** |
| remove item/group | `removeVideoItem`/`removeVideoGroup` L1145-1177 | `removeTrack`/`removeGroup` L1867-1921 | **R70.3 索引位移注释在两文件逐字复制**;算法同构,仅「停播放」的实现不同(组件域知识) |
| 分组折叠三件套 | groupedVideoPlaylist/toggleVideoGroupCollapse L1340-1348/L1179 | grouped(L2099)/toggleGroupCollapse(L1922) | 同构 |
| localStorage 配置 | VIDEO_CACHE_KEY load/save L85-97 | CACHE_KEY L819-827 | 同构 |
| CSS 类 | video JSX 复用 `audio-track-item`/`audio-group-header`/`audio-gain` 等 **21 处**(L1447-2105 散布) | 原主 | 视图样式耦合:改 audio 播放列表样式会波及视频站 |

### 4.2 已被治理的漂移(正面样本)🟢

- 时间格式化:R71.8 已统一到 `shared/timeFormat.formatMediaTime`(组件内留有迁移注释 L230-231)。
- 媒体错误:`domain/mediaError.ts` 双视图共享(VideoStudioView L34 / AudioStudioView L24)。
- **胶片条消费无重复**:线索所称「与音频站的胶片条消费重复」不成立——`CaptureFilmstrip` 全 renderer 仅 VideoStudioView 一处消费(grep 实测)。

### 4.3 previewTransform 与其他变换代码 🟢

`containRect`/`containRectNat`/`clampPan`/`clampScale`/`zoomAtPoint` 集中于 `video/previewTransform.ts`(130 行,14 测试),被 `usePreviewZoom` 与 `AnnotateOverlay` 共用,**全 renderer 无第二份实现**(grep containRect/fitRect 仅 video/ 域命中)。`engine/videoWall.ts` 的 fit 数学是 LED 面板矩阵语义(纯 TS、无 DOM),非重复。

---

## 5. IPC 面(对照 R253)

**通道名册:强。** 🟢

- 单一来源 `src/shared/ipc.ts` as const 表;视频站相关 16+ 通道(capture-sources/select-capture-source、video:get/save-paths、video:open-files/folder、captures:list/add/delete/read/import、snip 家族含 R290.2 capture-window)。
- 双重测试:`tests/main/ipcContract.test.ts`(R253:≥130 通道名册、`rgbbox:<域>:<动作>` 命名正则、无重复值、preload 无游离字符串)+ `tests/integration/ipcChannels.test.ts`(ipcChannels ↔ preload API 名字同步,加一侧不同步另一侧即红)。

**类型契约:中强,有手工同步点。** 🟡

- preload 白名单全 typed(`getCaptureSources(): Promise<CaptureSource[]>` 等,preload L93-172、L331-338);载荷类型在 `shared/types.ts`(CaptureEntry L398、WindowSnipResult L407、CaptureSource L415)。
- 但 `main/index.ts` handler 侧参数类型**手写第二遍**(如 videoSavePaths 的 inline 对象类型 L1469 与 preload L333 重复),入参以 `unknown` 接收再 narrow(capturesAdd L327)。三处类型靠人肉同步,R253 测试只锁通道名不锁载荷 schema——名册测试自己的注释也承认「per-channel payload schemas 留待后续 tranche」。

**错误码规范:弱。** 🟢

- 唯一类型化错误码是 R290.2 的 `WindowSnipResult { ok, code: 'empty'|'denied'|… }`(shared/types L407);其余通道 boolean/Promise 直接 reject 字符串。
- renderer 侧 **18 处 `.catch(() => {})` 静默吞错**(L370/419/477/690/1117/1300/1822/1831/1834/1837/1903 等),失败用户无感(对比:filmstrip.missing 是少数给了反馈的)。

---

## 6. 拆分蓝图(对照 R147 模式)

先例校准:`hooks/domains/` 现有 10 个 hook,39-239 行/个;`domain/` 纯函数 21 个文件。video 域按同样粒度:

### 6.1 domain/ 纯函数(从组件文件导出即得,零行为变更)

| 新文件 | 内容(现位置) | 预计行数 |
|---|---|---|
| `domain/subtitleParser.ts` | stripTags/parseVtt/parseSrt/parseSubtitle + SubCue(L155-228) | ~85 |
| `domain/videoStudioCache.ts` | loadVideoCache/saveVideoCache/FilterState/DEFAULT_FILTERS/filterCss/pickMimeType/formatElapsed/pad(L75-153) | ~95 |
| `domain/playlistGrouping.ts` | remove-item/remove-group 的索引位移核心 + 分组归并(**与 AudioStudio 共享**,两侧换用它) | ~60 |

### 6.2 hooks(domains)(按 §1.3 的 10 簇,合并小簇)

| 新 hook | 吸收的簇 | 预计行数 | 关键接口 |
|---|---|---|---|
| `useLiveStream` | 簇 4 | ~110 | streaming/streamError/streamInfo、stopStream/attachStream |
| `useCameraStream` | 簇 2 | ~180 | devices/resIndex/fps/mirror/trackCaps、startCamera、约束热重启 effect |
| `useScreenCapture` | 簇 3 | ~120 | sources/filter/activeSourceId、refreshSources/startScreenCapture/snipWindowShot |
| `useRecorder` | 簇 5 | ~110 | recording/recElapsed、start/stop、R295 duration 修复链 |
| `useVideoPlayer` | 簇 1 | ~280 | 播放器 14 state、clearPlayerSource/loadStreamUrl/事件 effect/seek/键盘 |
| `useVideoPlaylist` | 簇 6 | ~200 | 列表/组/续播 5 ref、add/remove/restore/persist/auto-restore |
| `useVideoTrim` | 簇 7 | ~120 | trim 5 state、setTrimPoint/exportTrimmedClip(watchdog) |
| `useSubtitleTrack` | 簇 9 | ~90 | subCues/filename、文件加载、cue 激活 effect |

### 6.3 components/video/ 视图(JSX 平移)

| 新组件 | 现位置 | 预计行数 |
|---|---|---|
| `PlayerStage.tsx` | L1376-1721(播放器舞台+控制条+字幕+面板) | ~350 |
| `LiveStage.tsx` | L1722-1809 | ~150 |
| `VideoInspector.tsx`(内拆 CameraPanel/SourcePanel/PlaylistPanel/TrimPanel) | L1917-2200 | ~290 |
| `VideoStudioView.tsx` 残留编排 | mode 路由/共享 snip/annotate/filmstrip/toast/MiniPlayer | **~300**(2229 → 约 300) |

焊缝(必须显式化的现有隐式耦合):`startSnip`/`capturePhoto` 需要「当前模式的 video 元素 + filterStyle + mirror」——建议编排层持有 `getActiveVideoEl()` 传入两个 hook;`noteProgress` 依赖 playerRef+progressRef,归 `useVideoPlaylist(playerRef)`。

---

## 7. 演进路线图(按 ROI 排序,每项独立可 commit,禁止大爆炸)

| # | 项 | 动机 | 做法 | 风险 | 量 |
|---|---|---|---|---|---|
| 1 | 导出内嵌纯函数 + 补测 | ~154 行零依赖代码锁死在组件内 | 新建 `domain/subtitleParser.ts` 等三个文件,组件改 import;同 commit 加单测(解析器边界:非法时间戳/HTML 标签/NOTE 行) | 极低(纯搬运,现有 11 用例即回归网) | **S** |
| 2 | 抽 `useRecorder` | 录制状态机零测试且含 R295 异步链;与 UI 零耦合(全 ref) | 整块搬 L337-342+L694-739,`useRecorder(streamRef)`;补 fake-MediaRecorder 单测(stop 必清 timer、duration 修复失败兜底) | 低 | **S** |
| 3 | 抽 `useVideoPlaylist` + `domain/playlistGrouping` | 修 §4.1 双份维护;簇 6 是状态最多但边界最清晰的一簇 | 搬 L344-367+L1097-1340;remove 核心算法提为纯函数后 **AudioStudioView 同 commit 换用**;以现有 R70.4/R91.1/R94 四个回归钉护航,再补 removeGroup 索引位移专项 | 中(触碰两侧) | **M** |
| 4 | 抽 `useVideoPlayer` + `PlayerStage.tsx` | 最大簇(14 state)+最大 JSX 块(346 行) | 先 hook 后视图两步 commit;`clearPlayerSource` 收进 hook 内部,15-setter 重置从「全局记忆」变「域内封装」 | 中(事件 effect 时序) | **M** |
| 5 | 抽 `useLiveStream`/`useCameraStream`/`useScreenCapture` + `LiveStage`/`VideoInspector` | 剩余簇 + 28 处 mode 条件归拢到 3 个模式 hook | camera/screen 先共享 `useLiveStream` 底座再分叉;Inspector 拆 4 面板逐个搬 | 中 | **M** |
| 6 | 抽 `useVideoTrim` + watchdog 单测 | exportTrimmedClip 78 行复杂度最高 | fake rAF/clock:卡死触发 watchdog、自然结束单出口、异常路径 tracks 必 stop(R70.6) | 中高 | **M** |
| 7 | CSS 类去 audio-* 依赖(21 处) | 视图样式耦合跨站 | 别名层或 BEM 重命名,纯样式 | 低但琐碎 | **S-M** |
| 8 | IPC 载荷 schema 锁(R253 后续 tranche 方向) | preload/main 类型手工双写 | 载荷类型定义移入 shared/types,ipcContract 测试加 per-channel schema 抽检;顺手把 18 处静默 catch 中用户可感知路径(持久化/导入)换成 toast | 低 | **M** |

预期终态:VideoStudioView ≈300 行,8 个域 hook 合计 ~1210 行,全部可单测;与 R147 后 App.tsx 的形态对齐。

---

## 8. 值得保留的现有实践

1. **R-N 注释即变更史**:几乎每个非平凡 effect/callback 带 R-N bug 上下文(R70.4/70.5/70.6、R71.4-71.8、R91.x、R92、R94、R168、R169、R295)——拆分时注释必须跟着代码走,是免费的回归需求说明书。
2. **回归钉测试文化**:11 用例全部对应真实历史 bug,拆分期间就是安全网;新增域 hook 时应把这些钉迁移为 hook 级断言。
3. **ref 化高频写路径**:断点续播 1Hz 写 `progressRef` 不触发渲染、10s 节流落盘(L356-391),完全符合项目「帧数据走 ref 不走 state」约定。
4. **单一清理出口意识**:unmount cleanup(L1067-1078)+ playerUrlRef 镜像(R70.5)说明作者对资源泄漏有体系化处理,拆分后每个 hook 各自持有自己的 cleanup 即可平移。
5. **video/ 子目录分层纪律**:哑组件(CaptureFilmstrip 149 行纯 props)/纯函数(previewTransform/superres/annotationModel)/hook(usePreviewZoom/useSuperres)三分;AnnotateOverlay 918 行是自洽子系统带 286+196 行纯逻辑伴随模块。
6. **`superres` 的 `active` 参数门控**(L322):模式独占资源最干净的表达方式,拆分后应推广为三个模式 hook 的标准形态。
7. **previewTransform 数学单点**:三处消费零重复(§4.3)。

---

## 9. 被推翻的假设 / 已验证无问题 / 未验证项

**被推翻的假设(线索修正)** 🟢
- 「video/ 域仅 frameCapture+superres 两个专测」→ 实际 renderer 侧 video 域专测 ≥13 个文件(§3.1);缺口在「编排层/域 hook 级」而非「文件数量」。
- 「胶片条消费与音频站重复」→ CaptureFilmstrip 仅 VideoStudioView 单点消费,不成立。
- 「previewTransform 与其他变换代码重复」→ 全 renderer 无第二份 fit/zoom 实现;engine/videoWall.ts 属另一语义域。

**已验证无问题** 🟢
- IPC 通道名册:R253 双测试锁名,无游离字符串(ipcContract.test.ts 断言 preload 不硬编码)。
- blob URL / hls / 流 / 计时器的清理路径完备(clearPlayerSource + unmount + beforeunload 三道)。
- 音频链/超分/降噪已隔离在自测 hook 内,主组件只是消费状态。

**未验证项(静态推断,需跑验)**
- 全部圈复杂度为手工启发式计数(§1.2),未跑 eslint-plugin-react-hooks/exhaustive-deps 或复杂度工具;组件内有 2 处显式 `eslint-disable-next-line react-hooks/exhaustive-deps`(L585、L928),提示 effect 依赖闭合性靠人肉。
- 拆分蓝图行数为按现位置行距的估算(±20%)。
- 18 处静默 catch 中哪些是「真 best-effort」哪些吞掉了用户可感知失败,需逐条运行时验证;本报告仅按注释与调用点静态分类。
- `attachStream` 对 screen 流也探测摄像头硬件轨控(§2 矩阵 ◐)是否产生实际副作用,需真机捕获验证。
