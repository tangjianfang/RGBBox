import { useEffect, useState } from 'react'

/**
 * R147 P5: one mechanism for localStorage-backed UI state — replaces the
 * per-state load-in-lazy-initializer + write-in-effect boilerplate that was
 * scattered across App (and remains inside some domain hooks where it moved
 * verbatim). JSON round-trip with silent fallback to the initial value when
 * the stored payload is unreadable; writes are synchronous like before.
 *
 * `raw: true` keeps the value a bare string (NO JSON quoting) — for keys the
 * app has always stored as plain strings (`rgbbox:selectedLayerId`,
 * `rgbbox:audioDevice`), so switching them to JSON would silently discard
 * every user's stored value.
 */
export function usePersistedState<T>(key: string, initial: T, options?: { raw?: false }): [T, React.Dispatch<React.SetStateAction<T>>]
export function usePersistedState(key: string, initial: string, options: { raw: true }): [string, React.Dispatch<React.SetStateAction<string>>]
export function usePersistedState<T>(key: string, initial: T, options?: { raw?: boolean }): [T, React.Dispatch<React.SetStateAction<T>>] {
  const raw = options?.raw === true
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      if (raw) return (stored === null ? initial : (stored as unknown as T))
      return stored === null ? initial : (JSON.parse(stored) as T)
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, raw ? String(value) : JSON.stringify(value))
    } catch {
      /* storage unavailable (SSR/tests) — keep in-memory only */
    }
  }, [key, value, raw])
  return [value, setValue]
}

/** Boolean special case for the historical `'1'`/`'0'` encoding. */
export function usePersistedFlag(key: string, initial: boolean): [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const [value, setValue] = useState<boolean>(() => {
    const stored = localStorage.getItem(key)
    return stored === null ? initial : stored === '1'
  })
  useEffect(() => { localStorage.setItem(key, value ? '1' : '0') }, [key, value])
  return [value, setValue]
}
