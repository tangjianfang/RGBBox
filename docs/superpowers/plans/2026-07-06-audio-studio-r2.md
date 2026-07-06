# AudioStudio 第二轮优化（R52）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 PRD-0002 追加 R52，完成音频工作站 5 项第二轮优化（顶部 transport 去重、拖拽修复 + 文件表独立、图表全屏 + 场景/导出并入 Generator 抽屉、6 图表数值叠加 + 美化变体、投屏区域选择、播放时间/音量/平衡数值修复）。

**Architecture:** 两阶段。阶段 1 在 `src/engine/audioMetrics.ts` 新建纯 TS 指标函数（TDD 先行，无 DOM/WebAudio 依赖，符合 engine 层约定）。阶段 2 重构 `AudioStudioView.tsx`（顶部合并 / 删底部 / 删 tabs / Generator sub-tab）、`visualizers.ts`（opts 透传 + 美化变体）、`AudioVizProjector.tsx`（region 矩形布局）、i18n、CSS。投屏区域用 A 方案：overlay 窗口整屏覆盖，projector 内按 region 矩形布局 canvas（纯渲染层，不动主进程/preload）。region 经 localStorage 传递。拖拽修复用 renderer 内 `URL.createObjectURL(file)` 兜底（Electron 41 已移除 `File.path`）。

**Tech Stack:** Electron 41 + Vite + React 18 + TypeScript、vitest、Web Audio AnalyserNode、Canvas 2D。

**约束（CLAUDE.md，违反即瞎改）：**
- 单 PRD 模型：追加 R52 到 `docs/prd/PRD-0002-rgbbox-project-catalog.md`，禁止开新 PRD。
- 提交标题 `[PRD-0002] <type>: <subject>`，结尾 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。
- 不动 `package.json` scripts 段、`src/main/index.ts`、`src/preload/index.ts`（若 R52.2 拖拽确认需 preload `webUtils.getPathForFile`，则停下另立 R-N，不在本计划内顺改）。
- 命令一律走 `yarn typecheck` / `yarn build` / `yarn test`。
- 中文回答用户；subagent 跳 `yarn dev`，最终由用户统一人工 GUI 验收。

---

## 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `docs/prd/PRD-0002-rgbbox-project-catalog.md` | 单 PRD 源 | 追加 R52（R52.1–R52.12） |
| `src/engine/audioMetrics.ts`（新） | 纯 TS 指标计算（peak/RMS/dominant/LUFS/BPM） | 创建 |
| `tests/engine/audioMetrics.test.ts`（新） | 指标函数单测（TDD） | 创建 |
| `src/renderer/src/audio/visualizers.ts` | 6 draw 函数加 `opts={showMetrics,style}`、dispatcher 透传、`regionPresetToRect` 工具 | 修改 |
| `src/renderer/src/components/AudioStudioView.tsx` | 顶部合并 / 删底部 / 删 tabs / Generator sub-tab / 拖拽修复 / 投屏 region picker / 时间 bug / 数值标签 | 修改 |
| `src/renderer/src/components/AudioVizProjector.tsx` | 读 localStorage region、按矩形布局 canvas | 修改 |
| `src/renderer/src/i18n/index.tsx` | 新 key（EN + ZH） | 修改 |
| `src/renderer/src/styles.css` | 顶部 transport 多控件布局、抽屉 sub-tab、数值标签、region picker | 修改 |

---

## Task 1: 追加 R52 到 PRD-0002

**Files:**
- Modify: `docs/prd/PRD-0002-rgbbox-project-catalog.md`（R51 段之后追加 R52 段）

- [ ] **Step 1: 定位 R51 段末尾**

Run: `grep -n "R51" docs/prd/PRD-0002-rgbbox-project-catalog.md | tail -5`
找到 R51 状态行（约 1427 行 `✅`）。

- [ ] **Step 2: 在 R51 段之后追加 R52 段**

在 R51 段结束之后插入：

```markdown
### R52 AudioStudio 第二轮优化 ⏳

> 起源：用户 R50/R51 完成后提出的 5 项音频工作站优化（2026-07-06）。
> 设计稿：`docs/superpowers/specs/2026-07-06-audio-studio-r2-design.md`
> 实施计划：`docs/superpowers/plans/2026-07-06-audio-studio-r2.md`

| 子条款 | 内容 | 类型 | 状态 |
|---|---|---|---|
| R52.1 | 顶部 transport 全合并 + 删底部 `audio-player-controls` | 重构 | ⏳ |
| R52.2 | 文件表独立高度 + 修复拖拽添加文件/文件夹 | bug+布局 | ⏳ |
| R52.3 | 图表区占满右栏全高（删底部 scenes/export tabs） | 布局 | ⏳ |
| R52.4 | 场景/导出并入 Generator 抽屉 sub-tab | 重构 | ⏳ |
| R52.5 | 6 图表数值叠加（纯函数 + 单测先行） | 新功能 | ⏳ |
| R52.6 | 6 图表美化变体（每图 1 个，投屏可关数值） | 新功能 | ⏳ |
| R52.7 | 投屏区域选择（复用 DisplayMap 8 选项，A 方案） | 新功能 | ⏳ |
| R52.8 | 修复播放时间 0:00 + 音量/平衡数值标签 | bug+小特性 | ⏳ |
| R52.9 | i18n 新 key（EN+ZH） | 收尾 | ⏳ |
| R52.10 | 验收点（静态 + 用户人工） | 收尾 | ⏳ |
| R52.11 | 受影响文件清单 | 收尾 | ⏳ |
| R52.12 | 状态标记 | 收尾 | ⏳ |

**R52.10 验收点：**
- [ ] `yarn typecheck` exit 0
- [ ] `yarn build` exit 0
- [ ] `yarn test` 全过，`tests/engine/audioMetrics.test.ts` 通过
- [ ] 顶部 transport 含走带/进度条/时间/音量(带%)/平衡(带 L/R)/播放模式/曲名；底部播放器已删
- [ ] 拖拽音频文件/文件夹到左栏可添加并播放
- [ ] 文件表独立占满左栏高度；图表区独立占满右栏全高
- [ ] Scenes/Export 已并入 Generator 抽屉 sub-tab，右栏无底部 tabs
- [ ] 6 图表角落有轻量数值（classic）；art 风格变体可切换
- [ ] 投屏 picker 有 8 区域选项 + 自定义拖框；projector 按 region 布局
- [ ] 文件播放时间正常推进；duration NaN 显示 `--:--`
- [ ] 用户人工 GUI 验收通过

**R52.11 受影响文件：**
`src/engine/audioMetrics.ts`(新)、`tests/engine/audioMetrics.test.ts`(新)、`src/renderer/src/audio/visualizers.ts`、`src/renderer/src/components/AudioStudioView.tsx`、`src/renderer/src/components/AudioVizProjector.tsx`、`src/renderer/src/i18n/index.tsx`、`src/renderer/src/styles.css`、`docs/prd/PRD-0002-rgbbox-project-catalog.md`。
不动：`package.json` scripts 段、`src/main/index.ts`、`src/preload/index.ts`。
```

- [ ] **Step 3: 提交**

```bash
git add docs/prd/PRD-0002-rgbbox-project-catalog.md docs/superpowers/specs/2026-07-06-audio-studio-r2-design.md docs/superpowers/plans/2026-07-06-audio-studio-r2.md
git commit -m "[PRD-0002] docs: R52 append audio-studio round-2 requirements (R52.1–R52.12)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: R52.5a — audioMetrics 纯函数（TDD）

**Files:**
- Create: `src/engine/audioMetrics.ts`
- Test: `tests/engine/audioMetrics.test.ts`

- [ ] **Step 1: 写失败的单测**

Create `tests/engine/audioMetrics.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  peakFrequency, rmsLevel, dominantFrequency,
  lufsShortEstimate, estimateBPM,
} from '../../src/engine/audioMetrics'

