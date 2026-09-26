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

/**
 * R178: AI8 桥的工具可见性——站点的 systemPrompt 参数对部分模型不生效
 * (实测「评估项目」回复"无法读取目录"),ReAct 工具说明必须随用户消息
 * 直接注入。每轮初始提示都带,TOOL_RESULT 消息不带。
 */
export function buildAi8TurnPrompt(workspace: string, text: string): string {
  const fence = '```'
  const legend = [
    `[工作区] ${workspace}`,
    `[工具] 你可以调用以下工具来完成该任务(路径一律相对工作区):`,
    `read(path) · write(path, content) · edit(path, find, replace) · bash(command) · list(path) · glob(pattern)`,
    `调用方式:回复一个 ${fence}tool JSON 块(如 ${fence}tool\n{"tool":"list","args":{"path":"."}}\n${fence} ),环境会以 TOOL_RESULT 消息回传结果;`,
    `不要向用户索要文件内容——用工具自己读。任务完成后用纯文本总结,不再带 tool 块。`,
    ``,
    `[任务] ${text}`,
  ]
  return legend.join('\n')
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
  /** R180: aborts the in-flight model request on cancel (Claude-style stop). */
  abort: AbortController
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
      // (AI8 桥暂为整段返回;Claude 式逐 token 流式仅 OpenAI 兼容档。)
      const out = await ai8ChatCompletion(run!.messages, s)
      if (!out.ok) throw new Error(`ai8: ${out.hint ?? 'failed'}${out.detail ? ' — ' + out.detail : ''}`)
      content = out.text
      const parsed = parseReactToolCall(content)
      if (parsed) toolCalls.push({ id: `react-${++seq}`, name: parsed.tool, args: parsed.args })
      return { content, toolCalls }
    }

    // R175: Claude-style streaming — `stream: true` + SSE deltas pushed to the
    // workbench as they arrive; tool-call argument fragments accumulate by index.
    const base = s.baseUrl.trim().replace(/\/+$/, '')
    const body: Record<string, unknown> = {
      model: s.model.trim(),
      messages: run!.messages,
      temperature: 0.3,
      tools: AGENT_TOOL_SCHEMAS,
      tool_choice: 'auto',
      stream: true,
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (s.apiKey.trim() !== '') headers.Authorization = `Bearer ${s.apiKey.trim()}`
    const res = await fetch(`${base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.any([AbortSignal.timeout(180_000), run!.abort.signal]) })
    if (!res.ok) throw new Error(`model HTTP ${res.status}`)
    const ctype = res.headers.get('content-type') ?? ''

    if (!ctype.includes('text/event-stream')) {
      // provider ignored stream:true — fall back to the buffered shape
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

    const assembler = createSseAssembler()
    const reader = res.body?.getReader()
    if (!reader) throw new Error('model stream: empty body')
    const decoder = new TextDecoder()
    let buf = ''
    let sawDone = false
    while (!sawDone) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let nl = buf.indexOf('\n')
      while (nl >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, '')
        buf = buf.slice(nl + 1)
        nl = buf.indexOf('\n')
        const out = assembler.feed(line)
        if (out.delta !== '') deps.pushEvent({ kind: 'text-delta', text: out.delta })
        for (const tc of out.newToolCalls) toolCalls.push(tc)
        if (out.done) sawDone = true
      }
    }
    content = assembler.content
    for (const tc of assembler.finish(++seq)) toolCalls.push(tc)
    return { content, toolCalls }
  }

  // ── 公共 API(index.ts 挂 IPC)─────────────────────────────────────────────
  return {
    async send(a: AgentSendArgs): Promise<{ ok: boolean; sessionId: string; error?: string }> {
      // R180: single-run invariant — a second send while one is running would
      // reassign `run` and cross-contaminate both loops' messages/events.
      // (A pending approval is part of the running turn; answer it first.)
      // The run slot is claimed SYNCHRONOUSLY (before the first await) so a
      // rapid second invoke can never slip past the guard.
      if (run) return { ok: false, sessionId: '', error: 'busy' }
      const sessionId = a.sessionId && a.sessionId !== '' ? a.sessionId : `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
      run = {
        sessionId,
        workspace: a.workspace,
        mode: a.mode,
        settings: { baseUrl: '', apiKey: '', model: a.modelOverride ?? '' },
        cancelled: false,
        messages: [],
        allowPrefixes: [],
        allowPaths: [],
        pending: new Map(),
        abort: new AbortController(),
      }
      const base = await deps.resolveSettings(a.profileId)
      run.settings = typeof a.modelOverride === 'string' && a.modelOverride.trim() !== ''
        ? { ...base, model: a.modelOverride.trim() }
        : base
      mkdirSync(deps.sessionsDir, { recursive: true })
      const isNew = !(a.sessionId && a.sessionId !== '')

      if (isNew) {
        run.messages.push({ role: 'system', content: run.settings.baseUrl.startsWith('ai8://') ? REACT_SYSTEM_PROMPT : KERNEL_SYSTEM_PROMPT })
      } else {
        // continuation: restore history from the session file
        try {
          const lines = readFileSync(join(deps.sessionsDir, `${sessionId}.jsonl`), 'utf8').split('\n').filter((l) => l.trim() !== '')
          const history: AiChatMessage[] = [{ role: 'system', content: run.settings.baseUrl.startsWith('ai8://') ? REACT_SYSTEM_PROMPT : KERNEL_SYSTEM_PROMPT }]
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
      // R178: AI8 无 function-calling——工具说明随用户消息注入(站点 system
      // 参数对部分模型不生效);OpenAI 兼容档走 tools 透传无需注入。
      const turnPrompt = run.settings.baseUrl.startsWith('ai8://')
        ? buildAi8TurnPrompt(a.workspace, a.text)
        : a.text
      run.messages.push({ role: 'user', content: turnPrompt })

      emit({ kind: 'session-meta', sessionId, model: run.settings.model, workspace: a.workspace })
      emit({ kind: 'user', text: a.text })
      try {
        for (let turn = 1; turn <= AGENT_MAX_TURNS; turn += 1) {
          if (run.cancelled) { emit({ kind: 'done', reason: 'cancelled' }); run = null; return { ok: true, sessionId } }
          emit({ kind: 'turn-start', turn })
          const { content, toolCalls } = await callModel()
          if (run.cancelled) { emit({ kind: 'done', reason: 'cancelled' }); return { ok: true, sessionId } }
          if (toolCalls.length === 0) {
            emit({ kind: 'text', text: content })
            run.messages.push({ role: 'assistant', content })
            emit({ kind: 'done', reason: 'completed' })
            run = null // R180: free the single-run slot so the next send works
            return { ok: true, sessionId }
          }
          run.messages.push({ role: 'assistant', content: content === '' ? '(using tools)' : content })
          for (const tc of toolCalls) {
            const result = await executeTool(tc.id, tc.name, tc.args)
            run.messages.push({ role: 'user', content: `TOOL_RESULT ${tc.name}: ${result.slice(0, 8000)}` })
          }
        }
        emit({ kind: 'done', reason: 'max-turns' })
        run = null
        return { ok: true, sessionId }
      } catch (e) {
        const wasCancelled = run?.cancelled === true
        if (wasCancelled) {
          emit({ kind: 'done', reason: 'cancelled' })
          return { ok: true, sessionId }
        }
        const error = e instanceof Error ? e.message : String(e)
        emit({ kind: 'done', reason: 'error', error })
        return { ok: false, sessionId, error }
      }
    },

    cancel(): void {
      if (!run) return
      run.cancelled = true
      run.abort.abort() // R180: kill the in-flight model request immediately
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

// ── R175: OpenAI SSE 组装器(Claude 式流式;纯函数可单测)────────────────────

export interface SseAssemblerResult {
  delta: string
  newToolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>
  done: boolean
}

export interface SseAssembler {
  feed: (line: string) => SseAssemblerResult
  /** Flush accumulated tool-call fragments into complete calls. */
  finish: (seqStart: number) => Array<{ id: string; name: string; args: Record<string, unknown> }>
  content: string
}

/** Incremental parser for `chat/completions` SSE lines (stream:true):
 *  content deltas stream straight through; tool_call argument fragments
 *  accumulate per provider index and materialise on finish(). */
export function createSseAssembler(): SseAssembler {
  let content = ''
  const fragments = new Map<number, { id: string; name: string; args: string }>()
  return {
    get content() {
      return content
    },
    feed(line: string): SseAssemblerResult {
      const result: SseAssemblerResult = { delta: '', newToolCalls: [], done: false }
      const trimmed = line.trim()
      if (trimmed === '' || !trimmed.startsWith('data:')) return result
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') {
        result.done = true
        return result
      }
      try {
        const chunk = JSON.parse(payload) as {
          choices?: Array<{
            delta?: {
              content?: string | null
              tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }>
            }
            finish_reason?: string | null
          }>
        }
        const choice = chunk.choices?.[0]
        if (choice?.finish_reason) {
          result.done = true
        }
        const delta = choice?.delta
        if (typeof delta?.content === 'string' && delta.content !== '') {
          content += delta.content
          result.delta = delta.content
        }
        if (Array.isArray(delta?.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = typeof tc.index === 'number' ? tc.index : 0
            const frag = fragments.get(idx) ?? { id: '', name: '', args: '' }
            if (typeof tc.id === 'string' && tc.id !== '') frag.id = tc.id
            if (typeof tc.function?.name === 'string' && tc.function.name !== '') frag.name += tc.function.name
            if (typeof tc.function?.arguments === 'string') frag.args += tc.function.arguments
            fragments.set(idx, frag)
          }
        }
      } catch { /* non-JSON keep-alive line — ignore */ }
      return result
    },
    finish(seqStart: number) {
      const out: Array<{ id: string; name: string; args: Record<string, unknown> }> = []
      for (const [, frag] of [...fragments.entries()].sort((a, b) => a[0] - b[0])) {
        if (frag.name === '') continue
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(frag.args === '' ? '{}' : frag.args) as Record<string, unknown> } catch { /* bad args json */ }
        out.push({ id: frag.id !== '' ? frag.id : `call-${seqStart++}`, name: frag.name, args })
      }
      return out
    },
  }
}
