/**
 * snipManager — R80 独立全局截图工具（主进程侧）。
 *
 * 触发（托盘「截图」/ 全局热键 Alt+A）后：先 desktopCapturer 冻结所有屏
 * （先截后开窗，窗口不遮屏），再每屏开 frameless 全屏置顶窗口显示冻结帧
 * （R74 screensaver 窗口模式），渲染端 SnipView 负责拖选 + 就地标注。
 * 已知边界：secure desktop（锁屏/UAC）截不到 → 黑帧，ESC 可退。
 */
import { BrowserWindow, clipboard, desktopCapturer, globalShortcut, nativeImage, screen } from 'electron'
import { join } from 'node:path'
import { getLogger, type Logger } from '../shared/logger'
import { PRESET_SNIP_HOTKEYS as PRESET_SNIP_HOTKEYS_SHARED, isPresetSnipHotkey } from '../shared/snipHotkeys'
import type { CaptureEntry } from './captureStore'

export const SNIP_HOTKEY = 'Alt+A'

export interface SnipSourceLike { id: string; display_id?: string }
export interface DisplayLike { id: number; bounds: { width: number; height: number }; scaleFactor: number }

/** R80.2: source↔display 配对（按 display_id 字符串匹配；未匹配的 display 跳过）。 */
export function matchDisplayToSource<T extends SnipSourceLike>(
  sources: T[],
  displays: Array<{ id: number }>,
): Map<number, T> {
  const out = new Map<number, T>()
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

// ── 会话层 ─────────────────────────────────────────────────────────────

export type SnipDeps = { addPng: (dataUrl: string, kind: CaptureEntry['kind']) => CaptureEntry | null }

// 惰性取 logger（index.ts initLogger 之前不可调用，同 screensaverManager）
function log(): Logger {
  return getLogger()
}

const snipWindows = new Map<number, BrowserWindow>()
// R80.10: 存 nativeImage（不做同步 PNG 编码）——编码推迟到渲染端请求时（懒编码），
// startSnip 只做捕获 + 开窗，窗口加载与编码时间重叠
const snipFrames = new Map<number, Electron.NativeImage>()
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
  const t0 = Date.now()
  const displays = screen.getAllDisplays()
  if (displays.length === 0) return false
  // thumbnailSize 取所有屏物理像素的最大值：小屏返回原生分辨率（Chromium 不放大）
  const sizes = displays.map(physicalThumbSize)
  const maxW = Math.max(...sizes.map((s) => s.width))
  const maxH = Math.max(...sizes.map((s) => s.height))
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: maxW, height: maxH } })
  const tCapture = Date.now() - t0
  const pairs = matchDisplayToSource(sources, displays)
  if (pairs.size === 0) {
    log().error('Snip', 'no display source matched — abort')
    return false
  }
  for (const [displayId, src] of pairs) snipFrames.set(displayId, src.thumbnail)
  sessionActive = true
  // R80.10: 先开窗——窗口加载与帧编码（懒编码）重叠，不再让 toDataURL 串行阻塞开窗
  for (const displayId of pairs.keys()) openSnipWindow(displayId)
  log().info('Snip', `session start — ${pairs.size} display(s); capture ${tCapture}ms, windows opened +${Date.now() - t0}ms`)
  return true
}

export function getSnipFrame(displayId: number): { dataUrl: string } | null {
  const img = snipFrames.get(displayId)
  // 懒编码：仅在对应窗口请求时做一次 PNG 编码（多屏各自独立，不互相阻塞）
  return img && !img.isEmpty() ? { dataUrl: img.toDataURL() } : null
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
  applyHotkey(hotkeyPref, onConflict)
}

export function unregisterSnipHotkey(): void {
  try { globalShortcut.unregister(hotkeyPref) } catch { /* 未注册 */ }
}

// ── R81: 热键偏好（预设白名单 + 运行时切换 + 回滚） ─────────────────────

export const PRESET_SNIP_HOTKEYS = PRESET_SNIP_HOTKEYS_SHARED
export { isPresetSnipHotkey }

let hotkeyPref: string = SNIP_HOTKEY

export function getSnipHotkeyPref(): string {
  return hotkeyPref
}

/** 启动时从持久化设置注入（须在 registerSnipHotkey 之前调用）。 */
export function initSnipHotkeyPref(accel: string): void {
  if (isPresetSnipHotkey(accel)) hotkeyPref = accel
}

function applyHotkey(cand: string, onConflict: (accel: string) => void): boolean {
  try { globalShortcut.unregister(hotkeyPref) } catch { /* 未注册 */ }
  globalShortcut.register(cand, () => { void startSnip() })
  // register 对冲突不抛错而是静默失败——isRegistered 仅当本应用注册成功才为 true
  if (!globalShortcut.isRegistered(cand)) {
    // 回滚：新键被占用，恢复旧键，托盘标签不变
    globalShortcut.register(hotkeyPref, () => { void startSnip() })
    onConflict(cand)
    return false
  }
  hotkeyPref = cand
  return true
}

/** R81.2: 运行时切换（校验白名单 → 重注册 → 失败回滚并回调冲突）。 */
export function setSnipHotkeyPref(accel: string, onConflict: (accel: string) => void): boolean {
  if (!isPresetSnipHotkey(accel)) return false
  if (accel === hotkeyPref) return true
  return applyHotkey(accel, onConflict)
}
