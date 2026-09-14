// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  DTLN_BLOCK, DTLN_HOP, DtlnFrameAssembler, DtlnOlaAccumulator, fftInPlace, resampleOutputCount,
} from '../../src/shared/dtlnDsp'
import { findMissingDenoiseModels } from '../../src/main/denoiseService'

describe('shared/dtlnDsp (R91.3b)', () => {
  it('FFT round-trips a sine (forward magnitude peaks at the tone bin, inverse restores samples)', () => {
    const n = 512
    const re = new Float32Array(n)
    const im = new Float32Array(n)
    const freqBin = 37
    for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * freqBin * i) / n)
    const orig = Float32Array.from(re)
    fftInPlace(re, im, false)
    let peak = 0
    let peakIdx = -1
    for (let k = 0; k < n; k++) {
      const m = Math.hypot(re[k], im[k])
      if (m > peak) { peak = m; peakIdx = k }
    }
    expect(peakIdx).toBe(freqBin)
    expect(peak).toBeCloseTo(n / 2, 1) // unitary sine amplitude n/2
    fftInPlace(re, im, true)
    for (let i = 0; i < n; i++) expect(re[i]).toBeCloseTo(orig[i], 4)
  })

  it('FrameAssembler slides the 512 window by each 128 hop', () => {
    const a = new DtlnFrameAssembler()
    const hop = (v: number) => new Float32Array(128).fill(v)
    a.push(hop(1))
    a.push(hop(2))
    let w = a.window()
    // two hops in: oldest 256 samples are still the initial zeros
    expect([...w.slice(0, 256)].every((x) => x === 0)).toBe(true)
    expect([...w.slice(256, 384)].every((x) => x === 1)).toBe(true)
    expect([...w.slice(384)].every((x) => x === 2)).toBe(true)
    a.push(hop(3))
    w = a.window()
    expect(w[0]).toBe(0)
    expect(w[128]).toBe(1)
    expect(w[256]).toBe(2)
    expect(w[384]).toBe(3)
    expect(a.hops).toBe(3)
  })

  it('FrameAssembler rejects malformed hops', () => {
    const a = new DtlnFrameAssembler()
    expect(() => a.push(new Float32Array(127))).toThrow()
  })

  it('OLA accumulator drains hop-sized output and zeroes the tail', () => {
    const ola = new DtlnOlaAccumulator()
    const blk = new Float32Array(DTLN_BLOCK)
    for (let i = 0; i < DTLN_BLOCK; i++) blk[i] = 1
    ola.add(blk)
    const hop = new Float32Array(DTLN_HOP)
    ola.drainHop(hop)
    expect([...hop].every((x) => x === 1)).toBe(true)
    // after the shift the tail zeroes; the next block overlaps the survivors —
    // reference out_buffer semantics: positions still holding the previous
    // block sum to 2, zeroed tail picks up 1
    ola.add(blk)
    const hop2 = new Float32Array(DTLN_HOP)
    ola.drainHop(hop2)
    expect(hop2[0]).toBe(2) // overlapping region of the two blocks
  })

  it('resampleOutputCount: 48k→16k produces ~a third, carrying phase', () => {
    const a = resampleOutputCount(128, 48000, 0)
    expect(a.count).toBe(43) // positions 0,3,…,126 (last ≤127)
    expect(a.phase).toBeGreaterThanOrEqual(0)
    expect(a.phase).toBeLessThan(3) // phase lives in [0, step)
    // 44.1k→16k fractional case stays consistent across calls
    const b = resampleOutputCount(128, 44100, 0)
    expect(b.count).toBeGreaterThan(40)
    expect(b.count).toBeLessThan(50)
    expect(b.phase).toBeGreaterThanOrEqual(0)
    expect(b.phase).toBeLessThan(44100 / 16000)
  })
})

describe('main/denoiseService.findMissingDenoiseModels (R91.3b)', () => {
  it('reports both models missing when nothing is cached', async () => {
    const missing = await findMissingDenoiseModels('/models', async () => { throw new Error('ENOENT') })
    expect(missing).toEqual(['dtln_1', 'dtln_2'])
  })

  it('reports nothing when both exist', async () => {
    const missing = await findMissingDenoiseModels('/models', async () => undefined)
    expect(missing).toEqual([])
  })
})
