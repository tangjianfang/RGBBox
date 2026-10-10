// ledBridge (R258) — game events → physical LED screen output.
//
// THE value-loop closer: RGBBox is a lighting client; its games should make
// the room react. The engine loop pauses overlay distribution when the games
// view is active (useEngineLoop.ts:204-207) — this bridge takes over that
// job, mapping game events to LED color patterns and pushing frames directly.
//
// Pure logic (no DOM/Electron) — the view layer calls onEvent() and
// generateFrame(); tests can drive both without a window.

export type GameLedEvent =
  | { type: 'hit'; source: 'player' | 'boss' }
  | { type: 'kill'; enemyColor?: [number, number, number] }
  | { type: 'levelup' }
  | { type: 'boss-enter' }
  | { type: 'boss-exit' }
  | { type: 'evolve' }
  | { type: 'death' }
  | { type: 'combo'; count: number }

interface TransientEffect {
  kind: GameLedEvent['type']
  startAt: number
  duration: number
  color: [number, number, number]
  /** for kill: the wave radius expansion speed */
  intensity: number
}

/** Colors per event type (RGB 0-255) */
const EVENT_COLORS: Record<string, [number, number, number]> = {
  hit: [255, 40, 40],        // red flash
  kill: [80, 255, 160],      // enemy-colored (fallback: accent green)
  levelup: [80, 180, 255],   // blue ring
  'boss-enter': [255, 30, 30], // red breathing (persistent while boss alive)
  'boss-exit': [80, 255, 160],
  evolve: [255, 255, 255],   // white flash
  death: [20, 20, 40],       // fade to dark
  combo: [255, 200, 60],     // gold spark
}

const DURATIONS: Record<string, number> = {
  hit: 200,
  kill: 150,
  levelup: 1000,
  'boss-enter': Infinity, // persists until boss-exit
  'boss-exit': 0,
  evolve: 500,
  death: 2000,
  combo: 120,
}

export interface LedBridge {
  onEvent(event: GameLedEvent): void
  /** Generate the current LED frame. `now` = performance.now() in ms. */
  generateFrame(now: number, columns: number, rows: number): {
    pixels: Uint8ClampedArray
    hasActive: boolean
  }
  /** Clear all effects (game exit). */
  reset(): void
}

