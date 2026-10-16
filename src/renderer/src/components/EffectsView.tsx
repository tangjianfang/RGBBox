import { Star } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type RefObject } from 'react'
import { effectPresets } from '../../../shared/defaultProfile'
import { renderEffectPixel } from '../../../engine/effects'
import { EFFECT_3D_KINDS } from '../../../shared/types'
import type { Effect3DKind, EffectKind, EffectLayer } from '../../../shared/types'
import { Effect3DGl } from '../gl/effect3dGl'
import { EffectGl, isGpuDirectEffect } from '../gl/effectGl'
import { useI18n } from '../i18n'
import { presetDescription, presetLabel } from '../domain/presetI18n'
import {
  cardFpsForMode,
  composeCardFramePixels,
  enterVisibleCard,
  exitVisibleCard,
  getVisibleCardCount,
  shouldDrawCardFrame,
  CARD_CANVAS_H,
  CARD_CANVAS_W,
  CARD_GRID_COLS,
  CARD_GRID_ROWS,
  type CardPerformanceMode
} from '../domain/cardAnimation'

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

  // R301: 可见卡进出全局计数 —— 同屏动画卡超预算时所有可见卡按比例降帧
  // （effectiveCardFps 的数据源），而非冻结一部分卡片。
  useEffect(() => {
    if (!visible) return undefined
    enterVisibleCard()
    return () => exitVisibleCard()
  }, [visible])

  return [containerRef, visible]
}

interface EffectCardProps {
  preset: (typeof effectPresets)[number]
  selected: boolean
  favorite: boolean
  /** R301: 帧率预算（performanceMode 映射，见 domain/cardAnimation.ts）。 */
  fps: number
  onSelect: (kind: EffectKind) => void
  onToggleFavorite: (kind: EffectKind) => void
  /** R164.2 (S2): pointer enters/leaves the card — debounced into hover preview by the view. */
  onHover: (kind: EffectKind | null) => void
}

