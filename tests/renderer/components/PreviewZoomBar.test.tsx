// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { PreviewZoomBar } from '../../../src/renderer/src/components/video/PreviewZoomBar'
import { setupRendererMocks } from '../_helpers'

beforeEach(() => { setupRendererMocks(); cleanup() })

describe('PreviewZoomBar', () => {
  it('renders percent and fires all four callbacks', () => {
    const onZoomIn = vi.fn(), onZoomOut = vi.fn(), onReset = vi.fn(), onOneToOne = vi.fn()
    const { container } = render(
      <PreviewZoomBar percent={137} onZoomIn={onZoomIn} onZoomOut={onZoomOut}
        onReset={onReset} onOneToOne={onOneToOne} disabled={false} />,
    )
    expect(container.querySelector('.video-zoom-pct')?.textContent).toBe('137%')
    const btns = container.querySelectorAll('.video-zoom-btn')
    expect(btns.length).toBe(4)
    fireEvent.click(btns[0]); expect(onZoomOut).toHaveBeenCalledTimes(1)
    fireEvent.click(btns[1]); expect(onZoomIn).toHaveBeenCalledTimes(1)
    fireEvent.click(btns[2]); expect(onReset).toHaveBeenCalledTimes(1)
    fireEvent.click(btns[3]); expect(onOneToOne).toHaveBeenCalledTimes(1)
  })

  it('disables all buttons when disabled', () => {
    const { container } = render(
      <PreviewZoomBar percent={100} onZoomIn={() => {}} onZoomOut={() => {}}
        onReset={() => {}} onOneToOne={() => {}} disabled />,
    )
    container.querySelectorAll('.video-zoom-btn').forEach(b => expect((b as HTMLButtonElement).disabled).toBe(true))
  })
})
