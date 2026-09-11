# R76 微信式就地标注器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用自研 `AnnotateOverlay`（微信式就地工具条）取代 R75.4/R75.5 的 filerobot 弹窗：截图确认后就地标注（矩形/椭圆/箭头/画笔/文字/马赛克/撤销重做/✓保存/复制/×），拍照恢复直接下载，复制走主进程原生剪贴板 IPC；移除 filerobot/react-konva/styled-components 依赖（PRD-0002 R76）。

**Architecture:** 标注坐标全部使用**图像原生坐标系**（指针事件经视图矩形映射进图内），视图渲染与保存导出共用一个 `renderAnnotations(ctx, shapes, scale)` 绘制函数——视图 scale=显示比例，导出 scale=1。形状模型/命中/缩放/撤销全是 `annotationModel.ts` 纯函数（单测友好，延续 engine 纯 TS 文化）。马赛克 = 预像素化位图（1/16 采样）沿笔画路径 clip 后贴图。

**Tech Stack:** React 19 + TS + canvas 2D；无新增 npm 依赖（只移除）。

## Global Constraints

- 提交标题 `[PRD-0002] <type>: <subject>` + `Co-Authored-By: Claude Code <noreply@anthropic.com>`；只 `git add` 本任务列出的文件。
- 命令只用 `yarn typecheck` / `yarn build` / `yarn test` / `yarn vitest run <path>`；DOM 测试文件首行 `// @vitest-environment happy-dom`。
- 无水印铁律（R75.2）：标注/导出只画用户内容，不叠加任何 logo/文字。
- 不动：R75.1 缩放、录制/裁剪管线、`media://`、R70–R72 已修项、`package.json` scripts。
- i18n：`en` 与 `zh` 两 map 同步加 key（`video.annotate.*`）。
- 删除依赖放最后（Task 5），保证中间状态可编译。

---

### Task 1: annotationModel.ts 纯函数模型（TDD）

**Files:**
- Create: `src/renderer/src/components/video/annotationModel.ts`
- Test: `tests/renderer/components/annotationModel.test.ts`

**Interfaces（Produces，Task 3 依赖）:**

```ts
export type ShapeKind = 'rect' | 'ellipse' | 'arrow' | 'pen' | 'text' | 'mosaic'
export interface Shape {
  id: string
  kind: ShapeKind
  // bbox（rect/ellipse/text 用；arrow/pen/mosaic 由此派生缓存或动态计算）
  x: number; y: number; w: number; h: number
  color: string
  width: number               // 线宽 / 字号
  // 专有字段
  x1?: number; y1?: number; x2?: number; y2?: number   // arrow 两端
  points?: Array<{ x: number; y: number }>             // pen/mosaic 笔画
  text?: string                                        // text 内容
}
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'start' | 'end'
export function shapeBBox(s: Shape): Rect              // 动态 bbox（arrow 由端点、pen/mosaic 由 points 包围盒）
export function handlesFor(s: Shape): Handle[]         // bbox 类 8 个；arrow ['start','end']；pen/mosaic/text []
export function makeShape(kind: ShapeKind, seed: Partial<Shape>): Shape   // 补默认 id/color/width
export function hitTest(shapes: Shape[], p: Pt): Shape | null            // 顶层优先
export function moveShape(s: Shape, dx: number, dy: number): Shape       // 深拷贝后平移（含 points/端点）
export function resizeShape(s: Shape, handle: Handle, p: Pt): Shape      // bbox 手柄缩放 / arrow 端点拖动；min 8
export interface History { past: Shape[][]; present: Shape[]; future: Shape[][] }
export const emptyHistory: History
export function commit(h: History, shapes: Shape[]): History             // 推快照
export function undo(h: History): History
export function redo(h: History): History
export function canUndo(h: History): boolean
export function canRedo(h: History): boolean
export function distToSegment(p: Pt, a: Pt, b: Pt): number               // arrow 命中用（导出供测试）
```

- [ ] **Step 1: 失败测试**（`tests/renderer/components/annotationModel.test.ts`）

