// R114: lightweight Markdown renderer for AI8 replies — zero extra deps
// (runtime deps are react-only by project convention). The parser is a pure
// function over lines, tolerant of the unclosed code fence that streaming
// always leaves at the tail of the latest assistant message.
import { useEffect, useState, type JSX, type ReactNode } from 'react'

// ── R116 (round 3): <think> reasoning chains ───────────────────────────────
// Reasoning models (Kimi-k3, Grok, …) wrap their chain of thought in
// <think>…</think>. Rendering that raw floods the chat; we split it out into
// a collapsible panel instead (DeepSeek/ChatGPT style). While streaming the
// tag is unclosed — the panel shows a live "thinking…" state and collapses
// itself the moment the closing tag arrives.

export type ThinkSegment =
  | { kind: 'think'; body: string; closed: boolean }
  | { kind: 'text'; body: string }

export function splitThinkBlocks(text: string): ThinkSegment[] {
  const segments: ThinkSegment[] = []
  let rest = text
  while (true) {
    const open = rest.indexOf('<think>')
    if (open === -1) break
    if (open > 0) segments.push({ kind: 'text', body: rest.slice(0, open) })
    const after = rest.slice(open + '<think>'.length)
    const close = after.indexOf('</think>')
    if (close === -1) {
      segments.push({ kind: 'think', body: after, closed: false })
      return segments
    }
    segments.push({ kind: 'think', body: after.slice(0, close), closed: true })
    rest = after.slice(close + '</think>'.length)
  }
  if (rest !== '') segments.push({ kind: 'text', body: rest })
  return segments
}

/** The visible reply only — think chains stripped (what "copy" should give). */
export function stripThink(text: string): string {
  return splitThinkBlocks(text)
    .filter((seg): seg is { kind: 'text'; body: string } => seg.kind === 'text')
    .map((seg) => seg.body)
    .join('')
}

export function ThinkPanel({ body, closed, thinkingLabel, thoughtLabel }: { body: string; closed: boolean; thinkingLabel: string; thoughtLabel: string }): JSX.Element {
  const [open, setOpen] = useState(!closed)
  useEffect(() => { setOpen(!closed) }, [closed])
  return (
    <div className={`ai8-think${closed ? '' : ' live'}`}>
      <button type="button" className="ai8-think-toggle" onClick={() => setOpen((v) => !v)}>
        <span className="ai8-think-icon">💭</span>
        <span>{closed ? thoughtLabel : thinkingLabel}</span>
        <span className="ai8-think-arrow">{open ? '▾' : '▸'}</span>
      </button>
      {open ? <div className="ai8-think-body">{body}</div> : null}
    </div>
  )
}

export type MdBlock =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'listItem'; ordered: boolean; index: number; text: string }
  | { kind: 'code'; lang: string; body: string }
  | { kind: 'quote'; text: string }
  | { kind: 'hr' }
  | { kind: 'para'; text: string }

export function parseMarkdown(text: string): MdBlock[] {
  const blocks: MdBlock[] = []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let i = 0
  let orderedIndex = 0
  let lastListOrdered = false
  const resetList = (ordered: boolean) => {
    if (ordered !== lastListOrdered) orderedIndex = 0
    lastListOrdered = ordered
  }
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      i++
      continue
    }
    // fenced code (``` or ~~~), unclosed fence tolerated per R114.1
    const fence = line.match(/^\s*(```+|~~~+)\s*(\S*)/)
    if (fence) {
      const marker = fence[1][0]
      const minLen = fence[1].length
      const lang = fence[2] ?? ''
      const body: string[] = []
      i++
      while (i < lines.length && !new RegExp(`^\\s*${marker}{${minLen},}\\s*$`).test(lines[i])) {
        body.push(lines[i])
        i++
      }
      i++ // skip the closing fence if present
      blocks.push({ kind: 'code', lang, body: body.join('\n') })
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2].trim() })
      i++
      continue
    }
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      blocks.push({ kind: 'hr' })
      i++
      continue
    }
    const quote = line.match(/^>\s?(.*)$/)
    if (quote) {
      const body = [quote[1]]
      i++
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      blocks.push({ kind: 'quote', text: body.join(' ') })
      continue
    }
    const bullet = line.match(/^\s*[-*+]\s+(.*)$/)
    if (bullet) {
      resetList(false)
      orderedIndex = 0
      blocks.push({ kind: 'listItem', ordered: false, index: 0, text: bullet[1].trim() })
      i++
      continue
    }
    const ordered = line.match(/^\s*(\d+)[.)]\s+(.*)$/)
    if (ordered) {
      resetList(true)
      orderedIndex += 1
      blocks.push({ kind: 'listItem', ordered: true, index: orderedIndex, text: ordered[2].trim() })
      i++
      continue
    }
    // paragraph: consecutive non-empty non-marker lines joined
    const para: string[] = [line]
    i++
    while (i < lines.length && lines[i].trim() !== '' && !/^\s*(```|~~~|#{1,6}\s|>|[-*+]\s|\d+[.)]\s)/.test(lines[i])) {
      para.push(lines[i])
      i++
    }
    blocks.push({ kind: 'para', text: para.join(' ') })
  }
  return blocks
}

