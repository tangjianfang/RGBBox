import { describe, expect, it } from 'vitest'
import {
  AUTOMATION_TARGET_PARAMS,
  applyParameterAutomation,
  automateNumberParameter,
  automationWave,
  parseStoredAutomationParams,
} from '../../../src/renderer/src/domain/automation'
import type { Profile } from '../../../src/shared/types'

describe('domain/automation automationWave (R147 P1)', () => {
  it('sine maps 0 → mid (0.5) and quarter-period → 1', () => {
    expect(automationWave(0, 'sine')).toBeCloseTo(0.5)
    expect(automationWave(Math.PI / 2 / 1.1, 'sine')).toBeCloseTo(1)
  })

  it('triangle ramps 0→1 across the first half-phase', () => {
    // phase = (now * 0.18) % 1; pick now so phase = 0.25 → wave 0.5
    expect(automationWave(0, 'triangle')).toBe(0)
    expect(automationWave(0.25 / 0.18, 'triangle')).toBeCloseTo(0.5)
    expect(automationWave(0.75 / 0.18, 'triangle')).toBeCloseTo(0.5)
  })

  it('pulse snaps to 1 above the 0.68 gate and 0.15 below it', () => {
    expect(automationWave(0, 'pulse')).toBe(0.15) // phase 0
    expect(automationWave(Math.PI / 2 / 2.4, 'pulse')).toBe(1) // phase peak
  })
})

describe('domain/automation automateNumberParameter (R147 P1)', () => {
  it('is deterministic for a given wave value (sine mid at now=0)', () => {
    // speed: min 0, max 2, step 0.05, base 1 → span 0.56 → [0.44, 1.56];
    // wave(0)=0.5 → 0.44 + 1.12*0.5 = 1.0 → snap(1.0, 0.05) = 1
    expect(automateNumberParameter('speed', 1, 'sine', 0)).toBeCloseTo(1)
    // wave at the sine peak = 1 → high end → snap→1.55 clamped back to min 1.56
    expect(automateNumberParameter('speed', 1, 'sine', Math.PI / 2 / 1.1)).toBeCloseTo(1.56)
  })

  it('hueShift/angle automate across the FULL param range (not around base)', () => {
    // full-range midpoint at wave 0.5: hueShift [-180,180] → 0; angle [0,360] → 180
    expect(automateNumberParameter('hueShift', 0, 'sine', 0)).toBe(0)
    expect(automateNumberParameter('angle', 0, 'sine', 0)).toBe(180)
  })
})

describe('domain/automation applyParameterAutomation (R147 P1)', () => {
  const base: Profile = {
    id: 'p', name: 'P', activeSceneId: 's1',
    scenes: [
      {
        id: 's1', name: 'S1',
        layers: [
          { id: 'L1', name: 'l1', kind: 'rainbow', enabled: true, parameters: { speed: 1, color: '#fff', label: 'text' }, opacity: 1, blendMode: 'normal' },
          { id: 'L2', name: 'l2', kind: 'fire', enabled: false, parameters: { speed: 1 }, opacity: 1, blendMode: 'normal' },
        ],
      },
      { id: 's2', name: 'S2', layers: [{ id: 'L3', name: 'l3', kind: 'fire', enabled: true, parameters: { speed: 1 }, opacity: 1, blendMode: 'normal' }] },
    ],
  } as unknown as Profile

  it('returns the same instance when disabled or no automated params', () => {
    expect(applyParameterAutomation(base, 'L1', false, ['speed'], 'sine', 1)).toBe(base)
    expect(applyParameterAutomation(base, 'L1', true, [], 'sine', 1)).toBe(base)
  })

  it('only rewrites automated NUMERIC params on the target layer of the active scene', () => {
    // sine peak (wave=1) → speed automates to the high end (snap clamped to min) 1.56
    const next = applyParameterAutomation(base, 'L1', true, ['speed'], 'sine', Math.PI / 2 / 1.1)
    const s1l1 = next.scenes[0].layers[0].parameters
    expect(s1l1.speed).toBeCloseTo(1.56) // automated → changed
    expect(s1l1.color).toBe('#fff') // non-number untouched
    expect(s1l1.label).toBe('text')
    expect(next.scenes[0].layers[1].parameters.speed).toBe(1) // other layer untouched
    expect(next.scenes[1].layers[0].parameters.speed).toBe(1) // inactive scene untouched
    expect(base.scenes[0].layers[0].parameters.speed).toBe(1) // input not mutated
  })
})

describe('domain/automation parseStoredAutomationParams (R147 P1)', () => {
  it('falls back to [] and only keeps allowed target params', () => {
    expect(parseStoredAutomationParams(null)).toEqual([])
    expect(parseStoredAutomationParams('garbage')).toEqual([])
    expect(parseStoredAutomationParams('["speed","nope","speed","hueShift"]')).toEqual(['speed', 'hueShift'])
    expect(AUTOMATION_TARGET_PARAMS).toEqual(['speed', 'intensity', 'hueShift', 'angle'])
  })
})
