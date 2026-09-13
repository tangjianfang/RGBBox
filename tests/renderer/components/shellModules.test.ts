import { describe, it, expect } from 'vitest'
import { CARD_VIEWS, MODULE_META, getTabMeta } from '../../../src/renderer/src/components/shellModules'
import { MODULE_VIEWS } from '../../../src/renderer/src/hooks/tabNavigation'

describe('shell module registry completeness (R86)', () => {
  it('every card view has meta', () => {
    for (const v of CARD_VIEWS) {
      expect(MODULE_META[v], `missing MODULE_META for ${v}`).toBeDefined()
    }
  })
  it('module views = card views + settings', () => {
    expect([...MODULE_VIEWS].sort()).toEqual([...CARD_VIEWS, 'settings'].sort())
  })
  it('every view renderable in the rail has label + icon', () => {
    for (const v of ['dashboard', ...CARD_VIEWS] as const) {
      const meta = getTabMeta(v)
      expect(meta.labelKey, `missing label for ${v}`).toBeTruthy()
      expect(meta.icon, `missing icon for ${v}`).toBeTruthy()
    }
  })
})