// 合成正弦 Float32Array（幅度 amp，频率 fHz，采样率 sr，样本数 n）
function sine(amp: number, fHz: number, sr: number, n: number): Float32Array {
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * fHz * i) / sr)
  return out
}

// 由时域正弦合成对应的 Uint8Array 频谱（只在目标 bin 放峰值，其余近 0）
function fakeSpectrum(peakBin: number, bins: number, peakValue = 240): Uint8Array {
  const out = new Uint8Array(bins)
  out[peakBin] = peakValue
  if (peakBin + 1 < bins) out[peakBin + 1] = Math.floor(peakValue * 0.4)
  if (peakBin - 1 >= 0) out[peakBin - 1] = Math.floor(peakValue * 0.4)
  return out
}

describe('peakFrequency', () => {
  it('440Hz 正弦 → 峰值频率约 440Hz', () => {
    const sr = 48000, fft = 2048
    const bin = Math.round((440 * fft) / sr) // ≈19
    const freq = fakeSpectrum(bin, fft / 2)
    const r = peakFrequency(freq, sr, fft)
    expect(r.freqHz).toBeGreaterThan(380)
    expect(r.freqHz).toBeLessThan(500)
    expect(r.db).toBeLessThan(0) // 0..255 → dB 为负
  })
  it('静音 → 频率 0', () => {
    const r = peakFrequency(new Uint8Array(1024), 48000, 2048)
    expect(r.freqHz).toBe(0)
    expect(r.db).toBeLessThanOrEqual(-96)
  })
})

describe('rmsLevel', () => {
  it('幅度 1 的正弦 → RMS ≈ 0.707', () => {
    const x = sine(1, 440, 48000, 4800)
    expect(rmsLevel(x)).toBeCloseTo(1 / Math.SQRT2, 1)
  })
  it('静音 → 0', () => {
    expect(rmsLevel(new Float32Array(100))).toBe(0)
  })
})

describe('dominantFrequency', () => {
  it('单峰频谱 → 主导频率接近该 bin', () => {
    const sr = 48000, fft = 2048
    const bin = Math.round((1000 * fft) / sr) // ≈43
    const freq = fakeSpectrum(bin, fft / 2)
    const f = dominantFrequency(freq, sr, fft)
    expect(f).toBeGreaterThan(900)
    expect(f).toBeLessThan(1100)
  })
})

describe('lufsShortEstimate', () => {
  it('全刻度正弦 → 接近 0 dBFS（允许 -3..0 区间）', () => {
    const x = sine(1, 1000, 48000, 4800)
    const l = lufsShortEstimate(x)
    expect(l).toBeGreaterThan(-3.5)
    expect(l).toBeLessThan(0.5)
  })
  it('静音 → ≤ -60', () => {
    expect(lufsShortEstimate(new Float32Array(4800))).toBeLessThanOrEqual(-60)
  })
})

