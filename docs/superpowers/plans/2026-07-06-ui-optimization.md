# UI 优化实施计划（R50 布局基础设施 + R51 AudioStudio transport + EQ 双模式）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复底部内容截断 + 采样面板高度 bug + 按黄金分割重排布局（R50），并给 AudioStudio 加顶部快按 transport + EQ 双模式（graphic/parametric + 频率响应曲线图 + 预设库 + 自定义）（R51）。

**Architecture:** 两阶段隔离回归——阶段 1（R50）纯 CSS + 极小 JSX className 改动，无业务逻辑；阶段 2（R51）集中在 `AudioStudioView.tsx` 的 EQ drawer + 顶部工具栏，加一个纯 TS 频率响应工具 `src/engine/eqResponse.ts`（先单测），audio graph 从「固定 10 peaking」改为「`EqBand[]` 驱动动态 chain」，复用 `BiquadFilterNode` 可实时调 type/freq/Q/gain 的特性避免重建节点。

**Tech Stack:** Electron + Vite + React + TypeScript；Web Audio `BiquadFilterNode`；SVG 频率响应曲线；vitest（engine 单测）；命令统一走 `package.json` scripts（`yarn typecheck`/`yarn build`/`yarn test`/`yarn dev`）。

**关联文档：** 设计稿 `docs/superpowers/specs/2026-07-06-ui-optimization-design.md`；PRD R50/R51。

**约束（CLAUDE.md）：**
- 不动 `package.json` scripts 段；不动 `src/main/index.ts`、`src/preload/index.ts`；不动 IPC/引擎/audio 播放引擎（wavesurfer）/可视化/overlay/其他 view。
- 提交标题格式 `[PRD-0002] <type>: <subject>`。
- 完成时把 R50.7 / R51.12 状态改 ✅ 并在 R50.5 / R51.10 验收点 `[ ]` 改 `[x]` 附证据。

---

## 文件结构

### 阶段 1（R50）改/创文件
| 文件 | 责任 |
| --- | --- |
| `src/renderer/src/styles.css` | `.app-shell` 侧栏响应式；`.content-grid` 黄金分割；`.panel`/`.preview-panel`/`.workspace-main` min-height→0 + flex；`section.sampling-panel` 特异性提升 + `.collapsed` |
| `src/renderer/src/App.tsx` | 采样面板 `<section>` className 加 `.collapsed`（仅 1 行 className 表达式） |

### 阶段 2（R51）改/创文件
| 文件 | 责任 |
| --- | --- |
| `src/engine/eqResponse.ts`（新） | 纯 TS：`EqBand`/`EqFilterType` 类型、`computeBiquadResponse()` 频率响应计算、`EQ_PRESETS` 内置预设 |
| `tests/engine/eqResponse.test.ts`（新） | `computeBiquadResponse` 单测（flat=0dB、peaking 峰值、lowshelf/highpass 边界等） |
| `src/renderer/src/components/AudioStudioView.tsx` | EQ drawer 重写（模式切换 + 曲线图 + 段列表）+ audio graph 动态化 + 顶部 transport cluster |
| `src/renderer/src/styles.css` | EQ drawer 新布局/曲线图样式 + 顶部 transport cluster 样式 |
| `src/renderer/src/i18n/index.tsx` | EQ 预设名/说明、模式切换、parametric 字段中英文 |

---

## 阶段 1（R50）：布局基础设施

> CSS 布局无法单测，阶段 1 用「改 → typecheck/build → `yarn dev` 人工逐 view 验证 → commit」。每个 Task 自包含、独立可提交。

### Task 1: 侧栏响应式 + 内容区黄金分割比例

**Files:**
- Modify: `src/renderer/src/styles.css:100-107`（`.app-shell`）、`289-293`（`.content-grid`）

- [ ] **Step 1: 改 `.app-shell` 侧栏为响应式 clamp**

打开 `src/renderer/src/styles.css`，把 100-107 行 `.app-shell` 的 `grid-template-columns: 240px 1fr;` 改为：

```css
.app-shell {
  display: grid;
  grid-template-columns: clamp(180px, 22vw, 260px) 1fr;
  height: calc(100vh - 40px);
  margin-top: 40px;
  overflow: hidden;
  background: linear-gradient(180deg, #0f1418 0%, #0d1216 100%);
}
```

- [ ] **Step 2: 改 `.content-grid` 为黄金分割**

把 289-293 行 `.content-grid` 改为：

```css
.content-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: 1.618fr 1fr;
}
```

去掉 `minmax(320px, ...)` / `minmax(260px, ...)` 约束——子项可收缩由 Task 2 的 `min-width: 0` 负责。

- [ ] **Step 3: 给 `.content-grid` 子项加 `min-width: 0`**

在 `.content-grid` 规则块后追加（紧接其后）：

```css
.content-grid > * {
  min-width: 0;
}
```

- [ ] **Step 4: typecheck + build**

Run: `yarn typecheck && yarn build`
Expected: 两者 exit 0（CSS 改动不影响 tsc，但 build 走 electron-vite 全量打包验证不破坏）。

- [ ] **Step 5: 人工验证（`yarn dev`）**

Run: `yarn dev`，逐个进入 `workspace` / `effects` / `profiles` / `diagnostics` / `model3d` / `games` / `audio` / `video` / `architecture` 9 个 view，确认：
- 侧栏宽度在窄屏缩小到 ~180px、宽屏不超过 260px
- 有 content-grid 的 view（workspace）左右栏比例 ≈ 1.618:1（黄金分割），布局不破

按 Ctrl+C 退出 dev。

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/styles.css
git commit -m "[PRD-0002] feat: R50.1-R50.2 侧栏响应式 clamp + 内容区黄金分割 1.618:1

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 底部自适应（消除内容截断）

**Files:**
- Modify: `src/renderer/src/styles.css:314-321`（`.preview-panel`/`.controls-panel`/`.diagnostics-panel`）、`300-307`（`.panel`）、`1791-1800`（`.workspace-main`）

- [ ] **Step 1: `.workspace-main` 加 `min-height: 0`**

把 1791-1800 行 `.workspace-main` 改为（加 `min-height: 0` 一行）：

```css
.workspace-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 22px;
  scrollbar-width: thin;
  scrollbar-color: rgba(138, 162, 173, 0.18) transparent;
}
```

- [ ] **Step 2: `.panel` 去 `min-height` 加 flex**

把 300-307 行 `.panel` 改为：

```css
.panel {
  background: #131d23;
  border: 1px solid #26343c;
  border-radius: 12px;
  min-height: 0;
  padding: 16px;
  transition: border-color 200ms ease, box-shadow 200ms ease;
}
```

（删掉 `min-height: 200px`）

- [ ] **Step 3: `.preview-panel` 去 `min-height`**

把 314-316 行 `.preview-panel` 改为：

```css
.preview-panel {
  min-height: 0;
}
```

- [ ] **Step 4: `.controls-panel`/`.diagnostics-panel` 去 `min-height`**

把 318-321 行改为：

```css
.controls-panel,
.diagnostics-panel {
  min-height: 0;
}
```

- [ ] **Step 5: 给各 view 根容器 flex 列布局 + `min-height: 0`**

在 `.workspace-main` 规则块后追加一个通用规则（覆盖各 view 在 workspace-main 内的根容器，使其可收缩）：

```css
.workspace-main > * {
  min-height: 0;
}
```

> 注：各 view 根容器已是 `<section>` 或 `<div>`，父级 `.workspace-main` 是 `flex-direction: column`，子项加 `min-height: 0` 即可让超出内容由 `.workspace-main` 自身 `overflow-y: auto` 滚动而非被截断。无需逐个 view 改 JSX（避免动其他 view 的结构）。

- [ ] **Step 6: typecheck + build**

Run: `yarn typecheck && yarn build`
Expected: exit 0。

