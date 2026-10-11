/**
 * audioDrive3D (R287) — GPU 3D 效果的音频联动调制器(纯域,零 GLSL)。
 *
 * R283 灯效评审:6 个 GPU 3D shader 中 5 个仅 2 个可调参数,3D 灯效与音乐
 * 完全脱钩——「触发心灵」的最大杠杆。做法:Preview3D 帧循环从 App 同源的
 * `useAudioAnalyzer` 60Hz AudioData(与 CPU audio-beat 效果同一数据源)读
 * {beat, level},经包络+调制后改写 draw() 的 u_params,**shader 代码一字
 * 不动**(R284 教训:GLSL 方程改动在 headless-gl 下渲染全黑)。调制后的
 * params 经既有 EFFECT3D_CHANNEL 广播,overlay 窗(参数透传)自动跟随。
 *
 * 零回归保证:音频未激活/静音 → 驱动=0 → modulateParams3D 恒等返回。
 */

/** 脉冲包络时间常数(ms):AudioData.beat 是每 tick 瞬态尖峰,视觉需要
 *  可感知的持续脉冲——尖峰置 1,随后按 τ 指数衰减。 */
export const DRIVE3D_TAU = 180

export interface Drive3DState {
  /** 当前脉冲包络 0..1。 */
  pulse: number
  /** 上次喂帧时刻(ms)。 */
  lastAt: number
}

export function createDrive3D(): Drive3DState {
  return { pulse: 0, lastAt: -1e9 }
}

/**
 * 喂一帧音频,更新并返回脉冲包络 0..1。
 * `ad` 传 null/undefined(音频未激活)视为静音——包络照常衰减。
 * beat 钳到 0..1(上游钩子的瞬态 `max(0,(bass-prevBass)*5)` 可能超 1)。
 */
export function feedDrive3D(state: Drive3DState, ad: { beat: number; level: number } | null | undefined, nowMs: number): number {
  // 不做 100ms 钳制:包络语义=真实经过时间真实衰减(后台长间隙回来 → 脉冲
  // 已归零重新起拍,而非残留半个旧脉冲)。
  const dt = Math.max(0, nowMs - state.lastAt)
  state.lastAt = nowMs
  const beat = Math.max(0, Math.min(1, ad?.beat ?? 0))
  const decayed = state.pulse * Math.exp(-dt / DRIVE3D_TAU)
  state.pulse = Math.max(beat, decayed)
  return state.pulse
}

/** 调制两轴:pulse=节拍冲击(速度/色相),energy=响度(亮度/密度)。 */
export interface Drive3DAmount {
  pulse: number
  energy: number
}

/**
 * u_params 调制——在用户预设之上叠加音乐驱动:
 *  speed    ×(1+pulse·0.9)  拍击瞬间加速运动(星云旋转/星系涡旋随拍冲刺)
 *  hueShift + pulse·18      拍击色相跳跃(不破坏预设基调的瞬时换色)
 *  intensity×(1+energy·0.5) 响度提亮(上限 ×1.5)
 *  density  ×(1+energy·0.35) 响度加密结构(上限 ×1.35)
 * 零驱动时逐位返回原数组(音频关=行为与现状完全一致)。
 */
export function modulateParams3D(params: readonly [number, number, number, number], d: Drive3DAmount): [number, number, number, number] {
  const pulse = Math.max(0, Math.min(1, d.pulse))
  const energy = Math.max(0, Math.min(1, d.energy))
  if (pulse <= 0 && energy <= 0) return [params[0], params[1], params[2], params[3]]
  return [
    params[0] * (1 + pulse * 0.9),
    params[1] + pulse * 18,
    params[2] * (1 + energy * 0.5),
    params[3] * (1 + energy * 0.35),
  ]
}
