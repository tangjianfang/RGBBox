// @vitest-environment happy-dom
// R246: the first-use vision onboarding wizard — a 4-step state machine
// (env precheck → calibration → three-gesture teaching → first light command)
// driven by the SAME 'vision-input' window bus + vision handle the real
// consumers use. Skip/completion persist rgbbox:visionOnboarded; the funnel
// counters (opened/calDone/firstCmd) accumulate in rgbbox:visionFunnel.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, act, waitFor } from '@testing-library/react'
import { VisionOnboarding } from '../../../../src/renderer/src/components/vision/VisionOnboarding'
import type { VisionInputHandle } from '../../../../src/renderer/src/hooks/useVisionInput'
import { FUNNEL_KEY, ONBOARDED_KEY, readFunnel } from '../../../../src/renderer/src/vision/onboarding'
import { setupRendererMocks } from '../../_helpers'

interface BusEvent { kind: string; key: string | null; down: boolean; name?: string; dir?: string }

function emitBus(detail: BusEvent): void {
  window.dispatchEvent(new CustomEvent<BusEvent>('vision-input', { detail }))
}

function fakeVision(over: Partial<VisionInputHandle> = {}): VisionInputHandle {
  return {
    state: 'searching',
    label: '',
    statusKey: null,
    stepId: null,
    handSeen: false,
    enabled: true,
    error: null,
    errorKind: null,
    mirror: true,
    frameRef: { current: null },
    enable: vi.fn(),
    setMirror: vi.fn(),
    skipCalibration: vi.fn(),
    ...over,
  } as unknown as VisionInputHandle
}

const onExit = vi.fn()
const onStepChange = vi.fn()

function mountWizard(over: Partial<VisionInputHandle> = {}, lightApplyTick = 0) {
  const vision = fakeVision(over)
  const view = render(
    <VisionOnboarding vision={vision} lightApplyTick={lightApplyTick} onExit={onExit} onStepChange={onStepChange} />,
  )
  return { vision, ...view }
}

beforeEach(() => {
  setupRendererMocks()
  localStorage.clear()
  onExit.mockClear()
  onStepChange.mockClear()
})
afterEach(() => cleanup())

const GEOM = { palm: { x: 0.5, y: 0.5 }, pinch: 1.1, scale: 0.18 }

