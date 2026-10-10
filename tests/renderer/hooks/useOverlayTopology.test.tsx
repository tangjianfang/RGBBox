// @vitest-environment happy-dom
// R273 overlay 开关结果回读——open/close 返回 false 时不得乐观更新本地态。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOverlayTopology } from '../../../src/renderer/src/hooks/domains/useOverlayTopology'

const rgbboxMock = {
  openOverlay: vi.fn<() => Promise<boolean>>(),
  closeOverlay: vi.fn<() => Promise<boolean>>(),
  setOverlayConfig: vi.fn(),
  onPerfSelfTestToggleOverlay: vi.fn(() => () => {}),
  onOverlayEffectChanged: vi.fn(() => () => {}),
  onOverlayClosed: vi.fn(() => () => {}),
  onDisplayTopologyChanged: vi.fn(() => () => {}),
  getDisplayTopology: vi.fn(async () => ({ displays: [], virtualBounds: { x: 0, y: 0, width: 0, height: 0 } })),
}

describe('hooks/domains/useOverlayTopology 结果回读 (R273)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    Object.assign(rgbboxMock, {
      openOverlay: vi.fn(async () => true),
      closeOverlay: vi.fn(async () => true),
      setOverlayConfig: vi.fn(),
      onPerfSelfTestToggleOverlay: vi.fn(() => () => {}),
      onOverlayEffectChanged: vi.fn(() => () => {}),
      onOverlayClosed: vi.fn(() => () => {}),
      onDisplayTopologyChanged: vi.fn(() => () => {}),
      getDisplayTopology: vi.fn(async () => ({ displays: [], virtualBounds: { x: 0, y: 0, width: 0, height: 0 } })),
    })
    ;(window as unknown as { rgbbox: unknown }).rgbbox = rgbboxMock
    window.localStorage.clear()
  })

  it('open 返回 true → id 入列(正常路径)', async () => {
    const { result } = renderHook(() => useOverlayTopology({ setTopology: () => {}, selectEffect: () => {} }))
    await act(async () => { await result.current.handleToggleOverlay(2) })
    expect(result.current.overlayDisplayIds).toContain(2)
  })

  it('open 返回 false(主进程开窗失败) → 本地态不加入(无幻影「已激活」)', async () => {
    rgbboxMock.openOverlay.mockResolvedValue(false)
    const { result } = renderHook(() => useOverlayTopology({ setTopology: () => {}, selectEffect: () => {} }))
    await act(async () => { await result.current.handleToggleOverlay(3) })
    expect(result.current.overlayDisplayIds).not.toContain(3)
  })

  it('close 返回 false → 本地态保留(下次可重试;不假装已关)', async () => {
    const { result } = renderHook(() => useOverlayTopology({ setTopology: () => {}, selectEffect: () => {} }))
    await act(async () => { await result.current.handleToggleOverlay(4) }) // open true
    rgbboxMock.closeOverlay.mockResolvedValue(false)
    await act(async () => { await result.current.handleToggleOverlay(4) })
    expect(result.current.overlayDisplayIds).toContain(4)
  })
})
