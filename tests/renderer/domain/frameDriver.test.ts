// @vitest-environment happy-dom
// R270 frameDriver — rAF 停摆修复的调度器单测(纯 DOM 计时器,无 GL)。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { startFrameDriver, stopFrameDriver, FRAME_DRIVER_INTERVAL_MS } from '../../../src/renderer/src/domain/frameDriver'

describe('domain/frameDriver (R270)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('startFrameDriver 走 setTimeout(16ms) 而非 rAF——最小化不停摆', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame')
    const sto = vi.spyOn(window, 'setTimeout')
    const cb = vi.fn()
    startFrameDriver(cb)
    expect(sto).toHaveBeenCalledWith(cb, FRAME_DRIVER_INTERVAL_MS)
    expect(raf).not.toHaveBeenCalled()
    vi.advanceTimersByTime(16)
    expect(cb).toHaveBeenCalledOnce()
    raf.mockRestore(); sto.mockRestore()
  })

  it('stopFrameDriver 清除定时器;null 句柄安全', () => {
    const cb = vi.fn()
    const handle = startFrameDriver(cb)
    stopFrameDriver(handle)
    vi.advanceTimersByTime(50)
    expect(cb).not.toHaveBeenCalled()
    expect(() => stopFrameDriver(null)).not.toThrow()
  })

  it('自调度链:循环体再续驱动,连续帧推进', () => {
    let frames = 0
    const loop = () => { frames += 1; if (frames < 3) startFrameDriver(loop) }
    startFrameDriver(loop)
    vi.advanceTimersByTime(100)
    expect(frames).toBe(3)
  })
})
