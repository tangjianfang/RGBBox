// R306/T19: the first-boot vision hint — one dismissible card on the
// dashboard that points first-time users at the AI Lab vision bench (the
// six-gesture vocabulary + the deep bench). Shown until dismissed; the
// dismissal persists in localStorage; a damaged flag re-shows (a hint must
// never vanish wrongly, and it must never trap anyone either).
import { useState, type JSX } from 'react'
import { useI18n } from '../../i18n'

const HINT_KEY = 'rgbbox:visionHintDismissed'

export function VisionFirstHint({ onOpenVision }: { onOpenVision?: () => void }): JSX.Element | null {
  const { t } = useI18n()
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(HINT_KEY) === '1' } catch { return false }
  })
  if (dismissed) return null
  const dismiss = (): void => {
    try { localStorage.setItem(HINT_KEY, '1') } catch { /* non-fatal */ }
    setDismissed(true)
  }
  return (
    <div className="vision-first-hint" data-hint="vision">
      <span className="vision-first-hint-icon" aria-hidden="true">🖐️</span>
      <div className="vision-first-hint-body">
        <b>{t('ai.lab.vision.hint.title')}</b>
        <span>{t('ai.lab.vision.hint.body')}</span>
      </div>
      <button type="button" className="vision-first-hint-open" data-action="vision-hint-open" onClick={() => { onOpenVision?.(); dismiss() }}>
        {t('ai.lab.vision.hint.open')}
      </button>
      <button type="button" className="vision-first-hint-dismiss" data-action="vision-hint-dismiss" onClick={dismiss} aria-label={t('ai.lab.vision.hint.dismiss')}>
        ✕
      </button>
    </div>
  )
}
