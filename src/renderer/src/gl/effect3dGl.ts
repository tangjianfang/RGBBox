/**
 * GPU-based 3D lighting effects via WebGL1 fragment shaders.
 *
 * Each Effect3DKind maps to a full-screen GLSL fragment shader that performs
 * raymarching-based 3D scene rendering entirely on the GPU. This is fundamentally
 * different from the 2D per-pixel CPU engine (renderEffectPixel) — the GPU renders
 * a genuine 3D scene with perspective, depth, lighting, and volumetric effects.
 *
 * Public exports:
 *   SHADERS  — Record<Effect3DKind, GLSL fragment shader source>
 *   Effect3DGl — WebGL manager: compile, draw, readLEDs for physical output
 */

import type { Effect3DKind } from '../../../shared/types'

// ── Vertex shader (shared by all effects) ──────────────────────────────────

const VS = /* glsl */`
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`

// ── GLSL common helpers (injected at top of every fragment shader) ──────────

const COMMON = /* glsl */`
precision mediump float;

uniform vec2  u_resolution;
uniform float u_time;
uniform vec4  u_params;  /* [speed, hueShift, intensity, density] */
uniform vec4  u_detail;  /* effect-specific: [gridDensity, scanSpeed, particleIntensity, glitchAmount] */
uniform vec4  u_extra;   /* effect-specific: [flicker, hologramDepth, saturation, scanWidth] */

float hash(float n) { return fract(sin(n) * 43758.5453); }

float noise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = i.x + i.y * 57.0 + 113.0 * i.z;
  return mix(
    mix(mix(hash(n),       hash(n + 1.0),   f.x),
        mix(hash(n + 57.0), hash(n + 58.0),  f.x), f.y),
    mix(mix(hash(n + 113.0), hash(n + 114.0), f.x),
        mix(hash(n + 170.0), hash(n + 171.0), f.x), f.y),
    f.z);
}

float fbm(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p  = p * 2.0 + vec3(31.1, 17.7, 7.3);
    a *= 0.5;
  }
  return v;
}

vec3 hsl(float h, float s, float l) {
  h = mod(h, 360.0) / 60.0;
  float c = (1.0 - abs(2.0 * l - 1.0)) * s;
  float x = c * (1.0 - abs(mod(h, 2.0) - 1.0));
  float m = l - c * 0.5;
  vec3 rgb;
  if      (h < 1.0) rgb = vec3(c, x, 0.0);
  else if (h < 2.0) rgb = vec3(x, c, 0.0);
  else if (h < 3.0) rgb = vec3(0.0, c, x);
  else if (h < 4.0) rgb = vec3(0.0, x, c);
  else if (h < 5.0) rgb = vec3(x, 0.0, c);
  else              rgb = vec3(c, 0.0, x);
  return clamp(rgb + m, 0.0, 1.0);
}
`

// ── Fragment shaders ────────────────────────────────────────────────────────

/**
 * sphere-pulse: Raymarched sphere with FBM surface displacement.
 * Camera orbits in 3D. Colorful surface, rim lighting, specular highlight,
 * volumetric glow halo, faint nebula background.
 */
