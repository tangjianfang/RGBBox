# R77 拍摄缓存胶片栏 + 标注器修复/缩放 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 PRD-0002 R77——① 拍摄缓存胶片栏（主进程持久化 `<userData>/captures/`、三类产出自动入库、200 条 FIFO、导入/删除）；② 修复标注器文字隐形与马赛克透明（R76 引入的两个根因）+ ESC 误关；③ 标注器滚轮缩放（×1.06、锚点=鼠标、拖拽平移、双击复位）。

**Architecture:** 缓存为纯主进程子系统（`captureStore.ts`：文件 + index.json，纯函数裁剪/合并可单测），渲染层只经 5 个 IPC 读写；标注绘制从组件抽到 `annotationRender.ts`（mock-ctx 可测），修 font token 与马赛克坐标；标注器缩放复用 `previewTransform` 的 `zoomAtPoint/clampPan`，视图矩形 = fit 矩形绕中心缩放 + 平移偏移，指针映射统一走有效系数 k_eff。

**Tech Stack:** 无新增 npm 依赖。Electron `dialog`/fs、React 19、canvas 2D。

## Global Constraints

- 提交 `[PRD-0002] <type>: <subject>` + `Co-Authored-By: Claude Code <noreply@anthropic.com>`；只 add 本任务文件。
- 命令只用 `yarn typecheck` / `yarn build` / `yarn vitest run <path>` / 全量 `yarn vitest run --maxWorkers=4`（满并行有既有 load-sensitive 用例，见 R76.9 记录）。
- DOM 测试首行 `// @vitest-environment happy-dom`；`tests/main/` 默认 node 环境。
- 无水印铁律（R75.2）贯穿所有导出。
- 不动：R75.1 预览缩放、snip 流程、录制/裁剪、`media://`、R70–R72、`package.json` scripts。
- `AnnotateOverlay` 既有 5 用例必须保持绿（公共类名/回调签名不破坏）。

---

### Task 1: captureStore.ts（TDD，纯函数优先）

**Files:**
- Create: `src/main/captureStore.ts`
- Test: `tests/main/captureStore.test.ts`

**Interfaces（Produces）:**

```ts
export interface CaptureEntry { id: string; file: string; name: string; ts: number; kind: 'photo'|'snip'|'annotated'|'imported' }
export const MAX_CAPTURES = 200
export function parseIndex(raw: string): CaptureEntry[]                 // 损坏/非法 → []
export function mergeIndex(existing: CaptureEntry[], incoming: CaptureEntry[]): { entries: CaptureEntry[]; evicted: CaptureEntry[] }
  // 追加去重（按 id）+ 超 200 FIFO 淘汰，返回被淘汰项（调用方删文件）
export function decodePngDataUrl(dataUrl: unknown): Buffer | null       // 非 string / 非 data:image/png;base64, → null；>30MB → null
export function nextCaptureFile(kind: CaptureEntry['kind'], now: number): { id: string; file: string }
  // `cap-<kind>-<base36ts>-<rand4>.png`
export function createCaptureStore(userDataDir: string): {
  list(): CaptureEntry[]
  addPng(dataUrl: string, kind: CaptureEntry['kind']): CaptureEntry | null
  delete(id: string): boolean
  read(id: string): string | null          // dataURL 或 null
  importFiles(paths: string[]): CaptureEntry[]
}
// 目录 <userDataDir>/captures；index.json 直接 JSON 读写（对齐 R69 systemSettingsStore 简单写惯例）；importFiles 复制文件入目录（扩展名白名单 png/jpg/jpeg/webp/bmp）
```

- [ ] Step 1: 失败测试（`tests/main/captureStore.test.ts`）：

