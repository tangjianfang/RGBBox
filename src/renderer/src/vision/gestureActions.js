// gestureActions (R254 / TASK-UNIVERSE F14) — the gesture→action DECISION
// MATRIX and the action registry it dispatches to. This is the platform
// foundation the macro system (planned T17) builds its user-editable view
// on: macros will edit THIS table, consumers read it.
//
// Design rules:
//   - CLOSED action set (adding one = a PRD decision, like USER_VOCAB)
//   - every cell defaults to 'none' unless a consumer is LIVE today —
//     progressive enablement, no speculative gestures
//   - one gesture × one scene = one action; conflicts are a validation error
//
// Pure JS, node-testable (tests/vision/gestureActions.test.mjs).

export const ACTIONS = Object.freeze([
  'none', 'selectEffect', 'nextCurated', 'prevCurated', 'brightnessStep',
  'togglePause', 'nextScene', 'toggleFavorite', 'navigate', 'openMenu',
])

export const GESTURES = Object.freeze(['dir8', 'pinch', 'palm', 'chord-menu', 'chord-light', 'double-pinch'])
export const SCENES = Object.freeze(['workspace', 'games', 'effects', 'audio', 'video', 'ai', 'settings', 'overlay'])

/**
 * The decision matrix. Values: { action, cooldownMs, guard }
 *  - guard: 'always' | 'explicit-mode' (only inside the light-driving/vision mode)
 * Live consumers as of R254 (default table):
 *  - chord-light × (workspace|effects|audio|video|ai|settings): openMenu —
 *    the LIGHT ring (R229) IS the menu action for that chord
 *  - everything else: 'none' until its consumer lands
 */
const CELL = (action = 'none', cooldownMs = 0, guard = 'always') => ({ action, cooldownMs, guard })

export const GESTURE_SCENE_MAP = Object.freeze((() => {
  const map = {}
  for (const g of GESTURES) {
    map[g] = {}
    for (const s of SCENES) map[g][s] = CELL()
  }
  // live: the light ring chord opens the ring in every non-game scene
  for (const s of ['workspace', 'effects', 'audio', 'video', 'ai', 'settings']) {
    map['chord-light'][s] = CELL('openMenu', 800, 'explicit-mode')
  }
  return Object.freeze(map)
})())

/** Conflict validation: unknown actions, unknown keys, or asymmetric shapes. */
export function validateGestureSceneMap (map = GESTURE_SCENE_MAP) {
  const errors = []
  const actionSet = new Set(ACTIONS)
  for (const g of GESTURES) {
    if (!map[g]) { errors.push(`missing gesture row: ${g}`); continue }
    for (const s of SCENES) {
      const cell = map[g][s]
      if (!cell) { errors.push(`missing cell ${g}×${s}`); continue }
      if (!actionSet.has(cell.action)) errors.push(`unknown action "${cell.action}" at ${g}×${s}`)
      if (cell.guard !== 'always' && cell.guard !== 'explicit-mode') errors.push(`bad guard "${cell.guard}" at ${g}×${s}`)
      if (!(cell.cooldownMs >= 0)) errors.push(`bad cooldown ${cell.cooldownMs} at ${g}×${s}`)
    }
  }
  return errors
}
