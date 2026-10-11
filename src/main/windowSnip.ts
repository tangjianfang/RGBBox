/**
 * windowSnip (R290.2) — 按窗口句柄截图：desktopCapturer 窗口源直出原生分辨率 PNG。
 *
 * 技术路线（REVIEW_2026-10-12 路线 A）：getSources({types:['window'],
 * thumbnailSize ≥ 窗物理尺寸}) 的 thumbnail 即窗口位图——主进程直出、零原生
 * 依赖、无需窗口可见（Chromium 合成器提供内容）。重试复用 snipManager 的
 * R112.3 重试器（Windows 销毁窗口后立刻捕获的 51s stall 实测坑）。
 * 最小化窗口 thumbnail 为空 → 'empty' 码（二期 win32 专项走 koffi
 * PrintWindow(PW_RENDERFULLCONTENT=3) 救场，见 PRD R290 二期）。
 */
import type { CaptureEntry, WindowSnipResult } from '../shared/types'
import { getSourcesWithRetry } from './snipManager'

/** thumbnailSize 封顶：一次调用覆盖 4K 级窗口；超出按比例缩小（罕见）。 */
export const WINDOW_SNIP_THUMB_CAP = 3840

/** captureStore 注入面（captureStore.ts createCaptureStore 返回值的 addBuffer 子集）。 */
export interface WindowSnipStore {
  addBuffer: (buf: Buffer, kind: CaptureEntry['kind'], name: string) => CaptureEntry | null
}

/**
 * 按 desktopCapturer 窗口源 id（形如 'window:<HWND>:0'，Windows 实现细节
 * 非跨平台承诺）截一张静态图，直落 captureStore（kind='window'）。
 * 不向 IPC 边界抛异常——所有失败以 {ok:false, code} 表达。
 */
export async function captureWindowBySourceId(sourceId: string, store: WindowSnipStore): Promise<WindowSnipResult> {
  try {
    const sources = await getSourcesWithRetry({
      types: ['window'],
      thumbnailSize: { width: WINDOW_SNIP_THUMB_CAP, height: WINDOW_SNIP_THUMB_CAP },
    })
    const hit = sources.find((s) => s.id === sourceId)
    if (!hit) return { ok: false, code: 'not-found' }
    const size = hit.thumbnail.getSize()
    if (size.width === 0 || size.height === 0) return { ok: false, code: 'empty' }
    const png = hit.thumbnail.toPNG()
    if (png.length === 0) return { ok: false, code: 'empty' }
    const entry = store.addBuffer(png, 'window', hit.name)
    if (!entry) return { ok: false, code: 'error' }
    return { ok: true, entry }
  } catch {
    // getDisplayMedia 权限拒绝在 mac 走别的路径；getSources 异常统一 error 码
    return { ok: false, code: 'error' }
  }
}
