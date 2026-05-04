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
 * warp-portal: Volumetric energy portal.
 * 5 concentric glowing rings domain-warped by FBM, with spiral tendrils
 * extending along the Z-axis. Camera gently sways in front of the portal.
 */
const WARP_PORTAL_FS = COMMON + /* glsl */`
void main() {
  float speed    = max(0.05, u_params.x);
  float hueShift = u_params.y;
  float t        = u_time * speed;

  vec2 uv = (gl_FragCoord.xy / u_resolution - 0.5);
  uv.x   *= u_resolution.x / u_resolution.y;

  /* Camera slightly swaying, looking into the portal */
  vec3 ro = vec3(sin(t * 0.12) * 0.25, cos(t * 0.09) * 0.2, 2.8);
  vec3 rd = normalize(vec3(uv, -1.4));

  vec3  col  = vec3(0.0);
  float d    = 0.0;

  for (int i = 0; i < 96; i++) {
    vec3  p     = ro + rd * d;
    float r     = length(p.xy);
    float theta = atan(p.y, p.x);

    /* Domain warp: FBM distorts the radial coordinate */
    float warp = fbm(vec3(r * 1.6, theta * 0.6366, p.z + t * 0.35)) * 0.28;
    float wr   = r + warp * 0.4;

    /* 5 concentric energy rings */
    for (int j = 0; j < 5; j++) {
      float rj    = 0.12 + float(j) * 0.16;
      float ringD = abs(wr - rj) - 0.022;
      float pls   = 0.5 + 0.5 * sin(t * 3.5 - float(j) * 1.3 + theta * 2.0 + p.z * 2.0);
      float br    = exp(-max(0.0, ringD) * 20.0) * (0.5 + pls * 0.5);
      float h2    = mod(theta / 3.14159 * 180.0 + float(j) * 72.0 - p.z * 28.0 + t * 65.0 + hueShift + 720.0, 360.0);
      col += hsl(h2, 1.0, 0.65) * br * 0.13;
    }

    /* Spiral tendrils streaming outward along Z */
    float spiral = sin(theta * 4.0 - p.z * 5.5 - t * 5.0) * 0.5 + 0.5;
    float tendD  = abs(wr - 0.56) - 0.055;
    float tend   = exp(-max(0.0, tendD) * 12.0) * spiral * exp(-abs(p.z) * 0.85);
    float tHue   = mod(theta / 3.14159 * 180.0 - p.z * 32.0 + t * 90.0 + hueShift + 720.0, 360.0);
    col += hsl(tHue, 1.0, 0.7) * tend * 0.1;

    d += 0.048;
    if (d > 5.0) break;
  }

  /* Central white-hot core flash */
  float ctr = exp(-length(uv) * 4.5) * (0.35 + 0.25 * sin(t * 9.0));
  col += hsl(mod(t * 180.0 + hueShift + 720.0, 360.0), 0.35, 0.95) * ctr;

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

// ── Shader map ─────────────────────────────────────────────────────────────

export const SHADERS: Record<Effect3DKind, string> = {
  'sphere-pulse': SPHERE_PULSE_FS,
  'warp-portal':  WARP_PORTAL_FS,
  'neon-galaxy':  NEON_GALAXY_FS,
  'lava-sphere':  LAVA_SPHERE_FS,
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
   */
  draw(time: number, params: [number, number, number, number]): void {
    const gl = this.gl
    gl.uniform1f(this.uTime,   time)
    gl.uniform4fv(this.uParams, params)
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
