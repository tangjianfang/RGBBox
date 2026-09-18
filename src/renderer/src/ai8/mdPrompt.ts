// R126.2: pure helpers for the AI8 folder-batch draw mode. The user's scene
// MD files ship ready-made prompts inside a fenced code block — that block
// IS the prompt; everything else in the file is human documentation.

/** Extract a draw prompt from a scene MD:
 *  1. the FIRST fenced block (``` or ```lang), verbatim — the authored prompt;
 *  2. no fence → the plain text with markdown markers stripped;
 *  3. '' when nothing usable remains (batch records the file as failed). */
export function extractPromptFromMd(md: string): string {
  const fence = md.match(/```[^\n]*\n([\s\S]*?)```/)
  if (fence !== null) return fence[1].trim()
  return stripMarkdown(md).trim()
}

/** Reduce common markdown syntax to flowing plain text (fallback path). */
function stripMarkdown(md: string): string {
  return md
    .split(/\r?\n/)
    .map((line) => {
      let s = line
      // table rows: drop separator rows, unwrap pipes to spaces
      if (/^\s*\|?[\s:|-]+\|?\s*$/.test(s) && s.includes('-')) return ''
      s = s.replace(/^\s*\|/g, '').replace(/\|\s*$/g, '').replace(/\s*\|\s*/g, ' ')
      // headings / blockquotes / bullets / ordered markers
      s = s.replace(/^\s{0,3}#{1,6}\s+/, '')
      s = s.replace(/^\s*>\s?/, '')
      s = s.replace(/^\s*[-*+]\s+/, '')
      s = s.replace(/^\s*\d+\.\s+/, '')
      // links and images keep only their text; emphasis unwrapped
      s = s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      s = s.replace(/(\*\*|__)(.*?)\1/g, '$2')
      s = s.replace(/(\*|_)(.*?)\1/g, '$2')
      s = s.replace(/`([^`]*)`/g, '$1')
      return s.trim()
    })
    .filter((line) => line !== '')
    .join('\n')
}

/** Filename sort aware of digit runs: S2 < S10 (case-insensitive, like the
 *  site's scene pipelines the user organizes as S01A / S02 …). */
export function naturalCompare(a: string, b: string): number {
  const ai = a.toLowerCase()
  const bi = b.toLowerCase()
  if (ai === bi) return 0
  const ra = /(\d+)|(\D+)/g
  const rb = /(\d+)|(\D+)/g
  let am: RegExpExecArray | null = null
  let bm: RegExpExecArray | null = null
  while (true) {
    am = ra.exec(ai)
    bm = rb.exec(bi)
    if (am === null || bm === null) break
    if (am[1] !== undefined && bm[1] !== undefined) {
      const diff = Number(am[1]) - Number(bm[1])
      if (diff !== 0) return diff
    } else if (am[0] !== bm[0]) {
      return am[0] < bm[0] ? -1 : 1
    }
  }
  // one string ran out of segments — it's the shorter prefix, sorts first
  if (am === null && bm !== null) return -1
  if (am !== null && bm === null) return 1
  return 0
}
