/**
 * WebGL-based preview grid renderer.
 *
 * Architecture (one draw call per frame):
 *   1. Upload the RGB frame as a small texture (columns × rows).
 *   2. Render a full-screen quad via a GLSL fragment shader that:
 *      – maps each fragment to a grid cell
 *      – applies configurable gap masking
 *      – samples the frame texture for the cell colour
 *
 * Why WebGL?
 *   – GPU processes all cells in parallel → zero CPU pixel-loop cost
 *   – texSubImage2D + drawArrays = two GL calls per frame (~0.05 ms)
 *   – Naturally forward-compatible with 3D lighting, normal-maps, etc.
 *
 * Targets WebGL 1 for widest device coverage (Electron on Windows/macOS).
 * The design is intentionally upgradeable to WebGL 2 / WebGPU.
 */

import type { RgbFrame } from '../../../shared/types'

// ── GLSL ─────────────────────────────────────────────────────────────────

const VS = /* glsl */`
  attribute vec2 aPos;
  varying   vec2 vUV;
  void main() {
    // Clip-space quad → UV (0..1).
    // Flip Y so row 0 of the frame appears at the top of the canvas.
    vUV         = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
    gl_Position = vec4(aPos, 0.0, 1.0);
  }
`

const FS = /* glsl */`
  precision mediump float;

  uniform sampler2D uFrame;    // columns × rows RGB texture
  uniform vec2      uGrid;     // vec2(columns, rows)
  uniform float     uGap;      // gap fraction of cell size (0.06 = 6 %) — 'pixel' style only
  uniform vec3      uBg;       // gap / background colour
  uniform float     uBgAlpha;  // 1.0 = opaque preview, 0.0 = transparent overlay
  uniform float     uSmooth;   // R32: 0 = discrete LED pixel blocks, 1 = smooth bilinear blend
  // Layout uniforms (square cells, letterbox/pillarbox centring):
  uniform vec2      uOrigin;   // normalised canvas UV where the grid starts
  uniform vec2      uCellSize; // normalised canvas UV size of one square cell

  varying vec2 vUV;

  void main() {
    // Map the full-canvas UV to grid-relative position (in cell units).
    vec2 gridPos = (vUV - uOrigin) / uCellSize;

    // Outside the grid → background / transparent gap colour.
    if (gridPos.x < 0.0 || gridPos.x > uGrid.x ||
        gridPos.y < 0.0 || gridPos.y > uGrid.y) {
      gl_FragColor = vec4(uBg * uBgAlpha, uBgAlpha);
      return;
    }

    if (uSmooth > 0.5) {
      // R32 'smooth' style: sample the grid at its continuous (non-floored)
      // position. Combined with GL_LINEAR texture filtering (set in
      // setRenderStyle()), the GPU automatically blends between neighbouring
      // cell colours — same texture size / same one draw call as 'pixel'
      // style, just a different (practically free) filter mode. No gap
      // cutout: a smoothly blended light bar has no visible seams.
      vec2 tc = clamp(gridPos, vec2(0.5), uGrid - vec2(0.5)) / uGrid;
      gl_FragColor = vec4(texture2D(uFrame, tc).rgb, 1.0);
      return;
    }

    // 'pixel' style: fractional position within the current cell [0, 1).
    vec2 local = fract(gridPos);
    float hg = uGap * 0.5;
    if (local.x < hg || local.x > 1.0 - hg ||
        local.y < hg || local.y > 1.0 - hg) {
      // Gap region → opaque background (preview) or fully transparent (overlay).
      gl_FragColor = vec4(uBg * uBgAlpha, uBgAlpha);
      return;
    }

    // Sample the frame texture at the centre of this cell (NEAREST → crisp blocks).
    vec2 tc = (floor(gridPos) + 0.5) / uGrid;
    gl_FragColor = vec4(texture2D(uFrame, tc).rgb, 1.0);
  }
`

// ── Helpers ───────────────────────────────────────────────────────────────

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(`GL shader compile error: ${gl.getShaderInfoLog(s)}`)
  }
  return s
}

function buildProgram(gl: WebGLRenderingContext): WebGLProgram {
  const p = gl.createProgram()!
  gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, VS))
  gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, FS))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`GL program link error: ${gl.getProgramInfoLog(p)}`)
  }
  return p
}

