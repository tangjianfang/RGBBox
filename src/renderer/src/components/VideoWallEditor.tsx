import { useState, type JSX } from 'react'
import type { DisplayTopology, VideoWallFit, VideoWallLayout, VideoWallPanel } from '../../../shared/types'
import { buildMatrixLayout, getPanelActiveRect, summarizeLayout } from '../../../engine/videoWall'
import { useI18n } from '../i18n'
import type { TranslationKey } from '../i18n'

const MIN_DIM = 1
const MAX_DIM = 8
const MAX_BEZEL = 0.49
const ROTATION_PRESETS = [0, 90, 180, 270] as const
const FIT_OPTIONS: VideoWallFit[] = ['stretch', 'contain', 'cover']

interface VideoWallEditorProps {
  /** Current layout for the active scene, or undefined when wall mode is off. */
  layout?: VideoWallLayout
  /** Physical displays available for per-panel mapping. */
  topology?: DisplayTopology | null
  /** Emits the next layout, or undefined to disable wall mode. */
  onChange: (layout: VideoWallLayout | undefined) => void
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

/**
 * Rebuild the panel grid for a new rows×cols size while preserving the
 * rotation / displayId of panels that still exist at the same (row, col).
 */
function resizePanels(layout: VideoWallLayout, rows: number, cols: number): VideoWallPanel[] {
  const byCell = new Map<string, VideoWallPanel>()
  for (const panel of layout.panels) byCell.set(`${panel.row},${panel.col}`, panel)
  const panels: VideoWallPanel[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const existing = byCell.get(`${row},${col}`)
      panels.push({
        id: `panel-${row}-${col}`,
        col,
        row,
        rotation: existing?.rotation ?? 0,
        displayId: existing?.displayId,
        label: `R${row + 1}C${col + 1}`
      })
    }
  }
  return panels
}