- [ ] **Step 7: 人工验证（`yarn dev`）**

Run: `yarn dev`，重点验证：
- workspace view：把窗口高度拉到很小，底部采样面板、控制面板内容不被截断，超出时可滚动
- effects / profiles / diagnostics view：内容多时底部可滚动到位，不被父容器切掉
- 9 个 view 都不破

按 Ctrl+C 退出。

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/styles.css
git commit -m "[PRD-0002] fix: R50.3 底部自适应 — panel min-height→0 + flex，消除内容截断

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: 采样面板高度 bug（展开/收起高度不同）

**Files:**
- Modify: `src/renderer/src/App.tsx:2377`（采样面板 className）、`src/renderer/src/styles.css:295-298`（`.sampling-panel`）

- [ ] **Step 1: App.tsx 采样面板 className 加 `.collapsed`**

打开 `src/renderer/src/App.tsx`，把 2377 行：

```tsx
                <section className="panel sampling-panel">
```

改为：

```tsx
                <section className={`panel sampling-panel${samplingCollapsed ? ' collapsed' : ''}`}>
```

- [ ] **Step 2: styles.css 提升采样面板特异性 + `.collapsed`**

把 295-298 行 `.sampling-panel` 改为：

```css
section.sampling-panel {
  grid-column: 1 / -1;
  min-height: 0;
}

section.sampling-panel.collapsed {
  height: auto;
}

section.sampling-panel:not(.collapsed) {
  height: auto;
}
```

> 提升到 `section.sampling-panel`（特异性 0,0,1,1）胜过 `.panel`（0,0,1,0），覆盖 `.panel` 的 `min-height`。收起时 `{!samplingCollapsed && (...)}` 已让内容只剩标题行，`.collapsed` 显式 `height: auto` 确保高度只占标题行；展开时内容（tabs+控件）撑开高度。

- [ ] **Step 3: 响应式断点同步（2393-2395 行）**

把 2393-2395 行 `@media (max-width: 960px)` 内的：

```css
  .sampling-panel {
    grid-column: 1;
  }
```

改为（保持特异性一致）：

```css
  section.sampling-panel {
    grid-column: 1;
  }
```

- [ ] **Step 4: typecheck + build + test**

Run: `yarn typecheck && yarn build && yarn test`
Expected: 全过，exit 0。

- [ ] **Step 5: 人工验证（`yarn dev`）**

Run: `yarn dev`，进 workspace view：
- 点采样面板「收起」按钮 → 面板高度塌到只剩标题行
- 点「展开」按钮 → 面板高度撑开到标题+tabs+控件
- 两者高度明显不同（修复前两者都被 `.panel { min-height: 200px }` 顶到一样大）

按 Ctrl+C 退出。

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/styles.css
git commit -m "[PRD-0002] fix: R50.4 采样面板展开/收起高度不同 — 提升 CSS 特异性 + .collapsed 类

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: R50 自检 + 验收点勾选 + PRD 状态改 ✅

**Files:**
- Modify: `docs/prd/PRD-0002-rgbbox-project-catalog.md`（R50.5 验收点、R50.7 状态）

- [ ] **Step 1: 全量回归**

Run: `yarn typecheck && yarn build && yarn test`
Expected: 全过。

- [ ] **Step 2: 9 view 逐个人工验证（`yarn dev`）**

Run: `yarn dev`，逐个进入 9 个 view，确认：
- 底部不截断、内容可滚动
- 采样面板展开/收起高度不同
- 黄金分割比例视觉协调
- 无 view 布局破坏

按 Ctrl+C 退出。

- [ ] **Step 3: PRD R50.5 验收点改 `[x]` 并附证据**

打开 `docs/prd/PRD-0002-rgbbox-project-catalog.md`，把 R50.5 的 5 个 `[ ]` 改 `[x]`，并在每条后附证据（命令输出/观察）。

- [ ] **Step 4: PRD R50.7 状态改 ✅**

把 R50.7 `**状态**：⏳ 待实施` 改为 `**状态**：✅ 已实施（2026-07-06）`。

- [ ] **Step 5: Commit**

```bash
git add docs/prd/PRD-0002-rgbbox-project-catalog.md
git commit -m "[PRD-0002] docs: R50 自检通过 — 布局基础设施验收点 ✅

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 阶段 2（R51）：AudioStudio transport + EQ 双模式

> 阶段 2 用 TDD 仅在 `eqResponse.ts`（纯函数可单测）；UI/audio graph 改动用「改 → typecheck/build → `yarn dev` 人工播放验证 → commit」。先做纯函数 + 单测，再做 audio graph，最后 UI。

### Task 5: EQ 频率响应纯函数 + 单测（TDD 先行）

**Files:**
- Create: `src/engine/eqResponse.ts`
- Test: `tests/engine/eqResponse.test.ts`

- [ ] **Step 1: 写失败的单测**

创建 `tests/engine/eqResponse.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { computeBiquadResponse, type EqBand } from '../../src/engine/eqResponse'

const SR = 48000
// 20Hz..20kHz 对数 256 点
const freqs = Array.from({ length: 256 }, (_, i) => 20 * Math.pow(1000, i / 255))

