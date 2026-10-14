# 08 — 视频工作站功能盘点与扩展机会评审（RGBBox）

> 评审角色：产品经理 + 资深工程师。范围：`VideoStudioView` 三模式 + 全局截图工具 + 拍摄缓存 + 播放器 AI 增强 + 与灯效的联动面。
> 纪律：所有「已核实」结论均基于本次 grep/读码；「(推断)」标注推断依据。仓库只读，未修改任何文件。
> 产品边界基线：**桌面 RGB 灯效客户端的视频工具**（采样 · 剪辑 · 标注，见 `video.eyebrow`），不是专业 NLE。

---

## 1. 现有功能清单（逐项 grep 核实）

成熟度口径：**成熟** = 多轮加固+测试+真机验证闭环；**可用** = 主路径工作、有已知边界；**骨架** = 能跑但有硬伤；**孤儿** = 宣称存在但实际不可用/死入口。

### 1.1 摄像头模式（`VideoStudioView.tsx` mode='camera'）

| 功能 | 入口 | 证据 | 成熟度 |
|---|---|---|---|
| 摄像头枚举/选择（权限后补 label） | 侧栏「设备」下拉 + 刷新 | `refreshDevices` L538-549 | 成熟 |
| 分辨率/帧率选择（VGA→4K ideal 约束，改参数热重启流） | 侧栏下拉 | `RESOLUTIONS`/`FRAME_RATES` L104-112，重启 effect L582-586 | 成熟 |
| 硬件参数滑杆（brightness/contrast/saturation/sharpness/zoom） | 侧栏「硬件控制」（有能力的摄像头才显示） | `TRACK_CONTROLS` L115，`getCapabilities` 探测 L521-534 | 可用（能力未知时静默隐藏；applyConstraints 失败静默吞掉 L660-661） |
| 镜像 | 传输条翻转按钮 | L1848，导出时烘焙 L674-677 | 成熟 |
| 拍照（PNG 即下载 + 入拍摄缓存） | 传输条「拍照」 | `capturePhoto` L665-691，R92 crossOrigin 修复 | 成熟 |
| 录制（webm，vp9→vp8 兜底；含麦克风音轨——getUserMedia `audio:true` L557） | 传输条「录制」 | `startRecording` L700-739 | 可用（详见 §1.6 录制段） |

### 1.2 屏幕/窗口模式（mode='screen'）

| 功能 | 入口 | 证据 | 成熟度 |
|---|---|---|---|
| 源列表（屏+窗，缩略图+应用图标，all/screen/window 过滤） | 侧栏源网格 | `getCaptureSources` IPC → `desktopCapturer`，L589-599 | 成熟 |
| 屏/窗实流（现代 `selectCaptureSource`+`getDisplayMedia` 60fps，legacy mandatory 约束兜底） | 点源卡片 | `startScreenCapture` L617-653 | 成熟 |
| 按窗口句柄静态截图（原生分辨率 PNG 直落缓存，不经预览流） | 窗口卡片角落相机钮 | `windowSnip.ts`（R290.2），`snipCaptureWindow` IPC L603-615 | 可用（最小化窗口→`empty` 码；koffi PrintWindow(3) 二期未做，PRD R290 已留位） |
| 预览缩放（Ctrl+滚轮 10–800%、平移、1:1、适配，三模式通用） | 悬浮缩放条 | `usePreviewZoom` + `PreviewZoomBar`（R75.1，R94 修 0×0 量测） | 成熟 |

### 1.3 播放器（mode='player'）

