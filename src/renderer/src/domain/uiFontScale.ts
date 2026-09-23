/**
 * R160.4: Dynamic-Type-equivalent font scale tiers. The whole app's type ramp
 * lives in rem against the 16px root (base.css); a tier rewrites that one
 * root declaration, so every rem size follows. 130% is the deliberate cap
 * this round — higher tiers need their own layout validation pass first.
 */
export const UI_FONT_SCALE_TIERS = [
  { id: 'xs', factor: 0.85 },
  { id: 'sm', factor: 0.92 },
  { id: 'md', factor: 1.0 },
  { id: 'lg', factor: 1.15 },
  { id: 'xl', factor: 1.3 },
] as const

export type UiFontScaleId = (typeof UI_FONT_SCALE_TIERS)[number]['id']

export const UI_FONT_SCALE_DEFAULT: UiFontScaleId = 'md'

/** Root px for a stored id; unknown ids fall back to the default tier. */
export function uiFontScalePx(id: string): number {
  const tier = UI_FONT_SCALE_TIERS.find((t) => t.id === id) ?? UI_FONT_SCALE_TIERS[2]
  return Math.round(16 * tier.factor * 1000) / 1000
}
