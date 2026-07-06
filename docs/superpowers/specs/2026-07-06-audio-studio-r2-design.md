# AudioStudio 第二轮优化设计稿（R52）

> 起源：用户在 R50/R51 完成后提出的 5 项音频工作站优化。
> 1. 顶部 transport 与底部播放器功能重复，仅保留顶部，把底部播放器功能迁到顶部。
> 2. 无法拖拽添加音频文件和文件夹；音频文件表应独立、默认长度跟随主界面底部而非动态同步图表区；图表区也跟随主界面底部；场景/导出合并后迁入「生成器」按钮内部窗口，图表默认全屏。
> 3. 6 种可视化图表（频谱/示波器/声谱图/VU 表/Circular/Wave Ring/波形图）目前只有图形，需合理融入数据/数值（不必太明显），并提供更多好看的图样，投屏到显示器时也是一件艺术品。
> 4. 选择显示器投屏也可选全屏、区域、自定义。
> 5. 播放音频时间一直显示 0:00；音量、声道平衡也要显示对应数值。

## 决策记录（已与用户确认）

- **去重方案**：顶部全合并 + 删底部 `audio-player-controls`（用户选「推荐」）。
- **场景/导出去向**：并入 Generator 抽屉 sub-tab（用户选「推荐」）。
- **图表范围**：轻量数值 + 每图 1 个美化变体（用户选「推荐」）。
- **投票选项**：复用 DisplayMap 8 选项（用户选「推荐」）。
- **投屏区域实现**：A 方案 —— overlay 窗口仍整屏覆盖显示器，renderer 内部按 region 矩形布局 canvas，不动主进程（用户选「A」）。
- **执行方式**：沿用 R50/R51 决策，subagent 跳过 `yarn dev`，用户最终统一人工 GUI 验收。

## 约束（CLAUDE.md）

- 单 PRD 模型：追加 R52 到 `docs/prd/PRD-0002-rgbbox-project-catalog.md`，禁止开新 PRD。
- 提交标题 `[PRD-0002] <type>: <subject>`。
- 不动 `package.json` scripts 段、`src/main/index.ts`、`src/preload/index.ts`。
- 命令走 `yarn typecheck` / `yarn build` / `yarn test`。

---

## 1. R52 子条款拆分

| 子条款 | 内容 | 类型 |
|---|---|---|
| R52.1 | 顶部 transport 全合并 + 删底部 `audio-player-controls` | 重构 |
| R52.2 | 文件表独立高度 + 修复拖拽添加文件/文件夹 | bug + 布局 |
| R52.3 | 图表区占满右栏全高（删底部 scenes/export tabs） | 布局 |
| R52.4 | 场景/导出并入 Generator 抽屉 sub-tab | 重构 |
| R52.5 | 6 图表数值叠加（纯函数 + 单测先行） | 新功能 |
| R52.6 | 6 图表美化变体（每图 1 个，投屏可关数值） | 新功能 |
| R52.7 | 投屏区域选择（复用 DisplayMap 8 选项，A 方案） | 新功能 |
| R52.8 | 修复播放时间 0:00 + 音量/平衡数值标签 | bug + 小特性 |
| R52.9 | i18n 新 key | 收尾 |
| R52.10 | 验收点（静态 + 用户人工） | 收尾 |
| R52.11 | 受影响文件清单 | 收尾 |
| R52.12 | 状态标记 | 收尾 |

---

## 2. 布局骨架

### 2.1 现状（基于探查）

```
audio-studio-view
├─ workspace-header
│  └─ audio-tools-bar              (R51.1 顶部迷你 transport: ⏮▶⏭ + time)
│     └─ [EQ][Generator]
└─ audio-studio-layout (flex row)
   ├─ audio-left-panel (280px, onDrop drop zone)
   │  ├─ audio-toolbar (Add Files/Folder 按钮)
   │  ├─ audio-playlist (文件表)
   │  └─ audio-player-controls (1852-1973 底部完整播放器: 走带+进度+音量+平衡+模式+歌词+曲名)
   └─ audio-right-panel (flex:1)
      ├─ audio-visualizers (图表 + viz mode bar)
      └─ audio-tabs (2039-2050 Scenes/Export tabs → 2505-2617 内容面板)
         + EQ/Generator 抽屉浮层
```

### 2.2 目标

