// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { PreviewGrid } from '../../../src/renderer/src/components/PreviewGrid'
import { setupRendererMocks } from '../_helpers'
import type { RgbFrame } from '../../../src/shared/types'

beforeEach(() => {
  setupRendererMocks()
  cleanup()
})

function makeFrame(cols: number, rows: number, fill: [number, number, number] = [0, 0, 0]): RgbFrame {
  const pixels = new Uint8ClampedArray(cols * rows * 3)
  for (let i = 0; i < cols * rows; i++) {
    pixels[i * 3] = fill[0]
    pixels[i * 3 + 1] = fill[1]
    pixels[i * 3 + 2] = fill[2]
  }
  return { columns: cols, rows, pixels, generatedAt: 0 }
}

describe('renderer/components/PreviewGrid', () => {
  it('renders a canvas element', () => {
    const { container } = render(<PreviewGrid frameRef={{ current: null }} />)
    const canvas = container.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
  })

  it('invokes onRippleClick with normalised (0..1) coordinates when clicked', () => {
    const onRippleClick = vi.fn()
    const { container } = render(
      <PreviewGrid frameRef={{ current: null }} onRippleClick={onRippleClick} />
    )
    const canvas = container.querySelector('canvas')!
    // 200x100 canvas, click at (100, 50) → (0.5, 0.5)
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ x: 0, y: 0, width: 200, height: 100, top: 0, left: 0, right: 200, bottom: 100, toJSON: () => '' })
    })
    fireEvent.click(canvas, { clientX: 100, clientY: 50 })
    expect(onRippleClick).toHaveBeenCalledWith(0.5, 0.5)
  })

  it('clamps onRippleClick to [0, 1]', () => {
    const onRippleClick = vi.fn()
    const { container } = render(
      <PreviewGrid frameRef={{ current: null }} onRippleClick={onRippleClick} />
    )
    const canvas = container.querySelector('canvas')!
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ x: 0, y: 0, width: 200, height: 100, top: 0, left: 0, right: 200, bottom: 100, toJSON: () => '' })
    })
    fireEvent.click(canvas, { clientX: -50, clientY: -50 })
    expect(onRippleClick).toHaveBeenCalledWith(0, 0)
  })

  it('renders a frame ref without throwing when frame is set', () => {
    const frameRef = { current: makeFrame(2, 2, [255, 0, 0]) }
    const { container } = render(<PreviewGrid frameRef={frameRef} />)
    expect(container.querySelector('canvas')).toBeInTheDocument()
  })

  it('applies displayCount prop to draw vertical boundaries', () => {
    const { container } = render(
      <PreviewGrid frameRef={{ current: null }} displayCount={3} />
    )
    expect(container.querySelector('canvas')).toBeInTheDocument()
  })
})


// ── R271: hover GPU 预览不得泄漏到实体屏(suppressOverlayPost) ────────────
describe('PreviewGrid GPU overlay 泄漏防护 (R271)', () => {
  const posts: unknown[] = []
  class ChannelMock {
    postMessage(m: unknown) { posts.push(m) }
    close() {}
    addEventListener() {}
    removeEventListener() {}
  }
  vi.mock('../../../src/renderer/src/gl/effectGl', () => ({
    EFFECT2D_CHANNEL: 'rgbbox-effect2d',
    EffectGl: class { render() { return true } ; dispose() {} },
  }))

  beforeEach(() => {
    posts.length = 0
    vi.useFakeTimers()
    // happy-dom 的 rAF 不自驱动——桥到 fake setTimeout 后由 advanceTimersByTime 推帧
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) =>
      window.setTimeout(() => cb(performance.now()), 16) as unknown as number)
    vi.stubGlobal('BroadcastChannel', ChannelMock)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const gpuLayer = { id: 'x', kind: 'wave', enabled: true, parameters: {} } as never

  it('suppressOverlayPost 缺省 → GPU 帧照常 postMessage 到 overlay 通道', async () => {
    render(<PreviewGrid frameRef={{ current: null }} gpuLayer={gpuLayer} />)
    await act(async () => { vi.advanceTimersByTime(80) }) // ~5 帧
    expect(posts.length).toBeGreaterThan(0)
  })

  it('suppressOverlayPost=true(hover 预览) → 零 postMessage(实体屏不收未选效果)', async () => {
    render(<PreviewGrid frameRef={{ current: null }} gpuLayer={gpuLayer} suppressOverlayPost />)
    await act(async () => { vi.advanceTimersByTime(80) })
    expect(posts.length).toBe(0)
  })
})
