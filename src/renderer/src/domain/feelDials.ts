/**
 * R304: 感觉台语义盘映射 —— 纯域，零 React/DOM 依赖。
 *
 * 设计论点：调灯效是「调感觉」（快慢/明暗/疏密/颜色），不是「填表单」。
 * 4 根语义盘是全部 55 效果统一的唯一主语言；每根盘映射到该效果真实携带
 * 的底层参数（值域/步进取 PARAM_META），缺参的盘自动隐藏——不做幽灵控制
 * （R304.1 的 animateSpeed 事故教训）。
 */
import type { EffectLayer } from '../../../shared/types'

export type FeelDialId = 'motion' | 'energy' | 'density' | 'palette'

export interface FeelDialDef {
  id: FeelDialId
  /** i18n 键（感觉名，全效果统一） */
  labelKey: string
  /** 底层真实参数名——值直接读写该参数；tooltip 显示对应参数名 */
  param: string
}

/** 每根盘的候选参数链：首个「存在且为数值」的参数成为驱动目标。 */
const DIAL_PARAM_CHAINS: Record<FeelDialId, readonly string[]> = {
  motion: ['speed'],
  energy: ['intensity', 'baseBrightness'],
  density: ['density'],
  palette: ['hueShift']
}

const DIAL_LABEL_KEYS: Record<FeelDialId, string> = {
  motion: 'feel.motion',
  energy: 'feel.energy',
  density: 'feel.density',
  palette: 'feel.palette'
}

const DIAL_ORDER: readonly FeelDialId[] = ['motion', 'energy', 'density', 'palette']

/** 当前效果可用的语义盘（缺参自动隐藏）。 */
export function feelDialsFor(parameters: EffectLayer['parameters']): FeelDialDef[] {
  const out: FeelDialDef[] = []
  for (const id of DIAL_ORDER) {
    const param = DIAL_PARAM_CHAINS[id].find(
      (name) => name in parameters && typeof parameters[name] === 'number'
    )
    if (param !== undefined) out.push({ id, labelKey: DIAL_LABEL_KEYS[id], param })
  }
  return out
}

/**
 * 感觉色：效果主色参数名（#color 字符串在位时），供色相条驱动——换色相时
 * 保留原色的饱和度/明度，只转色相。无颜色参数的效果返回 null（条隐藏）。
 */
export function feelColorParam(parameters: EffectLayer['parameters']): string | null {
  return typeof parameters.color === 'string' && String(parameters.color).startsWith('#') ? 'color' : null
}
