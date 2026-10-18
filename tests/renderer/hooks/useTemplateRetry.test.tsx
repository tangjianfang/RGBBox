// @vitest-environment happy-dom
// R307: useTemplateRetry — a public-template fetch that RECOVERS. Auto
// backoff (2s/6s/15s), immediate retry when the network comes back, manual
// retry(), success cached to the caller's module box, teardown clean.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useTemplateRetry } from '../../../src/renderer/src/hooks/useTemplateRetry'

const box = <T,>(v: T | null = null): { current: T | null } => ({ current: v })

beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('hooks/useTemplateRetry (R307)', () => {
  it('fails once → error state → backoff retry succeeds → value set + cache written, no further fetches', async () => {
    const cache = box<number>()
    let calls = 0
    const fetcher = vi.fn(async () => {
      calls++
      if (calls === 1) throw new Error('network down')
      return 42
    })
    const { result } = renderHook(() => useTemplateRetry({ cache, fetcher }))
    // first failure lands in error state (visible immediately, not swallowed)
    // — flush microtasks WITHOUT firing the pending 2s backoff timer
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.failed).toBe(true)
    expect(result.current.value).toBeNull()
    // 2s backoff → second attempt succeeds
    await act(async () => { await vi.advanceTimersByTimeAsync(2100) })
    expect(result.current.value).toBe(42)
    expect(result.current.failed).toBe(false)
    expect(cache.current).toBe(42)
    // converged: no more fetches even after long waits
    await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('exhausts 2s/6s/15s backoff, then a window online event retries immediately and succeeds', async () => {
    const cache = box<number>()
    let calls = 0
    const fetcher = vi.fn(async () => {
      calls++
      if (calls <= 4) throw new Error('still down') // 1 initial + 3 backoff retries
      return 7
    })
    const { result } = renderHook(() => useTemplateRetry({ cache, fetcher }))
    await act(async () => { await vi.advanceTimersByTimeAsync(23001) })
    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(result.current.failed).toBe(true)
    // network comes back → immediate retry (no 15s+ wait for another timer)
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await vi.runOnlyPendingTimersAsync()
    })
    expect(fetcher).toHaveBeenCalledTimes(5)
    expect(result.current.value).toBe(7)
    expect(result.current.failed).toBe(false)
  })

  it('manual retry() restarts the chain after exhaustion', async () => {
    const cache = box<number>()
    const fetcher = vi.fn(async () => { throw new Error('down') })
    const { result } = renderHook(() => useTemplateRetry({ cache, fetcher }))
    await act(async () => { await vi.advanceTimersByTimeAsync(23001) })
    expect(result.current.failed).toBe(true)
    fetcher.mockResolvedValue(9)
    await act(async () => { result.current.retry() })
    await act(async () => { await vi.runOnlyPendingTimersAsync() })
    expect(result.current.value).toBe(9)
    expect(cache.current).toBe(9)
  })

  it('a filled cache short-circuits — zero fetches, value served instantly', async () => {
    const cache = box(['cached'])
    const fetcher = vi.fn(async () => { throw new Error('must not be called') })
    const { result } = renderHook(() => useTemplateRetry({ cache, fetcher }))
    expect(result.current.value).toEqual(['cached'])
    expect(result.current.failed).toBe(false)
    await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('enabled:false never fetches; flipping it on starts the chain', async () => {
    const cache = box<number>()
    const fetcher = vi.fn(async () => 5)
    const { result, rerender } = renderHook(({ enabled }: { enabled: boolean }) => useTemplateRetry({ cache, fetcher, enabled }), { initialProps: { enabled: false } })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(fetcher).not.toHaveBeenCalled()
    rerender({ enabled: true })
    await act(async () => { await vi.runOnlyPendingTimersAsync() })
    expect(result.current.value).toBe(5)
  })

  it('unmount stops timers and listeners — no state writes after teardown, no crash', async () => {
    const cache = box<number>()
    const fetcher = vi.fn(async () => { throw new Error('down') })
    const { unmount } = renderHook(() => useTemplateRetry({ cache, fetcher }))
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) }) // one failure + a pending timer
    expect(() => unmount()).not.toThrow()
    // firing timers/events after unmount must not touch React state
    await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
    expect(() => { window.dispatchEvent(new Event('online')) }).not.toThrow()
  })
})
