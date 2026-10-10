/**
 * staticTextMasks (R277) — static 文本层的画布掩码预计算(渲染进程侧)。
 *
 * Worker 路径(previewEngineWorker)一直在帧前预计算 textMasks 随 tick 传入;
 * ScreensaverView 直调 renderPreviewFrame(IPC)时漏传——主进程 engine 退回
 * 5×7 位图字体,中文层渲染成 '?' (REVIEW-engine TA4)。抽公共函数供两处用。
 */
import { computeTextMask } from '../canvasTextMask'
import type { Profile, Scene } from '../../../shared/types'

/** 场景内全部启用的 static 文本层 → { [layer.id]: mask }。 */
export function staticTextMasks(profile: Profile, scene: Scene | undefined): Record<string, boolean[]> {
  const masks: Record<string, boolean[]> = {}
  if (!scene) return masks
  for (const layer of scene.layers) {
    if (!layer.enabled || layer.kind !== 'static') continue
    const text = String(layer.parameters.text ?? '')
    if (!text.trim()) continue
    masks[layer.id] = computeTextMask(
      text,
      profile.sampling.columns,
      profile.sampling.rows,
      Number(layer.parameters.textX ?? 0.5),
      Number(layer.parameters.textY ?? 0.5),
      Number(layer.parameters.textScale ?? 1),
      Number(layer.parameters.textWeight ?? 400)
    )
  }
  return masks
}
