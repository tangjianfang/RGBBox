import { Download, Pause, Play, Plus, RefreshCw, Shuffle, SkipBack, SkipForward, Square, Trash2, Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { useI18n } from '../i18n'

// ── Types ──────────────────────────────────────────────────────────────────

type StudioTab = 'player' | 'generator' | 'scenes' | 'export'
type PlayMode = 'sequential' | 'loop' | 'shuffle'
type NoiseType = 'white' | 'pink' | 'brown'
type GeneratorType = 'sine' | 'sweep' | 'noise' | 'eq-test' | 'surround' | 'bass-boost' | 'spatial' | 'multichannel'
type SceneCategory = 'instrument' | 'vocal' | 'game' | 'environment' | 'mix'
type ExportFormat = 'wav' | 'flac'

interface TrackItem {
  id: string
  name: string
  duration: number
  file?: File
  url?: string
}

interface GeneratorConfig {
  type: GeneratorType
  frequency: number
  endFrequency: number
  sampleRate: number
  bitDepth: number
  channels: number
  duration: number
  gain: number
  noiseType: NoiseType
  sweepLog: boolean
  panPosition: number
  reverbMix: number
}

interface ScenePreset {
  id: string
  category: SceneCategory
  labelKey: string
  description: string
}

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_GENERATOR_CONFIG: GeneratorConfig = {
  type: 'sine',
  frequency: 440,
  endFrequency: 20000,
  sampleRate: 48000,
  bitDepth: 24,
  channels: 2,
  duration: 5,
  gain: 0.8,
  noiseType: 'white',
  sweepLog: true,
  panPosition: 0,
  reverbMix: 0,
}

const SCENE_PRESETS: ScenePreset[] = [
  { id: 'piano', category: 'instrument', labelKey: 'audio.scene.piano', description: 'Piano tone (A4 440Hz harmonic series)' },
  { id: 'drum', category: 'instrument', labelKey: 'audio.scene.drum', description: 'Drum hit synthesis' },
  { id: 'guitar', category: 'instrument', labelKey: 'audio.scene.guitar', description: 'Plucked string (Karplus-Strong)' },
  { id: 'violin', category: 'instrument', labelKey: 'audio.scene.violin', description: 'Bowed string synthesis' },
  { id: 'electronic', category: 'instrument', labelKey: 'audio.scene.electronic', description: 'Electronic synth pad' },
  { id: 'male-voice', category: 'vocal', labelKey: 'audio.scene.maleVoice', description: 'Male vocal formant simulation' },
  { id: 'female-voice', category: 'vocal', labelKey: 'audio.scene.femaleVoice', description: 'Female vocal formant simulation' },
  { id: 'dialogue', category: 'vocal', labelKey: 'audio.scene.dialogue', description: 'Speech-like modulated tone' },
  { id: 'vocal-test', category: 'vocal', labelKey: 'audio.scene.vocalTest', description: 'Vocal frequency range test' },
  { id: 'gunshot', category: 'game', labelKey: 'audio.scene.gunshot', description: 'Gunfire transient synthesis' },
  { id: 'explosion', category: 'game', labelKey: 'audio.scene.explosion', description: 'Low-frequency explosion' },
  { id: 'spatial-fx', category: 'game', labelKey: 'audio.scene.spatialFx', description: 'Spatial positioning audio' },
  { id: 'cinema-ambience', category: 'environment', labelKey: 'audio.scene.cinemaAmbience', description: 'Cinematic ambient soundscape' },
  { id: 'rain', category: 'environment', labelKey: 'audio.scene.rain', description: 'Rain environment noise' },
  { id: 'bgm-vocal-mix', category: 'mix', labelKey: 'audio.scene.bgmVocalMix', description: 'BGM + Vocal multi-track mix' },
  { id: 'gun-env-mix', category: 'mix', labelKey: 'audio.scene.gunEnvMix', description: 'Gunfire + Environment mix' },
  { id: 'haptic-test', category: 'mix', labelKey: 'audio.scene.hapticTest', description: 'Haptic-linked low frequency pulse' },
]

const GENERATOR_TYPES: { id: GeneratorType; labelKey: string }[] = [
  { id: 'sine', labelKey: 'audio.gen.sine' },
  { id: 'sweep', labelKey: 'audio.gen.sweep' },
  { id: 'noise', labelKey: 'audio.gen.noise' },
  { id: 'eq-test', labelKey: 'audio.gen.eqTest' },
  { id: 'surround', labelKey: 'audio.gen.surround' },
  { id: 'bass-boost', labelKey: 'audio.gen.bassBoost' },
  { id: 'spatial', labelKey: 'audio.gen.spatial' },
  { id: 'multichannel', labelKey: 'audio.gen.multichannel' },
]

// ── Audio Generation Utilities ─────────────────────────────────────────────

function generateSineWave(ctx: OfflineAudioContext, config: GeneratorConfig): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(config.frequency, 0)
  gain.gain.setValueAtTime(config.gain, 0)
  // Volume envelope: fade in/out 50ms
  gain.gain.linearRampToValueAtTime(config.gain, 0.05)
  gain.gain.setValueAtTime(config.gain, config.duration - 0.05)
  gain.gain.linearRampToValueAtTime(0, config.duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(0)
  osc.stop(config.duration)
}

function generateSweep(ctx: OfflineAudioContext, config: GeneratorConfig): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  gain.gain.setValueAtTime(config.gain, 0)
  if (config.sweepLog) {
    osc.frequency.setValueAtTime(config.frequency, 0)
    osc.frequency.exponentialRampToValueAtTime(config.endFrequency, config.duration)
  } else {
    osc.frequency.setValueAtTime(config.frequency, 0)
    osc.frequency.linearRampToValueAtTime(config.endFrequency, config.duration)
  }
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(0)
  osc.stop(config.duration)
}

