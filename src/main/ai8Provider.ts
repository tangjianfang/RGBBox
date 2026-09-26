/**
 * ai8Provider — R118: AI8 as a first-class provider for the app's underlying
 * AI abilities (OCR cleanup / translate / AI Lab chat). Profiles whose
 * baseUrl is the pseudo-protocol `ai8://chat` route here from
 * aiCleanupService.chatCompletion(); apiKey carries the AI8 token and model
 * is an ai8 model value (e.g. `openai_chat::gpt-5.4`).
 *
 * R193: server sessions are per-CALLER-KEY (agent sessionId for the ReAct
 * bridge, a shared 'default' for one-shot OCR/translate). A NEW server
 * session (first use / restart / dead-session rebuild) starts with a
 * compressed replay of the local history so context stays coherent across
 * restarts. (Empirically the server DOES keep session history even with
 * contextCount:0 — the old "zero history" claim no longer holds, which is
 * exactly why cross-session isolation became necessary.)
 */

import { Ai8Client, Ai8Error, type Ai8ChatOptions } from '../shared/ai8Client'
import type { AiChatMessage, AiChatOutcome } from '../shared/types'

export const AI8_PROVIDER_BASEURL = 'ai8://chat'

export interface Ai8ProviderSettings {
  apiKey: string // AI8 token (no Bearer prefix — the site's own convention)
  model: string
}

export function isAi8Settings(s: { baseUrl: string }): boolean {
  return s.baseUrl.trim() === AI8_PROVIDER_BASEURL
}

interface ToolSession {
  model: string
  id: string | number
}

// R193: per-caller-key server sessions (LRU, cap 8). The agent bridge keys
// by its sessionId — different conversations no longer share server context.
const toolSessions = new Map<string, ToolSession>()
const TOOL_SESSION_CAP = 8

function normalizeSessionId(raw: unknown): string | number {
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string' && raw !== '' && Number.isFinite(Number(raw))) return Number(raw)
  return raw as string | number
}

/** R193: 历史回放——站点会话是新建的(重启/换会话/重建)而本地有历史时,把
 *  对话压缩成一段前置文本,模型便能"想起"之前做过什么。逐条截断 + 总量
 *  上限(保住首问与最近段落,超出丢最旧的中段)。纯函数,可单测。 */
export function buildReplayContext(messages: AiChatMessage[], cap = 9000): string {
  const body = messages.filter((m) => m.role !== 'system')
  if (body.length <= 1) return ''
  const render = (m: AiChatMessage): string => {
    const slice = (n: number): string => m.content.replace(/\s+/g, ' ').trim().slice(0, n)
    return m.role === 'user' ? `用户: ${slice(700)}` : `助手: ${slice(420)}`
  }
  const entries = body.map(render)
  // keep the opening ask + the most recent entries; drop oldest-middle overflow
  let total = entries.reduce((a, e) => a + e.length + 1, 0)
  let dropFrom = 1
  while (total > cap && dropFrom < entries.length - 1) {
    total -= entries[dropFrom].length + 1
    entries.splice(dropFrom, 1)
  }
  return entries.join('\n')
}

/** Collect the full reply off an SSE chat stream; throws Ai8Error on failure.
 *  R174.8: bounded by a hard timeout — an SSE stream that never terminates
 *  used to hang the caller (agent tick) forever.
 *  R193.3: an UNCLOSED <think> (stream cut mid-think) is stripped too — the
 *  old regex only matched closed pairs and leaked raw reasoning text. */
async function collectAi8Reply(client: Ai8Client, sessionId: string | number, text: string, systemPrompt?: string, timeoutMs = 180_000): Promise<string> {
  let full = ''
  const opts: Ai8ChatOptions = { signal: AbortSignal.timeout(timeoutMs) }
  if (systemPrompt !== undefined && systemPrompt !== '') opts.systemPrompt = systemPrompt
  for await (const ev of client.chat(sessionId, text, opts)) {
    if (ev.type === 'delta') full += ev.text
    else if (ev.type === 'error') throw new Ai8Error(-3, ev.message)
  }
  return full.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trim()
}

