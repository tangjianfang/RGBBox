// R163.1: conditional headless-GL harness — the R156-D activation.
//
// The 15 GL test shells were unconditional `it.skip` because happy-dom has no
// real WebGL and nobody wired up the `gl` (headless-gl) devDependency that IS
// in the tree (verified: 8.1.6 creates a working WebGL 1.0 stack-gl context).
// This module imports it at load time (top-level await) and exports `itGl` —
// the REAL `it` when the context factory is available, `it.skip` otherwise —
// so the suite runs for real on machines that have it and skips cleanly where
// the native binding can't load. Every activated test must carry real
// assertions (readPixels pixel checks, not hollow bodies).
//
// NOTE: tests/ sits outside both tsconfig projects (vitest transforms it via
// esbuild, no type-check), so this file uses runtime-style typing on purpose.

import { it } from 'vitest'

/** headless-gl context factory (null where the native binding can't load). */
let createGl = null
try {
  // Top-level await resolves before any test body registers, so the
  // it/it.skip binding below is decided synchronously at describe time.
  const mod = await import('gl')
  const fn = typeof mod.default === 'function' ? mod.default : mod
  createGl = typeof fn === 'function' ? fn : null
} catch {
  createGl = null // CI image without the native build — condition holds as skip
}

export const glAvailable = (): boolean => createGl !== null

/** The real `it` when headless-gl works, `it.skip` when it doesn't. */
export const itGl = createGl ? it : it.skip

/** Headless context + a canvas stand-in whose getContext() hands it to the class under test. */
export function makeGlCanvas(width, height) {
  if (!createGl) throw new Error('headless gl unavailable — guard the test with itGl')
  const ctx = createGl(width, height)
  const canvas = {
    width,
    height,
    getContext: () => ctx,
  }
  return { canvas, ctx }
}

/** Read the RGBA center pixel of the current framebuffer. */
export function readCenterPixel(ctx, width, height) {
  const px = new Uint8Array(4)
  ctx.readPixels(Math.floor(width / 2), Math.floor(height / 2), 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px)
  return [px[0], px[1], px[2], px[3]]
}

/** A minimal solid-color frame for drawFrame tests. */
export function solidFrame(columns, rows, r, g, b) {
  const pixels = new Uint8Array(columns * rows * 3)
  for (let i = 0; i < columns * rows; i++) {
    pixels[i * 3] = r; pixels[i * 3 + 1] = g; pixels[i * 3 + 2] = b
  }
  return { columns, rows, pixels, generatedAt: 0 }
}