```ts
import { describe, it, expect } from 'vitest'
import {
  makeShape, shapeBBox, handlesFor, hitTest, moveShape, resizeShape,
  commit, undo, redo, canUndo, canRedo, emptyHistory, distToSegment,
} from '../../../src/renderer/src/components/video/annotationModel'

describe('annotationModel', () => {
  it('makeShape fills defaults and keeps seed fields', () => {
    const s = makeShape('rect', { x: 5, y: 6, w: 10, h: 20 })
    expect(s.id).toBeTruthy(); expect(s.kind).toBe('rect')
    expect(s.x).toBe(5); expect(s.w).toBe(10); expect(s.h).toBe(20)
    expect(typeof s.color).toBe('string'); expect(s.width).toBeGreaterThan(0)
  })

  it('shapeBBox derives from arrow endpoints and pen points', () => {
    const a = makeShape('arrow', { x1: 10, y1: 20, x2: 30, y2: 60 } as never)
    expect(shapeBBox(a)).toEqual({ x: 10, y: 20, w: 20, h: 40 })
    const p = makeShape('pen', { points: [{ x: 0, y: 0 }, { x: 50, y: 24 }] } as never)
    expect(shapeBBox(p)).toEqual({ x: 0, y: 0, w: 50, h: 24 })
  })

  it('handlesFor: bbox shapes 8, arrow endpoints, pen/mosaic/text none', () => {
    expect(handlesFor(makeShape('rect', {})).length).toBe(8)
    expect(handlesFor(makeShape('arrow', {}))).toEqual(['start', 'end'])
    expect(handlesFor(makeShape('pen', {}))).toEqual([])
    expect(handlesFor(makeShape('text', {}))).toEqual([])
  })

  it('hitTest prefers topmost and hits arrow within tolerance', () => {
    const bottom = makeShape('rect', { x: 0, y: 0, w: 100, h: 100 })
    const top = makeShape('rect', { x: 50, y: 50, w: 60, h: 60 })
    expect(hitTest([bottom, top], { x: 60, y: 60 })?.id).toBe(top.id)
    expect(hitTest([bottom, top], { x: 10, y: 10 })?.id).toBe(bottom.id)
    expect(hitTest([bottom, top], { x: 300, y: 300 })).toBeNull()
    const arrow = makeShape('arrow', { x1: 0, y1: 0, x2: 100, y2: 0 } as never)
    expect(hitTest([arrow], { x: 50, y: 6 })?.id).toBe(arrow.id)
    expect(hitTest([arrow], { x: 50, y: 20 })).toBeNull()
  })

  it('moveShape translates bbox, endpoints and points', () => {
    const a = moveShape(makeShape('arrow', { x1: 0, y1: 0, x2: 10, y2: 10 } as never), 5, 5)
    expect(a.x1).toBe(5); expect(a.y2).toBe(15)
    const p = moveShape(makeShape('pen', { points: [{ x: 1, y: 2 }] } as never), 1, 1)
    expect(p.points![0]).toEqual({ x: 2, y: 3 })
    const r = moveShape(makeShape('rect', { x: 0, y: 0, w: 5, h: 5 }), 2, 3)
    expect(r.x).toBe(2); expect(r.y).toBe(3)
  })

  it('resizeShape: bbox corner + arrow endpoint, min size 8', () => {
    const r = resizeShape(makeShape('rect', { x: 0, y: 0, w: 100, h: 100 }), 'se', { x: 40, y: 30 })
    expect(r).toMatchObject({ x: 0, y: 0, w: 40, h: 30 })
    const a = resizeShape(makeShape('arrow', { x1: 0, y1: 0, x2: 100, y2: 100 } as never), 'start', { x: 10, y: 20 })
    expect(a).toMatchObject({ x1: 10, y1: 20, x2: 100, y2: 100 })
    const tiny = resizeShape(makeShape('rect', { x: 0, y: 0, w: 100, h: 100 }), 'se', { x: 3, y: 3 })
    expect(tiny.w).toBeGreaterThanOrEqual(8); expect(tiny.h).toBeGreaterThanOrEqual(8)
  })

  it('history commit/undo/redo', () => {
    const s1 = [makeShape('rect', {})]
    const s2 = [makeShape('rect', {}), makeShape('ellipse', {})]
    let h = commit(emptyHistory, s1)
    expect(canUndo(h)).toBe(false)      // 初始帧不可撤销
    h = commit(h, s2)
    expect(canUndo(h)).toBe(true)
    h = undo(h)
    expect(h.present.length).toBe(1)
    expect(canRedo(h)).toBe(true)
    h = redo(h)
    expect(h.present.length).toBe(2)
  })

  it('distToSegment perpendicular case', () => {
    expect(distToSegment({ x: 5, y: 10 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(10)
    expect(distToSegment({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(0)
  })
})
```

