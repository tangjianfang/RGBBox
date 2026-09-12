// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { DashboardView, type DashboardStatus } from '../../../src/renderer/src/components/DashboardView'

beforeEach(() => cleanup())

function makeStatus(over: Partial<DashboardStatus> = {}): DashboardStatus {
  return {
    running: true,
    onToggleEngine: vi.fn(),
    effectName: 'Rainbow',
    fps: 60,
    audioEnabled: true,
    audioDeviceId: '',
    audioDevices: [{ deviceId: 'mic-1', label: 'Mic 1', kind: 'audioinput' } as MediaDeviceInfo],
    speakerDevices: [{ deviceId: 'spk-1', label: 'Speaker 1', kind: 'audiooutput' } as MediaDeviceInfo],
    onSelectAudioDevice: vi.fn(),
    overlayCount: 2,
    version: '0.3.44',
    ...over
  }
}

function renderDash(over: { openTabs?: any[]; model3dEnabled?: boolean; status?: Partial<DashboardStatus> } = {}) {
  const props = {
    onOpen: vi.fn(),
    openTabs: over.openTabs ?? ['dashboard'],
    model3dEnabled: over.model3dEnabled ?? false,
    status: makeStatus(over.status ?? {})
  }
  return { props, ...render(<DashboardView {...props} />) }
}

describe('DashboardView', () => {
  it('renders the three fixed sections with all cards (model3d disabled → hidden)', () => {
    const { container } = renderDash()
    const sections = container.querySelectorAll('.dash-section')
    expect(sections.length).toBe(3)
    const cards = container.querySelectorAll('.dash-card')
    expect(cards.length).toBe(7) // 8 modules − model3d
  })

  it('shows the model3d card when enabled', () => {
    const { container } = renderDash({ model3dEnabled: true })
    expect(container.querySelectorAll('.dash-card').length).toBe(8)
  })

  it('card click fires onOpen with the module view', () => {
    const { container, props } = renderDash()
    const card = [...container.querySelectorAll('.dash-card')].find((c) => c.textContent?.includes('nav.workspace'))
    fireEvent.click(card as HTMLElement)
    expect(props.onOpen).toHaveBeenCalledWith('workspace')
  })

  it('open module card carries the is-open marker', () => {
    const { container } = renderDash({ openTabs: ['dashboard', 'audio'] })
    const audioCard = [...container.querySelectorAll('.dash-card')].find((c) => c.textContent?.includes('nav.audio'))
    expect(audioCard?.classList.contains('is-open')).toBe(true)
  })

  it('status row shows engine state, effect, fps, overlay count and device select', () => {
    const { container } = renderDash()
    const status = container.querySelector('.dash-status') as HTMLElement
    expect(status.textContent).toContain('engine.running')
    expect(status.textContent).toContain('Rainbow')
    expect(status.textContent).toContain('60')
    expect(status.textContent).toContain('2')
    const select = container.querySelector('.dash-status .audio-device-select') as HTMLSelectElement
    const options = [...select.querySelectorAll('option')].map((o) => o.value)
    expect(options).toEqual(['', '__speaker__:spk-1', '__system_audio__', 'mic-1'])
  })

  it('engine toggle button fires onToggleEngine', () => {
    const onToggleEngine = vi.fn()
    const { container } = renderDash({ status: { onToggleEngine } })
    fireEvent.click(container.querySelector('.dash-status .icon-button') as HTMLElement)
    expect(onToggleEngine).toHaveBeenCalledOnce()
  })

  it('hides the audio device select when audio is disabled (old sidebar gate)', () => {
    const { container } = renderDash({ status: { audioEnabled: false } })
    expect(container.querySelector('.dash-status .audio-device-select')).toBeNull()
  })

  it('renders — instead of fps before the first measured sample', () => {
    const { container } = renderDash({ status: { fps: 0 } })
    expect(container.querySelector('.dash-status')?.textContent).toContain('—')
  })
})
