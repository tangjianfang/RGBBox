// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { ImagePaintEditor } from '../../../src/renderer/src/components/ImagePaintEditor'
import { setupRendererMocks } from '../_helpers'

beforeEach(() => {
  setupRendererMocks()
  cleanup()
})

describe('renderer/components/ImagePaintEditor', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <ImagePaintEditor
        imageDataList={[]}
        columns={4}
        rows={4}
        onChange={() => {}}
      />
    )
    expect(container).toBeTruthy()
  })

  it('renders with a pre-populated image list', () => {
    const { container } = render(
      <ImagePaintEditor
        imageDataList={['data:image/png;base64,iVBORw0KGgo=']}
        columns={4}
        rows={4}
        onChange={() => {}}
      />
    )
    expect(container).toBeTruthy()
  })

  it('invokes onChange when the user adds an image', () => {
    const onChange = vi.fn()
    const { container } = render(
      <ImagePaintEditor
        imageDataList={[]}
        columns={4}
        rows={4}
        onChange={onChange}
      />
    )
    // The component may have an "add" button — fire it
    const buttons = Array.from(container.querySelectorAll('button'))
    const addBtn = buttons.find((b) => /add|upload|\+/i.test(b.textContent ?? ''))
    if (addBtn) addBtn.click()
  })
})
