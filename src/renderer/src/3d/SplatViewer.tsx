/**
 * SplatViewer — Three.js + Gaussian-Splatting 3D model viewer with a cinematic,
 * photo-real rendering pipeline.
 *
 * Rendering features layered on top of the raw splat point-cloud:
 *   - PMREM image-based lighting from a procedural studio environment, giving
 *     physically-plausible reflections / ambient on every non-splat object.
 *   - ACES filmic tone-mapping with a user-adjustable exposure.
 *   - A subtly reflective ground plane + soft radial contact shadow that anchors
 *     the model in space.
 *   - Per-LED emissive spheres wrapped in additive "bloom" halo sprites that
 *     pulse with the live effect-engine colour output for a vivid neon glow.
 *   - Optional cinematic auto-rotate.
 *
 * An on-canvas control panel lets the user tune exposure, glow strength,
 * auto-rotate and the ground plane in real time.
 *
 * LED colours arrive via the `ledColors` prop (flat Uint8Array of RGB triplets,
 * length = ledCount * 3) and are applied inside the rAF loop through refs so the
 * component never re-renders on every frame.
 *
 * Rendering architecture:
 *   The @mkkellogg/gaussian-splats-3d Viewer renders the SplatMesh separately
 *   from our Three.js scene (renderer.render(scene), then
 *   renderer.render(splatMesh)).  We replicate that pattern manually because
 *   selfDrivenMode is false.
 */

import { useEffect, useRef, useState, type JSX } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { Viewer, LogLevel } from '@mkkellogg/gaussian-splats-3d'
import { useI18n } from '../i18n'
import type { LedMap, SplatModel } from './useModelStore'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SplatViewerProps {
  /** Model to display. Pass null to show the empty placeholder. */
  model: SplatModel | null
  /**
   * Flat RGB byte array from the effect engine.  Length must equal
   * ledMap.led_count * 3.  Mutated in-place by the caller every frame.
   */
  ledColors?: Uint8Array
  /** When true the viewer is rendered but paused (no rAF, static frame). */
  paused?: boolean
}

/** Live, ref-backed rendering settings tweakable from the control panel. */
interface RenderSettings {
  exposure: number
  glow: number
  autoRotate: boolean
  showGround: boolean
}

// ---------------------------------------------------------------------------
// Constants / tunables
// ---------------------------------------------------------------------------

const MAX_LIGHT_INTENSITY = 3.0
const LIGHT_DISTANCE = 0.9
const LED_SPHERE_RADIUS = 0.015
const HALO_BASE_SCALE = 0.12

const DEFAULT_SETTINGS: RenderSettings = {
  exposure: 1.2,
  glow: 1.0,
  autoRotate: false,
  showGround: true,
}

// LoaderStatus values from the library (0=Downloading, 1=Processing, 2=Done)
const LOADER_STATUS_DOWNLOADING = 0

// ---------------------------------------------------------------------------
// Texture helpers
// ---------------------------------------------------------------------------

