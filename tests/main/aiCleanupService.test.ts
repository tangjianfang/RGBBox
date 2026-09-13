import { describe, it, expect } from 'vitest'
import {
  buildCleanupRequest, buildTranslateRequest, cleanupOcrText, detectTranslateDirection,
  parseCleanupResponse, translateOcrText, DEFAULT_AI_SETTINGS,
} from '../../src/main/aiCleanupService'

describe('aiCleanupService pure (R83)', () => {
  it('buildCleanupRequest: no key / empty text → null', () => {
    expect(buildCleanupRequest('文本', { ...DEFAULT_AI_SETTINGS, apiKey: '' })).toBeNull()
    expect(buildCleanupRequest('  ', { ...DEFAULT_AI_SETTINGS, apiKey: 'sk-x' })).toBeNull()
  })

  it('buildCleanupRequest: OpenAI-compatible URL join + payload', () => {
    const req = buildCleanupRequest('会 议 记 录', {
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4/',
      apiKey: ' sk-test ',
      model: 'glm-4-flash',
    })
    expect(req).not.toBeNull()
    expect(req!.url).toBe('https://open.bigmodel.cn/api/paas/v4/chat/completions')
    const body = JSON.parse(req!.init.body as string)
    expect(body.model).toBe('glm-4-flash')
    expect(body.messages).toHaveLength(2)
    expect(body.messages[1].content).toBe('会 议 记 录')
    expect((req!.init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
  })

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

  it('R84: detectTranslateDirection by CJK/letter ratio', () => {
    expect(detectTranslateDirection('会议记录 2026')).toBe('zh2en')       // 中文为主
    expect(detectTranslateDirection('Video Workstation')).toBe('en2zh')   // 英文为主
    expect(detectTranslateDirection('123 456')).toBe('zh2en')             // 中性默认
  })

  it('R84: buildTranslateRequest picks prompt by direction; empty key → null', () => {
    expect(buildTranslateRequest('文本', DEFAULT_AI_SETTINGS)).toBeNull()
    const zh = buildTranslateRequest('会议记录', { ...DEFAULT_AI_SETTINGS, apiKey: 'k' })
    const bodyZh = JSON.parse(zh!.init.body as string)
    expect(bodyZh.messages[0].content).toContain('中文文本翻译成英文')
    const en = buildTranslateRequest('meeting notes', { ...DEFAULT_AI_SETTINGS, apiKey: 'k' })
    expect(JSON.parse(en!.init.body as string).messages[0].content).toContain('英文文本翻译成中文')
    expect(zh!.url).toBe('https://open.bigmodel.cn/api/paas/v4/chat/completions')
  })

  it('R84: translateOcrText without key short-circuits (no fetch)', async () => {
    expect(await translateOcrText('文本', DEFAULT_AI_SETTINGS)).toEqual({ ok: false, text: '', hint: 'nokey' })
  })
})

// ── R88: AI Lab generic pipeline ───────────────────────────────────────────
import { chatCompletion, buildTestMessages, testConnection } from '../../src/main/aiCleanupService'
import { vi, afterEach } from 'vitest'
import type { AiCleanupSettings } from '../../src/main/aiCleanupService'

afterEach(() => vi.unstubAllGlobals())

const settings: AiCleanupSettings = { baseUrl: 'https://x.example/v4', apiKey: 'k', model: 'glm-5.3-flash' }

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
  it('nokey without key; parse on bad shape; network on fetch throw; empty messages → parse', async () => {
    expect((await chatCompletion([{ role: 'user', content: 'p' }], { ...settings, apiKey: '' })).hint).toBe('nokey')
    expect((await chatCompletion([], settings)).hint).toBe('parse')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ nope: 1 }), { status: 200 })))
    expect((await chatCompletion([{ role: 'user', content: 'p' }], settings)).hint).toBe('parse')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect((await chatCompletion([{ role: 'user', content: 'p' }], settings)).hint).toBe('network')
  })
})

describe('testConnection (R88)', () => {
  it('pings with a tiny user message and max_tokens 8', async () => {
    let captured: { max_tokens?: number } | undefined
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      captured = JSON.parse(init.body as string)
      return new Response(JSON.stringify({ choices: [{ message: { content: 'pong' } }] }), { status: 200 })
    }))
    expect(buildTestMessages()).toEqual([{ role: 'user', content: 'ping' }])
    const out = await testConnection(settings)
    expect(out.ok).toBe(true)
    expect(captured?.max_tokens).toBe(8)
  })
})

describe('DEFAULT_AI_SETTINGS (R88.5)', () => {
  it('default model is glm-5.3-flash on the zhipu endpoint', () => {
    expect(DEFAULT_AI_SETTINGS.model).toBe('glm-5.3-flash')
    expect(DEFAULT_AI_SETTINGS.baseUrl).toBe('https://open.bigmodel.cn/api/paas/v4')
  })
})
