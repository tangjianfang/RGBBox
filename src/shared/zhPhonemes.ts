/**
 * R197: 中文→Kokoro 音素桥(实验)。
 *
 * 背景:kokoro-js@1.2.1 只有英语 G2P;其 phonemizer WASM 有 cmn 语音清单但
 * **未捆绑 cmn_dict 词典数据**(实测 `Can't read dictionary file … cmn_dict`),
 * espeak 路线被数据卡死。本模块自建 汉字→带调拼音(pinyin-pro,多音字)→
 * IPA 音素表,输出符号全部取自 v1.0 tokenizer 词表(115 字符实测 dump:
 * 含 ɕ ʈ ʂ ɤ ɥ ŋ ɻ ɨ ɯ 及音调箭头 ↓→↗↘ 与 ˈˌː)。
 *
 * 声调约定(首轮,听感迭代):1 阴平不标,2 阳平 ↗,3 上声 ↓,4 去声 ↘,5 轻声不标。
 * 路由侧:voice 名以 zf_/zm_ 开头即走本桥 + engine.generate_from_ids 直喂。
 */
import { pinyin } from 'pinyin-pro'

/** 声母 → IPA(vocab 符号)。 */
const INITIALS: Record<string, string> = {
  b: 'p', p: 'pʰ', m: 'm', f: 'f',
  d: 't', t: 'tʰ', n: 'n', l: 'l',
  g: 'k', k: 'kʰ', h: 'x',
  j: 'tɕ', q: 'tɕʰ', x: 'ɕ',
  zh: 'ʈʂ', ch: 'ʈʂʰ', sh: 'ʂ', r: 'ɻ',
  z: 'ts', c: 'tsʰ', s: 's',
  y: '', w: '',
}

/** 韵母 → IPA(基本形;j/q/x 后的 u 读 ü,zhi/chi/shi/ri/zi/ci/si 的 i 读 ɨ)。 */
const FINALS: Record<string, string> = {
  a: 'a', o: 'ɔ', e: 'ɤ', ê: 'ɛ', er: 'ɚ',
  ai: 'aɪ', ei: 'eɪ', ao: 'ɑʊ', ou: 'oʊ',
  an: 'æn', en: 'ən', ang: 'ɑŋ', eng: 'əŋ',
  i: 'i', ɨ: 'ɨ', ia: 'ia', ie: 'iɛ', iao: 'iɑʊ', iu: 'ioʊ', iou: 'ioʊ',
  ian: 'iæn', iang: 'iɑŋ', in: 'in', ing: 'iŋ', iong: 'iʊŋ',
  u: 'u', ua: 'ua', uo: 'uɔ', ui: 'ueɪ', uei: 'ueɪ',
  uan: 'uæn', un: 'uən', uen: 'uən', uang: 'uɑŋ', ueng: 'uəŋ', ong: 'ʊŋ',
  ü: 'y', ue: 'ɥɛ', üe: 'ɥɛ', ueng2: 'uəŋ',
  üan: 'ɥæn', uan2: 'ɥæn', ün: 'yn', un2: 'yn',
}

/** 带调元音 → (基字母, 声调号)。 */
const TONE_MARKS: Record<string, [string, number]> = {
  ā: ['a', 1], á: ['a', 2], ǎ: ['a', 3], à: ['a', 4],
  ō: ['o', 1], ó: ['o', 2], ǒ: ['o', 3], ò: ['o', 4],
  ē: ['e', 1], é: ['e', 2], ě: ['e', 3], è: ['e', 4],
  ī: ['i', 1], í: ['i', 2], ǐ: ['i', 3], ì: ['i', 4],
  ū: ['u', 1], ú: ['u', 2], ǔ: ['u', 3], ù: ['u', 4],
  ǖ: ['ü', 1], ǘ: ['ü', 2], ǚ: ['ü', 3], ǜ: ['ü', 4],
  ń: ['n', 2], ň: ['n', 3], ǹ: ['n', 4],
  ḿ: ['m', 2], m̌: ['m', 3], m̀: ['m', 4],
}

const TONE_SUFFIX: Record<number, string> = { 1: '', 2: '↗', 3: '↓', 4: '↘', 5: '' }

/** 全角标点 → 词表内半角(vocab 有 $ ; : , . ! ? — … " ( ) “ ”)。 */
const PUNCT: Record<string, string> = {
  '，': ',', '。': '.', '！': '!', '？': '?', '；': ';', '：': ':',
  '（': '(', '）': ')', '—': '—', '、': ',',
  '“': '“', '”': '”', '‘': '“', '’': '”',
}

/** 判定文本是否中文主导(CJK×1.5 加权,与渲染层 detectLang 同口径)。 */
export function isZhText(text: string): boolean {
  const cjk = text.match(/[一-鿿]/g)?.length ?? 0
  const letters = text.match(/[A-Za-z]/g)?.length ?? 0
  if (cjk === 0 && letters === 0) return true
  return cjk * 1.5 >= letters
}

/** 带调拼音音节 → IPA 音素串(含声调箭头)。导出供单测。 */
export function syllableToIpa(syl: string): string {
  // strip tone marks first, remember the tone
  let tone = 5
  let base = ''
  for (const ch of syl) {
    const m = TONE_MARKS[ch]
    if (m) { base += m[0]; tone = m[1] } else { base += ch }
  }
  // split initial / final (zh/ch/sh first)
  let initial = ''
  let final = base
  for (const len of [2, 1]) {
    const head = base.slice(0, len)
    if (INITIALS[head] !== undefined) {
      initial = head
      final = base.slice(len)
      break
    }
  }
  // y/w glide handling: yi→i, ya→ia, wu→u, wa→ua…
  if (initial === 'y' || initial === 'w') {
    const g = initial === 'y' ? 'i' : 'u'
    final = final === '' ? g : final.startsWith(g.slice(0, 1)) ? final : g + final
    initial = ''
  }
  // j/q/x + u → ü
  if (['j', 'q', 'x'].includes(initial) && final.startsWith('u')) final = `ü${final.slice(1)}`
  // retroflex/dental sibilant + i → ɨ
  if (['zh', 'ch', 'sh', 'r', 'z', 'c', 's'].includes(initial) && final === 'i') final = 'ɨ'
  const ipaInit = INITIALS[initial] ?? ''
  const ipaFinal = FINALS[final] ?? FINALS[final.replace(/^ü/, 'ue')] ?? ''
  return `${ipaInit}${ipaFinal}${TONE_SUFFIX[tone] ?? ''}`
}

/** 中文文本 → Kokoro 音素串(音节空格分隔;标点映射;非汉字按原样)。 */
export function hanziToPhonemes(text: string): string {
  const syllables = pinyin(text, { toneType: 'symbol', type: 'array', nonZh: 'consecutive' })
  const out: string[] = []
  for (const item of syllables) {
    if (/^[一-鿿]/.test(item) || /^[a-züāáǎàēéěìíǐìōóǒòūúǔùǖǘǚǜńňǹḿm̌m̀]/i.test(item)) {
      // a pinyin run (nonZh:consecutive groups latin together) — split per syllable via spacing
      for (const syl of item.split(/\s+/)) {
        if (syl === '') continue
        out.push(syllableToIpa(syl))
      }
    } else {
      // punctuation / other — map fullwidth to vocab symbols
      const mapped = PUNCT[item.trim()] ?? item.trim()
      if (mapped !== '') out.push(mapped)
    }
  }
  return out.join(' ')
}
