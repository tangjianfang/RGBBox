// R147 P1: extracted verbatim from App.tsx module scope (parameter automation).
import type { Profile } from '../../../shared/types'
import { PARAM_META } from './paramMeta'
import { randomInRange } from './randomizer'

export type AutomationMode = 'sine' | 'triangle' | 'pulse'

export const AUTOMATION_MODES: AutomationMode[] = ['sine', 'triangle', 'pulse']
export const AUTOMATION_TARGET_PARAMS = ['speed', 'intensity', 'hueShift', 'angle'] as const

export function parseStoredAutomationParams(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const allowed = new Set<string>(AUTOMATION_TARGET_PARAMS)
    return [...new Set(parsed.filter((name): name is string => typeof name === 'string' && allowed.has(name)))]
  } catch {
    return []
  }
}

export function automationWave(now: number, mode: AutomationMode): number {
  if (mode === 'triangle') {
    const phase = (now * 0.18) % 1
    return phase < 0.5 ? phase * 2 : 2 - phase * 2
  }
  if (mode === 'pulse') {
    const phase = (Math.sin(now * 2.4) + 1) / 2
    return phase > 0.68 ? 1 : 0.15
  }
  return (Math.sin(now * 1.1) + 1) / 2
}

export function automateNumberParameter(name: string, baseValue: number, mode: AutomationMode, now: number): number {
  const meta = PARAM_META[name]
  const min = meta?.min ?? 0
  const max = meta?.max ?? 2
  const step = meta?.step ?? 0.05
  const wave = automationWave(now, mode)

  if (name === 'hueShift' || name === 'angle') {
    return randomInRange(min + (max - min) * wave, min + (max - min) * wave, step)
  }

  const span = (max - min) * (mode === 'pulse' ? 0.4 : 0.28)
  const low = Math.max(min, baseValue - span)
  const high = Math.min(max, baseValue + span)
  return randomInRange(low + (high - low) * wave, low + (high - low) * wave, step)
}

export function applyParameterAutomation(
  profile: Profile,
  layerId: string,
  enabled: boolean,
  automatedParams: readonly string[],
  mode: AutomationMode,
  now: number
): Profile {
  if (!enabled || automatedParams.length === 0) return profile
  const automatedSet = new Set(automatedParams)
  return {
    ...profile,
    scenes: profile.scenes.map((scene) => {
      if (scene.id !== profile.activeSceneId) return scene
      return {
        ...scene,
        layers: scene.layers.map((layer) => {
          if (layer.id !== layerId) return layer
          const parameters = Object.fromEntries(
            Object.entries(layer.parameters).map(([name, value]) => {
              if (!automatedSet.has(name) || typeof value !== 'number') return [name, value]
              return [name, automateNumberParameter(name, value, mode, now)]
            })
          )
          return { ...layer, parameters }
        })
      }
    })
  }
}
