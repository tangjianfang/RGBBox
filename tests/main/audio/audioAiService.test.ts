import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock onnxruntime-node before importing the service (it imports ort at top level)
const sessionFactory = vi.fn()
vi.mock('onnxruntime-node', () => ({
  InferenceSession: { create: (...args: unknown[]) => sessionFactory(...args) },
  Tensor: class {
    constructor(public type: string, public data: Float32Array | BigInt64Array, public dims: number[]) {}
  },
}))

import {
  initAudioAi, isCached, runVad, runAst, resetAudioAi, VAD_CHUNK, AST_MODEL_BYTES_BUDGET,
} from '../../../src/main/audioAiService'

/** Minimal fake session: run() echoes scripted outputs per call. */
function fakeSession(outputs: Array<Record<string, { data: Float32Array | BigInt64Array; dims: number[] }>>) {
  let call = 0
  return {
    inputNames: ['x'],
    outputNames: ['out'],
    run: vi.fn(async () => outputs[Math.min(call++, outputs.length - 1)]),
    release: vi.fn(async () => undefined),
  }
}

beforeEach(() => {
  resetAudioAi()
  sessionFactory.mockReset()
})

describe('audioAiService (R90 P1)', () => {
  it('throws a clear error when used before init', async () => {
    await expect(runVad(new Float32Array(16000 * 3))).rejects.toThrow(/not initialized/i)
  })

  it('isCached delegates to the injected finder', async () => {
    const findCached = vi.fn().mockResolvedValue('file:///models/silero_vad.onnx')
    initAudioAi({ modelsDir: 'C:/m', findCached })
    expect(await isCached('silero_vad.onnx')).toBe(true)
    expect(findCached).toHaveBeenCalledWith('silero_vad.onnx')
  })

  it('runVad chunks pcm at 1536, keeps state shape, returns max prob', async () => {
    const sess = fakeSession([
      { output: { data: new Float32Array([0.2]), dims: [1, 1] } },
      { output: { data: new Float32Array([0.9]), dims: [1, 1] } },
    ])
    sessionFactory.mockResolvedValue(sess)
    initAudioAi({ modelsDir: 'C:/m', findCached: vi.fn().mockResolvedValue('file:///s.onnx') })

    const pcm = new Float32Array(16000 * 3)
    const out = await runVad(pcm)
    expect(out.prob).toBeCloseTo(0.9)
    expect(out.frames).toBe(Math.floor(pcm.length / VAD_CHUNK))
    // each run got x[1,1536] + state[2,1,128] + sr[1]
    const feeds = sess.run.mock.calls[0][0] as Record<string, { dims: number[]; data: Float32Array | BigInt64Array }>
    expect(feeds.x.dims).toEqual([1, VAD_CHUNK])
    expect(feeds.state.dims).toEqual([2, 1, 128])
    expect(Number(feeds.sr.data[0])).toBe(16000)
  })

  it('runAst softmaxes 527 logits and returns top-5 by score', async () => {
    const logits = new Float32Array(527).fill(-1)
    logits[12] = 5; logits[7] = 4; logits[100] = 3; logits[0] = 2; logits[526] = 1
    const sess = fakeSession([{ logits: { data: logits, dims: [1, 527] } }])
    sessionFactory.mockResolvedValue(sess)
    initAudioAi({ modelsDir: 'C:/m', findCached: vi.fn().mockResolvedValue('file:///a.onnx') })

    const out = await runAst(new Float32Array(16000 * 3))
    expect(out.top.length).toBe(5)
    expect(out.top.map((t) => t.index)).toEqual([12, 7, 100, 0, 526])
    expect(out.top.every((t) => t.score > 0 && t.score <= 1)).toBe(true)
    for (let i = 1; i < out.top.length; i++) {
      expect(out.top[i].score).toBeLessThanOrEqual(out.top[i - 1].score) // strictly ordered
    }
  })

  it('rejects pcm outside the 1–30s range', async () => {
    initAudioAi({ modelsDir: 'C:/m', findCached: vi.fn().mockResolvedValue(null) })
    await expect(runVad(new Float32Array(100))).rejects.toThrow(/length/i)
    await expect(runAst(new Float32Array(16000 * 31))).rejects.toThrow(/length/i)
  })

  it('budget constant documents the ≤100MB rule', () => {
    expect(AST_MODEL_BYTES_BUDGET).toBe(100 * 1000 * 1000)
  })
})
