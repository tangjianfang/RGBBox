// @vitest-environment happy-dom
// R239: the banner's failure card — a vision error renders the CLASSIFIED
// text (games.vision.err.<kind>) plus the recovery CTA instead of a raw
// error dump. The i18n stub echoes keys, so assertions match key text.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { VisionBanner } from '../../../../src/renderer/src/components/vision/VisionBanner'
import type { VisionInputHandle } from '../../../../src/renderer/src/hooks/useVisionInput'

function fakeVision(over: Partial<VisionInputHandle> = {}): VisionInputHandle {
  return {
    state: 'idle',
    label: '',
    statusKey: null,
    stepId: null,
    handSeen: false,
    enabled: false,
    error: null,
    errorKind: null,
    frameRef: { current: null },
    skipCalibration: vi.fn(),
    ...over,
  } as unknown as VisionInputHandle
}

afterEach(() => cleanup())

describe('renderer/components/vision/VisionBanner error card (R239)', () => {
  it('denied: classified text + settings guidance + retry CTA wired to onRetry', () => {
    const onRetry = vi.fn()
    const { container, getByTitle } = render(
      <VisionBanner vision={fakeVision({ error: 'NotAllowedError: Permission denied', errorKind: 'denied' })} onRetry={onRetry} />,
    )
    const banner = container.querySelector('.vision-banner')
    expect(banner).toBeTruthy()
    expect(banner?.className).toContain('error')
    expect(banner?.getAttribute('role')).toBe('alert')
    expect(banner?.textContent).toContain('games.vision.err.denied')
    // degraded CTA: no openExternal whitelist channel exists — text guidance
    expect(banner?.textContent).toContain('games.vision.err.openSettings')
    fireEvent.click(getByTitle('games.vision.err.retry'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('no-device: enumerate guidance + retry; occupied/timeout/detached/generic show retry alone', () => {
    const onRetry = vi.fn()
    const nodev = render(<VisionBanner vision={fakeVision({ error: 'no camera', errorKind: 'no-device' })} onRetry={onRetry} />)
    expect(nodev.container.textContent).toContain('games.vision.err.no-device')
    expect(nodev.container.textContent).toContain('games.vision.err.enumerate')
    cleanup()
    const detached = render(<VisionBanner vision={fakeVision({ error: 'camera-ended', errorKind: 'detached' })} onRetry={onRetry} />)
    expect(detached.container.textContent).toContain('games.vision.err.detached')
    expect(detached.container.textContent).not.toContain('games.vision.err.openSettings')
    expect(detached.container.querySelectorAll('button')).toHaveLength(1) // retry only
  })

  it('an error with no errorKind falls back to the generic card (retry CTA)', () => {
    const onRetry = vi.fn()
    const { container, getByTitle } = render(
      <VisionBanner vision={fakeVision({ error: 'wasm boom', errorKind: null })} onRetry={onRetry} />,
    )
    expect(container.textContent).toContain('games.vision.err.generic')
    fireEvent.click(getByTitle('games.vision.err.retry'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('a healthy session renders the normal status banner (no error card)', () => {
    const { container } = render(
      <VisionBanner vision={fakeVision({ state: 'active', handSeen: true, label: '' })} />,
    )
    expect(container.querySelector('.vision-banner')?.className).not.toContain('error')
    expect(container.textContent).toContain('games.vision.state.active')
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })
})