describe('renderer/components/vision/VisionOnboarding (R246)', () => {
  it('step 1 env: raise-hand prompt + skeleton + acquire waiting line; opened counted once', () => {
    const { container, vision } = mountWizard()
    const root = container.querySelector('.vision-onboarding') as HTMLElement
    expect(root).toBeTruthy()
    expect(root.dataset.step).toBe('env')
    expect(container.textContent).toContain('games.vision.ob.envRaise')
    // no acquire samples yet → the waiting line
    expect(container.textContent).toContain('games.vision.ob.envCamWait')
    expect(container.querySelector('.vision-ob-skeleton')).toBeTruthy()
    expect(readFunnel()).toEqual({ opened: 1, calDone: 0, firstCmd: 0 })
    // the mirror self-check flips through the handle
    const mirrorBtn = container.querySelector('[data-action="ob-mirror"]') as HTMLButtonElement
    expect(mirrorBtn).toBeTruthy()
    fireEvent.click(mirrorBtn)
    expect(vision.setMirror).toHaveBeenCalledWith(false)
  })

  it('step 1 → 2 on handSeen held ~1s; step 2 → 3 on active counts calDone exactly once', async () => {
    const { vision, rerender, container } = mountWizard()
    expect(container.querySelector('.vision-onboarding')?.dataset.step).toBe('env')
    // a single handSeen frame must NOT skip the step the user is reading
    rerender(<VisionOnboarding vision={fakeVision({ ...vision, handSeen: true, state: 'calibrating', stepId: 'center' })} lightApplyTick={0} onExit={onExit} onStepChange={onStepChange} />)
    expect(container.querySelector('.vision-onboarding')?.dataset.step).toBe('env')
    await waitFor(() => expect(container.querySelector('.vision-onboarding')?.dataset.step).toBe('cal'), { timeout: 2000 })
    expect(container.textContent).toContain('games.vision.hint.center')
    // the skip-calibration escape hatch reaches the handle
    fireEvent.click(container.querySelector('[data-action="ob-skip-cal"]') as HTMLButtonElement)
    expect(vision.skipCalibration).toHaveBeenCalledTimes(1)
    rerender(<VisionOnboarding vision={fakeVision({ ...vision, handSeen: true, state: 'active' })} lightApplyTick={0} onExit={onExit} onStepChange={onStepChange} />)
    expect(container.querySelector('.vision-onboarding')?.dataset.step).toBe('gestures')
    expect(readFunnel().calDone).toBe(1)
    // a second active rerender must NOT double count
    rerender(<VisionOnboarding vision={fakeVision({ ...vision, handSeen: true, state: 'active' })} lightApplyTick={0} onExit={onExit} onStepChange={onStepChange} />)
    expect(readFunnel().calDone).toBe(1)
  })

  it('steps 3→4→done: pinch/palm/menu check off (bus + geom), light apply completes the funnel', async () => {
    const palmOpen = { geom: GEOM, profile: { pinchOff: 0.85 } }
    const { vision, rerender, container } = mountWizard({ handSeen: true, state: 'active' })
    rerender(<VisionOnboarding vision={fakeVision({ ...vision, handSeen: true, state: 'active', frameRef: { current: palmOpen } })} lightApplyTick={0} onExit={onExit} onStepChange={onStepChange} />)
    // palm: geom.pinch > pinchOff held ≥600ms (100ms poll)
    await waitFor(() => {
      expect(container.querySelector('[data-gesture="palm"]')?.classList).toContain('done')
    }, { timeout: 4000 })
    await act(async () => { emitBus({ kind: 'pinch', key: 'Space', down: true }) })
    await waitFor(() => expect(container.querySelector('[data-gesture="pinch"]')?.classList).toContain('done'))
    // the LAST card's completion and the step advance batch into one commit —
    // the reached step IS the proof the menu card checked off
    await act(async () => { emitBus({ kind: 'chord', key: null, name: 'menu', down: true }) })
    await waitFor(() => expect(container.querySelector('.vision-onboarding')?.dataset.step).toBe('task'))
    expect(container.textContent).toContain('games.vision.ob.taskHow')
    // step 4: the assistant applied a light through the real ring
    rerender(<VisionOnboarding vision={fakeVision({ ...vision, handSeen: true, state: 'active', frameRef: { current: palmOpen } })} lightApplyTick={1} onExit={onExit} onStepChange={onStepChange} />)
    await waitFor(() => expect(container.querySelector('.vision-onboarding')?.dataset.step).toBe('done'))
    expect(readFunnel()).toEqual({ opened: 1, calDone: 1, firstCmd: 1 })
    expect(container.textContent).toContain('games.vision.ob.doneHint')
    fireEvent.click(container.querySelector('[data-action="ob-finish"]') as HTMLButtonElement)
    expect(onExit).toHaveBeenCalledWith(true)
    // the wizard persists the flag itself — the parent only closes the overlay
    expect(localStorage.getItem(ONBOARDED_KEY)).toBe('1')
  })

  it('Esc at any step = skip: exits incomplete, still persists onboarded', () => {
    const { container } = mountWizard()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onExit).toHaveBeenCalledWith(false)
    expect(localStorage.getItem(ONBOARDED_KEY)).toBe('1')
    expect(container.querySelector('.vision-onboarding')).toBeTruthy() // parent unmounts it
  })

  it('funnel storage is resilient: corrupt JSON reads as zeros, bump writes back valid JSON', async () => {
    localStorage.setItem(FUNNEL_KEY, '{not json')
    expect(readFunnel()).toEqual({ opened: 0, calDone: 0, firstCmd: 0 })
    const { rerender, vision } = mountWizard()
    rerender(<VisionOnboarding vision={fakeVision({ ...vision, handSeen: true, state: 'active' })} lightApplyTick={0} onExit={onExit} onStepChange={onStepChange} />)
    await waitFor(() => expect(readFunnel().calDone).toBe(1), { timeout: 3000 })
    expect(readFunnel()).toEqual({ opened: 1, calDone: 1, firstCmd: 0 })
    expect(JSON.parse(localStorage.getItem(FUNNEL_KEY) ?? '{}')).toEqual({ opened: 1, calDone: 1, firstCmd: 0 })
  })
})
