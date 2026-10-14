/**
 * recorderOptions (R297) — 录制控制包纯域:码率档位 + 系统声约束构造。
 *
 * 评审(REVIEW_2026-10-15-video)发现录制是「骨架级」:videoBitsPerSecond 与
 * recorder.pause 全仓 0 命中、屏幕捕获硬编码 audio:false 且界面无提示。
 * 本模块提供可单测的构造逻辑;UI 接线在 VideoStudioView。
 */

/** 码率档位(bps)。默认 high——直播预览典型分辨率下的质量/体积平衡。 */
export const REC_BITRATE_TIERS = {
  low: 2_500_000,      // 流畅:长录小体积
  balanced: 5_000_000, // 均衡
  high: 8_000_000,     // 高清(默认)
  max: 16_000_000,     // 极致:高运动画面
} as const

export type RecBitrateTier = keyof typeof REC_BITRATE_TIERS

/** MediaRecorder 构造选项;未知档位回退 high(不炸)。 */
export function buildRecorderOptions(
  mimeType: string | undefined,
  tier: RecBitrateTier | string,
): { mimeType?: string; videoBitsPerSecond: number } {
  const bitrate = REC_BITRATE_TIERS[tier as RecBitrateTier] ?? REC_BITRATE_TIERS.high
  return mimeType ? { mimeType, videoBitsPerSecond: bitrate } : { videoBitsPerSecond: bitrate }
}

/**
 * 屏幕捕获约束:按开关请求系统声(Windows loopback)。audio:true 在不支持
 * 的环境会拒绝整个 getDisplayMedia——调用方 catch 后用 audio:false 重试一次
 * 降级(参见 VideoStudioView startScreenCapture 的降级路径)。
 */
export function captureConstraintsWithAudio(
  video: MediaTrackConstraints | boolean,
  wantSystemAudio: boolean,
): MediaStreamConstraints {
  return { video, audio: wantSystemAudio }
}
