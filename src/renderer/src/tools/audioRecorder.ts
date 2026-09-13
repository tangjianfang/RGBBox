// R90 P1: microphone capture for the AI Lab audio test cards.
// Records mono at 16kHz (AudioContext resamples natively) and returns raw PCM.
// happy-dom has no media stack — component tests mock this module.

export interface AudioRecorderHandle {
  /** Stops recording immediately and resolves with the captured mono PCM. */
  stop(): Promise<Float32Array>
  /** Resolves with the captured PCM once the requested duration elapses
   *  (the auto-stop path — R90 review fix: awaiting stop() right after start
   *  captured ~0ms of audio because cleanup raced the audio callback). */
  done: Promise<Float32Array>
}

export async function startAudioRecorder(seconds?: number): Promise<AudioRecorderHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const ctx = new AudioContext({ sampleRate: 16000 })
  const source = ctx.createMediaStreamSource(stream)
  const processor = ctx.createScriptProcessor(4096, 1, 1)
  const chunks: Float32Array[] = []

  processor.onaudioprocess = (e) => {
    chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)))
  }
  source.connect(processor)
  // ScriptProcessor needs a destination connection to fire in some engines;
  // connect to a zero-gain node so nothing is audible.
  const mute = ctx.createGain()
  mute.gain.value = 0
  processor.connect(mute)
  mute.connect(ctx.destination)

  const cleanup = async (): Promise<void> => {
    processor.disconnect()
    source.disconnect()
    mute.disconnect()
    for (const track of stream.getTracks()) track.stop()
    await ctx.close().catch(() => undefined)
  }

  const concat = (): Float32Array => {
    const total = chunks.reduce((s, c) => s + c.length, 0)
    const out = new Float32Array(total)
    let off = 0
    for (const c of chunks) {
      out.set(c, off)
      off += c.length
    }
    return out
  }

  let stopped = false
  async function stop(): Promise<Float32Array> {
    if (stopped) return concat()
    stopped = true
    await cleanup()
    return concat()
  }

  let doneResolver: ((pcm: Float32Array) => void) | null = null
  const done = new Promise<Float32Array>((resolve) => { doneResolver = resolve })
  if (seconds !== undefined) {
    window.setTimeout(async () => {
      const pcm = await stop()
      doneResolver?.(pcm)
    }, seconds * 1000)
  }

  return { stop, done }
}
