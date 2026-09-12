/**
 * snipManager — R80 独立全局截图工具（主进程侧）。
 *
 * 触发（托盘「截图」/ 全局热键 Alt+A）后：先 desktopCapturer 冻结所有屏
 * （先截后开窗，窗口不遮屏），再每屏开 frameless 全屏置顶窗口显示冻结帧
 * （R74 screensaver 窗口模式），渲染端 SnipView 负责拖选 + 就地标注。
 * 已知边界：secure desktop（锁屏/UAC）截不到 → 黑帧，ESC 可退。
 */
import type { CaptureEntry } from './captureStore'

export const SNIP_HOTKEY = 'Alt+A'

export interface SnipSourceLike { id: string; display_id?: string }
export interface DisplayLike { id: number; bounds: { width: number; height: number }; scaleFactor: number }

/** R80.2: source↔display 配对（按 display_id 字符串匹配；未匹配的 display 跳过）。 */
export function matchDisplayToSource(
  sources: SnipSourceLike[],
  displays: Array<{ id: number }>,
): Map<number, SnipSourceLike> {
  const out = new Map<number, SnipSourceLike>()
  for (const d of displays) {
    const src = sources.find((s) => s.display_id === String(d.id))
    if (src) out.set(d.id, src)
  }
  return out
}

/** R80.2: 冻结帧物理像素尺寸（bounds DIP × scaleFactor）。 */
export function physicalThumbSize(d: DisplayLike): { width: number; height: number } {
  return {
    width: Math.round(d.bounds.width * d.scaleFactor),
    height: Math.round(d.bounds.height * d.scaleFactor),
  }
}

/** R80.2: 完成动作路由（纯决策）：copy=剪贴板+落档，save=落档+下载（渲染端）。 */
export function resolveFinishAction(action: 'copy' | 'save'): { clipboard: boolean; addCapture: boolean; download: boolean } {
  return { clipboard: action === 'copy', addCapture: true, download: action === 'save' }
}

// ── 会话层（R80.2/R80.3 实现，见下方） ─────────────────────────────────

export type SnipDeps = { addPng: (dataUrl: string, kind: CaptureEntry['kind']) => CaptureEntry | null }