function generateNoise(ctx: OfflineAudioContext, config: GeneratorConfig): void {
  const length = Math.ceil(config.sampleRate * config.duration)
  const buffer = ctx.createBuffer(config.channels, length, config.sampleRate)
  for (let ch = 0; ch < config.channels; ch++) {
    const data = buffer.getChannelData(ch)
    if (config.noiseType === 'white') {
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * config.gain
    } else if (config.noiseType === 'pink') {
      // Pink noise approximation using Paul Kellet's method
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1
        b0 = 0.99886 * b0 + white * 0.0555179
        b1 = 0.99332 * b1 + white * 0.0750759
        b2 = 0.96900 * b2 + white * 0.1538520
        b3 = 0.86650 * b3 + white * 0.3104856
        b4 = 0.55000 * b4 + white * 0.5329522
        b5 = -0.7616 * b5 - white * 0.0168980
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11 * config.gain
        b6 = white * 0.115926
      }
    } else {
      // Brown noise
      let last = 0
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1
        last = (last + 0.02 * white) / 1.02
        data[i] = last * 3.5 * config.gain
      }
    }
  }
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)
  source.start(0)
}

function generateEQTest(ctx: OfflineAudioContext, config: GeneratorConfig): void {
  // Series of tones at standard EQ frequencies
  const eqFreqs = [31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
  const toneLen = config.duration / eqFreqs.length
  eqFreqs.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, 0)
    gain.gain.setValueAtTime(config.gain, 0)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(i * toneLen)
    osc.stop((i + 1) * toneLen)
  })
}

function generateSurroundTest(ctx: OfflineAudioContext, config: GeneratorConfig): void {
  // Panning sweep for surround test
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  const panner = ctx.createStereoPanner()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(1000, 0)
  gain.gain.setValueAtTime(config.gain, 0)
  panner.pan.setValueAtTime(-1, 0)
  panner.pan.linearRampToValueAtTime(1, config.duration / 2)
  panner.pan.linearRampToValueAtTime(-1, config.duration)
  osc.connect(gain)
  gain.connect(panner)
  panner.connect(ctx.destination)
  osc.start(0)
  osc.stop(config.duration)
}

function generateBassBoost(ctx: OfflineAudioContext, config: GeneratorConfig): void {
  // Sub-bass + bass frequencies with boosted gain
  const frequencies = [30, 40, 50, 60, 80, 100]
  const toneLen = config.duration / frequencies.length
  frequencies.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, 0)
    gain.gain.setValueAtTime(config.gain, 0)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(i * toneLen)
    osc.stop((i + 1) * toneLen)
  })
}

function generateSpatialTest(ctx: OfflineAudioContext, config: GeneratorConfig): void {
  // Circular panning with frequency modulation
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  const panner = ctx.createStereoPanner()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(800, 0)
  osc.frequency.linearRampToValueAtTime(1200, config.duration)
  gain.gain.setValueAtTime(config.gain, 0)
  // Oscillate pan position
  const steps = 20
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * config.duration
    const panVal = Math.sin((i / steps) * Math.PI * 4)
    panner.pan.linearRampToValueAtTime(panVal, t)
  }
  osc.connect(gain)
  gain.connect(panner)
  panner.connect(ctx.destination)
  osc.start(0)
  osc.stop(config.duration)
}

function generateMultichannelTest(ctx: OfflineAudioContext, config: GeneratorConfig): void {
  // Alternating L/R tones
  const toneLen = 0.5
  const numTones = Math.floor(config.duration / toneLen)
  for (let i = 0; i < numTones; i++) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const panner = ctx.createStereoPanner()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(440 + i * 50, 0)
    gain.gain.setValueAtTime(config.gain, 0)
    panner.pan.setValueAtTime(i % 2 === 0 ? -1 : 1, 0)
    osc.connect(gain)
    gain.connect(panner)
    panner.connect(ctx.destination)
    osc.start(i * toneLen)
    osc.stop((i + 1) * toneLen)
  }
}

