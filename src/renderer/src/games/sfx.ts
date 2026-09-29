// R99.5: zero-asset synthesized sound effects via WebAudio oscillators.
// Fire-and-forget blips shared by every mini game; shoot-grade sounds are
// throttled so rapid fire does not stack into a buzz.

export type SfxKind = 'shoot' | 'hit' | 'pop' | 'xp' | 'levelup' | 'hurt' | 'wave' | 'build' | 'coin' | 'gameover' | 'tick' | 'confirm'

const SFX_ENABLED_KEY = 'rgbbox:gamesSfx'
const THROTTLE_MS: Partial<Record<SfxKind, number>> = { shoot: 90, hit: 70, xp: 60, pop: 60, tick: 60 }
const lastPlayed: Partial<Record<SfxKind, number>> = {}

let audioCtx: AudioContext | null = null
let enabled = (() => {
  try {
    return localStorage.getItem(SFX_ENABLED_KEY) !== 'off'
  } catch {
    return true
  }
})()

export function isSfxEnabled(): boolean {
  return enabled
}

export function setSfxEnabled(value: boolean): void {
  enabled = value
  try {
    localStorage.setItem(SFX_ENABLED_KEY, value ? 'on' : 'off')
  } catch {
    return
  }
}

interface Voice {
  type: OscillatorType
  from: number
  to: number
  duration: number
  volume: number
}

const VOICES: Record<SfxKind, Voice[]> = {
  shoot: [{ type: 'square', from: 760, to: 320, duration: 0.06, volume: 0.022 }],
  hit: [{ type: 'triangle', from: 220, to: 90, duration: 0.07, volume: 0.05 }],
  pop: [{ type: 'sine', from: 520, to: 900, duration: 0.08, volume: 0.06 }],
  xp: [{ type: 'sine', from: 980, to: 1400, duration: 0.07, volume: 0.035 }],
  levelup: [
    { type: 'triangle', from: 440, to: 440, duration: 0.09, volume: 0.06 },
    { type: 'triangle', from: 554, to: 554, duration: 0.09, volume: 0.06 },
    { type: 'triangle', from: 659, to: 659, duration: 0.12, volume: 0.06 },
    { type: 'triangle', from: 880, to: 880, duration: 0.18, volume: 0.06 },
  ],
  hurt: [{ type: 'sawtooth', from: 200, to: 55, duration: 0.22, volume: 0.07 }],
  wave: [
    { type: 'square', from: 196, to: 196, duration: 0.1, volume: 0.045 },
    { type: 'square', from: 294, to: 294, duration: 0.14, volume: 0.045 },
  ],
  build: [{ type: 'triangle', from: 300, to: 620, duration: 0.1, volume: 0.05 }],
  coin: [{ type: 'sine', from: 1200, to: 1600, duration: 0.06, volume: 0.04 }],
  gameover: [
    { type: 'sawtooth', from: 330, to: 220, duration: 0.16, volume: 0.06 },
    { type: 'sawtooth', from: 220, to: 110, duration: 0.3, volume: 0.06 },
  ],
  // R141-A: vision feedback — a barely-there blip the moment a gesture is
  // recognized (perceived-latency cut), and a two-tone confirm for completed
  // actions. Deliberately quieter than the game sounds.
  tick: [{ type: 'sine', from: 1500, to: 1500, duration: 0.03, volume: 0.018 }],
  confirm: [
    { type: 'sine', from: 880, to: 880, duration: 0.05, volume: 0.03 },
    { type: 'sine', from: 1320, to: 1320, duration: 0.08, volume: 0.03 },
  ],
}

function playVoice(ctx: AudioContext, at: number, voice: Voice): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = voice.type
  osc.frequency.setValueAtTime(voice.from, at)
  if (voice.to !== voice.from) osc.frequency.exponentialRampToValueAtTime(Math.max(20, voice.to), at + voice.duration)
  gain.gain.setValueAtTime(voice.volume, at)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + voice.duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(at)
  osc.stop(at + voice.duration + 0.02)
}

