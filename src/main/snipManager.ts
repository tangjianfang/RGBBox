/**
 * snipManager — R80 独立全局截图工具（主进程侧）。
 *
 * 触发（托盘「截图」/ 全局热键 Alt+A）后：先 desktopCapturer 冻结所有屏
 * （先截后开窗，窗口不遮屏），再每屏 frameless 全屏置顶窗口显示冻结帧，
 * 渲染端 SnipView 负责拖选 + 就地标注。
 * R130 提速三层：①轻量 snip.html 入口（~250KB，摆脱 4.4MB 主 bundle 解析）；
 * ②启动空闲预热图形捕获栈 + 每屏隐藏预载窗口池（热键时 0 建窗成本）；
 * ③冻结帧 BGRA 位图直传（无 PNG 编码/base64/解码），渲染端绘制完成回
 * ack 才 show —— 「窗口出现 = 冻结画面就绪」。
 * 已知边界：secure desktop（锁屏/UAC）截不到 → 黑帧，ESC 可退。
 */
import { app, BrowserWindow, clipboard, desktopCapturer, globalShortcut, nativeImage, screen } from 'electron'
import { join } from 'node:path'
import { getLogger, type Logger } from '../shared/logger'
import { ipcChannels } from '../shared/ipc'
import type { SnipPushFrame } from '../shared/types'
import { PRESET_SNIP_HOTKEYS as PRESET_SNIP_HOTKEYS_SHARED, isPresetSnipHotkey } from '../shared/snipHotkeys'
import type { CaptureEntry } from './captureStore'

export const SNIP_HOTKEY = 'Alt+A'

/** R112: 会话期全局 Esc——热键触发的全屏窗在 Windows 前台锁下常拿不到键盘
 *  焦点，渲染层 keydown 收不到 Esc；主进程全局注册不依赖任何窗口焦点。 */
export const SNIP_CANCEL_ACCEL = 'Escape'

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

/** R130.4: 池重建决策（纯函数，供单测）——显示器增删映射到 destroy/create。 */
export function planPoolRebuild(poolIds: number[], displayIds: number[]): { destroy: number[]; create: number[] } {
  return {
    destroy: poolIds.filter((id) => !displayIds.includes(id)),
    create: displayIds.filter((id) => !poolIds.includes(id)),
  }
}

// ── 会话层 ─────────────────────────────────────────────────────────────

export type SnipDeps = { addPng: (dataUrl: string, kind: CaptureEntry['kind']) => CaptureEntry | null }

// 惰性取 logger（index.ts initLogger 之前不可调用，同 screensaverManager）
function log(): Logger {
  return getLogger()
}

const snipWindows = new Map<number, BrowserWindow>()
// R112.3: 会话内创建过的每一个窗口（含竞态重开被覆盖的）都记录在案——
// cancelSnip 必须能杀掉所有窗口，否则孤儿冻结帧会盖住整个屏幕且无法退出
const allSnipWindows = new Set<BrowserWindow>()
// R130.4: 常驻预热窗口池 —— app 就绪 +3s 为每屏预载 snip.html（隐藏），
// 热键触发直接取用（0 建窗成本）；会话结束销毁并后台重建（不复用，杜绝标注态残留）
const snipPool = new Map<number, BrowserWindow>()
/** 已完成页面加载的窗口（did-finish-load 之后 webContents.send 才不会丢）。 */
const loadedWindows = new WeakSet<BrowserWindow>()
/** R130.4: 帧绘制 ack 等待者（按窗口关联；show 等它，300ms 超时兜底）。 */
const framePaintedWaiters = new Map<BrowserWindow, () => void>()
let sessionActive = false
let snipStarting = false
let deps: SnipDeps | null = null
let isDev = false
let devUrl: string | undefined
let warmTimer: NodeJS.Timeout | null = null
let poolTimer: NodeJS.Timeout | null = null
let disposed = false

/** 显示器热插拔/分辨率变化 → 会话作废（冻结帧与实际屏幕错位）+ 池推倒重建。 */
function onDisplayChanged(): void {
  if (sessionActive) {
    log().info('Snip', 'display topology changed during session — cancelling')
    cancelSnip()
  }
  // R130.4: 池中窗口 bounds/帧尺寸随拓扑全部失效——推倒，随下一次预热重建
  for (const [, w] of snipPool) {
    if (!w.isDestroyed()) w.destroy()
  }
  snipPool.clear()
  warmSnipStack(1500)
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
  disposed = true
  screen.removeListener('display-added', onDisplayChanged)
  screen.removeListener('display-removed', onDisplayChanged)
  screen.removeListener('display-metrics-changed', onDisplayChanged)
  if (warmTimer) { clearTimeout(warmTimer); warmTimer = null }
  if (poolTimer) { clearTimeout(poolTimer); poolTimer = null }
  unregisterSnipHotkey()
  cancelSnip()
  for (const [, w] of snipPool) {
    if (!w.isDestroyed()) w.destroy()
  }
  snipPool.clear()
}

