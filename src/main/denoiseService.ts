/**
 * denoiseService — R91.3b DTLN 降噪会话的主进程编排。
 *
 * fork utilityProcess（denoiseProcessor.mjs，见 electron.vite.config 多入口），
 * 把渲染层 AudioWorklet 的 512 样分析窗中继过去、把降噪后的 hop 中继回来。
 * 推理完全发生在子进程——主进程零推理负载（R90 的主线程 CPU 教训）。
 * 模型复用 MODELS_MANIFEST + modelDownload 下载缓存（userData/models）。
 */
import { access, constants } from 'node:fs/promises'
import { join } from 'node:path'
import { ipcMain, utilityProcess, type UtilityProcess, type WebContents } from 'electron'
import { ipcChannels } from '../shared/ipc'
import { MODELS_MANIFEST } from '../shared/modelsManifest'

export interface DenoiseStartResult {
  ok: boolean
  /** missing manifest names when models aren't cached yet */
  missing?: string[]
  message?: string
}

interface ProcessorOutMsg {
  type: 'ready' | 'error' | 'frames'
  id?: number
  blocks?: Float32Array[]
  message?: string
}

interface DenoiseSession {
  child: UtilityProcess
  /** drains when 'ready' (or rejects on error) */
  ready: Promise<void>
}

let session: DenoiseSession | null = null

/** Pure: which dtln manifest entries are missing from disk. (tested) */
export async function findMissingDenoiseModels(
  modelsDir: string,
  stat: (p: string) => Promise<void> = (p) => access(p, constants.F_OK),
): Promise<string[]> {
  const missing: string[] = []
  for (const name of ['dtln_1', 'dtln_2']) {
    const entry = MODELS_MANIFEST.find((m) => m.name === name)
    if (!entry) { missing.push(name); continue }
    try { await stat(join(modelsDir, entry.file)) } catch { missing.push(name) }
  }
  return missing
}

async function startSession(modelsDir: string): Promise<DenoiseSession> {
  const m1 = MODELS_MANIFEST.find((m) => m.name === 'dtln_1')!
  const m2 = MODELS_MANIFEST.find((m) => m.name === 'dtln_2')!
  const child = utilityProcess.fork(join(__dirname, 'denoiseProcessor.js'), [], {
    serviceName: 'rgbbox-dtlm-denoise',
    stdio: 'ignore',
  })
  let onReady!: () => void
  let onErr!: (e: Error) => void
  const ready = new Promise<void>((resolve, reject) => { onReady = resolve; onErr = reject })
  const fail = (msg: string): void => { onErr(new Error(msg)) }
  child.on('message', (msg: ProcessorOutMsg) => {
    if (msg.type === 'ready') onReady()
    else if (msg.type === 'error') fail(msg.message ?? 'processor error')
  })
  child.on('exit', (code) => {
    if (session?.child === child) session = null
    if (code !== 0 && code !== null) fail(`denoise processor exited (${code})`)
  })
  child.postMessage({
    type: 'init',
    model1: join(modelsDir, m1.file),
    model2: join(modelsDir, m2.file),
  })
  return { child, ready }
}

/**
 * Register the denoise IPC surface. Call once after app ready.
 * `getWebContents` is late-bound so a recreated window keeps working.
 */
export function registerDenoiseService(modelsDir: string, getWebContents: () => WebContents | null): void {
  ipcMain.handle(ipcChannels.denoiseStart, async (): Promise<DenoiseStartResult> => {
    try {
      if (session) return { ok: true }
      const missing = await findMissingDenoiseModels(modelsDir)
      if (missing.length > 0) return { ok: false, missing }
      session = await startSession(modelsDir)
      await session.ready
      // Post-'ready' processor messages: relay denoised frames to the renderer.
      session.child.on('message', (msg: ProcessorOutMsg) => {
        if (msg.type !== 'frames') return
        const wc = getWebContents()
        if (wc && !wc.isDestroyed()) wc.send(ipcChannels.denoiseFramesOut, { id: msg.id, blocks: msg.blocks })
      })
      return { ok: true }
    } catch (err) {
      session?.child.kill()
      session = null
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  })

  // Windows in, hop batches out — pure relay, no inference on this thread.
  // (Electron postMessage transfers only MessagePorts — the Float32Arrays go
  // by structured clone; a 2-window batch is ~4KB.)
  ipcMain.on(ipcChannels.denoiseFrames, (_event, payload: { id: number; blocks: Float32Array[] }) => {
    if (!session) return
    session.child.postMessage({ type: 'frames', id: payload.id, blocks: payload.blocks })
  })

  ipcMain.handle(ipcChannels.denoiseStop, async () => {
    const s = session
    session = null
    if (s) {
      try { s.child.postMessage({ type: 'stop' }) } catch { /* already gone */ }
      setTimeout(() => { try { s.child.kill() } catch { /* noop */ } }, 500)
    }
    return { ok: true }
  })
}
