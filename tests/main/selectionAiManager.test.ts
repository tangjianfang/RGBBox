// R119: selection-AI prompt mapping (pure) — system instruction per action,
// custom passthrough, and user-text placement.
import { describe, it, expect } from 'vitest'
import { buildSelectionPrompt } from '../../src/main/selectionAiManager'

describe('main/selectionAiManager buildSelectionPrompt (R119)', () => {
  it('maps each preset action to a distinct system instruction carrying the text as user', () => {
    const text = '一段被选中的文字'
    for (const action of ['translate', 'polish', 'explain'] as const) {
      const messages = buildSelectionPrompt(action, text)
      expect(messages).toHaveLength(2)
      expect(messages[0].role).toBe('system')
      expect(messages[1]).toEqual({ role: 'user', content: text })
    }
    const [t1, , t2, , t3] = [
      ...buildSelectionPrompt('translate', text),
      ...buildSelectionPrompt('polish', text),
      ...buildSelectionPrompt('explain', text),
    ]
    expect(t1.content).not.toBe(t2.content)
    expect(t2.content).not.toBe(t3.content)
    expect(buildSelectionPrompt('translate', text)[0].content).toContain('翻译')
    expect(buildSelectionPrompt('polish', text)[0].content).toContain('润色')
    expect(buildSelectionPrompt('explain', text)[0].content).toContain('解释')
  })

  it('embeds the custom instruction into the system message', () => {
    const messages = buildSelectionPrompt('custom', '原文', '总结成三点')
    expect(messages[0].content).toContain('总结成三点')
    expect(messages[1]).toEqual({ role: 'user', content: '原文' })
  })
})
