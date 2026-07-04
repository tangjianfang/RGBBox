import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── electron mocks ────────────────────────────────────────────────────────
const mockBrowserWindowInstances: any[] = []
const mockScreenDisplays: any[] = []

vi.mock('electron', () => {
  class FakeBrowserWindow {
    public isDestroyed: () => boolean = () => false
    public isFullScreen: () => boolean = () => false
    public show = vi.fn()
    public focus = vi.fn()
    public moveTop = vi.fn()
    public setAlwaysOnTop = vi.fn()
    public setFullScreen = vi.fn()
    public loadURL = vi.fn()
    public loadFile = vi.fn()
    public removeAllListeners = vi.fn((event?: string) => {
      if (event === 'closed') (this as any)._closedCb = undefined
    })
    public on = vi.fn((event: string, cb: (...args: any[]) => void) => {
      // store 'closed' listener for manual triggering
      if (event === 'closed') (this as any)._closedCb = cb
    })
    public once = vi.fn()
    public setIcon = vi.fn()
    public close = vi.fn(() => {
      // Simulate the 'closed' event firing so the module-level Map is cleaned up
      const closedHandler = (this as any)._closedCb
      if (typeof closedHandler === 'function') closedHandler()
    })
    public webContents = {
      send: vi.fn(),
      on: vi.fn()
    }
    constructor(public opts: any) {
      mockBrowserWindowInstances.push(this)
    }
  }
  return {
    app: { isPackaged: false },
    nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
    BrowserWindow: FakeBrowserWindow,
    screen: {
      getAllDisplays: () => mockScreenDisplays
    }
  }
})

// Import after mock
const overlayManager = await import('../../src/main/overlayManager')
const { openOverlay, closeOverlay, reopenOverlay, closeAllOverlays, pushFrameToOverlays, pushFrameToDisplay, getOverlayDisplayIds, isOverlayOpen, setOverlayClosedCallback } = overlayManager
import type { OverlayConfig, RgbFrame } from '../../src/shared/types'

beforeEach(() => {
  // Close all open overlays from previous test (this also removes them from the module-level Map)
  closeAllOverlays()
  mockBrowserWindowInstances.length = 0
  mockScreenDisplays.length = 0
})

afterEach(() => {
  closeAllOverlays()
  mockBrowserWindowInstances.length = 0
  mockScreenDisplays.length = 0
})

