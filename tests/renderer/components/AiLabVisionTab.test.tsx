// @vitest-environment happy-dom
// R144: AI Lab vision capability bench — catalog rendering, event-driven row
// lighting, the three client-side combos (double-pinch / palm hold / fist
// clutch), live signal readouts and hook wiring. The vision hook is mocked
// (the real host pipeline has its own suites); events arrive on the same
// window 'vision-input' bus the real hook dispatches.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import { AiLabVisionTab } from '../../../src/renderer/src/components/AiLabVisionTab'
import { setupRendererMocks } from '../_helpers'

const h = vi.hoisted(() => {
  const vision = {
    enable: vi.fn().mockResolvedValue(undefined),
    enableSynthetic: vi.fn().mockResolvedValue(undefined),
    disable: vi.fn(),
    recalibrate: vi.fn(),
    setPaused: vi.fn(),
    resumeActive: vi.fn(),
    skipCalibration: vi.fn(),
    applySettings: vi.fn(),
    setMirror: vi.fn(),
    mirror: true,
    setChordTextMode: vi.fn(),
    chordBackspace: vi.fn(),
    chordBuffer: vi.fn(() => ''),
    setCapturePrecision: vi.fn(),
    setSensitivity: vi.fn(),
    sensitivity: 'standard' as 'standard' | 'fast' | 'sport',
    enabled: false,
    label: '',
    state: 'idle' as string,
    stepId: null as string | null,
    handSeen: false,
    frameRef: { current: null as Record<string, unknown> | null },
    heldRef: { current: new Set<string>() },
    queueRef: { current: [] as string[] },
  }
  return { vision }
})
vi.mock('../../../src/renderer/src/hooks/useVisionInput', () => ({ useVisionInput: () => h.vision }))

function bus(detail: Record<string, unknown>): void {
  // wrapped in act so React flushes the resulting state update synchronously
  act(() => { window.dispatchEvent(new CustomEvent('vision-input', { detail })) })
}

function row(container: HTMLElement, id: string): HTMLTableRowElement {
  return container.querySelector(`tr[data-cap="${id}"]`) as HTMLTableRowElement
}

function countOf(r: HTMLTableRowElement | null): string {
  return r?.querySelector('.cap-count')?.textContent ?? ''
}

/** 21 landmarks with only the given fingers extended (rest folded toward wrist at 0,0). */
function landmarks(extended: Array<'thumb' | 'index' | 'middle' | 'ring' | 'pinky'>): Array<{ x: number; y: number; z: number }> {
  const lm = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }))
  const pips: Array<[number, number]> = [[6, 8], [10, 12], [14, 16], [18, 20]] // index/middle/ring/pinky pip,tip
  const names = ['index', 'middle', 'ring', 'pinky'] as const
  pips.forEach(([pip, tip], i) => {
    const ext = extended.includes(names[i])
    lm[pip] = { x: 0.1, y: 0.01, z: 0 }
    lm[tip] = ext ? { x: 0.2, y: 0.01, z: 0 } : { x: 0.05, y: 0.01, z: 0 }
  })
  if (extended.includes('thumb')) { lm[2] = { x: 0.02, y: 0, z: 0 }; lm[4] = { x: 0.15, y: 0, z: 0 }; lm[17] = { x: 0.02, y: 0.02, z: 0 } }
  return lm
}

beforeEach(() => {
  localStorage.clear()
  cleanup()
  vi.clearAllMocks()
  h.vision.enabled = false
  h.vision.state = 'idle'
  h.vision.frameRef.current = null
  setupRendererMocks()
})
afterEach(() => { vi.useRealTimers(); cleanup() })

