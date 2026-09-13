/**
 * aiCleanupService — R83: OCR 文本 AI 整理（云 LLM，OpenAI 兼容协议）。
 * R88: 抽出通用 chatCompletion 管线（AI 实验室复用）；cleanup/translate 行为零改动。
 * 纯函数（buildCleanupRequest / parseCleanupResponse）供单测；网络调用
 * 走主进程 fetch，30s 超时。Key 只存本机 system.json，不写日志。
 */

import type { AiChatMessage, AiChatOutcome } from '../shared/types'

export interface AiCleanupSettings {
  baseUrl: string
  apiKey: string
  model: string
}

export const DEFAULT_AI_SETTINGS: AiCleanupSettings = {
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  apiKey: '',
  model: 'glm-5.3-flash', // R88.5: upgraded from glm-4-flash
}

export const CLEANUP_SYSTEM_PROMPT =
  '你是一个 OCR 文本整理助手。把用户提供的 OCR 原文整理成可读文本：恢复段落与换行、' +
  '修正明显的错字与乱码、把表格转为 markdown、去掉页眉页脚等噪声。' +
  '只整理已有内容，不新增、不翻译、不总结。直接输出整理后的文本，不要任何解释或前后缀。'

export type CleanupOutcome = { ok: boolean; text: string; hint?: 'nokey' | 'auth' | 'http' | 'parse' | 'network' }

/** 构造 OpenAI 兼容 chat/completions 请求；未配 Key 或空文本 → null。 */
export function buildCleanupRequest(
  text: string,
  s: AiCleanupSettings,
): { url: string; init: RequestInit } | null {
  if (!s.apiKey.trim() || !text.trim()) return null
  const base = s.baseUrl.trim().replace(/\/+$/, '')
  return {
    url: `${base}/chat/completions`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${s.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: s.model.trim() || DEFAULT_AI_SETTINGS.model,
        messages: [
          { role: 'system', content: CLEANUP_SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(30_000),
    },
  }
}

/** 从 OpenAI 兼容响应提取 content；无效结构 → null。 */
export function parseCleanupResponse(json: unknown): string | null {
  const choices = (json as { choices?: Array<{ message?: { content?: unknown } }> } | null)?.choices
  const content = choices?.[0]?.message?.content
  return typeof content === 'string' && content.trim() !== '' ? content : null
}

export async function cleanupOcrText(text: string, s: AiCleanupSettings): Promise<CleanupOutcome> {
  if (!text.trim()) return { ok: false, text: '', hint: 'nokey' } // legacy empty-text semantics (R83)
  const out = await chatCompletion(
    [{ role: 'system', content: CLEANUP_SYSTEM_PROMPT }, { role: 'user', content: text }],
    s,
  )
  return { ok: out.ok, text: out.text, hint: out.hint }
}

// ── R84.3: 中英互译（复用同一 OpenAI 兼容管线；方向自动检测） ────────────

/** 按 CJK/拉丁字母占比自动定向：中文为主 → 译英，否则 → 译中。 */
export function detectTranslateDirection(text: string): 'zh2en' | 'en2zh' {
  const cjk = (text.match(/[、-鿿豈-﫿！-｠]/g) ?? []).length
  const letters = (text.match(/[A-Za-z]/g) ?? []).length
  return cjk >= letters ? 'zh2en' : 'en2zh'
}

export function buildTranslateRequest(
  text: string,
  s: AiCleanupSettings,
): { url: string; init: RequestInit } | null {
  if (!s.apiKey.trim() || !text.trim()) return null
  const base = s.baseUrl.trim().replace(/\/+$/, '')
  const dir = detectTranslateDirection(text)
  const prompt = dir === 'zh2en'
    ? '你是翻译助手。把用户提供的中文文本翻译成英文。只输出译文，保留原文的段落与换行，不要任何解释。'
    : '你是翻译助手。把用户提供的英文文本翻译成中文。只输出译文，保留原文的段落与换行，不要任何解释。'
  return {
    url: `${base}/chat/completions`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${s.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: s.model.trim() || DEFAULT_AI_SETTINGS.model,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: text },
        ],
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(30_000),
    },
  }
}

export async function translateOcrText(text: string, s: AiCleanupSettings): Promise<CleanupOutcome> {
  if (!text.trim()) return { ok: false, text: '', hint: 'nokey' } // legacy empty-text semantics (R84)
  const dir = detectTranslateDirection(text)
  const prompt = dir === 'zh2en'
    ? '你是翻译助手。把用户提供的中文文本翻译成英文。只输出译文，保留原文的段落与换行，不要任何解释。'
    : '你是翻译助手。把用户提供的英文文本翻译成中文。只输出译文，保留原文的段落与换行，不要任何解释。'
  const out = await chatCompletion(
    [{ role: 'system', content: prompt }, { role: 'user', content: text }],
    s,
  )
  return { ok: out.ok, text: out.text, hint: out.hint }
}

// ── R88: AI Lab generic pipeline ──────────────────────────────────────────

/** Generic OpenAI-compatible chat pipeline (fetch + latency + hint taxonomy). */
export async function chatCompletion(
  messages: AiChatMessage[],
  s: AiCleanupSettings,
  opts?: { maxTokens?: number; temperature?: number; timeoutMs?: number },
): Promise<AiChatOutcome> {
  if (!s.apiKey.trim()) return { ok: false, text: '', hint: 'nokey', latencyMs: 0 }
  if (messages.length === 0) return { ok: false, text: '', hint: 'parse', latencyMs: 0 }
  const base = s.baseUrl.trim().replace(/\/+$/, '')
  const startedAt = Date.now()
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.apiKey.trim()}` },
      body: JSON.stringify({
        model: s.model.trim() || DEFAULT_AI_SETTINGS.model,
        messages,
        temperature: opts?.temperature ?? 0.1,
        ...(opts?.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
      }),
      signal: AbortSignal.timeout(opts?.timeoutMs ?? 30_000),
    })
    const latencyMs = Date.now() - startedAt
    if (!res.ok) {
      return { ok: false, text: '', hint: res.status === 401 || res.status === 403 ? 'auth' : 'http', latencyMs }
    }
    const parsed = parseCleanupResponse(await res.json())
    if (parsed === null) return { ok: false, text: '', hint: 'parse', latencyMs }
    return { ok: true, text: parsed, latencyMs }
  } catch {
    return { ok: false, text: '', hint: 'network', latencyMs: Date.now() - startedAt }
  }
}

export function buildTestMessages(): AiChatMessage[] {
  return [{ role: 'user', content: 'ping' }]
}

export async function testConnection(s: AiCleanupSettings): Promise<AiChatOutcome> {
  return chatCompletion(buildTestMessages(), s, { maxTokens: 8 })
}
