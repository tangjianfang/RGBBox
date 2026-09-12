import { describe, it, expect } from 'vitest'
import {
  buildCleanupRequest, cleanupOcrText, parseCleanupResponse, DEFAULT_AI_SETTINGS,
} from '../../src/main/aiCleanupService'

describe('aiCleanupService pure (R83)', () => {
  it('buildCleanupRequest: no key / empty text → null', () => {
    expect(buildCleanupRequest('文本', { ...DEFAULT_AI_SETTINGS, apiKey: '' })).toBeNull()
    expect(buildCleanupRequest('  ', { ...DEFAULT_AI_SETTINGS, apiKey: 'sk-x' })).toBeNull()
  })

  it('buildCleanupRequest: OpenAI-compatible URL join + payload', () => {
    const req = buildCleanupRequest('会 议 记 录', {
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4/',
      apiKey: ' sk-test ',
      model: 'glm-4-flash',
    })
    expect(req).not.toBeNull()
    expect(req!.url).toBe('https://open.bigmodel.cn/api/paas/v4/chat/completions')
    const body = JSON.parse(req!.init.body as string)
    expect(body.model).toBe('glm-4-flash')
    expect(body.messages).toHaveLength(2)
    expect(body.messages[1].content).toBe('会 议 记 录')
    expect((req!.init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
  })

  it('parseCleanupResponse extracts content; rejects invalid shapes', () => {
    expect(parseCleanupResponse({ choices: [{ message: { content: '整理后' } }] })).toBe('整理后')
    expect(parseCleanupResponse({ choices: [] })).toBeNull()
    expect(parseCleanupResponse({ error: 'x' })).toBeNull()
    expect(parseCleanupResponse({ choices: [{ message: { content: '   ' } }] })).toBeNull()
  })

  it('cleanupOcrText without key short-circuits to nokey (no fetch)', async () => {
    const out = await cleanupOcrText('文本', DEFAULT_AI_SETTINGS)
    expect(out).toEqual({ ok: false, text: '', hint: 'nokey' })
  })
})