export function VideoWallEditor({ layout, topology, onChange }: VideoWallEditorProps): JSX.Element {
  const { t } = useI18n()
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null)
  const enabled = Boolean(layout)
  const displays = topology?.displays ?? []

  const toggleEnabled = (): void => {
    if (enabled) {
      onChange(undefined)
      setSelectedPanelId(null)
      return
    }
    const next = buildMatrixLayout(2, 2, { displayIds: displays.map((d) => d.id) })
    onChange(next)
  }

  if (!layout) {
    return (
      <div className="videowall-editor">
        <div className="videowall-head">
          <span className="videowall-title">{t('videowall.title')}</span>
          <button className="aspect-lock-btn" type="button" aria-pressed={false} onClick={toggleEnabled}>
            {t('videowall.enable')}
          </button>
        </div>
        <p className="videowall-hint">{t('videowall.hint')}</p>
      </div>
    )
  }

  const patch = (next: Partial<VideoWallLayout>): void => {
    onChange({ ...layout, ...next })
  }

  const setRows = (rows: number): void => {
    const safe = clamp(Math.round(rows), MIN_DIM, MAX_DIM)
    patch({ rows: safe, panels: resizePanels(layout, safe, layout.cols) })
  }

  const setCols = (cols: number): void => {
    const safe = clamp(Math.round(cols), MIN_DIM, MAX_DIM)
    patch({ cols: safe, panels: resizePanels(layout, layout.rows, safe) })
  }

  const updatePanel = (id: string, next: Partial<VideoWallPanel>): void => {
    patch({ panels: layout.panels.map((p) => (p.id === id ? { ...p, ...next } : p)) })
  }

  const selectedPanel = layout.panels.find((p) => p.id === selectedPanelId) ?? null

  return (
    <div className="videowall-editor">
      <div className="videowall-head">
        <span className="videowall-title">{t('videowall.title')}</span>
        <button className="aspect-lock-btn locked" type="button" aria-pressed onClick={toggleEnabled}>
          {t('videowall.disable')}
        </button>
      </div>

      <div className="videowall-dims">
        <label className="videowall-field">
          <span>{t('videowall.rows')}</span>
          <input
            type="number" min={MIN_DIM} max={MAX_DIM} step={1} value={layout.rows}
            onChange={(e) => setRows(Number(e.target.value))}
          />
        </label>
        <label className="videowall-field">
          <span>{t('videowall.cols')}</span>
          <input
            type="number" min={MIN_DIM} max={MAX_DIM} step={1} value={layout.cols}
            onChange={(e) => setCols(Number(e.target.value))}
          />
        </label>
      </div>

      <label className="control-line">
        <span>{t('videowall.bezel')}</span>
        <input
          type="range" min={0} max={MAX_BEZEL} step={0.01} value={layout.bezel}
          onChange={(e) => patch({ bezel: clamp(Number(e.target.value), 0, MAX_BEZEL) })}
        />
        <strong>{Math.round(layout.bezel * 100)}%</strong>
      </label>

      <label className="videowall-check">
        <input
          type="checkbox" checked={layout.bezelCompensation}
          onChange={(e) => patch({ bezelCompensation: e.target.checked })}
        />
        <span>{t('videowall.bezelCompensation')}</span>
      </label>

      <div className="videowall-fit">
        <span className="videowall-field-label">{t('videowall.fit')}</span>
        <div className="videowall-fit-buttons">
          {FIT_OPTIONS.map((fit) => (
            <button
              key={fit}
              className={`zone-mask-btn ${layout.fit === fit ? 'active' : ''}`}
              type="button"
              aria-pressed={layout.fit === fit}
              onClick={() => patch({ fit })}
            >
              {t(`videowall.fit.${fit}` as TranslationKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="videowall-grid-wrap">
        <span className="videowall-field-label">{t('videowall.panels')}</span>
        <div className="videowall-grid" role="group" aria-label={t('videowall.panels')}>
          {layout.panels.map((panel) => {
            const rect = getPanelActiveRect(panel, layout)
            const active = panel.id === selectedPanelId
            const mapped = displays.find((d) => d.id === panel.displayId)
            return (
              <button
                key={panel.id}
                type="button"
                className={`videowall-cell ${active ? 'active' : ''}`}
                aria-pressed={active}
                title={mapped ? mapped.label : t('videowall.unmapped')}
                style={{
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.width * 100}%`,
                  height: `${rect.height * 100}%`,
                  transform: `rotate(${panel.rotation}deg)`
                }}
                onClick={() => setSelectedPanelId(panel.id)}
              >
                <span className="videowall-cell-label">{panel.label}</span>
                <span className="videowall-cell-map">{mapped ? mapped.label : '—'}</span>
              </button>
            )
          })}
        </div>
      </div>

      {selectedPanel && (
        <div className="videowall-panel-edit">
          <span className="videowall-field-label">
            {t('videowall.panel')} {selectedPanel.label}
          </span>
          <div className="videowall-rotation">
            <span>{t('videowall.rotation')}</span>
            <div className="videowall-rotation-buttons">
              {ROTATION_PRESETS.map((deg) => (
                <button
                  key={deg}
                  className={`zone-mask-btn ${selectedPanel.rotation === deg ? 'active' : ''}`}
                  type="button"
                  aria-pressed={selectedPanel.rotation === deg}
                  onClick={() => updatePanel(selectedPanel.id, { rotation: deg })}
                >
                  {deg}°
                </button>
              ))}
            </div>
          </div>
          <label className="select-line">
            <span>{t('videowall.mapDisplay')}</span>
            <select
              value={selectedPanel.displayId ?? ''}
              onChange={(e) =>
                updatePanel(selectedPanel.id, {
                  displayId: e.target.value === '' ? undefined : Number(e.target.value)
                })
              }
            >
              <option value="">{t('videowall.unmapped')}</option>
              {displays.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <p className="videowall-summary">{summarizeLayout(layout)}</p>
    </div>
  )
}
