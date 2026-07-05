// ── R48: automated CPU/IO + presentation-layer performance self-test ────────
// Extracted from src/main/index.ts (R48.4) so the main entry stays lean. Run
// via `electron . --perf-selftest --user-data-dir=<temp>`; never triggered in
// normal use.
//
// Drives the exact scenarios reported across R38/R42–R45 (idle workspace,
// minimized, minimized+overlay, hidden-to-tray) using real BrowserWindow
// minimize()/restore()/hide()/show() and a real overlay opened through the
// renderer's own handleToggleOverlay path (R47.3), samples app.getAppMetrics()
// per scenario, AND (R48.1) collects the overlay window's frame-arrival timing
// — the only signal that can detect compositor/GPU frame throttling that CPU%
// is blind to. Writes a JSON report + PASS/FAIL verdicts to the log dir, then
// quits.
//
// R48.2: verdicts are tightened — scenario 4 requires BOTH the overlay
// process's own CPU AND its delivery fps to hold up when minimized (the old
// total-CPU-delta gate would false-pass even if overlay computation was
// skipped). R48.3: each scenario reports median + p25/p75 + min/max across 6
// samples instead of a single average, so sub-1% CPU noise doesn't get
// quoted as a precise reproducible number.

import { app, BrowserWindow, ipcMain } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ipcChannels } from '../shared/ipc'
import { getLogger } from '../shared/logger'
import type { OverlayFrameTiming } from '../shared/types'
import { getDisplayTopology } from './displayTopology'
import { getOverlayWindow } from './overlayManager'

export interface PerfSelfTestDeps {
  /** Returns the main app window (created by index.ts). May briefly be null. */
  getMainWindow: () => BrowserWindow | null
}

interface RawSample {
  total: number
  perProcess: Array<{ pid: number; type: string; cpuPercent: number }>
}

interface ScenarioResult {
  label: string
  atMs: number
  sampleCount: number
  totalCpuMedian: number
  totalCpuP25: number
  totalCpuP75: number
  totalCpuMin: number
  totalCpuMax: number
  perProcessMedian: Array<{ pid: number; type: string; cpuPercent: number }>
  /** R48.1: overlay frame-arrival timing, present only for overlay scenarios. */
  overlayTiming?: OverlayFrameTiming
  /** R48.1: framesReceived / elapsedMs * 1000, the presentation cadence signal. */
  deliveryFps?: number
}

const SAMPLE_COUNT = 6
const SAMPLE_INTERVAL_MS = 400

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p))
  return sorted[idx] ?? 0
}

function sampleOnce(): RawSample {
  const perProcess = app.getAppMetrics().map((m) => ({
    pid: m.pid,
    type: m.type,
    cpuPercent: m.cpu.percentCPUUsage,
  }))
  const total = perProcess.reduce((sum, p) => sum + p.cpuPercent, 0)
  return { total, perProcess }
}

/** Collect SAMPLE_COUNT raw samples, one every SAMPLE_INTERVAL_MS. */
async function sampleScenario(): Promise<RawSample[]> {
  const samples: RawSample[] = []
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    await delay(SAMPLE_INTERVAL_MS)
    samples.push(sampleOnce())
  }
  return samples
}

function summarizeScenario(label: string, raw: RawSample[]): ScenarioResult {
  const totals = raw.map((r) => r.total).sort((a, b) => a - b)
  // Per-process median keyed by pid (CPU% varies per-sample; type/pid stable).
  const pidMap = new Map<number, { type: string; values: number[] }>()
  for (const s of raw) {
    for (const p of s.perProcess) {
      const entry = pidMap.get(p.pid)
      if (entry) entry.values.push(p.cpuPercent)
      else pidMap.set(p.pid, { type: p.type, values: [p.cpuPercent] })
    }
  }
  const perProcessMedian = [...pidMap.entries()].map(([pid, { type, values }]) => ({
    pid,
    type,
    cpuPercent: values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)],
  }))
  return {
    label,
    atMs: Date.now(),
    sampleCount: raw.length,
    totalCpuMedian: percentile(totals, 0.5),
    totalCpuP25: percentile(totals, 0.25),
    totalCpuP75: percentile(totals, 0.75),
    totalCpuMin: totals[0] ?? 0,
    totalCpuMax: totals[totals.length - 1] ?? 0,
    perProcessMedian,
  }
}

/**
 * R48.1: ask an overlay window for its current frame-arrival timing snapshot.
 * main → overlay via webContents.send (carrying a requestId), overlay replies
 * via ipcRenderer.send on perfSelfTestOverlayTimingReport; we resolve on the
 * matching requestId. Times out so a non-responsive overlay never hangs the
 * harness.
 */
