import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// R179.2: the downloader must survive a poisoned .part — the server answers a
// stale Range with 416; the fix deletes the part and retries as a full GET.

function mkBody(): unknown {
  return new ReadableStream({
    start(c) {
      c.enqueue(Buffer.alloc(4096))
      c.close()
    },
  })
}

describe('main/ttsService ttsDownloadModels 416 recovery', () => {
  let ws = ''
  beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'tts-dl-'))
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    rmSync(ws, { recursive: true, force: true })
  })

  it('416 on a stale Range → deletes .part and re-downloads fully', async () => {
    const { ttsDownloadModels } = await import('../../src/main/ttsService')
    const cacheRoot = join(ws, 'models')
    const modelDir = join(cacheRoot, 'kokoro-local', 'onnx-community', 'kokoro-82M-v1.0-ONNX')
    mkdirSync(modelDir, { recursive: true })
    // R179.2 poison: a NON-ZERO stale .part (0-byte never sends Range)
    writeFileSync(join(modelDir, 'config.json.part'), 'stale-bytes')

    const fetchMock = vi.fn(async (_url: string | URL, init?: { headers?: Record<string, string> }) => {
      const range = init?.headers?.Range !== undefined
      console.log('DBG fetch call, range =', range)
      if (range) {
        // stale Range → 416 Range Not Satisfiable, no body
        return { ok: false, status: 416, headers: { get: () => null }, body: null }
      }
      return {
        ok: true,
        status: 200,
        headers: { get: (n: string) => (n.toLowerCase() === 'content-length' ? '4096' : null) },
        body: mkBody(),
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    const out = await ttsDownloadModels(cacheRoot, () => {})
    console.log('DBG after call, ok =', out.ok)
    const walk = (d: string, pre = ''): void => { for (const f of require('node:fs').readdirSync(d)) { const full = join(d, f); console.log('DBG tree:', pre + f, require('node:fs').statSync(full).size); if (require('node:fs').statSync(full).isDirectory()) walk(full, pre + f + '/') } }
    walk(modelDir, '')
    expect(out.ok).toBe(true)
    const cfg = join(modelDir, 'config.json')
    expect(existsSync(cfg)).toBe(true)
    expect(statSync(cfg).size).toBe(4096)
    // the stale Range request happened exactly once, then fell back to a full GET
    const rangeCalls = fetchMock.mock.calls.filter(([, init]) => (init as { headers?: Record<string, string> } | undefined)?.headers?.Range !== undefined)
    expect(rangeCalls.length).toBe(1)
    expect(existsSync(join(modelDir, 'config.json.part'))).toBe(false)
  })
})