/** Inline: **bold**, *em*, `code`, [text](url) — returns React nodes. */
export function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let key = 0
  const pattern = /(\*\*([^*]+)\*\*)|(\*([^*\s][^*]*)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    if (match[2] !== undefined) nodes.push(<strong key={key++}>{match[2]}</strong>)
    else if (match[4] !== undefined) nodes.push(<em key={key++}>{match[4]}</em>)
    else if (match[6] !== undefined) nodes.push(<code key={key++} className="md-inline-code">{match[6]}</code>)
    else if (match[8] !== undefined) nodes.push(<a key={key++} href={match[9]} target="_blank" rel="noreferrer">{match[8]}</a>)
    last = match.index + match[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function CopyButton({ getText, label, copiedLabel }: { getText: () => string; label: string; copiedLabel: string }): JSX.Element {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="md-copy"
      onClick={() => {
        void copyRichText(getText()).then((ok) => {
          if (!ok) return
          setCopied(true)
          window.setTimeout(() => setCopied(false), 2000)
        })
      }}
    >
      {copied ? copiedLabel : label}
    </button>
  )
}

export function MarkdownView({ text, copyLabel, copiedLabel }: { text: string; copyLabel: string; copiedLabel: string }): JSX.Element {
  const blocks = parseMarkdown(text)
  return (
    <div className="md-view">
      {blocks.map((block, i) => {
        switch (block.kind) {
          case 'heading': {
            const Tag = `h${Math.min(4, block.level)}` as 'h1' | 'h2' | 'h3' | 'h4'
            return <Tag key={i} className={`md-h md-h${Math.min(4, block.level)}`}>{renderInline(block.text)}</Tag>
          }
          case 'listItem':
            return block.ordered
              ? <p key={i} className="md-li md-ol"><span className="md-ol-num">{block.index}.</span>{renderInline(block.text)}</p>
              : <p key={i} className="md-li md-ul"><span className="md-ul-dot">•</span>{renderInline(block.text)}</p>
          case 'code':
            return (
              <div key={i} className="md-code-block">
                <div className="md-code-head">
                  <span>{block.lang || 'code'}</span>
                  <CopyButton getText={() => block.body} label={copyLabel} copiedLabel={copiedLabel} />
                </div>
                <pre className="md-code-body">{block.body}</pre>
              </div>
            )
          case 'quote':
            return <blockquote key={i} className="md-quote">{renderInline(block.text)}</blockquote>
          case 'hr':
            return <hr key={i} className="md-hr" />
          default:
            return <p key={i} className="md-p">{renderInline(block.text)}</p>
        }
      })}
    </div>
  )
}

// ── R116 (round 4): structured-document copy ───────────────────────────────
// "复制" must yield a structured DOCUMENT, not raw markdown source: we put
// BOTH formats on the clipboard — text/plain (clean markdown, think chains
// stripped) and text/html (semantic tags with light inline styles), so pasting
// into Word / mail / docs keeps headings, lists and code blocks. The HTML uses
// LIGHT colors — the app's dark palette would paste black-on-black.

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** R116 (round 4): dual-format clipboard write with a deterministic Electron
 *  path. navigator.clipboard silently fails in Electron renderers (the R76
 *  lesson — permission-gated), so the preload's native IPC channel goes first;
 *  the web-API fallbacks keep the function usable outside Electron (tests).
 *  Returns true when some format definitely landed on the clipboard. */
export async function copyRichText(text: string, html?: string): Promise<boolean> {
  const api = (window as unknown as { rgbbox?: { clipboardWriteRich?: (t: string, h: string) => Promise<boolean>; clipboardWriteText?: (t: string) => Promise<boolean> } }).rgbbox
  try {
    if (api?.clipboardWriteRich && html !== undefined && (await api.clipboardWriteRich(text, html))) return true
  } catch { /* fall through */ }
  try {
    if (api?.clipboardWriteText && (await api.clipboardWriteText(text))) return true
  } catch { /* fall through */ }
  if (html !== undefined && typeof ClipboardItem !== 'undefined') {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })])
      return true
    } catch { /* fall through */ }
  }
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function inlineToHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\s][^*]*)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;border-radius:3px;padding:1px 4px;font-family:Consolas,monospace;font-size:13px">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
}

export function markdownToHtml(text: string): string {
  const blocks = parseMarkdown(text)
  const out: string[] = []
  let listType: 'ul' | 'ol' | null = null
  const closeList = () => {
    if (listType !== null) { out.push(`</${listType}>`); listType = null }
  }
  for (const block of blocks) {
    switch (block.kind) {
      case 'heading': {
        closeList()
        const level = Math.min(4, block.level)
        out.push(`<h${level} style="margin:0.7em 0 0.3em;line-height:1.3">${inlineToHtml(block.text)}</h${level}>`)
        break
      }
      case 'listItem': {
        const want = block.ordered ? 'ol' : 'ul'
        if (listType !== want) { closeList(); listType = want; out.push(`<${want} style="margin:0.4em 0;padding-left:1.4em">`) }
        out.push(`<li style="margin:0.15em 0">${inlineToHtml(block.text)}</li>`)
        break
      }
      case 'code':
        closeList()
        out.push(`<pre style="background:#f5f6f7;border:1px solid #e1e4e8;border-radius:6px;padding:10px 12px;margin:0.6em 0;overflow-x:auto"><code style="font-family:Consolas,'Courier New',monospace;font-size:13px;line-height:1.5;color:#24292f">${escapeHtml(block.body)}</code></pre>`)
        break
      case 'quote':
        closeList()
        out.push(`<blockquote style="border-left:3px solid #d0d7de;margin:0.6em 0;padding:2px 12px;color:#57606a">${inlineToHtml(block.text)}</blockquote>`)
        break
      case 'hr':
        closeList()
        out.push('<hr style="border:none;border-top:1px solid #d0d7de;margin:0.8em 0">')
        break
      default:
        closeList()
        out.push(`<p style="margin:0.5em 0">${inlineToHtml(block.text)}</p>`)
    }
  }
  closeList()
  return `<div style="font-family:-apple-system,'Segoe UI','Microsoft YaHei',sans-serif;font-size:14px;line-height:1.7;color:#1f2328;max-width:760px">${out.join('\n')}</div>`
}
