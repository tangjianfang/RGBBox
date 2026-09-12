import { describe, it, expect } from 'vitest'
import { buildOcrScript, parseOcrOutput, recognizeImage } from '../../src/main/ocrService'

describe('ocrService pure', () => {
  it('buildOcrScript embeds the image path and the language fallback chain', () => {
    const script = buildOcrScript('C:\\tmp\\ocr-input.png')
    expect(script).toContain('C:\\tmp\\ocr-input.png')
    // 用户语言优先，缺 zh 时回退尝试 zh-Hans / zh-Hant / en
    expect(script).toContain('TryCreateFromUserProfileLanguages')
    expect(script).toContain('zh-Hans')
    expect(script).toContain('zh-Hant')
    // 成功/失败都有标记行
    expect(script).toContain('RGBBOX_OCR_BEGIN')
    expect(script).toContain('RGBBOX_OCR_ERR')
  })

  it('parseOcrOutput: success block, error codes, empty and garbage', () => {
    expect(parseOcrOutput('RGBBOX_OCR_BEGIN\n你好 world\nsecond line\nRGBBOX_OCR_END\n'))
      .toEqual({ ok: true, text: '你好 world\nsecond line', hint: undefined })
    expect(parseOcrOutput('RGBBOX_OCR_ERR:nolangpack')).toMatchObject({ ok: false, hint: 'nolangpack' })
    expect(parseOcrOutput('RGBBOX_OCR_ERR:decode')).toMatchObject({ ok: false, hint: 'decode' })
    expect(parseOcrOutput('RGBBOX_OCR_BEGIN\nRGBBOX_OCR_END')).toEqual({ ok: true, text: '', hint: undefined })
    expect(parseOcrOutput('garbage without markers')).toMatchObject({ ok: false })
  })
})

describe('ocrService recognizeImage', () => {
  it('non-win32 platform short-circuits to unsupported without spawning', async () => {
    let called = false
    const fakeRun = ((): Promise<{ stdout: string; stderr: string }> => {
      called = true
      return Promise.resolve({ stdout: '', stderr: '' })
    }) as unknown as Parameters<typeof recognizeImage>[1]
    const before = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    try {
      const out = await recognizeImage('data:image/png;base64,QQ==', fakeRun)
      expect(out.ok).toBe(false)
      expect(out.hint).toBe('unsupported')
      expect(called).toBe(false)
    } finally {
      Object.defineProperty(process, 'platform', { value: before, configurable: true })
    }
  })

  it('win32 path runs the executor and parses markers', async () => {
    const before = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    try {
      const fakeRun = ((): Promise<{ stdout: string; stderr: string }> =>
        Promise.resolve({ stdout: 'RGBBOX_OCR_BEGIN\n识别文本\nRGBBOX_OCR_END', stderr: '' })) as unknown as Parameters<typeof recognizeImage>[1]
      const out = await recognizeImage('data:image/png;base64,QQ==', fakeRun)
      expect(out).toMatchObject({ ok: true, text: '识别文本' })
    } finally {
      Object.defineProperty(process, 'platform', { value: before, configurable: true })
    }
  })
})