describe('estimateBPM', () => {
  it('120 BPM 脉冲列（每 0.5s 一个脉冲）→ 约 120', () => {
    const sr = 48000, seconds = 3
    const n = sr * seconds
    const x = new Float32Array(n)
    // 每 0.5s 放一个短脉冲
    for (let t = 0; t < seconds * 1000; t += 500) {
      const start = Math.floor((t / 1000) * sr)
      for (let k = 0; k < 50 && start + k < n; k++) x[start + k] = 0.9
    }
    const bpm = estimateBPM(x, sr)
    // 允许 ±10% 或倍频误差（自相关可能锁到 60/120/240）
    expect(bpm).toBeGreaterThanOrEqual(108)
    expect(bpm).toBeLessThanOrEqual(132)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `yarn test tests/engine/audioMetrics.test.ts`
Expected: FAIL —— 模块不存在（`Cannot find module '../../src/engine/audioMetrics'`）。

- [ ] **Step 3: 写实现**

Create `src/engine/audioMetrics.ts`:

```typescript
// R52.5: 纯 TS 音频指标计算（无 DOM/WebAudio 依赖，符合 engine 层约定）。
// 输入为 AnalyserNode 取出的频域 Uint8Array(0..255) 与时域 Float32Array(-1..1)。

export interface PeakInfo {
  freqHz: number
  db: number
}

/** 峰值频率与对应 dB。freqHz = binIdx * sampleRate / fftSize。 */
export function peakFrequency(freqData: Uint8Array, sampleRate: number, fftSize: number): PeakInfo {
  let maxIdx = 0
  let maxVal = 0
  for (let i = 0; i < freqData.length; i++) {
    if (freqData[i] > maxVal) { maxVal = freqData[i]; maxIdx = i }
  }
  if (maxVal <= 0) return { freqHz: 0, db: -120 }
  const freqHz = (maxIdx * sampleRate) / fftSize
  // 0..255 → dBFS（255 ≈ 0dB，1 ≈ -48dB）
  const db = 20 * Math.log10(Math.max(maxVal, 1) / 255)
  return { freqHz, db }
}

/** 时域 RMS（0..1）。 */
export function rmsLevel(timeData: Float32Array): number {
  let sum = 0
  for (let i = 0; i < timeData.length; i++) sum += timeData[i] * timeData[i]
  return Math.sqrt(sum / Math.max(1, timeData.length))
}

/** 主导频率：幅度加权质心（spectral centroid）。 */
export function dominantFrequency(freqData: Uint8Array, sampleRate: number, fftSize: number): number {
  let num = 0
  let den = 0
  for (let i = 0; i < freqData.length; i++) {
    const mag = freqData[i]
    const f = (i * sampleRate) / fftSize
    num += f * mag
    den += mag
  }
  if (den <= 0) return 0
  return num / den
}

/** 短时响度估算（K-weighted 简化 → dBFS 近似）。静音钳到 -60。 */
export function lufsShortEstimate(timeData: Float32Array): number {
  const rms = rmsLevel(timeData)
  if (rms <= 1e-6) return -60
  // K-weighting 简化：减约 0.691 偏置并取 dBFS
  return 20 * Math.log10(rms) - 0.691
}

/** BPM 估算：时域自相关，搜索 60..200 BPM 区间的最大相关峰。 */
export function estimateBPM(timeData: Float32Array, sampleRate: number): number {
  const n = timeData.length
  if (n < sampleRate * 0.5) return 0 // 至少 0.5s 数据
  // 去均值
  let mean = 0
  for (let i = 0; i < n; i++) mean += timeData[i]
  mean /= n
  const x = new Float32Array(n)
  for (let i = 0; i < n; i++) x[i] = timeData[i] - mean

  const minLag = Math.floor(sampleRate / 3.5)   // ≈171 → 200 BPM
  const maxLag = Math.floor(sampleRate / 1.0)   // ≈48000 → 60 BPM
  let bestLag = 0
  let bestCorr = -Infinity
  for (let lag = minLag; lag <= Math.min(maxLag, n - 1); lag++) {
    let corr = 0
    for (let i = 0; i + lag < n; i++) corr += x[i] * x[i + lag]
    if (corr > bestCorr) { bestCorr = corr; bestLag = lag }
  }
  if (bestLag <= 0) return 0
  return (60 * sampleRate) / bestLag
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `yarn test tests/engine/audioMetrics.test.ts`
Expected: PASS（5 describe 全过）。

- [ ] **Step 5: typecheck**

Run: `yarn typecheck`
Expected: exit 0。

- [ ] **Step 6: 提交**

```bash
git add src/engine/audioMetrics.ts tests/engine/audioMetrics.test.ts
git commit -m "[PRD-0002] feat: R52.5 audioMetrics pure functions + tests (peak/RMS/dominant/LUFS/BPM)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: R52.5b — visualizers 数值 overlay + opts 透传

**Files:**
- Modify: `src/renderer/src/audio/visualizers.ts`（6 draw 函数加 `opts` 参数、dispatcher 透传、新增 `regionPresetToRect`、`drawMetricsOverlay`）
- Modify: `src/renderer/src/components/AudioStudioView.tsx`（draw loop 透传 opts；新增 `vizShowMetrics`/`vizStyle` state）

- [ ] **Step 1: 在 visualizers.ts 顶部加类型与工具**

在 `AudioVizMessage` interface 之后（约第 27 行）追加：

```typescript
import { peakFrequency, rmsLevel, dominantFrequency, lufsShortEstimate, estimateBPM } from '../../engine/audioMetrics'

export interface VizDrawOpts {
  showMetrics?: boolean
  style?: 'classic' | 'art'
  sampleRate?: number   // 默认 48000
  fftSize?: number      // 默认 2048
}

export interface BpmState {
  buffer: Float32Array
  filled: number
}

export function createBpmState(capacity = 96000): BpmState {
  return { buffer: new Float32Array(capacity), filled: 0 }
}

/** 把 BPM 环形缓冲追加一帧时域样本。 */
export function pushBpmSample(state: BpmState, timeData: Float32Array): void {
  const cap = state.buffer.length
  const need = Math.min(timeData.length, cap)
  if (state.filled + need <= cap) {
    state.buffer.set(timeData.subarray(0, need), state.filled)
    state.filled += need
  } else {
    // 满了 → 左移丢弃最旧
    const keep = cap - need
    state.buffer.copyWithin(0, state.filled - keep, state.filled)
    state.buffer.set(timeData.subarray(0, need), keep)
    state.filled = cap
  }
}

/** 区域预设 → 归一化矩形 {x,y,w,h}∈[0,1]（R52.7）。 */
export type RegionPreset =
  | 'fullscreen' | 'top-third' | 'middle-third' | 'bottom-third'
  | 'left-third' | 'center-third' | 'right-third' | 'custom'

export interface RegionRect { x: number; y: number; w: number; h: number }

export function regionPresetToRect(preset: RegionPreset, custom?: RegionRect): RegionRect {
  switch (preset) {
    case 'fullscreen': return { x: 0, y: 0, w: 1, h: 1 }
    case 'top-third': return { x: 0, y: 0, w: 1, h: 1 / 3 }
    case 'middle-third': return { x: 0, y: 1 / 3, w: 1, h: 1 / 3 }
    case 'bottom-third': return { x: 0, y: 2 / 3, w: 1, h: 1 / 3 }
    case 'left-third': return { x: 0, y: 0, w: 1 / 3, h: 1 }
    case 'center-third': return { x: 1 / 3, y: 1 / 3, w: 1 / 3, h: 1 / 3 }
    case 'right-third': return { x: 2 / 3, y: 0, w: 1 / 3, h: 1 }
    case 'custom': return custom ?? { x: 0, y: 0, w: 1, h: 1 }
    default: return { x: 0, y: 0, w: 1, h: 1 }
  }
}

/** 通用角落小字 overlay（不喧宾夺主）。 */
function drawMetricsOverlay(ctx: CanvasRenderingContext2D, width: number, lines: string[]): void {
  if (lines.length === 0) return
  ctx.save()
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'rgba(230,192,123,0.7)'
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], 8, 8 + i * 13)
  }
  ctx.restore()
}

function fmtHz(hz: number): string {
  if (hz <= 0) return '0Hz'
  if (hz < 1000) return `${Math.round(hz)}Hz`
  return `${(hz / 1000).toFixed(1)}k`
}
```

- [ ] **Step 2: 给 6 draw 函数加 `opts` 参数并加 overlay**

逐个改签名与结尾 overlay（保持原有绘制逻辑不变，仅在末尾 `ctx.restore()` 前插入 overlay，并按 `style==='art'` 增强绘制）。以下给出每函数的精确改动点。**只展示需要替换的片段**，其余代码原样保留。

**`drawSpectrum`** —— 签名改为：
```typescript
export function drawSpectrum(canvas: HTMLCanvasElement, freqData: Uint8Array, opts?: VizDrawOpts): void {
```
在函数体顶部 `const ctx = canvas.getContext('2d')` 之后、原 `const dpr` 之前不变。art 变体：把 `mainHeight = height - mirrorHeight` 之后插入 `const isArt = opts?.style === 'art'`；若 `isArt`，把每条 bar 的 `grad` 末段透明度提到 1 并额外画一条顶部高亮线（在 `ctx.fill()` 之后）：
```typescript
    if (isArt) {
      ctx.shadowBlur = 0
      ctx.fillStyle = `hsla(${hue2}, 100%, 85%, 0.9)`
      ctx.fillRect(x, y, barWidth, 2)
    }
```
（插在每条 bar 的 mirror 反射绘制之前即可。）在 `ctx.restore()` 之前加 overlay：
```typescript
  if (opts?.showMetrics) {
    const { freqHz, db } = peakFrequency(freqData, opts.sampleRate ?? 48000, opts.fftSize ?? 2048)
    drawMetricsOverlay(ctx, width, [`${fmtHz(freqHz)}  ${db.toFixed(1)}dB`])
  }
```

**`drawWaveform`（示波器 oscilloscope 用）** —— 签名改为：
```typescript
export function drawWaveform(canvas: HTMLCanvasElement, timeData: Float32Array, opts?: VizDrawOpts): void {
```
art 变体：在 `ctx.strokeStyle = strokeGrad` 后加：
```typescript
  if (opts?.style === 'art') { ctx.shadowBlur = 12; ctx.shadowColor = 'rgba(129,212,250,0.8)' }
```
在 `ctx.restore()` 前加 overlay（RMS + BPM；BPM 需要 BpmState，但本函数无状态，故 BPM 在 dispatcher 层算好后通过 opts 传入。简化：本函数仅显示 RMS）：
```typescript
  if (opts?.showMetrics) {
    const r = rmsLevel(timeData)
    drawMetricsOverlay(ctx, width, [`RMS ${(r * 100).toFixed(0)}`])
  }
```

**`drawSpectrogram`** —— 签名改为：
```typescript
export function drawSpectrogram(canvas: HTMLCanvasElement, freqData: Uint8Array, spectrogramBuffer: Uint8Array[], opts?: VizDrawOpts): void {
```
art 变体：把热图色映射 `const h = 240 - value * 240` 改为对数感知：
```typescript
    const lv = Math.pow(value, 0.6) // art: 对数色映射
    const h = 240 - lv * 240
    const l = 8 + lv * 60
```
（仅当 `opts?.style === 'art'` 时用 `lv`，否则保持原 `value`。）在 `ctx.restore()` 前加 overlay：
```typescript
  if (opts?.showMetrics) {
    const f = dominantFrequency(freqData, opts.sampleRate ?? 48000, opts.fftSize ?? 2048)
    drawMetricsOverlay(ctx, width, [`dom ${fmtHz(f)}`])
  }
```

**`drawVUMeter`** —— 签名改为：
```typescript
export function drawVUMeter(canvas: HTMLCanvasElement, timeData: Float32Array, peakHoldRef: VuPeakState, opts?: VizDrawOpts): void {
```
art 变体：在 `drawMeter` 内 `ctx.fillRect(24, y, fillWidth, meterHeight)` 之后，若 `opts?.style === 'art'` 画一条圆弧（径向）指示——简化为在条形末端画发光圆点：
```typescript
    if (opts?.style === 'art') {
      ctx.shadowBlur = 10; ctx.shadowColor = '#eab308'
      ctx.beginPath(); ctx.arc(24 + fillWidth, y + meterHeight / 2, 3, 0, Math.PI * 2); ctx.fill()
      ctx.shadowBlur = 0
    }
```
（`drawMeter` 需要能访问 `opts`，把它作为参数传进 `drawMeter`，或在 VU 函数内通过闭包引用——`drawMeter` 已是内层函数，可直接读外层 `opts`。）在 `ctx.restore()` 前加 overlay：
```typescript
  if (opts?.showMetrics) {
    const l = lufsShortEstimate(timeData)
    drawMetricsOverlay(ctx, width, [`LUFS ${l.toFixed(1)}`])
  }
```

**`drawCircularSpectrum`** —— 签名改为：
```typescript
export function drawCircularSpectrum(canvas: HTMLCanvasElement, freqData: Uint8Array, opts?: VizDrawOpts): void {
```
art 变体：在中心圆 `ctx.fill()` 之后加辉光环：
```typescript
  if (opts?.style === 'art') {
    ctx.shadowBlur = 20; ctx.shadowColor = 'rgba(129,212,250,0.6)'
    ctx.strokeStyle = 'rgba(129,212,250,0.4)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke()
    ctx.shadowBlur = 0
  }
```
在 `ctx.restore()` 前加 overlay：
```typescript
  if (opts?.showMetrics) {
    const { freqHz } = peakFrequency(freqData, opts.sampleRate ?? 48000, opts.fftSize ?? 2048)
    drawMetricsOverlay(ctx, w, [`${fmtHz(freqHz)}`])
  }
```

**`drawWaveRing`** —— 签名改为：
```typescript
export function drawWaveRing(canvas: HTMLCanvasElement, timeData: Float32Array, opts?: VizDrawOpts): void {
```
art 变体：在 `ctx.stroke()` 之后、`ctx.fill()` 之前加双环（再画一条半径略大的弱环）：
```typescript
  if (opts?.style === 'art') {
    ctx.strokeStyle = 'rgba(171,71,188,0.35)'; ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 0; i < 360; i++) {
      const idx = Math.min(Math.floor(i * (bufferLength / 360)), bufferLength - 1)
      const r = baseRadius * 1.15 + (timeData[idx] ?? 0) * amplitude
      const a = (i / 360) * Math.PI * 2 - Math.PI / 2
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.closePath(); ctx.stroke()
  }
```
在 `ctx.restore()` 前加 overlay：
```typescript
  if (opts?.showMetrics) {
    const r = rmsLevel(timeData)
    drawMetricsOverlay(ctx, w, [`${(r * 100).toFixed(0)}`])
  }
```

- [ ] **Step 3: 改 `drawVisualizerFrame` dispatcher 透传 opts 与 bpm**

把 `drawVisualizerFrame`（446-474）整体替换为：

```typescript
export function drawVisualizerFrame(
  canvas: HTMLCanvasElement,
  mode: Exclude<VisualizerMode, 'waveform'>,
  freqData: Uint8Array,
  timeData: Float32Array,
  spectrogramBuffer: Uint8Array[],
  vuPeak: VuPeakState,
  opts?: VizDrawOpts,
): void {
  switch (mode) {
    case 'spectrum':
      drawSpectrum(canvas, freqData, opts)
      break
    case 'oscilloscope':
      drawWaveform(canvas, timeData, opts)
      break
    case 'spectrogram':
      drawSpectrogram(canvas, freqData, spectrogramBuffer, opts)
      break
    case 'vuMeter':
      drawVUMeter(canvas, timeData, vuPeak, opts)
      break
    case 'circular':
      drawCircularSpectrum(canvas, freqData, opts)
      break
    case 'waveRing':
      drawWaveRing(canvas, timeData, opts)
      break
  }
}
```

- [ ] **Step 4: AudioStudioView 引入 opts state 并透传**

在 `src/renderer/src/components/AudioStudioView.tsx` 顶部 import 改为：

```typescript
import {
  AUDIO_VIZ_CHANNEL,
  createSpectrogramBuffer,
  createVuPeakState,
  drawVisualizerFrame,
  drawWaveform,
  type VisualizerMode,
  type VizDrawOpts,
} from '../audio/visualizers'
```

在 vizMode state 附近（约第 988 行后）追加：

```typescript
  const [vizStyle, setVizStyle] = useState<'classic' | 'art'>('classic')
  const [vizShowMetrics, setVizShowMetrics] = useState(true)
```

在 rAF draw loop（1226 行）把：
```typescript
          drawVisualizerFrame(specCanvas, vizMode, freqData, timeData, spectrogramBufferRef.current, vuPeakRef.current)
```
改为：
```typescript
          const vizOpts: VizDrawOpts = { showMetrics: vizShowMetrics, style: vizStyle, sampleRate: 48000, fftSize: 2048 }
          drawVisualizerFrame(specCanvas, vizMode, freqData, timeData, spectrogramBufferRef.current, vuPeakRef.current, vizOpts)
```
把 1229 行 `if (waveCanvas) drawWaveform(waveCanvas, timeData)` 改为：
```typescript
        if (waveCanvas) drawWaveform(waveCanvas, timeData, { showMetrics: vizShowMetrics, style: vizStyle })
```

注意：rAF effect 的依赖数组（1246 行）追加 `vizShowMetrics, vizStyle`：
```typescript
  }, [isPlaying, previewPlaying, vizMode, vizFullscreen, vizShowMetrics, vizStyle, visible])
```

广播消息（1236 行）保持不变（projector 用自己的 opts，见 Task 7）。

- [ ] **Step 5: typecheck + test**

Run: `yarn typecheck`
Expected: exit 0（注意 `noUnusedLocals`：确保所有新导入都被使用）。
Run: `yarn test`
Expected: 全过。

- [ ] **Step 6: 提交**

```bash
git add src/renderer/src/audio/visualizers.ts src/renderer/src/components/AudioStudioView.tsx
git commit -m "[PRD-0002] feat: R52.5/R52.6 visualizer metrics overlay + art style variants + opts threading

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: R52.1 + R52.8 — 顶部 transport 全合并 + 时间 bug + 数值标签

**Files:**
- Modify: `src/renderer/src/components/AudioStudioView.tsx`
- Modify: `src/renderer/src/styles.css`

- [ ] **Step 1: 修复 formatTime（NaN/Infinity → --:--）**

把 1692-1697 行 `formatTime` 改为：

```typescript
  const formatTime = (s: number): string => {
    if (!isFinite(s) || s <= 0) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }
```
（保留 0:00 用于 0 与 NaN；duration 为 NaN/Infinity 时调用方传 0 → '0:00'。下一步在 transport 显示用 `durationFinite` 决定是否显示 `--:--`。）

在文件顶部 state 区（progress/duration 附近 916-917 行已存在）保持不变。新增一个派生显示：在 transport JSX 中直接判断 `isFinite(duration) && duration > 0 ? formatTime(duration) : '--:--'`。

- [ ] **Step 2: 修复 progress tracking（读 ref 而非闭包 el）**

把 1346-1355 行 `// Progress tracking` effect 改为：

```typescript
  // Progress tracking — 每次读 audioElementRef.current，避免闭包捕获旧 audio 元素
  useEffect(() => {
    if (!isPlaying) return
    const update = () => {
      const el = audioElementRef.current
      if (!el) return
      setProgress(el.currentTime || 0)
      setDuration(isFinite(el.duration) ? el.duration : 0)
    }
    update()
    const interval = setInterval(update, 100)
    return () => clearInterval(interval)
  }, [isPlaying])
```

- [ ] **Step 3: playTrack 加 loadedmetadata 兜底**

在 playTrack（1481 行 `const audio = new Audio(track.url)` 之后、`audio.play()` 之前）加：

```typescript
    audio.addEventListener('loadedmetadata', () => {
      if (isFinite(audio.duration)) setDuration(audio.duration)
    })
```

- [ ] **Step 4: 顶部 `audio-tools-bar` 全合并**

把 1763-1790 行整块 `<div className="audio-tools-bar">...</div>` 替换为：

```tsx
        <div className="audio-tools-bar">
          <div className="audio-top-transport">
            <button type="button" className="audio-btn-icon" title={t('audio.prev')} onClick={skipPrev}><SkipBack size={15} /></button>
            <button type="button" className="audio-btn-icon" title={isPlaying ? t('audio.pause') : t('audio.play')} onClick={togglePlay}>
              {isPlaying ? <Pause size={15} /> : <Play size={15} />}
            </button>
            <button type="button" className="audio-btn-icon" title={t('audio.next')} onClick={skipNext}><SkipForward size={15} /></button>
            <button
              type="button"
              className={`audio-btn-sm ${playMode === 'loop' ? 'active' : ''}`}
              onClick={() => setPlayMode(playMode === 'loop' ? 'sequential' : 'loop')}
              title={t('audio.loop')}
            ><RefreshCw size={13} /></button>
            <button
              type="button"
              className={`audio-btn-sm ${playMode === 'shuffle' ? 'active' : ''}`}
              onClick={() => setPlayMode(playMode === 'shuffle' ? 'sequential' : 'shuffle')}
              title={t('audio.shuffle')}
            ><Shuffle size={13} /></button>
            <input
              type="range"
              className="audio-progress-bar"
              min={0}
              max={isFinite(duration) && duration > 0 ? duration : 1}
              step={0.1}
              value={progress}
              onChange={(e) => seek(Number(e.target.value))}
            />
            <span className="audio-time">{formatTime(progress)} / {isFinite(duration) && duration > 0 ? formatTime(duration) : '--:--'}</span>
            <span className="audio-now-playing-label">{currentTrackIndex >= 0 && playlist[currentTrackIndex] ? playlist[currentTrackIndex].name : ''}</span>
          </div>
          <div className="audio-top-controls">
            <button type="button" className="audio-btn-icon" onClick={() => setMuted(!muted)} title={t('audio.volume')}>
              {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <input
              type="range"
              className="audio-slider"
              min={0} max={1} step={0.01}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              title={t('audio.volume')}
            />
            <span className="audio-value">{Math.round(volume * 100)}%</span>
            <span className="audio-label">{t('audio.balance')}</span>
            <input
              type="range"
              className="audio-slider"
              min={-1} max={1} step={0.01}
              value={balance}
              onChange={(e) => setBalance(Number(e.target.value))}
            />
            <span className="audio-value">{balance < 0 ? `L${Math.round(-balance * 50)}` : balance > 0 ? `R${Math.round(balance * 50)}` : 'C'}</span>
          </div>
          <div className="audio-top-drawers">
            <button
              type="button"
              className={`audio-btn ${eqEnabled ? 'active' : ''}`}
              onClick={() => setEqExpanded(true)}
              title={t('audio.eq.title')}
            >{t('audio.eq.title')}</button>
            <button
              type="button"
              className="audio-btn"
              onClick={() => setGenExpanded(true)}
              title={t('audio.tab.generator')}
            >{t('audio.tab.generator')}</button>
          </div>
        </div>
```

- [ ] **Step 5: 删除底部 `audio-player-controls`，歌词面板迁到左栏底部**

删除 1852-1973 行整块 `{/* Player controls */}` ... `</div>`（即 `<div className="audio-player-controls">` 到其闭合 `</div>`）。

在左栏 `audio-playlist` div 闭合（1849 行 `</div>`）之后、`</div>`（左栏闭合，1974 行）之前，插入歌词面板（从原底部搬来，逻辑不变）：

```tsx

          {/* R52.1: 歌词面板从底部播放器迁到左栏底部 */}
          {showLyrics && (
            <div className="audio-lyrics-panel">
              <div className="audio-lyrics-header">
                <span className="audio-lyrics-title">{t('audio.lyrics.title')}</span>
                <button
                  type="button"
                  className="audio-btn-sm"
                  onClick={() => lrcFileInputRef.current?.click()}
                  title={t('audio.lyrics.load')}
                >
                  <Plus size={12} /> {t('audio.lyrics.load')}
                </button>
                <button
                  type="button"
                  className={`audio-btn-icon${showLyrics ? ' active' : ''}`}
                  title={t('audio.lyrics.title')}
                  onClick={() => setShowLyrics(v => !v)}
                ><FileText size={14} /></button>
              </div>
              <div ref={lyricsContainerRef} className="audio-lyrics-scroll">
                {lrcLines.length === 0 ? (
                  <p className="audio-lyrics-empty">{t('audio.lyrics.empty')}</p>
                ) : (
                  lrcLines.map((line, i) => (
                    <div
                      key={i}
                      className={`audio-lyric-line${i === activeLrcIndex ? ' active' : ''}`}
                      onClick={() => seek(line.time)}
                    >{line.text}</div>
                  ))
                )}
              </div>
            </div>
          )}
          <input
            ref={lrcFileInputRef}
            type="file"
            accept=".lrc,.txt"
            style={{ display: 'none' }}
            onChange={handleLrcFile}
          />
```

注意：原底部播放器里的「歌词」开关按钮已迁到顶部（Step 4 没放歌词按钮——补一个）。在 Step 4 的 `audio-top-controls` div 内末尾（`</span>` 平衡数值之后）加：

```tsx
            <button
              type="button"
              className={`audio-btn-icon${showLyrics ? ' active' : ''}`}
              title={t('audio.lyrics.title')}
              onClick={() => setShowLyrics(v => !v)}
            ><FileText size={14} /></button>
```

并把左栏歌词面板 header 里那个重复的「歌词开关按钮」去掉（避免两个开关）。最终左栏歌词 header 只保留「标题 + 加载 LRC 按钮」：

```tsx
              <div className="audio-lyrics-header">
                <span className="audio-lyrics-title">{t('audio.lyrics.title')}</span>
                <button
                  type="button"
                  className="audio-btn-sm"
                  onClick={() => lrcFileInputRef.current?.click()}
                  title={t('audio.lyrics.load')}
                >
                  <Plus size={12} /> {t('audio.lyrics.load')}
                </button>
              </div>
```

- [ ] **Step 6: CSS 顶部多控件布局**

在 `src/renderer/src/styles.css` 找到 `.audio-tools-bar` 规则，改为：

```css
.audio-tools-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.audio-top-transport {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.audio-top-transport .audio-progress-bar {
  width: 160px;
  min-width: 100px;
}
.audio-top-transport .audio-now-playing-label {
  opacity: 0.7;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}
.audio-top-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}
.audio-top-controls .audio-slider { width: 80px; }
.audio-top-drawers {
  display: flex;
  gap: 8px;
  margin-left: auto;
}
.audio-value {
  font-size: 11px;
  font-family: monospace;
  opacity: 0.75;
  min-width: 34px;
}
.audio-lyrics-panel {
  border-top: 1px solid rgba(255,255,255,0.08);
  padding: 8px;
  max-height: 160px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.audio-lyrics-scroll {
  flex: 1;
  overflow-y: auto;
}
```
（若 `.audio-lyrics-panel`/`.audio-lyrics-scroll` 已有规则，合并而非重复——先 `grep` 确认。）

- [ ] **Step 7: typecheck + test**

Run: `yarn typecheck` → exit 0。
Run: `yarn test` → 全过。

- [ ] **Step 8: 提交**

```bash
git add src/renderer/src/components/AudioStudioView.tsx src/renderer/src/styles.css
git commit -m "[PRD-0002] fix: R52.1/R52.8 merge transport to top, fix time 0:00, add volume/balance values

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: R52.2 — 拖拽修复 + 文件表独立高度

**Files:**
- Modify: `src/renderer/src/components/AudioStudioView.tsx`

- [ ] **Step 1: handleFileSelect 增加 blob URL 兜底**

把 1386-1403 行 `handleFileSelect` 整体替换为：

```typescript
  // R52.2: Electron 41 已移除 File.path → 有 nativePath 走 media:// 持久化路径；
  // 无 nativePath 时用 URL.createObjectURL 兜底（仅本会话可播，不持久化）。
  const handleFileSelect = useCallback((files: FileList | null, folderName?: string) => {
    if (!files) return
    const pathEntries: Array<{ path: string; name: string; folder?: string }> = []
    const blobEntries: Array<{ name: string; url: string; folder?: string }> = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!/\.(wav|flac|mp3|aac|m4a|ogg|opus|weba)$/i.test(file.name)) continue
      const nativePath: string | undefined = (file as any).path
      if (nativePath) {
        const relPath = (file as any).webkitRelativePath as string | undefined
        const folder = relPath ? relPath.split('/')[0] : folderName
        pathEntries.push({ path: nativePath, name: file.name, folder })
      } else {
        // Electron 41: File.path 已废弃 → blob URL 兜底（本会话可播，不持久化到磁盘路径）
        const blobUrl = URL.createObjectURL(file)
        const relPath = (file as any).webkitRelativePath as string | undefined
        const folder = relPath ? relPath.split('/')[0] : folderName
        blobEntries.push({ name: file.name, url: blobUrl, folder })
      }
    }
    if (pathEntries.length > 0) addTracksFromPaths(pathEntries, folderName)
    if (blobEntries.length > 0) {
      const groupName = folderName || t('audio.defaultGroup')
      const newTracks: TrackItem[] = blobEntries.map((e, i) => ({
        id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
        name: e.name,
        duration: 0,
        url: e.url,
        group: e.folder || groupName,
      }))
      const newGroupNames = [...new Set(newTracks.map(tr => tr.group))]
      setGroups(prev => {
        const existing = new Set(prev.map(g => g.name))
        const toAdd = newGroupNames.filter(n => !existing.has(n))
        return [...prev, ...toAdd.map(name => ({ name, collapsed: false }))]
      })
      setPlaylist(prev => [...prev, ...newTracks])
    }
  }, [addTracksFromPaths, t])
```

- [ ] **Step 2: 文件夹递归加上限 + 白名单**

把 `handleDrop`（1418-1457）里 `processEntry` 内 `reader.readEntries` 回调改为递归且带上限。整体替换 `handleDrop` 为：

```typescript
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const items = e.dataTransfer.items
    const AUDIO_RE = /\.(wav|flac|mp3|aac|m4a|ogg|opus|weba)$/i
    const MAX_FILES = 100
    let folderName = ''
    const files: File[] = []
    const processEntry = (entry: any): Promise<void> => {
      return new Promise((resolve) => {
        if (files.length >= MAX_FILES) { resolve(); return }
        if (entry.isFile) {
          entry.file((file: File) => {
            if (AUDIO_RE.test(file.name) && files.length < MAX_FILES) files.push(file)
            resolve()
          })
        } else if (entry.isDirectory) {
          if (!folderName) folderName = entry.name
          const reader = entry.createReader()
          const readBatch = (): void => {
            reader.readEntries((entries: any[]) => {
              if (entries.length === 0) { resolve(); return }
              Promise.all(entries.map(processEntry)).then(readBatch)
            })
          }
          readBatch()
        } else { resolve() }
      })
    }
    if (items) {
      const entries: any[] = []
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.()
        if (entry) entries.push(entry)
      }
      if (entries.length > 0) {
        Promise.all(entries.map(processEntry)).then(() => {
          if (files.length > 0) {
            const dt = new DataTransfer()
            files.forEach(f => dt.items.add(f))
            handleFileSelect(dt.files, folderName || undefined)
            if (files.length >= MAX_FILES) {
              // 静默截断（无 toast 组件，沿用现状）
            }
          }
        })
      } else {
        handleFileSelect(e.dataTransfer.files)
      }
    } else {
      handleFileSelect(e.dataTransfer.files)
    }
  }, [handleFileSelect])