export function createLedBridge(): LedBridge {
  const effects: TransientEffect[] = []
  let bossActive = false
  let deathAt = -1

  return {
    onEvent(event) {
      const now = performance.now()
      const kind = event.type
      if (kind === 'boss-enter') bossActive = true
      if (kind === 'boss-exit') {
        bossActive = false
        // remove persistent boss effect
        for (let i = effects.length - 1; i >= 0; i--) {
          if (effects[i].kind === 'boss-enter') effects.splice(i, 1)
        }
        return
      }
      if (kind === 'death') deathAt = now
      if (kind === 'kill' && event.enemyColor) {
        effects.push({ kind, startAt: now, duration: DURATIONS[kind], color: event.enemyColor, intensity: 1 })
        return
      }
      effects.push({
        kind,
        startAt: now,
        duration: DURATIONS[kind] ?? 200,
        color: EVENT_COLORS[kind] ?? [80, 255, 160],
        intensity: kind === 'combo' ? Math.min(1, event.count / 20) : 1,
      })
    },

    generateFrame(now: number, columns: number, rows: number) {
      const pixels = new Uint8ClampedArray(columns * rows * 3)
      // prune expired
      for (let i = effects.length - 1; i >= 0; i--) {
        const e = effects[i]
        if (now - e.startAt > e.duration) effects.splice(i, 1)
      }
      const hasActive = effects.length > 0 || bossActive
      if (!hasActive) return { pixels, hasActive: false }

      // base: dark ambient (near-black with slight blue tint)
      for (let i = 0; i < columns * rows; i++) {
        pixels[i * 3] = 5
        pixels[i * 3 + 1] = 8
        pixels[i * 3 + 2] = 15
      }

      // boss breathing overlay (persistent red pulse)
      if (bossActive) {
        const phase = (Math.sin(now / 300) + 1) / 2 // 0..1, ~1Hz breathing
        const r = Math.round(20 + phase * 60)
        for (let i = 0; i < columns * rows; i++) {
          pixels[i * 3] = Math.max(pixels[i * 3], r)
          pixels[i * 3 + 1] = Math.min(pixels[i * 3 + 1], 10)
          pixels[i * 3 + 2] = Math.min(pixels[i * 3 + 2], 10)
        }
      }

      // death fade: darken everything over 2s
      if (deathAt > 0) {
        const t = (now - deathAt) / 2000
        if (t < 1) {
          const dim = 1 - t
          for (let i = 0; i < pixels.length; i++) pixels[i] *= dim
        }
      }

      // transient effects
      for (const e of effects) {
        const t = Math.min(1, (now - e.startAt) / e.duration)
        const fade = 1 - t

        if (e.kind === 'kill' || e.kind === 'combo') {
          // radial wave from center
          const cx = columns / 2, cy = rows / 2
          const maxR = Math.hypot(cx, cy)
          const waveR = t * maxR
          for (let y = 0; y < rows; y++) {
            for (let x = 0; x < columns; x++) {
              const d = Math.hypot(x - cx, y - cy)
              const bandWidth = 1.5
              const band = Math.max(0, 1 - Math.abs(d - waveR) / bandWidth)
              if (band > 0) {
                const idx = (y * columns + x) * 3
                const str = band * fade * e.intensity
                pixels[idx] = Math.max(pixels[idx], e.color[0] * str)
                pixels[idx + 1] = Math.max(pixels[idx + 1], e.color[1] * str)
                pixels[idx + 2] = Math.max(pixels[idx + 2], e.color[2] * str)
              }
            }
          }
        } else if (e.kind === 'levelup') {
          // rainbow ring expanding from center
          const cx = columns / 2, cy = rows / 2
          const maxR = Math.hypot(cx, cy)
          const ringR = t * maxR
          for (let y = 0; y < rows; y++) {
            for (let x = 0; x < columns; x++) {
              const d = Math.hypot(x - cx, y - cy)
              const band = Math.max(0, 1 - Math.abs(d - ringR) / 2)
              if (band > 0) {
                const hue = ((d / maxR) * 360 + now / 5) % 360
                const [r, g, bch] = hslToRgb(hue / 360, 0.8, 0.5)
                const idx = (y * columns + x) * 3
                const str = band * fade
                pixels[idx] = Math.max(pixels[idx], r * str)
                pixels[idx + 1] = Math.max(pixels[idx + 1], g * str)
                pixels[idx + 2] = Math.max(pixels[idx + 2], bch * str)
              }
            }
          }
        } else if (e.kind === 'evolve') {
          // full white flash
          for (let i = 0; i < columns * rows; i++) {
            const idx = i * 3
            const v = 255 * fade
            pixels[idx] = Math.max(pixels[idx], v)
            pixels[idx + 1] = Math.max(pixels[idx + 1], v)
            pixels[idx + 2] = Math.max(pixels[idx + 2], v)
          }
        } else if (e.kind === 'hit') {
          // edge glow (red from all edges inward)
          for (let y = 0; y < rows; y++) {
            for (let x = 0; x < columns; x++) {
              const d = Math.min(x, y, columns - 1 - x, rows - 1 - y)
              const edge = Math.max(0, 1 - d / 3)
              if (edge > 0) {
                const idx = (y * columns + x) * 3
                const str = edge * fade
                pixels[idx] = Math.max(pixels[idx], e.color[0] * str)
                pixels[idx + 1] = Math.max(pixels[idx + 1], e.color[1] * str)
                pixels[idx + 2] = Math.max(pixels[idx + 2], e.color[2] * str)
              }
            }
          }
        }
      }

      return { pixels, hasActive: true }
    },

    reset() {
      effects.length = 0
      bossActive = false
      deathAt = -1
    },
  }
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((h * 6) % 2 - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  const i = Math.floor(h * 6) % 6
  if (i === 0) { r = c; g = x } else if (i === 1) { r = x; g = c } else if (i === 2) { g = c; b = x }
  else if (i === 3) { g = x; b = c } else if (i === 4) { r = x; b = c } else { r = c; b = x }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}
