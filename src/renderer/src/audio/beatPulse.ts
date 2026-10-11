/**
 * beatPulse (R286) — 音频可视化的「灵魂动感」引擎(纯域,无 canvas)。
 *
 * 用户主诉:「要有灵魂的动感,要跳动起来,视觉震撼地表达音乐」——七个可视化
 * 此前只做实时贴值(生硬),缺节拍驱动。本模块两件套:
 *  ① BeatPulse:低频能量短/长窗比较的节拍检测 + 指数衰减包络(一次触发,
 *    220ms 内可感知的「冲击感」波形,供所有视图共享);
 *  ② SpectrumDynamics:频谱条的 attack 快/release 慢平滑 + 峰值保持帽
 *    (重力下落)——业界频谱「跳动」的标准手感。
 */

export interface BeatPulseState {
  /** 低频能量短窗 EMA(快跟随)。 */
  fast: number
  /** 低频能量长窗 EMA(基线)。 */
  slow: number
  /** 当前脉冲包络 0..1(触发置 1,指数衰减)。 */
  pulse: number
  /** 上次触发时刻(ms),用于不应期。 */
  lastBeatAt: number
}

export function createBeatPulse(): BeatPulseState {
  return { fast: 0, slow: 0, pulse: 0, lastBeatAt: -1e9 }
}

/** 节拍不应期(ms):低于此间隔不重复触发(≈ 333BPM 上限,防抖)。 */
export const BEAT_REFRACTORY_MS = 180
/** 触发灵敏度:短/长窗能量比阈值。 */
export const BEAT_RATIO_THRESHOLD = 1.35
/** 绝对能量门:fast 低于此值不触发(静音尾巴上 ratio 虚高不误报)。 */
export const BEAT_ABS_GATE = 0.15
/** 包络衰减时间常数(ms)。 */
export const BEAT_DECAY_TAU = 220

/** 喂一帧频谱,更新并返回当前 pulse(0..1)。nowMs 单调递增时钟。 */
export function feedBeatPulse(state: BeatPulseState, freqData: Uint8Array, nowMs: number): number {
  // 低频能量:前 ~8 个 bin(20Hz-20kHz FFT 下约 <300Hz)
  let bass = 0
  const n = Math.min(8, freqData.length)
  for (let i = 0; i < n; i++) bass += freqData[i] / 255
  bass /= Math.max(1, n)

  // 双窗 EMA:快窗贴拍,慢窗做基线
  state.fast = state.fast * 0.55 + bass * 0.45
  state.slow = state.slow * 0.92 + bass * 0.08

  const dt = Math.max(0, nowMs - state.lastBeatAt)
  if (state.slow > 0.004 && state.fast > BEAT_ABS_GATE && state.fast / state.slow > BEAT_RATIO_THRESHOLD && dt > BEAT_REFRACTORY_MS) {
    state.pulse = 1
    state.lastBeatAt = nowMs
  } else {
    // 指数衰减包络
    const sinceBeat = nowMs - state.lastBeatAt
    state.pulse = Math.max(0, Math.exp(-sinceBeat / BEAT_DECAY_TAU))
  }
  return state.pulse
}

// ── 频谱条动力学:attack 快/release 慢 + 峰值保持帽 ────────────────────────

export interface SpectrumDynamics {
  /** 平滑后的条高(attack 快上,release 慢下)。 */
  smooth: Float32Array
  /** 峰值保持帽位置(重力下落)。 */
  peaks: Float32Array
  /** 上次步进时刻(ms)。 */
  lastAt: number
  /** 本帧 dt(s)缓存——同帧 64/128 条共享,首条计算后其余复用。 */
  frameDt: number
  /** R286b: 显示域自适应增益(慢衰减帧峰值跟踪;响段≈真实,弱奏段抬升观感)。 */
  gain: number
  /** 增益步进的独立时钟(条循环不经过的场景——如声谱图——也能得到正确 dt)。 */
  gainLastAt: number
}

