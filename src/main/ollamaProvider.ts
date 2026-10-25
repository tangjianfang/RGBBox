/**
 * ollamaProvider — R318: Ollama as a first-class provider via its NATIVE
 * /api/chat protocol — the exact call the official ollama JS client makes
 * (`ollama.chat({ model: 'beam:cloud', messages })` → `response.message.content`).
 * Cloud-served models (beam:cloud, the free 501B MoE flagship from Reflection;
 * kimi-k3:cloud …) are proxied by the local daemon to ollama.com and are only
 * guaranteed on the native protocol, so profiles whose baseUrl is the pseudo
 * protocol `ollama://chat` route here from aiCleanupService.chatCompletion().
 */

import { OLLAMA_PROVIDER_BASEURL } from '../shared/aiProviders'
import type { AiChatMessage, AiChatOutcome } from '../shared/types'

/** Fallback when a profile carries no model (mirrors the generic path's
 *  DEFAULT_AI_SETTINGS.model): the ollama preset's own default. */
export const OLLAMA_DEFAULT_MODEL = 'beam:cloud'

/** Daemon address — the OLLAMA_HOST env override (bare host:port or a full
 *  URL, same shapes the official client accepts), else the default port. */
export function ollamaHost(envHost: string | undefined): string {
  const raw = (envHost ?? '').trim().replace(/\/+$/, '')
  if (raw === '') return 'http://127.0.0.1:11434'
  return /^https?:\/\//i.test(raw) ? raw : `http://${raw}`
}

export function isOllamaSettings(s: { baseUrl: string }): boolean {
  return s.baseUrl.trim() === OLLAMA_PROVIDER_BASEURL
}

/** Native /api/chat response → content; missing/empty/foreign shapes → null. */
export function parseOllamaChatResponse(json: unknown): string | null {
  const content = (json as { message?: { content?: unknown } } | null)?.message?.content
  return typeof content === 'string' && content.trim() !== '' ? content : null
}

export async function ollamaChatCompletion(
  messages: AiChatMessage[],
  s: { model: string },
  opts?: { maxTokens?: number; temperature?: number; timeoutMs?: number; probe?: boolean },
): Promise<AiChatOutcome> {
  const startedAt = Date.now()
  if (messages.length === 0) return { ok: false, text: '', hint: 'parse', latencyMs: 0 }
  const body = {
    model: s.model.trim() || OLLAMA_DEFAULT_MODEL,
    messages,
    stream: false,
    options: {
      temperature: opts?.temperature ?? 0.1,
      ...(opts?.maxTokens !== undefined ? { num_predict: opts.maxTokens } : {}),
    },
  }
  // Cloud flagships are slow to first token — chat gets 180s, probes 60s
  // (the OpenAI-compat path's 30s default is too tight for beam:cloud).
  const timeoutMs = opts?.timeoutMs ?? (opts?.probe === true ? 60_000 : 180_000)
  try {
    const res = await fetch(`${ollamaHost(process.env.OLLAMA_HOST)}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const latencyMs = Date.now() - startedAt
    if (!res.ok) {
      // carry the daemon's own error text ("model 'x' not found") — a one-word
      // hint hid the fix (ollama pull / ollama signin) behind plain 'http'.
      let detail: string | undefined
      try {
        const errBody = await res.json() as { error?: unknown }
        if (typeof errBody.error === 'string' && errBody.error !== '') detail = errBody.error
      } catch { /* non-JSON error body — the hint alone carries it */ }
      if (res.status === 404 && detail === undefined) {
        detail = `模型未找到——本地模型先 ollama pull ${body.model}；云端模型先 ollama signin`
      }
      return {
        ok: false, text: '', latencyMs,
        hint: res.status === 401 || res.status === 403 ? 'auth' : 'http',
        ...(detail !== undefined ? { detail } : {}),
      }
    }
    const json = await res.json() as { message?: { content?: unknown }; error?: unknown }
    const parsed = parseOllamaChatResponse(json)
    if (parsed === null) {
      // R89 probe relaxation, native shape: a 200 carrying a message object is
      // a working daemon — thinking models burn tiny num_predict budgets on
      // reasoning and legitimately return an empty string.
      if (opts?.probe === true && json.error === undefined && typeof json.message?.content === 'string') {
        return { ok: true, text: '', latencyMs }
      }
      return { ok: false, text: '', hint: 'parse', latencyMs }
    }
    return { ok: true, text: parsed, latencyMs }
  } catch (err) {
    // fetch-level failures (refused/DNS) are TypeError; timeouts surface as
    // TimeoutError — only the former can safely blame a missing daemon.
    const detail = err instanceof TypeError
      ? '无法连接 Ollama 守护进程——默认 127.0.0.1:11434（可用 OLLAMA_HOST 覆盖）；云端模型另需 ollama signin'
      : undefined
    return { ok: false, text: '', hint: 'network', ...(detail !== undefined ? { detail } : {}), latencyMs: Date.now() - startedAt }
  }
}
