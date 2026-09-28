// R197: 拼音→IPA 桥——音节表、多音字、词表覆盖。
import { describe, expect, it } from 'vitest'
import { hanziToPhonemes, isZhText, syllableToIpa } from '../../src/shared/zhPhonemes'
import { KOKORO_VOICE_CATALOG, isZhVoice } from '../../src/shared/kokoroVoices'

// the REAL tokenizer vocab (dumped from the on-disk 3497B tokenizer.json)
const VOCAB = new Set(' $;:,.!?—…"()“”̃ʣʥʦʨᵝꭧAIOQSTWYᵊabcdefhijklmnopqrstuvwxyzɑɐɒæβɔɕçɖðʤəɚɛɜɟɡɥɨɪʝɯɰŋɳɲɴøɸθœɹɾɻʁɽʂʃʈʧʊʋʌɣɤχʎʒʔˈˌːʰʲ↓→↗↘ᵻ'.split(''))

describe('R197 zhPhonemes (拼音→IPA 桥)', () => {
  it('syllable table: initials, aspirated pairs, glides, sibilant-i, F0-matrix tones', () => {
    // R197.2 声调约定(F0 实验矩阵):1=ː高平 2=↗升 3=ˌ前缀+↓低 4=ˈ前缀+↘降 5=无
    expect(syllableToIpa('nǐ')).toBe('ˌni↓')
    expect(syllableToIpa('hǎo')).toBe('ˌxɑʊ↓')
    expect(syllableToIpa('shì')).toBe('ˈʂɨ↘')
    expect(syllableToIpa('tīan')).toBe('tʰiænː') // tone1 lengthened, no stress
    expect(syllableToIpa('yín')).toBe('in↗') // y-glide + rising
    expect(syllableToIpa('wǒ')).toBe('ˌuɔ↓') // w-glide
    expect(syllableToIpa('jū')).toBe('tɕyː') // j+u → ü
    expect(syllableToIpa('quē')).toBe('tɕʰɥɛː')
    expect(syllableToIpa('rì')).toBe('ˈɻɨ↘')
    expect(syllableToIpa('ma')).toBe('ma') // tone5 neutral — unmarked
  })

  it('multi-pronunciation characters resolve via pinyin-pro', () => {
    const out = hanziToPhonemes('银行行长')
    expect(out).toContain('in↗') // yín
    expect(out).toContain('xɑŋ↗') // háng ×2
    expect(out).toContain('ˌʈʂɑŋ↓') // zhǎng
  })

  it('punctuation maps into the tokenizer vocab', () => {
    const out = hanziToPhonemes('你好，世界。')
    expect(out).toContain(' , ')
    expect(out).toContain(' .')
  })

  it('every emitted symbol is inside the kokoro tokenizer vocab', () => {
    for (const text of ['你好，世界。今天是星期天。', '人工智能正在改变世界！', '银行行长走着去上班。', '普通话四声：妈麻马骂。']) {
      const ph = hanziToPhonemes(text)
      const unknown = [...new Set([...ph].filter((c) => !VOCAB.has(c) && c !== ' '))]
      expect(unknown, `text="${text}" phonemes="${ph}"`).toEqual([])
    }
  })

  it('isZhText and the voice catalog routing agree', () => {
    expect(isZhText('你好世界')).toBe(true)
    expect(isZhText('Hello world')).toBe(false)
    expect(isZhVoice('zf_xiaobei')).toBe(true)
    expect(isZhVoice('zm_yunyang')).toBe(true)
    expect(isZhVoice('af_heart')).toBe(false)
    // catalog carries the 28 English + 8 bridge voices
    expect(KOKORO_VOICE_CATALOG.length).toBe(36)
    expect(KOKORO_VOICE_CATALOG.filter(isZhVoice).length).toBe(8)
  })
})
