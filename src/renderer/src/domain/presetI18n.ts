import type { TranslationKey } from '../i18n'
import type { PresetDefinition } from '../../../shared/types'

/** Structural minimum for label localization (full presets and kind/label chips both fit). */
type Labelled = Pick<PresetDefinition, 'label' | 'labelKey'>
type Described = Pick<PresetDefinition, 'description' | 'descKey'>

/**
 * R159.1 (E3): preset display text through i18n. t() returns the key itself
 * when a translation is missing, so the persisted English label/description
 * doubles as the fallback. Layer names written from preset.label stay
 * language-neutral by design — only display sites localize through here.
 */
export function presetLabel(preset: Labelled, t: (key: TranslationKey) => string): string {
  if (!preset.labelKey) return preset.label
  const s = t(preset.labelKey)
  return s === preset.labelKey ? preset.label : s
}

export function presetDescription(preset: Described, t: (key: TranslationKey) => string): string {
  if (!preset.descKey) return preset.description
  const s = t(preset.descKey)
  return s === preset.descKey ? preset.description : s
}
