import { Monitor } from 'lucide-react'
import { lazy, Suspense, useCallback, useRef, useState, type ChangeEvent, type JSX, type RefObject } from 'react'
import { useModelStore } from '../3d/useModelStore'
import { useI18n } from '../i18n'

// Lazily loaded — vendor-splat (1.6MB) is only fetched when the 3D view is first opened
const SplatViewer = lazy(() => import('../3d/SplatViewer').then((m) => ({ default: m.SplatViewer })))
const LEDMapper = lazy(() => import('../3d/LEDMapper').then((m) => ({ default: m.LEDMapper })))

/**
 * R147 P3b: the (compile-time disabled) model3d view, extracted verbatim from
 * App.tsx's inline JSX. Owns its model store + selection state internally —
 * nothing outside consumes them. Mounted only when MODEL3D_VIEW_ENABLED is
 * true (App keeps the compile-time flag), hence useModelStore(true).
 */
export function Model3DView(props: {
  ledColorsRef: RefObject<Uint8Array>
  engineRunning: boolean
  onBack: () => void
}): JSX.Element {
  const { t } = useI18n()
  const { ledColorsRef, engineRunning, onBack } = props
  const { models: splatModels, loading: splatLoading, importFile: importSplatFile, downloadModel: downloadSplatModel } = useModelStore(true)
  const [selectedModelIndex, setSelectedModelIndex] = useState(0)
  const [ledMapperOpen, setLedMapperOpen] = useState(false)
  const selectedModel = splatModels[selectedModelIndex] ?? null
  const splatFileInputRef = useRef<HTMLInputElement | null>(null)

  const handleSplatImport = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const model = importSplatFile(file)
    // Auto-select the newly imported model
    const newIndex = splatModels.length  // will be appended at the end
    setSelectedModelIndex(newIndex)
    setLedMapperOpen(false)
    // Reset the input so the same file can be re-imported if needed
    e.target.value = ''
    void model
  }, [importSplatFile, splatModels.length])

  return (
    <div className="model3d-view">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">{t('model3d.eyebrow')}</p>
          <h2>{t('model3d.title')}</h2>
        </div>
        <div className="metric-row">
          <button
            className="aspect-lock-btn model3d-back-btn"
            type="button"
            onClick={onBack}
          >
            <Monitor size={13} />
            {t('nav.workspace')}
          </button>
          {splatLoading ? (
            <span className="chip">{t('model3d.loading')}</span>
          ) : (
            <span className="chip">{splatModels.length === 1 ? t('model3d.models').replace('{count}', String(splatModels.length)) : t('model3d.modelsPlural').replace('{count}', String(splatModels.length))}</span>
          )}
        </div>
      </header>

      <div className="model3d-toolbar">
        <select
          className="profile-select"
          value={selectedModelIndex}
          disabled={splatModels.length === 0}
          onChange={(e) => { setSelectedModelIndex(Number(e.target.value)); setLedMapperOpen(false) }}
        >
          {splatModels.length === 0 && <option value={0}>{t('model3d.noModels')}</option>}
          {splatModels.map((m, i) => (
            <option key={m.name} value={i}>{m.name}</option>
          ))}
        </select>
        <button
          className="aspect-lock-btn"
          type="button"
          title={t('model3d.importHint')}
          onClick={() => splatFileInputRef.current?.click()}
        >
          📂 {t('model3d.importModel')}
        </button>
        <input
          ref={splatFileInputRef}
          type="file"
          accept=".splat,.ply,.ksplat,.spz"
          style={{ display: 'none' }}
          onChange={handleSplatImport}
        />
        {selectedModel && (
          <button
            className={`aspect-lock-btn${ledMapperOpen ? ' locked' : ''}`}
            type="button"
            onClick={() => setLedMapperOpen((v) => !v)}
          >
            🎯 {ledMapperOpen ? t('model3d.closeLedMapper') : t('model3d.openLedMapper')}
          </button>
        )}
      </div>

      {selectedModel && ledMapperOpen ? (
        <Suspense fallback={<div className="model3d-splat-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>{t('model3d.loadingLedMapper')}</div>}>
          <LEDMapper
            model={selectedModel}
            initialLedMap={selectedModel.ledMap}
          />
        </Suspense>
      ) : selectedModel && selectedModel.downloadStatus !== 'cached' ? (
        <div className="model3d-splat-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
          {selectedModel.downloadStatus === 'error' ? (
            <>
              <p style={{ color: 'var(--color-error, #f87171)', margin: 0 }}>⚠ {selectedModel.downloadError ?? t('model3d.downloadError')}</p>
              <button className="aspect-lock-btn" type="button" onClick={() => void downloadSplatModel(selectedModel.name)}>
                {t('model3d.retry')}
              </button>
            </>
          ) : selectedModel.downloadStatus === 'downloading' ? (
            <>
              <p style={{ margin: 0, opacity: 0.8 }}>{t('model3d.downloading').replace('{name}', selectedModel.name)}</p>
              <div style={{ width: 260, height: 6, background: 'rgba(255,255,255,0.12)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${selectedModel.downloadProgress}%`, height: '100%', background: 'var(--color-accent, #38bdf8)', transition: 'width 0.3s' }} />
              </div>
              <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>{selectedModel.downloadProgress}%</span>
            </>
          ) : (
            <>
              <p style={{ margin: 0, opacity: 0.7 }}>{t('model3d.notDownloaded')}</p>
              <button className="aspect-lock-btn" type="button" onClick={() => void downloadSplatModel(selectedModel.name)}>
                {t('model3d.download').replace('{name}', selectedModel.name)}
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="model3d-splat-wrapper">
          <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.5 }}>{t('model3d.loadingViewer')}</div>}>
            <SplatViewer
              model={selectedModel}
              ledColors={ledColorsRef.current}
              paused={!engineRunning}
            />
          </Suspense>
        </div>
      )}
    </div>
  )
}
