/**
 * LEDMapper — click-to-calibrate LED position tool.
 *
 * Displays a loaded `.splat` model and lets the user click the 3D surface to
 * mark LED positions.  Uses a transparent helper plane for raycasting because
 * Gaussian-splat point clouds have no mesh geometry.
 *
 * Usage:
 *   1. Select the target model.
 *   2. Click "Enter calibration mode".
 *   3. Click each LED position on the 3D view in order.
 *   4. Click "Export JSON" to download the `.led-map.json` file.
 */

import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Viewer, LogLevel } from '@mkkellogg/gaussian-splats-3d'
import type { LedMap, LedPosition, SplatModel } from './useModelStore'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LEDMapperProps {
  model: SplatModel
  /** Pre-existing LED positions from a saved led-map, if any. */
  initialLedMap?: LedMap | null
  /** Zone name applied to newly added LEDs (can be changed by the user). */
  defaultZone?: string
}

// ---------------------------------------------------------------------------
// Helper: marker sphere at the clicked world position
// ---------------------------------------------------------------------------

function makeMarker(position: THREE.Vector3, index: number): THREE.Mesh {
  const geo = new THREE.SphereGeometry(0.012, 8, 6)
  const mat = new THREE.MeshBasicMaterial({ color: 0xff2222 })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.copy(position)
  mesh.userData['ledIndex'] = index
  return mesh
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LEDMapper({ model, initialLedMap, defaultZone = 'zone_0' }: LEDMapperProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)

  const [calibrating, setCalibrating] = useState(false)
  const [leds, setLeds] = useState<LedPosition[]>(() => initialLedMap?.leds ?? [])
  const [zone, setZone] = useState(defaultZone)
  const [isLoading, setIsLoading] = useState(false)
  const [loadProgress, setLoadProgress] = useState(0)

  // Shared across calibration and renderer loops via refs.
  const calibratingRef = useRef(calibrating)
  calibratingRef.current = calibrating

  const sceneRef    = useRef<THREE.Scene | null>(null)
  const cameraRef   = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const markersRef  = useRef<THREE.Mesh[]>([])
  const helperRef   = useRef<THREE.Mesh | null>(null)
  const zoneRef     = useRef(zone)
  zoneRef.current   = zone

  // Rebuild marker spheres whenever `leds` state changes.
  const syncMarkers = useCallback((scene: THREE.Scene, positions: LedPosition[]) => {
    for (const m of markersRef.current) scene.remove(m)
    markersRef.current = []
    for (const led of positions) {
      const [x, y, z] = led.position
      const marker = makeMarker(new THREE.Vector3(x, y, z), led.id)
      scene.add(marker)
      markersRef.current.push(marker)
    }
  }, [])

  // ── Mount Three.js scene ─────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(container.offsetWidth, container.offsetHeight)
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const scene  = new THREE.Scene()
    sceneRef.current = scene
    const camera = new THREE.PerspectiveCamera(
      60,
      container.offsetWidth / Math.max(1, container.offsetHeight),
      0.01,
      100
    )
    camera.position.set(0, 0.5, 2)
    cameraRef.current = camera

    scene.add(new THREE.AmbientLight(0x444444))

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05

    // Invisible helper plane used for raycasting against the splat cloud.
    const helperGeo = new THREE.PlaneGeometry(10, 10)
    const helperMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
    const helper    = new THREE.Mesh(helperGeo, helperMat)
    helper.name     = '__led_helper_plane__'
    scene.add(helper)
    helperRef.current = helper

    // GS viewer
    const gsViewer = new Viewer({
      renderer,
      camera,
      scene,
      useBuiltInControls: false,
      selfDrivenMode: false,
      showLoadingUI: false,
      logLevel: LogLevel.Error,
    })

    setIsLoading(true)
    setLoadProgress(0)
    let loadCancelled = false

    gsViewer.addSplatScene(model.splatUrl, {
      showLoadingUI: false,
      onProgress: (p) => { if (!loadCancelled) setLoadProgress(Math.round(p * 100)) },
    }).then(() => {
      if (!loadCancelled) setIsLoading(false)
    }).catch((err: unknown) => {
      if (!loadCancelled) {
        console.error('[LEDMapper] load error:', err)
        setIsLoading(false)
      }
    })

    // Restore initial markers
    if (initialLedMap) syncMarkers(scene, initialLedMap.leds)

    // Render loop
    let rafId: number
    const loop = (): void => {
      rafId = requestAnimationFrame(loop)
      controls.update()
      gsViewer.update()
      renderer.render(scene, camera)
    }
    rafId = requestAnimationFrame(loop)

    // Resize
    const ro = new ResizeObserver(() => {
      const w = container.offsetWidth
      const h = container.offsetHeight
      if (!w || !h) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    })
    ro.observe(container)

    return () => {
      loadCancelled = true
      cancelAnimationFrame(rafId)
      ro.disconnect()
      controls.dispose()
      gsViewer.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement)
      sceneRef.current    = null
      cameraRef.current   = null
      rendererRef.current = null
      helperRef.current   = null
    }
  // Re-mount only when the model changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.splatUrl])

  // Keep markers in sync whenever leds state changes.
  useEffect(() => {
    if (sceneRef.current) syncMarkers(sceneRef.current, leds)
  }, [leds, syncMarkers])

  // ── Click handler for calibration mode ──────────────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container || !calibrating) return

    const onClick = (e: MouseEvent): void => {
      const scene    = sceneRef.current
      const camera   = cameraRef.current
      const helper   = helperRef.current
      const renderer = rendererRef.current
      if (!scene || !camera || !helper || !renderer) return

      const rect  = renderer.domElement.getBoundingClientRect()
      const ndc   = new THREE.Vector2(
        ((e.clientX - rect.left)  / rect.width)  * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      )
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(ndc, camera)

      // First try intersecting visible marker spheres to allow re-selection.
      const hits = raycaster.intersectObjects([helper, ...markersRef.current], false)
      if (hits.length === 0) return

      const point = hits[0].point
      const newLed: LedPosition = {
        id: leds.length,
        position: [
          Math.round(point.x * 1000) / 1000,
          Math.round(point.y * 1000) / 1000,
          Math.round(point.z * 1000) / 1000,
        ],
        zone: zoneRef.current,
      }
      setLeds((prev) => [...prev, newLed])
    }

    container.addEventListener('click', onClick)
    return () => container.removeEventListener('click', onClick)
  }, [calibrating, leds.length])

  // ── Export ───────────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    if (leds.length === 0) return
    const ledMap: LedMap = {
      model: model.splatUrl.split('/').pop() ?? model.name,
      device_type: model.name,
      led_count: leds.length,
      leds,
    }
    const blob = new Blob([JSON.stringify(ledMap, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${model.name}.led-map.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [leds, model])

  const handleUndo = useCallback(() => {
    setLeds((prev) => prev.slice(0, -1))
  }, [])

  const handleClear = useCallback(() => {
    setLeds([])
  }, [])

  return (
    <div className="led-mapper">
      <div className="led-mapper-toolbar">
        <button
          className={`led-mapper-btn${calibrating ? ' active' : ''}`}
          type="button"
          onClick={() => setCalibrating((v) => !v)}
        >
          {calibrating ? '⏹ Exit calibration' : '🎯 Enter calibration mode'}
        </button>
        <label className="led-mapper-zone-label">
          Zone:
          <input
            className="led-mapper-zone-input"
            type="text"
            value={zone}
            onChange={(e) => setZone(e.target.value)}
          />
        </label>
        <span className="led-mapper-count">{leds.length} LED{leds.length !== 1 ? 's' : ''} marked</span>
        <button className="led-mapper-btn" type="button" onClick={handleUndo} disabled={leds.length === 0}>
          ↩ Undo
        </button>
        <button className="led-mapper-btn danger" type="button" onClick={handleClear} disabled={leds.length === 0}>
          🗑 Clear
        </button>
        <button className="led-mapper-btn primary" type="button" onClick={handleExport} disabled={leds.length === 0}>
          ⬇ Export JSON
        </button>
      </div>

      <div className="led-mapper-canvas" ref={containerRef} aria-label="LED calibration view">
        {isLoading && (
          <div className="splat-overlay splat-loading">
            <div className="splat-progress-bar">
              <div className="splat-progress-fill" style={{ width: `${loadProgress}%` }} />
            </div>
            <span>{loadProgress}%</span>
          </div>
        )}
        {calibrating && !isLoading && (
          <div className="led-mapper-hint">Click the model surface to mark LED positions</div>
        )}
      </div>
    </div>
  )
}
