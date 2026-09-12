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

export type ModuleView = 'workspace' | 'effects' | 'video' | 'audio' | 'model3d' | 'games' | 'diagnostics' | 'architecture'

export const MODULE_META: Record<ModuleView, ShellModuleMeta> = {
  workspace:    { view: 'workspace',    labelKey: 'nav.workspace',    descKey: 'dash.desc.workspace',    icon: Monitor },
  effects:      { view: 'effects',      labelKey: 'nav.effects',      descKey: 'dash.desc.effects',      icon: Sparkles },
  video:        { view: 'video',        labelKey: 'nav.video',        descKey: 'dash.desc.video',        icon: Video },
  audio:        { view: 'audio',        labelKey: 'nav.audio',        descKey: 'dash.desc.audio',        icon: Music },
  model3d:      { view: 'model3d',      labelKey: 'nav.model3d',      descKey: 'dash.desc.model3d',      icon: Box },
  games:        { view: 'games',        labelKey: 'nav.games',        descKey: 'dash.desc.games',        icon: Gamepad2 },
  diagnostics:  { view: 'diagnostics',  labelKey: 'nav.diagnostics',  descKey: 'dash.desc.diagnostics',  icon: Gauge },
  architecture: { view: 'architecture', labelKey: 'nav.architecture', descKey: 'dash.desc.architecture', icon: Cpu }
}

export interface ShellSection {
  key: TranslationKey
  views: View[]
}

/** Dashboard 固定三分区（R85.1，用户已确认：不做自定义/频率自适应） */
export const DASHBOARD_SECTIONS: ShellSection[] = [
  { key: 'dash.section.core',   views: ['workspace', 'effects'] },
  { key: 'dash.section.create', views: ['video', 'audio', 'model3d'] },
  { key: 'dash.section.tools',  views: ['games', 'diagnostics', 'architecture'] }
]

const TAB_LABEL_KEYS: Partial<Record<View, TranslationKey>> = {
  dashboard: 'nav.dashboard',
  settings: 'nav.settings'
}
const TAB_ICONS: Partial<Record<View, LucideIcon>> = {
  dashboard: LayoutGrid,
  settings: Settings
}

/** Label + icon for any tabbable view (module views come from MODULE_META). */
export function getTabMeta(view: View): { labelKey: TranslationKey; icon: LucideIcon } {
  const meta = MODULE_META[view as ModuleView]
  if (meta) return { labelKey: meta.labelKey, icon: meta.icon }
  return { labelKey: TAB_LABEL_KEYS[view] ?? 'nav.dashboard', icon: TAB_ICONS[view] ?? LayoutGrid }
}
