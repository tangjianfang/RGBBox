import { useEffect, useRef, type JSX } from 'react'
import { effectPresets } from '../../../shared/defaultProfile'
import { renderEffectPixel } from '../../../engine/effects'
import type { EffectKind, EffectLayer } from '../../../shared/types'

interface EffectCardProps {
  preset: (typeof effectPresets)[number]
  selected: boolean
  onSelect: (kind: EffectKind) => void
}

function EffectCard({ preset, selected, onSelect }: EffectCardProps): JSX.Element {
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
    <button
      className={`effect-card ${selected ? 'selected' : ''}`}
      type="button"
      onClick={() => onSelect(preset.kind)}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="effect-card-info">
        <strong>{preset.label}</strong>
        <p>{preset.description}</p>
      </div>
    </button>
  )
}

interface EffectsViewProps {
  activeKind: EffectKind
  onSelectEffect: (kind: EffectKind) => void
}

const CATEGORIES = [
  { label: 'Classic', kinds: ['screen-ambient', 'static', 'breathing', 'rainbow', 'wave', 'zone-gradient', 'random-color'] },
  { label: 'Advanced', kinds: ['fire', 'starlight', 'ripple', 'spectrum', 'comet', 'lightning', 'aurora', 'explode'] },
  { label: 'Audio Reactive', kinds: ['audio-beat', 'audio-equalizer'] }
] as const

export function EffectsView({ activeKind, onSelectEffect }: EffectsViewProps): JSX.Element {
  return (
    <div className="effects-view">
      <header className="effects-view-header">
        <h2>Effect Library</h2>
        <p className="eyebrow">16 built-in effects — click to apply to selected layer</p>
      </header>
      {CATEGORIES.map((cat) => (
        <section key={cat.label} className="effects-category">
          <h3 className="effects-category-label">{cat.label}</h3>
          <div className="effects-card-grid">
            {effectPresets
              .filter((p) => (cat.kinds as readonly string[]).includes(p.kind))
              .map((p) => (
                <EffectCard
                  key={p.kind}
                  preset={p}
                  selected={activeKind === p.kind}
                  onSelect={onSelectEffect}
                />
              ))}
          </div>
        </section>
      ))}
    </div>
  )
}
