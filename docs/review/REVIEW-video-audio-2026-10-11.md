# REVIEW — 视频工作站 + 音频工作站（差距审计）

- 日期：2026-10-11 · 分支 `review/vision-gesture-commercial` · 方式：只读代码走查（未跑 test/build）
- 范围：VideoWallEditor / 视频墙域逻辑 / engine/videoWall* 消费侧 / 屏幕捕获 provider 抽象；useAudioAnalyzer / AudioStudioView / 音频反应灯效链路 / 相关测试覆盖面
- 发现总计：**25 条**（P0=0 · P1=1 · P2=7 · P3=17）

## 1. 模块概览

| 侧 | 入口 | 数据流 |
|---|---|---|
| 视频墙（编辑） | `WorkspaceView.tsx:939`（map-panel，仅多屏渲染）→ `VideoWallEditor.tsx` | 编辑 rows/cols/bezel/fit/旋转/display 映射 → `useLayerActions.updateVideoWall` 写 `scene.videoWall` |
| 视频墙（渲染） | `useEngineLoop` onWorkerMessage → `domain/overlayDistribution.ts` | wall 分支：`extractWallPanelFrame`（engine/videoWallFrame 纯数学采样）→ `pushFrameToDisplay`；无 panel 映射的 overlay 走 `extractSubFrame` 兜底 |
| 屏幕捕获 | `useEngineLoop.needsCapture`（仅无 overlay + 有 screen-ambient 层）→ IPC `captureScreenSample` | main `screenCapture.ts` → `captureProviders`（dxgi/SCK=stub，desktopCapturer 实活）→ BGRA 最近邻采样 → RgbFrame → worker `screenSample` → screen-ambient 像素 |
| 音频分析 | `App.tsx:266` `useAudioAnalyzer(enabled, deviceId, shouldAnalyze)` | getUserMedia（`tools/desktopAudio.ts` 解析 sentinel 设备）→ AudioContext+Analyser → 16ms setInterval 写 `dataRef`+subscribers（零 re-render）；status state 仅语义翻转 |
| 音频→灯效 | `useEngineLoop` tick 读 `audioRef.current` → worker `audioInput` → `renderPreviewFrame` ctx._audio* | effects `audio-beat`（bass+beat 包络）/`audio-equalizer`（32 对数频带插值）；无管道时有保活动画 |
| 音频工作台 | `AudioStudioView.tsx`（~3000 行，常驻挂载 R42） | 自建 AudioContext(4096 FFT)+EQ biquad 链+wavesurfer；可视化绘制抽在 `audio/visualizers.ts`，经 BroadcastChannel 复用给 `AudioVizProjector` 投影窗；顶栏 VU 走 `AudioMeters` subscribe+CSS var |

## 2. 发现清单

严重度：P0 立即修 / P1 本迭代 / P2 排期 / P3 顺带。类型：U=bug B=行为断言 V=视觉 T=测试盲区 X=架构债。

