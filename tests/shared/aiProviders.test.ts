import { describe, it, expect } from 'vitest'
import { AI_PROVIDER_PRESETS, matchProviderPreset, isKeylessLocal } from '../../src/shared/aiProviders'

describe('AI_PROVIDER_PRESETS (R88.5)', () => {
  it('has unique ids; every non-custom preset has baseUrl + models; custom exists', () => {
    const ids = AI_PROVIDER_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('custom')
    for (const p of AI_PROVIDER_PRESETS) {
      if (p.id === 'custom') continue
      // R118: the ai8 preset uses the `ai8://chat` pseudo-protocol marker that
      // chatCompletion dispatches on — URL-ish is all we assert
      expect(p.baseUrl).toMatch(/^(https?:\/\/|ai8:\/\/|bedrock:\/\/)/)
      expect(p.models.length).toBeGreaterThan(0)
    }
  })
  it('zhipu preset carries the models the user runs', () => {
    const zhipu = AI_PROVIDER_PRESETS.find((p) => p.id === 'zhipu')!
    expect(zhipu.models).toContain('glm-5.3')
    expect(zhipu.models).toContain('glm-5.3-flash')
  })
})

describe('matchProviderPreset (R88.5)', () => {
  it('matches by baseUrl and falls back to custom', () => {
    expect(matchProviderPreset('https://open.bigmodel.cn/api/paas/v4').id).toBe('zhipu')
    expect(matchProviderPreset('https://api.deepseek.com').id).toBe('deepseek')
    expect(matchProviderPreset('https://api.openai.com/v1').id).toBe('openai')
    expect(matchProviderPreset('https://api.moonshot.ai/v1').id).toBe('kimi')
    expect(matchProviderPreset('https://dashscope.aliyuncs.com/compatible-mode/v1').id).toBe('qwen')
    expect(matchProviderPreset('http://localhost:11434/v1').id).toBe('ollama')
    expect(matchProviderPreset('https://unknown.example.com/v1').id).toBe('custom')
    expect(matchProviderPreset('').id).toBe('custom')
  })
})

describe('isKeylessLocal (R88 review fix)', () => {
  it('local loopback hosts are keyless; remote and malformed are not', () => {
    expect(isKeylessLocal('http://localhost:11434/v1')).toBe(true)
    expect(isKeylessLocal('http://127.0.0.1:8080')).toBe(true)
    expect(isKeylessLocal('https://open.bigmodel.cn/api/paas/v4')).toBe(false)
    expect(isKeylessLocal('not a url')).toBe(false)
    expect(isKeylessLocal('')).toBe(false)
  })
})

describe('bedrock preset (R145)', () => {
  it('exposes the pseudo-protocol baseUrl and inference-profile models', () => {
    const p = AI_PROVIDER_PRESETS.find((x) => x.id === 'bedrock')!
    expect(p.label).toBe('AWS Bedrock')
    expect(p.baseUrl).toBe('bedrock://openai')
    expect(p.models).toContain('us.anthropic.claude-sonnet-4-5')
    expect(p.models).toContain('amazon.nova-pro-v1')
    // round-trips through the reverse lookup (form recognition)
    expect(matchProviderPreset('bedrock://openai').id).toBe('bedrock')
  })
})
