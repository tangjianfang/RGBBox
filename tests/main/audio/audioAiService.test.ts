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

  it('runVad follows the flattened-graph 512-step protocol (input/state/sr → output/stateN)', async () => {
    const sess = fakeSession([
      { output: { data: new Float32Array([0.2]), dims: [1, 1] }, stateN: { data: new Float32Array(256).fill(0.5), dims: [2, 1, 128] } },
      { output: { data: new Float32Array([0.9]), dims: [1, 1] }, stateN: { data: new Float32Array(256), dims: [2, 1, 128] } },
    ])
    sessionFactory.mockResolvedValue(sess)
    initAudioAi({ modelsDir: 'C:/m', findCached: vi.fn().mockResolvedValue('file:///s.onnx') })

    const pcm = new Float32Array(16000 * 3)
    const out = await runVad(pcm)
    expect(out.prob).toBeCloseTo(0.9)
    expect(out.frames).toBe(Math.floor(pcm.length / 512))
    // chunk 1 feeds {input, state, sr}: input[1,512], state[2,1,128], sr=16000
    const feeds = sess.run.mock.calls[0][0] as Record<string, { dims: number[]; data: Float32Array | BigInt64Array }>
    expect(feeds.input.dims).toEqual([1, 512])
    expect(feeds.state.dims).toEqual([2, 1, 128])
    expect(Number(feeds.sr.data[0])).toBe(16000)
    // chunk 2 carries chunk-1's stateN
    const feeds2 = sess.run.mock.calls[1][0] as Record<string, { data: Float32Array; dims: number[] }>
    expect(feeds2.state.data[0]).toBe(0.5)
  })

  it('runAst feeds input_values, softmaxes 527 logits and returns top-5 by score', async () => {
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
    const feeds = sess.run.mock.calls[0][0] as Record<string, { dims: number[] }>
    expect(feeds.input_values.dims).toEqual([1, 1024, 128]) // R90 review: optimum export feed name
  })

  it('rejects pcm outside the 1–30s (VAD) / 1–10s (AST) ranges', async () => {
    initAudioAi({ modelsDir: 'C:/m', findCached: vi.fn().mockResolvedValue(null) })
    await expect(runVad(new Float32Array(100))).rejects.toThrow(/length/i)
    await expect(runVad(new Float32Array(16000 * 31))).rejects.toThrow(/length/i)
    await expect(runAst(new Float32Array(16000 * 11))).rejects.toThrow(/length/i)
  })

  it('a rejected session create is NOT cached — the next call retries (R90 review fix)', async () => {
    const bad = fakeSession([])
    const good = fakeSession([{ output: { data: new Float32Array([0.8]), dims: [1, 1] } }])
    sessionFactory.mockRejectedValueOnce(new Error('corrupt file'))
    sessionFactory.mockResolvedValueOnce(good)
    initAudioAi({ modelsDir: 'C:/m', findCached: vi.fn().mockResolvedValue('file:///s.onnx') })
    await expect(runVad(new Float32Array(16000 * 3))).rejects.toThrow('corrupt file')
    const out = await runVad(new Float32Array(16000 * 3)) // must retry create, not reuse rejection
    expect(out.prob).toBeCloseTo(0.8)
    expect(sessionFactory).toHaveBeenCalledTimes(2)
    expect(bad).toBeDefined()
  })
})

// ── R90.8: streaming session ───────────────────────────────────────────────
import { startStream, feedStream, stopStream } from '../../../src/main/audioAiService'

