import { useEffect, useRef, type JSX } from 'react'

/**
 * R147 P2: topbar VU meters driven by the audio analyser's per-tick
 * subscribe channel. The subscription callback writes the `--level` CSS
 * variables straight onto the DOM nodes — no React state, no re-renders,
 * even though data arrives ~60x/sec. Replaces the old `audioLevels` prop
 * whose state updates re-rendered the ENTIRE App tree ~20x/sec just to
 * move these three bars.
 */
export function AudioMeters({ subscribe }: { subscribe: (cb: (d: { bass: number; mid: number; high: number }) => void) => () => void }): JSX.Element {
  const bassRef = useRef<HTMLDivElement>(null)
  const midRef = useRef<HTMLDivElement>(null)
  const highRef = useRef<HTMLDivElement>(null)

  useEffect(() => subscribe((d) => {
    bassRef.current?.style.setProperty('--level', String(d.bass))
    midRef.current?.style.setProperty('--level', String(d.mid))
    highRef.current?.style.setProperty('--level', String(d.high))
  }), [subscribe])

  return (
    <div className="audio-meter-row topbar-meters">
      <div ref={bassRef} className="audio-meter" title="Bass" />
      <div ref={midRef} className="audio-meter" title="Mid" />
      <div ref={highRef} className="audio-meter" title="High" />
    </div>
  )
}