```
audio-studio-view
├─ workspace-header
│  └─ audio-tools-bar              ← R52.1 全合并：
│     ⏮ ▶ ⏭  ━━●━━ 1:23/3:45  🔊━● ⟷━● 🔁🔀 │曲名│ [EQ][Generator]
└─ audio-studio-layout (flex row, 各子栏独立跟随主界面底部)
   ├─ audio-left-panel              ← R52.2 drop zone 全覆盖 + 修复拖拽
   │  ├─ audio-toolbar (Add Files/Folder)
   │  └─ audio-playlist (独立高度, 占满左栏)
   │  [audio-player-controls 整块删除]
   └─ audio-right-panel             ← R52.3 占满全高
      └─ audio-visualizers (占满; audio-tabs scenes/export 删除)
         + EQ/Generator 抽屉浮层（Generator 抽屉内 R52.4 加 sub-tab）
```

Generator 抽屉内（R52.4）：

```
点 [Generator] →
┌─ Generator 抽屉 ──────────────────┐
│ [生成器][场景][导出]  ← sub-tab   │
│ ─────────────────────────────────│
│ (复用现有三块内容面板 JSX)        │
└──────────────────────────────────┘
右栏：图表占满全高（无底部 tabs）
```

---

## 3. 各子条款详细设计

### R52.1 顶部 transport 全合并

把底部 `audio-player-controls`（AudioStudioView.tsx:1852-1973）的所有控件迁入 `audio-tools-bar`：

- 走带：`⏮ ▶/⏭`（复用 `skipPrev/togglePlay/skipNext/isPlaying`，已在 R51.1 接入顶部）。
- 进度条：`<input type=range>` 绑 `progress` + `seek`（复用 `seek(time)` 1572-1577）。
- 时间：`formatTime(progress) / formatTime(duration)`（复用 `formatTime` 1692-1697）。
- 音量：slider 绑 `volume` + `setVolume`（state 914），加数值标签（见 R52.8）。
- 平衡：slider 绑 `balance` + `setBalance`（state 918, panner 1010），加数值标签。
- 播放模式：循环/随机/顺序按钮（复用现有 `loop/shuffle/sequential` handler）。
- 曲名：当前轨道 title（复用现有 currentTrack state）。

底部 `audio-player-controls` 整块 JSX 删除。歌词面板的处理：歌词原本嵌在底部播放器内；迁到顶部会过挤。**歌词面板移到文件表下方**（左栏底部）或保留为可选浮层 —— 默认不在顶部显示，点「歌词」按钮在左栏底部展开。本条不改歌词渲染逻辑，仅迁移容器。

CSS：`audio-tools-bar` 改为 `display:flex; gap; align-items:center; flex-wrap:wrap`，容纳更多控件；窄屏允许换行。

### R52.2 文件表独立高度 + 修复拖拽

**拖拽修复（核心 bug）**：
- `onDragOver` 必须 `e.preventDefault()`（现状疑缺，导致 drop 不触发）。
- `onDrop` 取文件路径：新 Electron 中 `File.path` 已废弃/为空，改用 `window.rgbbox` 暴露的 `webUtils.getPathForFile(file)`（若 preload 未暴露，则用 `dataTransfer.items[i].webkitGetAsEntry()` 递归 + `file.name` 兜底；**不改 preload** —— 若需 webUtils 必须经 preload 白名单，则单独评估；优先用 renderer 内可得的 entry API + 现有 `addFilesFromPaths` IPC 的路径回退）。
- 文件夹：`webkitGetAsEntry()` → `FileSystemDirectoryEntry` 递归 `readEntries`，收集音频扩展名文件（白名单 `.mp3/.wav/.flac/.ogg/.m4a/.aac`），上限 100 文件，超限 toast。
- drop zone 覆盖整个 `audio-left-panel`（现状 1795 已是，确认 `onDragOver`/`onDrop` 都在根 div 且 `preventDefault`）。

**文件表独立高度**：`audio-left-panel` 已是 flex column；删除底部播放器后 `audio-playlist` 自然占满左栏高度，跟随 `audio-studio-layout` 高度（即主界面底部）。不与右栏图表区联动（两者本就是 flex row 并列，各自 stretch）。

### R52.3 图表区占满右栏全高

删除 `audio-tabs`（2039-2050）的 Scenes/Export tabs JSX；`audio-visualizers` 容器 `flex:1` 占满 `audio-right-panel`，全屏与非全屏下都跟随主界面底部。Scenes/Export 内容面板 JSX（2505-2559 / 2562-2617）迁移到 Generator 抽屉（R52.4），不重写逻辑。

### R52.4 场景/导出并入 Generator 抽屉

Generator 抽屉（现有 drawer 结构）内加 sub-tab 切换：`生成器 / 场景 / 导出`，用新 state `genSubTab: 'generator'|'scenes'|'export'`（不复用顶层 `activeTab`，避免与右栏已删除的 tabs 冲突）。复用现有三块内容面板（生成器 2440 附近 / 场景 2505-2559 / 导出 2562-2617）的 JSX 与 handler，仅迁移容器。Generator 按钮图标/文案保留。

