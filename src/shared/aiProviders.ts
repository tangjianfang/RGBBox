// R88.5: mainstream OpenAI-compatible provider presets (verified 2026-09).
// Pure shared data — model versions iterate by editing this file only.

export interface AiProviderPreset {
  id: string
  /** Brand name — identical in zh/en, deliberately NOT i18n'd ('' for custom). */
  label: string
  /** OpenAI-compatible chat endpoint ('' for custom = free-form input). */
  baseUrl: string
  /** Recommended versions, first = preset default. */
  models: string[]
  /** R318: superseded baseUrls that still reverse-lookup to this preset —
   *  legacy profiles keep the brand label + fresh model suggestions while
   *  their stored URL keeps its old wire behavior. */
  legacyBaseUrls?: string[]
}

/** R318: Ollama pseudo-protocol marker — profiles carrying it route through
 *  the NATIVE /api/chat pipeline (main/ollamaProvider), not OpenAI-compat. */
export const OLLAMA_PROVIDER_BASEURL = 'ollama://chat'

export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  {
    id: 'zhipu',
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-5.3', 'glm-5.3-flash', 'glm-4.5-air', 'glm-4-flash'],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    models: ['deepseek-v4-pro', 'deepseek-v4-flash'],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-5.2', 'gpt-5.2-chat-latest', 'gpt-5.2-pro'],
  },
  {
    id: 'kimi',
    label: 'Kimi',
    baseUrl: 'https://api.moonshot.ai/v1',
    models: ['kimi-k3'],
  },
  {
    id: 'qwen',
    label: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen3.8-max', 'qwen-plus'],
  },
  {
    // R318: native /api/chat pipeline — cloud-served models (beam:cloud, the
    // free flagship MoE from Reflection) are only guaranteed on the native
    // protocol; first model = the preset default users are pointed at.
    id: 'ollama',
    label: 'Ollama',
    baseUrl: OLLAMA_PROVIDER_BASEURL,
    models: ['beam:cloud', 'gpt-oss:120b', 'deepseek-v3:671b', 'qwen3-coder:480b', 'llama4:128x17b', 'deepseek-r1:671b', 'kimi-k3:cloud', 'qwen3.6:35b', 'gpt-oss:20b'],
    legacyBaseUrls: ['http://localhost:11434/v1'],
  },
  {
    // R118: AI8 direct — apiKey carries the AI8 token (auto-synced from the
    // AI8 tab on login), model is an ai8 value from /chat/tmpl.
    id: 'ai8',
    label: '欧亿 AI8（直连）',
    baseUrl: 'ai8://chat',
    models: ['openai_chat::gpt-5.4', 'moonshot_chat::kimi-k3', 'qwen3-max-preview', 'ouyi_chat::ouyi-chat'],
  },
  {
    // R145: AWS Bedrock via its OpenAI-compatible endpoint — auth is SigV4
    // (AK/SK in profile.aws), NOT the Bearer apiKey field.
    id: 'bedrock',
    label: 'AWS Bedrock',
    baseUrl: 'bedrock://openai',
    models: ['us.anthropic.claude-sonnet-4-5', 'us.anthropic.claude-haiku-4-5', 'amazon.nova-pro-v1', 'amazon.nova-lite-v1', 'us.deepseek.deepseek-r1'],
  },
  { id: 'custom', label: '', baseUrl: '', models: [] },
]

/** Reverse-lookup the preset for a stored baseUrl; no match → custom.
 *  R318: legacyBaseUrls keep matching their preset after a baseUrl change. */
export function matchProviderPreset(baseUrl: string): AiProviderPreset {
  const trimmed = baseUrl.trim()
  return AI_PROVIDER_PRESETS.find((p) => p.id !== 'custom' && (p.baseUrl === trimmed || p.legacyBaseUrls?.includes(trimmed)))
    ?? AI_PROVIDER_PRESETS[AI_PROVIDER_PRESETS.length - 1]
}

/** R89 review fix: single source for the display fallback model (mirrors
 *  DEFAULT_AI_SETTINGS.model in main, which renderer cannot import). */
export const FALLBACK_MODEL = 'glm-5.3-flash'

/** R88 review fix: local endpoints (Ollama etc.) need no API key — the keyless
 *  preset would be dead otherwise, since chatCompletion gates on apiKey.
 *  R318: the ollama://chat pseudo-protocol rides the local daemon too. */
export function isKeylessLocal(baseUrl: string): boolean {
  if (baseUrl.trim() === OLLAMA_PROVIDER_BASEURL) return true
  try {
    const host = new URL(baseUrl.trim()).hostname.toLowerCase()
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'
  } catch {
    return false
  }
}
