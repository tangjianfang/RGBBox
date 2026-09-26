// R185: concurrent pool + `only` filter for ttsDownloadModels.
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function bodyOf(bytes: number): unknown {
  let sent = 0
  return new ReadableStream({
    start(c) {
      const push = (): void => {
        if (sent >= bytes) { c.close(); return }
        const n = Math.min(1024, bytes - sent)
        c.enqueue(Buffer.alloc(n))
        sent += n
        setTimeout(push, 0)
      }
      push()
    },
  })
}

describe('main/ttsService ttsDownloadModels R185 pool', () => {
  let ws = ''
  beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'tts-pool-'))
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    rmSync(ws, { recursive: true, force: true })
  })

  it('downloads all files concurrently and reports per-file done events', async () => {
    const { ttsDownloadModels } = await import('../../src/main/ttsService')
    const events: { path: string; done: boolean }[] = []
    let inFlight = 0
    let maxInFlight = 0
    const fetchMock = vi.fn(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 20))
      inFlight -= 1
      return {
        ok: true,
        status: 200,
        headers: { get: (n: string) => (n.toLowerCase() === 'content-length' ? '4096' : null) },
        body: bodyOf(4096),
      }
    })
    vi.stubGlobal('fetch', fetchMock)
    const out = await ttsDownloadModels(ws, (ev) => { events.push({ path: ev.path, done: ev.done }) })
    expect(out.ok).toBe(true)
    // all 7 manifest files landed
    const doneEvents = events.filter((e) => e.done && !('error' in e))
    expect(doneEvents.length).toBe(7)
    // concurrency actually happened (3 lanes were saturated at least once)
    expect(maxInFlight).toBeGreaterThanOrEqual(3)
  })

  it('`only` narrows the run to the requested file', async () => {
    const { ttsDownloadModels } = await import('../../src/main/ttsService')
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: (n: string) => (n.toLowerCase() === 'content-length' ? '4096' : null) },
      body: bodyOf(4096),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const out = await ttsDownloadModels(ws, () => {}, undefined, { only: ['config.json'] })
    expect(out.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('config.json')
    expect(existsSync(join(ws, 'kokoro-local', 'onnx-community', 'kokoro-82M-v1.0-ONNX', 'config.json'))).toBe(true)
  })

  // the retry chain burns 4 × 1.5s backoff on the poisoned file — that delay
  // is real behavior, so this test gets a wider timeout than the default 5s.
  it('a failed required file reports its error without blocking the others', async () => {
    const { ttsDownloadModels } = await import('../../src/main/ttsService')
    const errors: Record<string, unknown> = {}
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url)
      if (u.includes('tokenizer.json')) return { ok: false, status: 404, headers: { get: () => null }, body: null }
      return {
        ok: true,
        status: 200,
        headers: { get: (n: string) => (n.toLowerCase() === 'content-length' ? '4096' : null) },
        body: bodyOf(4096),
      }
    })
    vi.stubGlobal('fetch', fetchMock)
    const out = await ttsDownloadModels(ws, (ev) => { if (ev.done && ev.error) errors[ev.path] = ev.error })
    expect(out.ok).toBe(false)
    expect(out.error).toContain('tokenizer.json')
    // the sibling files still completed around the failure
    const dir = join(ws, 'kokoro-local', 'onnx-community', 'kokoro-82M-v1.0-ONNX')
    expect(existsSync(join(dir, 'config.json'))).toBe(true)
    expect(statSync(join(dir, 'config.json')).size).toBe(4096)
  }, 20000)

  // R192: the tokenizer.json manifest size was wrong at the SOURCE — upstream
  // ships a 3,497-byte character-level tokenizer and the old 2,726,298 estimate
  // made exact accounting reject the COMPLETE file on every attempt.
  it('tokenizer.json (3497B) passes exact accounting against the corrected manifest', async () => {
    const { ttsDownloadModels, KOKORO_FILES } = await import('../../src/main/ttsService')
    const spec = KOKORO_FILES.find((f) => f.path === 'tokenizer.json')!
    expect(spec.bytes).toBe(3497)
    const fetchMock = vi.fn(async (url: string | URL) => {
      if (!String(url).includes('tokenizer.json')) {
        return { ok: false, status: 404, headers: { get: () => null }, body: null }
      }
      // no content-length (chunked) → the manifest bytes become the total
      return { ok: true, status: 200, headers: { get: () => null }, body: bodyOf(3497) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const out = await ttsDownloadModels(ws, () => {}, undefined, { only: ['tokenizer.json'] })
    expect(out.ok).toBe(true)
    const file = join(ws, 'kokoro-local', 'onnx-community', 'kokoro-82M-v1.0-ONNX', 'tokenizer.json')
    expect(existsSync(file)).toBe(true)
    expect(statSync(file).size).toBe(3497)
  })

  // R192: a 200 full-body answer to a Range request must not double-count the
  // stale .part length (received = have + full body > total →永远 mismatch).
  it('a server that ignores Range (200 full body) overwrites the part and lands exactly total bytes', async () => {
    const { ttsDownloadModels } = await import('../../src/main/ttsService')
    const dir = join(ws, 'kokoro-local', 'onnx-community', 'kokoro-82M-v1.0-ONNX')
    mkdirSync(join(dir), { recursive: true })
    writeFileSync(join(dir, 'config.json.part'), 'x'.repeat(1000)) // stale partial
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200, // ignores the Range header entirely
      headers: { get: (n: string) => (n.toLowerCase() === 'content-length' ? '4096' : null) },
      body: bodyOf(4096),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const out = await ttsDownloadModels(ws, () => {}, undefined, { only: ['config.json'] })
    expect(out.ok).toBe(true)
    expect(statSync(join(dir, 'config.json')).size).toBe(4096)
    // the Range attempt happened, then the overwrite succeeded on the retry
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
