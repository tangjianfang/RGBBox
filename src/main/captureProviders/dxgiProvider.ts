import type { CaptureProvider } from './types'

export const dxgiProvider: CaptureProvider = {
  kind: 'dxgi',
  async isAvailable() {
    return { available: false, reason: 'DXGI native capture provider is not bundled in this build.' }
  },
  async capture() {
    throw new Error('DXGI native capture provider is not bundled in this build.')
  }
}