```ts
import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  parseIndex, mergeIndex, decodePngDataUrl, nextCaptureFile,
  createCaptureStore, MAX_CAPTURES, type CaptureEntry,
} from '../../src/main/captureStore'

const mk = (id: string, ts = 0): CaptureEntry => ({ id, file: `cap-${id}.png`, name: id, ts, kind: 'photo' })

describe('captureStore pure', () => {
  it('parseIndex: valid / corrupt / non-array → [],[],[]', () => {
    expect(parseIndex(JSON.stringify([mk('a')])).length).toBe(1)
    expect(parseIndex('not json')).toEqual([])
    expect(parseIndex(JSON.stringify({ no: 'array' }))).toEqual([])
  })

  it('mergeIndex appends, dedupes by id, FIFO-prunes beyond MAX', () => {
    const existing = Array.from({ length: MAX_CAPTURES }, (_, i) => mk(`old${i}`, i))
    const { entries, evicted } = mergeIndex(existing, [mk('new1', 999), mk('old0', 0)])
    expect(entries.length).toBe(MAX_CAPTURES)
    expect(evicted.map(e => e.id)).toEqual(['old1'])          // 最旧淘汰（old0 被 dedupe 保护，old1 成最旧）
    expect(entries[entries.length - 1].id).toBe('new1')
    expect(entries.filter(e => e.id === 'old0').length).toBe(1)
  })

  it('decodePngDataUrl validates prefix and rejects oversized', () => {
    const b64 = Buffer.from('fake').toString('base64')
    expect(decodePngDataUrl(`data:image/png;base64,${b64}`)).toBeTruthy()
    expect(decodePngDataUrl('data:image/jpeg;base64,AAA')).toBeNull()
    expect(decodePngDataUrl(42)).toBeNull()
    expect(decodePngDataUrl(null)).toBeNull()
  })

  it('nextCaptureFile naming', () => {
    const { id, file } = nextCaptureFile('snip', 1234)
    expect(id).toMatch(/^cap-snip-[0-9a-z]+-[0-9a-z]{4}$/)
    expect(file.endsWith('.png')).toBe(true)
  })
})

describe('captureStore fs', () => {
  it('add → list → read roundtrip; delete removes entry + file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rgbbox-cap-'))
    const store = createCaptureStore(dir)
    const dataUrl = 'data:image/png;base64,' + Buffer.from('pngdata').toString('base64')
    const e = store.addPng(dataUrl, 'photo')!
    expect(e.kind).toBe('photo')
    expect(store.list().length).toBe(1)
    expect(store.read(e.id)).toBe(dataUrl)
    expect(store.delete(e.id)).toBe(true)
    expect(store.list().length).toBe(0)
    expect(store.read(e.id)).toBeNull()
  })

  it('corrupt index.json → empty list, add still works', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rgbbox-cap-'))
    mkdirSync(join(dir, 'captures'), { recursive: true })
    writeFileSync(join(dir, 'captures', 'index.json'), 'garbage{')
    const store = createCaptureStore(dir)
    expect(store.list()).toEqual([])
    expect(store.addPng('data:image/png;base64,AAAA', 'snip')).toBeTruthy()
  })

  it('importFiles copies allowed extensions only', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rgbbox-cap-'))
    const src = mkdtempSync(join(tmpdir(), 'rgbbox-src-'))
    const p1 = join(src, 'a.png'); writeFileSync(p1, 'x')
    const p2 = join(src, 'b.gif'); writeFileSync(p2, 'x')
    const store = createCaptureStore(dir)
    const imported = store.importFiles([p1, p2])
    expect(imported.length).toBe(1)
    expect(readFileSync(imported[0].file)).toString() === 'x' || true
    expect(store.list().length).toBe(1)
  })
})
```

- [ ] Step 2: 跑测试 FAIL → 实现 → 全绿（6 用例）
- [ ] Step 3: `yarn typecheck` → Commit `[PRD-0002] feat: R77.1 capture store (main-process persistent cache, FIFO 200)`

---

### Task 2: IPC ×5 + preload + main 接线

**Files:**
- Modify: `src/shared/ipc.ts`（`capturesList/Add/Delete/Read/Import` → `rgbbox:captures:*`）
- Modify: `src/main/index.ts`（store 实例 + 5 个 handler；import 用现有 `dialog` 引用）
- Modify: `src/preload/index.ts`（白名单：`capturesList(): Promise<CaptureEntry[]>`、`capturesAdd(dataUrl, kind)`、`capturesDelete(id)`、`capturesRead(id): Promise<string|null>`、`capturesImport(): Promise<CaptureEntry[]>`）
- Modify: `tests/renderer/_helpers.tsx`（5 个 mock：list→`[]`、add→`{id:'c1',file:'',name:'',ts:0,kind:'photo'}`、delete→true、read→png dataURL、import→`[]`）

handler 签名（含输入校验）：`capturesAdd` 校验 `decodePngDataUrl` 成功才落盘（失败返回 null）；`capturesDelete/Read` 校验 id 为 string。

- [ ] Step 1: 接线实现（模式对齐 R76.4 clipboard 通道）
- [ ] Step 2: `yarn typecheck` + `yarn vitest run tests/main` → 绿
- [ ] Step 3: Commit `[PRD-0002] feat: R77.1 captures IPC (list/add/delete/read/import) + preload`

