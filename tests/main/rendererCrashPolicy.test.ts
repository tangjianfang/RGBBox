import { describe, expect, it } from 'vitest'
import { createRendererCrashPolicy } from '../../src/main/rendererCrashPolicy'

/**
 * R317c（REVIEW_2026-10-24 E-7 / 附录04 R-3）：renderer 崩溃重载退避策略。
 * 旧实现 render-process-gone 每次无条件 reload()——确定性崩溃 = 白屏闪烁
 * crash-loop。策略：60s 滑窗计数 ≥3 次 → stop（停止重载，主进程弹错误框指路
 * 日志）。计数只随时间窗衰减，不因 did-finish-load 重置。
 */
describe('R317c rendererCrashPolicy', () => {
  it('1-2 次崩溃 → reload；窗口内第 3 次 → stop', () => {
    const p = createRendererCrashPolicy()
    expect(p.record(0).action).toBe('reload')
    expect(p.record(1000).action).toBe('reload')
    const v = p.record(2000)
    expect(v.action).toBe('stop')
    expect(v.crashesInWindow).toBe(3)
  })

  it('stop 后窗口外新崩溃重新计数——不永久拉黑', () => {
    const p = createRendererCrashPolicy()
    p.record(0); p.record(1000); p.record(2000) // → stop
    // 62_000 时旧三条全部出窗（62_000-2_000 = 60_000 ≮ 60_000），从 1 重计
    const v = p.record(62_000)
    expect(v.action).toBe('reload')
    expect(v.crashesInWindow).toBe(1)
    expect(p.record(63_000).action).toBe('reload')
    expect(p.record(64_000).action).toBe('stop') // 新一轮满 3 再停
  })

  it('窗口边界：59s 前的崩溃仍在窗内连续计数（突发未歇不宽限）', () => {
    const p = createRendererCrashPolicy()
    p.record(0); p.record(1000); p.record(2000) // → stop
    expect(p.record(61_000).crashesInWindow).toBe(2) // t=2000 距 59s，仍计
    expect(p.record(61_500).action).toBe('stop') // 第 4 次仍在突发中 → 再 stop
  })

  it('reload 完成后再崩仍连续计数（loop 本体不因成功加载而宽限）', () => {
    const p = createRendererCrashPolicy()
    p.record(0); p.record(500) // 两次 reload 都"成功加载"后仍崩
    // 中间 did-finish-load 发生不调任何 API——下一次崩溃继续累计
    expect(p.record(1000).action).toBe('stop')
  })

  it('reset() 清零（保留给显式恢复入口）', () => {
    const p = createRendererCrashPolicy()
    p.record(0); p.record(1); p.record(2)
    p.reset()
    expect(p.record(3).action).toBe('reload')
    expect(p.record(4).action).toBe('reload')
  })

  it('参数可调（窗口/阈值）', () => {
    const p = createRendererCrashPolicy(10_000, 2)
    expect(p.record(0).action).toBe('reload')
    expect(p.record(5000).action).toBe('stop')
  })
})
