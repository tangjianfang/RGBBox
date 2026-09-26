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

describe('R187/R192 voice catalog (shared/kokoroVoices)', () => {
  it('lists the 28 English + 8 zh-bridge voices (R197)', () => {
    // R192.2 实测:引擎 _validate_voice 只认 28 个英语音色——zf/zm/jf 等仓库里
    // 存在的 .bin 选了必报 "Voice not found",目录必须收敛到引擎支持集。
    expect(KOKORO_VOICE_CATALOG.length).toBe(36)
    for (const id of KOKORO_VOICE_CATALOG) {
      expect(id).toMatch(/^[a-z]{2}_[a-z]+$/)
      expect(VOICE_LOCALES[id.slice(0, 2)]).toBeDefined()
    }
    for (const v of ['af_heart', 'af_bella', 'am_fenrir', 'bf_emma', 'bm_fable', 'af_sky']) {
      expect(KOKORO_VOICE_CATALOG).toContain(v)
    }
    // R197: the 8 zh bridge voices are back; ja/other repo bins stay out
    expect(KOKORO_VOICE_CATALOG).toContain('zf_xiaobei')
    expect(KOKORO_VOICE_CATALOG).toContain('zm_yunyang')
    expect(KOKORO_VOICE_CATALOG).not.toContain('jf_alpha')
    expect(voiceLabel('af_heart')).toContain('美式英语')
    expect(voiceLabel('bm_fable')).toContain('英式英语')
  })
})

describe('R187 ttsService voices', () => {
  it('ttsModelStatus scans on-disk voice bins (catalog ∩ disk)', async () => {
    const { ttsModelStatus } = await import('../../src/main/ttsService')
    const dir = join(ws, 'kokoro-local', 'onnx-community', 'kokoro-82M-v1.0-ONNX', 'voices')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'af_heart.bin'), 'x')
    writeFileSync(join(dir, 'bm_fable.bin'), 'x')
    // non-English bin exists on disk but the engine cannot use it (R192.2) —
    // the scan is catalog ∩ disk; junk is filtered the same way
    writeFileSync(join(dir, 'zf_xiaoxiao.bin'), 'x')
    writeFileSync(join(dir, 'not_a_voice.bin'), 'x')
    const status = ttsModelStatus(ws)
    expect(status.voices).toContain('af_heart')
    expect(status.voices).toContain('bm_fable')
    expect(status.voices).toContain('zf_xiaoxiao') // R197: zh bins back in the catalog∩disk scan
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
    const out = await ttsDownloadVoice(ws, 'bm_fable', (ev) => events.push({ path: ev.path, done: ev.done }))
    expect(out.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('voices/bm_fable.bin')
    const bin = join(ws, 'kokoro-local', 'onnx-community', 'kokoro-82M-v1.0-ONNX', 'voices', 'bm_fable.bin')
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
