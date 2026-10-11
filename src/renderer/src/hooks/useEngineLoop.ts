import { useEffect, type RefObject } from 'react'
import type { DisplayTopology, Profile, RgbFrame, Scene } from '../../../shared/types'
import { is3DEffect, resolveFrameRenderStyle } from '../../../shared/types'
import type { WorkerErrorOutput, WorkerInput, WorkerOutput } from '../workers/previewEngineWorker'
import { MetricsCollector } from '../engine/metricsCollector'
import { activeLayer } from '../domain/profileUtils'
import { applyParameterAutomation } from '../domain/automation'
import { applyLayerOverride, type PreviewOverride } from '../domain/previewOverride'
import { distributeFrameToOverlays } from '../domain/overlayDistribution'
import type { View } from './tabNavigation'
import type { AudioData } from './useAudioAnalyzer'

/**
 * R269: worker-failure defenses. tickPending is cleared by worker REPLIES —
 * a worker that dies mid-tick (uncaught throw inside previewEngineWorker,
 * hard crash, silenced thread) would latch the gate forever: the classic
 * silent engine freeze (REVIEW-shell-loop TA6/C U4 + REVIEW-shared #1).
 * Three layers of defense:
 *   1. the worker itself catches and posts a { type: 'error' } reply
 *   2. this loop treats error replies and 'error' events as replies
 *   3. a watchdog: no reply within the timeout → forced gate reset
 * Repeated failures flip a degrade flag that throttles retries to one
 * attempt per cooldown (instead of full-FPS error spam against a poison
 * profile); the first successful frame clears it — self-healing, no
 * restart needed.
 */
const WORKER_REPLY_TIMEOUT_MS = 2000
const WORKER_FAIL_LIMIT = 3
const WORKER_DEGRADED_RETRY_MS = 2000

/** R269: success replies ({ frame, metrics }) carry no `type` — error ones do. */
function isWorkerErrorOutput(data: WorkerOutput | WorkerErrorOutput): data is WorkerErrorOutput {
  return 'type' in data && data.type === 'error'
}

/**
 * R147 P3b: the engine tick loop, moved verbatim from App.tsx. Every piece of
 * cross-domain state reaches the loop through REFS (P2 stabilization: the
 * effect — and its self-scheduling timeout chain — is created once per run;
 * parameter drags never tear it down). The frame channel writes only refs —
 * zero React state on the per-frame path (iron rule).
 *
 * Deps note: `[running, profileReady]` — `profileReady` is the null→loaded
 * BOOLEAN, not the profile object (the pre-P3b inline effect listed only
 * `[status.running]`, which short-circuited on the mount-time null profile
 * and then never re-ran after boot loaded it — the loop was dead on arrival;
 * listing the object itself would rebuild the timer on every profile edit,
 * which P2 eliminated).
 */
