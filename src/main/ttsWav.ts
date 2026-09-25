/**
 * ttsWav — R173-S2 纯 WAV 编码(Kokoro 输出 Float32 @24kHz → 16bit PCM WAV)。
 * 无依赖可单测;段间以 80ms 静音衔接(方案「句间停顿」默认值)。
 */

export function floatTo16BitPcm(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i += 1) {
    const s = Math.max(-1, Math.min(1, input[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

export function buildWavHeader(dataBytes: number, sampleRate: number, channels = 1, bitsPerSample = 16): Buffer {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataBytes, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28) // byte rate
  header.writeUInt16LE(channels * (bitsPerSample / 8), 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataBytes, 40)
  return header
}

/** 多段 Float32 → 单个 WAV Buffer(段间 gapMs 静音)。 */
export function segmentsToWav(segments: Float32Array[], sampleRate: number, gapMs = 80): Buffer {
  const gapSamples = Math.round((sampleRate * gapMs) / 1000)
  const parts: Int16Array[] = []
  let total = 0
  segments.forEach((seg, i) => {
    parts.push(floatTo16BitPcm(seg))
    total += seg.length
    if (i < segments.length - 1 && gapSamples > 0) {
      parts.push(new Int16Array(gapSamples))
      total += gapSamples
    }
  })
  const pcm = new Int16Array(total)
  let offset = 0
  for (const p of parts) {
    pcm.set(p, offset)
    offset += p.length
  }
  const data = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  return Buffer.concat([buildWavHeader(data.length, sampleRate), data])
}
