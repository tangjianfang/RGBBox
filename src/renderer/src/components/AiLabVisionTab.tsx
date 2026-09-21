import { Fragment, useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { useI18n } from '../i18n'
import { useVisionInput, type VisionSensitivity } from '../hooks/useVisionInput'
import { VisionPad } from './vision/VisionPad'
import { fingerStates } from '../vision/fingerChords.js'
import type { VisionStats } from '../vision/vision_input'

// R144: AI Lab vision capability bench — the single place to CHECK every
// gesture/expression capability the pipeline can detect (a catalog table
// whose rows light up with live counters as you perform them) and to
// EXPLORE new ones (raw signals: skeleton pad, pinch gauge, finger
// extension, chord preview/buffer, runtime params).
//
// Row lighting is driven by the 'vision-input' window bus the hook already
// dispatches for EVERY event (direction/pinch/face/chord + offhand/hands),
// plus three client-side combos that mirror consumer semantics exactly:
// double-pinch (two Space downs <900ms — R139), open-palm hold
// (geom.pinch > pinchOff for 700ms — MiniGamesView R138) and fist clutch
// (fingerStates all-four-folded ≥250ms — R143.2).

interface Bi { zh: string; en: string }
type CapGroupId = 'direction' | 'discrete' | 'chordCmd' | 'chordText' | 'dualHand' | 'face' | 'cursor'

/** Runtime event on the window bus — wider than the d.ts VisionEvent: the
 *  host also emits kind 'offhand' | 'hands' (see gesture_engine.js). */
interface BusEvent { kind: string; key: string | null; down: boolean; name?: string; dir?: string }

interface CapRow {
  id: string
  group: CapGroupId
  name: Bi
  how: Bi
  where: Bi
  match?: (e: BusEvent) => boolean
  live?: 'geom' | 'predicted'
  combo?: 'doublePinch' | 'palmHold' | 'fistClutch'
}

const GROUPS: CapGroupId[] = ['direction', 'discrete', 'chordCmd', 'chordText', 'dualHand', 'face', 'cursor']

/** Rows whose events form down/up pairs get a "held" badge while down. */
const HELD_KINDS = new Set(['direction', 'pinch', 'face'])

// Catalog text is a bilingual literal per row (R144.3): i18n-ing ~72 short
// strings would bloat the dict for no reuse — the R131 engine-text precedent.
const CAPS: CapRow[] = [
  // ── direction ──
  {
    id: 'dir8', group: 'direction',
    name: { zh: '8 向方向环', en: '8-way direction ring' },
    how: { zh: '手离开静息中心、越过触发环进入 8 个扇区（可 4/8 向）', en: 'Move the hand past the trigger ring into one of 8 sectors' },
    where: { zh: 'Survival / Tetris / 光刃斩击 / 径向菜单', en: 'Survival / Tetris / Slash / radial menu' },
    match: (e) => e.kind === 'direction' && e.down !== false,
  },
  {
    id: 'axis', group: 'direction', live: 'geom',
    name: { zh: '连续模拟量轴', en: 'Analog axis' },
    how: { zh: '手在环内任意位置——输出连续比例值（非 8 向量化）', en: 'Hand anywhere inside the ring — continuous ratio value' },
    where: { zh: 'Survival 移动速度（R135）', en: 'Survival movement speed (R135)' },
  },
  {
    id: 'predict', group: 'direction', live: 'predicted',
    name: { zh: '预测外推（50ms 前瞻）', en: 'Prediction (50ms lookahead)' },
    how: { zh: '移动手——掌心点按速度外推，领先实际位置', en: 'Move the hand — palm extrapolated by velocity' },
    where: { zh: '光标 / 模拟量平滑（R142-E1）', en: 'Cursor / axis smoothing (R142-E1)' },
  },
  // ── primary-hand discrete ──
  {
    id: 'pinch', group: 'discrete',
    name: { zh: '捏合', en: 'Pinch' },
    how: { zh: '拇指食指捏拢（滞回门限 + 确认窗）', en: 'Thumb and index together (hysteresis + confirm window)' },
    where: { zh: '确认 / 开局 / 点击 / 引爆 / 轮盘确认', en: 'Confirm / start / click / blast / roulette' },
    match: (e) => e.kind === 'pinch' && e.key === 'Space',
  },
  {
    id: 'doublePinch', group: 'discrete', combo: 'doublePinch',
    name: { zh: '双捏合确认', en: 'Double-pinch confirm' },
    how: { zh: '快速捏合 2 次（间隔 <0.9s）', en: 'Two quick pinches (<0.9s apart)' },
    where: { zh: '升级轮盘确认（R139）', en: 'Upgrade roulette confirm (R139)' },
  },
  {
    id: 'palmHold', group: 'discrete', combo: 'palmHold',
    name: { zh: '张掌保持', en: 'Open-palm hold' },
    how: { zh: '五指张开保持约 0.7s', en: 'Keep the palm open ~0.7s' },
    where: { zh: '游戏开局 / 重开（R138）', en: 'Game start / restart (R138)' },
  },
  // ── finger chords: commands (hand rests on the desk) ──
  {
    id: 'chord-select', group: 'chordCmd',
    name: { zh: '和弦 select', en: 'Chord select' },
    how: { zh: '只伸食指，松手提交', en: 'Index only, commit on release' },
    where: { zh: '光标点击 / 轮盘选择', en: 'Cursor click / roulette select' },
    match: (e) => e.kind === 'chord' && e.name === 'select',
  },
  {
    id: 'chord-confirm', group: 'chordCmd',
    name: { zh: '和弦 confirm', en: 'Chord confirm' },
    how: { zh: '食指+中指同伸', en: 'Index + middle' },
    where: { zh: '确认 / 开局', en: 'Confirm / start' },
    match: (e) => e.kind === 'chord' && e.name === 'confirm',
  },
  {
    id: 'chord-pause', group: 'chordCmd',
    name: { zh: '和弦 pause', en: 'Chord pause' },
    how: { zh: '只伸中指', en: 'Middle only' },
    where: { zh: '预留：暂停', en: 'Reserved: pause' },
    match: (e) => e.kind === 'chord' && e.name === 'pause',
  },
  {
    id: 'chord-menu', group: 'chordCmd',
    name: { zh: '和弦 menu', en: 'Chord menu' },
    how: { zh: '食指+中指+无名指', en: 'Index + middle + ring' },
    where: { zh: '径向快捷菜单呼出', en: 'Radial quick menu' },
    match: (e) => e.kind === 'chord' && e.name === 'menu',
  },
  {
    id: 'chord-cancel', group: 'chordCmd',
    name: { zh: '和弦 cancel', en: 'Chord cancel' },
    how: { zh: '只伸小指', en: 'Pinky only' },
    where: { zh: '预留：取消', en: 'Reserved: cancel' },
    match: (e) => e.kind === 'chord' && e.name === 'cancel',
  },
  {
    id: 'chord-back', group: 'chordCmd',
    name: { zh: '和弦 back', en: 'Chord back' },
    how: { zh: '拇指+食指', en: 'Thumb + index' },
    where: { zh: '返回上一级', en: 'Navigate back' },
    match: (e) => e.kind === 'chord' && e.name === 'back',
  },
  {
    id: 'chord-next', group: 'chordCmd',
    name: { zh: '和弦 next', en: 'Chord next' },
    how: { zh: '食指+小指', en: 'Index + pinky' },
    where: { zh: '预留：列表翻页', en: 'Reserved: list paging' },
    match: (e) => e.kind === 'chord' && e.name === 'next',
  },
  // ── finger chords: text ──
  {
    id: 'chordText', group: 'chordText',
    name: { zh: '和弦文本（15 字符词表）', en: 'Chord text (15-char vocab)' },
    how: { zh: '文本模式下：单指=e/t/a/o/i、双指=其余、三指=空格；成形预览、松手提交', en: 'Text mode: singles=e/t/a/o/i, pairs=rest, three=space; preview then release' },
    where: { zh: '助手文本输入 / 练习面板（R142-E5）', en: 'Assistant text entry / trainer (R142-E5)' },
    match: (e) => e.kind === 'chord' && (e.name ?? '').startsWith('char:'),
  },
  // ── two hands ──
  {
    id: 'offPinch', group: 'dualHand',
    name: { zh: '副手捏合', en: 'Off-hand pinch' },
    how: { zh: '双手模式下另一只手捏合', en: 'Pinch with the secondary hand (dual-hand mode)' },
    where: { zh: '预留修饰键 KeyF（R134）', en: 'Reserved modifier KeyF (R134)' },
    match: (e) => e.kind === 'offhand' && e.name === 'pinch',
  },
  {
    id: 'offPalm', group: 'dualHand',
    name: { zh: '副手张掌保持', en: 'Off-hand palm hold' },
    how: { zh: '副手张开保持 0.8s', en: 'Secondary palm open for 0.8s' },
    where: { zh: '暂停请求（R134）', en: 'Pause request (R134)' },
    match: (e) => e.kind === 'offhand' && e.name === 'pause',
  },
  {
    id: 'gapApart', group: 'dualHand',
    name: { zh: '双手张开', en: 'Hands apart' },
    how: { zh: '两手间距拉大超过阈值', en: 'Spread the hands beyond threshold' },
    where: { zh: '预留（GapEngine）', en: 'Reserved (GapEngine)' },
    match: (e) => e.kind === 'hands' && e.name === 'apart',
  },
  {
    id: 'gapTogether', group: 'dualHand',
    name: { zh: '双手合拢', en: 'Hands together' },
    how: { zh: '两手间距收窄回阈值内', en: 'Bring the hands back together' },
    where: { zh: '预留（GapEngine）', en: 'Reserved (GapEngine)' },
    match: (e) => e.kind === 'hands' && e.name === 'together',
  },
  // ── facial expressions ──
  {
    id: 'jawOpen', group: 'face',
    name: { zh: '张嘴', en: 'Jaw open' },
    how: { zh: '张开下巴', en: 'Drop the jaw' },
    where: { zh: '修饰键 E（R135.3 预留）', en: 'Modifier E (R135.3, reserved)' },
    match: (e) => e.kind === 'face' && e.name === 'jawOpen',
  },
  {
    id: 'browRaise', group: 'face',
    name: { zh: '挑眉', en: 'Brow raise' },
    how: { zh: '抬高眉毛', en: 'Raise the inner brows' },
    where: { zh: '修饰键 Shift（预留）', en: 'Modifier Shift (reserved)' },
    match: (e) => e.kind === 'face' && e.name === 'browRaise',
  },
  {
    id: 'smile', group: 'face',
    name: { zh: '微笑', en: 'Smile' },
    how: { zh: '嘴角上扬', en: 'Smile (either side is enough)' },
    where: { zh: '修饰键 Enter（预留）', en: 'Modifier Enter (reserved)' },
    match: (e) => e.kind === 'face' && e.name === 'smile',
  },
  {
    id: 'faceNeutral', group: 'face',
    name: { zh: '中立脸校准', en: 'Neutral-face calibration' },
    how: { zh: '保持自然表情建立基线（防误触滞回）', en: 'Rest in a neutral expression to set the baseline' },
    where: { zh: '表情引擎基线', en: 'Expression engine baseline' },
    match: (e) => e.kind === 'face' && e.name === 'calibrated',
  },
  // ── cursor & advanced ──
  {
    id: 'cursor', group: 'cursor', live: 'geom',
    name: { zh: '相对光标', en: 'Relative cursor' },
    how: { zh: '手掌整体位移（触控板语义 + 动态增益 + 抖动死区）', en: 'Whole-hand displacement (trackpad + dynamic gain + dead zone)' },
    where: { zh: '全软件助手光标（R142-E2/E4b）', en: 'App-wide assistant cursor (R142-E2/E4b)' },
  },
  {
    id: 'clutch', group: 'cursor', combo: 'fistClutch',
    name: { zh: '握拳 clutch', en: 'Fist clutch' },
    how: { zh: '握拳保持 ≥0.25s 抬锚，松开恢复', en: 'Fist ≥0.25s lifts the anchor, open resumes' },
    where: { zh: '光标精修模式（R143.2）', en: 'Cursor fine-tune (R143.2)' },
  },
]

interface RowLive { count: number; lastMs: number; held: boolean; note: string }

interface LiveSignals {
  geomSeen: boolean
  predicted: boolean
  pinch: number | null
  pinchOn: number
  pinchOff: number
  fingers: { thumb: boolean; index: boolean; middle: boolean; ring: boolean; pinky: boolean } | null
  preview: { pattern: string; kind: 'command' | 'char'; name: string } | null
  buffer: string
  stats: VisionStats | null
}

const EMPTY_LIVE: LiveSignals = {
  geomSeen: false, predicted: false, pinch: null, pinchOn: 0.5, pinchOff: 0.85,
  fingers: null, preview: null, buffer: '', stats: null,
}

const FLASH_MS = 1200
const TICK_MS = 120
const GAUGE_MAX = 1.2

export function AiLabVisionTab(): JSX.Element {
  const vision = useVisionInput()
  const { t, lang } = useI18n()
  const L: 'zh' | 'en' = lang === 'zh' ? 'zh' : 'en'
  const [rows, setRows] = useState<Record<string, RowLive>>({})
  const [live, setLive] = useState<LiveSignals>(EMPTY_LIVE)
  const [busy, setBusy] = useState(false)
  const [precise, setPrecise] = useState(false)
  const [textMode, setTextMode] = useState(false)
  const lastPinchRef = useRef(0)
  const palmSinceRef = useRef<number | null>(null)
  const fistSinceRef = useRef<number | null>(null)
  const fistFiredRef = useRef(false)

  const trigger = useCallback((id: string, note?: string, held?: boolean) => {
    setRows((prev) => {
      const cur = prev[id] ?? { count: 0, lastMs: 0, held: false, note: '' }
      return { ...prev, [id]: { count: cur.count + 1, lastMs: performance.now(), held: held ?? cur.held, note: note ?? cur.note } }
    })
  }, [])

  const setHeld = useCallback((id: string, held: boolean, note?: string) => {
    setRows((prev) => {
      const cur = prev[id]
      if (!cur) return prev
      return { ...prev, [id]: { ...cur, held, note: note ?? cur.note } }
    })
  }, [])

  // event-driven row lighting — the hook dispatches EVERY pipeline event on
  // this window bus (kind direction/pinch/face/chord/offhand/hands)
  useEffect(() => {
    if (!vision.enabled) return
    const onBus = (ev: Event): void => {
      const e = (ev as CustomEvent<BusEvent>).detail
      if (!e) return
      // double-pinch combo (R139 semantics: two Space downs <900ms)
      if (e.kind === 'pinch' && e.key === 'Space' && e.down) {
        const now = performance.now()
        if (now - lastPinchRef.current < 900) trigger('doublePinch')
        lastPinchRef.current = now
      }
      for (const cap of CAPS) {
        if (!cap.match || !cap.match(e)) continue
        const heldKind = HELD_KINDS.has(e.kind)
        if (heldKind && e.down === false) { setHeld(cap.id, false); continue }
        const note = cap.id === 'dir8'
          ? (e.dir ?? '')
          : cap.id === 'chordText'
            ? ((e.name ?? '').startsWith('char:') ? e.name!.slice(5) : (e.name ?? ''))
            : ''
        trigger(cap.id, note, heldKind && e.down !== false ? true : undefined)
      }
    }
    window.addEventListener('vision-input', onBus)
    return () => window.removeEventListener('vision-input', onBus)
  }, [vision.enabled, trigger, setHeld])

  // snapshot-driven ticker: live signal readouts + the two frame-based combos
  useEffect(() => {
    if (!vision.enabled) return
    const id = window.setInterval(() => {
      const f = vision.frameRef.current ?? null
      const now = performance.now()
      const geom = f?.geom ?? null
      const pinchVal = geom ? geom.pinch : (f?.pinch ?? null)
      const profile = (f?.profile ?? null) as Record<string, unknown> | null
      const pinchOn = typeof profile?.pinchOn === 'number' ? (profile.pinchOn as number) : 0.5
      const pinchOff = typeof profile?.pinchOff === 'number' ? (profile.pinchOff as number) : 0.85
      const lm = f?.pickedLandmarks ?? null
      const fingers = lm && lm.length >= 21 ? fingerStates(lm) : null
      setLive({
        geomSeen: geom != null,
        predicted: f?.geomPredicted != null,
        pinch: typeof pinchVal === 'number' ? pinchVal : null,
        pinchOn, pinchOff, fingers,
        preview: f?.chordPreview ?? null,
        buffer: f?.chordBuffer ?? '',
        stats: f?.stats ?? null,
      })
      // open-palm hold combo (MiniGamesView R138 params: pinch > pinchOff, 700ms)
      const open = geom != null && typeof pinchVal === 'number' && pinchVal > pinchOff
      if (open) {
        if (palmSinceRef.current == null) palmSinceRef.current = now
        else if (now - palmSinceRef.current >= 700) { palmSinceRef.current = null; trigger('palmHold') }
      } else {
        palmSinceRef.current = null
      }
      // fist clutch combo (R143.2 semantics: all four fingers folded ≥250ms)
      const fist = fingers != null && !fingers.index && !fingers.middle && !fingers.ring && !fingers.pinky
      if (fist) {
        if (fistSinceRef.current == null) { fistSinceRef.current = now; fistFiredRef.current = false }
        else if (!fistFiredRef.current && now - fistSinceRef.current >= 250) {
          fistFiredRef.current = true
          trigger('clutch', undefined, true)
        }
      } else {
        if (fistFiredRef.current) setHeld('clutch', false)
        fistSinceRef.current = null
        fistFiredRef.current = false
      }
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [vision.enabled, vision.frameRef, trigger, setHeld])

  const start = async (): Promise<void> => {
    setBusy(true)
    try { await vision.enable() } catch { /* camera denied — the state chip tells the story */ } finally { setBusy(false) }
  }

  // R144.7 E2E seam (games __rgbboxVision precedent): packaged-app
  // verification starts the camera-free synthetic pipeline and asserts the
  // bench from outside. No user-visible behavior; unregisters on unmount.
  const visionRef = useRef(vision)
  visionRef.current = vision
  useEffect(() => {
    const w = window as unknown as { __rgbboxVisionLab?: unknown }
    w.__rgbboxVisionLab = {
      async startSynthetic(): Promise<boolean> {
        try { await visionRef.current.enableSynthetic(); return true } catch { return false }
      },
    }
    return () => { w.__rgbboxVisionLab = undefined }
  }, [])

  const toggleTextMode = (on: boolean): void => {
    setTextMode(on)
    vision.setChordTextMode(on)
    if (!on) setLive((s) => ({ ...s, buffer: '' }))
  }

  const statsText = live.stats == null ? '—'
    : `${Math.round(live.stats.inferFps)} fps · p95 ${Math.round(live.stats.infer.p95)} ms · ${live.stats.delegate}`
      + (live.stats.acquire ? ` · acquire p95 ${Math.round(live.stats.acquire.p95)} ms` : '')
      + (live.stats.cam && live.stats.cam.w ? ` · cam ${live.stats.cam.w}×${live.stats.cam.h}@${live.stats.cam.fps}` : '')

  const gaugePct = live.pinch == null ? 0 : Math.max(0, Math.min(100, (live.pinch / GAUGE_MAX) * 100))
  const markPct = (v: number): number => Math.max(0, Math.min(100, (v / GAUGE_MAX) * 100))
  const anyCounts = Object.keys(rows).length > 0

  return (
    <div className="ai-vision-lab" data-running={vision.enabled ? '1' : '0'}>
      <div className="ai-vision-head">
        <strong>{t('ai.lab.vision.title')}</strong>
        <button type="button" data-action="vision-start" onClick={() => void start()} disabled={vision.enabled || busy}>
          {t('ai.lab.vision.start')}
        </button>
        <button type="button" data-action="vision-stop" onClick={() => vision.disable()} disabled={!vision.enabled}>
          {t('ai.lab.vision.stop')}
        </button>
        <button type="button" data-action="vision-recal" onClick={() => vision.recalibrate()} disabled={!vision.enabled}>
          {t('ai.lab.vision.recal')}
        </button>
        <button type="button" data-action="vision-skip" onClick={() => vision.skipCalibration()} disabled={!vision.enabled}>
          {t('ai.lab.vision.skip')}
        </button>
        <button type="button" data-action="vision-reset" onClick={() => setRows({})} disabled={!anyCounts}>
          {t('ai.lab.vision.reset')}
        </button>
        <span className={`ai-status dash-dot${vision.enabled ? ' on' : ''}`}>
          {!vision.enabled ? t('ai.lab.vision.state.off')
            : vision.state === 'active' && !vision.handSeen ? t('games.vision.state.searching')
              : t(`games.vision.state.${vision.state}`)}
        </span>
      </div>
      <p className="ai-vision-hint">{t('ai.lab.vision.hint')}</p>

      <table className="vision-cap-table">
        <thead>
          <tr>
            <th>{t('ai.lab.vision.col.cap')}</th>
            <th>{t('ai.lab.vision.col.how')}</th>
            <th>{t('ai.lab.vision.col.live')}</th>
            <th>{t('ai.lab.vision.col.where')}</th>
          </tr>
        </thead>
        <tbody>
          {GROUPS.map((g) => (
            <Fragment key={g}>
              <tr className="cap-group"><td colSpan={4}>{t(`ai.lab.vision.g.${g}`)}</td></tr>
              {CAPS.filter((c) => c.group === g).map((cap) => {
                const r = rows[cap.id]
                const flash = r != null && performance.now() - r.lastMs < FLASH_MS
                const active = cap.live === 'geom' ? live.geomSeen : cap.live === 'predicted' ? live.predicted : false
                return (
                  <tr key={cap.id} data-cap={cap.id} className={flash ? 'cap-row flash' : 'cap-row'}>
                    <td>{cap.name[L]}</td>
                    <td className="cap-how">{cap.how[L]}</td>
                    <td className="cap-live">
                      {r != null && r.count > 0 && <span className="cap-count">×{r.count}</span>}
                      {r?.held === true && <span className="cap-held">{t('ai.lab.vision.live.held')}</span>}
                      {r?.note !== undefined && r.note !== '' && <span className="cap-note">{r.note}</span>}
                      {cap.live !== undefined && (
                        <span className={active ? 'cap-active on' : 'cap-active'}>{t('ai.lab.vision.live.active')}</span>
                      )}
                      {r == null && cap.live === undefined && <span className="cap-idle">—</span>}
                    </td>
                    <td className="cap-where">{cap.where[L]}</td>
                  </tr>
                )
              })}
            </Fragment>
          ))}
        </tbody>
      </table>

      <aside className="vision-explore">
        <h4>{t('ai.lab.vision.explore')}</h4>
        {vision.enabled && <VisionPad vision={vision} />}
        <div>
          <label>{t('ai.lab.vision.pinch')}</label>
          <div className="vision-gauge" data-field="pinch-gauge">
            <span className="vision-gauge-fill" style={{ width: `${gaugePct}%` }} />
            <span className="vision-gauge-mark" style={{ left: `${markPct(live.pinchOn)}%` }} />
            <span className="vision-gauge-mark" style={{ left: `${markPct(live.pinchOff)}%` }} />
          </div>
          <span className="vision-gauge-val">{live.pinch == null ? '—' : live.pinch.toFixed(2)}</span>
        </div>
        <div>
          <label>{t('ai.lab.vision.fingers')}</label>
          <div className="vision-fingers">
            {(['thumb', 'index', 'middle', 'ring', 'pinky'] as const).map((f, i) => (
              <span key={f} data-finger={f} className={live.fingers?.[f] === true ? 'on' : ''}>
                {['T', 'I', 'M', 'R', 'P'][i]}
              </span>
            ))}
          </div>
        </div>
        <div>
          <label>{t('ai.lab.vision.preview')}</label>
          <div className="vision-preview-big" data-field="chord-preview">{live.preview ? live.preview.name : '—'}</div>
          <div className="vision-preview-sub">{live.preview ? live.preview.pattern : ''}</div>
        </div>
        <div>
          <label>{t('ai.lab.vision.buffer')}</label>
          <div className="vision-buffer" data-field="chord-buffer">{live.buffer !== '' ? live.buffer : '—'}</div>
        </div>
        <div>
          <label>{t('ai.lab.vision.stats')}</label>
          <div className="vision-stats-line" data-field="vision-stats">{statsText}</div>
        </div>
        <div className="vision-params">
          <h4>{t('ai.lab.vision.params')}</h4>
          <label className="vision-param-row">
            <input type="checkbox" data-param="mirror" checked={vision.mirror} onChange={(e) => vision.setMirror(e.target.checked)} />
            {t('ai.lab.vision.mirror')}
          </label>
          <label className="vision-param-row">
            {/* R149: left-handed users switch the primary-hand role instead of
                relying on the lone-hand promotion heuristic. Plain text (zh/en
                inline, the tab's established pattern for param rows). */}
            {L === 'zh' ? '主手' : 'Primary hand'}
            <select data-param="primary-hand" value={vision.primaryHand}
              onChange={(e) => vision.setPrimaryHand(e.target.value as 'Left' | 'Right')}>
              <option value="Right">{L === 'zh' ? '右手' : 'Right'}</option>
              <option value="Left">{L === 'zh' ? '左手' : 'Left'}</option>
            </select>
          </label>
          <label className="vision-param-row">
            {t('ai.lab.vision.sens')}
            <select data-param="sensitivity" value={vision.sensitivity}
              onChange={(e) => vision.setSensitivity(e.target.value as VisionSensitivity)}>
              <option value="standard">{t('ai.lab.vision.sens.standard')}</option>
              <option value="fast">{t('ai.lab.vision.sens.fast')}</option>
              <option value="sport">{t('ai.lab.vision.sens.sport')}</option>
            </select>
          </label>
          <label className="vision-param-row">
            {t('ai.lab.vision.precise')}
            <select data-param="precision" value={precise ? 'hi' : 'fast'}
              onChange={(e) => { const hi = e.target.value === 'hi'; setPrecise(hi); vision.setCapturePrecision(hi) }}>
              <option value="fast">{t('ai.lab.vision.precise.fast')}</option>
              <option value="hi">{t('ai.lab.vision.precise.hi')}</option>
            </select>
          </label>
          <label className="vision-param-row">
            <input type="checkbox" data-param="textmode" checked={textMode} onChange={(e) => toggleTextMode(e.target.checked)} />
            {t('ai.lab.vision.textMode')}
          </label>
        </div>
      </aside>
    </div>
  )
}