| # | 型 | 级 | 位置 | 证据（一句话） |
|---|---|---|---|---|
| U-1 | U | P2 | `src/renderer/src/components/AudioStudioView.tsx:744,2032` | FLAC 导出是假的：`encodeLossless` 对 flac 走 `encodeWav(...,24)`，产物是 24-bit WAV，文件名恒 `.wav`、MIME 却标 `audio/flac` |
| U-2 | U | P3 | `src/renderer/src/hooks/useAudioAnalyzer.ts:204-209` | 捕获失败路径只写 dataRef+status，不通知 subscribers；且 `smoothedBandsRef`/`prevBassRef` 不随错误/换流重置 |
| U-3 | U | P3 | `src/renderer/src/audio/visualizers.ts:413-421` | VU 表"L/R"是把单声道时域 buffer 前后半当两通道（时域序列≠声道），标 L/R 误导 |
| U-4 | U | P3 | `src/renderer/src/components/VideoWallEditor.tsx:99` | rows/cols 缩格删掉选中 panel 时 `selectedPanel` 静默变 null，编辑区无提示消失 |
| U-5 | U | P3 | `src/main/captureProviders/desktopCaptureProvider.ts:10` | `source.name.includes(String(displayId))` 回退匹配："1" 能匹配 "Display 11"，多屏+display_id 为空平台可能取错源 |
| U-6 | U | P3 | `src/renderer/src/hooks/useAudioAnalyzer.ts:217,221-226` | 换 deviceId 期间（enabled 不变）dataRef 停在最后一帧 `active:true`，音频反应灯效短暂冻结在旧值而非归零 |
| B-1 | B | P2 | `AudioStudioView.tsx:1382-1411` + `AudioVizProjector.tsx:74` | waveform 可视化模式下点投影：post 块整体被 `if (vizMode!=='waveform')` 包住、projector 也 early-return → 打开全黑投影窗且按钮显示 active |
| B-2 | B | P2 | `src/renderer/src/components/WorkspaceView.tsx:938` | VideoWallEditor 仅 `displays.length>1` 渲染：多屏配好墙后拔成单屏，wall 模式仍在分发侧生效但 UI 无任何关闭/编辑入口 |
| B-3 | B | P3 | `useEngineLoop.ts:102` + `src/main/index.ts:1042` | 唯一调用点恒传 `hasOverlays:false` 且 renderer 侧已 gate 捕获，main 的防反馈 guard 永不触发（双层 gate 一层死代码，协议语义漂移） |
| B-4 | B | P3 | `useSamplingDomain.ts:73` + `WorkspaceView.tsx:897` | 墙模式下主预览 aspect/内容不含 videoWall（`resolveTargetDisplayAspect` 不读它）——WYSIWYG 断层，编辑器小格子是唯一墙预览 |
| B-5 | B | P3 | `AudioStudioView.tsx:1811-1812` | shuffle 随机 `Math.random()*pl.length` 不排除当前曲目，可连续重复同一首 |
| V-1 | V | P2 | `App.tsx:259` + `AudioMeters.tsx:16` | `audioShouldAnalyze` 只认 overlay/工作区 tab：音频开着切到音频工作站等 tab 时 FFT 停更，但顶栏 VU 表全局渲染且订阅不再收帧 → 电平条冻结在半空不归零 |
| V-2 | V | P3 | `styles/app.css:1231` | `.videowall-grid` 固定 `aspect-ratio:16/9`，1×8/8×1 墙预览比例失真；`getWallAspect` 纯函数现成未用 |
| V-3 | V | P3 | `AudioStudioView.tsx:2147,2347` | vizStyle(art) 切换与 playMode loop 都用 `RefreshCw` 图标，仅 title 可区分 |
| V-4 | V | P3 | `visualizers.ts:150-151` vs `useAudioAnalyzer.ts:40-52` | studio 频谱条用 `pow²` 伪对数映射，LED equalizer 用真对数 32 带——同一音乐两处能量分布观感不一致 |
| T-1 | T | P1 | `tests/renderer/components/AudioStudioView.test.tsx:9-16` | ~3000 行组件 4 个用例全 skip + 1 个 import 冒烟：播放器/EQ 链/LRC/WAV 编码/生成器/投影零行为覆盖（U-1 正是漏网之鱼） |
| T-2 | T | P2 | `tests/renderer/domain/overlayDistribution.test.ts` | `distributeFrameToOverlays` 的 videoWall 分支（R21 核心：wall.panels→extractWallPanelFrame→pushFrameToDisplay）无用例，engine 数学有测但"选路"无测 |
| T-3 | T | P2 | `src/renderer/src/tools/desktopAudio.ts` | sentinel 解析（`__system_audio__`/`__speaker__:`/`__desktop__:` 四分支+回退链）零测试，且与 AI listen 共享——音频捕获可靠性的关键路径裸奔 |
| T-4 | T | P3 | `tests/renderer/hooks/useAudioAnalyzer.test.ts` | 未覆盖：运行中换 deviceId、shouldAnalyze=false→true 恢复、error 时 subscribers 一致性（对应 U-2/U-6 测不到） |
| T-5 | T | P3 | `tests/engine/videoWallFrame.test.ts` | 未覆盖 fit('contain'/'cover')×bezel×rotation 组合的帧级采样路径与旋转越界 UV clamp 行为（纯函数各自有测） |
| X-1 | X | P2 | `src/main/captureProviders/types.ts:3-8` + `screenCapture.ts:24-29` | `CaptureImage.bitmap` 像素格式（BGRA）只在 readSample 实现的注释里隐式存在；DXGI/SCK stub 将来落地时契约不显式，接错通道序=全局偏色且编译期无感 |
| X-2 | X | P3 | `AudioStudioView.tsx:156-789` | 生成器合成/WAV 编码/LRC 解析等 600+ 行纯函数困在组件文件里不可测（T-1 的结构性成因，R147 域抽取方向未覆盖此文件） |
| X-3 | X | P3 | `useAudioAnalyzer.ts` vs `AudioStudioView.tsx:1245-1275` | 双 AnalyserNode 链路：LED 灯效吃捕获源、studio 可视化吃自建链，工作台播放的音轨默认不驱动灯效（需用户选系统回环才间接联通）——产品决定可，但无任何文档/提示 |
| X-4 | X | P3 | `src/engine/effects.ts:694` | `_beatEnvMap` 模块级 Map 按 layer.id 永不清理，删层后残留（有界小泄漏） |

