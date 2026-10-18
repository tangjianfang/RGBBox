// @vitest-environment happy-dom
// R306/T10: the replay card — the T1 recorder's user-facing half. Loads a
// recording file (parseRecording validation), plays it at 0.5×/1× with the
// skeleton canvas, and re-dispatches recorded events on the SAME window bus
// the live hook uses (the whole tab lights up exactly like a live session).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { VisionReplayCard } from '../../../../src/renderer/src/components/vision/VisionReplayCard'
import { DemoRecorder, recordingToJson } from '../../../../src/renderer/src/vision/demoRecorder'
import { SyntheticSource } from '../../../../src/renderer/src/vision/synthetic.js'
import { setupRendererMocks } from '../../_helpers'

/** a short real recording built with the T1 instrument itself */
function makeRecording(): string {
  const src = new SyntheticSource({ noise: 0 })
  const r = new DemoRecorder()
  r.start(0, { source: 'synthetic' })
  for (let t = 0; t <= 600; t += 40) r.frame(t, [{ landmarks: src.sample(t, 'active').hand, handedness: 'Right', score: 0.9 }], null)
  r.event(120, { kind: 'pinch', key: 'Space', down: true })
  r.event(130, { kind: 'pinch', key: 'Space', down: false })
  r.event(400, { kind: 'direction', key: 'ArrowUp', dir: 'up', down: true })
  return recordingToJson(r.finish()!)
}

function loadFile(container: HTMLElement, text: string, name = 'demo.json'): void {
  const input = container.querySelector('input[data-action="vision-replay-file"]') as HTMLInputElement
  const file = new File([text], name, { type: 'application/json' })
  fireEvent.change(input, { target: { files: [file] } })
}

beforeEach(() => {
  cleanup()
  localStorage.clear()
  setupRendererMocks()
})
afterEach(() => cleanup())

describe('components/vision/VisionReplayCard (R306/T10)', () => {
  it('rejects an invalid file with a visible error, recovers on a good file', async () => {
    const { container } = render(<VisionReplayCard />)
    loadFile(container, 'not a recording')
    await waitFor(() => {
      expect(container.querySelector('.vision-replay')!.getAttribute('data-replay')).toBe('error')
    })
    expect(container.textContent).toContain('ai.lab.vision.replay.badFile')
    loadFile(container, makeRecording())
    await waitFor(() => {
      expect(container.querySelector('.vision-replay')!.getAttribute('data-replay')).toBe('ready')
    })
  })

  it('plays a recording: bus events re-dispatch, progress advances, reaches done', async () => {
    const busEvents: Array<Record<string, unknown>> = []
    const onBus = (ev: Event): void => { busEvents.push((ev as CustomEvent).detail as Record<string, unknown>) }
    window.addEventListener('vision-input', onBus)
    try {
      const { container } = render(<VisionReplayCard />)
      loadFile(container, makeRecording())
      await waitFor(() => {
        expect(container.querySelector('.vision-replay')!.getAttribute('data-replay')).toBe('ready')
      })
      fireEvent.click(container.querySelector('[data-action="vision-replay-play"]') as HTMLElement)
      expect(container.querySelector('.vision-replay')!.getAttribute('data-replay')).toBe('playing')
      await waitFor(() => {
        expect(container.querySelector('.vision-replay')!.getAttribute('data-replay')).toBe('done')
      }, { timeout: 6000 })
      // the recording's events re-fired on the LIVE bus: pinch down/up + a direction
      const kinds = busEvents.map((e) => e.kind)
      expect(kinds).toContain('pinch')
      expect(kinds).toContain('direction')
      expect(busEvents.filter((e) => e.kind === 'pinch' && e.down === true).length).toBe(1)
      // canvas exists (the skeleton layer) + progress text rendered
      expect(container.querySelector('canvas')).toBeTruthy()
      expect(container.textContent).toMatch(/\d+\.\d+s \/ \d+\.\d+s/)
    } finally {
      window.removeEventListener('vision-input', onBus)
    }
  })

  it('speed toggle flips 1× ↔ 0.5× (data-speed follows)', async () => {
    const { container } = render(<VisionReplayCard />)
    loadFile(container, makeRecording())
    await waitFor(() => {
      expect(container.querySelector('.vision-replay')!.getAttribute('data-replay')).toBe('ready')
    })
    expect(container.querySelector('.vision-replay')!.getAttribute('data-speed')).toBe('1')
    fireEvent.click(container.querySelector('[data-action="vision-replay-speed"]') as HTMLElement)
    expect(container.querySelector('.vision-replay')!.getAttribute('data-speed')).toBe('0.5')
  })
})
