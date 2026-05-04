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
  /** When ripple effect is active and a burst was triggered by clicking, inject transient center here. */
  rippleBurst?: { cx: number; cy: number; burstAge: number }
}

// Retained across frames for temporal smoothing
let previousFrame: RgbFrame | undefined

self.onmessage = (e: MessageEvent<WorkerInput>): void => {
  const { profile, audioInput, screenSample, rippleBurst } = e.data

  // Compute text masks for static-text layers (OffscreenCanvas works in Workers)
  const scene =
    profile.scenes.find((s) => s.id === profile.activeSceneId) ?? profile.scenes[0]

  // Inject burst parameters into any ripple layers that are currently active
  const patchedProfile: Profile = rippleBurst
    ? {
        ...profile,
        scenes: profile.scenes.map((s) =>
          s.id !== scene.id
            ? s
            : {
                ...s,
                layers: s.layers.map((l) =>
                  l.enabled && l.kind === 'ripple'
                    ? {
                        ...l,
                        parameters: {
                          ...l.parameters,
                          burstCx: rippleBurst.cx,
                          burstCy: rippleBurst.cy,
                          burstAge: rippleBurst.burstAge,
                        },
                      }
                    : l
                ),
              }
        ),
      }
    : profile
  const patchedScene =
    patchedProfile.scenes.find((s) => s.id === patchedProfile.activeSceneId) ?? patchedProfile.scenes[0]

  const textMasks: Record<string, boolean[]> = {}
  for (const layer of patchedScene.layers) {
    if (layer.enabled && layer.kind === 'static') {
      const text = String(layer.parameters.text ?? '')
      if (text.trim()) {
        textMasks[layer.id] = computeTextMask(
          text,
          patchedProfile.sampling.columns,
          patchedProfile.sampling.rows,
          Number(layer.parameters.textX ?? 0.5),
          Number(layer.parameters.textY ?? 0.5),
          Number(layer.parameters.textScale ?? 1),
          Number(layer.parameters.textWeight ?? 400)
        )
      }
    }
  }

  const frame = renderPreviewFrame(
    patchedProfile,
    undefined,
    previousFrame,
    audioInput,
    screenSample,
    Object.keys(textMasks).length > 0 ? textMasks : undefined
  )

  // Keep a copy for next frame's smoothing BEFORE transferring the buffer.
  // Reuse the existing pixel buffer (same size) instead of allocating 170KB each frame.
  const pixelLen = frame.pixels.length
  if (!previousFrame || previousFrame.pixels.length !== pixelLen) {
    previousFrame = {
      columns: frame.columns,
      rows: frame.rows,
      pixels: new Uint8ClampedArray(frame.pixels),
      generatedAt: frame.generatedAt
    }
  } else {
    previousFrame.pixels.set(frame.pixels)
    previousFrame.columns = frame.columns
    previousFrame.rows = frame.rows
    previousFrame.generatedAt = frame.generatedAt
  }

  // Transfer pixel buffer to the renderer thread (zero-copy).
  // After this call frame.pixels.buffer is detached on the worker side.
  ;(self as unknown as Worker).postMessage(frame, [frame.pixels.buffer])
}