describe('AiLabVisionTab (R144)', () => {
  it('renders the 24-capability catalog across 7 groups', () => {
    const { container } = render(<AiLabVisionTab />)
    expect(container.querySelectorAll('tr[data-cap]').length).toBe(24)
    expect(container.querySelectorAll('tr.cap-group').length).toBe(7)
    // every group has at least one row; chords alone carry 8
    expect(container.querySelectorAll('tr[data-cap^="chord-"]').length).toBe(7)
    expect(row(container, 'dir8')).toBeTruthy()
    expect(row(container, 'chordText')).toBeTruthy()
    expect(row(container, 'faceNeutral')).toBeTruthy()
    expect(row(container, 'clutch')).toBeTruthy()
  })

  it('lights + counts the pinch row, held badge follows down/up', () => {
    h.vision.enabled = true
    const { container } = render(<AiLabVisionTab />)
    bus({ kind: 'pinch', key: 'Space', down: true })
    bus({ kind: 'pinch', key: 'Space', down: false })
    const r = row(container, 'pinch')
    expect(countOf(r)).toBe('×1')
    expect(r.querySelector('.cap-held')).toBeNull() // released
    bus({ kind: 'pinch', key: 'Space', down: true })
    expect(countOf(r)).toBe('×2')
    expect(row(container, 'pinch').querySelector('.cap-held')).not.toBeNull()
  })

  it('double-pinch combo fires only within 900ms', () => {
    h.vision.enabled = true
    const { container } = render(<AiLabVisionTab />)
    bus({ kind: 'pinch', key: 'Space', down: true })
    bus({ kind: 'pinch', key: 'Space', down: false })
    bus({ kind: 'pinch', key: 'Space', down: true }) // second within ms
    bus({ kind: 'pinch', key: 'Space', down: false })
    expect(countOf(row(container, 'doublePinch'))).toBe('×1')
  })

  it('chord command rows light individually; text chars land on the chordText row', () => {
    h.vision.enabled = true
    const { container } = render(<AiLabVisionTab />)
    bus({ kind: 'chord', name: 'select', down: true })
    expect(countOf(row(container, 'chord-select'))).toBe('×1')
    expect(countOf(row(container, 'chord-menu'))).toBe('')
    bus({ kind: 'chord', name: 'menu', down: true })
    expect(countOf(row(container, 'chord-menu'))).toBe('×1')
    bus({ kind: 'chord', name: 'char:e', down: true })
    expect(countOf(row(container, 'chordText'))).toBe('×1')
    expect(row(container, 'chordText').querySelector('.cap-note')?.textContent).toBe('e')
  })

  it('face rows: jawOpen lights; neutral calibration is its own row', () => {
    h.vision.enabled = true
    const { container } = render(<AiLabVisionTab />)
    bus({ kind: 'face', name: 'jawOpen', key: 'KeyE', down: true })
    bus({ kind: 'face', name: 'calibrated', key: null, down: true })
    expect(countOf(row(container, 'jawOpen'))).toBe('×1')
    expect(countOf(row(container, 'faceNeutral'))).toBe('×1')
    expect(countOf(row(container, 'smile'))).toBe('')
  })

  it('dual-hand rows: offhand pinch / pause and hands apart/together', () => {
    h.vision.enabled = true
    const { container } = render(<AiLabVisionTab />)
    bus({ kind: 'offhand', name: 'pinch', key: 'KeyF', down: true })
    bus({ kind: 'offhand', name: 'pause', key: null, down: true })
    bus({ kind: 'hands', name: 'apart', key: null, down: true })
    bus({ kind: 'hands', name: 'together', key: null, down: false })
    expect(countOf(row(container, 'offPinch'))).toBe('×1')
    expect(countOf(row(container, 'offPalm'))).toBe('×1')
    expect(countOf(row(container, 'gapApart'))).toBe('×1')
    expect(countOf(row(container, 'gapTogether'))).toBe('×1')
  })

  it('direction row records the latest sector as its note', () => {
    h.vision.enabled = true
    const { container } = render(<AiLabVisionTab />)
    bus({ kind: 'direction', key: 'ArrowUp', dir: 'up-right', down: true })
    expect(row(container, 'dir8').querySelector('.cap-note')?.textContent).toBe('up-right')
  })

  it('start/stop/recal/skip wire to the hook; reset clears counters', async () => {
    const { container } = render(<AiLabVisionTab />)
    fireEvent.click(container.querySelector('[data-action="vision-start"]') as HTMLElement)
    await waitFor(() => expect(h.vision.enable).toHaveBeenCalled())
    // running state: stop/recal/skip enabled, start hidden by disabled attr
    cleanup()
    h.vision.enabled = true
    h.vision.state = 'active'
    const c2 = render(<AiLabVisionTab />).container
    expect((c2.querySelector('[data-action="vision-start"]') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(c2.querySelector('[data-action="vision-stop"]') as HTMLElement)
    fireEvent.click(c2.querySelector('[data-action="vision-recal"]') as HTMLElement)
    fireEvent.click(c2.querySelector('[data-action="vision-skip"]') as HTMLElement)
    expect(h.vision.disable).toHaveBeenCalled()
    expect(h.vision.recalibrate).toHaveBeenCalled()
    expect(h.vision.skipCalibration).toHaveBeenCalled()
    bus({ kind: 'chord', name: 'select', down: true })
    expect(countOf(row(c2, 'chord-select'))).toBe('×1')
    fireEvent.click(c2.querySelector('[data-action="vision-reset"]') as HTMLElement)
    expect(countOf(row(c2, 'chord-select'))).toBe('')
  })

  it('live signals: pinch gauge, finger extension, chord preview/buffer, geom-active rows', async () => {
    h.vision.enabled = true
    h.vision.state = 'active'
    h.vision.frameRef.current = {
      geom: { palm: { x: 0.5, y: 0.5 }, pinch: 0.9, scale: 1 },
      geomPredicted: { palm: { x: 0.51, y: 0.5 }, pinch: 0.9, scale: 1 },
      profile: { pinchOn: 0.5, pinchOff: 0.85 },
      pickedLandmarks: landmarks(['index']),
      chordPreview: { pattern: 'index', kind: 'char', name: 'e' },
      chordBuffer: 'en',
      stats: {
        infer: { n: 10, p50: 12, p95: 20, mean: 13 },
        hand: { n: 10, p50: 12, p95: 20, mean: 13 },
        face: { n: 0, p50: 0, p95: 0, mean: 0 },
        acquire: { n: 10, p50: 5, p95: 8, mean: 6 },
        fps: 60, inferFps: 58, delegate: 'GPU', lowFps: false, cam: { w: 640, h: 480, fps: 60 },
      },
    }
    const { container } = render(<AiLabVisionTab />)
    await waitFor(() => {
      expect(container.querySelector('[data-field="chord-preview"]')?.textContent).toBe('e')
    })
    expect(container.querySelector('[data-field="chord-buffer"]')?.textContent).toBe('en')
    expect((container.querySelector('.vision-gauge-fill') as HTMLElement).style.width).not.toBe('0%')
    expect(container.querySelector('span[data-finger="index"]')?.classList.contains('on')).toBe(true)
    expect(container.querySelector('span[data-finger="pinky"]')?.classList.contains('on')).toBe(false)
    // live rows are "active" while geom/predicted flow
    expect(row(container, 'axis').querySelector('.cap-active')?.classList.contains('on')).toBe(true)
    expect(row(container, 'predict').querySelector('.cap-active')?.classList.contains('on')).toBe(true)
    expect(row(container, 'cursor').querySelector('.cap-active')?.classList.contains('on')).toBe(true)
    expect(container.querySelector('[data-field="vision-stats"]')?.textContent).toContain('GPU')
    expect(container.querySelector('[data-field="vision-stats"]')?.textContent).toContain('640×480@60')
  })

  it('palm-hold combo fires once after 700ms of open hand (R138 params)', () => {
    vi.useFakeTimers()
    h.vision.enabled = true
    h.vision.frameRef.current = { geom: { palm: { x: 0.5, y: 0.5 }, pinch: 0.95, scale: 1 }, profile: { pinchOff: 0.85 } }
    const { container } = render(<AiLabVisionTab />)
    act(() => { vi.advanceTimersByTime(960) })
    expect(countOf(row(container, 'palmHold'))).toBe('×1')
  })

  it('fist-clutch combo fires after 250ms of all-four-folded (R143.2 semantics)', () => {
    vi.useFakeTimers()
    h.vision.enabled = true
    h.vision.frameRef.current = { geom: { palm: { x: 0.5, y: 0.5 }, pinch: 0.3, scale: 1 }, pickedLandmarks: landmarks([]) }
    const { container } = render(<AiLabVisionTab />)
    act(() => { vi.advanceTimersByTime(480) })
    expect(countOf(row(container, 'clutch'))).toBe('×1')
    expect(row(container, 'clutch').querySelector('.cap-held')).not.toBeNull()
  })

  it('quick params wire to the hook: text mode, sensitivity, precision, mirror', () => {
    const { container } = render(<AiLabVisionTab />)
    fireEvent.click(container.querySelector('[data-param="textmode"]') as HTMLInputElement)
    expect(h.vision.setChordTextMode).toHaveBeenCalledWith(true)
    fireEvent.change(container.querySelector('[data-param="sensitivity"]') as HTMLSelectElement, { target: { value: 'sport' } })
    expect(h.vision.setSensitivity).toHaveBeenCalledWith('sport')
    fireEvent.change(container.querySelector('[data-param="precision"]') as HTMLSelectElement, { target: { value: 'hi' } })
    expect(h.vision.setCapturePrecision).toHaveBeenCalledWith(true)
    fireEvent.click(container.querySelector('[data-param="mirror"]') as HTMLInputElement)
    expect(h.vision.setMirror).toHaveBeenCalledWith(false)
  })
})