export function useEngineLoop(args: {
  profile: Profile | null
  running: boolean
  workerRef: RefObject<Worker | null>
  engineConfigRef: RefObject<{
    profile: Profile | null
    selectedLayerId: string
    automationEnabled: boolean
    automationMode: 'sine' | 'triangle' | 'pulse'
    automatedParams: string[]
    /** R164.2 (S2): active hover preview (kind + preset defaults), null when idle. */
    previewOverride: PreviewOverride | null
  }>
  audioRef: RefObject<AudioData>
  overlayIdsRef: RefObject<number[]>
  overlayConfigsRef: RefObject<Record<number, import('../../../shared/types').OverlayConfig>>
  topologyRef: RefObject<DisplayTopology | null>
  activeViewRef: RefObject<View>
  windowVisibleRef: RefObject<boolean>
  frameRef: RefObject<RgbFrame | null>
  ledColorsRef: RefObject<Uint8Array>
  metricsCollectorRef: RefObject<MetricsCollector>
  rippleBurstRef: RefObject<{ cx: number; cy: number; clickedAt: number } | null>
}): void {
  const { profile, running, workerRef, engineConfigRef, audioRef, overlayIdsRef, overlayConfigsRef, topologyRef, activeViewRef, windowVisibleRef, frameRef, ledColorsRef, metricsCollectorRef, rippleBurstRef } = args
  const profileReady = profile != null

  useEffect(() => {
    if (!profile || !running || !workerRef.current) return undefined

    let cancelled    = false
    const worker     = workerRef.current

    // ── Worker tick (async: may do screen capture) ────────────────────────
    // tickPending is cleared by onWorkerMessage (when the worker RESPONDS),
    // not by tick().finally() (which fires right after postMessage returns).
    // This ensures at most one message is in the worker's queue at any time.
    // Without this, slow workers (large grids) accumulate a deep backlog;
    // switching effects sends new profile to the back of that queue.
    let tickPending  = false
    let droppedTicksSinceLastPost = 0
    let lastPostAt = 0
    // R43: tracks whether the LAST tick had at least one enabled layer, so
    // that disabling every layer still gets exactly one more tick through
    // (to compute/display the resulting blank frame) before ticks pause —
    // otherwise the preview would be left showing a stale, still-lit frame
    // forever instead of going blank.
    let hadEnabledLayersLastTick = true

    // ── R269: reply watchdog + degrade bookkeeping ────────────────────────
    let watchdogTimer = 0
    let consecutiveWorkerFailures = 0
    let workerDegraded = false
    let lastWorkerFailureAt = 0

    const clearWatchdog = (): void => {
      if (watchdogTimer !== 0) {
        window.clearTimeout(watchdogTimer)
        watchdogTimer = 0
      }
    }

    /** A worker reply that signals failure — resets the gate and counts it. */
    const recordWorkerFailure = (reason: string): void => {
      tickPending = false
      clearWatchdog()
      consecutiveWorkerFailures += 1
      lastWorkerFailureAt = performance.now()
      if (!workerDegraded && consecutiveWorkerFailures >= WORKER_FAIL_LIMIT) {
        workerDegraded = true
        console.warn(
          `[RGBBox] engine worker failed ${consecutiveWorkerFailures} times (last: ${reason}) — ` +
            `degraded: retrying at most once per ${WORKER_DEGRADED_RETRY_MS}ms until a frame succeeds`
        )
      }
    }

    /** A successful worker reply — clears the gate and heals degrade mode. */
    const recordWorkerReply = (): void => {
      tickPending = false
      clearWatchdog()
      consecutiveWorkerFailures = 0
      workerDegraded = false
    }

    const tick = async (): Promise<boolean> => {
      if (cancelled) return false

      // R147 P2: config read through the ref bridge — the latest profile/
      // layer/automation state without tearing the effect down.
      const cfg = engineConfigRef.current
      const cfgProfile = cfg.profile
      if (!cfgProfile) return false
      const cfgScene = cfgProfile.scenes.find((s) => s.id === cfgProfile.activeSceneId) ?? cfgProfile.scenes[0]

      const audioInput = audioRef.current.active
        ? { bass: audioRef.current.bass, mid: audioRef.current.mid, high: audioRef.current.high, beat: audioRef.current.beat, freqBands: audioRef.current.freqBands }
        : undefined

      // Screen capture is only needed for screen-ambient effect and when no overlays are active
      const needsCapture =
        overlayIdsRef.current.length === 0 &&
        cfgScene.layers.some((l) => l.enabled && l.kind === 'screen-ambient')

      let screenSample: RgbFrame | undefined
      let captureMs = 0
      if (needsCapture) {
        const captureStartedAt = performance.now()
        const captured = await window.rgbbox.captureScreenSample({
          columns: cfgProfile.sampling.columns,
          rows: cfgProfile.sampling.rows,
          hasOverlays: false,
          linkedDisplays: Boolean(cfgScene.linkedDisplays),
        })
        captureMs = performance.now() - captureStartedAt
        screenSample = captured ?? undefined
      }

      if (cancelled) return false

      // Send to worker; transfer screen sample buffer (zero-copy) if present
      const burst = rippleBurstRef.current
      const rippleBurst = burst
        ? { cx: burst.cx, cy: burst.cy, burstAge: (performance.now() - burst.clickedAt) / 1000 }
        : undefined
      const droppedTicks = droppedTicksSinceLastPost
      droppedTicksSinceLastPost = 0
      lastPostAt = performance.now()
      // R164.2 (S2): hover preview — while an override is active the selected
      // layer renders as the hovered effect (its preset defaults) and the
      // automation transform is skipped: the preview shows the effect itself,
      // not an automated variation of the real profile. React state and the
      // persisted profile are never touched; clearing the override restores.
      const previewOverride = cfg.previewOverride
      const profileForWorker = previewOverride
        ? applyLayerOverride(cfgProfile, cfg.selectedLayerId, previewOverride)
        : applyParameterAutomation(
            cfgProfile,
            cfg.selectedLayerId,
            cfg.automationEnabled,
            cfg.automatedParams,
            cfg.automationMode,
            performance.now() / 1000
          )
      const msg: WorkerInput = { profile: profileForWorker, audioInput, screenSample, rippleBurst, captureMs, droppedTicks, postedAt: lastPostAt }
      if (screenSample) {
        worker.postMessage(msg, [screenSample.pixels.buffer])
      } else {
        worker.postMessage(msg)
      }
      // Return true = message was posted; tickPending cleared by onWorkerMessage response
      return true
    }

    // ── Worker response handler ──────────────────────────────────────────
    // Store the frame in a ref — no React setState, no reconciliation.
    const onWorkerMessage = (e: MessageEvent<WorkerOutput | WorkerErrorOutput>): void => {
      // R269: structured error reply from the worker's own catch — this IS
      // a reply (the gate must reset) but there is no frame to consume.
      if (isWorkerErrorOutput(e.data)) {
        recordWorkerFailure(`worker error reply: ${e.data.message}`)
        return
      }
      recordWorkerReply()
      if (cancelled) return
      const cfgProfile = engineConfigRef.current.profile
      if (!cfgProfile) return
      const cfgScene: Scene = cfgProfile.scenes.find((s) => s.id === cfgProfile.activeSceneId) ?? cfgProfile.scenes[0]
      const { frame, metrics } = e.data
      frame.showGap = cfgProfile.sampling.showGap ?? false
      frame.renderStyle = resolveFrameRenderStyle(cfgProfile.sampling.renderStyle, activeLayer(cfgProfile)?.kind)
      frameRef.current = frame
      // Copy pixel data for the 3D splat viewer LED lights
      if (ledColorsRef.current.length !== frame.pixels.length) {
        ledColorsRef.current = new Uint8Array(frame.pixels.length)
      }
      ledColorsRef.current.set(frame.pixels)
      // Push to any open overlay windows (fire-and-forget, not awaited).
      // R164.2 (S2): hover-preview frames stay in-app — pushing them to the
      // real overlay projections would paint the user's physical screens with
      // an effect they never chose.
      metricsCollectorRef.current.recordFrameArrival(frame.generatedAt > 0 ? frame.generatedAt : performance.now())
      if (!engineConfigRef.current.previewOverride) {
        // R276: outputMs 接真实测量(原恒 0 误导诊断)
        const outputStartedAt = performance.now()
        distributeFrameToOverlays(frame, cfgScene, topologyRef.current, overlayIdsRef.current, overlayConfigsRef.current)
        metrics.outputMs = performance.now() - outputStartedAt
      } else {
        metrics.outputMs = 0
      }
      metrics.roundTripMs = lastPostAt > 0 ? performance.now() - lastPostAt : metrics.workerProcessMs
      metricsCollectorRef.current.add(metrics)
    }

    // ── tick loop ─────────────────────────────────────────────────────────
    // Drives worker ticks at the configured FPS via a self-scheduling
    // timeout chain so ticks continue even when the main window is minimised.
    // (requestAnimationFrame stops when the window is minimised; timeouts are
    // not paused as long as backgroundThrottling is false in webPreferences.)
    let timerId = 0
    const onTick = (): void => {
      if (cancelled) return
      const cfg = engineConfigRef.current
      if (!cfg.profile) return
      // 3D effects are rendered directly by Preview3D on the GPU — bypass the
      // worker (R147 P2: moved here from the effect gate so switching to a 3D
      // effect no longer needs the effect itself to rebuild).
      if (is3DEffect(activeLayer(cfg.profile).kind)) return
      const tickProfile = cfg.profile
      const tickScene = tickProfile.scenes.find((s) => s.id === tickProfile.activeSceneId) ?? tickProfile.scenes[0]
      // R42/R43: nobody is consuming a frame right now — skip the
      // (potentially expensive, e.g. fire/aurora/lightning on a large grid)
      // worker tick entirely instead of computing frames nobody sees. Frames
      // are needed when either (a) an overlay window is projecting onto a
      // real display (regardless of main-window visibility — this is the one
      // case that must keep running even minimised, per R38), or (b) the
      // in-app workspace preview is actually the visible tab AND the window
      // itself is visible (not minimised/hidden to tray — windowVisibleRef is
      // fed by an explicit main-process IPC signal, see R43; document.hidden
      // stopped being a reliable signal for "minimised" once R38 disabled
      // Chromium's occluded-window backgrounding tracking). Re-evaluated on
      // every tick (cheap ref/property reads only), so it reacts immediately
      // to tab switches, minimise/restore and overlay open/close without
      // tearing down/recreating the worker.
      const overlayActive = overlayIdsRef.current.length > 0
      const previewVisible = windowVisibleRef.current && activeViewRef.current === 'workspace'
      if (!overlayActive && !previewVisible) return

      // R43: also pause once every layer is disabled — there's nothing to
      // render — but let exactly one more tick through first so the preview
      // actually goes blank instead of freezing on the last lit frame.
      const hasEnabledLayers = tickScene.layers.some((l) => l.enabled)
      if (!hasEnabledLayers && !hadEnabledLayersLastTick) return
      hadEnabledLayersLastTick = hasEnabledLayers

      if (!tickPending) {
        // R269: in degrade mode, retry at most once per cooldown window —
        // keeps a poison profile from hammering the failing worker at full
        // FPS while still self-healing the moment the profile is fixed.
        if (workerDegraded && performance.now() - lastWorkerFailureAt < WORKER_DEGRADED_RETRY_MS) return
        tickPending = true
        // tick() may cancel mid-way (cancelled flag); if it does WITHOUT posting
        // a message the worker will never reply, so we must unblock the gate here.
        void tick().catch(() => false as const).then((posted) => {
          if (posted !== true) {
            tickPending = false
            return
          }
          if (cancelled) return
          // R269 watchdog: if the worker never comes back (silent death),
          // the gate would stay latched forever — force a reset + failure.
          clearWatchdog()
          watchdogTimer = window.setTimeout(
            () => recordWorkerFailure('no worker reply (watchdog)'),
            WORKER_REPLY_TIMEOUT_MS
          )
        })
      } else {
        droppedTicksSinceLastPost += 1
      }
    }

    // R269: a hard worker crash fires 'error' and never replies — reset the
    // gate instead of freezing (previously console.warn only).
    const onWorkerError = (err: ErrorEvent): void => {
      console.warn('[RGBBox] Worker error', err.message, err.filename, err.lineno)
      recordWorkerFailure(err.message || 'worker error event')
    }

    worker.addEventListener('message', onWorkerMessage)
    worker.addEventListener('error', onWorkerError)

    // R147 P2: self-scheduling timeout chain instead of setInterval — the
    // interval is created ONCE for the whole run; the fps is re-read from the
    // config ref on every hop, so changing sampling.fps takes effect on the
    // next tick without rebuilding the timer or the worker listeners.
    const scheduleNext = (): void => {
      const fps = engineConfigRef.current.profile?.sampling.fps ?? 30
      timerId = window.setTimeout(() => {
        onTick()
        if (!cancelled) scheduleNext()
      }, Math.max(16, Math.floor(1000 / fps)))
    }
    scheduleNext()

    return () => {
      cancelled = true
      window.clearTimeout(timerId)
      clearWatchdog()
      worker.removeEventListener('message', onWorkerMessage)
      // R269: the error listener was previously never removed — every effect
      // re-run (running toggle) leaked another one onto the same worker.
      worker.removeEventListener('error', onWorkerError)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- profileReady is the boot boolean (see docblock); all other inputs are stable refs by design (P2).
  }, [running, profileReady])
}
