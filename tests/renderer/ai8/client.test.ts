import { describe, it, expect } from 'vitest'
import { Ai8Client, Ai8Error, buildChatBody, isDrawLimitError, parseAi8SseLine } from '../../../src/shared/ai8Client'

describe('renderer/ai8 client (R110)', () => {
  it('parses delta payloads and accumulates the full text', () => {
    let full = ''
    const first = parseAi8SseLine('{"code":0,"data":"你好"}', full)
    expect(first.event).toEqual({ type: 'delta', text: '你好' })
    expect(first.stop).toBe(false)
    full = first.full
    const second = parseAi8SseLine('{"code":0,"data":"，世界"}', full)
    expect(second.full).toBe('你好，世界')
  })

  it('maps [DONE] and mid-stream errors to terminal events', () => {
    const done = parseAi8SseLine('[DONE]', 'abc')
    expect(done.event.type).toBe('done')
    expect(done.stop).toBe(true)
    const failed = parseAi8SseLine('{"code":40901,"msg":"额度不足"}', '')
    expect(failed.event).toEqual({ type: 'error', message: '额度不足' })
    expect(failed.stop).toBe(true)
  })

  it('emits extra events for object payloads and skips malformed lines', () => {
    const extra = parseAi8SseLine('{"code":0,"data":{"tokens":12}}', '')
    expect(extra.event.type).toBe('extra')
    const junk = parseAi8SseLine('not-json', 'kept')
    expect(junk.event.type).toBe('done')
    expect(junk.stop).toBe(false)
    expect(junk.full).toBe('kept')
  })

  it('Ai8Error carries the business code', () => {
    const error = new Ai8Error(2, '登录已过期')
    expect(error.code).toBe(2)
    expect(error.message).toBe('登录已过期')
  })
})

describe('renderer/ai8 draw recovery (R120)', () => {
  it('isDrawLimitError matches only the ONE-running-task rejection wording', () => {
    expect(isDrawLimitError(new Ai8Error(1, '您当前进行中的绘图任务数量已达到上限1个，请稍后再试'))).toBe(true)
    expect(isDrawLimitError(new Ai8Error(1, '绘图任务已达上限，请稍候'))).toBe(true)
    // server-side outages must surface as-is, never adopt
    expect(isDrawLimitError(new Ai8Error(1, '没有可用的渠道，请联系管理检查本模块的渠道管理是否已配置或启用对应模型所属渠道'))).toBe(false)
    expect(isDrawLimitError(new Ai8Error(2, 'login expired'))).toBe(false)
    expect(isDrawLimitError(new TypeError('network'))).toBe(false)
    expect(isDrawLimitError('a string')).toBe(false)
  })

  it('drawRecords pages through GET /draw with token headers', async () => {
    const calls: { url: string; headers: Record<string, string> }[] = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (url: string, init?: { headers?: Record<string, string> }) => {
      calls.push({ url: String(url), headers: init?.headers ?? {} })
      return new Response(JSON.stringify({ code: 0, data: { records: [{ taskId: 't1' }] }, msg: '' }), { status: 200 })
    }) as typeof fetch
    try {
      const client = new Ai8Client({ token: 'tk' })
      const out = await client.drawRecords<{ records: { taskId: string }[] }>(2, 12)
      expect(out.records).toEqual([{ taskId: 't1' }])
      expect(calls[0].url).toBe('https://ai8.rcouyi.com/api/draw?page=2&size=12')
      expect(calls[0].headers.Authorization).toBe('tk')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('renderer/ai8 buildChatBody (R116.1 round 2 — live-site protocol)', () => {
  it('sends exactly the site frontend fields — model lives on the SESSION, not the body', () => {
    const body = buildChatBody(7, 'hi', { thinking: true })
    expect(Object.keys(body).sort()).toEqual(['files', 'nativeToolOptions', 'nativeTools', 'reasoningEffort', 'sessionId', 'text', 'thinking', 'webSearch'])
    expect('model' in body).toBe(false) // extra key → strict decoder 400 (silent network error)
    expect(body.text).toBe('hi')
    expect(body.sessionId).toBe(7)
    expect(body.thinking).toBe(true)
    expect(body.webSearch).toBe(false)
    expect(body.files).toEqual([])
  })

  it('keeps a numeric sessionId as a number and adds systemPrompt only when set', () => {
    const body = buildChatBody('123', 'q', { files: [{ name: 'a.png', url: 'data:image/png;base64,x' }], systemPrompt: 'be brief' })
    expect(body.sessionId).toBe('123')
    expect(body.files).toEqual([{ name: 'a.png', url: 'data:image/png;base64,x' }])
    expect(body.systemPrompt).toBe('be brief')
  })
})
