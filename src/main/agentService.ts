/**
 * agentService — R172-S1/S3 编码 agent 内核(方案 A 的 pi 路线经 S0 spike 后
 * 作为可替换引擎保留;本内核是随包可用的默认引擎,直接复用现有
 * OpenAI-compat / Bedrock / AI8 三类 profile,并对 AI8 走 ReAct 文本协议桥)。
 *
 * 循环:messages(+tools)→ chat → 若有 tool_calls → 门禁执行 → 结果回填 → 下一轮;
 * 无 tool_calls 即回合结束。审批三档(plan/standard/trust)+ 会话 JSONL + 审计 JSONL。
 */
import { appendFileSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentApprovalRequest, AgentEvent, AgentMode, AgentSendArgs, AgentSessionMeta } from '../shared/types'
import type { AiChatMessage } from '../shared/types'
import type { AiCleanupSettings } from './aiCleanupService'
import { ai8ChatCompletion } from './ai8Provider'
import { AGENT_TOOL_SCHEMAS, isBashDenied, toolBash, toolEdit, toolGlob, toolList, toolRead, toolWrite } from './agentTools'

export const AGENT_MAX_TURNS = 24

// ── ReAct(AI8 桥)纯函数 ────────────────────────────────────────────────────

export interface ReactCall { tool: string; args: Record<string, unknown> }

/** 从 assistant 文本解析最后一个工具块(AI8 无 function-calling,协议见 REACT_SYSTEM)。 */
export function parseReactToolCall(text: string): ReactCall | null {
  const blocks = [...text.matchAll(/```(?:tool|json)?\s*([\s\S]*?)```/g)]
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    try {
      const parsed = JSON.parse(blocks[i][1].trim()) as { tool?: string; name?: string; args?: unknown; arguments?: unknown }
      const tool = parsed.tool ?? parsed.name
      if (typeof tool === 'string' && tool !== '') {
        const rawArgs = parsed.args ?? parsed.arguments
        const args = (rawArgs && typeof rawArgs === 'object' ? rawArgs : {}) as Record<string, unknown>
        return { tool, args }
      }
    } catch { /* not JSON — keep scanning */ }
  }
  return null
}

export const REACT_SYSTEM_PROMPT = `You are a coding agent working inside a workspace directory. You have NO native tool-calling; instead, when you want to use a tool you MUST reply with exactly one fenced block (and nothing after it):

\`\`\`tool
{"tool": "<name>", "args": { ... }}
\`\`\`

Available tools: read(path, offset?, limit?) · write(path, content) · edit(path, find, replace) · bash(command) · list(path, recursive?) · glob(pattern). All paths are workspace-relative. After the block, the environment replies with a TOOL_RESULT user message; continue until the task is done, then answer in plain prose WITHOUT any tool block. One tool call per reply. Never invent tool names.`

export const KERNEL_SYSTEM_PROMPT = `You are a focused coding agent. Use the provided tools to inspect and modify files inside the workspace (paths are workspace-relative). Prefer read/list/glob before writing; make minimal, surgical edits; run tests/builds with bash when useful. When the task is complete, stop calling tools and summarize what you did in one short paragraph.`

// ── 服务 ────────────────────────────────────────────────────────────────────

export interface AgentServiceDeps {
  /** 解析 profileId(空=激活档)为可调用设置(含解密后的 key)。 */
  resolveSettings: (profileId?: string) => Promise<AiCleanupSettings>
  /** 事件出口(index.ts 接 webContents.send)。 */
  pushEvent: (ev: AgentEvent) => void
  sessionsDir: string
  auditPath: string
}

interface PendingApproval { resolve: (d: 'once' | 'always' | 'deny') => void }

interface AgentRun {
  sessionId: string
  workspace: string
  mode: AgentMode
  settings: AiCleanupSettings
  cancelled: boolean
  messages: AiChatMessage[]
  /** 「总是允许」规则:bash 首词前缀 与 write/edit 的绝对路径。 */
  allowPrefixes: string[]
  allowPaths: string[]
  pending: Map<string, PendingApproval>
}

