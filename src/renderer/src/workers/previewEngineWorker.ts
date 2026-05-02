/**
 * Web Worker: runs renderPreviewFrame in a background thread.
 *
 * Architecture:
 *   Renderer thread  →  postMessage({ profile, audioInput, screenSample })  →  Worker
 *   Worker           →  postMessage(frame, [frame.pixels.buffer])           →  Renderer thread
 *
 * The pixel buffer is TRANSFERRED (zero-copy). The worker keeps a copy of the
 * previous frame for smoothing before transferring.
 */

import type { AudioInput } from '../../../engine/previewEngine'
import { renderPreviewFrame } from '../../../engine/previewEngine'
import type { Profile, RgbFrame } from '../../../shared/types'
import { computeTextMask } from '../canvasTextMask'

export interface WorkerInput {
  profile: Profile
  audioInput?: AudioInput
  screenSample?: RgbFrame
}

// Retained across frames for temporal smoothing
let previousFrame: RgbFrame | undefined

self.onmessage = (e: MessageEvent<WorkerInput>): void => {
  const { profile, audioInput, screenSample } = e.data

  // Compute text masks for static-text layers (OffscreenCanvas works in Workers)
  const scene =
    profile.scenes.find((s) => s.id === profile.activeSceneId) ?? profile.scenes[0]
  const textMasks: Record<string, boolean[]> = {}
  for (const layer of scene.layers) {
    if (layer.enabled && layer.kind === 'static') {
      const text = String(layer.parameters.text ?? '')
      if (text.trim()) {
        textMasks[layer.id] = computeTextMask(
          text,
          profile.sampling.columns,
          profile.sampling.rows,
          Number(layer.parameters.textX ?? 0.5),
          Number(layer.parameters.textY ?? 0.5),
          Number(layer.parameters.textScale ?? 1),
          Number(layer.parameters.textWeight ?? 400)
        )
      }
    }
  }

  const frame = renderPreviewFrame(
    profile,
    undefined,
    previousFrame,
    audioInput,
    screenSample,
    Object.keys(textMasks).length > 0 ? textMasks : undefined
  )

  // Keep a copy for next frame's smoothing BEFORE transferring the buffer.
  previousFrame = {
    columns: frame.columns,
    rows: frame.rows,
    pixels: new Uint8ClampedArray(frame.pixels),
    generatedAt: frame.generatedAt
  }

  // Transfer pixel buffer to the renderer thread (zero-copy).
  // After this call frame.pixels.buffer is detached on the worker side.
  ;(self as unknown as Worker).postMessage(frame, [frame.pixels.buffer])
}
