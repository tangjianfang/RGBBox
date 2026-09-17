// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { markdownToHtml, parseMarkdown, renderInline, splitThinkBlocks, stripThink } from '../../../src/renderer/src/ai8/markdown'

describe('renderer/ai8 markdown parser (R114)', () => {
  it('parses headings, lists, quotes, hr and paragraphs', () => {
    const blocks = parseMarkdown('# 三体\n\n## 基本信息\n- 作者：刘慈欣\n- 类型：硬科幻\n\n1. 第一部\n2. 第二部\n\n> 面壁者\n\n---\n\n普通段落文本')
    expect(blocks).toEqual([
      { kind: 'heading', level: 1, text: '三体' },
      { kind: 'heading', level: 2, text: '基本信息' },
      { kind: 'listItem', ordered: false, index: 0, text: '作者：刘慈欣' },
      { kind: 'listItem', ordered: false, index: 0, text: '类型：硬科幻' },
      { kind: 'listItem', ordered: true, index: 1, text: '第一部' },
      { kind: 'listItem', ordered: true, index: 2, text: '第二部' },
      { kind: 'quote', text: '面壁者' },
      { kind: 'hr' },
      { kind: 'para', text: '普通段落文本' },
    ])
  })

  it('parses fenced code blocks and tolerates an unclosed fence (streaming)', () => {
    const closed = parseMarkdown('```python\nprint(1)\nprint(2)\n```\n\nafter')
    expect(closed[0]).toEqual({ kind: 'code', lang: 'python', body: 'print(1)\nprint(2)' })
    expect(closed[1]).toEqual({ kind: 'para', text: 'after' })
    const open = parseMarkdown('intro\n\n```js\nconst x = 1')
    expect(open[0]).toEqual({ kind: 'para', text: 'intro' })
    expect(open[1]).toEqual({ kind: 'code', lang: 'js', body: 'const x = 1' })
  })

  it('parses pipe tables; delimiter-less pipes stay paragraphs (R117.10)', () => {
    const blocks = parseMarkdown('| 项 | 值 |\n| --- | :-: |\n| 模式 | 流光 |\n| 速度 | 快 |')
    expect(blocks[0]).toEqual({ kind: 'table', head: ['项', '值'], rows: [['模式', '流光'], ['速度', '快']] })
    expect(parseMarkdown('| 只是 | 一行 |')).toEqual([{ kind: 'para', text: '| 只是 | 一行 |' }])
  })

  it('lets a table interrupt a paragraph without a blank line (P2-6)', () => {
    const blocks = parseMarkdown('对比如下：\n| 项 | 值 |\n| --- | --- |\n| a | 1 |')
    expect(blocks[0]).toEqual({ kind: 'para', text: '对比如下：' })
    expect(blocks[1]).toEqual({ kind: 'table', head: ['项', '值'], rows: [['a', '1']] })
  })

  it('renders inline bold, code and links as elements', () => {
    const html = renderToString(createElement('span', null, ...renderInline('**粗体** 和 `code` 与 [链接](https://example.com)')))
    expect(html).toContain('<strong>粗体</strong>')
    expect(html).toContain('<code class="md-inline-code">code</code>')
    expect(html).toContain('href="https://example.com"')
  })
})

describe('renderer/ai8 think-block splitting (R116 round 3)', () => {
  it('splits a closed think chain from the visible reply', () => {
    const segs = splitThinkBlocks('<think>User asks what model I am.</think>\n我是 Kimi。')
    expect(segs).toEqual([
      { kind: 'think', body: 'User asks what model I am.', closed: true },
      { kind: 'text', body: '\n我是 Kimi。' },
    ])
  })

  it('treats an unclosed think tag as a live (streaming) segment', () => {
    const segs = splitThinkBlocks('<think>The user asked: "你是什么')
    expect(segs).toEqual([
      { kind: 'think', body: 'The user asked: "你是什么', closed: false },
    ])
  })

  it('keeps tag-free text intact and handles mid-message chains', () => {
    expect(splitThinkBlocks('普通回复，没有思维链')).toEqual([
      { kind: 'text', body: '普通回复，没有思维链' },
    ])
    const mid = splitThinkBlocks('开头。\n<think>中间思考</think>结尾。')
    expect(mid).toEqual([
      { kind: 'text', body: '开头。\n' },
      { kind: 'think', body: '中间思考', closed: true },
      { kind: 'text', body: '结尾。' },
    ])
  })

  it('stripThink keeps only the visible reply (R116 round 4)', () => {
    expect(stripThink('<think>reasoning…</think>答案')).toBe('答案')
    expect(stripThink('没有标签')).toBe('没有标签')
    expect(stripThink('<think>a</think>前<think>b</think>后')).toBe('前后')
  })
})

describe('renderer/ai8 markdownToHtml (R116 round 4)', () => {
  it('emits semantic light-themed document markup', () => {
    const html = markdownToHtml('## 标题\n\n- 甲\n- 乙\n\n```js\nif (a < b) { x() }\n```\n\n> 引用 **粗体** `code`')
    expect(html).toContain('<h2')
    expect(html).toContain('<ul')
    expect(html).toMatch(/<li[^>]*>甲<\/li>/)
    expect(html).toContain('if (a &lt; b)') // code body escaped
    expect(html).toContain('<pre')
    expect(html).toContain('<blockquote')
    expect(html).toContain('<strong>粗体</strong>')
    expect(html).toContain('<code style=')
  })

  it('aggregates consecutive ordered items into one ol', () => {
    const html = markdownToHtml('1. 一\n2. 二\n\n段落')
    expect(html.match(/<ol/g)?.length).toBe(1)
    expect(html.match(/<li/g)?.length).toBe(2)
    expect(html).toContain('<p')
  })

  it('exports tables as bordered HTML documents', () => {
    const html = markdownToHtml('| 项 | 值 |\n| --- | --- |\n| a < b | x |')
    expect(html).toContain('<table')
    expect(html).toContain('<th')
    expect(html).toContain('a &lt; b')
  })
})
