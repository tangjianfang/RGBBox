import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { effectPresets } from '../../../../shared/defaultProfile'
import type { EffectKind, EffectLayer, Profile, VideoWallLayout } from '../../../../shared/types'
import type { QuickDimensionId } from '../../domain/quickDimensions'
import { applyQuickDimensionParameters, opacityForQuickEnergy } from '../../domain/quickDimensions'
import { randomizeLayerParameters } from '../../domain/randomizer'
import type { RandomizerMode } from '../../domain/randomizer'
import { activeScene, nextLayerId, updateLayer } from '../../domain/profileUtils'

/**
 * R147 P3b: layer mutation actions, moved verbatim from App.tsx — ambient/
 * quick-dimension presets, layer CRUD, linked-displays and video-wall scene
 * patches, randomize. (selectEffect/applyAmbientPreset stay in App: four
 * domain hooks consume selectEffect, and it depends only on
 * updateSelectedLayer/selectedLayerId — pulling it in here would create a
 * circular dependency.) All actions write through setProfile /
 * updateSelectedLayer; no state of their own.
 */
export function useLayerActions(args: {
  setProfile: Dispatch<SetStateAction<Profile | null>>
  setSelectedLayerId: (id: string) => void
  selectedLayer: EffectLayer | null
  updateSelectedLayer: (patch: Partial<EffectLayer>) => void
  randomizerMode: RandomizerMode
  randomizerLockedParams: string[]
}) {
  const { setProfile, setSelectedLayerId, selectedLayer, updateSelectedLayer, randomizerMode, randomizerLockedParams } = args

  const randomizeSelectedLayer = useCallback(() => {
    if (!selectedLayer) return
    updateSelectedLayer({ parameters: randomizeLayerParameters(selectedLayer, randomizerMode, new Set(randomizerLockedParams)) })
  }, [selectedLayer, randomizerMode, randomizerLockedParams, updateSelectedLayer])

  const setSelectedLayerValue = useCallback(<K extends keyof EffectLayer>(key: K, value: EffectLayer[K]) => {
    updateSelectedLayer({ [key]: value } as Partial<EffectLayer>)
  }, [updateSelectedLayer])

  const setLayerParameter = useCallback((name: string, value: number | string | boolean) => {
    if (!selectedLayer) return
    updateSelectedLayer({ parameters: { ...selectedLayer.parameters, [name]: value } })
  }, [selectedLayer, updateSelectedLayer])

  const applyQuickDimension = useCallback((dimension: QuickDimensionId, option: string) => {
    if (!selectedLayer) return
    const patch: Partial<EffectLayer> = {
      parameters: applyQuickDimensionParameters(selectedLayer.parameters, dimension, option)
    }
    if (dimension === 'energy') patch.opacity = opacityForQuickEnergy(option)
    updateSelectedLayer(patch)
  }, [selectedLayer, updateSelectedLayer])

  const toggleLayerEnabled = useCallback((layerId: string) => {
    setProfile((cur) => cur ? updateLayer(cur, layerId, {
      enabled: !activeScene(cur).layers.find((l) => l.id === layerId)?.enabled
    }) : cur)
  }, [])

  const toggleLinkedDisplays = useCallback(() => {
    setProfile((cur) => {
      if (!cur) return cur
      const sceneId = (cur.scenes.find((s) => s.id === cur.activeSceneId) ?? cur.scenes[0]).id
      return {
        ...cur,
        scenes: cur.scenes.map((s) =>
          s.id !== sceneId ? s : { ...s, linkedDisplays: !s.linkedDisplays }
        )
      }
    })
  }, [])

  const updateVideoWall = useCallback((layout: VideoWallLayout | undefined) => {
    setProfile((cur) => {
      if (!cur) return cur
      const sceneId = (cur.scenes.find((s) => s.id === cur.activeSceneId) ?? cur.scenes[0]).id
      return {
        ...cur,
        scenes: cur.scenes.map((s) =>
          s.id !== sceneId ? s : { ...s, videoWall: layout }
        )
      }
    })
  }, [])

  const addLayer = useCallback((kind: EffectKind) => {
    const preset = effectPresets.find((p) => p.kind === kind) ?? effectPresets[0]
    const newLayer: EffectLayer = {
      id: nextLayerId(),
      name: preset.label,
      kind: preset.kind,
      enabled: true,
      opacity: 0.75,
      blendMode: 'screen',
      parameters: { ...preset.defaults }
    }
    setProfile((cur) => {
      if (!cur) return cur
      const sceneId = (cur.scenes.find((s) => s.id === cur.activeSceneId) ?? cur.scenes[0]).id
      return {
        ...cur,
        scenes: cur.scenes.map((s) => s.id !== sceneId ? s : { ...s, layers: [...s.layers, newLayer] })
      }
    })
    setSelectedLayerId(newLayer.id)
  }, [])

  const deleteLayer = useCallback((layerId: string) => {
    setProfile((cur) => {
      if (!cur) return cur
      const sceneId = (cur.scenes.find((s) => s.id === cur.activeSceneId) ?? cur.scenes[0]).id
      return {
        ...cur,
        scenes: cur.scenes.map((s) => s.id !== sceneId ? s : { ...s, layers: s.layers.filter((l) => l.id !== layerId) })
      }
    })
  }, [])

  return {
    randomizeSelectedLayer, setSelectedLayerValue, setLayerParameter, applyQuickDimension,
    toggleLayerEnabled, toggleLinkedDisplays, updateVideoWall, addLayer, deleteLayer,
  }
}
