import { describe, expect, it, vi } from 'vitest'
import {
  renderEffectPixel,
  getSolarSystemPlanets,
  getVirusShellGeometry,
  getProteinBackboneGeometry,
  getSpindleGeometry,
  getSynapseVesicles,
} from '../../src/engine/effects'
import { renderPreviewFrame } from '../../src/engine/previewEngine'
import { clampByte, clampUnit, hexToRgb, hslToRgb } from '../../src/engine/color'
import type { EffectLayer, Profile, RgbColor } from '../../src/shared/types'

/**
 * R266 — 引擎缓存上界与帧级几何缓存（REVIEW-engine-diagnostics TA1/TA2）。
 *
 * TA1: custom-paint / image-paint 的解析缓存从单槽改为按内容 Map（带上限 FIFO）。
 *      锁两点：①同帧多图层交替时每份内容只 JSON.parse 一次；②渲染结果与
 *      逐层单独渲染完全一致（纯缓存改造，零行为变化）。
 * TA2: 重科学系效果（solar-system / icosahedral-virus / protein-folding /
 *      mitosis-spindle / synapse-pulse）的帧不变几何按 (layerId, t, 形状参数)
 *      缓存。锁两点：①同键二次调用返回同一数组引用（缓存命中）、键变化重建；
 *      ②逐像素输出与 R266 前的原始公式逐位一致（参考实现逐字拷贝自改造前代码）。
 */

function makeLayer(
  id: string,
  kind: EffectLayer['kind'],
  parameters: Record<string, number | string | boolean>
): EffectLayer {
  return { id, name: id, kind, enabled: true, opacity: 1, blendMode: 'normal', parameters }
}

function paintPayload(cells: string[]): string {
  return JSON.stringify(cells)
}

function makeProfile(layers: EffectLayer[], columns = 6, rows = 4): Profile {
  return {
    id: 'r266-profile',
    name: 'R266',
    activeSceneId: 'scene-1',
    performanceMode: 'balanced',
    sampling: {
      columns,
      rows,
      fps: 30,
      smoothing: 0,
      brightnessLimit: 1.0,
      saturationBoost: 1.0,
      usePerformanceGuard: true,
      showGap: false,
    },
    scenes: [{ id: 'scene-1', name: 'Scene 1', displayIds: [1], layers }],
  }
}

// ── TA1: pixel-data content cache ────────────────────────────────────────────

