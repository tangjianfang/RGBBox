/**
 * aiCleanupService — R83: OCR 文本 AI 整理（云 LLM，OpenAI 兼容协议）。
 * 纯函数（buildCleanupRequest / parseCleanupResponse）供单测；网络调用
 * 走主进程 fetch，30s 超时。Key 只存本机 system.json，不写日志。
 */

export interface AiCleanupSettings {
  baseUrl: string
  apiKey: string
  model: string
}

export const DEFAULT_AI_SETTINGS: AiCleanupSettings = {
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  apiKey: '',
  model: 'glm-4-flash',
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
  const req = buildCleanupRequest(text, s)
  if (!req) return { ok: false, text: '', hint: 'nokey' }
  try {
    const res = await fetch(req.url, req.init)
    if (!res.ok) return { ok: false, text: '', hint: res.status === 401 || res.status === 403 ? 'auth' : 'http' }
    const parsed = parseCleanupResponse(await res.json())
    if (parsed === null) return { ok: false, text: '', hint: 'parse' }
    return { ok: true, text: parsed }
  } catch {
    return { ok: false, text: '', hint: 'network' }
  }
}