| 功能 | 入口 | 证据 | 成熟度 |
|---|---|---|---|
| 本地文件播放 | 「打开文件」（accept `video/*,.mkv,.mov,.avi,.flv,.ts` L1871） | blob: URL 直播 | 可用（mp4/webm 稳；mkv/avi/flv/ts 绝大多数被 Chromium 解封装器拒——R168 `describeMediaError` 把黑屏换成明确报错，但**支持是宣称级的**，见 §6） |
| 播放列表（加文件/文件夹、按文件夹分组、折叠、删项/删组索引修正、持久化+localStorage 双写） | 侧栏列表 | `videoOpenFiles/Folder` IPC → `media://local?p=`（R268 白名单、R70.15 >2GiB 流式 206） | 成熟 |
| 断点续播（1Hz 记录→10s 节流落盘、续播提示条、看完即清、上次条目自动恢复） | 重开条目时提示条 | `playlistProgress.ts` + `noteProgress` L373-401 | 成熟 |
| 网络流（直链 mp4/webm + HLS `hls.js` lowLatency，MSE） | URL 输入框 | `loadStreamUrl` L784-807 | 可用（远程 no-CORS 源被拍照/超分/EQ 链一致拒绝并提示，属浏览器安全边界） |
| 自定义控制条（拖动防抖 seek、±10s、音量、LIVE 态、3s 自动隐藏、快捷键 space/←→/↑↓/M/F/S） | 播放器悬浮条 | L1623-1719 + L1035-1058 | 成熟 |
| 倍速 0.25–4× / 循环 | 控制条 | L1702-1709 | 成熟 |
| 字幕（SRT/VTT 解析、去 HTML 标签、overlay 渲染、换源重置） | 控制条 FileText 钮 | `parseVtt`/`parseSrt` L177-228 | 可用（纯文本 cue，无样式/位移；**accept 里的 `.ass/.ssa` 无解析器——ASS 走 SRT 正则必得 0 cue，死 accept**，见 §6） |
| 裁剪导出（设入/出点、区间可视化、看门狗防卡死、质量三档） | 侧栏「裁剪」面板 | `exportTrimmedClip` L1192-1269 | 骨架（**导出无音轨**：`canvas.captureStream(30)` 只有视频轨；实时重编码非精确剪切；"lossless"标签名不副实，见 §6） |
| 电影 EQ（影院/对白/夜间预设 + ±12dB 增益，懒建图、关=bypass） | 传输条 Sliders 面板 | `useVideoAudioEnhance` + `audioEnhance.ts`（R91.3） | 可用 |
| AI 降噪（DTLN 语音增强，主进程 utilityProcess onnxruntime-node 推理，wet/dry 强度） | EQ 面板内开关 | `denoiseService.ts`/`denoiseProcessor.ts` + worklet（R91.3b；模型 dtln_1/2 共 4.0MB，hf-mirror，sha256 钉死） | 可用 |
| AI 超分（RealESRGAN-AnimeVideo-v3 xs ×4，onnxruntime-web 1.30.0 vendor，webgpu→webgl→wasm 降级，2/3/4× 输入预缩放，fps 表） | 传输条 Sparkles 面板 | `superres.ts`/`useSuperres.ts`（R93 档位①；模型 2.49MB skillsafe-ai hf-mirror；PRD 如实标注「待真机验证」） | 可用（仅动画向；**显示层覆盖，采样/导出链不动**——拍照导出的仍是原始帧） |
| 悬浮 Mini 播放器（keep-alive 切视图续播、可拖可缩、位置记忆） | 切走视图自动浮出 | `MiniPlayerCard.tsx`（R91.2，真机 verify 11/11） | 成熟 |
| 预览缩放 / 拍照 / 局部截图（冻结帧+框选+8 手柄） | 同 live 模式 | R75.3 + R92 修复；S 键三模式统一 | 成熟 |
| CSS 滤镜（8 滑杆，三模式通用，导出烘焙） | 侧栏折叠面板 | `filterCss` L118-129 | 成熟 |

### 1.4 全局截图工具（独立于视频站）

| 功能 | 入口 | 证据 | 成熟度 |
|---|---|---|---|
| 全局热键截图（Alt+A + 4 预设可换，托盘入口） | 热键/托盘 | `snipManager.ts`（SNIP_HOTKEY、`snipHotkeys.ts` 五预设） | 成熟 |
| 秒开（每屏隐藏预载窗口池、BGRA 位图直传无 PNG 编码、轻量 snip.html、快门白闪×2） | — | R130 三层提速（目标 <500ms） | 成熟 |
| 全屏冻结帧→暗幕拖选→裁剪→就地标注 | 冻结屏 | `SnipView.tsx`（ESC/右键取消、会话级全局 Esc R112） | 成熟 |
| 完成动作（copy=剪贴板+落档 / save=落档+下载） | 选区后 | `resolveFinishAction` | 成熟 |

### 1.5 标注器 + OCR（`AnnotateOverlay.tsx`，918 行，截图工具与站内共用）

