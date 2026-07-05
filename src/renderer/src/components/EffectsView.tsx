import { Star } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type JSX, type RefObject } from 'react'
import { effectPresets } from '../../../shared/defaultProfile'
import { renderEffectPixel } from '../../../engine/effects'
import { EFFECT_3D_KINDS } from '../../../shared/types'
import type { Effect3DKind, EffectKind, EffectLayer } from '../../../shared/types'
import { Effect3DGl } from '../gl/effect3dGl'
import { EffectGl, isGpuDirectEffect } from '../gl/effectGl'
import { useI18n } from '../i18n'

/**
 * R41: each card owns its own canvas/WebGL context and `requestAnimationFrame`
 * loop. A category tab can still hold 15-20 cards (R39 already cut this down
 * from ~55), and browsers cap the number of *simultaneously live* WebGL
 * contexts per process (Chromium silently force-loses the oldest ones past
 * the limit) — approaching that cap causes exactly the "everything looks a
 * bit off / stutters" symptom reported. This hook pauses/tears down a card's
 * rendering (and, for GL cards, its context) whenever the card scrolls out
 * of view, so only the handful of cards actually on screen stay active.
 */
function useCardVisible(): [RefObject<HTMLDivElement | null>, boolean] {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      // No IntersectionObserver support (e.g. some test environments) — fail open.
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: '150px 0px', threshold: 0 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return [containerRef, visible]
}

interface EffectCardProps {
  preset: (typeof effectPresets)[number]
  selected: boolean
  favorite: boolean
  onSelect: (kind: EffectKind) => void
  onToggleFavorite: (kind: EffectKind) => void
}

