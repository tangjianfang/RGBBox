import { useEffect, useState, type JSX } from 'react'
import { Copy, Languages, Sparkles, Wand2, HelpCircle, X } from 'lucide-react'
import { useI18n } from '../i18n'

/** R119: the selection-AI floating window (?selectionAi=1). Pulls the
 *  captured text on mount, offers translate/polish/explain/custom prompts,
 *  runs them through the ACTIVE profile (AI8 included via R118 dispatch)
 *  and shows + copies the result. Esc closes. */
export function SelectionAiView(): JSX.Element {
  const { t } = useI18n()
  const [source, setSource] = useState('')
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState<'translate' | 'polish' | 'explain' | 'custom' | null>(null)
  const [result, setResult] = useState('')
  const [hint, setHint] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void window.rgbbox.selectionAiGetText().then(setSource)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') void window.rgbbox.selectionAiClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const run = (action: 'translate' | 'polish' | 'explain' | 'custom') => {
    if (busy !== null || (action === 'custom' && custom.trim() === '')) return
    setBusy(action)
    setHint('')
    setResult('')
    void window.rgbbox.selectionAiRun(action, action === 'custom' ? custom : undefined)
      .then((out) => {
        if (out.ok) setResult(out.text)
        else setHint(t((out.hint === 'nokey' ? 'sel.ai.noKey' : out.hint === 'auth' ? 'sel.ai.authFail' : 'sel.ai.fail') as never))
      })
      .catch(() => setHint(t('sel.ai.fail')))
      .finally(() => setBusy(null))
  }

  const copy = () => {
    if (result === '') return
    void window.rgbbox.clipboardWriteText(result).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    })
  }

  const Btn = ({ action, icon, labelKey }: { action: 'translate' | 'polish' | 'explain'; icon: JSX.Element; labelKey: string }) => (
    <button
      type="button"
      className={`sel-btn${busy === action ? ' busy' : ''}`}
      data-action={`sel-${action}`}
      disabled={busy !== null}
      onClick={() => run(action)}
    >
      {icon} {t(labelKey as never)}{busy === action ? '…' : ''}
    </button>
  )

  return (
    <div className="sel-ai" data-field="sel-ai-root">
      <header className="sel-ai-head">
        <span>{t('sel.ai.title')}</span>
        <button type="button" className="sel-ai-close" aria-label={t('sel.ai.close')} onClick={() => void window.rgbbox.selectionAiClose()}>
          <X size={14} />
        </button>
      </header>

      <section className="sel-ai-source" data-field="sel-ai-source" title={source}>
        {source.slice(0, 240)}{source.length > 240 ? '…' : ''}
      </section>

      <div className="sel-ai-actions">
        <Btn action="translate" icon={<Languages size={13} />} labelKey="sel.ai.translate" />
        <Btn action="polish" icon={<Wand2 size={13} />} labelKey="sel.ai.polish" />
        <Btn action="explain" icon={<HelpCircle size={13} />} labelKey="sel.ai.explain" />
      </div>

      <div className="sel-ai-custom">
        <input
          data-field="sel-ai-custom"
          value={custom}
          placeholder={t('sel.ai.customPlaceholder')}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); run('custom') } }}
        />
        <button type="button" className="sel-btn" data-action="sel-custom" disabled={busy !== null || custom.trim() === ''} onClick={() => run('custom')}>
          <Sparkles size={13} /> {busy === 'custom' ? '…' : t('sel.ai.run')}
        </button>
      </div>

      {hint !== '' && <p className="sel-ai-hint">{hint}</p>}
      <section className="sel-ai-result" data-field="sel-ai-result">{result}</section>

      {result !== '' && (
        <footer className="sel-ai-foot">
          <button type="button" className="sel-btn" data-action="sel-copy" onClick={copy}>
            <Copy size={12} /> {copied ? t('sel.ai.copied') : t('sel.ai.copy')}
          </button>
        </footer>
      )}
    </div>
  )
}
