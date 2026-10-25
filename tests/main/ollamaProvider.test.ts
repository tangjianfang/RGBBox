import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  ollamaChatCompletion, ollamaHost, isOllamaSettings, parseOllamaChatResponse,
  OLLAMA_DEFAULT_MODEL,
} from '../../src/main/ollamaProvider'
import { chatCompletion, type AiCleanupSettings } from '../../src/main/aiCleanupService'

afterEach(() => { vi.unstubAllGlobals(); delete process.env.OLLAMA_HOST })

const native = (model = 'beam:cloud'): AiCleanupSettings => ({ baseUrl: 'ollama://chat', apiKey: '', model })

/** Captures (url, init) of the next fetch and replies with a fixed Response. */
function stubFetch(replay: () => Response) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return replay()
  }))
  return calls
}

const okNative = (content: string) =>
  new Response(JSON.stringify({ model: 'beam:cloud', message: { role: 'assistant', content }, done: true }), { status: 200 })

describe('ollamaHost (R318)', () => {
  it('defaults to the standard loopback port when OLLAMA_HOST is unset/blank', () => {
    expect(ollamaHost(undefined)).toBe('http://127.0.0.1:11434')
    expect(ollamaHost('   ')).toBe('http://127.0.0.1:11434')
  })
  it('accepts bare host:port and full URLs; trims trailing slashes', () => {
    expect(ollamaHost('nas.local:11434')).toBe('http://nas.local:11434')
    expect(ollamaHost('http://127.0.0.1:11434/')).toBe('http://127.0.0.1:11434')
    expect(ollamaHost('https://ollama.example.org')).toBe('https://ollama.example.org')
  })
})

describe('parseOllamaChatResponse (R318)', () => {
  it('extracts message.content; rejects missing/blank/OpenAI-shaped bodies', () => {
    expect(parseOllamaChatResponse({ message: { role: 'assistant', content: '你好' } })).toBe('你好')
    expect(parseOllamaChatResponse({ message: { content: '   ' } })).toBeNull()
    expect(parseOllamaChatResponse({ choices: [{ message: { content: 'x' } }] })).toBeNull() // OpenAI shape ≠ native
    expect(parseOllamaChatResponse({ error: 'x' })).toBeNull()
    expect(parseOllamaChatResponse(null)).toBeNull()
  })
})

describe('isOllamaSettings (R318)', () => {
  it('matches the pseudo-protocol exactly, whitespace tolerated', () => {
    expect(isOllamaSettings({ baseUrl: 'ollama://chat' })).toBe(true)
    expect(isOllamaSettings({ baseUrl: ' ollama://chat ' })).toBe(true)
    expect(isOllamaSettings({ baseUrl: 'http://localhost:11434/v1' })).toBe(false)
    expect(isOllamaSettings({ baseUrl: '' })).toBe(false)
  })
})

describe('ollamaChatCompletion wire format (R318)', () => {
  it('chatCompletion dispatches ollama://chat to the native /api/chat payload — stream:false, options mapped, no auth header', async () => {
    const calls = stubFetch(() => okNative('pong'))
    const out = await chatCompletion([{ role: 'user', content: 'ping' }], native(), { maxTokens: 16, temperature: 0.7 })
    expect(out.ok).toBe(true)
    expect(out.text).toBe('pong')
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('http://127.0.0.1:11434/api/chat')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      model: 'beam:cloud',
      messages: [{ role: 'user', content: 'ping' }],
      stream: false,
      options: { temperature: 0.7, num_predict: 16 },
    })
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('honors OLLAMA_HOST and falls back to the preset default on an empty model', async () => {
    process.env.OLLAMA_HOST = 'http://nas.local:11434/'
    const calls = stubFetch(() => okNative('hi'))
    const out = await ollamaChatCompletion([{ role: 'user', content: 'x' }], { model: '  ' })
    expect(out.ok).toBe(true)
    expect(calls[0].url).toBe('http://nas.local:11434/api/chat')
    expect(JSON.parse(calls[0].init.body as string).model).toBe(OLLAMA_DEFAULT_MODEL)
  })
})

describe('ollamaChatCompletion outcome mapping (R318)', () => {
  it('probe accepts an empty content — thinking models burn tiny num_predict budgets', async () => {
    stubFetch(() => okNative(''))
    const out = await ollamaChatCompletion([{ role: 'user', content: 'ping' }], native(), { probe: true, maxTokens: 16 })
    expect(out).toMatchObject({ ok: true, text: '' })
  })

  it('non-probe empty content is a parse failure', async () => {
    stubFetch(() => okNative(''))
    const out = await ollamaChatCompletion([{ role: 'user', content: 'ping' }], native())
    expect(out).toMatchObject({ ok: false, hint: 'parse' })
  })

  it('404 carries the daemon error text; 401 maps to auth', async () => {
    stubFetch(() => new Response(JSON.stringify({ error: "model 'beam:cloud' not found" }), { status: 404 }))
    const out = await ollamaChatCompletion([{ role: 'user', content: 'x' }], native())
    expect(out).toMatchObject({ ok: false, hint: 'http' })
    expect(out.detail).toContain('not found')
    stubFetch(() => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }))
    const auth = await ollamaChatCompletion([{ role: 'user', content: 'x' }], native())
    expect(auth).toMatchObject({ ok: false, hint: 'auth' })
  })

  it('connection refusal (fetch TypeError) → network + daemon guidance detail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
    const out = await ollamaChatCompletion([{ role: 'user', content: 'x' }], native())
    expect(out).toMatchObject({ ok: false, hint: 'network' })
    expect(out.detail).toContain('11434')
  })

  it('empty message list short-circuits without a fetch', async () => {
    const calls = stubFetch(() => okNative('x'))
    const out = await ollamaChatCompletion([], native())
    expect(out).toMatchObject({ ok: false, hint: 'parse' })
    expect(calls).toHaveLength(0)
  })
})
