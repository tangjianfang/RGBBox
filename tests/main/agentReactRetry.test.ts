// R186: prompt iteration + AI8 ReAct retry-round behavior.
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentEvent } from '../../src/shared/types'

// controllable AI8 provider stub — replies queued per call
let ai8Replies: string[] = []
vi.mock('../../src/main/ai8Provider', () => ({
  ai8ChatCompletion: vi.fn(async () => ({ ok: true, text: ai8Replies.shift() ?? '' })),
}))

async function svc(ws: string): Promise<ReturnType<typeof import('../../src/main/agentService').createAgentService>> {
  const { createAgentService } = await import('../../src/main/agentService')
  return createAgentService({
    resolveSettings: async () => ({ baseUrl: 'ai8://chat', apiKey: 't', model: 'm' }),
    pushEvent: (ev: AgentEvent) => events.push(ev),
    sessionsDir: join(ws, 'sessions'),
    auditPath: join(ws, 'audit.jsonl'),
  })
}

let ws = ''
let events: AgentEvent[] = []

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), 'agent-react-'))
  events = []
  ai8Replies = []
})
afterEach(() => {
  vi.clearAllMocks()
  rmSync(ws, { recursive: true, force: true })
})

describe('R186 prompts', () => {
  it('KERNEL/REACT system prompts carry the workflow, failure and finish constraints', async () => {
    const mod = await import('../../src/main/agentService')
    for (const p of [mod.KERNEL_SYSTEM_PROMPT, mod.REACT_SYSTEM_PROMPT]) {
      expect(p).toMatch(/never (write or )?edit a file you (have )?not read/i)
      expect(p).toMatch(/try a different approach|try a DIFFERENT approach/i)
      expect(p).toMatch(/after 2 failures stop and report/i)
      expect(p).toMatch(/what changed, how to verify/i)
      expect(p).toMatch(/no preamble/i)
    }
    // ReAct protocol extras
    expect(mod.REACT_SYSTEM_PROMPT).toMatch(/double quotes, no trailing commas/i)
    expect(mod.REACT_SYSTEM_PROMPT).toMatch(/TOOL_RESULT/i)
    // turn prompt carries the read-before-write nudge for system-ignoring models
    expect(mod.buildAi8TurnPrompt('C:/ws', 'task')).toContain('先读后写')
  })
})

describe('R186 AI8 retry rounds', () => {
  it('a malformed tool block gets one corrective round, then executes the fixed call', { timeout: 20_000 }, async () => {
    ai8Replies = [
      'I will list the directory.\n```tool\n{"tool": "list", "args": {"path": "."},}\n```', // trailing comma → unparseable
      '```tool\n{"tool": "list", "args": {"path": "."}}\n```', // fixed
      'Directory listed — done in prose.', // final answer next turn
    ]
    const service = await svc(ws)
    const out = await service.send({ text: '看看目录', workspace: ws, mode: 'plan' })
    expect(out.ok).toBe(true)
    // the corrective nudge round happened (3 provider calls for 2 model turns)
    const { ai8ChatCompletion } = await import('../../src/main/ai8Provider')
    expect(ai8ChatCompletion).toHaveBeenCalledTimes(3)
    const kinds = events.map((e) => e.kind)
    expect(kinds).toContain('tool-start')
    expect(kinds).toContain('text')
  })

  it('exhausted retries with lingering tool intent fail the run instead of silently completing', { timeout: 20_000 }, async () => {
    ai8Replies = [
      '```tool\n{"tool": "read", "args": {"path": "a.txt"} unparseable}\n```',
      '```tool\n{"tool": "read", "args": {"path": "a.txt"} still bad}\n```',
      '```tool\n{"tool": "read", "args": {"path": "a.txt"} nope}\n```',
    ]
    const service = await svc(ws)
    const out = await service.send({ text: '读文件', workspace: ws, mode: 'plan' })
    expect(out.ok).toBe(false)
    expect(out.error).toContain('react protocol')
    const done = events.find((e) => e.kind === 'done')
    expect(done && done.kind === 'done' && done.reason).toBe('error')
  })

  it('a plain-prose reply without tool intent is accepted as the final answer, no retries', { timeout: 20_000 }, async () => {
    ai8Replies = ['这个任务不需要工具——直接回答完成。']
    const service = await svc(ws)
    const out = await service.send({ text: '打招呼', workspace: ws, mode: 'plan' })
    expect(out.ok).toBe(true)
    const { ai8ChatCompletion } = await import('../../src/main/ai8Provider')
    expect(ai8ChatCompletion).toHaveBeenCalledTimes(1)
    const text = events.find((e) => e.kind === 'text')
    expect(text && text.kind === 'text' && text.text).toContain('不需要工具')
    expect(existsSync(join(ws, 'sessions'))).toBe(true)
  })
})