```

- [ ] **Step 3: 文件表独立占满左栏**

确认 `audio-left-panel` 是 flex column 且 `audio-playlist` flex:1。在 styles.css 找到/补：

```css
.audio-left-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.audio-playlist {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
```
（若已有规则，确保含 `flex:1` 与 `min-height:0`，让 playlist 占满左栏高度。）

- [ ] **Step 4: typecheck + test**

Run: `yarn typecheck` → exit 0。
Run: `yarn test` → 全过。

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/components/AudioStudioView.tsx src/renderer/src/styles.css
git commit -m "[PRD-0002] fix: R52.2 drag-drop add files/folders (blob URL fallback) + independent playlist height

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: R52.3 + R52.4 — 删 audio-tabs + Generator 抽屉 sub-tab

**Files:**
- Modify: `src/renderer/src/components/AudioStudioView.tsx`
- Modify: `src/renderer/src/styles.css`

- [ ] **Step 1: 新增 genSubTab state**

在 `genExpanded` state（973 行）之后追加：

```typescript
  const [genSubTab, setGenSubTab] = useState<'generator' | 'scenes' | 'export'>('generator')
```

- [ ] **Step 2: 删除 audio-tabs JSX**

删除 2039-2050 行整块 `<div className="audio-tabs">...</div>`。

- [ ] **Step 3: Generator 抽屉加 sub-tab 切换**

在 Generator 抽屉 header（2272-2276 行 `<div className="audio-drawer-header">...</div>`）之后、`<div className="audio-panel audio-panel-scroll">`（2277）之前插入：

```tsx
                <div className="audio-gen-subtabs">
                  {(['generator', 'scenes', 'export'] as const).map(st => (
                    <button
                      key={st}
                      type="button"
                      className={`audio-tab ${genSubTab === st ? 'active' : ''}`}
                      onClick={() => setGenSubTab(st)}
                    >
                      {t(`audio.gen.subTab.${st}` as any)}
                    </button>
                  ))}
                </div>
```

- [ ] **Step 4: 包裹现有生成器内容为 genSubTab==='generator'**

在 2277 行 `<div className="audio-panel audio-panel-scroll">` 之后、2278 `<div className="audio-gen-grid">` 之前加：

```tsx
                  {genSubTab === 'generator' && (
```
并把生成器内容（2278-2470 `audio-gen-grid` 整块 + 2472-2498 `audio-gen-actions` 整块）缩进到该条件内，闭合加 `)}`。

具体：找到 2472 行 `<div className="audio-gen-actions">` 对应闭合 `</div>`（2498 行），在其 `</div>` 之后加 `)}`，再接 `</div>`（panel 闭合 2499）+ `</div>`（drawer 闭合 2501）+ `)}`（genExpanded 闭合 2502）。

- [ ] **Step 5: 把 Scenes 面板迁入抽屉**

把 2504-2559 行 `{/* Scenes Tab */}` 整块（`activeTab === 'scenes' && (...)`）剪切，改条件为 `genSubTab === 'scenes' &&`，粘贴到 Step 4 的 `)}` 之后、`</div>`（panel 闭合）之前。即与 generator 条件并列：

```tsx
                  {genSubTab === 'scenes' && (
                    <div className="audio-panel audio-panel-scroll">
                      <div className="audio-scene-categories">
                        {/* ...原 2508-2517 内容... */}
                      </div>
                      <div className="audio-scene-grid">
                        {/* ...原 2520-2557 内容... */}
                      </div>
                    </div>
                  )}
