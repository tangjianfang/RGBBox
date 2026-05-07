/**
 * SplatViewer — Three.js + Gaussian-Splatting 3D model viewer.
 *
 * Renders a `.splat` point-cloud file with:
 *   - OrbitControls for mouse-drag 360° rotation
 *   - UnrealBloomPass for RGB glow post-processing
 *   - Per-LED THREE.PointLight nodes driven by the effect engine's color output
 *
 * LED colors are passed in via the `ledColors` prop (flat Uint8Array of RGB
 * triplets, length = ledCount * 3).  The component is designed to never
 * trigger unnecessary re-renders: expensive Three.js mutations happen inside
 * the rAF loop via refs.
 */

import { useEffect, useRef, useState, type JSX } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
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

const BLOOM_STRENGTH  = 1.2
const BLOOM_RADIUS    = 0.4
const BLOOM_THRESHOLD = 0.85
const MAX_LIGHT_INTENSITY = 2.5
const LIGHT_DISTANCE = 0.8
const LED_SPHERE_RADIUS = 0.015

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

    // Point light
    const light = new THREE.PointLight(color, 0, LIGHT_DISTANCE)
    light.position.set(x, y, z)
    scene.add(light)
    lights.push(light)

    // Visible LED indicator sphere
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
    // Intensity follows perceived brightness of the colour
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
  const [loadError, setLoadError]       = useState<string | null>(null)
  const [isLoading, setIsLoading]       = useState(false)

  // Stable refs so the rAF loop always sees the latest values.
  const ledColorsRef = useRef(ledColors)
  ledColorsRef.current = ledColors
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  // Track loaded model URL to avoid re-mounting on unrelated prop changes.
  const loadedUrlRef = useRef<string | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // ── Three.js renderer ──────────────────────────────────────────────────
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
      100
    )
    camera.position.set(0, 0.5, 2)

    // Ambient light (dim fill so non-LED parts are visible)
    scene.add(new THREE.AmbientLight(0x222222))

    // ── OrbitControls ──────────────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping  = true
    controls.dampingFactor  = 0.05
    controls.maxPolarAngle  = Math.PI * 0.6
    controls.minDistance    = 0.3
    controls.maxDistance    = 8

    // ── Post-processing: bloom ─────────────────────────────────────────────
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    composer.addPass(
      new UnrealBloomPass(
        new THREE.Vector2(container.offsetWidth, container.offsetHeight),
        BLOOM_STRENGTH,
        BLOOM_RADIUS,
        BLOOM_THRESHOLD
      )
    )

    // ── Gaussian-Splat viewer (non-self-driven: we own the render loop) ─────
    const gsViewer = new Viewer({
      renderer,
      camera,
      scene,
      useBuiltInControls: false,
      selfDrivenMode: false,
      showLoadingUI: false,
      logLevel: LogLevel.Error,
    })

    // ── LED nodes ──────────────────────────────────────────────────────────
    let ledLights:  THREE.PointLight[] = []
    let ledSpheres: THREE.Mesh[]       = []

    const buildLeds = (ledMap: LedMap): void => {
      // Remove previous LED nodes if any
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
      setIsLoading(true)
      setLoadError(null)
      setLoadProgress(0)
      try {
        await gsViewer.addSplatScene(m.splatUrl, {
          showLoadingUI: false,
          onProgress: (p) => { if (!loadCancelled) setLoadProgress(Math.round(p * 100)) },
        })
        if (!loadCancelled) {
          loadedUrlRef.current = m.splatUrl
          setIsLoading(false)
          if (m.ledMap) buildLeds(m.ledMap)
        }
      } catch (err) {
        if (!loadCancelled) {
          setLoadError(err instanceof Error ? err.message : String(err))
          setIsLoading(false)
        }
      }
    }

    if (model) void loadSplat(model)

    // ── Render loop ────────────────────────────────────────────────────────
    let rafId: number

    const loop = (): void => {
      rafId = requestAnimationFrame(loop)
      if (pausedRef.current) return

      controls.update()

      // Drive LED lights from effect engine colors
      const colors = ledColorsRef.current
      if (colors && ledLights.length > 0) {
        updateLedNodes(ledLights, ledSpheres, colors)
      }

      gsViewer.update()
      composer.render()
    }

    rafId = requestAnimationFrame(loop)

    // ── Resize observer ────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      const w = container.offsetWidth
      const h = container.offsetHeight
      if (!w || !h) return
      renderer.setSize(w, h)
      composer.setSize(w, h)
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

  return (
    <div className="splat-viewer" ref={containerRef} aria-label="3D model viewer">
      {isLoading && (
        <div className="splat-overlay splat-loading">
          <div className="splat-progress-bar">
            <div className="splat-progress-fill" style={{ width: `${loadProgress}%` }} />
          </div>
          <span>{loadProgress}%</span>
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