function EffectCard({ preset, selected, favorite, fps, onSelect, onToggleFavorite, onHover }: EffectCardProps): JSX.Element {
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

    const W = CARD_CANVAS_W
    const H = CARD_CANVAS_H
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

    // R301: ImageData 直写路径 —— 网格色算入数组后按 AA 权重表单次 putImageData，
    // 取代每帧 1296 次 fillRect + 1296 个 `rgb()` 字符串（fillRect 路径的像素几何
    // 由 CARD_CELL_WEIGHTS 逐位复刻——0.25px 偏移 + 4.5px cell + 0.5px gap 的 AA）。
    const cols = CARD_GRID_COLS
    const rows = CARD_GRID_ROWS
    const image = ctx.createImageData(W, H)
    const grid: Array<{ r: number; g: number; b: number }> = new Array(cols * rows)
    for (let i = 0; i < grid.length; i++) grid[i] = { r: 0, g: 0, b: 0 }

    let lastDraw = 0
    const draw = () => {
      const wall = performance.now()
      // R301: 时间门跳帧 —— 缩略图不需要刷新率级流畅度；可见卡超预算时
      // shouldDrawCardFrame 内部按 effectiveCardFps 自动放宽间隔。
      if (!shouldDrawCardFrame(lastDraw, wall, fps, getVisibleCardCount())) {
        animRef.current = requestAnimationFrame(draw)
        return
      }
      lastDraw = wall
      const now = (wall - startRef.current) / 1000

      let i = 0
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          grid[i++] = renderEffectPixel(layer, { x, y, columns: cols, rows, now })
        }
      }
      composeCardFramePixels(grid, image.data)
      ctx.putImageData(image, 0, 0)

      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)

    return () => {
      if (animRef.current !== null) cancelAnimationFrame(animRef.current)
    }
  }, [preset, visible, fps])

  return (
    <div
      ref={containerRef}
      className={`effect-card ${selected ? 'selected' : ''}`}
      onPointerEnter={() => onHover(preset.kind)}
      onPointerLeave={() => onHover(null)}
    >
      <button className="effect-card-main" type="button" onClick={() => onSelect(preset.kind)}>
        <canvas ref={canvasRef} aria-hidden="true" />
        <div className="effect-card-info">
          {/* R159.1 (E3): localized display; layer.name keeps preset.label (language-neutral persisted data). */}
          <strong>{presetLabel(preset, t)}</strong>
          <p>{presetDescription(preset, t)}</p>
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
function EffectCard3D({ preset, selected, favorite, fps, onSelect, onToggleFavorite, onHover }: EffectCardProps): JSX.Element {
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
    // R288: 80×44→240×135 与 CPU 卡对齐——raymarch 细节在 80 宽下全失,
    // 是 3D 效果「第一印象糊」的根修(R283 P3)。params 补 preset intensity
    // (原硬编码 1.0,与 Preview3D 不平价——hologram 的提亮预设现在如实上卡)。
    canvas.width  = 240
    canvas.height = 135
    try {
      glRef.current = new Effect3DGl(canvas, preset.kind as Effect3DKind)
    } catch {
      return
    }
    const params: [number, number, number, number] = [
      (preset.defaults.speed     as number) ?? 0.5,
      (preset.defaults.hueShift  as number) ?? 0,
      (preset.defaults.intensity as number) ?? 1,
      (preset.defaults.density   as number) ?? 0.5,
    ]
    let lastDraw = 0
    const draw = (): void => {
      // R301: 与 CPU 卡同款时间门（raymarch 是最贵的卡型，节流收益最大）。
      const wall = performance.now()
      if (!shouldDrawCardFrame(lastDraw, wall, fps, getVisibleCardCount())) {
        animRef.current = requestAnimationFrame(draw)
        return
      }
      lastDraw = wall
      glRef.current?.draw((wall - startRef.current) / 1000, params)
      animRef.current = requestAnimationFrame(draw)
    }
    animRef.current = requestAnimationFrame(draw)
    return () => {
      if (animRef.current !== null) cancelAnimationFrame(animRef.current)
      glRef.current?.dispose()
      glRef.current = null
    }
  }, [preset, visible, fps])

  return (
    <div
      ref={containerRef}
      className={`effect-card ${selected ? 'selected' : ''}`}
      onPointerEnter={() => onHover(preset.kind)}
      onPointerLeave={() => onHover(null)}
    >
      <button className="effect-card-main" type="button" onClick={() => onSelect(preset.kind)}>
        <canvas ref={canvasRef} aria-hidden="true" />
        <div className="effect-card-info">
          {/* R159.1 (E3): localized display; layer.name keeps preset.label (language-neutral persisted data). */}
          <strong>{presetLabel(preset, t)}</strong>
          <p>{presetDescription(preset, t)}</p>
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
function EffectCardGpu({ preset, selected, favorite, fps, onSelect, onToggleFavorite, onHover }: EffectCardProps): JSX.Element {
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
    let lastDraw = 0
    const draw = (): void => {
      // R301: 与 CPU 卡同款时间门。
      const wall = performance.now()
      if (!shouldDrawCardFrame(lastDraw, wall, fps, getVisibleCardCount())) {
        animRef.current = requestAnimationFrame(draw)
        return
      }
      lastDraw = wall
      glRef.current?.render(layer, (wall - startRef.current) / 1000)
      animRef.current = requestAnimationFrame(draw)
    }
    animRef.current = requestAnimationFrame(draw)
    return () => {
      if (animRef.current !== null) cancelAnimationFrame(animRef.current)
      glRef.current?.dispose()
      glRef.current = null
    }
  }, [preset, visible, fps])

  return (
    <div
      ref={containerRef}
      className={`effect-card ${selected ? 'selected' : ''}`}
      onPointerEnter={() => onHover(preset.kind)}
      onPointerLeave={() => onHover(null)}
    >
      <button className="effect-card-main" type="button" onClick={() => onSelect(preset.kind)}>
        <canvas ref={canvasRef} aria-hidden="true" />
        <div className="effect-card-info">
          {/* R159.1 (E3): localized display; layer.name keeps preset.label (language-neutral persisted data). */}
          <strong>{presetLabel(preset, t)}</strong>
          <p>{presetDescription(preset, t)}</p>
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
  /** R164.1: curated strip kinds (data-driven, see domain/curatedEffects.ts). */
  curatedKinds: EffectKind[]
  /** R164.2 (S2): null on pointer-leave/Esc/apply — App drives the preview override. */
  onPreviewEffect: (kind: EffectKind | null) => void
  /** R164.4 (S4): the 🎲 inspire button — random effect + random color shift. */
  onInspire: () => void
  onSelectEffect: (kind: EffectKind) => void
  onToggleFavorite: (kind: EffectKind) => void
  /** R301: performanceMode → 卡片帧率预算（battery 10 / balanced 20 / extreme 不限）。
   *  profile.performanceMode 此前仅作仪表盘展示，这是它首次驱动真实行为。 */
  performanceMode?: CardPerformanceMode
}

