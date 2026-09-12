# R80 独立全局截图工具 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 托盘菜单 + Alt+A 全局热键触发系统级截图：所有显示器冻结 → 框选 → AnnotateOverlay 就地标注 → 复制/下载 + 自动入「最近拍摄」。

**Architecture:** 主进程 `snipManager.ts`（照 `screensaverManager.ts` 模式）先 `desktopCapturer` 截全部屏再开 frameless 全屏置顶窗口（`?snip=1&displayId=X`）；渲染端 `SnipView.tsx` 全屏显示冻结帧 → 暗幕拖选 → `cropToDataUrl` 裁剪 → 复用 `AnnotateOverlay`（零改动）。3 条新 IPC。

**Tech Stack:** Electron（BrowserWindow/globalShortcut/desktopCapturer/clipboard/screen）、React 19 + TypeScript、vitest（node + happy-dom）。

**Spec:** `docs/superpowers/specs/2026-09-12-r80-global-snip-design.md`（已批准）

## Global Constraints

- 提交标题：`[PRD-0002] <type>: <subject>`；每个 Task 一次提交。
- 验证命令只用 `yarn typecheck` / `yarn vitest run <file>` / `yarn build`（不改 `package.json` scripts）。
- 3 条 IPC 通道名常量进 `src/shared/ipc.ts`，preload 单一根 `window.rgbbox` 白名单暴露（R5.1）。
- 无水印铁律（R75.2）：截图/裁剪/导出只搬运像素，绝不叠加文字/logo。
- captureStore 落档 kind 固定 `'annotated'`；`copy` = 剪贴板+落档（不下载），`save` = 落档+渲染端 `<a download>`（不写剪贴板）。
- `src/main/index.ts` 只加接线（托盘菜单项、whenReady 热键、IPC handler、before-quit 清理），不顺手重构。
- 全量测试跑法：`yarn vitest run --maxWorkers=4`（全并行有 2 个已知负载抖动用例）。

---

### Task 1: PRD R80 条款细化（代码改动前置）

**Files:**
- Modify: `docs/prd/PRD-0002-rgbbox-project-catalog.md`（§R80 段，约 700 行附近「### R80.」小节）

**Interfaces:**
- Produces: R80.1–R80.8 条款文本（后续 Task 的验收依据）。

- [ ] **Step 1: 替换 R80 占位条款**

把 R80 小节里这两行占位：

```
- **R80.1–R80.x**：待 R79 交付后 brainstorm 细化（入口/热键/多显示器/窗口生命周期/缓存与剪贴板复用/验收点）。
- **R80.2** **状态**：⏳
```

替换为（保留小节头部引言与风险等级行不动）：

```markdown
- **R80.1** **交互决策**（2026-09-12 brainstorm 经用户确认）：托盘右键菜单「截图 (Alt+A)」+ 全局热键 `Alt+A` 双入口；所有显示器一起冻结；复制 = 剪贴板 + 存最近拍摄（不下载），✓ = 下载 PNG + 存最近拍摄（不写剪贴板）；悬浮工具 = 选区确认后 AnnotateOverlay 工具条就地出现（微信式）。设计文档：`docs/superpowers/specs/2026-09-12-r80-global-snip-design.md`。
- **R80.2** **主进程管理器**：新增 `src/main/snipManager.ts`：`startSnip()` 先 `desktopCapturer.getSources({types:['screen']})`（thumbnailSize 取各屏物理像素最大值）按 `source.display_id` 匹配 `screen.getAllDisplays()` 冻结全部屏，**先截后开窗**；每屏 frameless 全屏窗口（`setBounds(display.bounds)`、`alwaysOnTop('screen-saver')`、skipTaskbar、R74 模式）query `?snip=1&displayId=X`；会话互斥；任一窗口关闭 → 全部销毁；显示器增删/分辨率变化 → 会话取消。纯函数 `matchDisplayToSource` / `physicalThumbSize` / `resolveFinishAction` 导出供单测。
- **R80.3** **热键**：`globalShortcut.register('Alt+A')` → `startSnip()`；注册后 `isRegistered` 为 false（被微信等占用）→ 托盘气泡提示降级；`before-quit` 注销。
- **R80.4** **IPC + preload**（3 条新通道）：`rgbbox:snip:get-frame`（displayId → `{dataUrl}`）、`rgbbox:snip:finish`（`{dataUrl, action:'copy'|'save'}` → clipboard.writeImage + captureStore.addPng('annotated')）、`rgbbox:snip:cancel`（send，关全部）。`src/shared/ipc.ts` 加常量；preload 加 `snipGetFrame/snipFinish/snipCancel`。
- **R80.5** **SnipView 选区阶段**：`main.tsx` 加 `?snip=1` 路由（包 I18nProvider，R70.9 教训）→ 新 `SnipView.tsx`：拉本屏冻结帧解码到物理像素 canvas 全屏绘制 → 暗幕挖洞拖选（SVG 承载事件，同 OCR 框选模式）+ W×H 尺寸角标 + 提示条；松手 ≥8px 物理像素 → 裁剪进标注，<8px 视为取消选择回拖选态；选区限本屏（跨屏拖动钳制）；ESC/右键 = 退出整个会话。
- **R80.6** **SnipView 标注阶段**：`cropToDataUrl` 裁剪选区 → 就地 `AnnotateOverlay`（source=dataURL，全套标注/OCR/智能手势零改动）；✓ → `<a download>` 下载 + `snipFinish('save')`；复制 → `snipFinish('copy')`；两者随后 `snipCancel()`；×/ESC → 关标注器回拖选态（不退出会话）。
- **R80.7** **托盘接线**：`createTray()` 菜单加「截图 (Alt+A)」项（在「显示 / 隐藏主界面」之后）。
- **R80.8** **验收点**：
  - [ ] snipManager 纯函数单测：display↔source 匹配 / 物理像素尺寸 / action 路由
  - [ ] SnipView 组件测试：拉帧进选区态；拖选 ≥8px → AnnotateOverlay 挂载；<8px 回拖选态；ESC 分层（选区态退出会话、标注态先关标注器）；✓/复制 → snipFinish(正确 action) + snipCancel
  - [ ] `yarn typecheck` + 全量 `yarn vitest run --maxWorkers=4` 0 失败 + `yarn build` 0 error
  - [ ] 实机手动：多屏冻结、DPI 150% 选区像素准确、Alt+A 冲突降级气泡、secure desktop 黑帧可 ESC、托盘入口、最近拍摄入库（kind=annotated）
- **R80.9** **状态**：🔄
```

