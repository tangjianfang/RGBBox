import type { EffectKind } from '../../../shared/types'

/**
 * R164.1 (S1): the curated strip's selection rule — data-driven, never
 * hand-maintained. Priority order (first wins on dedup, cap at 12):
 *   1. kinds the default profile actually layers (what a fresh user sees)
 *   2. the classic five (rainbow / breathing / wave / gradient / screen-ambient
 *      — the everyday set the old quick-chips theme bias starved, see the
 *      review's P-2 with this session's correction: 5 of 7 were unreachable)
 *   3. favorites (newest first)
 *   4. recents (newest first)
 */
export const CLASSIC_FIVE: EffectKind[] = ['rainbow', 'breathing', 'wave', 'zone-gradient', 'screen-ambient']

export const CURATED_CAP = 12

export function curatedKinds(args: {
  defaultKinds: EffectKind[]
  favoriteKinds: EffectKind[]
  recentKinds: EffectKind[]
}): EffectKind[] {
  const { defaultKinds, favoriteKinds, recentKinds } = args
  const seen = new Set<EffectKind>()
  const out: EffectKind[] = []
  const push = (kind: EffectKind): void => {
    if (seen.has(kind) || out.length >= CURATED_CAP) return
    seen.add(kind)
    out.push(kind)
  }
  for (const kind of defaultKinds) push(kind)
  for (const kind of CLASSIC_FIVE) push(kind)
  // Newest-first sources: favorites/recent arrays are append-ordered, so the
  // tail is the most recent — feed them reversed.
  for (const kind of [...favoriteKinds].reverse()) push(kind)
  for (const kind of recentKinds) push(kind)
  return out
}

/**
 * R164.1: keep the recent-use list newest-first, deduped, capped. Stored list
 * stays a bit larger than the curated strip consumes so heavy switching in one
 * session doesn't churn the whole strip every click.
 */
export const RECENT_CAP = 8

export function recordRecentKind(prev: EffectKind[], kind: EffectKind): EffectKind[] {
  if (prev[0] === kind) return prev
  return [kind, ...prev.filter((k) => k !== kind)].slice(0, RECENT_CAP)
}
