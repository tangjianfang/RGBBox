// R147 P1: extracted verbatim from App.tsx module scope (quick dimension presets).
// R330: quick 维度 chips UI 退役后（感觉台/语义盘接棒），dimension 参数映射整链
// （applyQuickDimensionParameters / opacityForQuickEnergy / QUICK_*_OPTIONS）已无
// 生产调用方（applyQuickDimension hook action 无组件引用），随 review 修复批删除；
// 本模块仅存 WorkspaceView 消费的快捷效果清单。
import type { EffectKind } from '../../../shared/types'

export const QUICK_EFFECT_KINDS: EffectKind[] = ['screen-ambient', 'aurora', 'fire', 'hologram', 'dna-helix', 'black-hole', 'solar-system', 'spiral-galaxy', 'hurricane-eye', 'quantum-collapse', 'magnetosphere-aurora', 'tokamak-plasma']
