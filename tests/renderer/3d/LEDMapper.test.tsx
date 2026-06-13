// @vitest-environment happy-dom
// NOTE: LEDMapper uses Three.js + WebGL. happy-dom has no WebGL context, so
// the rendering tests are skipped. The component module is still loaded to
// verify the import surface.
import { describe, it, expect } from 'vitest'
import type { LedMap } from '../../../src/renderer/src/3d/useModelStore'

const sampleMap: LedMap = {
  model: 'test',
  device_type: 'strip',
  led_count: 2,
  leds: [
    { id: 0, position: [0, 0, 0], zone: 'A' },
    { id: 1, position: [1, 0, 0], zone: 'B' }
  ]
}

describe('renderer/3d/LEDMapper', () => {
  it.skip('renders without crashing when no map is given', () => {})
  it.skip('renders LED count from the map', () => {})
  it.skip('invokes onChange when an LED position is edited', () => {})
  it.skip('allows adding a new LED', () => {})

  it('module exports the component symbol', async () => {
    const mod = await import('../../../src/renderer/src/3d/LEDMapper')
    expect(typeof mod.LEDMapper).toBe('function')
  })

  it('sampleMap type-shape is well-formed', () => {
    expect(sampleMap.leds).toHaveLength(2)
    expect(sampleMap.leds[0].position).toEqual([0, 0, 0])
    expect(sampleMap.leds[1].zone).toBe('B')
  })
})
