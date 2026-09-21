import { useCallback, useEffect, useState } from 'react'
import type { EffectKind, EffectLayer } from '../../../../shared/types'
import type { RandomizerMode } from '../../domain/randomizer'
import { RANDOMIZER_MODES, parseStoredEffectKinds, parseStoredParameterLocks } from '../../domain/randomizer'

/**
 * R147 P3b: randomizer / favorites domain, moved verbatim from App.tsx —
 * favorite effect kinds (Alt+N / Alt+arrows quick switching), randomizer mode
 * and per-parameter locks, all localStorage-persisted.
 */
export function useRandomizerDomain(args: {
  selectedLayer: EffectLayer | null
  selectEffect: (kind: EffectKind) => void
}) {
  const { selectedLayer, selectEffect } = args
  const [favoriteEffectKinds, setFavoriteEffectKinds] = useState<EffectKind[]>(() =>
    parseStoredEffectKinds(localStorage.getItem('rgbbox:favoriteEffects'))
  )
  const [randomizerMode, setRandomizerMode] = useState<RandomizerMode>(() => {
    const saved = localStorage.getItem('rgbbox:randomizerMode') as RandomizerMode | null
    return saved && RANDOMIZER_MODES.includes(saved) ? saved : 'bold'
  })
  const [randomizerLockedParams, setRandomizerLockedParams] = useState<string[]>(() =>
    parseStoredParameterLocks(localStorage.getItem('rgbbox:randomizerLockedParams'))
  )

  // ── Persist UI state to localStorage ────────────────────────────────────
  useEffect(() => { localStorage.setItem('rgbbox:favoriteEffects', JSON.stringify(favoriteEffectKinds)) }, [favoriteEffectKinds])
  useEffect(() => { localStorage.setItem('rgbbox:randomizerMode', randomizerMode) }, [randomizerMode])
  useEffect(() => { localStorage.setItem('rgbbox:randomizerLockedParams', JSON.stringify(randomizerLockedParams)) }, [randomizerLockedParams])

  const toggleFavoriteEffect = useCallback((kind: EffectKind) => {
    setFavoriteEffectKinds((prev) => {
      if (prev.includes(kind)) return prev.filter((entry) => entry !== kind)
      return [...prev, kind].slice(-12)
    })
  }, [])

  const selectFavoriteByOffset = useCallback((offset: number) => {
    if (favoriteEffectKinds.length === 0) return
    const currentIndex = selectedLayer ? favoriteEffectKinds.indexOf(selectedLayer.kind) : -1
    const baseIndex = currentIndex >= 0 ? currentIndex : 0
    const nextIndex = (baseIndex + offset + favoriteEffectKinds.length) % favoriteEffectKinds.length
    selectEffect(favoriteEffectKinds[nextIndex])
  }, [favoriteEffectKinds, selectedLayer, selectEffect])

  const toggleRandomizerParamLock = useCallback((name: string) => {
    setRandomizerLockedParams((prev) => {
      if (prev.includes(name)) return prev.filter((entry) => entry !== name)
      return [...prev, name]
    })
  }, [])

  // Alt+←/→ cycles favorite effects, Alt+1..9 picks directly — moved verbatim.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (!event.altKey) return

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        selectFavoriteByOffset(1)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        selectFavoriteByOffset(-1)
      } else if (/^[1-9]$/.test(event.key)) {
        const preset = favoriteEffectKinds[Number(event.key) - 1]
        if (preset) {
          event.preventDefault()
          selectEffect(preset)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [favoriteEffectKinds, selectEffect, selectFavoriteByOffset])

  return {
    favoriteEffectKinds, toggleFavoriteEffect,
    randomizerMode, setRandomizerMode,
    randomizerLockedParams, toggleRandomizerParamLock,
  }
}