| 功能 | 证据 | 成熟度 |
|---|---|---|
| 工具：选择/矩形/椭圆/箭头/画笔/文字/马赛克；移动/缩放/旋转/Delete；撤销重做；8 色 3 粗细；文字对齐/加粗/字号；Ctrl+V 贴图；放大平移 | R76/R77/R78 体系 | 成熟 |
| 无水印铁律（导出只搬运像素+用户标注） | R75.2，多处注释 | 成熟 |
| OCR（整图一键 / 框选区域，<8px 回退整图） | R78.3/R79.2 | 可用 |
| OCR 引擎：**RapidOCR（PP-OCRv4 det+rec mobile ONNX，onnxruntime-node CPU，ModelScope 直链 sha256 校验）优先 → WinRT PowerShell 兜底** | `rapidOcrService.ts`（R82）+ `ocrService.recognizeImage`（平台非 win32 直接 `unsupported`） | 可用（**仅 Windows**；CTC 解码/连通域 bbox 纯函数有单测） |
| OCR 后 AI：整理（aiCleanupText R83/R118）、中英翻译（R84/R118 AI8 直连）、自由问 AI（R118.4，OpenAI 兼容协议无关） | OCR 面板三钮 | 可用（依赖用户配 LLM/AI8 档案） |

### 1.6 拍摄缓存胶片栏 + 录制

| 功能 | 入口 | 证据 | 成熟度 |
|---|---|---|---|
| 胶片栏（横向滚动、两端导航、滚轮横滑、折叠开关、一键清空带确认、逐项编辑/删除、导入 png/jpg/webp/bmp） | 预览区下方 | `CaptureFilmstrip.tsx` + `captureStore.ts`（R77.1/R78.4/R170；**上限 200 条 FIFO**、单张 ≤30MB） | 可用（无标签/搜索/批量导出） |
| 录制产出 | 停止后浏览器下载 | R295 `fix-webm-duration` EBML 补时长（失败兜底原样）；`pickMimeType` 候选 `vp9,opus→vp8,opus→webm→mp4` | 可用（**只落 Downloads，不入任何库**；无码率/分辨率/时长控制——全仓 grep `videoBitsPerSecond|audioBitsPerSecond` 0 命中；无暂停续录——`recorder.pause/resume` 0 命中；无倒计时；**屏幕模式录制无声**——两条路径 `audio:false` L628/L636；player 模式无录制入口 L1886） |

### 1.7 与灯效的联动面（现状）

| 功能 | 证据 | 状态 |
|---|---|---|
| `screen-ambient` 效果（整屏采样→LED 网格；`cinema` ambient 预设即绑定它；overlay 激活时停采防反馈环） | `useEngineLoop.ts` L149-166 → 主进程 `captureScreenSample`（desktopCapturer 缩略图→columns×rows RGB 网格 `screenCapture.ts`） | 成熟 |
| 视频播放器→灯效**直连源** | 全仓无（超分注释明说「采样链路不动，仍走原 video 元素采样」指 engine 侧不感知增强层） | **不存在**。现状唯一路径 = 视频显示在屏上 + screen-ambient 采屏（全屏播放可间接达成；MiniPlayer 小窗/被遮挡时采样的是别的内容） |
| 视频墙（LED 面板矩阵拼接，bezel/旋转/fit） | `engine/videoWall.ts` + `VideoWallEditor.tsx`（R20-R22） | 与本站共享「虚拟画布」概念，是 D1 的天然消费端 |

**使用痕迹（主审已核实）**：`captures/` 6 条（截图链路在用）；报障史：webm 拖动（R295 已修）、截图失真/黑屏（R92 已修）、mkv 黑屏（R168 已修为报错）、截图 Esc 取消（R112）、截图秒开（R130）。**录制产物零痕迹**（不入库，无法从应用侧观测使用率）。

---

## 2-3. 候选方向评估卡

评分口径——价值 1-5（目标用户=RGB 灯墙玩家+视频素材截取者）；频次 高/中/低；成本 S(<1天)/M(1-3天)/L(>3天)（按现有模块复用度）；优先级 P0/P1/P2/Backlog/不做。

### 卡 A1｜录制控制包：mp4 可选 + 码率/时长上限 + 暂停续录 + 倒计时

