import { afterEach, describe, expect, it } from 'vitest'
import { allowPermission } from '../../src/main/permissionGate'

// R236.1: dev detection inside the gate rides ELECTRON_RENDERER_URL (set by
// `yarn dev`, absent in packaged builds) — same signal main/index.ts:111 uses.
const DEV_URL = 'http://localhost:5173/'

function setDev(on: boolean): void {
  if (on) process.env.ELECTRON_RENDERER_URL = DEV_URL
  else delete process.env.ELECTRON_RENDERER_URL
}

afterEach(() => setDev(false))

describe('main/permissionGate (R236.1)', () => {
  describe('allowed app origins pass the type whitelist', () => {
    it('file:// (packaged pages) allows whitelisted device permissions', () => {
      setDev(false)
      for (const permission of ['media', 'audioCapture', 'videoCapture', 'display-capture', 'fullscreen']) {
        expect(allowPermission('file:///C:/app/out/renderer/index.html', permission)).toBe(true)
      }
      // bare origin form, as sent by setPermissionCheckHandler's requestingOrigin
      expect(allowPermission('file://', 'media')).toBe(true)
    })

    it('media:// (custom asset protocol) allows whitelisted permissions', () => {
      expect(allowPermission('media://app/video/clip.mp4', 'videoCapture')).toBe(true)
      expect(allowPermission('media://app/vendor/vision_bundle.js', 'media')).toBe(true)
    })

    it('http://localhost passes only while ELECTRON_RENDERER_URL is set (yarn dev)', () => {
      setDev(true)
      expect(allowPermission(`${DEV_URL}visionHost.html`, 'media')).toBe(true)
      expect(allowPermission('http://127.0.0.1:5173/index.html', 'fullscreen')).toBe(true)
      expect(allowPermission('http://[::1]:5173/index.html', 'media')).toBe(true)
      setDev(false)
      // packaged build: same loopback origin is NOT an app surface anymore
      expect(allowPermission('http://localhost:5173/', 'media')).toBe(false)
    })
  })

  describe('non-app origins are denied even for whitelisted permission types', () => {
    it('rejects arbitrary remote https origins', () => {
      setDev(true)
      expect(allowPermission('https://evil.com/', 'media')).toBe(false)
      expect(allowPermission('https://ai8.rcouyi.com/', 'videoCapture')).toBe(false)
    })

    it('rejects about:blank', () => {
      expect(allowPermission('about:blank', 'media')).toBe(false)
    })

    it('rejects remote http even in dev', () => {
      setDev(true)
      expect(allowPermission('http://evil.com:5173/', 'media')).toBe(false)
    })

    it('rejects undefined / empty / unparsable origins', () => {
      expect(allowPermission(undefined, 'media')).toBe(false)
      expect(allowPermission('', 'media')).toBe(false)
      expect(allowPermission('not a url', 'media')).toBe(false)
    })
  })

  describe('the type whitelist still applies to allowed origins', () => {
    it('denies non-whitelisted permission types from file://', () => {
      for (const permission of ['geolocation', 'notifications', 'clipboard-read', 'openExternal', 'pointerLock', 'unknown-permission']) {
        expect(allowPermission('file:///C:/app/out/renderer/index.html', permission)).toBe(false)
      }
    })

    it('denies non-whitelisted permission types from media:// and dev localhost', () => {
      expect(allowPermission('media://app/x.mp4', 'geolocation')).toBe(false)
      setDev(true)
      expect(allowPermission(`${DEV_URL}index.html`, 'notifications')).toBe(false)
    })
  })
})
