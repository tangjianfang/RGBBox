/**
 * R93 tier-1 super-resolution — pure-function tests. No GPU / ORT / DOM is
 * required: these lock the pass-planning math (the ×4 model fed native×scale/4),
 * the backend priority chain, the RGBA⇄NCHW contract, the file://→media://
 * model-URL mapping and the rolling fps meter that the runtime engine consumes.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAX_INPUT_PX,
  MIN_INPUT_EDGE,
  MODEL_SCALE,
  RollingFps,
  backendLabel,
  fileUrlToMediaUrl,
  imageDataToNchw,
  nchwToImageData,
  pickBackendOrder,
  planSuperresPass,
} from '../../../../src/renderer/src/components/video/superres'
import { MODELS_MANIFEST } from '../../../../src/shared/modelsManifest'

describe('planSuperresPass (×4 model, display scale via input pre-scaling)', () => {
  it('scale 4 feeds the untouched native frame', () => {
    const plan = planSuperresPass(640, 360, 4)
    expect(plan).toEqual({ inW: 640, inH: 360, outW: 2560, outH: 1440, capped: false })
  })

  it('scale 2 halves the input so the ×4 output lands exactly on native×2', () => {
    const plan = planSuperresPass(640, 360, 2)
    expect(plan.inW).toBe(320)
    expect(plan.inH).toBe(180)
    expect(plan.outW).toBe(1280)
    expect(plan.outH).toBe(720)
    expect(plan.capped).toBe(false)
  })

  it('scale 3 feeds native×0.75 (odd results round to even pixels)', () => {
    // 853×480 ×3/4 = 639.75×360 → rounds to even 640×360
    const plan = planSuperresPass(853, 480, 3)
    expect(plan.inW % 2).toBe(0)
    expect(plan.inH % 2).toBe(0)
    expect(plan.outW).toBe(plan.inW * MODEL_SCALE)
    expect(plan.capped).toBe(false)
  })

  it('caps oversized inputs proportionally (1920×1080 ×4 exceeds the realtime budget)', () => {
    const plan = planSuperresPass(1920, 1080, 4, DEFAULT_MAX_INPUT_PX)
    expect(plan.capped).toBe(true)
    // within ~2px of the area budget (even rounding may add an edge pixel)
    expect(plan.inW * plan.inH).toBeLessThanOrEqual(DEFAULT_MAX_INPUT_PX + 2 * 1920)
    // aspect ratio preserved within 1%
    const nativeAspect = 1920 / 1080
    expect(Math.abs(plan.inW / plan.inH - nativeAspect)).toBeLessThan(0.01)
  })

  it('never feeds the network below MIN_INPUT_EDGE', () => {
    const plan = planSuperresPass(16, 16, 2)
    expect(plan.inW).toBe(MIN_INPUT_EDGE)
    expect(plan.inH).toBe(MIN_INPUT_EDGE)
    expect(plan.outW).toBe(MIN_INPUT_EDGE * MODEL_SCALE)
  })
})

describe('pickBackendOrder (WebGPU → WebGL → CPU wasm)', () => {
  it('prefers webgpu when an adapter exists', () => {
    expect(pickBackendOrder({ webgpu: true, webgl: true })).toEqual(['webgpu', 'webgl', 'wasm'])
  })

  it('falls to webgl then wasm without webgpu', () => {
    expect(pickBackendOrder({ webgpu: false, webgl: true })).toEqual(['webgl', 'wasm'])
  })

  it('wasm is the unconditional floor', () => {
    expect(pickBackendOrder({ webgpu: false, webgl: false })).toEqual(['wasm'])
    expect(backendLabel('wasm')).toBe('CPU (WASM)')
    expect(backendLabel('webgpu')).toBe('WebGPU')
    expect(backendLabel('webgl')).toBe('WebGL')
  })
})

describe('RGBA ⇄ NCHW conversion (model contract: NCHW, RGB, 0-1)', () => {
  it('produces planar channels in R,G,B order', () => {
    // 2×2 image: pixels [R=255,G=0,B=0], [0,255,0], [0,0,255], [255,255,255]
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 255, 255, 255,
    ])
    const nchw = imageDataToNchw(rgba, 2, 2)
    expect(nchw.length).toBe(12)
    // R plane: 1,0,0,1 — G plane: 0,1,0,1 — B plane: 0,0,1,1
    expect(Array.from(nchw.slice(0, 4))).toEqual([1, 0, 0, 1])
    expect(Array.from(nchw.slice(4, 8))).toEqual([0, 1, 0, 1])
    expect(Array.from(nchw.slice(8, 12))).toEqual([0, 0, 1, 1])
  })

  it('round-trips through the output converter with alpha forced opaque', () => {
    const w = 3, h = 2
    const src = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < src.length; i++) src[i] = (i * 37) % 256
    const round = nchwToImageData(imageDataToNchw(src, w, h), w, h)
    expect(round.length).toBe(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      expect(round[i * 4]).toBeCloseTo(src[i * 4], 0)
      expect(round[i * 4 + 1]).toBeCloseTo(src[i * 4 + 1], 0)
      expect(round[i * 4 + 2]).toBeCloseTo(src[i * 4 + 2], 0)
      expect(round[i * 4 + 3]).toBe(255)
    }
  })

  it('clamps out-of-range floats into byte range (Uint8ClampedArray semantics)', () => {
    const out = nchwToImageData(new Float32Array([-2, 5, 0.5]), 1, 1)
    expect(Array.from(out)).toEqual([0, 255, 128, 255])
  })
})

describe('fileUrlToMediaUrl (model cache → fetchable URL)', () => {
  it('maps a Windows file:// URL through the media://local route', () => {
    const url = fileUrlToMediaUrl('file:///C:/Users/mk/App%20Data/realesr_animevideov3_x4.onnx')
    expect(url.startsWith('media://local?p=')).toBe(true)
    const back = decodeURIComponent(url.slice('media://local?p='.length))
    expect(back).toBe('C:/Users/mk/App Data/realesr_animevideov3_x4.onnx')
  })

  it('leaves non-file URLs untouched', () => {
    expect(fileUrlToMediaUrl('https://example.com/m.onnx')).toBe('https://example.com/m.onnx')
  })
})

describe('RollingFps', () => {
  it('counts completions inside a rolling 1s window only', () => {
    const f = new RollingFps()
    f.push(0)
    f.push(100)
    f.push(200)
    expect(f.value).toBe(3)
    f.push(1500) // cutoff 500 → 0/100/200 all evicted, only 1500 remains
    expect(f.value).toBe(1)
    f.reset()
    expect(f.value).toBe(0)
  })
})

describe('MODELS_MANIFEST wiring for the engine', () => {
  it('exposes exactly one super-resolution onnx within the hard budget', () => {
    const sr = MODELS_MANIFEST.filter((m) => m.name === 'realesr_animevideov3')
    expect(sr.length).toBe(1)
    expect(sr[0].bytes!).toBeGreaterThan(0)
    expect(sr[0].bytes!).toBeLessThanOrEqual(100 * 1024 * 1024)
    // cached-file validation needs a stable expected size → bytes pinned exactly
    expect(sr[0].bytes).toBe(2492908)
  })
})
