import { describe, expect, it } from 'vitest'
import { activeLayer, activeScene, formatMs, reconcileSelectedLayerId, updateLayer } from '../../../src/renderer/src/domain/profileUtils'
import type { Profile } from '../../../src/shared/types'

function profile(): Profile {
  return {
    id: 'p', name: 'P', activeSceneId: 's2',
    scenes: [
      {
        id: 's1', name: 'S1',
        layers: [
          { id: 'A', name: 'a', kind: 'rainbow', enabled: true, parameters: {}, opacity: 1, blendMode: 'normal' },
        ],
      },
      {
        id: 's2', name: 'S2',
        layers: [
          { id: 'B', name: 'b', kind: 'fire', enabled: false, parameters: { speed: 1 }, opacity: 1, blendMode: 'normal' },
          { id: 'C', name: 'c', kind: 'aurora', enabled: true, parameters: { speed: 2 }, opacity: 1, blendMode: 'normal' },
        ],
      },
    ],
  } as unknown as Profile
}

describe('domain/profileUtils activeScene/activeLayer (R147 P1)', () => {
  it('activeScene resolves by activeSceneId, falling back to the first scene', () => {
    expect(activeScene(profile()).id).toBe('s2')
    const broken = { ...profile(), activeSceneId: 'missing' } as Profile
    expect(activeScene(broken).id).toBe('s1')
  })

  it('activeLayer prefers the first enabled layer, falling back to the first', () => {
    expect(activeLayer(profile()).id).toBe('C')
    const noneEnabled = profile()
    noneEnabled.scenes[1].layers[1].enabled = false
    expect(activeLayer(noneEnabled).id).toBe('B')
  })
})

describe('domain/profileUtils updateLayer (R147 P1)', () => {
  it('patches only the target layer inside the ACTIVE scene', () => {
    const base = profile()
    const next = updateLayer(base, 'C', { opacity: 0.5 })
    expect(next.scenes[1].layers[1].opacity).toBe(0.5)
    expect(next.scenes[1].layers[0].opacity).toBe(1) // sibling untouched
    expect(next.scenes[0].layers[0].opacity).toBe(1) // other scene untouched
    expect(base.scenes[1].layers[1].opacity).toBe(1) // input not mutated
  })
})

describe('domain/profileUtils formatMs (R147 P1)', () => {
  it('formats with one decimal and defaults missing values to 0', () => {
    expect(formatMs(1.234)).toBe('1.2 ms')
    expect(formatMs(undefined)).toBe('0.0 ms')
  })
})

describe('domain/profileUtils reconcileSelectedLayerId (R166)', () => {
  it('returns null for a valid id (no rewrite)', () => {
    const s = activeScene(profile())
    expect(reconcileSelectedLayerId(s, 'C')).toBeNull()
  })

  it('falls back to the first ENABLED layer when the id is stale', () => {
    const s = activeScene(profile()) // layers: B(disabled), C(enabled)
    expect(reconcileSelectedLayerId(s, 'layer-rainbow')).toBe('C')
  })

  it('falls back to the first layer when every layer is disabled', () => {
    const s = { ...activeScene(profile()), layers: activeScene(profile()).layers.map((l) => ({ ...l, enabled: false })) }
    expect(reconcileSelectedLayerId(s, 'layer-rainbow')).toBe('B')
  })

  it('returns null for an empty/missing scene (nothing to reconcile)', () => {
    expect(reconcileSelectedLayerId(null, 'x')).toBeNull()
    expect(reconcileSelectedLayerId(undefined, 'x')).toBeNull()
    expect(reconcileSelectedLayerId({ ...activeScene(profile()), layers: [] }, 'x')).toBeNull()
  })
})