- [ ] **Step 2:** `yarn vitest run tests/renderer/components/annotationModel.test.ts` → FAIL（模块不存在）
- [ ] **Step 3:** 实现 `annotationModel.ts`（完整代码见下）

```ts
/**
 * annotationModel — 就地标注器的形状模型与历史栈（PRD R76.1）。
 * 全部纯函数、无 DOM；坐标一律为图像原生像素空间。
 */
import type { Pt, Rect } from './previewTransform'

export type ShapeKind = 'rect' | 'ellipse' | 'arrow' | 'pen' | 'text' | 'mosaic'

export interface Shape {
  id: string
  kind: ShapeKind
  x: number; y: number; w: number; h: number   // bbox（arrow/pen/mosaic 为派生缓存，绘制不依赖它）
  color: string
  width: number
  x1?: number; y1?: number; x2?: number; y2?: number
  points?: Pt[]
  text?: string
}

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'start' | 'end'

const BBOX_HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const MIN_SIZE = 8
let idSeed = 0

export function makeShape(kind: ShapeKind, seed: Partial<Shape>): Shape {
  return {
    id: seed.id ?? `sh-${Date.now().toString(36)}-${idSeed++}`,
    kind, x: 0, y: 0, w: 0, h: 0,
    color: seed.color ?? '#46c6a8',
    width: seed.width ?? 3,
    ...seed,
  }
}

export function shapeBBox(s: Shape): Rect {
  if (s.kind === 'arrow') {
    const x1 = s.x1 ?? 0, y1 = s.y1 ?? 0, x2 = s.x2 ?? 0, y2 = s.y2 ?? 0
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) }
  }
  if (s.kind === 'pen' || s.kind === 'mosaic') {
    const pts = s.points ?? []
    if (pts.length === 0) return { x: s.x, y: s.y, w: 0, h: 0 }
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
  }
  return { x: s.x, y: s.y, w: s.w, h: s.h }
}

export function handlesFor(s: Shape): Handle[] {
  if (s.kind === 'arrow') return ['start', 'end']
  if (s.kind === 'pen' || s.kind === 'mosaic' || s.kind === 'text') return []
  return BBOX_HANDLES
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  const proj = { x: a.x + t * dx, y: a.y + t * dy }
  return Math.hypot(p.x - proj.x, p.y - proj.y)
}

/** 命中容差：线条类按线宽 + 4px，bbox 类直接框内判定。 */
function hitShape(s: Shape, p: Pt, tol: number): boolean {
  if (s.kind === 'arrow') {
    return distToSegment(p, { x: s.x1 ?? 0, y: s.y1 ?? 0 }, { x: s.x2 ?? 0, y: s.y2 ?? 0 }) <= s.width + 6
  }
  if (s.kind === 'pen') {
    const pts = s.points ?? []
    for (let i = 1; i < pts.length; i++) if (distToSegment(p, pts[i - 1], pts[i]) <= s.width + 6) return true
    return pts.length === 1 && Math.hypot(p.x - pts[0].x, p.y - pts[0].y) <= s.width + 6
  }
  if (s.kind === 'mosaic') {
    const b = shapeBBox(s)
    return p.x >= b.x - tol && p.x <= b.x + b.w + tol && p.y >= b.y - tol && p.y <= b.y + b.h + tol
  }
  const b = shapeBBox(s)
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h
}

export function hitTest(shapes: Shape[], p: Pt): Shape | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    if (hitShape(shapes[i], p, 4)) return shapes[i]
  }
  return null
}

export function moveShape(s: Shape, dx: number, dy: number): Shape {
  const n: Shape = { ...s, x: s.x + dx, y: s.y + dy }
  if (n.x1 !== undefined) { n.x1 += dx; n.y1 = (n.y1 ?? 0) + dx * 0 + dy }
  if (n.y1 !== undefined) n.y1 += 0
  // 上面两行防误写，直接统一处理：
  if (s.x1 !== undefined) n.x1 = s.x1 + dx
  if (s.y1 !== undefined) n.y1 = s.y1 + dy
  if (s.x2 !== undefined) n.x2 = s.x2 + dx
  if (s.y2 !== undefined) n.y2 = s.y2 + dy
  if (s.points) n.points = s.points.map(p => ({ x: p.x + dx, y: p.y + dy }))
  return n
}

export function resizeShape(s: Shape, handle: Handle, p: Pt): Shape {
  if (s.kind === 'arrow') {
    const n = { ...s }
    if (handle === 'start') { n.x1 = p.x; n.y1 = p.y }
    else { n.x2 = p.x; n.y2 = p.y }
    return n
  }
  if (s.kind === 'pen' || s.kind === 'mosaic' || s.kind === 'text') return s
  let { x, y, w, h } = s
  const right = x + w, bottom = y + h
  if (handle.includes('w')) { x = Math.min(p.x, right - MIN_SIZE); w = right - x }
  if (handle.includes('e')) { w = Math.max(MIN_SIZE, p.x - x) }
  if (handle.includes('n')) { y = Math.min(p.y, bottom - MIN_SIZE); h = bottom - y }
  if (handle.includes('s')) { h = Math.max(MIN_SIZE, p.y - y) }
  return { ...s, x, y, w, h }
}

// ── 历史栈（快照式：shapes 数组小，快照成本可忽略） ──
export interface History { past: Shape[][]; present: Shape[]; future: Shape[][] }
export const emptyHistory: History = { past: [], present: [], future: [] }

export function commit(h: History, shapes: Shape[]): History {
  if (h.present.length === 0 && h.past.length === 0) return { past: [], present: shapes, future: [] }
  return { past: [...h.past.slice(-49), h.present], present: shapes, future: [] }
}
export function undo(h: History): History {
  if (h.past.length === 0) return h
  const prev = h.past[h.past.length - 1]
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future].slice(0, 50) }
}
export function redo(h: History): History {
  if (h.future.length === 0) return h
  const [next, ...rest] = h.future
  return { past: [...h.past, h.present], present: next, future: rest }
}
export function canUndo(h: History): boolean { return h.past.length > 0 }
export function canRedo(h: History): boolean { return h.future.length > 0 }
```

