// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { AiLabSvgTab } from '../../../src/renderer/src/components/AiLabSvgTab'
import { setupRendererMocks } from '../_helpers'

// R171: the pelican-on-a-bicycle SVG tab renders a complete, animatable scene.

describe('AiLabSvgTab (R171)', () => {
  it('mounts the scene with sky, road, wheels, crank and pelican parts', () => {
    setupRendererMocks()
    const { container } = render(<AiLabSvgTab />)
    const svg = container.querySelector('svg.ai-svg-scene')
    expect(svg).not.toBeNull()
    // sky + sun + two drifting clouds
    expect(svg!.querySelector('rect[fill="url(#pelican-sky)"]')).not.toBeNull()
    expect(svg!.querySelector('.pelican-sun')).not.toBeNull()
    expect(svg!.querySelectorAll('.pelican-cloud').length).toBe(2)
    // scrolling road dashes
    expect(svg!.querySelector('.pelican-road')).not.toBeNull()
    // two wheels with spinning spoke groups + rotating crank
    expect(svg!.querySelectorAll('.pelican-spin').length).toBe(2)
    expect(svg!.querySelector('.pelican-crank')).not.toBeNull()
    // pelican body parts (bob group, wing, beak, eye)
    expect(svg!.querySelector('.pelican-bob')).not.toBeNull()
    expect(svg!.querySelector('.pelican-wing')).not.toBeNull()
    expect(svg!.querySelector('.pelican-pouch')).not.toBeNull()
    // caption line exists
    expect(container.querySelector('.ai-svg-caption')).not.toBeNull()
    cleanup()
  })

  it('spoke groups carry 8 spokes each (visual completeness)', () => {
    setupRendererMocks()
    const { container } = render(<AiLabSvgTab />)
    const svg = container.querySelector('svg.ai-svg-scene')!
    for (const spin of svg.querySelectorAll('.pelican-spin')) {
      expect(spin.querySelectorAll('line').length).toBe(8)
    }
    cleanup()
  })
})
