import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAgentService } from '../../src/main/agentService'
import type { AgentEvent } from '../../src/shared/types'

// R180: full kernel-loop tests — the heart of the agent (model ↔ tools ↔
// approval ↔ events) driven through stubbed provider SSE responses.

let ws = ''
let events: AgentEvent[] = []
let providerCalls = 0

function sseBody(chunks: object[]): unknown {
  const text = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n'
  return {
    ok: true,
    status: 200,
    headers: { get: (n: string) => (n.toLowerCase() === 'content-type' ? 'text/event-stream' : null) },
    body: new ReadableStream({
      start(c) {
        c.enqueue(Buffer.from(text))
        c.close()
      },
    }),
  }
}

/** Two-turn provider: turn 1 → write tool_call (SSE); turn 2 → final prose. */
function stubTwoTurnFetch(): void {
  providerCalls = 0
  vi.stubGlobal('fetch', vi.fn(async () => {
    providerCalls += 1
    if (providerCalls === 1) {
      return sseBody([
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 't1', function: { name: 'write', arguments: '{"path":"hello.txt","content":"hi from agent"}' } }] } }] },
        { choices: [{ finish_reason: 'tool_calls' }] },
      ])
    }
    return sseBody([
      { choices: [{ delta: { content: 'done — wrote hello.txt' } }] },
      { choices: [{ finish_reason: 'stop' }] },
    ])
  }))
}

function makeSvc(mode: 'plan' | 'standard' | 'trust' = 'standard') {
  return createAgentService({
    resolveSettings: async () => ({ baseUrl: 'https://mock/v4', apiKey: 'k', model: 'test-model' }),
    pushEvent: (ev) => events.push(ev),
    sessionsDir: join(ws, 'sessions'),
    auditPath: join(ws, 'audit.jsonl'),
  })
}

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), 'agent-kernel-'))
  events = []
})
afterEach(() => {
  vi.unstubAllGlobals()
  rmSync(ws, { recursive: true, force: true })
})

describe('main/agentService kernel loop (R180)', () => {
  it('standard: write → approval once → file written → prose + ordered events', { timeout: 20_000 }, async () => {
    stubTwoTurnFetch()
    const svc = makeSvc('standard')
    const sendP = svc.send({ text: 'write hello', workspace: ws, mode: 'standard' })
    await vi.waitFor(() => expect(events.some((e) => e.kind === 'approval')).toBe(true))
    const appr = (events.find((e) => e.kind === 'approval') as Extract<AgentEvent, { kind: 'approval' }>).approval
    svc.respondApproval(appr.id, 'once')
    const out = await sendP

    expect(out.ok).toBe(true)
    expect(existsSync(join(ws, 'hello.txt'))).toBe(true)
    expect(readFileSync(join(ws, 'hello.txt'), 'utf8')).toBe('hi from agent')
    const kinds = events.map((e) => e.kind)
    expect(kinds).toContain('user')
    expect(kinds).toContain('tool-start')
    expect(kinds).toContain('tool-result')
    expect(kinds).toContain('text')
    expect(kinds[kinds.length - 1]).toBe('done')
    expect(providerCalls).toBe(2)
  })

  it('standard: DENIED write → no file, denial surfaced to the model, run completes', { timeout: 20_000 }, async () => {
    stubTwoTurnFetch()
    const svc = makeSvc('standard')
    const sendP = svc.send({ text: 'write hello', workspace: ws, mode: 'standard' })
    await vi.waitFor(() => expect(events.some((e) => e.kind === 'approval')).toBe(true))
    const appr = (events.find((e) => e.kind === 'approval') as Extract<AgentEvent, { kind: 'approval' }>).approval
    svc.respondApproval(appr.id, 'deny')
    const out = await sendP

    expect(out.ok).toBe(true)
    expect(existsSync(join(ws, 'hello.txt'))).toBe(false)
    const tr = events.find((e) => e.kind === 'tool-result')
    expect(tr && tr.kind === 'tool-result' && tr.call.status).toBe('denied')
    expect(events[kinds_last(events)]).toBeTruthy()
  })

  it('trust: no approval gate — tool runs immediately', { timeout: 20_000 }, async () => {
    stubTwoTurnFetch()
    const svc = makeSvc('trust')
    const out = await svc.send({ text: 'write hello', workspace: ws, mode: 'trust' })
    expect(out.ok).toBe(true)
    expect(existsSync(join(ws, 'hello.txt'))).toBe(true)
    expect(events.some((e) => e.kind === 'approval')).toBe(false)
  })

  it('a second send while one is running is rejected (no cross-run contamination)', { timeout: 20_000 }, async () => {
    // provider that opens a stream and NEVER finishes — keeps the run open
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: (n: string) => (n.toLowerCase() === 'content-type' ? 'text/event-stream' : null) },
      body: new ReadableStream({
        start(c) {
          const line = 'data: {"choices":[{"delta":{"content":"working…"}}]}\n\n'
          c.enqueue(Buffer.from(line, 'utf8'))
          // no close, no [DONE] — the turn never settles
        },
      }),
    })))
    const svc = makeSvc('trust')
    void svc.send({ text: 'first', workspace: ws, mode: 'trust' })
    const second = await svc.send({ text: 'second', workspace: ws, mode: 'trust' })
    expect(second.ok).toBe(false)
    expect(second.error).toBe('busy')
    svc.cancel()
  })
})

function kinds_last(events: AgentEvent[]): number {
  return events.length - 1
}