describe('engine/effects pixel-data cache (R266 TA1)', () => {
  it('custom-paint: two layers alternating per pixel parse each payload exactly once', () => {
    const COLS = 6
    const ROWS = 4
    const cellsA = Array.from({ length: COLS * ROWS }, (_, i) => (i % 2 ? '#ff0000' : '#00ff00'))
    const cellsB = Array.from({ length: COLS * ROWS }, (_, i) => (i % 2 ? '#0000ff' : '#ffff00'))
    const payloadA = paintPayload(cellsA)
    const payloadB = paintPayload(cellsB)
    const layerA = makeLayer('paint-a', 'custom-paint', { pixelData: payloadA })
    const layerB = makeLayer('paint-b', 'custom-paint', { pixelData: payloadB })
    const payloads = new Set([payloadA, payloadB])

    const spy = vi.spyOn(JSON, 'parse')
    try {
      // Two full frames, layers interleaved per pixel (engine prep order).
      // Old single-slot cache: the slot flips every call → 96 parses.
      for (let frame = 0; frame < 2; frame++) {
        for (let y = 0; y < ROWS; y++) {
          for (let x = 0; x < COLS; x++) {
            const ctx = { x, y, columns: COLS, rows: ROWS, now: 1 }
            renderEffectPixel(layerA, ctx)
            renderEffectPixel(layerB, ctx)
          }
        }
      }
      const parseCount = spy.mock.calls.filter(([arg]) => payloads.has(arg as string)).length
      expect(parseCount).toBeLessThanOrEqual(2)
    } finally {
      spy.mockRestore()
    }
  })

  it('image-paint: two layers (incl. multi-image crossfade payload) parse each payload exactly once', () => {
    const COLS = 5
    const ROWS = 3
    const img0 = Array.from({ length: COLS * ROWS }, (_, i) => (i % 2 ? '#ff0000' : '#00ff00'))
    const img1 = Array.from({ length: COLS * ROWS }, (_, i) => (i % 3 ? '#00ffff' : '#ff00ff'))
    const payloadA = paintPayload([img0])
    const payloadB = paintPayload([img0, img1]) // crossfade path (2 images)
    const layerA = makeLayer('image-a', 'image-paint', { imageDataList: payloadA, animateTransition: false })
    const layerB = makeLayer('image-b', 'image-paint', { imageDataList: payloadB, transitionSpeed: 3 })
    const payloads = new Set([payloadA, payloadB])

    const spy = vi.spyOn(JSON, 'parse')
    try {
      for (let frame = 0; frame < 2; frame++) {
        for (let y = 0; y < ROWS; y++) {
          for (let x = 0; x < COLS; x++) {
            const ctx = { x, y, columns: COLS, rows: ROWS, now: 0.4 * frame }
            renderEffectPixel(layerA, ctx)
            renderEffectPixel(layerB, ctx)
          }
        }
      }
      const parseCount = spy.mock.calls.filter(([arg]) => payloads.has(arg as string)).length
      expect(parseCount).toBeLessThanOrEqual(2)
    } finally {
      spy.mockRestore()
    }
  })

  it('custom-paint: dual-layer frame matches per-layer isolated rendering exactly', () => {
    const COLS = 6
    const ROWS = 4
    const cellsA = Array.from({ length: COLS * ROWS }, (_, i) => (i % 2 ? '#ff0000' : '#00ff00'))
    const cellsB = Array.from({ length: COLS * ROWS }, (_, i) => (i % 2 ? '#0000ff' : '#ffff00'))
    const layerA = makeLayer('paint-a', 'custom-paint', { pixelData: paintPayload(cellsA) })
    const layerB = makeLayer('paint-b', 'custom-paint', { pixelData: paintPayload(cellsB) })

    const dual = renderPreviewFrame(makeProfile([layerA, layerB]))
    const onlyA = renderPreviewFrame(makeProfile([layerA]))
    const onlyB = renderPreviewFrame(makeProfile([layerB]))

    for (let i = 0; i < dual.pixels.length; i += 3) {
      // normal blend + opacity 1: the top layer replaces everything below
      expect(dual.pixels[i]).toBe(onlyB.pixels[i])
      expect(dual.pixels[i + 1]).toBe(onlyB.pixels[i + 1])
      expect(dual.pixels[i + 2]).toBe(onlyB.pixels[i + 2])
    }
    // Each isolated frame matches its payload content cell by cell.
    for (let i = 0; i < COLS * ROWS; i++) {
      const expectedA = hexToRgb(cellsA[i])
      const expectedB = hexToRgb(cellsB[i])
      expect([onlyA.pixels[i * 3], onlyA.pixels[i * 3 + 1], onlyA.pixels[i * 3 + 2]]).toEqual([
        expectedA.r,
        expectedA.g,
        expectedA.b,
      ])
      expect([onlyB.pixels[i * 3], onlyB.pixels[i * 3 + 1], onlyB.pixels[i * 3 + 2]]).toEqual([
        expectedB.r,
        expectedB.g,
        expectedB.b,
      ])
    }
  })

  it('pixel-data cache is bounded: oldest content is evicted after 16 entries', () => {
    const layer = makeLayer('paint-fifo', 'custom-paint', { pixelData: '[]' })
    const ctx = { x: 0, y: 0, columns: 1, rows: 1, now: 0 }
    const spy = vi.spyOn(JSON, 'parse')
    try {
      const payloads: string[] = []
      for (let i = 0; i < 17; i++) {
        const payload = paintPayload([`#${(i + 1).toString(16).padStart(2, '0')}0000`])
        payloads.push(payload)
        layer.parameters.pixelData = payload
        renderEffectPixel(layer, ctx)
      }
      const countOf = () => spy.mock.calls.filter(([arg]) => payloads.includes(arg as string)).length
      expect(countOf()).toBe(17) // every distinct content parsed exactly once

      // #17 and #16 are still cached (old single-slot code: #16 would re-parse)
      layer.parameters.pixelData = payloads[16]
      renderEffectPixel(layer, ctx)
      layer.parameters.pixelData = payloads[15]
      renderEffectPixel(layer, ctx)
      expect(countOf()).toBe(17)

      // #1 was evicted FIFO at the 16-entry cap → cache miss, re-parsed
      layer.parameters.pixelData = payloads[0]
      renderEffectPixel(layer, ctx)
      expect(countOf()).toBe(18)
    } finally {
      spy.mockRestore()
    }
  })

  it('corrupt pixelData renders black everywhere and is parsed only once', () => {
    const layer = makeLayer('paint-bad', 'custom-paint', { pixelData: '{"broken' })
    const spy = vi.spyOn(JSON, 'parse')
    try {
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 4; x++) {
          const c = renderEffectPixel(layer, { x, y, columns: 4, rows: 3, now: 0 })
          expect(c).toEqual({ r: 0, g: 0, b: 0 })
        }
      }
      // Old code re-attempted (and re-threw) the parse on every pixel.
      expect(spy).toHaveBeenCalledTimes(1)
    } finally {
      spy.mockRestore()
    }
  })
})

