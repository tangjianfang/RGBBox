import type { DisplayTopology } from '../../../shared/types'
import type { JSX } from 'react'

interface DisplayMapProps {
  topology: DisplayTopology
  overlayDisplayIds?: number[]
  onToggleOverlay?: (displayId: number) => void
}

export function DisplayMap({ topology, overlayDisplayIds = [], onToggleOverlay }: DisplayMapProps): JSX.Element {
  const { virtualBounds } = topology
  const safeWidth = Math.max(1, virtualBounds.width)
  const safeHeight = Math.max(1, virtualBounds.height)

  return (
    <div className="display-map" aria-label="Detected displays">
      {topology.displays.map((display) => {
        const left = ((display.bounds.x - virtualBounds.x) / safeWidth) * 100
        const top = ((display.bounds.y - virtualBounds.y) / safeHeight) * 100
        const width = (display.bounds.width / safeWidth) * 100
        const height = (display.bounds.height / safeHeight) * 100
        const overlayActive = overlayDisplayIds.includes(display.id)

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
          </div>
        )
      })}
    </div>
  )
}
