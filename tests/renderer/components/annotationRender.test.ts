// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { renderAnnotations, buildMosaicStamp, buildMosaicTile } from '../../../src/renderer/src/components/video/annotationRender'
import { makeShape } from '../../../src/renderer/src/components/video/annotationModel'

/** 记录调用的 mock ctx 桩。 */
function mockCtx() {
  const calls: Array<{ op: string; args: unknown[] }> = []
  const rec = (op: string) => (...args: unknown[]) => { calls.push({ op, args }) }
  const ctx = {
    strokeStyle: '', fillStyle: '', lineWidth: 0, lineCap: '', lineJoin: '', font: '', textBaseline: '',
    globalCompositeOperation: '',
    strokeRect: rec('strokeRect'), beginPath: rec('beginPath'), ellipse: rec('ellipse'), stroke: rec('stroke'),
    moveTo: rec('moveTo'), lineTo: rec('lineTo'), closePath: rec('closePath'), fill: rec('fill'),
    arc: rec('arc'), fillText: rec('fillText'), fillRect: rec('fillRect'), drawImage: rec('drawImage'),
    save: rec('save'), restore: rec('restore'), setLineDash: rec('setLineDash'),
  } as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

/** happy-dom 无真 canvas：patch createElement 返回带 mock ctx 的假 canvas。 */
function patchCreateCanvas() {
  const stamps: Array<{ calls: Array<{ op: string; args: unknown[] }> }> = []
  const orig = document.createElement.bind(document)
  ;(document as unknown as Record<string, unknown>).createElement = (tag: string) => {
    if (tag !== 'canvas') return orig(tag)
    const { ctx, calls } = mockCtx()
    stamps.push({ calls })
    return { width: 0, height: 0, getContext: () => ctx }
  }
  return {
    restore: () => { (document as unknown as Record<string, unknown>).createElement = orig },
    stamps,
  }
}

describe('annotationRender', () => {
  it('text shape uses a legal canvas font string (R77.2: no "inherit")', () => {
    const { ctx, calls } = mockCtx()
    const s = makeShape('text', { x: 0, y: 0, w: 24, h: 30, width: 24, color: '#fff', text: 'hi' })
    renderAnnotations(ctx, [s])
    expect(ctx.font).toBe('24px system-ui, sans-serif')
    expect(ctx.font).not.toContain('inherit')
    expect(calls.some(c => c.op === 'fillText' && (c.args[0] as string) === 'hi')).toBe(true)
  })

  it('mosaic stamp samples the tile in IMAGE coordinates (source rect = bbox ± r)', () => {
    const patch = patchCreateCanvas()
    try {
      const tile = { width: 1920, height: 1080 } as HTMLCanvasElement
      const s = makeShape('mosaic', { points: [{ x: 10, y: 10 }, { x: 60, y: 40 }], width: 20 })
      const stamp = buildMosaicStamp(tile, s)
      expect(stamp).not.toBeNull()
      // tmp canvas 的第一次 drawImage(tile, sx, sy, sw, sh, ...)：
      // bbox = {x:10,y:10,w:50,h:30}，r = 20/2+2 = 12 → 源矩形 (−2, −2, 74, 54)
      const draw = patch.stamps[0].calls.find(c => c.op === 'drawImage')!
      expect(draw.args[1]).toBeCloseTo(-2)
      expect(draw.args[2]).toBeCloseTo(-2)
      expect(draw.args[3]).toBeCloseTo(74)
      expect(draw.args[4]).toBeCloseTo(54)
    } finally {
      patch.restore()
    }
  })

  it('mosaic stamp returns null without points or ctx', () => {
    const patch = patchCreateCanvas()
    try {
      expect(buildMosaicStamp({} as HTMLCanvasElement, makeShape('mosaic', {}))).toBeNull()
    } finally {
      patch.restore()
    }
  })

  it('selected shape draws dashed selection box + handle squares', () => {
    const { ctx, calls } = mockCtx()
    const s = makeShape('rect', { x: 0, y: 0, w: 10, h: 10 })
    renderAnnotations(ctx, [s], { selectedId: s.id })
    expect(calls.some(c => c.op === 'setLineDash')).toBe(true)
    expect(calls.some(c => c.op === 'fillRect')).toBe(true)   // 手柄
  })

  it('buildMosaicTile guards zero-size natural', () => {
    const patch = patchCreateCanvas()
    try {
      expect(buildMosaicTile({} as HTMLCanvasElement, { w: 0, h: 0 })).toBeNull()
    } finally {
      patch.restore()
    }
  })
})