export function playSfx(kind: SfxKind): void {
  if (!enabled) return
  const throttle = THROTTLE_MS[kind]
  const now = performance.now()
  if (throttle !== undefined) {
    if (now - (lastPlayed[kind] ?? 0) < throttle) return
    lastPlayed[kind] = now
  }
  try {
    audioCtx ??= new AudioContext()
    if (audioCtx.state === 'suspended') void audioCtx.resume()
    let at = audioCtx.currentTime
    for (const voice of VOICES[kind]) {
      playVoice(audioCtx, at, voice)
      at += voice.duration * 0.7
    }
  } catch {
    audioCtx = null
  }
}

// ── R108: procedural BGM — zero-asset Am arpeggio loop ──

const BGM_KEY = 'rgbbox:gamesBgm'

/** R205(FR-G07 一期): 四作静态音乐预设——调式/BPM/音色层,零素材。 */
export interface BgmPreset {
  /** 琶音频率表(一个循环步进)。 */
  arp: number[]
  /** 步进毫秒(BPM 的倒数表达)。 */
  stepMs: number
  /** 主音色。 */
  wave: OscillatorType
  /** 低音层(每 4 步)八度下探比例。 */
  bassDiv: number
  volume: number
  /** R205 二期(FR-G07): 高张力变奏覆盖层(同构、全字段可选,未指定字段继承基线);default 档不设——字节级兼容锚点。 */
  tension?: BgmTensionFields
}

/** R205 二期(FR-G07): 变奏覆盖层——与 BgmPreset 同构(除 tension 自身)、全字段可选。 */
export type BgmTensionFields = Partial<Omit<BgmPreset, 'tension'>>

export const BGM_PRESETS: Record<string, BgmPreset> = {
  // 原 Am 琶音(R108 兜底,与旧版一致;无 tension——setBgmTension 在此档为 no-op)
  default: { arp: [110, 130.81, 164.81, 220, 261.63, 329.63, 220, 164.81], stepMs: 280, wave: 'triangle', bassDiv: 2, volume: 0.018 },
  // TD 沉稳:Dm 下行,Dotted 节奏;张力:Dm 八度上移+square 急行军,bassDiv×2 低音锚回原八度
  td: {
    arp: [146.83, 130.81, 110, 98, 110, 130.81, 146.83, 110],
    stepMs: 340,
    wave: 'triangle',
    bassDiv: 2,
    volume: 0.02,
    tension: { arp: [293.66, 261.62, 220, 196, 220, 261.62, 293.66, 220], stepMs: 250, wave: 'square', bassDiv: 4, volume: 0.016 },
  },
  // Swarm 急促:Em 密集半音阶;张力:再上探八度+更密步进(时值随 stepMs 缩短)
  swarm: {
    arp: [164.81, 196, 220, 246.94, 220, 196, 164.81, 185],
    stepMs: 190,
    wave: 'sawtooth',
    bassDiv: 2,
    volume: 0.014,
    tension: { arp: [329.62, 392, 440, 493.88, 440, 392, 329.62, 370], stepMs: 150, wave: 'sawtooth', bassDiv: 4, volume: 0.011 },
  },
  // Tetris 上行:C 大调琶音爬升;张力:双八度冲刺节奏
  tetris: {
    arp: [130.81, 164.81, 196, 261.63, 329.63, 261.63, 196, 164.81],
    stepMs: 240,
    wave: 'square',
    bassDiv: 2,
    volume: 0.012,
    tension: { arp: [261.62, 329.62, 392, 523.26, 659.26, 523.26, 392, 329.62], stepMs: 180, wave: 'square', bassDiv: 4, volume: 0.01 },
  },
  // Slash 强拍:E 小调重拍短句;张力:重拍上移八度+square 驱动
  slash: {
    arp: [82.41, 82.41, 123.47, 164.81, 82.41, 98, 82.41, 61.74],
    stepMs: 300,
    wave: 'triangle',
    bassDiv: 1,
    volume: 0.022,
    tension: { arp: [164.82, 164.82, 246.94, 329.62, 164.82, 196, 164.82, 123.48], stepMs: 215, wave: 'square', bassDiv: 2, volume: 0.018 },
  },
}

