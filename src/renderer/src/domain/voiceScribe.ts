/**
 * 声文 VoiceScribe — TextPipeline 纯函数层（PRD R173.1，承载方案 §4 TextPipeline
 * 的 P1 等价实现：规范化 / 分句 / 词典钉音替换 / 语言检测）。
 *
 * 框架无关、无副作用——朗读前的全部文本处理都在这里，可单测。
 * 离线 Kokoro 引擎（R173-B）接入时，本层复用为合成前预处理。
 */

export interface LexiconEntry {
  word: string
  /** 朗读替换文本（英文重拼写 / 中文直拼等），替换发生在合成前，不改原文显示。 */
  respell: string
}

/** 折叠空白但保留段落换行（段落边界参与分句）。 */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\u3000]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .trim()
}

/**
 * 中英混合分句：终结符（。！？；!?;）切分、省略号聚合、换行即边界。
 * 返回非空句列表（保留原始大小写与标点，便于显示）。
 */
export function splitSentences(text: string): string[] {
  const normalized = normalizeText(text)
  if (normalized === '') return []
  const parts = normalized.split(/(?<=[。！？；!?;])|(?<=\.{3,})|(?<=…)|\n/g)
  return parts.map((p) => p.trim()).filter((p) => p.length > 0)
}

/** 词典钉音替换（ADR-003 词典层）：仅作用于朗读文本。长词优先，避免子串误替。 */
export function applyLexicon(text: string, entries: LexiconEntry[]): string {
  const sorted = [...entries]
    .filter((e) => e.word.trim() !== '' && e.respell.trim() !== '')
    .sort((a, b) => b.word.length - a.word.length)
  let out = text
  for (const entry of sorted) {
    const escaped = entry.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(escaped, 'g'), entry.respell)
  }
  return out
}

/** CJK 占比过半判中文,否则英文(系统引擎 lang 映射用)。CJK 每字符信息量
 *  高于拉丁字母,按 1.5× 加权——「混合 mixed 中文」判中文,零星汉字的英文
 *  句仍判英文。 */
export function detectLang(text: string): 'zh' | 'en' {
  const cjk = text.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g)?.length ?? 0
  const letters = text.match(/[A-Za-z]/g)?.length ?? 0
  if (cjk === 0 && letters === 0) return 'zh'
  return cjk * 1.5 >= letters ? 'zh' : 'en'
}

/** localStorage 词典读写（损坏/缺失回退空表）。 */
export function loadLexicon(storage: Pick<Storage, 'getItem'> | null): LexiconEntry[] {
  if (!storage) return []
  try {
    const raw = storage.getItem('rgbbox:voiceLexicon')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((e): e is LexiconEntry =>
        typeof e === 'object' && e !== null &&
        typeof (e as LexiconEntry).word === 'string' && typeof (e as LexiconEntry).respell === 'string')
      .map((e) => ({ word: e.word, respell: e.respell }))
  } catch {
    return []
  }
}

export function saveLexicon(entries: LexiconEntry[], storage: Pick<Storage, 'setItem'> | null): void {
  if (!storage) return
  try {
    storage.setItem('rgbbox:voiceLexicon', JSON.stringify(entries))
  } catch { /* storage unavailable — keep in-memory only */ }
}

/** R183: 模型面板人读字节量——小于 1MB 以 KB 计（5KB 的 config.json 不再
 *  显示成「0.0 MB / 0」），≥10MB 省小数（291MB 模型不占行宽）。 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  if (bytes < 1048576) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0)} MB`
}