describe('main/overlayManager', () => {
  describe('computeRegionBounds (tested through openOverlay)', () => {
    it('fullscreen region uses full display bounds', () => {
      mockScreenDisplays.push({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } })
      const ok = openOverlay(1, false, undefined, { region: 'fullscreen' })
      expect(ok).toBe(true)
      const win = mockBrowserWindowInstances[0]
      expect(win.opts.x).toBe(0)
      expect(win.opts.y).toBe(0)
      expect(win.opts.width).toBe(1920)
      expect(win.opts.height).toBe(1080)
    })

    it('top-third region produces a strip 1/3 high at top', () => {
      mockScreenDisplays.push({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } })
      openOverlay(1, false, undefined, { region: 'top-third' })
      const win = mockBrowserWindowInstances[0]
      expect(win.opts.height).toBe(360)
      expect(win.opts.y).toBe(0)
    })

    it('middle-third region produces a strip in the middle', () => {
      mockScreenDisplays.push({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } })
      openOverlay(1, false, undefined, { region: 'middle-third' })
      const win = mockBrowserWindowInstances[0]
      expect(win.opts.y).toBe(360)
      expect(win.opts.height).toBe(360)
    })

    it('bottom-third region produces a strip at bottom', () => {
      mockScreenDisplays.push({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } })
      openOverlay(1, false, undefined, { region: 'bottom-third' })
      const win = mockBrowserWindowInstances[0]
      expect(win.opts.y).toBe(720)
      expect(win.opts.height).toBe(360)
    })

    it('left-third region produces a vertical strip on left', () => {
      mockScreenDisplays.push({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } })
      openOverlay(1, false, undefined, { region: 'left-third' })
      const win = mockBrowserWindowInstances[0]
      expect(win.opts.x).toBe(0)
      expect(win.opts.width).toBe(640)
    })

    it('center-third region produces vertical strip in center', () => {
      mockScreenDisplays.push({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } })
      openOverlay(1, false, undefined, { region: 'center-third' })
      const win = mockBrowserWindowInstances[0]
      expect(win.opts.x).toBe(640)
      expect(win.opts.width).toBe(640)
    })

    it('right-third region produces vertical strip on right', () => {
      mockScreenDisplays.push({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } })
      openOverlay(1, false, undefined, { region: 'right-third' })
      const win = mockBrowserWindowInstances[0]
      expect(win.opts.x).toBe(1280)
      expect(win.opts.width).toBe(640)
    })

    it('custom region uses normalized bounds', () => {
      mockScreenDisplays.push({ id: 1, bounds: { x: 0, y: 0, width: 1000, height: 500 } })
      openOverlay(1, false, undefined, {
        region: 'custom',
        custom: { x: 0.25, y: 0.5, width: 0.5, height: 0.25 }
      })
      const win = mockBrowserWindowInstances[0]
      expect(win.opts.x).toBe(250)
      expect(win.opts.y).toBe(250)
      expect(win.opts.width).toBe(500)
      expect(win.opts.height).toBe(125)
    })

    it('custom region clamps minimum size to 1 pixel', () => {
      mockScreenDisplays.push({ id: 1, bounds: { x: 0, y: 0, width: 1000, height: 500 } })
      openOverlay(1, false, undefined, {
        region: 'custom',
        custom: { x: 0, y: 0, width: 0, height: 0 }
      })
      const win = mockBrowserWindowInstances[0]
      expect(win.opts.width).toBe(1)
      expect(win.opts.height).toBe(1)
    })

    it('unknown region falls back to fullscreen', () => {
      mockScreenDisplays.push({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } })
      openOverlay(1, false, undefined, { region: 'bogus' as OverlayConfig['region'] })
      const win = mockBrowserWindowInstances[0]
      expect(win.opts.width).toBe(1920)
      expect(win.opts.height).toBe(1080)
    })
  })

  describe('openOverlay', () => {
    it('returns false when displayId is unknown', () => {
      mockScreenDisplays.length = 0
      const ok = openOverlay(99, false, undefined, { region: 'fullscreen' })
      expect(ok).toBe(false)
      expect(mockBrowserWindowInstances).toHaveLength(0)
    })

    it('returns false when overlay already open for that displayId', () => {
      mockScreenDisplays.push({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } })
      openOverlay(1, false, undefined, { region: 'fullscreen' })
      const ok2 = openOverlay(1, false, undefined, { region: 'fullscreen' })
      expect(ok2).toBe(false)
    })

    it('in dev mode uses loadURL with overlay query', () => {
      mockScreenDisplays.push({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } })
      openOverlay(1, true, 'http://localhost:5173', { region: 'fullscreen' })
      const win = mockBrowserWindowInstances[0]
      expect(win.loadURL).toHaveBeenCalledWith(expect.stringContaining('http://localhost:5173'))
      expect(win.loadURL).toHaveBeenCalledWith(expect.stringContaining('overlay=true'))
    })

    it('in production mode uses loadFile', () => {
      mockScreenDisplays.push({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } })
      openOverlay(1, false, undefined, { region: 'fullscreen' })
      const win = mockBrowserWindowInstances[0]
      expect(win.loadFile).toHaveBeenCalled()
      expect(win.loadURL).not.toHaveBeenCalled()
    })

    it('sets transparent + frameless + skipTaskbar', () => {
      mockScreenDisplays.push({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } })
      openOverlay(1, false, undefined, { region: 'fullscreen' })
      const win = mockBrowserWindowInstances[0]
      expect(win.opts.frame).toBe(false)
      expect(win.opts.transparent).toBe(true)
      expect(win.opts.skipTaskbar).toBe(true)
      expect(win.opts.resizable).toBe(false)
      expect(win.opts.show).toBe(false) // hidden until ready-to-show
    })

    it('registers itself in the overlay map', () => {
      mockScreenDisplays.push({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } })
      openOverlay(1, false, undefined, { region: 'fullscreen' })
      expect(getOverlayDisplayIds()).toContain(1)
      expect(isOverlayOpen(1)).toBe(true)
    })
  })

  describe('closeOverlay', () => {
    it('returns false when no overlay exists for displayId', () => {
      expect(closeOverlay(99)).toBe(false)
    })

    it('closes the existing overlay window', () => {
      mockScreenDisplays.push({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } })
      openOverlay(1, false, undefined, { region: 'fullscreen' })
      const ok = closeOverlay(1)
      expect(ok).toBe(true)
      const win = mockBrowserWindowInstances[0]
      expect(win.close).toHaveBeenCalled()
    })

    it('returns false when window is destroyed', () => {
      mockScreenDisplays.push({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } })
      openOverlay(1, false, undefined, { region: 'fullscreen' })
      const win = mockBrowserWindowInstances[0]
      win.isDestroyed = () => true
      expect(closeOverlay(1)).toBe(false)
    })
  })

  describe('reopenOverlay', () => {
    it('closes existing overlay and opens new one with new config', () => {
      mockScreenDisplays.push({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } })
      openOverlay(1, false, undefined, { region: 'fullscreen' })
      const win1 = mockBrowserWindowInstances[0]
      // Remove the 'closed' listener behaviour is mocked but we verify that the
      // overlay window was removed from the map and a new one was added.
      reopenOverlay(1, false, undefined, { region: 'top-third' })
      // We should now have 2 BrowserWindow instances (first one closed, second one opened)
      expect(mockBrowserWindowInstances.length).toBeGreaterThanOrEqual(2)
      const win2 = mockBrowserWindowInstances[mockBrowserWindowInstances.length - 1]
      expect(win2).not.toBe(win1)
      expect(win2.opts.height).toBe(360) // top-third
    })

    it('removes "closed" listener on existing overlay to skip callback', () => {
      mockScreenDisplays.push({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } })
      openOverlay(1, false, undefined, { region: 'fullscreen' })
      const win1 = mockBrowserWindowInstances[0]
      const cb = vi.fn()
      setOverlayClosedCallback(cb)
      reopenOverlay(1, false, undefined, { region: 'top-third' })
      expect(win1.removeAllListeners).toHaveBeenCalledWith('closed')
    })
  })

  describe('pushFrameToOverlays / pushFrameToDisplay', () => {
    it('sends frame to all open overlays', async () => {
      mockScreenDisplays.push({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } })
      mockScreenDisplays.push({ id: 2, bounds: { x: 1920, y: 0, width: 1920, height: 1080 } })
      openOverlay(1, false, undefined, { region: 'fullscreen' })
      openOverlay(2, false, undefined, { region: 'fullscreen' })
      const frame: RgbFrame = { columns: 1, rows: 1, pixels: new Uint8ClampedArray([255, 0, 0]), generatedAt: 0 }
      pushFrameToOverlays(frame)
      for (const win of mockBrowserWindowInstances) {
        expect(win.webContents.send).toHaveBeenCalledWith('overlay:frame', frame)
      }
    })

    it('sends frame only to a specific displayId', () => {
      mockScreenDisplays.push({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } })
      mockScreenDisplays.push({ id: 2, bounds: { x: 1920, y: 0, width: 1920, height: 1080 } })
      openOverlay(1, false, undefined, { region: 'fullscreen' })
      openOverlay(2, false, undefined, { region: 'fullscreen' })
      const frame: RgbFrame = { columns: 1, rows: 1, pixels: new Uint8ClampedArray([255, 0, 0]), generatedAt: 0 }
      pushFrameToDisplay(1, frame)
      // First window received it; second did not
      const sendCalls0 = mockBrowserWindowInstances[0].webContents.send.mock.calls.length
      const sendCalls1 = mockBrowserWindowInstances[1].webContents.send.mock.calls.length
      expect(sendCalls0).toBeGreaterThan(0)
      expect(sendCalls1).toBe(0)
    })

    it('skips destroyed windows', () => {
      mockScreenDisplays.push({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } })
      openOverlay(1, false, undefined, { region: 'fullscreen' })
      const win = mockBrowserWindowInstances[0]
      win.isDestroyed = () => true
      const frame: RgbFrame = { columns: 1, rows: 1, pixels: new Uint8ClampedArray([255, 0, 0]), generatedAt: 0 }
      pushFrameToOverlays(frame)
      expect(win.webContents.send).not.toHaveBeenCalled()
    })
  })

  describe('isOverlayOpen', () => {
    it('returns false for unknown displayId', () => {
      expect(isOverlayOpen(99)).toBe(false)
    })

    it('returns false when window is destroyed', () => {
      mockScreenDisplays.push({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } })
      openOverlay(1, false, undefined, { region: 'fullscreen' })
      const win = mockBrowserWindowInstances[0]
      win.isDestroyed = () => true
      expect(isOverlayOpen(1)).toBe(false)
    })
  })

  describe('closed callback', () => {
    it('invokes the callback when overlay is closed', () => {
      mockScreenDisplays.push({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } })
      const cb = vi.fn()
      setOverlayClosedCallback(cb)
      openOverlay(1, false, undefined, { region: 'fullscreen' })
      // Simulate the 'closed' event firing
      const win = mockBrowserWindowInstances[0]
      const onSpy = win.on as any
      // Find the registered 'closed' listener
      const closedRegistration = onSpy.mock.calls.find((c: any[]) => c[0] === 'closed')
      expect(closedRegistration).toBeDefined()
      // Manually invoke it
      closedRegistration[1]()
      expect(cb).toHaveBeenCalledWith(1)
      expect(getOverlayDisplayIds()).not.toContain(1)
    })
  })
})
