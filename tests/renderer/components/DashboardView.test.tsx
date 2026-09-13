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

function renderDash(over: { model3dEnabled?: boolean; status?: Partial<DashboardStatus> } = {}) {
  const props = {
    onOpen: vi.fn(),
    model3dEnabled: over.model3dEnabled ?? false,
    status: makeStatus(over.status ?? {})
  }
  return { props, ...render(<DashboardView {...props} />) }
}

describe('DashboardView (R86)', () => {
  it('renders two collapsible groups: status then modules', () => {
    const { container } = renderDash()
    const groups = container.querySelectorAll('.dash-group')
    expect(groups.length).toBe(2)
    expect(groups[0].querySelector('summary')?.textContent).toContain('dash.group.status')
    expect(groups[1].querySelector('summary')?.textContent).toContain('dash.group.modules')
    expect((groups[0] as HTMLDetailsElement).open).toBe(true)
  })

  it('status cards show live values', () => {
    const { container } = renderDash()
    const cards = container.querySelectorAll('.dash-cards .dash-card')
    expect(cards.length).toBe(5)
    const text = container.querySelector('.dash-cards')?.textContent ?? ''
    expect(text).toContain('engine.running')
    expect(text).toContain('Rainbow')
    expect(text).toContain('60 fps')
    expect(text).toContain('2')
    const select = container.querySelector('.dash-cards .audio-device-select') as HTMLSelectElement
    const options = [...select.querySelectorAll('option')].map((o) => o.value)
    expect(options).toEqual(['', '__speaker__:spk-1', '__system_audio__', 'mic-1'])
  })

  it('engine toggle button fires onToggleEngine', () => {
    const onToggleEngine = vi.fn()
    const { container } = renderDash({ status: { onToggleEngine } })
    fireEvent.click(container.querySelector('.dash-cards .icon-button') as HTMLElement)
    expect(onToggleEngine).toHaveBeenCalledOnce()
  })

  it('module tiles: 8 with model3d disabled, 9 enabled; click fires onOpen', () => {
    const { container, props } = renderDash()
    expect(container.querySelectorAll('.dash-tile').length).toBe(8)
    const tile = [...container.querySelectorAll('.dash-tile')]
      .find((el) => el.textContent?.includes('nav.workspace')) as HTMLElement
    fireEvent.click(tile)
    expect(props.onOpen).toHaveBeenCalledWith('workspace')
    const enabled = renderDash({ model3dEnabled: true })
    expect(enabled.container.querySelectorAll('.dash-tile').length).toBe(9)
  })

  it('audio card hides the device select when audio is disabled', () => {
    const { container } = renderDash({ status: { audioEnabled: false } })
    expect(container.querySelector('.dash-cards .audio-device-select')).toBeNull()
  })

  it('renders — instead of fps before the first measured sample', () => {
    const { container } = renderDash({ status: { fps: 0 } })
    expect(container.querySelector('.dash-cards')?.textContent).toContain('—')
  })
})
