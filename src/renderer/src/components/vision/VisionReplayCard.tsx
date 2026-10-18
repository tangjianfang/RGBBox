// R306/T10: the replay card — the T1 recorder's user-facing half. Load a
// recording JSON (validated by parseRecording), play it at 1× or half speed
// with the SAME skeleton the live pad draws (vision/skeleton.ts), and
// re-dispatch the recorded events on the SAME window 'vision-input' bus the
// live hook uses — the whole capability table lights up exactly like a live
// session, which is the point: a recording demonstrates the system honestly.
import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { useI18n } from '../../i18n'
import { parseRecording, type Recording } from '../../vision/demoRecorder'
import { drawHandSkeleton } from '../../vision/skeleton'
import { ReplayPlayer } from '../../domain/visionReplay'

const CANVAS_W = 320
const CANVAS_H = 200

type Phase = 'idle' | 'error' | 'ready' | 'playing' | 'done'

export function VisionReplayCard(): JSX.Element {
  const { t } = useI18n()
  const [phase, setPhase] = useState<Phase>('idle')
  const [speed, setSpeed] = useState<0.5 | 1>(1)
  const [progress, setProgress] = useState('0.0s / 0.0s')
  // R309c: the scrub position (gated to the same 0.1s cadence as the text —
  // the slider must not force a re-render per animation frame)
  const [recT, setRecT] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const playerRef = useRef<ReplayPlayer | null>(null)
  const recRef = useRef<Recording | null>(null)
  const rafRef = useRef(0)
  const startedRef = useRef(false)
  const speedRef = useRef<0.5 | 1>(1)
  speedRef.current = speed

  const stopLoop = (): void => { cancelAnimationFrame(rafRef.current); rafRef.current = 0 }

  useEffect(() => stopLoop, [])

  const drawFrame = useCallback((hands: Recording['frames'][number]['hands']): void => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
    // up to two hands, each mapped into its half of the canvas
    const cols = hands.length > 1 ? 2 : 1
    hands.slice(0, 2).forEach((h, i) => {
      const cw = (CANVAS_W - 24) / cols
      const x = 12 + i * cw
      drawHandSkeleton(
        ctx,
        h.lm.map(([px, py]) => ({ x: px, y: py })),
        { x, y: 12, w: cw - 8, h: CANVAS_H - 24 },
        { bone: 'rgba(103,232,249,0.45)', point: 'rgba(226,232,240,0.75)', pointRadius: 2.2, lineWidth: 2 },
      )
    })
  }, [])

  const loop = useCallback((): void => {
    const player = playerRef.current
    if (!player) return
    const tick = player.tick(performance.now())
    if (tick.frame) drawFrame(tick.frame.hands)
    // re-fire the recorded events on the LIVE bus — the capability table
    // responds exactly as it does to a live session
    for (const ev of tick.dueEvents) {
      window.dispatchEvent(new CustomEvent('vision-input', {
        detail: { kind: ev.kind, name: ev.name, dir: ev.dir, key: ev.key, down: ev.down },
      }))
    }
    const text = `${(tick.recT / 1000).toFixed(1)}s / ${(player.durationMs / 1000).toFixed(1)}s`
    setProgress((prev) => {
      if (prev === text) return prev
      setRecT(tick.recT)
      return text
    })
    if (tick.done) { stopLoop(); setPhase('done'); return }
    rafRef.current = requestAnimationFrame(loop)
  }, [drawFrame])

  const onFile = useCallback((file: File): void => {
    const reader = new FileReader()
    reader.onload = (): void => {
      try {
        const rec = parseRecording(String(reader.result ?? ''))
        recRef.current = rec
        playerRef.current = new ReplayPlayer(rec, { speed: speedRef.current })
        startedRef.current = false
        setProgress(`0.0s / ${(playerRef.current.durationMs / 1000).toFixed(1)}s`)
        drawFrame(rec.frames[0]?.hands ?? [])
        setPhase('ready')
      } catch {
        setPhase('error')
      }
    }
    reader.readAsText(file)
  }, [drawFrame])

  const play = useCallback((): void => {
    const player = playerRef.current
    if (!player) return
    if (phase === 'done' || !startedRef.current) {
      player.start(performance.now())
      startedRef.current = true
    } else {
      // resume mid-timeline: re-anchor the clock so paused wall time doesn't count
      player.syncClock(performance.now())
    }
    setPhase('playing')
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(loop)
  }, [phase, loop])

  const pause = useCallback((): void => {
    stopLoop()
    setPhase('ready')
  }, [])

  // R309c: scrub — crossed events are skipped by design (ReplayPlayer.seek),
  // seeking off the end flips done → ready so play RESUMES from the position
  const seekTo = useCallback((t: number): void => {
    const player = playerRef.current
    if (!player) return
    const tick = player.seek(t)
    drawFrame(tick.frame?.hands ?? [])
    for (const ev of tick.dueEvents) {
      window.dispatchEvent(new CustomEvent('vision-input', { detail: { kind: ev.kind, name: ev.name, dir: ev.dir, key: ev.key, down: ev.down } }))
    }
    setRecT(tick.recT)
    setProgress(`${(tick.recT / 1000).toFixed(1)}s / ${(player.durationMs / 1000).toFixed(1)}s`)
    setPhase(tick.done ? 'done' : 'ready')
  }, [drawFrame])

  const toggleSpeed = useCallback((): void => {
    setSpeed((s) => {
      const next: 0.5 | 1 = s === 1 ? 0.5 : 1
      playerRef.current?.setSpeed(next)
      return next
    })
  }, [])

  return (
    <div className="vision-replay" data-replay={phase} data-speed={String(speed)}>
      <div className="vision-replay-head">
        <strong>{t('ai.lab.vision.replay.title')}</strong>
        <input
          type="file"
          accept=".json,application/json"
          data-action="vision-replay-file"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }}
        />
        <button type="button" data-action="vision-replay-load" onClick={(e) => (e.currentTarget.previousElementSibling as HTMLInputElement).click()}>
          {t('ai.lab.vision.replay.load')}
        </button>
        {phase === 'playing' ? (
          <button type="button" data-action="vision-replay-pause" onClick={pause}>{t('ai.lab.vision.replay.pause')}</button>
        ) : (
          <button type="button" data-action="vision-replay-play" onClick={play} disabled={phase === 'idle' || phase === 'error'}>
            {phase === 'done' ? t('ai.lab.vision.replay.again') : t('ai.lab.vision.replay.play')}
          </button>
        )}
        <button type="button" data-action="vision-replay-speed" onClick={toggleSpeed} disabled={phase === 'idle' || phase === 'error'}>
          {speed === 1 ? '1×' : '0.5×'}
        </button>
        <span className="vision-replay-progress">{progress}</span>
      </div>
      {phase !== 'idle' && phase !== 'error' && playerRef.current != null && (
        <input
          type="range"
          className="vision-replay-seek"
          data-action="vision-replay-seek"
          min={0}
          max={playerRef.current.durationMs}
          value={recT}
          aria-label={t('ai.lab.vision.replay.seek')}
          onChange={(e) => seekTo(Number(e.target.value))}
        />
      )}
      {phase === 'error' && <p className="vision-replay-error">{t('ai.lab.vision.replay.badFile')}</p>}
      <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} style={{ width: CANVAS_W, height: CANVAS_H }} aria-label={t('ai.lab.vision.replay.title')} />
    </div>
  )
}
