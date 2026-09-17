/**
 * selectionAiManager — R119: global selection AI (uTools/PopClip style).
 *
 * Hotkey Alt+Q (tray entry too) → simulate Ctrl+C via PowerShell SendKeys to
 * grab the OTHER app's selection → open a small window (?selectionAi=1) that
 * offers translate/polish/explain/custom prompts → runs through the ACTIVE
 * profile's chatCompletion (AI8 and OpenAI-compatible providers both work,
 * R118 dispatch included) → result shown + copyable.
 *
 * Known bounds: secure desktop (lock/UAC) has no selection → silent no-op;
 * SendKeys copies whatever the focused control selects, so the clipboard is
 * intentionally NOT restored — the AI result replaces it as a feature.
 */
import { BrowserWindow, clipboard, globalShortcut, screen } from 'electron'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { getLogger, type Logger } from '../shared/logger'
import type { AiChatOutcome } from '../shared/types'

export const SELECTION_AI_HOTKEY = 'Alt+Q'

export type SelectionAction = 'translate' | 'polish' | 'explain' | 'custom'

/** Pure: action (+ optional custom instruction) → chat messages. Test-covered. */
export function buildSelectionPrompt(action: SelectionAction, text: string, custom?: string): { role: 'system' | 'user'; content: string }[] {
  const systems: Record<Exclude<SelectionAction, 'custom'>, string> = {
    translate: '你是翻译助手。把用户提供的文本翻译成英文（若原文已是英文则译成中文）。只输出译文，保留段落与换行，不要任何解释。',
    polish: '你是文字润色助手。修正用户文本中的错别字与语病、改善表达使其通顺专业，但严格不改变原意与语言。只输出润色后的文本，不要任何解释。',
    explain: '你是解释助手。用简洁的中文解释用户提供的文本的含义/背景/用法。若含代码或术语，逐项说明。控制在 300 字以内。',
  }
  const system = action === 'custom'
    ? `你是文字处理助手。严格按照以下指令处理用户提供的文本，只输出处理结果，不要任何解释：${(custom ?? '').trim()}`
    : systems[action]
  return [
    { role: 'system', content: system },
    { role: 'user', content: text },
  ]
}

export type SelectionAiDeps = {
  /** index.ts closure: loadSystemSettings → asAiSettings → chatCompletion. */
  runChat: (messages: { role: 'system' | 'user'; content: string }[]) => Promise<AiChatOutcome>
}

let deps: SelectionAiDeps | null = null
let isDev = false
let devUrl: string | undefined
let pendingText = ''
let window: BrowserWindow | null = null

function log(): Logger {
  return getLogger()
}

export function initSelectionAiManager(d: SelectionAiDeps, development: boolean, url?: string): void {
  deps = d
  isDev = development
  devUrl = url
}

export function disposeSelectionAiManager(): void {
  unregisterSelectionAiHotkey()
  closeSelectionWindow()
}

export function registerSelectionAiHotkey(): boolean {
  try {
    return globalShortcut.register(SELECTION_AI_HOTKEY, triggerSelectionAi)
  } catch (err) {
    log().warn('SelectionAi', `hotkey register failed: ${String(err)}`)
    return false
  }
}

export function unregisterSelectionAiHotkey(): void {
  if (globalShortcut.isRegistered(SELECTION_AI_HOTKEY)) globalShortcut.unregister(SELECTION_AI_HOTKEY)
}

/** Simulate Ctrl+C in the focused app (PowerShell SendKeys — R112 lesson:
 * array args, no shell quoting), then read the selection off the clipboard. */
async function captureSelection(): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn('powershell', ['-NoProfile', '-Command', "$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys('^c')"], { windowsHide: true })
    child.on('error', () => resolve(''))
    child.on('close', () => {
      setTimeout(() => resolve(clipboard.readText().trim()), 250)
    })
  })
}

function closeSelectionWindow(): void {
  if (window !== null && !window.isDestroyed()) window.destroy()
  window = null
}

/** IPC: the floating window asks to close itself. */
export function disposeSelectionAiWindow(): void {
  closeSelectionWindow()
}

export async function triggerSelectionAi(): Promise<void> {
  const text = await captureSelection()
  if (text === '') return // nothing selected in the focused app — stay silent
  if (text.length > 20_000) pendingText = text.slice(0, 20_000)
  else pendingText = text
  if (window !== null && !window.isDestroyed()) {
    window.focus()
    window.webContents.reload()
    return
  }
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const width = 560
  const height = 430
  const b = display.workArea
  const x = Math.min(Math.max(b.x + 16, cursor.x - Math.round(width / 2)), b.x + b.width - width - 16)
  const y = Math.min(Math.max(b.y + 16, cursor.y + 20), b.y + b.height - height - 16)
  window = new BrowserWindow({
    width, height, x, y,
    title: '划词 AI',
    autoHideMenuBar: true,
    resizable: true,
    backgroundColor: '#0a1014',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  window.once('ready-to-show', () => window?.show())
  window.on('closed', () => { window = null; pendingText = '' })
  const query = 'selectionAi=1'
  if (isDev && devUrl) window.loadURL(`${devUrl}?${query}`)
  else window.loadFile(join(__dirname, '../renderer/index.html'), { search: query })
}

/** IPC: the floating window pulls the captured text once on mount. */
export function takeSelectionText(): string {
  const text = pendingText
  return text
}

export function clearSelectionText(): void {
  pendingText = ''
}

/** IPC: run a prompt against the ACTIVE profile. */
export async function runSelectionAi(action: SelectionAction, custom?: string): Promise<AiChatOutcome> {
  const text = pendingText
  if (deps === null || text === '') {
    return { ok: false, text: '', hint: 'parse', latencyMs: 0 }
  }
  return deps.runChat(buildSelectionPrompt(action, text, custom))
}
