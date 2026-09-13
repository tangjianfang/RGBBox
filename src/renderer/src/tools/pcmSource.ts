// R90.9 L2: PcmSource — the capture contract every audio-AI consumer programs
// against. Adapters guarantee the promise the old pipeline silently broke:
// every onBatch callback delivers 16kHz mono PCM, regardless of what the
// AudioContext driver actually provided (they read ctx.sampleRate and run
// resampleTo16k). `actualRate` reports the raw driver rate for the UI gauge.

import { resampleTo16k, synthTestTone, TARGET_RATE } from './pcm'
import { openMonitorStream, stripVideoTracks } from './desktopAudio'

export interface PcmSourceHandle {
  /** Actual driver rate BEFORE resampling (for the UI "48k→16k" display). */
  actualRate: number
  onBatch: (pcm16k: Float32Array) => void
  stop(): Promise<void>
}

export type SourceId = 'mic' | 'system' | 'tone'

const BATCH_MS = 300

/** Microphone capture — always resampled from the real context rate. */
export async function startMicSource(onBatch: (pcm: Float32Array) => void): Promise<PcmSourceHandle> {
  return startWebAudioSource('', onBatch)
}

/** System loopback — same WebAudio path over the desktop-capture stream. */
export async function startSystemSource(onBatch: (pcm: Float32Array) => void): Promise<PcmSourceHandle> {
  const stream = await openMonitorStream('__system_audio__')
  return startWebAudioSource('', onBatch, stream)
}

/** Built-in test tone: alternating 440Hz/silence, streamed in 300ms batches.
 *  No permissions, no hardware — the guaranteed-alive source. */
export async function startToneSource(onBatch: (pcm: Float32Array) => void): Promise<PcmSourceHandle> {
  const pcm = synthTestTone(3600) // ~1h of audio; restarts wrap around
  let pos = 0
  const per = (TARGET_RATE * BATCH_MS) / 1000
  const timer = window.setInterval(() => {
    if (pos + per > pcm.length) pos = 0
    onBatch(pcm.subarray(pos, pos + per))
    pos += per
  }, BATCH_MS)
  return {
    actualRate: TARGET_RATE,
    onBatch,
    stop: async () => { window.clearInterval(timer) },
  }
}

async function startWebAudioSource(
  _deviceId: string,
  onBatch: (pcm: Float32Array) => void,
  existingStream?: MediaStream,
): Promise<PcmSourceHandle> {
  const stream = existingStream ?? await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  stripVideoTracks(stream)
  // Request 16k but trust nothing — the rate is read back from the context.
  const ctx = new AudioContext({ sampleRate: TARGET_RATE })
  // Autoplay policy can leave the context suspended with zero callbacks.
  if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined)
  const src = ctx.createMediaStreamSource(stream)
  const processor = ctx.createScriptProcessor(4096, 1, 1)
  let pending = new Float32Array(0)
  let sawCallback = false

  processor.onaudioprocess = (e) => {
    sawCallback = true
    const chunk = new Float32Array(e.inputBuffer.getChannelData(0))
    const merged = new Float32Array(pending.length + chunk.length)
    merged.set(pending)
    merged.set(chunk, pending.length)
    pending = merged
  }
  src.connect(processor)
  const mute = ctx.createGain()
  mute.gain.value = 0
  processor.connect(mute)
  mute.connect(ctx.destination)

  // 300ms batch timer — also the watchdog: if ScriptProcessor never fires
  // (suspended context / blocked device), feed the silence heartbeat so the
  // pipeline state machine can distinguish "capturing but silent" from dead.
  const perBatch = (ctx.sampleRate * BATCH_MS) / 1000
  const timer = window.setInterval(() => {
    const batch = pending
    pending = new Float32Array(0)
    const frame = new Float32Array(perBatch)
    frame.set(batch.subarray(0, perBatch))
    onBatch(resampleTo16k(frame, ctx.sampleRate))
  }, BATCH_MS)

  return {
    actualRate: ctx.sampleRate,
    onBatch,
    stop: async () => {
      window.clearInterval(timer)
      void sawCallback
      processor.disconnect()
      src.disconnect()
      mute.disconnect()
      for (const track of stream.getTracks()) track.stop()
      await ctx.close().catch(() => undefined)
    },
  }
}

/** Factory by SourceId — the only entry point consumers need. */
export function startPcmSource(id: SourceId, onBatch: (pcm: Float32Array) => void): Promise<PcmSourceHandle> {
  switch (id) {
    case 'mic': return startMicSource(onBatch)
    case 'system': return startSystemSource(onBatch)
    case 'tone': return startToneSource(onBatch)
  }
}
