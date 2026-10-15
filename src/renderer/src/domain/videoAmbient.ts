/**
 * videoAmbient (R299) — 视频画面 → 灯墙同步的纯域部分。
 *
 * 视频站(直播/播放器)按引擎网格采样 <video> 画面,经 rgbFrameFromImageData
 * 转 RGB 后写入 externalFrameRef,由 useEngineLoop 在 screen-ambient 效果
 * 激活时优先消费(外部帧优先于整屏 IPC 捕获)——「video-ambient 直连」,
 * 评审 08 判定的差异化最高项,复用 screen-ambient 消费端零新增效果。
 */
import type { RgbFrame } from '../../../shared/types'

/** canvas ImageData(RGBA) → 引擎 RgbFrame(RGB)。空数据返回 null。 */
export function rgbFrameFromImageData(
  img: { data: Uint8ClampedArray; width: number; height: number },
  generatedAt: number,
): RgbFrame | null {
  const n = img.width * img.height
  if (n === 0 || img.data.length < n * 4) return null
  const pixels = new Uint8ClampedArray(n * 3)
  for (let i = 0; i < n; i++) {
    pixels[i * 3] = img.data[i * 4]
    pixels[i * 3 + 1] = img.data[i * 4 + 1]
    pixels[i * 3 + 2] = img.data[i * 4 + 2]
  }
  return { columns: img.width, rows: img.height, pixels, generatedAt }
}