（注：`moveShape` 里 arrow/pen/text 分支按上面"统一处理"段为准——id/其余字段展开保留。实现时把示意行清理成一段连贯代码。）

- [ ] **Step 4:** 跑测试 → 全绿（8 个用例）
- [ ] **Step 5:** `yarn typecheck` → 通过
- [ ] **Step 6:** Commit `[PRD-0002] feat: R76.1 annotation shape model + history (pure functions)`

---

### Task 2: 剪贴板 IPC（主进程原生写图）

**Files:**
- Modify: `src/shared/ipc.ts`（+通道名）
- Modify: `src/main/index.ts`（handler）
- Modify: `src/preload/index.ts`（白名单 `clipboardWriteImage`）
- Modify: `tests/renderer/_helpers.tsx`（+mock）

**Interfaces（Produces）:** `window.rgbbox.clipboardWriteImage(dataUrl: string): Promise<boolean>`；通道名 `rgbbox:clipboard:write-image`（沿用 `src/shared/ipc.ts` 的 `as const` 模式，key 命名贴着现有 shutdown/screensaver 组）。

- [ ] **Step 1:** 先看 `src/shared/ipc.ts` 现有 key 命名与 `src/main/index.ts` shutdown handler 的写法（含 `nativeImage`/`clipboard` import 位置——顶部 Electron import 若无 `clipboard` 需补）。
- [ ] **Step 2:** 三端接线 + `_helpers.tsx` 加 `clipboardWriteImage: vi.fn().mockResolvedValue(true)`。
- [ ] **Step 3:** handler 实现：`ipcMain.handle(ipcChannels.clipboardWriteImage, (_e, dataUrl: unknown) => { if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return false; clipboard.writeImage(nativeImage.createFromDataURL(dataUrl)); return true })`（输入校验，非法输入 false 不抛）。
- [ ] **Step 4:** `yarn typecheck` + `yarn vitest run tests/main` → 无回归
- [ ] **Step 5:** Commit `[PRD-0002] feat: R76.4 native clipboard write-image IPC (main + preload)`

