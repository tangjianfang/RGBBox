import type { CaptureProviderKind, CaptureProviderStatus } from '../../shared/types'
import { performance } from 'node:perf_hooks'
import { desktopCaptureProvider } from './desktopCaptureProvider'
import { dxgiProvider } from './dxgiProvider'
import { screenCaptureKitProvider } from './screenCaptureKitProvider'
import type { CaptureProvider, CaptureProviderResult, CaptureRequest } from './types'

const providers: CaptureProvider[] = [dxgiProvider, screenCaptureKitProvider, desktopCaptureProvider]

let activeProvider: CaptureProvider = desktopCaptureProvider
let status: CaptureProviderStatus = {
  active: desktopCaptureProvider.kind,
  available: [desktopCaptureProvider.kind],
  fallbackReason: 'Native capture providers are unavailable in this build; using Electron desktopCapturer.'
}

export async function initializeCaptureProviders(): Promise<CaptureProviderStatus> {
  const available: CaptureProviderKind[] = []
  const unavailableReasons: string[] = []

  for (const provider of providers) {
    const result = await provider.isAvailable()
    if (result.available) {
      available.push(provider.kind)
      if (activeProvider === desktopCaptureProvider || provider.kind !== 'desktop-capturer') {
        activeProvider = provider
      }
    } else if (result.reason) {
      unavailableReasons.push(`${provider.kind}: ${result.reason}`)
    }
  }

  if (!available.includes(activeProvider.kind)) {
    activeProvider = desktopCaptureProvider
  }

  status = {
    ...status,
    active: activeProvider.kind,
    available,
    fallbackReason: activeProvider.kind === 'desktop-capturer' ? unavailableReasons.join(' ') || status.fallbackReason : undefined
  }

  return status
}

export async function captureWithProvider(request: CaptureRequest): Promise<CaptureProviderResult> {
  const startedAt = performance.now()
  try {
    const result = await activeProvider.capture(request)
    status = { ...status, active: activeProvider.kind, lastCaptureMs: result.durationMs, lastError: undefined }
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (activeProvider.kind !== 'desktop-capturer') {
      activeProvider = desktopCaptureProvider
      status = { ...status, active: activeProvider.kind, fallbackReason: message }
      const result = await activeProvider.capture(request)
      status = { ...status, lastCaptureMs: result.durationMs, lastError: undefined }
      return result
    }
    status = { ...status, lastCaptureMs: performance.now() - startedAt, lastError: message }
    throw err
  }
}

export function getCaptureProviderStatus(): CaptureProviderStatus {
  return status
}