- [ ] **Step 2: 提交**

```bash
git add docs/prd/PRD-0002-rgbbox-project-catalog.md
git commit -m "[PRD-0002] docs: R80 clause detail (snip manager / hotkey / IPC / SnipView acceptance)"
```

---

### Task 2: snipManager 纯函数 + IPC 通道常量

**Files:**
- Create: `src/main/snipManager.ts`
- Modify: `src/shared/ipc.ts`（对象末尾、`ocrRecognize` 之后）
- Test: `tests/main/snipManager.test.ts`

**Interfaces:**
- Produces:
  - `matchDisplayToSource(sources: { id: string; display_id?: string }[], displays: { id: number }[]): Map<number, { id: string; display_id?: string }>`
  - `physicalThumbSize(d: { bounds: { width: number; height: number }; scaleFactor: number }): { width: number; height: number }`
  - `resolveFinishAction(action: 'copy' | 'save'): { clipboard: boolean; addCapture: boolean; download: boolean }`
  - ipcChannels 追加：`snipGetFrame: 'rgbbox:snip:get-frame'`、`snipFinish: 'rgbbox:snip:finish'`、`snipCancel: 'rgbbox:snip:cancel'`

- [ ] **Step 1: 写失败测试**

创建 `tests/main/snipManager.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { matchDisplayToSource, physicalThumbSize, resolveFinishAction } from '../../src/main/snipManager'
import { ipcChannels } from '../../src/shared/ipc'

describe('snipManager pure (R80.2)', () => {
  it('matchDisplayToSource pairs by display_id string; unmatched displays skipped', () => {
    const sources = [
      { id: 'screen:0', display_id: '123' },
      { id: 'window:1' },
      { id: 'screen:2', display_id: '456' },
    ]
    const displays = [{ id: 123 }, { id: 456 }, { id: 789 }]
    const m = matchDisplayToSource(sources, displays)
    expect(m.get(123)?.id).toBe('screen:0')
    expect(m.get(456)?.id).toBe('screen:2')
    expect(m.has(789)).toBe(false)
    expect(m.size).toBe(2)
  })

  it('physicalThumbSize = bounds × scaleFactor (rounded)', () => {
    expect(physicalThumbSize({ bounds: { width: 2560, height: 1440 }, scaleFactor: 1 })).toEqual({ width: 2560, height: 1440 })
    expect(physicalThumbSize({ bounds: { width: 1706.67, height: 960 }, scaleFactor: 1.5 })).toEqual({ width: 2560, height: 1440 })
  })

  it('resolveFinishAction: copy = clipboard+capture, save = download+capture only', () => {
    expect(resolveFinishAction('copy')).toEqual({ clipboard: true, addCapture: true, download: false })
    expect(resolveFinishAction('save')).toEqual({ clipboard: false, addCapture: true, download: true })
  })

  it('IPC channel constants exist (R80.4)', () => {
    expect(ipcChannels.snipGetFrame).toBe('rgbbox:snip:get-frame')
    expect(ipcChannels.snipFinish).toBe('rgbbox:snip:finish')
    expect(ipcChannels.snipCancel).toBe('rgbbox:snip:cancel')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `yarn vitest run tests/main/snipManager.test.ts`
Expected: FAIL（`Cannot find module '../../src/main/snipManager'`）

- [ ] **Step 3: 最小实现**

`src/shared/ipc.ts` 在 `ocrRecognize` 行后追加：

```ts
  // R80: standalone global snip tool (frozen-frame windows + annotator)
  snipGetFrame: 'rgbbox:snip:get-frame',
  snipFinish: 'rgbbox:snip:finish',
  snipCancel: 'rgbbox:snip:cancel',
```

创建 `src/main/snipManager.ts`（本 Task 只写头部注释 + 三个纯函数 + SNIP_HOTKEY 常量；会话层 Task 3 补）：

```ts
/**
 * snipManager — R80 独立全局截图工具（主进程侧）。
 *
 * 触发（托盘「截图」/ 全局热键 Alt+A）后：先 desktopCapturer 冻结所有屏
 * （先截后开窗，窗口不遮屏），再每屏开 frameless 全屏置顶窗口显示冻结帧
 * （R74 screensaver 窗口模式），渲染端 SnipView 负责拖选 + 就地标注。
 * 已知边界：secure desktop（锁屏/UAC）截不到 → 黑帧，ESC 可退。
 */
import type { CaptureEntry } from './captureStore'

export const SNIP_HOTKEY = 'Alt+A'

export interface SnipSourceLike { id: string; display_id?: string }
export interface DisplayLike { id: number; bounds: { width: number; height: number }; scaleFactor: number }

/** R80.2: source↔display 配对（按 display_id 字符串匹配；未匹配的 display 跳过）。 */
export function matchDisplayToSource(
  sources: SnipSourceLike[],
  displays: Array<{ id: number }>,
): Map<number, SnipSourceLike> {
  const out = new Map<number, SnipSourceLike>()
  for (const d of displays) {
    const src = sources.find((s) => s.display_id === String(d.id))
    if (src) out.set(d.id, src)
  }
  return out
}

