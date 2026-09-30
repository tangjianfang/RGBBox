/**
 * FR-G01(R198): 策略教练引擎 —— 共享类型与选择器。
 *
 * 纪律(SRS NFR-02): 各作 hints(state) 为引擎纯函数,返回 i18n key
 * (games.coach.<key>),文案由渲染层翻译——引擎不 import i18n(R159.3 先例)。
 * 渲染层每 2–4s 评估一次;同一提示 30s 内不得重复(pickHint)。
 */

export type CoachTone = 'tip' | 'warn' | 'praise'

export interface CoachHint {
  /** i18n key(games.coach.<key>)。 */
  key: string
  tone: CoachTone
  /** 数字大者优先;同优先级取数组靠前。 */
  priority: number
}

/** 同一提示的去重窗口。 */
export const COACH_REPEAT_WINDOW_MS = 30_000

/**
 * 选出当前应展示的提示:未被去重窗口遮蔽的最高优先级者。
 * `lastShown` 为 key→上次展示时间戳(调用方持有/持久于会话内存)。
 */
export function pickHint(hints: CoachHint[], lastShown: Readonly<Record<string, number>>, now: number): CoachHint | null {
  let best: CoachHint | null = null
  for (const hint of hints) {
    const last = lastShown[hint.key] ?? -Infinity
    if (now - last < COACH_REPEAT_WINDOW_MS) continue
    if (best === null || hint.priority > best.priority) best = hint
  }
  return best
}

/** 首局引导(FR-G01.3):三步定义——advance 为该步达成的纯判定。 */
export interface OnboardStep<I> {
  key: string
  done: (state: I) => boolean
}

export const ONBOARDED_KEY_PREFIX = 'rgbbox:gamesOnboarded:'

export function isOnboarded(storage: Pick<Storage, 'getItem'> | null, id: string): boolean {
  if (!storage) return true // 无存储环境(测试)不打引导
  try { return storage.getItem(ONBOARDED_KEY_PREFIX + id) === '1' } catch { return true }
}

export function markOnboarded(storage: Pick<Storage, 'setItem'> | null, id: string): void {
  if (!storage) return
  try { storage.setItem(ONBOARDED_KEY_PREFIX + id, '1') } catch { /* best-effort */ }
}