let bgmPreset: BgmPreset = BGM_PRESETS.default
/** R205 二期(FR-G07): 张力等级——0 常规 / 1 高张力变奏。 */
let bgmTension: 0 | 1 = 0

/** 当前生效预设:level 1 且基线带 tension 覆盖时为「基线∪变奏」,否则基线本身。 */
function effectiveBgmPreset(): BgmPreset {
  if (bgmTension === 0 || bgmPreset.tension === undefined) return bgmPreset
  return { ...bgmPreset, ...bgmPreset.tension }
}

let bgmEnabled = (() => {
  try {
    return localStorage.getItem(BGM_KEY) !== 'off'
  } catch {
    return true
  }
})()
let bgmTimer: ReturnType<typeof setInterval> | null = null
let bgmStep = 0

export function isBgmEnabled(): boolean {
  return bgmEnabled
}

export function setBgmEnabled(value: boolean): void {
  bgmEnabled = value
  try {
    localStorage.setItem(BGM_KEY, value ? 'on' : 'off')
  } catch {
    return
  }
  if (!value) stopBgm()
}

function playBgmNote(freq: number, duration: number, type: OscillatorType, volume: number): void {
  if (!audioCtx) return
  const at = audioCtx.currentTime
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, at)
  gain.gain.setValueAtTime(volume, at)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
  osc.connect(gain)
  gain.connect(audioCtx.destination)
  osc.start(at)
  osc.stop(at + duration + 0.02)
}

/** R205: 切换预设并(若正在播)重启循环;张力等级复位为 0(变奏由玩法事件重新拉起)。 */
export function setBgmPreset(id: keyof typeof BGM_PRESETS): void {
  bgmPreset = BGM_PRESETS[id] ?? BGM_PRESETS.default
  bgmTension = 0
  if (bgmTimer !== null) {
    stopBgm()
    startBgm()
  }
}

/** R205 二期(FR-G07): 张力变奏热切——1 切当前预设的 tension 变体,0 回常规。
 * 下一拍生效(重挂步进定时器,AudioContext 与已排程音符不打断);default 档无 tension,恒为 no-op。 */
export function setBgmTension(level: 0 | 1): void {
  if (level === 1 && bgmPreset.tension === undefined) return
  if (level === bgmTension) return
  bgmTension = level
  if (bgmTimer !== null) {
    stopBgm()
    startBgm()
  }
}

/** R205 二期(FR-G07): 当前张力等级(0 常规/1 变奏);default 档恒 0。 */
export function getBgmTension(): 0 | 1 {
  return bgmTension
}

/** R205 二期(FR-G07): 当前生效预设(基线,或基线∪tension 覆盖)——供视图/测试读取。 */
export function getActiveBgmPreset(): BgmPreset {
  return effectiveBgmPreset()
}

export function startBgm(): void {
  if (!bgmEnabled || bgmTimer !== null) return
  try {
    audioCtx ??= new AudioContext()
    if (audioCtx.state === 'suspended') void audioCtx.resume()
  } catch {
    audioCtx = null
    return
  }
  bgmStep = 0
  const p = effectiveBgmPreset()
  bgmTimer = setInterval(() => {
    if (!bgmEnabled || !audioCtx) return
    playBgmNote(p.arp[bgmStep % p.arp.length], p.stepMs / 1000 * 0.9, p.wave, p.volume)
    if (bgmStep % 4 === 0) playBgmNote(p.arp[bgmStep % p.arp.length] / p.bassDiv, p.stepMs / 1000 * 1.6, 'sine', p.volume * 1.4)
    bgmStep += 1
  }, p.stepMs)
}

export function stopBgm(): void {
  if (bgmTimer !== null) {
    clearInterval(bgmTimer)
    bgmTimer = null
  }
}
