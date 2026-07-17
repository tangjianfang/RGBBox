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
 * 4-float uniform layout) to a flexible per-effect uniform scheme: up to 12
 * generic floats (`uP[0..11]`) + up to 2 explicit colours (`uColor0`,
 * `uColor1`), covering the parameter shapes used across the CPU effect
 * catalogue.
 *
 * Batch 2 adds GLSL ports of `fbm2`/`valueNoise2` (fractal value noise),
 * `thermalColor`, `colorScale`/`colorAdd` (as `colorScale3`/`colorAdd3`) and
 * a custom `ss3()` smoothstep that matches `src/engine/effects.ts#smoothstep`
 * exactly for both ascending AND descending edge order (GLSL's built-in
 * `smoothstep` has undefined behaviour when edge0 > edge1, which several CPU
 * effects rely on for inverted falloffs).
 *
 * Batch 3 ports 7 more pure-formula effects using the same helpers (no new
 * helpers needed) — the remaining un-ported effects all need either grid
 * `columns`/`rows` uniforms (fire/crystal/lightning/lightning-leader), a
 * click-burst cross-frame uniform (ripple), or per-pixel loops over dozens of
 * sample points + icosahedron constants (icosahedral-virus/protein-folding/
 * mitosis-spindle/synapse-pulse/microvilli-field), deferred to a future batch.
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
 *    needs `columns`/`rows` threaded through as uniforms, not done yet.
 *  - icosahedral-virus / protein-folding / mitosis-spindle / synapse-pulse /
 *    microvilli-field: loop over tens of sample points per pixel with
 *    `pointSegmentDistance`/icosahedron constants — higher translation risk,
 *    deferred to a future batch.
 */

import { hexToRgb } from '../../../engine/color'
import type { EffectLayer } from '../../../shared/types'

export const EFFECT2D_CHANNEL = 'rgbbox-2d-effect'

export interface Effect2DMessage {
  layer: EffectLayer
  t: number
}

