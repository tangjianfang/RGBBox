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
    paused: false,
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

/** R153: board cards are divs, collapsed rows are trs — one selector for both. */
function row(container: HTMLElement, id: string): HTMLElement {
  return container.querySelector(`[data-cap="${id}"]`) as HTMLElement
}

function countOf(r: HTMLElement | null): string {
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
  it('renders the 24-capability catalog: 9 board cards + 5 collapsed groups', () => {
    const { container } = render(<AiLabVisionTab />)
    // R153: board cards (div) + collapsed rows (tr) both carry data-cap
    expect(container.querySelectorAll('[data-cap]').length).toBe(24)
    expect(container.querySelectorAll('.vision-card').length).toBe(9)
    // face discoverability: jawOpen + smile are always-visible board cards
    expect(container.querySelector('.vision-card[data-cap="jawOpen"]')).toBeTruthy()
    expect(container.querySelector('.vision-card[data-cap="smile"]')).toBeTruthy()
    // discrete & chordText fully onboarded → their group headers vanish
    expect(container.querySelectorAll('tr.cap-group').length).toBe(5)
    expect(container.querySelectorAll('[data-cap^="chord-"]').length).toBe(7)
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

  it('R305: start skips the wizard — enable({face:true}) then resumeActive, in order; synthetic seam stays untouched', async () => {
    const { container } = render(<AiLabVisionTab />)
    fireEvent.click(container.querySelector('[data-action="vision-start"]') as HTMLElement)
    await waitFor(() => expect(h.vision.enable).toHaveBeenCalledWith({ face: true }))
    await waitFor(() => expect(h.vision.resumeActive).toHaveBeenCalledTimes(1))
    // enable resolves BEFORE resumeActive fires (order matters: forceReady on a live session)
    expect(h.vision.enable.mock.invocationCallOrder[0]).toBeLessThan(h.vision.resumeActive.mock.invocationCallOrder[0])
    // a FAILED enable must not resumeActive (camera denied → no silent forceReady)
    h.vision.enable.mockRejectedValueOnce(new Error('denied'))
    h.vision.enabled = false
    cleanup()
    const c2 = render(<AiLabVisionTab />).container
    fireEvent.click(c2.querySelector('[data-action="vision-start"]') as HTMLElement)
    await waitFor(() => expect(h.vision.enable).toHaveBeenCalledTimes(2))
    await act(async () => { await Promise.resolve() })
    expect(h.vision.resumeActive).toHaveBeenCalledTimes(1)
  })

  it('R306/T1: record captures channel snapshots + events, stop exports a versioned JSON recording', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    try {
      h.vision.enabled = true
      h.vision.state = 'active'
      const { container } = render(<AiLabVisionTab />)
      const recordBtn = container.querySelector('[data-action="vision-record"]') as HTMLButtonElement
      expect(recordBtn.disabled).toBe(false)
      fireEvent.click(recordBtn)
      expect(container.querySelector('.ai-vision-lab')!.getAttribute('data-recording')).toBe('1')
      // the hidden host posts one snapshot + one event while recording
      const chan = new BroadcastChannel('rgbbox-vision')
      chan.postMessage({
        type: 'snapshot',
        snapshot: {
          state: 'active', score: 0.9, faceBlend: null,
          allHands: [{ landmarks: landmarks(['index']), role: 'primary', handedness: 'Right' }],
        },
      })
      chan.postMessage({ type: 'events', events: [{ kind: 'pinch', key: 'Space', down: true }] })
      chan.close()
      await act(async () => { await new Promise((r) => { setTimeout(r, 20) }) })
      fireEvent.click(container.querySelector('[data-action="vision-record"]') as HTMLElement)
      await waitFor(() => { expect(anchorClick).toHaveBeenCalledTimes(1) })
      const blob = createObjectURL.mock.calls[0][0] as Blob
      expect(blob.type).toBe('application/json')
      const rec = JSON.parse(await blob.text()) as { version: number; frames: Array<{ hands: Array<{ lm: number[][] }> }>; events: unknown[] }
      expect(rec.version).toBe(1)
      expect(rec.frames.length).toBe(1)
      expect(rec.frames[0].hands[0].lm.length).toBe(21)
      expect(rec.events.length).toBe(1)
      expect(container.querySelector('.ai-vision-lab')!.getAttribute('data-recording')).toBe('0')
      expect(revokeObjectURL).toHaveBeenCalled()
      // vision off → the record button disables again
      h.vision.enabled = false
      cleanup()
      const c2 = render(<AiLabVisionTab />).container
      expect((c2.querySelector('[data-action="vision-record"]') as HTMLButtonElement).disabled).toBe(true)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('R306/T2: deep bench walks the plan, scores against it, exports the marked recording + report', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:bench')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    try {
      h.vision.enabled = true
      h.vision.state = 'active'
      const { container } = render(<AiLabVisionTab />)
      const seam = (window as unknown as { __rgbboxVisionLab?: { startBench(o?: Record<string, number>): Promise<boolean> } }).__rgbboxVisionLab
      expect(seam?.startBench).toBeTruthy()
      await act(async () => {
        await seam!.startBench!({ windowsPerWord: 1, windowMs: 700, restMs: 100, leadMs: 100 })
      })
      expect(container.querySelector('.vision-bench')!.getAttribute('data-bench')).toBe('run')
      // while running, the bench entry button is disabled
      expect((container.querySelector('[data-action="vision-bench"]') as HTMLButtonElement).disabled).toBe(true)
      // wait for the pinch prompt (word #2) and land one hit on the wire
      await waitFor(() => {
        expect(container.querySelector('.vision-bench')!.getAttribute('data-bench-step')).toBe('pinch')
      }, { timeout: 4000 })
      const chan = new BroadcastChannel('rgbbox-vision')
      chan.postMessage({ type: 'events', events: [{ kind: 'pinch', key: 'Space', down: true }] })
      chan.close()
      await waitFor(() => {
        expect(container.querySelector('.vision-bench')!.getAttribute('data-bench')).toBe('done')
      }, { timeout: 6000 })
      // report: 6 word rows side-by-side with the R237 lab baseline
      const rowsX = container.querySelectorAll('[data-bench-word]')
      expect(rowsX.length).toBe(6)
      const pinchRow = container.querySelector('[data-bench-word="pinch"]')!
      expect(pinchRow.textContent).toContain('1/1')
      expect(pinchRow.textContent).toContain('100%')
      expect(pinchRow.textContent).toContain('162') // lab baseline cells
      // export: marked recording (T1 shape, marks filled) + the report itself
      fireEvent.click(container.querySelector('[data-action="vision-bench-export"]') as HTMLElement)
      await waitFor(() => { expect(anchorClick).toHaveBeenCalledTimes(1) })
      const blob = createObjectURL.mock.calls[0][0] as Blob
      const exported = JSON.parse(await blob.text()) as {
        version: number; marks: Array<{ gesture: string }>; report: { words: Array<{ word: string }>; overall: { recall: number } }
      }
      expect(exported.version).toBe(1)
      expect(exported.marks.length).toBe(6)
      expect(exported.marks[1].gesture).toBe('pinch')
      expect(exported.report.words.length).toBe(6)
      expect(exported.report.overall.recall).toBeCloseTo(1 / 6)
      // vision off → the bench entry disables again
      h.vision.enabled = false
      cleanup()
      const c2 = render(<AiLabVisionTab />).container
      expect((c2.querySelector('[data-action="vision-bench"]') as HTMLButtonElement).disabled).toBe(true)
    } finally {
      vi.restoreAllMocks()
    }
  }, 15000)

  it('R306/T16: the E2E seam mounts only in dev or when launched with the e2e flag', async () => {
    const w = window as unknown as { rgbbox?: { isE2e?: boolean }; __rgbboxVisionLab?: unknown }
    const originalRgbbox = w.rgbbox
    try {
      // production build, no e2e flag → NO seam on window
      vi.stubEnv('DEV', false)
      w.rgbbox = { isE2e: false }
      const { unmount } = render(<AiLabVisionTab />)
      expect((window as unknown as { __rgbboxVisionLab?: unknown }).__rgbboxVisionLab).toBeUndefined()
      unmount()
      // production build + e2e launch flag (main passes it via the CDP port) → seam
      cleanup()
      w.rgbbox = { isE2e: true }
      render(<AiLabVisionTab />)
      expect((window as unknown as { __rgbboxVisionLab?: unknown }).__rgbboxVisionLab).not.toBeUndefined()
      unmount()
      cleanup()
      // dev keeps the seam for interactive debugging
      vi.stubEnv('DEV', true)
      w.rgbbox = { isE2e: false }
      render(<AiLabVisionTab />)
      expect((window as unknown as { __rgbboxVisionLab?: unknown }).__rgbboxVisionLab).not.toBeUndefined()
      unmount()
    } finally {
      vi.unstubAllEnvs()
      w.rgbbox = originalRgbbox
      cleanup()
    }
  })

  it('R309b/evolve #4: the finished bench report survives tab re-entry (persisted, export-less)', async () => {
    // run a FAST bench to completion (the synthetic path from the R306/T2 case)
    h.vision.enabled = true
    h.vision.state = 'active'
    const { container } = render(<AiLabVisionTab />)
    const seam = (window as unknown as { __rgbboxVisionLab?: { startBench(o?: Record<string, number>): Promise<boolean> } }).__rgbboxVisionLab
    await act(async () => { await seam!.startBench!({ windowsPerWord: 1, windowMs: 300, restMs: 50, leadMs: 50 }) })
    await waitFor(() => {
      expect(container.querySelector('.vision-bench')!.getAttribute('data-bench')).toBe('done')
    }, { timeout: 6000 })
    expect(container.querySelectorAll('[data-bench-word]').length).toBe(6)
    // the report landed in storage…
    const stored = JSON.parse(localStorage.getItem('rgbbox:visionBenchLast') ?? 'null')
    expect(stored?.report?.words?.length).toBe(6)
    // …so a tab re-entry (fresh mount, idle pipeline) shows the LAST report
    cleanup()
    h.vision.enabled = false
    const c2 = render(<AiLabVisionTab />).container
    expect(c2.querySelector('.vision-bench')!.getAttribute('data-bench')).toBe('done')
    expect(c2.querySelectorAll('[data-bench-word]').length).toBe(6)
    // hydrated view is read-only: no export (no recording behind it); the
    // start button stays gated by the pipeline (vision off), rerun via again
    expect(c2.querySelector('[data-action="vision-bench-export"]')).toBeNull()
    expect((c2.querySelector('[data-action="vision-bench"]') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(c2.querySelector('[data-action="vision-bench-again"]') as HTMLElement)
    expect(c2.querySelector('.vision-bench')!.getAttribute('data-bench')).toBe('idle')
  })

  it('R306/T3: the health card externalizes the funnel truth + soak-aligned latency segments', async () => {
    // persisted funnel truth (onboarding.ts owns the key)
    localStorage.setItem('rgbbox:visionFunnel', JSON.stringify({ opened: 5, calDone: 3, firstCmd: 2 }))
    h.vision.enabled = true
    h.vision.state = 'active'
    h.vision.frameRef.current = {
      stats: {
        infer: { n: 10, p50: 12, p95: 42, mean: 13 },
        hand: { n: 10, p50: 12, p95: 20, mean: 13 },
        face: { n: 0, p50: 0, p95: 0, mean: 0 },
        acquire: { n: 10, p50: 5, p95: 8, mean: 6 },
        fps: 60, inferFps: 57, delegate: 'GPU', lowFps: false, cam: { w: 640, h: 480, fps: 60 },
      },
    }
    const { container } = render(<AiLabVisionTab />)
    await waitFor(() => {
      expect(container.querySelector('[data-field="health-funnel-opened"]')?.textContent).toBe('5')
      expect(container.querySelector('[data-field="health-funnel-caldone"]')?.textContent).toBe('3')
      expect(container.querySelector('[data-field="health-funnel-firstcmd"]')?.textContent).toBe('2')
    })
    // conversion readout: calDone/opened
    expect(container.querySelector('[data-field="health-funnel-rate"]')?.textContent).toBe('60%')
    // latency segments — SAME fields/units the soak ledger watches (inferFps,
    // infer p95, acquire p95, delegate), verbatim; the 120ms ticker copies
    // frameRef → live, so wait for the first tick
    await waitFor(() => {
      expect(container.querySelector('[data-field="health-infer-fps"]')?.textContent).toContain('57')
      expect(container.querySelector('[data-field="health-infer-p95"]')?.textContent).toContain('42')
      expect(container.querySelector('[data-field="health-acquire-p95"]')?.textContent).toContain('8')
      expect(container.querySelector('[data-field="health-delegate"]')?.textContent).toContain('GPU')
    })
    expect(container.querySelector('[data-field="health-lowfps"]')).toBeNull()
    // the low-fps badge flips on when the stats flag says so
    const stats = h.vision.frameRef.current.stats as { lowFps: boolean }
    stats.lowFps = true
    act(() => { window.dispatchEvent(new CustomEvent('vision-input', { detail: { kind: 'chord', name: 'select', down: true } })) })
    await waitFor(() => {
      expect(container.querySelector('[data-field="health-lowfps"]')).not.toBeNull()
    })
    // funnel renders from storage even with the pipeline off
    cleanup()
    h.vision.enabled = false
    const c2 = render(<AiLabVisionTab />).container
    expect(c2.querySelector('[data-field="health-funnel-opened"]')?.textContent).toBe('5')
    expect(c2.querySelector('[data-field="health-infer-p95"]')?.textContent).toContain('—')
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

  it('E2E seam: startSynthetic routes to the hook and unregisters on unmount', async () => {
    const { unmount } = render(<AiLabVisionTab />)
    const seam = (window as unknown as { __rgbboxVisionLab?: { startSynthetic(): Promise<boolean> } }).__rgbboxVisionLab
    expect(seam).toBeTruthy()
    await expect(seam!.startSynthetic()).resolves.toBe(true)
    expect(h.vision.enableSynthetic).toHaveBeenCalled()
    // a failed pipeline reports false instead of throwing
    h.vision.enableSynthetic.mockRejectedValueOnce(new Error('no camera'))
    await expect(seam!.startSynthetic()).resolves.toBe(false)
    unmount()
    expect((window as unknown as { __rgbboxVisionLab?: unknown }).__rgbboxVisionLab).toBeUndefined()
  })
})
