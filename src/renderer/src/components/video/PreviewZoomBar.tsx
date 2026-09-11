/**
 * PreviewZoomBar — 悬浮缩放控制条（PRD R75.1）。
 * －/＋/百分比/复位(适应窗口)/1:1 实际像素。
 */
import { ZoomIn, ZoomOut, Maximize, Crosshair } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { JSX } from 'react'

export interface PreviewZoomBarProps {
  percent: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  onOneToOne: () => void
  disabled: boolean
}

export function PreviewZoomBar({ percent, onZoomIn, onZoomOut, onReset, onOneToOne, disabled }: PreviewZoomBarProps): JSX.Element {
  const { t } = useI18n()
  return (
    <div className="video-zoom-bar" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="video-zoom-btn" onClick={onZoomOut} disabled={disabled} title={t('video.zoom.out')}>
        <ZoomOut size={14} />
      </button>
      <span className="video-zoom-pct">{percent}%</span>
      <button type="button" className="video-zoom-btn" onClick={onZoomIn} disabled={disabled} title={t('video.zoom.in')}>
        <ZoomIn size={14} />
      </button>
      <button type="button" className="video-zoom-btn" onClick={onReset} disabled={disabled} title={t('video.zoom.reset')}>
        <Maximize size={14} />
      </button>
      <button type="button" className="video-zoom-btn" onClick={onOneToOne} disabled={disabled} title={t('video.zoom.oneToOne')}>
        <Crosshair size={14} />
      </button>
    </div>
  )
}