// ── TA2: frame-invariant geometry caches ─────────────────────────────────────

describe('engine/effects frame-geometry caches (R266 TA2)', () => {
  it('solar-system: same (layerId, t, density) → same array reference; any key change rebuilds', () => {
    const a = getSolarSystemPlanets('geom-solar', 1.23, 0.55)
    expect(getSolarSystemPlanets('geom-solar', 1.23, 0.55)).toBe(a)
    expect(getSolarSystemPlanets('geom-solar', 4.56, 0.55)).not.toBe(a) // different now
    expect(getSolarSystemPlanets('geom-other', 1.23, 0.55)).not.toBe(a) // different layer
    expect(getSolarSystemPlanets('geom-solar', 1.23, 0.9)).not.toBe(a) // param change
    expect(a).toHaveLength(8)
  })

  it('icosahedral-virus: same (layerId, t) → same array reference; changes rebuild', () => {
    const a = getVirusShellGeometry('geom-virus', 1.23)
    expect(getVirusShellGeometry('geom-virus', 1.23)).toBe(a)
    expect(getVirusShellGeometry('geom-virus', 4.56)).not.toBe(a)
    expect(getVirusShellGeometry('geom-other', 1.23)).not.toBe(a)
    expect(a).toHaveLength(12)
  })

  it('protein-folding: same (layerId, t, density) → same array reference; changes rebuild', () => {
    const a = getProteinBackboneGeometry('geom-protein', 1.23, 0.56)
    expect(getProteinBackboneGeometry('geom-protein', 1.23, 0.56)).toBe(a)
    expect(getProteinBackboneGeometry('geom-protein', 4.56, 0.56)).not.toBe(a)
    expect(getProteinBackboneGeometry('geom-other', 1.23, 0.56)).not.toBe(a)
    expect(getProteinBackboneGeometry('geom-protein', 1.23, 0.9)).not.toBe(a)
    expect(a).toHaveLength(47)
  })

  it('mitosis-spindle: same (layerId, t, density) → same geometry reference; changes rebuild', () => {
    const a = getSpindleGeometry('geom-spindle', 1.23, 0.56)
    expect(getSpindleGeometry('geom-spindle', 1.23, 0.56)).toBe(a)
    expect(getSpindleGeometry('geom-spindle', 4.56, 0.56)).not.toBe(a)
    expect(getSpindleGeometry('geom-other', 1.23, 0.56)).not.toBe(a)
    expect(getSpindleGeometry('geom-spindle', 1.23, 0.9)).not.toBe(a)
    expect(a.chromosomes).toHaveLength(10)
  })

  it('synapse-pulse: same (layerId, t, density) → same array reference; changes rebuild', () => {
    const a = getSynapseVesicles('geom-synapse', 1.23, 0.58)
    expect(getSynapseVesicles('geom-synapse', 1.23, 0.58)).toBe(a)
    expect(getSynapseVesicles('geom-synapse', 4.56, 0.58)).not.toBe(a)
    expect(getSynapseVesicles('geom-other', 1.23, 0.58)).not.toBe(a)
    expect(getSynapseVesicles('geom-synapse', 1.23, 0.9)).not.toBe(a)
    expect(a).toHaveLength(20)
  })
})

