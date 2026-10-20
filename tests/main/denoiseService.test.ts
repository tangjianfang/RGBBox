// R310e (evolve #11): denoiseStart double-fork — two concurrent invokes both
// passed the session check, forked two children (one leaked forever) and the
// loser's catch could kill the WINNER's child. The fix shares one in-flight
// start. Electron is mocked at the module boundary; models are dummies in a
// tmp dir.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type Child = {
  on: (ev: string, cb: (msg?: unknown) => void) => Child
  postMessage: (msg: unknown) => void
  kill: () => void
  emit: (ev: string, msg?: unknown) => void
}

const forkMock = vi.fn()
const handlers = new Map<string, Function>()
const listeners = new Map<string, Function>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, cb: Function) => handlers.set(ch, cb),
    on: (ch: string, cb: Function) => listeners.set(ch, cb),
  },
  utilityProcess: { fork: (...a: unknown[]) => forkMock(...a) },
}))

/** a fake child that never auto-fires: tests drive emit() by hand */
function fakeChild(): Child {
  const cbs = new Map<string, Array<(msg?: unknown) => void>>()
  const child: Child = {
    on: (ev, cb) => { (cbs.get(ev) ?? cbs.set(ev, []).get(ev)!).push(cb); return child },
    postMessage: () => {},
    kill: vi.fn(),
    emit: (ev, msg) => { for (const cb of cbs.get(ev) ?? []) cb(msg) },
  }
  return child
}

import { MODELS_MANIFEST } from '../../src/shared/modelsManifest'

async function importService(): Promise<typeof import('../../src/main/denoiseService')> {
  vi.resetModules()
  forkMock.mockClear()
  handlers.clear()
  listeners.clear()
  return await import('../../src/main/denoiseService')
}

let udd: string
beforeEach(() => {
  udd = mkdtempSync(join(tmpdir(), 'denoise-svc-'))
  for (const name of ['dtln_1', 'dtln_2']) {
    const entry = MODELS_MANIFEST.find((m) => m.name === name)!
    writeFileSync(join(udd, entry.file), 'dummy')
  }
})
afterEach?.((): void => { try { rmSync(udd, { recursive: true, force: true }) } catch { /* best effort */ } })

describe('main/denoiseService double-fork (R310e, evolve #11)', () => {
  it('two CONCURRENT denoiseStart invokes share ONE child — no leaked fork, one ready', async () => {
    const svc = await importService()
    const child = fakeChild()
    forkMock.mockReturnValue(child)
    svc.registerDenoiseService(udd, () => null)
    const start = handlers.get('rgbbox:denoise:start') as () => Promise<{ ok: boolean; message?: string }>
    // fire both BEFORE ready resolves (the race window); let the async
    // handlers reach their fork+listener registration before driving the child
    const pa = start()
    const pb = start()
    await new Promise((r) => setTimeout(r, 20))
    child.emit('message', { type: 'ready' })
    const [a, b] = await Promise.all([pa, pb])
    expect(forkMock).toHaveBeenCalledTimes(1)
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
    // a third invoke after success short-circuits on the live session
    const c = await start()
    expect(c.ok).toBe(true)
    expect(forkMock).toHaveBeenCalledTimes(1)
  })

  it("a failed start kills ONLY its own child — the next start retries fresh", async () => {
    const svc = await importService()
    const child = fakeChild()
    forkMock.mockReturnValue(child)
    svc.registerDenoiseService(udd, () => null)
    const start = handlers.get('rgbbox:denoise:start') as () => Promise<{ ok: boolean; message?: string }>
    const p = start()
    await new Promise((r) => setTimeout(r, 20))
    child.emit('message', { type: 'error', message: 'model boom' })
    const res = await p
    expect(res.ok).toBe(false)
    expect(res.message).toContain('model boom')
    expect(child.kill).toHaveBeenCalledTimes(1)
    // retry: a fresh fork (the failed child is gone, no wedge)
    const child2 = fakeChild()
    forkMock.mockReturnValue(child2)
    const p2 = start()
    await new Promise((r) => setTimeout(r, 20))
    child2.emit('message', { type: 'ready' })
    const res2 = await p2
    expect(res2.ok).toBe(true)
    expect(forkMock).toHaveBeenCalledTimes(2)
  })
})
