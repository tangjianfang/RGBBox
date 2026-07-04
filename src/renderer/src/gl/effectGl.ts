/**
 * R35 (POC): GPU-direct effect renderer — evaluates an effect's colour
 * formula in the fragment shader, once per PHYSICAL SCREEN PIXEL, instead of
 * computing a coarse `columns × rows` grid on the CPU and upsampling it
 * (R32–R34). This is the only way to get genuinely "resolution-level"
 * smoothness: a GPU evaluates millions of fragment invocations per frame in
 * parallel for near-zero extra cost when the maths is simple trig/noise
 * (exactly what RGBBox's effect functions already are — see
 * `src/engine/effects.ts`, which is already written as a pure per-pixel
 * function of (x, y, now, params), i.e. shader-shaped).
 *
 * Scope of this proof-of-concept: ONE effect ('rainbow'), wired into the
 * in-app preview only (`PreviewGrid.tsx`). All other effects and the
 * overlay/video-wall/worker pipeline are completely untouched — see
 * PRD-0002 R35 for the phased rollout plan.
 */

import type { EffectLayer } from '../../../shared/types'

/** Effect kinds that have a GPU-direct shader implementation (grows over time). */
export const GPU_DIRECT_EFFECTS: ReadonlySet<string> = new Set(['rainbow'])

export function isGpuDirectEffect(kind: string | undefined): boolean {
  return kind !== undefined && GPU_DIRECT_EFFECTS.has(kind)
}

const VS = /* glsl */`
  attribute vec2 aPos;
  varying   vec2 vUV;
  void main() {
    vUV         = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
    gl_Position = vec4(aPos, 0.0, 1.0);
  }
`

// ── Shared GLSL helpers (ported 1:1 from src/engine/effects.ts + color.ts) ──
const GLSL_HELPERS = /* glsl */`
  // Matches src/engine/color.ts#hslToRgb exactly (same segment/chroma maths).
  vec3 hslToRgb(float hueDeg, float sat, float light) {
    float hue = mod(mod(hueDeg, 360.0) + 360.0, 360.0);
    float chroma = (1.0 - abs(2.0 * light - 1.0)) * sat;
    float segment = hue / 60.0;
    float x = chroma * (1.0 - abs(mod(segment, 2.0) - 1.0));
    float match = light - chroma * 0.5;
    vec3 rgb1;
    if (segment < 1.0) rgb1 = vec3(chroma, x, 0.0);
    else if (segment < 2.0) rgb1 = vec3(x, chroma, 0.0);
    else if (segment < 3.0) rgb1 = vec3(0.0, chroma, x);
    else if (segment < 4.0) rgb1 = vec3(0.0, x, chroma);
    else if (segment < 5.0) rgb1 = vec3(x, 0.0, chroma);
    else rgb1 = vec3(chroma, 0.0, x);
    return rgb1 + match;
  }

  // Matches src/engine/effects.ts#dirT, continuous-UV limit (columns/rows -> infinity).
  float dirT(vec2 uv, float aspect, float angleDeg) {
    float rad = radians(angleDeg);
    float nx = (uv.x - 0.5) * aspect;
    float ny = uv.y - 0.5;
    float halfDiag = max(0.5 * aspect * abs(cos(rad)) + 0.5 * abs(sin(rad)), 0.0001);
    return (nx * cos(rad) + ny * sin(rad)) / halfDiag * 0.5 + 0.5;
  }
`

// ── Per-effect fragment shaders ──────────────────────────────────────────
// Each takes the same uniform set (uTime, uAspect, uParam0..3) so the driver
// class below doesn't need per-effect uniform plumbing beyond this table.
const EFFECT_FS: Record<string, string> = {
  // 'rainbow': uParam0=speed, uParam1=spread, uParam2=hueShift, uParam3=angle
  rainbow: /* glsl */`
    precision mediump float;
    uniform float uTime;
    uniform float uAspect;
    uniform float uParam0; // speed
    uniform float uParam1; // spread
    uniform float uParam2; // hueShift
    uniform float uParam3; // angle (deg)
    varying vec2 vUV;
    ${GLSL_HELPERS}
    void main() {
      float t = dirT(vUV, uAspect, uParam3);
      float hue = mod(t * 300.0 * uParam1 + uTime * uParam0 * 120.0 + uParam2, 360.0);
      float hueRad = radians(hue);
      float perceptualL = 0.52 + cos(hueRad * 2.0 - 1.2) * 0.06;
      vec3 rgb = hslToRgb(hue, 0.94, perceptualL);
      gl_FragColor = vec4(rgb, 1.0);
    }
  `
}

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(`GL shader compile error: ${gl.getShaderInfoLog(s)}`)
  }
  return s
}