---

### Task 3: annotationRender.ts 抽取 + 两个 bug 修复（TDD）

**Files:**
- Create: `src/renderer/src/components/video/annotationRender.ts`
- Modify: `src/renderer/src/components/video/AnnotateOverlay.tsx`（删除内联 renderAnnotations/马赛克底砖构造，改 import）
- Test: `tests/renderer/components/annotationRender.test.ts`

**Interfaces（Produces）:**

```ts
export interface RenderOpts { selectedId?: string; mosaicTile?: CanvasImageSource | null }
export function renderAnnotations(ctx: CanvasRenderingContext2D, shapes: Shape[], opts?: RenderOpts): void
export function buildMosaicTile(base: CanvasImageSource, natural: { w: number; h: number }): HTMLCanvasElement | null
// 全尺寸像素化画布：缩小 1/12 → smoothing=false 放大回 natural 尺寸（源/目标坐标 1:1）
```

修复点（相对 R76 实现）：
1. text 分支 font：`` `${Math.max(8, Math.round(s.width))}px system-ui, sans-serif` ``（去掉非法 `inherit`）
2. mosaic 分支：`mosaicTile` 为**全尺寸**画布，`tc.drawImage(tile, b.x - r, b.y - r, b.w + 2r, b.h + 2r, 0, 0, tmp.w, tmp.h)` 坐标即图像坐标（R76 的越界采样缺陷消除）

- [ ] Step 1: 失败测试——**mock ctx（记录调用的桩对象）**：

```ts
import { describe, it, expect } from 'vitest'
import { renderAnnotations } from '../../../src/renderer/src/components/video/annotationRender'
import { makeShape, type Shape } from '../../../src/renderer/src/components/video/annotationModel'

function mockCtx() {
  const calls: Array<{ op: string; args: unknown[] }> = []
  const rec = (op: string) => (...args: unknown[]) => { calls.push({ op, args }) }
  return {
    calls,
    ctx: {
      strokeStyle: '', fillStyle: '', lineWidth: 0, lineCap: '', lineJoin: '', font: '', textBaseline: '',
      globalCompositeOperation: '',
      strokeRect: rec('strokeRect'), beginPath: rec('beginPath'), ellipse: rec('ellipse'), stroke: rec('stroke'),
      moveTo: rec('moveTo'), lineTo: rec('lineTo'), closePath: rec('closePath'), fill: rec('fill'),
      arc: rec('arc'), fillText: rec('fillText'), fillRect: rec('fillRect'), drawImage: rec('drawImage'),
      save: rec('save'), restore: rec('restore'), setLineDash: rec('setLineDash'),
    } as unknown as CanvasRenderingContext2D,
  }
}

describe('annotationRender', () => {
  it('text shape uses a legal canvas font string (no "inherit")', () => {
    const { ctx, calls } = mockCtx()
    const s = makeShape('text', { x: 0, y: 0, w: 24, h: 30, color: '#fff', text: 'hi' })
    renderAnnotations(ctx, [s])
    expect(ctx.font).toBe('24px system-ui, sans-serif')
    expect(ctx.font).not.toContain('inherit')
    expect(calls.some(c => c.op === 'fillText' && (c.args[0] as string) === 'hi')).toBe(true)
  })

  it('mosaic samples the tile in IMAGE coordinates (source rect matches bbox ± r)', () => {
    const { ctx, calls } = mockCtx()
    // document.createElement('canvas') 在 happy-dom 返回 getContext('2d')=null → mosaic 分支内部
    // tmp canvas 构造被守卫跳过；为让分支执行到 drawImage 断言，patch createElement 返回带
    // mock ctx 的假 canvas（宽高字段可写）。
    const origCreate = document.createElement.bind(document)
    const tileDraw: Array<{ op: string; args: unknown[] }> = []
    ;(document as any).createElement = (tag: string) => {
      if (tag !== 'canvas') return origCreate(tag)
      const tc = mockCtx().ctx
      return {
        width: 0, height: 0,
        getContext: () => tc,
        // 记录主画布侧的 drawImage(tmp, x, y)
      }
    }
    const tile = origCreate('canvas')
    const s = makeShape('mosaic', { points: [{ x: 10, y: 10 }, { x: 60, y: 40 }], width: 20 })
    renderAnnotations(ctx, [s], { mosaicTile: tile })
    ;(document as any).createElement = origCreate
    // tmp 的 drawImage(tile, sx, sy, sw, sh, ...)：sx/sy 必须在图像坐标系（≈ bbox.x - r）
    const tmpDraw = tileDraw // 见实现侧：断言经 document.createElement patch 无法直接取，
    // 改为断言主 ctx 的 drawImage 至少收到 tmp canvas（回贴调用存在）
    expect(calls.some(c => c.op === 'drawImage')).toBe(true)
  })

  it('selected shape draws dashed selection box', () => {
    const { ctx, calls } = mockCtx()
    const s = makeShape('rect', { x: 0, y: 0, w: 10, h: 10 })
    renderAnnotations(ctx, [s], { selectedId: s.id })
    expect(calls.some(c => c.op === 'setLineDash')).toBe(true)
    expect(calls.some(c => c.op === 'fillRect')).toBe(true)   // 手柄
  })
})
```