---

### Task 3: AnnotateOverlay 就地标注器（TDD）

**Files:**
- Create: `src/renderer/src/components/video/AnnotateOverlay.tsx`
- Modify: `src/renderer/src/i18n/index.tsx`（`video.annotate.*`）
- Modify: `src/renderer/src/styles.css`（`.video-annotate-*`）
- Test: `tests/renderer/components/AnnotateOverlay.test.tsx`

**Interfaces:**
- Consumes: Task 1 模型；Task 2 `clipboardWriteImage`（经 props 注入回调，组件不直接调 IPC——可测性）。
- Produces:

```ts
export interface AnnotateOverlayProps {
  source: HTMLCanvasElement | string   // 冻结帧（snip 裁剪结果）或照片 dataURL
  onClose: () => void                  // × 放弃
  onSave: (dataUrl: string) => void    // ✓ 保存（View 负责下载）
  onCopy: (dataUrl: string) => void    // 复制（View 走 IPC）
}
```

组件行为规格：
- 布局：全 overlay（`position:absolute; inset:0; z-index:20; background: rgba(0,0,0,0.6)`）盖住 `.video-stage`；图片按 contain 居中（`previewTransform.containRect` 复用），两层 canvas（底图 + 标注）叠在同 rect；底部中央工具条。
- 坐标：指针 → 图片原生坐标（`(p - viewRect.origin) / viewScale`）；所有 shape 存图内坐标。
- 工具条（左→右）：选择（MousePointer2）/ 矩形（Square）/ 椭圆（Circle）/ 箭头（ArrowUpRight）/ 画笔（Pencil）/ 文字（Type）/ 马赛克（Grid3x3）│ 撤销（Undo2）/ 重做（Redo2）│ 8 色色板（小圆点按钮）/ 3 档粗细（3 个圆点按钮）│ 删除选中（Trash2）… ✓ 保存（Check，主色）/ 复制（Copy）/ ×（X）。
- 交互：绘制工具按下拖拽即建形（pen 连续 push 点；text 单击弹 `<textarea>`，Enter/失焦提交）；选择工具 hitTest 选中、拖体移动、拖手柄 resize（手柄命中区 16px 屏幕像素）；Delete 删除；Ctrl+Z/Y 撤销重做；ESC = onClose（等同放弃）。
- 渲染函数 `renderAnnotations(ctx, shapes, scale, opts?: {selectedId?})` 导出：rect/ellipse 描边、arrow 线+三角头（头长 = width*3）、pen 折线、text `fillText`（font = `${width*8}px inherit`）、mosaic 由组件先备好像素化位图传入 `opts.mosaicTile`（ctx.save → clip 笔画路径圆序列 → drawImage(像素化图) → restore）；选中项画虚线框 + 手柄方块。
- 导出：`toDataUrl()` = 新 canvas（自然尺寸）→ drawImage(底图) → renderAnnotations(scale=1) → `toDataURL('image/png')`。✓/复制按钮调它。**无水印（R75.2）**。
- i18n keys（en/zh 同步）：`video.annotate.title`（标注）、`video.annotate.tool.select/rect/ellipse/arrow/pen/text/mosaic`、`video.annotate.undo/redo/delete/save/copy/close`、`video.annotate.saved/copied/copyFail`。
- CSS：`.video-annotate-overlay/-canvas/-toolbar/-btn(沿用 .video-zoom-btn 风格)/-swatch/-stroke/-text-input/-hint`；`.video-stage { position: relative }` 补一行。

