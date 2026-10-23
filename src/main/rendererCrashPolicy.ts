/**
 * rendererCrashPolicy — R317c（REVIEW_2026-10-24 E-7 / 附录04 R-3）。
 *
 * 旧实现（src/main/index.ts render-process-gone 处理）每次无条件
 * `webContents.reload()`：确定性崩溃（驱动 TDR、特定视频触发的原生解码器
 * 崩溃、OOM）= 白屏闪烁 crash-loop，每轮一条 error 日志、Crashpad dump
 * 持续落盘而用户无感知。
 *
 * 策略：60s 滑窗计数，≥3 次 → stop（停止重载；主进程弹原生错误框指路
 * userData/logs）。计数**只随时间窗衰减**，不因 did-finish-load 重置——
 * reload 完成后再崩正是 loop 本体；窗口外的新崩溃重新计数，不永久拉黑。
 * 纯函数模块（now 由调用方注入），供 tests/main/rendererCrashPolicy.test.ts。
 */

export interface CrashVerdict {
  action: 'reload' | 'stop'
  /** 本窗口内累计崩溃次数（含本次） */
  crashesInWindow: number
}

export function createRendererCrashPolicy(windowMs = 60_000, maxCrashes = 3) {
  let times: number[] = []
  return {
    /** 记录一次崩溃并给出处置决策。stop 由当前窗口计数直接推导（非粘滞
     *  标志）——突发老化出窗后自然解锁，不永久拉黑。 */
    record(now: number): CrashVerdict {
      times = times.filter((t) => now - t < windowMs)
      times.push(now)
      return { action: times.length >= maxCrashes ? 'stop' : 'reload', crashesInWindow: times.length }
    },
    /** 显式恢复入口（如未来挂「重新加载」按钮 / 长时间稳定后自动解锁）。 */
    reset(): void {
      times = []
    },
  }
}