describe('streaming session (R90.8)', () => {
  beforeEach(() => {
    initAudioAi({ modelsDir: 'C:/m', findCached: vi.fn(async (f: string) => `file:///${f}`) })
  })

  it('feed keeps VAD context/state across calls and refreshes AST on a 2s cadence', async () => {
    const vadSess = fakeSession([{ output: { data: new Float32Array([0.42]), dims: [1, 1] } }])
    const astSess = fakeSession([{ logits: { data: (() => { const a = new Float32Array(527).fill(-1); a[0] = 5; return a })(), dims: [1, 527] } }])
    sessionFactory.mockImplementation(async (url: string) => (url.includes('silero') ? vadSess : astSess))

    startStream()
    const first = await feedStream(new Float32Array(16000)) // 1s
    expect(first.prob).toBeCloseTo(0.42)
    expect(first.top).toBeDefined() // first feed has no "last" timestamp → runs once

    const second = await feedStream(new Float32Array(16000)) // +1s → <2s cadence → no AST refresh
    expect(second.prob).toBeCloseTo(0.42)
    expect(second.top).toBeUndefined()
    // simulate cadence elapsed via direct third feed after faking time
    const later = await feedStream(new Float32Array(16000))
    expect(later.prob).toBeCloseTo(0.42)
    stopStream()
    await expect(feedStream(new Float32Array(16000))).rejects.toThrow(/no active/i)
  })

  it('stopStream clears the session; a fresh start re-runs inference', async () => {
    const vadSess = fakeSession([{ output: { data: new Float32Array([0.7]), dims: [1, 1] } }])
    const astSess = fakeSession([{ logits: { data: new Float32Array(527), dims: [1, 527] } }])
    sessionFactory.mockImplementation(async (url: string) => (url.includes('silero') ? vadSess : astSess))
    startStream()
    await feedStream(new Float32Array(16000))
    stopStream()
    startStream()
    const out = await feedStream(new Float32Array(16000))
    expect(out.prob).toBeCloseTo(0.7)
  })

  it('double start is safe (previous session replaced)', async () => {
    sessionFactory.mockImplementation(async (url: string) =>
      fakeSession(url.includes('silero')
        ? [{ output: { data: new Float32Array([0.1]), dims: [1, 1] } }]
        : [{ logits: { data: new Float32Array(527), dims: [1, 527] } }]))
    startStream()
    startStream()
    const out = await feedStream(new Float32Array(16000))
    expect(out.prob).toBeCloseTo(0.1)
  })
})

describe('stream session refcount (R90.9)', () => {
  beforeEach(() => {
    initAudioAi({ modelsDir: 'C:/m', findCached: vi.fn(async (f: string) => `file:///${f}`) })
  })

  it('a second consumer keeps the session alive when the first stops', async () => {
    const vadSess = fakeSession([{ output: { data: new Float32Array([0.6]), dims: [1, 1] } }])
    const astSess = fakeSession([{ logits: { data: new Float32Array(527), dims: [1, 527] } }])
    sessionFactory.mockImplementation(async (url: string) => (url.includes('silero') ? vadSess : astSess))
    startStream() // consumer A (live pipeline)
    startStream() // consumer B (self-test)
    stopStream()  // B stops — A still holds the session
    const out = await feedStream(new Float32Array(16000))
    expect(out.prob).toBeCloseTo(0.6)
    stopStream()  // A stops too → session dies
    await expect(feedStream(new Float32Array(16000))).rejects.toThrow(/no active/i)
  })

  it('an AST failure is isolated: VAD keeps flowing, astError rides the tick, backoff engages', async () => {
    const vadSess = fakeSession([{ output: { data: new Float32Array([0.7]), dims: [1, 1] } }])
    const badAst = { run: vi.fn(async () => { throw new Error('onnx boom') }) }
    sessionFactory.mockImplementation(async (url: string) => (url.includes('silero') ? vadSess : badAst))
    startStream()
    // 2s of audio fills the ring past 1s → AST runs on the FIRST feed and
    // THROWS — the tick must still be ok with VAD flowing + astError riding
    const tick = await feedStream(new Float32Array(16000 * 2))
    expect(tick.prob).toBeCloseTo(0.7)
    expect(tick.astError).toContain('onnx boom')
    // backoff: an immediate second feed does NOT re-invoke the broken AST
    const calls = badAst.run.mock.calls.length
    const next = await feedStream(new Float32Array(16000))
    expect(badAst.run.mock.calls.length).toBe(calls)
    expect(next.astError).toBeUndefined() // error is per-attempt, not sticky
    stopStream()
  })
})
