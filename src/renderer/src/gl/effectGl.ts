/**
 * R35/R37: GPU-direct effect renderer — evaluates an effect's colour formula
 * in the fragment shader, once per PHYSICAL SCREEN PIXEL, instead of
 * computing a coarse `columns × rows` grid on the CPU and upsampling it
 * (R32–R34). This is the only way to get genuinely "resolution-level"
 * smoothness: a GPU evaluates millions of fragment invocations per frame in
 * parallel for near-zero extra cost when the maths is simple trig/noise
 * (exactly what RGBBox's effect functions already are — see
 * `src/engine/effects.ts`, which is already written as a pure per-pixel
 * function of (x, y, now, params), i.e. shader-shaped).
 *
 * R37 generalises the R35 POC (which only had 'rainbow', with a fixed
 * 4-float uniform layout) to a flexible per-effect uniform scheme: up to 8
 * generic floats (`uP[0..7]`) + up to 2 explicit colours (`uColor0`,
 * `uColor1`), covering the parameter shapes used across the CPU effect
 * catalogue.
 *
 * Deliberately NOT ported (see PRD-0002 R37 for full reasoning):
 *  - starlight / matrix-rain / glitch / random-color: discrete/particle look
 *    is the intended aesthetic (same exclusion list as R32's PIXEL_STYLE_EFFECTS).
 *  - custom-paint / image-paint / screen-ambient: sample external image data,
 *    not a procedural formula.
 *  - audio-beat / audio-equalizer: need a cross-frame decay envelope computed
 *    from live audio input, not currently plumbed into this GPU path.
 *  - fire / crystal / lightning / lightning-leader: reference the configured
 *    LED grid's `columns`/`rows` to size features (bolt width, cell count) —
 *    needs `columns`/`rows` threaded through as uniforms, not done in this
 *    batch (tracked as follow-up).
 */

import { hexToRgb } from '../../../engine/color'
import type { EffectLayer } from '../../../shared/types'

/** Effect kinds that have a GPU-direct shader implementation (grows over time). */
export const GPU_DIRECT_EFFECTS: ReadonlySet<string> = new Set([
  'rainbow',
  'wave',
  'zone-gradient',
  'plasma',
  'vortex',
  'tunnel',
  'neon-pulse',
  'spectrum',
  'comet',
  'explode',
  'breathing'
])

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

  // Matches src/engine/effects.ts#normCoords, continuous-UV limit.
  vec2 normCoords(vec2 uv, float aspect) {
    return vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  }

  // Matches src/engine/effects.ts#hash / hash2 (deterministic pseudo-random).
  float hash1(float n) {
    return fract(sin(n) * 43758.5453123);
  }
  float hash2(float x, float y) {
    return hash1(x * 127.1 + y * 311.7);
  }