- **价值 4**｜频次 高｜**成本 S**｜风险 低
- 现状：`pickMimeType` 已含 `video/mp4` 候选（Electron 41 Chromium 的 MediaRecorder 支持 mp4/H.264），只差 UI 选择；`MediaRecorder.pause()/resume()` 原生可用；码率只需 `videoBitsPerSecond` 选项。R295 的 duration 修复仅 webm 需要，mp4 分支天然跳过。
- 复用：`startRecording`（L700）单点改造；倒计时复用 REC 徽章样式。
- 验收：选 mp4 时产物为可拖动进度条的 mp4；暂停/续录后单文件连续；倒计时 3s 内不产帧；码率三档产物体积可感差异；R295 回归不破。
- **优先级 P0**（用户报障史直接命中录制产物质量）。

### 卡 A2｜系统声音录制（屏幕模式）

- **价值 4**｜频次 中高｜**成本 M**｜风险 中
- 现状：两条捕获路径硬编码 `audio:false`。Windows 上 Chromium `getDisplayMedia({audio:true})` 可采系统回环，但 Electron 历史上需验证（legacy 路径需 `chromeMediaSource:desktop` 的 audio 约束）。需真机 spike 定夺。
- 验收：录制含系统声音；无系统声音设备时 UI 明示降级；mac 路径明示不支持。
- **优先级 P1**（录制游戏/视频画面的灯墙玩家刚需；先 spike 再排）。

### 卡 A3｜录制入库（产物进胶片栏/媒体库）

- **价值 3**｜频次 中｜**成本 M**｜风险 低
- 现状：captureStore 只收 PNG（`decodePngDataUrl`）；视频需新 store（userData/recordings + index），胶片栏组件需支持视频缩略图与预览。
- **优先级 P2**（先有 A1 控制包，入库才有意义）。

### 卡 B1｜截图→灯效联动（贴到灯墙预览 / 设为 ambient 源）

- **价值 5**（RGB 客户端身份的差异化闭环）｜频次 中｜**成本 M**｜风险 低
- 现状：`image-paint`/`custom-paint` 效果已消费外部图像数据（`gl/effectGl.ts` 注释明说三者同族）；captures 已有文件+索引。缺的只是一条「capture → 图层参数」的 IPC/UI 桥。
- 验收：胶片栏右键/按钮「设为灯效源」→ image-paint 图层换图且预览即时刷新；删除缓存条目时图层回退。
- **优先级 P1**。

### 卡 B2｜延时连拍/定时拍照

- **价值 2**｜频次 低｜**成本 S**｜风险 低（`capturePhoto` 加 interval 即可）
- **优先级 Backlog**（无使用痕迹支撑）。

### 卡 B3｜滚动截长图

- **价值 2**｜频次 低｜**成本 L**｜风险 高（任意窗口滚动驱动 + 拼接，SnipView 冻结帧模型冲突，网页外窗口基本无解）
- **优先级 不做**（专业截图工具领域，性价比极低）。

### 卡 B4｜窗口截图二期（koffi PrintWindow(3) 救最小化窗口）

- **价值 3**｜频次 中｜**成本 M**｜风险 中（原生依赖）
- PRD R290 已留位；`windowSnip.ts` 注释明说二期方案。**优先级 P2**。

### 卡 C1｜逐帧步进（, / .）+ 精确帧导出

- **价值 4**（素材截取者核心动作）｜频次 高｜**成本 S**｜风险 低
- 现状：只有 ±10s；无 `,`/`.` 步进；无 `requestVideoFrameCallback`（grep 0 命中）。帧间隔可默认 1/29.97 或用 rVFC 实测。帧导出 = 现成 `capturePhoto`。
- 验收：暂停态 `,`/`.` 单帧前进后退；连续帧导出命名带时间码；步进不触发 trim 导出守卫冲突。
- **优先级 P0**。

### 卡 C2｜AB 循环

- **价值 3**｜频次 中｜**成本 S**｜风险 低
- 现状：只有整片 loop；seek 条已有 trim 区间可视样式（`.video-player-trim-mark`）可复用为 A/B 标记。
- **优先级 P1**。

### 卡 C3｜字幕增强（.ass 解析 + 同名自动匹配）