/** Radial-gradient sprite texture used for the additive LED bloom halos. */
function makeHaloTexture(): THREE.Texture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.65)')
  g.addColorStop(0.55, 'rgba(255,255,255,0.18)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Soft circular contact-shadow texture rendered onto the ground plane. */
function makeShadowTexture(): THREE.Texture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(0,0,0,0.55)')
  g.addColorStop(0.5, 'rgba(0,0,0,0.22)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

// ---------------------------------------------------------------------------
// LED node construction
// ---------------------------------------------------------------------------

interface LedNodes {
  lights: THREE.PointLight[]
  spheres: THREE.Mesh[]
  halos: THREE.Sprite[]
  group: THREE.Group
}

function buildLedNodes(haloTexture: THREE.Texture, ledMap: LedMap): LedNodes {
  const group = new THREE.Group()
  const lights: THREE.PointLight[] = []
  const spheres: THREE.Mesh[] = []
  const halos: THREE.Sprite[] = []
  const geo = new THREE.SphereGeometry(LED_SPHERE_RADIUS, 12, 10)

  for (const led of ledMap.leds) {
    const [x, y, z] = led.position
    const color = new THREE.Color(0, 0, 0)

    const light = new THREE.PointLight(color, 0, LIGHT_DISTANCE, 2)
    light.position.set(x, y, z)
    group.add(light)
    lights.push(light)

    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color.clone(),
      emissiveIntensity: 1.0,
      roughness: 0.35,
      metalness: 0.0,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(x, y, z)
    group.add(mesh)
    spheres.push(mesh)

    const spriteMat = new THREE.SpriteMaterial({
      map: haloTexture,
      color,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    })
    const sprite = new THREE.Sprite(spriteMat)
    sprite.position.set(x, y, z)
    sprite.scale.setScalar(HALO_BASE_SCALE)
    group.add(sprite)
    halos.push(sprite)
  }

  return { lights, spheres, halos, group }
}

function updateLedNodes(nodes: LedNodes, ledColors: Uint8Array, glow: number): void {
  const { lights, spheres, halos } = nodes
  const count = Math.min(lights.length, Math.floor(ledColors.length / 3))
  for (let i = 0; i < count; i++) {
    const r = ledColors[i * 3] / 255
    const g = ledColors[i * 3 + 1] / 255
    const b = ledColors[i * 3 + 2] / 255
    const peak = Math.max(r, g, b)

    lights[i].color.setRGB(r, g, b)
    lights[i].intensity = MAX_LIGHT_INTENSITY * peak * glow

    const sphMat = spheres[i].material as THREE.MeshStandardMaterial
    sphMat.color.setRGB(r, g, b)
    sphMat.emissive.setRGB(r, g, b)
    sphMat.emissiveIntensity = 0.6 + peak * 1.6 * glow

    const halo = halos[i]
    const hMat = halo.material as THREE.SpriteMaterial
    hMat.color.setRGB(r, g, b)
    hMat.opacity = Math.min(1, peak * glow)
    halo.scale.setScalar(HALO_BASE_SCALE * (0.6 + peak * 1.4 * glow))
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SplatViewer({ model, ledColors, paused = false }: SplatViewerProps): JSX.Element {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [loadProgress, setLoadProgress] = useState(0)
  const [loadPhase, setLoadPhase] = useState<'idle' | 'downloading' | 'processing'>('idle')
  const [loadError, setLoadError] = useState<string | null>(null)

  const [settings, setSettings] = useState<RenderSettings>(DEFAULT_SETTINGS)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const ledColorsRef = useRef(ledColors)
  ledColorsRef.current = ledColors
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  const loadedUrlRef = useRef<string | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // ── Renderer ───────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(container.offsetWidth, container.offsetHeight)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = settingsRef.current.exposure
    renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(renderer.domElement)

    // ── Scene / camera ─────────────────────────────────────────────────────
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(
      55,
      container.offsetWidth / Math.max(1, container.offsetHeight),
      0.01,
      1000
    )
    camera.position.set(0, 1, 4)

    // ── Image-based lighting (procedural studio environment) ─────────────────
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envScene = new RoomEnvironment()
    const envTexture = pmrem.fromScene(envScene, 0.04).texture
    scene.environment = envTexture
    envScene.dispose()

    scene.add(new THREE.AmbientLight(0x404654, 0.6))
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.1)
    keyLight.position.set(3, 5, 2)
    scene.add(keyLight)

    // ── Ground plane + contact shadow ────────────────────────────────────────
    const groundGroup = new THREE.Group()
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0a0f14,
      roughness: 0.45,
      metalness: 0.6,
      envMapIntensity: 0.8,
    })
    const ground = new THREE.Mesh(new THREE.CircleGeometry(8, 64), groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.001
    groundGroup.add(ground)

    const shadowTex = makeShadowTexture()
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
    })
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), shadowMat)
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = 0.001
    groundGroup.add(shadow)
    groundGroup.visible = settingsRef.current.showGround
    scene.add(groundGroup)

    // ── OrbitControls ──────────────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.minDistance = 0.1
    controls.maxDistance = 200
    controls.autoRotateSpeed = 1.2
    controls.target.set(0, 0.4, 0)

    // ── Gaussian-Splat viewer ──────────────────────────────────────────────
    const gsViewer = new Viewer({
      renderer,
      camera,
      scene,
      useBuiltInControls: false,
      selfDrivenMode: false,
      showLoadingUI: false,
      logLevel: LogLevel.Error,
      sharedMemoryForWorkers: window.crossOriginIsolated === true,
    })

    // ── LED nodes ──────────────────────────────────────────────────────────
    const haloTexture = makeHaloTexture()
    let ledNodes: LedNodes | null = null

    const buildLeds = (ledMap: LedMap): void => {
      if (ledNodes) scene.remove(ledNodes.group)
      ledNodes = buildLedNodes(haloTexture, ledMap)
      scene.add(ledNodes.group)
    }

    if (model?.ledMap) buildLeds(model.ledMap)

    // ── Load splat ─────────────────────────────────────────────────────────
    let loadCancelled = false

    const loadSplat = async (m: SplatModel): Promise<void> => {
      if (loadedUrlRef.current === m.splatUrl) return
      setLoadPhase('downloading')
      setLoadError(null)
      setLoadProgress(0)
      try {
        await gsViewer.addSplatScene(m.splatUrl, {
          showLoadingUI: false,
          onProgress: (p: number, _label: string, status: number) => {
            if (loadCancelled) return
            if (status === LOADER_STATUS_DOWNLOADING) {
              setLoadProgress(Math.min(100, Math.round(p)))
            } else {
              setLoadPhase('processing')
              setLoadProgress(100)
            }
          },
        })
        if (!loadCancelled) {
          loadedUrlRef.current = m.splatUrl
          setLoadPhase('idle')
          if (m.ledMap) buildLeds(m.ledMap)
        }
      } catch (err) {
        if (!loadCancelled) {
          setLoadError(err instanceof Error ? err.message : String(err))
          setLoadPhase('idle')
        }
      }
    }

    if (model) void loadSplat(model)

    // ── Render loop ────────────────────────────────────────────────────────
    let rafId: number

    const loop = (): void => {
      rafId = requestAnimationFrame(loop)
      if (pausedRef.current) return

      const s = settingsRef.current
      renderer.toneMappingExposure = s.exposure
      controls.autoRotate = s.autoRotate
      groundGroup.visible = s.showGround
      controls.update()

      const colors = ledColorsRef.current
      if (colors && ledNodes && ledNodes.lights.length > 0) {
        updateLedNodes(ledNodes, colors, s.glow)
      }

      gsViewer.update()

      renderer.autoClear = true
      renderer.render(scene, camera)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v = gsViewer as any
      if (v.splatMesh && v.splatRenderReady && !v.isDisposingOrDisposed()) {
        renderer.autoClear = false
        renderer.render(v.splatMesh, camera)
        renderer.autoClear = true
      }
    }

    rafId = requestAnimationFrame(loop)

    // ── Resize observer ────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      const w = container.offsetWidth
      const h = container.offsetHeight
      if (!w || !h) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    })
    ro.observe(container)

    // ── Cleanup ────────────────────────────────────────────────────────────
    return () => {
      loadCancelled = true
      cancelAnimationFrame(rafId)
      ro.disconnect()
      controls.dispose()
      gsViewer.dispose()
      pmrem.dispose()
      envTexture.dispose()
      haloTexture.dispose()
      shadowTex.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
      loadedUrlRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.splatUrl])

  const isLoading = loadPhase !== 'idle'

  return (
    <div className="splat-viewer" ref={containerRef} aria-label="3D model viewer">
      {isLoading && (
        <div className="splat-overlay splat-loading">
          <div className="splat-progress-bar">
            <div className="splat-progress-fill" style={{ width: `${loadProgress}%` }} />
          </div>
          <span>{loadPhase === 'processing' ? t('model3d.buildingMesh') : `${loadProgress}%`}</span>
        </div>
      )}
      {loadError && (
        <div className="splat-overlay splat-error">
          <span>⚠ {loadError}</span>
        </div>
      )}
      {!model && !isLoading && (
        <div className="splat-overlay splat-empty">
          <span>{t('model3d.noModelSelected')}</span>
        </div>
      )}

      {/* Cinematic render controls */}
      {model && !loadError && (
        <div className="splat-controls" onPointerDown={(e) => e.stopPropagation()}>
          <div className="splat-control-row">
            <span>{t('model3d.exposure')}</span>
            <input
              type="range" min={0.4} max={2.5} step={0.05}
              value={settings.exposure}
              onChange={(e) => setSettings((p) => ({ ...p, exposure: Number(e.target.value) }))}
            />
          </div>
          <div className="splat-control-row">
            <span>{t('model3d.glow')}</span>
            <input
              type="range" min={0} max={2.5} step={0.05}
              value={settings.glow}
              onChange={(e) => setSettings((p) => ({ ...p, glow: Number(e.target.value) }))}
            />
          </div>
          <div className="splat-control-toggles">
            <button
              type="button"
              className={settings.autoRotate ? 'active' : ''}
              onClick={() => setSettings((p) => ({ ...p, autoRotate: !p.autoRotate }))}
            >
              {t('model3d.autoRotate')}
            </button>
            <button
              type="button"
              className={settings.showGround ? 'active' : ''}
              onClick={() => setSettings((p) => ({ ...p, showGround: !p.showGround }))}
            >
              {t('model3d.ground')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
