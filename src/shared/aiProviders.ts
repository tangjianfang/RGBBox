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
}

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
    id: 'ollama',
    label: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    models: ['qwen3.6:35b', 'deepseek-v4:flash'],
  },
  { id: 'custom', label: '', baseUrl: '', models: [] },
]

/** Reverse-lookup the preset for a stored baseUrl; no match → custom. */
export function matchProviderPreset(baseUrl: string): AiProviderPreset {
  const trimmed = baseUrl.trim()
  return AI_PROVIDER_PRESETS.find((p) => p.id !== 'custom' && p.baseUrl === trimmed)
    ?? AI_PROVIDER_PRESETS[AI_PROVIDER_PRESETS.length - 1]
}