const SPHERE_PULSE_FS = COMMON + /* glsl */`
void main() {
  float speed    = max(0.05, u_params.x);
  float hueShift = u_params.y;
  float t        = u_time * speed;

  vec2 uv = (gl_FragCoord.xy / u_resolution - 0.5);
  uv.x   *= u_resolution.x / u_resolution.y;

  /* Orbiting camera — circles the origin in XZ, bobs in Y */
  vec3 ro    = vec3(sin(t * 0.5) * 2.2, sin(t * 0.28) * 0.7, cos(t * 0.5) * 2.2);
  vec3 fwd   = normalize(-ro);
  vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  vec3 up    = cross(right, fwd);
  vec3 rd    = normalize(fwd * 1.6 + uv.x * right + uv.y * up);

  /* Pulsing + breathing radius */
  float radius = 0.62 + sin(t * 2.2) * 0.06 + sin(t * 5.7) * 0.02;

  /* Sphere raymarch */
  float dist = 0.1, glow = 0.0;
  vec3  pos  = ro;
  bool  hit  = false;

  for (int i = 0; i < 80; i++) {
    pos       = ro + rd * dist;
    float nd  = fbm(pos * 2.1 + vec3(t * 0.35, t * 0.28, t * 0.42)) * 0.14;
    float d   = length(pos) - (radius + nd);
    if (d < 0.003) { hit = true; break; }
    glow += exp(-d * 3.5) * 0.016;
    dist += max(d * 0.65, 0.004);
    if (dist > 6.5) break;
  }

  vec3 col = vec3(0.0);
  if (hit) {
    vec3  n3   = normalize(pos);
    float lon  = atan(n3.x, n3.z);
    float hue  = mod(lon / 3.14159 * 180.0 + t * 55.0 + hueShift + 720.0, 360.0);
    float texN = noise(pos * 4.5 + vec3(t * 0.5)) * 0.1;
    float lum  = clamp(0.32 + texN + n3.y * 0.12, 0.18, 0.58);
    col        = hsl(hue, 0.92, lum);

    /* Rim glow */
    vec3  view = normalize(ro - pos);
    float rim  = pow(1.0 - abs(dot(n3, view)), 2.8);
    col += hsl(mod(hue + 120.0, 360.0), 1.0, 0.55) * rim * 0.5;

    /* Specular */
    vec3  ldir = normalize(vec3(1.2, 1.5, 0.8));
    float spec = pow(max(0.0, dot(reflect(-ldir, n3), view)), 48.0);
    col += vec3(0.9, 0.95, 1.0) * spec * 0.35;
  }

  float haloHue = mod(t * 42.0 + hueShift + 720.0, 360.0);
  col += hsl(haloHue, 1.0, 0.55) * glow * 1.3;

  /* Faint nebula background */
  float bgN = fbm(rd * 1.8 + vec3(t * 0.04)) * 0.25;
  col += hsl(mod(haloHue + 195.0, 360.0), 0.7, 0.12) * bgN;

  gl_FragColor = vec4(col, 1.0);
}
`

/**
 * warp-portal: Screen-space energy portal with depth tunnel.
 *
 * Redesigned to avoid nested loops (which cause silent compilation failure or
 * brightness overflow on WebGL1 drivers).  The 5 rings are unrolled into plain
 * sequential code so no inner loop exists.  A separate single-depth loop adds
 * the 3D tunnel illusion.
 *
 * Algorithm:
 *   1. Polar coords (r, θ) from screen centre.
 *   2. Single FBM call domain-warps r into wr.
 *   3. Five rings rendered with plain sequential code (unrolled).
 *   4. Separate 28-step depth loop: convergent tunnel rushing toward viewer.
 *   5. Spiral energy tendrils + central core flash + outer atmosphere.
 */
