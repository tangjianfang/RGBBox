/**
 * audioEnhance — R91.3 电影 EQ 预设（纯参数，零 WebAudio 依赖，可单测）。
 *
 * 预设只描述滤波器/压缩器参数；实际建链在 useVideoAudioEnhance（懒创建，
 * MediaElementSource 一经创建无法摘除 → 链路常驻，预设「关闭」= 全通 bypass）。
 * 不动音频工作站 R51 体系——本模块仅服务视频播放器。
 */

export type EnhancePresetId = 'off' | 'movie' | 'dialog' | 'night'

/** One biquad stage. Frequency in Hz, gain in dB. */
export interface EnhanceBand {
  type: BiquadFilterType
  freq: number
  q?: number
  gain?: number
}

/** DynamicsCompressor params (dB / ratio). */
export interface EnhanceCompressor {
  threshold: number
  knee: number
  ratio: number
  attack: number
  release: number
}

export interface EnhancePlan {
  /** Ordered biquad chain; empty = flat */
  bands: EnhanceBand[]
  /** Neutral compressor (ratio 1) = effectively bypassed */
  compressor: EnhanceCompressor
}

const NEUTRAL_COMP: EnhanceCompressor = { threshold: 0, knee: 0, ratio: 1, attack: 0.003, release: 0.25 }

export const ENHANCE_PRESETS: Readonly<Record<EnhancePresetId, EnhancePlan>> = {
  // 关闭：全通（链路仍在线，只是不动信号）
  off: { bands: [], compressor: NEUTRAL_COMP },
  // 影院：40Hz 以下切掉（低频轰隆/直流），极高频轻微补偿（影片混录衰减的空气感）
  movie: {
    bands: [
      { type: 'highpass', freq: 40, q: 0.7 },
      { type: 'highshelf', freq: 8000, q: 0.7, gain: 2 },
    ],
    compressor: NEUTRAL_COMP,
  },
  // 对白增强：100Hz 低切去轰隆 + 人声存在感频段（~2.8kHz）抬升 + 轻压缩把语声
  // 从配乐里顶出来——「人声不清晰」的主修档
  dialog: {
    bands: [
      { type: 'highpass', freq: 100, q: 0.7 },
      { type: 'peaking', freq: 2800, q: 1.0, gain: 4.5 },
    ],
    compressor: { threshold: -24, knee: 12, ratio: 2.5, attack: 0.01, release: 0.15 },
  },
  // 夜间模式：对白增强滤波 + 强压缩（小声听清、大声不炸）
  night: {
    bands: [
      { type: 'highpass', freq: 100, q: 0.7 },
      { type: 'peaking', freq: 2800, q: 1.0, gain: 3.5 },
    ],
    compressor: { threshold: -40, knee: 6, ratio: 8, attack: 0.003, release: 0.25 },
  },
}

/** Apply the ±12dB output gain to a plan (gain rides the output GainNode). */
export function clampEnhanceGain(db: number): number {
  return Math.min(12, Math.max(-12, db))
}

/** True when the plan alters the signal (used to keep UI/bypass honest). */
export function isPlanActive(plan: EnhancePlan): boolean {
  return plan.bands.length > 0 || plan.compressor.ratio !== 1
}
