// R85 review fix: the module registry used to be hand-enumerated in 5 places.
// These guards make "forgot one list" a test failure instead of a silent bug
// (e.g. openView() no-op / unreachable dashboard card / mislabeled tab).
import { describe, it, expect } from 'vitest'
import { CARD_VIEWS, DASHBOARD_SECTIONS, MODULE_META, getTabMeta } from '../../../src/renderer/src/components/shellModules'
import { MODULE_VIEWS } from '../../../src/renderer/src/hooks/tabNavigation'

describe('shell module registry completeness (R85)', () => {
  it('every card view has meta and appears exactly once in the dashboard sections', () => {
    const sectionViews = DASHBOARD_SECTIONS.flatMap((s) => s.views)
    expect(new Set(sectionViews).size).toBe(sectionViews.length)
    expect([...CARD_VIEWS].sort()).toEqual([...sectionViews].sort())
    for (const v of CARD_VIEWS) {
      expect(MODULE_META[v], `missing MODULE_META for ${v}`).toBeDefined()
    }
  })

  it('module views = card views + settings (settings has no dashboard card)', () => {
    expect([...MODULE_VIEWS].sort()).toEqual([...CARD_VIEWS, 'settings'].sort())
  })

  it('every tabbable view has a tab label and icon', () => {
    for (const v of ['dashboard', ...MODULE_VIEWS] as const) {
      const meta = getTabMeta(v)
      expect(meta.labelKey, `missing label for ${v}`).toBeTruthy()
      expect(meta.icon, `missing icon for ${v}`).toBeTruthy()
    }
  })
})