function EffectCard({ preset, selected, favorite, onSelect, onToggleFavorite }: EffectCardProps): JSX.Element {
  const { t } = useI18n()
  const [containerRef, visible] = useCardVisible()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animRef = useRef<number | null>(null)
  const startRef = useRef(performance.now())

  useEffect(() => {
    if (!visible) return
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = 240
    const H = 135
    canvas.width = W
    canvas.height = H

    const layer: EffectLayer = {
      id: 'preview',
      name: preset.label,
      kind: preset.kind,
      enabled: true,
      opacity: 1,
      blendMode: 'normal',
      parameters: preset.defaults
    }

    const draw = () => {
      const now = (performance.now() - startRef.current) / 1000
      ctx.fillStyle = '#080d11'
      ctx.fillRect(0, 0, W, H)

      const cols = 48
      const rows = 27
      // Full-coverage: each cell = W/cols × H/rows
      const cw = W / cols
      const ch = H / rows
      const gap = Math.max(0.5, Math.min(cw, ch) * 0.06)

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const color = renderEffectPixel(layer, { x, y, columns: cols, rows, now })
          const rx = x * cw + gap / 2
          const ry = y * ch + gap / 2
          const rw = cw - gap
          const rh = ch - gap

          ctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`
          ctx.fillRect(rx, ry, rw, rh)
        }
      }

      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)

    return () => {
      if (animRef.current !== null) cancelAnimationFrame(animRef.current)
    }
  }, [preset, visible])

  return (
    <div
      ref={containerRef}
      className={`effect-card ${selected ? 'selected' : ''}`}
    >
      <button className="effect-card-main" type="button" onClick={() => onSelect(preset.kind)}>
        <canvas ref={canvasRef} aria-hidden="true" />
        <div className="effect-card-info">
          <strong>{preset.label}</strong>
          <p>{preset.description}</p>
        </div>
      </button>
      <button
        className={`effect-favorite-btn ${favorite ? 'active' : ''}`}
        type="button"
        aria-pressed={favorite}
        title={favorite ? t('effects.unfavorite') : t('effects.favorite')}
        onClick={() => onToggleFavorite(preset.kind)}
      >
        <Star size={15} fill={favorite ? 'currentColor' : 'none'} />
      </button>
    </div>
  )
}

/**
 * Thumbnail card for GPU 3D effects — renders the GLSL shader directly in
 * the card canvas using a dedicated WebGL context.
 */
function EffectCard3D({ preset, selected, favorite, onSelect, onToggleFavorite }: EffectCardProps): JSX.Element {
  const { t } = useI18n()
  const [containerRef, visible] = useCardVisible()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const glRef     = useRef<Effect3DGl | null>(null)
  const animRef   = useRef<number | null>(null)
  const startRef  = useRef(performance.now())

  useEffect(() => {
    if (!visible) return
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width  = 80
    canvas.height = 44
    try {
      glRef.current = new Effect3DGl(canvas, preset.kind as Effect3DKind)
    } catch {
      return
    }
    const params: [number, number, number, number] = [
      (preset.defaults.speed    as number) ?? 0.5,
      (preset.defaults.hueShift as number) ?? 0,
      1.0,
      0.5,
    ]
    const draw = (): void => {
      const t = (performance.now() - startRef.current) / 1000
      glRef.current?.draw(t, params)
      animRef.current = requestAnimationFrame(draw)
    }
    animRef.current = requestAnimationFrame(draw)
    return () => {
      if (animRef.current !== null) cancelAnimationFrame(animRef.current)
      glRef.current?.dispose()
      glRef.current = null
    }
  }, [preset, visible])

  return (
    <div
      ref={containerRef}
      className={`effect-card ${selected ? 'selected' : ''}`}
    >
      <button className="effect-card-main" type="button" onClick={() => onSelect(preset.kind)}>
        <canvas ref={canvasRef} aria-hidden="true" />
        <div className="effect-card-info">
          <strong>{preset.label}</strong>
          <p>{preset.description}</p>
        </div>
      </button>
      <button
        className={`effect-favorite-btn ${favorite ? 'active' : ''}`}
        type="button"
        aria-pressed={favorite}
        title={favorite ? t('effects.unfavorite') : t('effects.favorite')}
        onClick={() => onToggleFavorite(preset.kind)}
      >
        <Star size={15} fill={favorite ? 'currentColor' : 'none'} />
      </button>
    </div>
  )
}

/**
 * R37/R39: thumbnail card for GPU-direct 2D effects (see gl/effectGl.ts) —
 * renders the same continuous-per-pixel shader used by the full-resolution
 * in-app preview, instead of the coarse 48×27 CPU grid `EffectCard` uses.
 * This is both smoother-looking (no blocky quantisation) and cheaper on the
 * main thread (the colour maths runs on the GPU instead of once per grid
 * cell in JS), which is what makes it safe to animate many cards at once.
 */
function EffectCardGpu({ preset, selected, favorite, onSelect, onToggleFavorite }: EffectCardProps): JSX.Element {
  const { t } = useI18n()
  const [containerRef, visible] = useCardVisible()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const glRef = useRef<EffectGl | null>(null)
  const animRef = useRef<number | null>(null)
  const startRef = useRef(performance.now())

  useEffect(() => {
    if (!visible) return
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = 240
    canvas.height = 135
    try {
      glRef.current = new EffectGl(canvas)
      glRef.current.resize(canvas.width, canvas.height)
    } catch {
      return
    }
    const layer: EffectLayer = {
      id: 'preview',
      name: preset.label,
      kind: preset.kind,
      enabled: true,
      opacity: 1,
      blendMode: 'normal',
      parameters: preset.defaults
    }
    const draw = (): void => {
      const now = (performance.now() - startRef.current) / 1000
      glRef.current?.render(layer, now)
      animRef.current = requestAnimationFrame(draw)
    }
    animRef.current = requestAnimationFrame(draw)
    return () => {
      if (animRef.current !== null) cancelAnimationFrame(animRef.current)
      glRef.current?.dispose()
      glRef.current = null
    }
  }, [preset, visible])

  return (
    <div ref={containerRef} className={`effect-card ${selected ? 'selected' : ''}`}>
      <button className="effect-card-main" type="button" onClick={() => onSelect(preset.kind)}>
        <canvas ref={canvasRef} aria-hidden="true" />
        <div className="effect-card-info">
          <strong>{preset.label}</strong>
          <p>{preset.description}</p>
        </div>
      </button>
      <button
        className={`effect-favorite-btn ${favorite ? 'active' : ''}`}
        type="button"
        aria-pressed={favorite}
        title={favorite ? t('effects.unfavorite') : t('effects.favorite')}
        onClick={() => onToggleFavorite(preset.kind)}
      >
        <Star size={15} fill={favorite ? 'currentColor' : 'none'} />
      </button>
    </div>
  )
}

interface EffectsViewProps {
  activeKind: EffectKind
  favoriteKinds: EffectKind[]
  onSelectEffect: (kind: EffectKind) => void
  onToggleFavorite: (kind: EffectKind) => void
}

const CATEGORIES = [
  { labelKey: 'effects.classic'  as const, kinds: ['screen-ambient', 'static', 'breathing', 'rainbow', 'wave', 'zone-gradient', 'random-color'] },
  { labelKey: 'effects.custom'   as const, kinds: ['custom-paint', 'image-paint'] },
  { labelKey: 'effects.advanced' as const, kinds: ['fire', 'aurora', 'nebula', 'fluid-flow', 'mirror-symmetry', 'starlight', 'ripple', 'spectrum', 'comet', 'lightning', 'explode', 'glitch', 'matrix-rain', 'neon-pulse'] },
  { labelKey: 'effects.science'  as const, kinds: ['dna-helix', 'black-hole', 'solar-system', 'spiral-galaxy', 'orion-nebula', 'pulsar-beacon', 'hurricane-eye', 'lightning-leader', 'icosahedral-virus', 'protein-folding', 'mitosis-spindle', 'synapse-pulse', 'quantum-collapse', 'microvilli-field', 'eclipse-alignment', 'comet-tail', 'magnetosphere-aurora', 'wave-diffraction', 'vortex-flame', 'tokamak-plasma'] },
  { labelKey: 'effects.threed'   as const, kinds: ['plasma', 'vortex', 'tunnel', 'crystal'] },
  { labelKey: 'effects.gpu3d'    as const, kinds: ['sphere-pulse', 'warp-portal', 'neon-galaxy', 'lava-sphere', 'laser-show', 'hologram'] },
  { labelKey: 'effects.audio'    as const, kinds: ['audio-beat', 'audio-equalizer'] },
] as const

export function EffectsView({ activeKind, favoriteKinds, onSelectEffect, onToggleFavorite }: EffectsViewProps): JSX.Element {
  const { t } = useI18n()
  const favoriteSet = useMemo(() => new Set(favoriteKinds), [favoriteKinds])
  const favoritePresets = useMemo(() => {
    return favoriteKinds
      .map((kind) => effectPresets.find((preset) => preset.kind === kind))
      .filter((preset): preset is (typeof effectPresets)[number] => Boolean(preset))
  }, [favoriteKinds])

  // R39: categories are now tabs — only the active tab's card grid is
  // mounted at once (instead of all ~55 effect cards stacked and animating
  // simultaneously), which is both far friendlier to browse and removes the
  // main-thread/GPU-context load that made the library feel janky.
  const [activeCategory, setActiveCategory] = useState<(typeof CATEGORIES)[number]['labelKey']>(CATEGORIES[0].labelKey)
  const currentCategory = CATEGORIES.find((cat) => cat.labelKey === activeCategory) ?? CATEGORIES[0]

  return (
    <div className="effects-view">
      <header className="effects-view-header">
        <h2>{t('effects.library')}</h2>
        <p className="eyebrow">{t('effects.eyebrow')}</p>
      </header>
      <section className="effects-category effects-favorites-section">
        <h3 className="effects-category-label">{t('effects.favorites')}</h3>
        {favoritePresets.length > 0 ? (
          <div className="effects-favorites-row">
            {favoritePresets.map((preset, index) => (
              <button
                className={`favorite-effect-chip ${activeKind === preset.kind ? 'selected' : ''}`}
                key={preset.kind}
                type="button"
                title={`Alt+${index + 1} · ${preset.label}`}
                onClick={() => onSelectEffect(preset.kind)}
              >
                <Star size={12} fill="currentColor" />
                <span>{t((`effect.${preset.kind}`) as Parameters<typeof t>[0])}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="effects-empty-hint">{t('effects.noFavorites')}</p>
        )}
      </section>

      <div className="effects-category-tabs" role="tablist">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.labelKey}
            type="button"
            role="tab"
            aria-selected={activeCategory === cat.labelKey}
            className={`effects-category-tab ${activeCategory === cat.labelKey ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat.labelKey)}
          >
            {t(cat.labelKey)}
            <span className="effects-category-tab-count">{cat.kinds.length}</span>
          </button>
        ))}
      </div>

      <section className="effects-category">
        <div className="effects-card-grid">
          {effectPresets
            .filter((p) => (currentCategory.kinds as readonly string[]).includes(p.kind))
            .map((p) => {
              if (EFFECT_3D_KINDS.has(p.kind)) {
                return <EffectCard3D key={p.kind} preset={p} selected={activeKind === p.kind} favorite={favoriteSet.has(p.kind)} onSelect={onSelectEffect} onToggleFavorite={onToggleFavorite} />
              }
              if (isGpuDirectEffect(p.kind)) {
                return <EffectCardGpu key={p.kind} preset={p} selected={activeKind === p.kind} favorite={favoriteSet.has(p.kind)} onSelect={onSelectEffect} onToggleFavorite={onToggleFavorite} />
              }
              return <EffectCard key={p.kind} preset={p} selected={activeKind === p.kind} favorite={favoriteSet.has(p.kind)} onSelect={onSelectEffect} onToggleFavorite={onToggleFavorite} />
            })}
        </div>
      </section>
    </div>
  )
}
