# UI 优化设计：布局自适应 + AudioStudio transport + EQ 双模式

> 日期：2026-07-06
> 关联 PRD：PRD-0002（拟追加 R50 阶段 1 基础设施、R51 阶段 2 功能）
> 范围：renderer 层 UI/UX，不动 IPC / 引擎 / 主进程 / audio 播放引擎本身

## 1. 背景与目标

用户提出 5 项 UI 优化：

1. 底部拉伸时不自适应窗口，内容区栏部分内容只显示一部分（溢出截断）
2. 采样设置展开与收起时显示栏大小一样（应不同）
3. 音频工作站播放器控制放到 top 区域，方便顺手控制
4. EQ 设置拖动曲线后即时生效；提供高级/经典 EQ 算法曲线（有参考性）；支持自定义 EQ 曲线
5. 部分 UI 布局不合理，按人体工程学 + 黄金分割法重新布局

经评估，第 5 项为「全局布局重构」，影响全部 9 个 view，回归面大。采用**两阶段**拆分以隔离回归：

- **阶段 1（R50）— 基础设施**：全局布局黄金分割重排 + 底部自适应 + 采样面板高度 bug。纯 CSS + 极小 JSX 改动，无业务逻辑。
- **阶段 2（R51）— 功能**：AudioStudio 顶部快按 transport + EQ 双模式（graphic + parametric）+ 频率响应曲线图 + 预设库 + 自定义。集中在 AudioStudioView。

## 2. 阶段 1（R50）：布局基础设施

### 2.1 黄金分割比例

φ ≈ 1.618，1/φ ≈ 0.618，1/φ² ≈ 0.382。

**侧栏 vs 主区**：
- 现状 `.app-shell { grid-template-columns: 240px 1fr }`
- 改为 `clamp(180px, 22vw, 260px) 1fr`（响应式侧栏，22vw 在常见 1920 宽 ≈ 422px 被 clamp 到 260px 上限，符合侧栏约为主区 0.13–0.17 的视觉比例）

**内容区左右栏**：
- 现状 `.content-grid { grid-template-columns: minmax(320px, 1.5fr) minmax(260px, 0.85fr) }`（≈1.76:1）
- 改为 `1.618fr 1fr`（φ:1），并去掉 minmax 约束改为 `min-width: 0`（让子项可收缩，配合下面的自适应）

### 2.2 底部自适应（第 1 项）

**根因**：`.app-shell` 高度 `calc(100vh - 40px)` + `margin-top: 40px` 本身正确（让位 `position:fixed` 的 `titlebar-drag` 40px）。底部截断根因在内部——`.workspace-main { overflow-y: auto }` 但其子 `.panel`/`.preview-panel` 有固定 `min-height`（200/320px），多面板堆叠总高超过容器；且 flex/grid 子项默认 `min-height: auto`，无法收缩到内容以下，导致底部内容在可视区外被截断、滚动条也救不回部分场景。

**修复**（保持 `.app-shell` 高度 `calc(100vh - 40px)` 不变，只改内部）：

- `.workspace-main` 保留 `flex: 1` + `overflow-y: auto`，加 `min-height: 0`（关键：让 flex 子项可收缩）
- `.preview-panel { min-height: 320px }` → `min-height: 0` + `flex: 1 1 auto`
- `.panel { min-height: 200px }` → `min-height: 0` + `flex: 1 1 auto`
- 每个 view 根容器加 `display: flex; flex-direction: column; min-height: 0`，内容区 `flex: 1 1 auto; min-height: 0; overflow: auto`

效果：内容区按 flex 分配剩余空间，超出由内容区自身 `overflow: auto` 滚动，不再被父容器截断；底部拉伸窗口时自适应。

### 2.3 采样面板高度 bug（第 2 项）

**根因**（已确认）：CSS 特异性问题——`.sampling-panel { min-height: unset }` 被后定义、等特异性的 `.panel { min-height: 200px }` 覆盖。JS 已有 `samplingCollapsed` state（App.tsx:1148），但 className 未区分。

**修复**：

- App.tsx：`<section className="panel sampling-panel">` → `className={\`panel sampling-panel${samplingCollapsed ? ' collapsed' : ''}\`}`
- styles.css：
  - `section.sampling-panel { min-height: 0 }`（提升特异性，胜过 `.panel`）
  - `section.sampling-panel.collapsed { min-height: 0; height: auto }`（收起：仅显示标题行高度）
  - `section.sampling-panel:not(.collapsed) { min-height: 0; height: auto }`（展开：按内容自适应高度）

效果：收起时面板高度 = 标题行；展开时高度 = 标题 + tabs + 控件内容，两者明显不同。

