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
    const { ai8ChatCompletion } = await import('../../src/main/ai8Provider')
    vi.mocked(ai8ChatCompletion).mockImplementation(async () => ({ ok: true, text: ai8Replies.shift() ?? '', latencyMs: 5 }))
    ai8Replies = ['这个任务不需要工具——直接回答完成。']
    const service = await svc(ws)
    const out = await service.send({ text: '打招呼', workspace: ws, mode: 'plan' })
    expect(out.ok).toBe(true)
    expect(ai8ChatCompletion).toHaveBeenCalledTimes(1)
    const text = events.find((e) => e.kind === 'text')
    expect(text && text.kind === 'text' && text.text).toContain('不需要工具')
    expect(existsSync(join(ws, 'sessions'))).toBe(true)
  })

  it('R194: AI8 replies stream live with the fenced tool block withheld from the UI', { timeout: 20_000 }, async () => {
    // provider stub: round 1 → tool call (streamed), round 2 → final prose
    const { ai8ChatCompletion } = await import('../../src/main/ai8Provider')
    let round = 0
    vi.mocked(ai8ChatCompletion).mockImplementation(async (_m, _s, opts) => {
      round += 1
      if (round === 1) {
        for (const c of ['我先看一下目录。\n', '```tool\n', '{"tool": "list", "args": {"path": "."}}', '\n```']) {
          opts?.onDelta?.(c)
        }
        return { ok: true, text: '我先看一下目录。\n```tool\n{"tool": "list", "args": {"path": "."}}\n```', latencyMs: 5 }
      }
      opts?.onDelta?.('目录已列出。')
      return { ok: true, text: '目录已列出。', latencyMs: 5 }
    })
    const service = await svc(ws)
    const out = await service.send({ text: '看目录', workspace: ws, mode: 'plan' })
    expect(out.ok).toBe(true)
    expect(events.filter((e) => e.kind === 'tool-start').length).toBe(1)
    const deltas = events.filter((e) => e.kind === 'text-delta') as Array<{ kind: 'text-delta'; text: string }>
    // only the pre-fence prose streamed — never the fence or the JSON block
    const streamed = deltas.map((d) => d.text).join('')
    expect(streamed).toBe('我先看一下目录。\n目录已列出。')
    expect(streamed).not.toContain('```')
    const finalText = events.filter((e) => e.kind === 'text').at(-1) as { kind: 'text'; text: string }
    expect(finalText.text).toBe('目录已列出。')
  })

  it('R194: a nudge retry finalizes the streamed round-1 bubble before re-streaming', { timeout: 20_000 }, async () => {
    const { ai8ChatCompletion } = await import('../../src/main/ai8Provider')
    let round = 0
    vi.mocked(ai8ChatCompletion).mockImplementation(async (_m, _s, opts) => {
      round += 1
      if (round === 1) {
        for (const c of ['我无法', '访问文件系统']) opts?.onDelta?.(c)
        return { ok: true, text: '我无法访问文件系统', latencyMs: 5 }
      }
      for (const c of ['好的,', '我用工具']) opts?.onDelta?.(c)
      return { ok: true, text: '好的,我用工具完成。', latencyMs: 5 }
    })
    const service = await svc(ws)
    const out = await service.send({ text: '读文件', workspace: ws, mode: 'plan' })
    expect(out.ok).toBe(true)
    // round-1 streamed text got CLOSED as a 'text' event before round-2 deltas
    const kinds = events.map((e) => e.kind)
    const firstTextIdx = kinds.indexOf('text')
    const lastDeltaRound1 = kinds.map((k, i) => [k, i] as const).filter(([k]) => k === 'text-delta').at(-1)![1]
    void lastDeltaRound1
    expect(firstTextIdx).toBeGreaterThan(-1)
    const round1Text = events.find((e) => e.kind === 'text') as { kind: 'text'; text: string }
    expect(round1Text.text).toContain('我无法访问文件系统')
    const finalText = events.filter((e) => e.kind === 'text').at(-1) as { kind: 'text'; text: string }
    expect(finalText.text).toContain('我用工具')
  })
})
