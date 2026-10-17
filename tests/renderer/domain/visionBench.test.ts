// R306/T2: 深度体检计分纯函数 —— planBench 固定时间线 + scoreBench 六词
// 召回/确认延迟/主混淆对（吃 T1 录制的帧+事件），并排 R237 实验室基线。
// node 环境（domain 纯函数，零 DOM）。
import { describe, it, expect } from 'vitest'
import {
  planBench, scoreBench, DEFAULT_BENCH_GATES,
  type RecordedEventLike, type RecordedFrameLike,
} from '../../../src/renderer/src/domain/visionBench'

/** one open-palm hand far apart (pinch ratio ≈ 1.4) or pinched (≈ 0.1) */
function palmFrames(from: number, to: number, open: boolean, step = 100): RecordedFrameLike[] {
  const out: RecordedFrameLike[] = []
  for (let t = from; t <= to; t += step) {
    const lm = Array.from({ length: 21 }, () => [0.5, 0.5])
    lm[0] = [0.40, 0.60]; lm[9] = [0.50, 0.50] // wrist→middle-MCP scale = 0.141
    if (open) { lm[4] = [0.70, 0.50]; lm[8] = [0.50, 0.30] } // thumb/index spread
    else { lm[4] = [0.48, 0.52]; lm[8] = [0.49, 0.51] } // tips together
    out.push({ t, hands: [{ lm, score: 0.9, h: 'Right' }], face: null })
  }
  return out
}

const ev = (t: number, e: Partial<RecordedEventLike> & { kind: string }): RecordedEventLike =>
  ({ t, down: true, key: null, ...e }) as RecordedEventLike

