import { describe, it, expect } from 'vitest'
import { Ai8Error, buildChatBody, parseAi8SseLine } from '../../../src/renderer/src/ai8/client'

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

describe('renderer/ai8 buildChatBody (R116.1)', () => {
  it('carries the model — the server rejects a chat without it (模型 是必填项)', () => {
    const body = buildChatBody(7, 'hi', { model: 'openai_chat::gpt-5.4', thinking: true })
    expect(body.model).toBe('openai_chat::gpt-5.4')
    expect(body.text).toBe('hi')
    expect(body.sessionId).toBe(7)
    expect(body.thinking).toBe(true)
    expect(body.webSearch).toBe(false)
    expect(body.files).toEqual([])
  })

  it('keeps a numeric sessionId as a number and defaults model to empty', () => {
    const body = buildChatBody('123', 'q', { files: [{ name: 'a.png', url: 'data:image/png;base64,x' }] })
    expect(body.sessionId).toBe('123')
    expect(body.model).toBe('')
    expect(body.files).toEqual([{ name: 'a.png', url: 'data:image/png;base64,x' }])
    expect(body.systemPrompt).toBeUndefined()
  })
})
