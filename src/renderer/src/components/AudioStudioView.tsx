import { ChevronDown, ChevronRight, Download, FileText, FolderOpen, Maximize2, Minimize2, Pause, Play, Plus, RefreshCw, Repeat, Shuffle, SkipBack, SkipForward, Square, Trash2, Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { useI18n } from '../i18n'

// ── Types ──────────────────────────────────────────────────────────────────

type StudioTab = 'generator' | 'scenes' | 'export'
type PlayMode = 'sequential' | 'loop' | 'shuffle'
type NoiseType = 'white' | 'pink' | 'brown'
type GeneratorType = 'sine' | 'sweep' | 'noise' | 'eq-test' | 'surround' | 'bass-boost' | 'spatial' | 'multichannel'
type SceneCategory = 'instrument' | 'vocal' | 'game' | 'environment' | 'mix'
type ExportFormat = 'wav' | 'flac'

// ── LRC Types ──────────────────────────────────────────────────────────────

interface LrcLine {
  time: number  // seconds
  text: string
}

interface TrackItem {
  id: string
  name: string
  duration: number
  file?: File
  url?: string
  group: string
}

interface TrackGroup {
  name: string
  collapsed: boolean
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

interface AudioStudioCache {
  playlist: Array<{ id: string; name: string; group: string }>
  groups: TrackGroup[]
  playMode: PlayMode
  volume: number
  balance: number
  genConfig: GeneratorConfig
  exportFormat: ExportFormat
  activeTab: StudioTab
}

// ── Constants ──────────────────────────────────────────────────────────────

const CACHE_KEY = 'rgbbox-audio-studio-config'

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

const FREQUENCY_PRESETS = [
  { label: 'A4 (440Hz)', value: 440 },
  { label: 'C4 (261.6Hz)', value: 261.63 },
  { label: 'Bass (100Hz)', value: 100 },
  { label: 'Sub-bass (30Hz)', value: 30 },
  { label: '1kHz', value: 1000 },
  { label: '4kHz', value: 4000 },
  { label: '8kHz', value: 8000 },
  { label: '16kHz', value: 16000 },
]

const DURATION_PRESETS = [
  { label: '1s', value: 1 },
  { label: '2s', value: 2 },
  { label: '5s', value: 5 },
  { label: '10s', value: 10 },
  { label: '30s', value: 30 },
  { label: '60s', value: 60 },
]

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
  // Professional anti-click envelope with cosine-shaped attack/release
  const fadeTime = Math.min(0.01, config.duration * 0.05)
  gain.gain.setValueAtTime(0, 0)
  gain.gain.linearRampToValueAtTime(config.gain, fadeTime)
  gain.gain.setValueAtTime(config.gain, config.duration - fadeTime)
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
  // Professional anti-click envelope
  const fadeTime = Math.min(0.01, config.duration * 0.02)
  gain.gain.setValueAtTime(0, 0)
  gain.gain.linearRampToValueAtTime(config.gain, fadeTime)
  gain.gain.setValueAtTime(config.gain, config.duration - fadeTime)
  gain.gain.linearRampToValueAtTime(0, config.duration)
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
  // Professional 10-band ISO standard center frequencies
  const eqFreqs = [31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
  const toneLen = config.duration / eqFreqs.length
  // Professional fade time to prevent clicks (5ms attack/release)
  const fadeTime = 0.005
  // Silence gap between tones for clarity
  const gapTime = Math.min(0.02, toneLen * 0.05)

  eqFreqs.forEach((freq, i) => {
    const startTime = i * toneLen
    const endTime = (i + 1) * toneLen - gapTime

    // Main tone oscillator
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, 0)

    // Professional ADSR envelope: smooth attack, sustain, smooth release
    gain.gain.setValueAtTime(0, startTime)
    gain.gain.linearRampToValueAtTime(config.gain, startTime + fadeTime)
    gain.gain.setValueAtTime(config.gain, endTime - fadeTime)
    gain.gain.linearRampToValueAtTime(0, endTime)

    // Add subtle odd harmonics for richer test signal (professional standard)
    const osc3 = ctx.createOscillator()
    const gain3 = ctx.createGain()
    osc3.type = 'sine'
    osc3.frequency.setValueAtTime(freq * 3, 0) // 3rd harmonic
    gain3.gain.setValueAtTime(0, startTime)
    gain3.gain.linearRampToValueAtTime(config.gain * 0.08, startTime + fadeTime)
    gain3.gain.setValueAtTime(config.gain * 0.08, endTime - fadeTime)
    gain3.gain.linearRampToValueAtTime(0, endTime)

    // Reference-grade bandpass filter for clean isolation
    const filter = ctx.createBiquadFilter()
    filter.type = 'peaking'
    filter.frequency.setValueAtTime(freq, 0)
    filter.Q.setValueAtTime(1.41, 0)  // Butterworth Q for musical response
    filter.gain.setValueAtTime(0, 0)  // Flat - just for signal path authenticity

    osc.connect(gain)
    osc3.connect(gain3)
    gain.connect(filter)
    gain3.connect(filter)
    filter.connect(ctx.destination)

    osc.start(startTime)
    osc.stop(endTime)
    osc3.start(startTime)
    osc3.stop(endTime)
  })
}

function generateSurroundTest(ctx: OfflineAudioContext, config: GeneratorConfig): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  const panner = ctx.createStereoPanner()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(1000, 0)
  // Professional anti-click envelope
  const fadeTime = 0.01
  gain.gain.setValueAtTime(0, 0)
  gain.gain.linearRampToValueAtTime(config.gain, fadeTime)
  gain.gain.setValueAtTime(config.gain, config.duration - fadeTime)
  gain.gain.linearRampToValueAtTime(0, config.duration)
  // Smooth sinusoidal panning for professional surround test
  const steps = 60
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * config.duration
    const panVal = Math.sin((i / steps) * Math.PI * 4)
    if (i === 0) panner.pan.setValueAtTime(panVal, t)
    else panner.pan.linearRampToValueAtTime(panVal, t)
  }
  osc.connect(gain)
  gain.connect(panner)
  panner.connect(ctx.destination)
  osc.start(0)
  osc.stop(config.duration)
}

