// R147 P1: extracted verbatim from App.tsx module scope (profile/frame helpers).
import type { EffectLayer, Profile, Scene } from '../../../shared/types'

// R264/U4: was a module-scope counter starting at 100 that never looked at
// existing ids — importing layers with `layer-1xx` ids made subsequent adds
// collide (updateLayer patched two layers at once). Now scans the profile's
// existing numeric `layer-N` ids and returns max+1. With no numeric ids the
// first id is still `layer-101`, matching the old counter's first value.
export function nextLayerId(profile: Profile | null | undefined): string {
  let max = 100
  for (const scene of profile?.scenes ?? []) {
    for (const layer of scene.layers ?? []) {
      const m = /^layer-(\d+)$/.exec(layer.id)
      if (m) max = Math.max(max, Number(m[1]))
    }
  }
  return `layer-${max + 1}`
}

export function activeLayer(profile: Profile) {
  const scene = profile.scenes.find((c) => c.id === profile.activeSceneId) ?? profile.scenes[0]
  return scene.layers.find((l) => l.enabled) ?? scene.layers[0]
}

export function activeScene(profile: Profile) {
  return profile.scenes.find((c) => c.id === profile.activeSceneId) ?? profile.scenes[0]
}

/**
 * R166: the persisted `selectedLayerId` (localStorage) can point at a layer
 * that no longer exists — the fresh-install legacy default 'layer-rainbow',
 * a deleted layer (deleteLayer never reassigns), or a loaded/imported profile
 * with different ids. The read side silently fell back to activeLayer() while
 * every WRITE matched nothing, turning all effect selections into silent
 * no-ops. Returns the id the selection must fall back to, or null when the
 * current id is already valid (or the scene has no layers).
 */
export function reconcileSelectedLayerId(scene: Scene | null | undefined, selectedLayerId: string): string | null {
  if (!scene || scene.layers.length === 0) return null
  if (scene.layers.some((l) => l.id === selectedLayerId)) return null
  return (scene.layers.find((l) => l.enabled) ?? scene.layers[0]).id
}

export function formatMs(value: number | undefined): string {
  return `${(value ?? 0).toFixed(1)} ms`
}

export function updateLayer(profile: Profile, layerId: string, patch: Partial<EffectLayer>): Profile {
  const sceneId = (profile.scenes.find((c) => c.id === profile.activeSceneId) ?? profile.scenes[0]).id
  return {
    ...profile,
    scenes: profile.scenes.map((s) =>
      s.id !== sceneId ? s : { ...s, layers: s.layers.map((l) => (l.id === layerId ? { ...l, ...patch } : l)) }
    )
  }
}
