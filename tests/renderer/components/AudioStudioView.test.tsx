// @vitest-environment happy-dom
// NOTE: AudioStudioView uses Three.js + WebGL for the 3D visualisation.
// happy-dom has no WebGL context, so the rendering tests are skipped.
// The audio capture / save logic is exercised indirectly through the
// useAudioAnalyzer hook tests in tests/renderer/hooks/.
import { describe, it, expect } from 'vitest'

describe('renderer/components/AudioStudioView', () => {
  it.skip('renders the audio studio header', () => {})
  it.skip('renders control buttons', () => {})
  it.skip('renders without source selected (empty state)', () => {})
  it.skip('handles a saved source list', () => {})

  it('module exports the component symbol', async () => {
    const mod = await import('../../../src/renderer/src/components/AudioStudioView')
    expect(typeof mod.AudioStudioView).toBe('function')
  })
})