- **价值 3**｜频次 中｜**成本 S-M**｜风险 低
- 现状：accept 已收 `.ass/.ssa` 但解析器缺失（诚实性缺口 §6）；同名匹配只需播放列表条目 path → 同目录找 `.srt/.ass`。
- **优先级 P2**（先把死 accept 修掉或摘掉，属 §6 修复项）。

### 卡 D1｜视频→灯墙 ambient 直连源（video-ambient）

- **价值 5**（产品核心叙事：看片即灯效，不依赖全屏）｜频次 高（灯墙玩家主场景）｜**成本 M**｜风险 中
- 现状：engine 的 `screenSample: RgbFrame`（columns×rows RGB 网格，`shared/types.ts` L240）是唯一外部采样入口，`screen-ambient` 经 `context._screenPixel` 消费（`effects.ts` L1836）。播放器 `<video>` 完全可以渲染层自采：离屏 canvas `drawImage(video, 0,0, cols, rows)` + `getImageData` → 同构 RgbFrame，比主进程 desktopCapturer 往返更便宜（无 IPC、无缩略图编码）。
- 与 screen-ambient 的关系：**并列源而非替代**——新增 `video-ambient` 效果 kind（或 screen-ambient 加 `source: display|video` 参数）；display 路径原样保留。MiniPlayer/keep-alive 隐藏态本就持续出帧（R91.2），泵不停采样就不停——切走视图灯随片走，正是 R91.2 注释里「若电影为灯效联动源则采样继续」许过但从未落地的愿。
- 验收：播放任意本地/媒体源 + video-ambient 图层 → 灯随画面；暂停灯冻结；隐藏到 MiniPlayer 仍同步；no-CORS 远程源回退 display 采样并提示；FPS 开销 <1ms/帧（网格分辨率）。
- **优先级 P0**（本轮最高产品杠杆）。

### 卡 E1｜胶片栏批量导出（选目录拷贝全部/多选）

- **价值 3**｜频次 中｜**成本 S-M**｜风险 低
- 现状：文件本就在磁盘（`userData/captures/`），只差一个「导出全部到…」IPC + showOpenDialog。200 条 FIFO 让「导出再清空」成为自然工作流。
- **优先级 P1**。

### 卡 E2｜胶片栏标签/搜索

- **价值 2**｜频次 低｜**成本 M**｜风险 低
- 200 条 FIFO + 无长期沉淀语义，搜索价值有限。**优先级 Backlog**。

### 卡 F1｜格式宣称对齐（打开前容器探测/文案收敛）

- **价值 3**（诚实性+支持预期管理）｜频次 高（每次开文件）｜**成本 S**｜风险 低
- 详见 §6。R168 已把黑屏变报错，剩下的是把「支持」口径收敛为「mp4/webm 稳定，其余尽力+明确失败原因」。
- **优先级 P0**（纯文案/提示层，半天量级）。

### 卡 F2｜mkv/avi 转码或 ffmpeg.wasm 集成

- **成本 L**（ffmpeg.wasm 核心 ~25MB+，违反项目对包体的克制风格）｜产品边界外。
- **优先级 不做**（用户可用外部工具转 mp4；R168 报错已指明方向）。

---

## 4. Top 5 实现草案（基于现有代码）

### ① D1 video-ambient 直连（P0）

- **数据流**：`VideoStudioView` 持续存在的 `playerRef` → 新 hook `useVideoAmbientSample(playerRef, {active})`：rAF/引擎节拍内 `drawImage` 到 `cols×rows` 离屏 canvas（`willReadFrequently`）→ `getImageData` → `Uint8ClampedArray(cols*rows*3)`（RGBA 抽 RGB）→ 存 ref。`useEngineLoop.tick` 的 `needsCapture` 分支旁加 `videoSampleRef` 优先级：场景含 `video-ambient` 层且采样有效时**免主进程 IPC**，直接 `worker.postMessage(msg, [pixels.buffer])`（zero-copy 同现有 screenSample 路径，L194-199 原样复用）。
- **engine 侧**：`EffectKind` 加 `'video-ambient'`（`shared/types.ts` L34 联合追加）；`effects.ts` 直接 `case 'video-ambient'` fallthrough 到现有 `screen-ambient` 的 `_screenPixel` 分支（L1836）——消费逻辑零新写。`primaryParams`/`curatedEffects` 各加一行。
- **UI 入口**：ambient 预设卡（`ambientPresets.ts`）加「影片」预设绑 `video-ambient`；播放器传输条加一个小指示灯「灯效同步中」。
- **测试**：纯函数抽 `rgbaGridToRgbFrame(imageData, cols, rows)`（node 单测）；`effects.test.ts` 加 video-ambient = screen-ambient 同像素断言；真机 CDP 脚本复用 `verify-r912-minicard.mjs` 模式（播放测试片 → 断言 worker 入帧含 videoSample）。
- **风险与边界**：no-CORS 远程源 canvas 污染 → 检测后回退 display 采样 + toast（复用 R92 的 crossOrigin 判定 `isRemoteNoCors`）；隐藏态泵已由 keep-alive 保证。

