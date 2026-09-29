/**
 * FR-G09(R205 三期交付): 每日挑战与任务点灯 —— 种子 RNG + daily 种子。
 *
 * OD-05: 四作 Math.random 全量替换为 mulberry32(种子可复现)。
 * 种子来源:局内 = daily 种子(YYYYMMDD 哈希)或自由局随机;引擎持有
 * rand() 闭包,行为与 Math.random() 同分布可替换。
 */

/** mulberry32:32 位种子 → [0,1) 均匀分布。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 当天 daily 种子(UTC 日期的 FNV-1a)。 */
export function dailySeed(date = new Date()): number {
  const ymd = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`
  let h = 0x811c9dc5
  for (let i = 0; i < ymd.length; i += 1) {
    h ^= ymd.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export const DAILY_KEY_PREFIX = 'rgbbox:gamesDaily:'

export interface DailyRecord {
  /** 当日最好分。 */
  best: number
  /** 当日尝试次数。 */
  attempts: number
  /** 上次 daily 的种子(校验同日)。 */
  seed: number
}

export function loadDaily(storage: Pick<Storage, 'getItem'> | null, id: string, today = new Date()): DailyRecord | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(DAILY_KEY_PREFIX + id)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DailyRecord
    if (typeof parsed.best !== 'number' || typeof parsed.attempts !== 'number' || typeof parsed.seed !== 'number') return null
    // 跨日作废(种子不匹配即昨日记录)
    if (parsed.seed !== dailySeed(today)) return null
    return parsed
  } catch {
    return null
  }
}

export function saveDaily(storage: Pick<Storage, 'setItem'> | null, id: string, record: DailyRecord): void {
  if (!storage) return
  try { storage.setItem(DAILY_KEY_PREFIX + id, JSON.stringify(record)) } catch { /* best-effort */ }
}

/** 结算:更新当日 best/attempts(跨日重置)。 */
export function recordDaily(storage: Pick<Storage, 'getItem' | 'setItem'> | null, id: string, score: number, today = new Date()): DailyRecord {
  const prev = loadDaily(storage, id, today)
  const seed = dailySeed(today)
  const next: DailyRecord = prev === null
    ? { best: score, attempts: 1, seed }
    : { best: Math.max(prev.best, score), attempts: prev.attempts + 1, seed }
  saveDaily(storage, id, next)
  return next
}