describe('computeBiquadResponse', () => {
  it('flat（gain=0）→ 所有点 0 dB', () => {
    const band: EqBand = { id: 'b1', type: 'peaking', freq: 1000, gain: 0, Q: 1.41 }
    const db = computeBiquadResponse([band], SR, freqs)
    db.forEach(v => expect(Math.abs(v)).toBeLessThan(1e-9))
  })

  it('peaking +6dB @1kHz Q=1.41 → 1kHz 处 ≈ +6dB', () => {
    const band: EqBand = { id: 'b1', type: 'peaking', freq: 1000, gain: 6, Q: 1.41 }
    const db = computeBiquadResponse([band], SR, freqs)
    const idx = freqs.reduce((best, f, i) =>
      Math.abs(f - 1000) < Math.abs(freqs[best] - 1000) ? i : best, 0)
    expect(db[idx]).toBeGreaterThan(5.9)
    expect(db[idx]).toBeLessThan(6.1)
  })

  it('lowshelf +6dB → 20Hz 处 ≈ +6dB，20kHz 处 ≈ 0dB', () => {
    const band: EqBand = { id: 'b1', type: 'lowshelf', freq: 200, gain: 6, Q: 0.7 }
    const db = computeBiquadResponse([band], SR, freqs)
    expect(db[0]).toBeGreaterThan(5.8)
    expect(db[db.length - 1]).toBeLessThan(0.5)
  })

  it('highpass @200Hz Q=0.7 → 20Hz 远低于 -20dB，20kHz ≈ 0dB', () => {
    const band: EqBand = { id: 'b1', type: 'highpass', freq: 200, gain: 0, Q: 0.7 }
    const db = computeBiquadResponse([band], SR, freqs)
    expect(db[0]).toBeLessThan(-20)
    expect(db[db.length - 1]).toBeGreaterThan(-0.5)
  })

  it('notch @50Hz Q=5 → 50Hz 处 ≤ -20dB', () => {
    const band: EqBand = { id: 'b1', type: 'notch', freq: 50, gain: 0, Q: 5 }
    const db = computeBiquadResponse([band], SR, freqs)
    const idx = freqs.reduce((best, f, i) =>
      Math.abs(f - 50) < Math.abs(freqs[best] - 50) ? i : best, 0)
    expect(db[idx]).toBeLessThan(-20)
  })

  it('多段串联 = 各段 dB 之和（peaking +6 @1k 与 +3 @2k → 1k 处 ≈6, 2k 处 ≈3+残余）', () => {
    const bands: EqBand[] = [
      { id: 'b1', type: 'peaking', freq: 1000, gain: 6, Q: 1.41 },
      { id: 'b2', type: 'peaking', freq: 2000, gain: 3, Q: 1.41 },
    ]
    const db = computeBiquadResponse(bands, SR, freqs)
    const idx1k = freqs.reduce((best, f, i) =>
      Math.abs(f - 1000) < Math.abs(freqs[best] - 1000) ? i : best, 0)
    expect(db[idx1k]).toBeGreaterThan(5.5) // 6 为主，2k 段在 1k 残余很小
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `yarn test tests/engine/eqResponse.test.ts`
Expected: FAIL，错误 `Cannot find module '../../src/engine/eqResponse'`。

- [ ] **Step 3: 写 `eqResponse.ts` 实现**

创建 `src/engine/eqResponse.ts`：

```ts
// R51.5: 纯 TS 频率响应计算（无 DOM/WebAudio 依赖，符合 engine 层约定）。
// 按 Web Audio BiquadFilterNode 标准二阶节传递函数实现，用于 EQ 曲线图绘制。

export type EqFilterType =
  | 'peaking' | 'lowshelf' | 'highshelf'
  | 'notch' | 'lowpass' | 'highpass' | 'bandpass'

export interface EqBand {
  id: string
  type: EqFilterType
  freq: number   // Hz
  gain: number   // dB
  Q: number      // 0.1..20
}

// 复数 {re, im}
interface Complex { re: number; im: number }
const cmul = (a: Complex, b: Complex): Complex => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re })
const cdiv = (n: Complex, d: Complex): Complex => {
  const denom = d.re * d.re + d.im * d.im
  return { re: (n.re * d.re + n.im * d.im) / denom, im: (n.im * d.re - n.re * d.im) / denom }
}

// 返回单个 BiquadFilter 在 freqHz 处的复频率响应 H(f)。
// 系数 a0..b2 按 Web Audio spec 二阶节公式（normalized digital filter）。
function biquadResponse(band: EqBand, sampleRate: number, freqHz: number): Complex {
  const { type, freq, gain, Q } = band
  const A = Math.pow(10, gain / 40) // peaking/shelf 用
  const w0 = (2 * Math.PI * freq) / sampleRate
  const cos = Math.cos(w0)
  const sin = Math.sin(w0)
  const alpha = sin / (2 * Q)

  // 标准 biquad 系数（b0,b1,b2 / a0,a1,a2），a0 归一化后 a1,a2
  let b0 = 0, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0

  switch (type) {
    case 'peaking':
      b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A
      a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A
      break
    case 'lowshelf': {
      const sqrtA = Math.sqrt(A)
      b0 = A * ((A + 1) - (A - 1) * cos + 2 * sqrtA * alpha)
      b1 = 2 * A * ((A - 1) - (A + 1) * cos)
      b2 = A * ((A + 1) - (A - 1) * cos - 2 * sqrtA * alpha)
      a0 = (A + 1) + (A - 1) * cos + 2 * sqrtA * alpha
      a1 = -2 * ((A - 1) + (A + 1) * cos)
      a2 = (A + 1) + (A - 1) * cos - 2 * sqrtA * alpha
      break
    }
    case 'highshelf': {
      const sqrtA = Math.sqrt(A)
      b0 = A * ((A + 1) + (A - 1) * cos + 2 * sqrtA * alpha)
      b1 = -2 * A * ((A - 1) + (A + 1) * cos)
      b2 = A * ((A + 1) + (A - 1) * cos - 2 * sqrtA * alpha)
      a0 = (A + 1) - (A - 1) * cos + 2 * sqrtA * alpha
      a1 = 2 * ((A - 1) - (A + 1) * cos)
      a2 = (A + 1) - (A - 1) * cos - 2 * sqrtA * alpha
      break
    }
    case 'notch':
      b0 = 1; b1 = -2 * cos; b2 = 1
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha
      break
    case 'lowpass':
      b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha
      break
    case 'highpass':
      b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha
      break
    case 'bandpass':
      b0 = alpha; b1 = 0; b2 = -alpha
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha
      break
  }

  // 归一化（a0 通常已在公式中处理，但显式归一更稳）
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0; a0 = 1

  // H(z) = (b0 + b1 z^-1 + b2 z^-2) / (1 + a1 z^-1 + a2 z^-2)，z = e^{j w0}
  const z1re = cos, z1im = -sin       // z^-1 = e^{-j w0}
  const z2re = Math.cos(2 * w0), z2im = -Math.sin(2 * w0)

  const num: Complex = {
    re: b0 + b1 * z1re + b2 * z2re,
    im: b1 * z1im + b2 * z2im,
  }
  const den: Complex = {
    re: 1 + a1 * z1re + a2 * z2re,
    im: a1 * z1im + a2 * z2im,
  }
  return cdiv(num, den)
}

// 计算多段串联在给定频率点上的总响应（dB）。
export function computeBiquadResponse(
  bands: EqBand[],
  sampleRate: number,
  freqs: number[],
): number[] {
  return freqs.map((f) => {
    let h: Complex = { re: 1, im: 0 }
    for (const band of bands) {
      h = cmul(h, biquadResponse(band, sampleRate, f))
    }
    return 20 * Math.log10(Math.hypot(h.re, h.im) || 1e-12)
  })
}

// 频率响应曲线采样点（对数 20Hz..20kHz，n 个点），供 UI 复用。
export function logFreqPoints(n: number): number[] {
  return Array.from({ length: n }, (_, i) => 20 * Math.pow(1000, i / (n - 1)))
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `yarn test tests/engine/eqResponse.test.ts`
Expected: 6 个 case 全 PASS。若有数值偏差（peaking 峰值不在 ±0.1），检查系数公式（常见错：alpha 符号、A 定义）。

- [ ] **Step 5: 全量测试确认无回归**

Run: `yarn test`
Expected: 全过，相对 R50 基线 +6。

- [ ] **Step 6: Commit**

```bash
git add src/engine/eqResponse.ts tests/engine/eqResponse.test.ts
git commit -m "[PRD-0002] feat: R51.5 EQ 频率响应纯函数 + 单测（Biquad 二阶节系数）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: EQ 预设库常量 + 类型导出

**Files:**
- Modify: `src/engine/eqResponse.ts`（追加预设）

- [ ] **Step 1: 在 `eqResponse.ts` 末尾追加预设库**

在 `src/engine/eqResponse.ts` 末尾追加：

```ts
export type EqMode = 'graphic' | 'parametric'

export interface EqPreset {
  id: string
  name: string
  nameZh: string
  description: string
  descriptionZh: string
  mode: EqMode
  bands: EqBand[]
  builtin: boolean
}

// ISO 10 段频率（graphic 模式固定）
export const EQ_GRAPHIC_FREQS = [31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const

// graphic 模式增益数组 → EqBand[]
export function graphicGainsToBands(gains: number[]): EqBand[] {
  return EQ_GRAPHIC_FREQS.map((freq, i) => ({
    id: `g-${i}`, type: 'peaking' as const, freq, gain: gains[i] ?? 0, Q: 1.41,
  }))
}

// graphic 模式 EqBand[] → 增益数组（供 10 滑块 UI 用）
export function bandsToGraphicGains(bands: EqBand[]): number[] {
  return EQ_GRAPHIC_FREQS.map((f) => bands.find(b => b.freq === f && b.type === 'peaking')?.gain ?? 0)
}

const genId = () => `u-${Math.floor(performance.now() * 1000)}-${Math.floor(Math.random() * 1e6)}`

// 内置预设库（经典 graphic + 参考 parametric，附说明）
export const EQ_PRESETS: EqPreset[] = [
  {
    id: 'flat', name: 'Flat', nameZh: '平坦',
    description: 'Neutral response, no coloration.',
    descriptionZh: '中性响应，不染色。',
    mode: 'graphic', builtin: true,
    bands: graphicGainsToBands(new Array(10).fill(0)),
  },
  {
    id: 'pop', name: 'Pop', nameZh: '流行',
    description: 'Boosted vocals and presence, slightly cut bass.',
    descriptionZh: '提升人声与存在感，略微削减低音。',
    mode: 'graphic', builtin: true,
    bands: graphicGainsToBands([-1, 2, 4, 4, 1, -1, -1, 0, 1, 2]),
  },
  {
    id: 'rock', name: 'Rock', nameZh: '摇滚',
    description: 'Scooped mids, strong lows and highs for guitars/drums.',
    descriptionZh: '中频凹陷，强化高低频，适合吉他/鼓。',
    mode: 'graphic', builtin: true,
    bands: graphicGainsToBands([4, 3, 0, -1, -2, -1, 2, 4, 5, 5]),
  },
  {
    id: 'jazz', name: 'Jazz', nameZh: '爵士',
    description: 'Warm mids, smooth highs, gentle bass.',
    descriptionZh: '温暖中频，顺滑高频，温和低音。',
    mode: 'graphic', builtin: true,
    bands: graphicGainsToBands([3, 2, 1, 2, -1, -1, 0, 1, 2, 3]),
  },
  {
    id: 'vocal', name: 'Vocal', nameZh: '人声',
    description: 'Presence boost around 2-4kHz for vocal clarity.',
    descriptionZh: '2-4kHz 存在感提升，人声清晰。',
    mode: 'graphic', builtin: true,
    bands: graphicGainsToBands([-2, -1, 0, 2, 4, 4, 3, 1, 0, -1]),
  },
  {
    id: 'bass-boost', name: 'Bass Boost', nameZh: '低音增强',
    description: 'Strong low-frequency lift for headphone impact.',
    descriptionZh: '强力低频提升，增强耳机冲击感。',
    mode: 'graphic', builtin: true,
    bands: graphicGainsToBands([6, 5, 4, 2, 0, 0, 0, 0, 0, 0]),
  },
  {
    id: 'treble-boost', name: 'Treble Boost', nameZh: '高音增强',
    description: 'Air and detail above 4kHz.',
    descriptionZh: '4kHz 以上空气感与细节。',
    mode: 'graphic', builtin: true,
    bands: graphicGainsToBands([0, 0, 0, 0, 0, 1, 3, 5, 6, 6]),
  },
  {
    id: 'loudness', name: 'Loudness', nameZh: '响度补偿',
    description: 'Classic loudness curve: boosted lows and highs at low volume.',
    descriptionZh: '经典响度曲线：小音量下强化高低频。',
    mode: 'graphic', builtin: true,
    bands: graphicGainsToBands([5, 4, 2, 0, -1, -1, 0, 2, 4, 5]),
  },
  {
    id: 'smile', name: 'Smile Curve', nameZh: '微笑曲线',
    description: 'Scooped mids, the classic V shape for master bus.',
    descriptionZh: '中频凹陷，经典 V 形母带曲线。',
    mode: 'graphic', builtin: true,
    bands: graphicGainsToBands([4, 3, 1, -1, -2, -2, -1, 1, 3, 4]),
  },
  // Parametric 参考（工程手法）
  {
    id: 'p-hpf40', name: 'HPF 40Hz', nameZh: '高通 40Hz',
    description: 'High-pass at 40Hz to remove subsonic rumble.',
    descriptionZh: '40Hz 高通，去除次声隆隆声。',
    mode: 'parametric', builtin: true,
    bands: [{ id: 'p1', type: 'highpass', freq: 40, gain: 0, Q: 0.7 }],
  },
  {
    id: 'p-lpf18k', name: 'LPF 18kHz', nameZh: '低通 18kHz',
    description: 'Low-pass at 18kHz to tame high-frequency noise.',
    descriptionZh: '18kHz 低通，抑制高频噪声。',
    mode: 'parametric', builtin: true,
    bands: [{ id: 'p1', type: 'lowpass', freq: 18000, gain: 0, Q: 0.7 }],
  },
  {
    id: 'p-notch50', name: 'Notch 50Hz', nameZh: '陷波 50Hz',
    description: 'Notch at 50Hz Q=5 to remove mains hum.',
    descriptionZh: '50Hz Q=5 陷波，去除电源嗡声。',
    mode: 'parametric', builtin: true,
    bands: [{ id: 'p1', type: 'notch', freq: 50, gain: 0, Q: 5 }],
  },
  {
    id: 'p-presence', name: 'Presence 3kHz', nameZh: '存在感 3kHz',
    description: 'Peaking +4dB at 3kHz Q=1 to lift vocal presence.',
    descriptionZh: '3kHz Q=1 提升 +4dB，提升人声存在感。',
    mode: 'parametric', builtin: true,
    bands: [{ id: 'p1', type: 'peaking', freq: 3000, gain: 4, Q: 1 }],
  },
  {
    id: 'p-deess', name: 'De-ess 6kHz', nameZh: '齿音抑制 6kHz',
    description: 'Peaking -5dB at 6kHz Q=4 to tame sibilance.',
    descriptionZh: '6kHz Q=4 衰减 -5dB，抑制齿音。',
    mode: 'parametric', builtin: true,
    bands: [{ id: 'p1', type: 'peaking', freq: 6000, gain: -5, Q: 4 }],
  },
]
```

> 注：`performance.now()` 在 renderer 可用；`Math.random()` 仅用于生成 id 非决定性场景，可接受。若测试环境禁用，genId 仅在用户保存自定义时调用，不影响单测。

- [ ] **Step 2: typecheck**

Run: `yarn typecheck`
Expected: exit 0。

- [ ] **Step 3: Commit**

```bash
git add src/engine/eqResponse.ts
git commit -m "[PRD-0002] feat: R51.6 EQ 预设库（9 graphic 经典 + 5 parametric 参考，附中英文说明）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: AudioStudioView 状态 + audio graph 动态化

**Files:**
- Modify: `src/renderer/src/components/AudioStudioView.tsx:848-851`（EQ 状态）、`1008-1024`（audio graph EQ chain）、`1194-1198`（realtime update）

- [ ] **Step 1: 引入类型 + 替换 EQ 状态**

在 `AudioStudioView.tsx` 顶部 import 区追加（找现有 import 行）：

```ts
import {
  type EqBand, type EqMode, type EqPreset,
  EQ_GRAPHIC_FREQS, EQ_PRESETS, graphicGainsToBands, bandsToGraphicGains,
} from '../engine/eqResponse'
```

把 848-851 行：

```ts
  const EQ_FREQS = [31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const
  const [eqEnabled, setEqEnabled] = useState(false)
  const [eqBands, setEqBands] = useState<number[]>(() => new Array(10).fill(0))
  const [eqExpanded, setEqExpanded] = useState(false)
```

改为：

```ts
  const EQ_FREQS = EQ_GRAPHIC_FREQS
  const [eqEnabled, setEqEnabled] = useState(false)
  const [eqMode, setEqMode] = useState<EqMode>(() =>
    (localStorage.getItem('rgbbox:eqMode') as EqMode) || 'graphic')
  useEffect(() => { localStorage.setItem('rgbbox:eqMode', eqMode) }, [eqMode])
  // graphic 模式用 eqBands(10 gains)，parametric 模式用 eqParams(EqBand[])
  const [eqBands, setEqBands] = useState<number[]>(() => new Array(10).fill(0))
  const [eqParams, setEqParams] = useState<EqBand[]>(() => [
    { id: 'p1', type: 'peaking', freq: 100, gain: 0, Q: 1 },
    { id: 'p2', type: 'peaking', freq: 500, gain: 0, Q: 1 },
    { id: 'p3', type: 'peaking', freq: 2000, gain: 0, Q: 1 },
    { id: 'p4', type: 'peaking', freq: 6000, gain: 0, Q: 1 },
    { id: 'p5', type: 'peaking', freq: 10000, gain: 0, Q: 1 },
    { id: 'p6', type: 'highpass', freq: 30, gain: 0, Q: 0.7 },
  ])
  const [eqExpanded, setEqExpanded] = useState(false)
```

- [ ] **Step 2: 加「当前生效 band 列表」派生 + audio graph 动态 chain**

把 1008-1024 行（`// Build 10-band EQ chain...` 到 `eqPrev.connect(analyser)`）替换为：

```ts
    // R51.3: EQ chain 改为 EqBand[] 驱动，初始建 graphic 10 段（占位），后续 useEffect diff 维护。
    // 这里只建一个空起点 node（gain=1 pass-through），实际 EQ 节点由 syncEqChain 动态插入。
    const eqPassThrough = ctx.createGain()
    eqPassThrough.gain.value = 1
    eqNodesRef.current = [] // EQ 节点列表初始为空
    gain.connect(panner)
    panner.connect(eqPassThrough)
    eqPassThrough.connect(analyser)
    eqEntryPointRef.current = eqPassThrough  // EQ 链插入点（panner 之后）
    eqExitPointRef.current = eqPassThrough   // 默认直连 analyser
    analyser.connect(ctx.destination)
```

> `eqPassThrough` 是恒定直通节点，作为 EQ 链的「插入点」。EQ 节点动态插入时：断开 `eqEntryPoint → eqExitPoint`，串联 EQ 节点，再接回 `eqExitPoint → analyser`。

- [ ] **Step 3: 加 ref 声明（在现有 ref 区，如 `eqNodesRef` 旁）**

找到 `const eqNodesRef = useRef<BiquadFilterNode[]>([])`（grep 确认存在），改为并补：

```ts
  const eqNodesRef = useRef<BiquadFilterNode[]>([])
  const eqEntryPointRef = useRef<AudioNode | null>(null)
  const eqExitPointRef = useRef<AudioNode | null>(null)
```

- [ ] **Step 4: 写 syncEqChain 同步函数 + useEffect**

把 1194-1198 行 realtime EQ update 替换为动态同步逻辑：

```ts
  // R51.3: 监听 mode/bands/params/enabled 变化，同步 EQ chain（diff 增删节点 + 实时写属性）。
  useEffect(() => {
    const ctx = audioContextRef.current
    const entry = eqEntryPointRef.current
    const exit = eqExitPointRef.current
    if (!ctx || !entry || !exit) return

    const activeBands = eqEnabled
      ? (eqMode === 'graphic' ? graphicGainsToBands(eqBands) : eqParams)
      : []

    // 复用现有节点数量对齐（增删）
    while (eqNodesRef.current.length > activeBands.length) {
      const node = eqNodesRef.current.pop()!
      node.disconnect()
    }
    while (eqNodesRef.current.length < activeBands.length) {
      const f = ctx.createBiquadFilter()
      eqNodesRef.current.push(f)
    }

    // 写属性（type/freq/Q 直接 setValueAtTime，gain 用 setTargetAtTime 防 zipper）
    const now = ctx.currentTime
    activeBands.forEach((band, i) => {
      const node = eqNodesRef.current[i]
      if (node.type !== band.type) node.type = band.type
      node.frequency.setValueAtTime(band.freq, now)
      node.Q.setValueAtTime(band.Q, now)
      node.gain.setTargetAtTime(band.gain, now, 0.005)
    })

    // 重新串联：entry → nodes[0..n] → exit
    try { entry.disconnect() } catch { /* may not be connected */ }
    let prev: AudioNode = entry
    for (const node of eqNodesRef.current) {
      prev.connect(node)
      prev = node
    }
    prev.connect(exit)
  }, [eqMode, eqBands, eqParams, eqEnabled])
```

> 注意：`entry.disconnect()` 断开 entry 的所有输出连接（包括之前的直通），再重建链。这是安全的——entry（panner）的输入不受影响，只重连输出。`exit` 始终是 `eqPassThrough → analyser` 那条路的终点（即 `eqPassThrough` 节点本身，它再连 analyser）。重连后 entry→nodes→eqPassThrough→analyser。

- [ ] **Step 5: typecheck**

Run: `yarn typecheck`
Expected: exit 0。若有 TS 错误（如 ref 类型不匹配），按提示修。

- [ ] **Step 6: 人工验证（`yarn dev`）**

Run: `yarn dev`，进 audio view，加载一首歌播放：
- 开 EQ → 拖 graphic 滑块 → 听感应实时变（无爆音）
- 关 EQ 再开 → 听感对应

按 Ctrl+C 退出。

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/AudioStudioView.tsx
git commit -m "[PRD-0002] feat: R51.3 audio graph EQ chain 动态化（EqBand[] 驱动 + diff 增删 + setTargetAtTime）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: EQ drawer UI 重写（模式切换 + 曲线图 + graphic 滑块 + parametric 段列表）

**Files:**
- Modify: `src/renderer/src/components/AudioStudioView.tsx:1866-1922`（EQ drawer）、`src/renderer/src/styles.css`（EQ drawer 样式）

- [ ] **Step 1: 加 EQ 状态（预设选择 + 自定义）**

在 Task 7 加的 eqParams state 后追加：

```ts
  const [eqPresetId, setEqPresetId] = useState<string>('flat')
  const [eqCustomPresets, setEqCustomPresets] = useState<EqPreset[]>(() => {
    try { return JSON.parse(localStorage.getItem('rgbbox:eqPresets') || '[]') } catch { return [] }
  })
  useEffect(() => { localStorage.setItem('rgbbox:eqPresets', JSON.stringify(eqCustomPresets)) }, [eqCustomPresets])
```

- [ ] **Step 2: 加「应用预设」+「保存自定义」+「删除自定义」函数**

在组件函数体（其他 handler 旁，如 `formatTime` 附近）追加：

```ts
  const applyEqPreset = useCallback((preset: EqPreset) => {
    setEqMode(preset.mode)
    if (preset.mode === 'graphic') {
      setEqBands(bandsToGraphicGains(preset.bands))
    } else {
      setEqParams(preset.bands.map(b => ({ ...b })))
    }
    setEqPresetId(preset.id)
  }, [])

  const saveCustomPreset = useCallback(() => {
    const name = window.prompt(t('audio.eq.presetName'))
    if (!name) return
    const bands = eqMode === 'graphic' ? graphicGainsToBands(eqBands) : eqParams
    const preset: EqPreset = {
      id: `c-${Date.now()}`, name, nameZh: name,
      description: 'User custom preset.', descriptionZh: '用户自定义预设。',
      mode: eqMode, bands, builtin: false,
    }
    setEqCustomPresets(prev => [...prev, preset])
    setEqPresetId(preset.id)
  }, [eqMode, eqBands, eqParams, t])

  const deleteCustomPreset = useCallback((id: string) => {
    setEqCustomPresets(prev => prev.filter(p => p.id !== id))
    setEqPresetId('flat')
  }, [])
```

> 注：`Date.now()` 在 renderer UI handler 中调用（非 module-load、非 workflow），可用。

- [ ] **Step 3: 加曲线图派生数据 + 拖点 handler**

在 Task 8 Step 1 state 后追加（派生 + 拖点）：

```ts
  const activeEqBands = eqEnabled
    ? (eqMode === 'graphic' ? graphicGainsToBands(eqBands) : eqParams)
    : []
  const curveFreqs = useMemo(() => logFreqPoints(128), [])
  const curveDb = useMemo(
    () => computeBiquadResponse(activeEqBands, 48000, curveFreqs),
    [activeEqBands, curveFreqs],
  )

  // 曲线图拖点改 gain：找最近频段，graphic 模式改对应 eqBands[i]，parametric 改对应 band.gain
  const handleCurveDrag = useCallback((freqHz: number, newGain: number) => {
    const clamped = Math.max(-24, Math.min(24, newGain))
    if (eqMode === 'graphic') {
      // 找最近 ISO 频段
      let nearest = 0, min = Infinity
      EQ_FREQS.forEach((f, i) => { if (Math.abs(f - freqHz) < min) { min = Math.abs(f - freqHz); nearest = i } })
      setEqBands(prev => { const next = [...prev]; next[nearest] = clamped; return next })
    } else {
      let nearest = 0, min = Infinity
      eqParams.forEach((b, i) => { if (Math.abs(b.freq - freqHz) < min) { min = Math.abs(b.freq - freqHz); nearest = i } })
      setEqParams(prev => prev.map((b, i) => i === nearest ? { ...b, gain: clamped } : b))
    }
  }, [eqMode, EQ_FREQS, eqParams])
```

> 需要 import `useMemo, useCallback`（若未 import）和 `computeBiquadResponse, logFreqPoints`（已在 Task 7 import 行追加，此处补到 import）。把 Task 7 的 import 行补全为：

```ts
import {
  type EqBand, type EqMode, type EqPreset,
  EQ_GRAPHIC_FREQS, EQ_PRESETS, graphicGainsToBands, bandsToGraphicGains,
  computeBiquadResponse, logFreqPoints,
} from '../engine/eqResponse'
```

- [ ] **Step 4: 重写 EQ drawer JSX（1868-1921 行整块替换）**

把 `{eqExpanded && (` 到对应 `)}` 整块（1868–1922 行）替换为：

```tsx
          {eqExpanded && (
            <div className="audio-drawer-backdrop" onClick={() => setEqExpanded(false)}>
              <div className="audio-drawer" onClick={(e) => e.stopPropagation()}>
                <div className="audio-drawer-header">
                  <h3>{t('audio.eq.title')}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      className={`audio-btn-sm ${eqEnabled ? 'active' : ''}`}
                      onClick={() => setEqEnabled(v => !v)}
                    >
                      {eqEnabled ? t('audio.on') : t('audio.off')}
                    </button>
                    <button type="button" className="audio-btn-icon" title={t('common.close')} onClick={() => setEqExpanded(false)}>
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {/* 模式切换 + 预设 */}
                <div className="eq-toolbar">
                  <div className="eq-mode-switch">
                    <button type="button" className={`eq-mode-btn ${eqMode === 'graphic' ? 'active' : ''}`} onClick={() => setEqMode('graphic')}>{t('audio.eq.graphic')}</button>
                    <button type="button" className={`eq-mode-btn ${eqMode === 'parametric' ? 'active' : ''}`} onClick={() => setEqMode('parametric')}>{t('audio.eq.parametric')}</button>
                  </div>
                  <select
                    className="eq-preset-select"
                    value={eqPresetId}
                    onChange={(e) => {
                      const id = e.target.value
                      const all = [...EQ_PRESETS, ...eqCustomPresets]
                      const p = all.find(x => x.id === id)
                      if (p) applyEqPreset(p)
                    }}
                  >
                    <optgroup label={t('audio.eq.builtin')}>
                      {EQ_PRESETS.map(p => <option key={p.id} value={p.id}>{t('audio.eq.lang') === 'zh' ? p.nameZh : p.name}</option>)}
                    </optgroup>
                    {eqCustomPresets.length > 0 && (
                      <optgroup label={t('audio.eq.custom')}>
                        {eqCustomPresets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                  <button type="button" className="audio-btn-sm" onClick={saveCustomPreset} title={t('audio.eq.savePreset')}>＋</button>
                  {(() => {
                    const p = eqCustomPresets.find(x => x.id === eqPresetId)
                    return p ? <button type="button" className="audio-btn-icon" title={t('audio.eq.deletePreset')} onClick={() => deleteCustomPreset(p.id)}><Trash2 size={14} /></button> : null
                  })()}
                </div>

                {/* 预设说明 */}
                {(() => {
                  const all = [...EQ_PRESETS, ...eqCustomPresets]
                  const p = all.find(x => x.id === eqPresetId)
                  if (!p) return null
                  const isZh = t('audio.eq.lang') === 'zh'
                  return <p className="eq-preset-desc">{isZh ? p.descriptionZh : p.description}</p>
                })()}

                {/* 频率响应曲线图（SVG 可拖点） */}
                <EqCurvePlot
                  freqs={curveFreqs}
                  db={curveDb}
                  bands={activeEqBands}
                  onDragGain={handleCurveDrag}
                />

                {/* Graphic 模式：10 滑块 */}
                {eqMode === 'graphic' && (
                  <div className="audio-eq-grid">
                    {EQ_FREQS.map((freq, i) => (
                      <div key={freq} className="audio-eq-band">
                        <span className="audio-eq-freq">{freq >= 1000 ? `${freq / 1000}k` : freq}</span>
                        <input
                          type="range"
                          className="audio-eq-slider"
                          min={-12} max={12} step={0.5}
                          value={eqBands[i]}
                          style={{ writingMode: 'vertical-lr', direction: 'rtl', height: 80, width: 20 }}
                          onChange={(e) => {
                            const val = Number(e.target.value)
                            setEqBands(prev => { const next = [...prev]; next[i] = val; return next })
                          }}
                        />
                        <span className="audio-eq-db">{eqBands[i] > 0 ? `+${eqBands[i]}` : eqBands[i]}</span>
                        <button
                          type="button"
                          className="audio-btn-icon"
                          title="Reset"
                          onClick={() => setEqBands(prev => { const next = [...prev]; next[i] = 0; return next })}
                        >×</button>
                      </div>
                    ))}
                    <button type="button" className="audio-btn-sm" style={{ gridColumn: '1 / -1', marginTop: 4 }} onClick={() => setEqBands(new Array(10).fill(0))}>
                      {t('audio.eq.reset')}
                    </button>
                  </div>
                )}

                {/* Parametric 模式：段列表 */}
                {eqMode === 'parametric' && (
                  <div className="eq-param-list">
                    {eqParams.map((band, i) => (
                      <div key={band.id} className="eq-param-row">
                        <select
                          className="eq-param-type"
                          value={band.type}
                          onChange={(e) => setEqParams(prev => prev.map((b, j) => j === i ? { ...b, type: e.target.value as EqBand['type'] } : b))}
                        >
                          {(['peaking', 'lowshelf', 'highshelf', 'notch', 'lowpass', 'highpass', 'bandpass'] as const).map(tp => (
                            <option key={tp} value={tp}>{tp}</option>
                          ))}
                        </select>
                        <label className="eq-param-field">{t('audio.eq.freq')}<input type="range" min={20} max={20000} step={1} value={band.freq} onChange={(e) => setEqParams(prev => prev.map((b, j) => j === i ? { ...b, freq: Number(e.target.value) } : b))} /><span>{band.freq >= 1000 ? `${(band.freq / 1000).toFixed(1)}k` : band.freq}</span></label>
                        <label className="eq-param-field">{t('audio.eq.gain')}<input type="range" min={-24} max={24} step={0.5} value={band.gain} onChange={(e) => setEqParams(prev => prev.map((b, j) => j === i ? { ...b, gain: Number(e.target.value) } : b))} /><span>{band.gain > 0 ? `+${band.gain}` : band.gain}</span></label>
                        <label className="eq-param-field">Q<input type="range" min={0.1} max={20} step={0.1} value={band.Q} onChange={(e) => setEqParams(prev => prev.map((b, j) => j === i ? { ...b, Q: Number(e.target.value) } : b))} /><span>{band.Q.toFixed(1)}</span></label>
                        <button type="button" className="audio-btn-icon" title={t('audio.eq.deleteBand')} onClick={() => setEqParams(prev => prev.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
                      </div>
                    ))}
                    <button type="button" className="audio-btn-sm eq-add-band" onClick={() => setEqParams(prev => [...prev, { id: `p-${Date.now()}`, type: 'peaking', freq: 1000, gain: 0, Q: 1 }])}>
                      {t('audio.eq.addBand')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
```

> 需 import `Trash2` 图标：确认顶部 lucide-react import 已含（grep `Trash2`，若无则补）。

- [ ] **Step 5: 创建 EqCurvePlot 组件（曲线图）**

在 `AudioStudioView.tsx` 文件**外**（模块顶层，`function AudioStudioView(...)` 之前）定义：

```tsx
// R51.4: EQ 频率响应曲线图 SVG，可拖点改 gain。
function EqCurvePlot({
  freqs, db, bands, onDragGain,
}: {
  freqs: number[]
  db: number[]
  bands: EqBand[]
  onDragGain: (freqHz: number, newGain: number) => void
}) {
  const W = 360, H = 140, padL = 28, padR = 8, padT = 10, padB = 18
  const fMin = 20, fMax = 20000
  const dbMin = -24, dbMax = 24
  const x = (f: number) => padL + (Math.log(f) - Math.log(fMin)) / (Math.log(fMax) - Math.log(fMin)) * (W - padL - padR)
  const y = (v: number) => padT + (1 - (Math.max(dbMin, Math.min(dbMax, v)) - dbMin) / (dbMax - dbMin)) * (H - padT - padB)
  const path = freqs.map((f, i) => `${i === 0 ? 'M' : 'L'}${x(f).toFixed(1)},${y(db[i]).toFixed(1)}`).join(' ')
  // 0dB 基准线
  const zeroY = y(0)

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = e.currentTarget
    svg.setPointerCapture(e.pointerId)
    const rect = svg.getBoundingClientRect()
    const scaleX = W / rect.width
    const drag = (ev: PointerEvent) => {
      const px = (ev.clientX - rect.left) * scaleX
      if (px < padL) return
      // px → freq（反 log）
      const t = (px - padL) / (W - padL - padR)
      const freqHz = fMin * Math.pow(fMax / fMin, t)
      const scaleY = H / rect.height
      const py = (ev.clientY - rect.top) * scaleY
      const gain = dbMax - (py - padT) / (H - padT - padB) * (dbMax - dbMin)
      onDragGain(freqHz, gain)
    }
    const up = (ev: PointerEvent) => { svg.removeEventListener('pointermove', drag); svg.removeEventListener('pointerup', up); svg.releasePointerCapture(ev.pointerId) }
    svg.addEventListener('pointermove', drag)
    svg.addEventListener('pointerup', up)
    drag(e.nativeEvent)
  }

  return (
    <svg className="eq-curve-plot" viewBox={`0 0 ${W} ${H}`} onPointerDown={onPointerDown} style={{ width: '100%', height: 150, cursor: 'pointer' }}>
      {/* 网格 + 0dB 线 */}
      <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="rgba(138,162,173,0.25)" strokeDasharray="3 3" />
      {[100, 1000, 10000].map(f => (
        <g key={f}>
          <line x1={x(f)} y1={padT} x2={x(f)} y2={H - padB} stroke="rgba(138,162,173,0.12)" />
          <text x={x(f)} y={H - 4} fill="rgba(138,162,173,0.6)" fontSize="9" textAnchor="middle">{f >= 1000 ? `${f / 1000}k` : f}</text>
        </g>
      ))}
      {/* 总响应曲线 */}
      <path d={path} fill="none" stroke="#4ec9b0" strokeWidth="2" />
      {/* 各段拖点 */}
      {bands.map(b => (
        <circle key={b.id} cx={x(b.freq)} cy={y(b.gain)} r="5" fill="#e6c07b" stroke="#1a1f24" strokeWidth="1" />
      ))}
    </svg>
  )
}
```

> `React.PointerEvent`/`PointerEvent` 全局类型可用（renderer 用 React 18 + lib.dom）。

- [ ] **Step 6: 加 EQ drawer 新样式到 styles.css**

在 `src/renderer/src/styles.css` 末尾（文件最后）追加：

```css
/* R51.8: EQ drawer 新布局 — 模式切换 + 曲线图 + 段列表 */
.eq-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.eq-mode-switch {
  display: inline-flex;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  overflow: hidden;
}
.eq-mode-btn {
  padding: 4px 10px;
  background: transparent;
  border: none;
  color: rgba(220, 230, 235, 0.7);
  cursor: pointer;
  font-size: 12px;
}
.eq-mode-btn.active {
  background: rgba(78, 201, 176, 0.18);
  color: #4ec9b0;
}
.eq-preset-select {
  background: #1a2229;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #dce6eb;
  padding: 4px 8px;
  font-size: 12px;
  flex: 1;
  min-width: 120px;
}
.eq-preset-desc {
  font-size: 11px;
  color: rgba(138, 162, 173, 0.85);
  margin: 0 0 10px;
  line-height: 1.4;
}
.eq-curve-plot {
  background: #0f1418;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  margin-bottom: 12px;
}
.eq-param-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.eq-param-row {
  display: grid;
  grid-template-columns: 90px 1fr 1fr 1fr 24px;
  gap: 6px;
  align-items: center;
  font-size: 11px;
}
.eq-param-type {
  background: #1a2229;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: #dce6eb;
  padding: 2px 4px;
  font-size: 11px;
}
.eq-param-field {
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-size: 10px;
  color: rgba(138, 162, 173, 0.85);
}
.eq-param-field input[type="range"] {
  width: 100%;
}
.eq-param-field span {
  font-size: 9px;
}
.eq-add-band {
  margin-top: 6px;
}

/* R51.1: 顶部快按 transport cluster */
.audio-tools-bar {
  justify-content: space-between;
}
.audio-top-transport {
  display: flex;
  align-items: center;
  gap: 6px;
}
.audio-top-transport .audio-time {
  font-size: 12px;
  color: rgba(138, 162, 173, 0.85);
}
```

> 注意：`.audio-tools-bar` 改 `justify-content: space-between` 后，左侧无 transport cluster 时按钮会靠右——Task 9 加 transport cluster 后即平衡。本 Task 阶段 EQ drawer 是重点，`.audio-tools-bar` 的 justify 改动可放在 Task 9，这里先不冲突（保留即可，靠右不影响 EQ 测试）。

- [ ] **Step 7: typecheck + build**

Run: `yarn typecheck && yarn build`
Expected: exit 0。

- [ ] **Step 8: 人工验证（`yarn dev`）**

Run: `yarn dev`，进 audio view，加载一首歌，开 EQ drawer：
- Graphic 模式：10 滑块工作；曲线图显示；拖曲线图点 → 最近 ISO 频段滑块同步 + 听感变
- 切 Parametric：6 段列表显示；改 type/freq/Q/gain → 曲线图实时更新 + 听感变
- 选预设（Pop / Rock / HPF 40Hz 等）→ 曲线/滑块/段列表同步 + 说明文字显示
- 保存自定义 → 下拉出现「我的」分组；reload 后还在；删除自定义可用
- 切模式不中断播放、无爆音

按 Ctrl+C 退出。

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/components/AudioStudioView.tsx src/renderer/src/styles.css
git commit -m "[PRD-0002] feat: R51.2/R51.4/R51.7/R51.8 EQ drawer 双模式 + 频率响应曲线图 + 预设库 + 自定义

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: 顶部快按 transport cluster

**Files:**
- Modify: `src/renderer/src/components/AudioStudioView.tsx:1587-1604`（audio-tools-bar）、`src/renderer/src/styles.css`（顶部 transport 样式 Task 8 Step 6 已加）

- [ ] **Step 1: 在 audio-tools-bar 左侧加 transport cluster**

把 1587-1604 行 `<div className="audio-tools-bar">` 整块替换为：

```tsx
        <div className="audio-tools-bar">
          <div className="audio-top-transport">
            <button type="button" className="audio-btn-icon" title={t('audio.prev')} onClick={skipPrev}><SkipBack size={15} /></button>
            <button type="button" className="audio-btn-icon" title={isPlaying ? t('audio.pause') : t('audio.play')} onClick={togglePlay}>
              {isPlaying ? <Pause size={15} /> : <Play size={15} />}
            </button>
            <button type="button" className="audio-btn-icon" title={t('audio.next')} onClick={skipNext}><SkipForward size={15} /></button>
            <span className="audio-time">{formatTime(progress)} / {formatTime(duration)}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className={`audio-btn ${eqEnabled ? 'active' : ''}`}
              onClick={() => setEqExpanded(true)}
              title={t('audio.eq.title')}
            >
              {t('audio.eq.title')}
            </button>
            <button
              type="button"
              className="audio-btn"
              onClick={() => setGenExpanded(true)}
              title={t('audio.tab.generator')}
            >
              {t('audio.tab.generator')}
            </button>
          </div>
        </div>
```

- [ ] **Step 2: typecheck + build**

Run: `yarn typecheck && yarn build`
Expected: exit 0。

- [ ] **Step 3: 人工验证（`yarn dev`）**

Run: `yarn dev`，进 audio view：
- 顶部 transport cluster：上一首/播放暂停/下一首 + `time / duration` 文字工作
- 底部完整 audio-player-controls（进度条/音量/平衡/模式/歌词）仍可用
- 播放一首歌，顶部播放/暂停按钮图标切换正确

按 Ctrl+C 退出。

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/AudioStudioView.tsx
git commit -m "[PRD-0002] feat: R51.1 AudioStudio 顶部快按 transport cluster（保留底部完整控制）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: i18n 文案中英文

**Files:**
- Modify: `src/renderer/src/i18n/index.tsx`（en + zh 各加一批 key）

- [ ] **Step 1: 英文文案**

在 `src/renderer/src/i18n/index.tsx` 的英文 `audio.eq.reset`（475-478 行）后追加：

```ts
  'audio.eq.graphic': 'Graphic',
  'audio.eq.parametric': 'Parametric',
  'audio.eq.builtin': 'Built-in',
  'audio.eq.custom': 'My Presets',
  'audio.eq.savePreset': 'Save as preset',
  'audio.eq.deletePreset': 'Delete preset',
  'audio.eq.presetName': 'Preset name:',
  'audio.eq.freq': 'Freq',
  'audio.eq.gain': 'Gain',
  'audio.eq.addBand': '+ Add band',
  'audio.eq.deleteBand': 'Delete band',
  'audio.eq.lang': 'en',
  'audio.prev': 'Previous',
  'audio.next': 'Next',
  'audio.play': 'Play',
  'audio.pause': 'Pause',
```

- [ ] **Step 2: 中文文案**

在中文 `audio.eq.reset`（1072-1075 行）后追加：

```ts
  'audio.eq.graphic': '图形',
  'audio.eq.parametric': '参数',
  'audio.eq.builtin': '内置',
  'audio.eq.custom': '我的预设',
  'audio.eq.savePreset': '保存为预设',
  'audio.eq.deletePreset': '删除预设',
  'audio.eq.presetName': '预设名称：',
  'audio.eq.freq': '频率',
  'audio.eq.gain': '增益',
  'audio.eq.addBand': '+ 加段',
  'audio.eq.deleteBand': '删除段',
  'audio.eq.lang': 'zh',
  'audio.prev': '上一首',
  'audio.next': '下一首',
  'audio.play': '播放',
  'audio.pause': '暂停',
```

- [ ] **Step 3: typecheck + build + test**

Run: `yarn typecheck && yarn build && yarn test`
Expected: 全过。

- [ ] **Step 4: 人工验证（`yarn dev`）**

Run: `yarn dev`，切中/英文 UI，进 audio view EQ drawer：
- 模式切换、预设下拉分组、保存/删除、parametric 字段、顶部 transport tooltip 都有对应语言文案

按 Ctrl+C 退出。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/i18n/index.tsx
git commit -m "[PRD-0002] feat: R51.9 EQ/transport i18n 中英文文案

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: R51 自检 + 验收点勾选 + PRD 状态改 ✅

**Files:**
- Modify: `docs/prd/PRD-0002-rgbbox-project-catalog.md`（R51.10、R51.12）

- [ ] **Step 1: 全量回归**

Run: `yarn typecheck && yarn build && yarn test`
Expected: 全过。

- [ ] **Step 2: audio view 端到端人工验证（`yarn dev`）**

Run: `yarn dev`，加载一首歌播放，逐项核对 R51.10 7 个验收点：
- 切 graphic↔parametric 不中断、无爆音
- 拖滑块/段参数 → 曲线实时 + 听感实时
- 拖曲线点 → 滑块同步 + 听感变
- 加载每个预设 → 曲线/滑块同步、说明显示
- 保存自定义 → reload 后还在、可加载可删
- 顶部 transport：上一首/播放暂停/下一首 + 时间；底部完整控制仍可用

按 Ctrl+C 退出。

- [ ] **Step 3: PRD R51.10 验收点改 `[x]` + 附证据**

把 R51.10 的 7 个 `[ ]` 改 `[x]`，附命令输出/观察。

- [ ] **Step 4: PRD R51.12 状态改 ✅**

把 `**状态**：⏳ 待实施` 改 `**状态**：✅ 已实施（2026-07-06）`。

- [ ] **Step 5: Commit**

```bash
git add docs/prd/PRD-0002-rgbbox-project-catalog.md
git commit -m "[PRD-0002] docs: R51 自检通过 — AudioStudio transport + EQ 双模式验收点 ✅

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 自检（writing-plans self-review）

**1. Spec 覆盖**：
- 阶段 1：R50.1 侧栏 → Task 1；R50.2 黄金分割 → Task 1；R50.3 底部自适应 → Task 2；R50.4 采样面板 → Task 3；R50.5 验收 → Task 4。✅
- 阶段 2：R51.1 顶部 transport → Task 9；R51.2 数据模型 → Task 7（state）；R51.3 audio graph 动态化 → Task 7；R51.4 曲线图 → Task 8；R51.5 纯函数+单测 → Task 5；R51.6 预设库 → Task 6；R51.7 自定义 → Task 8；R51.8 drawer UI → Task 8；R51.9 i18n → Task 10；R51.10 验收 → Task 11。✅

**2. Placeholder 扫描**：无 TBD/TODO/"add appropriate"，所有 step 含完整代码或精确命令。✅

**3. 类型一致性**：`EqBand`、`EqMode`、`EqPreset`、`computeBiquadResponse`、`logFreqPoints`、`graphicGainsToBands`、`bandsToGraphicGains`、`EQ_GRAPHIC_FREQS`、`EQ_PRESETS` 在 Task 5/6 定义，Task 7/8 import 复用，签名一致。`eqEntryPointRef`/`eqExitPointRef` 在 Task 7 Step 3 声明、Step 2 使用。`handleCurveDrag` 用 `EQ_FREQS`（Task 7 Step 1 定义为 `EQ_GRAPHIC_FREQS` 别名）。✅

**4. 歧义**：Task 8 Step 4 用了 `t('audio.eq.lang')` 判断中英文——这是为预设名/说明选语言，已在 Task 10 加 `'audio.eq.lang': 'en'/'zh'`。`Date.now()`/`performance.now()` 仅在 UI handler 调用（非 module-load、非 workflow script），可用。✅

## 执行交接

Plan complete and saved to `docs/superpowers/plans/2026-07-06-ui-optimization.md`. Two execution options:

**1. Subagent-Driven (recommended)** - 每个 Task 派一个新 subagent，Task 间两段式 review，迭代快。

**2. Inline Execution** - 在本会话内用 executing-plans 批量执行，带 checkpoint review。

**选哪种？**