const WARP_PORTAL_FS = COMMON + /* glsl */`
void main() {
  float speed    = max(0.05, u_params.x);
  float hueShift = u_params.y;
  float t        = u_time * speed;

  vec2 uv = (gl_FragCoord.xy / u_resolution - 0.5);
  uv.x   *= u_resolution.x / u_resolution.y;

  float r     = length(uv);
  float theta = atan(uv.y, uv.x);

  /* Single FBM domain warp for the whole frame */
  float warp = fbm(vec3(uv * 2.5, t * 0.4)) * 0.18;
  float wr   = r + warp * 0.5;

  vec3  col  = vec3(0.0);
  float ringD, pls, br, hh;

  /* ── 5 concentric energy rings (unrolled — no nested loop) ──────────── */

  /* Ring 0  r = 0.08 */
  ringD = abs(wr - 0.08) - 0.016;
  pls   = 0.5 + 0.5 * sin(t * 3.2 + theta * 2.0);
  br    = exp(-max(0.0, ringD) * 32.0) * (0.6 + pls * 0.4);
  hh    = mod(theta * 57.296 + t * 85.0 + hueShift + 720.0, 360.0);
  col  += hsl(hh, 1.0, 0.60) * br;

  /* Ring 1  r = 0.20 */
  ringD = abs(wr - 0.20) - 0.016;
  pls   = 0.5 + 0.5 * sin(t * 3.2 - theta * 2.0 + 1.26);
  br    = exp(-max(0.0, ringD) * 32.0) * (0.6 + pls * 0.4);
  hh    = mod(theta * 57.296 + 72.0 + t * 85.0 + hueShift + 720.0, 360.0);
  col  += hsl(hh, 1.0, 0.60) * br;

  /* Ring 2  r = 0.33 */
  ringD = abs(wr - 0.33) - 0.016;
  pls   = 0.5 + 0.5 * sin(t * 3.2 + theta * 2.0 + 2.51);
  br    = exp(-max(0.0, ringD) * 32.0) * (0.6 + pls * 0.4);
  hh    = mod(theta * 57.296 + 144.0 + t * 85.0 + hueShift + 720.0, 360.0);
  col  += hsl(hh, 1.0, 0.60) * br;

  /* Ring 3  r = 0.47 */
  ringD = abs(wr - 0.47) - 0.016;
  pls   = 0.5 + 0.5 * sin(t * 3.2 - theta * 2.0 + 3.77);
  br    = exp(-max(0.0, ringD) * 32.0) * (0.6 + pls * 0.4);
  hh    = mod(theta * 57.296 + 216.0 + t * 85.0 + hueShift + 720.0, 360.0);
  col  += hsl(hh, 1.0, 0.60) * br;

  /* Ring 4  r = 0.62 */
  ringD = abs(wr - 0.62) - 0.016;
  pls   = 0.5 + 0.5 * sin(t * 3.2 + theta * 2.0 + 5.03);
  br    = exp(-max(0.0, ringD) * 32.0) * (0.6 + pls * 0.4);
  hh    = mod(theta * 57.296 + 288.0 + t * 85.0 + hueShift + 720.0, 360.0);
  col  += hsl(hh, 1.0, 0.60) * br;

  /* ── Depth tunnel (single loop, no nesting) ─────────────────────────── */
  for (int i = 0; i < 28; i++) {
    float z  = float(i) * 0.12;
    /* Perspective convergence: radius shrinks as we go deeper */
    float rz = wr * (1.0 + z * 0.32);
    float az = theta - t * (2.0 + z * 0.07) - z * 0.32;
    float w2 = fbm(vec3(rz * 1.8, az * 0.637, z * 0.5 + t * 0.22)) * 0.08;
    float rw = rz + w2;
    float dRingD = abs(rw - 0.50) - 0.026;
    float dBr    = exp(-max(0.0, dRingD) * 14.0) * exp(-z * 0.55);
    float dHh    = mod(az * 57.296 - z * 24.0 + t * 65.0 + hueShift + 720.0, 360.0);
    col += hsl(dHh, 1.0, 0.58) * dBr * 0.18;
  }

  /* ── Spiral energy tendrils ──────────────────────────────────────────── */
  float spiral   = sin(theta * 4.0 - r * 6.0 - t * 5.0) * 0.5 + 0.5;
  float tendGlow = max(0.0, 1.0 - abs(wr - 0.52) * 14.0) * spiral;
  col += hsl(mod(theta * 57.296 + t * 95.0 + hueShift + 720.0, 360.0), 1.0, 0.70) * tendGlow * 0.6;

  /* ── Central white-hot core ──────────────────────────────────────────── */
  col += hsl(mod(t * 180.0 + hueShift + 720.0, 360.0), 0.25, 0.96)
       * exp(-r * 10.0) * (0.5 + 0.35 * sin(t * 9.0));

  /* ── Outer atmospheric glow ──────────────────────────────────────────── */
  col += hsl(mod(t * 48.0 + hueShift + 720.0, 360.0), 0.85, 0.48) * exp(-r * 3.2) * 0.28;

  gl_FragColor = vec4(col, 1.0);
}
`

/**
 * neon-galaxy: 3D galaxy with perspective.
 * Camera orbits above the galaxy disc, looking down. Volumetric spiral arms
 * are rendered via depth-integrated density. Point stars rotate with the disc.
 */
