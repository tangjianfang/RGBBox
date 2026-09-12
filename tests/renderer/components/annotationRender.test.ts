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
    save: rec('save'), restore: rec('restore'), setLineDash: rec('setLineDash'), translate: rec('translate'),
    rotate: rec('rotate'),
    measureText: (t: unknown) => { calls.push({ op: 'measureText', args: [t] }); return { width: 0 } },
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

  // ── R78: rotation / align / bold ───────────────────────────────────────

  it('rotated shape renders inside save→translate→rotate→restore (paired)', () => {
    const { ctx, calls } = mockCtx()
    const s = makeShape('rect', { x: 0, y: 0, w: 40, h: 20, rotation: 45 })
    renderAnnotations(ctx, [s])
    const ops = calls.map(c => c.op)
    expect(ops).toContain('save')
    expect(ops).toContain('restore')
    expect(ops).toContain('rotate')
    const saveIdx = ops.indexOf('save')
    const rotateIdx = ops.indexOf('rotate')
    const restoreIdx = ops.indexOf('restore')
    expect(rotateIdx).toBeGreaterThan(saveIdx)
    expect(restoreIdx).toBeGreaterThan(rotateIdx)
    // 选中态的 save/restore 独立配对（无 selectedId 时不画）
  })

  it('rotation=0 skips the rotate transform', () => {
    const { ctx, calls } = mockCtx()
    renderAnnotations(ctx, [makeShape('rect', { x: 0, y: 0, w: 10, h: 10 })])
    expect(calls.some(c => c.op === 'rotate')).toBe(false)
  })

  it('align=center measures each line and bold goes into the font string', () => {
    const { ctx, calls } = mockCtx()
    const s = makeShape('text', { x: 0, y: 0, w: 200, h: 30, width: 24, text: 'ab\ncd', align: 'center', bold: true })
    renderAnnotations(ctx, [s])
    expect(ctx.font).toBe('700 24px system-ui, sans-serif')
    // 每行各 measureText 一次，fillText 的 x 用 (w - lineWidth)/2 偏移（mock measureText 返回 0 → x=100）
    const measures = calls.filter(c => c.op === 'measureText')
    expect(measures.length).toBe(2)
    const fills = calls.filter(c => c.op === 'fillText')
    expect(fills[0].args[1]).toBe(100)
    expect(fills[1].args[1]).toBe(100)
  })
})
