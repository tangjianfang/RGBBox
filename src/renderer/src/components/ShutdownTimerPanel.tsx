import { Power, Timer, X } from 'lucide-react'
import { useState, type JSX } from 'react'
import { formatMediaTime } from '../../../shared/timeFormat'
import { useI18n } from '../i18n'

/**
 * R73: high-tech scheduled-shutdown HUD.
 *
 * A fixed-position card anchored next to the sidebar: an SVG countdown ring
 * (glowing cyan→violet stroke depleting with the remaining time), quick
 * presets, a custom minutes field, and arm/cancel actions. Presentational —
 * the countdown ticking lives in App.tsx so the sidebar row and this panel
 * always show the same number.
 */

interface Props {
  deadlineMs: number | null
  totalMs: number
  remainingMs: number
  onArm: (seconds: number) => Promise<boolean>
  onCancel: () => Promise<void>
  onClose: () => void
}

const PRESET_MINUTES = [15, 30, 60, 120]

export function ShutdownTimerPanel({
  deadlineMs, totalMs, remainingMs, onArm, onCancel, onClose,
}: Props): JSX.Element {
  const { t } = useI18n()
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const armed = deadlineMs != null && remainingMs > 0
  const progress = armed && totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : (armed ? 1 : 0)

  const R = 62
  const CIRC = 2 * Math.PI * R

  const arm = async (seconds: number): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(null)
    const ok = await onArm(seconds)
    if (!ok) setError(t('shutdown.unsupported'))
    setBusy(false)
  }

  return (
    <div className="shutdown-panel" role="dialog" aria-label={t('shutdown.title')}>
      <div className="shutdown-panel-header">
        <Timer size={15} />
        <span>{t('shutdown.title')}</span>
        <button type="button" className="shutdown-close" onClick={onClose} aria-label={t('common.close')}>
          <X size={14} />
        </button>
      </div>

      {/* Countdown ring */}
      <div className="shutdown-ring-wrap">
        <svg className="shutdown-ring" viewBox="0 0 150 150" width={150} height={150}>
          <defs>
            <linearGradient id="shutdown-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4fc3f7" />
              <stop offset="100%" stopColor="#ab47bc" />
            </linearGradient>
          </defs>
          <circle cx="75" cy="75" r={R} fill="none" stroke="rgba(79,195,247,0.15)" strokeWidth="6" />
          <circle
            cx="75" cy="75" r={R} fill="none"
            stroke="url(#shutdown-ring-grad)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - progress)}
            transform="rotate(-90 75 75)"
          />
        </svg>
        <div className="shutdown-ring-center">
          {armed ? (
            <>
              <span className="shutdown-countdown">{formatMediaTime(Math.ceil(remainingMs / 1000))}</span>
              <span className="shutdown-ring-sub">{t('shutdown.untilOff')}</span>
            </>
          ) : (
            <>
              <Power size={22} />
              <span className="shutdown-ring-sub">{t('shutdown.idle')}</span>
            </>
          )}
        </div>
      </div>

      {armed ? (
        <button
          type="button"
          className="shutdown-cancel"
          disabled={busy}
          onClick={() => { void onCancel() }}
        >
          {t('shutdown.cancel')}
        </button>
      ) : (
        <>
          <div className="shutdown-presets">
            {PRESET_MINUTES.map((m) => (
              <button key={m} type="button" disabled={busy} onClick={() => { void arm(m * 60) }}>
                {m >= 60 ? `${m / 60}h` : `${m}m`}
              </button>
            ))}
          </div>
          <div className="shutdown-custom">
            <input
              type="number"
              min={1}
              max={1440}
              value={custom}
              placeholder={t('shutdown.custom')}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const mins = Number(custom)
                  if (mins >= 1 && mins <= 1440) void arm(mins * 60)
                }
              }}
            />
            <button
              type="button"
              className="shutdown-arm"
              disabled={busy || !(Number(custom) >= 1 && Number(custom) <= 1440)}
              onClick={() => { void arm(Number(custom) * 60) }}
            >
              {t('shutdown.arm')}
            </button>
          </div>
        </>
      )}

      {error && <p className="shutdown-error">{error}</p>}
      <p className="shutdown-hint">{t('shutdown.hint')}</p>
    </div>
  )
}