### ② C1 逐帧步进 + 帧导出（P0）

- **数据流**：`playerRate` 旁加 `frameIntervalRef`：首次步进时用 `video.requestVideoFrameCallback` 测相邻 `mediaTime` 差（无 API 则 1/30 兜底）；`,`/`.` 键入 `playerSeek(el.currentTime ± frameInterval)`（seek 防抖与 trim 守卫已存在，直接继承 L977-986）。
- **UI**：控制条 ±10s 钮旁加 ‹帧/帧› 两钮（暂停态才启用）；快捷键 `,`/`.`。
- **导出**：现有「拍照」即帧导出；补一个连拍模式「每帧导出」到所选目录（复用 `downloadPng` + 序号命名 `clip-HHMMSS-fff.png`）。
- **测试**：`VideoStudioView.test.tsx` 补键盘步进断言；rVFC 间隔测算抽纯函数（给定 mediaTime 序列 → 帧间隔中位数）单测。

### ③ A1 录制控制包（P0）

- **数据流**：`startRecording` 签名不变，读新 state：`recFormat: 'auto'|'mp4'|'webm'`（auto=现 `pickMimeType`）、`recBitrate: 'low'|'std'|'high'` → `videoBitsPerSecond`（2/8/16Mbps 档）、`recMaxMin`（到时自动 stop）。暂停/续录 = `recorder.pause()/resume()` + REC 徽章闪动提示；倒计时 = 点击后 3s 覆盖层（3-2-1，复用 `.video-empty` 样式层）再 `recorder.start(100)`。
- **UI**：录制钮旁弹出小面板（同 R91.3/R93 面板先例：stopPropagation + 互斥）。mp4 产物跳过 `fixWebmDuration`（按 `blob.type` 分支）。
- **测试**：`pickMimeType` 抽成可注入 `isTypeSupported` 的纯函数补单测；倒计时/暂停状态机 happy-dom 测试；真机录 10s 验证 mp4 进度条可拖（R295 验收脚本模式）。

### ④ A2 系统声音（P1，先 spike）

- **草案**：现代路径 `getDisplayMedia({ video: {...}, audio: { mandatory: { chromeMediaSource: 'desktop' } } })`（Chromium Windows 回环）；spike 脚本 `scripts/spike-systemaudio.mjs` 断言 `stream.getAudioTracks().length>0` 且波形非零（复用 `verify-r913b-roundtrip` 注入正弦的思路反向：录屏播测试音→解码 RMS）。失败则 UI 明示「屏幕录制暂无声，摄像头模式含麦克风」——**当前界面对此零提示，属 UX 债**。
- **风险**：Electron 对 getDisplayMedia audio 的支持随版本波动；mac 需 ScreenCaptureKit(CatAudio) 原生路径，超出成本档，明示不支持即可。

### ⑤ B1 截图→灯效联动（P1）

- **数据流**：`CaptureFilmstrip` 条目加「设为灯效源」按钮 → 新 IPC `capturesUseAsPaint(id)`（preload 白名单 +1，R5.1）→ 主进程读文件转 dataURL 返回（`captureStore.read` 现成）→ 渲染层把当前场景某 `image-paint` 图层参数换成该 URL（image-paint 的图像装载链现成，`ImagePaintEditor` 同源）。
- **UI**：胶片条 hover 动作区加图标钮；成功 toast「已应用到灯效图层」。
- **测试**：IPC contract 测试（`ipcContract.test.ts` +1 通道）；组件测试断言点击后调用；engine 侧无改动（image-paint 已消费）。