export function createAgentService(deps: AgentServiceDeps) {
  let run: AgentRun | null = null
  let seq = 0

  const emit = (ev: AgentEvent): void => {
    deps.pushEvent(ev)
    try {
      appendFileSync(join(deps.sessionsDir, `${runSessionId()}.jsonl`), JSON.stringify(ev) + '\n')
    } catch { /* session persistence is best-effort */ }
  }
  const runSessionId = (): string => (run ? run.sessionId : 'orphan')

  const audit = (entry: Record<string, unknown>): void => {
    try {
      appendFileSync(deps.auditPath, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n')
    } catch { /* best-effort */ }
  }

  const needsApproval = (mode: AgentMode, tool: string): boolean => {
    if (mode === 'trust') return false
    if (tool === 'write' || tool === 'edit' || tool === 'bash') return true
    return mode === 'plan' && false // read/list/glob stay auto in plan too
  }

  const askApproval = (approval: AgentApprovalRequest, allowKey: string, allowList: string[]): Promise<'once' | 'always' | 'deny'> => {
    if (allowList.some((k) => allowKey.startsWith(k) || allowKey === k)) return Promise.resolve('once')
    return new Promise((resolve) => {
      run?.pending.set(approval.id, { resolve })
      emit({ kind: 'approval', approval })
    })
  }

  const executeTool = async (callId: string, tool: string, args: Record<string, unknown>): Promise<string> => {
    const ws = run!.workspace
    const argsLine = JSON.stringify(args)
    emit({ kind: 'tool-start', call: { id: callId, name: tool, args: argsLine, result: '', status: 'running' } })

    const path = typeof args.path === 'string' ? args.path : ''
    const denial = isBashDenied(typeof args.command === 'string' ? args.command : '')
    if (tool === 'bash' && denial) {
      const text = 'ERR: command matched the destructive-command denylist'
      emit({ kind: 'tool-result', call: { id: callId, name: tool, args: argsLine, result: text, status: 'error' } })
      audit({ kind: 'tool', tool, denied: 'denylist', args: argsLine })
      return text
    }

    // Approval gate (decision ③: write/edit back up to .bak inside the tool impls)
    if (needsApproval(run!.mode, tool)) {
      let summary = ''
      let approval: AgentApprovalRequest
      let allowKey = ''
      if (tool === 'bash') {
        const command = String(args.command ?? '')
        summary = command
        approval = { id: `appr-${++seq}`, kind: 'bash', summary: command, command }
        allowKey = command
      } else if (tool === 'write') {
        const content = String(args.content ?? '')
        summary = `write ${path} (${content.length} bytes)`
        approval = { id: `appr-${++seq}`, kind: 'write', summary, path, after: content.slice(0, 2000) }
        allowKey = `path:${join(ws, path)}`
      } else {
        const find = String(args.find ?? '')
        const replaceWith = String(args.replace ?? '')
        summary = `edit ${path}: ${find.slice(0, 60)} → ${replaceWith.slice(0, 60)}`
        approval = { id: `appr-${++seq}`, kind: 'edit', summary, path, before: find.slice(0, 1000), after: replaceWith.slice(0, 1000) }
        allowKey = `path:${join(ws, path)}`
      }
      const decision = await askApproval(approval, allowKey, tool === 'bash' ? run!.allowPrefixes : run!.allowPaths)
      audit({ kind: 'approval', id: approval.id, tool, decision })
      if (decision === 'deny') {
        const text = 'DENIED by user — do not retry the same action; ask or adjust.'
        emit({ kind: 'tool-result', call: { id: callId, name: tool, args: argsLine, result: text, status: 'denied' } })
        return text
      }
      if (decision === 'always') {
        if (tool === 'bash') run!.allowPrefixes.push(String(args.command ?? '').split(/\s+/)[0] + ' ')
        else run!.allowPaths.push(allowKey)
      }
    }

    let outcome: { ok: boolean; text: string }
    switch (tool) {
      case 'read': outcome = await toolRead(ws, path, Number(args.offset ?? 0), Number(args.limit ?? 400)); break
      case 'write': outcome = await toolWrite(ws, path, String(args.content ?? '')); break
      case 'edit': outcome = await toolEdit(ws, path, String(args.find ?? ''), String(args.replace ?? '')); break
      case 'bash': outcome = await toolBash(ws, String(args.command ?? '')); break
      case 'list': outcome = toolList(ws, path, args.recursive === true); break
      case 'glob': outcome = toolGlob(ws, String(args.pattern ?? '')); break
      default: outcome = { ok: false, text: `ERR: unknown tool ${tool}` }
    }
    audit({ kind: 'tool', tool, ok: outcome.ok, args: argsLine })
    emit({ kind: 'tool-result', call: { id: callId, name: tool, args: argsLine, result: outcome.text, status: outcome.ok ? 'done' : 'error' } })
    return outcome.text
  }

  // ── 单轮 LLM 调用 ─────────────────────────────────────────────────────────
  const callModel = async (): Promise<{ content: string; toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> }> => {
    const s = run!.settings
    const isAi8 = s.baseUrl.startsWith('ai8://')
    const toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = []
    let content = ''

    if (isAi8) {
      // R172-S3: AI8 桥——会话制逆向协议无 function-calling,传输走
      // ai8Provider(会话管理/凭据/自动登录都在其内);工具调用由
      // REACT_SYSTEM_PROMPT 文本约定,这里只负责解析 ```tool``` 块。
      const out = await ai8ChatCompletion(run!.messages, s)
      if (!out.ok) throw new Error(out.hint ? `ai8: ${out.hint}` : 'ai8: request failed')
      content = out.text
      const parsed = parseReactToolCall(content)
      if (parsed) toolCalls.push({ id: `react-${++seq}`, name: parsed.tool, args: parsed.args })
      return { content, toolCalls }
    }

    const base = s.baseUrl.trim().replace(/\/+$/, '')
    const body: Record<string, unknown> = {
      model: s.model.trim(),
      messages: run!.messages,
      temperature: 0.3,
      tools: AGENT_TOOL_SCHEMAS,
      tool_choice: 'auto',
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (s.apiKey.trim() !== '') headers.Authorization = `Bearer ${s.apiKey.trim()}`
    const res = await fetch(`${base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(180_000) })
    if (!res.ok) throw new Error(`model HTTP ${res.status}`)
    const json = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: unknown
          tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>
        }
      }>
    }
    const message = json.choices?.[0]?.message
    content = typeof message?.content === 'string' ? message.content : ''
    if (Array.isArray(message?.tool_calls)) {
      for (const tc of message.tool_calls) {
        const name = tc.function?.name ?? ''
        if (name === '') continue
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(tc.function?.arguments ?? '{}') as Record<string, unknown> } catch { /* empty args */ }
        toolCalls.push({ id: tc.id ?? `call-${++seq}`, name, args })
      }
    }
    return { content, toolCalls }
  }

  // ── 公共 API(index.ts 挂 IPC)─────────────────────────────────────────────
  return {
    async send(a: AgentSendArgs): Promise<{ ok: boolean; sessionId: string; error?: string }> {
      if (run && run.pending.size > 0) return { ok: false, sessionId: '', error: 'approval-pending' }
      const settings = await deps.resolveSettings(a.profileId)
      const sessionId = a.sessionId && a.sessionId !== '' ? a.sessionId : `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
      mkdirSync(deps.sessionsDir, { recursive: true })
      const isNew = !(a.sessionId && a.sessionId !== '')
      run = { sessionId, workspace: a.workspace, mode: a.mode, settings, cancelled: false, messages: [], allowPrefixes: [], allowPaths: [], pending: new Map() }

      if (isNew) {
        run.messages.push({ role: 'system', content: settings.baseUrl.startsWith('ai8://') ? REACT_SYSTEM_PROMPT : KERNEL_SYSTEM_PROMPT })
      } else {
        // continuation: restore history from the session file
        try {
          const lines = readFileSync(join(deps.sessionsDir, `${sessionId}.jsonl`), 'utf8').split('\n').filter((l) => l.trim() !== '')
          const history: AiChatMessage[] = [{ role: 'system', content: settings.baseUrl.startsWith('ai8://') ? REACT_SYSTEM_PROMPT : KERNEL_SYSTEM_PROMPT }]
          for (const line of lines) {
            try {
              const ev = JSON.parse(line) as AgentEvent
              if (ev.kind === 'user') history.push({ role: 'user', content: ev.text })
              if (ev.kind === 'text' && ev.text.trim() !== '') history.push({ role: 'assistant', content: ev.text })
              if (ev.kind === 'tool-result') history.push({ role: 'user', content: `TOOL_RESULT ${ev.call.name}: ${ev.call.result.slice(0, 4000)}` })
            } catch { /* skip damaged line */ }
          }
          run.messages = history
        } catch { /* new file */ }
      }
      run.messages.push({ role: 'user', content: a.text })

      emit({ kind: 'session-meta', sessionId, model: settings.model })
      emit({ kind: 'user', text: a.text })
      try {
        for (let turn = 1; turn <= AGENT_MAX_TURNS; turn += 1) {
          if (run.cancelled) { emit({ kind: 'done', reason: 'cancelled' }); return { ok: true, sessionId } }
          emit({ kind: 'turn-start', turn })
          const { content, toolCalls } = await callModel()
          if (run.cancelled) { emit({ kind: 'done', reason: 'cancelled' }); return { ok: true, sessionId } }
          if (toolCalls.length === 0) {
            emit({ kind: 'text', text: content })
            run.messages.push({ role: 'assistant', content })
            emit({ kind: 'done', reason: 'completed' })
            return { ok: true, sessionId }
          }
          run.messages.push({ role: 'assistant', content: content === '' ? '(using tools)' : content })
          for (const tc of toolCalls) {
            const result = await executeTool(tc.id, tc.name, tc.args)
            run.messages.push({ role: 'user', content: `TOOL_RESULT ${tc.name}: ${result.slice(0, 8000)}` })
          }
        }
        emit({ kind: 'done', reason: 'max-turns' })
        return { ok: true, sessionId }
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e)
        emit({ kind: 'done', reason: 'error', error })
        return { ok: false, sessionId, error }
      }
    },

    cancel(): void {
      if (!run) return
      run.cancelled = true
      for (const [, p] of run.pending) p.resolve('deny')
      run.pending.clear()
    },

    respondApproval(id: string, decision: 'once' | 'always' | 'deny'): void {
      const pending = run?.pending.get(id)
      if (!pending) return
      run?.pending.delete(id)
      pending.resolve(decision)
    },

    sessionsList(): AgentSessionMeta[] {
      try {
        mkdirSync(deps.sessionsDir, { recursive: true })
        return readdirSync(deps.sessionsDir)
          .filter((f) => f.endsWith('.jsonl'))
          .map((f) => {
            const id = f.replace(/\.jsonl$/, '')
            let title = id
            let events = 0
            try {
              const lines = readFileSync(join(deps.sessionsDir, f), 'utf8').split('\n').filter((l) => l.trim() !== '')
              events = lines.length
              const firstUser = lines.map((l) => { try { return JSON.parse(l) as AgentEvent } catch { return null } }).find((ev) => ev?.kind === 'user')
              if (firstUser && firstUser.kind === 'user') title = firstUser.text.slice(0, 48)
            } catch { /* defaults */ }
            let updatedAt = 0
            try { updatedAt = statSync(join(deps.sessionsDir, f)).mtimeMs } catch { /* ignore */ }
            return { id, title, updatedAt, events }
          })
          .sort((x, y) => y.updatedAt - x.updatedAt)
          .slice(0, 30)
      } catch {
        return []
      }
    },

    sessionLoad(id: string): AgentEvent[] {
      try {
        const lines = readFileSync(join(deps.sessionsDir, `${id}.jsonl`), 'utf8').split('\n').filter((l) => l.trim() !== '')
        const out: AgentEvent[] = []
        for (const line of lines) {
          try { out.push(JSON.parse(line) as AgentEvent) } catch { /* skip */ }
        }
        return out
      } catch {
        return []
      }
    },

    /** 测试钩子:清空运行态。 */
    resetForTest(): void {
      run = null
    },
  }
}

export type AgentService = ReturnType<typeof createAgentService>
