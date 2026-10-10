// @vitest-environment happy-dom
// NOTE: AudioStudioView uses Three.js + WebGL for the 3D visualisation.
// happy-dom has no WebGL context, so the rendering tests are skipped.
// The audio capture / save logic is exercised indirectly through the
// useAudioAnalyzer hook tests in tests/renderer/hooks/.
//
// R272 adds real interactive tests for the export format honesty fix (W3)
// and the waveform projection guard (W2) — both are pure DOM interactions
// that need no WebGL.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen, waitFor, act } from '@testing-library/react'
import { AudioStudioView } from '../../../src/renderer/src/components/AudioStudioView'
import { setupRendererMocks } from '../_helpers'

// ─── OfflineAudioContext stub ───────────────────────────────────────────────
// The generator renders through OfflineAudioContext before export; happy-dom
// has no Web Audio at all. Only the surface generateSineWave touches plus
// startRendering() is needed.

function fakeRenderedBuffer(channels = 2, sampleRate = 48000, seconds = 0.01): AudioBuffer {
  const length = Math.max(1, Math.ceil(sampleRate * seconds))
  const chans: Float32Array[] = []
  for (let ch = 0; ch < channels; ch++) {
    const data = new Float32Array(length)
    for (let i = 0; i < length; i++) data[i] = 0.5
    chans.push(data)
  }
  return {
    numberOfChannels: channels,
    sampleRate,
    length,
    getChannelData: (ch: number) => chans[ch],
  } as unknown as AudioBuffer
}

class FakeOfflineAudioContext {
  public destination = {}
  constructor(
    public numberOfChannels: number,
    public length: number,
    public sampleRate: number,
  ) {}
  createOscillator() {
    return {
      type: '',
      frequency: {
        setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {},
      },
      detune: { setValueAtTime: () => {} },
      connect: () => {}, start: () => {}, stop: () => {},
    }
  }
  createGain() {
    return {
      gain: { setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, setTargetAtTime: () => {} },
      connect: () => {},
    }
  }
  createStereoPanner() {
    return { pan: { setValueAtTime: () => {}, linearRampToValueAtTime: () => {} }, connect: () => {} }
  }
  createBiquadFilter() {
    return {
      type: '',
      frequency: { setValueAtTime: () => {} },
      Q: { setValueAtTime: () => {} },
      gain: { setValueAtTime: () => {}, setTargetAtTime: () => {} },
      connect: () => {},
    }
  }
  createBuffer(channels: number, length: number) {
    return fakeRenderedBuffer(channels, this.sampleRate, length / this.sampleRate)
  }
  createBufferSource() {
    return { buffer: null, connect: () => {}, start: () => {}, stop: () => {} }
  }
  startRendering() { return Promise.resolve(fakeRenderedBuffer()) }
}

/** Open Generator drawer → export subtab. Returns nothing; asserts on the way. */
function openExportSubtab(): void {
  fireEvent.click(screen.getByTitle('audio.tab.generator'))
  fireEvent.click(screen.getByText('audio.gen.subTab.export'))
}

describe('renderer/components/AudioStudioView', () => {
  it.skip('renders the audio studio header', () => {})
  it.skip('renders control buttons', () => {})
  it.skip('renders without source selected (empty state)', () => {})
  it.skip('handles a saved source list', () => {})

  it('module exports the component symbol', async () => {
    const mod = await import('../../../src/renderer/src/components/AudioStudioView')
    expect(typeof mod.AudioStudioView).toBe('function')
  })
})

