import { useState, type JSX } from 'react'
import { BrainCircuit } from 'lucide-react'
import { useI18n } from '../i18n'
import { useAiAudioStream } from '../hooks/useAiAudioStream'
import labels from '../assets/audioset-labels.json'

const VAD_THRESHOLD = 0.5

/** R90.8: compact AI-listen overlay for the media studios — captures the
 *  system loopback while media plays and shows live VAD/AST results.
 *  Mounted alongside (not inside) the player components — zero player changes. */
export function AiListenOverlay(): JSX.Element {
  const { t } = useI18n()
  const [enabled, setEnabled] = useState(false)
  const { running, error, vadProb, astTop } = useAiAudioStream(enabled ? 'system' : null)
  const top = astTop?.[0]

  return (
    <div className="ai-listen" data-on={enabled ? 'true' : undefined}>
      <button
        type="button"
        className={`ai-listen-toggle${enabled ? ' active' : ''}`}
        onClick={() => setEnabled((v) => !v)}
        title={t('player.aiListen.title')}
      >
        <BrainCircuit size={14} />
        <span>{t('player.aiListen.toggle')}</span>
      </button>
      {enabled && (
        <div className="ai-listen-panel">
          {error !== null && <div className="ai-hint-line">{error}</div>}
          {running && <div className="ai-lab-status">{t('player.aiListen.listening')}</div>}
          {vadProb !== null && (
            <div className="ai-listen-row">
              <span>{t('ai.lab.audio.vad.prob')}</span>
              <strong className={vadProb >= VAD_THRESHOLD ? 'on' : ''}>{Math.round(vadProb * 100)}%</strong>
            </div>
          )}
          {top && (
            <div className="ai-listen-row">
              <span>{labels[top.index]?.label ?? `#${top.index}`}</span>
              <strong className="on">{Math.round(top.score * 100)}%</strong>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
