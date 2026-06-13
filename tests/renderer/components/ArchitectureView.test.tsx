// @vitest-environment happy-dom
// NOTE: ArchitectureView uses Three.js + WebGL. happy-dom has no WebGL
// context, so the smoke tests here are skipped — full 3D rendering is
// covered by tests/renderer/gl/previewGl.test.ts (headless GL) and
// E2E tests (R13). The component file is loaded just to assert the import
// shape and prop surface.
import { describe, it, expect } from 'vitest'

describe('renderer/components/ArchitectureView', () => {
  it.skip('renders the architecture view container', () => {})
  it.skip('has a canvas or 3D container element', () => {})
  it.skip('subscribes to topology changes for live updates', () => {})

  it('module exports the component symbol', async () => {
    const mod = await import('../../../src/renderer/src/components/ArchitectureView')
    expect(typeof mod.ArchitectureView).toBe('function')
  })
})
