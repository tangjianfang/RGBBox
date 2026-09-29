/**
 * R213: 升级自动预选(域层纯函数)——levelup 三选一界面的挂机辅助。
 *
 * 三档模式:off=手动(不预选);list=按用户优先级清单取首个可选项;
 * best=确定性启发式(低血救急 → 均衡发展)。零运行时依赖(仅类型引用)。
 */
import type { UpgradeId } from './swarmMeta'

/** 自动预选模式。 */
export type AutoPickMode = 'off' | 'list' | 'best'

/** 血线阈值:hp/maxHp 严格低于此值且 offers 含生存类升级时优先保命。 */
export const LOW_HP_RATIO = 0.4

/** 生存类升级(best 模式低血时优先)。 */
export const SURVIVAL_IDS: UpgradeId[] = ['maxHp', 'regen']

/**
 * 自动预选一个升级,无可选/手动模式返回 null(提示手动)。
 *
 * - off → null。
 * - list → prefs 中第一个 ∈ offers 的;全不在 → null。
 * - best → hp/maxHp < 0.4 且 offers 含 maxHp/regen 时取 offer 序靠前的
 *   生存类;否则取 taken 计数最少者(并列取 offers 数组序)。
 */
export function autoPick(
  offers: UpgradeId[],
  prefs: UpgradeId[],
  mode: AutoPickMode,
  taken: Record<UpgradeId, number>,
  playerHp: number,
  playerMaxHp: number,
): UpgradeId | null {
  if (offers.length === 0 || mode === 'off') return null
  if (mode === 'list') {
    return prefs.find((id) => offers.includes(id)) ?? null
  }
  if (playerMaxHp > 0 && playerHp / playerMaxHp < LOW_HP_RATIO) {
    const survival = offers.find((id) => SURVIVAL_IDS.includes(id))
    if (survival !== undefined) return survival
  }
  let best: UpgradeId | null = null
  let bestCount = Number.POSITIVE_INFINITY
  for (const id of offers) {
    const count = taken[id] ?? 0
    if (count < bestCount) {
      best = id
      bestCount = count
    }
  }
  return best
}
