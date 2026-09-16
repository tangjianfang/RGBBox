import { describe, it, expect } from 'vitest'
import { Ai8Error, parseAi8SseLine } from '../../../src/renderer/src/ai8/client'

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
