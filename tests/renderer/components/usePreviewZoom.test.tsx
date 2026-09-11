// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { usePreviewZoom } from '../../../src/renderer/src/components/video/usePreviewZoom'

// happy-dom 没有 ResizeObserver —— 注入 no-op mock（observe 不触发回调）
class MockRO {
  static last: MockRO | null = null
  cb: ResizeObserverCallback
  constructor(cb: ResizeObserverCallback) { this.cb = cb; MockRO.last = this }
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockRO

function setupWrap(w = 800, h = 600) {
  const el = document.createElement('div')
  Object.defineProperty(el, 'clientWidth', { value: w })
  Object.defineProperty(el, 'clientHeight', { value: h })
  document.body.appendChild(el)
  return { ref: { current: el }, el }
}

beforeEach(() => { MockRO.last = null })

describe('usePreviewZoom', () => {
  it('starts in fit mode', () => {
    const { ref } = setupWrap()
    const { result } = renderHook(() => usePreviewZoom(ref))
    expect(result.current.mode).toBe('fit')
    expect(result.current.layerStyle.transform).toBe('none')
  })

  it('derives fitScale and contentRect from native size (800×600 wrap, 1920×1080 video)', () => {
    const { ref } = setupWrap()
    const { result } = renderHook(() => usePreviewZoom(ref))
    act(() => { result.current.setNativeSize({ w: 1920, h: 1080 }) })
    expect(result.current.fitScale).toBeCloseTo(800 / 1920, 5)
    expect(result.current.percent).toBe(Math.round((800 / 1920) * 100))
    expect(result.current.contentRect.w).toBeCloseTo(800, 0)
    expect(result.current.contentRect.h).toBeCloseTo(450, 0)
  })

  it('zoomBy switches to free mode and clamps within [0.1, 8]', () => {
    const { ref } = setupWrap()
    const { result } = renderHook(() => usePreviewZoom(ref))
    act(() => { result.current.setNativeSize({ w: 1920, h: 1080 }) })
    act(() => { result.current.zoomBy(1.1) })
    expect(result.current.mode).toBe('free')
    const s1 = result.current.absScale
    act(() => { result.current.zoomBy(1 / 1.1) })
    expect(result.current.absScale).toBeCloseTo(s1 / 1.1, 5)
    for (let i = 0; i < 60; i++) act(() => { result.current.zoomBy(1.5) })
    expect(result.current.absScale).toBe(8)
  })

  it('oneToOne sets absScale=1 centered; reset returns to fit', () => {
    const { ref } = setupWrap()
    const { result } = renderHook(() => usePreviewZoom(ref))
    act(() => { result.current.setNativeSize({ w: 1920, h: 1080 }) })
    act(() => { result.current.oneToOne() })
    expect(result.current.absScale).toBe(1)
    expect(result.current.percent).toBe(100)
    expect(String(result.current.layerStyle.transform)).toContain('translate')
    act(() => { result.current.reset() })
    expect(result.current.mode).toBe('fit')
    expect(result.current.layerStyle.transform).toBe('none')
  })

  it('attaches non-passive wheel listener that zooms on ctrl+wheel only', () => {
    const { ref, el } = setupWrap()
    const addSpy = vi.spyOn(el, 'addEventListener')
    const { result } = renderHook(() => usePreviewZoom(ref))
    const call = addSpy.mock.calls.find(c => c[0] === 'wheel')
    expect(call).toBeTruthy()
    expect((call![2] as AddEventListenerOptions).passive).toBe(false)
    act(() => { result.current.setNativeSize({ w: 1920, h: 1080 }) })
    // happy-dom 的 WheelEvent 构造器不映射 ctrlKey（实测 undefined）——手动补上
    const ev = new WheelEvent('wheel', { deltaY: -100, clientX: 400, clientY: 300, cancelable: true })
    Object.defineProperty(ev, 'ctrlKey', { value: true })
    el.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    // 无 ctrl 不拦截（留给未来滚动类交互）
    const plain = new WheelEvent('wheel', { deltaY: -100, cancelable: true })
    el.dispatchEvent(plain)
    expect(plain.defaultPrevented).toBe(false)
  })
})