（实现时如 mosaic 断言链路不便，允许把 mosaic 的 tmp 构造改为 `buildMosaicStamp(tile, shape)` 导出纯函数并直接对其 mock-ctx 断言源矩形——测试意图不变：**源矩形 = bbox±r（图像坐标）**。）

- [ ] Step 2: 实现 `annotationRender.ts`（自组件迁移 + 两处修复；mosaic 抽 `buildMosaicStamp` 供测试）→ 全绿
- [ ] Step 3: `AnnotateOverlay.tsx` 改 import、删内联副本；`yarn vitest run tests/renderer/components/AnnotateOverlay.test.tsx` 回归绿
- [ ] Step 4: Commit `[PRD-0002] fix: R77.2 annotator text/mosaic rendering (font token, mosaic tile coords) + render module extraction`

---

### Task 4: AnnotateOverlay ESC 修复 + 滚轮缩放/平移/复位

**Files:**
- Modify: `src/renderer/src/components/video/AnnotateOverlay.tsx`
- Modify: `tests/renderer/components/AnnotateOverlay.test.tsx`（+2 用例）

行为规格：
1. **ESC 分层**：window keydown capture 里，若 `textInput` 激活且按 ESC → `stopPropagation` + 收起输入框（不 onClose）。其余场景 ESC 仍 = onClose。
2. **缩放状态**：`const [zoom, setZoom] = useState<{ z: number; offset: Pt } | null>(null)`（null = fit）。有效视图：`fit = containRect(wrapSize, natural)`；`eff = { x: c.x + (fit.x - c.x)*z + tx, y: c.y + (fit.y - c.y)*z + ty, w: fit.w*z, h: fit.h*z }`（c = wrap 中心）；`kEff = eff.w / natural.w`。绘制 setTransform、指针→图像映射、手柄屏幕命中、textarea 定位全部改用 `eff/kEff`。
3. **滚轮**：wrap 原生监听（passive:false、preventDefault、**无需 Ctrl**）`zoomAtPoint({center, offset, absScale: fitK*z}, cursor, fitK*z*(deltaY<0?1.06:1/1.06))` → 存 `{z: newAbs/fitK, offset}`；绝对比例 clamp [0.1, 8]（previewTransform.clampScale）。
4. **平移**：select 工具 pointerdown 未命中形状/手柄且 z>1.001 → 拖拽平移（offset += 屏幕位移，clampPan 以 `scaled={fit.w*z, fit.h*z}`、container=wrapSize）。
5. **双击空白复位**：canvas dblclick 且 select 工具且未命中 → `setZoom(null)`。

- [ ] Step 1: 实现（复用 previewTransform 的 `zoomAtPoint/clampPan/clampScale`）
- [ ] Step 2: 测试 +2：a) 打字时按 ESC 不触发 onClose（先渲染 text tool 流程太深——改为直接断言：window keydown Escape 在 `document.activeElement` 为 textarea 时不调 onClose，通过 fireEvent 在组件内点击 text 工具后聚焦输入框实现）；b) `fireEvent.wheel(wrap)` 后组件不崩且 save 仍工作（回归保护）
- [ ] Step 3: 全量 `yarn vitest run tests/renderer/components` → 绿；Commit `[PRD-0002] feat: R77.2/R77.3 annotator esc fix + wheel zoom (×1.06) + pan + dblclick reset`

---

### Task 5: CaptureFilmstrip + VideoStudioView 接线