const NEON_GALAXY_FS = COMMON + /* glsl */`
void main() {
  float speed    = max(0.05, u_params.x);
  float hueShift = u_params.y;
  float t        = u_time * speed;

  vec2 uv = (gl_FragCoord.xy / u_resolution - 0.5);
  uv.x   *= u_resolution.x / u_resolution.y;

  /* Camera orbiting above the disc */
  float ca   = t * 0.3;
  float elev = 0.55 + sin(t * 0.13) * 0.25;
  vec3  ro   = vec3(cos(ca) * 3.8, sin(elev) * 2.0, sin(ca) * 3.8);
  vec3  fwd  = normalize(-ro);
  vec3  right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  vec3  up    = cross(right, fwd);
  vec3  rd    = normalize(fwd * 1.5 + uv.x * right + uv.y * up);

  vec3 col = vec3(0.0);

  /* Volume-integrate through galaxy disc */
  for (int i = 0; i < 60; i++) {
    float dt  = 0.07 + float(i) * 0.01;
    vec3  p   = ro + rd * dt;
    float r   = length(p.xz);
    float ang = atan(p.z, p.x) + r * 1.4 - t * 1.8;

    /* Two spiral arms */
    float arm  = pow(max(0.0, sin(ang * 2.0) * 0.5 + 0.5), 2.0);
    float disc = exp(-r * 0.65) * exp(-p.y * p.y * 6.0) * (0.2 + arm * 0.8);

    float nebHue = mod(ang / 3.14159 * 180.0 + r * 18.0 + t * 25.0 + hueShift + 720.0, 360.0);
    col += hsl(nebHue, 0.9, 0.5) * disc * 0.07;

    /* Central bulge glow */
    col += hsl(mod(50.0 + hueShift, 360.0), 0.4, 0.9)
         * exp(-r * 2.5) * exp(-p.y * p.y * 4.0) * 0.04;
  }

  /* Point stars scattered in 3D — rotate with galaxy */
  for (int s = 0; s < 24; s++) {
    float sf   = float(s);
    vec3  spos = vec3(
      sin(sf * 3.7 + 1.1) * 2.8 + cos(sf * 7.1) * 0.8,
      sin(sf * 5.9 + 0.3) * 0.4,
      cos(sf * 2.9 + 2.3) * 2.8 + sin(sf * 4.3) * 0.8
    );
    float sang = t * 0.2 * (0.7 + cos(sf * 1.7) * 0.3);
    float sc2  = cos(sang), ss2 = sin(sang);
    spos.xz    = vec2(sc2 * spos.x - ss2 * spos.z,
                      ss2 * spos.x + sc2 * spos.z);

    vec3  toS  = spos - ro;
    float prj  = dot(toS, rd);
    if (prj <= 0.0) continue;

    vec3  cls = ro + rd * prj - spos;
    float d2  = dot(cls, cls);
    float sr  = 0.03 + sin(sf * 7.3 + 1.0) * 0.01;
    float br  = exp(-d2 / (sr * sr)) * (0.5 + 0.3 * sin(t * 3.0 + sf * 2.1));
    col += hsl(mod(sf * 137.5 + hueShift + 720.0, 360.0), 0.5, 0.9) * br * 0.5;
  }

  gl_FragColor = vec4(col, 1.0);
}
`

/**
 * lava-sphere: Raymarched molten lava globe.
 * Triple-domain-warped FBM displacement creates flowing lava surface.
 * Temperature gradient maps to hue (cool=red, hot=orange-yellow).
 * Subsurface glow leaks through thin crust regions.
 */
const LAVA_SPHERE_FS = COMMON + /* glsl */`
void main() {
  float speed    = max(0.05, u_params.x);
  float hueShift = u_params.y;
  float t        = u_time * speed;

  vec2 uv = (gl_FragCoord.xy / u_resolution - 0.5);
  uv.x   *= u_resolution.x / u_resolution.y;

  /* Fixed camera, slight sway */
  vec3 ro    = vec3(sin(t * 0.2) * 0.3, 0.3 + sin(t * 0.13) * 0.15, 2.4);
  vec3 fwd   = vec3(0.0, 0.0, -1.0);
  vec3 right = vec3(1.0, 0.0, 0.0);
  vec3 up    = vec3(0.0, 1.0, 0.0);
  vec3 rd    = normalize(fwd * 1.6 + uv.x * right + uv.y * up);

  float dist = 0.1, trans = 0.0;
  vec3  pos  = ro;
  bool  hit  = false;

  for (int i = 0; i < 72; i++) {
    pos = ro + rd * dist;

    /* Triple-axis domain warp for lava flow */
    vec3 q = pos + vec3(
      fbm(pos * 2.0 + vec3(t * 0.3,  0.0,     t * 0.2)) * 0.25,
      fbm(pos * 2.0 + vec3(0.0,       t * 0.35, t * 0.25)) * 0.25,
      fbm(pos * 2.0 + vec3(t * 0.2,  t * 0.3,  0.0))     * 0.25
    );
    float nd = fbm(q * 1.8 + vec3(t * 0.45)) * 0.18;
    float d  = length(pos) - (0.7 + nd);

    if (d < 0.003) { hit = true; break; }
    trans += exp(-max(0.0, d) * 5.0) * 0.025;
    dist  += max(d * 0.55, 0.004);
    if (dist > 5.5) break;
  }

  vec3 col = vec3(0.0);
  if (hit) {
    /* Surface lava pattern via FBM */
    float lava  = fbm(pos * 3.5 + vec3(t * 0.5, t * 0.4, t * 0.3));
    float crack = fbm(pos * 6.0 + vec3(-t * 0.6, t * 0.5, t * 0.4));
    float temp  = lava * (0.6 + crack * 0.4);

    /* Cool = deep red (0°), hot = orange-yellow (40°) */
    float hue = mod(temp * 40.0 + hueShift + 360.0, 360.0);
    float lum = clamp(0.08 + temp * 0.65, 0.05, 0.75);
    col = hsl(hue, 1.0, lum);

    /* Rim glow — heat radiating at silhouette */
    vec3  n3   = normalize(pos);
    vec3  view = normalize(ro - pos);
    float rim  = pow(1.0 - abs(dot(n3, view)), 2.0);
    col += hsl(mod(25.0 + hueShift, 360.0), 1.0, 0.7) * rim * 0.6;
  }

  /* Subsurface glow leaking through thin crust */
  col += hsl(mod(20.0 + hueShift, 360.0), 1.0, 0.65) * trans * 0.8;

  /* Dark heat-haze background */
  float bgH = fbm(rd * 2.0 + vec3(t * 0.03));
  col += hsl(mod(15.0 + hueShift, 360.0), 0.8, 0.12) * bgH * bgH;

  gl_FragColor = vec4(col, 1.0);
}
`

