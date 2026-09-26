import { describe, expect, it } from 'vitest'
import {
  applyLexicon, detectLang, formatBytes, loadLexicon, normalizeText, saveLexicon, splitSentences,
} from '../../../src/renderer/src/domain/voiceScribe'

describe('domain/voiceScribe (R173-S1)', () => {
  it('normalizeText folds whitespace but keeps paragraph breaks', () => {
    expect(normalizeText('  a \t b\r\n c  ')).toBe('a b\nc')
  })

  it('splitSentences: CJK + latin terminators, ellipsis and newlines', () => {
    // … is a terminator — trailing CJK after it starts a new sentence (by design)
    expect(splitSentences('第一句。第二句！Third one? Fourth\ntext…尾')).toEqual([
      '第一句。', '第二句！', 'Third one?', 'Fourth', 'text…', '尾',
    ])
    expect(splitSentences('')).toEqual([])
    expect(splitSentences('   \n  ')).toEqual([])
  })

  it('applyLexicon replaces longest-first and skips empty entries', () => {
    const out = applyLexicon('the read command reads data', [
      { word: 'read', respell: 'reed' },
      { word: 'read command', respell: 'REED COMMAND' },
      { word: '', respell: 'x' },
      { word: 'y', respell: '' },
    ])
    expect(out).toBe('the REED COMMAND reeds data')
  })

  it('applyLexicon escapes regex metacharacters in words', () => {
    expect(applyLexicon('a+b (c) d*', [{ word: 'a+b', respell: 'PLUS' }, { word: '(c)', respell: 'CEE' }, { word: 'd*', respell: 'STAR' }]))
      .toBe('PLUS CEE STAR')
  })

  it('detectLang splits CJK vs latin', () => {
    expect(detectLang('你好世界')).toBe('zh')
    expect(detectLang('hello world')).toBe('en')
    expect(detectLang('混合 mixed 中文')).toBe('zh')
    expect(detectLang('mostly english with 一 char')).toBe('en')
  })

  it('loadLexicon/saveLexicon roundtrip with damaged storage fallback', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
    }
    saveLexicon([{ word: 'w', respell: 'r' }], storage)
    expect(loadLexicon(storage)).toEqual([{ word: 'w', respell: 'r' }])
    storage.setItem('rgbbox:voiceLexicon', '{broken json')
    expect(loadLexicon(storage)).toEqual([])
    storage.setItem('rgbbox:voiceLexicon', JSON.stringify([{ word: 1 }, { word: 'a', respell: 'b' }, null]))
    expect(loadLexicon(storage)).toEqual([{ word: 'a', respell: 'b' }])
    expect(loadLexicon(null)).toEqual([])
  })

  it('R183: formatBytes — sub-MB files show KB, big files drop noise decimals', () => {
    // the 5KB config.json used to render as "0.0 MB / 0" in the model panel
    expect(formatBytes(5120)).toBe('5 KB')
    expect(formatBytes(0)).toBe('0 KB')
    expect(formatBytes(44)).toBe('1 KB')
    // 1–10MB keeps one decimal for live progress granularity
    expect(formatBytes(2.6 * 1048576)).toBe('2.6 MB')
    expect(formatBytes(8 * 1048576)).toBe('8.0 MB')
    // the 291MB model stays narrow so the row's right cluster never clips
    expect(formatBytes(291 * 1048576)).toBe('291 MB')
    expect(formatBytes(Number.NaN)).toBe('0 KB')
  })
})
