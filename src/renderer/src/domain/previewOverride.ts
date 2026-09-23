import type { EffectKind, EffectLayer, Profile } from '../../../shared/types'

export interface PreviewOverride {
  kind: EffectKind
  parameters: Record<string, unknown>
}

/**
 * R164.2 (S2): hover-preview — return a profile whose SELECTED layer is the
 * hovered effect, leaving everything else (other layers, sampling, scene
 * wiring) untouched. Shallow structural copy only: the worker postMessage
 * clones anyway, and the React profile state / persistence are never involved.
 */
export function applyLayerOverride(profile: Profile, selectedLayerId: string, override: PreviewOverride): Profile {
  return {
    ...profile,
    scenes: profile.scenes.map((scene) =>
      scene.id === profile.activeSceneId
        ? {
            ...scene,
            layers: scene.layers.map((layer) =>
              layer.id === selectedLayerId
                ? { ...layer, kind: override.kind, parameters: { ...override.parameters } as EffectLayer['parameters'] }
                : layer
            ),
          }
        : scene
    ),
  }
}