function generateBassBoost(ctx: OfflineAudioContext, config: GeneratorConfig): void {
  const frequencies = [30, 40, 50, 60, 80, 100]
  const toneLen = config.duration / frequencies.length
  const fadeTime = 0.005  // 5ms anti-click fade
  frequencies.forEach((freq, i) => {
    const startTime = i * toneLen
    const endTime = (i + 1) * toneLen
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    // Add sub-harmonic for deep bass presence
    const subOsc = ctx.createOscillator()
    const subGain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, 0)
    subOsc.type = 'sine'
    subOsc.frequency.setValueAtTime(freq / 2, 0)
    // Professional envelope
    gain.gain.setValueAtTime(0, startTime)
    gain.gain.linearRampToValueAtTime(config.gain, startTime + fadeTime)
    gain.gain.setValueAtTime(config.gain, endTime - fadeTime)
    gain.gain.linearRampToValueAtTime(0, endTime)
    subGain.gain.setValueAtTime(0, startTime)
    subGain.gain.linearRampToValueAtTime(config.gain * 0.4, startTime + fadeTime)
    subGain.gain.setValueAtTime(config.gain * 0.4, endTime - fadeTime)
    subGain.gain.linearRampToValueAtTime(0, endTime)
    osc.connect(gain)
    subOsc.connect(subGain)
    gain.connect(ctx.destination)
    subGain.connect(ctx.destination)
    osc.start(startTime)
    osc.stop(endTime)
    subOsc.start(startTime)
    subOsc.stop(endTime)
  })
}

function generateSpatialTest(ctx: OfflineAudioContext, config: GeneratorConfig): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  const panner = ctx.createStereoPanner()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(800, 0)
  osc.frequency.linearRampToValueAtTime(1200, config.duration)
  gain.gain.setValueAtTime(config.gain, 0)
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

