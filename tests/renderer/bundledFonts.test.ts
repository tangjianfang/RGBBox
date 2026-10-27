// R321 随包字体守卫 — 界面渲染不得依赖宿主系统装了什么字体。
// 起因：字体栈首位 Inter 从未随包，英文落 Segoe UI Variable、中文落系统回退，
// 同一版本在不同机器上界面不一致，视觉快照门禁换机必红。本守卫把「字体随包」
// 从口头约定变成红灯测试：@font-face 文件在位、字体栈首位是随包字体、
// 样式表不再出现系统字体字面量栈、许可证在位、界面词表的汉字都在子集里。
import { describe, it, expect, vi } from 'vitest'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// setup.ts 全局 vi.mock 了 i18n 模块——importActual 取真实词表与 htmlLangFor
const i18n = await vi.importActual<typeof import('../../src/renderer/src/i18n')>('../../src/renderer/src/i18n')

const root = fileURLToPath(new URL('../../', import.meta.url))
const stylesDir = resolve(root, 'src/renderer/src/styles')
const fontsDir = resolve(root, 'src/renderer/src/assets/fonts')
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '')

const fontsCss = stripComments(readFileSync(resolve(stylesDir, 'fonts.css'), 'utf8'))
const tokensCss = stripComments(readFileSync(resolve(stylesDir, 'tokens.css'), 'utf8'))
const entryCss = stripComments(readFileSync(resolve(root, 'src/renderer/src/styles.css'), 'utf8'))

interface FontFace { family: string; weight: string; src: string; file: string }
function parseFontFaces(css: string): FontFace[] {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => {
    const body = m[1]
    const family = /font-family:\s*'([^']+)'/.exec(body)?.[1] ?? ''
    const weight = /font-weight:\s*([^;]+);/.exec(body)?.[1].trim() ?? ''
    const src = /url\('([^']+)'\)/.exec(body)?.[1] ?? ''
    return { family, weight, src, file: resolve(stylesDir, src) }
  })
}
const faces = parseFontFaces(fontsCss)