// ── TA2: pixel-exact equivalence against the pre-R266 math ───────────────────
// Reference implementations below are copied verbatim from effects.ts before
// R266 (per-pixel computation). The cached implementation must reproduce them
// bit-for-bit: hoisting must not change a single channel.

function refHash(seed: number): number {
  const s = Math.sin(seed) * 43758.5453123
  return s - Math.floor(s)
}

function refNormCoords(x: number, y: number, columns: number, rows: number) {
  const aspect = columns / Math.max(1, rows)
  return {
    nx: (x / Math.max(1, columns - 1) - 0.5) * aspect,
    ny: y / Math.max(1, rows - 1) - 0.5,
  }
}

function refSmoothstep(edge0: number, edge1: number, value: number): number {
  const range = edge1 - edge0
  const amount = clampUnit((value - edge0) / (Math.abs(range) < 0.0001 ? 0.0001 : range))
  return amount * amount * (3 - 2 * amount)
}

function refColorScale(color: RgbColor, scale: number): RgbColor {
  return { r: clampByte(color.r * scale), g: clampByte(color.g * scale), b: clampByte(color.b * scale) }
}

function refColorAdd(base: RgbColor, overlay: RgbColor, scale = 1): RgbColor {
  return {
    r: clampByte(base.r + overlay.r * scale),
    g: clampByte(base.g + overlay.g * scale),
    b: clampByte(base.b + overlay.b * scale),
  }
}

function refPointSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax
  const vy = by - ay
  const wx = px - ax
  const wy = py - ay
  const projection = clampUnit((wx * vx + wy * vy) / Math.max(0.0001, vx * vx + vy * vy))
  const dx = px - (ax + vx * projection)
  const dy = py - (ay + vy * projection)
  return Math.sqrt(dx * dx + dy * dy)
}

const REF_ICOSAHEDRON_VERTICES = (() => {
  const phi = (1 + Math.sqrt(5)) / 2
  const scale = 1 / Math.sqrt(1 + phi * phi)
  return [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
  ].map(([x, y, z]) => [x * scale, y * scale, z * scale] as const)
})()

const REF_ICOSAHEDRON_EDGES = [
  [0, 1], [0, 5], [0, 7], [0, 10], [0, 11], [1, 5], [1, 7], [1, 8], [1, 9],
  [2, 3], [2, 4], [2, 6], [2, 10], [2, 11], [3, 4], [3, 6], [3, 8], [3, 9],
  [4, 5], [4, 9], [4, 11], [5, 9], [5, 11], [6, 7], [6, 8], [6, 10],
  [7, 8], [7, 10], [8, 9], [10, 11],
] as const

function refSolarSystem(intensity: number, density: number, x: number, y: number, columns: number, rows: number, now: number): RgbColor {
  const { nx, ny } = refNormCoords(x, y, columns, rows)
  const time = now * 0.26
  const sunGlow = Math.exp(-(nx * nx + ny * ny) / 0.028)
  let color = refColorScale(hslToRgb(42, 1.0, 0.66), sunGlow * intensity)
  const orbitRadii = [0.10, 0.15, 0.21, 0.28, 0.38, 0.48, 0.58, 0.68]
  const periods = [0.24, 0.62, 1.0, 1.88, 5.0, 7.2, 10.5, 13.0]
  const hues = [35, 48, 208, 10, 32, 44, 188, 226]
  for (let orbitIndex = 0; orbitIndex < orbitRadii.length; orbitIndex++) {
    const orbitRadius = orbitRadii[orbitIndex] * (0.9 + density * 0.18)
    const eccentricity = 0.04 + orbitIndex * 0.012
    const ellipseRadius = Math.sqrt(Math.pow(nx / (orbitRadius * (1 + eccentricity)), 2) + Math.pow(ny / (orbitRadius * 0.72), 2))
    const orbitLine = Math.exp(-Math.pow((ellipseRadius - 1) / 0.05, 2)) * 0.22
    color = refColorAdd(color, hslToRgb(214, 0.65, 0.42), orbitLine)
    const planetAngle = time / periods[orbitIndex] * Math.PI * 2 + orbitIndex * 0.72
    const planetX = Math.cos(planetAngle) * orbitRadius * (1 + eccentricity)
    const planetY = Math.sin(planetAngle) * orbitRadius * 0.72
    const planetDistance = Math.sqrt((nx - planetX) ** 2 + (ny - planetY) ** 2)
    const planetSize = orbitIndex < 4 ? 0.032 : 0.042 + orbitIndex * 0.002
    const planetGlow = Math.exp(-Math.pow(planetDistance / planetSize, 2))
    color = refColorAdd(color, hslToRgb(hues[orbitIndex], 0.82, orbitIndex === 2 ? 0.68 : 0.62), planetGlow * intensity)
    const planetHalo = Math.exp(-Math.pow(planetDistance / (planetSize * 3.2), 2)) * 0.3
    color = refColorAdd(color, hslToRgb(hues[orbitIndex], 0.7, 0.5), planetHalo * intensity)
  }
  return color
}

