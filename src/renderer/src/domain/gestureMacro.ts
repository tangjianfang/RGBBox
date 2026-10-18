// R306/T8: the gesture macro presets + persistence — the user-editable view
// over the CLOSED decision matrix (vision/gestureActions.js). The learning
// surface stays the 6 USER_VOCAB words; macros only re-map what each word
// DOES per scene. Three shipped presets; every cell comes from the closed
// action set; the SHARED validator (validateGestureSceneMap) is the single
// conflict gate — a table that fails it is never persisted nor applied.
//
// Scene granularity: games scenes stay 'none' in every preset (R131 — the
// games mapping table owns that surface; double-binding is a validation
// error by design).
import { GESTURES, SCENES, GESTURE_SCENE_MAP, validateGestureSceneMap } from '../vision/gestureActions'
import type { GestureSceneMap } from '../vision/gestureActions'

export type MacroMap = GestureSceneMap
export const MACRO_STORAGE_KEY = 'rgbbox:gestureMacros'

/** non-games scenes a preset fills uniformly (games = exempt, R131) */
const PRESET_SCENES = SCENES.filter((s) => s !== 'games')

type CellSpec = { action: string; cooldownMs: number; guard: 'always' | 'explicit-mode' }

/** whole-gesture assignments per preset (sector-level refinement is T9's
 *  resolveAction layer; here one word = one intent) */
interface PresetSpec {
  id: 'light-drive' | 'present' | 'party'
  zh: string
  en: string
  cells: Partial<Record<(typeof GESTURES)[number], CellSpec>>
}

export const MACRO_PRESETS: ReadonlyArray<PresetSpec> = Object.freeze([
  {
    id: 'light-drive',
    zh: '灯效驾驶',
    en: 'Light driving',
    cells: {
      pinch: { action: 'selectEffect', cooldownMs: 300, guard: 'always' },
      palm: { action: 'togglePause', cooldownMs: 500, guard: 'always' },
      dir8: { action: 'brightnessStep', cooldownMs: 400, guard: 'always' },
      'double-pinch': { action: 'nextScene', cooldownMs: 900, guard: 'always' },
      'chord-light': { action: 'openMenu', cooldownMs: 800, guard: 'explicit-mode' },
    },
  },
  {
    id: 'present',
    zh: '演示翻页',
    en: 'Presentation paging',
    cells: {
      dir8: { action: 'nextCurated', cooldownMs: 600, guard: 'always' },
      pinch: { action: 'prevCurated', cooldownMs: 600, guard: 'always' },
      palm: { action: 'togglePause', cooldownMs: 500, guard: 'always' },
      'double-pinch': { action: 'nextScene', cooldownMs: 900, guard: 'always' },
      'chord-light': { action: 'openMenu', cooldownMs: 800, guard: 'explicit-mode' },
      'chord-menu': { action: 'openMenu', cooldownMs: 0, guard: 'always' },
    },
  },
  {
    id: 'party',
    zh: '音乐派对',
    en: 'Music party',
    cells: {
      dir8: { action: 'brightnessStep', cooldownMs: 400, guard: 'always' },
      pinch: { action: 'toggleFavorite', cooldownMs: 700, guard: 'always' },
      palm: { action: 'togglePause', cooldownMs: 500, guard: 'always' },
      'double-pinch': { action: 'nextScene', cooldownMs: 300, guard: 'always' },
      'chord-light': { action: 'openMenu', cooldownMs: 800, guard: 'explicit-mode' },
    },
  },
])

/** Build the FULL 6×8 table for a preset (uniform across non-games scenes). */
export function buildPresetMap(presetId: string): MacroMap {
  const preset = MACRO_PRESETS.find((p) => p.id === presetId)
  if (!preset) throw new Error(`unknown macro preset: ${presetId}`)
  const map: MacroMap = {}
  for (const g of GESTURES) {
    map[g] = {}
    for (const s of SCENES) {
      const cell = PRESET_SCENES.includes(s) ? preset.cells[g] : undefined
      map[g][s] = cell ? { ...cell } : { action: 'none', cooldownMs: 0, guard: 'always' }
    }
  }
  return map
}

/** The single conflict gate — delegates to the SHARED validator so macro
 *  tables and the default table can never drift apart in validity rules. */
export function validateMacroMap(map: MacroMap): string[] {
  return validateGestureSceneMap(map)
}

/** Persist the ACTIVE macro table. A table failing validation is rejected
 *  (returns the errors) — a broken table must never reach consumers. */
export function persistMacroMap(map: MacroMap): string[] {
  const errors = validateMacroMap(map)
  if (errors.length) return errors
  try { localStorage.setItem(MACRO_STORAGE_KEY, JSON.stringify(map)) } catch { /* non-fatal */ }
  return []
}

/** The active table: stored-and-valid, else the shipped default. Damaged
 *  payloads and invalid tables both fall back — never crash, never apply
 *  something that fails the gate. */
export function loadMacroMap(): MacroMap {
  try {
    const raw = localStorage.getItem(MACRO_STORAGE_KEY)
    if (!raw) return GESTURE_SCENE_MAP
    const parsed = JSON.parse(raw) as MacroMap
    if (validateMacroMap(parsed).length) return GESTURE_SCENE_MAP
    return parsed
  } catch {
    return GESTURE_SCENE_MAP
  }
}

/** Safe lookup for consumers (T9): unknown gesture/scene/game cells resolve
 *  to a inert none cell instead of throwing. */
export function resolveMacro(map: MacroMap, gesture: string, scene: string): { action: string; cooldownMs: number; guard: string } {
  const cell = map[gesture]?.[scene]
  return cell ?? { action: 'none', cooldownMs: 0, guard: 'always' }
}