// ── Public class ──────────────────────────────────────────────────────────

export class PreviewGl {
  private readonly gl: WebGLRenderingContext
  private readonly prog: WebGLProgram
  private readonly tex: WebGLTexture
  private texCols = 0
  private texRows = 0
  private readonly uGrid: WebGLUniformLocation
  private readonly uGap: WebGLUniformLocation
  private readonly uBg: WebGLUniformLocation
  private readonly uBgAlpha: WebGLUniformLocation
  private readonly uOrigin: WebGLUniformLocation
  private readonly uCellSize: WebGLUniformLocation
  private readonly uSmooth: WebGLUniformLocation
  /** Tracks the last-applied render style so setRenderStyle() can skip
   *  redundant texParameteri calls when called every frame with the same value. */
  private currentRenderStyle: 'pixel' | 'smooth' = 'pixel'
  /** True when this instance is used in a transparent overlay window. */
  private readonly overlay: boolean
  private canvasW = 0
  private canvasH = 0

  /**
   * @param canvas  The canvas element whose backing buffer has already been
   *                sized to the desired physical resolution by the caller.
   *                Do NOT change canvas.width/height after construction —
   *                setting those attributes triggers a WebGL context-lost event.
   *                Call resize() + recreate the PreviewGl instance on resize.
   * @param overlay Pass true for overlay windows (enables transparent gaps,
   *                uses alpha:true WebGL context for compositor blending).
   */
  constructor(canvas: HTMLCanvasElement, overlay = false) {
    this.overlay = overlay
    const gl = canvas.getContext('webgl', {
      antialias:             false,
      alpha:                 overlay,  // overlay needs transparency; preview is opaque
      depth:                 false,
      stencil:               false,
      preserveDrawingBuffer: false,
      powerPreference:       'high-performance',
    })
    if (!gl) throw new Error('WebGL not available')
    this.gl = gl

    this.prog = buildProgram(gl)
    gl.useProgram(this.prog)

    // Full-screen quad: two triangles covering [-1,1]² clip space.
    const verts = new Float32Array([-1,-1,  1,-1,  -1,1,  -1,1,  1,-1,  1,1])
    const buf   = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(this.prog, 'aPos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    // Frame texture — NEAREST filtering for sharp pixel blocks.
    this.tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE)

    // RGB textures: rows are 3 bytes × width. Default UNPACK_ALIGNMENT=4 would
    // cause misalignment for widths where (width*3) is not divisible by 4.
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)

    // Uniform handles.
    this.uGrid     = gl.getUniformLocation(this.prog, 'uGrid')!
    this.uGap      = gl.getUniformLocation(this.prog, 'uGap')!
    this.uBg       = gl.getUniformLocation(this.prog, 'uBg')!
    this.uBgAlpha  = gl.getUniformLocation(this.prog, 'uBgAlpha')!
    this.uOrigin   = gl.getUniformLocation(this.prog, 'uOrigin')!
    this.uCellSize = gl.getUniformLocation(this.prog, 'uCellSize')!
    this.uSmooth   = gl.getUniformLocation(this.prog, 'uSmooth')!

    // Defaults.
    gl.uniform1f(this.uGap,     0.0)
    gl.uniform3f(this.uBg,      8/255, 13/255, 17/255)  // #08 #0D #11
    gl.uniform1f(this.uBgAlpha, overlay ? 0.0 : 1.0)    // transparent gaps for overlay
    gl.uniform1f(this.uSmooth,  0.0)                    // start in 'pixel' style; setRenderStyle() switches it
    // Safe default: cover whole canvas with a single 1×1 cell until first frame.
    gl.uniform2f(this.uOrigin,   0, 0)
    gl.uniform2f(this.uCellSize, 1, 1)

    this.canvasW = canvas.width
    this.canvasH = canvas.height

    // Clear colour: transparent for overlay, dark for preview.
    if (overlay) {
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
      gl.clearColor(0, 0, 0, 0)
    } else {
      gl.clearColor(8/255, 13/255, 17/255, 1)
    }

