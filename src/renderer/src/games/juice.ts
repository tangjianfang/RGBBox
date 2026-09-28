/**
 * FR-G06(R200): Juice 共享工具 —— hit-stop 顿帧 / 出生预警 / 轨迹光带 / run recap。
 *
 * hit-stop:引擎各自持有 hitStop 计时字段(秒);tick 头部若 >0 则只衰减它并
 * 返回(不推进任何游戏计时)——「冻结期间 dt 不得累积」由调用方以本模块的
 * hitStopTick 实现,单测注入 dt 验证。
 */

/** 顿帧强度档位(秒)。 */
export const HIT_STOP = {
  light: 0.04,
  medium: 0.05,
  heavy: 0.06,
} as const

/**
 * 冻结步进:返回 [剩余冻结, 应注入引擎的 dt]。
 * 冻结期间引擎收到 dt=0(计时/掉落/敌人全部静止),恢复后不跳帧。
 */
export function hitStopTick(freeze: number, dt: number): [number, number] {
  if (freeze <= 0) return [0, dt]
  const remain = freeze - dt
  if (remain > 0) return [remain, 0]
  // 冻结在本帧结束:溢出部分不注入(丢弃,避免恢复瞬间跳帧)
  return [0, 0]
}

/** 出生预警条目(Swarm 敌人入场前 0.5s / TD 词缀波横幅)。 */
export interface SpawnWarning {
  /** 画布边缘方位:0=上 1=右 2=下 3=左。 */
  edge: 0 | 1 | 2 | 3
  /** 剩余预警时间(秒);<=0 移除。 */
  t: number
  label?: string
}

export const SPAWN_WARN_SECONDS = 0.5

/** 预警步进(秒);到 0 移除。 */
export function tickWarnings(warnings: SpawnWarning[], dt: number): SpawnWarning[] {
  for (const w of warnings) w.t -= dt
  return warnings.filter((w) => w.t > 0)
}

/** 刀光轨迹点(Slash 最近 6–8 帧出刀方向,渐隐光带)。 */
export interface TrailPoint {
  x: number
  y: number
  life: number
}

export const TRAIL_LIFE = 0.18

export function tickTrail(trail: TrailPoint[], dt: number): TrailPoint[] {
  for (const p of trail) p.life -= dt
  return trail.filter((p) => p.life > 0)
}

// ── run recap(统一结算,画布内呈现)────────────────────────────────────────

export interface RunRecap {
  score: number
  /** 较上局增量百分比(遥测不足两局为 null)。 */
  deltaPct: number | null
  /** 历史最高(含本局)。 */
  best: number
  /** 一句高光(由各作提供,如「最高连击 18」)。 */
  highlight: string
  /** 教练回顾文案 key(games.recap.*;无则 null)。 */
  coachKey: string | null
}

/** recap 文案 key 池(按结果基调选择;coach 条已关时也可用)。 */
export function recapCoachKey(score: number, prevScore: number | null): string {
  if (prevScore === null || prevScore === 0) return 'recap.firstRun'
  if (score > prevScore) return 'recap.improved'
  if (score >= prevScore * 0.8) return 'recap.close'
  return 'recap.practice'
}