### R52.5 可视化数值叠加（纯函数 + 单测先行）

**新建 `src/engine/audioMetrics.ts`**（纯 TS，无 DOM/canvas，符合 engine 层约定），导出：

```ts
// 输入：Uint8Array freqData (0..255, analyser.frequencyBinCount), sampleRate, fftSize
// 输出：峰值频率 Hz + 峰值 dB
export function peakFrequency(freqData: Uint8Array, sampleRate: number, fftSize: number): { freqHz: number; db: number }

// 输入：Float32Array timeData (-1..1)
// 输出：RMS
export function rmsLevel(timeData: Float32Array): number

// 输入：freqData
// 输出：主导频率 Hz（加权质心或峰值）
export function dominantFrequency(freqData: Uint8Array, sampleRate: number, fftSize: number): number

// 输入：timeData
// 输出：短时 LUFS 估算（K-weighted 简化 → dBFS 近似）
export function lufsShortEstimate(timeData: Float32Array): number

// 输入：timeData, sampleRate
// 输出：BPM 估算（自相关峰）
export function estimateBPM(timeData: Float32Array, sampleRate: number): number
```

**新建 `tests/engine/audioMetrics.test.ts`**（单测先行）：用合成数据（已知正弦/方波）验证 peak/RMS/dominant/BPM 数量级正确，LUFS 边界。

**visualizers.ts overlay 绘制**：每个 `drawXxx` 增加可选 `opts.showMetrics`，在 canvas 角落小字画 1-3 个指标（半透明 `#e6c07b`，`font 10px`，不喧宾夺主）：

| 图表 | overlay 指标 |
|---|---|
| 频谱 Spectrum | peak Hz + dB |
| 示波器 Oscilloscope | RMS |
| 声谱图 Spectrogram | dominant Hz |
| VU 表 | 短时 LUFS 估 |
| Circular | peak Hz |
| Wave Ring | peak Hz |
| 波形 Waveform | BPM 估 |

数据源不变（已有 `getByteFrequencyData`/`getFloatTimeDomainData`）。

### R52.6 可视化美化变体

每个图加 1 个美化变体样式，通过 viz 模式条上的「风格」开关切换（或加 `vizStyle: 'classic'|'art'` state）：

| 图表 | 美化变体 |
|---|---|
| 频谱 | 镜像 + 渐变填充 |
| 示波器 | 辉光（shadowBlur）+ 渐变填充 |
| 声谱图 | 对数色映射 + 渐变 |
| VU 表 | 圆弧（径向）刻度 |
| Circular | 辉光环 + 径向渐变 |
| Wave Ring | 双环 + 辉光 |
| 波形 | 渐变填充 + 辉光 |

投屏艺术品模式：投屏时 `showMetrics=false`（纯视觉），renderer 内 canvas 仍按 region 渲染（R52.7）。

### R52.7 投屏区域选择（A 方案）

投屏 picker（`audio-display-picker` 1998-2028）扩展：
- 顶部一行 8 个区域按钮（复用 `DisplayMap.tsx:6-14` 的 `fullscreen/top/middle/bottom/left/center/right/custom` 常量与 label）。
- 下方现有显示器列表（多选）。
- custom → 弹框选器（在 viz 预览上鼠标拖框）返回比例 `{x,y,w,h}∈[0,1]`。

`projectToDisplay(displayId, region)`：
- overlay 窗口仍整屏覆盖目标显示器（沿用现有 `openAudioVizWindow`）。
- overlay renderer 内部按 region 矩形布局 canvas：`fullscreen` → canvas 100%；其余 → canvas 居中于 region 矩形，其余区域透明（窗口背景透明，`backgroundColor: '#000'` 透明处理）。
- **纯渲染层，不动主进程 / preload / IPC。** region 矩形作为 query param 或 localStorage 传给 overlay 窗口（沿用现有 overlay 窗口的初始化参数机制；若现有机制不支持传参，则经 `window.rgbbox` 已有白名单或 localStorage 读取，**不改 preload**）。

### R52.8 修复播放时间 0:00 + 音量/平衡数值

**时间 bug 定位（实现时确认根因）**：
- 现状 `setInterval(100)` 读 `audioElementRef.current.currentTime → progress`（1346-1355），文件播放理论上会更新。
- 用户反馈一直 0:00 → 怀疑：(a) 生成器/合成音播放路径不经过 `<audio>` 元素，currentTime 恒 0；(b) `audioElementRef` 与实际播放的 audio 元素不是同一引用；(c) `duration` 为 NaN 导致 `formatTime` 回退 0:00。
- 修复：
  - 文件播放：确认 `audioElementRef` 绑定到唯一 `<audio>` 元素，`timeupdate` 事件或 interval 正确写 `progress`/`duration`；`duration` NaN 时显示 `--:--`。
  - 生成器模式：progress 显示已播放时长 `ctx.currentTime - genStartTime`，duration 显示生成时长（若无限则 `∞`）。

