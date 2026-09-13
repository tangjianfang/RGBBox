import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  cleanupOcrText, detectTranslateDirection, parseCleanupResponse, translateOcrText,
  chatCompletion, buildTestMessages, testConnection, TRANSLATE_PROMPTS,
  DEFAULT_AI_SETTINGS, type AiCleanupSettings,
} from '../../src/main/aiCleanupService'

afterEach(() => vi.unstubAllGlobals())

const settings: AiCleanupSettings = { baseUrl: 'https://x.example/v4', apiKey: 'k', model: 'glm-5.3-flash' }

/** Captures (url, init) of the next fetch and replies with an ok chat body. */
function stubFetchCapture(replay: (url: string, init: RequestInit) => Response = () =>
  new Response(JSON.stringify({ choices: [{ message: { content: 'pong' } }] }), { status: 200 })) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return replay(url, init)
  }))
  return calls
}

describe('aiCleanupService pure (R83, payload level)', () => {
  it('parseCleanupResponse extracts content; rejects invalid shapes', () => {
    expect(parseCleanupResponse({ choices: [{ message: { content: '整理后' } }] })).toBe('整理后')
    expect(parseCleanupResponse({ choices: [] })).toBeNull()
    expect(parseCleanupResponse({ error: 'x' })).toBeNull()
    expect(parseCleanupResponse({ choices: [{ message: { content: '   ' } }] })).toBeNull()
  })

  it('cleanupOcrText without key short-circuits to nokey (no fetch)', async () => {
    const out = await cleanupOcrText('文本', DEFAULT_AI_SETTINGS)
    expect(out).toEqual({ ok: false, text: '', hint: 'nokey' })
  })

  it('cleanupOcrText: OpenAI-compatible URL join + payload (ported from the deleted builder)', async () => {
    const calls = stubFetchCapture()
    const out = await cleanupOcrText('会 议 记 录', {
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4/',
      apiKey: ' sk-test ',
      model: 'glm-4-flash',
    })
    expect(out.ok).toBe(true)
    expect(calls[0].url).toBe('https://open.bigmodel.cn/api/paas/v4/chat/completions')
    const body = JSON.parse(calls[0].init.body as string)
    expect(body.model).toBe('glm-4-flash')
    expect(body.messages).toHaveLength(2)
    expect(body.messages[1].content).toBe('会 议 记 录')
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
  })

  it('R84: detectTranslateDirection by CJK/letter ratio', () => {
    expect(detectTranslateDirection('会议记录 2026')).toBe('zh2en')       // 中文为主
    expect(detectTranslateDirection('Video Workstation')).toBe('en2zh')   // 英文为主
    expect(detectTranslateDirection('123 456')).toBe('zh2en')             // 中性默认
  })

  it('R84: translateOcrText picks prompt by direction; TRANSLATE_PROMPTS is the single source', async () => {
    const calls = stubFetchCapture()
    await translateOcrText('会议记录', { ...DEFAULT_AI_SETTINGS, apiKey: 'k' })
    expect(JSON.parse(calls[0].init.body as string).messages[0].content).toBe(TRANSLATE_PROMPTS.zh2en)
    await translateOcrText('meeting notes', { ...DEFAULT_AI_SETTINGS, apiKey: 'k' })
    expect(JSON.parse(calls[1].init.body as string).messages[0].content).toBe(TRANSLATE_PROMPTS.en2zh)
    expect(calls[0].url).toBe('https://open.bigmodel.cn/api/paas/v4/chat/completions')
  })

  it('R84: translateOcrText without key short-circuits (no fetch)', async () => {
    expect(await translateOcrText('文本', DEFAULT_AI_SETTINGS)).toEqual({ ok: false, text: '', hint: 'nokey' })
  })
})

describe('chatCompletion (R88)', () => {
  it('returns ok + text + latencyMs on 200 with choices', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ choices: [{ message: { content: 'pong' } }] }), { status: 200 }
    )))
    const out = await chatCompletion([{ role: 'user', content: 'ping' }], settings)
    expect(out.ok).toBe(true)
    expect(out.text).toBe('pong')
    expect(out.latencyMs).toBeGreaterThanOrEqual(0)
  })
  it('classifies auth (401) and http (500)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 401 })))
    expect((await chatCompletion([{ role: 'user', content: 'p' }], settings)).hint).toBe('auth')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 500 })))
    expect((await chatCompletion([{ role: 'user', content: 'p' }], settings)).hint).toBe('http')
  })
  it('nokey without key (remote); parse on bad shape; network on fetch throw; empty messages → parse', async () => {
    expect((await chatCompletion([{ role: 'user', content: 'p' }], { ...settings, apiKey: '' })).hint).toBe('nokey')
    expect((await chatCompletion([], settings)).hint).toBe('parse')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ nope: 1 }), { status: 200 })))
    expect((await chatCompletion([{ role: 'user', content: 'p' }], settings)).hint).toBe('parse')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect((await chatCompletion([{ role: 'user', content: 'p' }], settings)).hint).toBe('network')
  })
  it('R88 review fix: keyless local endpoints (Ollama) work and omit the Authorization header', async () => {
    const calls = stubFetchCapture()
    const out = await chatCompletion(
      [{ role: 'user', content: 'hi' }],
      { baseUrl: 'http://localhost:11434/v1', apiKey: '', model: 'qwen3.6:35b' },
    )
    expect(out.ok).toBe(true)
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBeUndefined()
  })
})

describe('testConnection (R88/R89)', () => {
  it('pings with a tiny user message and max_tokens 16 (R89: headroom for reasoning models)', async () => {
    const calls = stubFetchCapture()
    expect(buildTestMessages()).toEqual([{ role: 'user', content: 'ping' }])
    const out = await testConnection(settings)
    expect(out.ok).toBe(true)
    expect(JSON.parse(calls[0].init.body as string).max_tokens).toBe(16)
  })
})

describe('chatCompletion probe mode (R89.1)', () => {
  it('probe: 200 + choices array succeeds even with EMPTY content (thinking models burn max_tokens)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ choices: [{ message: { content: '' }, finish_reason: 'length' }] }), { status: 200 }
    )))
    const out = await chatCompletion([{ role: 'user', content: 'ping' }], settings, { maxTokens: 16, probe: true })
    expect(out.ok).toBe(true)
    expect(out.text).toBe('')
  })
  it('probe still fails on 200 without a choices array (parse) and on http errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ nope: 1 }), { status: 200 })))
    expect((await chatCompletion([{ role: 'user', content: 'p' }], settings, { probe: true })).hint).toBe('parse')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 401 })))
    expect((await chatCompletion([{ role: 'user', content: 'p' }], settings, { probe: true })).hint).toBe('auth')
  })
  it('non-probe still rejects empty content (cleanup/translate semantics unchanged)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ choices: [{ message: { content: '' } }] }), { status: 200 }
    )))
    expect((await chatCompletion([{ role: 'user', content: 'p' }], settings)).hint).toBe('parse')
  })
})

describe('DEFAULT_AI_SETTINGS (R88.5)', () => {
  it('default model is glm-5.3-flash on the zhipu endpoint', () => {
    expect(DEFAULT_AI_SETTINGS.model).toBe('glm-5.3-flash')
    expect(DEFAULT_AI_SETTINGS.baseUrl).toBe('https://open.bigmodel.cn/api/paas/v4')
  })
})
