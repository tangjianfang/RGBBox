// R90.9: AudioSet label lookup honouring the UI language — the asset carries
// both `label` (English) and `labelZh` (hand-translated 1:1 for all 527).
import type { Lang } from '../i18n'
import labels from '../assets/audioset-labels.json'

export function audiosetLabel(index: number, lang: Lang): string {
  const entry = labels[index]
  if (!entry) return `#${index}`
  return lang === 'zh' ? (entry.labelZh ?? entry.label) : entry.label
}