---

## 5. 「不该做」清单

| 项 | 理由 |
|---|---|
| 滚动截长图 | 任意窗口滚动驱动无通用解，与冻结帧模型冲突；专业截图工具领域（B3） |
| ffmpeg.wasm 转码 / mkv 深度支持攻坚 | 25MB+ wasm 违反包体克制原则；容器边界属 Chromium，非应用可修（F2） |
| 多轨时间线剪辑 / NLE 化 | 产品边界外；现有 trim 骨架修好音轨即够「素材截取」定位 |
| 直播推流（RTMP 等） | 边界外，无用户痕迹 |
| 视频字幕烧录/导出带字幕 | 重编码管线成本 L，边界外 |
| 真人实时超分（R93 档位②③） | PRD R93 调研已实证不可行/非实时；档位③单帧精修维持 Backlog 观察即可 |
| 胶片栏云同步 | 违反 local-first 隐私承诺（PRIVACY.md 明示帧不出本机） |
| OCR 跨平台（mac） | RapidOCR/WinRT 均 Windows-only；mac 需 Vision.framework 原生路径，无 mac 用户痕迹支撑 |

---

## 6. 文档/界面宣称 vs 代码实际

| # | 宣称位置 | 宣称 | 实际（核实） | 建议 |
|---|---|---|---|---|
| 1 | i18n `video.player.formats`（zh L3734 / en L1860）：「本地：mp4、webm、mkv、mov、avi 等」 | mkv/mov/avi 可播 | `MEDIA_MIME` 给了这些扩展 MIME（`mediaProtocol.ts` L22-24），但 Chromium `<video>` 解封装器不支持 matroska/avi/flv/ts 容器——绝大多数文件到 demux 即失败。R168 已把静默黑屏改为明确报错（`describeMediaError`），PRD R168 自己也记录「4K高清资源.mkv 为非法容器」实例。mov 仅在内部实为 H.264/AAC 时偶尔可播 | 文案收敛为「mp4/webm 稳定，其他容器尽力并明确报错」；或打开时按扩展预提示（F1，P0） |
| 2 | 字幕文件选择器 `accept=".srt,.vtt,.ass,.ssa"`（L1714） | ASS/SSA 可加载 | `parseSubtitle` 只有 VTT/SRT 分支（L225-228），ASS 的 `Dialogue:` 行无 `-->` 时间轴 → 0 cue，静默无字幕 | 摘掉 .ass/.ssa 或补最简 ASS 解析（C3） |
| 3 | 裁剪质量档 `video.trim.quality.lossless`（L2149） | 「无损」 | 三档实际只是 vp9/vp8/默认编码器选择（L1205-1209），全程 canvas 实时重编码必是有损；且**导出无音轨**（`canvas.captureStream` 无 audio track，L1221） | 改标签为「高画质/标准」；音轨缺失要么文档明示要么接 `captureStream` + MediaElementAudioSource 混流（并入 C 系维护项） |
| 4 | `VideoStudioView.tsx` 头注释 L10「play mainstream video formats (mp4 / webm / mkv / mov …)」 | 同 #1 | 同 #1 | 注释随 #1 收敛 |
| 5 | 录制入口（`video.rec` 无任何提示） | (推断) 用户以为屏幕录制有声 | 代码事实：screen 两条路径 `audio:false`；camera 路径 `audio:true` 含麦克风 | UI 加一行 hint（A2 附带） |
| 6 | README L45「a mainstream-format video player」 | 模糊宣称 | 同 #1，程度较轻但口径一致收敛 | 随 #1 |
| 7 | （反向：文档比代码谦虚）PRD R93 超分「待真机验证」、R91.3b「听感验收待用户」 | — | 状态如实 | 无需动作，仅记录这两项是当前最大的未闭环验收 |

---

## 结论（一句话）

视频工作站的**截图-标注-OCR 链已是成熟资产**（用户痕迹也集中在此），**播放器是可用资产**（录制/裁剪是带硬伤的骨架）；下一个最高杠杆不是再加播放器功能，而是 ①把「视频→灯效」直连（D1，零新依赖、engine 消费端现成）②逐帧步进（C1）③录制控制包（A1）三个 P0，同时用半天把 §6 的三处宣称-实际差距收敛掉。
