// @vitest-environment happy-dom
// NOTE: SplatViewer uses Three.js + WebGL. happy-dom has no WebGL context, so
// the rendering tests are skipped. The module is loaded to verify the import
// surface.
import { describe, it, expect } from 'vitest'

describe('renderer/3d/SplatViewer', () => {
  it.skip('renders without crashing when no model is given', () => {})
  it.skip('renders without crashing with a file:// URL', () => {})
  it.skip('renders without crashing with a blob: URL', () => {})
  it.skip('subscribes to download progress for the active model', () => {})

  it('module exports the component symbol', async () => {
    const mod = await import('../../../src/renderer/src/3d/SplatViewer')
    expect(typeof mod.SplatViewer).toBe('function')
  })
})
