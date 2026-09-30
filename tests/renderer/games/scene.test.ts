// R213: 六场景程序化背景模块测试——node 环境 + 最小记录式 ctx stub
// (canvas 2d 在 node 无实现,用记录调用的 mock 验证:可绘制/调用充足/确定性/视差/未知 id)。
import { describe, it, expect } from 'vitest'
import { SCENE_IDS, drawScene, parallaxShift, PARALLAX_AMP, PARALLAX_LAYERS, type SceneId } from '../../../src/renderer/src/games/scene'

interface Recorder {
  ctx: CanvasRenderingContext2D
  counts: Record<string, number>
  /** 全部方法调用序列 [name, ...args](确定性/动画/视差比对用)。 */
  ops: unknown[][]
  fillRectOps: unknown[][]
}

function makeCtx(): Recorder {
  const counts: Record<string, number> = {}
  const ops: unknown[][] = []
  const fillRectOps: unknown[][] = []
  const gradient = {
    addColorStop: (...args: unknown[]): void => {
      counts.addColorStop = (counts.addColorStop ?? 0) + 1
      ops.push(['addColorStop', ...args])
    },
  }
  const rec = (name: string): ((...args: unknown[]) => void) => (...args: unknown[]): void => {
    counts[name] = (counts[name] ?? 0) + 1
    ops.push([name, ...args])
  }
  const ctx = {
    canvas: {},
    fillRect: (...args: unknown[]): void => {
      rec('fillRect')(...args)
      fillRectOps.push(args)
    },
    strokeRect: rec('strokeRect'),
    fillText: rec('fillText'),
    beginPath: rec('beginPath'),
    closePath: rec('closePath'),
    moveTo: rec('moveTo'),
    lineTo: rec('lineTo'),
    quadraticCurveTo: rec('quadraticCurveTo'),
    bezierCurveTo: rec('bezierCurveTo'),
    arc: rec('arc'),
    ellipse: rec('ellipse'),
    fill: rec('fill'),
    stroke: rec('stroke'),
    save: rec('save'),
    restore: rec('restore'),
    translate: rec('translate'),
    rotate: rec('rotate'),
    scale: rec('scale'),
    createLinearGradient: (...args: unknown[]): typeof gradient => {
      counts.createLinearGradient = (counts.createLinearGradient ?? 0) + 1
      ops.push(['createLinearGradient', ...args])
      return gradient
    },
    createRadialGradient: (...args: unknown[]): typeof gradient => {
      counts.createRadialGradient = (counts.createRadialGradient ?? 0) + 1
      ops.push(['createRadialGradient', ...args])
      return gradient
    },
    // 样式属性(可赋值即可)
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    shadowColor: '',
    shadowBlur: 0,
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, counts, ops, fillRectOps }
}

const base = { w: 900, h: 520, t: 37.4, px: 450, py: 260 }

