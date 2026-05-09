import { useState, type JSX, type PointerEvent as ReactPointerEvent } from 'react'
import type { DisplayTopology, OverlayConfig, OverlayRegionCustom, OverlayRegionPreset } from '../../../shared/types'

const REGION_OPTIONS: Array<{ value: OverlayRegionPreset; label: string }> = [
  { value: 'fullscreen',    label: '全屏' },
  { value: 'top-third',     label: '上' },
  { value: 'middle-third',  label: '中' },
  { value: 'bottom-third',  label: '下' },
  { value: 'left-third',    label: '左' },
  { value: 'center-third',  label: '中列' },
  { value: 'right-third',   label: '右' },
  { value: 'custom',        label: '自定义' },
]

const DEFAULT_CONFIG: OverlayConfig = { region: 'fullscreen' }
const DEFAULT_CUSTOM: OverlayRegionCustom = { x: 0, y: 0, width: 1, height: 1 }

interface DragSelection {
  displayId: number
  startX: number
  startY: number
  currentX: number
  currentY: number
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function eventToNormalizedPoint(event: ReactPointerEvent<HTMLDivElement>): { x: number; y: number } {
  const rect = event.currentTarget.getBoundingClientRect()
  const x = clamp01((event.clientX - rect.left) / Math.max(1, rect.width))
  const y = clamp01((event.clientY - rect.top) / Math.max(1, rect.height))
  return { x, y }
}

function selectionToCustom(selection: DragSelection): OverlayRegionCustom {
  const left = Math.min(selection.startX, selection.currentX)
  const top = Math.min(selection.startY, selection.currentY)
  const width = Math.max(0.02, Math.abs(selection.currentX - selection.startX))
  const height = Math.max(0.02, Math.abs(selection.currentY - selection.startY))
  const x = clamp01(left)
  const y = clamp01(top)

  return {
    x,
    y,
    width: Math.max(0.02, Math.min(1 - x, width)),
    height: Math.max(0.02, Math.min(1 - y, height)),
  }
}

interface DisplayMapProps {
  topology: DisplayTopology
  overlayDisplayIds?: number[]
  onToggleOverlay?: (displayId: number) => void
  overlayConfigs?: Record<number, OverlayConfig>
  onOverlayConfigChange?: (displayId: number, config: OverlayConfig) => void
}

export function DisplayMap({ topology, overlayDisplayIds = [], onToggleOverlay, overlayConfigs = {}, onOverlayConfigChange }: DisplayMapProps): JSX.Element {
  const { virtualBounds } = topology
  const safeWidth = Math.max(1, virtualBounds.width)
  const safeHeight = Math.max(1, virtualBounds.height)
  const [dragSelection, setDragSelection] = useState<DragSelection | null>(null)

  return (
    <div className="display-map" aria-label="Detected displays">
      {topology.displays.map((display) => {
        const left = ((display.bounds.x - virtualBounds.x) / safeWidth) * 100
        const top = ((display.bounds.y - virtualBounds.y) / safeHeight) * 100
        const width = (display.bounds.width / safeWidth) * 100
        const height = (display.bounds.height / safeHeight) * 100
        const overlayActive = overlayDisplayIds.includes(display.id)
        const config: OverlayConfig = overlayConfigs[display.id] ?? DEFAULT_CONFIG
        const custom = config.custom ?? DEFAULT_CUSTOM
        const dragRect =
          dragSelection && dragSelection.displayId === display.id
            ? selectionToCustom(dragSelection)
            : null
        const previewRect = dragRect ?? custom

        const updateConfig = (patch: Partial<OverlayConfig>): void => {
          onOverlayConfigChange?.(display.id, { ...config, ...patch })
        }

        const updateCustom = (patch: Partial<OverlayRegionCustom>): void => {
          updateConfig({ custom: { ...custom, ...patch } })
        }

        return (
          <div
            className={`display-tile ${display.primary ? 'primary' : ''} ${overlayActive ? 'overlay-active' : ''}`}
            key={display.id}
            style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
          >
            <strong>{display.label}</strong>
            <span>
              {display.bounds.width}×{display.bounds.height} @ {display.scaleFactor}x
            </span>
            {onToggleOverlay && (
              <button
                className={`overlay-toggle-btn ${overlayActive ? 'active' : ''}`}
                title={overlayActive ? '关闭灯效叠加层' : '开启灯效叠加层'}
                onClick={() => onToggleOverlay(display.id)}
              >
                {overlayActive ? '■ 关闭叠加' : '▶ 开启叠加'}
              </button>
            )}
            {onOverlayConfigChange && (
              <div className="overlay-region-row">
                {REGION_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    className={`overlay-region-btn ${config.region === o.value ? 'active' : ''}`}
                    title={`显示区域：${o.label}`}
                    type="button"
                    onClick={() => updateConfig({ region: o.value })}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
            {config.region === 'custom' && (
              <div className="overlay-custom-panel">
                <div className="overlay-custom-drag-wrap">
                  <div className="overlay-custom-drag-head">
                    <span>拖拽框选区域</span>
                    <button
                      className="overlay-custom-reset-btn"
                      type="button"
                      onClick={() => updateConfig({ custom: DEFAULT_CUSTOM })}
                    >
                      重置
                    </button>
                  </div>
                  <div
                    className="overlay-custom-drag-area"
                    onPointerDown={(event) => {
                      if (event.button !== 0) return
                      const p = eventToNormalizedPoint(event)
                      setDragSelection({
                        displayId: display.id,
                        startX: p.x,
                        startY: p.y,
                        currentX: p.x,
                        currentY: p.y,
                      })
                      event.currentTarget.setPointerCapture(event.pointerId)
                    }}
                    onPointerMove={(event) => {
                      if (!dragSelection || dragSelection.displayId !== display.id) return
                      const p = eventToNormalizedPoint(event)
                      setDragSelection((prev) => {
                        if (!prev || prev.displayId !== display.id) return prev
                        return { ...prev, currentX: p.x, currentY: p.y }
                      })
                    }}
                    onPointerUp={(event) => {
                      if (!dragSelection || dragSelection.displayId !== display.id) return
                      const p = eventToNormalizedPoint(event)
                      const nextSelection: DragSelection = {
                        ...dragSelection,
                        currentX: p.x,
                        currentY: p.y,
                      }
                      updateConfig({ custom: selectionToCustom(nextSelection) })
                      setDragSelection(null)
                      event.currentTarget.releasePointerCapture(event.pointerId)
                    }}
                    onPointerCancel={() => {
                      setDragSelection((prev) =>
                        prev && prev.displayId === display.id ? null : prev
                      )
                    }}
                  >
                    <div className="overlay-custom-drag-grid" />
                    <div
                      className="overlay-custom-selection"
                      style={{
                        left: `${previewRect.x * 100}%`,
                        top: `${previewRect.y * 100}%`,
                        width: `${previewRect.width * 100}%`,
                        height: `${previewRect.height * 100}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="overlay-custom-bounds">
                  {(['x', 'y', 'width', 'height'] as const).map((field) => (
                    <label key={field} className="overlay-custom-field">
                      <span>{field}</span>
                      <input
                        type="number"
                        min={0} max={1} step={0.05}
                        value={custom[field]}
                        onChange={(e) => updateCustom({ [field]: Math.min(1, Math.max(0, Number(e.target.value))) })}
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