/** R80.2: 冻结帧物理像素尺寸（bounds DIP × scaleFactor）。 */
export function physicalThumbSize(d: DisplayLike): { width: number; height: number } {
  return {
    width: Math.round(d.bounds.width * d.scaleFactor),
    height: Math.round(d.bounds.height * d.scaleFactor),
  }
}

/** R80.2: 完成动作路由（纯决策）：copy=剪贴板+落档，save=落档+下载（渲染端）。 */
export function resolveFinishAction(action: 'copy' | 'save'): { clipboard: boolean; addCapture: boolean; download: boolean } {
  return { clipboard: action === 'copy', addCapture: true, download: action === 'save' }
}

// ── 会话层（Task 3 实现） ──────────────────────────────────────────────
export type SnipDeps = { addPng: (dataUrl: string, kind: CaptureEntry['kind']) => CaptureEntry | null }
```

注意：`import type { CaptureEntry }` + `SnipDeps` 此 Task 就位（Task 3 用）。

- [ ] **Step 4: 跑测试确认通过**

Run: `yarn vitest run tests/main/snipManager.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: typecheck + 提交**

```bash
yarn typecheck
git add src/main/snipManager.ts src/shared/ipc.ts tests/main/snipManager.test.ts
git commit -m "[PRD-0002] feat: snipManager pure helpers + snip IPC channels (R80.2/R80.4)"
```

---

### Task 3: snipManager 会话层（窗口/热键/生命周期）

**Files:**
- Modify: `src/main/snipManager.ts`（追加会话层实现）

**Interfaces:**
- Consumes: Task 2 的纯函数、`SnipDeps`、`SNIP_HOTKEY`。
- Produces（index.ts 接线用，Task 4）:
  - `initSnipManager(deps: SnipDeps, isDevelopment: boolean, devUrl?: string): void`
  - `startSnip(): Promise<boolean>`
  - `getSnipFrame(displayId: number): { dataUrl: string } | null`
  - `finishSnip(dataUrl: string, action: 'copy' | 'save'): boolean`
  - `cancelSnip(): void`
  - `registerSnipHotkey(onConflict: (accel: string) => void): void`
  - `unregisterSnipHotkey(): void`
  - `disposeSnipManager(): void`

（`isDevelopment`/`devUrl` 由 `initSnipManager` 持有，`startSnip()` 零参——托盘与热键共用同一入口。）

- [ ] **Step 1: 追加会话层实现**

在 `src/main/snipManager.ts` 末尾（`SnipDeps` 之后）追加。要点逐条对应设计文档 §3.1/§5：

```ts
import { BrowserWindow, clipboard, desktopCapturer, globalShortcut, nativeImage, screen } from 'electron'
import { join } from 'node:path'
import { getLogger, type Logger } from '../shared/logger'

// electron 导入必须放文件顶部（与 Task 2 的 import type 合并整理成一条 import 区）。
function log(): Logger { return getLogger() }   // 惰性取 logger（index.ts initLogger 之前不可调用）

const snipWindows = new Map<number, BrowserWindow>()
const snipFrames = new Map<number, string>()    // displayId → 冻结帧 dataURL
let sessionActive = false
let deps: SnipDeps | null = null
let isDev = false
let devUrl: string | undefined

/** 显示器热插拔/分辨率变化 → 会话作废（冻结帧与实际屏幕错位）。 */
function onDisplayChanged(): void {
  if (sessionActive) {
    log().info('Snip', 'display topology changed during session — cancelling')
    cancelSnip()
  }
}

export function initSnipManager(d: SnipDeps, development: boolean, url?: string): void {
  deps = d
  isDev = development
  devUrl = url
  screen.on('display-added', onDisplayChanged)
  screen.on('display-removed', onDisplayChanged)
  screen.on('display-metrics-changed', onDisplayChanged)
}

export function disposeSnipManager(): void {
  screen.removeListener('display-added', onDisplayChanged)
  screen.removeListener('display-removed', onDisplayChanged)
  screen.removeListener('display-metrics-changed', onDisplayChanged)
  unregisterSnipHotkey()
  cancelSnip()
}

function openSnipWindow(displayId: number): void {
  const display = screen.getAllDisplays().find((x) => x.id === displayId)
  if (!display) return
  const b = display.bounds
  const win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    frame: false,
    transparent: false,
    skipTaskbar: true,
    hasShadow: false,
    thickFrame: false,
    roundedCorners: false,
    backgroundColor: '#05080a',
    focusable: true,
    resizable: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  })
  win.once('ready-to-show', () => {
    win.show()
    if (process.platform === 'win32') win.setFullScreen(true)
    win.setAlwaysOnTop(true, 'screen-saver')
    win.moveTop()
    win.focus()
  })
  // 任一窗口被关（Alt+F4/系统）→ 整个会话收摊
  win.on('closed', () => {
    snipWindows.delete(displayId)
    if (sessionActive) cancelSnip()
  })
  const query = `snip=1&displayId=${displayId}`
  if (isDev && devUrl) win.loadURL(`${devUrl}?${query}`)
  else win.loadFile(join(__dirname, '../renderer/index.html'), { search: query })
  snipWindows.set(displayId, win)
}

export async function startSnip(): Promise<boolean> {
  if (sessionActive) return false
  const displays = screen.getAllDisplays()
  if (displays.length === 0) return false
  // thumbnailSize 取所有屏物理像素的最大值：小屏返回原生分辨率（Chromium 不放大）
  const sizes = displays.map(physicalThumbSize)
  const maxW = Math.max(...sizes.map((s) => s.width))
  const maxH = Math.max(...sizes.map((s) => s.height))
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: maxW, height: maxH } })
  const pairs = matchDisplayToSource(sources, displays)
  if (pairs.size === 0) {
    log().error('Snip', 'no display source matched — abort')
    return false
  }
  for (const [displayId, src] of pairs) snipFrames.set(displayId, src.thumbnail.toDataURL())
  sessionActive = true
  log().info('Snip', `session start — ${pairs.size} display(s) frozen`)
  for (const displayId of pairs.keys()) openSnipWindow(displayId)
  return true
}

export function getSnipFrame(displayId: number): { dataUrl: string } | null {
  const dataUrl = snipFrames.get(displayId)
  return dataUrl ? { dataUrl } : null
}

export function finishSnip(dataUrl: string, action: 'copy' | 'save'): boolean {
  if (!sessionActive || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return false
  const flags = resolveFinishAction(action)
  try {
    if (flags.clipboard) clipboard.writeImage(nativeImage.createFromDataURL(dataUrl))
    if (flags.addCapture) deps?.addPng(dataUrl, 'annotated')
  } catch (err) {
    log().error('Snip', `finish failed: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
  return true
}