function refIcosahedralVirus(intensity: number, density: number, hueShift: number, x: number, y: number, columns: number, rows: number, now: number): RgbColor {
  const { nx, ny } = refNormCoords(x, y, columns, rows)
  const time = now * 0.28
  const yaw = time * 1.4
  const pitch = Math.sin(time * 0.7) * 0.42
  const projected = REF_ICOSAHEDRON_VERTICES.map(([vx, vy, vz]) => {
    const x1 = vx * Math.cos(yaw) - vz * Math.sin(yaw)
    const z1 = vx * Math.sin(yaw) + vz * Math.cos(yaw)
    const y1 = vy * Math.cos(pitch) - z1 * Math.sin(pitch)
    const z2 = vy * Math.sin(pitch) + z1 * Math.cos(pitch)
    const perspective = 0.42 / Math.max(0.45, 1.35 - z2 * 0.55)
    return { x: x1 * perspective, y: y1 * perspective, z: z2 }
  })
  let shell = 0
  for (const [aIndex, bIndex] of REF_ICOSAHEDRON_EDGES) {
    const a = projected[aIndex]
    const b = projected[bIndex]
    const depth = clampUnit(0.55 + (a.z + b.z) * 0.20)
    shell += Math.exp(-Math.pow(refPointSegmentDistance(nx, ny, a.x, a.y, b.x, b.y) / 0.045, 2)) * depth
  }
  let capsid = 0
  for (let vertexIndex = 0; vertexIndex < projected.length; vertexIndex++) {
    const vertex = projected[vertexIndex]
    const distance = Math.sqrt((nx - vertex.x) ** 2 + (ny - vertex.y) ** 2)
    const spikePulse = 0.78 + Math.sin(time * 6 + vertexIndex * 1.7) * 0.22
    capsid += Math.exp(-Math.pow(distance / (0.058 + density * 0.018), 2)) * clampUnit(0.55 + vertex.z * 0.28) * spikePulse
  }
  const envelope = Math.exp(-(nx * nx + ny * ny) / 0.24) * 0.3
  let color = refColorScale(hslToRgb(168 + hueShift, 0.84, 0.52), shell * intensity * 0.6)
  color = refColorAdd(color, hslToRgb(312 + hueShift, 0.92, 0.64), capsid * intensity * 0.85)
  color = refColorAdd(color, hslToRgb(202 + hueShift, 0.62, 0.48), envelope * intensity)
  return color
}

