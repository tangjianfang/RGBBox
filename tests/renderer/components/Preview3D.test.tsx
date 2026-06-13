// @vitest-environment happy-dom
// NOTE: Preview3D uses Three.js + WebGL. happy-dom has no WebGL context, so
// the rendering tests are skipped — the actual WebGL pipeline is verified by
// tests/renderer/gl/previewGl.test.ts (headless GL).
import { describe, it, expect } from 'vitest'

describe('renderer/components/Preview3D', () => {
  it.skip('renders a canvas element', () => {})
  it.skip('does not throw when a frame is provided', () => {})
  it.skip('renders the container div', () => {})

  it('module exports the component symbol', async () => {
    const mod = await import('../../../src/renderer/src/components/Preview3D')
    expect(typeof mod.Preview3D).toBe('function')
  })
})