// Scene-specific generators
function generateSceneAudio(ctx: OfflineAudioContext, sceneId: string, config: GeneratorConfig): void {
  switch (sceneId) {
    case 'piano': {
      // Piano: fundamental + harmonics with exponential decay
      const fundamentalFreq = 440
      const harmonics = [1, 2, 3, 4, 5, 6]
      const amplitudes = [1, 0.5, 0.25, 0.15, 0.08, 0.04]
      harmonics.forEach((h, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(fundamentalFreq * h, 0)
        gain.gain.setValueAtTime(amplitudes[i] * config.gain, 0)
        gain.gain.exponentialRampToValueAtTime(0.001, config.duration)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(0)
        osc.stop(config.duration)
      })
      break
    }
    case 'drum': {
      // Drum: short noise burst + pitch-dropping sine
      const length = Math.ceil(config.sampleRate * config.duration)
      const buffer = ctx.createBuffer(config.channels, length, config.sampleRate)
      for (let ch = 0; ch < config.channels; ch++) {
        const data = buffer.getChannelData(ch)
        for (let i = 0; i < length; i++) {
          const t = i / config.sampleRate
          const env = Math.exp(-t * 20)
          const noise = (Math.random() * 2 - 1) * env * 0.3
          const bodyFreq = 150 * Math.exp(-t * 10)
          const body = Math.sin(2 * Math.PI * bodyFreq * t) * env
          data[i] = (noise + body) * config.gain
        }
      }
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
      source.start(0)
      break
    }
    case 'guitar': {
      // Karplus-Strong plucked string
      const freq = 330
      const delaySamples = Math.round(config.sampleRate / freq)
      const length = Math.ceil(config.sampleRate * config.duration)
      const buffer = ctx.createBuffer(config.channels, length, config.sampleRate)
      for (let ch = 0; ch < config.channels; ch++) {
        const data = buffer.getChannelData(ch)
        // Initialize with noise burst
        for (let i = 0; i < delaySamples; i++) {
          data[i] = (Math.random() * 2 - 1) * config.gain
        }
        // Feedback loop with averaging filter
        for (let i = delaySamples; i < length; i++) {
          data[i] = (data[i - delaySamples] + data[i - delaySamples + 1]) * 0.498
        }
      }
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
      source.start(0)
      break
    }
    case 'violin': {
      // Bowed string: sawtooth with vibrato
      const osc = ctx.createOscillator()
      const vibrato = ctx.createOscillator()
      const vibratoGain = ctx.createGain()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(440, 0)
      vibrato.type = 'sine'
      vibrato.frequency.setValueAtTime(5.5, 0)
      vibratoGain.gain.setValueAtTime(4, 0)
      vibrato.connect(vibratoGain)
      vibratoGain.connect(osc.frequency)
      gain.gain.setValueAtTime(0, 0)
      gain.gain.linearRampToValueAtTime(config.gain * 0.4, 0.2)
      gain.gain.setValueAtTime(config.gain * 0.4, config.duration - 0.3)
      gain.gain.linearRampToValueAtTime(0, config.duration)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(0)
      vibrato.start(0)
      osc.stop(config.duration)
      vibrato.stop(config.duration)
      break
    }
    case 'electronic': {
      // Synth pad: detuned saws with filter sweep
      const oscs = [0, 5, -5, 12].map((detune) => {
        const osc = ctx.createOscillator()
        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(220, 0)
        osc.detune.setValueAtTime(detune, 0)
        return osc
      })
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(200, 0)
      filter.frequency.exponentialRampToValueAtTime(4000, config.duration * 0.4)
      filter.frequency.exponentialRampToValueAtTime(800, config.duration)
      filter.Q.setValueAtTime(2, 0)
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(config.gain * 0.25, 0)
      oscs.forEach((osc) => {
        osc.connect(filter)
        osc.start(0)
        osc.stop(config.duration)
      })
      filter.connect(gain)
      gain.connect(ctx.destination)
      break
    }
    case 'male-voice':
    case 'female-voice': {
      // Vocal formant synthesis
      const f0 = sceneId === 'male-voice' ? 120 : 220
      const formants = sceneId === 'male-voice'
        ? [{ f: 700, bw: 130 }, { f: 1220, bw: 70 }, { f: 2600, bw: 160 }]
        : [{ f: 800, bw: 80 }, { f: 1150, bw: 90 }, { f: 2800, bw: 120 }]
      const source = ctx.createOscillator()
      source.type = 'sawtooth'
      source.frequency.setValueAtTime(f0, 0)
      const masterGain = ctx.createGain()
      masterGain.gain.setValueAtTime(config.gain * 0.3, 0)
      formants.forEach(({ f, bw }) => {
        const filter = ctx.createBiquadFilter()
        filter.type = 'bandpass'
        filter.frequency.setValueAtTime(f, 0)
        filter.Q.setValueAtTime(f / bw, 0)
        source.connect(filter)
        filter.connect(masterGain)
      })
      masterGain.connect(ctx.destination)
      source.start(0)
      source.stop(config.duration)
      break
    }
    case 'dialogue':
    case 'vocal-test': {
      // Modulated tone simulating speech cadence
      const osc = ctx.createOscillator()
      const modulator = ctx.createOscillator()
      const modGain = ctx.createGain()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(180, 0)
      modulator.type = 'sine'
      modulator.frequency.setValueAtTime(3, 0)
      modGain.gain.setValueAtTime(30, 0)
      modulator.connect(modGain)
      modGain.connect(osc.frequency)
      gain.gain.setValueAtTime(config.gain * 0.3, 0)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(0)
      modulator.start(0)
      osc.stop(config.duration)
      modulator.stop(config.duration)
      break
    }
    case 'gunshot': {
      // Transient impulse with fast decay
      const length = Math.ceil(config.sampleRate * config.duration)
      const buffer = ctx.createBuffer(config.channels, length, config.sampleRate)
      for (let ch = 0; ch < config.channels; ch++) {
        const data = buffer.getChannelData(ch)
        for (let i = 0; i < length; i++) {
          const t = i / config.sampleRate
          const env = Math.exp(-t * 50)
          data[i] = (Math.random() * 2 - 1) * env * config.gain
        }
      }
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
      source.start(0)
      break
    }
    case 'explosion': {
      // Low-frequency rumble
      const length = Math.ceil(config.sampleRate * config.duration)
      const buffer = ctx.createBuffer(config.channels, length, config.sampleRate)
      for (let ch = 0; ch < config.channels; ch++) {
        const data = buffer.getChannelData(ch)
        let brown = 0
        for (let i = 0; i < length; i++) {
          const t = i / config.sampleRate
          const env = Math.exp(-t * 3)
          const white = Math.random() * 2 - 1
          brown = (brown + 0.02 * white) / 1.02
          const rumble = Math.sin(2 * Math.PI * 40 * t) * env
          data[i] = (brown * 3 + rumble) * env * config.gain
        }
      }
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
      source.start(0)
      break
    }
    case 'spatial-fx': {
      generateSpatialTest(ctx, config)
      break
    }
    case 'cinema-ambience':
    case 'rain': {
      // Filtered noise for ambience
      const length = Math.ceil(config.sampleRate * config.duration)
      const buffer = ctx.createBuffer(config.channels, length, config.sampleRate)
      for (let ch = 0; ch < config.channels; ch++) {
        const data = buffer.getChannelData(ch)
        let b0 = 0, b1 = 0, b2 = 0
        for (let i = 0; i < length; i++) {
          const white = Math.random() * 2 - 1
          b0 = 0.99765 * b0 + white * 0.0990460
          b1 = 0.96300 * b1 + white * 0.2965164
          b2 = 0.57000 * b2 + white * 1.0526913
          data[i] = (b0 + b1 + b2) * 0.1 * config.gain
        }
      }
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
      source.start(0)
      break
    }
    case 'bgm-vocal-mix': {
      // Chord pad + vocal formant
      const pad = ctx.createOscillator()
      pad.type = 'sawtooth'
      pad.frequency.setValueAtTime(220, 0)
      const padFilter = ctx.createBiquadFilter()
      padFilter.type = 'lowpass'
      padFilter.frequency.setValueAtTime(1500, 0)
      const padGain = ctx.createGain()
      padGain.gain.setValueAtTime(config.gain * 0.2, 0)
      pad.connect(padFilter)
      padFilter.connect(padGain)
      padGain.connect(ctx.destination)
      pad.start(0)
      pad.stop(config.duration)
      // Vocal layer
      const vocal = ctx.createOscillator()
      vocal.type = 'sawtooth'
      vocal.frequency.setValueAtTime(300, 0)
      const vocalFilter = ctx.createBiquadFilter()
      vocalFilter.type = 'bandpass'
      vocalFilter.frequency.setValueAtTime(1200, 0)
      vocalFilter.Q.setValueAtTime(5, 0)
      const vocalGain = ctx.createGain()
      vocalGain.gain.setValueAtTime(config.gain * 0.15, 0)
      vocal.connect(vocalFilter)
      vocalFilter.connect(vocalGain)
      vocalGain.connect(ctx.destination)
      vocal.start(0)
      vocal.stop(config.duration)
      break
    }
    case 'gun-env-mix': {
      // Gunshot layer + ambient
      const length = Math.ceil(config.sampleRate * config.duration)
      const buffer = ctx.createBuffer(config.channels, length, config.sampleRate)
      for (let ch = 0; ch < config.channels; ch++) {
        const data = buffer.getChannelData(ch)
        let brown = 0
        for (let i = 0; i < length; i++) {
          const t = i / config.sampleRate
          // Gunshot at t=0
          const gunEnv = t < 0.3 ? Math.exp(-t * 40) : 0
          const gunNoise = (Math.random() * 2 - 1) * gunEnv
          // Ambient
          const white = Math.random() * 2 - 1
          brown = (brown + 0.02 * white) / 1.02
          const ambient = brown * 0.5
          data[i] = (gunNoise * 0.7 + ambient * 0.3) * config.gain
        }
      }
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
      source.start(0)
      break
    }
    case 'haptic-test': {
      // Low-frequency pulses for haptic feedback testing
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(30, 0)
      gain.gain.setValueAtTime(0, 0)
      // Pulse pattern
      const pulseCount = Math.floor(config.duration / 0.5)
      for (let i = 0; i < pulseCount; i++) {
        const t = i * 0.5
        gain.gain.linearRampToValueAtTime(config.gain, t + 0.05)
        gain.gain.linearRampToValueAtTime(0, t + 0.2)
      }
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(0)
      osc.stop(config.duration)
      break
    }
    default:
      generateSineWave(ctx, config)
  }
}

