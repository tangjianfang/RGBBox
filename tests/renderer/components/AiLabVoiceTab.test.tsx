// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { AiLabVoiceTab } from '../../../src/renderer/src/components/AiLabVoiceTab'
import { setupRendererMocks } from '../_helpers'

beforeEach(() => {
  localStorage.clear()
  const rgbbox = setupRendererMocks() as unknown as Record<string, unknown>
  rgbbox.ttsEngineStatus = vi.fn().mockResolvedValue({
    complete: false,
    kokoroInstalled: true,
    bundledVoices: ['af_heart'],
    files: [
      { path: 'config.json', bytes: 5120, present: true },
      { path: 'onnx/model_q4.onnx', bytes: 305_000_000, present: false },
    ],
  })
  rgbbox.ttsModelDownload = vi.fn().mockResolvedValue({ ok: true })
  rgbbox.onTtsModelProgress = vi.fn().mockReturnValue(() => undefined)
  rgbbox.ttsSynthesize = vi.fn().mockResolvedValue({ ok: false, error: 'model-not-ready' })
  rgbbox.ttsExport = vi.fn().mockResolvedValue({ ok: false, error: 'model-not-ready' })
  cleanup()
})

describe('AiLabVoiceTab (R173-S1)', () => {
  it('mounts with the text area, engine select and lexicon editor', async () => {
    const { container } = render(<AiLabVoiceTab />)
    expect(container.querySelector('textarea[data-field="vs-text"]')).not.toBeNull()
    const engine = container.querySelector('select[data-field="vs-engine"]') as HTMLSelectElement
    expect(engine.value).toBe('system')
    // model incomplete → kokoro option disabled + dependency panel visible
    const kokoro = [...engine.options].find((o) => o.value === 'kokoro') as HTMLOptionElement
    expect(kokoro.disabled).toBe(true)
    await waitFor(() => {
      const panel = container.querySelector('[data-field="vs-models"]')
      expect(panel).not.toBeNull()
      expect(panel!.querySelectorAll('li').length).toBe(2)
      expect(panel!.textContent).toContain('onnx/model_q4.onnx')
    })
    expect(container.querySelector('input[data-field="vs-word"]')).not.toBeNull()
  })

  it('R179: download button invokes ttsModelDownload and shows per-file progress', async () => {
    let progress: ((ev: unknown) => void) | undefined
    const rgbbox = setupRendererMocks() as unknown as Record<string, ReturnType<typeof vi.fn>>
    rgbbox.onTtsModelProgress = vi.fn().mockImplementation((cb: (ev: unknown) => void) => { progress = cb; return () => undefined })
    const { container } = render(<AiLabVoiceTab />)
    const btn = await waitFor(() => {
      const el = container.querySelector('[data-action="vs-model-download"]') as HTMLButtonElement
      expect(el).toBeTruthy()
      return el
    })
    fireEvent.click(btn)
    expect(rgbbox.ttsModelDownload).toHaveBeenCalledTimes(1)
    progress?.({ path: 'onnx/model_q4.onnx', receivedBytes: 100_000_000, totalBytes: 305_000_000, done: false })
    await waitFor(() => expect(container.textContent).toContain('33%'))
  })

  it('R185: per-file retry button posts just that path; stats line renders', async () => {
    const rgbbox = setupRendererMocks() as unknown as Record<string, ReturnType<typeof vi.fn>>
    rgbbox.ttsEngineStatus = vi.fn().mockResolvedValue({
      complete: false,
      kokoroInstalled: true,
      bundledVoices: ['af_heart'],
      files: [
        { path: 'config.json', bytes: 5120, present: true, actualBytes: 44 },
        { path: 'onnx/model_q4.onnx', bytes: 305_000_000, present: false },
      ],
    })
    rgbbox.onTtsModelProgress = vi.fn().mockReturnValue(() => undefined)
    rgbbox.ttsModelDownload = vi.fn().mockResolvedValue({ ok: true })
    const { container } = render(<AiLabVoiceTab />)
    // stats line: on-disk accounting with actual bytes + file counts
    await waitFor(() => expect(container.querySelector('.vs-model-stats')?.textContent).toContain('1/2'))
    // count line reads used/total bytes
    expect(container.querySelector('.vs-model-count')?.textContent).toContain('/')
    // the missing file row carries a retry button targeting its path
    const retry = await waitFor(() => {
      const el = container.querySelector('[data-action="vs-model-retry"]') as HTMLButtonElement
      expect(el).toBeTruthy()
      return el
    })
    expect(retry.dataset.path).toBe('onnx/model_q4.onnx')
    fireEvent.click(retry)
    expect(rgbbox.ttsModelDownload).toHaveBeenCalledWith(['onnx/model_q4.onnx'])
  })

  it('R187/R192: kokoro voice picker lists the engine-supported catalog; missing voice offers download; panel folds when complete', async () => {
    const rgbbox = setupRendererMocks() as unknown as Record<string, ReturnType<typeof vi.fn>>
    rgbbox.ttsEngineStatus = vi.fn().mockResolvedValue({
      complete: true,
      kokoroInstalled: true,
      bundledVoices: ['af_heart'],
      voices: ['af_heart'],
      files: [
        { path: 'config.json', bytes: 44, present: true, actualBytes: 44 },
        { path: 'onnx/model_q4.onnx', bytes: 305_000_000, present: true, actualBytes: 305_000_000 },
      ],
    })
    rgbbox.onTtsModelProgress = vi.fn().mockReturnValue(() => undefined)
    rgbbox.ttsVoiceDownload = vi.fn().mockResolvedValue({ ok: true })
    const { container } = render(<AiLabVoiceTab />)
    // complete → panel auto-collapsed to the summary line
    await waitFor(() => expect(container.querySelector('.vs-model-list')).toBeNull())
    await waitFor(() => expect(container.querySelector('.vs-model-toggle')?.textContent).toContain('2/2'))
    // unfold persists
    fireEvent.click(container.querySelector('[data-action="vs-model-toggle"]')!)
    await waitFor(() => expect(container.querySelector('.vs-model-list')).not.toBeNull())
    expect(localStorage.getItem('rgbbox:voiceModelsCollapsed')).toBe('0')

    // switch to the kokoro engine (enabled — model complete)
    const engine = container.querySelector('select[data-field="vs-engine"]') as HTMLSelectElement
    fireEvent.change(engine, { target: { value: 'kokoro' } })
    const voiceSel = await waitFor(() => {
      const el = container.querySelector('select[data-field="vs-voice"]') as HTMLSelectElement
      expect(el).toBeTruthy()
      return el
    })
    // engine-supported English catalog (28); on-disk voice carries the ✓ prefix
    expect(voiceSel.options.length).toBe(28)
    expect([...voiceSel.options].some((o) => o.value === 'zf_xiaobei')).toBe(false)
    const heart = [...voiceSel.options].find((o) => o.value === 'af_heart')
    expect(heart?.textContent).toContain('✓')
    // pick a missing voice → inline download row appears and targets the id
    fireEvent.change(voiceSel, { target: { value: 'bm_fable' } })
    const btn = await waitFor(() => {
      const el = container.querySelector('[data-action="vs-voice-download"]') as HTMLButtonElement
      expect(el).toBeTruthy()
      return el
    })
    fireEvent.click(btn)
    expect(rgbbox.ttsVoiceDownload).toHaveBeenCalledWith('bm_fable')
  })

  it('R187: streaming queue synthesizes sentence-by-sentence with progress', async () => {
    const rgbbox = setupRendererMocks() as unknown as Record<string, ReturnType<typeof vi.fn>>
    rgbbox.ttsEngineStatus = vi.fn().mockResolvedValue({
      complete: true,
      kokoroInstalled: true,
      bundledVoices: ['af_heart'],
      voices: ['af_heart'],
      files: [{ path: 'config.json', bytes: 5120, present: true, actualBytes: 44 }],
    })
    rgbbox.onTtsModelProgress = vi.fn().mockReturnValue(() => undefined)
    // each call synthesizes exactly ONE sentence (the streaming contract)
    rgbbox.ttsSynthesize = vi.fn().mockImplementation(async (segs: string[]) => ({
      ok: true,
      wav: new TextEncoder().encode(`wav:${segs[0]}`).buffer,
    }))
    // happy-dom has no media timeline — play() resolves and we fire onended
    // (the queue assigns onended BEFORE calling play, so a macrotask is safe)
    const playStub = vi.fn().mockImplementation(function (this: HTMLAudioElement) {
      setTimeout(() => { this.onended?.(new Event('ended') as never) }, 0)
      return Promise.resolve()
    })
    window.HTMLMediaElement.prototype.play = playStub as () => Promise<void>
    window.HTMLMediaElement.prototype.pause = vi.fn()

    const { container } = render(<AiLabVoiceTab />)
    // R196: this test exercises the KOKORO queue — Chinese text would now route
    // to the system engine, so use English sentences.
    fireEvent.change(container.querySelector('textarea[data-field="vs-text"]')!, { target: { value: 'First sentence. Second sentence! Third one?' } })
    const engine = container.querySelector('select[data-field="vs-engine"]') as HTMLSelectElement
    await waitFor(() => expect([...engine.options].find((o) => o.value === 'kokoro')!.disabled).toBe(false))
    fireEvent.change(engine, { target: { value: 'kokoro' } })
    const play = await waitFor(() => {
      const el = container.querySelector('[data-action="vs-kokoro"]') as HTMLButtonElement
      expect(el).toBeTruthy()
      return el
    })
    fireEvent.click(play)
    // three single-sentence synthesis calls happened (or are on their way)
    await waitFor(() => expect(rgbbox.ttsSynthesize).toHaveBeenCalledTimes(3), { timeout: 4000 })
    const calls = rgbbox.ttsSynthesize.mock.calls as unknown as [string[]][]
    for (const c of calls) expect(c[0].length).toBe(1)
    // every sentence eventually played through the audio element
    await waitFor(() => expect(playStub).toHaveBeenCalledTimes(3), { timeout: 4000 })
    // progress UI appeared during the run and cleared on natural completion
    await waitFor(() => expect(container.querySelector('.vs-synth-progress')).toBeNull(), { timeout: 4000 })
  })

  it('R187: lexicon export posts JSON; import merges and persists', async () => {
    const rgbbox = setupRendererMocks() as unknown as Record<string, ReturnType<typeof vi.fn>>
    rgbbox.voiceLexiconExport = vi.fn().mockResolvedValue({ ok: true })
    rgbbox.voiceLexiconImport = vi.fn().mockResolvedValue({ ok: true, text: JSON.stringify([{ word: 'read', respell: 'reed' }, { word: 'bad', respell: 1 }]) })
    const { container } = render(<AiLabVoiceTab />)
    // seed one local entry, then import (read replaces nothing, invalid row dropped)
    fireEvent.change(container.querySelector('input[data-field="vs-word"]')!, { target: { value: 'local' } })
    fireEvent.change(container.querySelector('input[data-field="vs-respell"]')!, { target: { value: 'lokal' } })
    fireEvent.click(container.querySelector('[data-action="vs-add"]')!)
    fireEvent.click(container.querySelector('[data-action="vs-lex-export"]')!)
    await waitFor(() => expect(rgbbox.voiceLexiconExport).toHaveBeenCalled())
    const exported = (rgbbox.voiceLexiconExport as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(JSON.parse(exported)).toEqual([{ word: 'local', respell: 'lokal' }])
    fireEvent.click(container.querySelector('[data-action="vs-lex-import"]')!)
    await waitFor(() => expect(container.querySelectorAll('.vs-lexicon-list li').length).toBe(2))
    expect(JSON.parse(localStorage.getItem('rgbbox:voiceLexicon')!).length).toBe(2)
  })

  it('R188: adding past the lexicon cap shows the cap error and keeps the list intact', () => {
    // seed a full lexicon directly in storage
    const full = Array.from({ length: 200 }, (_, i) => ({ word: `w${i}`, respell: `r${i}` }))
    localStorage.setItem('rgbbox:voiceLexicon', JSON.stringify(full))
    const { container } = render(<AiLabVoiceTab />)
    expect(container.querySelectorAll('.vs-lexicon-list li').length).toBe(200)
    fireEvent.change(container.querySelector('input[data-field="vs-word"]')!, { target: { value: 'overflow' } })
    fireEvent.change(container.querySelector('input[data-field="vs-respell"]')!, { target: { value: 'over' } })
    fireEvent.click(container.querySelector('[data-action="vs-add"]')!)
    // rejected: hint line + list unchanged + inputs preserved
    expect(container.textContent).toContain('ai.voice.err.lexicon-cap')
    expect(container.querySelectorAll('.vs-lexicon-list li').length).toBe(200)
    expect((container.querySelector('input[data-field="vs-word"]') as HTMLInputElement).value).toBe('overflow')
    // replacing an EXISTING word still works at cap
    fireEvent.change(container.querySelector('input[data-field="vs-word"]')!, { target: { value: 'w0' } })
    fireEvent.change(container.querySelector('input[data-field="vs-respell"]')!, { target: { value: 'zero' } })
    fireEvent.click(container.querySelector('[data-action="vs-add"]')!)
    const stored = JSON.parse(localStorage.getItem('rgbbox:voiceLexicon')!) as Array<{ word: string; respell: string }>
    expect(stored.length).toBe(200)
    expect(stored.find((e) => e.word === 'w0')?.respell).toBe('zero')
  })

  it('R196: mixed-language queue routes EN sentences to Kokoro and ZH sentences to the system engine, in order', async () => {
    const rgbbox = setupRendererMocks() as unknown as Record<string, ReturnType<typeof vi.fn>>
    rgbbox.ttsEngineStatus = vi.fn().mockResolvedValue({
      complete: true,
      kokoroInstalled: true,
      bundledVoices: ['af_heart'],
      voices: ['af_heart'],
      files: [{ path: 'config.json', bytes: 44, present: true, actualBytes: 44 }],
    })
    rgbbox.onTtsModelProgress = vi.fn().mockReturnValue(() => undefined)
    rgbbox.ttsSynthesize = vi.fn().mockImplementation(async (segs: string[]) => ({
      ok: true,
      wav: new TextEncoder().encode(`wav:${segs[0]}`).buffer,
    }))
    // stub the system engine: record sentences, "play" them synchronously
    const spoken: string[] = []
    const speakMock = vi.fn((u: { text: string; onend?: () => void }) => {
      spoken.push(u.text)
      queueMicrotask(() => u.onend?.())
    })
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel: vi.fn(), speak: speakMock } })
    // happy-dom ships neither speechSynthesis nor the utterance class
    class FakeUtterance {
      text: string
      lang = 'zh-CN'
      rate = 1
      onend?: () => void
      onerror?: () => void
      constructor(text: string) { this.text = text }
    }
    ;(globalThis as unknown as Record<string, unknown>).SpeechSynthesisUtterance = FakeUtterance
    const playStub = vi.fn().mockImplementation(function (this: HTMLAudioElement) {
      setTimeout(() => { this.onended?.(new Event('ended') as never) }, 0)
      return Promise.resolve()
    })
    window.HTMLMediaElement.prototype.play = playStub as () => Promise<void>
    window.HTMLMediaElement.prototype.pause = vi.fn()

    const { container } = render(<AiLabVoiceTab />)
    fireEvent.change(container.querySelector('textarea[data-field="vs-text"]')!, { target: { value: 'Hello world. 这是中文句。 Another English line!' } })
    const engine = container.querySelector('select[data-field="vs-engine"]') as HTMLSelectElement
    await waitFor(() => expect([...engine.options].find((o) => o.value === 'kokoro')!.disabled).toBe(false))
    fireEvent.change(engine, { target: { value: 'kokoro' } })
    // mixed hint appears (text contains Chinese)
    await waitFor(() => expect(container.textContent).toContain('ai.voice.mixedHint'))
    fireEvent.click(container.querySelector('[data-action="vs-kokoro"]')!)
    await waitFor(() => expect(rgbbox.ttsSynthesize).toHaveBeenCalledTimes(2), { timeout: 4000 })
    const synthCalls = rgbbox.ttsSynthesize.mock.calls as unknown as [string[]][]
    for (const c of synthCalls) {
      expect(c[0].length).toBe(1)
      expect(c[0][0]).toMatch(/Hello world\.|Another English line!/)
    }
    await waitFor(() => expect(spoken).toEqual(['这是中文句。']), { timeout: 4000 })
    // queue fully drains and clears progress
    await waitFor(() => expect(container.querySelector('.vs-synth-progress')).toBeNull(), { timeout: 4000 })
  })

  it('typing text splits into a clickable sentence preview', () => {
    const { container } = render(<AiLabVoiceTab />)
    const area = container.querySelector('textarea[data-field="vs-text"]') as HTMLTextAreaElement
    fireEvent.change(area, { target: { value: '第一句。Second sentence?' } })
    const list = container.querySelectorAll('.vs-sentence-list li')
    expect(list.length).toBe(2)
  })

  it('lexicon add → persists to localStorage; delete removes', () => {
    const { container } = render(<AiLabVoiceTab />)
    fireEvent.change(container.querySelector('input[data-field="vs-word"]')!, { target: { value: 'read' } })
    fireEvent.change(container.querySelector('input[data-field="vs-respell"]')!, { target: { value: 'reed' } })
    fireEvent.click(container.querySelector('[data-action="vs-add"]')!)
    expect(JSON.parse(localStorage.getItem('rgbbox:voiceLexicon')!)).toEqual([{ word: 'read', respell: 'reed' }])
    expect(container.querySelectorAll('.vs-lexicon-list li').length).toBe(1)
    fireEvent.click(container.querySelector('[data-action="vs-del"]')!)
    expect(container.querySelectorAll('.vs-lexicon-list li').length).toBe(0)
    expect(JSON.parse(localStorage.getItem('rgbbox:voiceLexicon')!)).toEqual([])
  })
})
