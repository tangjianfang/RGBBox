import { describe, expect, it } from 'vitest'
import { envAdvice } from '../../../src/renderer/src/vision/envCoach'

describe('vision/envCoach (R141-B)', () => {
  it('stays quiet with insufficient evidence (<45 samples)', () => {
    expect(envAdvice({ acquireP95: 80, camFps: 60, samples: 44 })).toBeNull()
  })

  it('flags dim light when capture age is long (exposure pulled to full frame)', () => {
    expect(envAdvice({ acquireP95: 46, camFps: 60, samples: 100 })).toBe('dim-light')
    expect(envAdvice({ acquireP95: 44.9, camFps: 60, samples: 100 })).toBeNull()
  })

  it('flags low camera fps below 25 (after dim light, which matters more)', () => {
    expect(envAdvice({ acquireP95: 20, camFps: 24, samples: 100 })).toBe('low-fps')
    expect(envAdvice({ acquireP95: 20, camFps: 25, samples: 100 })).toBeNull()
  })

  it('dim light wins over low fps (lighting also fixes exposure-induced lag)', () => {
    expect(envAdvice({ acquireP95: 60, camFps: 20, samples: 100 })).toBe('dim-light')
  })

  it('flags distance only when active and the hand is lost', () => {
    expect(envAdvice({ acquireP95: 20, camFps: 60, handLost: true, samples: 100 })).toBe('too-far')
    expect(envAdvice({ acquireP95: 20, camFps: 60, handLost: false, samples: 100 })).toBeNull()
    expect(envAdvice({ acquireP95: 20, camFps: 60, handLost: true, samples: 10 })).toBeNull()
  })
})
