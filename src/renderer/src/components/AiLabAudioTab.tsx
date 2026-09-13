import { useState, type JSX } from 'react'
import { useI18n } from '../i18n'
import { useAiAudioStream, type AiAudioSource } from '../hooks/useAiAudioStream'
import labels from '../assets/audioset-labels.json'

const VAD_THRESHOLD = 0.5

/** R90.8: continuous audio AI detection — VAD probability updates live
 *  (every ~300ms feed) and AST classifies the last 3s on a 2s cadence.
 *  Source: microphone or the system loopback (whatever is playing). */
export function AiLabAudioTab(): JSX.Element {
  const { t } = useI18n()
  const [source, setSource] = useState<AiAudioSource | null>(null)
  const { running, error, vadProb, astTop } = useAiAudioStream(source)

  const vadPct = vadProb === null ? null : Math.round(vadProb * 100)

  return (
    <div className="ai-audio">
      <div className="ai-audio-card">
        <div className="ai-audio-card-head">
          <strong>{t('ai.lab.audio.live')}</strong>
          <span className="ai-lab-status">
            {running && `● ${t('ai.lab.audio.liveOn')}`}
            {error && <span className="ai-hint-line">{error}</span>}
          </span>
        </div>
        <div className="ai-source-row" role="radiogroup" aria-label={t('ai.lab.audio.source')}>
          <label>
            <input
              type="radio"
              name="ai-audio-source"
              checked={source === 'mic'}
              onChange={() => setSource(source === 'mic' ? null : 'mic')}
            />
            <span>{t('ai.lab.audio.source.mic')}</span>
          </label>
          <label>
            <input
              type="radio"
              name="ai-audio-source"
              checked={source === 'system'}
              onChange={() => setSource(source === 'system' ? null : 'system')}
            />
            <span>{t('ai.lab.audio.source.system')}</span>
          </label>
        </div>
        <p className="ai-lab-desc">{t('ai.lab.audio.desc.live')}</p>
      </div>

      <div className="ai-audio-card">
        <div className="ai-audio-card-head">
          <strong>{t('ai.lab.audio.title.vad')}</strong>
          {vadPct !== null && <span className="ai-lab-status">{vadPct}%</span>}
        </div>
        {vadPct !== null ? (
          <div data-field="vad-result" className="ai-prob">
            <div className="ai-prob-bar">
              <span style={{ width: `${vadPct}%` }} />
            </div>
            <span>{vadProb! >= VAD_THRESHOLD ? t('ai.lab.audio.vad.speech') : t('ai.lab.audio.vad.quiet')}</span>
          </div>
        ) : (
          <p className="ai-lab-desc">{t('ai.lab.audio.vad.hint')}</p>
        )}
      </div>

      <div className="ai-audio-card">
        <div className="ai-audio-card-head">
          <strong>{t('ai.lab.audio.title.ast')}</strong>
        </div>
        {astTop !== null ? (
          <div data-field="ast-result" className="ai-ast">
            {astTop.map((row) => (
              <div key={row.index} className="ai-ast-row">
                <span>{labels[row.index]?.label ?? `#${row.index}`}</span>
                <span>{Math.round(row.score * 100)}%</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="ai-lab-desc">{t('ai.lab.audio.ast.hint')}</p>
        )}
      </div>
    </div>
  )
}
