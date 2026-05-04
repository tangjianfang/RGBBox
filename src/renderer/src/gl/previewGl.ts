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

  uniform sampler2D uFrame;   // columns × rows RGB texture
  uniform vec2      uGrid;    // vec2(columns, rows)
  uniform float     uGap;     // gap fraction of cell size (0.06 = 6 %)
  uniform vec3      uBg;      // gap / background colour
  uniform float     uBgAlpha; // 1.0 = opaque preview, 0.0 = transparent overlay

  varying vec2 vUV;

  void main() {
    // Continuous cell position over the whole grid.
    vec2 cell  = vUV * uGrid;
    // Fractional position within the current cell [0, 1).
    vec2 local = fract(cell);

    float hg = uGap * 0.5;
    if (local.x < hg || local.x > 1.0 - hg ||
        local.y < hg || local.y > 1.0 - hg) {
      // Gap region → opaque background (preview) or fully transparent (overlay).
      gl_FragColor = vec4(uBg * uBgAlpha, uBgAlpha);
      return;
    }

    // Sample the frame texture at the centre of this cell (NEAREST → crisp blocks).
    vec2 tc = (floor(cell) + 0.5) / uGrid;
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
  /** True when this instance is used in a transparent overlay window. */
  private readonly overlay: boolean

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

    // Defaults.
    gl.uniform1f(this.uGap,     0.06)
    gl.uniform3f(this.uBg,      8/255, 13/255, 17/255)  // #08 #0D #11
    gl.uniform1f(this.uBgAlpha, overlay ? 0.0 : 1.0)    // transparent gaps for overlay

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

  /** Must be called after the canvas backing-buffer is resized. */
  resize(width: number, height: number): void {
    this.gl.viewport(0, 0, width, height)
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
}
