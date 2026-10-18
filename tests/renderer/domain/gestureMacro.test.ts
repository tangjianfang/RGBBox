// @vitest-environment happy-dom
// R306/T8: the gesture macro presets + persistence — the user-editable view
// over the closed GESTURE_SCENE_MAP decision matrix. Three shipped presets,
// every one validates clean; localStorage round-trip with a default
// fallback; resolveMacro is the single lookup T9's consumers will call.
import { describe, it, expect, beforeEach } from 'vitest'
import {
  MACRO_PRESETS, buildPresetMap, validateMacroMap, persistMacroMap, loadMacroMap,
  resolveMacro, MACRO_STORAGE_KEY,
} from '../../../src/renderer/src/domain/gestureMacro'
import { GESTURE_SCENE_MAP, validateGestureSceneMap } from '../../../src/renderer/src/vision/gestureActions'

beforeEach(() => localStorage.clear())

describe('domain/gestureMacro (R306/T8)', () => {
  it('ships exactly three presets with bilingual names', () => {
    expect(MACRO_PRESETS.map((p) => p.id)).toEqual(['light-drive', 'present', 'party'])
    for (const p of MACRO_PRESETS) {
      expect(p.zh.length).toBeGreaterThan(0)
      expect(p.en.length).toBeGreaterThan(0)
    }
  })

  it('every preset builds a map that passes the SHARED validator (zero conflicts)', () => {
    for (const p of MACRO_PRESETS) {
      const map = buildPresetMap(p.id)
      expect(validateGestureSceneMap(map), p.id).toEqual([])
      expect(validateMacroMap(map), p.id).toEqual([])
    }
  })

  it('presets differ from the default map and from each other on their signature cells', () => {
    const light = buildPresetMap('light-drive')
    const present = buildPresetMap('present')
    const party = buildPresetMap('party')
    // R306/T9 v1 signature: the migrated discrete gestures (dir8 + 张合)
    // light-drive steps brightness; present pages next on swipe / prev on 张合;
    // party fast-cycles curated on 张合
    expect(light.dir8.workspace.action).toBe('brightnessStep')
    expect(present.dir8.workspace.action).toBe('nextCurated')
    expect(present['double-pinch'].workspace.action).toBe('prevCurated')
    expect(party['double-pinch'].workspace.action).toBe('nextCurated')
    // default keeps everything none except chord-light → presets really change behavior
    expect(GESTURE_SCENE_MAP.dir8.workspace.action).toBe('none')
    // pinch/palm stay unclaimed in presets (their owners are analog/deferred)
    expect(party.pinch.workspace.action).toBe('none')
    expect(party.palm.workspace.action).toBe('none')
    // games scenes stay exempt in every preset (R131 games mapping owns them)
    for (const m of [light, present, party]) {
      expect(m.dir8.games.action).toBe('none')
      expect(m.pinch.games.action).toBe('none')
    }
  })

  it('persistence: round-trip through localStorage with default fallback', () => {
    // no stored map → the shipped default table
    expect(loadMacroMap()).toEqual(GESTURE_SCENE_MAP)
    const party = buildPresetMap('party')
    persistMacroMap(party)
    expect(loadMacroMap()).toEqual(party)
    // a damaged payload falls back to the default instead of crashing
    localStorage.setItem(MACRO_STORAGE_KEY, '{not json')
    expect(loadMacroMap()).toEqual(GESTURE_SCENE_MAP)
    // a map that fails validation is ALSO rejected (never apply a broken table)
    const broken: typeof party = JSON.parse(JSON.stringify(party))
    broken.pinch.workspace = { action: 'explode' as never, cooldownMs: 0, guard: 'always' }
    persistMacroMap(broken)
    expect(loadMacroMap()).toEqual(GESTURE_SCENE_MAP)
  })

  it('resolveMacro: cell lookup with a safe none fallback', () => {
    const present = buildPresetMap('present')
    expect(resolveMacro(present, 'dir8', 'workspace').action).toBe('nextCurated')
    expect(resolveMacro(present, 'chord-light', 'ai').action).toBe('openMenu')
    // unknown gesture/scene never throws — resolves to none
    expect(resolveMacro(present, 'nope', 'workspace').action).toBe('none')
    expect(resolveMacro(present, 'dir8', 'nope').action).toBe('none')
    expect(resolveMacro(present, 'dir8', 'games').action).toBe('none')
  })
})
