/**
 * Shared media timestamp formatter (R71.8).
 *
 * The two studio views each kept a private near-identical copy — and the
 * audio side's lacked the hour tier (a 75-minute track displayed "75:23"
 * while the video side showed "1:15:23"). Pure function, no dependencies:
 * safe for main, preload and renderer alike.
 */

/** Format seconds as `m:ss`, or `h:mm:ss` once ≥ 1 hour. */
export function formatMediaTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