// R289 Phase 0: kinds 收编译期守卫——裸 string 数组里拼错 kind 只会静默
// 从 tab 消失(架构评审雷①);satisfies 钉到 EffectKind 联合,typo 即 TS 红。
const CATEGORIES = [
  // R289: 三体主题库——《三体》三部曲高光场景(REVIEW_2026-10-12 任务一);
  // R291 震撼批 +二向箔降维/黑暗森林打击
  { labelKey: 'effects.threebody' as const, kinds: ['three-body', 'trisolaran-suns', 'droplet-mirror', 'gravity-wave', 'dual-vector-foil', 'dark-forest-strike'] },
  { labelKey: 'effects.classic'  as const, kinds: ['screen-ambient', 'static', 'breathing', 'rainbow', 'wave', 'zone-gradient', 'random-color'] },
  { labelKey: 'effects.custom'   as const, kinds: ['custom-paint', 'image-paint'] },
  { labelKey: 'effects.advanced' as const, kinds: ['fire', 'aurora', 'nebula', 'fluid-flow', 'mirror-symmetry', 'starlight', 'ripple', 'comet', 'lightning', 'explode', 'glitch', 'matrix-rain', 'neon-pulse'] },
  { labelKey: 'effects.science'  as const, kinds: ['dna-helix', 'black-hole', 'solar-system', 'spiral-galaxy', 'pulsar-beacon', 'hurricane-eye', 'protein-folding', 'mitosis-spindle', 'synapse-pulse', 'quantum-collapse', 'microvilli-field', 'eclipse-alignment', 'magnetosphere-aurora', 'vortex-flame', 'tokamak-plasma'] },
  { labelKey: 'effects.threed'   as const, kinds: ['plasma', 'vortex', 'tunnel', 'crystal'] },
  { labelKey: 'effects.gpu3d'    as const, kinds: ['sphere-pulse', 'warp-portal', 'neon-galaxy', 'lava-sphere', 'hologram'] },
  { labelKey: 'effects.audio'    as const, kinds: ['audio-beat', 'audio-equalizer'] },
] as const satisfies ReadonlyArray<{ labelKey: string; kinds: readonly EffectKind[] }>