async function runAi8Call(messages: AiChatMessage[], s: Ai8ProviderSettings, opts?: { maxTokens?: number; temperature?: number; timeoutMs?: number; probe?: boolean; sessionKey?: string }): Promise<AiChatOutcome> {
  const startedAt = Date.now()
  // test seam: e2e verification points main-process fetch at a local mock
  // server (page.route cannot intercept main-process traffic)
  const baseUrl = process.env.RGBBOX_AI8_BASE_URL
  const client = new Ai8Client(baseUrl !== undefined && baseUrl !== '' ? { token: s.apiKey.trim(), baseUrl } : { token: s.apiKey.trim() })
  // connection probe — a cheap balance read instead of a full chat round-trip
  if (opts?.probe) {
    try {
      await client.getBalance()
      return { ok: true, text: '', latencyMs: Date.now() - startedAt }
    } catch (error) {
      const code = error instanceof Ai8Error ? error.code : 0
      return { ok: false, text: '', hint: code === 2 ? 'auth' : 'network', latencyMs: Date.now() - startedAt }
    }
  }
  const system = messages.find((m) => m.role === 'system')?.content
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  if (lastUser === undefined) return { ok: false, text: '', hint: 'parse', latencyMs: 0 }
  const model = s.model.trim()
  // R193: fresh server session ⇒ replay the local history so context survives
  // restarts / conversation switches; the site remembers WITHIN a session but
  // a new session starts blank no matter what we kept locally.
  const withReplay = (): string => {
    const replay = buildReplayContext(messages)
    return replay === '' ? lastUser.content : `[上下文回放]\n${replay}\n[回放结束]\n\n${lastUser.content}`
  }
  const key = opts?.sessionKey ?? 'default'
  const getOrCreate = async (): Promise<{ session: ToolSession; fresh: boolean }> => {
    const cached = toolSessions.get(key)
    if (cached !== undefined && cached.model === model) {
      toolSessions.delete(key)
      toolSessions.set(key, cached) // LRU touch
      return { session: cached, fresh: false }
    }
    const created = await client.createSession<{ id: unknown }>(model !== '' ? { model } : {})
    const session: ToolSession = { model, id: normalizeSessionId(created?.id) }
    toolSessions.set(key, session)
    while (toolSessions.size > TOOL_SESSION_CAP) {
      const oldest = toolSessions.keys().next().value
      if (oldest === undefined) break
      toolSessions.delete(oldest)
    }
    return { session, fresh: true }
  }
  try {
    const { session, fresh } = await getOrCreate()
    try {
      const text = await collectAi8Reply(client, session.id, fresh ? withReplay() : lastUser.content, system)
      return { ok: true, text, latencyMs: Date.now() - startedAt }
    } catch (error) {
      // one rebuild-and-retry: the cached session may be dead server-side
      if (error instanceof Ai8Error && error.code === 2) throw error // token problem — no point retrying
      const rebuilt = await client.createSession<{ id: unknown }>(model !== '' ? { model } : {})
      toolSessions.set(key, { model, id: normalizeSessionId(rebuilt?.id) })
      // the rebuilt session is blank → replay keeps the run's context alive
      const text = await collectAi8Reply(client, normalizeSessionId(rebuilt?.id), withReplay(), system)
      return { ok: true, text, latencyMs: Date.now() - startedAt }
    }
  } catch (error) {
    // R174.8: carry the site's own message — "network" alone hid 积分不足 /
    // 模型不可用 / 审核拒绝 behind one word. code -2 (未激活) reads as auth.
    const detail = error instanceof Error ? error.message : String(error)
    const code = error instanceof Ai8Error ? error.code : 0
    const hint = code === 2 || code === -2 ? 'auth' : 'network'
    return { ok: false, text: '', hint, detail: detail.startsWith('AI8 API error') ? undefined : detail, latencyMs: Date.now() - startedAt }
  }
}

/** Test seam: drop the cached tool sessions (unit tests isolation). */
export function resetAi8ToolSession(): void {
  toolSessions.clear()
}

export async function ai8ChatCompletion(
  messages: AiChatMessage[],
  s: Ai8ProviderSettings,
  opts?: { maxTokens?: number; temperature?: number; timeoutMs?: number; probe?: boolean; sessionKey?: string },
): Promise<AiChatOutcome> {
  if (s.apiKey.trim() === '') return { ok: false, text: '', hint: 'nokey', latencyMs: 0 }
  return runAi8Call(messages, s, opts)
}