/**
 * laser-show: Concert laser beams from stage floor sweeping the void.
 * Five coloured beam cones radiate from the bottom-centre and sweep across
 * the frame with independent sinusoidal speed/phase. Volumetric haze fills
 * the background; a floor-mirror glow reflects the base of each beam.
 */
const LASER_SHOW_FS = COMMON + /* glsl */`
void main() {
  float speed    = max(0.05, u_params.x);
  float hueShift = u_params.y;
  float t        = u_time * speed;

  vec2 uv = (gl_FragCoord.xy / u_resolution - 0.5);
  uv.x   *= u_resolution.x / u_resolution.y;

  /* Stage origin: bottom-center */
  vec2  orig = vec2(0.0, -0.52);
  vec2  dir  = uv - orig;
  float len  = length(dir);
  float ang  = atan(dir.y, dir.x);

  vec3 col = vec3(0.0);

  /* Volumetric haze background — denser near floor */
  float haze = (fbm(vec3(uv * 2.5, t * 0.15)) * 0.5 + 0.25)
             * exp(-(uv.y + 0.5) * (uv.y + 0.5) * 3.0);
  col += hsl(mod(t * 22.0 + hueShift + 720.0, 360.0), 0.38, 0.10) * haze;

  float bw = 0.035;
  float ba, da, br, bh;

  /* Beam 0 */
  ba  = sin(t * 1.10 + 0.00) * 1.15 + 1.5708;
  da  = abs(mod(ang - ba + 3.14159, 6.28318) - 3.14159);
  br  = exp(-da * da / (bw * bw)) * (0.5 + 0.4 * sin(t * 4.1)) * min(len * 2.0, 1.0);
  bh  = mod(0.0 + hueShift + 720.0, 360.0);
  col += hsl(bh, 1.0, 0.72) * br;

  /* Beam 1 */
  ba  = sin(t * 0.83 + 1.26) * 1.05 + 1.5708;
  da  = abs(mod(ang - ba + 3.14159, 6.28318) - 3.14159);
  br  = exp(-da * da / (bw * bw)) * (0.5 + 0.4 * sin(t * 3.7 + 1.1)) * min(len * 2.0, 1.0);
  bh  = mod(72.0 + hueShift + 720.0, 360.0);
  col += hsl(bh, 1.0, 0.72) * br;

  /* Beam 2 */
  ba  = sin(t * 0.71 + 2.51) * 0.95 + 1.5708;
  da  = abs(mod(ang - ba + 3.14159, 6.28318) - 3.14159);
  br  = exp(-da * da / (bw * bw)) * (0.5 + 0.4 * sin(t * 3.3 + 2.2)) * min(len * 2.0, 1.0);
  bh  = mod(144.0 + hueShift + 720.0, 360.0);
  col += hsl(bh, 1.0, 0.72) * br;

  /* Beam 3 */
  ba  = sin(t * 0.97 + 3.77) * 1.20 + 1.5708;
  da  = abs(mod(ang - ba + 3.14159, 6.28318) - 3.14159);
  br  = exp(-da * da / (bw * bw)) * (0.5 + 0.4 * sin(t * 4.2 + 3.3)) * min(len * 2.0, 1.0);
  bh  = mod(216.0 + hueShift + 720.0, 360.0);
  col += hsl(bh, 1.0, 0.72) * br;

  /* Beam 4 */
  ba  = sin(t * 0.61 + 5.03) * 0.88 + 1.5708;
  da  = abs(mod(ang - ba + 3.14159, 6.28318) - 3.14159);
  br  = exp(-da * da / (bw * bw)) * (0.5 + 0.4 * sin(t * 2.9 + 4.4)) * min(len * 2.0, 1.0);
  bh  = mod(288.0 + hueShift + 720.0, 360.0);
  col += hsl(bh, 1.0, 0.72) * br;

  /* Floor glow at origin */
  float floorG = exp(-(uv.y + 0.52) * (uv.y + 0.52) * 60.0);
  col += hsl(mod(t * 38.0 + hueShift + 720.0, 360.0), 0.9, 0.55) * floorG * 0.7;

  gl_FragColor = vec4(col, 1.0);
}
`

