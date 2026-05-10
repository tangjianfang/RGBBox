import type { CaptureProvider } from './types'

export const screenCaptureKitProvider: CaptureProvider = {
  kind: 'screen-capture-kit',
  async isAvailable() {
    return { available: false, reason: 'ScreenCaptureKit native capture provider is not bundled in this build.' }
  },
  async capture() {
    throw new Error('ScreenCaptureKit native capture provider is not bundled in this build.')
  }
}