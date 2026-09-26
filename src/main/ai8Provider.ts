/**
 * ai8Provider — R118: AI8 as a first-class provider for the app's underlying
 * AI abilities (OCR cleanup / translate / AI Lab chat). Profiles whose
 * baseUrl is the pseudo-protocol `ai8://chat` route here from
 * aiCleanupService.chatCompletion(); apiKey carries the AI8 token and model
 * is an ai8 model value (e.g. `openai_chat::gpt-5.4`).
 *
 * Tool calls reuse ONE server session per model, created with contextCount:0
 * so successive OCR/translate calls never contaminate each other's context
 * (the server keeps zero history for such sessions). A dead session
 * (expired/deleted server-side) is rebuilt once and retried.
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

let toolSession: ToolSession | null = null

function normalizeSessionId(raw: unknown): string | number {
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string' && raw !== '' && Number.isFinite(Number(raw))) return Number(raw)
  return raw as string | number
}

/** Collect the full reply off an SSE chat stream; throws Ai8Error on failure.
 *  R174.8: bounded by a hard timeout — an SSE stream that never terminates
 *  used to hang the caller (agent tick) forever. */
async function collectAi8Reply(client: Ai8Client, sessionId: string | number, text: string, systemPrompt?: string, timeoutMs = 180_000): Promise<string> {
  let full = ''
  const opts: Ai8ChatOptions = { signal: AbortSignal.timeout(timeoutMs) }
  if (systemPrompt !== undefined && systemPrompt !== '') opts.systemPrompt = systemPrompt
  for await (const ev of client.chat(sessionId, text, opts)) {
    if (ev.type === 'delta') full += ev.text
    else if (ev.type === 'error') throw new Ai8Error(-3, ev.message)
  }
  return full.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
}

async function runAi8Call(messages: AiChatMessage[], s: Ai8ProviderSettings, opts?: { maxTokens?: number; temperature?: number; timeoutMs?: number; probe?: boolean }): Promise<AiChatOutcome> {
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
  try {
    if (toolSession === null || toolSession.model !== model) {
      const created = await client.createSession<{ id: unknown }>(model !== '' ? { model, contextCount: 0 } : { contextCount: 0 })
      toolSession = { model, id: normalizeSessionId(created?.id) }
    }
    try {
      const text = await collectAi8Reply(client, toolSession.id, lastUser.content, system)
      return { ok: true, text, latencyMs: Date.now() - startedAt }
    } catch (error) {
      // one rebuild-and-retry: the cached session may be dead server-side
      if (error instanceof Ai8Error && error.code === 2) throw error // token problem — no point retrying
      const rebuilt = await client.createSession<{ id: unknown }>(model !== '' ? { model, contextCount: 0 } : { contextCount: 0 })
      toolSession = { model, id: normalizeSessionId(rebuilt?.id) }
      const text = await collectAi8Reply(client, toolSession.id, lastUser.content, system)
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

/** Test seam: drop the cached tool session (unit tests isolation). */
export function resetAi8ToolSession(): void {
  toolSession = null
}

export async function ai8ChatCompletion(
  messages: AiChatMessage[],
  s: Ai8ProviderSettings,
  opts?: { maxTokens?: number; temperature?: number; timeoutMs?: number; probe?: boolean },
): Promise<AiChatOutcome> {
  if (s.apiKey.trim() === '') return { ok: false, text: '', hint: 'nokey', latencyMs: 0 }
  return runAi8Call(messages, s, opts)
}
