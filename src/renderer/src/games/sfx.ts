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
const BGM_STEP_MS = 280
const BGM_ARPEGGIO = [110, 130.81, 164.81, 220, 261.63, 329.63, 220, 164.81]

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
  bgmTimer = setInterval(() => {
    if (!bgmEnabled || !audioCtx) return
    playBgmNote(BGM_ARPEGGIO[bgmStep % BGM_ARPEGGIO.length], 0.26, 'triangle', 0.018)
    if (bgmStep % 4 === 0) playBgmNote(BGM_ARPEGGIO[bgmStep % BGM_ARPEGGIO.length] / 2, 0.5, 'sine', 0.026)
    bgmStep += 1
  }, BGM_STEP_MS)
}

export function stopBgm(): void {
  if (bgmTimer !== null) {
    clearInterval(bgmTimer)
    bgmTimer = null
  }
}
