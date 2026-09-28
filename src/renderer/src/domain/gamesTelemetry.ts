/**
 * FR-G02(R198): 本地遥测与 arcade profile —— 纯域层。
 *
 * 纪律(SRS NFR-02/03/09):
 *  - 纯本地 localStorage,**零网络**;写入仅发生在单局结算时(本模块无副作用,
 *    落盘由调用方在结算点调用);
 *  - 键位只增不改:`rgbbox:gamesRuns:<id>` 新增,`rgbbox:gamesBest:*` 原样;
 *  - 环形缓冲每作 20 局;损坏 JSON 回退空。
 */

export type GameId = 'td' | 'swarm' | 'tetris' | 'slash'

/** 单局遥测记录(结算时一次性写入)。 */
export interface GameRunRecord {
  /** 局终时间戳(ms)。 */
  date: number
  score: number
  /** 秒。 */
  duration: number
  /** 一句高光描述(T-spin ×2 / 到达 12 波 / 最高连击 18 …),展示用。 */
  highlight: string
}

/** 每作环形缓冲。 */
export interface GameRunBuffer {
  runs: GameRunRecord[]
}

export const RUNS_PER_GAME = 20
export const RUNS_KEY_PREFIX = 'rgbbox:gamesRuns:'

/** 读取某作环形缓冲(损坏/缺失回退空)。 */
export function loadRuns(storage: Pick<Storage, 'getItem'> | null, id: GameId): GameRunBuffer {
  if (!storage) return { runs: [] }
  try {
    const raw = storage.getItem(RUNS_KEY_PREFIX + id)
    if (!raw) return { runs: [] }
    const parsed = JSON.parse(raw) as { runs?: unknown }
    if (!Array.isArray(parsed.runs)) return { runs: [] }
    const runs = parsed.runs.filter((r): r is GameRunRecord =>
      typeof r === 'object' && r !== null &&
      typeof (r as GameRunRecord).date === 'number' &&
      typeof (r as GameRunRecord).score === 'number' &&
      typeof (r as GameRunRecord).duration === 'number')
    return { runs: runs.slice(-RUNS_PER_GAME) }
  } catch {
    return { runs: [] }
  }
}

/** 结算落盘:追加一局并滚动到上限(返回应写入的最新缓冲)。 */
export function appendRun(buffer: GameRunBuffer, record: GameRunRecord): GameRunBuffer {
  const runs = [...buffer.runs, record]
  return { runs: runs.slice(-RUNS_PER_GAME) }
}

export function saveRuns(storage: Pick<Storage, 'setItem'> | null, id: GameId, buffer: GameRunBuffer): void {
  if (!storage) return
  try {
    storage.setItem(RUNS_KEY_PREFIX + id, JSON.stringify(buffer))
  } catch { /* storage unavailable — keep in-memory only */ }
}

/** 结算便捷入口:读→追加→写,返回新缓冲(与 appendRun 一致的纯度:落盘为 best-effort)。 */
export function recordRun(storage: Pick<Storage, 'getItem' | 'setItem'> | null, id: GameId, record: GameRunRecord): GameRunBuffer {
  const next = appendRun(loadRuns(storage, id), record)
  saveRuns(storage, id, next)
  return next
}

// ── arcade profile(聚合,纯函数)────────────────────────────────────────────

export interface GameProfileStats {
  /** 累计局数(=buffer 长度,≤20)。 */
  totalRuns: number
  /** 累计时长(秒)。 */
  totalSeconds: number
  /** 最近一局得分(无局为零)。 */
  lastScore: number
  /** 历史最高(取 buffer 内;全量 best 由调用方与 gamesBest:* 合并取大)。 */
  bestScore: number
  /** 较上一局的增量百分比(不足两局为 null)。 */
  deltaPct: number | null
  /** 连续游玩天数(按日历日;断了清零)。 */
  streakDays: number
}

/** 聚合单作 profile(从 buffer 出发;externalBest 传入则与 buffer 内最大取大)。 */
export function profileStats(buffer: GameRunBuffer, externalBest?: number, today: number = Date.now()): GameProfileStats {
  const runs = buffer.runs
  const bestInBuf = runs.reduce((a, r) => Math.max(a, r.score), 0)
  const bestScore = Math.max(bestInBuf, externalBest ?? 0)
  const last = runs[runs.length - 1]
  const prev = runs[runs.length - 2]
  const deltaPct = last !== undefined && prev !== undefined && prev.score > 0
    ? Math.round(((last.score - prev.score) / prev.score) * 100)
    : null
  return {
    totalRuns: runs.length,
    totalSeconds: runs.reduce((a, r) => a + r.duration, 0),
    lastScore: last?.score ?? 0,
    bestScore,
    deltaPct,
    streakDays: streakDaysFrom(runs.map((r) => r.date), today),
  }
}

/** 连续天数:从今天(或最近一局日)往前数连续命中的日历日。 */
export function streakDaysFrom(dates: number[], today = Date.now()): number {
  if (dates.length === 0) return 0
  const dayOf = (ms: number): number => Math.floor(ms / 86_400_000)
  const days = new Set(dates.map(dayOf))
  const todayDay = dayOf(today)
  // streak 锚点:今天或昨天(今天还没玩不算断)
  let cursor = days.has(todayDay) ? todayDay : todayDay - 1
  if (!days.has(cursor)) return 0
  let streak = 0
  while (days.has(cursor)) {
    streak += 1
    cursor -= 1
  }
  return streak
}

/** 一键清空:清遥测与 profile 展示;best 默认保留。 */
export function clearAllGameData(storage: Pick<Storage, 'removeItem'> | null, alsoBest: boolean, bestKeyOf: (id: GameId) => string): void {
  if (!storage) return
  for (const id of ['td', 'swarm', 'tetris', 'slash'] as GameId[]) {
    try { storage.removeItem(RUNS_KEY_PREFIX + id) } catch { /* best-effort */ }
    if (alsoBest) {
      try { storage.removeItem(bestKeyOf(id)) } catch { /* best-effort */ }
    }
  }
}
