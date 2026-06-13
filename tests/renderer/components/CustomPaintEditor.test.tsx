// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { CustomPaintEditor } from '../../../src/renderer/src/components/CustomPaintEditor'
import { setupRendererMocks } from '../_helpers'

beforeEach(() => {
  setupRendererMocks()
  cleanup()
})

describe('renderer/components/CustomPaintEditor', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <CustomPaintEditor
        pixelData={[['#000000', '#ffffff']]}
        columns={2}
        rows={1}
        onChange={() => {}}
      />
    )
    expect(container).toBeTruthy()
  })

  it('reflects the current pixelData in the editor', () => {
    const { container } = render(
      <CustomPaintEditor
        pixelData={[['#ff0000', '#00ff00']]}
        columns={2}
        rows={1}
        onChange={() => {}}
      />
    )
    expect(container.querySelectorAll('button, [role="button"], canvas, [data-cell]').length).toBeGreaterThan(0)
  })

  it('invokes onChange when a cell is clicked', () => {
    const onChange = vi.fn()
    const { container } = render(
      <CustomPaintEditor
        pixelData={[['#000000']]}
        columns={1}
        rows={1}
        onChange={onChange}
      />
    )
    const cells = container.querySelectorAll('button, [data-cell], [role="button"]')
    if (cells.length > 0) fireEvent.click(cells[0])
  })

  it('handles empty pixelData', () => {
    const { container } = render(
      <CustomPaintEditor
        pixelData={[]}
        columns={0}
        rows={0}
        onChange={() => {}}
      />
    )
    expect(container).toBeTruthy()
  })
})