/** Effect kinds that have a GPU-direct shader implementation (grows over time). */
export const GPU_DIRECT_EFFECTS: ReadonlySet<string> = new Set([
  // Batch 1 (R37): pure trig/hue formulas, no noise dependency
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
  'breathing',
  // Batch 2 (R37): scientific 2D projections, some using fbm2 fractal noise
  'mirror-symmetry',
  'pulsar-beacon',
  'dna-helix',
  'nebula',
  'fluid-flow',
  'spiral-galaxy',
  'orion-nebula',
  'hurricane-eye',
  'quantum-collapse',
  'black-hole',
  // Batch 3 (R37): remaining pure-formula effects (no grid columns/rows
  // dependency, no loop-over-many-samples, no click/audio cross-frame state)
  'aurora',
  'eclipse-alignment',
  'comet-tail',
  'magnetosphere-aurora',
  'wave-diffraction',
  'vortex-flame',
  'tokamak-plasma'
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

  // Matches src/engine/effects.ts#smoothstep exactly, including the case
  // edge0 > edge1 (an inverted falloff) which several CPU effects rely on —
  // GLSL's built-in smoothstep() has undefined behaviour in that case.
  float ss3(float edge0, float edge1, float value) {
    float range = edge1 - edge0;
    float amount = clamp((value - edge0) / (abs(range) < 0.0001 ? 0.0001 : range), 0.0, 1.0);
    return amount * amount * (3.0 - 2.0 * amount);
  }

  // Matches src/engine/effects.ts#valueNoise2 / fbm2 (value noise + fractal sum).
  float valueNoise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = p - i;
    vec2 s = f * f * (3.0 - 2.0 * f);
    float a = hash2(i.x, i.y);
    float b = hash2(i.x + 1.0, i.y);
    float c = hash2(i.x, i.y + 1.0);
    float d = hash2(i.x + 1.0, i.y + 1.0);
    return a + (b - a) * s.x + (c - a) * s.y + (a - b - c + d) * s.x * s.y;
  }
  // octaves capped at 5 (max used by any ported effect); constant-bound loop
  // with an early break keeps this portable across WebGL1 drivers.
  float fbm2(vec2 p, int octaves) {
    float value = 0.0;
    float amplitude = 0.5;
    float scale = 1.0;
    float total = 0.0;
    for (int i = 0; i < 5; i++) {
      if (i >= octaves) break;
      value += valueNoise2(p * scale) * amplitude;
      total += amplitude;
      scale *= 2.02;
      amplitude *= 0.52;
    }
    return total > 0.0 ? value / total : 0.0;
  }

  // Matches src/engine/effects.ts#colorScale / colorAdd, but operating on 0..1
  // float colour (the shader's native space) instead of 0..255 bytes.
  vec3 colorScale3(vec3 c, float scale) {
    return clamp(c * scale, 0.0, 1.0);
  }
  vec3 colorAdd3(vec3 base, vec3 overlay, float scale) {
    return clamp(base + overlay * scale, 0.0, 1.0);
  }

  // Matches src/engine/effects.ts#thermalColor exactly.
  vec3 thermalColor(float temperature) {
    float heat = clamp(temperature, 0.0, 1.0);
    if (heat < 0.34) return hslToRgb(8.0 + heat * 50.0, 1.0, heat * 0.65);
    if (heat < 0.72) return hslToRgb(28.0 + heat * 25.0, 1.0, 0.22 + heat * 0.46);
    return hslToRgb(205.0 - heat * 70.0, 0.75, 0.58 + heat * 0.34);
  }
`

// ── Per-effect fragment shaders ──────────────────────────────────────────
// Each takes the same uniform set (uTime, uAspect, uP[0..11], uColor0, uColor1)
// so the driver class below doesn't need per-effect uniform plumbing beyond
// this table. `paramsFor()` maps each layer's named parameters into this
// generic slot layout.
const EFFECT_FS: Record<string, string> = {
  // 'rainbow': uP0=speed, uP1=spread, uP2=hueShift, uP3=angle
  rainbow: /* glsl */`
    precision mediump float;
    uniform float uTime;
    uniform float uAspect;
    uniform float uP[12];
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
    uniform float uP[12];
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
    uniform float uP[12];
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
    uniform float uP[12];
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
    uniform float uP[12];
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
    uniform float uP[12];
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
    uniform float uP[12];
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
    uniform float uP[12];
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
    uniform float uP[12];
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
    uniform float uP[12];
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
    uniform float uP[12];
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
  `,

  // ── Batch 2 (R37): scientific 2D projections ──────────────────────────

  // 'mirror-symmetry': uP0=speed, uP1=frequency, uP2=hueShift, uP3=intensity, uP4=angle
  'mirror-symmetry': /* glsl */`
    precision mediump float;
    uniform float uTime;
    uniform float uAspect;
    uniform float uP[12];
    varying vec2 vUV;
    ${GLSL_HELPERS}
    void main() {
      float speed = uP[0];
      float frequency = uP[1];
      float hueShift = uP[2];
      float intensity = uP[3];
      float angleDeg = uP[4];
      float rad = radians(angleDeg);
      vec2 n0 = normCoords(vUV, uAspect);
      float nx = n0.x * cos(rad) - n0.y * sin(rad);
      float ny = n0.x * sin(rad) + n0.y * cos(rad);
      float ax = abs(nx);
      float ay = abs(ny);
      float t = uTime * speed;
      float radial = sqrt(ax * ax + ay * ay);
      float petals = sin(atan(ay, ax) * frequency + radial * 9.0 - t * 3.0) * 0.5 + 0.5;
      float lattice = sin((ax + ay) * frequency * 6.28318530718 - t * 4.0) * 0.5 + 0.5;
      float glow = pow(petals * 0.65 + lattice * 0.35, 3.0) * exp(-radial * 0.7);
      float hue = mod(hueShift + radial * 180.0 + petals * 70.0 + t * 48.0 + 720.0, 360.0);
      vec3 col = hslToRgb(hue, 1.0, clamp(glow * intensity * 0.72, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  // 'pulsar-beacon': uP0=speed, uP1=intensity, uP2=density, uP3=hueShift
  'pulsar-beacon': /* glsl */`
    precision mediump float;
    uniform float uTime;
    uniform float uAspect;
    uniform float uP[12];
    varying vec2 vUV;
    ${GLSL_HELPERS}
    void main() {
      float speed = uP[0];
      float intensity = uP[1];
      float density = uP[2];
      float hueShift = uP[3];
      vec2 n = normCoords(vUV, uAspect);
      float time = uTime * speed;
      float radius = length(n);
      float angle = atan(n.y, n.x);
      float beamAngle = time * 6.28318530718;
      float angleDistance = abs(atan(sin(angle - beamAngle), cos(angle - beamAngle)));
      float oppositeDistance = abs(atan(sin(angle - beamAngle - 3.14159265), cos(angle - beamAngle - 3.14159265)));
      float beamWidth = 0.18 + density * 0.18;
      float beam = exp(-pow(min(angleDistance, oppositeDistance) / beamWidth, 2.0)) * ss3(0.03, 0.62, radius) * ss3(0.90, 0.12, radius);
      float pulse = pow(0.5 + 0.5 * cos(time * 6.28318530718), 12.0);
      float core = exp(-radius * radius * 95.0) * (0.6 + pulse * 0.9);
      float halo = exp(-radius * 5.2) * 0.22;
      vec3 col = colorScale3(hslToRgb(214.0 + hueShift, 0.92, 0.62), (beam + halo) * intensity);
      col = colorAdd3(col, vec3(1.0), core * intensity);
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  // 'dna-helix': uP0=speed, uP1=intensity, uP2=density, uP3=hueShift
  'dna-helix': /* glsl */`
    precision mediump float;
    uniform float uTime;
    uniform float uAspect;
    uniform float uP[12];
    varying vec2 vUV;
    ${GLSL_HELPERS}
    void main() {
      float speed = uP[0];
      float intensity = uP[1];
      float density = uP[2];
      float hueShift = uP[3];
      vec2 n = normCoords(vUV, uAspect);
      float normalizedX = n.x / max(0.0001, uAspect) + 0.5;
      float normalizedY = n.y + 0.5;
      float time = uTime * speed;
      float turns = 3.2 + density * 2.2;
      float phase = normalizedY * turns * 6.28318530718 - time * 6.28318530718;
      float radius = 0.18 + density * 0.07;
      float strandA = 0.5 + cos(phase) * radius;
      float strandB = 0.5 - cos(phase) * radius;
      float depthA = 0.55 + sin(phase) * 0.35;
      float depthB = 0.55 - sin(phase) * 0.35;
      float width = 0.018 + density * 0.01;
      float chainA = exp(-pow((normalizedX - strandA) / width, 2.0)) * depthA;
      float chainB = exp(-pow((normalizedX - strandB) / width, 2.0)) * depthB;
      float rungPhase = abs(sin(normalizedY * turns * 3.14159265));
      float loStrand = min(strandA, strandB);
      float hiStrand = max(strandA, strandB);
      float betweenChains = ss3(loStrand, hiStrand, normalizedX) * ss3(hiStrand, loStrand, normalizedX);
      float basePair = exp(-pow(rungPhase / 0.18, 2.0)) * betweenChains * (0.45 + 0.35 * sin(time * 7.0 + normalizedY * 37.0));
      vec3 col = vec3(0.0);
      col = colorAdd3(col, hslToRgb(178.0 + hueShift, 0.95, 0.50), chainA * intensity);
      col = colorAdd3(col, hslToRgb(214.0 + hueShift, 0.90, 0.46), chainB * intensity);
      col = colorAdd3(col, hslToRgb(36.0 + hueShift, 1.0, 0.62), basePair * intensity);
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  // 'nebula': uP0=speed, uP1=intensity, uP2=density, uP3=hueShift, uP4=colorSpread
  nebula: /* glsl */`
    precision mediump float;
    uniform float uTime;
    uniform float uAspect;
    uniform float uP[12];
    varying vec2 vUV;
    ${GLSL_HELPERS}
    void main() {
      float speed = uP[0];
      float intensity = uP[1];
      float density = uP[2];
      float hueShift = uP[3];
      float colorSpread = uP[4];
      vec2 n = normCoords(vUV, uAspect);
      float t = uTime * speed;
      float radius = length(n);
      // R41 fix: the CPU original used atan(y,x)/pi ("swirl") directly as a
      // linear hue/warp offset. atan2 has a branch cut at angle=±pi (screen
      // left, y≈0) where it jumps by 2 (from 1 to -1) — at full GPU pixel
      // resolution this shows up as a hard visible seam (reported: "looks
      // misaligned on the left"). sin(angle) == n.y/radius has the exact
      // same -1..1 range and similar per-angle variation but is perfectly
      // continuous around the full circle (no branch cut), so it's a
      // seamless drop-in replacement for "swirl" here.
      float swirl = n.y / max(0.02, radius);
      float warpX = n.x + sin(n.y * 4.0 + t * 1.4) * 0.18 + swirl * 0.08 + sin(radius * 6.0 + t * 0.7) * 0.06;
      float warpY = n.y + cos(n.x * 3.2 - t * 1.1) * 0.18 - radius * 0.12 + cos(radius * 5.0 - t * 0.5) * 0.05;
      float cloud = fbm2(vec2(warpX * 3.0 + t * 0.7, warpY * 3.0 - t * 0.45), 5);
      float fineDetail = fbm2(vec2(warpX * 8.0 - t * 0.3, warpY * 8.0 + t * 0.2), 4) * 0.3;
      // Grid x/y indices aren't available in this continuous-UV shader; a fine,
      // stable pixel-cell approximation keeps the same "rare sparkle" character.
      vec2 cellApprox = floor(vUV * vec2(220.0, 140.0));
      float starSeed = hash2(cellApprox.x * 11.0 + floor(t * 8.0), cellApprox.y * 17.0);
      float stars = pow(starSeed, 38.0) * 3.0;
      float coreEmission = exp(-radius * radius * (2.4 - density)) * (0.6 + sin(t * 1.2) * 0.12);
      float veil = clamp((cloud + fineDetail - (0.52 - density * 0.22)) * 2.6, 0.0, 1.0);
      float brightness = clamp((veil * 0.65 + coreEmission * 0.35) * intensity + stars, 0.0, 1.0);
      float cloudHue = mod(hueShift + cloud * colorSpread + swirl * 45.0 + t * 35.0 + 720.0, 360.0);
      float coreHue = mod(hueShift + 40.0 + t * 20.0 + 720.0, 360.0);
      float coreWeight = coreEmission / max(0.01, veil + coreEmission);
      float hue = cloudHue * (1.0 - coreWeight * 0.4) + coreHue * coreWeight * 0.4;
      float emissionBoost = pow(coreEmission, 2.5) * 0.15;
      vec3 col = hslToRgb(hue, 0.97, clamp(brightness * 0.64 + emissionBoost, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  // 'fluid-flow': uP0=speed, uP1=intensity, uP2=frequency, uP3=hueShift, uP4=spread
  'fluid-flow': /* glsl */`
    precision mediump float;
    uniform float uTime;
    uniform float uAspect;
    uniform float uP[12];
    varying vec2 vUV;
    ${GLSL_HELPERS}
    void main() {
      float speed = uP[0];
      float intensity = uP[1];
      float frequency = uP[2];
      float hueShift = uP[3];
      float spread = uP[4];
      vec2 n = normCoords(vUV, uAspect);
      float t = uTime * speed;
      float field = fbm2(vec2(n.x * frequency + t * 0.9, n.y * frequency - t * 0.55), 4);
      float angle = field * 6.28318530718 + t * 0.8;
      float flowX = n.x + cos(angle) * 0.22 * spread;
      float flowY = n.y + sin(angle) * 0.22 * spread;
      float strand = sin((flowX * 5.5 + flowY * 3.2 + fbm2(vec2(flowX * 7.0, flowY * 7.0), 3) * 2.8 - t * 2.4) * 3.14159265);
      float ribbon = pow(max(0.0, strand), 2.6);
      float foam = pow(max(0.0, fbm2(vec2(flowX * 14.0 - t, flowY * 14.0 + t * 0.7), 3)), 3.2);
      float brightness = clamp((ribbon * 0.78 + foam * 0.24) * intensity, 0.0, 1.0);
      float hue = mod(hueShift + field * 90.0 + flowX * 60.0 + t * 26.0 + 720.0, 360.0);
      vec3 col = hslToRgb(hue, 0.92, brightness * 0.68);
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  // 'spiral-galaxy': uP0=speed, uP1=intensity, uP2=density, uP3=hueShift
  'spiral-galaxy': /* glsl */`
    precision mediump float;
    uniform float uTime;
    uniform float uAspect;
    uniform float uP[12];
    varying vec2 vUV;
    ${GLSL_HELPERS}
    void main() {
      float speed = uP[0];
      float intensity = uP[1];
      float density = uP[2];
      float hueShift = uP[3];
      vec2 n = normCoords(vUV, uAspect);
      float t = uTime * speed;
      float radius = length(n);
      float angle = atan(n.y, n.x);
      float armPhase = angle * 4.0 - log(radius + 0.04) * (3.4 + density * 2.2) + t * 1.5;
      float arm = pow(0.5 + 0.5 * cos(armPhase), 7.0);
      float disk = exp(-radius * (2.1 - density * 0.6));
      float bulge = exp(-radius * radius * 38.0);
      float dustLane = ss3(0.48, 0.20, fbm2(vec2(n.x * 7.0 - t, n.y * 7.0 + t * 0.5), 4));
      vec2 cellApprox = floor(vUV * vec2(220.0, 140.0));
      float stars = pow(hash2(cellApprox.x * 13.0 + floor(t * 9.0), cellApprox.y * 19.0), 30.0) * ss3(0.78, 0.12, radius);
      float brightness = clamp((arm * disk * 0.72 + bulge * 0.58 + stars * 1.4) * intensity * (0.72 + dustLane * 0.45), 0.0, 1.0);
      float hue = 218.0 + hueShift + arm * 58.0 - radius * 70.0;
      vec3 col = hslToRgb(hue, 0.82, brightness * 0.72);
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  // 'orion-nebula': uP0=speed, uP1=intensity, uP2=density, uP3=hueShift
  'orion-nebula': /* glsl */`
    precision mediump float;
    uniform float uTime;
    uniform float uAspect;
    uniform float uP[12];
    varying vec2 vUV;
    ${GLSL_HELPERS}
    void main() {
      float speed = uP[0];
      float intensity = uP[1];
      float density = uP[2];
      float hueShift = uP[3];
      vec2 n = normCoords(vUV, uAspect);
      float t = uTime * speed;
      float cloud = fbm2(vec2(n.x * 3.4 + t * 0.35, n.y * 3.4 - t * 0.25), 5);
      float fineDust = fbm2(vec2(n.x * 11.0 - t * 0.22, n.y * 11.0 + t * 0.18), 4);
      float radius = length(vec2(n.x + 0.05, n.y - 0.02));
      float molecularCloud = clamp((cloud - (0.42 - density * 0.14)) * 2.2, 0.0, 1.0);
      float darkDust = ss3(0.58, 0.86, fineDust) * ss3(0.62, 0.16, radius);
      vec2 cellApprox = floor(vUV * vec2(220.0, 140.0));
      float starSeed = hash2(cellApprox.x * 31.0, cellApprox.y * 47.0);
      float stars = starSeed > 0.985 ? pow(starSeed, 18.0) : 0.0;
      float emission = clamp((molecularCloud * 0.72 + exp(-radius * radius * 5.5) * 0.34 - darkDust * 0.45) * intensity + stars, 0.0, 1.0);
      float hue = hueShift + cloud * 72.0 + fineDust * 32.0;
      vec3 col = hslToRgb(hue, 0.86, emission * 0.66);
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  // 'hurricane-eye': uP0=speed, uP1=intensity, uP2=density, uP3=hueShift
  'hurricane-eye': /* glsl */`
    precision mediump float;
    uniform float uTime;
    uniform float uAspect;
    uniform float uP[12];
    varying vec2 vUV;
    ${GLSL_HELPERS}
    void main() {
      float speed = uP[0];
      float intensity = uP[1];
      float density = uP[2];
      float hueShift = uP[3];
      vec2 n = normCoords(vUV, uAspect);
      float t = uTime * speed;
      float radius = length(n);
      float angle = atan(n.y, n.x);
      float spiral = angle + radius * (9.0 + density * 6.0) - t * 3.2;
      // R41 fix: CPU original multiplied the wrapped angle by 2.7 (non-integer)
      // before sin(), which creates a hard seam at angle=±pi (screen left)
      // once rendered continuously at full GPU resolution — a non-integer
      // multiple of a value that jumps by 2*pi never lines back up. Using an
      // integer coefficient (3.0 instead of 2.7, ~11% denser bands, visually
      // indistinguishable) keeps sin(spiral*3.0+...) perfectly continuous
      // around the full circle.
      float bands = pow(0.5 + 0.5 * sin(spiral * 3.0 + fbm2(vec2(n.x * 5.0, n.y * 5.0), 3) * 2.0), 3.4);
      float eye = ss3(0.13, 0.06, radius);
      float eyeWall = exp(-pow((radius - 0.16) / 0.045, 2.0));
      float cloudFalloff = ss3(0.72, 0.12, radius);
      float cloud = clamp((bands * cloudFalloff * 0.72 + eyeWall * 0.92 - eye * 0.64) * intensity, 0.0, 1.0);
      vec3 col = colorScale3(hslToRgb(205.0 + hueShift, 0.35, 0.58), cloud);
      col = colorAdd3(col, hslToRgb(48.0, 0.95, 0.72), eye * 0.32);
      col = colorAdd3(col, vec3(1.0), eyeWall * intensity * 0.65);
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  // 'quantum-collapse': uP0=speed, uP1=intensity, uP2=density, uP3=hueShift
  'quantum-collapse': /* glsl */`
    precision mediump float;
    uniform float uTime;
    uniform float uAspect;
    uniform float uP[12];
    varying vec2 vUV;
    ${GLSL_HELPERS}
    void main() {
      float speed = uP[0];
      float intensity = uP[1];
      float density = uP[2];
      float hueShift = uP[3];
      vec2 n = normCoords(vUV, uAspect);
      float t = uTime * speed;
      float cycle = t - floor(t);
      float radiusA = length(vec2(n.x + 0.24, n.y));
      float radiusB = length(vec2(n.x - 0.24, n.y));
      float phase = (radiusA - radiusB) * (24.0 + density * 18.0) - t * 9.0;
      float interference = pow(0.5 + 0.5 * cos(phase), 5.0) * ss3(0.78, 0.06, length(n));
      float collapse = ss3(0.58, 0.86, cycle);
      float ft = floor(t);
      float focusX = sin(ft * 2.17) * 0.18;
      float focusY = cos(ft * 1.61) * 0.12;
      float focus = exp(-((n.x - focusX) * (n.x - focusX) + (n.y - focusY) * (n.y - focusY)) / (0.008 + (1.0 - collapse) * 0.05));
      float probabilityCloud = fbm2(vec2(n.x * 5.0 + t * 0.4, n.y * 5.0 - t * 0.35), 4) * (1.0 - collapse);
      float brightness = clamp((interference * (1.0 - collapse * 0.7) + focus * collapse * 1.35 + probabilityCloud * 0.22) * intensity, 0.0, 1.0);
      float hue = hueShift + interference * 90.0 + collapse * 48.0;
      vec3 col = hslToRgb(hue, 0.92, brightness * 0.68);
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  // 'black-hole': uP0=speed, uP1=intensity, uP2=density, uP3=hueShift
  'black-hole': /* glsl */`
    precision mediump float;
    uniform float uTime;
    uniform float uAspect;
    uniform float uP[12];
    varying vec2 vUV;
    ${GLSL_HELPERS}
    void main() {
      float speed = uP[0];
      float intensity = uP[1];
      float density = uP[2];
      float hueShift = uP[3];
      vec2 n = normCoords(vUV, uAspect);
      float time = uTime * speed;
      float diskY = n.y * 2.45;
      float radius = length(vec2(n.x, diskY));
      float angle = atan(diskY, n.x);
      float eventHorizon = ss3(0.11, 0.06, radius);
      float diskMask = ss3(0.72, 0.12, radius) * ss3(0.07, 0.18, radius);
      float keplerTwist = angle * 2.0 + 1.7 / max(0.08, radius) - time * (1.2 + 2.2 / max(0.2, radius));
      float spiralBands = pow(0.5 + 0.5 * sin(keplerTwist * 3.0), 2.4);
      float turbulence = fbm2(vec2(n.x * 5.2 + time * 0.7, diskY * 4.0 - time * 0.35), 4);
      float temperature = diskMask * clamp((0.82 - radius) * (1.4 + density) + spiralBands * 0.42 + turbulence * 0.30, 0.0, 1.0);
      float lensRing = exp(-pow((radius - 0.145) / 0.025, 2.0)) * 0.85;
      float jet = exp(-pow(n.x / 0.045, 2.0)) * ss3(0.03, 0.46, abs(n.y)) * ss3(0.62, 0.16, abs(n.y)) * 0.55;
      vec3 col = colorScale3(thermalColor(temperature), intensity);
      col = colorAdd3(col, hslToRgb(210.0 + hueShift, 0.85, 0.72), lensRing * intensity);
      col = colorAdd3(col, hslToRgb(192.0 + hueShift, 1.0, 0.62), jet * intensity);
      if (eventHorizon > 0.5) col = vec3(0.0, 0.0, 0.0078);
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  // ── Batch 3 (R37): remaining pure-formula effects ─────────────────────

  // 'aurora': uP0=speed, uP1=intensity, uP2=hueShift, uP3=curtainHeight,
  //           uP4=ribbonFrequency, uP5=shimmerIntensity, uP6=baseHue, uP7=colorSpread, uP8=softEdge
  aurora: /* glsl */`
    precision mediump float;
    uniform float uTime;
    uniform float uP[12];
    varying vec2 vUV;
    ${GLSL_HELPERS}
    void main() {
      float speed = uP[0];
      float intensity = uP[1];
      float hueShift = uP[2];
      float curtainHeight = uP[3];
      float ribbonFrequency = uP[4];
      float shimmerIntensity = uP[5];
      float baseHue = uP[6];
      float colorSpread = uP[7];
      float softEdge = uP[8];
      float hFraction = vUV.x;
      float vFraction = vUV.y;
      float curtainRaw = clamp(1.0 - vFraction * (1.4 / max(0.1, curtainHeight)), 0.0, 1.0);
      float curtainPow = max(0.25, softEdge);
      float curtain = curtainRaw * curtainRaw * curtainRaw * (curtainRaw * (curtainRaw * 6.0 - 15.0) + 10.0) * pow(curtainRaw, curtainPow * 0.3);
      float t = uTime * speed;
      float phaseModA = sin(t * 0.31 + hFraction * 2.1) * 1.4;
      float phaseModB = cos(t * 0.47 + hFraction * 1.6) * 0.9;
      float w1 = sin(hFraction * 3.14159265 * 2.7 * ribbonFrequency + t * 0.9 + phaseModA) * 0.5 + 0.5;
      float w2 = sin(hFraction * 3.14159265 * 5.1 * ribbonFrequency - t * 1.4 + phaseModB) * 0.5 + 0.5;
      float depthLayer = sin(hFraction * 3.14159265 * 7.4 * ribbonFrequency + t * 1.8 + vFraction * 3.5) * 0.3 + 0.3;
      float w4 = cos(hFraction * 3.14159265 * 3.3 - t * 0.5) * 0.5 + 0.5;
      vec2 cellApprox = floor(vUV * vec2(220.0, 140.0));
      float grain = hash2(cellApprox.x + floor(t * 14.0), cellApprox.y + floor(t * 22.0));
      float shimmer = (depthLayer * 0.6 + grain * 0.4) * shimmerIntensity;
      float blended = w1 * 0.34 + w2 * 0.26 + shimmer * 0.16 + w4 * 0.18 + depthLayer * 0.06;
      float edgeDist = abs(hFraction - 0.5) * 2.0;
      float depthHueShift = vFraction * 15.0;
      float hue = mod(baseHue + blended * colorSpread + edgeDist * colorSpread * 0.62 + depthHueShift + hueShift + 720.0, 360.0);
      float topRim = exp(-vFraction * 12.0) * 0.35;
      float brightness = curtain * intensity * (0.35 + blended * 0.55) * (0.65 + w4 * 0.35);
      float finalL = min(0.88, pow(brightness * 0.75 + topRim * curtain, 1.05));
      vec3 col = hslToRgb(hue, 0.96, finalL);
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  // 'eclipse-alignment': uP0=speed, uP1=intensity, uP2=density, uP3=hueShift
  'eclipse-alignment': /* glsl */`
    precision mediump float;
    uniform float uTime;
    uniform float uAspect;
    uniform float uP[12];
    varying vec2 vUV;
    ${GLSL_HELPERS}
    void main() {
      float speed = uP[0];
      float intensity = uP[1];
      float density = uP[2];
      float hueShift = uP[3];
      vec2 n = normCoords(vUV, uAspect);
      float time = uTime * speed;
      float moonX = sin(time * 6.28318530718) * 0.34;
      float moonY = sin(time * 12.56637061436 + 0.7) * 0.045;
      float sunR = length(n);
      float moonR = length(n - vec2(moonX, moonY));
      float sunDisk = ss3(0.34, 0.31, sunR);
      float moonDisk = ss3(0.32, 0.29, moonR);
      float corona = exp(-pow((sunR - 0.34) / (0.085 + density * 0.04), 2.0)) * (0.55 + fbm2(vec2(n.x * 9.0 - time, n.y * 9.0 + time), 4) * 0.55);
      float diamond = exp(-pow(moonR - 0.31, 2.0) / 0.0007) * exp(-pow(sunR - 0.34, 2.0) / 0.0009);
      vec3 col = colorScale3(hslToRgb(42.0 + hueShift, 1.0, 0.58), sunDisk * (1.0 - moonDisk) * intensity);
      col = colorAdd3(col, hslToRgb(210.0 + hueShift, 0.68, 0.72), corona * intensity * ss3(0.32, 0.05, abs(moonX)));
      col = colorAdd3(col, vec3(1.0), diamond * intensity * 0.68);
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  // 'comet-tail': uP0=speed, uP1=intensity, uP2=density, uP3=hueShift
  'comet-tail': /* glsl */`
    precision mediump float;
    uniform float uTime;
    uniform float uAspect;
    uniform float uP[12];
    varying vec2 vUV;
    ${GLSL_HELPERS}
    void main() {
      float speed = uP[0];
      float intensity = uP[1];
      float density = uP[2];
      float hueShift = uP[3];
      vec2 n = normCoords(vUV, uAspect);
      float time = uTime * speed;
      float orbitAngle = time * 6.28318530718;
      float headX = cos(orbitAngle) * 0.46;
      float headY = sin(orbitAngle) * 0.26;
      float awayLen = max(0.001, length(vec2(headX, headY)));
      float awayX = headX / awayLen;
      float awayY = headY / awayLen;
      float relX = n.x - headX;
      float relY = n.y - headY;
      float tailAxis = relX * awayX + relY * awayY;
      float crossDist = abs(relX * awayY - relY * awayX);
      float tail = exp(-tailAxis * (3.0 - density)) * exp(-pow(crossDist / (0.055 + tailAxis * 0.12), 2.0)) * ss3(0.0, 0.08, tailAxis);
      float ionTail = exp(-tailAxis * 2.2) * exp(-pow(crossDist / 0.032, 2.0)) * ss3(0.02, 0.12, tailAxis);
      float nucleus = exp(-((relX * relX + relY * relY) / 0.003));
      vec3 col = colorScale3(hslToRgb(38.0 + hueShift, 0.86, 0.62), tail * intensity * 0.56);
      col = colorAdd3(col, hslToRgb(196.0 + hueShift, 0.95, 0.58), ionTail * intensity * 0.78);
      col = colorAdd3(col, vec3(1.0), nucleus * intensity);
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  // 'magnetosphere-aurora': uP0=speed, uP1=intensity, uP2=density, uP3=hueShift
  'magnetosphere-aurora': /* glsl */`
    precision mediump float;
    uniform float uTime;
    uniform float uAspect;
    uniform float uP[12];
    varying vec2 vUV;
    ${GLSL_HELPERS}
    void main() {
      float speed = uP[0];
      float intensity = uP[1];
      float density = uP[2];
      float hueShift = uP[3];
      vec2 n = normCoords(vUV, uAspect);
      float time = uTime * speed;
      float radius = length(n);
      float earth = ss3(0.16, 0.13, radius);
      float theta = atan(n.y, n.x);
      float dipoleR = 0.20 / max(0.08, sin(theta) * sin(theta) + 0.18);
      float fieldLine = exp(-pow((radius - dipoleR) / (0.018 + density * 0.01), 2.0)) * ss3(0.72, 0.18, radius);
      float bowShock = exp(-pow((length(vec2(n.x + 0.34, n.y * 0.72)) - 0.52) / 0.035, 2.0)) * ss3(-0.18, -0.65, n.x);
      float auroraOval = exp(-pow((radius - 0.20) / 0.018, 2.0)) * pow(abs(sin(theta)), 2.6);
      float solarWind = pow(0.5 + 0.5 * sin((n.x * 12.0 + time * 8.0 + fbm2(vec2(n.x * 5.0, n.y * 5.0), 3) * 2.0) * 3.14159265), 3.0) * ss3(0.62, -0.48, n.x) * 0.18;
      vec3 col = colorScale3(hslToRgb(210.0 + hueShift, 0.72, 0.42), fieldLine * intensity * 0.36);
      col = colorAdd3(col, hslToRgb(128.0 + hueShift, 0.96, 0.58), auroraOval * intensity);
      col = colorAdd3(col, hslToRgb(194.0 + hueShift, 0.86, 0.56), bowShock * intensity * 0.52);
      col = colorAdd3(col, hslToRgb(36.0 + hueShift, 0.80, 0.52), earth * intensity * 0.58 + solarWind * intensity);
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  // 'wave-diffraction': uP0=speed, uP1=intensity, uP2=density, uP3=hueShift
  'wave-diffraction': /* glsl */`
    precision mediump float;
    uniform float uTime;
    uniform float uAspect;
    uniform float uP[12];
    varying vec2 vUV;
    ${GLSL_HELPERS}
    void main() {
      float speed = uP[0];
      float intensity = uP[1];
      float density = uP[2];
      float hueShift = uP[3];
      vec2 n = normCoords(vUV, uAspect);
      float time = uTime * speed;
      float wavelength = 18.0 + density * 14.0;
      float barrier = exp(-pow((n.x + 0.12) / 0.012, 2.0)) * (1.0 - exp(-pow((abs(n.y) - 0.16) / 0.045, 2.0)));
      vec2 slitA = vec2(-0.12, -0.16);
      vec2 slitB = vec2(-0.12, 0.16);
      float incident = pow(0.5 + 0.5 * sin((n.x + time) * wavelength), 5.0) * ss3(-0.12, -0.68, n.x);
      float distanceA = length(n - slitA);
      float distanceB = length(n - slitB);
      float waveA = sin(distanceA * wavelength - time * 9.0);
      float waveB = sin(distanceB * wavelength - time * 9.0);
      float interference = pow(abs((waveA + waveB) * 0.5), 4.0) * ss3(-0.08, 0.55, n.x);
      float slitGlow = exp(-pow(distanceA / 0.05, 2.0)) + exp(-pow(distanceB / 0.05, 2.0));
      vec3 col = colorScale3(hslToRgb(204.0 + hueShift, 0.86, 0.50), (incident + interference) * intensity * 0.62);
      col = colorAdd3(col, hslToRgb(46.0 + hueShift, 1.0, 0.58), slitGlow * intensity * 0.34);
      col = colorAdd3(col, vec3(0.22), barrier * intensity);
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  // 'vortex-flame': uP0=speed, uP1=intensity, uP2=density, uP3=hueShift
  'vortex-flame': /* glsl */`
    precision mediump float;
    uniform float uTime;
    uniform float uAspect;
    uniform float uP[12];
    varying vec2 vUV;
    ${GLSL_HELPERS}
    void main() {
      float speed = uP[0];
      float intensity = uP[1];
      float density = uP[2];
      float hueShift = uP[3];
      vec2 n = normCoords(vUV, uAspect);
      float time = uTime * speed;
      float yNorm = n.y + 0.5;
      float taper = 0.08 + yNorm * (0.35 + density * 0.16);
      float swirlCenter = sin(yNorm * 8.0 - time * 5.0) * (0.10 + yNorm * 0.10);
      float radius = abs(n.x - swirlCenter) / max(0.03, taper);
      float angle = atan(yNorm * 1.6, n.x - swirlCenter);
      float helix = pow(0.5 + 0.5 * sin(angle * 5.0 + yNorm * 26.0 - time * 9.0 + fbm2(vec2(n.x * 6.0, n.y * 6.0), 3) * 2.0), 3.0);
      float plume = ss3(1.25, 0.12, radius) * ss3(0.02, 0.95, yNorm);
      vec2 cellApprox = floor(vUV * vec2(220.0, 140.0));
      float ember = pow(hash2(cellApprox.x * 5.0 + floor(time * 28.0), cellApprox.y * 7.0), 18.0) * ss3(0.8, 0.12, radius);
      float temperature = clamp((plume * (0.45 + helix * 0.8) + ember * 0.8) * intensity, 0.0, 1.0);
      vec3 col = colorAdd3(thermalColor(temperature), hslToRgb(210.0 + hueShift, 0.8, 0.45), plume * (1.0 - yNorm) * 0.16);
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  // 'tokamak-plasma': uP0=speed, uP1=intensity, uP2=density, uP3=hueShift
  'tokamak-plasma': /* glsl */`
    precision mediump float;
    uniform float uTime;
    uniform float uAspect;
    uniform float uP[12];
    varying vec2 vUV;
    ${GLSL_HELPERS}
    void main() {
      float speed = uP[0];
      float intensity = uP[1];
      float density = uP[2];
      float hueShift = uP[3];
      vec2 n = normCoords(vUV, uAspect);
      float time = uTime * speed;
      float radius = length(vec2(n.x / 0.78, n.y / 0.42));
      float torus = exp(-pow((radius - 0.55) / (0.09 + density * 0.025), 2.0));
      float angle = atan(n.y / 0.42, n.x / 0.78);
      float magneticLine = pow(0.5 + 0.5 * sin(angle * 9.0 + radius * 18.0 - time * 9.0), 5.0);
      float plasmaNoise = fbm2(vec2(n.x * 10.0 + time * 2.0, n.y * 10.0 - time), 4);
      float hotCore = exp(-pow(radius / 0.34, 2.0)) * 0.36;
      float limiter = exp(-pow((radius - 0.72) / 0.018, 2.0)) * 0.18;
      float brightness = clamp((torus * (0.46 + magneticLine * 0.72 + plasmaNoise * 0.28) + hotCore + limiter) * intensity, 0.0, 1.0);
      float hue = hueShift + magneticLine * 86.0 - radius * 45.0 + plasmaNoise * 32.0;
      vec3 col = hslToRgb(hue, 0.96, brightness * 0.68);
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
    case 'mirror-symmetry':
      return {
        floats: [
          Number(p.speed ?? 0.34),
          Number(p.frequency ?? 5.0),
          Number(p.hueShift ?? 310),
          Number(p.intensity ?? 0.86),
          Number(p.angle ?? 45)
        ]
      }
    case 'pulsar-beacon':
      return { floats: [Number(p.speed ?? 0.82), Number(p.intensity ?? 0.90), Number(p.density ?? 0.55), Number(p.hueShift ?? 0)] }
    case 'dna-helix':
      return { floats: [Number(p.speed ?? 0.36), Number(p.intensity ?? 0.88), Number(p.density ?? 0.58), Number(p.hueShift ?? 0)] }
    case 'nebula':
      return {
        floats: [
          Number(p.speed ?? 0.28),
          Number(p.intensity ?? 0.85),
          Number(p.density ?? 0.62),
          Number(p.hueShift ?? 250),
          Number(p.colorSpread ?? 130)
        ]
      }
    case 'fluid-flow':
      return {
        floats: [
          Number(p.speed ?? 0.38),
          Number(p.intensity ?? 0.82),
          Number(p.frequency ?? 4.2),
          Number(p.hueShift ?? 185),
          Number(p.spread ?? 1.35)
        ]
      }
    case 'spiral-galaxy':
      return { floats: [Number(p.speed ?? 0.20), Number(p.intensity ?? 0.90), Number(p.density ?? 0.64), Number(p.hueShift ?? 0)] }
    case 'orion-nebula':
      return { floats: [Number(p.speed ?? 0.16), Number(p.intensity ?? 0.82), Number(p.density ?? 0.58), Number(p.hueShift ?? 285)] }
    case 'hurricane-eye':
      return { floats: [Number(p.speed ?? 0.32), Number(p.intensity ?? 0.84), Number(p.density ?? 0.58), Number(p.hueShift ?? 0)] }
    case 'quantum-collapse':
      return { floats: [Number(p.speed ?? 0.34), Number(p.intensity ?? 0.88), Number(p.density ?? 0.60), Number(p.hueShift ?? 260)] }
    case 'black-hole':
      return { floats: [Number(p.speed ?? 0.34), Number(p.intensity ?? 0.92), Number(p.density ?? 0.62), Number(p.hueShift ?? 0)] }
    case 'aurora':
      return {
        floats: [
          Number(p.speed ?? 0.12),
          Number(p.intensity ?? 0.88),
          Number(p.hueShift ?? 0),
          Number(p.curtainHeight ?? 1.0),
          Number(p.ribbonFrequency ?? 1.0),
          Number(p.shimmerIntensity ?? 0.35),
          Number(p.baseHue ?? 130),
          Number(p.colorSpread ?? 90),
          Number(p.softEdge ?? 0.75)
        ]
      }
    case 'eclipse-alignment':
      return { floats: [Number(p.speed ?? 0.20), Number(p.intensity ?? 0.88), Number(p.density ?? 0.56), Number(p.hueShift ?? 0)] }
    case 'comet-tail':
      return { floats: [Number(p.speed ?? 0.30), Number(p.intensity ?? 0.88), Number(p.density ?? 0.58), Number(p.hueShift ?? 0)] }
    case 'magnetosphere-aurora':
      return { floats: [Number(p.speed ?? 0.24), Number(p.intensity ?? 0.86), Number(p.density ?? 0.58), Number(p.hueShift ?? 0)] }
    case 'wave-diffraction':
      return { floats: [Number(p.speed ?? 0.36), Number(p.intensity ?? 0.84), Number(p.density ?? 0.62), Number(p.hueShift ?? 0)] }
    case 'vortex-flame':
      return { floats: [Number(p.speed ?? 0.46), Number(p.intensity ?? 0.90), Number(p.density ?? 0.60), Number(p.hueShift ?? 0)] }
    case 'tokamak-plasma':
      return { floats: [Number(p.speed ?? 0.34), Number(p.intensity ?? 0.90), Number(p.density ?? 0.62), Number(p.hueShift ?? 280)] }
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
      const padded = new Float32Array(12)
      padded.set(floats.slice(0, 12))
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

