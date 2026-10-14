// R297 录制控制包 — 码率档位/系统声约束纯域单测（TDD 先红后绿）。
import { describe, it, expect } from 'vitest'
import { REC_BITRATE_TIERS, buildRecorderOptions, captureConstraintsWithAudio } from '../../../src/renderer/src/domain/recorderOptions'

describe('domain/recorderOptions 码率档位 (R297)', () => {
  it('四档映射: 流畅 2.5M / 均衡 5M / 高清 8M / 极致 16M', () => {
    expect(REC_BITRATE_TIERS.low).toBe(2_500_000)
    expect(REC_BITRATE_TIERS.balanced).toBe(5_000_000)
    expect(REC_BITRATE_TIERS.high).toBe(8_000_000)
    expect(REC_BITRATE_TIERS.max).toBe(16_000_000)
  })

  it('buildRecorderOptions 把档位传入 MediaRecorder 构造', () => {
    expect(buildRecorderOptions('video/webm;codecs=vp9,opus', 'high'))
      .toEqual({ mimeType: 'video/webm;codecs=vp9,opus', videoBitsPerSecond: 8_000_000 })
    expect(buildRecorderOptions(undefined, 'low'))
      .toEqual({ videoBitsPerSecond: 2_500_000 })
  })

  it('未知档位回退高清默认(不炸)', () => {
    expect(buildRecorderOptions('video/webm', 'bogus' as never).videoBitsPerSecond).toBe(8_000_000)
  })
})

describe('domain/recorderOptions 系统声约束 (R297)', () => {
  it('开系统声:getDisplayMedia 约束带 audio:true', () => {
    const c = captureConstraintsWithAudio({ frameRate: { ideal: 60 } }, true)
    expect(c.audio).toBe(true)
    expect(c.video).toEqual({ frameRate: { ideal: 60 } })
  })

  it('关系统声:audio 显式 false(评审 M 发现:旧版硬编码 audio:false 不可配)', () => {
    const c = captureConstraintsWithAudio({}, false)
    expect(c.audio).toBe(false)
  })
})
