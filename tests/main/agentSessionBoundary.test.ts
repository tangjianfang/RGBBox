// R188: approval "always" memory + damaged-JSONL session boundaries.
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAgentService } from '../../src/main/agentService'
import type { AgentEvent } from '../../src/shared/types'

let ws = ''
let events: AgentEvent[] = []
let providerCalls = 0

function sseToolCall(id: string, name: string, args: string): unknown {
  const text = [
    `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id, function: { name, arguments: args } }] } }] })}\n\n`,
    'data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n',
    'data: [DONE]\n\n',
  ].join('')
  return {
    ok: true,
    status: 200,
    headers: { get: (n: string) => (n.toLowerCase() === 'content-type' ? 'text/event-stream' : null) },
    body: new ReadableStream({ start(c) { c.enqueue(Buffer.from(text)); c.close() } }),
  }
}

function makeSvc(mode: 'plan' | 'standard' | 'trust') {
  return createAgentService({
    resolveSettings: async () => ({ baseUrl: 'https://mock/v4', apiKey: 'k', model: 'test-model' }),
    pushEvent: (ev) => events.push(ev),
    sessionsDir: join(ws, 'sessions'),
    auditPath: join(ws, 'audit.jsonl'),
  })
}

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), 'agent-bnd-'))
  events = []
  providerCalls = 0
})
afterEach(() => {
  vi.unstubAllGlobals()
  rmSync(ws, { recursive: true, force: true })
})

describe('R188 approval "always" memory (kernel end-to-end)', () => {
  it('bash always → later commands with the same first word run without a new approval', { timeout: 20_000 }, async () => {
    // 4 provider turns: bash(echo hi) → bash(echo again) → bash(ls -la) → prose
    const script: Array<{ id: string; name: string; args: string }> = [
      { id: 't1', name: 'bash', args: '{"command":"echo hi"}' },
      { id: 't2', name: 'bash', args: '{"command":"echo again"}' },
      { id: 't3', name: 'bash', args: '{"command":"ls -la"}' },
    ]
    vi.stubGlobal('fetch', vi.fn(async () => {
      const step = script[providerCalls] ?? null
      providerCalls += 1
      if (step) return sseToolCall(step.id, step.name, step.args)
      return {
        ok: true, status: 200,
        headers: { get: (n: string) => (n.toLowerCase() === 'content-type' ? 'text/event-stream' : null) },
        body: new ReadableStream({
          start(c) {
            c.enqueue(Buffer.from('data: {"choices":[{"delta":{"content":"all done"}}]}\n\ndata: {"choices":[{"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'))
            c.close()
          },
        }),
      }
    }))
    const svc = makeSvc('standard')
    const sendP = svc.send({ text: 'run commands', workspace: ws, mode: 'standard' })
    // first approval → ALWAYS (prefix "echo ")
    await vi.waitFor(() => expect(events.filter((e) => e.kind === 'approval').length).toBe(1))
    const [ap1] = events.filter((e) => e.kind === 'approval') as Extract<AgentEvent, { kind: 'approval' }>[]
    svc.respondApproval(ap1.approval.id, 'always')
    // second command: same "echo " prefix → NO approval, runs directly
    await vi.waitFor(() => expect(events.filter((e) => e.kind === 'tool-result').length).toBe(2))
    // third command: different first word → a NEW approval appears
    await vi.waitFor(() => expect(events.filter((e) => e.kind === 'approval').length).toBe(2))
    const [, ap2] = events.filter((e) => e.kind === 'approval') as Extract<AgentEvent, { kind: 'approval' }>[]
    svc.respondApproval(ap2.approval.id, 'once')
    const out = await sendP
    expect(out.ok).toBe(true)
    expect(providerCalls).toBe(4)
  })

  it('write always → a later write to the SAME path is approval-free', { timeout: 20_000 }, async () => {
    const script = [
      { id: 'w1', name: 'write', args: '{"path":"a.txt","content":"one"}' },
      { id: 'w2', name: 'write', args: '{"path":"a.txt","content":"two"}' },
    ]
    vi.stubGlobal('fetch', vi.fn(async () => {
      const step = script[providerCalls] ?? null
      providerCalls += 1
      if (step) return sseToolCall(step.id, step.name, step.args)
      return {
        ok: true, status: 200,
        headers: { get: (n: string) => (n.toLowerCase() === 'content-type' ? 'text/event-stream' : null) },
        body: new ReadableStream({
          start(c) {
            c.enqueue(Buffer.from('data: {"choices":[{"delta":{"content":"written twice"}}]}\n\ndata: {"choices":[{"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'))
            c.close()
          },
        }),
      }
    }))
    const svc = makeSvc('standard')
    const sendP = svc.send({ text: 'write a.txt twice', workspace: ws, mode: 'standard' })
    await vi.waitFor(() => expect(events.filter((e) => e.kind === 'approval').length).toBe(1))
    const [ap1] = events.filter((e) => e.kind === 'approval') as Extract<AgentEvent, { kind: 'approval' }>[]
    svc.respondApproval(ap1.approval.id, 'always')
    const out = await sendP
    expect(out.ok).toBe(true)
    // exactly ONE approval across both writes — the second rode the remembered path
    expect(events.filter((e) => e.kind === 'approval').length).toBe(1)
    expect(events.filter((e) => e.kind === 'tool-result').length).toBe(2)
    expect(existsSync(join(ws, 'a.txt'))).toBe(true)
  })
})

describe('R188 damaged-JSONL session boundaries', () => {
  it('sessionsList/sessionLoad tolerate damaged lines; continuation send skips them', { timeout: 20_000 }, async () => {
    const sessionsDir = join(ws, 'sessions')
    mkdirSync(sessionsDir, { recursive: true })
    writeFileSync(join(sessionsDir, 's-dmg.jsonl'), [
      JSON.stringify({ kind: 'user', text: '坏行之前的正常用户消息' }),
      '{this is not json',
      JSON.stringify({ kind: 'text', text: '正常助手消息' }),
      '',
    ].join('\n') + '\n')
    const svc = createAgentService({
      resolveSettings: async () => ({ baseUrl: 'https://mock/v4', apiKey: 'k', model: 'm' }),
      pushEvent: (ev) => events.push(ev),
      sessionsDir,
      auditPath: join(ws, 'audit.jsonl'),
    })
    const list = svc.sessionsList()
    expect(list.length).toBe(1)
    expect(list[0].id).toBe('s-dmg')
    expect(list[0].title).toBe('坏行之前的正常用户消息')
    const loaded = svc.sessionLoad('s-dmg')
    expect(loaded.length).toBe(2) // damaged line dropped
    // fully-damaged file → empty array, no throw
    writeFileSync(join(sessionsDir, 's-dead.jsonl'), 'not json at all\n{still not\n')
    expect(svc.sessionLoad('s-dead')).toEqual([])
    // continuation send restores parseable history and completes without crash
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      headers: { get: (n: string) => (n.toLowerCase() === 'content-type' ? 'text/event-stream' : null) },
      body: new ReadableStream({
        start(c) {
          c.enqueue(Buffer.from('data: {"choices":[{"delta":{"content":"continued fine"}}]}\n\ndata: {"choices":[{"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'))
          c.close()
        },
      }),
    })))
    const out = await svc.send({ text: '继续', workspace: ws, mode: 'plan', sessionId: 's-dmg' })
    expect(out.ok).toBe(true)
    const done = events.find((e) => e.kind === 'done')
    expect(done && done.kind === 'done' && done.reason).toBe('completed')
  })
})
