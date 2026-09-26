// R187: voice catalog + status scan + on-demand single-voice download.
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { KOKORO_VOICE_CATALOG, VOICE_LOCALES, voiceLabel } from '../../src/shared/kokoroVoices'

let ws = ''
beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), 'tts-voices-'))
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => {
  vi.unstubAllGlobals()
  rmSync(ws, { recursive: true, force: true })
})

describe('R187 voice catalog (shared/kokoroVoices)', () => {
  it('every id is well-formed with a known locale prefix', () => {
    expect(KOKORO_VOICE_CATALOG.length).toBeGreaterThanOrEqual(50)
    expect(KOKORO_VOICE_CATALOG.length).toBeLessThanOrEqual(56)
    for (const id of KOKORO_VOICE_CATALOG) {
      expect(id).toMatch(/^[a-z]{2}_[a-z]+$/)
      expect(VOICE_LOCALES[id.slice(0, 2)]).toBeDefined()
    }
    // packed tensors are NOT voices
    expect(KOKORO_VOICE_CATALOG).not.toContain('af')
    expect(KOKORO_VOICE_CATALOG).not.toContain('am')
    // the bundled four + Mandarin voices are present
    for (const v of ['af_heart', 'af_bella', 'am_fenrir', 'bf_emma', 'zf_xiaoxiao', 'zm_yunxi']) {
      expect(KOKORO_VOICE_CATALOG).toContain(v)
    }
    expect(voiceLabel('af_heart')).toContain('美式英语')
    expect(voiceLabel('zm_yunjian')).toContain('中文')
  })
})

describe('R187 ttsService voices', () => {
  it('ttsModelStatus scans on-disk voice bins (catalog ∩ disk)', async () => {
    const { ttsModelStatus } = await import('../../src/main/ttsService')
    const dir = join(ws, 'kokoro-local', 'onnx-community', 'kokoro-82M-v1.0-ONNX', 'voices')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'af_heart.bin'), 'x')
    writeFileSync(join(dir, 'zf_xiaoxiao.bin'), 'x')
    writeFileSync(join(dir, 'not_a_voice.bin'), 'x') // junk is filtered
    const status = ttsModelStatus(ws)
    expect(status.voices).toContain('af_heart')
    expect(status.voices).toContain('zf_xiaoxiao')
    expect(status.voices).not.toContain('not_a_voice')
  })

  it('ttsDownloadVoice fetches exactly the requested bin and lands it on disk', async () => {
    const { ttsDownloadVoice } = await import('../../src/main/ttsService')
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: (n: string) => (n.toLowerCase() === 'content-length' ? '4096' : null) },
      body: new ReadableStream({ start(c) { c.enqueue(Buffer.alloc(4096)); c.close() } }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const events: { path: string; done: boolean }[] = []
    const out = await ttsDownloadVoice(ws, 'zf_xiaobei', (ev) => events.push({ path: ev.path, done: ev.done }))
    expect(out.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('voices/zf_xiaobei.bin')
    const bin = join(ws, 'kokoro-local', 'onnx-community', 'kokoro-82M-v1.0-ONNX', 'voices', 'zf_xiaobei.bin')
    expect(existsSync(bin)).toBe(true)
    expect(statSync(bin).size).toBe(4096)
    expect(events.some((e) => e.done)).toBe(true)
  })

  it('unknown voice ids are rejected without any fetch', async () => {
    const { ttsDownloadVoice } = await import('../../src/main/ttsService')
    const out = await ttsDownloadVoice(ws, '../evil', () => {})
    expect(out.ok).toBe(false)
    expect(out.error).toBe('unknown-voice')
  })
})