export function createSpectrumDynamics(bars: number): SpectrumDynamics {
  // gain 从下限起步:首帧即跟随真实帧峰值,不残留 1.0 的初始衰减尾巴
  return { smooth: new Float32Array(bars), peaks: new Float32Array(bars), lastAt: -1e9, frameDt: 0, gain: DISPLAY_GAIN_FLOOR, gainLastAt: -1e9 }
}

// ── 显示域自适应增益(R286b) ─────────────────────────────────────────────
// 真机走查实锤:合成钢琴(单音指数衰减)在衰减尾段频谱柱趴在 ~10% 高度,
// 声谱图近黑——机制诚实但观感死。商业可视化器标配的解法:以「最近 ~1.5s
// 内最强条」为增益基准归一,弱奏段自动抬升、响段真实还原;静音零值仍为零。

/** 增益下限:低于此值不再除(静音噪音门之下不抬升)。 */
export const DISPLAY_GAIN_FLOOR = 0.22
/** 增益衰减时间常数(s):静音后增益缓缓落回下限,而非瞬间。 */
export const DISPLAY_GAIN_TAU = 1.6
/** 噪声门:低于此值的条视为静音,不被增益抬亮。 */
export const DISPLAY_NOISE_GATE = 0.05

/**
 * 每帧绘制前调用一次:frameMax 为本帧所有条目标峰值的最大值(0..1)。
 * gain 即时跟随响段、按 τ=1.6s 指数衰减、永不低于下限。
 * 用独立的 gainLastAt 推 dt(不与条循环的 lastAt 耦合)。
 */
export function stepDisplayGain(dyn: SpectrumDynamics, frameMax: number, nowMs: number): number {
  const dt = Math.min(100, Math.max(0, nowMs - dyn.gainLastAt)) / 1000
  dyn.gainLastAt = nowMs
  const decayed = dyn.gain * Math.exp(-dt / DISPLAY_GAIN_TAU)
  dyn.gain = Math.max(frameMax, decayed, DISPLAY_GAIN_FLOOR)
  return dyn.gain
}

/**
 * 原始条值 → 显示值:噪声门(0.05 以下视为静音,不抬升)+ 增益归一 +
 * γ=0.72 提亮(感知均匀)。v=gain 时显示 1.0;静音恒 0。
 */
export function shapeDisplayValue(v: number, gain: number): number {
  const gated = v < DISPLAY_NOISE_GATE ? 0 : v
  return Math.pow(Math.min(1, gated / gain), 0.72)
}

/**
 * 步进一条:target 为本帧原始目标(0..1)。
 * attack(上升)系数 0.7 —— 拍来瞬间跳起;
 * release(下落)系数 0.18 —— 缓缓落回(「跳动」手感的核心);
 * 峰值帽:高于平滑值即吸附,否则按重力 1.4/s 下落(比条体慢一拍)。
 *
 * 时钟语义:nowMs 大于 lastAt 时为首条——计算本帧 dt 并缓存;同帧后续条
 * (nowMs 相同)复用 frameDt。真机实锤过的反例:逐条覆盖 lastAt 会让
 * 第 2..N 条 dt=0、attack 因子=0,整幅频谱永久冻结在 0。
 */
export function stepSpectrumBar(dyn: SpectrumDynamics, i: number, target: number, nowMs: number): { level: number; peak: number } {
  let dt: number
  if (nowMs > dyn.lastAt) {
    dt = Math.min(100, nowMs - dyn.lastAt) / 1000
    dyn.frameDt = dt
    dyn.lastAt = nowMs
  } else {
    dt = dyn.frameDt
  }
  const cur = dyn.smooth[i]
  const k = target > cur ? 0.7 : 0.18
  // 帧率无关逼近(60fps 下系数≈k;dt 大时收敛更快)
  const next = cur + (target - cur) * Math.min(1, k * (dt * 60))
  dyn.smooth[i] = next
  const peak = dyn.peaks[i]
  if (next >= peak) dyn.peaks[i] = next
  else dyn.peaks[i] = Math.max(next, peak - 1.4 * dt)
  return { level: dyn.smooth[i], peak: dyn.peaks[i] }
}