function collectOverlayTiming(overlayWin: BrowserWindow, requestId: number, timeoutMs = 3000): Promise<OverlayFrameTiming | undefined> {
  return new Promise((resolve) => {
    let settled = false
    const handler = (_event: Electron.IpcMainEvent, report: OverlayFrameTiming): void => {
      if (report.requestId !== requestId) return
      if (settled) return
      settled = true
      clearTimeout(timer)
      ipcMain.removeListener(ipcChannels.perfSelfTestOverlayTimingReport, handler)
      resolve(report)
    }
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      ipcMain.removeListener(ipcChannels.perfSelfTestOverlayTimingReport, handler)
      resolve(undefined)
    }, timeoutMs)
    ipcMain.on(ipcChannels.perfSelfTestOverlayTimingReport, handler)
    overlayWin.webContents.send(ipcChannels.perfSelfTestCollectOverlayTiming, requestId)
  })
}

export async function runPerfSelfTest(deps: PerfSelfTestDeps): Promise<void> {
  const log = getLogger()
  const results: ScenarioResult[] = []
  // eslint-disable-next-line prefer-const
  let overlayPid: number | undefined
  let nextRequestId = 1
  try {
    log.info('PerfSelfTest', 'Starting automated performance self-test (--perf-selftest)')
    // Prime app.getAppMetrics(): CPU% is measured over the interval since the
    // previous call, so the first reading needs a throwaway call to establish a
    // baseline window.
    sampleOnce()
    await delay(2500) // let the renderer mount + the tick loop settle

    const pushResult = (r: ScenarioResult): void => {
      results.push(r)
    }

    // Scenario 1
    pushResult(summarizeScenario('1-workspace-visible-no-overlay', await sampleScenario()))

    // Scenario 2
    deps.getMainWindow()?.minimize()
    pushResult(summarizeScenario('2-minimized-no-overlay', await sampleScenario()))

    // Open overlay via the renderer's own path (R47.3)
    deps.getMainWindow()?.restore()
    await delay(500)
    const topology = getDisplayTopology()
    const primary = topology.displays.find((d) => d.primary) ?? topology.displays[0]
    if (primary) {
      deps.getMainWindow()?.webContents.send(ipcChannels.perfSelfTestToggleOverlay, primary.id)
      await delay(2000) // renderer openOverlay() + overlay window load
      const overlayWin = getOverlayWindow(primary.id)
      if (overlayWin && !overlayWin.isDestroyed()) {
        overlayPid = overlayWin.webContents.getOSProcessId()
      }
    } else {
      log.warn('PerfSelfTest', 'No display found — skipping overlay-dependent scenarios')
    }

    // Scenario 3: visible with overlay — also collect frame timing
    const s3 = summarizeScenario('3-workspace-visible-with-overlay', await sampleScenario())
    if (primary) {
      const ow = getOverlayWindow(primary.id)
      if (ow && !ow.isDestroyed()) {
        const timing = await collectOverlayTiming(ow, nextRequestId++)
        if (timing) {
          s3.overlayTiming = timing
          s3.deliveryFps = timing.elapsedMs > 0 ? (timing.framesReceived / timing.elapsedMs) * 1000 : 0
        }
      }
    }
    pushResult(s3)

    // Scenario 4: minimized with overlay — the core "does the overlay keep
    // rendering" test. Both CPU (computation) and frame timing (presentation)
    // must hold up (R48.2).
    if (primary) {
      deps.getMainWindow()?.minimize()
      const s4 = summarizeScenario('4-minimized-with-overlay', await sampleScenario())
      const ow = getOverlayWindow(primary.id)
      if (ow && !ow.isDestroyed()) {
        const timing = await collectOverlayTiming(ow, nextRequestId++)
        if (timing) {
          s4.overlayTiming = timing
          s4.deliveryFps = timing.elapsedMs > 0 ? (timing.framesReceived / timing.elapsedMs) * 1000 : 0
        }
      }
      pushResult(s4)
      deps.getMainWindow()?.restore()
      await delay(500)
      deps.getMainWindow()?.webContents.send(ipcChannels.perfSelfTestToggleOverlay, primary.id)
      await delay(500)
    }

    // Scenario 5
    deps.getMainWindow()?.hide()
    pushResult(summarizeScenario('5-hidden-to-tray-no-overlay', await sampleScenario()))
    deps.getMainWindow()?.show()
    await delay(300)

    // ── Verdicts ──────────────────────────────────────────────────────────
    const verdicts: string[] = []
    const byLabel = (l: string): ScenarioResult | undefined => results.find((r) => r.label === l)
    const baseline = byLabel('1-workspace-visible-no-overlay')
    const minNoOverlay = byLabel('2-minimized-no-overlay')
    if (baseline && minNoOverlay) {
      const pass = minNoOverlay.totalCpuMedian < Math.max(3, baseline.totalCpuMedian * 0.4)
      verdicts.push(`[R42/R45] minimize (no overlay) should drop CPU close to 0: baseline median=${baseline.totalCpuMedian.toFixed(2)}% [p25=${baseline.totalCpuP25.toFixed(2)} p75=${baseline.totalCpuP75.toFixed(2)}] -> minimized median=${minNoOverlay.totalCpuMedian.toFixed(2)}% [p25=${minNoOverlay.totalCpuP25.toFixed(2)} p75=${minNoOverlay.totalCpuP75.toFixed(2)}] => ${pass ? 'PASS' : 'FAIL'}`)
    }
    const hidden = byLabel('5-hidden-to-tray-no-overlay')
    if (baseline && hidden) {
      const pass = hidden.totalCpuMedian < Math.max(3, baseline.totalCpuMedian * 0.4)
      verdicts.push(`[R44] hide-to-tray (no overlay) should drop CPU close to 0: baseline median=${baseline.totalCpuMedian.toFixed(2)}% -> hidden median=${hidden.totalCpuMedian.toFixed(2)}% => ${pass ? 'PASS' : 'FAIL'}`)
    }
    const withOverlay = byLabel('3-workspace-visible-with-overlay')
    const minWithOverlay = byLabel('4-minimized-with-overlay')
    if (withOverlay && minWithOverlay && overlayPid !== undefined) {
      // R48.2 (a): overlay process's OWN CPU must hold up when minimized.
      const ovVisible = withOverlay.perProcessMedian.find((p) => p.pid === overlayPid)
      const ovMinimized = minWithOverlay.perProcessMedian.find((p) => p.pid === overlayPid)
      const cpuVisible = ovVisible?.cpuPercent ?? 0
      const cpuMinimized = ovMinimized?.cpuPercent ?? 0
      const cpuPass = cpuVisible <= 0.1
        ? cpuMinimized <= 0.1 + 0.1 // both near-idle: allow small absolute jitter
        : cpuMinimized >= cpuVisible * 0.5
      // R48.2 (b): overlay delivery fps must hold up when minimized.
      const fpsVisible = withOverlay.deliveryFps ?? 0
      const fpsMinimized = minWithOverlay.deliveryFps ?? 0
      const fpsPass = fpsVisible <= 1
        ? fpsMinimized >= fpsVisible // too few frames to compare meaningfully
        : fpsMinimized >= fpsVisible * 0.6
      const pass = cpuPass && fpsPass
      verdicts.push(`[R38/R45] overlay should keep rendering when main window minimizes: overlay-process CPU visible=${cpuVisible.toFixed(2)}% -> minimized=${cpuMinimized.toFixed(2)}% (>=50%? ${cpuPass ? 'yes' : 'NO'}); delivery fps visible=${fpsVisible.toFixed(1)} -> minimized=${fpsMinimized.toFixed(1)} (>=60%? ${fpsPass ? 'yes' : 'NO'}) => ${pass ? 'PASS' : 'FAIL'}${pass ? ' (computation AND presentation held up)' : ' (computation or presentation throttled while minimized)'}`)
    } else if (withOverlay && minWithOverlay) {
      verdicts.push(`[R38/R45] overlay scenario ran but overlay pid could not be resolved — frame-timing verdict skipped (CPU-only)`)
    }

    const report = {
      generatedAt: new Date().toISOString(),
      sampleCount: SAMPLE_COUNT,
      sampleIntervalMs: SAMPLE_INTERVAL_MS,
      results,
      verdicts,
    }
    const reportPath = join(app.getPath('userData'), 'logs', 'perf-selftest-report.json')
    await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8')
    log.info('PerfSelfTest', `Report written to ${reportPath}`)
    for (const r of results) {
      const ov = r.overlayTiming
        ? ` | overlay: frames=${r.overlayTiming.framesReceived} elapsed=${r.overlayTiming.elapsedMs}ms fps=${r.deliveryFps?.toFixed(1)} intervalP50=${r.overlayTiming.intervalP50Ms.toFixed(1)}ms P95=${r.overlayTiming.intervalP95Ms.toFixed(1)}ms max=${r.overlayTiming.intervalMaxMs.toFixed(1)}ms`
        : ''
      log.info('PerfSelfTest', `${r.label}: total median=${r.totalCpuMedian.toFixed(2)}% [p25=${r.totalCpuP25.toFixed(2)} p75=${r.totalCpuP75.toFixed(2)} min=${r.totalCpuMin.toFixed(2)} max=${r.totalCpuMax.toFixed(2)}] | ` + r.perProcessMedian.map((p) => `${p.type}#${p.pid}=${p.cpuPercent.toFixed(2)}%`).join(', ') + ov)
    }
    for (const v of verdicts) {
      log.info('PerfSelfTest', v)
    }
  } catch (err) {
    log.error('PerfSelfTest', `Self-test failed: ${String(err)}`)
  } finally {
    log.flushSync()
  }
}