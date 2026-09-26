// R191: session rename/delete lifecycle (index.json persistence + guards).
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAgentService } from '../../src/main/agentService'
import type { AgentEvent } from '../../src/shared/types'

let ws = ''
let events: AgentEvent[] = []

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), 'agent-life-'))
  events = []
})
afterEach(() => {
  vi.unstubAllGlobals()
  rmSync(ws, { recursive: true, force: true })
})

function makeSvc() {
  mkdirSync(join(ws, 'sessions'), { recursive: true })
  return createAgentService({
    resolveSettings: async () => ({ baseUrl: 'https://mock/v4', apiKey: 'k', model: 'm' }),
    pushEvent: (ev) => events.push(ev),
    sessionsDir: join(ws, 'sessions'),
    auditPath: join(ws, 'audit.jsonl'),
  })
}

describe('R191 session lifecycle (agentService)', () => {
  it('rename persists to index.json and overrides the derived title', () => {
    const svc = makeSvc()
    const dir = join(ws, 'sessions')
    writeFileSync(join(dir, 's-one.jsonl'), JSON.stringify({ kind: 'user', text: '原始首句' }) + '\n')
    expect(svc.sessionsList()[0].title).toBe('原始首句')
    const out = svc.sessionRename('s-one', '我的重命名会话')
    expect(out.ok).toBe(true)
    expect(svc.sessionsList()[0].title).toBe('我的重命名会话')
    expect(JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')).renames['s-one']).toBe('我的重命名会话')
    // rename survives a NEW service instance (fresh index read)
    const svc2 = makeSvc()
    expect(svc2.sessionsList()[0].title).toBe('我的重命名会话')
  })

  it('delete removes the JSONL and its rename entry; the ACTIVE session is protected', { timeout: 20_000 }, async () => {
    const svc = makeSvc()
    const dir = join(ws, 'sessions')
    writeFileSync(join(dir, 's-gone.jsonl'), JSON.stringify({ kind: 'user', text: 'x' }) + '\n')
    svc.sessionRename('s-gone', 'titled')
    const out = svc.sessionDelete('s-gone')
    expect(out.ok).toBe(true)
    expect(existsSync(join(dir, 's-gone.jsonl'))).toBe(false)
    expect(JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')).renames['s-gone']).toBeUndefined()

    // busy-session guard: start a run (stubbed provider blocks on approval)
    let releaseApproval: ((d: 'once' | 'always' | 'deny') => void) | undefined
    events = []
    const svc2 = makeSvc()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      headers: { get: (n: string) => (n.toLowerCase() === 'content-type' ? 'text/event-stream' : null) },
      body: new ReadableStream({
        start(c) {
          c.enqueue(Buffer.from('data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'w1', function: { name: 'write', arguments: '{"path":"a.txt","content":"x"}' } }] } }] }) + '\n\n'))
          c.enqueue(Buffer.from('data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n'))
          c.enqueue(Buffer.from('data: [DONE]\n\n'))
          c.close()
        },
      }),
    })))
    const sendP = svc2.send({ text: 'go', workspace: ws, mode: 'standard' })
    await vi.waitFor(() => expect(events.some((e) => e.kind === 'approval')).toBe(true))
    releaseApproval = undefined
    const guarded = svc2.sessionDelete((events.find((e) => e.kind === 'session-meta') as Extract<AgentEvent, { kind: 'session-meta' }>).sessionId)
    expect(guarded.ok).toBe(false)
    expect(guarded.error).toBe('busy-session')
    // cancel to release the loop
    svc2.cancel()
    await sendP
  })

  it('invalid ids and empty titles are rejected without touching disk', () => {
    const svc = makeSvc()
    expect(svc.sessionRename('../evil', 'x').error).toBe('invalid-id')
    expect(svc.sessionRename('ok-id', '   ').error).toBe('empty-title')
    expect(svc.sessionDelete('..\\evil').error).toBe('invalid-id')
    expect(existsSync(join(ws, 'sessions', 'index.json'))).toBe(false)
  })
})