export function cancelSnip(): void {
  sessionActive = false
  snipFrames.clear()
  for (const [, win] of snipWindows) {
    if (!win.isDestroyed()) win.destroy()   // destroy 防重入（closed 里再调 cancelSnip）
  }
  snipWindows.clear()
}

export function registerSnipHotkey(onConflict: (accel: string) => void): void {
  globalShortcut.register(SNIP_HOTKEY, () => { void startSnip() })
  // register 对冲突不抛错而是静默失败——用 isRegistered 探测（仅当本应用注册成功才为 true）
  if (!globalShortcut.isRegistered(SNIP_HOTKEY)) onConflict(SNIP_HOTKEY)
}

export function unregisterSnipHotkey(): void {
  try { globalShortcut.unregister(SNIP_HOTKEY) } catch { /* 未注册 */ }
}
```

注意两点：
1. `sources` 传给 `matchDisplayToSource` 时是 `DesktopCapturerSource[]`（含 `thumbnail`），结构兼容 `SnipSourceLike`——TS 直接可传。
2. electron 的 import 语句合并到文件顶部 import 区（不保留两段 import）。

- [ ] **Step 2: typecheck**

Run: `yarn typecheck`
Expected: 0 error（node + web 两套）

- [ ] **Step 3: 纯函数测试不回归**

Run: `yarn vitest run tests/main/snipManager.test.ts`
Expected: PASS（会话层不引入新测试——BrowserWindow/desktopCapturer 在 node 单测环境不可实例化，窗口生命周期按项目惯例（screensaverManager 同模式）由实机验收覆盖）

- [ ] **Step 4: 提交**

```bash
git add src/main/snipManager.ts
git commit -m "[PRD-0002] feat: snipManager session layer (windows / hotkey / lifecycle) (R80.2/R80.3)"
```

---

### Task 4: 主进程接线 + preload + 渲染路由 + i18n + 测试 mock

**Files:**
- Modify: `src/main/index.ts`（3 处：captures handler 区、createTray、whenReady/before-quit）
- Modify: `src/preload/index.ts`（`clipboardWriteImage` 附近）
- Modify: preload 的 renderer 类型声明（`grep -rn 'clipboardWriteImage' src/` 找到 interface 声明处，同样加 3 个方法签名）
- Modify: `src/renderer/src/main.tsx`（路由）
- Modify: `src/renderer/src/i18n/index.tsx`（zh + en 各加 2 键）
- Modify: `tests/renderer/_helpers.tsx`（rgbbox mock 加 3 个方法）

**Interfaces:**
- Consumes: Task 3 的全部导出、Task 2 的 ipcChannels。
- Produces: `window.rgbbox.snipGetFrame/snipFinish/snipCancel`（渲染端可用）；`?snip=1` 路由指向 Task 5 的 `SnipView`。

- [ ] **Step 1: index.ts 接线**

文件头 import 区（`screensaverManager` import 旁）加：

```ts
import { cancelSnip, disposeSnipManager, finishSnip, getSnipFrame, initSnipManager, registerSnipHotkey, startSnip } from './snipManager'
```

(a) `registerIpcHandlers`（或 captures handler 所在函数）里 `capturesImport` handler 之后加：

```ts
  // R80: standalone global snip tool
  initSnipManager({ addPng: (url, kind) => captureStore.addPng(url, kind) }, isDevelopment, process.env.ELECTRON_RENDERER_URL)
  ipcMain.handle(ipcChannels.snipGetFrame, (_e, displayId: number) => getSnipFrame(typeof displayId === 'number' ? displayId : -1))
  ipcMain.handle(ipcChannels.snipFinish, (_e, p: { dataUrl: string; action: 'copy' | 'save' }) =>
    finishSnip(p?.dataUrl, p?.action === 'save' ? 'save' : 'copy'))
  ipcMain.on(ipcChannels.snipCancel, () => cancelSnip())
```

（`captureStore` 在该函数作用域内已存在——line ~262；`isDevelopment` 是模块级 const。）

(b) `createTray()` 的 contextMenu 模板里「显示 / 隐藏主界面」项后加：

```ts
    { label: '截图 (Alt+A)', click: () => { void startSnip() } },
```

(c) `app.whenReady().then(...)` 内 `createTray()` 行之后加：

```ts
  // R80: global snip hotkey — conflict (e.g. WeChat owns Alt+A) degrades to tray-only with a balloon
  registerSnipHotkey((accel) => {
    tray?.displayBalloon?.({ title: 'RGBBox', content: `全局热键 ${accel} 已被其他应用占用，截图仍可从托盘菜单触发。`, iconType: 'info' })
  })