describe('domain/visionBench (R306/T2)', () => {
  it('planBench: 6 词 × N 窗固定时间线，marks 与 USER_VOCAB 同序同 id，总时长自洽', () => {
    const plan = planBench()
    expect(plan.steps.length).toBe(18) // 6 words × 3 windows
    const words = [...new Set(plan.steps.map((s) => s.word))]
    expect(words).toEqual(['dir8', 'pinch', 'palm', 'chord-menu', 'chord-light', 'double-pinch'])
    expect(plan.marks.length).toBe(18)
    expect(plan.marks[0]).toEqual({ gesture: 'dir8', from: plan.steps[0].from, to: plan.steps[0].to })
    // windows never overlap; rest gap between consecutive windows of a word
    const [a, b] = plan.steps
    expect(b.from).toBeGreaterThanOrEqual(a.to)
    expect(plan.totalMs).toBeGreaterThanOrEqual(plan.steps[plan.steps.length - 1].to)
    // fast override shrinks the run (E2E seam uses this)
    const fast = planBench({ windowsPerWord: 1, windowMs: 800, restMs: 200, leadMs: 100 })
    expect(fast.steps.length).toBe(6)
    expect(fast.totalMs).toBeLessThan(8000)
  })

  it('scoreBench: pinch 全命中 → recall 1、latencyMean=命中时刻-窗起、无混淆、判定 pass', () => {
    const plan = planBench({ windowsPerWord: 1, windowMs: 2000, restMs: 100, leadMs: 100 })
    const pinchMark = plan.marks.find((m) => m.gesture === 'pinch')!
    const events = [ev(pinchMark.from + 600, { kind: 'pinch' })]
    const rep = scoreBench({ frames: [], events, marks: plan.marks })
    const pinch = rep.words.find((w) => w.word === 'pinch')!
    expect(pinch.hits).toBe(1)
    expect(pinch.recall).toBe(1)
    expect(pinch.latencyMean).toBe(600)
    expect(pinch.confusions).toEqual([])
    expect(rep.extraFires).toBe(0)
    expect(rep.pass).toBe(false) // other 5 words missed → overall recall fails
    const overall = rep.overall
    expect(overall.recall).toBeCloseTo(1 / 6)
  })

  it('dir8 收任意扇区；double-pinch 收 apart 或 together；chord 词按 name 区分', () => {
    const plan = planBench({ windowsPerWord: 1, windowMs: 2000, restMs: 100, leadMs: 100 })
    const mk = (g: string) => plan.marks.find((m) => m.gesture === g)!
    const events = [
      ev(mk('dir8').from + 300, { kind: 'direction', dir: 'up-left' }),
      ev(mk('double-pinch').from + 300, { kind: 'hands', name: 'together' }),
      ev(mk('chord-menu').from + 300, { kind: 'chord', name: 'menu' }),
      ev(mk('chord-light').from + 300, { kind: 'chord', name: 'light' }),
    ]
    const rep = scoreBench({ frames: [], events, marks: plan.marks })
    for (const w of ['dir8', 'double-pinch', 'chord-menu', 'chord-light']) {
      const row = rep.words.find((r) => r.word === w)!
      expect(row.hits, w).toBe(1)
    }
  })

  it('错词命中记为主混淆对：chord-menu 窗内亮成 chord-light → 该窗 miss + confusion 对', () => {
    const plan = planBench({ windowsPerWord: 1, windowMs: 2000, restMs: 100, leadMs: 100 })
    const mk = (g: string) => plan.marks.find((m) => m.gesture === g)!
    const events = [ev(mk('chord-menu').from + 500, { kind: 'chord', name: 'light' })]
    const rep = scoreBench({ frames: [], events, marks: plan.marks })
    const menu = rep.words.find((w) => w.word === 'chord-menu')!
    expect(menu.hits).toBe(0)
    expect(menu.confusions).toEqual([{ fired: 'chord-light', count: 1 }])
    // the same event does NOT count as a chord-light hit (wrong window)
    expect(rep.words.find((w) => w.word === 'chord-light')!.hits).toBe(0)
  })

  it('palm 从帧复算：开掌比 >0.85 持续 ≥700ms 记命中，延迟=确认时刻-窗起；400ms 不算', () => {
    const plan = planBench({ windowsPerWord: 1, windowMs: 3000, restMs: 100, leadMs: 100 })
    const mk = (g: string) => plan.marks.find((m) => m.gesture === g)!
    const p = mk('palm')
    const frames = palmFrames(p.from, p.to, true) // open the whole window
    const rep = scoreBench({ frames, events: [], marks: plan.marks })
    const palm = rep.words.find((w) => w.word === 'palm')!
    expect(palm.hits).toBe(1)
    expect(palm.latencyMean).toBe(700) // sustain completes 700ms after window opens
    // too short: open only the first 400ms
    const short = palmFrames(p.from, p.from + 400, true).concat(palmFrames(p.from + 500, p.to, false))
    const rep2 = scoreBench({ frames: short, events: [], marks: plan.marks })
    expect(rep2.words.find((w) => w.word === 'palm')!.hits).toBe(0)
  })

  it('窗外多余触发（settle 之后）计入 extraFires 并挂门禁', () => {
    const plan = planBench({ windowsPerWord: 1, windowMs: 1500, restMs: 100, leadMs: 100 })
    const last = plan.marks[plan.marks.length - 1]
    const events = [
      ev(last.to + 800 + DEFAULT_BENCH_GATES.latencyMaxMs * 0 + 5000, { kind: 'pinch' }),
      ev(last.to + 5600, { kind: 'pinch' }),
    ]
    const rep = scoreBench({ frames: [], events, marks: plan.marks, gates: { extraMax: 1 } })
    expect(rep.extraFires).toBe(2)
    expect(rep.failures.some((f) => f.includes('extra'))).toBe(true)
    expect(rep.pass).toBe(false)
  })

  it('每词并排 R237 实验室基线（recall 1.00/162 格）与 0.9 门禁', () => {
    const plan = planBench({ windowsPerWord: 1, windowMs: 1000, restMs: 50, leadMs: 50 })
    const rep = scoreBench({ frames: [], events: [], marks: plan.marks })
    for (const w of rep.words) {
      expect(w.baseline).toEqual({ recall: 1, cells: 162, gate: 0.9 })
    }
    expect(rep.gates.recall).toBe(DEFAULT_BENCH_GATES.recall)
  })

  it('全六词命中且延迟达标 → 整体 pass', () => {
    const plan = planBench({ windowsPerWord: 1, windowMs: 3000, restMs: 100, leadMs: 100 })
    const mk = (g: string) => plan.marks.find((m) => m.gesture === g)!
    const events: RecordedEventLike[] = [
      ev(mk('dir8').from + 400, { kind: 'direction', dir: 'up' }),
      ev(mk('pinch').from + 400, { kind: 'pinch' }),
      ev(mk('chord-menu').from + 400, { kind: 'chord', name: 'menu' }),
      ev(mk('chord-light').from + 400, { kind: 'chord', name: 'light' }),
      ev(mk('double-pinch').from + 400, { kind: 'hands', name: 'apart' }),
    ]
    const p = mk('palm')
    const frames = palmFrames(p.from, p.to, true)
    const rep = scoreBench({ frames, events, marks: plan.marks })
    expect(rep.overall.recall).toBe(1)
    expect(rep.pass).toBe(true)
    expect(rep.failures).toEqual([])
  })
})