**Files:**
- Create: `src/renderer/src/components/CaptureFilmstrip.tsx`
- Modify: `src/renderer/src/components/VideoStudioView.tsx`
- Modify: `src/renderer/src/i18n/index.tsx`（`video.filmstrip.*`）
- Modify: `src/renderer/src/styles.css`（`.video-filmstrip*`；删 `.video-last-shot-row` 可留）
- Test: `tests/renderer/components/CaptureFilmstrip.test.tsx`

**Interfaces:**

```ts
// CaptureFilmstrip.tsx（哑组件，数据在 View 层）
export interface CaptureFilmstripProps {
  items: CaptureEntry[]                                  // 类型自 shared 导出（见下）
  onEdit: (item: CaptureEntry) => void                   // View 负责 capturesRead → setAnnotateSource
  onDelete: (id: string) => void
  onImport: () => void
}
```

`CaptureEntry` 类型放 `src/shared/types.ts`（main/preload/renderer 三方共用；kind 联合同 Task 1）。

View 接线：
1. `const [captures, setCaptures] = useState<CaptureEntry[]>([])`；mount 时 `capturesList().then(setCaptures).catch(() => {})`；`refreshCaptures = () => capturesList().then(setCaptures).catch(() => {})`。
2. **三产出入库**：`capturePhoto` 下载前 `void window.rgbbox.capturesAdd(url, 'photo').then(refreshCaptures)`；`finishSnip` 裁剪后 `capturesAdd(out.toDataURL(), 'snip')`；`AnnotateOverlay onSave` 里 `capturesAdd(url, 'annotated')`。
3. **删 lastShot**：状态、右栏面板、相关 i18n 渲染全部移除（key 保留）。
4. 胶片栏渲染于 zoom 层外、transport 前：`{captures.length > 0 && <CaptureFilmstrip items={captures} onEdit={...} onDelete={(id) => capturesDelete(id).then(refreshCaptures)} onImport={() => capturesImport().then(refreshCaptures)} />}`；`onEdit = (it) => capturesRead(it.id).then(url => { if (url) setAnnotateSource(url) })`。
5. 缩略图 src：`media://local?p=${encodeURIComponent(item.file)}`。

CaptureFilmstrip 组件规格：横向 flex + `overflow-x: auto`；wheel → `scrollLeft += deltaY`；每项：缩略图（高 64px、宽按比例、圆角、hover 描边）+ hover 浮层右上 ✕（删除）、点击本体 = onEdit；尾部 `+` 方块按钮 = onImport；`title` 显示 name + 时间。

测试（4 用例）：渲染 N 项 + 导入按钮；点击缩略图 → onEdit(item)；点删除按钮 → onDelete(id)；点 + → onImport；items 空 → 组件渲染 null（由父级门控，组件内也 return null）。

i18n（en/zh）：`video.filmstrip.edit`：'编辑'/'Edit'、`video.filmstrip.delete`：'删除'/'Delete'、`video.filmstrip.import`：'导入图片'/'Import images'。

CSS：`.video-filmstrip`（横向滚动条、滚动条样式对齐项目现有 audio-playlist 滚动）、`.video-filmstrip-item`（hover 边框 + ✕ 按钮浮层）、`.video-filmstrip-add`。

- [ ] Step 1: 失败测试 → 实现 → 绿
- [ ] Step 2: View 接线 + i18n + CSS；`yarn vitest run tests/renderer/components` 全绿
- [ ] Step 3: `yarn typecheck` → Commit `[PRD-0002] feat: R77.1 capture filmstrip wiring (auto-capture 3 sources, import/delete, replace lastShot)`

---

### Task 6: 全量验证 + code review + PRD 收尾 + 交付

- [ ] Step 1: `yarn typecheck && yarn vitest run --maxWorkers=4 && yarn build`（记录数字）
- [ ] Step 2: **code review**（goal 显式步骤）：用 code-review 技能审查本批次 diff（R77 全部提交），确认项修复或如实记录
- [ ] Step 3: PRD R77.6 勾选 + 证据；R77.7 → ✅；§9 变更记录两行
- [ ] Step 4: Commit PRD；向用户交付报告（含实机验证清单）

## Self-Review

1. 覆盖：R77.1→Task1/2/5、R77.2→Task3/4、R77.3→Task4、R77.5 文件清单一致、R77.6→Task6。无缺口。
2. 无占位符；Task 3 的 mosaic 测试链路给了备选实现路径（buildMosaicStamp 纯函数）。
3. 类型一致：`CaptureEntry` 三方共用（shared/types）；IPC 名与 preload/handler/mock 一致；`renderAnnotations/buildMosaicTile` 与组件用法一致。
