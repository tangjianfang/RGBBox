import { Star } from 'lucide-react'
import { useEffect, useMemo, useRef, type JSX } from 'react'
import { effectPresets } from '../../../shared/defaultProfile'
import { renderEffectPixel } from '../../../engine/effects'
import { EFFECT_3D_KINDS } from '../../../shared/types'
import type { Effect3DKind, EffectKind, EffectLayer } from '../../../shared/types'
import { Effect3DGl } from '../gl/effect3dGl'
import { useI18n } from '../i18n'

interface EffectCardProps {
  preset: (typeof effectPresets)[number]
  selected: boolean
  favorite: boolean
  onSelect: (kind: EffectKind) => void
  onToggleFavorite: (kind: EffectKind) => void
}

function EffectCard({ preset, selected, favorite, onSelect, onToggleFavorite }: EffectCardProps): JSX.Element {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animRef = useRef<number | null>(null)
  const startRef = useRef(performance.now())

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = 80
    const H = 44
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

      const cols = 16
      const rows = 9
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
  }, [preset])

  return (
    <div
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const glRef     = useRef<Effect3DGl | null>(null)
  const animRef   = useRef<number | null>(null)
  const startRef  = useRef(performance.now())

  useEffect(() => {
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
  }, [preset])

  return (
    <div
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

interface EffectsViewProps {
  activeKind: EffectKind
  favoriteKinds: EffectKind[]
  onSelectEffect: (kind: EffectKind) => void
  onToggleFavorite: (kind: EffectKind) => void
}

const CATEGORIES = [
  { labelKey: 'effects.classic'  as const, kinds: ['screen-ambient', 'static', 'breathing', 'rainbow', 'wave', 'zone-gradient', 'random-color'] },
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
      {CATEGORIES.map((cat) => (
        <section key={cat.labelKey} className="effects-category">
          <h3 className="effects-category-label">{t(cat.labelKey)}</h3>
          <div className="effects-card-grid">
            {effectPresets
              .filter((p) => (cat.kinds as readonly string[]).includes(p.kind))
              .map((p) =>
                EFFECT_3D_KINDS.has(p.kind)
                  ? <EffectCard3D key={p.kind} preset={p} selected={activeKind === p.kind} favorite={favoriteSet.has(p.kind)} onSelect={onSelectEffect} onToggleFavorite={onToggleFavorite} />
                  : <EffectCard   key={p.kind} preset={p} selected={activeKind === p.kind} favorite={favoriteSet.has(p.kind)} onSelect={onSelectEffect} onToggleFavorite={onToggleFavorite} />
              )}
          </div>
        </section>
      ))}
    </div>
  )
}
