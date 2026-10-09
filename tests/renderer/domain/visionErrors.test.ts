// R239: camera-failure classification (domain/visionErrors.ts). The host
// surfaces failures as plain text over the wire — the UI needs a stable,
// locale-independent kind + CTA to render the right recovery card. Both
// shapes must classify: the DOMException NAME ("NotAllowedError: …", when the
// error crossed as String(err)) and Chromium's bare MESSAGE ("Permission
// denied by system" — the host posts err.message, which drops the name).
import { describe, it, expect } from 'vitest'
import { classifyVisionError, VISION_ERROR_CTA, type VisionErrorKind } from '../../../src/renderer/src/domain/visionErrors'

describe('renderer/domain/visionErrors (R239 classify)', () => {
  it('NotAllowedError (name or bare permission text) → denied / open-settings', () => {
    expect(classifyVisionError('NotAllowedError: Permission denied')).toEqual({ kind: 'denied', cta: 'open-settings' })
    // the host posts err.message — Chromium's bare text carries no exception name
    expect(classifyVisionError('Permission denied by system')).toEqual({ kind: 'denied', cta: 'open-settings' })
    expect(classifyVisionError('permission denied')).toEqual({ kind: 'denied', cta: 'open-settings' })
  })

  it('NotFoundError (name or bare not-found text) → no-device / enumerate', () => {
    expect(classifyVisionError('NotFoundError: Requested device not found')).toEqual({ kind: 'no-device', cta: 'enumerate' })
    expect(classifyVisionError('Requested device not found')).toEqual({ kind: 'no-device', cta: 'enumerate' })
    expect(classifyVisionError('no camera')).toEqual({ kind: 'no-device', cta: 'enumerate' })
  })

  it('NotReadableError (name or bare occupied text) → occupied / retry', () => {
    expect(classifyVisionError('NotReadableError: Could not start video source')).toEqual({ kind: 'occupied', cta: 'retry' })
    expect(classifyVisionError('Could not start video source')).toEqual({ kind: 'occupied', cta: 'retry' })
  })

  it("'camera-ended' (the R239 watchdog's stable code) → detached / retry", () => {
    expect(classifyVisionError('camera-ended')).toEqual({ kind: 'detached', cta: 'retry' })
  })

  it("the init watchdog's message → timeout / retry", () => {
    expect(classifyVisionError('vision init timeout (20s)')).toEqual({ kind: 'timeout', cta: 'retry' })
  })

  it('anything else → generic / retry (raw text stays the actionable detail)', () => {
    expect(classifyVisionError('wasm boom')).toEqual({ kind: 'generic', cta: 'retry' })
    expect(classifyVisionError('vision pipeline failed: dead')).toEqual({ kind: 'generic', cta: 'retry' })
    expect(classifyVisionError('')).toEqual({ kind: 'generic', cta: 'retry' })
  })

  it('matching is case-insensitive', () => {
    expect(classifyVisionError('notallowederror: nope').kind).toBe('denied')
    expect(classifyVisionError('CAMERA-ENDED').kind).toBe('detached')
  })

  it('VISION_ERROR_CTA covers every kind consistently with classifyVisionError', () => {
    const kinds: VisionErrorKind[] = ['denied', 'no-device', 'occupied', 'detached', 'timeout', 'generic']
    for (const kind of kinds) {
      expect(VISION_ERROR_CTA[kind]).toBeTruthy()
    }
    expect(VISION_ERROR_CTA.denied).toBe('open-settings')
    expect(VISION_ERROR_CTA['no-device']).toBe('enumerate')
  })
})
