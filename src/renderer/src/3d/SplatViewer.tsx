/**
 * SplatViewer — Three.js + Gaussian-Splatting 3D model viewer.
 *
 * Renders a `.splat` point-cloud file with:
 *   - OrbitControls for mouse-drag 360° rotation
 *   - Per-LED THREE.PointLight nodes driven by the effect engine's color output
 *
 * LED colors are passed in via the `ledColors` prop (flat Uint8Array of RGB
 * triplets, length = ledCount * 3).  The component is designed to never
 * trigger unnecessary re-renders: expensive Three.js mutations happen inside
 * the rAF loop via refs.
 *
 * Rendering architecture:
 *   The @mkkellogg/gaussian-splats-3d Viewer renders the SplatMesh separately
 *   from our Three.js scene (it does: renderer.render(scene), then
 *   renderer.render(splatMesh)).  We must replicate that pattern ourselves
 *   when selfDrivenMode=false — otherwise the splatMesh is never drawn.
 */

import { useEffect, useRef, useState, type JSX } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Viewer, LogLevel } from '@mkkellogg/gaussian-splats-3d'
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

// ---------------------------------------------------------------------------
// Constants / tunables
// ---------------------------------------------------------------------------

const MAX_LIGHT_INTENSITY = 2.5
const LIGHT_DISTANCE = 0.8
const LED_SPHERE_RADIUS = 0.015

// LoaderStatus values from the library (0=Downloading, 1=Processing, 2=Done)
const LOADER_STATUS_DOWNLOADING = 0

// ---------------------------------------------------------------------------

function buildLedNodes(
  scene: THREE.Scene,
  ledMap: LedMap
): { lights: THREE.PointLight[]; spheres: THREE.Mesh[] } {
  const lights: THREE.PointLight[] = []
  const spheres: THREE.Mesh[] = []
  const geo = new THREE.SphereGeometry(LED_SPHERE_RADIUS, 8, 6)

  for (const led of ledMap.leds) {
    const [x, y, z] = led.position
    const color = new THREE.Color(0, 0, 0)

    const light = new THREE.PointLight(color, 0, LIGHT_DISTANCE)
    light.position.set(x, y, z)
    scene.add(light)
    lights.push(light)

    const mat = new THREE.MeshBasicMaterial({ color })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(x, y, z)
    scene.add(mesh)
    spheres.push(mesh)
  }

  return { lights, spheres }
}

function updateLedNodes(
  lights: THREE.PointLight[],
  spheres: THREE.Mesh[],
  ledColors: Uint8Array
): void {
  const count = Math.min(lights.length, Math.floor(ledColors.length / 3))
  for (let i = 0; i < count; i++) {
    const r = ledColors[i * 3]     / 255
    const g = ledColors[i * 3 + 1] / 255
    const b = ledColors[i * 3 + 2] / 255

    lights[i].color.setRGB(r, g, b)
    lights[i].intensity = MAX_LIGHT_INTENSITY * Math.max(r, g, b)

    const mat = spheres[i].material as THREE.MeshBasicMaterial
    mat.color.setRGB(r, g, b)
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SplatViewer({ model, ledColors, paused = false }: SplatViewerProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [loadProgress, setLoadProgress] = useState(0)
  const [loadPhase, setLoadPhase]       = useState<'idle' | 'downloading' | 'processing'>('idle')
  const [loadError, setLoadError]       = useState<string | null>(null)

  const ledColorsRef = useRef(ledColors)
  ledColorsRef.current = ledColors
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  const loadedUrlRef = useRef<string | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // ── Renderer ───────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(container.offsetWidth, container.offsetHeight)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.2
    container.appendChild(renderer.domElement)

    // ── Scene / camera ─────────────────────────────────────────────────────
    const scene  = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(
      60,
      container.offsetWidth / Math.max(1, container.offsetHeight),
      0.01,
      1000
    )
    camera.position.set(0, 1, 4)

    scene.add(new THREE.AmbientLight(0x333333))

    // ── OrbitControls ──────────────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.minDistance   = 0.1
    controls.maxDistance   = 200

    // ── Gaussian-Splat viewer ──────────────────────────────────────────────
    // selfDrivenMode: false  →  we call update() + render manually each frame
    const gsViewer = new Viewer({
      renderer,
      camera,
      scene,
      useBuiltInControls: false,
      selfDrivenMode: false,
      showLoadingUI: false,
      logLevel: LogLevel.Error,
      // SharedArrayBuffer requires crossOriginIsolated context (COOP/COEP headers).
      // In Electron dev mode (Vite server) those headers are set; in production
      // (file://) Electron handles it.  Disable as a safety fallback.
      sharedMemoryForWorkers: window.crossOriginIsolated === true,
    })

    // ── LED nodes ──────────────────────────────────────────────────────────
    let ledLights:  THREE.PointLight[] = []
    let ledSpheres: THREE.Mesh[]       = []

    const buildLeds = (ledMap: LedMap): void => {
      for (const l of ledLights)  scene.remove(l)
      for (const m of ledSpheres) scene.remove(m)
      const nodes = buildLedNodes(scene, ledMap)
      ledLights  = nodes.lights
      ledSpheres = nodes.spheres
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
              // p is 0–100 during download
              setLoadProgress(Math.min(100, Math.round(p)))
            } else {
              // Processing phase — keep bar at 100 and change label
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
    // The gaussian-splats-3d library renders splatMesh separately from our
    // scene.  We must do both:
    //   1. renderer.render(scene, camera)   — LEDs, ambient, custom objects
    //   2. renderer.render(splatMesh, cam)  — splat point cloud (autoClear=false)
    let rafId: number

    const loop = (): void => {
      rafId = requestAnimationFrame(loop)
      if (pausedRef.current) return

      controls.update()

      const colors = ledColorsRef.current
      if (colors && ledLights.length > 0) {
        updateLedNodes(ledLights, ledSpheres, colors)
      }

      // Let the viewer process sort-worker results and update GPU buffers
      gsViewer.update()

      // 1) Render our own scene (LEDs, ambient light, etc.)
      renderer.autoClear = true
      renderer.render(scene, camera)

      // 2) Overlay the splat mesh when it is ready
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
          <span>{loadPhase === 'processing' ? 'Building mesh…' : `${loadProgress}%`}</span>
        </div>
      )}
      {loadError && (
        <div className="splat-overlay splat-error">
          <span>⚠ {loadError}</span>
        </div>
      )}
      {!model && !isLoading && (
        <div className="splat-overlay splat-empty">
          <span>No model selected</span>
        </div>
      )}
    </div>
  )
}
