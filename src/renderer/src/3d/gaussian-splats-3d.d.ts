/**
 * Minimal ambient type declarations for @mkkellogg/gaussian-splats-3d.
 * Only the APIs used by SplatViewer and LEDMapper are declared here.
 */
declare module '@mkkellogg/gaussian-splats-3d' {
  import type * as THREE from 'three'

  export interface ViewerOptions {
    /** Root DOM element that receives the Three.js renderer canvas. */
    rootElement?: HTMLElement
    /** Use an externally created THREE.WebGLRenderer. */
    renderer?: THREE.WebGLRenderer
    /** Use an externally created THREE.Camera. */
    camera?: THREE.Camera
    /** Use an externally created THREE.Scene. */
    scene?: THREE.Scene
    /** Multiplier applied to the gaussian splat render target resolution. Default 1. */
    renderMode?: number
    /** Use progressive loading (stream splat data as it downloads). Default true. */
    useBuiltInControls?: boolean
    /** Show loading progress in the DOM. Default false. */
    showLoadingUI?: boolean
    /** Log level. */
    logLevel?: number
    /** Enable dynamic scene (allows addSplatScene calls after initial load). */
    dynamicScene?: boolean
    /** Self-driven render loop controlled by the viewer itself. */
    selfDrivenMode?: boolean
    /** Use SharedArrayBuffer to communicate with sort worker. Requires crossOriginIsolated context. Default true. */
    sharedMemoryForWorkers?: boolean
    /** Half-precision float format for storage. */
    halfPrecisionCovariancesOnGPU?: boolean
  }

  export interface AddSplatSceneOptions {
    /** Show loading progress in the DOM. */
    showLoadingUI?: boolean
    /** Called during load: percent 0–100, label string, status (0=Downloading 1=Processing 2=Done). */
    onProgress?: (percent: number, percentLabel: string, status: number) => void
    /** Position offset applied to the scene. */
    position?: [number, number, number]
    /** Euler rotation (radians) applied to the scene. */
    rotation?: [number, number, number]
    /** Uniform scale applied to the scene. */
    scale?: [number, number, number]
  }

  export class Viewer {
    constructor(options?: ViewerOptions)
    /** Add a splat scene from a URL or file path. Returns a Promise that resolves when loaded. */
    addSplatScene(path: string, options?: AddSplatSceneOptions): Promise<void>
    /** Remove all splat scenes from the viewer. */
    removeSplatScenes(): void
    /** Dispose all GPU and CPU resources used by the viewer. */
    dispose(): void
    /** Call once per animation frame to update internal state (in non-selfDriven mode). */
    update(): void
    /** Render one frame (in non-selfDriven mode). */
    render(): void
    /** The Three.js scene managed by the viewer. */
    scene: THREE.Scene
    /** The Three.js renderer. */
    renderer: THREE.WebGLRenderer
    /** The Three.js camera. */
    camera: THREE.PerspectiveCamera
  }

  export enum RenderMode {
    ThreeD = 0,
    TwoD = 1,
  }

  export enum SceneRevealMode {
    Gradual = 0,
    Instant = 1,
  }

  export enum LogLevel {
    None = 0,
    Error = 1,
    Warning = 2,
    Info = 3,
    Debug = 4,
  }
}