### 2.4 影响文件

- `src/renderer/src/styles.css`（主要）
- `src/renderer/src/App.tsx`（仅采样面板 className 加 `.collapsed`）

### 2.5 不动

业务逻辑 / IPC / 引擎 / 3D / audio graph / 其他 view 的 JSX 结构。

### 2.6 验证

- `yarn typecheck` / `yarn build` / `yarn test` 全过
- 启动 dev，逐个进入 9 个 view，验证：
  - 底部内容不被截断（缩小窗口到底部仍可滚动/自适应）
  - 采样面板收起/展开高度明显不同
  - 各 view 布局未被破坏（侧栏、内容左右栏比例、预览区）
  - 黄金分割比例视觉协调

## 3. 阶段 2（R51）：AudioStudio transport + EQ 双模式

### 3.1 顶部快按 transport（第 3 项）

**现状**：`audio-tools-bar`（AudioStudioView.tsx:1587）只有 EQ / Generator 按钮。完整播放控制（进度/音量/平衡/模式/曲名）在底部 `audio-player-controls`（1665–1728）。

**改动**：

- `audio-tools-bar` 改 `display: flex; justify-content: space-between`，左侧加 transport cluster，右侧保留 EQ/Generator 按钮
- transport cluster：`SkipBack / Play|Pause / SkipForward` + `time / duration` 文字显示
- 复用现有 `skipPrev` / `togglePlay` / `skipNext` / `isPlaying` / `progress` / `duration`，**无新逻辑**
- 底部 `audio-player-controls` **原样保留**（进度条/音量/平衡/播放模式/歌词/曲名仍在底部）

### 3.2 EQ 双模式（第 4 项）— 核心

#### 3.2.1 数据模型

统一为 `EqBand[]`：

```ts
type EqFilterType = 'peaking' | 'lowshelf' | 'highshelf' | 'notch'
                  | 'lowpass' | 'highpass' | 'bandpass'
interface EqBand {
  id: string
  type: EqFilterType
  freq: number      // Hz
  gain: number      // dB, -24..+24
  Q: number         // 0.1..20
}
type EqMode = 'graphic' | 'parametric'
```

- **Graphic 模式**：10 段固定 ISO 频率（现状 `EQ_FREQS = [31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]`），`type='peaking'`、`Q=1.41` 锁定，UI 是 10 个垂直滑块（现状保留）
- **Parametric 模式**：N 段（默认 6，可增减 1–12），每段 type/freq/gain/Q 全可调

#### 3.2.2 音频图

利用 Web Audio `BiquadFilterNode` 的 `type` / `frequency` / `Q` / `gain` 可直接 `setValueAtTime`/`setTargetAtTime` 实时改、无需重建 node：

- 改 gain / freq / Q / type → 直接写现有 node（不中断播放、无 zipper 噪声，用 `setTargetAtTime(timeConst=0.005)`）
- 加段 → 创建新 `BiquadFilterNode` 插入 chain
- 减段 → `disconnect()` 移除并重连前后节点
- 切 graphic↔parametric → 复用同一 chain，仅段数/type/Q 约束不同

实现：`useEffect` 监听 `bands` 变化做 diff（按 `id` 对比增删节点；属性变化直接写）。现状 `ensureAudioContext` 内建一次固定 10 个 peaking 的逻辑（1010–1024）改为按 `EqBand[]` 动态维护。

#### 3.2.3 频率响应曲线图（核心新视觉）

- SVG `<path>`，X 轴 log 频率 20Hz–20kHz，Y 轴 -24..+24 dB
- 按 Web Audio `BiquadFilter` 标准二阶节系数公式（Web Audio spec §BiquadFilterNode）算每段频率响应：复数乘法累乘各段传递函数 `H(f)` → 转 dB（`20*log10|H|`）画总响应曲线
- 叠加：每段单独浅色响应曲线 + 总和深色粗曲线（参考性）
- **可拖点改 gain**：graphic 模式拖最近 ISO 频段；parametric 模式拖最近段。拖动即时写 node + 重绘曲线 + 联动滑块

工具函数 `computeBiquadResponse(type, freq, Q, gain, sampleRate, freqPoints): number[]` —— 纯函数，**单测先行**（`tests/engine/eqResponse.test.ts`）确保曲线计算与实际听感一致（这是阶段 2 最大单点风险）。

#### 3.2.4 预设库（经典 + 高级，带说明，有参考性）

内置 `const EQ_PRESETS: EqPreset[]`，每个含 `name` + `description`（中英文，说明用途/参考）：

