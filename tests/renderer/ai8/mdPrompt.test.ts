import { describe, it, expect } from 'vitest'
import { extractPromptFromMd, naturalCompare } from '../../../src/renderer/src/ai8/mdPrompt'

describe('renderer/ai8 mdPrompt (R126 — batch draw source extraction)', () => {
  it('extracts the FIRST fenced block verbatim (the user scene files ship ready prompts)', () => {
    const md = [
      '# S01A · 深空射电',
      '',
      '一些中文说明文字，不应进入提示词。',
      '',
      '```text',
      'Cinematic ultra-wide establishing shot: a colossal radio telescope',
      'on a fog-drenched mountain ridge. No text, no watermark.',
      '```',
      '',
      '```text',
      'second fence must be ignored',
      '```',
    ].join('\n')
    expect(extractPromptFromMd(md)).toBe('Cinematic ultra-wide establishing shot: a colossal radio telescope\non a fog-drenched mountain ridge. No text, no watermark.')
  })

  it('accepts a bare ``` fence (no language tag) too', () => {
    expect(extractPromptFromMd('intro\n\n```\nprompt body\n```\n')).toBe('prompt body')
  })

  it('falls back to plain text with markdown markers stripped when no fence exists', () => {
    const md = '# 标题\n\n> 引用说明\n\n- 列表项一\n- 列表项二\n\n**加粗正文**句子。'
    expect(extractPromptFromMd(md)).toBe('标题\n引用说明\n列表项一\n列表项二\n加粗正文句子。')
  })

  it('returns empty string for empty / whitespace / fence-only-with-no-body files (batch marks these failed)', () => {
    expect(extractPromptFromMd('')).toBe('')
    expect(extractPromptFromMd('   \n\n  ')).toBe('')
    expect(extractPromptFromMd('```\n```')).toBe('')
  })

  it('naturalCompare sorts digit segments numerically (S2 < S10)', () => {
    const names = ['S10.md', 'S2.md', 's1.md', 'S1A.md', 'readme.md']
    expect([...names].sort(naturalCompare)).toEqual(['readme.md', 's1.md', 'S1A.md', 'S2.md', 'S10.md'])
  })

  it('naturalCompare is case-insensitive and returns 0 for equal names', () => {
    expect(naturalCompare('A.md', 'a.md')).toBe(0)
    expect(naturalCompare('a2.md', 'a10.md')).toBeLessThan(0)
    expect(naturalCompare('b.md', 'a.md')).toBeGreaterThan(0)
  })
})