function buildProgram(gl: WebGLRenderingContext, fsSrc: string): WebGLProgram {
  const p = gl.createProgram()!
  gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, VS))
  gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, fsSrc))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`GL program link error: ${gl.getProgramInfoLog(p)}`)
  }
  return p
}

/** Extract the 4 generic shader params for a given GPU-direct effect layer. */
function paramsFor(layer: EffectLayer): [number, number, number, number] {
  const p = layer.parameters
  switch (layer.kind) {
    case 'rainbow':
      return [
        Number(p.speed ?? 0.35),
        Number(p.spread ?? 1.2),
        Number(p.hueShift ?? 0),
        Number(p.angle ?? 0)
      ]
    default:
      return [0, 0, 0, 0]
  }
}

export class EffectGl {
  private readonly gl: WebGLRenderingContext
  private programs = new Map<string, WebGLProgram>()
  private currentKind: string | null = null
  private currentProg: WebGLProgram | null = null
  private uTime: WebGLUniformLocation | null = null
  private uAspect: WebGLUniformLocation | null = null
  private uParams: (WebGLUniformLocation | null)[] = []
  private canvasW = 0
  private canvasH = 0

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    })
    if (!gl) throw new Error('WebGL not available')
    this.gl = gl

    const verts = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1])
    const buf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW)

    this.canvasW = canvas.width
    this.canvasH = canvas.height
    gl.viewport(0, 0, canvas.width, canvas.height)
  }

  resize(width: number, height: number): void {
    this.gl.viewport(0, 0, width, height)
    this.canvasW = width
    this.canvasH = height
  }

  /** (Re)compile and cache the program for an effect kind on first use. */
  private ensureProgram(kind: string): WebGLProgram | null {
    const fsSrc = EFFECT_FS[kind]
    if (!fsSrc) return null
    let prog = this.programs.get(kind)
    if (!prog) {
      prog = buildProgram(this.gl, fsSrc)
      this.programs.set(kind, prog)
    }
    return prog
  }

  private bindAttrib(prog: WebGLProgram): void {
    const { gl } = this
    const aPos = gl.getAttribLocation(prog, 'aPos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
  }

  /** Render one frame of the given GPU-direct effect layer at `now` seconds. */
  render(layer: EffectLayer, now: number): boolean {
    const { gl } = this
    const prog = this.ensureProgram(layer.kind)
    if (!prog) return false

    if (prog !== this.currentProg) {
      gl.useProgram(prog)
      this.bindAttrib(prog)
      this.uTime = gl.getUniformLocation(prog, 'uTime')
      this.uAspect = gl.getUniformLocation(prog, 'uAspect')
      this.uParams = [0, 1, 2, 3].map((i) => gl.getUniformLocation(prog, `uParam${i}`))
      this.currentProg = prog
      this.currentKind = layer.kind
    } else {
      gl.useProgram(prog)
    }

    gl.uniform1f(this.uTime, now)
    gl.uniform1f(this.uAspect, this.canvasW > 0 && this.canvasH > 0 ? this.canvasW / this.canvasH : 1)
    const params = paramsFor(layer)
    this.uParams.forEach((loc, i) => { if (loc) gl.uniform1f(loc, params[i]) })

    gl.drawArrays(gl.TRIANGLES, 0, 6)
    return true
  }

  get activeKind(): string | null {
    return this.currentKind
  }

  dispose(): void {
    for (const prog of this.programs.values()) this.gl.deleteProgram(prog)
    this.programs.clear()
  }
}