/**
 * hologram: Sci-fi holographic wireframe sphere.
 * Raymarched sphere with lat/lon grid lines, animated scan ring, transparency
 * through both hemispheres, and edge data-stream particles.
 */
const HOLOGRAM_FS = COMMON + /* glsl */`
void main() {
  float speed    = max(0.05, u_params.x);
  float hueShift = u_params.y;
  float intensity = clamp(u_params.z, 0.0, 2.0);
  float density = clamp(u_params.w, 0.0, 1.0);
  float gridDensity = mix(5.0, 18.0, clamp(u_detail.x, 0.0, 1.0));
  float scanSpeed = max(0.1, u_detail.y);
  float particleIntensity = clamp(u_detail.z, 0.0, 2.0);
  float glitchAmount = clamp(u_detail.w, 0.0, 1.0);
  float flickerAmount = clamp(u_extra.x, 0.0, 1.0);
  float hologramDepth = clamp(u_extra.y, 0.0, 1.0);
  float saturation = clamp(u_extra.z, 0.0, 1.4);
  float scanWidth = mix(10.0, 36.0, clamp(u_extra.w, 0.0, 1.0));
  float t        = u_time * speed;

  vec2 uv = (gl_FragCoord.xy / u_resolution - 0.5);
  uv.x   *= u_resolution.x / u_resolution.y;

  float rowNoise = hash(floor(gl_FragCoord.y * 0.32) + floor(t * 16.0) * 41.0);
  float rowShift = (rowNoise - 0.5) * glitchAmount * 0.055;
  uv.x += rowShift;

  /* Slow spin via UV rotation */
  float ca = cos(t * (0.24 + hologramDepth * 0.22)), sa = sin(t * (0.24 + hologramDepth * 0.22));
  vec2 ruv = vec2(ca * uv.x - sa * uv.y, sa * uv.x + ca * uv.y);

  /* Ray from camera through pixel */
  vec3 ro  = vec3(0.0, 0.0, 2.0 + hologramDepth * 0.35);
  vec3 rd  = normalize(vec3(ruv.x, ruv.y, -1.5 - hologramDepth * 0.42));

  /* Sphere (radius 0.85) intersection */
  float radius = 0.78 + hologramDepth * 0.12;
  float rb   = dot(ro, rd);
  float rc   = dot(ro, ro) - radius * radius;
  float disc = rb * rb - rc;

  vec3  col     = vec3(0.0);
  float baseHue = mod(hueShift + 190.0, 360.0);
  float signalDrop = step(glitchAmount * 0.22, rowNoise);

  if (disc >= 0.0) {
    float sqrtD = sqrt(disc);
    float scanY = sin(t * scanSpeed * 1.8) * 0.92;
    float flick = mix(1.0, 0.58 + 0.42 * noise(vec3(t * 8.3, rowNoise * 3.0, 0.0)), flickerAmount);

    /* Front surface */
    vec3  pos1 = ro + rd * (-rb - sqrtD);
    vec3  n1   = normalize(pos1);
    float lon1 = atan(n1.z, n1.x) / 3.14159;
    float lat1 = asin(clamp(n1.y, -0.999, 0.999)) / 1.5708;
    float gl1  = fract(lon1 * gridDensity + noise(pos1 * 4.0 + vec3(t * 0.2)) * glitchAmount * 0.35);
    float gl2  = fract(lat1 * (gridDensity * 0.72) + 0.5 + noise(pos1 * 3.1 - vec3(t * 0.15)) * glitchAmount * 0.28);
    float gLine1 = min(
      smoothstep(0.0, 0.055, gl1) * (1.0 - smoothstep(0.945, 1.0, gl1)),
      smoothstep(0.0, 0.055, gl2) * (1.0 - smoothstep(0.945, 1.0, gl2))
    );
    float scan1 = exp(-abs(n1.y - scanY) * scanWidth);
    float dataBands = step(0.74 + density * 0.12, noise(vec3(lon1 * 18.0, lat1 * 12.0, t * scanSpeed * 1.7)));
    float rim1 = pow(1.0 - abs(dot(n1, -rd)), 2.2);
    vec3 frontColor = hsl(baseHue + dataBands * 42.0, saturation, 0.60);
    col += frontColor * ((1.0 - gLine1) * (0.58 + density * 0.28) + scan1 * (0.72 + density * 0.55) + dataBands * 0.28 + rim1 * 0.35) * flick * intensity * signalDrop;

    /* Back surface — fainter through-glow */
    vec3  pos2 = ro + rd * (-rb + sqrtD);
    vec3  n2   = normalize(pos2);
    float lon2 = atan(n2.z, n2.x) / 3.14159;
    float lat2 = asin(clamp(n2.y, -0.999, 0.999)) / 1.5708;
    float gl3  = fract(lon2 * gridDensity);
    float gl4  = fract(lat2 * (gridDensity * 0.72) + 0.5);
    float gLine2 = min(
      smoothstep(0.0, 0.08, gl3) * (1.0 - smoothstep(0.92, 1.0, gl3)),
      smoothstep(0.0, 0.08, gl4) * (1.0 - smoothstep(0.92, 1.0, gl4))
    );
    col += hsl(baseHue + 18.0, saturation, 0.40) * (1.0 - gLine2) * (0.14 + hologramDepth * 0.18) * flick * intensity * signalDrop;
  }

  /* Soft glow around sphere */
  float r = length(uv);
  col += hsl(baseHue, saturation * 0.82, 0.45) * exp(-r * (3.6 - hologramDepth * 1.1)) * (0.12 + intensity * 0.10);

  /* Data-stream particles and scan packets along screen edge */
  float edgeMask = max(abs(uv.x) - 0.38, abs(uv.y) - 0.38);
  float edgeFalloff = exp(-max(0.0, edgeMask) * 24.0);
  float packets = step(0.70 - density * 0.22, noise(vec3(floor(uv.x * 32.0), floor(uv.y * 22.0), floor(t * 7.0)))) * edgeFalloff;
  float data = pow(noise(vec3(uv * (8.0 + density * 16.0), t * scanSpeed * 3.0)), 1.7) * edgeFalloff;
  col += hsl(mod(baseHue + 35.0, 360.0), saturation, 0.74) * (data * 0.40 + packets * 0.45) * particleIntensity * intensity;

  float scanline = 0.82 + sin((gl_FragCoord.y + t * 180.0 * scanSpeed) * 0.55) * 0.08;
  col *= scanline;

  if (glitchAmount > 0.0) {
    float dropout = step(0.08 + glitchAmount * 0.72, noise(vec3(floor(gl_FragCoord.xy / 8.0), floor(t * 18.0))));
    col *= mix(1.0, dropout, glitchAmount * 0.72);
  }

  gl_FragColor = vec4(col, 1.0);
}
`