**Graphic 经典**：
- Flat / Pop / Rock / Jazz / Vocal / Bass Boost / Treble Boost / Loudness / Smile Curve

**Parametric 参考（工程手法，有参考性）**：
- HPF @40Hz（去低频隆隆声）
- LPF @18kHz（去高频噪）
- Notch @50Hz Q=5（去电源嗡声）
- Presence @3kHz Q=1（提升人声存在感）
- De-ess @6kHz Q=4（齿音抑制）

用户自定义预设存 localStorage `rgbbox:eqPresets`，预设下拉显示「内置」+「我的」（自定义可删）。

#### 3.2.5 自定义

- 当前 graphic/parametric 设置 → "保存预设" → 输入名 → 存 localStorage
- 加载预设 → 写入 `eqBands`/`eqParams` state → 自动触发 audio graph 更新（通过现有 useEffect）
- 删除自定义预设 → 从 localStorage 移除

#### 3.2.6 拖动即时生效

现状已是 `setTargetAtTime(0.01)` 实时写 gain；保留并收紧到 0.005。曲线图拖点同步写 node + 重绘 + 滑块联动。

#### 3.2.7 EQ drawer 新 UI 布局

替换现状 drawer（1868–1922）：

```
┌─────────────────────────────────────────────────────┐
│ [Graphic | Parametric]  [预设下拉 ▼] [保存] [删除]   │  顶行：模式切换 + 预设
├─────────────────────────────────────────────────────┤
│                                                       │
│   频率响应曲线图（SVG，可拖点）                         │  主视觉
│   20Hz ───────── 1k ───────── 20kHz                  │
│                                                       │
├─────────────────────────────────────────────────────┤
│ Graphic 模式:  10 个垂直滑块（现状保留）                │
│ Parametric:    [type▾ freq── gain── Q── ✕] × N        │
│                [+ 加段]                               │
├─────────────────────────────────────────────────────┤
│ [EQ On/Off]  [Reset]                       [✕ close] │
└─────────────────────────────────────────────────────┘
```

#### 3.2.8 影响文件

- `src/renderer/src/components/AudioStudioView.tsx`（EQ drawer 重写 + 顶部 transport cluster + 音频图动态化）
- `src/renderer/src/styles.css`（EQ drawer 新布局 + 曲线图样式 + 顶部 transport cluster）
- `src/renderer/src/i18n/index.tsx`（EQ 预设名/说明/模式切换/parametric 字段 type/Q/freq/gain 中英文）
- `src/engine/eqResponse.ts`（新文件：纯函数频率响应计算）
- `tests/engine/eqResponse.test.ts`（新文件：单测）

#### 3.2.9 不动

audio 播放引擎（wavesurfer）、可视化（spectrum/oscilloscope/spectrogram/VU）、overlay、IPC、引擎、其他 view。

### 3.3 验证

- `yarn typecheck` / `yarn build` / `yarn test`（含新 eqResponse 单测）全过
- 启动 audio view，加载一首歌播放：
  - 切 graphic↔parametric 模式不中断播放、无爆音
  - 拖 graphic 滑块 / parametric 段参数 → 曲线图实时更新 + 听感实时变
  - 拖曲线图点 → 滑块同步 + 听感变
  - 加载每个预设 → 曲线/滑块同步、说明文字显示
  - 保存自定义预设 → reload 后还在、可加载可删
  - 顶部快按 transport：上一首/播放暂停/下一首 + 时间显示工作；底部完整控制仍可用

### 3.4 主要风险

- audio graph 动态 diff 逻辑要稳——切模式/加段/删段不能中断播放、不能爆音（用 `setTargetAtTime` 而非直接赋值）
- BiquadFilter 系数公式易错——曲线图必须和实际听感一致（先写纯函数 + 单测）
- 预设 localStorage 格式与版本兼容

## 4. 实施顺序

1. 阶段 1（R50）先行：纯布局，回归面集中，先稳定
2. 阶段 1 自检通过（✅ + 证据）后，再进入阶段 2
3. 阶段 2（R51）：先 `eqResponse.ts` + 单测 → 再 audio graph 动态化 → 再 EQ drawer UI + 曲线图 + 预设 → 最后顶部 transport

## 5. PRD 追加

按单 PRD 模型，本设计对应在 PRD-0002 追加：

- **R50**：阶段 1 — 全局布局黄金分割 + 底部自适应 + 采样面板高度 bug
- **R51**：阶段 2 — AudioStudio 顶部 transport + EQ 双模式 graphic/parametric + 曲线图 + 预设库 + 自定义

R-N 状态初值 ⏳，实施完改 ✅ 并附证据到 PRD §6 验收清单。