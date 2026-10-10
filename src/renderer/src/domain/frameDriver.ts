/**
 * frameDriver (R270) — 预览帧驱动调度器。
 *
 * rAF 在窗口最小化/被遮挡时被 Chromium 节流停摆，且 R38 关闭 occluded-window
 * tracking 后 document.hidden 不再可靠——Preview3D 曾用纯 rAF，overlay 激活 +
 * 最小化时 3D 帧冻结在最后一帧（PRD R42.5 旧账，REVIEW-shell-loop A）。
 * 统一改为 setTimeout(16ms) 自调度驱动，与 useEngineLoop 的 R147 P2 哲学一致：
 * 定时器链不随窗口可见性停摆，代价仅是预览与合成不同步（预览画布可接受）。
 */

export const FRAME_DRIVER_INTERVAL_MS = 16

/** 启动下一帧驱动（≈60fps；循环体自续）。 */
export function startFrameDriver(loop: () => void): number {
  return window.setTimeout(loop, FRAME_DRIVER_INTERVAL_MS)
}

/** 停止帧驱动（handle 为 startFrameDriver 返回值；null 安全）。 */
export function stopFrameDriver(handle: number | null): void {
  if (handle !== null) window.clearTimeout(handle)
}