// ── WAV Encoder ────────────────────────────────────────────────────────────

function encodeWav(audioBuffer: AudioBuffer, bitDepth: number): ArrayBuffer {
  const numChannels = audioBuffer.numberOfChannels
  const sampleRate = audioBuffer.sampleRate
  const length = audioBuffer.length
  const bytesPerSample = bitDepth / 8
  const blockAlign = numChannels * bytesPerSample
  const dataSize = length * blockAlign
  const headerSize = 44
  const buffer = new ArrayBuffer(headerSize + dataSize)
  const view = new DataView(buffer)

  // RIFF header
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')
  // fmt chunk
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, bitDepth === 32 ? 3 : 1, true) // PCM or IEEE float
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)
  // data chunk
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  // Interleave and write samples
  const channels: Float32Array[] = []
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(audioBuffer.getChannelData(ch))
  }

  let offset = headerSize
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]))
      if (bitDepth === 16) {
        view.setInt16(offset, sample * 0x7FFF, true)
      } else if (bitDepth === 24) {
        const intSample = Math.round(sample * 0x7FFFFF)
        view.setUint8(offset, intSample & 0xFF)
        view.setUint8(offset + 1, (intSample >> 8) & 0xFF)
        view.setUint8(offset + 2, (intSample >> 16) & 0xFF)
      } else {
        view.setFloat32(offset, sample, true)
      }
      offset += bytesPerSample
    }
  }

  return buffer
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}

// Simple FLAC-like export (outputs WAV since true FLAC encoding in browser is complex)
// For true FLAC, a WASM encoder would be needed; here we provide lossless WAV
function encodeLossless(audioBuffer: AudioBuffer, format: ExportFormat, bitDepth: number): ArrayBuffer {
  // Both formats output high-fidelity audio; WAV is natively lossless
  // FLAC encoding in-browser would require a WASM module (libflac.js)
  // For now, both export as lossless WAV (bit-perfect)
  return encodeWav(audioBuffer, format === 'flac' ? 24 : bitDepth)
}

// ── Spectrum Analyzer ──────────────────────────────────────────────────────

function drawSpectrum(canvas: HTMLCanvasElement, analyser: AnalyserNode): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width, height } = canvas
  const bufferLength = analyser.frequencyBinCount
  const dataArray = new Uint8Array(bufferLength)
  analyser.getByteFrequencyData(dataArray)

  ctx.clearRect(0, 0, width, height)
  const barWidth = width / bufferLength * 2.5
  let x = 0
  for (let i = 0; i < bufferLength; i++) {
    const barHeight = (dataArray[i] / 255) * height
    const hue = (i / bufferLength) * 240
    ctx.fillStyle = `hsl(${hue}, 80%, 55%)`
    ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight)
    x += barWidth
    if (x > width) break
  }
}

