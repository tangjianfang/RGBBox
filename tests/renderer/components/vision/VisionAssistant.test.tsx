// @vitest-environment happy-dom
// R142-E4b: the app-wide gesture assistant — toggle mounts the cursor overlay
// + badge; the chord 'menu' opens the radial; a direction gesture moves the
// selection; pinch (queue 'space') navigates. FakeHost plays the vision host.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, act, waitFor } from '@testing-library/react'
import { VisionAssistant } from '../../../../src/renderer/src/components/vision/VisionAssistant'
import { setupRendererMocks } from '../../_helpers'

class FakeHost {
  channel: BroadcastChannel
  constructor() {
    this.channel = new BroadcastChannel('rgbbox-vision')
    this.channel.onmessage = (ev: MessageEvent) => {
      if ((ev.data as { type: string }).type === 'init') this.channel.postMessage({ type: 'ready', delegate: 'GPU' })
    }
  }
  send(msg: unknown): void { this.channel.postMessage(msg) }
  dispose(): void { this.channel.close() }
}

let host: FakeHost
let rgbbox: ReturnType<typeof setupRendererMocks>
const onNavigate = vi.fn()

beforeEach(() => {
  rgbbox = setupRendererMocks()
  localStorage.clear()
  // R246: these are the pre-onboarding-behavior locks — an already-onboarded
  // user (the wizard's own tests live in VisionOnboarding.test.tsx).
  localStorage.setItem('rgbbox:visionOnboarded', '1')
  host = new FakeHost()
  cleanup()
})
// R223.5: 防御性 teardown——beforeEach 若中途抛错 host 未赋值,这里不再
// 连环 TypeError 掩盖一手错误
afterEach(() => host?.dispose())

const ACTIVE = { state: 'active', label: 'x', geom: { palm: { x: 0.5, y: 0.5 }, pinch: 1.1, scale: 0.18 }, stats: { infer: { n: 9, p50: 8, p95: 12, mean: 9 }, fps: 60, inferFps: 30, delegate: 'GPU', lowFps: false } }

function mount() {
  const root = document.createElement('main')
  document.body.appendChild(root)
  const rootRef = { current: root } as React.RefObject<HTMLElement | null>
  return render(<VisionAssistant activeView="dashboard" onNavigate={onNavigate} rootRef={rootRef} />)
}

describe('renderer/components/vision/VisionAssistant (R142-E4b)', () => {
  it('renders the toggle pill; enabling mounts badge + cursor and opens the host window', async () => {
    const { container } = mount()
    const pill = container.querySelector('.vision-assistant-pill') as HTMLButtonElement
    expect(pill).toBeTruthy()
    expect(container.querySelector('.vision-assistant-badge')).toBeNull()
    await act(async () => { fireEvent.click(pill) })
    await act(async () => { host.send({ type: 'snapshot', snapshot: ACTIVE }) })
    await waitFor(() => {
      expect(container.querySelector('.vision-assistant-badge')).toBeTruthy()
    })
    expect(rgbbox.visionHostOpen).toHaveBeenCalled()
    expect(document.querySelector('.vision-cursor')).toBeTruthy()
    expect(localStorage.getItem('rgbbox:visionAssistant')).toBe('1')
  })

  it('chord menu opens the radial; direction selects; pinch navigates to the view', async () => {
    const { container } = mount()
    await act(async () => { fireEvent.click(container.querySelector('.vision-assistant-pill') as HTMLButtonElement) })
    await act(async () => { host.send({ type: 'snapshot', snapshot: ACTIVE }) })
    await waitFor(() => expect(container.querySelector('.vision-assistant-badge')).toBeTruthy())
    await act(async () => {
      host.send({ type: 'events', events: [{ kind: 'chord', key: null, name: 'menu', down: true }] })
    })
    await waitFor(() => expect(container.querySelector('.vision-radial')).toBeTruthy())
    // direction 'right' → slot 0 (workspace)
    await act(async () => {
      host.send({ type: 'events', events: [{ kind: 'direction', key: 'ArrowRight', down: true, dir: 'right' }] })
    })
    await waitFor(() => expect(container.querySelectorAll('.vision-radial-item')[0].className).toContain('sel'))
    // pinch confirm → navigate
    await act(async () => {
      host.send({ type: 'events', events: [{ kind: 'pinch', key: 'Space', down: true }] })
    })
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('workspace'))
    await waitFor(() => expect(container.querySelector('.vision-radial')).toBeNull())
  })

  it('no pill inside the games view (the games hook owns the lifecycle there)', () => {
    const root = document.createElement('main')
    document.body.appendChild(root)
    const { container } = render(
      <VisionAssistant activeView="games" onNavigate={onNavigate} rootRef={{ current: root } as React.RefObject<HTMLElement | null>} />,
    )
    expect(container.querySelector('.vision-assistant-pill')).toBeNull()
  })

  it('R246: first enable mounts the onboarding wizard; radial suppressed while open; Esc skip persists', async () => {
    localStorage.removeItem('rgbbox:visionOnboarded') // the first-run state
    const { container } = mount()
    await act(async () => { fireEvent.click(container.querySelector('.vision-assistant-pill') as HTMLButtonElement) })
    await act(async () => { host.send({ type: 'snapshot', snapshot: ACTIVE }) })
    await waitFor(() => expect(document.querySelector('.vision-onboarding')).toBeTruthy())
    // the badge still renders alongside — the wizard is an overlay, not a takeover
    await waitFor(() => expect(container.querySelector('.vision-assistant-badge')).toBeTruthy())
    // chord menu is the wizard's gesture while it is open — no radial behind
    await act(async () => {
      host.send({ type: 'events', events: [{ kind: 'chord', key: null, name: 'menu', down: true }] })
    })
    expect(container.querySelector('.vision-radial')).toBeNull()
    // let the wizard walk env →(1s stability)→ cal → gestures so the funnel
    // records the calibration milestone before the skip
    await waitFor(() => expect(document.querySelector('.vision-onboarding[data-step="gestures"]')).toBeTruthy(), { timeout: 3000 })
    // Esc = skip → persisted + overlay gone + the funnel counted the open
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
    await waitFor(() => expect(document.querySelector('.vision-onboarding')).toBeNull())
    expect(localStorage.getItem('rgbbox:visionOnboarded')).toBe('1')
    expect(JSON.parse(localStorage.getItem('rgbbox:visionFunnel') ?? '{}')).toEqual({ opened: 1, calDone: 1, firstCmd: 0 })
    // and the radial works again once the wizard is gone
    await act(async () => {
      host.send({ type: 'events', events: [{ kind: 'chord', key: null, name: 'menu', down: true }] })
    })
    await waitFor(() => expect(container.querySelector('.vision-radial')).toBeTruthy())
  })
})
