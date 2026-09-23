import { useCallback, useEffect, useState } from 'react'
import type { EffectKind } from '../../../shared/types'
import { recordRecentKind } from '../domain/curatedEffects'

/**
 * R164.1 (S1): recently-used effect kinds — same persistence shape as the
 * favorites domain (localStorage JSON array), newest-first, capped at 8.
 * Fed by every selectEffect() call; consumed by the curated strip.
 */
const STORAGE_KEY = 'rgbbox:recentEffects'

function readStored(): EffectKind[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((k): k is EffectKind => typeof k === 'string') : []
  } catch {
    return []
  }
}

export function useRecentEffects(): { recentKinds: EffectKind[]; recordRecent: (kind: EffectKind) => void } {
  const [recentKinds, setRecentKinds] = useState<EffectKind[]>(readStored)
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(recentKinds)) } catch { /* storage unavailable */ }
  }, [recentKinds])
  const recordRecent = useCallback((kind: EffectKind) => {
    setRecentKinds((prev) => recordRecentKind(prev, kind))
  }, [])
  return { recentKinds, recordRecent }
}
