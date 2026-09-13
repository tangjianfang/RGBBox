import {
  Box, Cpu, Gamepad2, Gauge, LayoutGrid, Monitor, Music, Settings, Sparkles, Video
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { TranslationKey } from '../i18n'
import type { View } from '../hooks/tabNavigation'

export interface ShellModuleMeta {
  view: View
  labelKey: TranslationKey
  descKey: TranslationKey
  icon: LucideIcon
}

/** Views that get a dashboard card — every module view except settings. */
export const CARD_VIEWS = [
  'workspace', 'effects', 'video', 'audio', 'model3d',
  'games', 'diagnostics', 'architecture'
] as const
export type CardView = (typeof CARD_VIEWS)[number]

// Record<CardView, …> makes TypeScript reject a missing meta entry when a view
// is added to CARD_VIEWS — no silent fallbacks for card modules.
export const MODULE_META: Record<CardView, ShellModuleMeta> = {
  workspace:    { view: 'workspace',    labelKey: 'nav.workspace',    descKey: 'dash.desc.workspace',    icon: Monitor },
  effects:      { view: 'effects',      labelKey: 'nav.effects',      descKey: 'dash.desc.effects',      icon: Sparkles },
  video:        { view: 'video',        labelKey: 'nav.video',        descKey: 'dash.desc.video',        icon: Video },
  audio:        { view: 'audio',        labelKey: 'nav.audio',        descKey: 'dash.desc.audio',        icon: Music },
  model3d:      { view: 'model3d',      labelKey: 'nav.model3d',      descKey: 'dash.desc.model3d',      icon: Box },
  games:        { view: 'games',        labelKey: 'nav.games',        descKey: 'dash.desc.games',        icon: Gamepad2 },
  diagnostics:  { view: 'diagnostics',  labelKey: 'nav.diagnostics',  descKey: 'dash.desc.diagnostics',  icon: Gauge },
  architecture: { view: 'architecture', labelKey: 'nav.architecture', descKey: 'dash.desc.architecture', icon: Cpu }
}

const TAB_META: Record<'dashboard' | 'settings', { labelKey: TranslationKey; icon: LucideIcon }> = {
  dashboard: { labelKey: 'nav.dashboard', icon: LayoutGrid },
  settings: { labelKey: 'nav.settings', icon: Settings }
}

/** Label + icon for any view that can appear in the rail / toolbar title.
 *  Card modules come from MODULE_META (Record<CardView,…> — compile-checked
 *  complete); dashboard/settings come from TAB_META; anything else (the legacy
 *  'profiles' member) falls back safely instead of crashing mid-render. */
export function getTabMeta(view: View): { labelKey: TranslationKey; icon: LucideIcon } {
  const extra = TAB_META[view as keyof typeof TAB_META]
  if (extra) return extra
  const meta = MODULE_META[view as CardView]
  if (meta) return { labelKey: meta.labelKey, icon: meta.icon }
  return { labelKey: 'nav.dashboard', icon: LayoutGrid }
}