function generateSceneAudio(ctx: OfflineAudioContext, sceneId: string, config: GeneratorConfig): void {
  switch (sceneId) {
    case 'piano': {
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
      const freq = 330
      const delaySamples = Math.round(config.sampleRate / freq)
      const length = Math.ceil(config.sampleRate * config.duration)
      const buffer = ctx.createBuffer(config.channels, length, config.sampleRate)
      for (let ch = 0; ch < config.channels; ch++) {
        const data = buffer.getChannelData(ch)
        for (let i = 0; i < delaySamples; i++) {
          data[i] = (Math.random() * 2 - 1) * config.gain
        }
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
      const length = Math.ceil(config.sampleRate * config.duration)
      const buffer = ctx.createBuffer(config.channels, length, config.sampleRate)
      for (let ch = 0; ch < config.channels; ch++) {
        const data = buffer.getChannelData(ch)
        let brown = 0
        for (let i = 0; i < length; i++) {
          const t = i / config.sampleRate
          const gunEnv = t < 0.3 ? Math.exp(-t * 40) : 0
          const gunNoise = (Math.random() * 2 - 1) * gunEnv
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
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(30, 0)
      gain.gain.setValueAtTime(0, 0)
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

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, bitDepth === 32 ? 3 : 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

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

function encodeLossless(audioBuffer: AudioBuffer, format: ExportFormat, bitDepth: number): ArrayBuffer {
  return encodeWav(audioBuffer, format === 'flac' ? 24 : bitDepth)
}

// ── LRC Parser ─────────────────────────────────────────────────────────────

/**
 * Parse a standard LRC file into a sorted array of timed lyric lines.
 * Supports: [mm:ss.xx] single-timestamp lines and multi-timestamp lines.
 */
function parseLrc(text: string): LrcLine[] {
  const timeRegex = /\[(\d{1,3}):(\d{2})(?:[.:]([\d]{1,3}))?\]/g
  const lines: LrcLine[] = []
  for (const rawLine of text.split('\n')) {
    const stripped = rawLine.trim()
    if (!stripped) continue
    // Extract all timestamps from this line
    const timestamps: number[] = []
    let m: RegExpExecArray | null
    timeRegex.lastIndex = 0
    while ((m = timeRegex.exec(stripped)) !== null) {
      const min = parseInt(m[1], 10)
      const sec = parseInt(m[2], 10)
      const centis = m[3] !== undefined ? parseInt(m[3].padEnd(3, '0').slice(0, 3), 10) : 0
      timestamps.push(min * 60 + sec + centis / 1000)
    }
    if (timestamps.length === 0) continue
    // Lyric text is what remains after removing all timestamp tags
    const lyricsText = stripped.replace(/\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/g, '').trim()
    if (!lyricsText) continue  // skip metadata-only lines
    for (const t of timestamps) {
      lines.push({ time: t, text: lyricsText })
    }
  }
  return lines.sort((a, b) => a.time - b.time)
}

/** Find the index of the active lyric line for the given playback time. */
function findActiveLrcIndex(lines: LrcLine[], currentTime: number): number {
  if (lines.length === 0) return -1
  let idx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= currentTime) idx = i
    else break
  }
  return idx
}



const SPECTRUM_BARS = 64  // Optimal bar count for visual clarity

type VisualizerMode = 'spectrum' | 'oscilloscope' | 'spectrogram' | 'vuMeter'

/** Premium gradient spectrum with glow, rounded caps, and mirror reflection */
function drawSpectrum(canvas: HTMLCanvasElement, analyser: AnalyserNode): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const width = canvas.width / dpr
  const height = canvas.height / dpr
  ctx.save()
  ctx.scale(dpr, dpr)

  const bufferLength = analyser.frequencyBinCount
  const dataArray = new Uint8Array(bufferLength)
  analyser.getByteFrequencyData(dataArray)

  ctx.clearRect(0, 0, width, height)

  // Use log-spaced bands for perceptually balanced spectrum
  const barCount = SPECTRUM_BARS
  const gap = 2
  const barWidth = (width - (barCount - 1) * gap) / barCount
  const mirrorHeight = height * 0.18  // Reflection zone
  const mainHeight = height - mirrorHeight

  for (let i = 0; i < barCount; i++) {
    // Map bar index to FFT bin using logarithmic scale (20Hz–20kHz)
    const loRatio = i / barCount
    const hiRatio = (i + 1) / barCount
    const loBin = Math.floor(Math.pow(loRatio, 2) * bufferLength * 0.75)
    const hiBin = Math.max(loBin + 1, Math.floor(Math.pow(hiRatio, 2) * bufferLength * 0.75))
    let peak = 0
    for (let j = loBin; j < hiBin && j < bufferLength; j++) {
      peak = Math.max(peak, dataArray[j] / 255)
    }

    const barH = peak * mainHeight * 0.92
    const x = i * (barWidth + gap)
    const y = mainHeight - barH

    // Create vertical gradient: vibrant cyan → electric blue → magenta
    const grad = ctx.createLinearGradient(x, mainHeight, x, y)
    const hue1 = 190 + (i / barCount) * 80  // cyan → blue
    const hue2 = 220 + (i / barCount) * 100 // blue → violet
    const lightness = 50 + peak * 20
    grad.addColorStop(0, `hsla(${hue1}, 90%, ${lightness}%, 0.85)`)
    grad.addColorStop(0.5, `hsla(${(hue1 + hue2) / 2}, 85%, ${lightness + 5}%, 0.95)`)
    grad.addColorStop(1, `hsla(${hue2}, 80%, ${lightness + 10}%, 1)`)

    // Glow effect
    if (peak > 0.3) {
      ctx.shadowBlur = 6 + peak * 10
      ctx.shadowColor = `hsla(${hue1}, 90%, 60%, ${peak * 0.6})`
    } else {
      ctx.shadowBlur = 0
    }

    // Draw bar with rounded top cap
    ctx.fillStyle = grad
    ctx.beginPath()
    const radius = Math.min(barWidth / 2, 3)
    ctx.moveTo(x, mainHeight)
    ctx.lineTo(x, y + radius)
    ctx.quadraticCurveTo(x, y, x + radius, y)
    ctx.lineTo(x + barWidth - radius, y)
    ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius)
    ctx.lineTo(x + barWidth, mainHeight)
    ctx.closePath()
    ctx.fill()

    // Mirror reflection (subtle, fading)
    ctx.shadowBlur = 0
    const reflH = barH * 0.35
    const reflGrad = ctx.createLinearGradient(x, mainHeight, x, mainHeight + reflH)
    reflGrad.addColorStop(0, `hsla(${hue1}, 70%, ${lightness}%, 0.25)`)
    reflGrad.addColorStop(1, `hsla(${hue1}, 70%, ${lightness}%, 0)`)
    ctx.fillStyle = reflGrad
    ctx.fillRect(x, mainHeight + 1, barWidth, reflH)
  }

  // Subtle horizontal separator line
  ctx.strokeStyle = 'rgba(79, 195, 247, 0.15)'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(0, mainHeight)
  ctx.lineTo(width, mainHeight)
  ctx.stroke()

  ctx.restore()
}

/** Premium waveform with gradient stroke and subtle fill */
function drawWaveform(canvas: HTMLCanvasElement, analyser: AnalyserNode): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const width = canvas.width / dpr
  const height = canvas.height / dpr
  ctx.save()
  ctx.scale(dpr, dpr)

  const bufferLength = analyser.fftSize
  const dataArray = new Float32Array(bufferLength)
  analyser.getFloatTimeDomainData(dataArray)

  ctx.clearRect(0, 0, width, height)

  // Gradient stroke
  const strokeGrad = ctx.createLinearGradient(0, 0, width, 0)
  strokeGrad.addColorStop(0, 'rgba(79, 195, 247, 0.9)')
  strokeGrad.addColorStop(0.3, 'rgba(129, 212, 250, 1)')
  strokeGrad.addColorStop(0.6, 'rgba(79, 195, 247, 1)')
  strokeGrad.addColorStop(1, 'rgba(171, 71, 188, 0.8)')

  ctx.strokeStyle = strokeGrad
  ctx.lineWidth = 1.8
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // Draw waveform path
  ctx.beginPath()
  const step = Math.max(1, Math.floor(bufferLength / width))
  for (let i = 0; i < width; i++) {
    const idx = Math.min(i * step, bufferLength - 1)
    const y = (dataArray[idx] + 1) / 2 * height
    if (i === 0) ctx.moveTo(i, y)
    else ctx.lineTo(i, y)
  }
  ctx.stroke()

  // Subtle fill beneath the waveform
  ctx.lineTo(width, height)
  ctx.lineTo(0, height)
  ctx.closePath()
  const fillGrad = ctx.createLinearGradient(0, 0, 0, height)
  fillGrad.addColorStop(0, 'rgba(79, 195, 247, 0.08)')
  fillGrad.addColorStop(1, 'rgba(79, 195, 247, 0)')
  ctx.fillStyle = fillGrad
  ctx.fill()

  // Center line
  ctx.strokeStyle = 'rgba(79, 195, 247, 0.12)'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(0, height / 2)
  ctx.lineTo(width, height / 2)
  ctx.stroke()

  ctx.restore()
}

/** Spectrogram: scrolling time-frequency heat map */
function drawSpectrogram(
  canvas: HTMLCanvasElement,
  analyser: AnalyserNode,
  spectrogramBuffer: Uint8Array[]
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const width = canvas.width / dpr
  const height = canvas.height / dpr
  ctx.save()
  ctx.scale(dpr, dpr)

  const bufferLength = analyser.frequencyBinCount
  const dataArray = new Uint8Array(bufferLength)
  analyser.getByteFrequencyData(dataArray)

  // Add current frame to spectrogram buffer (sliding window)
  spectrogramBuffer.push(new Uint8Array(dataArray))
  const maxCols = Math.ceil(width)
  while (spectrogramBuffer.length > maxCols) spectrogramBuffer.shift()

  ctx.clearRect(0, 0, width, height)

  // Draw the spectrogram columns (time → x, frequency → y)
  const colWidth = Math.max(1, width / maxCols)
  for (let col = 0; col < spectrogramBuffer.length; col++) {
    const frame = spectrogramBuffer[col]
    const x = col * colWidth
    const binsPerPixel = bufferLength / height
    for (let row = 0; row < height; row++) {
      // Map bottom of canvas to low frequencies (invert y)
      const binIdx = Math.floor((height - 1 - row) * binsPerPixel * 0.75)
      const value = frame[binIdx] / 255
      if (value < 0.02) continue
      // Heat map: dark blue → cyan → yellow → red → white
      const h = 240 - value * 240
      const l = 10 + value * 55
      ctx.fillStyle = `hsl(${h}, 90%, ${l}%)`
      ctx.fillRect(x, row, colWidth + 0.5, 1)
    }
  }

  ctx.restore()
}

/** VU Meter: professional audio level meter with peak hold */
function drawVUMeter(
  canvas: HTMLCanvasElement,
  analyser: AnalyserNode,
  peakHoldRef: { left: number; right: number; leftDecay: number; rightDecay: number }
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const width = canvas.width / dpr
  const height = canvas.height / dpr
  ctx.save()
  ctx.scale(dpr, dpr)

  const bufferLength = analyser.fftSize
  const dataArray = new Float32Array(bufferLength)
  analyser.getFloatTimeDomainData(dataArray)

  // Calculate RMS for left and right (simulated stereo from mono)
  let sumLeft = 0
  let sumRight = 0
  const half = Math.floor(bufferLength / 2)
  for (let i = 0; i < half; i++) {
    sumLeft += dataArray[i] * dataArray[i]
    sumRight += dataArray[i + half] * dataArray[i + half]
  }
  const rmsLeft = Math.sqrt(sumLeft / half)
  const rmsRight = Math.sqrt(sumRight / half)

  // Convert to dB scale (-60 to 0 dB range)
  const toDb = (rms: number) => Math.max(-60, 20 * Math.log10(Math.max(rms, 1e-10)))
  const dbLeft = toDb(rmsLeft)
  const dbRight = toDb(rmsRight)
  const normLeft = (dbLeft + 60) / 60
  const normRight = (dbRight + 60) / 60

  // Peak hold with decay
  if (normLeft > peakHoldRef.left) { peakHoldRef.left = normLeft; peakHoldRef.leftDecay = 0 }
  else { peakHoldRef.leftDecay++; if (peakHoldRef.leftDecay > 30) peakHoldRef.left = Math.max(0, peakHoldRef.left - 0.01) }
  if (normRight > peakHoldRef.right) { peakHoldRef.right = normRight; peakHoldRef.rightDecay = 0 }
  else { peakHoldRef.rightDecay++; if (peakHoldRef.rightDecay > 30) peakHoldRef.right = Math.max(0, peakHoldRef.right - 0.01) }

  ctx.clearRect(0, 0, width, height)

  const meterHeight = (height - 24) / 2
  const meterY1 = 4
  const meterY2 = meterY1 + meterHeight + 8

  // Draw meter background
  const drawMeter = (y: number, level: number, peak: number, label: string) => {
    // Background track
    ctx.fillStyle = 'rgba(30, 40, 50, 0.8)'
    ctx.fillRect(24, y, width - 32, meterHeight)

    // Green → Yellow → Red gradient fill
    const meterWidth = width - 32
    const fillWidth = level * meterWidth
    const grad = ctx.createLinearGradient(24, 0, 24 + meterWidth, 0)
    grad.addColorStop(0, '#22c55e')
    grad.addColorStop(0.6, '#22c55e')
    grad.addColorStop(0.75, '#eab308')
    grad.addColorStop(0.9, '#ef4444')
    grad.addColorStop(1, '#dc2626')
    ctx.fillStyle = grad
    ctx.fillRect(24, y, fillWidth, meterHeight)

    // Peak hold indicator
    const peakX = 24 + peak * meterWidth
    ctx.fillStyle = peak > 0.9 ? '#ef4444' : '#ffffff'
    ctx.fillRect(peakX - 1, y, 2, meterHeight)

    // Scale marks at -40, -20, -10, -6, -3, 0 dB
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
    ctx.font = `${Math.max(8, meterHeight * 0.5)}px monospace`
    ctx.textAlign = 'center'
    const marks = [-40, -20, -10, -6, -3, 0]
    for (const db of marks) {
      const mx = 24 + ((db + 60) / 60) * meterWidth
      ctx.fillRect(mx, y + meterHeight - 2, 1, 2)
    }

    // Channel label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
    ctx.textAlign = 'left'
    ctx.font = `bold ${Math.max(9, meterHeight * 0.6)}px sans-serif`
    ctx.fillText(label, 4, y + meterHeight * 0.7)
  }

  drawMeter(meterY1, normLeft, peakHoldRef.left, 'L')
  drawMeter(meterY2, normRight, peakHoldRef.right, 'R')

  // dB scale labels
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
  ctx.font = '8px monospace'
  ctx.textAlign = 'center'
  const meterWidth = width - 32
  const marks = [-40, -20, -10, -6, -3, 0]
  for (const db of marks) {
    const mx = 24 + ((db + 60) / 60) * meterWidth
    ctx.fillText(`${db}`, mx, height - 2)
  }

  ctx.restore()
}

// ── Cache helpers ──────────────────────────────────────────────────────────

function loadCache(): Partial<AudioStudioCache> {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return {}
}

function saveCache(cache: AudioStudioCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch { /* ignore */ }
}

// ── Component ──────────────────────────────────────────────────────────────

export function AudioStudioView(): JSX.Element {
  const { t } = useI18n()

  const cached = useMemo(() => loadCache(), [])

  // Tab state
  const [activeTab, setActiveTab] = useState<StudioTab>(cached.activeTab || 'generator')

  // Player state
  const [playlist, setPlaylist] = useState<TrackItem[]>([])
  const [groups, setGroups] = useState<TrackGroup[]>(cached.groups || [])
  const [currentTrackIndex, setCurrentTrackIndex] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playMode, setPlayMode] = useState<PlayMode>(cached.playMode || 'sequential')
  const [volume, setVolume] = useState(cached.volume ?? 0.8)
  const [muted, setMuted] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [balance, setBalance] = useState(cached.balance ?? 0)

  // Generator state
  const [genConfig, setGenConfig] = useState<GeneratorConfig>(cached.genConfig || DEFAULT_GENERATOR_CONFIG)
  const [generating, setGenerating] = useState(false)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [previewLoop, setPreviewLoop] = useState(false)

  // Scene state
  const [selectedScene, setSelectedScene] = useState<string | null>(null)
  const [sceneCategory, setSceneCategory] = useState<SceneCategory>('instrument')

  // Export state
  const [exportFormat, setExportFormat] = useState<ExportFormat>(cached.exportFormat || 'wav')
  const [lastGeneratedBuffer, setLastGeneratedBuffer] = useState<AudioBuffer | null>(null)

  // Tracks whether the cross-session restore has completed (prevents the initial
  // empty-playlist render from overwriting saved paths on disk before restore runs)
  const [isRestored, setIsRestored] = useState(false)

  // Visualizer mode
  const [vizMode, setVizMode] = useState<VisualizerMode>('spectrum')
  // In-app fullscreen for the visualizer
  const [vizFullscreen, setVizFullscreen] = useState(false)

  // Lyrics state
  const [lrcLines, setLrcLines] = useState<LrcLine[]>([])
  const [activeLrcIndex, setActiveLrcIndex] = useState(-1)
  const [showLyrics, setShowLyrics] = useState(false)
  const lrcFileInputRef = useRef<HTMLInputElement | null>(null)
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null)

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
  const playModeRef = useRef<PlayMode>(playMode)
  const playlistRef = useRef<TrackItem[]>(playlist)
  const spectrogramBufferRef = useRef<Uint8Array[]>([])
  const vuPeakRef = useRef({ left: 0, right: 0, leftDecay: 0, rightDecay: 0 })

  // Keep refs in sync
  useEffect(() => { playModeRef.current = playMode }, [playMode])
  useEffect(() => { playlistRef.current = playlist }, [playlist])

  // Save cache on state changes — skipped until restore has completed so the
  // initial empty-playlist render does not wipe saved paths on disk.
  useEffect(() => {
    if (!isRestored) return
    saveCache({
      playlist: playlist.map(tr => ({ id: tr.id, name: tr.name, group: tr.group })),
      groups,
      playMode,
      volume,
      balance,
      genConfig,
      exportFormat,
      activeTab,
    })
    // Persist file paths to disk via main process for cross-session restore
    const pathEntries = playlist
      .map(tr => {
        if (tr.url && tr.url.startsWith('media://')) {
          const filePath = (() => { try { return new URL(tr.url).searchParams.get('p') ?? '' } catch { return '' } })()
          if (filePath) return { id: tr.id, name: tr.name, path: filePath, group: tr.group }
        }
        return null
      })
      .filter((entry): entry is { id: string; name: string; path: string; group: string } => entry !== null)
    if (pathEntries.length > 0) {
      window.rgbbox.audioSavePaths(pathEntries)
    }
  }, [isRestored, playlist, groups, playMode, volume, balance, genConfig, exportFormat, activeTab])

  // Restore audio file paths from main process on mount
  useEffect(() => {
    let cancelled = false
    window.rgbbox.audioGetSavedPaths().then((saved) => {
      if (cancelled) return
      if (saved.length > 0) {
        const restoredTracks: TrackItem[] = []
        const restoredGroups: Set<string> = new Set()
        for (const entry of saved) {
          try {
            // Native path stored as ?p= to survive Chromium URL normalization
            const mediaUrl = `media://local?p=${encodeURIComponent(entry.path)}`
            restoredTracks.push({
              id: entry.id,
              name: entry.name,
              duration: 0,
              file: undefined,
              url: mediaUrl,
              group: entry.group,
            })
            restoredGroups.add(entry.group)
          } catch { /* skip invalid entries */ }
        }
        if (restoredTracks.length > 0) {
          setPlaylist(prev => prev.length > 0 ? prev : restoredTracks)
          setGroups(prev => {
            if (prev.length > 0) return prev
            return [...restoredGroups].map(name => ({ name, collapsed: false }))
          })
        }
      }
      // Mark restore as done regardless — allows the save effect to start running
      setIsRestored(true)
    })
    return () => { cancelled = true }
  }, [])

  // Initialize audio context
  const ensureAudioContext = useCallback(() => {
    if (audioContextRef.current) return audioContextRef.current
    const ctx = new AudioContext({ sampleRate: 48000 })
    const analyser = ctx.createAnalyser()
    // 4096-point FFT for higher frequency resolution (professional standard)
    analyser.fftSize = 4096
    // Lower smoothing for more responsive visualizations
    analyser.smoothingTimeConstant = 0.72
    analyser.minDecibels = -90
    analyser.maxDecibels = -10
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

  // Visualization loop with HiDPI support
  useEffect(() => {
    if ((!isPlaying && !previewPlaying) || !analyserRef.current) return
    const specCanvas = spectrumCanvasRef.current
    const waveCanvas = waveformCanvasRef.current
    const analyser = analyserRef.current

    // Set up HiDPI canvas rendering
    const setupCanvas = (canvas: HTMLCanvasElement | null) => {
      if (!canvas) return
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
    }
    setupCanvas(specCanvas)
    setupCanvas(waveCanvas)

    const draw = () => {
      switch (vizMode) {
        case 'spectrum':
          if (specCanvas) drawSpectrum(specCanvas, analyser)
          if (waveCanvas) drawWaveform(waveCanvas, analyser)
          break
        case 'oscilloscope':
          if (specCanvas) drawWaveform(specCanvas, analyser)
          if (waveCanvas) drawWaveform(waveCanvas, analyser)
          break
        case 'spectrogram':
          if (specCanvas) drawSpectrogram(specCanvas, analyser, spectrogramBufferRef.current)
          if (waveCanvas) drawWaveform(waveCanvas, analyser)
          break
        case 'vuMeter':
          if (specCanvas) drawVUMeter(specCanvas, analyser, vuPeakRef.current)
          if (waveCanvas) drawWaveform(waveCanvas, analyser)
          break
      }
      animFrameRef.current = requestAnimationFrame(draw)
    }
    animFrameRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [isPlaying, previewPlaying, vizMode, vizFullscreen])

  // ESC exits the in-app visualizer fullscreen
  useEffect(() => {
    if (!vizFullscreen) return
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setVizFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [vizFullscreen])

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

  // File loading — builds tracks using the custom media:// scheme so files can
  // be played from any renderer origin (http://localhost dev or file:// prod).
  // Native path is stored as ?p= query param to prevent Chromium URL normalization
  // from mangling Windows drive letters (e.g. C: → c hostname).
  const addTracksFromPaths = useCallback((entries: Array<{ path: string; name: string; folder?: string }>, defaultGroup?: string) => {
    const groupName = defaultGroup || t('audio.defaultGroup')
    const newTracks: TrackItem[] = entries.map((entry, i) => {
      const mediaUrl = `media://local?p=${encodeURIComponent(entry.path)}`
      const group = entry.folder || groupName
      return {
        id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
        name: entry.name,
        duration: 0,
        file: undefined,
        url: mediaUrl,
        group,
      }
    })
    if (newTracks.length === 0) return
    const newGroupNames = [...new Set(newTracks.map(tr => tr.group))]
    setGroups(prev => {
      const existing = new Set(prev.map(g => g.name))
      const toAdd = newGroupNames.filter(n => !existing.has(n))
      return [...prev, ...toAdd.map(name => ({ name, collapsed: false }))]
    })
    setPlaylist(prev => [...prev, ...newTracks])
  }, [t])

  // Fallback for drag-and-drop: use File objects (blob URLs), with path extraction when available
  const handleFileSelect = useCallback((files: FileList | null, folderName?: string) => {
    if (!files) return
    const entries: Array<{ path: string; name: string; folder?: string }> = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!/\.(wav|flac|mp3|aac|m4a|ogg|opus|weba)$/i.test(file.name)) continue
      const nativePath: string | undefined = (file as any).path
      if (nativePath) {
        const relPath = (file as any).webkitRelativePath as string | undefined
        const folder = relPath ? relPath.split('/')[0] : folderName
        entries.push({ path: nativePath, name: file.name, folder })
      }
      // Files without .path (browser security context) are skipped — they can't persist
    }
    if (entries.length > 0) {
      addTracksFromPaths(entries, folderName)
    }
  }, [addTracksFromPaths, t])

  const handleAddFiles = useCallback(() => {
    window.rgbbox.audioOpenFiles().then(result => {
      if (result.length > 0) addTracksFromPaths(result)
    })
  }, [addTracksFromPaths])

  const handleAddFolder = useCallback(() => {
    window.rgbbox.audioOpenFolder().then(result => {
      if (result.length > 0) addTracksFromPaths(result, result[0]?.folder)
    })
  }, [addTracksFromPaths])

  // Drag and drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const items = e.dataTransfer.items
    if (items) {
      const files: File[] = []
      let folderName = ''
      const processEntry = (entry: any): Promise<void> => {
        return new Promise((resolve) => {
          if (entry.isFile) {
            entry.file((file: File) => { files.push(file); resolve() })
          } else if (entry.isDirectory) {
            if (!folderName) folderName = entry.name
            const reader = entry.createReader()
            reader.readEntries((entries: any[]) => {
              Promise.all(entries.map(processEntry)).then(() => resolve())
            })
          } else { resolve() }
        })
      }
      const entries: any[] = []
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.()
        if (entry) entries.push(entry)
      }
      if (entries.length > 0) {
        Promise.all(entries.map(processEntry)).then(() => {
          if (files.length > 0) {
            const dt = new DataTransfer()
            files.forEach(f => dt.items.add(f))
            handleFileSelect(dt.files, folderName || undefined)
          }
        })
      } else {
        handleFileSelect(e.dataTransfer.files)
      }
    } else {
      handleFileSelect(e.dataTransfer.files)
    }
  }, [handleFileSelect])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  // Playback controls using refs for correct closure
  const playTrack = useCallback((index: number) => {
    const currentPlaylist = playlistRef.current
    if (index < 0 || index >= currentPlaylist.length) return
    const ctx = ensureAudioContext()
    const track = currentPlaylist[index]
    if (!track.url) return

    if (audioElementRef.current) {
      audioElementRef.current.pause()
      audioElementRef.current.src = ''
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect()
      sourceNodeRef.current = null
    }

    const audio = new Audio(track.url)
    // media:// is a corsEnabled privileged scheme — crossOrigin needed for Web Audio API
    audio.crossOrigin = 'anonymous'
    audioElementRef.current = audio

    const source = ctx.createMediaElementSource(audio)
    source.connect(gainNodeRef.current!)
    sourceNodeRef.current = source

    audio.onended = () => {
      const mode = playModeRef.current
      const pl = playlistRef.current
      if (mode === 'loop') {
        audio.currentTime = 0
        audio.play()
      } else if (mode === 'shuffle') {
        const next = Math.floor(Math.random() * pl.length)
        playTrack(next)
      } else {
        if (index < pl.length - 1) playTrack(index + 1)
        else setIsPlaying(false)
      }
    }

    audio.play()
    setCurrentTrackIndex(index)
    setIsPlaying(true)
  }, [ensureAudioContext])

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
    setPlaylist(prev => {
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

  const removeGroup = useCallback((groupName: string) => {
    setPlaylist(prev => {
      const toRemove = prev.filter(tr => tr.group === groupName)
      toRemove.forEach(tr => { if (tr.url) URL.revokeObjectURL(tr.url) })
      return prev.filter(tr => tr.group !== groupName)
    })
    setGroups(prev => prev.filter(g => g.name !== groupName))
    if (audioElementRef.current) {
      audioElementRef.current.pause()
      audioElementRef.current.src = ''
    }
    setIsPlaying(false)
    setCurrentTrackIndex(-1)
  }, [])

  const toggleGroupCollapse = useCallback((groupName: string) => {
    setGroups(prev => prev.map(g => g.name === groupName ? { ...g, collapsed: !g.collapsed } : g))
  }, [])

  const seek = useCallback((time: number) => {
    if (audioElementRef.current) {
      audioElementRef.current.currentTime = time
      setProgress(time)
    }
  }, [])

  // LRC file loading
  const handleLrcFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      if (text) {
        const parsed = parseLrc(text)
        setLrcLines(parsed)
        setActiveLrcIndex(-1)
      }
    }
    reader.readAsText(file, 'utf-8')
    // reset so the same file can be re-selected
    e.target.value = ''
  }, [])

  // Update active lyric line when progress changes
  useEffect(() => {
    if (lrcLines.length === 0) return
    const idx = findActiveLrcIndex(lrcLines, progress)
    setActiveLrcIndex(idx)
  }, [progress, lrcLines])

  // Auto-scroll lyrics to keep the active line centred
  useEffect(() => {
    if (!lyricsContainerRef.current || activeLrcIndex < 0) return
    const container = lyricsContainerRef.current
    const activeLine = container.querySelector<HTMLElement>('.audio-lyric-line.active')
    if (activeLine) {
      const containerMid = container.clientHeight / 2
      const lineTop = activeLine.offsetTop
      const lineH = activeLine.clientHeight
      container.scrollTo({ top: lineTop - containerMid + lineH / 2, behavior: 'smooth' })
    }
  }, [activeLrcIndex])


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

  // Preview with loop support
  const previewGenerated = useCallback(async (sceneId?: string) => {
    if (previewPlaying && previewSourceRef.current) {
      previewSourceRef.current.stop()
      setPreviewPlaying(false)
      return
    }
    const buffer = await generateAudio(sceneId)
    if (!buffer) return
    const ctx = ensureAudioContext()

    const playBuffer = (): void => {
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(gainNodeRef.current!)
      source.onended = () => {
        if (previewLoop) {
          playBuffer()
        } else {
          setPreviewPlaying(false)
        }
      }
      previewSourceRef.current = source
      source.start()
    }

    playBuffer()
    setPreviewPlaying(true)
  }, [previewPlaying, previewLoop, generateAudio, ensureAudioContext])

  // Export
  const exportAudio = useCallback(async (sceneId?: string) => {
    const buffer = lastGeneratedBuffer || await generateAudio(sceneId)
    if (!buffer) return
    const encoded = encodeLossless(buffer, exportFormat, genConfig.bitDepth)
    const blob = new Blob([encoded], { type: exportFormat === 'wav' ? 'audio/wav' : 'audio/flac' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rgbbox-audio-${Date.now()}.wav`
    a.click()
    URL.revokeObjectURL(url)
  }, [lastGeneratedBuffer, generateAudio, exportFormat, genConfig.bitDepth])

  const formatTime = (s: number): string => {
    if (!isFinite(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const filteredScenes = useMemo(
    () => SCENE_PRESETS.filter(s => s.category === sceneCategory),
    [sceneCategory]
  )

  const groupedPlaylist = useMemo(() => {
    const grouped: Map<string, TrackItem[]> = new Map()
    playlist.forEach(track => {
      const list = grouped.get(track.group) || []
      list.push(track)
      grouped.set(track.group, list)
    })
    return grouped
  }, [playlist])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="audio-studio-view">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">{t('audio.eyebrow')}</p>
          <h2>{t('audio.title')}</h2>
        </div>
      </header>

      <div className="audio-studio-layout">
        {/* Left Panel - Playlist */}
        <div className="audio-left-panel" onDrop={handleDrop} onDragOver={handleDragOver}>
          <div className="audio-toolbar">
            <button type="button" className="audio-btn" onClick={handleAddFiles}>
              <Plus size={14} /> {t('audio.addFiles')}
            </button>
            <button type="button" className="audio-btn" onClick={handleAddFolder}>
              <FolderOpen size={14} /> {t('audio.addFolder')}
            </button>
          </div>

          <div className="audio-playlist">
            {playlist.length === 0 && (
              <p className="audio-empty">{t('audio.emptyPlaylist')}</p>
            )}
            {groups.map(group => {
              const tracks = groupedPlaylist.get(group.name) || []
              if (tracks.length === 0) return null
              return (
                <div key={group.name} className="audio-group">
                  <div className="audio-group-header" onClick={() => toggleGroupCollapse(group.name)}>
                    {group.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                    <span className="audio-group-name">{group.name}</span>
                    <span className="audio-group-count">{tracks.length}</span>
                    <button
                      type="button"
                      className="audio-btn-icon"
                      onClick={(e) => { e.stopPropagation(); removeGroup(group.name) }}
                      title={t('audio.removeGroup')}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                  {!group.collapsed && tracks.map(track => {
                    const globalIdx = playlist.indexOf(track)
                    return (
                      <div
                        key={track.id}
                        className={`audio-track-item ${globalIdx === currentTrackIndex ? 'active' : ''}`}
                        onClick={() => playTrack(globalIdx)}
                      >
                        <span className="audio-track-name">{track.name}</span>
                        <button
                          type="button"
                          className="audio-btn-icon"
                          onClick={(e) => { e.stopPropagation(); removeTrack(globalIdx) }}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

          {/* Player controls */}
          <div className="audio-player-controls">
            {/* Current track name */}
            {currentTrackIndex >= 0 && playlist[currentTrackIndex] && (
              <div className="audio-now-playing">
                <span className="audio-now-playing-label">{playlist[currentTrackIndex].name}</span>
              </div>
            )}

            <div className="audio-transport">
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
              <button type="button" className="audio-btn-sm" onClick={skipPrev}><SkipBack size={14} /></button>
              <button type="button" className="audio-btn-play" onClick={togglePlay}>
                {isPlaying ? <Pause size={18} /> : <Play size={18} />}
              </button>
              <button type="button" className="audio-btn-sm" onClick={skipNext}><SkipForward size={14} /></button>
            </div>

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
              {/* LRC lyrics button */}
              <button
                type="button"
                className={`audio-btn-icon${showLyrics ? ' active' : ''}`}
                title={t('audio.lyrics.title')}
                onClick={() => setShowLyrics(v => !v)}
              >
                <FileText size={14} />
              </button>
              <input
                ref={lrcFileInputRef}
                type="file"
                accept=".lrc,.txt"
                style={{ display: 'none' }}
                onChange={handleLrcFile}
              />
            </div>

            {/* Lyrics panel */}
            {showLyrics && (
              <div className="audio-lyrics-panel">
                <div className="audio-lyrics-header">
                  <span className="audio-lyrics-title">{t('audio.lyrics.title')}</span>
                  <button
                    type="button"
                    className="audio-btn-sm"
                    onClick={() => lrcFileInputRef.current?.click()}
                    title={t('audio.lyrics.load')}
                  >
                    <Plus size={12} /> {t('audio.lyrics.load')}
                  </button>
                </div>
                <div ref={lyricsContainerRef} className="audio-lyrics-scroll">
                  {lrcLines.length === 0 ? (
                    <p className="audio-lyrics-empty">{t('audio.lyrics.empty')}</p>
                  ) : (
                    lrcLines.map((line, i) => (
                      <div
                        key={i}
                        className={`audio-lyric-line${i === activeLrcIndex ? ' active' : ''}`}
                        onClick={() => seek(line.time)}
                      >
                        {line.text}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Studio Functions */}
        <div className="audio-right-panel">
          <div className={`audio-visualizers${vizFullscreen ? ' audio-visualizers-fullscreen' : ''}`}>
            <div className="audio-viz-mode-bar">
              {(['spectrum', 'oscilloscope', 'spectrogram', 'vuMeter'] as VisualizerMode[]).map(mode => (
                <button
                  key={mode}
                  type="button"
                  className={`audio-viz-mode-btn ${vizMode === mode ? 'active' : ''}`}
                  onClick={() => { setVizMode(mode); spectrogramBufferRef.current = [] }}
                >
                  {t(`audio.viz.${mode}` as any)}
                </button>
              ))}
              <button
                type="button"
                className="audio-viz-fs-btn"
                title={t(vizFullscreen ? 'audio.viz.exitFullscreen' : 'audio.viz.fullscreen')}
                onClick={() => setVizFullscreen(v => !v)}
              >
                {vizFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            </div>
            <canvas ref={spectrumCanvasRef} className="audio-canvas audio-canvas-spectrum" width={720} height={160} />
            {vizMode === 'oscilloscope' && (
              <canvas ref={waveformCanvasRef} className="audio-canvas audio-canvas-waveform" width={720} height={80} />
            )}
          </div>

          <div className="audio-tabs">
            {(['generator', 'scenes', 'export'] as StudioTab[]).map(tab => (
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

          {/* Generator Tab */}
          {activeTab === 'generator' && (
            <div className="audio-panel audio-panel-scroll">
              <div className="audio-gen-grid">
                <div className="audio-gen-section audio-gen-full">
                  <label className="audio-field-label">{t('audio.gen.type')}</label>
                  <div className="audio-gen-types">
                    {GENERATOR_TYPES.map(gt => (
                      <button
                        key={gt.id}
                        type="button"
                        className={`audio-gen-type-btn ${genConfig.type === gt.id ? 'active' : ''}`}
                        onClick={() => setGenConfig(c => ({ ...c, type: gt.id }))}
                      >
                        {t(gt.labelKey as any)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="audio-gen-section">
                  <label className="audio-field-label">{t('audio.gen.frequency')} (Hz)</label>
                  <div className="audio-input-with-presets">
                    <select
                      className="audio-select"
                      value=""
                      onChange={(e) => { if (e.target.value) setGenConfig(c => ({ ...c, frequency: Number(e.target.value) })) }}
                    >
                      <option value="">{t('audio.preset')}</option>
                      {FREQUENCY_PRESETS.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      className="audio-input"
                      value={genConfig.frequency}
                      min={1}
                      max={22000}
                      onChange={(e) => setGenConfig(c => ({ ...c, frequency: Number(e.target.value) }))}
                    />
                  </div>
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
                      onChange={(e) => setGenConfig(c => ({ ...c, endFrequency: Number(e.target.value) }))}
                    />
                  </div>
                )}

                {genConfig.type === 'noise' && (
                  <div className="audio-gen-section">
                    <label className="audio-field-label">{t('audio.gen.noiseType')}</label>
                    <select
                      className="audio-select"
                      value={genConfig.noiseType}
                      onChange={(e) => setGenConfig(c => ({ ...c, noiseType: e.target.value as NoiseType }))}
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
                    onChange={(e) => setGenConfig(c => ({ ...c, sampleRate: Number(e.target.value) }))}
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
                    onChange={(e) => setGenConfig(c => ({ ...c, bitDepth: Number(e.target.value) }))}
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
                    onChange={(e) => setGenConfig(c => ({ ...c, channels: Number(e.target.value) }))}
                  >
                    <option value={1}>Mono</option>
                    <option value={2}>Stereo</option>
                  </select>
                </div>

                <div className="audio-gen-section">
                  <label className="audio-field-label">{t('audio.gen.duration')} (s)</label>
                  <div className="audio-input-with-presets">
                    <select
                      className="audio-select"
                      value=""
                      onChange={(e) => { if (e.target.value) setGenConfig(c => ({ ...c, duration: Number(e.target.value) })) }}
                    >
                      <option value="">{t('audio.preset')}</option>
                      {DURATION_PRESETS.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      className="audio-input"
                      value={genConfig.duration}
                      min={0.1}
                      max={300}
                      step={0.1}
                      onChange={(e) => setGenConfig(c => ({ ...c, duration: Number(e.target.value) }))}
                    />
                  </div>
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
                    onChange={(e) => setGenConfig(c => ({ ...c, gain: Number(e.target.value) }))}
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
                    onChange={(e) => setGenConfig(c => ({ ...c, panPosition: Number(e.target.value) }))}
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
                    onChange={(e) => setGenConfig(c => ({ ...c, reverbMix: Number(e.target.value) }))}
                  />
                  <span className="audio-value">{Math.round(genConfig.reverbMix * 100)}%</span>
                </div>
              </div>

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
                  className={`audio-btn-sm ${previewLoop ? 'active' : ''}`}
                  onClick={() => setPreviewLoop(!previewLoop)}
                  title={t('audio.previewLoop')}
                >
                  <Repeat size={13} />
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
            <div className="audio-panel audio-panel-scroll">
              <div className="audio-scene-categories">
                {(['instrument', 'vocal', 'game', 'environment', 'mix'] as SceneCategory[]).map(cat => (
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
                {filteredScenes.map(scene => (
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
                        className={`audio-btn-sm ${previewLoop ? 'active' : ''}`}
                        onClick={(e) => { e.stopPropagation(); setPreviewLoop(!previewLoop) }}
                        title={t('audio.previewLoop')}
                      >
                        <Repeat size={11} />
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
      </div>
    </div>
  )
}
