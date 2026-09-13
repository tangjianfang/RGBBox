import { describe, it, expect } from 'vitest'
import { frameAgeState } from '../../../src/renderer/src/engine/frameAge'

const NOW = 1_000_000
const GENERATED_AT = NOW - 250

describe('frameAgeState (R87)', () => {
  it('no frame ever generated → waiting (highest priority)', () => {
    expect(frameAgeState(null, NOW, true, true)).toEqual({ kind: 'waiting' })
    expect(frameAgeState(null, NOW, false, false)).toEqual({ kind: 'waiting' })
  })

  it('engine paused → idle(paused), even with a consumer active', () => {
    expect(frameAgeState(GENERATED_AT, NOW, true, false)).toEqual({ kind: 'idle', reason: 'paused' })
  })

  it('no consumer (workspace hidden and no overlay) → idle(no-consumer)', () => {
    expect(frameAgeState(GENERATED_AT, NOW, false, true)).toEqual({ kind: 'idle', reason: 'no-consumer' })
  })

  it('paused outranks no-consumer', () => {
    expect(frameAgeState(GENERATED_AT, NOW, false, false)).toEqual({ kind: 'idle', reason: 'paused' })
  })

  it('frames flowing → age in ms', () => {
    expect(frameAgeState(GENERATED_AT, NOW, true, true)).toEqual({ kind: 'age', ms: 250 })
  })

  it('age never goes negative (clock skew)', () => {
    expect(frameAgeState(NOW + 5_000, NOW, true, true)).toEqual({ kind: 'age', ms: 0 })
  })
})