```

- [ ] **Step 6: 把 Export 面板迁入抽屉**

同理把 2561-2617 行 `{/* Export Tab */}` 整块条件改为 `genSubTab === 'export' &&`，粘贴到 Scenes 条件之后。

- [ ] **Step 7: 删除右栏尾部残留**

确认 2618-2620 的 `</div></div></div>` 结构（右栏闭合 + layout 闭合 + 根闭合）保持正确。删 tabs 后右栏只剩 `audio-visualizers` + 两个抽屉（EQ/Generator）。`activeTab`/`setActiveTab` 若已无引用则删除 state（904-906 行）与 `StudioTab` 类型（21 行）—— 先 `grep activeTab` 确认无其他引用再删，避免 `noUnusedLocals` 报错。

Run: `grep -n "activeTab\|StudioTab" src/renderer/src/components/AudioStudioView.tsx`
若仅剩声明行，则删除 21 行 `type StudioTab = ...` 与 904-906 行 `activeTab` state。

- [ ] **Step 8: CSS sub-tab**

styles.css 追加：

```css
.audio-gen-subtabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  margin-bottom: 8px;
}
.audio-gen-subtabs .audio-tab {
  border: none;
  background: transparent;
  padding: 6px 12px;
  opacity: 0.6;
}
.audio-gen-subtabs .audio-tab.active {
  opacity: 1;
  border-bottom: 2px solid var(--accent, #4fc3f7);
}
```

- [ ] **Step 9: typecheck + test**

Run: `yarn typecheck` → exit 0（注意 `noUnusedLocals`：删干净 `activeTab`/`StudioTab`）。
Run: `yarn test` → 全过。

- [ ] **Step 10: 提交**

```bash
git add src/renderer/src/components/AudioStudioView.tsx src/renderer/src/styles.css
git commit -m "[PRD-0002] refactor: R52.3/R52.4 remove audio-tabs, move scenes/export into Generator drawer sub-tab

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: R52.7 — 投屏区域选择（A 方案）

**Files:**
- Modify: `src/renderer/src/components/AudioStudioView.tsx`
- Modify: `src/renderer/src/components/AudioVizProjector.tsx`

- [ ] **Step 1: AudioStudioView 新增 region state**

在 `projectDisplayIds` state（995 行）之后追加：

```typescript
  const [projectRegion, setProjectRegion] = useState<RegionPreset>('fullscreen')
  const [projectCustom, setProjectCustom] = useState<RegionRect>({ x: 0, y: 0, w: 1, h: 1 })
  const [pickingCustom, setPickingCustom] = useState(false)
  const customPickStartRef = useRef<{ x: number; y: number } | null>(null)
```

顶部 import 追加 `regionPresetToRect, type RegionPreset, type RegionRect`：

```typescript
import {
  AUDIO_VIZ_CHANNEL,
  createSpectrogramBuffer,
  createVuPeakState,
  drawVisualizerFrame,
  drawWaveform,
  regionPresetToRect,
  type VisualizerMode,
  type VizDrawOpts,
  type RegionPreset,
  type RegionRect,
} from '../audio/visualizers'
```

- [ ] **Step 2: projectToDisplay 写 region 到 localStorage**

把 `projectToDisplay`（1156-1170）改为：

```typescript
  const projectToDisplay = useCallback(async (displayId?: number) => {
    try {
      if (!displayId) {
        const allDisplays = await window.rgbbox.getDisplays()
        setDisplays(allDisplays)
        setShowDisplayPicker(true)
        return
      }
      const rect = regionPresetToRect(projectRegion, projectCustom)
      // A 方案：region 经 localStorage 传给 projector（纯渲染层，不动主进程/preload）
      try {
        localStorage.setItem('rgbbox:audioVizRegion', JSON.stringify({ preset: projectRegion, rect }))
      } catch { /* ignore */ }
      setProjectDisplayIds((prev) => prev.includes(displayId) ? prev : [...prev, displayId])
      await window.rgbbox.openAudioVizWindow(displayId)
    } catch { /* ignore */ }
  }, [projectRegion, projectCustom])
```

- [ ] **Step 3: picker UI 加 8 区域按钮 + 自定义拖框**

把 2006-2028 行 `{showDisplayPicker && (...)}` 整块替换为：

```tsx
              {showDisplayPicker && (
                <div className="audio-display-picker" style={{
                  position: 'absolute', top: 30, right: 0, background: 'var(--surface-2, #1e2535)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: 8, zIndex: 100,
                  minWidth: 200
                }}>
                  <p style={{ fontSize: 11, marginBottom: 6, opacity: 0.7 }}>{t('audio.viz.region')}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginBottom: 8 }}>
                    {(['fullscreen','top-third','middle-third','bottom-third','left-third','center-third','right-third','custom'] as RegionPreset[]).map(preset => (
                      <button
                        key={preset}
                        type="button"
                        className={`audio-btn-sm ${projectRegion === preset ? 'active' : ''}`}
                        style={{ fontSize: 10, padding: '4px 6px' }}
                        onClick={() => { setProjectRegion(preset); setPickingCustom(preset === 'custom') }}
                        title={t(`overlay.region.${preset === 'top-third' ? 'top' : preset === 'middle-third' ? 'middle' : preset === 'bottom-third' ? 'bottom' : preset === 'left-third' ? 'left' : preset === 'center-third' ? 'center' : preset === 'right-third' ? 'right' : preset === 'custom' ? 'custom' : 'fullscreen'}` as any)}
                      >
                        {t(`overlay.region.${preset === 'top-third' ? 'top' : preset === 'middle-third' ? 'middle' : preset === 'bottom-third' ? 'bottom' : preset === 'left-third' ? 'left' : preset === 'center-third' ? 'center' : preset === 'right-third' ? 'right' : preset === 'custom' ? 'custom' : 'fullscreen'}` as any)}
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: 11, marginBottom: 6, opacity: 0.7 }}>{t('audio.viz.selectDisplay')}</p>
                  {displays.map(d => {
                    const active = projectDisplayIds.includes(d.id)
                    return (
                      <button
                        key={d.id}
                        type="button"
                        className={`audio-btn-sm ${active ? 'active' : ''}`}
                        style={{ display: 'block', width: '100%', marginBottom: 4 }}
                        onClick={() => { active ? stopProjecting(d.id) : void projectToDisplay(d.id) }}
                      >
                        {active ? '✓ ' : ''}{d.primary ? '★ ' : ''}{d.label} ({d.bounds.width}×{d.bounds.height})
                      </button>
                    )
                  })}
                  <button type="button" className="audio-btn-sm" onClick={() => setShowDisplayPicker(false)}>{t('audio.viz.cancel')}</button>
                </div>
              )}
              {pickingCustom && projectRegion === 'custom' && (
                <div
                  style={{ position: 'absolute', inset: 0, zIndex: 90, cursor: 'crosshair', background: 'rgba(0,0,0,0.3)' }}
                  onMouseDown={(e) => {
                    const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                    customPickStartRef.current = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
                  }}
                  onMouseUp={(e) => {
                    const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                    const ex = (e.clientX - r.left) / r.width
                    const ey = (e.clientY - r.top) / r.height
                    const s = customPickStartRef.current
                    setPickingCustom(false)
                    if (!s) return
                    const x = Math.max(0, Math.min(s.x, ex))
                    const y = Math.max(0, Math.min(s.y, ey))
                    const w = Math.min(1, Math.max(0.02, Math.abs(ex - s.x)))
                    const h = Math.min(1, Math.max(0.02, Math.abs(ey - s.y)))
                    if (w < 0.02 || h < 0.02) { setProjectRegion('fullscreen'); return }
                    setProjectCustom({ x, y, w, h })
                  }}
                />
              )}
```

- [ ] **Step 4: AudioVizProjector 读 region 并按矩形布局 canvas**

把 `src/renderer/src/components/AudioVizProjector.tsx` 整体替换为：

```tsx
import { useEffect, useRef, useState, type JSX } from 'react'
import {
  AUDIO_VIZ_CHANNEL,
  createSpectrogramBuffer,
  createVuPeakState,
  drawVisualizerFrame,
  regionPresetToRect,
  type AudioVizMessage,
  type RegionPreset,
  type RegionRect,
  type VizDrawOpts,
} from '../audio/visualizers'
import { useI18n } from '../i18n'

interface Props {
  displayId: number
}

interface RegionState { preset: RegionPreset; rect: RegionRect }

function loadRegion(): RegionRect {
  try {
    const raw = localStorage.getItem('rgbbox:audioVizRegion')
    if (!raw) return { x: 0, y: 0, w: 1, h: 1 }
    const s = JSON.parse(raw) as RegionState
    return regionPresetToRect(s.preset, s.rect)
  } catch { return { x: 0, y: 0, w: 1, h: 1 } }
}

/**
 * R29.3 (revised) + R52.7: full-resolution audio visualizer projector window.
 * R52.7 A-scheme: overlay window covers the full display; the canvas is laid
 * out inside the region rect (read from localStorage, written by the studio
 * view). Pure renderer — no main/preload change.
 */
export function AudioVizProjector({ displayId }: Props): JSX.Element {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const spectrogramBufferRef = useRef<Uint8Array[]>(createSpectrogramBuffer())
  const vuPeakRef = useRef(createVuPeakState())
  const [region, setRegion] = useState<RegionRect>(() => loadRegion())

  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key === 'rgbbox:audioVizRegion') setRegion(loadRegion())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = window.devicePixelRatio || 1
    const resize = () => {
      const w = Math.max(1, Math.round((canvas.clientWidth || window.innerWidth) * dpr))
      const h = Math.max(1, Math.round((canvas.clientHeight || window.innerHeight) * dpr))
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    // 投屏艺术品模式：不显示数值，classic 风格
    const opts: VizDrawOpts = { showMetrics: false, style: 'art' }

    const channel = new BroadcastChannel(AUDIO_VIZ_CHANNEL)
    channel.onmessage = (event: MessageEvent<AudioVizMessage>) => {
      const { mode, freq, time } = event.data
      if (mode === 'waveform') return
      drawVisualizerFrame(canvas, mode, freq, time, spectrogramBufferRef.current, vuPeakRef.current, opts)
    }

    return () => {
      ro.disconnect()
      channel.close()
    }
  }, [displayId])

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          left: `${region.x * 100}%`,
          top: `${region.y * 100}%`,
          width: `${region.w * 100}%`,
          height: `${region.h * 100}%`,
          display: 'block',
        }}
      />
      <div style={{
        position: 'absolute',
        bottom: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '4px 14px',
        borderRadius: 6,
        background: 'rgba(0,0,0,0.55)',
        color: 'rgba(255,255,255,0.75)',
        fontSize: 12,
        pointerEvents: 'none',
        animation: 'overlayHintFade 3s ease 1.5s forwards',
        whiteSpace: 'nowrap'
      }}>
        {t('overlay.hint')}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: typecheck + test**

Run: `yarn typecheck` → exit 0。
Run: `yarn test` → 全过。

- [ ] **Step 6: 提交**

```bash
git add src/renderer/src/components/AudioStudioView.tsx src/renderer/src/components/AudioVizProjector.tsx
git commit -m "[PRD-0002] feat: R52.7 projection region picker (8 presets + custom) + projector region layout

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: R52.9–R52.12 — i18n + 收尾 + PRD 标记

**Files:**
- Modify: `src/renderer/src/i18n/index.tsx`
- Modify: `docs/prd/PRD-0002-rgbbox-project-catalog.md`

- [ ] **Step 1: 加 EN keys**

在 `src/renderer/src/i18n/index.tsx` 466 行 `'audio.viz.cancel': 'Cancel',` 之后追加：

```typescript
  'audio.viz.style.classic': 'Classic',
  'audio.viz.style.art': 'Art',
  'audio.viz.metrics': 'Metrics',
  'audio.viz.region': 'Region',
  'audio.gen.subTab.generator': 'Generator',
  'audio.gen.subTab.scenes': 'Scenes',
  'audio.gen.subTab.export': 'Export',
```

- [ ] **Step 2: 加 ZH keys**

在 zh 段对应位置（`grep -n "audio.viz.cancel" src/renderer/src/i18n/index.tsx` 找到第二处）之后追加：

```typescript
  'audio.viz.style.classic': '经典',
  'audio.viz.style.art': '艺术',
  'audio.viz.metrics': '数值',
  'audio.viz.region': '区域',
  'audio.gen.subTab.generator': '生成器',
  'audio.gen.subTab.scenes': '场景',
  'audio.gen.subTab.export': '导出',
```

- [ ] **Step 3: 在 viz mode bar 加风格/数值切换按钮**

在 `AudioStudioView.tsx` viz mode bar（1990 行 fullscreen 按钮之前）加：

```tsx
              <button
                type="button"
                className={`audio-viz-fs-btn ${vizStyle === 'art' ? 'active' : ''}`}
                title={t('audio.viz.style.art')}
                onClick={() => setVizStyle(vizStyle === 'art' ? 'classic' : 'art')}
              >
                <RefreshCw size={14} />
              </button>
              <button
                type="button"
                className={`audio-viz-fs-btn ${vizShowMetrics ? 'active' : ''}`}
                title={t('audio.viz.metrics')}
                onClick={() => setVizShowMetrics(v => !v)}
              >
                <FileText size={14} />
              </button>
```

- [ ] **Step 4: 全量静态验证**

Run: `yarn typecheck` → exit 0。
Run: `yarn build` → exit 0。
Run: `yarn test` → 全过。

- [ ] **Step 5: PRD R52 状态改 ✅ + 附证据**

在 `docs/prd/PRD-0002-rgbbox-project-catalog.md` 的 R52 段：
- 表格状态列全部 ⏳ → ✅
- R52.10 验收点勾选前三项（typecheck/build/test），后两项标「用户待人工验收」
- 在 R52.10 下方加证据块：

```markdown
**证据：**
- `yarn typecheck` exit 0
- `yarn build` exit 0
- `yarn test` 全过（`tests/engine/audioMetrics.test.ts` 5 describe 通过）
- 受影响文件：见 R52.11
- 用户人工 GUI 验收：待验收（拖拽/布局/图表数值/美化/投屏区域/时间/数值）
```

- [ ] **Step 6: 提交**

```bash
git add src/renderer/src/i18n/index.tsx src/renderer/src/components/AudioStudioView.tsx docs/prd/PRD-0002-rgbbox-project-catalog.md
git commit -m "[PRD-0002] docs: R52.9-12 i18n keys + style/metrics toggle + mark R52 ✅

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 自检（写计划者自查）

**Spec 覆盖：**
- R52.1 → Task 4（顶部合并 + 删底部）✅
- R52.2 → Task 5（拖拽 blob 兜底 + 文件表独立）✅
- R52.3 → Task 6（删 audio-tabs + 图表全屏）✅
- R52.4 → Task 6（Generator sub-tab 迁场景/导出）✅
- R52.5 → Task 2 + Task 3（audioMetrics 纯函数 + 单测 + overlay）✅
- R52.6 → Task 3 + Task 8（art 变体 + 切换按钮）✅
- R52.7 → Task 7（8 区域 + 自定义拖框 + projector region 布局）✅
- R52.8 → Task 4（时间 bug + 音量/平衡数值）✅
- R52.9–12 → Task 8（i18n + 验收 + 文件 + 状态）✅

**占位符扫描：** 无 TBD/TODO；每步含完整代码或精确 before/after。

**类型一致：** `VizDrawOpts`、`RegionPreset`、`RegionRect`、`BpmState` 在 visualizers.ts 定义，AudioStudioView 与 AudioVizProjector 统一导入；`genSubTab` 字面量联合 `'generator'|'scenes'|'export'` 全程一致。

**风险已记录：**
- 拖拽 blob 兜底为「本会话可播，不持久化」；若需持久化路径需 preload `webUtils.getPathForFile`，届时另立 R-N（不在本计划内顺改 preload，遵守 CLAUDE.md）。
- 投屏区域用 localStorage（纯渲染层），不动主进程/preload。
- 时间 bug 修复用「interval 读 ref 而非闭包 el + loadedmetadata 兜底」；若实测仍不推进，需进一步定位（可能涉及 audio 元素生命周期，届时另立 R-N）。