import type { DisplayInfo } from '../../shared/types'

export interface CaptureImage {
  display: DisplayInfo
  bitmap: Buffer
  width: number
  height: number
}

export interface CaptureRequest {
  displays: DisplayInfo[]
  thumbnailSize: { width: number; height: number }
  allowSingleFallback?: boolean
}

export interface CaptureProviderResult {
  images: CaptureImage[]
  durationMs: number
}

export interface CaptureProvider {
  kind: 'desktop-capturer' | 'dxgi' | 'screen-capture-kit'
  isAvailable(): Promise<{ available: boolean; reason?: string }>
  capture(request: CaptureRequest): Promise<CaptureProviderResult>
}