// R307: useTemplateRetry — a public-template fetch that RECOVERS.
//
// The AI8 model lists (chat/draw/agent) are one-shot fetches that used to
// die on the first network blip: the picker showed「模型列表加载失败」and
// nothing retried while the user was looking at it (the only recovery was
// leaving the tab and coming back — invisible to the user).
//
// This hook owns the recovery policy once and for all:
//   - failure → error state immediately (visible, not swallowed)
//   - auto backoff retry at 2s / 6s / 15s
//   - `window online` (network came back) → immediate retry, timer cleared
//   - manual retry() restarts the chain (the picker renders a 重试 button)
//   - success writes the caller-owned MODULE cache (one fetch per app
//     session stays true); a failure keeps the cache empty
//   - unmount stops timers + listeners — never writes state after teardown
import { useCallback, useEffect, useRef, useState } from 'react'

export const TEMPLATE_RETRY_BACKOFF_MS = [2000, 6000, 15000]

export interface TemplateRetryState<T> {
  value: T | null
  /** true while the latest attempt failed (the picker shows the error + 重试) */
  failed: boolean
  /** manual restart of the whole chain — no-op once the cache is filled */
  retry: () => void
}

export function useTemplateRetry<T>(opts: {
  /** caller-owned module-level cache box ({ current }) — success is written here */
  cache: { current: T | null }
  /** performs the fetch; must reject on failure */
  fetcher: () => Promise<T>
  /** gate the chain (e.g. an ai8:// profile is active); default true */
  enabled?: boolean
}): TemplateRetryState<T> {
  const enabled = opts.enabled !== false
  const [value, setValue] = useState<T | null>(() => opts.cache.current)
  const [failed, setFailed] = useState(false)
  const [seq, setSeq] = useState(0)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false }
  }, [])

  useEffect(() => {
    if (!enabled) return
    if (opts.cache.current !== null) {
      setValue(opts.cache.current)
      setFailed(false)
      return
    }
    let attempt = 0
    let timer = 0
    const onOnline = () => {
      window.clearTimeout(timer)
      void run()
    }
    const run = async (): Promise<void> => {
      try {
        const v = await opts.fetcher()
        if (!aliveRef.current) return
        opts.cache.current = v
        setValue(v)
        setFailed(false)
        window.removeEventListener('online', onOnline)
      } catch {
        if (!aliveRef.current) return
        setFailed(true)
        window.addEventListener('online', onOnline)
        if (attempt < TEMPLATE_RETRY_BACKOFF_MS.length) {
          timer = window.setTimeout(() => { void run() }, TEMPLATE_RETRY_BACKOFF_MS[attempt])
          attempt += 1
        }
      }
    }
    void run()
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('online', onOnline)
    }
    // seq is the manual-retry escape hatch: retry() bumps it and the chain restarts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, seq])

  const retry = useCallback(() => { setSeq((s) => s + 1) }, [])

  return { value, failed, retry }
}
