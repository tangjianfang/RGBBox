import { describe, it, expect } from 'vitest'
import { buildOcrScript, parseOcrOutput, recognizeImage, mergeCjkSpaces, setRapidOcrRunner } from '../../src/main/ocrService'

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

  it('R79.1: decoder creation uses stream + reflection (PS 5.1 static async binding bug)', () => {
    const script = buildOcrScript('C:\\tmp\\x.png')
    expect(script).toContain('OpenAsync')
    expect(script).toContain('$createMethod')
    expect(script).toContain('.Invoke($null, @($stream))')
    // 旧的直调方式必须已移除（它会报"找不到重载"）
    expect(script).not.toContain('::CreateAsync($file)')
    expect(script).not.toContain('::CreateAsync($stream)')
  })

  it('mergeCjkSpaces joins single-CJK char gaps but keeps CJK/Latin boundaries', () => {
    expect(mergeCjkSpaces('会 议 记 录 2026')).toBe('会议记录 2026')
    expect(mergeCjkSpaces('视 频 工作站 OCR 测 试')).toBe('视频工作站 OCR 测试')
    expect(mergeCjkSpaces('Chinese Test 67890')).toBe('Chinese Test 67890')
    expect(mergeCjkSpaces('hello  world')).toBe('hello  world')   // 非 CJK 不动
    expect(mergeCjkSpaces('')).toBe('')
    // review-fix: CJK 标点/全角符号相邻的空格也合并
    expect(mergeCjkSpaces('预 算 ， 超 支')).toBe('预算，超支')
    expect(mergeCjkSpaces('第一 、第二 。')).toBe('第一、第二。')
  })

  it('parseOcrOutput: success block, error codes, empty and garbage', () => {
    expect(parseOcrOutput('RGBBOX_OCR_BEGIN\n会 议 记 录 2026\nsecond line\nRGBBOX_OCR_END\n'))
      .toEqual({ ok: true, text: '会议记录 2026\nsecond line', hint: undefined, engine: 'winrt' })
    expect(parseOcrOutput('RGBBOX_OCR_ERR:nolangpack')).toMatchObject({ ok: false, hint: 'nolangpack' })
    expect(parseOcrOutput('RGBBOX_OCR_ERR:decode')).toMatchObject({ ok: false, hint: 'decode' })
    expect(parseOcrOutput('RGBBOX_OCR_BEGIN\nRGBBOX_OCR_END')).toEqual({ ok: true, text: '', hint: undefined, engine: 'winrt' })
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
      expect(out).toMatchObject({ ok: true, text: '识别文本', engine: 'winrt' })
    } finally {
      Object.defineProperty(process, 'platform', { value: before, configurable: true })
    }
  })

  it('R82: rapid runner takes priority (CJK spaces merged); null/throw falls back to WinRT', async () => {
    const before = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    try {
      // rapid 优先：winrt executor 不应被调用
      let winrtCalled = false
      const fakeWinrt = ((): Promise<{ stdout: string; stderr: string }> => {
        winrtCalled = true
        return Promise.resolve({ stdout: 'RGBBOX_OCR_BEGIN\nwinrt\nRGBBOX_OCR_END', stderr: '' })
      }) as unknown as Parameters<typeof recognizeImage>[1]
      setRapidOcrRunner(async () => ({ ok: true, text: '会 议 记 录 2026' }))
      const out = await recognizeImage('data:image/png;base64,QQ==', fakeWinrt)
      expect(out).toMatchObject({ ok: true, text: '会议记录 2026', engine: 'rapid' })
      expect(winrtCalled).toBe(false)
      // rapid 未就绪（null）→ WinRT 兜底
      setRapidOcrRunner(async () => null)
      const out2 = await recognizeImage('data:image/png;base64,QQ==', fakeWinrt)
      expect(out2).toMatchObject({ ok: true, text: 'winrt', engine: 'winrt' })
      expect(winrtCalled).toBe(true)
      // rapid 抛异常 → 同样兜底
      setRapidOcrRunner(async () => { throw new Error('boom') })
      const out3 = await recognizeImage('data:image/png;base64,QQ==', fakeWinrt)
      expect(out3).toMatchObject({ engine: 'winrt' })
    } finally {
      setRapidOcrRunner(null)
      Object.defineProperty(process, 'platform', { value: before, configurable: true })
    }
  })
})