function refProteinFolding(intensity: number, density: number, hueShift: number, x: number, y: number, columns: number, rows: number, now: number): RgbColor {
  const { nx, ny } = refNormCoords(x, y, columns, rows)
  const time = now * 0.24
  const proteinPoint = (u: number): { x: number; y: number; z: number } => {
    const angle = u * Math.PI * (5.4 + density * 2.2) + time * 1.1
    const fold = Math.sin(u * Math.PI * 3.0 + time * 0.8) * 0.20
    const x = (u - 0.5) * 1.04 + Math.sin(angle * 0.7) * 0.12
    const y = Math.sin(angle) * (0.18 + density * 0.05) + fold * 0.48
    const z = Math.cos(angle) * 0.5 + Math.sin(u * Math.PI * 7.0 - time) * 0.18
    return { x, y, z }
  }
  let backbone = 0
  let residueGlow = 0
  let helixBand = 0
  let previous = proteinPoint(0)
  for (let sampleIndex = 1; sampleIndex <= 46; sampleIndex++) {
    const u = sampleIndex / 46
    const current = proteinPoint(u)
    const depth = clampUnit(0.55 + current.z * 0.26)
    backbone += Math.exp(-Math.pow(refPointSegmentDistance(nx, ny, previous.x, previous.y, current.x, current.y) / 0.042, 2)) * depth
    if (sampleIndex % 5 === 0) {
      const distance = Math.sqrt((nx - current.x) ** 2 + (ny - current.y) ** 2)
      residueGlow += Math.exp(-Math.pow(distance / 0.075, 2)) * depth
    }
    const alphaMask = Math.pow(0.5 + 0.5 * Math.sin(u * Math.PI * 18 + time * 7), 4)
    helixBand += alphaMask * Math.exp(-Math.pow(refPointSegmentDistance(nx, ny, previous.x, previous.y, current.x, current.y) / 0.085, 2)) * depth * 0.28
    previous = current
  }
  let color = refColorScale(hslToRgb(204 + hueShift, 0.82, 0.55), backbone * intensity * 0.85)
  color = refColorAdd(color, hslToRgb(38 + hueShift, 0.90, 0.68), residueGlow * intensity * 0.95)
  color = refColorAdd(color, hslToRgb(294 + hueShift, 0.70, 0.60), helixBand * intensity)
  return color
}

function refMitosisSpindle(intensity: number, density: number, hueShift: number, x: number, y: number, columns: number, rows: number, now: number): RgbColor {
  const { nx, ny } = refNormCoords(x, y, columns, rows)
  const time = now * 0.30
  const stage = (Math.sin(time * Math.PI * 2) + 1) * 0.5
  const separation = 0.34 + stage * 0.16
  const poleA = { x: -separation, y: 0 }
  const poleB = { x: separation, y: 0 }
  let spindle = 0
  let chromosomes = 0
  for (let chromosomeIndex = 0; chromosomeIndex < 10; chromosomeIndex++) {
    const row = (chromosomeIndex - 4.5) / 12
    const wiggle = Math.sin(time * 5 + chromosomeIndex * 1.3) * 0.018
    const chromosomeX = (stage - 0.5) * 0.16 * Math.sign(row || 1) + wiggle
    const chromosomeY = row * (0.62 + density * 0.18)
    const chromosomeDistance = Math.sqrt((nx - chromosomeX) ** 2 + (ny - chromosomeY) ** 2)
    chromosomes += Math.exp(-Math.pow(chromosomeDistance / 0.075, 2))
    spindle += Math.exp(-Math.pow(refPointSegmentDistance(nx, ny, poleA.x, poleA.y, chromosomeX, chromosomeY) / 0.035, 2)) * 0.5
    spindle += Math.exp(-Math.pow(refPointSegmentDistance(nx, ny, poleB.x, poleB.y, chromosomeX, chromosomeY) / 0.035, 2)) * 0.5
  }
  const membraneRadius = Math.sqrt(nx * nx + (ny * 1.1) ** 2)
  const membrane = Math.exp(-Math.pow((membraneRadius - 0.62) / 0.05, 2)) * 0.3
  let color = refColorScale(hslToRgb(186 + hueShift, 0.82, 0.5), spindle * intensity)
  color = refColorAdd(color, hslToRgb(316 + hueShift, 0.92, 0.64), chromosomes * intensity)
  color = refColorAdd(color, hslToRgb(210 + hueShift, 0.52, 0.52), membrane * intensity)
  return color
}

