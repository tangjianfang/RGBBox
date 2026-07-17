import { describe, it, expect } from 'vitest'
import { resolveTargetDisplayAspect } from '../../src/engine/targetDisplayAspect'
import type { DisplayTopology } from '../../src/shared/types'

function makeTopology(displays: DisplayTopology['displays'], virtualBounds: DisplayTopology['virtualBounds']): DisplayTopology {
  return { platform: 'windows', displays, virtualBounds, detectedAt: new Date().toISOString() }
}

describe('engine/targetDisplayAspect', () => {
  it('falls back to 16/9 when topology is null', () => {
    expect(resolveTargetDisplayAspect(null, [], false)).toBeCloseTo(16 / 9)
  })

  it('uses the virtual desktop aspect ratio in linked-display mode, ignoring overlayDisplayIds', () => {
    const topology = makeTopology(
      [
        { id: 1, label: 'A', bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1, rotation: 0, primary: true },
        { id: 2, label: 'B', bounds: { x: 1920, y: 0, width: 1080, height: 1920 }, workArea: { x: 1920, y: 0, width: 1080, height: 1920 }, scaleFactor: 1, rotation: 0, primary: false },
      ],
      { x: 0, y: 0, width: 3000, height: 1920 }
    )
    expect(resolveTargetDisplayAspect(topology, [2], true)).toBeCloseTo(3000 / 1920)
  })

  it('uses the single active non-primary overlay display real aspect ratio, not the primary display', () => {
    const topology = makeTopology(
      [
        { id: 1, label: 'Primary 16:9', bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1, rotation: 0, primary: true },
        { id: 2, label: 'Secondary 21:9', bounds: { x: 1920, y: 0, width: 2560, height: 1080 }, workArea: { x: 1920, y: 0, width: 2560, height: 1080 }, scaleFactor: 1, rotation: 0, primary: false },
      ],
      { x: 0, y: 0, width: 4480, height: 1080 }
    )
    // The user has ONE overlay open, on the non-primary secondary display.
    expect(resolveTargetDisplayAspect(topology, [2], false)).toBeCloseTo(2560 / 1080)
    // Sanity: this must NOT equal the primary display's aspect ratio (the old buggy behaviour).
    expect(resolveTargetDisplayAspect(topology, [2], false)).not.toBeCloseTo(1920 / 1080, 2)
  })

  it('falls back to the primary display aspect ratio when zero overlays are active', () => {
    const topology = makeTopology(
      [
        { id: 1, label: 'Primary', bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1, rotation: 0, primary: true },
        { id: 2, label: 'Secondary', bounds: { x: 1920, y: 0, width: 2560, height: 1080 }, workArea: { x: 1920, y: 0, width: 2560, height: 1080 }, scaleFactor: 1, rotation: 0, primary: false },
      ],
      { x: 0, y: 0, width: 4480, height: 1080 }
    )
    expect(resolveTargetDisplayAspect(topology, [], false)).toBeCloseTo(1920 / 1080)
  })

  it('falls back to the primary display aspect ratio when multiple overlays are active (no single unambiguous target)', () => {
    const topology = makeTopology(
      [
        { id: 1, label: 'Primary', bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1, rotation: 0, primary: true },
        { id: 2, label: 'Secondary', bounds: { x: 1920, y: 0, width: 2560, height: 1080 }, workArea: { x: 1920, y: 0, width: 2560, height: 1080 }, scaleFactor: 1, rotation: 0, primary: false },
      ],
      { x: 0, y: 0, width: 4480, height: 1080 }
    )
    expect(resolveTargetDisplayAspect(topology, [1, 2], false)).toBeCloseTo(1920 / 1080)
  })

  it('falls back to the primary display aspect ratio when the single active overlay id is not found in topology', () => {
    const topology = makeTopology(
      [
        { id: 1, label: 'Primary', bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1, rotation: 0, primary: true },
      ],
      { x: 0, y: 0, width: 1920, height: 1080 }
    )
    expect(resolveTargetDisplayAspect(topology, [999], false)).toBeCloseTo(1920 / 1080)
  })
})
