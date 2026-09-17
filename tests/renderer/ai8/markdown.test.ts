// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { parseMarkdown, renderInline } from '../../../src/renderer/src/ai8/markdown'

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

  it('renders inline bold, code and links as elements', () => {
    const html = renderToString(createElement('span', null, ...renderInline('**粗体** 和 `code` 与 [链接](https://example.com)')))
    expect(html).toContain('<strong>粗体</strong>')
    expect(html).toContain('<code class="md-inline-code">code</code>')
    expect(html).toContain('href="https://example.com"')
  })
})
