import { app, BrowserWindow, clipboard, desktopCapturer, dialog, ipcMain, Menu, nativeImage, nativeTheme, powerSaveBlocker, protocol, safeStorage, screen, session, shell, Tray } from 'electron'
import { access, mkdir, readdir, stat, unlink } from 'node:fs/promises'
import { createReadStream, createWriteStream, statSync, writeFileSync } from 'node:fs'
import { get as httpGet } from 'node:http'
import { get as httpsGet } from 'node:https'
import { pipeline } from 'node:stream/promises'
import { readFile, writeFile } from 'node:fs/promises'
import { join, basename, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { defaultProfile } from '../shared/defaultProfile'
import { createCaptureStore } from './captureStore'
import { recognizeImage } from './ocrService'
import { ipcChannels } from '../shared/ipc'
import { getLogger, initLogger } from '../shared/logger'
import { MODELS_MANIFEST } from '../shared/modelsManifest'
import { renderPreviewFrame, type AudioInput } from '../engine/previewEngine'
import type { AgentEvent, AiProfile, CaptureEntry, DesktopAudioSource, CaptureSource, EngineStatus, ModelDownloadProgress, OverlayConfig, Profile, ProcessCpuSample, RgbFrame, ScreenCaptureRequest } from '../shared/types'
import { getDisplayTopology } from './displayTopology'
import { runPerfSelfTest } from './perfSelfTest'
import { closeAllAudioVizWindows, closeAllOverlays, closeAudioVizWindow, closeOverlay, getAudioVizWindowIds, getOverlayDisplayIds, openAudioVizWindow, openOverlay, pushFrameToDisplay, pushFrameToOverlays, reopenOverlay, setOverlayClosedCallback } from './overlayManager'
import { armShutdown, cancelShutdown, getShutdownStatus } from './shutdownScheduler'
import { closeAllScreensaverWindows, disposeScreensaver, getScreensaverSettings, initScreensaver, setScreensaverSettings } from './screensaverManager'
import { acknowledgeSnipPainted, cancelSnip, disposeSnipManager, finishSnip, getSnipHotkeyPref, initSnipHotkeyPref, initSnipManager, isPresetSnipHotkey, registerSnipHotkey, setSnipHotkeyPref, startSnip, warmSnipStack } from './snipManager'
import { asUiLocale, trayMenuLabels, type UiLocale } from './trayMenu'
import { deleteProfile, listProfiles, loadProfile, loadProfileById, saveProfile, saveProfileAs } from './profileStore'
import { captureScreenFrame, captureVirtualScreenFrame } from './screenCapture'
import { getCaptureProviderStatus, initializeCaptureProviders } from './captureProviders'
import { initCrashLogging, listCrashLogs, exportCrashLog } from './crashLog'
import { loadSystemSettings, saveSystemSettings, type SystemSettings } from './systemSettingsStore'
import { ai8AutoLoginWith, clearAi8Credentials, loadAi8Credentials, saveAi8Credentials } from './ai8Credentials'
import { setRapidOcrRunner } from './ocrService'
import { cleanupOcrText, translateOcrText, chatCompletion, testConnection, DEFAULT_AI_SETTINGS, type AiCleanupSettings } from './aiCleanupService'
import { createAgentService } from './agentService'
import { ttsDownloadModels, ttsModelStatus, ttsSynthesize, type TtsDownloadEvent } from './ttsService'
import { type SafeStorageCodec } from './aiSecretCodec'
import { decodeProfileSecrets, encodeProfileSecrets, sanitizeAws } from './aiProfileStore'
import { autoProfileName, mergePreservedKeys, mirrorLegacy, normalizeAiStore, type AiStoreShape } from './aiProfileStore'

/** R89 review fix: random suffix — same-millisecond creates must not collide. */
function mintProfileId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
import { validateChatMessages } from '../shared/aiChatValidation'
import { initAudioAi, disposeAudioAi, isCached as audioAiIsCached, runVad as audioAiRunVadPcm, runAst as audioAiRunAstPcm, startStream as audioAiStartStream, feedStream as audioAiFeedStream, stopStream as audioAiStopStream } from './audioAiService'
import { Readable } from 'node:stream'
import { mediaStreamPlan, parseRangeHeader, resolveAppAssetPath, resolveMediaMime } from './mediaProtocol'
import { registerDenoiseService } from './denoiseService'

// Initialize file logger — must be done after imports but before app.whenReady
const log = initLogger(join(app.getPath('userData'), 'logs'), { minLevel: 'debug' })

// ── Single instance lock ──────────────────────────────────────────────────
log.info('App', `RGBBox starting, version=${app.getVersion()}, platform=${process.platform}`)
// R48.5: the --perf-selftest harness runs with an isolated --user-data-dir, so
// the single-instance lock serves no purpose there and (under rapid re-launch)
// has been observed to make a second run exit 0 immediately with no report.
// Skip the lock entirely when the harness flag is present.
const isPerfSelfTestRun = process.argv.includes('--perf-selftest')
const gotSingleLock = isPerfSelfTestRun || app.requestSingleInstanceLock()

// Register media:// as a privileged scheme so the renderer can load local
// audio files from any origin (http://localhost in dev, file:// in prod).
// Must be called BEFORE app is ready.
protocol.registerSchemesAsPrivileged([{
  scheme: 'media',
  privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}])
if (!gotSingleLock) {
  log.warn('App', 'Another instance is running, quitting.')
  app.quit()
  process.exit(0)
}

// R38: When the main window is OS-minimized (as opposed to Electron's own
// `.hide()`, used by the close-to-tray flow), Chromium's renderer-backgrounding
// heuristics kick in and aggressively downgrade the whole renderer process's
// scheduling priority — throttling the worker/tick pipeline that feeds frames
// to overlay windows and causing visible stutter on the projected displays,
// even though the overlay windows themselves have `backgroundThrottling:
// false`. `.hide()` does not trigger the same downgrade, which is why
// "hide to tray" stays smooth. These switches disable that backgrounding
// behaviour app-wide (must be set before `app.whenReady()`), so minimizing
// behaves the same as hiding from a performance standpoint without changing
// any window show/hide UX.
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
// R45: Windows-specific — Chromium's "Native Window Occlusion" feature polls
// the OS for whether a window is actually covered/minimized and throttles
// compositing for it independently of the generic backgrounding switches
// above. Because Electron's multiple BrowserWindows (main + overlay) share
// one GPU/compositor process, this has been reported (and matches user
// testing here: the overlay display kept rendering fine while the main
// window was minimized right after R38, but visibly stuttered once R43/R44
// also stopped the *tick loop* itself from being throttled — i.e. the CPU
// work was happening, but presentation to the overlay window was still being
// throttled by this separate occlusion mechanism) to also affect sibling
// windows' presentation rate, not just the occluded/minimized one. Disabling
// it removes that whole code path.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')

// R158.3: local-only crash visibility — must run before app ready (crashReporter
// requirement). submit:false keeps every dump on disk under userData/logs; the
// uncaughtException/unhandledRejection records land next to them, rotated.
// No network egress anywhere — the local-first stance is the point (R157).
initCrashLogging()

const isDevelopment = Boolean(process.env.ELECTRON_RENDERER_URL)

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
// R136: hidden vision pipeline host window (see registerIpc visionHostOpen)
let visionHostWindow: BrowserWindow | null = null
// R80.12: 界面语言（渲染层 i18n 同步过来）+ 托盘菜单重建句柄
let uiLocale: UiLocale = 'zh'
let rebuildTrayMenu: (() => void) | null = null
let isQuitting = false
let powerSaveBlockerId: number | null = null
// Capture source id pre-selected by the Video Studio for the next getDisplayMedia()
// call (see ipcChannels.selectCaptureSource + setDisplayMediaRequestHandler).
let pendingCaptureSourceId: string | null = null
let engineStatus: EngineStatus = {
  running: true,
  fps: defaultProfile.sampling.fps,
  output: 'virtual-preview'
}

// R44: module-level so both createMainWindow() (close-to-tray) and
// createTray() (tray icon double-click / context menu toggle) can call it
// explicitly at every point they programmatically hide/show the window,
// instead of relying solely on the 'hide'/'show' events — which do not
// reliably fire when hide() is called from inside a 'close' handler that
// just preventDefault()-ed the close (confirmed by user testing: minimize
// correctly lowered CPU, close-to-tray did not change it at all).
function sendMainWindowVisibility(visible: boolean): void {
  mainWindow?.webContents.send(ipcChannels.mainWindowVisibilityChanged, visible)
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
    title: 'RGBBox',
    backgroundColor: '#0f1418',
    show: false,
    // Remove native title bar; use Window Controls Overlay for seamless dark chrome
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#11191f',
      symbolColor: '#9cb7c3',
      height: 40
    },
    icon: join(__dirname, '../../build/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Prevent Chromium from throttling timers when the window is occluded
      // by the overlay (otherwise the render loop drops to ~1 fps)
      backgroundThrottling: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // R43: tell the renderer definitively when the window stops/starts being
  // visible to the user, so it can pause the effect-computation tick loop
  // (see App.tsx) instead of relying on document.hidden — which, after R38
  // disabled Chromium's occluded-window backgrounding, no longer reliably
  // reflects minimize state. R44: also called explicitly below (and in
  // createTray()) since the 'hide' event alone is not reliable for every path.
  mainWindow.on('minimize', () => sendMainWindowVisibility(false))
  mainWindow.on('restore', () => sendMainWindowVisibility(true))
  mainWindow.on('hide', () => sendMainWindowVisibility(false))
  mainWindow.on('show', () => sendMainWindowVisibility(true))

  // Close button → hide to tray (minimize to tray pattern).
  // isQuitting is set by the tray "Quit" action and app.on('before-quit').
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
      // R44: 'hide' does NOT reliably fire when hide() is called from inside
      // a 'close' handler that just preventDefault()-ed the close — this is
      // exactly this path, confirmed by user testing: minimize correctly
      // lowered CPU, close-to-tray did not change it at all. Send explicitly.
      sendMainWindowVisibility(false)
      tray?.displayBalloon?.({ title: 'RGBBox', content: '已最小化到系统托盘，右键托盘图标可退出。', iconType: 'info' })
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // F2 toggles DevTools (available in all builds for diagnostics)
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'F2') {
      if (mainWindow?.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools()
      } else {
        mainWindow?.webContents.openDevTools({ mode: 'detach' })
      }
    }
  })

  // F2 toggles DevTools in both dev and prod
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'F2' && input.type === 'keyDown') {
      mainWindow?.webContents.toggleDevTools()
    }
  })

  // R25: force the runtime window icon in packaged builds. BrowserWindow's `icon:`
  // option resolves `build/icon.ico` relative to `__dirname` (out/main/), which is
  // only present in dev; in prod the file lives under `process.resourcesPath/icon.ico`
  // (see extraResources in package.json). Without this override Windows falls back to
  // the PE RT_ICON that electron-builder left untouched (R23 keeps it off), so the
  // taskbar shows the Electron default. R26 fixes the PE icon for the .exe itself.
  {
    const isDev = !app.isPackaged
    const iconPath = process.platform === 'win32'
      ? (isDev ? join(__dirname, '../../build/icon.ico') : join(process.resourcesPath, 'icon.ico'))
      : (isDev ? join(__dirname, '../../build/icon.png') : join(process.resourcesPath, 'icon.png'))
    const img = nativeImage.createFromPath(iconPath)
    if (!img.isEmpty()) {
      mainWindow.setIcon(img)
    }
  }

  if (isDevelopment) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL!)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  log.info('IPC', 'Registering IPC handlers')
  ipcMain.handle(ipcChannels.getPowerSaveBlock, () => powerSaveBlockerId !== null)
  ipcMain.handle(ipcChannels.setPowerSaveBlock, async (_event, enable: boolean) => {
    log.info('Power', `Power save block ${enable ? 'enabled' : 'disabled'}`)
    if (enable && powerSaveBlockerId === null) {
      powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep')
    } else if (!enable && powerSaveBlockerId !== null) {
      powerSaveBlocker.stop(powerSaveBlockerId)
      powerSaveBlockerId = null
    }
    try {
      await saveSystemSettings({ powerSaveBlock: powerSaveBlockerId !== null })
    } catch (err) {
      log.error('Power', `Failed to persist power save block setting: ${err instanceof Error ? err.message : String(err)}`)
    }
    return powerSaveBlockerId !== null
  })

  ipcMain.handle(ipcChannels.getAutoLaunch, () => app.getLoginItemSettings().openAtLogin)
  ipcMain.handle(ipcChannels.setAutoLaunch, (_event, enable: boolean) => {
    log.info('System', `Auto-launch ${enable ? 'enabled' : 'disabled'}`)
    app.setLoginItemSettings({ openAtLogin: enable })
    return app.getLoginItemSettings().openAtLogin
  })

  // R73: OS-level scheduled shutdown (Windows)
  ipcMain.handle(ipcChannels.shutdownArm, (_event, seconds: number) => armShutdown(seconds))
  ipcMain.handle(ipcChannels.shutdownCancel, () => cancelShutdown())
  ipcMain.handle(ipcChannels.shutdownStatus, () => getShutdownStatus())

  // R74: light-effect screensaver settings
  ipcMain.handle(ipcChannels.screensaverGetSettings, () => getScreensaverSettings())
  ipcMain.handle(ipcChannels.screensaverSetSettings, (_event, settings: { enabled?: boolean; idleMinutes?: number }) =>
    setScreensaverSettings(settings, isDevelopment, process.env.ELECTRON_RENDERER_URL))

  // R76: native clipboard write-image — deterministic replacement for the
  // renderer's navigator.clipboard path (which failed in Electron practice);
  // invalid input returns false instead of throwing.
  ipcMain.handle(ipcChannels.clipboardWriteImage, (_event, dataUrl: unknown) => {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return false
    clipboard.writeImage(nativeImage.createFromDataURL(dataUrl))
    return true
  })

  // R77: persistent capture cache (filmstrip gallery)
  const captureStore = createCaptureStore(app.getPath('userData'))
  ipcMain.handle(ipcChannels.capturesList, () => captureStore.list())
  ipcMain.handle(ipcChannels.capturesAdd, (_event, dataUrl: unknown, kind: unknown) =>
    typeof dataUrl === 'string' && typeof kind === 'string'
      ? captureStore.addPng(dataUrl, kind as CaptureEntry['kind'])
      : null)
  ipcMain.handle(ipcChannels.capturesDelete, (_event, id: unknown) =>
    typeof id === 'string' ? captureStore.delete(id) : false)
  ipcMain.handle(ipcChannels.capturesRead, (_event, id: unknown) =>
    typeof id === 'string' ? captureStore.read(id) : null)
  ipcMain.handle(ipcChannels.capturesImport, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Import Images',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }],
    })
    if (result.canceled) return []
    return captureStore.importFiles(result.filePaths)
  })

  // R80: standalone global snip tool
  initSnipManager({ addPng: (url, kind) => captureStore.addPng(url, kind) }, isDevelopment, process.env.ELECTRON_RENDERER_URL)
  // R130.2/R130.4: 空闲 3s 预热图形捕获栈 + 每屏隐藏预载窗口池（热键→画面 <500ms 的关键）
  warmSnipStack(3000)
  // R82: RapidOCR 优先、WinRT 回退（dynamic import，避免 vitest node 环境加载原生模块）
  setRapidOcrRunner(null)
  void import('./rapidOcrService').then(async (m) => {
    m.initRapidOcr(m.resolveRapidOcrDir())   // R82.6: 内置优先，在线下载兜底
    setRapidOcrRunner(m.recognizeWithRapid)
  }).catch((err) => {
    log.warn('RapidOcr', `dynamic import failed, WinRT only: ${err instanceof Error ? err.message : String(err)}`)
  })
  // R130.3: 渲染端冻结帧绘制完成回执 —— 唤醒对应窗口的 show 等待（按 sender 关联）
  ipcMain.on(ipcChannels.snipFramePainted, (event) => acknowledgeSnipPainted(event.sender))
  ipcMain.handle(ipcChannels.snipFinish, (_event, p: unknown) => {
    const q = p as { dataUrl?: unknown; action?: unknown } | null
    return finishSnip(
      typeof q?.dataUrl === 'string' ? q.dataUrl : '',
      q?.action === 'save' ? 'save' : 'copy',
    )
  })
  ipcMain.on(ipcChannels.snipCancel, (event) => {
    // R112 诊断：确认取消请求来自哪个窗口（sender id vs snip 窗口 id）
    const senders = BrowserWindow.getAllWindows().map((w) => `${w.id}${w.isDestroyed() ? '!' : ''}`).join(',')
    getLogger().info('Snip', `cancel via IPC from sender #${event.sender.id} (windows: ${senders})`)
    cancelSnip()
  })
  // R80.12: 界面语言切换 → 重建托盘菜单（含启动时同步持久化语言）
  ipcMain.on(ipcChannels.uiSetLocale, (_event, l: unknown) => {
    uiLocale = asUiLocale(l)
    rebuildTrayMenu?.()
  })
  // R81: global snip hotkey preference (preset whitelist; re-register + persist + rebuild tray label)
  ipcMain.handle(ipcChannels.snipGetHotkey, () => getSnipHotkeyPref())
  ipcMain.handle(ipcChannels.snipSetHotkey, (_event, accel: unknown) => {
    const ok = setSnipHotkeyPref(
      typeof accel === 'string' && isPresetSnipHotkey(accel) ? accel : '',
      (k) => {
        tray?.displayBalloon?.({ title: 'RGBBox', content: `全局热键 ${k} 已被其他应用占用，已保留原热键。`, iconType: 'info' })
      },
    )
    if (ok) {
      rebuildTrayMenu?.()
      void saveSystemSettings({ snip: { hotkey: getSnipHotkeyPref() } }).catch(() => { /* best-effort */ })
    }
    return { ok, hotkey: getSnipHotkeyPref() }
  })
  // R83: OCR AI-cleanup settings + invoke (OpenAI-compatible chat API)
  // R88.4: safeStorage-backed codec for the AI api key at rest (DPAPI on Windows).
  const safeStorageCodec: SafeStorageCodec = {
    encrypt: (plain) => {
      try {
        return safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(plain) : null
      } catch {
        return null
      }
    },
    decrypt: (data) => {
      try {
        return safeStorage.decryptString(Buffer.from(data))
      } catch {
        return null
      }
    },
  }
  // R89 review fix: profile mutations are read-modify-write on system.json and
  // ipcMain does not serialize invokes — chain them through a promise queue so
  // overlapping renderer calls (auto-save racing a profile switch) can't lose
  // each other's updates.
  let aiStoreQueue: Promise<unknown> = Promise.resolve()
  const runAiStoreOp = <T,>(fn: () => Promise<T>): Promise<T> => {
    const p = aiStoreQueue.then(fn, fn)
    aiStoreQueue = p.then(() => undefined, () => undefined)
    return p
  }
  // R89.3: multi-profile store. Normalize (with legacy single-config migration),
  // decode keys, and flag undecodable ciphertexts per profile. `raw` keeps the
  // pre-decode entries so persist can restore unreadable ciphertexts (R89 review fix).
  const loadAiStore = async (): Promise<{ profiles: AiProfile[]; raw: AiProfile[]; activeId: string; unreadableIds: string[] }> => {
    const s = await loadSystemSettings()
    const { profiles: raw, activeId } = normalizeAiStore(s.ai as AiStoreShape)
    const unreadableIds: string[] = []
    const decoded = raw.map((p) => {
      // R145: one helper decodes BOTH secret kinds (Bearer key + AWS SK/STS)
      const { profile, unreadable } = decodeProfileSecrets(p, safeStorageCodec)
      if (unreadable) unreadableIds.push(p.id)
      return profile
    })
    return { profiles: decoded, raw, activeId, unreadableIds }
  }
  const persistAiStore = async (
    profiles: AiProfile[],
    activeId: string,
    unreadableIds: string[] = [],
    raw: AiProfile[] = []
  ): Promise<void> => {
    const preserved = mergePreservedKeys(profiles, raw, unreadableIds)
    const encrypted = preserved.map((p) => encodeProfileSecrets(p, safeStorageCodec))
    // R89 review fix: reuse the encrypted entry for the legacy mirror instead of
    // a second DPAPI encrypt (which would produce a different blob of the same key).
    const encryptedActive = encrypted.find((p) => p.id === activeId) ?? null
    await saveSystemSettings({
      ai: {
        profiles: encrypted,
        activeProfileId: activeId,
        ...mirrorLegacy(encryptedActive),
      },
    }).catch(() => { /* best-effort */ })
  }
  const activeSettings = (profiles: AiProfile[], activeId: string): AiCleanupSettings => {
    const active = profiles.find((p) => p.id === activeId)
    return active
      ? { baseUrl: active.baseUrl, apiKey: active.apiKey, model: active.model, ...(active.aws ? { aws: active.aws } : {}) }
      : { ...DEFAULT_AI_SETTINGS }
  }
  /** Legacy alias kept for the OCR pipeline handlers: settings of the ACTIVE profile.
   *  R89 review fix: decode ONLY the active key (was: one DPAPI decrypt per profile
   *  on every OCR/chat hot-path invoke). */
  const asAiSettings = (ai: SystemSettings['ai']): AiCleanupSettings => {
    const { profiles, activeId } = normalizeAiStore(ai as AiStoreShape)
    const active = profiles.find((p) => p.id === activeId)
    if (!active) return { ...DEFAULT_AI_SETTINGS }
    // R145: decode apiKey AND the AWS secrets of the active profile in one go
    const { profile } = decodeProfileSecrets(active, safeStorageCodec)
    return { baseUrl: profile.baseUrl, apiKey: profile.apiKey, model: profile.model, ...(profile.aws ? { aws: profile.aws } : {}) }
  }
  ipcMain.handle(ipcChannels.aiGetSettings, async () => {
    const { profiles, activeId, unreadableIds } = await loadAiStore()
    const cfg = activeSettings(profiles, activeId)
    const keyUnreadable = unreadableIds.includes(activeId)
    if (keyUnreadable) console.warn('[RGBBox] stored AI key could not be decrypted on this machine/account')
    return { ...cfg, keyUnreadable, encryptionAvailable: safeStorage.isEncryptionAvailable() }
  })
  ipcMain.handle(ipcChannels.aiSetSettings, async (_event, p: unknown) =>
    runAiStoreOp(async () => {
      // Legacy alias (R89.3): write into the ACTIVE profile (create one if none).
      const q = p as Partial<AiCleanupSettings> | null
      const cfg: AiCleanupSettings = {
        baseUrl: typeof q?.baseUrl === 'string' && q.baseUrl.trim() !== '' ? q.baseUrl.trim() : DEFAULT_AI_SETTINGS.baseUrl,
        apiKey: typeof q?.apiKey === 'string' ? q.apiKey.trim() : '',
        model: typeof q?.model === 'string' && q.model.trim() !== '' ? q.model.trim() : DEFAULT_AI_SETTINGS.model,
      }
      const { profiles, raw, activeId, unreadableIds } = await loadAiStore()
      const idx = profiles.findIndex((pr) => pr.id === activeId)
      if (idx >= 0) {
        profiles[idx] = { ...profiles[idx], ...cfg }
      } else {
        profiles.push({ id: mintProfileId(), name: autoProfileName(cfg.baseUrl, cfg.model), ...cfg })
      }
      const nextActive = idx >= 0 ? activeId : profiles[profiles.length - 1].id
      if (cfg.apiKey !== '' && !safeStorage.isEncryptionAvailable()) {
        console.warn('[RGBBox] safeStorage unavailable — AI key stored in plaintext')
      }
      await persistAiStore(profiles, nextActive, unreadableIds, raw)
      return cfg
    })
  )
  // R89.3: named profile CRUD
  ipcMain.handle(ipcChannels.aiGetProfiles, async () => {
    const { profiles, activeId, unreadableIds } = await loadAiStore()
    return { profiles, activeId, unreadableIds, encryptionAvailable: safeStorage.isEncryptionAvailable() }
  })
  ipcMain.handle(ipcChannels.aiSaveProfile, async (_event, p: unknown) =>
    runAiStoreOp(async () => {
      const q = p as Partial<AiProfile> | null
      const baseUrl = typeof q?.baseUrl === 'string' && q.baseUrl.trim() !== '' ? q.baseUrl.trim() : DEFAULT_AI_SETTINGS.baseUrl
      const model = typeof q?.model === 'string' && q.model.trim() !== '' ? q.model.trim() : DEFAULT_AI_SETTINGS.model
      // R145: AWS credentials ride along sanitized (string members only);
      // persistAiStore encrypts SK/STS exactly like the Bearer key.
      const aws = sanitizeAws((q as { aws?: unknown } | null)?.aws)
      const profile: AiProfile = {
        id: typeof q?.id === 'string' && q.id !== '' ? q.id : mintProfileId(),
        name: typeof q?.name === 'string' && q.name.trim() !== '' ? q.name.trim() : autoProfileName(baseUrl, model),
        baseUrl,
        apiKey: typeof q?.apiKey === 'string' ? q.apiKey.trim() : '',
        model,
        ...(aws !== undefined ? { aws } : {}),
      }
      const { profiles, raw, activeId, unreadableIds } = await loadAiStore()
      const idx = profiles.findIndex((pr) => pr.id === profile.id)
      if (idx >= 0) profiles[idx] = profile
      else profiles.push(profile)
      if (profile.apiKey !== '' && !safeStorage.isEncryptionAvailable()) {
        console.warn('[RGBBox] safeStorage unavailable — AI key stored in plaintext')
      }
      await persistAiStore(profiles, activeId, unreadableIds, raw) // saving does NOT change the active profile
      return profile
    })
  )
  ipcMain.handle(ipcChannels.aiDeleteProfile, async (_event, id: unknown) =>
    runAiStoreOp(async () => {
      if (typeof id !== 'string') return
      const { profiles, raw, activeId, unreadableIds } = await loadAiStore()
      const next = profiles.filter((p) => p.id !== id)
      const nextActive = activeId === id ? (next[0]?.id ?? '') : activeId
      await persistAiStore(next, nextActive, unreadableIds, raw)
    })
  )
  ipcMain.handle(ipcChannels.aiSetActiveProfile, async (_event, id: unknown) =>
    runAiStoreOp(async () => {
      if (typeof id !== 'string') return
      const { profiles, raw, unreadableIds } = await loadAiStore()
      if (!profiles.some((p) => p.id === id)) return
      await persistAiStore(profiles, id, unreadableIds, raw)
    })
  )
  ipcMain.handle(ipcChannels.aiCleanupText, async (_event, text: unknown) => {
    const s = await loadSystemSettings()
    return cleanupOcrText(typeof text === 'string' ? text : '', asAiSettings(s.ai))
  })
  // R84.3: OCR 中英互译（同一 OpenAI 兼容配置）
  ipcMain.handle(ipcChannels.aiTranslateText, async (_event, text: unknown) => {
    const s = await loadSystemSettings()
    return translateOcrText(typeof text === 'string' ? text : '', asAiSettings(s.ai))
  })

  // R88.2/R89.3: connection test (optionally against an explicit, unsaved profile)
  // + multi-turn chat (payload validated, never throws). Both use the ACTIVE profile
  // unless a valid explicit profile is passed.
  ipcMain.handle(ipcChannels.aiTestConnection, async (_event, profile?: unknown) => {
    const q = profile as Partial<AiCleanupSettings> | null | undefined
    if (q && typeof q === 'object' && typeof q.baseUrl === 'string' && q.baseUrl.trim() !== ''
      && typeof q.apiKey === 'string' && typeof q.model === 'string') {
      const aws = sanitizeAws((q as { aws?: unknown }).aws)
      return testConnection({
        baseUrl: q.baseUrl, apiKey: q.apiKey, model: q.model,
        ...(aws !== undefined ? { aws } : {}),
      })
    }
    const s = await loadSystemSettings()
    return testConnection(asAiSettings(s.ai))
  })

  // R121: remembered AI8 credentials — the site's login window never restores
  // its session (a valid 10-year token in the partition still hits the login
  // form), so the app signs itself in via POST /user/login. The password is
  // safeStorage-encrypted at rest and never crosses IPC after the save.
  ipcMain.handle(ipcChannels.ai8SaveCredentials, (_event, account: unknown, password: unknown) => {
    if (typeof account !== 'string' || typeof password !== 'string' || account.trim() === '' || password === '') {
      return { ok: false }
    }
    saveAi8Credentials(app.getPath('userData'), safeStorageCodec, { account, password })
    return { ok: true }
  })
  ipcMain.handle(ipcChannels.ai8ClearCredentials, () => {
    clearAi8Credentials(app.getPath('userData'))
    return { ok: true }
  })
  ipcMain.handle(ipcChannels.ai8AutoLogin, async () => {
    const cred = loadAi8Credentials(app.getPath('userData'), safeStorageCodec)
    if (cred === null) return { ok: false as const, reason: 'no-credentials' }
    return ai8AutoLoginWith(cred, process.env.RGBBOX_AI8_BASE_URL)
  })

  // R126: folder-batch draw — pick a folder of scene MD files. The dialog,
  // the listing (top-level *.md) and the reads all live main-side; the
  // renderer only receives names + contents. `ai8BatchFolder` also becomes
  // the ONLY folder a save-image call may write into (this session's pick).
  let ai8BatchFolder: string | null = null
  ipcMain.handle(ipcChannels.ai8PickMdFolder, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '选择 MD 场景文件夹（仅顶层 *.md，按文件名自然排序）',
    })
    const folder = result.filePaths[0]
    if (folder === undefined) return { folder: '', files: [] }
    let names: string[] = []
    try {
      names = (await readdir(folder)).filter((n) => n.toLowerCase().endsWith('.md'))
    } catch {
      return { folder: '', files: [] }
    }
    const files: { name: string; content: string }[] = []
    for (const name of names) {
      try {
        files.push({ name, content: await readFile(join(folder, name), 'utf-8') })
      } catch {
        // unreadable entry — skip it; the batch records the file as failed
      }
    }
    ai8BatchFolder = folder
    return { folder, files }
  })
  ipcMain.handle(ipcChannels.ai8SaveImageToFolder, async (_event, folder: unknown, fileName: unknown, dataUrl: unknown) => {
    // path containment: the folder must be THIS session's pick, the file name
    // is sanitized — the renderer never dictates an absolute path
    if (typeof folder !== 'string' || typeof fileName !== 'string' || typeof dataUrl !== 'string' || folder === '' || ai8BatchFolder !== folder) return null
    const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,/)
    if (match === null) return null
    const safe = fileName.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 120)
    if (safe === '') return null
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1]
    try {
      const path = join(folder, `${safe}.${ext}`)
      await writeFile(path, Buffer.from(dataUrl.slice(match[0].length), 'base64'))
      return path
    } catch (err) {
      log.warn('ai8', `ai8SaveImageToFolder failed: ${String(err)}`)
      return null
    }
  })

  // R111: AI8 embedded login. Opens the official site in a child window with a
  // persistent partition (the site keeps its own session), polls its
  // localStorage for the GoAmzAI userStore token, and resolves the invoking
  // renderer with the captured token. Single-flight: one login window at a time.
  let ai8LoginWindow: BrowserWindow | null = null
  ipcMain.handle(ipcChannels.ai8OpenLogin, async (_event, p?: unknown) => {
    const fresh = (p as { fresh?: unknown } | null | undefined)?.fresh === true
    if (ai8LoginWindow && !ai8LoginWindow.isDestroyed()) {
      ai8LoginWindow.focus()
      return { ok: false as const }
    }
    const workArea = screen.getPrimaryDisplay().workArea
    const width = Math.min(1280, Math.round(workArea.width * 0.85))
    const height = Math.min(860, Math.round(workArea.height * 0.85))
    const win = new BrowserWindow({
      width,
      height,
      x: workArea.x + Math.round((workArea.width - width) / 2),
      y: workArea.y + Math.round((workArea.height - height) / 2),
      title: 'AI8 登录',
      autoHideMenuBar: true,
      webPreferences: {
        // Login flow for an external site — nodeIntegration stays off; the only
        // privileged reader is main via executeJavaScript below.
        nodeIntegration: false,
        contextIsolation: true,
        partition: 'persist:ai8',
      },
    })
    // R129b: the site rejects logins from embedded browsers (works in regular
    // Chrome) — present a clean Chrome UA for this window only.
    win.webContents.setUserAgent(win.webContents.getUserAgent().replace(/\s*Electron\/[\d.]+/i, ''))
    ai8LoginWindow = win
    let poller: ReturnType<typeof setInterval> | null = null
    const stopPolling = () => {
      if (poller !== null) {
        clearInterval(poller)
        poller = null
      }
    }
    return new Promise<{ ok: boolean; token?: string; account?: string }>((resolve) => {
      let settled = false
      const openedAt = Date.now()
      let reloadedForToken = false
      const finish = (result: { ok: boolean; token?: string; account?: string }) => {
        if (settled) return
        settled = true
        stopPolling()
        resolve(result)
      }
      win.on('closed', () => {
        ai8LoginWindow = null
        finish({ ok: false })
      })
      // GoAmzAI keeps a freshly-signed-in token in memory only — localStorage's
      // auth.token fills in on the NEXT page load. So: token present → capture;
      // signed-in (user.isLogin, a real site field) but tokenless → reload once
      // to force the persist, then let the normal poll take over.
      const readState = async (): Promise<{ token: string; account: string; signedIn: boolean } | null> => {
        if (win.isDestroyed()) return null
        try {
          return await win.webContents.executeJavaScript(
            `(() => { try { const raw = localStorage.getItem('userStore'); if (!raw) return { token: '', account: '', signedIn: false }; const u = JSON.parse(raw); const t = typeof u?.auth?.token === 'string' ? u.auth.token : ''; const usr = u?.user && typeof u.user === 'object' ? u.user : null; const signedIn = !!usr && (usr.isLogin === true || (typeof usr.uid === 'number' && usr.uid > 0) || usr.id !== undefined || (typeof usr.username === 'string' && usr.username !== '')); const a = usr ? (usr.nickname || usr.account || usr.email || usr.username || '') : ''; return { token: t, account: String(a), signedIn }; } catch { return { token: '', account: '', signedIn: false }; } })()`,
          )
        } catch {
          return null
        }
      }
      const handleState = (state: { token: string; account: string; signedIn: boolean } | null) => {
        if (state === null || settled) return
        if (state.token !== '') {
          finish({ ok: true, token: state.token, account: state.account })
          setTimeout(() => { if (!win.isDestroyed()) win.close() }, 800)
          return
        }
        if (state.signedIn && !reloadedForToken && Date.now() - openedAt > 5000) {
          reloadedForToken = true
          if (!win.isDestroyed()) win.webContents.reload()
        }
      }
      // R129b: token-replacement flow passes fresh=true — a stale userStore
      // (auth token the site already invalidated) made the poller capture the
      // dead token and auto-close the window before the user could log in
      // ("开窗即闪退"). Clear the partition's site storage first so the flow
      // starts from a clean logged-out state.
      if (fresh) {
        void win.webContents.session.clearStorageData({ storages: ['localstorage', 'cookies', 'indexdb'] })
          .catch(() => undefined)
          .then(() => { if (!win.isDestroyed()) win.loadURL('https://ai8.rcouyi.com/').catch(() => undefined) })
      } else {
        void win.loadURL('https://ai8.rcouyi.com/').catch(() => undefined)
      }
      win.webContents.on('did-navigate', () => {
        void readState().then(handleState)
      })
      poller = setInterval(() => {
        void readState().then(handleState)
      }, 1500)
    })
  })

  // R117.5: AI8 artifact cache — write generated docs (html/md/…) and images
  // (data URLs) under userData/ai8-artifacts, and reveal them in Explorer.
  ipcMain.handle(ipcChannels.ai8SaveArtifact, async (_event, name: unknown, content: unknown) => {
    if (typeof name !== 'string' || typeof content !== 'string' || name === '' || content === '') return null
    const safe = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 120)
    const dir = join(app.getPath('userData'), 'ai8-artifacts')
    try {
      await mkdir(dir, { recursive: true })
      // P2-4 review fix: ms precision + random suffix — two saves within the
      // same second must not silently overwrite each other
      const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const path = join(dir, `${stamp}-${safe}`)
      if (content.startsWith('data:')) {
        const match = content.match(/^data:[^,]+,/)
        const bin = Buffer.from(content.slice(match ? match[0].length : 5), 'base64')
        await writeFile(path, bin)
      } else {
        await writeFile(path, content, 'utf8')
      }
      return path
    } catch (err) {
      log.warn('ai8', `ai8SaveArtifact failed: ${String(err)}`)
      return null
    }
  })
  ipcMain.handle(ipcChannels.ai8ShowItemInFolder, (_event, path: unknown) => {
    // P2-5 review fix: only reveal items inside the artifacts dir — the path
    // originates from the renderer and must stay contained
    if (typeof path !== 'string' || path === '') return false
    const dir = join(app.getPath('userData'), 'ai8-artifacts')
    if (!path.startsWith(dir + sep)) return false
    shell.showItemInFolder(path)
    return true
  })
  ipcMain.handle(ipcChannels.aiChat, async (_event, p: unknown) => {
    const messages = validateChatMessages(p)
    if (messages === null) return { ok: false, text: '', hint: 'parse', latencyMs: 0 }
    const s = await loadSystemSettings()
    return chatCompletion(messages, asAiSettings(s.ai), { temperature: 0.7 })
  })

  // ── R172: coding-agent workbench (kernel engine + approval loop) ─────────
  const agentPush = (ev: AgentEvent): void => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(ipcChannels.agentEvent, ev)
  }
  const agentSvc = createAgentService({
    resolveSettings: async (profileId) => {
      const { profiles, activeId } = await loadAiStore()
      const target = profiles.find((p) => p.id === (profileId && profileId !== '' ? profileId : activeId))
        ?? profiles.find((p) => p.id === activeId)
      if (!target) return { ...DEFAULT_AI_SETTINGS }
      const { profile } = decodeProfileSecrets(target, safeStorageCodec)
      return { baseUrl: profile.baseUrl, apiKey: profile.apiKey, model: profile.model, ...(profile.aws ? { aws: profile.aws } : {}) }
    },
    pushEvent: agentPush,
    sessionsDir: join(app.getPath('userData'), 'agent-sessions'),
    auditPath: join(app.getPath('userData'), 'logs', 'agent-audit.jsonl'),
  })
  ipcMain.handle(ipcChannels.agentSend, async (_event, p: unknown) => {
    const a = p as { text?: unknown; profileId?: unknown; workspace?: unknown; mode?: unknown; sessionId?: unknown; modelOverride?: unknown }
    if (typeof a.text !== 'string' || a.text.trim() === '' || typeof a.workspace !== 'string' || a.workspace.trim() === '') {
      return { ok: false, sessionId: '', error: 'parse' }
    }
    const mode = a.mode === 'plan' || a.mode === 'trust' ? a.mode : 'standard'
    return agentSvc.send({ text: a.text, profileId: typeof a.profileId === 'string' ? a.profileId : undefined, workspace: a.workspace, mode, sessionId: typeof a.sessionId === 'string' ? a.sessionId : undefined, modelOverride: typeof a.modelOverride === 'string' ? a.modelOverride : undefined })
  })
  ipcMain.handle(ipcChannels.agentCancel, () => { agentSvc.cancel(); return { ok: true } })
  ipcMain.handle(ipcChannels.agentApprovalRespond, (_event, p: unknown) => {
    const a = p as { id?: unknown; decision?: unknown }
    if (typeof a.id === 'string' && (a.decision === 'once' || a.decision === 'always' || a.decision === 'deny')) {
      agentSvc.respondApproval(a.id, a.decision)
    }
    return { ok: true }
  })
  ipcMain.handle(ipcChannels.agentSessionsList, () => agentSvc.sessionsList())
  ipcMain.handle(ipcChannels.agentSessionLoad, (_event, p: unknown) => {
    const id = typeof p === 'string' ? p : (p as { id?: unknown })?.id
    return agentSvc.sessionLoad(typeof id === 'string' ? id : '')
  })
  ipcMain.handle(ipcChannels.agentPickWorkspace, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  // ── R173-S2/R179: offline TTS (Kokoro) — own downloader + WAV export ────────
  const ttsCacheRoot = join(app.getPath('userData'), 'models')
  let ttsDownloading = false
  ipcMain.handle(ipcChannels.ttsEngineStatus, () => ttsModelStatus(ttsCacheRoot))
  ipcMain.handle(ipcChannels.ttsModelDownload, async (_event, p: unknown) => {
    if (ttsDownloading) return { ok: false, error: 'already-downloading' }
    // R185: a string[] payload narrows the run to those files (per-file retry)
    const only = Array.isArray(p) && p.every((x) => typeof x === 'string') ? (p as string[]) : undefined
    ttsDownloading = true
    const push = (ev: TtsDownloadEvent): void => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(ipcChannels.ttsModelProgress, ev)
    }
    try {
      return await ttsDownloadModels(ttsCacheRoot, push, undefined, { only })
    } finally {
      ttsDownloading = false
    }
  })
  ipcMain.handle(ipcChannels.ttsSynthesize, async (_event, p: unknown) => {
    const a = p as { segments?: unknown; voice?: unknown; speed?: unknown }
    if (!Array.isArray(a.segments) || a.segments.some((x) => typeof x !== 'string')) return { ok: false, error: 'parse' }
    return ttsSynthesize(a.segments as string[], {
      voice: typeof a.voice === 'string' ? a.voice : undefined,
      speed: typeof a.speed === 'number' ? a.speed : undefined,
      cacheDir: join(app.getPath('userData'), 'models'),
    })
  })
  ipcMain.handle(ipcChannels.ttsExport, async (_event, p: unknown) => {
    const a = p as { segments?: unknown; voice?: unknown; speed?: unknown }
    if (!Array.isArray(a.segments)) return { ok: false, error: 'parse' }
    const out = await ttsSynthesize(a.segments as string[], {
      voice: typeof a.voice === 'string' ? a.voice : undefined,
      speed: typeof a.speed === 'number' ? a.speed : undefined,
      cacheDir: join(app.getPath('userData'), 'models'),
    })
    if (!out.ok || !out.wav) return { ok: false, error: out.error ?? 'synthesis' }
    const target = await dialog.showSaveDialog({
      title: 'Export WAV',
      defaultPath: `voicescribe-${new Date().toISOString().slice(0, 10)}.wav`,
      filters: [{ name: 'WAV audio', extensions: ['wav'] }],
    })
    if (target.canceled || target.filePath === '') return { ok: false, error: 'cancelled' }
    writeFileSync(target.filePath, out.wav)
    return { ok: true, path: target.filePath }
  })

  // R90 P1: audio AI test lab (VAD + AST). pcm = mono Float32Array @16kHz.
  // R90 review fix: per-model caps (VAD 30s, AST 10s — main-thread mel+inference
  // freeze bound) and distinct failure hints (not-downloaded vs inference vs parse).
  const assertPcm16k = (p: unknown, maxSamples: number): Float32Array | null => {
    if (!(p instanceof Float32Array)) return null
    return p.length >= 16000 && p.length <= maxSamples ? p : null
  }
  const audioHintOf = (err: unknown): 'not-downloaded' | 'inference' | 'parse' => {
    const hint = (err as { hint?: string }).hint
    if (hint === 'not-downloaded') return 'not-downloaded'
    return 'inference'
  }
  ipcMain.handle(ipcChannels.audioAiStatus, async () => ({
    sileroCached: await audioAiIsCached('silero_vad.onnx'),
    astCached: await audioAiIsCached('ast_audioset_int8.onnx'),
  }))
  ipcMain.handle(ipcChannels.audioAiRunVad, async (_event, pcm: unknown) => {
    const valid = assertPcm16k(pcm, 16000 * 30)
    if (valid === null) return { ok: false, hint: 'parse' }
    try {
      const r = await audioAiRunVadPcm(valid)
      return { ok: true, prob: r.prob, frames: r.frames }
    } catch (err) {
      return { ok: false, hint: audioHintOf(err) }
    }
  })
  ipcMain.handle(ipcChannels.audioAiRunAst, async (_event, pcm: unknown) => {
    const valid = assertPcm16k(pcm, 16000 * 10)
    if (valid === null) return { ok: false, hint: 'parse' }
    try {
      return { ok: true, top: (await audioAiRunAstPcm(valid)).top }
    } catch (err) {
      return { ok: false, hint: audioHintOf(err) }
    }
  })
  // R90.8: streaming detection session (feeds ~300ms of 16kHz mono each)
  ipcMain.handle(ipcChannels.audioAiStreamStart, async () => { audioAiStartStream() })
  ipcMain.handle(ipcChannels.audioAiStreamStop, async () => { audioAiStopStream() })
  ipcMain.handle(ipcChannels.audioAiStreamFeed, async (_event, pcm: unknown) => {
    if (!(pcm instanceof Float32Array) || pcm.length === 0 || pcm.length > 16000 * 5) {
      return { ok: false, hint: 'parse' }
    }
    try {
      const r = await audioAiFeedStream(pcm)
      // R90.9 review fix: rms/astState must cross the IPC — the renderer's
      // level gauge, 'inferring' stage and self-test RMS row all read them.
      return { ok: true, prob: r.prob, rms: r.rms, astState: r.astState, top: r.top, astError: r.astError }
    } catch (err) {
      // R90.9: ship the raw message too — 'pipeline lost' hid the root cause.
      log.warn('AudioAi', `stream feed failed: ${err instanceof Error ? err.message : String(err)}`)
      return { ok: false, hint: audioHintOf(err), message: err instanceof Error ? err.message : String(err) }
    }
  })

  // R78: clipboard text (annotator copy/paste) + native OCR
  ipcMain.handle(ipcChannels.clipboardWriteText, (_event, text: unknown) => {
    if (typeof text !== 'string') return false
    clipboard.writeText(text)
    return true
  })
  // R116: dual-format write so pasting into Word/mail keeps the document
  // structure (headings/lists/code blocks) instead of flat text
  ipcMain.handle(ipcChannels.clipboardWriteRich, (_event, text: unknown, html: unknown) => {
    if (typeof text !== 'string' || typeof html !== 'string') return false
    clipboard.write({ text, html })
    return true
  })
  ipcMain.handle(ipcChannels.clipboardReadText, () => clipboard.readText())
  ipcMain.handle(ipcChannels.ocrRecognize, (_event, dataUrl: unknown) =>
    typeof dataUrl === 'string' ? recognizeImage(dataUrl) : Promise.resolve({ ok: false, text: '', hint: 'decode' }))

  ipcMain.handle(ipcChannels.appVersion, () => app.getVersion())
  ipcMain.handle(ipcChannels.getDisplayTopology, () => getDisplayTopology())
  ipcMain.handle(ipcChannels.getDefaultProfile, () => loadProfile())
  ipcMain.handle(ipcChannels.saveProfile, (_event, profile: Profile) => {
    log.info('Profile', `Saving active profile: id=${profile.id}, name="${profile.name}"`)
    return saveProfile(profile)
  })
  ipcMain.handle(ipcChannels.getEngineStatus, () => engineStatus)
  ipcMain.handle(ipcChannels.setEngineRunning, (_event, running: boolean) => {
    log.info('Engine', `Engine ${running ? 'started' : 'stopped'}`)
    engineStatus = { ...engineStatus, running }
    return engineStatus
  })
  ipcMain.handle(
    ipcChannels.renderPreviewFrame,
    (_event, profile: Profile, audio?: AudioInput, textMasks?: Record<string, boolean[]>) => {
      return renderPreviewFrame(profile, undefined, undefined, audio, undefined, textMasks)
    }
  )
  ipcMain.handle(ipcChannels.captureScreenSample, async (_event, request: ScreenCaptureRequest) => {
    if (request.hasOverlays) return null  // avoid feedback loop when overlays are active
    const topology = getDisplayTopology()
    if (request.linkedDisplays && topology.displays.length > 1) {
      return captureVirtualScreenFrame(topology, request.columns, request.rows)
    }
    const primaryDisplay = topology.displays.find((d) => d.id === request.displayId) ?? topology.displays.find((d) => d.primary) ?? topology.displays[0]
    if (!primaryDisplay) return null
    const captured = await captureScreenFrame(primaryDisplay.id, request.columns, request.rows)
    return captured ?? null
  })
  ipcMain.handle(ipcChannels.getCaptureProviderStatus, () => getCaptureProviderStatus())

  // R46: per-process CPU% breakdown for objective diagnostics (see ipc.ts).
  ipcMain.handle(ipcChannels.getProcessCpuSamples, (): ProcessCpuSample[] => {
    return app.getAppMetrics().map((m) => ({
      pid: m.pid,
      type: m.type,
      cpuPercent: m.cpu.percentCPUUsage,
      name: m.name
    }))
  })

  // R158.3: local crash records for the Diagnostics card + save-dialog export.
  ipcMain.handle(ipcChannels.crashLogList, () => listCrashLogs())
  ipcMain.handle(ipcChannels.crashLogExport, (_event, fileName: string) => exportCrashLog(fileName))

  // Renderer → main: push a rendered frame to open overlay windows (fire-and-forget)
  ipcMain.on(ipcChannels.overlayPushFrame, (_event, frame: RgbFrame) => {
    pushFrameToOverlays(frame)
    engineStatus = { ...engineStatus, fps: frame.columns > 0 ? engineStatus.fps : engineStatus.fps, lastFrameAt: frame.generatedAt }
  })

  // Renderer → main: push a rendered frame to ONE specific display overlay (linked-display mode)
  ipcMain.on(ipcChannels.overlayPushFrameForDisplay, (_event, displayId: number, frame: RgbFrame) => {
    pushFrameToDisplay(displayId, frame)
  })

  // Notify main renderer when an overlay is closed externally (e.g. double-click close)
  // Guard against destroyed webContents: mainWindow may be non-null but already destroyed
  // when this callback fires during the main-window-close sequence.
  setOverlayClosedCallback((displayId) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(ipcChannels.overlayClosed, displayId)
    }
  })

  // Overlay management
  ipcMain.handle(ipcChannels.openOverlay, (_event, displayId: number, config?: OverlayConfig) => {
    log.info('Overlay', `Opening overlay for display ${displayId}, region=${config?.region ?? 'fullscreen'}`)
    return openOverlay(displayId, isDevelopment, process.env.ELECTRON_RENDERER_URL, config)
  })
  ipcMain.handle(ipcChannels.closeOverlay, (_event, displayId: number) => {
    log.info('Overlay', `Closing overlay for display ${displayId}`)
    return closeOverlay(displayId)
  })
  ipcMain.handle(ipcChannels.setOverlayConfig, (_event, displayId: number, config?: OverlayConfig) => {
    log.info('Overlay', `Updating overlay config for display ${displayId}, region=${config?.region ?? 'fullscreen'}`)
    return reopenOverlay(displayId, isDevelopment, process.env.ELECTRON_RENDERER_URL, config)
  })
  ipcMain.handle(ipcChannels.getOverlayDisplayIds, () => {
    return getOverlayDisplayIds()
  })

  // R29.3 (revised): audio visualizer projector windows — full-resolution,
  // separate from the LED overlay pipeline above.
  ipcMain.handle(ipcChannels.openAudioVizWindow, (_event, displayId: number) => {
    log.info('AudioViz', `Opening audio visualizer projector for display ${displayId}`)
    return openAudioVizWindow(displayId, isDevelopment, process.env.ELECTRON_RENDERER_URL)
  })
  ipcMain.handle(ipcChannels.closeAudioVizWindow, (_event, displayId: number) => {
    log.info('AudioViz', `Closing audio visualizer projector for display ${displayId}`)
    return closeAudioVizWindow(displayId)
  })
  ipcMain.handle(ipcChannels.getAudioVizWindowIds, () => {
    return getAudioVizWindowIds()
  })

  // R136: hidden vision pipeline host — same shape as the AudioViz projector
  // windows. The vision stack (MediaPipe + session engines) runs inside this
  // window's renderer process so it can never starve the game window's main
  // thread; data flows window↔window over the same-origin BroadcastChannel
  // ('rgbbox-vision'), these handlers only manage the window lifecycle.
  ipcMain.handle(ipcChannels.visionHostOpen, () => {
    if (visionHostWindow && !visionHostWindow.isDestroyed()) return true
    visionHostWindow = new BrowserWindow({
      show: false,
      skipTaskbar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        // keep rVFC/the synthetic timer running while hidden
        backgroundThrottling: false,
      },
    })
    visionHostWindow.on('closed', () => { visionHostWindow = null })
    if (isDevelopment) {
      void visionHostWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/visionHost.html`)
    } else {
      void visionHostWindow.loadFile(join(__dirname, '../renderer/visionHost.html'))
    }
    return true
  })
  ipcMain.handle(ipcChannels.visionHostClose, () => {
    if (visionHostWindow && !visionHostWindow.isDestroyed()) visionHostWindow.close()
    visionHostWindow = null
    return true
  })

  // Return the first screen's desktopCapturer sourceId for system audio loopback (legacy)
  ipcMain.handle(ipcChannels.getDesktopAudioSourceId, async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } })
    return sources[0]?.id ?? null
  })

  // Return ALL desktop audio capture sources (screens/displays)
  ipcMain.handle(ipcChannels.getDesktopAudioSources, async (): Promise<DesktopAudioSource[]> => {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } })
    return sources.map((s) => ({ id: s.id, name: s.name }))
  })

  // Return screen + window capture sources with thumbnails (Video Studio)
  ipcMain.handle(
    ipcChannels.getCaptureSources,
    async (_event, types?: Array<'screen' | 'window'>): Promise<CaptureSource[]> => {
      const wanted = types && types.length > 0 ? types : (['screen', 'window'] as Array<'screen' | 'window'>)
      const sources = await desktopCapturer.getSources({
        types: wanted,
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true,
      })
      return sources.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.id.startsWith('window:') ? 'window' : 'screen',
        thumbnail: s.thumbnail?.isEmpty() ? '' : s.thumbnail.toDataURL(),
        appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : '',
      }))
    }
  )

  // Remember which source the renderer wants the next getDisplayMedia() call to
  // stream. The Video Studio sets this immediately before calling getDisplayMedia,
  // and the display-media request handler (registered in app.whenReady) resolves
  // it to a concrete desktopCapturer source.
  ipcMain.handle(ipcChannels.selectCaptureSource, (_event, sourceId: string): boolean => {
    pendingCaptureSourceId = typeof sourceId === 'string' ? sourceId : null
    return true
  })

  // Named profile management
  ipcMain.handle(ipcChannels.listProfiles, () => listProfiles())
  ipcMain.handle(ipcChannels.loadProfileById, (_event, id: string) => {
    log.info('Profile', `Loading profile by id: ${id}`)
    return loadProfileById(id)
  })
  ipcMain.handle(ipcChannels.saveProfileAs, (_event, profile: Profile) => {
    log.info('Profile', `Saving profile as: id=${profile.id}, name="${profile.name}"`)
    return saveProfileAs(profile)
  })
  ipcMain.handle(ipcChannels.deleteProfile, (_event, id: string) => {
    log.info('Profile', `Deleting profile: id=${id}`)
    return deleteProfile(id)
  })
  ipcMain.handle(ipcChannels.exportProfileDialog, async (_event, profile: Profile) => {
    log.info('Profile', `Exporting profile: "${profile.name}"`)
    const result = await dialog.showSaveDialog({
      title: 'Export Profile',
      defaultPath: `${profile.name.replace(/[^a-zA-Z0-9_\- ]/g, '_')}.json`,
      filters: [{ name: 'JSON Profile', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return false
    await writeFile(result.filePath, JSON.stringify(profile, null, 2), 'utf-8')
    log.info('Profile', `Profile exported to: ${result.filePath}`)
    return true
  })
  ipcMain.handle(ipcChannels.importProfileDialog, async () => {
    log.info('Profile', 'Importing profile from file dialog')
    const result = await dialog.showOpenDialog({
      title: 'Import Profile',
      filters: [{ name: 'JSON Profile', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths[0]) return null
    try {
      const raw = await readFile(result.filePaths[0], 'utf-8')
      log.info('Profile', `Profile imported from: ${result.filePaths[0]}`)
      return JSON.parse(raw) as Profile
    } catch {
      log.error('Profile', `Failed to import profile from: ${result.filePaths[0]}`)
      return null
    }
  })

  // Overlay context menu (called from overlay renderer)
  ipcMain.handle(
    ipcChannels.overlayShowContextMenu,
    (event, displayId: number, effects: Array<{ kind: string; label: string }>) => {
      const senderWin = BrowserWindow.fromWebContents(event.sender)
      if (!senderWin) return

      const effectItems = effects.map((e) => ({
        label: e.label,
        click: () => {
          // Notify main window so it can update the profile and push new frames
          mainWindow?.webContents.send(ipcChannels.overlayEffectChanged, e.kind)
        }
      }))

      const menu = Menu.buildFromTemplate([
        { label: '切换效果', enabled: false },
        { type: 'separator' },
        ...effectItems,
        { type: 'separator' },
        {
          label: '关闭此覆盖层',
          click: () => {
            closeOverlay(displayId)
            mainWindow?.webContents.send(ipcChannels.overlayEffectChanged, null)
          }
        }
      ])

      menu.popup({ window: senderWin })
    }
  )

  // ── On-demand 3D model download ──────────────────────────────────────────

  const modelsDir = join(app.getPath('userData'), 'models')

  // R90 P1: audio AI inference (Silero VAD + AST), cached-model lookup injected.
  // R90.9: the cache check ALSO verifies the expected byte size (±10%) — a
  // partial download (the ECONNRESET saga) previously left a corrupt file that
  // "已就绪" happily reported while every InferenceSession.create failed. A
  // size mismatch deletes the file so the next download starts fresh.
  const audioModelBytes = new Map<string, number>(
    MODELS_MANIFEST.filter((e) => e.kind === 'onnx' && e.bytes !== undefined)
      .map((e) => [e.file, e.bytes as number])
  )
  initAudioAi({
    modelsDir,
    // R90.9 ROOT CAUSE FIX: return the PLAIN PATH, never the file:// URL —
    // onnxruntime-node's InferenceSession.create cannot load file:// URLs
    // (byte-identical 'Load model from file:///... failed' reproduced locally;
    // RapidOCR has always worked because it passes a plain path). This single
    // mismatch is why every in-app inference since R90 P1 produced nothing.
    findCached: async (file) => {
      const filePath = join(modelsDir, file)
      try { await access(filePath) } catch { return null }
      const expected = audioModelBytes.get(file)
      if (expected !== undefined) {
        try {
          const s = await stat(filePath)
          if (Math.abs(s.size - expected) > expected * 0.1) {
            log.warn('Model', `corrupt cache detected (${s.size}/${expected} bytes), deleting: ${file}`)
            await unlink(filePath)
            return null
          }
        } catch { /* stat failed — treat as cached */ }
      }
      return filePath
    },
  })

  /** Return a file:// URL if the model is already cached, otherwise undefined. */
  async function getCachedModelUrl(fileName: string): Promise<string | undefined> {
    const filePath = join(modelsDir, fileName)
    try {
      await access(filePath)
      return pathToFileURL(filePath).toString()
    } catch {
      return undefined
    }
  }

  /** Follow HTTPS/HTTP redirects and stream to dest, pushing progress events.
   *  R90: network drops (ECONNRESET on large files) auto-retry with backoff and
   *  RESUME from the partial file via HTTP Range — a 91MB model no longer
   *  restarts from zero on every hiccup. Partial files are kept between attempts. */
  function downloadWithProgress(
    url: string,
    dest: string,
    onProgress: (p: ModelDownloadProgress, name: string) => void,
    name: string
  ): Promise<void> {
    const MAX_ATTEMPTS = 4
    return new Promise((resolve, reject) => {
      let attempts = 0
      const attempt = (currentUrl: string, redirects = 0, resumeFrom = 0): void => {
        if (redirects > 10) { reject(new Error('DL_REDIRECTS: too many redirects')); return }
        const getter = currentUrl.startsWith('https://') ? httpsGet : httpGet
        const headers: Record<string, string> = {}
        if (resumeFrom > 0) headers.Range = `bytes=${resumeFrom}-`
        const req = getter(currentUrl, { headers }, (res) => {
          if (res.statusCode !== undefined && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume()
            attempt(res.headers.location, redirects + 1, resumeFrom)
            return
          }
          const resumed = res.statusCode === 206 && resumeFrom > 0
          if (res.statusCode !== 200 && res.statusCode !== 206) {
            res.resume()
            reject(new Error(`DL_HTTP: ${res.statusCode}`))
            return
          }
          const already = resumed ? resumeFrom : 0
          const totalBytes = already + parseInt(res.headers['content-length'] ?? '0', 10)
          let receivedBytes = already
          res.on('data', (chunk: Buffer) => {
            receivedBytes += chunk.length
            const percent = totalBytes > 0 ? Math.round(receivedBytes / totalBytes * 100) : 0
            onProgress({ name, receivedBytes, totalBytes, percent, done: false }, name)
          })
          const out = createWriteStream(dest, { flags: resumed ? 'a' : 'w' })
          pipeline(res, out)
            .then(() => { onProgress({ name, receivedBytes, totalBytes, percent: 100, done: true }, name); resolve() })
            .catch((err) => scheduleRetry(err))
        })
        req.on('error', (err) => scheduleRetry(err))
      }
      const scheduleRetry = (err: Error): void => {
        attempts += 1
        if (attempts >= MAX_ATTEMPTS) { reject(err); return }
        const delay = 1000 * 2 ** (attempts - 1)
        onProgress({ name, receivedBytes: 0, totalBytes: 0, percent: 0, done: false, error: `retry ${attempts}/${MAX_ATTEMPTS - 1}: ${err.message}` }, name)
        setTimeout(() => {
          let resumeFrom = 0
          try { resumeFrom = statSync(dest).size } catch { resumeFrom = 0 }
          attempt(url, 0, resumeFrom)
        }, delay)
      }
      attempt(url)
    })
  }

  // ── Audio Studio file path persistence ────────────────────────────────────
  const audioConfigPath = join(app.getPath('userData'), 'config', 'audio-playlist.json')

  ipcMain.handle(ipcChannels.audioGetSavedPaths, async () => {
    try {
      const raw = await readFile(audioConfigPath, 'utf-8')
      return JSON.parse(raw)
    } catch {
      return []
    }
  })

  ipcMain.handle(ipcChannels.audioSavePaths, async (_event, paths: Array<{ id: string; name: string; path: string; group: string }>) => {
    await mkdir(join(app.getPath('userData'), 'config'), { recursive: true })
    await writeFile(audioConfigPath, JSON.stringify(paths, null, 2), 'utf-8')
  })

  const AUDIO_FILTERS = [{ name: 'Audio', extensions: ['wav', 'flac', 'mp3', 'aac', 'm4a', 'ogg', 'opus', 'weba'] }]

  ipcMain.handle(ipcChannels.audioOpenFiles, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Add Audio Files',
      properties: ['openFile', 'multiSelections'],
      filters: AUDIO_FILTERS,
    })
    if (result.canceled) return []
    return result.filePaths.map(p => ({ path: p, name: basename(p) }))
  })

  ipcMain.handle(ipcChannels.audioOpenFolder, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Add Audio Folder',
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return []
    const folderPath = result.filePaths[0]
    const folderName = basename(folderPath)
    let entries: string[] = []
    try { entries = await readdir(folderPath) } catch { return [] }
    return entries
      .filter(f => /\.(wav|flac|mp3|aac|m4a|ogg|opus|weba)$/i.test(f))
      .map(f => ({ path: join(folderPath, f), name: f, folder: folderName }))
  })

  // ── Video Studio file path persistence ────────────────────────────────────
  const videoConfigPath = join(app.getPath('userData'), 'config', 'video-playlist.json')

  ipcMain.handle(ipcChannels.videoGetSavedPaths, async () => {
    try {
      const raw = await readFile(videoConfigPath, 'utf-8')
      return JSON.parse(raw)
    } catch {
      return []
    }
  })

  // R91.1: entries may carry resume progress (progress/duration/updatedAt) —
  // stored verbatim alongside the structural fields.
  ipcMain.handle(ipcChannels.videoSavePaths, async (_event, paths: Array<{ id: string; name: string; path: string; group: string; progress?: number; duration?: number; updatedAt?: number }>) => {
    await mkdir(join(app.getPath('userData'), 'config'), { recursive: true })
    await writeFile(videoConfigPath, JSON.stringify(paths, null, 2), 'utf-8')
  })

  const VIDEO_FILTERS = [{ name: 'Video', extensions: ['mp4', 'webm', 'mkv', 'mov', 'avi', 'flv', 'ts', 'm4v', 'wmv'] }]

  ipcMain.handle(ipcChannels.videoOpenFiles, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Add Video Files',
      properties: ['openFile', 'multiSelections'],
      filters: VIDEO_FILTERS,
    })
    if (result.canceled) return []
    return result.filePaths.map(p => ({ path: p, name: basename(p) }))
  })

  ipcMain.handle(ipcChannels.videoOpenFolder, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Add Video Folder',
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return []
    const folderPath = result.filePaths[0]
    const folderName = basename(folderPath)
    let entries: string[] = []
    try { entries = await readdir(folderPath) } catch { return [] }
    return entries
      .filter(f => /\.(mp4|webm|mkv|mov|avi|flv|ts|m4v|wmv)$/i.test(f))
      .map(f => ({ path: join(folderPath, f), name: f, folder: folderName }))
  })

  // ── System display list ────────────────────────────────────────────────────
  ipcMain.handle(ipcChannels.getDisplays, () => {
    const primaryId = screen.getPrimaryDisplay().id
    return screen.getAllDisplays().map(d => ({
      id: d.id,
      label: `Display ${d.id}`,
      bounds: d.bounds,
      primary: d.id === primaryId,
    }))
  })

  // Return mapping of model name → file:// URL for every model already cached
  ipcMain.handle(ipcChannels.modelGetCachedPaths, async () => {
    await mkdir(modelsDir, { recursive: true })
    const result: Record<string, string> = {}
    // Also check dev-time public assets directory so devs don't need to re-download
    const devPublicDir = isDevelopment
      ? join(__dirname, '../../src/renderer/public/assets/models')
      : null
    for (const entry of MODELS_MANIFEST) {
      const url = await getCachedModelUrl(entry.file)
      if (url) {
        result[entry.name] = url
      } else if (devPublicDir) {
        const devPath = join(devPublicDir, entry.file)
        try {
          await access(devPath)
          result[entry.name] = pathToFileURL(devPath).toString()
        } catch { /* not present */ }
      }
    }
    return result
  })

  // Download a model by name; push progress events; return file:// URL when done
  ipcMain.handle(ipcChannels.modelDownload, async (_event, name: string) => {
    const entry = MODELS_MANIFEST.find((m) => m.name === name)
    if (!entry) throw new Error(`MODEL_UNKNOWN: ${name}`)

    await mkdir(modelsDir, { recursive: true })
    const destPath = join(modelsDir, entry.file)

    // Return cached copy immediately without re-downloading
    const cached = await getCachedModelUrl(entry.file)
    if (cached) return cached

    log.info('Model', `Downloading model: ${name} from ${entry.url}`)

    // R90: keep any partial file — the downloader resumes it via HTTP Range

    const sendProgress = (p: ModelDownloadProgress): void => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(ipcChannels.modelDownloadProgress, p)
      }
    }

    try {
      await downloadWithProgress(entry.url, destPath, sendProgress, name)
      log.info('Model', `Model download complete: ${name}`)
    } catch (err) {
      try { await unlink(destPath) } catch { /* ignore */ }
      const errMsg = err instanceof Error ? err.message : String(err)
      log.error('Model', `Model download failed: ${name}, error: ${errMsg}`)
      sendProgress({ name, receivedBytes: 0, totalBytes: 0, percent: 0, done: true, error: errMsg })
      throw err
    }

    return pathToFileURL(destPath).toString()
  })
}

function createTray(): void {
  const isDev = !app.isPackaged
  const iconPath = process.platform === 'win32'
    ? (isDev ? join(__dirname, '../../build/icon.ico') : join(process.resourcesPath, 'icon.ico'))
    : (isDev ? join(__dirname, '../../build/icon.png') : join(process.resourcesPath, 'icon.png'))
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  tray.setToolTip('RGBBox')

  const toggleMainWindow = (): void => {
    if (!mainWindow) return
    if (mainWindow.isVisible()) {
      mainWindow.hide()
      sendMainWindowVisibility(false)
    } else {
      mainWindow.show()
      mainWindow.focus()
      sendMainWindowVisibility(true)
    }
  }

  // R80.12: 界面语言切换后重建托盘菜单（原生菜单启动时只建一次，不随 i18n 变）
  const applyTrayMenu = (): void => {
    const L = trayMenuLabels(uiLocale, getSnipHotkeyPref())
    const contextMenu = Menu.buildFromTemplate([
      { label: L.toggle, click: toggleMainWindow },
      { label: L.snip, click: () => { void startSnip() } },
      { type: 'separator' },
      {
        label: L.quit,
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
    tray?.setContextMenu(contextMenu)
  }
  applyTrayMenu()
  rebuildTrayMenu = applyTrayMenu

  tray.on('double-click', toggleMainWindow)
}

// ── R48.4: the automated perf self-test harness now lives in its own module
// (`./perfSelfTest`). See there for the scenarios, CPU sampling, R48.1
// overlay frame-timing collection, R48.2 tightened verdicts, and R48.3
// median/p25/p75 stats. Triggered below from app.whenReady.

app.whenReady().then(() => {
  // Force dark theme so native title bar and system chrome match the dark UI
  nativeTheme.themeSource = 'dark'
  // Remove the default application menu (File / Edit / View / …)
  Menu.setApplicationMenu(null)

  // Grant media + display-capture permissions so the Video Studio can access
  // cameras, microphones and screen/window sources. Also grant 'fullscreen' —
  // R64.7: Chromium's Element.requestFullscreen() (used by the RGB preview /
  // audio visualizer / video studio fullscreen toggles) is itself gated by
  // Electron's permission system; without an explicit allow here it was
  // silently denied (the returned promise never settles), making every
  // in-app "全屏" button visibly do nothing. All other permissions remain
  // denied (tighter than Electron's permissive default).
  const ALLOWED_PERMISSIONS = new Set(['media', 'audioCapture', 'videoCapture', 'display-capture', 'fullscreen'])
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission))
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return ALLOWED_PERMISSIONS.has(permission)
  })

  // Modern screen/window capture path. The Video Studio calls
  // navigator.mediaDevices.getDisplayMedia() after pre-selecting a source id via
  // ipcChannels.selectCaptureSource. This handler resolves that id to a concrete
  // desktopCapturer source. Chromium's getDisplayMedia capturer correctly streams
  // GPU-accelerated windows (e.g. browsers) that the legacy chromeMediaSource
  // constraint often rendered black or failed to capture.
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer
      .getSources({ types: ['screen', 'window'] })
      .then((sources) => {
        const chosen = sources.find((s) => s.id === pendingCaptureSourceId) ?? sources[0]
        pendingCaptureSourceId = null
        if (chosen) {
          callback({ video: chosen })
        } else {
          // No source available — deny gracefully.
          callback({})
        }
      })
      .catch((err) => {
        log.error('Video', `setDisplayMediaRequestHandler failed: ${String(err)}`)
        callback({})
      })
  }, { useSystemPicker: false })

  // Serve local audio/video files via the media:// custom scheme.
  // net.fetch does NOT support file:// — stream from the fs directly instead.
  // R70.1: MIME table + Range parsing live in ./mediaProtocol (pure, tested).
  // R70.15: responses STREAM the planned byte window via createReadStream.
  // The old shape materialized the whole range with one fs.read — on a
  // >2GiB window (Chromium media opens with open-ended `bytes=0-`) the read
  // length exceeds INT32_MAX, Node's native CHECK(args[3]->IsInt32()) in
  // node_file.cc aborts the process (uncatchable, exit 134), and even below
  // that threshold whole-range buffers spiked main-process memory per seek.
  protocol.handle('media', async (request) => {
    try {
      const mediaUrl = new URL(request.url)
      let filePath: string
      if (mediaUrl.host === 'app') {
        // R131: packaged renderer assets — the prod app loads the renderer via
        // file:// where fetch()/wasm loading of local files is blocked, so the
        // vision module fetches its wasm + .task models through this route:
        // media://app/<subpath> → out/renderer/<subpath> (traversal-guarded).
        filePath = resolveAppAssetPath(join(__dirname, '../renderer'), mediaUrl.pathname) ?? ''
      } else {
        // Path is stored as query param ?p= to avoid Windows drive-letter mangling
        // e.g. media://local?p=C%3A%5CUsers%5C...  →  C:\Users\...
        filePath = mediaUrl.searchParams.get('p') ?? ''
      }
      // R53.8: was console.log — on Windows, the terminal's active codepage
      // (often GBK/936, not UTF-8) mangles non-ASCII (e.g. Chinese) file paths
      // into mojibake. The shared file logger always writes UTF-8 to disk
      // regardless of terminal codepage, so route through it instead.
      log.debug('MediaProtocol', `filePath: ${filePath}`)
      const contentType = resolveMediaMime(filePath)
      const size = (await stat(filePath)).size
      const plan = mediaStreamPlan(parseRangeHeader(request.headers.get('range'), size), size, contentType)
      if (plan.status === 416) {
        return new Response('Range Not Satisfiable', { status: 416, headers: plan.headers })
      }
      log.debug('MediaProtocol', `streaming ${plan.end - plan.start + 1} bytes (${plan.status} ${plan.start}-${plan.end}/${size})`)
      if (plan.end < plan.start) {
        // Empty file with no Range header — serve an empty body, not a
        // createReadStream with an inverted window.
        return new Response(null, { status: plan.status, headers: plan.headers })
      }
      const nodeStream = createReadStream(filePath, { start: plan.start, end: plan.end })
      // node:stream/web's ReadableStream is structurally the WHATWG stream
      // Electron's Response consumes; BodyInit isn't nameable in this tsconfig.
      return new Response(Readable.toWeb(nodeStream) as unknown as ConstructorParameters<typeof Response>[0], {
        status: plan.status,
        headers: plan.headers,
      })
    } catch (err) {
      log.error('MediaProtocol', `error serving ${request.url}: ${err instanceof Error ? err.message : String(err)}`)
      return new Response('File not found', { status: 404 })
    }
  })

  void initializeCaptureProviders()
  log.info('App', 'Capture providers initialized')
  registerIpc()
  // R91.3b: DTLN denoise — inference in a utility process, IPC surface here
  registerDenoiseService(join(app.getPath('userData'), 'models'), () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null))

  // R69: restore the "prevent screensaver/sleep" setting from disk and start
  // the power save blocker before the renderer asks for it.
  void (async () => {
    try {
      const systemSettings = await loadSystemSettings()
      if (systemSettings.powerSaveBlock && powerSaveBlockerId === null) {
        powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep')
        log.info('Power', 'Restored power save blocker from system settings')
      }
    } catch (err) {
      log.error('Power', `Failed to restore power save block setting: ${err instanceof Error ? err.message : String(err)}`)
    }
  })()

  createMainWindow()
  createTray()
  log.info('App', 'Application ready — main window and tray created')

  // R80/R81: global snip hotkey — restore persisted preference BEFORE registering
  // (init-first avoids leaking the default Alt+A if the user chose another key)
  void loadSystemSettings()
    .then((s) => {
      if (s.snip?.hotkey) initSnipHotkeyPref(s.snip.hotkey)
    })
    .catch(() => { /* unreadable settings → default */ })
    .finally(() => {
      rebuildTrayMenu?.()   // tray label follows the persisted key
      // conflict (e.g. WeChat owns Alt+A) degrades to tray-only with a balloon
      registerSnipHotkey((accel) => {
        tray?.displayBalloon?.({ title: 'RGBBox', content: `全局热键 ${accel} 已被其他应用占用，截图仍可从托盘菜单触发。`, iconType: 'info' })
      })
    })

  // R74: restore the light-effect screensaver settings and start idle polling
  // if it was left enabled (does NOT auto-open windows — the first poll decides).
  void initScreensaver(isDevelopment, process.env.ELECTRON_RENDERER_URL)

  if (process.argv.includes('--perf-selftest')) {
    // R48.5: watchdog — if the renderer never reaches ready-to-show (e.g. a
    // GPU-init race on rapid re-launch), the harness would otherwise hang
    // silently. Force a logged quit after 30s so the run is never mistaken
    // for a slow success.
    const watchdog = setTimeout(() => {
      log.error('PerfSelfTest', 'Watchdog: harness did not start within 30s (ready-to-show never fired), forcing quit')
      log.flushSync()
      isQuitting = true
      app.exit(1)
    }, 30000)
    mainWindow?.once('ready-to-show', () => {
      clearTimeout(watchdog)
      void runPerfSelfTest({ getMainWindow: () => mainWindow }).finally(() => {
        isQuitting = true
        app.quit()
      })
    })
  }

  // Notify the renderer whenever display topology changes (hotplug)
  const notifyTopologyChanged = (): void => {
    mainWindow?.webContents.send(ipcChannels.displayTopologyChanged)
  }
  screen.on('display-added', notifyTopologyChanged)
  screen.on('display-removed', notifyTopologyChanged)
  screen.on('display-metrics-changed', notifyTopologyChanged)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('second-instance', () => {
  // A second launch was attempted — focus the existing window
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})

app.on('before-quit', () => {
  log.info('App', 'Application quitting')
  void disposeAudioAi() // R90 P1: release onnx sessions
  log.flushSync()
  isQuitting = true
  // R74: stop idle polling + close effect windows. The R73 OS shutdown timer
  // (if armed) intentionally survives app quit — that is the feature.
  disposeScreensaver()
  // R80: close snip session + unregister global hotkey
  disposeSnipManager()
})

app.on('window-all-closed', () => {
  log.info('App', 'All windows closed')
  closeAllOverlays()
  closeAllAudioVizWindows()
  closeAllScreensaverWindows()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