`

// ── Per-effect fragment shaders ──────────────────────────────────────────
// Each takes the same uniform set (uTime, uAspect, uP[0..7], uColor0, uColor1)
// so the driver class below doesn't need per-effect uniform plumbing beyond
// this table. `paramsFor()` maps each layer's named parameters into this
// generic slot layout.
const EFFECT_FS: Record<string, string> = {
  // 'rainbow': uP0=speed, uP1=spread, uP2=hueShift, uP3=angle
  rainbow: /* glsl */`
    precision mediump float;
    uniform float uTime;
    uniform float uAspect;
    uniform float uP[8];
    varying vec2 vUV;
    ${GLSL_HELPERS}
    void main() {
      float t = dirT(vUV, uAspect, uP[3]);
      float hue = mod(t * 300.0 * uP[1] + uTime * uP[0] * 120.0 + uP[2], 360.0);
      float hueRad = radians(hue);
      float perceptualL = 0.52 + cos(hueRad * 2.0 - 1.2) * 0.06;
      vec3 rgb = hslToRgb(hue, 0.94, perceptualL);
      gl_FragColor = vec4(rgb, 1.0);
    }
  `,

  // 'wave': uP0=speed, uP1=width, uP2=angle; uColor0=color
  wave: /* glsl */`
    precision mediump float;
    uniform float uTime;
    uniform float uAspect;
    uniform float uP[8];
    uniform vec3 uColor0;
    varying vec2 vUV;
    ${GLSL_HELPERS}
    void main() {
      float speed = uP[0];
      float width = max(0.02, uP[1]);
      float angle = uP[2];
      float phase = (dirT(vUV, uAspect, angle) + uTime * speed) * 6.28318530718;
      float w = sin(phase);
      float primary = exp(-pow((1.0 - w) / (width * 1.8), 2.0));
      float secondary = exp(-pow((1.0 - sin(phase * 2.1 + 0.7)) / (width * 2.8), 2.0)) * 0.18;
      float brightness = clamp(0.02 + primary + secondary, 0.0, 1.0);
      float bloom = pow(primary, 3.5) * 0.25;
      vec3 col = (uColor0 + (vec3(1.0) - uColor0) * bloom) * brightness;
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  // 'zone-gradient': uP0=angle; uColor0=from, uColor1=to
  'zone-gradient': /* glsl */`
    precision mediump float;
    uniform float uAspect;
    uniform float uP[8];
    uniform vec3 uColor0;
    uniform vec3 uColor1;
    varying vec2 vUV;
    ${GLSL_HELPERS}
    void main() {
      float ratio = clamp(dirT(vUV, uAspect, uP[0]), 0.0, 1.0);
      gl_FragColor = vec4(mix(uColor0, uColor1, ratio), 1.0);
    }
  `,

  // 'plasma': uP0=speed, uP1=frequency, uP2=saturation
  plasma: /* glsl */`
    precision mediump float;
    uniform float uTime;
    uniform float uAspect;
    uniform float uP[8];
    varying vec2 vUV;
    ${GLSL_HELPERS}
    void main() {
      float speed = uP[0];
      float freq = uP[1];
      float sat = uP[2];
      vec2 n = (vUV - 0.5) * 2.0;
      n.x *= uAspect;
      float t = uTime * speed;
      float v1 = sin(n.x * freq + t);
      float v2 = sin(n.y * freq * 0.82 + t * 1.17);
      float v3 = sin((n.x + n.y) * freq * 0.63 + t * 0.73);
      float v4 = sin(length(n) * freq * 1.4 - t * 0.92);
      float v = (v1 + v2 + v3 + v4) * 0.25;
      float hue = mod(v * 180.0 + t * 60.0 + 720.0, 360.0);
      vec3 col = hslToRgb(hue, sat, 0.42 + v * 0.10);
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  // 'vortex': uP0=speed, uP1=density, uP2=hueShift
  vortex: /* glsl */`
    precision mediump float;
    uniform float uTime;
    uniform float uAspect;
    uniform float uP[8];
    varying vec2 vUV;
    ${GLSL_HELPERS}
    void main() {
      float speed = uP[0];
      float density = uP[1];
      float hueShift = uP[2];
      vec2 n = normCoords(vUV, uAspect);
      float r = length(n) / (0.5 * max(0.0001, uAspect));
      float angle = atan(n.y, n.x);
      float t = uTime * speed;
      float spiralPhase = angle + r * density - t * 3.0;
      float s1 = sin(spiralPhase * 2.0) * 0.5 + 0.5;
      float s2 = sin(spiralPhase * 3.0 + t * 1.5) * 0.5 + 0.5;
      float combined = s1 * 0.6 + s2 * 0.4;
      float depthFade = max(0.0, 1.0 - r * 0.90);
      float hue = mod((angle / 3.14159265 * 180.0) + r * 40.0 + t * 45.0 + hueShift + 720.0, 360.0);
      float brightness = (0.15 + combined * 0.65) * (0.35 + depthFade * 0.65);
      vec3 col = hslToRgb(hue, 0.95, min(0.75, brightness * 0.70));
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  // 'tunnel': uP0=speed, uP1=frequency, uP2=hueShift
  tunnel: /* glsl */`
    precision mediump float;
    uniform float uTime;
    uniform float uAspect;
    uniform float uP[8];
    varying vec2 vUV;
    ${GLSL_HELPERS}
    void main() {
      float speed = uP[0];
      float frequency = uP[1];
      float hueShift = uP[2];
      vec2 n = normCoords(vUV, uAspect);
      float r = length(n);
      float angle = atan(n.y, n.x);
      float t = uTime * speed;
      float depth = clamp(0.10 / max(0.006, r), 0.0, 1.0);
      float u = (angle / 3.14159265) * 0.5 + 0.5;
      float stripePhase = mod(u * frequency + depth * 4.0 - t * 3.0, 2.0);
      float stripe = clamp(abs(stripePhase - 1.0) * 3.0 - 0.5, 0.0, 1.0);
      float ringPhase = mod(depth * 8.0 - t * 4.0, 1.0);
      float ring = 0.4 + sin(ringPhase * 6.28318530718) * 0.30;
      float hue = mod(u * 360.0 + depth * 60.0 - t * 30.0 + hueShift + 720.0, 360.0);
      float brightness = stripe * 0.55 + ring * 0.30 + depth * 0.15;
      vec3 col = hslToRgb(hue, 0.92, clamp(brightness * 0.70, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  // 'neon-pulse': uP0=speed, uP1=density, uP2=hueShift
  'neon-pulse': /* glsl */`
    precision mediump float;
    uniform float uTime;
    uniform float uAspect;
    uniform float uP[8];
    varying vec2 vUV;
    ${GLSL_HELPERS}
    void main() {
      float speed = uP[0];
      float density = uP[1];
      float hueShift = uP[2];
      float t = uTime * speed;
      vec2 n = normCoords(vUV, uAspect);
      float r = length(n);
      float phase = r * density * 6.28318530718 - t * 3.0;
      float ring1 = pow(max(0.0, sin(phase)), 3.0);
      float ring2 = pow(max(0.0, sin(phase * 1.5 + t * 1.4)), 2.0) * 0.6;
      float hue = mod(hueShift + r * 130.0 + t * 42.0 + 720.0, 360.0);
      float bright = ring1 * 0.70 + ring2 * 0.45;
      vec3 col = hslToRgb(hue, 1.0, clamp(bright * 0.65, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  // 'spectrum': uP0=speed, uP1=saturation, uP2=hueShift, uP3=spread
  spectrum: /* glsl */`
    precision mediump float;
    uniform float uTime;
    uniform float uP[8];
    varying vec2 vUV;
    ${GLSL_HELPERS}
    void main() {
      float speed = uP[0];
      float saturation = uP[1];
      float hueShift = uP[2];
      float spread = uP[3];
      float nx = vUV.x - 0.5;
      float ny = vUV.y - 0.5;
      float spatialT = (nx + ny) * 0.5 + 0.5;
      float hue = mod(uTime * speed * 360.0 + hueShift + spatialT * 120.0 * spread + 720.0, 360.0);
      float hueRad = radians(hue);
      float perceptualL = 0.50 - cos(hueRad + 1.05) * 0.04 - cos(hueRad * 2.0 + 0.3) * 0.025;
      float pulse = 0.85 + sin(uTime * 0.9) * 0.15;
      vec3 col = hslToRgb(hue, saturation, perceptualL * pulse);
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  // 'comet': uP0=speed, uP1=tail, uP2=angle; uColor0=color
  comet: /* glsl */`
    precision mediump float;
    uniform float uTime;
    uniform float uAspect;
    uniform float uP[8];
    uniform vec3 uColor0;
    varying vec2 vUV;
    ${GLSL_HELPERS}
    void main() {
      float speed = uP[0];
      float tail = max(0.01, uP[1]);
      float angle = uP[2];
      float axisPos = dirT(vUV, uAspect, angle);
      float crossPos = dirT(vUV, uAspect, mod(angle + 90.0, 360.0));
      float crossDist = abs(crossPos - 0.5) * 2.0;
      float brightness = 0.0;
      float whiteBlend = 0.0;
      for (int i = 0; i < 2; i++) {
        float phaseOffset = float(i) * 0.5;
        float headPos = mod(uTime * speed + phaseOffset, 1.0);
        float behind = mod(axisPos - headPos + 1.0, 1.0);
        if (behind < tail) {
          float tailFall = exp(-behind * 7.0 / tail);
          float crossFade = exp(-crossDist * crossDist * 12.0);
          float b = tailFall * crossFade;
          if (b > brightness) {
            brightness = b;
            whiteBlend = pow(1.0 - clamp(behind / tail, 0.0, 1.0), 2.2);
          }
        }
      }
      float outerGlow = brightness * exp(-crossDist * crossDist * 3.0) * 0.15;
      brightness = clamp(brightness + outerGlow, 0.0, 1.0);
      vec3 white = vec3(1.0);
      vec3 col = vec3(
        (uColor0.r + (white.r - uColor0.r) * whiteBlend) * brightness,
        (uColor0.g + (white.g - uColor0.g) * whiteBlend) * brightness,
        (uColor0.b + (white.b - uColor0.b) * whiteBlend * 0.7) * brightness
      );
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  // 'explode': uP0=speed; uColor0=color
  explode: /* glsl */`
    precision mediump float;
    uniform float uTime;
    uniform float uAspect;
    uniform float uP[8];
    uniform vec3 uColor0;
    varying vec2 vUV;
    ${GLSL_HELPERS}
    void main() {
      float speed = uP[0];
      vec2 n = normCoords(vUV, uAspect);
      // JS normalises by columns/2 & rows/2 (i.e. half-extent = 1 in each axis);
      // our normCoords already centres on 0 with aspect on x, so scale y up to
      // match the same half-extent convention (rows/2 vs columns/2).
      float dist = length(vec2(n.x, n.y * 2.0));
      float angle = atan(n.y, n.x);
      float totalBurst = 0.0;
      float hotCycle = 0.0;
      for (int i = 0; i < 3; i++) {
        float phase = float(i) / 3.0;
        float cycle = mod(uTime * speed + phase, 1.0);
        float expandR = cycle * 1.5;
        float ring = abs(dist - expandR);
        float burst = max(0.0, 0.12 - ring) / 0.12;
        float spoke = 0.35 + 0.65 * max(0.0, cos(angle * 8.0 + expandR * 12.56637 + float(i) * 2.1));
        float contrib = burst * spoke;
        if (contrib > totalBurst) { totalBurst = contrib; hotCycle = cycle; }
      }
      float edgeFade = max(0.0, 1.0 - dist * 0.65);
      float hotness = hotCycle;
      vec3 col = vec3(
        min(1.0, (uColor0.r + (1.0 - uColor0.r) * hotness * 0.6) * totalBurst * edgeFade),
        min(1.0, (uColor0.g + (0.784 - uColor0.g) * hotness * 0.8) * totalBurst * edgeFade),
        max(0.0, uColor0.b * max(0.0, 1.0 - hotness * 2.0) * totalBurst * edgeFade)
      );
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  // 'breathing': uP0=speed, uP1=baseBrightness, uP2=pulseAmplitude, uP3=phaseOffset,
  //              uP4=shimmerIntensity; uColor0=color
  breathing: /* glsl */`
    precision mediump float;
    uniform float uTime;
    uniform float uAspect;
    uniform float uP[8];
    uniform vec3 uColor0;
    varying vec2 vUV;
    ${GLSL_HELPERS}
    void main() {
      float speed = uP[0];
      float baseBrightness = uP[1];
      float pulseAmplitude = uP[2];
      float phaseOffset = uP[3];
      float shimmerIntensity = uP[4];
      float wave = (sin((uTime * speed + phaseOffset) * 6.28318530718) + 1.0) * 0.5;
      float t6 = wave * wave * wave * (wave * (wave * 6.0 - 15.0) + 10.0);
      float warmShift = t6 * 0.06;
      // Map continuous UV back to an approximate grid-cell coordinate for the
      // shimmer hash so the pattern still reads as "per-cell" sparkle rather
      // than a smooth gradient (matches the CPU version's character).
      vec2 cellApprox = floor(vUV * vec2(48.0, 27.0));
      float spatial = 1.0 + (hash2(cellApprox.x, cellApprox.y) - 0.5) * shimmerIntensity * 0.12;
      float pulse = clamp((baseBrightness + t6 * pulseAmplitude) * spatial, 0.0, 1.0);
      float perceptualPulse = pow(pulse, 1.12);
      vec3 col = vec3(
        clamp((uColor0.r + warmShift * 0.157) * perceptualPulse, 0.0, 1.0),
        clamp(uColor0.g * perceptualPulse, 0.0, 1.0),
        clamp((uColor0.b - warmShift * 0.078) * perceptualPulse, 0.0, 1.0)
      );
      gl_FragColor = vec4(col, 1.0);
    }
  `
}

interface EffectParams {
  floats: number[]
  color0?: [number, number, number]
  color1?: [number, number, number]
}

function toUnit(hex: string): [number, number, number] {
  const c = hexToRgb(hex)
  return [c.r / 255, c.g / 255, c.b / 255]
}

/** Map a layer's named parameters into the generic uP[8] + color0/color1 slots. */
function paramsFor(layer: EffectLayer): EffectParams {
  const p = layer.parameters
  switch (layer.kind) {
    case 'rainbow':
      return { floats: [Number(p.speed ?? 0.35), Number(p.spread ?? 1.2), Number(p.hueShift ?? 0), Number(p.angle ?? 0)] }
    case 'wave':
      return { floats: [Number(p.speed ?? 0.5), Number(p.width ?? 0.35), Number(p.angle ?? 45)], color0: toUnit(String(p.color ?? '#00ccff')) }
    case 'zone-gradient':
      return { floats: [Number(p.angle ?? 45)], color0: toUnit(String(p.from ?? '#2cff9a')), color1: toUnit(String(p.to ?? '#ffcf40')) }
    case 'plasma':
      return { floats: [Number(p.speed ?? 0.40), Number(p.frequency ?? 3.0), Number(p.saturation ?? 1.0)] }
    case 'vortex':
      return { floats: [Number(p.speed ?? 0.50), Number(p.density ?? 5.0), Number(p.hueShift ?? 0)] }
    case 'tunnel':
      return { floats: [Number(p.speed ?? 0.60), Number(p.frequency ?? 6), Number(p.hueShift ?? 0)] }
    case 'neon-pulse':
      return { floats: [Number(p.speed ?? 0.50), Number(p.frequency ?? p.density ?? 3.0), Number(p.hueShift ?? 0)] }
    case 'spectrum':
      return { floats: [Number(p.speed ?? 0.25), Number(p.saturation ?? 0.95), Number(p.hueShift ?? 0), Number(p.spread ?? 1.0)] }
    case 'comet':
      return { floats: [Number(p.speed ?? 0.45), Number(p.tail ?? 0.35), Number(p.angle ?? 0)], color0: toUnit(String(p.color ?? '#ffffff')) }
    case 'explode':
      return { floats: [Number(p.speed ?? 0.4)], color0: toUnit(String(p.color ?? '#ff6020')) }
    case 'breathing':
      return {
        floats: [
          Number(p.speed ?? 0.45),
          Number(p.baseBrightness ?? 0.18),
          Number(p.pulseAmplitude ?? 0.62),
          Number(p.phaseOffset ?? 0),
          Number(p.shimmerIntensity ?? 0)
        ],
        color0: toUnit(String(p.color ?? '#ff4f87'))
      }
    default:
      return { floats: [] }
  }
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

export class EffectGl {
  private readonly gl: WebGLRenderingContext
  private programs = new Map<string, WebGLProgram>()
  private currentKind: string | null = null
  private currentProg: WebGLProgram | null = null
  private uTime: WebGLUniformLocation | null = null
  private uAspect: WebGLUniformLocation | null = null
  private uP: WebGLUniformLocation | null = null
  private uColor0: WebGLUniformLocation | null = null
  private uColor1: WebGLUniformLocation | null = null
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
      this.uP = gl.getUniformLocation(prog, 'uP')
      this.uColor0 = gl.getUniformLocation(prog, 'uColor0')
      this.uColor1 = gl.getUniformLocation(prog, 'uColor1')
      this.currentProg = prog
      this.currentKind = layer.kind
    } else {
      gl.useProgram(prog)
    }

    gl.uniform1f(this.uTime, now)
    gl.uniform1f(this.uAspect, this.canvasW > 0 && this.canvasH > 0 ? this.canvasW / this.canvasH : 1)
    const { floats, color0, color1 } = paramsFor(layer)
    if (this.uP) {
      const padded = new Float32Array(8)
      padded.set(floats.slice(0, 8))
      gl.uniform1fv(this.uP, padded)
    }
    if (this.uColor0 && color0) gl.uniform3f(this.uColor0, color0[0], color0[1], color0[2])
    if (this.uColor1 && color1) gl.uniform3f(this.uColor1, color1[0], color1[1], color1[2])

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