/** First family of a custom-property font stack, quotes stripped. */
function stackOf(css: string, prop: string): string[] {
  const m = new RegExp(`${prop}:\\s*([^;]+);`).exec(css)
  return (m?.[1] ?? '').split(',').map((f) => f.trim().replace(/^["']|["']$/g, ''))
}

describe('bundled fonts guard (R321)', () => {
  it('registers exactly the three bundled families', () => {
    expect([...new Set(faces.map((f) => f.family))].sort()).toEqual(['Cascadia Mono', 'Inter', 'Noto Sans SC'])
  })

  it('every @font-face src exists on disk, is non-empty, and is a real woff2', () => {
    expect(faces.length).toBeGreaterThanOrEqual(7)
    for (const f of faces) {
      expect(existsSync(f.file), `${f.family} ${f.weight}: missing ${f.src}`).toBe(true)
      expect(statSync(f.file).size, `${f.src} is empty`).toBeGreaterThan(10_000)
      expect(readFileSync(f.file).subarray(0, 4).toString('latin1'), `${f.src} is not woff2`).toBe('wOF2')
    }
  })

  it('weights: Inter is variable 100–900, Noto Sans SC ships 400/600/700, Cascadia Mono 400/700', () => {
    const w = (fam: string) => faces.filter((f) => f.family === fam).map((f) => f.weight)
    expect(new Set(w('Inter'))).toEqual(new Set(['100 900']))
    expect([...new Set(w('Noto Sans SC'))].sort()).toEqual(['400', '600', '700'])
    expect([...new Set(w('Cascadia Mono'))].sort()).toEqual(['400', '700'])
  })

  it('UI stack leads with the bundled faces; system fonts only come after', () => {
    const ui = stackOf(tokensCss, '--font-ui')
    expect(ui.slice(0, 2)).toEqual(['Inter', 'Noto Sans SC'])
    expect(ui.indexOf('Segoe UI')).toBeGreaterThan(1)
    expect(ui.at(-1)).toBe('sans-serif')
    const mono = stackOf(tokensCss, '--font-mono')
    expect(mono.slice(0, 2)).toEqual(['Cascadia Mono', 'Noto Sans SC'])
    expect(mono.indexOf('Consolas')).toBeGreaterThan(1)
  })

  it(':root takes its font from --font-ui (no second hand-written stack to drift)', () => {
    expect(/:root\s*\{[^}]*font-family:\s*var\(--font-ui\)/.test(tokensCss)).toBe(true)
  })

  it('styles.css loads fonts.css before the tokens', () => {
    const order = [...entryCss.matchAll(/@import\s+'\.\/styles\/([\w.-]+)'/g)].map((m) => m[1])
    expect(order.indexOf('fonts.css')).toBe(0)
    expect(order).toContain('tokens.css')
  })

  it('no stylesheet hand-writes a system font stack (must ride --font-ui / --font-mono / inherit)', () => {
    const offenders: string[] = []
    for (const name of readdirSync(stylesDir)) {
      if (!name.endsWith('.css') || name === 'tokens.css' || name === 'fonts.css') continue
      const css = stripComments(readFileSync(resolve(stylesDir, name), 'utf8'))
      for (const m of css.matchAll(/font-family:\s*([^;}]+)[;}]/g)) {
        const v = m[1].trim()
        if (/^var\(--font-(ui|mono)\b/.test(v) || v === 'inherit') continue
        offenders.push(`${name}: font-family: ${v}`)
      }
    }
    expect(offenders, `literal font stacks bypass the bundled fonts:\n${offenders.join('\n')}`).toEqual([])
  })

  it('every bundled family has its OFL licence text next to the files and a NOTICE.md entry', () => {
    const notice = readFileSync(resolve(root, 'NOTICE.md'), 'utf8')
    for (const [fam, file] of [['Inter', 'LICENSE-Inter.txt'], ['Noto Sans SC', 'LICENSE-NotoSansSC.txt'], ['Cascadia Mono', 'LICENSE-CascadiaMono.txt']]) {
      expect(readFileSync(resolve(fontsDir, file), 'utf8'), `${file} must be the OFL text`).toMatch(/SIL OPEN FONT LICENSE/i)
      expect(notice, `NOTICE.md lacks ${fam}`).toContain(fam)
    }
    expect(notice).toMatch(/OFL-1\.1/)
  })

  it('Noto Sans SC subset covers every hanzi used by the UI translation tables (zh + en)', () => {
    const subset = new Set(readFileSync(resolve(fontsDir, 'NotoSansSC.charset.txt'), 'utf8'))
    expect(subset.size).toBeGreaterThan(3500)
    const isCjk = (cp: number): boolean =>
      (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0xf900 && cp <= 0xfaff)
    const uncovered = new Map<string, string>()
    for (const [lang, table] of Object.entries(i18n.translations)) {
      for (const [key, value] of Object.entries(table as Record<string, string>)) {
        for (const ch of value) {
          if (isCjk(ch.codePointAt(0) ?? 0) && !subset.has(ch) && !uncovered.has(ch)) uncovered.set(ch, `${lang}:${key}`)
        }
      }
    }
    expect(
      [...uncovered].map(([ch, where]) => `${ch} (${where})`),
      'hanzi missing from the bundled Noto Sans SC subset — re-run the steps in src/renderer/src/assets/fonts/README.md',
    ).toEqual([])
  })

  it('subset manifest lives beside the fonts it describes', () => {
    expect(dirname(resolve(fontsDir, 'NotoSansSC.charset.txt'))).toBe(fontsDir)
  })
})

describe('htmlLangFor (R321)', () => {
  it('maps the UI language to a BCP-47 tag so Han text is shaped as Simplified Chinese', () => {
    expect(i18n.htmlLangFor('zh')).toBe('zh-CN')
    expect(i18n.htmlLangFor('en')).toBe('en')
  })
})
