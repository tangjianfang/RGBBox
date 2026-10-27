/**
 * R323: bounded retry with linear back-off, for build steps that fail on a
 * TRANSIENT condition. First user: afterPack's rcedit icon write — a freshly
 * written ~223MB RGBBox.exe is briefly held by a real-time scanner/indexer and
 * rcedit then dies with "Unable to commit changes"; seconds later the same call
 * succeeds (observed: success/fail alternating on the same file).
 *
 * Pure + injectable `sleep` so the policy is unit-testable without waiting.
 */

/** Delay before retry N (1-based): linear, capped. 1s, 2s, 3s, 4s, 5s, 5s, … */
export function backoffMs (retryNumber, { baseMs = 1000, capMs = 5000 } = {}) {
  return Math.min(baseMs * retryNumber, capMs)
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @param {object} [opts]
 * @param {number} [opts.attempts=8]            total tries (first call included)
 * @param {(err: Error) => boolean} [opts.shouldRetry]  only these errors are retried; others throw at once
 * @param {(info: { attempt: number, attempts: number, delayMs: number, error: Error }) => void} [opts.onRetry]
 * @param {(ms: number) => Promise<void>} [opts.sleep]
 * @param {{ baseMs?: number, capMs?: number }} [opts.backoff]
 * @param {string} [opts.exhaustedHint]         appended to the final error message
 * @returns {Promise<T>}
 */
export async function retryAsync (fn, {
  attempts = 8,
  shouldRetry = () => true,
  onRetry = () => {},
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  backoff,
  exhaustedHint = '',
} = {}) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (!shouldRetry(lastError)) throw lastError // not the transient kind — fail fast, never mask a real bug
      if (attempt === attempts) break
      const delayMs = backoffMs(attempt, backoff)
      onRetry({ attempt, attempts, delayMs, error: lastError })
      await sleep(delayMs)
    }
  }
  const hint = exhaustedHint ? `\n${exhaustedHint}` : ''
  const exhausted = new Error(`still failing after ${attempts} attempts: ${lastError.message}${hint}`)
  exhausted.cause = lastError
  throw exhausted
}
