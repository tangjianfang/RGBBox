// R319 样式覆盖守卫 — 新功能 UI 组件依赖的每个 class 必须在出厂样式表里有
// 规则。起因：首启手势提示卡的两个按钮上线时没挂 class（深色卡片上回落浏
// 览器默认灰按钮，用户报障截图）。本登记册把「忘了写 CSS」从目视走查问题
// 变成红灯测试。新增功能 UI 组件时，在此追加家族条目即视为本守卫的契约。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const cssPath = fileURLToPath(new URL('../../src/renderer/src/styles/app.css', import.meta.url))
// strip comments first so a class named inside /* … */ never counts as a rule
const bare = readFileSync(cssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** `.cls` followed by a BASE-rule terminator (space/,/./{/>) — supports
 *  comma-grouped selectors; `:` is deliberately excluded so a class with
 *  only pseudo-variant rules (`:hover`/`:active`) does NOT pass: it would
 *  still render unstyled at rest. The leading boundary rejects longer class
 *  names that merely contain cls as a prefix (e.g. `vision-first-hint-icon`
 *  must not satisfy `vision-first-hint`). */
function hasClassRule(cls: string): boolean {
  return new RegExp(`(^|[^\\w-])\\.${cls}(\\s|,|\\.|\\{|\\>)`).test(bare)
}

/** Registry: component family → classes it must never ship without.
 *  NEW FEATURE UI: append your entries here. */
const REQUIRED_CLASSES: Record<string, string[]> = {
  'vision/VisionFirstHint (R306, buttons styled in R319)': [
    'vision-first-hint', 'vision-first-hint-icon', 'vision-first-hint-body',
    'vision-first-hint-open', 'vision-first-hint-dismiss',
  ],
}

describe('ui styles coverage guard (R319)', () => {
  for (const [family, classes] of Object.entries(REQUIRED_CLASSES)) {
    it(`${family}: every class has a rule in app.css`, () => {
      const missing = classes.filter((c) => !hasClassRule(c))
      expect(missing, `app.css 缺规则: ${missing.join(', ')}`).toEqual([])
    })
  }

  it('matcher self-check: unknown class misses, comma-grouped selector hits', () => {
    expect(hasClassRule('vision-first-hint-definitely-not-a-class')).toBe(false)
    expect(hasClassRule('btn-primary')).toBe(true) // defined inside a comma group
  })
})