describe('R213 scenes (games/scene 六场景程序化背景)', () => {
  it('SCENE_IDS 恰为六个 id', () => {
    expect(SCENE_IDS).toEqual(['station', 'desert', 'snow', 'grass', 'ocean', 'fusion'])
  })

  it('六个 id 全部可绘制,且调用充足(≥1 渐变 + ≥20 个填充/描边图元)', () => {
    for (const id of SCENE_IDS) {
      const r = makeCtx()
      expect(() => drawScene(id, { ctx: r.ctx, ...base }), `scene ${id}`).not.toThrow()
      expect(r.counts.createLinearGradient ?? 0, `${id} 渐变`).toBeGreaterThanOrEqual(1)
      const primitives = (r.counts.fillRect ?? 0) + (r.counts.fill ?? 0) + (r.counts.stroke ?? 0)
      expect(primitives, `${id} 图元`).toBeGreaterThanOrEqual(20)
    }
  })

  it('确定性:同参数两次绘制,调用序列逐项一致(无 Math.random/帧间状态)', () => {
    for (const id of SCENE_IDS) {
      const a = makeCtx()
      const b = makeCtx()
      drawScene(id, { ctx: a.ctx, ...base })
      drawScene(id, { ctx: b.ctx, ...base })
      expect(a.ops, `scene ${id} 确定性`).toEqual(b.ops)
    }
  })

  it('时间动画:t 推进改变绘制调用(星漂/沙尘/雪落/草摆/气泡真的在动)', () => {
    for (const id of SCENE_IDS) {
      const a = makeCtx()
      const b = makeCtx()
      drawScene(id, { ctx: a.ctx, ...base, t: 10 })
      drawScene(id, { ctx: b.ctx, ...base, t: 15 })
      expect(a.ops, `scene ${id} 随 t 变化`).not.toEqual(b.ops)
    }
  })

  it('视差:px 变化位移背景元素(星场跟随,系数 ≤0.05)', () => {
    const a = makeCtx()
    const b = makeCtx()
    drawScene('station', { ctx: a.ctx, ...base, px: 100 })
    drawScene('station', { ctx: b.ctx, ...base, px: 800 })
    expect(a.fillRectOps).not.toEqual(b.fillRectOps)
  })

  it('未知场景 id 显式抛错(不静默 no-op)', () => {
    const r = makeCtx()
    expect(() => drawScene('volcano' as SceneId, { ctx: r.ctx, ...base })).toThrow(/unknown scene id/)
  })
})

// ── R218 U10: offset 视差 + darken 天色压暗(动态背景) ────────────────────────
describe('R218 U10 scenes offset/darken (视差动态背景)', () => {
  it('parallaxShift: offset 缺省为 0;位移 = -offset × 系数 × 振幅;三档系数在舒适区', () => {
    expect(parallaxShift(undefined, PARALLAX_LAYERS.near)).toEqual({ x: 0, y: 0 })
    const farShift = parallaxShift({ x: 1, y: 0 }, PARALLAX_LAYERS.far)
    expect(farShift.x).toBeCloseTo(-PARALLAX_LAYERS.far * PARALLAX_AMP, 5)
    expect(farShift.y).toBeCloseTo(0, 5)
    const midShift = parallaxShift({ x: -0.5, y: 0.25 }, PARALLAX_LAYERS.mid)
    expect(midShift.x).toBeCloseTo(0.5 * PARALLAX_LAYERS.mid * PARALLAX_AMP, 5)
    expect(midShift.y).toBeCloseTo(-0.25 * PARALLAX_LAYERS.mid * PARALLAX_AMP, 5)
    expect(PARALLAX_LAYERS.far).toBe(0.05)
    expect(PARALLAX_LAYERS.mid).toBe(0.1)
    expect(PARALLAX_LAYERS.near).toBe(0.15)
  })

  it('六场景带 offset 可调用,且视差层真的移动(调用序列变化)', () => {
    for (const id of SCENE_IDS) {
      const a = makeCtx()
      const b = makeCtx()
      drawScene(id, { ctx: a.ctx, ...base })
      drawScene(id, { ctx: b.ctx, ...base, offset: { x: 0.8, y: -0.6 } })
      expect(() => drawScene(id, { ctx: b.ctx, ...base, offset: { x: 0, y: 0 } }), `scene ${id} offset 绘制`).not.toThrow()
      expect(a.ops, `scene ${id} offset 响应`).not.toEqual(b.ops)
    }
  })

  it('darken: 整幅叠暗罩(收尾多一次全画布 fillRect)', () => {
    const a = makeCtx()
    const b = makeCtx()
    drawScene('station', { ctx: a.ctx, ...base })
    const before = a.fillRectOps.length
    drawScene('station', { ctx: b.ctx, ...base, darken: 0.4 })
    expect(b.fillRectOps.length).toBeGreaterThanOrEqual(before + 1)
    const last = b.fillRectOps[b.fillRectOps.length - 1]
    expect(last[2]).toBe(base.w)
    expect(last[3]).toBe(base.h)
  })
})