```

(d) `app.on('before-quit')` 里 `disposeScreensaver()` 之后加：

```ts
  // R80: close snip session + unregister global hotkey
  disposeSnipManager()
```

- [ ] **Step 2: preload + 类型声明**

`src/preload/index.ts` `clipboardWriteImage` 之后加：

```ts
  snipGetFrame: (displayId: number): Promise<{ dataUrl: string } | null> =>
    ipcRenderer.invoke(ipcChannels.snipGetFrame, displayId),
  snipFinish: (dataUrl: string, action: 'copy' | 'save'): Promise<boolean> =>
    ipcRenderer.invoke(ipcChannels.snipFinish, { dataUrl, action }),
  snipCancel: (): void => {
    ipcRenderer.send(ipcChannels.snipCancel)
  },
```

用 `grep -rn 'clipboardWriteImage' src/ --include='*.ts' --include='*.tsx'` 找 renderer 侧 `window.rgbbox` 类型声明（同签名追加 3 个方法；返回类型与上面一致）。

- [ ] **Step 3: main.tsx 路由**

`const isScreensaver = ...` 行后加 `const isSnip = params.get('snip') === '1'`；`isScreensaver` 分支后加（不进 StrictMode，与 overlay/audioviz 分支一致）：

```tsx
} else if (isSnip) {
  // R80: standalone global snip — frozen fullscreen frame + region select + annotator
  document.documentElement.style.overflow = 'hidden'
  document.body.classList.add('snip-mode')
  root.render(
    <I18nProvider>
      <SnipView displayId={overlayDisplayId} />
    </I18nProvider>
  )
}
```

顶部 `import { SnipView } from './components/SnipView'`（Task 5 才创建文件——本 Task 先建**最小占位**使 typecheck 过：创建 `src/renderer/src/components/SnipView.tsx` 只含 `export function SnipView(_props: { displayId: number }) { return null }`，Task 5 重写）。若执行顺序保证 Task 5 紧随，可改为 Task 5 一并建路由——**采用后者**：本 Step 只加 `isSnip` 常量与 import/分支，SnipView 文件在 Task 5 Step 1 先建再回来跑 typecheck（跨 Task 依赖在此说明，执行者按顺序跑即可）。

- [ ] **Step 4: i18n 键**

zh：
```ts
'snip.hint': '拖选截图区域 · ESC 取消',
'snip.failed': '截图画面获取失败，请重试',
```
en：
```ts
'snip.hint': 'Drag to select · ESC to cancel',
'snip.failed': 'Failed to load the frozen frame, please retry',
```
（跟随现有键组织方式插入相邻分组。）

- [ ] **Step 5: 测试 mock**

`tests/renderer/_helpers.tsx` 的 rgbbox mock（`clipboardWriteImage` 旁）加：

```ts
  snipGetFrame: vi.fn(async () => ({ dataUrl: 'data:image/png;base64,iVBORw0KGgo=' })),
  snipFinish: vi.fn(async () => true),
  snipCancel: vi.fn(),
```

- [ ] **Step 6: typecheck + 全量不回归 + 提交**

Run: `yarn typecheck`（**须在 Task 5 Step 1 之后，或本 Task 先建 SnipView 占位**——执行者二选一，推荐先占位后重写）→ `yarn vitest run tests/renderer` 
Expected: 0 失败

```bash
git add src/main/index.ts src/preload/index.ts src/renderer/src/main.tsx src/renderer/src/i18n/index.tsx tests/renderer/_helpers.tsx
git commit -m "[PRD-0002] feat: snip IPC wiring + tray menu + Alt+A hotkey + renderer route (R80.3/R80.4/R80.7)"
```

---

### Task 5: SnipView 选区阶段

**Files:**
- Create: `src/renderer/src/components/SnipView.tsx`（Task 4 若建了占位则整文件重写）
- Modify: `src/renderer/src/styles.css`（末尾追加 snip 样式）
- Test: `tests/renderer/components/SnipView.test.tsx`

**Interfaces:**
- Consumes: `window.rgbbox.snipGetFrame/snipCancel`；`cropToDataUrl`（`./video/frameCapture`）。
- Produces: `export function SnipView({ displayId }: { displayId: number }): JSX.Element`；DOM 契约 `.snip-root` / `.snip-canvas` / `.snip-mask` / `.snip-hint` / `.snip-size`。

- [ ] **Step 1: 写失败测试**

创建 `tests/renderer/components/SnipView.test.tsx`：

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { SnipView } from '../../../src/renderer/src/components/SnipView'
import { setupRendererMocks } from '../_helpers'

const png = 'data:image/png;base64,iVBORw0KGgo='

// happy-dom 的 Image 不触发 onload —— 用微任务 stub 让冻结帧"解码"完成
class FakeImage {
  onload: (() => void) | null = null
  naturalWidth = 400
  naturalHeight = 300
  set src(_v: string) { queueMicrotask(() => this.onload?.()) }
}

beforeEach(() => {
  setupRendererMocks()
  cleanup()
  vi.stubGlobal('Image', FakeImage as unknown as typeof Image)
})
afterEach(() => vi.unstubAllGlobals())

describe('SnipView select phase (R80.5)', () => {
  it('loads frame and enters select state (mask + hint)', async () => {
    const { container } = render(<SnipView displayId={1} />)
    await waitFor(() => expect(container.querySelector('.snip-mask')).toBeTruthy())
    expect(container.querySelector('.snip-hint')).toBeTruthy()
  })

  it('drag ≥8px enters annotate phase (AnnotateOverlay mounted)', async () => {
    const { container } = render(<SnipView displayId={1} />)
    await waitFor(() => expect(container.querySelector('.snip-mask')).toBeTruthy())
    const mask = container.querySelector('.snip-mask') as SVGSVGElement
    fireEvent.pointerDown(mask, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(mask, { clientX: 120, clientY: 90 })
    fireEvent.pointerUp(mask, { clientX: 120, clientY: 90 })
    await waitFor(() => expect(container.querySelector('.video-annotate-overlay')).toBeTruthy())
  })

  it('drag <8px stays in select state, no annotator', async () => {
    const { container } = render(<SnipView displayId={1} />)
    await waitFor(() => expect(container.querySelector('.snip-mask')).toBeTruthy())
    const mask = container.querySelector('.snip-mask') as SVGSVGElement
    fireEvent.pointerDown(mask, { button: 0, clientX: 50, clientY: 50 })
    fireEvent.pointerMove(mask, { clientX: 54, clientY: 53 })
    fireEvent.pointerUp(mask, { clientX: 54, clientY: 53 })
    await new Promise(r => setTimeout(r, 20))
    expect(container.querySelector('.video-annotate-overlay')).toBeNull()
    expect(container.querySelector('.snip-mask')).toBeTruthy()
  })

  it('ESC in select phase cancels the session', async () => {
    const mocks = setupRendererMocks()
    render(<SnipView displayId={1} />)
    await waitFor(() => expect(document.querySelector('.snip-mask')).toBeTruthy())
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(mocks.snipCancel).toHaveBeenCalledTimes(1)
  })

  it('contextmenu (right-click) cancels the session', async () => {
    const mocks = setupRendererMocks()
    render(<SnipView displayId={1} />)
    await waitFor(() => expect(document.querySelector('.snip-mask')).toBeTruthy())
    fireEvent.contextMenu(window)
    expect(mocks.snipCancel).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `yarn vitest run tests/renderer/components/SnipView.test.tsx`
Expected: FAIL（`Cannot find module ... SnipView` 或 mask 不存在）

- [ ] **Step 3: 实现 SnipView（选区阶段完整 + 标注阶段接线一并写好）**

创建 `src/renderer/src/components/SnipView.tsx`：

```tsx
/**
 * SnipView — R80 独立全局截图窗口内容（?snip=1&displayId=X 路由进入）。
 * 冻结帧全屏 → 暗幕挖洞拖选（≥8px 有效）→ 裁剪 → AnnotateOverlay 就地标注。
 * ESC/右键 = 退出会话（标注态 ESC 由 AnnotateOverlay 分层处理，× 回拖选态）。
 * 无水印铁律（R75.2）：裁剪/导出只搬运像素。
 */