    gl.viewport(0, 0, canvas.width, canvas.height)
  }

  /**
   * Must be called after the canvas backing-buffer is resized.
   * Layout uniforms will be recomputed on the next drawFrame().
   */
  resize(width: number, height: number): void {
    this.gl.viewport(0, 0, width, height)
    this.canvasW = width
    this.canvasH = height
    // Reset texCols/texRows to force layout uniform recompute next frame.
    this.texCols = 0
    this.texRows = 0
  }

  /**
   * Compute and upload layout uniforms.
   *
   * - Preview (in-app "RGB 画布预览"): cells are kept square, grid centred
   *   with letterbox / pillarbox padding — this is a UI viewport, not a
   *   physical output, so square cells simply look nicer.
   * - Overlay (real per-display push, R30.1): always stretch the grid to
   *   cover the full canvas edge-to-edge with zero padding. Overlay windows
   *   are sized to the exact physical display, and in linked multi-display
   *   mode each display's sub-frame aspect ratio rarely matches its own
   *   screen aspect exactly (see `extractSubFrame` in App.tsx) — letterboxing
   *   here would show up as a visible black border on real hardware. This
   *   also keeps the physical output content-consistent with what the
   *   virtual canvas preview shows for that display's region (no more
   *   preview/output mismatch when displays have different resolutions).
   */
  private updateLayout(columns: number, rows: number): void {
    const { gl, canvasW, canvasH } = this
    if (!canvasW || !canvasH) return

    if (this.overlay) {
      gl.uniform2f(this.uOrigin, 0, 0)
      gl.uniform2f(this.uCellSize, 1 / columns, 1 / rows)
      return
    }

    // cellSize in physical pixels — same formula as the old 2D canvas code.
    const cellPx   = Math.min(canvasW / columns, canvasH / rows)
    const totalW   = cellPx * columns
    const totalH   = cellPx * rows
    const originX  = (canvasW - totalW) / 2 / canvasW  // normalised
    const originY  = (canvasH - totalH) / 2 / canvasH
    const cellSizeX = cellPx / canvasW
    const cellSizeY = cellPx / canvasH
    gl.uniform2f(this.uOrigin,   originX,   originY)
    gl.uniform2f(this.uCellSize, cellSizeX, cellSizeY)
  }

  /**
   * Upload frame pixel data and draw.
   * Hot path: texSubImage2D (DMA to GPU) + drawArrays (one GL draw call).
   */
  drawFrame(frame: RgbFrame): void {
    const { gl } = this
    const { columns, rows, pixels } = frame

    gl.bindTexture(gl.TEXTURE_2D, this.tex)

    if (columns !== this.texCols || rows !== this.texRows) {
      // Allocate new texture storage when grid resolution changes.
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, columns, rows, 0, gl.RGB, gl.UNSIGNED_BYTE, pixels)
      this.texCols = columns
      this.texRows = rows
      gl.uniform2f(this.uGrid, columns, rows)
      // Recompute square-cell layout whenever the grid resolution changes.
      this.updateLayout(columns, rows)
    } else {
      // Sub-update existing texture — avoids GPU re-allocation.
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, columns, rows, gl.RGB, gl.UNSIGNED_BYTE, pixels)
    }

    if (this.overlay) gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  dispose(): void {
    this.gl.deleteTexture(this.tex)
    this.gl.deleteProgram(this.prog)
  }

  /** Set the inter-cell gap fraction (0 = no lines, 0.06 = ~6% gap). Only visible in 'pixel' style. */
  setGap(gap: number): void {
    this.gl.useProgram(this.prog)
    this.gl.uniform1f(this.uGap, gap)
  }

  /**
   * R32: switch between the discrete 'pixel' LED-block look and the
   * 'smooth' bilinear-blended look. Cheap to call every frame — skips GL
   * state changes when the style hasn't actually changed.
   */
  setRenderStyle(style: 'pixel' | 'smooth'): void {
    if (style === this.currentRenderStyle) return
    this.currentRenderStyle = style
    const { gl } = this
    const filter = style === 'smooth' ? gl.LINEAR : gl.NEAREST
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
    gl.useProgram(this.prog)
    gl.uniform1f(this.uSmooth, style === 'smooth' ? 1.0 : 0.0)
  }
}