describe('renderer/components/AudioStudioView R272 (export honesty + waveform projection guard)', () => {
  let createObjectURL: ReturnType<typeof vi.spyOn>
  let revokeObjectURL: ReturnType<typeof vi.spyOn>
  let anchorClick: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    setupRendererMocks()
    ;(globalThis as any).OfflineAudioContext = FakeOfflineAudioContext
    createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake')
    revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    // Anchor click intercepted — `mock.instances` keeps the <a download=…>
    // element so the filename can be asserted without real navigation.
    anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    delete (globalThis as any).OfflineAudioContext
  })

  it('R272/W3: no fake FLAC option — export formats are WAV / WAV 24-bit', () => {
    render(<AudioStudioView />)
    openExportSubtab()
    // The mislabeled "FLAC" option (which always produced 24-bit WAV) is gone.
    expect(screen.queryByText('FLAC')).toBeNull()
    expect(screen.getByText('WAV 24-bit')).toBeTruthy()
    expect(screen.getByText('WAV')).toBeTruthy()
  })

  it('R272/W3: WAV 24-bit export downloads a real 24-bit WAV file (.wav, audio/wav, RIFF header)', async () => {
    render(<AudioStudioView />)
    // Set generator bit depth to 16 FIRST — so the "WAV 24-bit" export option
    // overriding it to 24 is observable in the RIFF header (the plain-WAV
    // path would stay 16).
    fireEvent.click(screen.getByTitle('audio.tab.generator'))
    const bitLabel = screen.getByText('audio.gen.bitDepth')
    const bitSelect = bitLabel.closest('.audio-gen-section')!.querySelector('select')!
    fireEvent.change(bitSelect, { target: { value: '16' } })
    fireEvent.click(screen.getByText('audio.gen.subTab.export'))
    fireEvent.click(screen.getByText('WAV 24-bit'))
    fireEvent.click(screen.getByText('audio.export.download'))

    await waitFor(() => { expect(anchorClick).toHaveBeenCalledTimes(1) })

    // Blob is a WAV with the honest MIME — never audio/flac.
    const blob = createObjectURL.mock.calls[0][0] as Blob
    expect(blob.type).toBe('audio/wav')

    // RIFF header: 'RIFF' magic + 'WAVE' format + bitsPerSample === 24.
    const view = new DataView(await blob.arrayBuffer())
    const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))
    const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11))
    expect(magic).toBe('RIFF')
    expect(wave).toBe('WAVE')
    expect(view.getUint16(34, true)).toBe(24)

    // Filename extension matches the actual container.
    const anchor = anchorClick.mock.instances[0] as HTMLAnchorElement
    expect(anchor.download).toMatch(/\.wav$/)
    expect(revokeObjectURL).toHaveBeenCalled()
  })
})

describe('renderer/components/AudioStudioView R272 (waveform projection black-screen guard)', () => {
  let rgbbox: ReturnType<typeof setupRendererMocks>

  beforeEach(() => {
    rgbbox = setupRendererMocks()
    ;(globalThis as any).OfflineAudioContext = FakeOfflineAudioContext
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    delete (globalThis as any).OfflineAudioContext
  })

  /** The projector (Monitor icon) button in the viz mode bar. */
  const projectButton = (): HTMLButtonElement => {
    const btn = screen.getByTitle('audio.viz.popout') as HTMLButtonElement
    return btn
  }

  it('R272/W2: projection is enabled in spectrum mode but disabled in waveform mode with an explanatory title', () => {
    render(<AudioStudioView />)
    expect(projectButton().disabled).toBe(false)

    fireEvent.click(screen.getByText('audio.viz.waveform'))

    const btn = screen.getByTitle('audio.viz.projectUnsupportedWaveform') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    // And switching back re-enables it.
    fireEvent.click(screen.getByText('audio.viz.spectrum'))
    expect(projectButton().disabled).toBe(false)
    expect(projectButton().title).toBe('audio.viz.popout')
  })

  it('R272/W2: entering waveform mode while projecting stops the projection (no frozen black projector window)', async () => {
    rgbbox.getDisplays = vi.fn().mockResolvedValue([
      { id: 7, label: 'Main', bounds: { x: 0, y: 0, width: 1920, height: 1080 }, primary: true },
    ])
    render(<AudioStudioView />)

    // Start projecting to the display via the picker.
    fireEvent.click(projectButton())
    const displayBtn = await screen.findByRole('button', { name: /Main/ })
    await act(async () => { fireEvent.click(displayBtn) })
    await waitFor(() => { expect(rgbbox.openAudioVizWindow).toHaveBeenCalledWith(7) })
    expect(rgbbox.closeAudioVizWindow).not.toHaveBeenCalled()

    // Switch to waveform mode — projection must be torn down immediately.
    await act(async () => { fireEvent.click(screen.getByText('audio.viz.waveform')) })
    expect(rgbbox.closeAudioVizWindow).toHaveBeenCalledWith(7)
    const btn = screen.getByTitle('audio.viz.projectUnsupportedWaveform') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })
})
