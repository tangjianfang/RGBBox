// R246: first-use onboarding persistence + the diagnostics funnel.
//
// The wizard mounts when the gesture assistant is first enabled; completion
// OR a skip at any step both persist `rgbbox:visionOnboarded` — a frustrated
// first-timer must never be trapped in a wizard (the R136.4 skip principle,
// applied to the whole funnel). The funnel counters are diagnostics-only
// (drop-off measurement); they never gate behavior.

export const ONBOARDED_KEY = 'rgbbox:visionOnboarded'
export const FUNNEL_KEY = 'rgbbox:visionFunnel'

/**
 * Settings「重看体感向导」and the games-hub entry clear the flag in their own
 * window, where the `storage` event does NOT fire — so the clearing side also
 * dispatches this event and a mounted assistant re-opens the wizard.
 */
export const ONBOARDING_RESET_EVENT = 'rgbbox:vision-onboarding-reset'

export interface VisionFunnel {
  /** the wizard was shown */
  opened: number
  /** the calibration stage was passed (completed OR skipped — both reach active) */
  calDone: number
  /** the first light effect was applied through the wizard's task step */
  firstCmd: number
}

const ZERO_FUNNEL: VisionFunnel = { opened: 0, calDone: 0, firstCmd: 0 }

export function isOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === '1'
  } catch {
    return true // storage broken → never trap the user in a wizard
  }
}

export function markOnboarded(): void {
  try {
    localStorage.setItem(ONBOARDED_KEY, '1')
  } catch {
    /* non-fatal */
  }
}

/** Clear the done-flag and poke any mounted assistant to re-open the wizard. */
export function resetOnboarding(): void {
  try {
    localStorage.removeItem(ONBOARDED_KEY)
  } catch {
    /* non-fatal */
  }
  try {
    window.dispatchEvent(new Event(ONBOARDING_RESET_EVENT))
  } catch {
    /* non-fatal */
  }
}

export function readFunnel(): VisionFunnel {
  try {
    const raw = localStorage.getItem(FUNNEL_KEY)
    if (!raw) return { ...ZERO_FUNNEL }
    const parsed = JSON.parse(raw) as Partial<VisionFunnel>
    return {
      opened: typeof parsed.opened === 'number' && Number.isFinite(parsed.opened) ? parsed.opened : 0,
      calDone: typeof parsed.calDone === 'number' && Number.isFinite(parsed.calDone) ? parsed.calDone : 0,
      firstCmd: typeof parsed.firstCmd === 'number' && Number.isFinite(parsed.firstCmd) ? parsed.firstCmd : 0,
    }
  } catch {
    return { ...ZERO_FUNNEL }
  }
}

export function bumpFunnel(stage: keyof VisionFunnel): void {
  const funnel = readFunnel()
  funnel[stage] += 1
  try {
    localStorage.setItem(FUNNEL_KEY, JSON.stringify(funnel))
  } catch {
    /* non-fatal */
  }
}