function refSynapsePulse(intensity: number, density: number, hueShift: number, x: number, y: number, columns: number, rows: number, now: number): RgbColor {
  const { nx, ny } = refNormCoords(x, y, columns, rows)
  const time = now * 0.44
  const axon = Math.exp(-Math.pow((nx + 0.38) / 0.19, 2)) * refSmoothstep(0.5, 0.02, Math.abs(ny))
  const dendrite = Math.exp(-Math.pow((nx - 0.38) / 0.21, 2)) * refSmoothstep(0.52, 0.03, Math.abs(ny))
  const cleft = refSmoothstep(-0.18, 0.22, nx) * refSmoothstep(0.22, -0.18, nx) * refSmoothstep(0.42, 0.02, Math.abs(ny))
  const actionWave = Math.exp(-Math.pow((nx + 0.55 - ((time * 0.9) % 1.2)) / 0.1, 2)) * refSmoothstep(0.22, 0.0, Math.abs(ny))
  let neurotransmitters = 0
  for (let particleIndex = 0; particleIndex < 20; particleIndex++) {
    const seed = refHash(particleIndex * 31.7)
    const progress = (time * (0.48 + seed * 0.34) + seed) % 1
    const px = -0.16 + progress * 0.36
    const py = (refHash(particleIndex * 17.2) - 0.5) * (0.10 + density * 0.20) + Math.sin(progress * Math.PI * 2 + particleIndex) * 0.025
    const release = refSmoothstep(0.18, 0.34, actionWave + 0.2)
    neurotransmitters += Math.exp(-Math.pow(Math.sqrt((nx - px) ** 2 + (ny - py) ** 2) / 0.045, 2)) * release
  }
  let color = refColorScale(hslToRgb(214 + hueShift, 0.80, 0.48), (axon + dendrite) * intensity * 0.55)
  color = refColorAdd(color, hslToRgb(42 + hueShift, 1.0, 0.66), actionWave * intensity)
  color = refColorAdd(color, hslToRgb(172 + hueShift, 0.95, 0.62), neurotransmitters * intensity)
  color = refColorAdd(color, hslToRgb(288 + hueShift, 0.80, 0.52), cleft * intensity * 0.10)
  return color
}

describe('engine/effects cached geometry renders pixel-identical to pre-R266 math', () => {
  const COLS = 10
  const ROWS = 6
  const NOWS = [0, 1.37, 2.71]
  const DENSITIES = [0.2, 0.7]

  const cases = [
    {
      kind: 'solar-system' as const,
      parameters: { speed: 0.26, intensity: 0.86, density: 0.55 },
      ref: (d: number, _h: number, x: number, y: number, now: number) =>
        refSolarSystem(0.86, d, x, y, COLS, ROWS, now),
    },
    {
      kind: 'icosahedral-virus' as const,
      parameters: { speed: 0.28, intensity: 0.88, density: 0.62, hueShift: 135 },
      ref: (d: number, _h: number, x: number, y: number, now: number) =>
        refIcosahedralVirus(0.88, d, 135, x, y, COLS, ROWS, now),
    },
    {
      kind: 'protein-folding' as const,
      parameters: { speed: 0.24, intensity: 0.86, density: 0.56, hueShift: 42 },
      ref: (d: number, _h: number, x: number, y: number, now: number) =>
        refProteinFolding(0.86, d, 42, x, y, COLS, ROWS, now),
    },
    {
      kind: 'mitosis-spindle' as const,
      parameters: { speed: 0.30, intensity: 0.84, density: 0.56, hueShift: 0 },
      ref: (d: number, _h: number, x: number, y: number, now: number) =>
        refMitosisSpindle(0.84, d, 0, x, y, COLS, ROWS, now),
    },
    {
      kind: 'synapse-pulse' as const,
      parameters: { speed: 0.44, intensity: 0.88, density: 0.58, hueShift: 0 },
      ref: (d: number, _h: number, x: number, y: number, now: number) =>
        refSynapsePulse(0.88, d, 0, x, y, COLS, ROWS, now),
    },
  ]

  for (const { kind, parameters, ref } of cases) {
    it(`${kind}: every channel matches the original per-pixel formula`, () => {
      for (const now of NOWS) {
        for (const density of DENSITIES) {
          const layer = makeLayer(`equiv-${kind}-${density}`, kind, { ...parameters, density })
          for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
              const got = renderEffectPixel(layer, { x, y, columns: COLS, rows: ROWS, now })
              const expected = ref(density, 0, x, y, now)
              expect([got.r, got.g, got.b]).toEqual([expected.r, expected.g, expected.b])
            }
          }
        }
      }
    })
  }
})