function drawWaveform(canvas: HTMLCanvasElement, analyser: AnalyserNode): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width, height } = canvas
  const bufferLength = analyser.fftSize
  const dataArray = new Float32Array(bufferLength)
  analyser.getFloatTimeDomainData(dataArray)

  ctx.clearRect(0, 0, width, height)
  ctx.strokeStyle = '#4fc3f7'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  const sliceWidth = width / bufferLength
  let x = 0
  for (let i = 0; i < bufferLength; i++) {
    const y = (dataArray[i] + 1) / 2 * height
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
    x += sliceWidth
  }
  ctx.stroke()
}

// ── Component ──────────────────────────────────────────────────────────────

export function AudioStudioView(): JSX.Element {
  const { t } = useI18n()

  // Tab state
  const [activeTab, setActiveTab] = useState<StudioTab>('player')

  // Player state
  const [playlist, setPlaylist] = useState<TrackItem[]>([])
  const [currentTrackIndex, setCurrentTrackIndex] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playMode, setPlayMode] = useState<PlayMode>('sequential')
  const [volume, setVolume] = useState(0.8)
  const [muted, setMuted] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [balance, setBalance] = useState(0) // -1 to 1

  // Generator state
  const [genConfig, setGenConfig] = useState<GeneratorConfig>(DEFAULT_GENERATOR_CONFIG)
  const [generating, setGenerating] = useState(false)
  const [previewPlaying, setPreviewPlaying] = useState(false)

  // Scene state
  const [selectedScene, setSelectedScene] = useState<string | null>(null)
  const [sceneCategory, setSceneCategory] = useState<SceneCategory>('instrument')

  // Export state
  const [exportFormat, setExportFormat] = useState<ExportFormat>('wav')
  const [lastGeneratedBuffer, setLastGeneratedBuffer] = useState<AudioBuffer | null>(null)

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioElementRef = useRef<HTMLAudioElement | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const pannerRef = useRef<StereoPannerNode | null>(null)
  const spectrumCanvasRef = useRef<HTMLCanvasElement>(null)
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Initialize audio context and graph
  const ensureAudioContext = useCallback(() => {
    if (audioContextRef.current) return audioContextRef.current
    const ctx = new AudioContext({ sampleRate: 48000 })
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.8
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(volume, ctx.currentTime)
    const panner = ctx.createStereoPanner()
    panner.pan.setValueAtTime(balance, ctx.currentTime)
    gain.connect(panner)
    panner.connect(analyser)
    analyser.connect(ctx.destination)
    audioContextRef.current = ctx
    analyserRef.current = analyser
    gainNodeRef.current = gain
    pannerRef.current = panner
    return ctx
  }, [volume, balance])

  // Visualization loop
  useEffect(() => {
    if (!isPlaying || !analyserRef.current) return
    const specCanvas = spectrumCanvasRef.current
    const waveCanvas = waveformCanvasRef.current
    const analyser = analyserRef.current

    const draw = () => {
      if (specCanvas) drawSpectrum(specCanvas, analyser)
      if (waveCanvas) drawWaveform(waveCanvas, analyser)
      animFrameRef.current = requestAnimationFrame(draw)
    }
    animFrameRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [isPlaying])

  // Volume/pan updates
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.setValueAtTime(muted ? 0 : volume, audioContextRef.current?.currentTime ?? 0)
    }
  }, [volume, muted])

  useEffect(() => {
    if (pannerRef.current) {
      pannerRef.current.pan.setValueAtTime(balance, audioContextRef.current?.currentTime ?? 0)
    }
  }, [balance])

  // Progress tracking
  useEffect(() => {
    if (!isPlaying || !audioElementRef.current) return
    const el = audioElementRef.current
    const update = () => {
      setProgress(el.currentTime)
      setDuration(el.duration || 0)
    }
    const interval = setInterval(update, 100)
    return () => clearInterval(interval)
  }, [isPlaying])

  // File loading
  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files) return
    const newTracks: TrackItem[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (/\.(wav|flac|mp3|aac|m4a|ogg)$/i.test(file.name)) {
        newTracks.push({
          id: `${Date.now()}-${i}`,
          name: file.name,
          duration: 0,
          file,
          url: URL.createObjectURL(file),
        })
      }
    }
    setPlaylist((prev) => [...prev, ...newTracks])
  }, [])

  // Playback controls
  const playTrack = useCallback((index: number) => {
    if (index < 0 || index >= playlist.length) return
    const ctx = ensureAudioContext()
    const track = playlist[index]
    if (!track.url) return

    // Clean up previous
    if (audioElementRef.current) {
      audioElementRef.current.pause()
      audioElementRef.current.src = ''
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect()
      sourceNodeRef.current = null
    }

    const audio = new Audio(track.url)
    audio.crossOrigin = 'anonymous'
    audioElementRef.current = audio

    const source = ctx.createMediaElementSource(audio)
    source.connect(gainNodeRef.current!)
    sourceNodeRef.current = source

    audio.onended = () => {
      if (playMode === 'loop') {
        audio.currentTime = 0
        audio.play()
      } else if (playMode === 'shuffle') {
        const next = Math.floor(Math.random() * playlist.length)
        playTrack(next)
      } else {
        if (index < playlist.length - 1) playTrack(index + 1)
        else setIsPlaying(false)
      }
    }

    audio.play()
    setCurrentTrackIndex(index)
    setIsPlaying(true)
  }, [playlist, playMode, ensureAudioContext])

  const togglePlay = useCallback(() => {
    if (!audioElementRef.current) {
      if (playlist.length > 0) playTrack(0)
      return
    }
    if (isPlaying) {
      audioElementRef.current.pause()
      setIsPlaying(false)
    } else {
      audioElementRef.current.play()
      setIsPlaying(true)
    }
  }, [isPlaying, playlist, playTrack])

  const skipNext = useCallback(() => {
    if (playMode === 'shuffle') {
      playTrack(Math.floor(Math.random() * playlist.length))
    } else {
      playTrack((currentTrackIndex + 1) % playlist.length)
    }
  }, [currentTrackIndex, playlist, playMode, playTrack])

  const skipPrev = useCallback(() => {
    playTrack(currentTrackIndex <= 0 ? playlist.length - 1 : currentTrackIndex - 1)
  }, [currentTrackIndex, playlist, playTrack])

  const removeTrack = useCallback((index: number) => {
    setPlaylist((prev) => {
      const next = [...prev]
      const removed = next.splice(index, 1)[0]
      if (removed.url) URL.revokeObjectURL(removed.url)
      return next
    })
    if (index === currentTrackIndex) {
      if (audioElementRef.current) {
        audioElementRef.current.pause()
        audioElementRef.current.src = ''
      }
      setIsPlaying(false)
      setCurrentTrackIndex(-1)
    }
  }, [currentTrackIndex])

  const seek = useCallback((time: number) => {
    if (audioElementRef.current) {
      audioElementRef.current.currentTime = time
      setProgress(time)
    }
  }, [])

  // Generate audio from config
  const generateAudio = useCallback(async (sceneId?: string) => {
    setGenerating(true)
    try {
      const offlineCtx = new OfflineAudioContext(
        genConfig.channels,
        Math.ceil(genConfig.sampleRate * genConfig.duration),
        genConfig.sampleRate
      )

      if (sceneId) {
        generateSceneAudio(offlineCtx, sceneId, genConfig)
      } else {
        switch (genConfig.type) {
          case 'sine': generateSineWave(offlineCtx, genConfig); break
          case 'sweep': generateSweep(offlineCtx, genConfig); break
          case 'noise': generateNoise(offlineCtx, genConfig); break
          case 'eq-test': generateEQTest(offlineCtx, genConfig); break
          case 'surround': generateSurroundTest(offlineCtx, genConfig); break
          case 'bass-boost': generateBassBoost(offlineCtx, genConfig); break
          case 'spatial': generateSpatialTest(offlineCtx, genConfig); break
          case 'multichannel': generateMultichannelTest(offlineCtx, genConfig); break
        }
      }

      const renderedBuffer = await offlineCtx.startRendering()
      setLastGeneratedBuffer(renderedBuffer)
      return renderedBuffer
    } finally {
      setGenerating(false)
    }
  }, [genConfig])

  // Preview generated audio
  const previewGenerated = useCallback(async (sceneId?: string) => {
    if (previewPlaying && previewSourceRef.current) {
      previewSourceRef.current.stop()
      setPreviewPlaying(false)
      return
    }
    const buffer = await generateAudio(sceneId)
    if (!buffer) return
    const ctx = ensureAudioContext()
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(gainNodeRef.current!)
    source.onended = () => setPreviewPlaying(false)
    previewSourceRef.current = source
    source.start()
    setPreviewPlaying(true)
  }, [previewPlaying, generateAudio, ensureAudioContext])

  // Export audio
  const exportAudio = useCallback(async (sceneId?: string) => {
    const buffer = lastGeneratedBuffer || await generateAudio(sceneId)
    if (!buffer) return
    const encoded = encodeLossless(buffer, exportFormat, genConfig.bitDepth)
    const blob = new Blob([encoded], { type: exportFormat === 'wav' ? 'audio/wav' : 'audio/flac' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rgbbox-audio-${Date.now()}.${exportFormat === 'flac' ? 'wav' : 'wav'}`
    a.click()
    URL.revokeObjectURL(url)
  }, [lastGeneratedBuffer, generateAudio, exportFormat, genConfig.bitDepth])

  // Format time
  const formatTime = (s: number): string => {
    if (!isFinite(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  // Filtered scenes
  const filteredScenes = useMemo(
    () => SCENE_PRESETS.filter((s) => s.category === sceneCategory),
    [sceneCategory]
  )

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="audio-studio-view">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">{t('audio.eyebrow')}</p>
          <h2>{t('audio.title')}</h2>
        </div>
      </header>

      {/* Tab navigation */}
      <div className="audio-tabs">
        {(['player', 'generator', 'scenes', 'export'] as StudioTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`audio-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {t(`audio.tab.${tab}` as any)}
          </button>
        ))}
      </div>

      {/* Player Tab */}
      {activeTab === 'player' && (
        <div className="audio-panel">
          {/* File input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".wav,.flac,.mp3,.aac,.m4a,.ogg"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => handleFileSelect(e.target.files)}
          />
          <div className="audio-toolbar">
            <button type="button" className="audio-btn" onClick={() => fileInputRef.current?.click()}>
              <Plus size={14} /> {t('audio.addFiles')}
            </button>
            <div className="audio-play-mode">
              <button
                type="button"
                className={`audio-btn-sm ${playMode === 'loop' ? 'active' : ''}`}
                onClick={() => setPlayMode(playMode === 'loop' ? 'sequential' : 'loop')}
                title={t('audio.loop')}
              >
                <RefreshCw size={13} />
              </button>
              <button
                type="button"
                className={`audio-btn-sm ${playMode === 'shuffle' ? 'active' : ''}`}
                onClick={() => setPlayMode(playMode === 'shuffle' ? 'sequential' : 'shuffle')}
                title={t('audio.shuffle')}
              >
                <Shuffle size={13} />
              </button>
            </div>
          </div>

          {/* Playlist */}
          <div className="audio-playlist">
            {playlist.length === 0 && (
              <p className="audio-empty">{t('audio.emptyPlaylist')}</p>
            )}
            {playlist.map((track, i) => (
              <div
                key={track.id}
                className={`audio-track-item ${i === currentTrackIndex ? 'active' : ''}`}
                onClick={() => playTrack(i)}
              >
                <span className="audio-track-name">{track.name}</span>
                <button
                  type="button"
                  className="audio-btn-icon"
                  onClick={(e) => { e.stopPropagation(); removeTrack(i) }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>

          {/* Transport controls */}
          <div className="audio-transport">
            <button type="button" className="audio-btn-sm" onClick={skipPrev}><SkipBack size={16} /></button>
            <button type="button" className="audio-btn-play" onClick={togglePlay}>
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <button type="button" className="audio-btn-sm" onClick={skipNext}><SkipForward size={16} /></button>
          </div>

          {/* Progress bar */}
          <div className="audio-progress-row">
            <span className="audio-time">{formatTime(progress)}</span>
            <input
              type="range"
              className="audio-progress-bar"
              min={0}
              max={duration || 1}
              step={0.1}
              value={progress}
              onChange={(e) => seek(Number(e.target.value))}
            />
            <span className="audio-time">{formatTime(duration)}</span>
          </div>

          {/* Volume & Balance */}
          <div className="audio-controls-row">
            <button type="button" className="audio-btn-icon" onClick={() => setMuted(!muted)}>
              {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <input
              type="range"
              className="audio-slider"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              title={t('audio.volume')}
            />
            <span className="audio-label">{t('audio.balance')}</span>
            <input
              type="range"
              className="audio-slider"
              min={-1}
              max={1}
              step={0.01}
              value={balance}
              onChange={(e) => setBalance(Number(e.target.value))}
            />
          </div>

          {/* Spectrum & Waveform */}
          <div className="audio-visualizers">
            <canvas ref={spectrumCanvasRef} className="audio-canvas" width={400} height={100} />
            <canvas ref={waveformCanvasRef} className="audio-canvas" width={400} height={80} />
          </div>
        </div>
      )}

      {/* Generator Tab */}
      {activeTab === 'generator' && (
        <div className="audio-panel">
          <div className="audio-gen-grid">
            {/* Type selection */}
            <div className="audio-gen-section">
              <label className="audio-field-label">{t('audio.gen.type')}</label>
              <div className="audio-gen-types">
                {GENERATOR_TYPES.map((gt) => (
                  <button
                    key={gt.id}
                    type="button"
                    className={`audio-gen-type-btn ${genConfig.type === gt.id ? 'active' : ''}`}
                    onClick={() => setGenConfig((c) => ({ ...c, type: gt.id }))}
                  >
                    {t(gt.labelKey as any)}
                  </button>
                ))}
              </div>
            </div>

            {/* Parameters */}
            <div className="audio-gen-section">
              <label className="audio-field-label">{t('audio.gen.frequency')} (Hz)</label>
              <input
                type="number"
                className="audio-input"
                value={genConfig.frequency}
                min={1}
                max={22000}
                onChange={(e) => setGenConfig((c) => ({ ...c, frequency: Number(e.target.value) }))}
              />
            </div>

            {genConfig.type === 'sweep' && (
              <div className="audio-gen-section">
                <label className="audio-field-label">{t('audio.gen.endFreq')} (Hz)</label>
                <input
                  type="number"
                  className="audio-input"
                  value={genConfig.endFrequency}
                  min={1}
                  max={22000}
                  onChange={(e) => setGenConfig((c) => ({ ...c, endFrequency: Number(e.target.value) }))}
                />
              </div>
            )}

            {genConfig.type === 'noise' && (
              <div className="audio-gen-section">
                <label className="audio-field-label">{t('audio.gen.noiseType')}</label>
                <select
                  className="audio-select"
                  value={genConfig.noiseType}
                  onChange={(e) => setGenConfig((c) => ({ ...c, noiseType: e.target.value as NoiseType }))}
                >
                  <option value="white">{t('audio.noise.white')}</option>
                  <option value="pink">{t('audio.noise.pink')}</option>
                  <option value="brown">{t('audio.noise.brown')}</option>
                </select>
              </div>
            )}

            <div className="audio-gen-section">
              <label className="audio-field-label">{t('audio.gen.sampleRate')} (Hz)</label>
              <select
                className="audio-select"
                value={genConfig.sampleRate}
                onChange={(e) => setGenConfig((c) => ({ ...c, sampleRate: Number(e.target.value) }))}
              >
                <option value={44100}>44100</option>
                <option value={48000}>48000</option>
                <option value={96000}>96000</option>
                <option value={192000}>192000</option>
              </select>
            </div>

            <div className="audio-gen-section">
              <label className="audio-field-label">{t('audio.gen.bitDepth')}</label>
              <select
                className="audio-select"
                value={genConfig.bitDepth}
                onChange={(e) => setGenConfig((c) => ({ ...c, bitDepth: Number(e.target.value) }))}
              >
                <option value={16}>16-bit</option>
                <option value={24}>24-bit</option>
                <option value={32}>32-bit float</option>
              </select>
            </div>

            <div className="audio-gen-section">
              <label className="audio-field-label">{t('audio.gen.channels')}</label>
              <select
                className="audio-select"
                value={genConfig.channels}
                onChange={(e) => setGenConfig((c) => ({ ...c, channels: Number(e.target.value) }))}
              >
                <option value={1}>Mono</option>
                <option value={2}>Stereo</option>
              </select>
            </div>

            <div className="audio-gen-section">
              <label className="audio-field-label">{t('audio.gen.duration')} (s)</label>
              <input
                type="number"
                className="audio-input"
                value={genConfig.duration}
                min={0.1}
                max={300}
                step={0.1}
                onChange={(e) => setGenConfig((c) => ({ ...c, duration: Number(e.target.value) }))}
              />
            </div>

            <div className="audio-gen-section">
              <label className="audio-field-label">{t('audio.gen.gain')}</label>
              <input
                type="range"
                className="audio-slider"
                min={0}
                max={1}
                step={0.01}
                value={genConfig.gain}
                onChange={(e) => setGenConfig((c) => ({ ...c, gain: Number(e.target.value) }))}
              />
              <span className="audio-value">{Math.round(genConfig.gain * 100)}%</span>
            </div>

            <div className="audio-gen-section">
              <label className="audio-field-label">{t('audio.gen.pan')}</label>
              <input
                type="range"
                className="audio-slider"
                min={-1}
                max={1}
                step={0.01}
                value={genConfig.panPosition}
                onChange={(e) => setGenConfig((c) => ({ ...c, panPosition: Number(e.target.value) }))}
              />
              <span className="audio-value">{genConfig.panPosition > 0 ? `R ${Math.round(genConfig.panPosition * 100)}%` : genConfig.panPosition < 0 ? `L ${Math.round(-genConfig.panPosition * 100)}%` : 'C'}</span>
            </div>

            <div className="audio-gen-section">
              <label className="audio-field-label">{t('audio.gen.reverb')}</label>
              <input
                type="range"
                className="audio-slider"
                min={0}
                max={1}
                step={0.01}
                value={genConfig.reverbMix}
                onChange={(e) => setGenConfig((c) => ({ ...c, reverbMix: Number(e.target.value) }))}
              />
              <span className="audio-value">{Math.round(genConfig.reverbMix * 100)}%</span>
            </div>
          </div>

          {/* Generate actions */}
          <div className="audio-gen-actions">
            <button
              type="button"
              className="audio-btn audio-btn-primary"
              onClick={() => previewGenerated()}
              disabled={generating}
            >
              {previewPlaying ? <Square size={14} /> : <Play size={14} />}
              {previewPlaying ? t('audio.stop') : t('audio.preview')}
            </button>
            <button
              type="button"
              className="audio-btn"
              onClick={() => exportAudio()}
              disabled={generating}
            >
              <Download size={14} /> {t('audio.export')}
            </button>
          </div>
        </div>
      )}

      {/* Scenes Tab */}
      {activeTab === 'scenes' && (
        <div className="audio-panel">
          <div className="audio-scene-categories">
            {(['instrument', 'vocal', 'game', 'environment', 'mix'] as SceneCategory[]).map((cat) => (
              <button
                key={cat}
                type="button"
                className={`audio-tab ${sceneCategory === cat ? 'active' : ''}`}
                onClick={() => setSceneCategory(cat)}
              >
                {t(`audio.category.${cat}` as any)}
              </button>
            ))}
          </div>

          <div className="audio-scene-grid">
            {filteredScenes.map((scene) => (
              <div
                key={scene.id}
                className={`audio-scene-card ${selectedScene === scene.id ? 'selected' : ''}`}
                onClick={() => setSelectedScene(scene.id)}
              >
                <h4>{t(scene.labelKey as any)}</h4>
                <p>{scene.description}</p>
                <div className="audio-scene-actions">
                  <button
                    type="button"
                    className="audio-btn-sm"
                    onClick={(e) => { e.stopPropagation(); previewGenerated(scene.id) }}
                    disabled={generating}
                  >
                    <Play size={12} /> {t('audio.preview')}
                  </button>
                  <button
                    type="button"
                    className="audio-btn-sm"
                    onClick={(e) => { e.stopPropagation(); exportAudio(scene.id) }}
                    disabled={generating}
                  >
                    <Download size={12} /> {t('audio.export')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Export Tab */}
      {activeTab === 'export' && (
        <div className="audio-panel">
          <div className="audio-export-section">
            <h3>{t('audio.export.title')}</h3>
            <p className="audio-export-desc">{t('audio.export.desc')}</p>

            <div className="audio-gen-section">
              <label className="audio-field-label">{t('audio.export.format')}</label>
              <div className="audio-export-formats">
                <button
                  type="button"
                  className={`audio-gen-type-btn ${exportFormat === 'wav' ? 'active' : ''}`}
                  onClick={() => setExportFormat('wav')}
                >
                  WAV
                </button>
                <button
                  type="button"
                  className={`audio-gen-type-btn ${exportFormat === 'flac' ? 'active' : ''}`}
                  onClick={() => setExportFormat('flac')}
                >
                  FLAC
                </button>
              </div>
            </div>

            <div className="audio-export-specs">
              <div className="audio-spec-item">
                <span>{t('audio.gen.sampleRate')}</span>
                <span>{genConfig.sampleRate} Hz</span>
              </div>
              <div className="audio-spec-item">
                <span>{t('audio.gen.bitDepth')}</span>
                <span>{genConfig.bitDepth}-bit</span>
              </div>
              <div className="audio-spec-item">
                <span>{t('audio.gen.channels')}</span>
                <span>{genConfig.channels === 1 ? 'Mono' : 'Stereo'}</span>
              </div>
              <div className="audio-spec-item">
                <span>{t('audio.export.quality')}</span>
                <span>{t('audio.export.lossless')}</span>
              </div>
            </div>

            <button
              type="button"
              className="audio-btn audio-btn-primary"
              onClick={() => exportAudio()}
              disabled={!lastGeneratedBuffer && generating}
            >
              <Download size={14} /> {t('audio.export.download')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
