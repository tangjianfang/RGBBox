import { describe, expect, it } from 'vitest'
import { createSseAssembler } from '../../src/main/agentService'

// R175: incremental SSE parser for Claude-style streaming (stream:true).

function lines(assembler: ReturnType<typeof createSseAssembler>, block: string) {
  const outs = []
  for (const line of block.split('\n')) {
    const r = assembler.feed(line)
    if (r.delta !== '' || r.newToolCalls.length > 0 || r.done) outs.push(r)
  }
  return outs
}

describe('main/agentService createSseAssembler (R175)', () => {
  it('streams content deltas and finishes on [DONE]', () => {
    const a = createSseAssembler()
    const outs = lines(a, [
      'data: {"choices":[{"delta":{"content":"He"}}]}',
      '',
      'data: {"choices":[{"delta":{"content":"llo"}}]}',
      'data: [DONE]',
    ].join('\n'))
    expect(a.content).toBe('Hello')
    expect(outs.filter((o) => o.delta !== '').map((o) => o.delta)).toEqual(['He', 'llo'])
    expect(outs.some((o) => o.done)).toBe(true)
  })

  it('accumulates tool_call argument fragments by index and materialises on finish', () => {
    const a = createSseAssembler()
    lines(a, [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"wri","arguments":""}}]}}]}',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"te","arguments":"{\\"pa"}}]}}]}',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"th\\":\\"a.txt\\"}"}}]}}]}',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"c2","function":{"name":"bash","arguments":"{\\"command\\":\\"ls\\"}"}}]}}]}',
      'data: {"choices":[{"finish_reason":"tool_calls"}]}',
    ].join('\n'))
    const calls = a.finish(100)
    expect(calls).toEqual([
      { id: 'c1', name: 'write', args: { path: 'a.txt' } },
      { id: 'c2', name: 'bash', args: { command: 'ls' } },
    ])
  })

  it('ignores keep-alive / non-JSON lines without throwing', () => {
    const a = createSseAssembler()
    expect(a.feed(': keep-alive').delta).toBe('')
    expect(a.feed('event: ping').delta).toBe('')
    expect(a.feed('data: not-json').delta).toBe('')
    expect(a.content).toBe('')
  })

  it('finish_reason alone marks done; missing name fragments are dropped', () => {
    const a = createSseAssembler()
    const outs = lines(a, [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{}"}}]}}]}',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
    ].join('\n'))
    expect(outs.some((o) => o.done)).toBe(true)
    expect(a.finish(1)).toEqual([])
  })
})