export function EffectsView({ activeKind, favoriteKinds, curatedKinds, onPreviewEffect, onInspire, onSelectEffect, onToggleFavorite, performanceMode }: EffectsViewProps): JSX.Element {
  const { t } = useI18n()
  const favoriteSet = useMemo(() => new Set(favoriteKinds), [favoriteKinds])
  // R301: 三档帧率预算下发给全部卡片（渲染循环内再做同屏计数自适应降帧）。
  const cardFps = useMemo(() => cardFpsForMode(performanceMode ?? 'balanced'), [performanceMode])

  // ── R164.2 (S2) + R225.2: hover preview — 300ms debounce on ENTER so a
  //    pointer sweep across the grid doesn't churn the canvas, and a 300ms
  //    GRACE on LEAVE (was: instant clear) so the fixed-position pill's
  //    应用 button is actually reachable; the pill retains itself on its own
  //    pointerenter. Esc / applying still clear immediately.
  const [previewingKind, setPreviewingKind] = useState<EffectKind | null>(null)
  const hoverTimerRef = useRef<number | null>(null)
  const cancelHoverTimer = useCallback(() => {
    if (hoverTimerRef.current !== null) { window.clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null }
  }, [])
  const clearPreview = useCallback(() => {
    setPreviewingKind(null)
    onPreviewEffect(null)
  }, [onPreviewEffect])
  const schedulePreview = useCallback((kind: EffectKind) => {
    hoverTimerRef.current = window.setTimeout(() => {
      hoverTimerRef.current = null
      setPreviewingKind(kind)
      onPreviewEffect(kind)
    }, 300)
  }, [onPreviewEffect])
  /** pointer entered a card (kind) — debounced switch; null = pill hover, retain current. */
  const hoverEnter = useCallback((kind: EffectKind | null) => {
    cancelHoverTimer()
    if (kind === null) return
    schedulePreview(kind)
  }, [cancelHoverTimer, schedulePreview])
  /** pointer left a card / the pill — clear after the grace window. */
  const hoverLeave = useCallback(() => {
    cancelHoverTimer()
    hoverTimerRef.current = window.setTimeout(() => {
      hoverTimerRef.current = null
      clearPreview()
    }, 300)
  }, [cancelHoverTimer, clearPreview])
  /** cards keep their onHover(kind|null) contract; null now routes to the grace path. */
  const hoverKind = useCallback((kind: EffectKind | null) => {
    if (kind === null) hoverLeave()
    else hoverEnter(kind)
  }, [hoverEnter, hoverLeave])
  const hoverClearNow = useCallback(() => {
    cancelHoverTimer()
    clearPreview()
  }, [cancelHoverTimer, clearPreview])
  // Esc cancels the preview; unmount (view switch) clears the override so it
  // can never leak into the workspace canvas.
  useEffect(() => {
    if (!previewingKind) return undefined
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') hoverClearNow() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewingKind, hoverClearNow])
  useEffect(() => () => { onPreviewEffect(null) }, [onPreviewEffect])

  const applyFromPreview = useCallback((kind: EffectKind) => {
    hoverClearNow() // clear the override before committing
    onSelectEffect(kind)
  }, [hoverClearNow, onSelectEffect])

  const renderCard = (p: (typeof effectPresets)[number]): JSX.Element => {
    if (EFFECT_3D_KINDS.has(p.kind)) {
      return <EffectCard3D key={p.kind} preset={p} selected={activeKind === p.kind} favorite={favoriteSet.has(p.kind)} fps={cardFps} onSelect={applyFromPreview} onToggleFavorite={onToggleFavorite} onHover={hoverKind} />
    }
    if (isGpuDirectEffect(p.kind)) {
      return <EffectCardGpu key={p.kind} preset={p} selected={activeKind === p.kind} favorite={favoriteSet.has(p.kind)} fps={cardFps} onSelect={applyFromPreview} onToggleFavorite={onToggleFavorite} onHover={hoverKind} />
    }
    return <EffectCard key={p.kind} preset={p} selected={activeKind === p.kind} favorite={favoriteSet.has(p.kind)} fps={cardFps} onSelect={applyFromPreview} onToggleFavorite={onToggleFavorite} onHover={hoverKind} />
  }

  // R164.1 (S1): the curated strip — up to 12 data-driven picks (default
  // profile + classics + favorites + recents) so the everyday 80% is one
  // glance away, replacing the old favorites-only row.
  const curatedPresets = useMemo(() => {
    return curatedKinds
      .map((kind) => effectPresets.find((preset) => preset.kind === kind))
      .filter((preset): preset is (typeof effectPresets)[number] => Boolean(preset))
  }, [curatedKinds])

  // R164.1 (S1): tabs → search + tag filter. A non-empty query searches the
  // whole 55 (label/description/kind id); otherwise the active tag filters —
  // keeping the R39 mount budget (one category's cards live at a time, ≤20).
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState<(typeof CATEGORIES)[number]['labelKey']>(CATEGORIES[0].labelKey)
  const trimmed = query.trim().toLowerCase()
  const searchedPresets = useMemo(() => {
    if (!trimmed) return null
    return effectPresets.filter((p) => {
      const label = presetLabel(p, t).toLowerCase()
      const desc = presetDescription(p, t).toLowerCase()
      return label.includes(trimmed) || desc.includes(trimmed) || p.kind.includes(trimmed)
    })
  }, [trimmed, t])
  const currentCategory = CATEGORIES.find((cat) => cat.labelKey === activeTag) ?? CATEGORIES[0]
  const gridPresets = searchedPresets ?? effectPresets.filter((p) => (currentCategory.kinds as readonly string[]).includes(p.kind))

  return (
    <div className="effects-view">
      <header className="effects-view-header">
        {/* R189 Q-5: topbar already shows '效果库' — the 26px in-view H1
            duplicate (and its off-ramp font rule) is gone. */}
        <p className="eyebrow">{t('effects.eyebrow')}</p>
      </header>

      {/* R164.2 (S2) + R225: preview pill — fixed overlay (mounting in-flow
          pushed the grid away from the pointer → flicker loop); hover retains
          itself so the 应用 button is reachable. Click commits, Esc restores. */}
      {previewingKind && (() => {
        const preset = effectPresets.find((p) => p.kind === previewingKind)
        return (
          <div
            className="fx-preview-pill"
            role="status"
            onPointerEnter={() => hoverEnter(null)}
            onPointerLeave={hoverLeave}
          >
            <span>{t('effects.previewing').replace('{name}', preset ? presetLabel(preset, t) : previewingKind)}</span>
            <button type="button" onClick={() => applyFromPreview(previewingKind)}>{t('effects.previewApply')}</button>
            <span className="fx-preview-pill-esc">{t('effects.previewEsc')}</span>
          </div>
        )
      })()}

      {/* R164.1: curated strip — favorites & recents are folded into its
          sources; the star toggle on every card remains the favorite path. */}
      {curatedPresets.length > 0 && (
        <section className="effects-category effects-curated-section">
          <h3 className="effects-category-label">
            {t('effects.curated')}
            <button type="button" className="fx-inspire-btn" onClick={onInspire} title={t('effects.inspireHint')}>
              🎲 {t('effects.inspire')}
            </button>
          </h3>
          <div className="effects-card-grid effects-curated-grid">
            {curatedPresets.map(renderCard)}
          </div>
        </section>
      )}

      <div className="effects-filter-bar">
        <input
          type="search"
          className="effects-search"
          placeholder={t('effects.searchPlaceholder')}
          value={query}
          aria-label={t('effects.searchLabel')}
          onChange={(e) => setQuery(e.target.value)}
        />
        {!trimmed && (
          <div className="effects-category-tabs" role="tablist">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.labelKey}
                type="button"
                role="tab"
                aria-selected={activeTag === cat.labelKey}
                className={`effects-category-tab ${activeTag === cat.labelKey ? 'active' : ''}`}
                onClick={() => setActiveTag(cat.labelKey)}
              >
                {t(cat.labelKey)}
                <span className="effects-category-tab-count">{cat.kinds.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <section className="effects-category">
        <div className="effects-card-grid">
          {gridPresets.map(renderCard)}
        </div>
        {gridPresets.length === 0 && (
          <p className="effects-empty-hint">{t('effects.searchNone')}</p>
        )}
      </section>
    </div>
  )
}