/** R130.1/R130.4: 统一窗口构造（池预载与会话即时创建共用）——不做登记，由调用方管理。 */
function createSnipWindow(displayId: number): BrowserWindow | null {
  const display = screen.getAllDisplays().find((x) => x.id === displayId)
  if (!display) return null
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
  win.webContents.on('did-finish-load', () => { loadedWindows.add(win) })
  // R112.3: Electron 层按键拦截（先于渲染层 JS）——即使渲染层脚本异常、
  // 或系统焦点异常导致 keydown 没进页面，Esc 也能在此处直接取消会话
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape' && sessionActive) {
      event.preventDefault()
      log().info('Snip', 'cancel via before-input-event')
      cancelSnip()
    }
  })
  // R130.4: 池窗口渲染进程崩溃 → 销毁剔除（下次会话走即时创建兜底）
  win.webContents.on('render-process-gone', (_event, details) => {
    log().warn('Snip', `snip window renderer gone (display ${displayId}): ${details.reason}`)
    if (snipPool.get(displayId) === win) {
      try { win.destroy() } catch { /* 已销毁 */ }
    }
  })
  // 关闭清理：池成员只出池；会话成员（Alt+F4/系统关闭）→ 整个会话收摊。
  // 竞态重入时 destroy(prev) 也会走这里——只清理仍指向自己的登记项
  win.on('closed', () => {
    const wasSession = snipWindows.get(displayId) === win
    if (wasSession) snipWindows.delete(displayId)
    if (snipPool.get(displayId) === win) snipPool.delete(displayId)
    allSnipWindows.delete(win)
    framePaintedWaiters.delete(win)
    if (wasSession && sessionActive) {
      log().info('Snip', 'cancel via window closed cascade')
      cancelSnip()
    }
  })
  const query = `snip=1&displayId=${displayId}`
  if (isDev && devUrl) {
    const base = devUrl.endsWith('/') ? devUrl.slice(0, -1) : devUrl
    win.loadURL(`${base}/snip.html?${query}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/snip.html'), { search: query })
  }
  return win
}

export async function startSnip(): Promise<boolean> {
  // R112.3: 防重入闸门必须在 await 之前置位——sessionActive 要等
  // desktopCapturer（~700ms）完成才写入，热键连触发会双开两套窗口
  if (sessionActive || snipStarting) return false
  snipStarting = true
  try {
    return await startSnipInner()
  } finally {
    // 成功路径 sessionActive=true 已接管防重入；这里必须复位，
    // 否则一次会话结束后闸门永久卡死，截图再也无法启动（R112 回归）
    snipStarting = false
  }
}

/** R112.3: desktopCapturer 在 Windows 上有已知卡死（销毁窗口后立刻再捕获，
 *  实测单次 stall 51s）——3s 超时 + 最多 3 次尝试，失败快速返回让用户重按。 */
async function getSourcesWithRetry(opts: Electron.SourcesOptions): Promise<Electron.DesktopCapturerSource[]> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await Promise.race([
      desktopCapturer.getSources(opts),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ])
    if (result) return result
    log().warn('Snip', `desktopCapturer stalled (attempt ${attempt}/3)`)
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  return []
}

async function startSnipInner(): Promise<boolean> {
  const t0 = Date.now()
  const displays = screen.getAllDisplays()
  if (displays.length === 0) return false
  // thumbnailSize 取所有屏物理像素的最大值：小屏返回原生分辨率（Chromium 不放大）
  const sizes = displays.map(physicalThumbSize)
  const maxW = Math.max(...sizes.map((s) => s.width))
  const maxH = Math.max(...sizes.map((s) => s.height))
  const sources = await getSourcesWithRetry({ types: ['screen'], thumbnailSize: { width: maxW, height: maxH } })
  const tCapture = Date.now() - t0
  const pairs = matchDisplayToSource(sources, displays)
  if (pairs.size === 0) {
    log().error('Snip', `no display source matched — abort (capture took ${tCapture}ms)`)
    return false
  }
  sessionActive = true
  // R112: 会话期接管全局 Esc（见 SNIP_CANCEL_ACCEL 注释）；注册失败仅告警——
  // 渲染层自身的 Esc/右键/X 按钮仍是兜底
  try {
    globalShortcut.register(SNIP_CANCEL_ACCEL, () => { log().info("Snip", "cancel via global Escape"); cancelSnip() })
    if (!globalShortcut.isRegistered(SNIP_CANCEL_ACCEL)) log().warn('Snip', 'global Escape unavailable — falling back to in-window cancel only')
  } catch (err) {
    log().warn('Snip', `global Escape register failed: ${err instanceof Error ? err.message : String(err)}`)
  }
  // R130: 每屏「池取窗/即时建窗 → 推 BGRA 位图 → 等绘制 ack → show」并行投递
  const presentMs = await Promise.all([...pairs].map(([displayId, src]) => presentSnipDisplay(displayId, src.thumbnail)))
  const slowest = Math.max(...presentMs)
  log().info('Snip', `session start — ${pairs.size} display(s); capture ${tCapture}ms, shown +${Date.now() - t0}ms (slowest present ${slowest}ms)`)
  return true
}

/** R130: 单屏投递 —— 池取窗（未命中即时创建）→ 推 BGRA → 等绘制 ack/300ms 超时 → show。 */
async function presentSnipDisplay(displayId: number, img: Electron.NativeImage): Promise<number> {
  const t0 = Date.now()
  let win: BrowserWindow | null = snipPool.get(displayId) ?? null
  if (win) {
    snipPool.delete(displayId)
    if (win.isDestroyed()) win = null
  }
  if (!win) win = createSnipWindow(displayId)
  if (!win) return -1
  // R112.3: 竞态重入（startSnip 双开）会覆盖登记表——先杀掉同屏旧窗口
  const prev = snipWindows.get(displayId)
  if (prev && prev !== win && !prev.isDestroyed()) prev.destroy()
  snipWindows.set(displayId, win)
  allSnipWindows.add(win)
  if (!img.isEmpty()) {
    const size = img.getSize()
    const frame: SnipPushFrame = { width: size.width, height: size.height, data: img.toBitmap() }
    const target = win
    const send = (): void => {
      try { target.webContents.send(ipcChannels.snipPushFrame, frame) } catch { /* 已销毁 */ }
    }
    if (loadedWindows.has(win)) send()
    else win.webContents.once('did-finish-load', send)
  }
  // R130.4: 等渲染端「已上屏」回执再 show（窗口出现=画面就绪）；超时兜底不卡死
  await Promise.race([
    new Promise<void>((resolve) => framePaintedWaiters.set(win, resolve)),
    new Promise<void>((resolve) => setTimeout(resolve, 300)),
  ])
  framePaintedWaiters.delete(win)
  presentWindow(win)
  return Date.now() - t0
}

function presentWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  win.show()
  if (process.platform === 'win32') win.setFullScreen(true)
  win.setAlwaysOnTop(true, 'screen-saver')
  win.moveTop()
  win.focus()
  // R112.3: Windows 前台锁下 win.focus() 可能不生效（尤其全局热键触发时
  // 没有任何前台窗口可移交焦点）——强制抢占，保证 Esc 键路径可用
  app.focus({ steal: true })
}

/** R130.3: 渲染端冻结帧绘制完成的回执 —— 唤醒对应窗口的 show 等待。 */
export function acknowledgeSnipPainted(sender: Electron.WebContents): void {
  for (const [win, resolve] of framePaintedWaiters) {
    if (!win.isDestroyed() && win.webContents === sender) resolve()
  }
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
  try { globalShortcut.unregister(SNIP_CANCEL_ACCEL) } catch { /* 未注册 */ }
  if (!sessionActive) return
  log().info('Snip', 'session cancelled')
  sessionActive = false
  // R112.3: 清所有窗口（含竞态孤儿）——destroy 会同步触发 closed，
  // closed 里读到的 sessionActive 已是 false，不会重入
  for (const win of allSnipWindows) {
    if (!win.isDestroyed()) win.destroy()
  }
  allSnipWindows.clear()
  snipWindows.clear()
  framePaintedWaiters.clear()
  // R130.4: 会话结束 → 后台重建预热池（不复用旧窗，杜绝标注态残留）
  schedulePoolRebuild()
}

function schedulePoolRebuild(): void {
  if (disposed) return
  if (poolTimer) clearTimeout(poolTimer)
  poolTimer = setTimeout(() => {
    poolTimer = null
    rebuildSnipPool()
  }, 200)
}

function rebuildSnipPool(): void {
  if (disposed) return
  const displayIds = screen.getAllDisplays().map((d) => d.id)
  const plan = planPoolRebuild([...snipPool.keys()], displayIds)
  for (const id of plan.destroy) {
    const w = snipPool.get(id)
    snipPool.delete(id)
    if (w && !w.isDestroyed()) w.destroy()
  }
  for (const id of plan.create) {
    const w = createSnipWindow(id)
    if (w) snipPool.set(id, w)
  }
  if (plan.destroy.length > 0 || plan.create.length > 0) {
    log().info('Snip', `pool rebuilt — ${snipPool.size} window(s) pooled`)
  }
}

/** R130.2/R130.4: 预热图形捕获栈（首次 getSources 要初始化 WGC/DXGI，~150-700ms）
 *  + 重建窗口池。延迟调用避开启动 IO 高峰；与会话互斥；失败静默（热键路径含
 *  R112.3 三重试保护，照旧可用）。 */
export function warmSnipStack(delayMs = 3000): void {
  if (disposed) return
  if (warmTimer) clearTimeout(warmTimer)
  warmTimer = setTimeout(() => {
    warmTimer = null
    void (async () => {
      if (disposed) return
      if (sessionActive || snipStarting) {
        warmSnipStack(2000)   // 会话进行中——稍后再试（单定时器，无泄漏）
        return
      }
      try {
        await getSourcesWithRetry({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } })
        log().info('Snip', 'capture stack warmed')
      } catch {
        /* 静默：预热失败不影响热键路径 */
      }
      rebuildSnipPool()
    })()
  }, delayMs)
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