import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { useI18n } from '../i18n'
import { AnnotateOverlay } from './video/AnnotateOverlay'
import { cropToDataUrl } from './video/frameCapture'

/** happy-dom 无 canvas 时的兜底（生产路径永远走真 canvas）。 */
const FALLBACK_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
/** 拖选有效阈值（物理像素，与 OCR 框选同语义）。 */
const MIN_SELECT_PX = 8

type Phase = 'loading' | 'select' | 'annotate'
interface Pt { x: number; y: number }

export function SnipView({ displayId }: { displayId: number }): JSX.Element {
  const { t } = useI18n()
  const [phase, setPhase] = useState<Phase>('loading')
  const [frame, setFrame] = useState<HTMLCanvasElement | null>(null)  // 物理像素冻结帧
  const [frameUrl, setFrameUrl] = useState<string>(FALLBACK_PNG)      // dataURL（AnnotateOverlay 源）
  const [draft, setDraft] = useState<{ a: Pt; b: Pt } | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // 拉冻结帧 → 解码到物理像素 canvas
  useEffect(() => {
    let alive = true
    window.rgbbox.snipGetFrame(displayId).then((r) => {
      if (!alive || !r?.dataUrl) return
      const img = new Image()
      img.onload = () => {
        if (!alive) return
        const cv = document.createElement('canvas')
        cv.width = img.naturalWidth
        cv.height = img.naturalHeight
        cv.getContext('2d')?.drawImage(img, 0, 0)
        setFrame(cv)
        setFrameUrl(r.dataUrl)
        setPhase('select')
      }
      img.src = r.dataUrl
    }).catch(() => { /* 主进程失败不开窗；防御性停留 loading */ })
    return () => { alive = false }
  }, [displayId])

  // 冻结帧绘到全屏 canvas（CSS 拉伸 100vw/100vh，物理像素 1:1）
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !frame) return
    if (cv.width !== frame.width) cv.width = frame.width
    if (cv.height !== frame.height) cv.height = frame.height
    cv.getContext('2d')?.drawImage(frame, 0, 0)
  }, [frame, phase])

  // 会话退出：选区阶段 ESC / 右键（标注阶段 ESC 由 AnnotateOverlay onClose 分层）
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || phase !== 'select') return
      if ((e as KeyboardEvent & { isComposing?: boolean }).isComposing) return
      window.rgbbox.snipCancel()
    }
    const onCtx = (e: MouseEvent): void => {
      if (phase !== 'select') return
      e.preventDefault()
      window.rgbbox.snipCancel()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('contextmenu', onCtx)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('contextmenu', onCtx)
    }
  }, [phase])

  /** CSS px → 冻结帧物理像素。 */
  const toPhys = useCallback((clientX: number, clientY: number): Pt => {
    const r = wrapRef.current?.getBoundingClientRect()
    const dpr = frame && r && r.width > 0 ? frame.width / r.width : window.devicePixelRatio || 1
    return { x: (clientX - (r?.left ?? 0)) * dpr, y: (clientY - (r?.top ?? 0)) * dpr }
  }, [frame])

  const confirmSel = useCallback((a: Pt, b: Pt): void => {
    const sel = {
      x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y),
    }
    if (!frame || sel.w < MIN_SELECT_PX || sel.h < MIN_SELECT_PX) {
      setDraft(null)   // 抖动/单击 → 取消选择回拖选态
      return
    }
    setFrameUrl(cropToDataUrl(frame, sel, FALLBACK_PNG))
    setDraft(null)
    setPhase('annotate')
  }, [frame])

  /** R80.6: 完成动作 → 落档（主进程）+ 可选下载（渲染端）→ 关会话。 */
  const finish = useCallback((mode: 'copy' | 'save') => (url: string): void => {
    if (mode === 'save' && url) {
      const a = document.createElement('a')
      a.href = url
      a.download = `rgbbox-snip-${Date.now()}.png`
      a.click()
    }
    void window.rgbbox.snipFinish(url, mode)
      .catch(() => undefined)
      .finally(() => window.rgbbox.snipCancel())
  }, [])

  // 暗幕挖洞矩形（CSS px；draft 是物理坐标 → 反算回 CSS 供 SVG 绘制）
  const dpr = frame && wrapRef.current ? (wrapRef.current.clientWidth > 0 ? frame.width / wrapRef.current.clientWidth : 1) : 1
  const selCss = draft
    ? {
        x: Math.min(draft.a.x, draft.b.x) / dpr, y: Math.min(draft.a.y, draft.b.y) / dpr,
        w: Math.abs(draft.b.x - draft.a.x) / dpr, h: Math.abs(draft.b.y - draft.a.y) / dpr,
      }
    : null
  const W = frame?.width ?? 1
  const H = frame?.height ?? 1

  return (
    <div ref={wrapRef} className="snip-root">
      <canvas ref={canvasRef} className="snip-canvas" />
      {phase === 'select' && (
        <svg
          className="snip-mask"
          width="100%" height="100%"
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.currentTarget.setPointerCapture?.(e.pointerId)
            setDraft({ a: toPhys(e.clientX, e.clientY), b: toPhys(e.clientX, e.clientY) })
          }}
          onPointerMove={(e) => {
            setDraft(d => (d ? { ...d, b: toPhys(e.clientX, e.clientY) } : d))
          }}
          onPointerUp={(e) => {
            const p = toPhys(e.clientX, e.clientY)
            setDraft(d => {
              if (d) confirmSel(d.a, p)
              return null
            })
          }}
          onPointerCancel={() => setDraft(null)}
        >
          <path
            d={selCss
              ? `M0 0H${'100%'}V${'100%'}H0Z`   // 由下方整屏 rect + evenodd 挖洞实现
              : ''}
            fill="none"
          />
          <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.45)" />
          {selCss && (
            <>
              <rect x={selCss.x} y={selCss.y} width={selCss.w} height={selCss.h} fill="black" />
              <rect x={selCss.x} y={selCss.y} width={selCss.w} height={selCss.h} fill="none" stroke="#46c6a8" strokeWidth="1.5" />
            </>
          )}
        </svg>
      )}
      {phase === 'select' && selCss && (
        <span className="snip-size" style={{ left: selCss.x + selCss.w / 2, top: Math.max(4, selCss.y - 26) }}>
          {Math.round(selCss.w * dpr)} × {Math.round(selCss.h * dpr)}
        </span>
      )}
      {phase === 'select' && <p className="snip-hint">{t('snip.hint' as never)}</p>}
      {phase === 'annotate' && (
        <AnnotateOverlay
          source={frameUrl}
          onClose={() => setPhase('select')}
          onSave={finish('save')}
          onCopy={finish('copy')}
        />
      )}
    </div>
  )
}
```

实现注意（写代码时修正上面草稿的两处示意）：
1. SVG 暗幕直接用「整屏半透明 rect + 选区黑色 rect（叠加回不透明）+ 选区描边」三层实现挖洞效果（草稿里那条空 `path` 是示意，删掉）；happy-dom 下 `width="100%"` 生效，无需算像素。
2. `selCss` 的 dpr 反算在 render 里每帧取 `wrapRef.current.clientWidth`（无 layout 环境为 0 → dpr=1），不引入额外 state。

`styles.css` 末尾追加：

```css
/* ── R80: 独立全局截图窗口 ─────────────────────────────────────────── */
.snip-root { position: fixed; inset: 0; background: #05080a; overflow: hidden; }
.snip-canvas { width: 100vw; height: 100vh; display: block; }
.snip-mask { position: absolute; inset: 0; width: 100%; height: 100%; cursor: crosshair; touch-action: none; }
.snip-size {
  position: absolute; transform: translateX(-50%); padding: 2px 8px; border-radius: 4px;
  background: rgba(5, 8, 10, 0.85); color: #46c6a8; font-size: 12px; pointer-events: none;
}
.snip-hint {
  position: absolute; bottom: 48px; left: 50%; transform: translateX(-50%);
  padding: 6px 14px; border-radius: 6px; background: rgba(5, 8, 10, 0.8);
  color: rgba(255, 255, 255, 0.82); font-size: 13px; pointer-events: none;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `yarn vitest run tests/renderer/components/SnipView.test.tsx`
Expected: PASS（5 tests）

- [ ] **Step 5: typecheck + 提交**

```bash
yarn typecheck
git add src/renderer/src/components/SnipView.tsx src/renderer/src/styles.css tests/renderer/components/SnipView.test.tsx src/renderer/src/main.tsx
git commit -m "[PRD-0002] feat: SnipView frozen-frame select phase + annotator handoff (R80.5/R80.6)"
```

（若 Task 4 采用"占位"方案，本提交一并包含 main.tsx 路由——以实际执行为准，提交信息不变。）

---

### Task 6: SnipView 标注完成流测试（✓/复制/× 回退）

**Files:**
- Test: `tests/renderer/components/SnipView.test.tsx`（追加用例）

**Interfaces:**
- Consumes: Task 5 的 SnipView；`_helpers` 的 `snipFinish/snipCancel` mock。
- Produces: R80.8 组件验收的标注流证据。

- [ ] **Step 1: 追加失败测试**

在 describe 内追加：

```tsx
  async function enterAnnotate(container: HTMLElement): Promise<void> {
    const mask = container.querySelector('.snip-mask') as SVGSVGElement
    fireEvent.pointerDown(mask, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(mask, { clientX: 120, clientY: 90 })
    fireEvent.pointerUp(mask, { clientX: 120, clientY: 90 })
    await waitFor(() => expect(container.querySelector('.video-annotate-overlay')).toBeTruthy())
  }

  it('R80.6: × closes annotator back to select state (session alive)', async () => {
    const mocks = setupRendererMocks()
    const { container } = render(<SnipView displayId={1} />)
    await waitFor(() => expect(container.querySelector('.snip-mask')).toBeTruthy())
    await enterAnnotate(container)
    fireEvent.click(container.querySelector('.video-annotate-close')!)
    await waitFor(() => expect(container.querySelector('.snip-mask')).toBeTruthy())
    expect(mocks.snipCancel).not.toHaveBeenCalled()
  })

  it('R80.6: save → snipFinish(save) then snipCancel', async () => {
    const mocks = setupRendererMocks()
    const { container } = render(<SnipView displayId={1} />)
    await waitFor(() => expect(container.querySelector('.snip-mask')).toBeTruthy())
    await enterAnnotate(container)
    fireEvent.click(container.querySelector('.video-annotate-save')!)
    await waitFor(() => expect(mocks.snipFinish).toHaveBeenCalledTimes(1))
    expect(mocks.snipFinish.mock.calls[0][1]).toBe('save')
    await waitFor(() => expect(mocks.snipCancel).toHaveBeenCalledTimes(1))
  })

  it('R80.6: copy → snipFinish(copy)', async () => {
    const mocks = setupRendererMocks()
    const { container } = render(<SnipView displayId={1} />)
    await waitFor(() => expect(container.querySelector('.snip-mask')).toBeTruthy())
    await enterAnnotate(container)
    fireEvent.click(container.querySelector('.video-annotate-copy')!)
    await waitFor(() => expect(mocks.snipFinish).toHaveBeenCalledWith(expect.stringMatching(/^data:image\//), 'copy'))
  })
```

- [ ] **Step 2: 跑测试**

Run: `yarn vitest run tests/renderer/components/SnipView.test.tsx`
Expected: 新 3 例可能直接 PASS（Task 5 已实现完成流）——若有 FAIL 按失败信息修 SnipView（这是验收性测试，允许 green-on-arrival；失败则修实现）。

- [ ] **Step 3: 提交**

```bash
git add tests/renderer/components/SnipView.test.tsx
git commit -m "[PRD-0002] test: SnipView annotate finish flows (save/copy/dismiss) (R80.6)"
```

---

### Task 7: 全量回归 + PRD 收口 + 实机验收清单

**Files:**
- Modify: `docs/prd/PRD-0002-rgbbox-project-catalog.md`（R80.8 勾选 + R80.9 状态 + §9 变更记录行）

- [ ] **Step 1: 全量验证**

```bash
yarn typecheck
yarn vitest run --maxWorkers=4
yarn build
```
Expected: typecheck 0 error；全量 0 失败（较 R79.12 基线 592 passed + snipManager 4 + SnipView 8 ≈ 604）；build 0 error。

- [ ] **Step 2: 实机冒烟（yarn dev）**

启动 dev → 托盘右键「截图 (Alt+A)」→ 全屏冻结 → 拖选 → 标注（画矩形 + 文字 + OCR）→ 复制 → 粘到画图验证像素 → 主窗口「最近拍摄」出现 annotated 条目 → 再按 Alt+A 直接触发 → ESC 退出。多屏/DPI/热键冲突场景记录结果（无法自动化的部分如实标注待用户复测）。

- [ ] **Step 3: PRD 收口**

R80.8 验收点勾选（附命令输出摘要与测试计数）；R80.9 状态 → ✅（自动化证据齐全；实机复测项标注"待用户确认"）；§9 变更记录追加一行（含实施内容 + 测试计数 + 状态流转）。

- [ ] **Step 4: 提交**

```bash
git add docs/prd/PRD-0002-rgbbox-project-catalog.md
git commit -m "[PRD-0002] docs: R80 self-check evidence + status ✅"
```

---

## Self-Review 记录

- **Spec 覆盖**：§2 决策（托盘+热键 Task 4、多屏 Task 3、保存行为 Task 3/6、悬浮工具=AnnotateOverlay Task 5）✓；§3.1-3.4（manager/IPC/SnipView）→ Task 2-5 ✓；§5 边界（冲突降级 T4、显示器变化取消 T3、失败不开窗 T3、互斥 T3、<8px T5/T6）✓；§6 测试 → Task 2/5/6/7 ✓。范围外项（贴图/跨屏拼接等）不在计划内 ✓。
- **占位扫描**：Task 4 Step 3 的 SnipView 依赖已显式给出两种处理路径（占位 or Task 5 先行），无 TBD。✓
- **类型一致性**：`SnipDeps.addPng(dataUrl, kind)` 与 captureStore `addPng` 签名一致；`getSnipFrame` 返回 `{dataUrl}|null` 与 preload/mock 一致；`snipFinish(dataUrl, action)`（preload 双参 → IPC `{dataUrl, action}` 单参）三处一致；DOM 契约类名（.snip-mask/.snip-hint/.snip-size）测试与实现一致。✓
