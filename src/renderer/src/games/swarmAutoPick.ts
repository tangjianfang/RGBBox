/**
 * R213: 升级自动预选(域层纯函数)——levelup 三选一界面的挂机辅助。
 *
 * 三档模式:off=手动(不预选);list=按用户优先级清单取首个可选项;
 * best=确定性启发式(低血救急 → 估值序发展)。零运行时依赖(仅类型引用)。
 * R220.2(G1 S-2): best 档由「最少已取」改为**估值序**——旧策略把 thorns/
 * bulletSpeed 这类低价值项各拍板 12.2%,模拟死亡 P50 反而更早(82s vs 贪心
 * 95s,分数腰斩);新估值为乘法收益近似:score = 基础价值 /(1+0.35×已取)。
 */
import type { UpgradeId } from './swarmMeta'

/** 自动预选模式。 */
export type AutoPickMode = 'off' | 'list' | 'best'

/** 血线阈值:hp/maxHp 严格低于此值且 offers 含生存类升级时优先保命。 */
export const LOW_HP_RATIO = 0.4

/** 生存类升级(best 模式低血时优先)。 */
export const SURVIVAL_IDS: UpgradeId[] = ['maxHp', 'regen']

/** R220.2: 各升级基础价值(multishot/damage/fireRate 为 DPS 主轴;数值经
 *  G1 模拟敏感性实验校准——死亡墙 P0 组合的组成部分)。 */
export const AUTO_PICK_BASE_VALUE: Record<UpgradeId, number> = {
  multishot: 1.0,
  damage: 0.9,
  fireRate: 0.9,
  speed: 0.7,
  magnet: 0.65,
  maxHp: 0.6,
  blade: 0.6,
  pierce: 0.55,
  crit: 0.5,
  regen: 0.45,
  bulletSpeed: 0.25,
  thorns: 0.15,
}

/** 估值衰减:每已取 1 级价值 ×1/(1+DIMINISH)(边际收益递减)。 */
export const AUTO_PICK_DIMINISH = 0.35

/** 估值:score = 基础价值 /(1 + DIMINISH×taken)。 */
export function autoPickScore(id: UpgradeId, taken: Record<UpgradeId, number>): number {
  return AUTO_PICK_BASE_VALUE[id] / (1 + AUTO_PICK_DIMINISH * (taken[id] ?? 0))
}

/**
 * 自动预选一个升级,无可选/手动模式返回 null(提示手动)。
 *
 * - off → null。
 * - list → prefs 中第一个 ∈ offers 的;全不在 → null。
 * - best → hp/maxHp < 0.4 且 offers 含 maxHp/regen 时取 offer 序靠前的
 *   生存类;否则取**估值最高**者(并列取 offers 数组序)。
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
  let bestScore = Number.NEGATIVE_INFINITY
  for (const id of offers) {
    const score = autoPickScore(id, taken)
    if (score > bestScore) {
      best = id
      bestScore = score
    }
  }
  return best
}
