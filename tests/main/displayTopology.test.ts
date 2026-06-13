import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock electron BEFORE importing the module under test
const mockedScreen = {
  getPrimaryDisplay: vi.fn(),
  getAllDisplays: vi.fn(),
}

vi.mock('electron', () => ({
  screen: mockedScreen,
}))

// Import after mock
const { getDisplayTopology } = await import('../../src/main/displayTopology')

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('main/displayTopology', () => {
  it('returns topology for a single primary display', () => {
    mockedScreen.getPrimaryDisplay.mockReturnValue({
      id: 1,
      label: 'Built-in',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      scaleFactor: 1,
      rotation: 0,
    })
    mockedScreen.getAllDisplays.mockReturnValue([
      {
        id: 1,
        label: 'Built-in',
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
        scaleFactor: 1,
        rotation: 0,
      },
    ])

    const topology = getDisplayTopology()
    expect(topology.displays).toHaveLength(1)
    expect(topology.displays[0].primary).toBe(true)
    expect(topology.virtualBounds).toEqual({ x: 0, y: 0, width: 1920, height: 1080 })
  })

  it('handles multiple displays (laptop + external)', () => {
    mockedScreen.getPrimaryDisplay.mockReturnValue({
      id: 1,
      label: 'Built-in',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 25, width: 1920, height: 1055 },
      scaleFactor: 2,
      rotation: 0,
    })
    mockedScreen.getAllDisplays.mockReturnValue([
      {
        id: 1,
        label: 'Built-in',
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 25, width: 1920, height: 1055 },
        scaleFactor: 2,
        rotation: 0,
      },
      {
        id: 2,
        label: 'External',
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
        workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
        scaleFactor: 1,
        rotation: 0,
      },
    ])

    const topology = getDisplayTopology()
    expect(topology.displays).toHaveLength(2)
    expect(topology.displays[0].primary).toBe(true)
    expect(topology.displays[1].primary).toBe(false)
    expect(topology.virtualBounds).toEqual({ x: 0, y: 0, width: 1920 + 2560, height: 1440 })
  })

  it('handles negative coordinates (e.g., secondary monitor to the left)', () => {
    mockedScreen.getPrimaryDisplay.mockReturnValue({
      id: 1,
      label: 'Primary',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      scaleFactor: 1,
      rotation: 0,
    })
    mockedScreen.getAllDisplays.mockReturnValue([
      {
        id: 1,
        label: 'Primary',
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
        scaleFactor: 1,
        rotation: 0,
      },
      {
        id: 2,
        label: 'Left',
        bounds: { x: -1920, y: 0, width: 1920, height: 1080 },
        workArea: { x: -1920, y: 0, width: 1920, height: 1080 },
        scaleFactor: 1,
        rotation: 0,
      },
    ])

    const topology = getDisplayTopology()
    expect(topology.virtualBounds.x).toBe(-1920)
    expect(topology.virtualBounds.width).toBe(1920 + 1920)
  })

  it('falls back to "Display N" when label is empty', () => {
    mockedScreen.getPrimaryDisplay.mockReturnValue({
      id: 1,
      label: '',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      scaleFactor: 1,
      rotation: 0,
    })
    mockedScreen.getAllDisplays.mockReturnValue([
      {
        id: 1,
        label: '',
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
        scaleFactor: 1,
        rotation: 0,
      },
      {
        id: 2,
        label: '',
        bounds: { x: 1920, y: 0, width: 1920, height: 1080 },
        workArea: { x: 1920, y: 0, width: 1920, height: 1080 },
        scaleFactor: 1,
        rotation: 0,
      },
    ])

    const topology = getDisplayTopology()
    expect(topology.displays[0].label).toBe('Display 1')
    expect(topology.displays[1].label).toBe('Display 2')
  })

  it('includes platform string', () => {
    mockedScreen.getPrimaryDisplay.mockReturnValue({
      id: 1,
      label: 'X',
      bounds: { x: 0, y: 0, width: 100, height: 100 },
      workArea: { x: 0, y: 0, width: 100, height: 100 },
      scaleFactor: 1,
      rotation: 0,
    })
    mockedScreen.getAllDisplays.mockReturnValue([
      {
        id: 1,
        label: 'X',
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        workArea: { x: 0, y: 0, width: 100, height: 100 },
        scaleFactor: 1,
        rotation: 0,
      },
    ])

    const topology = getDisplayTopology()
    expect(['windows', 'macos', 'linux', 'unknown']).toContain(topology.platform)
  })

  it('detectedAt is a valid ISO timestamp', () => {
    mockedScreen.getPrimaryDisplay.mockReturnValue({
      id: 1,
      label: 'X',
      bounds: { x: 0, y: 0, width: 100, height: 100 },
      workArea: { x: 0, y: 0, width: 100, height: 100 },
      scaleFactor: 1,
      rotation: 0,
    })
    mockedScreen.getAllDisplays.mockReturnValue([
      {
        id: 1,
        label: 'X',
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        workArea: { x: 0, y: 0, width: 100, height: 100 },
        scaleFactor: 1,
        rotation: 0,
      },
    ])

    const topology = getDisplayTopology()
    expect(() => new Date(topology.detectedAt).toISOString()).not.toThrow()
  })
})