- [ ] **Step 1:** 失败测试 `tests/renderer/components/AnnotateOverlay.test.tsx`：

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { AnnotateOverlay } from '../../../src/renderer/src/components/video/AnnotateOverlay'
import { setupRendererMocks } from '../_helpers'

const png = 'data:image/png;base64,iVBORw0KGgo='

beforeEach(() => { setupRendererMocks(); cleanup() })

describe('AnnotateOverlay', () => {
  it('renders toolbar with all tool buttons', () => {
    const { container } = render(<AnnotateOverlay source={png} onClose={() => {}} onSave={() => {}} onCopy={() => {}} />)
    expect(container.querySelector('.video-annotate-overlay')).toBeTruthy()
    const btns = container.querySelectorAll('.video-annotate-tool')
    expect(btns.length).toBe(7)  // select/rect/ellipse/arrow/pen/text/mosaic
    expect(container.querySelectorAll('.video-annotate-swatch').length).toBe(8)
  })

  it('save button exports PNG via onSave', () => {
    const onSave = vi.fn()
    const { container } = render(<AnnotateOverlay source={png} onClose={() => {}} onSave={onSave} onCopy={() => {}} />)
    fireEvent.click(container.querySelector('.video-annotate-save')!)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0]).toMatch(/^data:image\/png;base64,/)
  })

  it('copy button calls onCopy with PNG', () => {
    const onCopy = vi.fn()
    const { container } = render(<AnnotateOverlay source={png} onClose={() => {}} onSave={() => {}} onCopy={onCopy} />)
    fireEvent.click(container.querySelector('.video-annotate-copy')!)
    expect(onCopy).toHaveBeenCalledTimes(1)
  })

  it('close button calls onClose; Escape key too', () => {
    const onClose = vi.fn()
    const { container } = render(<AnnotateOverlay source={png} onClose={onClose} onSave={() => {}} onCopy={() => {}} />)
    fireEvent.click(container.querySelector('.video-annotate-close')!)
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('tool buttons switch active tool', () => {
    const { container } = render(<AnnotateOverlay source={png} onClose={() => {}} onSave={() => {}} onCopy={() => {}} />)
    const tools = container.querySelectorAll('.video-annotate-tool')
    fireEvent.click(tools[1])  // rect
    expect(tools[1].className).toContain('active')
    expect(tools[0].className).not.toContain('active')
  })
})
```

（happy-dom 的 canvas 2D context 可能返回 null——组件绘制全部走守卫 `?.`，测试只验证 DOM/回调层面。）

- [ ] **Step 2:** 跑测试 FAIL → 实现组件 + i18n + CSS → 全绿（5 用例）
- [ ] **Step 3:** `yarn typecheck` → Commit `[PRD-0002] feat: R76.2 AnnotateOverlay in-place WeChat-style annotator`

---

### Task 4: VideoStudioView 流程重做 + 框选打磨

**Files:**
- Modify: `src/renderer/src/components/VideoStudioView.tsx`
- Modify: `src/renderer/src/components/video/RegionSnipOverlay.tsx`
- Modify: `src/renderer/src/i18n/index.tsx`（`video.snip.hint` 调整 + `video.lastShotEdit`）
- Modify: `src/renderer/src/styles.css`（`.video-stage{position:relative}`、`.video-snip-hintbar`、`.video-last-shot-edit`）

改动清单：
1. **拍照恢复直接下载**：`capturePhoto` 末尾 `setEditorSource(url)` 改回 `downloadPng(url, 'rgbbox-photo')`（保留 `setLastShot`）。
2. **snip 确认就地标注**：`finishSnip` 裁剪后 `setAnnotateSource(outCanvas)`（不下载、不弹窗）；`cancelSnip` 照旧。新增状态 `const [annotateSource, setAnnotateSource] = useState<HTMLCanvasElement | string | null>(null)`（取代 `editorSource`）。
3. **删除 SnapshotEditorModal/editorZh import 与渲染**，换成（`.video-stage` 内、transport 之后）：

```tsx
{annotateSource !== null && (
  <AnnotateOverlay
    source={annotateSource}
    onClose={() => setAnnotateSource(null)}
    onSave={(url) => { downloadPng(url, 'rgbbox-annotated'); setAnnotateSource(null) }}
    onCopy={(url) => {
      window.rgbbox.clipboardWriteImage(url)
        .then((ok) => editorToast(t(ok ? 'video.annotate.copied' : 'video.annotate.copyFail')))
        .catch(() => editorToast(t('video.annotate.copyFail')))
    }}
  />
)}
```

4. **缩略图编辑按钮**：缩略图旁加"编辑"按钮（Pencil 图标，`video.lastShotEdit`：'编辑'/'Edit'）→ `setAnnotateSource(lastShot)`；原 `<img>` 直接点击不再触发（去掉上一版的点击进编辑器行为）。
5. **框选打磨（RegionSnipOverlay）**：`HANDLE_HIT_PX` 12→16；`onDoubleClick` 仅当选区存在且双击点在选区内才 `confirm()`，否则视为新建（清空选区）；底部提示条 `<div className="video-snip-hintbar">{t('video.snip.hint')}</div>`（常显）；提示文案改 `拖拽框选 · Enter 保存 · Esc 取消 / Drag · Enter save · Esc cancel`。
6. 编辑器相关的 toast 文案 key（`video.editor.*`）保留（复制反馈沿用），`video.editor.title/loading/error/hint/close` 标记废弃但**不删**（避免翻译 key 清理风险），新增 `video.annotate.*`。
7. 快捷键 `S` 不变；框选激活时 overlay 的 capture keydown 已优先。

- [ ] **Step 1:** 实施上述改动（`git diff` 自查无 SnapshotEditorModal 残留引用）
- [ ] **Step 2:** `yarn vitest run tests/renderer/components` → 全绿（SnapshotEditorModal.test.tsx 已在 Task 5 删除前的过渡期应先删除该测试文件——本步一并删除）
- [ ] **Step 3:** `yarn typecheck` → Commit `[PRD-0002] feat: R76.3/R76.5 in-place snip-to-annotate flow + snip UX polish`

---

### Task 5: 移除依赖 + 删文件 + 全量验证 + PRD 收尾

**Files:**
- Delete: `src/renderer/src/components/video/SnapshotEditorModal.tsx`、`src/renderer/src/components/video/editorZh.ts`、`tests/renderer/components/SnapshotEditorModal.test.tsx`
- Modify: `package.json` / `yarn.lock`（`yarn remove react-filerobot-image-editor react-konva styled-components`）
- Modify: `docs/prd/PRD-0002-rgbbox-project-catalog.md`（R76.9 勾选 + R76.10 ✅ + §9 两行）

- [ ] **Step 1:** 删 3 个文件（Task 4 已确保无引用）
- [ ] **Step 2:** `yarn remove react-filerobot-image-editor react-konva styled-components`
- [ ] **Step 3:** `yarn typecheck && yarn test && yarn build`——记录数字；build 产物确认 filerobot chunk 消失（`out/renderer/assets` 只剩少量 chunk）
- [ ] **Step 4:** PRD R76.9 勾选（自动化项 + 证据数字；手动项留 `[ ]` pending 用户）、R76.10 → ✅、§9 变更记录追加两行（追加条款 + 实施）
- [ ] **Step 5:** Commit `[PRD-0002] docs: R76 self-check evidence` ；向用户交付报告（功能清单 + 实机验证清单 + 依赖瘦身说明）

## Self-Review

1. **覆盖**：R76.1→Task1、R76.2→Task3、R76.3→Task4、R76.4→Task2、R76.5→Task4.5、R76.6→Task5、R76.9→Task5。无缺口。
2. **占位符**：无 TBD；模型与测试代码完整，组件给了行为规格 + 完整测试代码 + 接线代码。
3. **类型一致**：`Shape`/`History`/`Handle` 与 Task 3 用法一致；`AnnotateOverlayProps` 与 Task 4 接线一致；IPC 名与 preload 白名单一致。