// ── Shader map ─────────────────────────────────────────────────────────────

export const SHADERS: Record<Effect3DKind, string> = {
  'sphere-pulse': SPHERE_PULSE_FS,
  'warp-portal':  WARP_PORTAL_FS,
  'neon-galaxy':  NEON_GALAXY_FS,
  'lava-sphere':  LAVA_SPHERE_FS,
  'laser-show':   LASER_SHOW_FS,
  'hologram':     HOLOGRAM_FS,
}

// ── WebGL helpers ───────────────────────────────────────────────────────────

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(`GL shader compile:\n${gl.getShaderInfoLog(s)}`)
  }
  return s
}

function buildProgram(gl: WebGLRenderingContext, fsSrc: string): WebGLProgram {
  const p = gl.createProgram()!
  gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, VS))
  gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, fsSrc))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`GL program link: ${gl.getProgramInfoLog(p)}`)
  }
  return p
}

// ── Public class ────────────────────────────────────────────────────────────

/**
 * Manages a WebGL1 context for a single 3D lighting effect shader.
 *
 * Usage:
 *   const gl = new Effect3DGl(canvas, 'sphere-pulse')
 *   gl.draw(time, [speed, hueShift, intensity, density])
 *   const leds = gl.readLEDs(columns, rows)   // call in same JS task as draw()
 *   gl.dispose()
 */
