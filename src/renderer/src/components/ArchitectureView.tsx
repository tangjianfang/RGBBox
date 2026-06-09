/**
 * ArchitectureView — 3D visualization of the Electron + Vite + React +
 * TypeScript application architecture.
 *
 * Renders a Three.js scene with:
 *  - A multi-axis rotating central cube whose 6 faces represent each
 *    technology layer (Electron, React, Vite, TypeScript, Node.js, data-flow).
 *  - 7 glowing module spheres orbiting the cube, each with pulsing emissive
 *    glow and animated flow particles along connection lines.
 *  - Automated demo sequences that highlight the compile-flow and
 *    runtime-interaction paths by cycling emissive intensity.
 *  - Hover (raycaster) and click interactions: hover expands a sphere and
 *    boosts its glow; click slides in a detail panel from the right.
 *  - Keyboard shortcuts: Space (pause), 1–7 (select module), L (legend),
 *    R (reset), Esc (close panel).
 *  - HTML label overlays repositioned every frame via 3-D→2-D projection so
 *    they track sphere world-space positions with zero React re-renders.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties, type JSX, type MouseEvent } from 'react'
import * as THREE from 'three'

// ── Types ──────────────────────────────────────────────────────────────────────

type ModuleId = 'electron' | 'react' | 'vite' | 'typescript' | 'nodejs' | 'ipc' | 'output'
type ConnType  = 'dependency' | 'bidirectional' | 'compile' | 'runtime'
type DemoPhase = 'idle' | 'compile' | 'runtime'

interface ModuleSpec {
  id:      ModuleId
  label:   string
  color:   string   // CSS hex
  hex:     number   // THREE hex
  az:      number   // base azimuth, degrees
  el:      number   // base elevation, degrees
  heading: string
  items:   string[]
  deps:    ModuleId[]
}

interface ConnSpec { from: ModuleId; to: ModuleId; type: ConnType }

// ── Static data ────────────────────────────────────────────────────────────────

const ORBIT_R = 5.0

const MODULES: ModuleSpec[] = [
  {
    id: 'electron',   label: 'Electron Main',
    color: '#0066FF', hex: 0x0066FF,
    az: 210, el: -8,
    heading: 'Electron Main Process',
    items: ['Main Process', 'Window Management', 'IPC Bridge', 'Native APIs'],
    deps:  ['nodejs', 'ipc'],
  },
  {
    id: 'react',      label: 'React Components',
    color: '#8B5CF6', hex: 0x8B5CF6,
    az: 330, el: 12,
    heading: 'React Components',
    items: ['Functional Components', 'State Management', 'Hooks & Context', 'Component Tree'],
    deps:  ['ipc', 'vite'],
  },
  {
    id: 'vite',       label: 'Vite Build',
    color: '#10B981', hex: 0x10B981,
    az: 270, el: 52,
    heading: 'Vite Build System',
    items: ['Dev Server', 'HMR', 'Build Pipeline', 'Plugin System'],
    deps:  ['typescript', 'output'],
  },
  {
    id: 'typescript', label: 'TypeScript',
    color: '#FBBF24', hex: 0xFBBF24,
    az: 45,  el: -10,
    heading: 'TypeScript Type System',
    items: ['Type Definitions', 'Interface & Generics', 'Type Checking', 'Declaration Files'],
    deps:  ['vite'],
  },
  {
    id: 'nodejs',     label: 'Node.js',
    color: '#6B7280', hex: 0x6B7280,
    az: 135, el: -15,
    heading: 'Node.js Runtime',
    items: ['V8 Engine', 'Module System', 'Event Loop', 'Native Bindings'],
    deps:  ['electron'],
  },
  {
    id: 'ipc',        label: 'IPC Communication',
    color: '#06B6D4', hex: 0x06B6D4,
    az: 200, el: -38,
    heading: 'IPC Communication',
    items: ['ipcMain / ipcRenderer', 'Context Bridge', 'Message Queue', 'Event System'],
    deps:  ['electron', 'react'],
  },
  {
    id: 'output',     label: 'Build Output',
    color: '#F97316', hex: 0xF97316,
    az: 350, el: -32,
    heading: 'Build Output',
    items: ['Compiled JavaScript', 'Minified CSS', 'Static Assets', 'Bundle Files'],
    deps:  ['vite'],
  },
]

const CONNECTIONS: ConnSpec[] = [
  { from: 'electron',   to: 'nodejs',    type: 'dependency'    },
  { from: 'electron',   to: 'ipc',       type: 'bidirectional' },
  { from: 'react',      to: 'ipc',       type: 'bidirectional' },
  { from: 'typescript', to: 'vite',      type: 'compile'       },
  { from: 'vite',       to: 'output',    type: 'compile'       },
  { from: 'vite',       to: 'react',     type: 'runtime'       },
  { from: 'nodejs',     to: 'ipc',       type: 'dependency'    },
]

// BoxGeometry face material index order: +x, -x, +y, -y, +z, -z
const CUBE_HEX  = [0x8B5CF6, 0xFBBF24, 0x10B981, 0x6B7280, 0x1E3A8A, 0x0d1a30]
const CUBE_OPAQ = [0.76,     0.76,     0.76,     0.72,     0.80,     0.22   ]

const CONN_HEX: Record<ConnType, number> = {
  dependency:   0x4B5563,
  bidirectional: 0x06B6D4,
  compile:      0x10B981,
  runtime:      0xFBBF24,
}

const DEMO_SEQ: { phase: DemoPhase; ms: number }[] = [
  { phase: 'idle',    ms: 3500 },
  { phase: 'compile', ms: 5000 },
  { phase: 'idle',    ms: 2000 },
  { phase: 'runtime', ms: 6000 },
]

const DEMO_HL: Record<DemoPhase, ModuleId[]> = {
  idle:    [],
  compile: ['typescript', 'vite', 'output'],
  runtime: ['react', 'ipc', 'electron', 'nodejs'],
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const DEG = Math.PI / 180

function toCartesian(r: number, azDeg: number, elDeg: number): THREE.Vector3 {
  const az = azDeg * DEG
  const el = elDeg * DEG
  return new THREE.Vector3(
    r * Math.cos(el) * Math.sin(az),
    r * Math.sin(el),
    r * Math.cos(el) * Math.cos(az),
  )
}

function easeOutCubic(x: number): number {
  const c = Math.max(0, Math.min(1, x))
  return 1 - Math.pow(1 - c, 3)
}

function makeGlowTexture(css: string): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = cv.height = 128
  const ctx = cv.getContext('2d')!
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0,   css + 'ff')
  g.addColorStop(0.4, css + '99')
  g.addColorStop(1.0, css + '00')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(cv)
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ArchitectureView(): JSX.Element {
  const mountRef = useRef<HTMLDivElement>(null)

  // Three.js refs (never trigger re-renders)
  const rendererRef    = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef      = useRef<THREE.PerspectiveCamera | null>(null)
  const sphereGroupRef = useRef<THREE.Group | null>(null)
  const cubeRef        = useRef<THREE.Mesh | null>(null)
  const sphereMap      = useRef<Map<ModuleId, THREE.Mesh>>(new Map())
  const glowMap        = useRef<Map<ModuleId, THREE.Sprite>>(new Map())
  const particleMap    = useRef<Map<string, { mesh: THREE.Mesh; t: number; speed: number }>>(new Map())
  const sphereList     = useRef<THREE.Mesh[]>([])
  const raycaster      = useRef(new THREE.Raycaster())
  const mouseNDC       = useRef(new THREE.Vector2(-9, -9))
  const worldPosV      = useRef(new THREE.Vector3())
  const rafRef         = useRef<number | null>(null)

  // Animation state refs (no re-renders)
  const animT          = useRef(0)
  const lastTS         = useRef(0)
  const isPausedRef    = useRef(false)
  const hoveredRef     = useRef<ModuleId | null>(null)
  const demoIndexRef   = useRef(0)
  const demoElapsedRef = useRef(0)
  const demoPhaseRef   = useRef<DemoPhase>('idle')

  // DOM label refs (updated without React state)
  const labelRefs = useRef<Map<ModuleId, HTMLDivElement | null>>(new Map())

  // React state (UI re-renders only)
  const [selectedId, setSelectedId]     = useState<ModuleId | null>(null)
  const [isPaused, setIsPaused]         = useState(false)
  const [showLegend, setShowLegend]     = useState(false)
  const [demoPhaseUI, setDemoPhaseUI]   = useState<DemoPhase>('idle')

  const selectedMod = selectedId ? (MODULES.find(m => m.id === selectedId) ?? null) : null

  // ── Controls ──────────────────────────────────────────────────────────────────

  const togglePause = useCallback((): void => {
    const next = !isPausedRef.current
    isPausedRef.current = next
    setIsPaused(next)
  }, [])

  const doReset = useCallback((): void => {
    animT.current        = 0
    lastTS.current       = 0
    demoIndexRef.current = 0
    demoElapsedRef.current = 0
    demoPhaseRef.current = 'idle'
    isPausedRef.current  = false
    setIsPaused(false)
    setSelectedId(null)
    setDemoPhaseUI('idle')
    if (sphereGroupRef.current) sphereGroupRef.current.rotation.y = 0
  }, [])

  // ── Three.js setup ─────────────────────────────────────────────────────────

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    let active = true

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.1
    mount.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0F172A)
    scene.fog = new THREE.FogExp2(0x0F172A, 0.016)

    // Camera
    const cam = new THREE.PerspectiveCamera(52, mount.clientWidth / mount.clientHeight, 0.1, 120)
    cam.position.set(0, 2.8, 13.5)
    cam.lookAt(0, 0, 0)
    cameraRef.current = cam

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.5))
    const dir = new THREE.DirectionalLight(0xffffff, 1.3)
    dir.position.set(-4, 7, 5)
    scene.add(dir)
    const rim = new THREE.DirectionalLight(0x8899ff, 0.4)
    rim.position.set(5, -3, -6)
    scene.add(rim)

    // Background stars
    {
      const n = 1000
      const pos = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) {
        pos[i * 3]     = (Math.random() - 0.5) * 100
        pos[i * 3 + 1] = (Math.random() - 0.5) * 100
        pos[i * 3 + 2] = (Math.random() - 0.5) * 100
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.07, transparent: true, opacity: 0.38 })))
    }

    // Central cube (starts at scale 0 for intro)
    const cubeGeo = new THREE.BoxGeometry(2.5, 2.5, 2.5)
    const cubeMats = CUBE_HEX.map((hex, i) => new THREE.MeshStandardMaterial({
      color: hex, emissive: hex, emissiveIntensity: 0.28,
      transparent: true, opacity: CUBE_OPAQ[i],
      roughness: 0.1, metalness: 0.55,
    }))
    const cube = new THREE.Mesh(cubeGeo, cubeMats)
    cube.scale.setScalar(0)
    scene.add(cube)
    cubeRef.current = cube
    cube.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(cubeGeo),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 }),
    ))

    // Sphere group (all module spheres rotate together)
    const group = new THREE.Group()
    scene.add(group)
    sphereGroupRef.current = group

    const sphereGeo = new THREE.SphereGeometry(0.7, 24, 24)

    for (const mod of MODULES) {
      const mat = new THREE.MeshStandardMaterial({
        color: mod.hex, emissive: mod.hex, emissiveIntensity: 0.35,
        roughness: 0.2, metalness: 0.6,
        transparent: true, opacity: 0,  // fade in during intro
      })
      const sphere = new THREE.Mesh(sphereGeo, mat)
      sphere.position.copy(toCartesian(ORBIT_R, mod.az, mod.el))
      sphere.userData.moduleId = mod.id
      group.add(sphere)
      sphereMap.current.set(mod.id, sphere)

      // Glow sprite (additive blending)
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeGlowTexture(mod.color),
        transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }))
      glow.scale.setScalar(2.8)
      glow.position.copy(sphere.position)
      group.add(glow)
      glowMap.current.set(mod.id, glow)
    }

    // Cache sphere list for raycasting (avoids per-frame Map.values())
    sphereList.current = [...sphereMap.current.values()]

    // Connection lines + flow particles
    for (const conn of CONNECTIONS) {
      const aS = sphereMap.current.get(conn.from)!
      const bS = sphereMap.current.get(conn.to)!

      const pts = [aS.position.clone(), bS.position.clone()]
      const geo = new THREE.BufferGeometry().setFromPoints(pts)

      const isDashed = conn.type !== 'dependency'
      const lineMat: THREE.LineBasicMaterial | THREE.LineDashedMaterial = isDashed
        ? new THREE.LineDashedMaterial({
            color: CONN_HEX[conn.type],
            dashSize: conn.type === 'runtime' ? 0.15 : 0.28,
            gapSize:  conn.type === 'runtime' ? 0.12 : 0.1,
            transparent: true, opacity: 0.45,
          })
        : new THREE.LineBasicMaterial({
            color: CONN_HEX[conn.type],
            transparent: true, opacity: 0.4,
          })

      const line = new THREE.Line(geo, lineMat)
      line.computeLineDistances()
      group.add(line)

      // Primary flow particle
      const pMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 8, 8),
        new THREE.MeshBasicMaterial({ color: CONN_HEX[conn.type], transparent: true, opacity: 0 }),
      )
      group.add(pMesh)
      particleMap.current.set(`${conn.from}→${conn.to}`, { mesh: pMesh, t: Math.random(), speed: 0.07 + Math.random() * 0.05 })

      // Reverse particle for bidirectional
      if (conn.type === 'bidirectional') {
        const rMesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.1, 8, 8),
          new THREE.MeshBasicMaterial({ color: CONN_HEX[conn.type], transparent: true, opacity: 0 }),
        )
        group.add(rMesh)
        particleMap.current.set(`${conn.to}→${conn.from}`, { mesh: rMesh, t: 0.5, speed: 0.07 + Math.random() * 0.05 })
      }
    }

    // ── RAF loop ─────────────────────────────────────────────────────────────

    const introStart = performance.now()
    const INTRO_MS = 3500

    const animate = (ts: number): void => {
      if (!active) return
      rafRef.current = requestAnimationFrame(animate)

      // Delta
      if (!lastTS.current) lastTS.current = ts
      const delta = Math.min((ts - lastTS.current) / 1000, 0.05)
      lastTS.current = ts

      // Advance animation time (skips delta while paused)
      if (!isPausedRef.current) {
        animT.current += delta
        demoElapsedRef.current += delta * 1000
      }
      const t = animT.current

      // Intro progress (uses wall-clock time, not animation time)
      const introFrac = Math.min((performance.now() - introStart) / INTRO_MS, 1)

      // Cube: appears at introFrac 0.15, full scale by 0.45
      const cubeScale = easeOutCubic((introFrac - 0.15) / 0.3)
      cube.scale.setScalar(cubeScale)
      cube.rotation.x = t * 0.25
      cube.rotation.y = t * 0.40
      cube.rotation.z = t * 0.15

      // Sphere group orbit
      if (!isPausedRef.current) group.rotation.y = t * 0.18

      // Demo sequencer
      const seq = DEMO_SEQ[demoIndexRef.current % DEMO_SEQ.length]
      if (!isPausedRef.current && demoElapsedRef.current >= seq.ms) {
        demoElapsedRef.current = 0
        demoIndexRef.current   = (demoIndexRef.current + 1) % DEMO_SEQ.length
        const next = DEMO_SEQ[demoIndexRef.current % DEMO_SEQ.length].phase
        if (next !== demoPhaseRef.current) {
          demoPhaseRef.current = next
          setDemoPhaseUI(next)
        }
      }

      const hovered = hoveredRef.current
      const demoHl  = DEMO_HL[demoPhaseRef.current]

      // Spheres: pulse scale, emissive, intro fade-in
      for (let i = 0; i < MODULES.length; i++) {
        const mod    = MODULES[i]
        const sphere = sphereMap.current.get(mod.id)!
        const glow   = glowMap.current.get(mod.id)!
        const sMat   = sphere.material as THREE.MeshStandardMaterial
        const gMat   = glow.material as THREE.SpriteMaterial

        // Intro stagger: sphere i appears starting at introFrac 0.42 + i*0.055
        const sIntro = easeOutCubic((introFrac - (0.42 + i * 0.055)) / 0.14)
        const targetOp = sIntro * 0.9
        if (Math.abs(sMat.opacity - targetOp) > 0.002) sMat.opacity = targetOp

        // Pulse
        const pulse = 1 + 0.07 * Math.sin(t * Math.PI + i * 0.9)
        const hoverScale = hovered === mod.id ? 1.25 : 1.0
        sphere.scale.setScalar(pulse * hoverScale)

        // Emissive: hover > demo-active > demo-dim > base
        let emInt = 0.35
        if (demoHl.length > 0) emInt = demoHl.includes(mod.id) ? 1.0 : 0.08
        if (hovered === mod.id) emInt = 1.5
        sMat.emissiveIntensity = emInt

        // Glow opacity + size
        gMat.opacity = sIntro * (0.42 + 0.26 * Math.sin(t * 1.3 + i * 0.7))
        glow.scale.setScalar(2.8 + 0.65 * Math.sin(t * 1.2 + i * 0.8))
        glow.position.copy(sphere.position)
      }

      // Flow particles
      const pIntroOp = easeOutCubic((introFrac - 0.8) / 0.2) * 0.9
      for (const [key, fp] of particleMap.current) {
        const sep = key.indexOf('→')
        const fromId = key.slice(0, sep) as ModuleId
        const toId   = key.slice(sep + 1) as ModuleId
        const aS = sphereMap.current.get(fromId)
        const bS = sphereMap.current.get(toId)
        if (!aS || !bS) continue
        if (!isPausedRef.current) fp.t = (fp.t + fp.speed * delta) % 1
        fp.mesh.position.lerpVectors(aS.position, bS.position, fp.t)
        ;(fp.mesh.material as THREE.MeshBasicMaterial).opacity = pIntroOp
      }

      // Raycasting (hover detection)
      raycaster.current.setFromCamera(mouseNDC.current, cam)
      const hits = raycaster.current.intersectObjects(sphereList.current, false)
      const newHover: ModuleId | null = hits.length > 0
        ? (hits[0].object.userData.moduleId as ModuleId | undefined) ?? null
        : null
      if (newHover !== hoveredRef.current) {
        hoveredRef.current = newHover
        renderer.domElement.style.cursor = newHover ? 'pointer' : 'default'
      }

      // HTML label positions (direct DOM manipulation — no React re-renders)
      const cw = renderer.domElement.clientWidth
      const ch = renderer.domElement.clientHeight
      for (const mod of MODULES) {
        const sphere  = sphereMap.current.get(mod.id)
        const labelEl = labelRefs.current.get(mod.id)
        if (!sphere || !labelEl) continue
        sphere.getWorldPosition(worldPosV.current)
        worldPosV.current.project(cam)
        const lx = (worldPosV.current.x + 1) / 2 * cw
        const ly = (-worldPosV.current.y + 1) / 2 * ch
        labelEl.style.transform = `translate(-50%,-220%) translate(${lx}px,${ly}px)`
        const vis = worldPosV.current.z < 1
        labelEl.style.opacity = vis ? (hoveredRef.current === mod.id ? '1' : '0.65') : '0'
      }

      renderer.render(scene, cam)
    }

    rafRef.current = requestAnimationFrame(animate)

    // Resize observer
    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h)
      cam.aspect = w / h
      cam.updateProjectionMatrix()
    })
    ro.observe(mount)

    return () => {
      active = false
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      ro.disconnect()
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
      renderer.dispose()
      rendererRef.current = null
      sphereMap.current.clear()
      glowMap.current.clear()
      particleMap.current.clear()
    }
  }, [])

  // ── Mouse / keyboard interactions ─────────────────────────────────────────

  const onMouseMove = useCallback((e: MouseEvent<HTMLDivElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect()
    mouseNDC.current.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1
    mouseNDC.current.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1
  }, [])

  const onMouseLeave = useCallback((): void => {
    mouseNDC.current.set(-9, -9)
  }, [])

  const onClick = useCallback((): void => {
    const h = hoveredRef.current
    setSelectedId(prev => (h ? (prev === h ? null : h) : null))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.code === 'Space')  { e.preventDefault(); togglePause() }
      else if (e.key === 'r' || e.key === 'R') doReset()
      else if (e.key === 'l' || e.key === 'L') setShowLegend(v => !v)
      else if (e.key === 'Escape') setSelectedId(null)
      else {
        const n = parseInt(e.key)
        if (n >= 1 && n <= 7) setSelectedId(MODULES[n - 1]?.id ?? null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePause, doReset])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="arch-view" onMouseMove={onMouseMove} onMouseLeave={onMouseLeave} onClick={onClick}>
      {/* Three.js canvas mount */}
      <div ref={mountRef} className="arch-mount" />

      {/* HTML module labels (repositioned each frame via DOM transforms) */}
      <div className="arch-labels" aria-hidden="true">
        {MODULES.map(mod => (
          <div
            key={mod.id}
            className="arch-label"
            ref={el => { labelRefs.current.set(mod.id, el) }}
            style={{ color: mod.color, borderColor: mod.color + '66' }}
          >
            {mod.label}
          </div>
        ))}
      </div>

      {/* Demo phase banner */}
      {demoPhaseUI !== 'idle' && (
        <div className="arch-demo-banner">
          {demoPhaseUI === 'compile'
            ? '⚡ Compile Flow: TypeScript → Vite → Build Output'
            : '🔄 Runtime Flow: React ↔ IPC ↔ Electron → Node.js'}
        </div>
      )}

      {/* Info panel (slides in from right when a module is selected) */}
      <div
        className={`arch-info-panel${selectedMod ? ' arch-info-panel--open' : ''}`}
        onClick={e => e.stopPropagation()}
      >
        {selectedMod && (
          <>
            <button
              className="arch-info-close"
              type="button"
              aria-label="Close info panel"
              onClick={() => setSelectedId(null)}
            >✕</button>
            <div className="arch-info-accent" style={{ background: selectedMod.color }} />
            <h3 className="arch-info-title" style={{ color: selectedMod.color }}>
              {selectedMod.heading}
            </h3>
            <ul className="arch-info-list">
              {selectedMod.items.map(item => <li key={item}>{item}</li>)}
            </ul>
            {selectedMod.deps.length > 0 && (
              <div className="arch-info-deps">
                <p className="arch-info-deps-label">Connected modules</p>
                <div className="arch-info-dep-row">
                  {selectedMod.deps.map(depId => {
                    const dep = MODULES.find(m => m.id === depId)
                    if (!dep) return null
                    return (
                      <button
                        key={depId}
                        className="arch-dep-chip"
                        type="button"
                        style={{ '--chip-color': dep.color } as CSSProperties}
                        onClick={() => setSelectedId(depId)}
                      >
                        {dep.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <div className="arch-info-index">
              Module {MODULES.findIndex(m => m.id === selectedMod.id) + 1} / {MODULES.length}
            </div>
          </>
        )}
      </div>

      {/* Legend overlay */}
      {showLegend && (
        <div className="arch-legend" onClick={e => e.stopPropagation()}>
          <div className="arch-legend-header">
            <strong>Architecture Legend</strong>
            <button type="button" className="arch-info-close" onClick={() => setShowLegend(false)}>✕</button>
          </div>
          <p className="arch-legend-sub">Modules</p>
          {MODULES.map(m => (
            <div key={m.id} className="arch-legend-row">
              <span className="arch-legend-dot" style={{ background: m.color }} />
              <span>{m.label}</span>
            </div>
          ))}
          <p className="arch-legend-sub" style={{ marginTop: 10 }}>Connection types</p>
          <div className="arch-legend-row"><span className="arch-legend-line" style={{ background: '#4B5563' }} /><span>Dependency</span></div>
          <div className="arch-legend-row"><span className="arch-legend-line" style={{ background: '#06B6D4' }} /><span>IPC Bidirectional</span></div>
          <div className="arch-legend-row"><span className="arch-legend-line" style={{ background: '#10B981', opacity: 0.7 }} /><span>Compile Flow</span></div>
          <div className="arch-legend-row"><span className="arch-legend-line" style={{ background: '#FBBF24', opacity: 0.7 }} /><span>Runtime Data</span></div>
          <p className="arch-legend-sub" style={{ marginTop: 10 }}>Cube faces</p>
          {(['Electron (front)', 'React (right)', 'Vite (top)', 'TypeScript (left)', 'Node.js (bottom)'] as const).map((face, i) => (
            <div key={face} className="arch-legend-row">
              <span className="arch-legend-dot" style={{ background: ['#1E3A8A', '#8B5CF6', '#10B981', '#FBBF24', '#6B7280'][i] }} />
              <span>{face}</span>
            </div>
          ))}
        </div>
      )}

      {/* Bottom-right controls */}
      <div className="arch-controls" onClick={e => e.stopPropagation()}>
        <button
          className={`arch-btn${isPaused ? ' arch-btn--active' : ''}`}
          type="button"
          title={isPaused ? 'Resume (Space)' : 'Pause (Space)'}
          onClick={togglePause}
        >
          {isPaused ? '▶' : '⏸'}
        </button>
        <button
          className="arch-btn"
          type="button"
          title="Reset (R)"
          onClick={doReset}
        >↺</button>
        <button
          className={`arch-btn${showLegend ? ' arch-btn--active' : ''}`}
          type="button"
          title="Toggle legend (L)"
          onClick={() => setShowLegend(v => !v)}
        >≡</button>
      </div>

      {/* Keyboard shortcut hint */}
      <div className="arch-hint">Space · 1–7 · L · R · Esc</div>
    </div>
  )
}
