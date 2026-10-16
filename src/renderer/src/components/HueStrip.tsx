import { useMemo, type JSX } from 'react'
import { hexToRgb, hslToRgb } from '../../../engine/color'

/**
 * R304: 感觉色色相条——一条 hsl 彩虹轨道，拖动只换色相、保留原色的饱和度/
 * 明度（做灯的应用，颜色配得上专门控件，而非 hex 输入框）。
 */

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60
  else if (max === gn) h = ((bn - rn) / d + 2) * 60
  else h = ((rn - gn) / d + 4) * 60
  return { h, s, l }
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

export interface HueStripProps {
  /** 当前颜色（#rrggbb） */
  value: string
  onChange: (hex: string) => void
  /** 无障碍标签 */
  ariaLabel: string
}

export function HueStrip({ value, onChange, ariaLabel }: HueStripProps): JSX.Element {
  const hue = useMemo(() => {
    const { r, g, b } = hexToRgb(value)
    return Math.round(rgbToHsl(r, g, b).h)
  }, [value])

  return (
    <input
      className="hue-strip"
      type="range"
      min={0}
      max={359}
      step={1}
      value={hue}
      aria-label={ariaLabel}
      onChange={(e) => {
        const { s, l } = (() => {
          const { r, g, b } = hexToRgb(value)
          return rgbToHsl(r, g, b)
        })()
        const next = hslToRgb(Number(e.target.value), s, l)
        onChange(toHex(next.r, next.g, next.b))
      }}
    />
  )
}