export class Effect3DGl {
  private readonly gl:          WebGLRenderingContext
  private readonly prog:        WebGLProgram
  private readonly uResolution: WebGLUniformLocation
  private readonly uTime:       WebGLUniformLocation
  private readonly uParams:     WebGLUniformLocation
  private readonly uDetail:     WebGLUniformLocation | null
  private readonly uExtra:      WebGLUniformLocation | null
  /** Reused pixel readback buffer — avoids GC churn each frame. */
  private pixelBuf:    Uint8Array | null = null
  private pixelBufW  = 0
  private pixelBufH  = 0

  constructor(canvas: HTMLCanvasElement, kind: Effect3DKind) {
    const gl = canvas.getContext('webgl', {
      antialias:             false,
      alpha:                 false,
      depth:                 false,
      stencil:               false,
      preserveDrawingBuffer: false,
      powerPreference:       'high-performance',
    })
    if (!gl) throw new Error('WebGL not available')
    this.gl = gl

    this.prog = buildProgram(gl, SHADERS[kind])
    gl.useProgram(this.prog)

    /* Full-screen quad (two triangles) */
    const buf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    )
    const aPos = gl.getAttribLocation(this.prog, 'a_pos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    this.uResolution = gl.getUniformLocation(this.prog, 'u_resolution')!
    this.uTime       = gl.getUniformLocation(this.prog, 'u_time')!
    this.uParams     = gl.getUniformLocation(this.prog, 'u_params')!
    this.uDetail     = gl.getUniformLocation(this.prog, 'u_detail')
    this.uExtra      = gl.getUniformLocation(this.prog, 'u_extra')

    gl.uniform2f(this.uResolution, canvas.width, canvas.height)
    gl.viewport(0, 0, canvas.width, canvas.height)
  }

  /** Call after canvas is physically resized. */
  resize(w: number, h: number): void {
    this.gl.viewport(0, 0, w, h)
    this.gl.uniform2f(this.uResolution, w, h)
    this.pixelBuf = null  // invalidate readback buffer
  }

  /**
   * Render one frame to the canvas.
   * @param time   Elapsed seconds (unscaled; the shader applies u_params.x as speed)
   * @param params [speed, hueShift, intensity, density]
   * @param detail [gridDensity, scanSpeed, particleIntensity, glitchAmount]
   * @param extra  [flicker, hologramDepth, saturation, scanWidth]
   */
  draw(
    time: number,
    params: [number, number, number, number],
    detail: [number, number, number, number] = [0.5, 1, 1, 0],
    extra: [number, number, number, number] = [0.35, 0.5, 1, 0.5]
  ): void {
    const gl = this.gl
    gl.uniform1f(this.uTime,   time)
    gl.uniform4fv(this.uParams, params)
    if (this.uDetail) gl.uniform4fv(this.uDetail, detail)
    if (this.uExtra) gl.uniform4fv(this.uExtra, extra)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  /**
   * Sample the rendered frame at LED grid positions.
   * Must be called in the same JS task as draw() — before the browser presents the frame.
   * Returns a flat RGB triplet array: pixel (x, y) → [i*3]=R, [i*3+1]=G, [i*3+2]=B.
   */
  readLEDs(columns: number, rows: number): Uint8ClampedArray {
    const gl = this.gl
    const W  = gl.drawingBufferWidth
    const H  = gl.drawingBufferHeight

    /* Reuse buffer when size is unchanged */
    if (!this.pixelBuf || this.pixelBufW !== W || this.pixelBufH !== H) {
      this.pixelBuf  = new Uint8Array(W * H * 4)
      this.pixelBufW = W
      this.pixelBufH = H
    }
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, this.pixelBuf)

    const leds = new Uint8ClampedArray(columns * rows * 3)
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        const px = Math.floor((x + 0.5) / columns * W)
        const py = Math.floor((1 - (y + 0.5) / rows) * H)  /* flip Y — GL origin at bottom */
        const si = (py * W + px) * 4
        const di = (y * columns + x) * 3
        leds[di]     = this.pixelBuf[si]
        leds[di + 1] = this.pixelBuf[si + 1]
        leds[di + 2] = this.pixelBuf[si + 2]
      }
    }
    return leds
  }

  dispose(): void {
    this.gl.deleteProgram(this.prog)
    this.pixelBuf = null
  }
}
