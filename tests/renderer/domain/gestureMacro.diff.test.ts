// @vitest-environment happy-dom
// R309d (evolve #6 / Tier 4): preset diff preview — what WILL change before
// it does. Applying a preset blind (the T8 UX) rewires gestures sight-unseen.
import { describe, it, expect } from 'vitest'
import { macroDiff } from '../../../src/renderer/src/domain/gestureMacro'
import { GESTURE_SCENE_MAP } from '../../../src/renderer/src/vision/gestureActions'
import { buildPresetMap } from '../../../src/renderer/src/domain/gestureMacro'

describe('domain/macroDiff (R309d, evolve #6)', () => {
  it('diffs a preset against the default table: only changed cells, exact from→to', () => {
    const diffs = macroDiff(GESTURE_SCENE_MAP, buildPresetMap('light-drive'))
    // light-drive sets dir8 (7 scenes) + chord-light (7, one already openMenu in default → 6 changed)
    const dir8 = diffs.filter((d) => d.gesture === 'dir8' && d.scene !== 'games')
    expect(dir8.length).toBe(7)
    expect(dir8[0]).toMatchObject({ gesture: 'dir8', from: 'none', to: 'brightnessStep' })
    // games cells never appear (both sides none)
    expect(diffs.filter((d) => d.scene === 'games')).toEqual([])
    // identical tables → empty diff
    expect(macroDiff(buildPresetMap('party'), buildPresetMap('party'))).toEqual([])
  })

  it('reports a hand-edit back to none as a diff too (both directions)', () => {
    const party = buildPresetMap('party')
    const edited = JSON.parse(JSON.stringify(party)) as typeof party
    edited.dir8.workspace = { action: 'none', cooldownMs: 0, guard: 'always' }
    const diffs = macroDiff(party, edited)
    expect(diffs).toEqual([{ gesture: 'dir8', scene: 'workspace', from: 'brightnessStep', to: 'none' }])
  })
})
