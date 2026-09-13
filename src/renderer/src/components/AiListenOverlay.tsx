import { useCallback, useEffect, useState, type JSX } from 'react'
import { BrainCircuit } from 'lucide-react'
import { useI18n } from '../i18n'
import { useAiAudioStream } from '../hooks/useAiAudioStream'
import labels from '../assets/audioset-labels.json'

const VAD_THRESHOLD = 0.5
const ERROR_KEYS: Record<string, string> = {
  'source-unavailable': 'player.aiListen.errSource',
  'permission-denied': 'player.aiListen.errPermission',
  'not-downloaded': 'player.aiListen.needModel',
}

/** R90.8: compact AI-listen overlay for the media studios — captures the
 *  system loopback while media plays and shows live VAD/AST results.
 *  Mounted alongside (not inside) the player components — zero player changes. */
export function AiListenOverlay(): JSX.Element {
  const { t } = useI18n()
  const [enabled, setEnabled] = useState(false)
  const [modelsReady, setModelsReady] = useState<boolean | null>(null) // null = checking
  const [downloading, setDownloading] = useState<number | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const { running, error, vadProb, astTop, level } = useAiAudioStream(enabled && modelsReady === true ? 'system' : null)

  const refreshStatus = useCallback(async () => {
    try {
      const s = await window.rgbbox.audioAiStatus()
      setModelsReady(s.sileroCached && s.astCached)
      if (s.sileroCached && s.astCached) setDownloadError(null)
    } catch {
      setModelsReady(false)
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
    const unsub = window.rgbbox.onModelDownloadProgress((p) => {
      if (p.name !== 'silero_vad' && p.name !== 'ast_audioset') return
      // R90: retry notices arrive as {error} with done:false — surface them
      // instead of silently resetting; terminal failures keep the message up.
      if (p.done) {
        if (p.error) setDownloadError(p.error)
        else setDownloadError(null)
        void refreshStatus()
        setDownloading(null)
      } else if (p.error) {
        setDownloadError(`retrying: ${p.error}`)
      } else {
        setDownloadError(null)
        setDownloading(Math.round(p.percent))
      }
    })
    return unsub
  }, [refreshStatus])

  const downloadModels = () => {
    void window.rgbbox.modelDownload('silero_vad')
    void window.rgbbox.modelDownload('ast_audioset')
  }

  const localErr = error !== null ? (ERROR_KEYS[error] ?? null) : null
  const rows = (astTop ?? []).slice(0, 3)

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
          {modelsReady === false && (
            <div className="ai-listen-models">
              <p className="ai-lab-desc">{t('player.aiListen.needModel')}</p>
              {downloading !== null && <span className="ai-lab-status">{t('ai.lab.audio.progress')} {downloading}%</span>}
              {downloadError !== null && <div className="ai-hint-line">{downloadError}</div>}
              {downloading === null && (
                <button type="button" onClick={downloadModels}>{t('ai.lab.audio.download')}</button>
              )}
            </div>
          )}
          {modelsReady === true && running && <div className="ai-lab-status">{t('player.aiListen.listening')}</div>}
          {localErr !== null && <div className="ai-hint-line">{t(localErr as never)}</div>}
          {error !== null && localErr === null && <div className="ai-hint-line">{error}</div>}
          {vadProb !== null && (
            <div className="ai-listen-row">
              <span>{t('ai.lab.audio.vad.prob')}</span>
              <strong className={vadProb >= VAD_THRESHOLD ? 'on' : ''}>{Math.round(vadProb * 100)}%</strong>
            </div>
          )}
          {running && (
            <div className="ai-listen-row">
              <span>{t('ai.lab.audio.level')}</span>
              <div className="ai-prob-bar ai-listen-level">
                <span style={{ width: `${Math.round(Math.min(1, level) * 100)}%` }} />
              </div>
            </div>
          )}
          {vadProb !== null && (
            <div className="ai-listen-row">
              <span>{vadProb >= VAD_THRESHOLD ? t('ai.lab.audio.vad.speech') : t('ai.lab.audio.vad.quiet')}</span>
            </div>
          )}
          {rows.map((row) => (
            <div key={row.index} className="ai-listen-row">
              <span>{labels[row.index]?.label ?? `#${row.index}`}</span>
              <strong className="on">{Math.round(row.score * 100)}%</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