## 3. 价值任务建议（真实价值三关：①砍掉用户可感知？②独立可交付可验收？③文件所有权独立可并行？）

| 任务 | 内容 | ①感知 | ②验收 | ③独立 | 结论 |
|---|---|---|---|---|---|
| W1 | 顶栏电平表冻结修复（V-1+U-2+U-6 打包）：`shouldAnalyze` 翻 false / error / 换设备时向 subscribers 推归零帧并重置 EMA | ✓ 每次切 tab 可见 | ✓ 切 tab 后 `--level`→0，vitest 可测 | ✓ 主改 `useAudioAnalyzer.ts` 单文件 | **通过** |
| W2 | waveform 投影黑屏修复（B-1）：waveform 模式禁用投影按钮（title 说明）或投影时自动切 spectrum | ✓ 不再开黑窗 | ✓ 交互断言/组件测试 | ✓ `AudioStudioView.tsx` 自包含 | **通过** |
| W3 | FLAC 假导出修复（U-1）：短期撤掉 FLAC 选项或改标 "WAV 24-bit"；真 FLAC 编码另立 R-N | ✓ 拿到错标格式文件 | ✓ 导出文件 RIFF 头校验 | ✓ `AudioStudioView.tsx` 自包含 | **通过** |
| W4 | 单显示器墙模式逃生口（B-2）：单屏时仍渲染编辑器（至少 disable 按钮+摘要行） | ✓ 不被墙模式困死 | ✓ 单屏+持久化 wall 可一键关 | ✓ `WorkspaceView.tsx` 一行+editor 微调 | **通过** |
| W5 | 墙分发链路守护测试（T-2+T-3+T-5）：wall 分支选路、desktopAudio sentinel、fit×bezel×rotation 帧级组合 | △ 间接（防回归：墙投影错路/音频源回退坏掉用户立刻可感） | ✓ vitest 绿 | ✓ 全在 `tests/` 新文件 | **通过（防回归档）** |
| W6 | 墙编辑器预览保真（V-2+部分 B-4）：容器 aspect-ratio 接 `getWallAspect`（含面板物理比例） | ✓ 8×1 墙不再压扁 | ✓ 截图/DOM 断言 | ✓ `VideoWallEditor.tsx`+css | **通过** |
| W7 | capture 契约显式化（X-1）：`types.ts` 写明 BGRA + readSample 处断言 | ✗ 用户当下不可感知（防未来偏色回归） | ✓ | ✓ | 降级：并入未来任何 capture 相关 R-N 顺带做 |
| W8 | AudioStudioView 纯函数域抽取（X-2+T-1 前置）：WAV 编码/LRC/生成器抽 `domain/audioStudio/` 并补测试 | △ 间接（解锁 T-1 使 3000 行组件可测） | ✓ 抽出函数单测 | ✓ 新 `domain/` 文件，不动组件行为 | 中期任务，随 T-1 一起立 R-N |

## 4. 优先级排序

1. **W1**（P2·高频可见·改动小）→ 2. **W2**（P2·功能级黑窗）→ 3. **W3**（P2·产物错误）→ 4. **W4**（P2·配置困死，触发条件较窄）→ 5. **W5**（P1/P2 测试债还清，防回归）→ 6. **W6**（P3 视觉小改）→ 7. **W8**（结构性，随迭代）→ 8. **W7**（顺带）。

> 流程提示：以上每条落地前需按 CLAUDE.md 在 PRD-0002 追加对应 R-N 条款（W1-W6 可各一条，W5 建议并入其守护对象的 R-N）。
