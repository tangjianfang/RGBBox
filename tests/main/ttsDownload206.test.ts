import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// R180: Range-resume flow — an existing .part continues from its byte offset
// via a 206 response, appending only the remainder, and lands as the final
// file with exact byte accounting.

const FULL = Buffer.alloc(6000, 7)

function body(buf: Buffer): unknown {
  return new ReadableStream({
    start(c) {
      c.enqueue(buf)
      c.close()
    },
  })
}

describe('main/ttsService ttsDownloadModels 206 resume (R180)', () => {
  let ws = ''
  beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'tts-resume-'))
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    rmSync(ws, { recursive: true, force: true })
  })

  it('resumes from the .part offset and appends the remainder', async () => {
    const { ttsDownloadModels } = await import('../../src/main/ttsService')
    const cacheRoot = join(ws, 'models')
    const modelDir = join(cacheRoot, 'kokoro-local', 'onnx-community', 'kokoro-82M-v1.0-ONNX')
    mkdirSync(join(modelDir, 'onnx'), { recursive: true })
    // the first 2500 bytes already sit in the .part from an interrupted run
    writeFileSync(join(modelDir, 'onnx', 'model_q4.onnx.part'), FULL.subarray(0, 2500))

    const seenHeaders: (string | undefined)[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string | URL, init?: { headers?: Record<string, string> }) => {
      seenHeaders.push(init?.headers?.Range)
      const range = init?.headers?.Range !== undefined
      if (range) {
        const m = /bytes=(\d+)-/.exec(init!.headers!.Range)!
        const rest = FULL.subarray(Number(m[1]))
        return {
          ok: true, status: 206,
          headers: { get: (n: string) => (n.toLowerCase() === 'content-length' ? String(rest.length) : null) },
          body: body(rest),
        }
      }
      return {
        ok: true, status: 200,
        headers: { get: (n: string) => (n.toLowerCase() === 'content-length' ? String(FULL.length) : null) },
        body: body(FULL),
      }
    }))

    const out = await ttsDownloadModels(cacheRoot, () => {})
    expect(out.ok).toBe(true)
    const final = join(modelDir, 'onnx', 'model_q4.onnx')
    expect(statSync(final).size).toBe(FULL.length)
    expect(readFileSync(final)).toEqual(FULL)
    // the ONE ranged request asked for exactly the missing tail
    expect(seenHeaders.filter(Boolean)).toEqual([`bytes=2500-`])
  })

  it('ttsModelStatus reports complete only when every required file is present', async () => {
    const { ttsModelStatus } = await import('../../src/main/ttsService')
    const cacheRoot = join(ws, 'models2')
    // nothing downloaded yet
    const empty = ttsModelStatus(cacheRoot)
    expect(empty.complete).toBe(false)
    expect(empty.files.length).toBeGreaterThan(3)
    // drop required files into the local layout → complete flips true
    const { mkdirSync, writeFileSync } = await import('node:fs')
    const { kokoroModelDir } = await import('../../src/main/ttsService')
    const dir = kokoroModelDir(cacheRoot)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'config.json'), '{}')
    writeFileSync(join(dir, 'tokenizer.json'), '{}')
    mkdirSync(join(dir, 'onnx'), { recursive: true })
    writeFileSync(join(dir, 'onnx', 'model_q4.onnx'), 'x')
    expect(ttsModelStatus(cacheRoot).complete).toBe(true)
  })
})
