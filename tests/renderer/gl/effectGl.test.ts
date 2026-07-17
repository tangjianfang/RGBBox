// @vitest-environment node
// effectGl.ts contains the 2D GPU-direct shader renderer used by the in-app
// RGB virtual canvas preview. R67 requires fullscreen overlays to receive the
// same shader state so they can render at native display resolution instead of
// falling back to the low-resolution LED-grid RgbFrame path.

import { describe, expect, it } from 'vitest'
import type { EffectLayer } from '../../../src/shared/types'
import type { Effect2DMessage } from '../../../src/renderer/src/gl/effectGl'

describe('renderer/gl/effectGl overlay channel', () => {
  it('exports the 2D GPU-direct overlay broadcast channel name', async () => {
    const mod = await import('../../../src/renderer/src/gl/effectGl')

    expect(mod.EFFECT2D_CHANNEL).toBe('rgbbox-2d-effect')
  })

  it('carries the full effect layer and render timestamp for overlay re-rendering', () => {
    const layer: EffectLayer = {
      id: 'layer-rainbow',
      name: 'Rainbow',
      kind: 'rainbow',
      enabled: true,
      opacity: 1,
      blendMode: 'normal',
      parameters: { speed: 0.5, spread: 1.2, hueShift: 0, angle: 0 },
    }

    const message: Effect2DMessage = { layer, t: 12.5 }

    expect(message.layer.kind).toBe('rainbow')
    expect(message.t).toBe(12.5)
  })
})