**音量/平衡数值标签**：slider 旁加 `<span className="audio-value">`：
- 音量：`0–100%`（`Math.round(volume*100)`）。
- 平衡：`L50–R50` 格式（balance<0 → `L${Math.round(-balance*50)}`，>0 → `R${Math.round(balance*50)}`，0 → `C`）。

### R52.9 i18n + 验收 + 收尾

- `src/renderer/src/i18n/index.tsx` 加 key：
  - `audio.gen.subTab.generator/scenes/export`（若复用现有 `audio.tab.*` 则不重复）。
  - `audio.viz.style.classic/art`、`audio.viz.metrics.*`（各指标标签）。
  - `audio.region.*`（若复用 `display.region.*` 则不重复，沿用全局）。
  - `audio.volume`/`audio.balance` 数值格式沿用现有 label。
- 验收点（R52.10）：静态 `yarn typecheck`/`build`/`test` 全过 + audioMetrics 单测通过；GUI 行为（拖拽/布局/图表数值/美化/投屏区域/时间/数值）用户统一人工验收。
- 受影响文件（R52.11）。
- 状态（R52.12）。

---

## 4. 数据流

```
用户拖文件到左栏 → onDrop → webUtils/entry → addFilesFromPaths IPC → playlist state
用户点播放 → togglePlay → <audio>.play() → timeupdate → progress/duration state → 顶部 transport 显示
analyser rAF (1214-1238) → freqData/timeData
  → visualizers drawXxx(..., {showMetrics, style})
  → audioMetrics.* 纯函数算指标 → canvas 角落 overlay
用户点投屏 → picker 选 region + displayId → projectToDisplay(id, region)
  → openAudioVizWindow(id) → overlay renderer 按 region 布局 canvas
```

## 5. 错误处理

- 拖拽非音频文件 → 静默跳过（扩展名白名单）。
- 文件夹递归 > 100 文件 → 截断 + toast「已添加前 100 个」。
- 投屏 custom 框选面积 ≈ 0 → 回退 fullscreen + toast。
- generator 模式无 `<audio>` → progress 显示 `ctx.currentTime - genStartTime`，duration `∞`，不报错。
- `duration` NaN → 显示 `--:--` 而非 `0:00`。

## 6. 测试

- `tests/engine/audioMetrics.test.ts`：peak/dominant/RMS/LUFS/BPM 纯函数单测（TDD 先行）。
- 其余 GUI 行为：静态验证（typecheck/build/test exit 0）+ 用户最终人工 GUI 验收。
- 沿用 R50/R51 决策：subagent 跳 `yarn dev`，PRD 验收点标「静态验证」+「用户待人工验收」子项。

## 7. 受影响文件

| 文件 | 改动 |
|---|---|
| `src/renderer/src/components/AudioStudioView.tsx` | 顶部合并、删底部、文件表独立、删 tabs、Generator sub-tab、投屏 picker region、时间 bug、数值标签 |
| `src/renderer/src/audio/visualizers.ts` | 数值 overlay + 美化变体 |
| `src/engine/audioMetrics.ts`（新） | 纯函数指标计算 |
| `tests/engine/audioMetrics.test.ts`（新） | 单测 |
| `src/renderer/src/styles.css` | 布局 + 抽屉 sub-tab + 数值标签 + viz 风格 |
| `src/renderer/src/i18n/index.tsx` | 新 key |
| `docs/prd/PRD-0002-rgbbox-project-catalog.md` | 追加 R52 |

不动：`package.json` scripts 段、`src/main/index.ts`、`src/preload/index.ts`（R52.7 投屏区域纯渲染层处理；若拖拽修复确认需要 `webUtils.getPathForFile` 而 preload 未暴露，则**单独再追加 R-N**，不在本条内顺改 preload）。

## 8. 风险

- **R52.7**：若现有 overlay 窗口初始化无法接收 region 参数且无白名单通道，可能需 preload 改动 → 届时单独立 R-N，不在 R52 内强改。
- **R52.2**：`File.path` 废弃后的路径获取若只能经 preload `webUtils`，同上。
- **R52.8**：时间 bug 根因需实现时定位；若涉及主进程 audio 元素生命周期，可能需追加 R-N。

以上三处如触发主进程/preload 改动，遵循 CLAUDE.md「未通过 R-N 流程不要顺手修」，单独立条后再实施。