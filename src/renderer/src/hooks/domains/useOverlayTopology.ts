import { useCallback, useEffect, useRef, useState } from 'react'
import type { DisplayTopology, EffectKind, OverlayConfig } from '../../../../shared/types'

/**
 * R147 P3b: overlay/topology domain, moved verbatim from App.tsx — which
 * displays have an open overlay window + each overlay's region config, the
 * toggle/config-change handlers, the perf-selftest overlay toggle route, the
 * overlay close/effect-change/topology-hotplug subscriptions, and the
 * localStorage persistence of overlay configs.
 *
 * The returned `overlayIdsRef` / `overlayConfigsRef` mirrors feed the engine
 * tick loop (R42/R43 gate + distributeFrameToOverlays) without being effect
 * dependencies — the exact pattern App used inline.
 */
export function useOverlayTopology(args: {
  setTopology: (topology: DisplayTopology) => void
  selectEffect: (kind: EffectKind) => void
}) {
  const { setTopology, selectEffect } = args
  const [overlayDisplayIds, setOverlayDisplayIds] = useState<number[]>([])
  const [overlayConfigs, setOverlayConfigs] = useState<Record<number, OverlayConfig>>(() => {
    try { return JSON.parse(localStorage.getItem('rgbbox:overlayConfigs') ?? '{}') }
    catch { return {} }
  })

  // Mirrors for the engine tick loop (kept in refs so the loop's effect is
  // never torn down when these change).
  const overlayIdsRef = useRef<number[]>(overlayDisplayIds)
  overlayIdsRef.current = overlayDisplayIds
  const overlayConfigsRef = useRef<Record<number, OverlayConfig>>(overlayConfigs)
  overlayConfigsRef.current = overlayConfigs

  useEffect(() => { localStorage.setItem('rgbbox:overlayConfigs', JSON.stringify(overlayConfigs)) }, [overlayConfigs])

  const handleToggleOverlay = useCallback(async (displayId: number) => {
    if (overlayDisplayIds.includes(displayId)) {
      await window.rgbbox.closeOverlay(displayId)
      setOverlayDisplayIds((prev) => prev.filter((id) => id !== displayId))
    } else {
      const config = overlayConfigs[displayId]
      await window.rgbbox.openOverlay(displayId, config)
      setOverlayDisplayIds((prev) => [...prev, displayId])
    }
  }, [overlayDisplayIds, overlayConfigs])

  // R46: only ever fires during the `--perf-selftest` harness — routes the
  // request through the exact same handleToggleOverlay() a real user click
  // uses, so overlayDisplayIds (and thus the R42/R43 tick-loop gate) stays
  // correctly in sync, unlike calling openOverlay() directly from main.
  const handleToggleOverlayRef = useRef(handleToggleOverlay)
  handleToggleOverlayRef.current = handleToggleOverlay
  useEffect(() => {
    return window.rgbbox.onPerfSelfTestToggleOverlay((displayId) => {
      void handleToggleOverlayRef.current(displayId)
    })
  }, [])

  const handleOverlayConfigChange = useCallback((displayId: number, config: OverlayConfig) => {
    setOverlayConfigs((prev) => ({ ...prev, [displayId]: config }))
    if (overlayDisplayIds.includes(displayId)) {
      void window.rgbbox.setOverlayConfig(displayId, config)
    }
  }, [overlayDisplayIds])

  // Listen for effect-switch requests coming from the overlay context menu
  useEffect(() => {
    return window.rgbbox.onOverlayEffectChanged((kind) => {
      if (kind !== null) selectEffect(kind as EffectKind)
    })
  }, [selectEffect])

  // Sync overlay state when user closes an overlay window directly
  useEffect(() => {
    return window.rgbbox.onOverlayClosed((displayId) => {
      setOverlayDisplayIds((prev) => prev.filter((id) => id !== displayId))
    })
  }, [])

  // ── Display hotplug — refresh topology when monitors are added/removed ──
  useEffect(() => {
    return window.rgbbox.onDisplayTopologyChanged(async () => {
      const newTopology = await window.rgbbox.getDisplayTopology()
      setTopology(newTopology)
    })
  }, [setTopology])

  return {
    overlayDisplayIds, setOverlayDisplayIds,
    overlayConfigs,
    overlayIdsRef, overlayConfigsRef,
    handleToggleOverlay, handleOverlayConfigChange,
  }
}
