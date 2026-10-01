import { ArrowLeft, Crosshair, Eye, EyeOff, Grid, Heart, Maximize2, Minimize2, Music, Play, RotateCcw, Shield, Trophy, Volume2, VolumeX, Zap } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type JSX, type MouseEvent } from 'react'
import { useVisionInput } from '../hooks/useVisionInput'
import { useI18n } from '../i18n'
import { DIFFICULTY_SCORE_MULT, GAME_DIFFICULTIES, drawExitBadge, drawHudButton, drawHudPanel, hitTest, isGameDifficulty, type GameDifficulty, type HudButton } from '../games/hud'
import { autoPick } from '../games/swarmAutoPick'
import { assignGamepads, buildKeyToPoolMap, loadInputConfigs, type InputConfigs } from '../domain/inputConfig'
import { deployPlayers } from '../games/survival'
import { LanPanel } from './games/LanPanel'
import { InputConfigPanel } from './games/InputConfigPanel'
import { AvatarPicker } from './games/AvatarPicker'
import { VisionBanner } from './vision/VisionBanner'
import { VisionCursor } from './vision/VisionCursor'
import { createCursorState } from '../vision/cursor'
import { VisionPad } from './vision/VisionPad'
import {
  HEIGHT,
  MAX_WAVE,
  SELL_REFUND,
  castMeteor,
  extrapolateBalloons,

  TOWER_DEFINITIONS,
  TOWER_MAX_LEVEL,
  WIDTH,
  addText,
  distanceToPath,
  drawGame,
  initialState,
  launchWave,
  TD_BASE_COINS,
  TD_DIFFICULTY_PARAMS,
  sellTower,
  spawnBurst,
  tickGame,
  towerUpgradeCost,
  upgradeTower,
  tdHints,
  type GameState,
  type TowerKind,
} from '../games/td'
import { LOGICAL_H, LOGICAL_W, computeHdSize } from '../games/hdCanvas'
import {
  UPGRADES,
  applyRouletteResult,
  applyUpgrade,
  debugSpawnBoss,
  dissolveRoulette,
  drawSurvival,
  drawSurvivalBackground,
  setSurvivalDifficulty,
  worldToViewport,
  initialSurvivalState,
  openRoulette,
  startSurvival,
  SURVIVAL_DIFFICULTY_PARAMS,
  tickSurvival,
  survivalHints,
  type SurvivalState,
  type UpgradeId,
} from '../games/survival'
import {
  ACHIEVEMENTS,
  ARTIFACTS,
  CHARACTERS,
  PERM_UPGRADES,
  PERM_MAX,
  RARITY_COLORS,
  buyPerm,
  checkAchievements,
  isArtifactUnlocked,
  permCost,
  readCharacter,
  readMeta,
  rollRouletteItem,
  rollRouletteStat,
  runCoinsFor,
  writeCharacter,
  writeMeta,
  type AchievementId,
  type ArtifactId,
  type CharacterId,
  type PermKey,
  type RouletteResult,
  type SwarmMeta,
} from '../games/swarmMeta'
import { isBgmEnabled, isSfxEnabled, playSfx, setBgmEnabled, setBgmPreset, setBgmTension, setSfxEnabled, startBgm, stopBgm } from '../games/sfx'
import { isOnboarded, markOnboarded, pickHint, type CoachHint } from '../games/coach'
import { loadRuns, profileStats, recordRun, type GameId } from '../domain/gamesTelemetry'
import { recapCoachKey } from '../games/juice'
import { dailySeed, loadDaily, mulberry32, recordDaily } from '../games/daily'
import {
  RUN_SECONDS,
  bomb as slashBomb,
  drawSlash,
  initialSlashState,
  judgeDuel,
  slash as slashCut,
  startSlash,
  slashHints,
  tickSlash,
  type SlashState,
} from '../games/slash'
import {
  applyGarbage,
  drawTetris,
  garbageFor,
  initialTetrisState,
  stackHeight,
  startTetris,
  tetrisHints,
  tickTetris,
  type TetrisState,
} from '../games/tetris'


/** R198(FR-G01.3): 首局引导三步——done 为引擎态纯判定(3s 节流内步进)。 */
const ONBOARD_STEPS = {
  td: [
    { key: 'td.1', done: (s: GameState) => s.towers.length >= 1 },
    { key: 'td.2', done: (s: GameState) => s.wave >= 1 },
    { key: 'td.3', done: (s: GameState) => s.towers.some((t) => t.level >= 2) },
  ],
  survival: [
    { key: 'sw.1', done: (s: SurvivalState) => s.clock > 4 },
    // R220.1③: taken 初始化即含全部 12 键(值为 0),按 length>=1 恒真——升级
    // 教学步从未真正等待玩家首次升级;改判「任一升级 >0」。
    { key: 'sw.2', done: (s: SurvivalState) => Object.values(s.taken).some((v) => v > 0) },
    { key: 'sw.3', done: (s: SurvivalState) => s.bossKills >= 1 || s.level >= 3 },
  ],
  tetris: [
    { key: 'te.1', done: (s: TetrisState) => s.pieceId >= 2 },
    { key: 'te.2', done: (s: TetrisState) => s.score > 0 },
    { key: 'te.3', done: (s: TetrisState) => s.holdKind !== null },
  ],
  slash: [
    { key: 'sl.1', done: (s: SlashState) => s.bestCombo >= 1 },
    { key: 'sl.2', done: (s: SlashState) => s.bestCombo >= 3 },
    { key: 'sl.3', done: (s: SlashState) => s.score >= 50 },
  ],
} as const

type Screen = 'hub' | 'td' | 'survival' | 'tetris' | 'slash'
type GameKey = 'td' | 'survival' | 'tetris' | 'slash'

const BEST_KEYS: Record<GameKey, string> = {
  td: 'rgbbox:gamesBest:balloon',
  survival: 'rgbbox:gamesBest:survival',
  tetris: 'rgbbox:gamesBest:tetris',
  slash: 'rgbbox:gamesBest:slash',
}

function readBest(game: GameKey): number {
  try {
    const raw = localStorage.getItem(BEST_KEYS[game])
    const value = raw === null ? 0 : Number(raw)
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
  } catch {
    return 0
  }
}

function writeBest(game: GameKey, score: number): void {
  try {
    localStorage.setItem(BEST_KEYS[game], String(Math.floor(score)))
  } catch {
    return
  }
}

const MOVEMENT_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'space'])

/** R211: 画布内多行文字(按像素宽度断行),fs HUD 的 Swarm 三选一描述用。 */
function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, maxW: number, lineH: number): void {
  const chars = Array.from(text)
  let line = ''
  let row = 0
  for (const ch of chars) {
    if (ctx.measureText(line + ch).width > maxW) {
      ctx.fillText(line, cx, y + row * lineH)
      line = ch
      row += 1
      if (row > 3) return
    } else {
      line += ch
    }
  }
  if (line) ctx.fillText(line, cx, y + row * lineH)
}

// R135 (guide §3.6/§3.7): vision passthrough keys — movement + face modifiers
// (jaw=E, brow=Shift, smile=Enter) + off-hand pinch (KeyF). Games consume
// keys.has('e') etc. when a skill mapping lands.
const VISION_PASSTHROUGH_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'space', 'e', 'shift', 'enter', 'f', 'c']

// DirectionRing defaults (gesture_engine.js, upstream v2) — the analog path
// must apply the same transform the sector ring sees. Keep in sync.
/** R204(FR-G05)→R218 U4: 难度四档(休闲/标准/困难/炼狱),按作持久化
 * rgbbox:gamesDifficulty:<id>;旧二档值 'casual'/'standard' 直接映射,
 * 非法/缺失回落 'standard'。类型统一到 games/hud.ts 的 GameDifficulty。 */
export type Difficulty = GameDifficulty
function readDifficulty(id: string): GameDifficulty {
  try {
    const raw = localStorage.getItem('rgbbox:gamesDifficulty:' + id)
    return isGameDifficulty(raw) ? raw : 'standard'
  } catch { return 'standard' }
}
function writeDifficulty(id: string, d: GameDifficulty): void {
  try { localStorage.setItem('rgbbox:gamesDifficulty:' + id, d) } catch { /* best-effort */ }
}

/** R218 U3: ready 态「更多设置」抽屉展开记忆(全局,不分作)。 */
function readDrawerOpen(): boolean {
  try { return localStorage.getItem('rgbbox:gamesReady:drawer') === '1' } catch { return false }
}
function writeDrawerOpen(open: boolean): void {
  try { localStorage.setItem('rgbbox:gamesReady:drawer', open ? '1' : '0') } catch { /* best-effort */ }
}

/** R218 U9: 「画面大小」三档偏好(标准/大/专注)——rgbbox:gamesFocusMode;
 * 'focus' = 每次开局自动进入专注模式(窗口内满幅,与 OS 级 fs 全屏正交)。 */
type ScreenScale = 'standard' | 'large' | 'focus'
function readScreenScale(): ScreenScale {
  try {
    const raw = localStorage.getItem('rgbbox:gamesFocusMode')
    return raw === 'large' || raw === 'focus' ? raw : 'standard'
  } catch { return 'standard' }
}
function writeScreenScale(scale: ScreenScale): void {
  try { localStorage.setItem('rgbbox:gamesFocusMode', scale) } catch { /* best-effort */ }
}

/** R218 U3: 上次选择全记忆——按作 JSON(rgbbox:gamesReady:<game>),坏值整体忽略。 */
type SwarmSceneId = 'station' | 'desert' | 'snow' | 'grass' | 'ocean' | 'fusion'
interface ReadyPrefs {
  /** td:无尽 / 闪电赛 / 分工合作 */
  endless?: boolean
  blitz?: boolean
  coop?: boolean
  /** survival:人数 / 场景 / 90s 冲刺 / R220.5 每日挑战(种子局) */
  players?: 1 | 2 | 3 | 4
  scene?: SwarmSceneId
  sprint?: boolean
  daily?: boolean
  /** tetris:40 行竞速 / 双板对决 */
  race?: boolean
  duel?: boolean
  /** slash:30s 爆发 / 轮换对决(tetris 与 slash 各自 key 空间,不冲突) */
  burst?: boolean
}
function readReadyPrefs(game: string): ReadyPrefs {
  try {
    const parsed = JSON.parse(localStorage.getItem('rgbbox:gamesReady:' + game) ?? '{}') as ReadyPrefs
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch { return {} }
}
function writeReadyPrefs(game: string, prefs: ReadyPrefs): void {
  try { localStorage.setItem('rgbbox:gamesReady:' + game, JSON.stringify(prefs)) } catch { /* best-effort */ }
}

// ── R218 merge 适配:shim 已移除,四作难度经各引擎真实参数表生效 ─────────────
// TD/Tetris/Slash/Survival 开局一律走 initialState(difficulty)/第 4/3 参
// 传参(引擎内 lives/起始金/起始等级/敌系数/血量基数为权威来源)。

/** R207(FR-G04): 手势指示器(vision-pad)全局开关——默认关闭,持久化。 */
function readVisionPadVisible(): boolean {
  try { return localStorage.getItem('rgbbox:visionPadVisible') === '1' } catch { return false }
}
function writeVisionPadVisible(on: boolean): void {
  try { localStorage.setItem('rgbbox:visionPadVisible', on ? '1' : '0') } catch { /* best-effort */ }
}

const VISION_GAIN_X = 1.4
const VISION_GAIN_Y = 1.6

export function MiniGamesView(): JSX.Element {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const tdStateRef = useRef<GameState>(initialState(readDifficulty('td')))
  const survivalRef = useRef<SurvivalState>(initialSurvivalState())
  const tetrisRef = useRef<TetrisState>(initialTetrisState(undefined, readDifficulty('tetris')))
  /** R208(FR-MP02): 双板对战的 B 板实例(独立 grid/queue/hold/lock-delay)。 */
  const tetrisBRef = useRef<TetrisState>(initialTetrisState(undefined, readDifficulty('tetris')))
  const slashRef = useRef<SlashState>(initialSlashState())
  const bestRef = useRef<Record<GameKey, number>>({ td: readBest('td'), survival: readBest('survival'), tetris: readBest('tetris'), slash: readBest('slash') })
  const [screen, setScreen] = useState<Screen>('hub')
  const [fullscreen, setFullscreen] = useState(false)
  // R206(FR-G03.5): fs 态暂停浮层(Esc 呼出;继续/重开/退出全屏/返回 hub)
  const [fsPaused, setFsPaused] = useState(false)
  const fsPausedRef = useRef(false)
  fsPausedRef.current = fsPaused
  const [sfxOn, setSfxOn] = useState(() => isSfxEnabled())
  const [selectedTower, setSelectedTower] = useState<TowerKind>('dart')
  const [selectedTowerId, setSelectedTowerId] = useState<number | null>(null)
  const [tdSpeed, setTdSpeed] = useState<1 | 2>(1)
  // R220.1⑦: 游戏循环 effect 的状态读值一律走 ref——原 deps 含
  // tdSpeed/selectedTowerId/bgmOn/fullscreen,任一变化整个 rAF 循环重建并
  // startBgm() 从头重启音乐(G5)。
  const tdSpeedRef = useRef(tdSpeed)
  tdSpeedRef.current = tdSpeed
  const selectedTowerIdRef = useRef(selectedTowerId)
  selectedTowerIdRef.current = selectedTowerId
  const fullscreenRef = useRef(fullscreen)
  fullscreenRef.current = fullscreen
  // R201: TD 无尽模式 + 放置悬停预览(F6)
  const [tdEndless, setTdEndless] = useState(false)
  // R220.1⑩: TD 悬停预览改 ref——原 state 每次mousemove触发 2939 行全树重渲,
  // 且 rAF 闭包依赖表缺它导致 R201 悬停射程圈实际失效(02 U-4/04 双报)。
  const tdHoverRef = useRef<{ x: number; y: number } | null>(null)
  // R204: 难度二档(按作) → R218 U4: 四档
  const [difficulty, setDifficulty] = useState<Difficulty>(() => readDifficulty('td'))
  const [bests, setBests] = useState<Record<GameKey, number>>({ ...bestRef.current })
  /** R218 U4: 本局难度(开局时定格)——结算分数 ×DIFFICULTY_SCORE_MULT 挂街机档案。 */
  const runDifficultyRef = useRef<GameDifficulty>('standard')
  // ── R198(FR-G01): 教练条 + 首局引导 ──
  const [coachHint, setCoachHint] = useState<CoachHint | null>(null)
  const [coachOff, setCoachOff] = useState(() => {
    try { return localStorage.getItem('rgbbox:gamesCoach') === '0' } catch { return false }
  })
  const [onboardStep, setOnboardStep] = useState(0)
  const coachLastShownRef = useRef<Record<string, number>>({})
  const coachAccRef = useRef(0)
  // ── R211: fs 纯画布 HUD(hud.ts 接线)——几何/悬停/动作经 ref 桥接进 rAF 闭包 ──
  const fsButtonsRef = useRef<HudButton[]>([])
  const hudHoverRef = useRef<string | null>(null)
  const lastInputAtRef = useRef(0)
  const fsActionRef = useRef<Record<string, () => void>>({})
  const fsDrawRef = useRef<(ctx: CanvasRenderingContext2D, now: number) => void>(() => undefined)
  const selectedTowerActionRef = useRef<(kind: TowerKind) => void>(() => undefined)
  const chooseUpgradeRef = useRef<(id: UpgradeId) => void>(() => undefined)
  // R200(FR-G06.5): 统一 run recap(结算面板)
  // R207: 手势指示器开关(默认关;Banner/Cursor 功能组件不受影响)
  const [visionPadVisible, setVisionPadVisible] = useState(readVisionPadVisible)
  const [recap, setRecap] = useState<{ score: number; deltaPct: number | null; best: number; highlight: string; coach: string } | null>(null)
  // ── R208 (FR-MP03/MP04): 本地双人——Slash 轮换对决 / TD 分工合作 ──
  const [slashDuelOn, setSlashDuelOn] = useState(false)
  const slashDuelOnRef = useRef(false)
  slashDuelOnRef.current = slashDuelOn
  const [duel, setDuel] = useState<{ turn: 1 | 2; scores: [number | null, number | null]; done: boolean } | null>(null)
  const duelRef = useRef<{ turn: 1 | 2; scores: [number | null, number | null]; done: boolean } | null>(null)
  duelRef.current = duel
  const [tdCoopOn, setTdCoopOn] = useState(false)
  // R218 U3: swarmCoopOn 独立开关移除——人数选择(≥2P)即合作,提示语随之推导。
  // ── R213: Swarm 4P/场景/自动预选/按键配置 ──
  const [swarmPlayers, setSwarmPlayers] = useState<1 | 2 | 3 | 4>(1)
  const swarmPlayersRef = useRef<1 | 2 | 3 | 4>(1)
  swarmPlayersRef.current = swarmPlayers
  const [swarmScene, setSwarmScene] = useState<SwarmSceneId>('station')
  const swarmSceneRef = useRef<SwarmSceneId>('station')
  swarmSceneRef.current = swarmScene
  const [autoPickMode, setAutoPickMode] = useState<'off' | 'list' | 'best'>(() => {
    try { return (JSON.parse(localStorage.getItem('rgbbox:swarmAutoPick') ?? '"off"') as 'off' | 'list' | 'best') ?? 'off' } catch { return 'off' }
  })
  const [inputPanelOpen, setInputPanelOpen] = useState(false)
  /** R218 U3: 「更多设置」抽屉展开态(localStorage 记忆,默认折叠)。 */
  const [drawerOpen, setDrawerOpen] = useState(readDrawerOpen)
  // ── R218 U9: 画面占比三档偏好 + 专注模式(窗口内满幅,瞬时态) ──
  const [screenScale, setScreenScale] = useState<ScreenScale>(readScreenScale)
  const screenScaleRef = useRef<ScreenScale>('standard')
  screenScaleRef.current = screenScale
  const [focusMode, setFocusMode] = useState(false)
  const focusModeRef = useRef(false)
  focusModeRef.current = focusMode
  const swarmAutoPickRef = useRef<{ mode: 'off' | 'list' | 'best'; prefs: UpgradeId[] }>({ mode: 'off', prefs: ['fireRate', 'damage', 'multishot', 'speed', 'magnet', 'maxHp', 'blade', 'pierce'] })
  swarmAutoPickRef.current.mode = autoPickMode
  // R220.2: autoPick 延迟拍板态——选择+高亮即刻呈现,1s 后执行(修静默剥夺)
  const [autoPickChoice, setAutoPickChoice] = useState<UpgradeId | null>(null)
  const autoPickChoiceRef = useRef<UpgradeId | null>(null)
  const autoPickAtRef = useRef(0)
  const AUTO_PICK_DELAY_MS = 1000
  const [keyMap, setKeyMap] = useState<Record<string, string>>(() => buildKeyToPoolMap(loadInputConfigs(localStorage)))
  const keyMapRef = useRef<Record<string, string>>({})
  keyMapRef.current = keyMap
  /** R213 二期: 原始四玩家配置(pollGamepad 的 assignGamepads 映射用;
   *  InputConfigPanel 应用时同步更新)。 */
  const inputConfigsRef = useRef<InputConfigs>(loadInputConfigs(localStorage))
  /** R213: P1 配置键→引擎标准箭头键(P1 手感恒定;箭头键恒属 P1)。 */
  const [p1KeyMap, setP1KeyMap] = useState<Record<string, string>>(() => {
    const p1 = loadInputConfigs(localStorage)[0]
    return {
      [p1.up]: 'arrowup', [p1.down]: 'arrowdown', [p1.left]: 'arrowleft', [p1.right]: 'arrowright',
      arrowup: 'arrowup', arrowdown: 'arrowdown', arrowleft: 'arrowleft', arrowright: 'arrowright',
    }
  })
  const p1KeyMapRef = useRef<Record<string, string>>({})
  p1KeyMapRef.current = p1KeyMap
  // R213: 头像画布贴图(128² PNG dataURL → Image;有头像的玩家绘制时贴图替代飞船)
  const [avatars, setAvatars] = useState<Array<HTMLImageElement | null>>([null, null, null, null])
  const avatarsRef = useRef<Array<HTMLImageElement | null>>([null, null, null, null])
  avatarsRef.current = avatars
  const refreshAvatars = useCallback(async () => {
    const next: Array<HTMLImageElement | null> = [null, null, null, null]
    for (let slot = 1; slot <= 4; slot += 1) {
      const url = await window.rgbbox?.avatarGet?.(slot).catch(() => null) ?? null
      if (url === null) continue
      const img = new Image()
      img.src = url
      await new Promise<void>((resolve) => { img.onload = () => resolve(); img.onerror = () => resolve() })
      if (img.width > 0) next[slot - 1] = img
    }
    setAvatars(next)
  }, [])
  useEffect(() => { void refreshAvatars() }, [refreshAvatars])
  /** R213: InputConfigPanel 应用——重建 P1/P2-P4 映射。 */
  const applyInputConfigs = useCallback((configs: InputConfigs) => {
    inputConfigsRef.current = configs
    setKeyMap(buildKeyToPoolMap(configs))
    const p1 = configs[0]
    setP1KeyMap({
      [p1.up]: 'arrowup', [p1.down]: 'arrowdown', [p1.left]: 'arrowleft', [p1.right]: 'arrowright',
      arrowup: 'arrowup', arrowdown: 'arrowdown', arrowleft: 'arrowleft', arrowright: 'arrowright',
    })
  }, [])
  const [tetrisDuelOn, setTetrisDuelOn] = useState(false)
  const tetrisDuelOnRef = useRef(false)
  tetrisDuelOnRef.current = tetrisDuelOn
  // ── R205 尾款(FR-G08): 短局矩阵——四作 ready 态开关,起跑时写入引擎 ──
  const [tdBlitzOn, setTdBlitzOn] = useState(false)
  const tdBlitzOnRef = useRef(false)
  tdBlitzOnRef.current = tdBlitzOn
  const [swarmSprintOn, setSwarmSprintOn] = useState(false)
  const swarmSprintOnRef = useRef(false)
  swarmSprintOnRef.current = swarmSprintOn
  // R220.5(OD-05): 每日挑战——种子局(mulberry32(dailySeed())),当日共同棋盘
  const [swarmDailyOn, setSwarmDailyOn] = useState(false)
  const swarmDailyOnRef = useRef(false)
  swarmDailyOnRef.current = swarmDailyOn
  const [tetrisRaceOn, setTetrisRaceOn] = useState(false)
  const tetrisRaceOnRef = useRef(false)
  tetrisRaceOnRef.current = tetrisRaceOn
  const [slashBurstOn, setSlashBurstOn] = useState(false)
  const slashBurstOnRef = useRef(false)
  slashBurstOnRef.current = slashBurstOn
  // ── R209 (FR-LN01-05): LAN 联机——TD 合作(房主权威,客端指令+快照渲染) ──
  const [lanPanelOpen, setLanPanelOpen] = useState(false)
  const [lanRole, setLanRole] = useState<'idle' | 'host' | 'guest'>('idle')
  const lanRoleRef = useRef<'idle' | 'host' | 'guest'>('idle')
  lanRoleRef.current = lanRole
  const lanSnapRef = useRef<GameState | null>(null)
  /** R209 三期: 客端插值基——最近一帧快照的 balloons 深拷贝+词缀与到达
   *  时间戳(逐帧外推的只读基准;tdStateRef.current 与快照同对象,直接改
   *  它的 balloons 会污染基准,故存副本)。 */
  const lanSnapExRef = useRef<{ balloons: GameState['balloons']; affix: GameState['affix'] } | null>(null)
  const lanSnapAtRef = useRef(0)
  const lanPeersRef = useRef(0)
  // ── R209 三期(FR-LN05): LAN Tetris 对战——事件同步(双方各跑本地引擎) ──
  /** 房间类型(td=快照合作 / tetris=事件对战)。 */
  const [lanGame, setLanGame] = useState<'td' | 'tetris'>('td')
  const lanGameRef = useRef<'td' | 'tetris'>('td')
  lanGameRef.current = lanGame
  /** tetris 开局种子(host 建房生成随 welcome 下发 / guest 从 welcome 收取)。 */
  const lanSeedRef = useRef<number | null>(null)
  /** 对战比分互显(mine=本局本端结算分,theirs=对方 result 事件;null=未开局)。 */
  const [lanTetrisScore, setLanTetrisScore] = useState<{ mine: number | null; theirs: number | null } | null>(null)
  const [lanNotice, setLanNotice] = useState<string | null>(null)
  const buildTowerAtRef = useRef((_point: { x: number; y: number }) => undefined)

  // R198: 首局引导——首次进入该作时武装(完成/跳过后永不再现)
  useEffect(() => {
    if (screen === 'hub') { setOnboardStep(0); setRecap(null); return }
    setDifficulty(readDifficulty(screen))
    // R218 U3: 上次选择全记忆——重进恢复(rgbbox:gamesReady:<game>)。
    const prefs = readReadyPrefs(screen)
    if (screen === 'td') {
      setTdEndless(prefs.endless === true)
      setTdBlitzOn(prefs.blitz === true)
      setTdCoopOn(prefs.coop === true)
      tdStateRef.current.endless = prefs.endless === true
    } else if (screen === 'survival') {
      setSwarmPlayers(prefs.players ?? 1)
      setSwarmScene(prefs.scene ?? 'station')
      setSwarmSprintOn(prefs.sprint === true)
      setSwarmDailyOn(prefs.daily === true)
    } else if (screen === 'tetris') {
      setTetrisRaceOn(prefs.race === true)
      setTetrisDuelOn(prefs.duel === true)
    } else if (screen === 'slash') {
      setSlashBurstOn(prefs.burst === true)
      setSlashDuelOn(prefs.duel === true)
    }
    // R205(FR-G07 一期): 进作切分曲(TD 沉稳/Swarm 急促/Tetris 上行/Slash 强拍)
    setBgmPreset(screen === 'td' ? 'td' : screen === 'survival' ? 'swarm' : screen === 'tetris' ? 'tetris' : 'slash')
    setOnboardStep(isOnboarded(localStorage, screen) ? 0 : 1)
    setCoachHint(null)
    coachLastShownRef.current = {}
    coachAccRef.current = 3 // 进入即评估一次
  }, [screen])

  const [tdSnapshot, setTdSnapshot] = useState<GameState>(() => ({ ...tdStateRef.current }))
  const [survivalSnapshot, setSurvivalSnapshot] = useState<SurvivalState>(() => ({ ...survivalRef.current, keys: new Set() }))
  const [tetrisSnapshot, setTetrisSnapshot] = useState<TetrisState>(() => ({ ...tetrisRef.current, keys: new Set() }))
  const [slashSnapshot, setSlashSnapshot] = useState<SlashState>(() => initialSlashState())
  const [swarmCharacter, setSwarmCharacter] = useState<CharacterId>(() => readCharacter())
  const [meta, setMeta] = useState<SwarmMeta>(() => readMeta())
  const [roulette, setRoulette] = useState<{ stage: 'pick' | 'spin' | 'result'; result?: RouletteResult }>({ stage: 'pick' })
  const [gamepadName, setGamepadName] = useState<string | null>(null)
  const [bgmOn, setBgmOn] = useState(() => isBgmEnabled())
  const bgmOnRef = useRef(bgmOn) // R220.1⑦: 循环读值走 ref(见 tdSpeedRef 注)
  bgmOnRef.current = bgmOn
  const [newAchievements, setNewAchievements] = useState<string[]>([])
  const [showCodex, setShowCodex] = useState(false)
  const metaRef = useRef<SwarmMeta>(meta)
  metaRef.current = meta
  const screenRootRef = useRef<HTMLDivElement | null>(null)
  // R142-L3: relative-cursor overlay host (the games-canvas-wrap element)
  const canvasWrapRef = useRef<HTMLDivElement | null>(null)
  // R219.8: survival 静态背景离屏缓存——DYNAMIC_BG 冻结后背景逐帧恒定,
  // 仅在 场景/岛屿/backing 尺寸 变化时重画一次,游戏循环每帧一次 blit。
  const bgCacheRef = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null)
  const gamepadNameRef = useRef<string | null>(null)
  const prevStartRef = useRef(false)
  const startRunRef = useRef<() => void>(() => undefined)
  // ── R218 U2: 手柄 Start 四作通用 ──
  /** 在场手柄摘要(ready 态提示行 + U7 键位席位行);gamepadInfoKeyRef 去抖,逐帧不重渲。 */
  const [gamepadInfo, setGamepadInfo] = useState<{ count: number; ids: string[]; indices: number[] }>({ count: 0, ids: [], indices: [] })
  const gamepadInfoKeyRef = useRef('')
  /** Start 边沿触发的统一入口(按 screen 分发开局/重开/暂停;渲染期赋值)。 */
  const padStartRef = useRef<() => void>(() => undefined)
  /** 当前游戏画面(hub|td|survival|tetris|slash)——rAF/Esc 闭包读的活值。 */
  const screenRef = useRef<Screen>('hub')
  screenRef.current = screen
  /** 各作当前 phase(ref 读取,供 Esc/Start 暂停判定;hub 恒 'ready')。 */
  const currentPhaseRef = useRef<() => 'ready' | 'running' | 'won' | 'lost' | 'levelup' | 'roulette'>(() => 'ready')
  /** 当前画面的开局/重开入口(startHandler 的活引用;渲染期赋值)。 */
  const startAnyRef = useRef<() => void>(() => undefined)
  // R131: vision gesture input (third source beside keyboard/gamepad) + a
  // late-binding ref so pollVision (declared above startTetrisRun) can start
  // a Tetris run on pinch without a TDZ-prone dependency.
  const vision = useVisionInput()
  const startTetrisRef = useRef<() => void>(() => undefined)
  const slashStartRef = useRef<() => void>(() => undefined)
  // R139: gesture-driven roulette selection — focus index within the active
  // 2-option group (pick: item/stat wheel, result: claim/dissolve), plus the
  // double-pinch confirm detector (two 'space' commands within 900ms).
  const [rouletteFocus, setRouletteFocus] = useState(0)
  const rouletteFocusRef = useRef(0)
  const rouletteActionsRef = useRef<Array<() => void>>([])
  const visionDoublePinchRef = useRef(0)
  // R132.3: transient "vision off" notice when the user (or a lifecycle rule)
  // disables the input source — otherwise the camera just silently goes away.
  const [visionExitNotice, setVisionExitNotice] = useState(false)
  const visionWasEnabledRef = useRef(false)

  const publishSlash = useCallback(() => {
    setSlashSnapshot({ ...slashRef.current, blocks: [...slashRef.current.blocks], streaks: [...slashRef.current.streaks] })
  }, [])

  const publishTd = useCallback(() => {
    setTdSnapshot({ ...tdStateRef.current, towers: [...tdStateRef.current.towers], balloons: [...tdStateRef.current.balloons], projectiles: [...tdStateRef.current.projectiles] })
  }, [])

  // R109: E2E seam for the verification scripts — local single-player debug
  // surface only (see PRD R109.2). Removed on unmount.
  useEffect(() => {
    const seam = {
      spawnBoss: () => debugSpawnBoss(survivalRef.current),
      // force the level-up roulette regardless of game state (test/E2E only)
      startRoulette: () => {
        const s = survivalRef.current
        if (s.phase !== 'running') s.phase = 'running'
        if (s.pendingSpins <= 0) s.pendingSpins = 1
        beginRoulette()
      },
    }
    ;(window as unknown as { __rgbboxGames?: typeof seam }).__rgbboxGames = seam
    return () => {
      delete (window as unknown as { __rgbboxGames?: typeof seam }).__rgbboxGames
    }
  }, [])

  // R131: E2E seam for the verification scripts — synthetic source drives the
  // identical gesture→game pipeline without a camera (PRD R131 验收②). The
  // held-key view reads the live ref, so the closure never goes stale.
  useEffect(() => {
    const heldRef = vision.heldRef
    const frameRef = vision.frameRef
    const seam = {
      enableSynthetic: () => vision.enableSynthetic(),
      disable: () => vision.disable(),
      held: () => [...heldRef.current],
      // R142-L3: live cursor probe (normalized 0..1) for tests/E2E
      cursor: () => ({ ...visionCursorRef.current }),
      snapshot: () => frameRef.current,
      // R133: live survival probe — proves vision→movement end to end in E2E
      probe: () => ({
        phase: survivalRef.current.phase,
        player: { x: survivalRef.current.player.x, y: survivalRef.current.player.y },
        // R219.5: 摄像机 + 飞船视口坐标——E2E 断言「世界层归位后飞船恒在画面
        // 中央 60%」的取证字段(绘制在摄像机层内,shipVp 即屏幕坐标)。
        // R219.7①: 视口读 state.vp。
        camera: { ...survivalRef.current.camera },
        vp: { ...survivalRef.current.vp },
        shipVp: worldToViewport(survivalRef.current.camera, survivalRef.current.vp.w, survivalRef.current.vp.h, survivalRef.current.player.x, survivalRef.current.player.y),
        // R219.8: 实体负载计数(性能取证用)
        counts: {
          enemies: survivalRef.current.enemies.length,
          bullets: survivalRef.current.bullets.length,
          eBullets: survivalRef.current.eBullets.length,
          orbs: survivalRef.current.orbs.length,
          particles: survivalRef.current.particles.length,
          texts: survivalRef.current.texts.length,
        },
        axis: { ...survivalRef.current.axis },
        keys: [...survivalRef.current.keys],
      }),
    }
    ;(window as unknown as { __rgbboxVision?: typeof seam }).__rgbboxVision = seam
    return () => {
      delete (window as unknown as { __rgbboxVision?: typeof seam }).__rgbboxVision
    }
  }, [vision.enableSynthetic, vision.disable, vision.heldRef, vision.frameRef])

  const publishSurvival = useCallback(() => {
    setSurvivalSnapshot({ ...survivalRef.current, keys: new Set(survivalRef.current.keys), enemies: [...survivalRef.current.enemies], bullets: [...survivalRef.current.bullets], orbs: [...survivalRef.current.orbs] })
  }, [])

  const publishTetris = useCallback(() => {
    setTetrisSnapshot({ ...tetrisRef.current, keys: new Set(tetrisRef.current.keys), queue: [...tetrisRef.current.queue] })
  }, [])

  const settleBest = useCallback((game: GameKey, rawScore: number, durationSec = 0, highlight = ''): void => {
    // R218 U4: 街机档案按难度倍率记账(1×/1.5×/2×/3×)——best/daily/遥测/
    // recap 全部一致地以乘后分呈现(引擎内局中显示保持原始分)。
    const score = Math.floor(rawScore * DIFFICULTY_SCORE_MULT[runDifficultyRef.current])
    const prev = bestRef.current[game]
    const best = Math.max(prev, score)
    if (best > prev) {
      bestRef.current = { ...bestRef.current, [game]: best }
      writeBest(game, best)
      setBests({ ...bestRef.current })
    }
    // R200(FR-G02/G06.5): 结算落遥测 + 弹统一 recap(delta%/高光/教练回顾)
    const id: GameId = game === 'survival' ? 'swarm' : game
    recordDaily(localStorage, id, Math.floor(score))
    const buffer = recordRun(localStorage, id, { date: Date.now(), score: Math.floor(score), duration: Math.round(durationSec), highlight })
    const stats = profileStats(buffer, best)
    setRecap({ score: Math.floor(score), deltaPct: stats.deltaPct, best, highlight, coach: recapCoachKey(Math.floor(score), stats.totalRuns >= 2 ? prev : null) })
  }, [])

  /** R220.1⑧: survival 终局结算(best/金币/成就)——从游戏循环提取,供
   *  backToHub 中途弃局同样结算(修 enterGame 残留 running 旁路 ready,07 X-1)。 */
  const finishSurvivalRun = useCallback(() => {
    settleBest('survival', survivalRef.current.score, survivalRef.current.time, `击杀 ${survivalRef.current.kills} · LV${survivalRef.current.level}`)
    const run = survivalRef.current
    const earned = runCoinsFor(run.score, run.coinMult)
    const prevMeta = metaRef.current
    const stats = {
      runs: prevMeta.stats.runs + 1,
      totalKills: prevMeta.stats.totalKills + run.kills,
      bosses: prevMeta.stats.bosses + run.bossKills,
      bestCombo: Math.max(prevMeta.stats.bestCombo, run.comboBest),
      bestScore: Math.max(prevMeta.stats.bestScore, run.score),
    }
    const satisfied = checkAchievements(stats)
    const fresh = satisfied.filter((id) => !prevMeta.achievements[id])
    const next = {
      coins: prevMeta.coins + earned,
      perm: prevMeta.perm,
      stats,
      artifacts: prevMeta.artifacts,
      achievements: Object.fromEntries(satisfied.map((id) => [id, true])) as Record<string, boolean>,
    }
    writeMeta(next)
    metaRef.current = next
    setMeta(next)
    if (fresh.length > 0) {
      setNewAchievements(fresh)
      window.setTimeout(() => setNewAchievements([]), 4500)
      playSfx('levelup')
    }
  }, [settleBest])

  /** R220.1⑨: 释放全部引擎输入池(vision 关闭/切屏/弃局时调用)——修 vision
   *  disable 后直通键残留导致的飞船漂移(04 P2)与 hub 往返卡键(R96.4 遗留)。 */
  const releaseAllEngineInputs = useCallback(() => {
    const sv = survivalRef.current
    sv.keys.clear()
    sv.axis = { x: 0, y: 0 }
    for (const pool of sv.inputs) pool.clear()
    for (let i = 0; i < sv.axes.length; i += 1) sv.axes[i] = { x: 0, y: 0 }
    tetrisRef.current.keys.clear()
    tetrisBRef.current.keys.clear()
  }, [])

  // R103→R213 二期: poll every connected gamepad each frame — presence
  // detection (no pairing-event dependency) + assignGamepads 玩家→手柄映射
  // (显式绑定优先+余柄补位,与 InputConfigPanel 绑定 UI 同源);每玩家左
  // 摇杆写入 axes[pi](P1 仍写 legacy axis——vision 叠加路径不变,axes[0]
  // 同步双写保数组不变量)。
  // R218 U2: Start/Options 检测改为「任何已分配手柄」边沿触发(P5 卡点:
  // 原来仅 pi===0 分支检测;PS5 Options=buttons[9] standard mapping 一致);
  // 非 standard mapping 兜底扫 buttons[16];运行态 Start=暂停/恢复切换。
  const pollGamepad = useCallback(() => {
    if (typeof navigator.getGamepads !== 'function') return
    const pads = navigator.getGamepads()
    const connected = Array.from(pads).filter((item): item is Gamepad => item !== null && item.connected)
    const axes = survivalRef.current.axes
    for (let i = 0; i < axes.length; i += 1) axes[i] = { x: 0, y: 0 }
    survivalRef.current.axis = { x: 0, y: 0 }
    // R218 U2: 在场手柄摘要(count+id 列表)供 ready 态提示行——逐帧比较后
    // 才 setState,避免每帧渲染。
    const infoKey = `${connected.length}|${connected.map((item) => item.id).join(',')}`
    if (gamepadInfoKeyRef.current !== infoKey) {
      gamepadInfoKeyRef.current = infoKey
      setGamepadInfo({ count: connected.length, ids: connected.map((item) => item.id), indices: connected.map((item) => item.index) })
    }
    if (connected.length === 0) {
      prevStartRef.current = false
      if (gamepadNameRef.current !== null) {
        gamepadNameRef.current = null
        setGamepadName(null)
      }
      return
    }
    const assign = assignGamepads(connected.map((item) => item.index), inputConfigsRef.current)
    let p1PadSeen = false
    let anyStart = false
    for (const key of Object.keys(assign)) {
      const pi = Number(key)
      const pad = connected.find((item) => item.index === assign[pi])
      if (pad === undefined) continue
      const ax = { x: pad.axes[0] ?? 0, y: pad.axes[1] ?? 0 }
      if (pi === 0) {
        p1PadSeen = true
        survivalRef.current.axis = ax
        if (gamepadNameRef.current !== pad.id) {
          gamepadNameRef.current = pad.id
          setGamepadName(pad.id)
        }
      }
      // R218 U2: Start/Options —— Xbox Start 与 PS5 Options 在 standard
      // mapping 下同为 buttons[9];非 standard 柄 9 号位失效时兜底 16。
      if (pad.buttons[9]?.pressed === true || (pad.mapping !== 'standard' && pad.buttons[16]?.pressed === true)) {
        anyStart = true
      }
      if (pi < axes.length) axes[pi] = ax
    }
    if (anyStart && !prevStartRef.current) padStartRef.current()
    prevStartRef.current = anyStart
    if (!p1PadSeen) {
      // P1 未分得手柄(如仅有 index≠0 的柄被补位给 P2+)——在场提示回落到
      // 第一只已连接手柄,保持「检测到手柄」的可见性。
      const first = connected[0]
      if (first !== undefined && gamepadNameRef.current !== first.id) {
        gamepadNameRef.current = first.id
        setGamepadName(first.id)
      }
    }
  }, [])

  // R141-A: instant gesture feedback — a barely-there tick the moment any
  // discrete gesture is recognized (perceived-latency cut, <50ms by
  // construction: same event dispatch), and a confirm chime when a gesture
  // COMPLETES an action (starts a run, confirms a roulette option).
  useEffect(() => {
    if (!vision.enabled) return
    const onVisionEvent = (ev: Event): void => {
      const detail = (ev as CustomEvent<{ kind: string; key: string | null; down: boolean }>).detail
      if (detail?.down && (detail.kind === 'direction' || detail.kind === 'pinch' || detail.kind === 'chord')) {
        playSfx('tick')
      }
    }
    window.addEventListener('vision-input', onVisionEvent)
    return () => window.removeEventListener('vision-input', onVisionEvent)
  }, [vision.enabled])

  // R142-L3: the overlay mutates this state in its rAF; exposed via the seam
  const visionCursorRef = useRef(createCursorState())

  // R135: analog movement — the smoothed palm displacement relative to the
  // ring's LIVE center, normalized by the calibrated activeZone. Replaces the
  // R133 binary unit vector: displacement magnitude now scales speed
  // (joystick semantics), the dead zone falls out of the normalization, and
  // the exponential smoothing keeps it fluid at the ~30Hz inference cadence.
  const visionAnalogRef = useRef({ x: 0, y: 0 })
  // R138: open-palm hold-to-start — hand held OPEN (pinch distance above the
  // release threshold) at the ready/lost screen for ≥700ms; far more
  // forgiving than a pinch. Timestamp-based so the duration is fps-independent.
  const visionOpenPalmSinceRef = useRef<number | null>(null)

  // R131/R133/R135: poll the vision gesture source each frame — same model as
  // R103 gamepad. Events arrive pre-normalized ('arrowleft'…'space'); Survival
  // consumes the held-key set (now including the R135 face-modifier keys
  // e/shift/enter and the off-hand pinch f) plus the analog axis, Tetris the
  // discrete command queue. Must run AFTER pollGamepad() (which rewrites the
  // raw axis each frame) — see the loop below.
  const pollVision = useCallback(() => {
    if (!vision.enabled) {
      // R220.1⑨: vision 关闭 falling-edge——释放其注入 survival 键池的直通键
      //  (否则按住手势时关闭 vision,飞船持续漂移;04 P2)。每帧幂等,代价可忽略。
      const s = survivalRef.current
      for (const k of VISION_PASSTHROUGH_KEYS) s.keys.delete(k)
      return
    }
    // R142-L4: finger-chord commands are screen-agnostic — handle them first
    // and pull them out of the queue (branch handlers below drain the rest).
    const queue = vision.queueRef.current
    for (let i = queue.length - 1; i >= 0; i--) {
      const cmd = queue[i]
      if (cmd === 'chord:confirm') {
        // confirm ≙ the double-pinch semantics: focused roulette action, or
        // start the run from the ready/lost screens
        playSfx('confirm')
        if (survivalRef.current.phase === 'roulette') rouletteActionsRef.current[rouletteFocusRef.current]?.()
        else if (screen === 'survival' && (survivalRef.current.phase === 'ready' || survivalRef.current.phase === 'lost')) startRunRef.current()
        else if (screen === 'tetris' && (tetrisRef.current.phase === 'ready' || tetrisRef.current.phase === 'lost')) startTetrisRef.current()
        queue.splice(i, 1)
      } else if (cmd === 'chord:back') {
        playSfx('confirm')
        backToHubRef.current()
        queue.splice(i, 1)
      } else if (cmd === 'chord:select') {
        // click whatever the relative cursor is hovering, if anything
        const hovered = document.querySelector('.vision-hover')
        if (hovered instanceof HTMLElement) {
          playSfx('confirm')
          hovered.click()
        }
        queue.splice(i, 1)
      } else if (cmd.startsWith('chord:')) {
        queue.splice(i, 1) // pause/menu/cancel/next ride the bus only (E4 binds them)
      }
    }
    if (screen === 'survival') {
      // R139: option selection — the roulette overlay takes gesture priority:
      // any direction flips focus between the two options, double pinch (<900ms
      // between 'space' commands) confirms the focused action.
      if (survivalRef.current.phase === 'roulette') {
        for (const cmd of vision.queueRef.current) {
          if (cmd === 'space') {
            const nowMs = performance.now()
            if (nowMs - visionDoublePinchRef.current < 900) {
              visionDoublePinchRef.current = 0
              playSfx('confirm')
              rouletteActionsRef.current[rouletteFocusRef.current]?.()
            } else {
              visionDoublePinchRef.current = nowMs
            }
          } else if (cmd === 'arrowleft' || cmd === 'arrowright' || cmd === 'arrowup' || cmd === 'arrowdown') {
            const next = rouletteFocusRef.current === 0 ? 1 : 0
            rouletteFocusRef.current = next
            setRouletteFocus(next)
          }
        }
        vision.queueRef.current.length = 0
        return
      }
      const held = vision.heldRef.current
      for (const key of VISION_PASSTHROUGH_KEYS) {
        if (held.has(key)) survivalRef.current.keys.add(key)
        else survivalRef.current.keys.delete(key)
      }
      // analog displacement → additive axis vector (joystick semantics)
      const frame = vision.frameRef.current
      // R142-L2: predicted palm (50ms ahead) — the analog axis leads the
      // detection instead of lagging it
      const geom = frame?.geomPredicted ?? frame?.geom
      const ringCenter = frame?.ringCenter
      let targetX = 0
      let targetY = 0
      if (geom && ringCenter) {
        const activeZone = (frame?.profile?.activeZone as number | undefined) ?? 0.17
        const deadZone = (frame?.profile?.deadZone as number | undefined) ?? activeZone * 0.55
        // R137: compute directly in the ENGINE's axis convention (screen
        // coords — y grows downward, like survival.ts player.y). The R135 cut
        // reused the DirectionRing's math convention (dy negated, up-positive
        // for atan2) and wrote it straight into the axis, inverting up/down:
        // hand up → axis.y positive → ship moved DOWN.
        const dx = (geom.palm.x - ringCenter.x) * VISION_GAIN_X
        const dyDown = (geom.palm.y - ringCenter.y) * VISION_GAIN_Y
        const nx = dx / activeZone
        const ny = dyDown / activeZone
        const len = Math.hypot(nx, ny)
        if (len > deadZone / activeZone) {
          const scale = len > 1 ? 1 / len : 1
          targetX = nx * scale
          targetY = ny * scale
        }
      }
      // R137: 0.45 convergence — snappier tracking, still smooths 30Hz steps
      visionAnalogRef.current.x += (targetX - visionAnalogRef.current.x) * 0.45
      visionAnalogRef.current.y += (targetY - visionAnalogRef.current.y) * 0.45
      const analog = visionAnalogRef.current
      if (analog.x !== 0 || analog.y !== 0) {
        const ax = survivalRef.current.axis.x + analog.x
        const ay = survivalRef.current.axis.y + analog.y
        const len = Math.hypot(ax, ay)
        survivalRef.current.axis = { x: ax / Math.max(1, len), y: ay / Math.max(1, len) }
      }
      // pinch to (re)start, mirroring the gamepad Start button (R103)
      if (vision.queueRef.current.includes('space') && (survivalRef.current.phase === 'ready' || survivalRef.current.phase === 'lost')) {
        playSfx('confirm')
        startRunRef.current()
      }
      // R138: open-palm hold to (re)start — more forgiving than the pinch
      const palmOpen = geom != null && geom.pinch > ((frame?.profile?.pinchOff as number | undefined) ?? 0.85)
      if (palmOpen && (survivalRef.current.phase === 'ready' || survivalRef.current.phase === 'lost')) {
        const nowMs = performance.now()
        if (visionOpenPalmSinceRef.current == null) visionOpenPalmSinceRef.current = nowMs
        else if (nowMs - visionOpenPalmSinceRef.current >= 700) {
          visionOpenPalmSinceRef.current = null
          playSfx('confirm')
          startRunRef.current()
        }
      } else {
        visionOpenPalmSinceRef.current = null
      }
    } else if (screen === 'slash') {
      const SLASH_DIR: Record<string, number> = { arrowright: 0, arrowup: 2, arrowleft: 4, arrowdown: 6 }
      for (const cmd of vision.queueRef.current) {
        if (cmd === 'space') {
          if (slashRef.current.phase === 'ready' || slashRef.current.phase === 'lost') { playSfx('confirm'); startRunRef.current() }
          else if (slashBomb(slashRef.current)) playSfx('wave')
        } else if (SLASH_DIR[cmd] != null) {
          const res = slashCut(slashRef.current, SLASH_DIR[cmd])
          if (res === 'hit') playSfx('pop')
          else if (res === 'wrong') playSfx('hurt')
        }
      }
      vision.queueRef.current.length = 0
      // open-palm hold starts a run (same gesture as the other games)
      const frameS = vision.frameRef.current
      const geomS = frameS?.geom
      const palmOpenS = geomS != null && geomS.pinch > ((frameS?.profile?.pinchOff as number | undefined) ?? 0.85)
      if (palmOpenS && (slashRef.current.phase === 'ready' || slashRef.current.phase === 'lost')) {
        const nowMsS = performance.now()
        if (visionOpenPalmSinceRef.current == null) visionOpenPalmSinceRef.current = nowMsS
        else if (nowMsS - visionOpenPalmSinceRef.current >= 700) {
          visionOpenPalmSinceRef.current = null
          playSfx('confirm')
          startRunRef.current()
        }
      } else {
        visionOpenPalmSinceRef.current = null
      }
    } else if (screen === 'tetris') {
      for (const cmd of vision.queueRef.current) {
        if (cmd === 'space') {
          const phase = tetrisRef.current.phase
          if (phase === 'ready' || phase === 'lost') startTetrisRef.current()
          else tetrisRef.current.commands.push('hard')
        } else if (cmd === 'arrowleft') tetrisRef.current.commands.push('left')
        else if (cmd === 'arrowright') tetrisRef.current.commands.push('right')
        else if (cmd === 'arrowup') tetrisRef.current.commands.push('rotate')
        else if (cmd === 'c') tetrisRef.current.commands.push('hold')
      }
      // R138: open-palm hold to (re)start (same gesture as Survival)
      const frameT = vision.frameRef.current
      const geomT = frameT?.geom
      const palmOpenT = geomT != null && geomT.pinch > ((frameT?.profile?.pinchOff as number | undefined) ?? 0.85)
      if (palmOpenT && (tetrisRef.current.phase === 'ready' || tetrisRef.current.phase === 'lost')) {
        const nowMsT = performance.now()
        if (visionOpenPalmSinceRef.current == null) visionOpenPalmSinceRef.current = nowMsT
        else if (nowMsT - visionOpenPalmSinceRef.current >= 700) {
          visionOpenPalmSinceRef.current = null
          playSfx('confirm')
          startTetrisRef.current()
        }
      } else {
        visionOpenPalmSinceRef.current = null
      }
      if (vision.heldRef.current.has('arrowdown')) tetrisRef.current.keys.add('arrowdown')
      else tetrisRef.current.keys.delete('arrowdown')
    }
    vision.queueRef.current.length = 0
  }, [screen, vision.enabled, vision.heldRef, vision.queueRef])

  // R102: native fullscreen state sync — Esc / OS exit flips the layout back.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFullscreen(false)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // R131: Tetris runs the direction ring 4-way (a diagonal would rotate + move
  // in one gesture); Survival uses the full 8-way compass.
  useEffect(() => {
    if (!vision.enabled) return
    vision.applySettings({ dirs: screen === 'tetris' ? 4 : 8 })
  }, [screen, vision.applySettings, vision.enabled])

  // R132/R133: TD is the mouse game — it consumes no gestures, so park the
  // vision session in paused state there (the tick loop skips inference
  // entirely and held keys are released). R133: leaving TD resumes ACTIVE via
  // the persisted profile instead of dropping to searching and demanding the
  // full 3-step wizard again. Only on the TD exit edge — an unconditional
  // resumeActive would forceReady a FIRST-time user past the wizard.
  const visionPrevScreenRef = useRef<Screen>(screen)
  useEffect(() => {
    if (!vision.enabled) {
      visionPrevScreenRef.current = screen
      return
    }
    if (screen === 'td') {
      vision.setPaused(true)
    } else if (visionPrevScreenRef.current === 'td') {
      vision.resumeActive()
    }
    visionPrevScreenRef.current = screen
  }, [screen, vision.enabled, vision.resumeActive, vision.setPaused])

  // R132.3: enabled→false shows a short "已退出体感" notice
  useEffect(() => {
    const was = visionWasEnabledRef.current
    visionWasEnabledRef.current = vision.enabled
    if (!was || vision.enabled) return
    setVisionExitNotice(true)
    const timer = window.setTimeout(() => setVisionExitNotice(false), 2500)
    return () => window.clearTimeout(timer)
  }, [vision.enabled])

  // R131: back to the hub or a hidden/minimized window stops the camera and
  // releases every held key (leaving the games view unmounts the hook itself).
  useEffect(() => {
    if (screen === 'hub') vision.disable()
  }, [screen, vision.disable])

  useEffect(() => window.rgbbox.onMainWindowVisibilityChanged((visible) => {
    if (!visible) vision.disable()
  }), [vision.disable])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      setFullscreen(false)
      void document.exitFullscreen?.().catch(() => undefined)
      return
    }
    setFsPaused(false)
    setFullscreen(true)
    // R219.7: 失败回落——requestFullscreen 被拒时不再残留 .fs 伪全屏
    // (画布顶置+底部黑带的错乱形态),改为进入窗口内满幅(专注)保体验。
    void screenRootRef.current?.requestFullscreen?.().catch(() => {
      setFullscreen(false)
      setFocusMode(true)
    })
  }, [])

  // R219.7: 原生全屏态经事件同步——Esc/系统退出/调用失败都收敛到真实态
  // (原先只在按钮回调里 set,系统级退出后 React 态可能残留 true)。
  useEffect(() => {
    const onChange = (): void => setFullscreen(document.fullscreenElement !== null)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  useEffect(() => {
    if (screen !== 'td' && screen !== 'survival' && screen !== 'tetris' && screen !== 'slash') return
    const canvas = canvasRef.current
    // R219.8: alpha:false 不透明上下文——四作每帧都整幅绘制背景,无透明需求;
    // 免去合成器对整页的逐像素混合,弱 GPU 上显著降低呈现反压主线程的成本
    // (CDP 实测:画布可见时 rAF 入口 gap 可达 12.7ms,隐藏仅 2.1ms)。
    const ctx = canvas?.getContext('2d', { alpha: false })
    if (!canvas || !ctx) return
    startBgm()
    // R217: DPR-aware backing store (games/hdCanvas.ts) — was a fixed 900×520
    // raster stretched by CSS, which reads as jaggies on HiDPI displays.
    // Sizing the backing to the CSS box × clamped dpr keeps the shared
    // 900×520 logical coordinate system crisp at any panel/fullscreen size.
    const applyHdSize = () => {
      const rect = canvas.getBoundingClientRect()
      // R219.7①: survival fs/focus 全铺满——backing 直接随 CSS 盒(撤 900/520
      // 比例锁;vp 由 loop 高度基准反推,内容等比无拉伸);其余路径维持 R217。
      // (对抗审查修正:不做逐轴 LOGICAL 下限——单轴触底会破坏 backing/CSS
      // 同比,800×600 之类小屏全屏会横向压缩变形;小屏只损失清晰度不变形。)
      if (screen === 'survival' && (fullscreen || focusModeRef.current)) {
        const dpr = Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0 ? Math.min(window.devicePixelRatio, 2) : 1
        canvas.width = Math.max(1, Math.round(rect.width * dpr))
        canvas.height = Math.max(1, Math.round(rect.height * dpr))
        return
      }
      const hd = computeHdSize(rect.width, window.devicePixelRatio || 1)
      canvas.width = hd.w
      canvas.height = hd.h
    }
    applyHdSize()
    const ro = new ResizeObserver(applyHdSize)
    ro.observe(canvas)
    let frame = 0
    let last = performance.now()
    let snapshotTimer = 0
    let lastPhase: string = screen === 'td' ? tdStateRef.current.phase : screen === 'survival' ? survivalRef.current.phase : tetrisRef.current.phase
    let lastSlashPhase = slashRef.current.phase
    let lanSnapAcc = 0
    let bgmTensionCur = 0
    const loop = (now: number) => {
      // R221.4(04 R-1): 单帧异常护栏——任一环节 throw 不再永久冻结画面:
      // 打日志(含屏与相位,便于定位)、清 fs 按钮区(防悬停命中过期几何)、续帧。
      try {
        loopBody(now)
      } catch (err) {
        console.error('[games] frame error', { screen, err })
        fsButtonsRef.current = []
      }
    }
    const loopBody = (now: number): void => {
      // R217: map the logical 900×520 space onto the HiDPI backing store
      // every frame (also heals transform loss after a ResizeObserver
      // backing re-assignment resets the context state).
      // R219.7①: survival 恒用「高度基准」uniform scale——窗口态(比例锁盒)与
      // 900 基准等价;fs/focus 全铺满时 vp.w 随屏比例拉宽(引擎 vp 适配,
      // 内容零拉伸/零黑边)。其余三作维持宽度基准(锁定比例下两者等价)。
      if (screen === 'survival') {
        const s = canvas.height / LOGICAL_H
        ctx.setTransform(s, 0, 0, s, 0, 0)
        survivalRef.current.vp = { w: canvas.width / s, h: canvas.height / s }
      } else {
        ctx.setTransform(canvas.width / LOGICAL_W, 0, 0, canvas.height / LOGICAL_H, 0, 0)
      }
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      let dt = Math.min(0.05, (now - last) / 1000)
      // R206: 暂停冻结全部引擎 tick(dt=0;含计时/倒计时/粒子由各引擎特效路径自然停)
      if (fsPausedRef.current) dt = 0
      last = now
      // R218 U2: 手柄轮询提升到四作共用——Start/Options 检测与摇杆轴写入
      // 不再只在 Survival 分支执行(survival 分支内原先的调用同步移除;
      // pollVision 仍在其后,轴叠加顺序不变)。
      pollGamepad()
      if (screen === 'td') {
        // R209(FR-LN02): 房主权威——客端不 tick 本地引擎(快照经 onLanEvent
        // 直接写 tdStateRef,统计条/绘制全复用);房主 15Hz 推快照(hash 供对账)。
        if (lanRoleRef.current !== 'guest') tickGame(tdStateRef.current, dt * tdSpeedRef.current)
        if (lanRoleRef.current === 'host' && lanPeersRef.current > 0) {
          lanSnapAcc += dt
          if (lanSnapAcc >= 0.066) {
            lanSnapAcc = 0
            const s = tdStateRef.current
            try {
              void window.rgbbox?.lanSnapshot?.(JSON.parse(JSON.stringify(s)) as unknown, `${s.wave}:${s.score}:${s.towers.length}:${s.nextId}`)
            } catch { /* 序列化失败丢帧 */ }
          }
        }
        // R209 三期: 客端插值渲染——气球按 now-snapAt 恒速外推(progress 线性,
        // 每帧从快照基准重算不叠加;dt 钳 0.3s 防挂起后整段跳跃;逃逸/扣命
        // 仍由房主权威快照裁决,外推只管视觉平滑)。
        if (lanRoleRef.current === 'guest' && lanSnapExRef.current !== null) {
          tdStateRef.current.balloons = extrapolateBalloons(lanSnapExRef.current, Math.min(0.3, (now - lanSnapAtRef.current) / 1000))
        }
        const phase = tdStateRef.current.phase
        if ((phase === 'won' || phase === 'lost') && lastPhase !== phase && lanRoleRef.current !== 'guest') {
          settleBest('td', tdStateRef.current.score, tdStateRef.current.clock, `波次 ${tdStateRef.current.wave}`)
          if (tdStateRef.current.score >= bestRef.current.td) addText(tdStateRef.current, WIDTH / 2, HEIGHT / 2 + 96, 'NEW BEST!', '#fde68a')
        }
        lastPhase = phase
        drawGame(ctx, tdStateRef.current, selectedTowerIdRef.current, bestRef.current.td, {
          // R201: 交给 drawGame 之后的覆盖层(悬停射程圈 + 词缀波提示条在 banner 内已带)
          readyTitle: t('games.td.readyTitle'),
          readySubtitle: t('games.td.readySubtitle'),
          wonTitle: t('games.td.won'),
          lostTitle: t('games.td.lost'),
          waveLabel: (wave) => t('games.td.wave').replace('{n}', String(wave)).replace('{max}', String(MAX_WAVE)),
          nextWaveHint: (seconds, bonus) => `${t('games.nextIn').replace('{seconds}', String(seconds))} · ${t('games.earlyBonus').replace('{bonus}', String(bonus))}`,
          replaySuffix: t('games.replay'),
        })
      } else if (screen === 'survival') {
        // R133: gamepad first (it rewrites the raw axis), vision second (adds
        // its direction vector on top) — see pollVision. (R218 U2: pollGamepad
        // 已提升到四作共用的循环顶部,顺序不变。)
        // R208(FR-MP01): 双人局禁用手势——视觉通道是单用户假设,防输入冲突
        // (pollGamepad 无手柄时已把 axis 归零,跳过 pollVision 不残留旧轴)。
        if (survivalRef.current.player2 === null) pollVision()
        tickSurvival(survivalRef.current, dt)
        const phase = survivalRef.current.phase
        // R213→R220.2: 升级自动预选不再同帧静默拍板——先强制发布快照让三选一
        // 卡片当帧渲染,记录选择并高亮,延迟 1s 执行(保住 build 学习回路,
        // G6 P0「一帧不渲染+英文 ID 飘字」/G1 S-2)。
        if (phase === 'levelup' && lastPhase !== phase) {
          publishSurvival()
          if (swarmAutoPickRef.current.mode !== 'off') {
            const s = survivalRef.current
            const pick = autoPick(s.offers, swarmAutoPickRef.current.prefs, swarmAutoPickRef.current.mode, s.taken, s.player.hp, s.player.maxHp)
            if (pick !== null) {
              autoPickChoiceRef.current = pick
              autoPickAtRef.current = now
              setAutoPickChoice(pick)
            }
          }
        }
        if (phase === 'levelup' && autoPickChoiceRef.current !== null && now - autoPickAtRef.current >= AUTO_PICK_DELAY_MS) {
          applyUpgrade(survivalRef.current, autoPickChoiceRef.current)
          autoPickChoiceRef.current = null
          setAutoPickChoice(null)
          publishSurvival()
        }
        if (phase === 'lost' && lastPhase !== phase) finishSurvivalRun()
        lastPhase = phase
        // R219.8②: 静态背景离屏缓存(先查缓存,miss 时整幅重画一次)
        const bgKey = `${survivalRef.current.scene ?? 'legacy'}|${survivalRef.current.island}|${canvas.width}x${canvas.height}`
        let bgCache = bgCacheRef.current
        if (bgCache === null || bgCache.key !== bgKey) {
          const off = bgCache?.canvas ?? document.createElement('canvas')
          off.width = canvas.width
          off.height = canvas.height
          const octx = off.getContext('2d', { alpha: false })
          if (octx !== null) {
            const s = canvas.height / LOGICAL_H
            octx.setTransform(s, 0, 0, s, 0, 0)
            drawSurvivalBackground(octx, survivalRef.current)
          }
          bgCache = { key: bgKey, canvas: off }
          bgCacheRef.current = bgCache
        }
        drawSurvival(ctx, survivalRef.current, bgCache.canvas)
        // R213: 头像贴图——有头像的存活玩家在其位置画 28×28 圆形头像(盖在默认飞船上)
        for (let pi = 0; pi < survivalRef.current.players.length; pi += 1) {
          const img = avatarsRef.current[pi]
          const pl = survivalRef.current.players[pi]
          if (img === null || pl === undefined || pl.hp <= 0) continue
          if (pl.invuln > 0 && Math.floor(pl.invuln * 12) % 2 === 0) continue // 无敌闪烁节奏与飞船一致
          // R218-SV 大世界:头像画在视口层,玩家世界坐标须经摄像机变换
          // R219.7①: 视口尺寸读 state.vp(可变纵横比)
          const cam = survivalRef.current.camera
          const vpSize = survivalRef.current.vp
          const vp = worldToViewport(cam, vpSize.w, vpSize.h, pl.x, pl.y)
          const ar = 14 * cam.zoom
          ctx.save()
          ctx.beginPath()
          ctx.arc(vp.x, vp.y, ar, 0, Math.PI * 2)
          ctx.clip()
          ctx.drawImage(img, vp.x - ar, vp.y - ar, ar * 2, ar * 2)
          ctx.restore()
        }
      } else if (screen === 'slash') {
        pollVision()
        tickSlash(slashRef.current, dt)
        const canvasEl = canvasRef.current
        const ctx2 = canvasEl?.getContext('2d')
        if (canvasEl && ctx2) drawSlash(ctx2, slashRef.current, now)
        // R208: 局部 phase 变化检测——此前用闭包 snapshot 判「首次 lost」,
        // effect 不随 snapshot 重建 → lost 后每帧重复 settleBest(遥测环形缓冲
        // 被同一局刷满 + duel 记分会重复触发)。对齐其他三作的 lastPhase 模式。
        if (slashRef.current.phase === 'lost' && lastSlashPhase !== 'lost') {
          settleBest('slash', slashRef.current.score, RUN_SECONDS - slashRef.current.timeLeft, `最高连击 ${slashRef.current.bestCombo}`)
          // FR-MP03: 轮换对决记分(轮空的一方=null;双方打完由对照面板判胜负)
          if (duelRef.current !== null && !duelRef.current.done) {
            const next = { ...duelRef.current, done: true }
            next.scores[duelRef.current.turn - 1] = Math.floor(slashRef.current.score)
            duelRef.current = next
            setDuel(next)
          }
        }
        lastSlashPhase = slashRef.current.phase
      } else {
        pollVision()
        // R209 三期(FR-LN05): LAN Tetris 对战——事件同步:双方各跑本地引擎,
        // 消行折算垃圾行发对方(对方 applyGarbage),结算互发 result;本地双板
        // 开关在该模式下不参与。
        const lanTetris = lanRoleRef.current !== 'idle' && lanGameRef.current === 'tetris'
        const duelB = tetrisDuelOnRef.current && !lanTetris
        const linesA0 = tetrisRef.current.lines
        tickTetris(tetrisRef.current, dt)
        if (duelB) {
          const linesB0 = tetrisBRef.current.lines
          tickTetris(tetrisBRef.current, dt)
          const dA = tetrisRef.current.lines - linesA0
          const dB = tetrisBRef.current.lines - linesB0
          if (dA > 0) applyGarbage(tetrisBRef.current, garbageFor(dA))
          if (dB > 0) applyGarbage(tetrisRef.current, garbageFor(dB))
        }
        if (lanTetris) {
          const dA = tetrisRef.current.lines - linesA0
          const sent = garbageFor(dA)
          if (sent > 0) void window.rgbbox?.lanCmd?.({ k: 'garbage', lines: sent })
        }
        const phase = tetrisRef.current.phase
        const duelOver = duelB && (phase === 'lost' || tetrisBRef.current.phase === 'lost')
        // R220.1②: 40 行竞速达标进 'won' 同样写 best——原只挂 'lost',竞速玩家
        // 完赛零记录(用户 tetris 零 best 的根因,G7)。
        if ((phase === 'lost' || phase === 'won') && lastPhase !== phase && !duelB && !lanTetris) {
          settleBest('tetris', tetrisRef.current.score, tetrisRef.current.clock, phase === 'won' ? `竞速达成 ${tetrisRef.current.lines} 行` : `消行 ${tetrisRef.current.lines} · T-spin ${tetrisRef.current.tspins}`)
        }
        if (lanTetris && (phase === 'lost' || phase === 'won') && lastPhase !== phase) {
          // 结算上报:本端终局分发对方,互显比对(对方分经 cmd result 事件回填)
          const finalScore = tetrisRef.current.score
          void window.rgbbox?.lanCmd?.({ k: 'result', score: finalScore })
          setLanTetrisScore((cur) => ({ mine: finalScore, theirs: cur?.theirs ?? null }))
        }
        if (duelOver && lastPhase !== phase) {
          // 任一板 top out 即整局结束(存活方胜);双板同停,best 记双板高分。
          const aScore = tetrisRef.current.score
          const bScore = tetrisBRef.current.score
          tetrisRef.current.phase = 'lost'
          tetrisBRef.current.phase = 'lost'
          settleBest('tetris', Math.max(aScore, bScore), tetrisRef.current.clock, `双板 ${aScore}:${bScore}`)
        }
        lastPhase = phase
        drawTetris(ctx, tetrisRef.current, bestRef.current.tetris, {
          readySubtitle: t('games.tetrisHint'),
          lostTitle: t('games.tetris.lost'),
          replaySuffix: t('games.replay'),
        })
        if (duelB) {
          drawTetris(ctx, tetrisBRef.current, 0, {
            readySubtitle: t('games.tetrisHint'),
            lostTitle: t('games.tetris.lost'),
            replaySuffix: t('games.replay'),
          }, { noClear: true })
        }
      }
      // R201(FR-TD01/F6): 放置悬停预览——射程圈 + 有效性配色
      if (isTd && tdHoverRef.current !== null && tdStateRef.current.phase === 'running') {
        const hov = tdHoverRef.current
        const def = TOWER_DEFINITIONS.find((d) => d.kind === selectedTowerRef.current)
        const blocked = distanceToPath(hov) < 42 || tdStateRef.current.towers.some((tw) => Math.hypot(tw.x - hov.x, tw.y - hov.y) < 44)
        ctx.save()
        ctx.strokeStyle = blocked ? 'rgba(251, 113, 133, 0.6)' : 'rgba(103, 232, 249, 0.6)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([6, 4])
        if (def !== undefined && def.range > 0) {
          ctx.beginPath()
          ctx.arc(hov.x, hov.y, def.range, 0, Math.PI * 2)
          ctx.stroke()
        }
        ctx.setLineDash([])
        ctx.fillStyle = blocked ? 'rgba(251, 113, 133, 0.18)' : 'rgba(103, 232, 249, 0.14)'
        ctx.beginPath()
        ctx.arc(hov.x, hov.y, 14, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
      // R211: fs 纯画布 HUD——hud.ts 接线(退出角标/状态面板/主按钮条/TD 商店/Swarm 三选一)。
      // 暂停浮层(DOM)显示时停画,避免双层操作面。
      if (fullscreenRef.current && !fsPausedRef.current) {
        fsButtonsRef.current = []
        fsDrawRef.current(ctx, now)
      } else {
        fsButtonsRef.current = []
      }
      // R205 尾款(FR-G07 二期): BGM 张力变奏——危险态拉起,解除回落。
      // 去抖:仅等级变化时切(setBgmTension 内部下一拍生效,不重排音频)。
      if (bgmOnRef.current) {
        const danger = screen === 'td'
          ? tdStateRef.current.lives <= 8
          : screen === 'survival'
            ? survivalRef.current.player.hp <= 2 || survivalRef.current.player2 !== null && survivalRef.current.player2.hp > 0 && survivalRef.current.player2.hp <= 2 || survivalRef.current.enemies.some((e) => e.kind === 'boss')
            : screen === 'slash'
              ? slashRef.current.hearts <= 1
              : stackHeight(tetrisRef.current) >= 13
        const level = danger ? 1 : 0
        if (level !== bgmTensionCur) {
          bgmTensionCur = level
          setBgmTension(level)
        }
      } else if (bgmTensionCur !== 0) {
        // R220.1⑥: 关 BGM 时同步把张力推回 0——原只清局部变量,sfx 侧残留 1,
        // 重开 BGM 后卡急变奏直到下次危险翻转(G5)。
        bgmTensionCur = 0
        setBgmTension(0)
      }
      snapshotTimer += dt
      if (snapshotTimer > 0.18) {
        if (screen === 'td') publishTd()
        else if (screen === 'survival') publishSurvival()
        else if (screen === 'slash') publishSlash()
        else publishTetris()
        snapshotTimer = 0
      }
      // R198(FR-G01): 教练 3s 评估 + 首局引导步进(引导期间教练静默)
      coachAccRef.current += dt
      if (coachAccRef.current >= 3) {
        coachAccRef.current = 0
        if (onboardStep > 0) {
          const steps = ONBOARD_STEPS[screen as 'td' | 'survival' | 'tetris' | 'slash']
          const stateObj = screen === 'td' ? tdStateRef.current : screen === 'survival' ? survivalRef.current : screen === 'tetris' ? tetrisRef.current : slashRef.current
          let step = onboardStep
          while (step <= steps.length && steps[step - 1].done(stateObj as never)) step += 1
          if (step > steps.length) {
            markOnboarded(localStorage, screen)
            setOnboardStep(0)
          } else if (step !== onboardStep) {
            setOnboardStep(step)
          }
        } else {
          const now = Date.now()
          const hints = screen === 'td' ? tdHints(tdStateRef.current)
            : screen === 'survival' ? survivalHints(survivalRef.current)
              : screen === 'tetris' ? tetrisHints(tetrisRef.current)
                : slashHints(slashRef.current)
          const hint = pickHint(hints, coachLastShownRef.current, now)
          if (hint !== null) coachLastShownRef.current[hint.key] = now
          setCoachHint(hint)
        }
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      stopBgm()
    }
  }, [finishSurvivalRun, pollGamepad, pollVision, publishTd, publishSurvival, publishTetris, screen, settleBest])

  useEffect(() => {
    if (screen !== 'survival' && screen !== 'tetris' && screen !== 'slash' && !fullscreen) return
    const normalizeKey = (event: KeyboardEvent) => event.code === 'Space' ? 'space' : event.key.toLowerCase()
    const down = (event: KeyboardEvent) => {
      // R218 U2: Escape 分层迁至下方独立 effect(四作非 fs 态也要响应暂停/
      // 专注退出;本 effect 的早退门会挡掉非 fs TD 的 Esc)。
      if (event.key === 'Escape') return
      const normalized = normalizeKey(event)
      if (MOVEMENT_KEYS.has(normalized) && !event.ctrlKey && !event.metaKey && !event.altKey) event.preventDefault()
      if (screen === 'td' && normalized === 'q') {
        // R209: LAN 客端技能指令上行;房主本地直接施放
        if (lanRoleRef.current === 'guest') {
          void window.rgbbox?.lanCmd?.({ k: 'meteor' })
        } else if (castMeteor(tdStateRef.current) > 0) playSfx('levelup')
      }
      // R213: 输入配置中心——P2-P4 任意时刻按 keyMap 池名路由(inputs[N-1] 与
      // keys2 同引用;R208 旧固定 IJKL 映射由默认配置等价覆盖)。
      if (screen === 'survival') {
        const pool = keyMapRef.current[normalized]
        if (pool !== undefined) {
          const n = Number(pool[1])
          const set = survivalRef.current.inputs[n - 1]
          if (set !== undefined) {
            event.preventDefault()
            set.add(pool)
            return
          }
        }
      }
      // R211: fs 画布 HUD 键盘等价——TD 1-5 选塔 / U 升级 / X 出售 / Enter 主按钮 /
      // R 重开;Swarm levelup 1-3(与引导文案 games.onboard.survival.2 对齐,补实现)。
      if (screen === 'td' && /^[1-5]$/.test(normalized)) {
        const def = TOWER_DEFINITIONS[Number(normalized) - 1]
        if (def) selectedTowerActionRef.current(def.kind)
      }
      if (screen === 'td' && normalized === 'u') fsActionRef.current['fs-upgrade']?.()
      if (screen === 'td' && normalized === 'x') fsActionRef.current['fs-sell']?.()
      if (screen === 'survival' && /^[1-3]$/.test(normalized) && survivalRef.current.phase === 'levelup') {
        const offer = survivalRef.current.offers[Number(normalized) - 1]
        if (offer) chooseUpgradeRef.current(offer)
      }
      // R219.7②(对抗审查修正): Enter/R 键盘等价与按钮条同门控——运行中
      // (含 levelup/roulette)按钮已隐藏,键盘等价也必须停;否则 Slash 局中
      // 误触 Enter 会无形重开局(TD 的「下一波」保留)。
      if (normalized === 'enter' || normalized === 'r') {
        const ph = currentPhaseRef.current()
        const barVisible = screenRef.current === 'td' || ph === 'ready' || ph === 'lost' || ph === 'won'
        if (barVisible) {
          if (normalized === 'enter') fsActionRef.current['fs-primary']?.()
          else fsActionRef.current['fs-restart']?.()
        }
      }
      if (screen === 'survival') {
        // R213: P1 键位经配置映射到引擎标准键(箭头);箭头键恒属 P1(手感兼容)
        const std = p1KeyMapRef.current[normalized]
        if (std !== undefined) survivalRef.current.keys.add(std)
        else if (normalized !== 'p2up' && normalized !== 'p2down' && normalized !== 'p2left' && normalized !== 'p2right') survivalRef.current.keys.add(normalized)
      } else if (screen === 'slash') {
        const dir = normalized === 'arrowright' ? 0 : normalized === 'arrowup' ? 2 : normalized === 'arrowleft' ? 4 : normalized === 'arrowdown' ? 6 : -1
        if (dir >= 0) { slashCut(slashRef.current, dir); playSfx('pop') }
        else if (normalized === 'space') { if (slashBomb(slashRef.current)) playSfx('wave') }
      } else if (screen === 'tetris') {
        if (normalized === 'arrowleft') tetrisRef.current.commands.push('left')
        else if (normalized === 'arrowright') tetrisRef.current.commands.push('right')
        else if (normalized === 'arrowup') tetrisRef.current.commands.push('rotate')
        else if (normalized === 'space') tetrisRef.current.commands.push('hard')
        else if (normalized === 'c') tetrisRef.current.commands.push('hold')
        else if (normalized === 'arrowdown') tetrisRef.current.keys.add('arrowdown')
        // R208(FR-MP02): B 板 P2 键位——j/l 移动 · i 旋转 · k 软降 · / 硬降 · . hold
        if (tetrisBRef.current.phase === 'running') {
          const B = tetrisBRef.current
          if (normalized === 'j') B.commands.push('left')
          else if (normalized === 'l') B.commands.push('right')
          else if (normalized === 'i') B.commands.push('rotate')
          else if (normalized === 'k') B.keys.add('arrowdown')
          else if (normalized === '/') B.commands.push('hard')
          else if (normalized === '.') B.commands.push('hold')
        }
      }
    }
    const up = (event: KeyboardEvent) => {
      const normalized = normalizeKey(event)
      // R213: P1 经配置映射释放(std 键名),P2-P4 池名释放(inputs 与 keys2 同引用)
      const std = p1KeyMapRef.current[normalized]
      if (std !== undefined) survivalRef.current.keys.delete(std)
      else survivalRef.current.keys.delete(normalized)
      const pool = keyMapRef.current[normalized]
      if (pool !== undefined) {
        const set = survivalRef.current.inputs[Number(pool[1]) - 1]
        set?.delete(pool)
      }
      tetrisRef.current.keys.delete(normalized)
      if (normalized === 'k') tetrisBRef.current.keys.delete('arrowdown')
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      // R220.1⑨: 切屏/退全屏重建监听时释放全部引擎键池——修按住方向键切
      // hub/换游戏后的卡键残留(R96.4 明示遗留)。
      releaseAllEngineInputs()
    }
    // eslint 未接入(exhaustive-deps 无强制);releaseAllEngineInputs 为稳定空依赖回调
  }, [fullscreen, screen, releaseAllEngineInputs])

  // ── R218 U2/U9: Escape 统一分层(独立 effect,不受上方「非 fs TD 早退门」
  // 影响):专注模式退出 > fs 暂停切换(R206 语义) > 非 fs 运行态暂停切换 >
  // 兜底退出全屏。与手柄 Start 共用同一 fsPaused 冻结通路(loop 顶部 dt=0)。──
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || screenRef.current === 'hub') return
      if (focusModeRef.current && !fullscreen) {
        // U9: 退出专注模式(窗口内满幅 → 常规布局)
        setFocusMode(false)
        return
      }
      if (fullscreen) {
        setFsPaused((v) => !v)
        return
      }
      if (currentPhaseRef.current() === 'running') {
        setFsPaused((v) => !v)
        return
      }
      setFullscreen(false)
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  const enterGame = useCallback((next: Screen) => {
    setFullscreen(false)
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined)
    // R208: 离开/切换游戏时清轮换对决状态(防止残留回合机污染下一局)
    duelRef.current = null
    setDuel(null)
    setScreen(next)
  }, [])

  const backToHub = useCallback(() => {
    setFullscreen(false)
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined)
    // R220.1⑧: survival 中途弃局(running/levelup/roulette)按 lost 结算——
    // 原样保留会导致重进游戏时残留 running 态、ready 面板被旁路(07 X-1,
    // 主审 CDP 第一手复现)。分数与进度照常入账。
    const sv = survivalRef.current
    if (sv.phase === 'running' || sv.phase === 'levelup' || sv.phase === 'roulette') {
      sv.phase = 'lost'
      releaseAllEngineInputs()
      finishSurvivalRun()
      publishSurvival()
    }
    setScreen('hub')
  }, [finishSurvivalRun, publishSurvival, releaseAllEngineInputs])

  // R142-L4: chord 'back' fires this via a late-binding ref (pollVision is
  // declared above backToHub — same pattern as startTetrisRef)
  const backToHubRef = useRef<() => void>(() => undefined)
  backToHubRef.current = backToHub

  const toggleSfx = useCallback(() => {
    setSfxEnabled(!sfxOn)
    setSfxOn(!sfxOn)
    if (sfxOn) return
    playSfx('coin')
  }, [sfxOn])

  const toggleBgm = useCallback(() => {
    setBgmEnabled(!bgmOn)
    setBgmOn(!bgmOn)
    if (!bgmOn && (screen === 'td' || screen === 'survival' || screen === 'tetris')) startBgm()
  }, [bgmOn, screen])

  const startOrNextWave = useCallback(() => {
    if (tdStateRef.current.phase === 'won' || tdStateRef.current.phase === 'lost') {
      tdStateRef.current = initialState(readDifficulty('td'))
      setSelectedTowerId(null)
    }
    // FR-G08: 闪电赛——6 波上限(引擎 targetWaves 读 blitz)
    tdStateRef.current.blitz = tdBlitzOnRef.current
    // R204→R218 U4: TD 难度四档——首波开局(ready 态 state 早在挂载时以默认档
    // 初始化)按 td.ts 真实参数表覆写 lives/起始金/difficulty;重开路径走
    // initialState(difficulty) 重建。敌 HP 系数由引擎读 difficulty 自算。
    const tdDifficulty = readDifficulty('td')
    runDifficultyRef.current = tdDifficulty
    if (tdStateRef.current.wave === 0 && tdStateRef.current.towers.length === 0) {
      const p = TD_DIFFICULTY_PARAMS[tdDifficulty]
      tdStateRef.current.lives = p.lives
      tdStateRef.current.coins = TD_BASE_COINS + p.startGoldDelta
      tdStateRef.current.difficulty = tdDifficulty
    }
    const state = tdStateRef.current
    if (state.phase === 'ready') {
      state.phase = 'running'
      if (state.wave === 0) launchWave(state)
    } else if (state.phase === 'running' && state.waveQueue === 0 && state.balloons.length === 0 && state.wave < MAX_WAVE) {
      const bonus = Math.max(0, Math.round(state.waveCooldown * 4))
      if (bonus > 0) {
        state.coins += bonus
        addText(state, WIDTH / 2, 96, `Early +${bonus}`, '#fde68a')
      }
      launchWave(state)
    }
    publishTd()
  }, [publishTd])

  const restartTd = useCallback(() => {
    tdStateRef.current = initialState(readDifficulty('td'))
    setSelectedTowerId(null)
    publishTd()
  }, [publishTd])

  const upgradeSelected = useCallback(() => {
    const state = tdStateRef.current
    const tower = state.towers.find((item) => item.id === selectedTowerId)
    if (!tower) return
    if (upgradeTower(state, tower)) {
      spawnBurst(state, tower.x, tower.y, '#86efac', 10, 110)
      addText(state, tower.x, tower.y - 28, `Lv${tower.level}`, '#86efac')
    }
    publishTd()
  }, [publishTd, selectedTowerId])

  const sellSelected = useCallback(() => {
    const state = tdStateRef.current
    const tower = state.towers.find((item) => item.id === selectedTowerId)
    if (!tower) return
    sellTower(state, tower)
    setSelectedTowerId(null)
    publishTd()
  }, [publishTd, selectedTowerId])

  const handleCanvasClick = useCallback((event: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    // R219.7①: survival 可变纵横比——点击映射按当前 vp(其余 900×520)
    const lw = screenRef.current === 'survival' ? survivalRef.current.vp.w : WIDTH
    const lh = screenRef.current === 'survival' ? survivalRef.current.vp.h : HEIGHT
    const point = {
      x: ((event.clientX - rect.left) / rect.width) * lw,
      y: ((event.clientY - rect.top) / rect.height) * lh,
    }
    const state = tdStateRef.current
    const tower = state.towers.find((item) => Math.hypot(item.x - point.x, item.y - point.y) < 22)
    if (tower) {
      setSelectedTowerId(tower.id === selectedTowerId ? null : tower.id)
      return
    }
    buildTowerAtRef.current(point)
  }, [selectedTowerId])

  // R209(FR-LN04): 建塔逻辑独立成可复用函数——本地点击与 LAN 远程指令共用。
  const buildTowerAt = useCallback((point: { x: number; y: number }) => {
    const state = tdStateRef.current
    const def = TOWER_DEFINITIONS.find((item) => item.kind === selectedTowerRef.current) ?? TOWER_DEFINITIONS[0]
    if (state.coins < def.cost) {
      addText(state, point.x, point.y, 'Need coins', '#fca5a5')
      publishTd()
      return
    }
    if (distanceToPath(point) < 42 || state.towers.some((item) => Math.hypot(item.x - point.x, item.y - point.y) < 44)) {
      addText(state, point.x, point.y, 'Blocked', '#fca5a5')
      publishTd()
      return
    }
    state.coins -= def.cost
    state.towers.push({ id: state.nextId++, kind: def.kind, level: 1, spent: def.cost, angle: -Math.PI / 2, x: point.x, y: point.y, range: def.range, cooldown: 0, fireRate: def.fireRate, damage: def.damage })
    if (state.phase === 'ready') state.phase = 'running'
    if (state.wave === 0) launchWave(state)
    spawnBurst(state, point.x, point.y, def.color, 12, 120)
    playSfx('build')
    publishTd()
  }, [publishTd])
  buildTowerAtRef.current = (point) => { buildTowerAt(point) }
  const selectedTowerRef = useRef(selectedTower)
  selectedTowerRef.current = selectedTower

  // ── R209 (FR-LN02/03/04 + 三期 LN05): LAN 事件桥——客端指令落地 / 快照入
  // ref / Tetris 对战事件双向(消行攻击入场+结算互显,不分 host/guest) / 断线提示 ──
  useEffect(() => {
    const off = window.rgbbox?.onLanEvent?.((e) => {
      if (e.kind === 'cmd' && e.detail && typeof e.detail === 'object') {
        const c = e.detail as { k: string; x?: number; y?: number; id?: number; lines?: number; score?: number }
        if (c.k === 'garbage' && typeof c.lines === 'number' && lanGameRef.current === 'tetris') {
          // 对方消行攻击:垃圾行入场(引擎自带冲突上推/非 running 免疫)
          applyGarbage(tetrisRef.current, Math.max(0, Math.min(8, Math.floor(c.lines))))
          playSfx('hit')
        } else if (c.k === 'result' && typeof c.score === 'number' && lanGameRef.current === 'tetris') {
          const theirs = Math.max(0, Math.floor(c.score))
          setLanTetrisScore((cur) => ({ mine: cur?.mine ?? null, theirs }))
        } else if (lanRoleRef.current === 'host') {
          if (c.k === 'build' && typeof c.x === 'number' && typeof c.y === 'number') {
            buildTowerAtRef.current({ x: c.x, y: c.y })
          } else if (c.k === 'meteor') {
            if (castMeteor(tdStateRef.current) > 0) playSfx('levelup')
          } else if (c.k === 'select' && typeof c.id === 'number') {
            setSelectedTowerId(c.id)
          } else if (c.k === 'upgrade') {
            fsActionRef.current['fs-upgrade']?.()
          } else if (c.k === 'sell') {
            fsActionRef.current['fs-sell']?.()
          }
        }
      } else if (e.kind === 'snap' && lanRoleRef.current === 'guest') {
        // 快照直接落引擎 ref——统计条/ctl 行/绘制全部复用既有通路
        lanSnapRef.current = e.detail as GameState
        tdStateRef.current = lanSnapRef.current
        // R209 三期: 插值基准换新(深拷贝 balloons,防逐帧外推污染快照)
        lanSnapExRef.current = { balloons: tdStateRef.current.balloons.map((b) => ({ ...b })), affix: tdStateRef.current.affix }
        lanSnapAtRef.current = performance.now()
        publishTd()
      } else if (e.kind === 'peer-joined' && e.detail && typeof e.detail === 'object' && 'joined' in e.detail) {
        lanPeersRef.current += 1
      } else if (e.kind === 'peer-left') {
        lanPeersRef.current = Math.max(0, lanPeersRef.current - 1)
        setLanNotice(t('games.lan.peerLeft'))
        window.setTimeout(() => setLanNotice(null), 4000)
      }
    })
    return () => { off?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── R211: canvas 统一事件分发——fs 画布按钮 hitTest 优先,未命中落回各作交互 ──
  const toCanvasPoint = (event: MouseEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    // R219.7①: survival 可变纵横比——fs 按钮 hitTest 与悬停按当前 vp 映射
    const lw = screenRef.current === 'survival' ? survivalRef.current.vp.w : WIDTH
    const lh = screenRef.current === 'survival' ? survivalRef.current.vp.h : HEIGHT
    return {
      x: ((event.clientX - rect.left) / rect.width) * lw,
      y: ((event.clientY - rect.top) / rect.height) * lh,
    }
  }
  const handleUnifiedCanvasMove = (event: MouseEvent<HTMLCanvasElement>): void => {
    const point = toCanvasPoint(event)
    if (!point) return
    lastInputAtRef.current = performance.now()
    const hit = hitTest(fsButtonsRef.current, point.x, point.y)
    hudHoverRef.current = hit?.id ?? null
    if (isTd) tdHoverRef.current = point // R220.1⑩: ref 直写,免全树重渲
  }
  const handleUnifiedCanvasClick = (event: MouseEvent<HTMLCanvasElement>): void => {
    const point = toCanvasPoint(event)
    if (!point) return
    lastInputAtRef.current = performance.now()
    const hit = hitTest(fsButtonsRef.current, point.x, point.y)
    if (hit) {
      fsActionRef.current[hit.id]?.()
      return
    }
    if (isTd) {
      // R209(FR-LN04): LAN 客端不本地建塔——指令上行,房主权威结算
      if (lanRoleRef.current === 'guest') {
        void window.rgbbox?.lanCmd?.({ k: 'build', kind: selectedTower, x: point.x, y: point.y })
        return
      }
      handleCanvasClick(event)
    }
  }

  const enabledArtifacts = useMemo(() => ARTIFACTS
    .filter((artifact) => meta.artifacts[artifact.id] && isArtifactUnlocked(artifact, meta.stats))
    .map((artifact) => artifact.id), [meta])

  const startSurvivalRun = useCallback(() => {
    // R219.3: 升级三选一/轮盘进行中不开局——原路径会静默换难度(开局无反馈且
    // 打断选择流);选择走数字键/卡片点击,「开始」此时不该做事。
    if (survivalRef.current.phase === 'levelup' || survivalRef.current.phase === 'roulette') return
    // R218 U4: 难度经 initialSurvivalState 第 4 参进引擎(eHP 四档权威来源)
    const difficulty = readDifficulty('survival')
    runDifficultyRef.current = difficulty
    if (survivalRef.current.phase === 'lost' || survivalRef.current.phase === 'ready') {
      survivalRef.current = initialSurvivalState(swarmCharacter, meta.perm, enabledArtifacts, difficulty)
    } else {
      setSurvivalDifficulty(survivalRef.current, difficulty)
    }
    // FR-G08: 90 秒冲刺——时限到走既有 lost 结算(分数保留)
    survivalRef.current.sprintSeconds = swarmSprintOnRef.current ? 90 : undefined
    // R220.5: 每日挑战注入当日种子(共同棋盘);自由局清除
    survivalRef.current.rng = swarmDailyOnRef.current ? mulberry32(dailySeed()) : undefined
    // R213: 4P 名册部署(人数选择;swarmCoopOn 开关是人数=2 的快捷别名)与场景背景
    const count = Math.max(1, Math.min(4, swarmPlayersRef.current)) as 1 | 2 | 3 | 4
    deployPlayers(survivalRef.current, count)
    survivalRef.current.scene = swarmSceneRef.current
    startSurvival(survivalRef.current)
    publishSurvival()
  }, [enabledArtifacts, meta, publishSurvival, swarmCharacter])

  startRunRef.current = startSurvivalRun
  // R142-E4: slash uses the same unified start entry (pinch/open-palm/chord)
  const startSlashRunCb = useCallback(() => {
    // R204: Slash 难度二档 → R218 U4 四档。R204 的「开局前写 maxHearts/
    // hearts」实为死代码——startSlash 内 Object.assign(s, initialSlashState())
    // 会把两字段重置回 3(本分支删除该写入,难度语义整体移交引擎侧:
    // tdsl 分支的 SLASH_DIFFICULTY_PARAMS/血条化在读 difficulty 字段生效)。
    const d = readDifficulty('slash')
    runDifficultyRef.current = d
    // FR-G08: 30 秒爆发——startSlash 可选时长(T1 引擎支持)
    // R208 (FR-MP03): 轮换对决——首次开局部署回合机(P1 先手)
    if (duelRef.current === null && slashDuelOnRef.current) {
      const fresh = { turn: 1 as const, scores: [null, null] as [number | null, number | null], done: false }
      duelRef.current = fresh
      setDuel(fresh)
    }
    startSlash(slashRef.current, slashBurstOnRef.current ? 30 : RUN_SECONDS, d)
    publishSlash()
  }, [publishSlash])
  slashStartRef.current = startSlashRunCb

  const restartSurvivalRun = useCallback(() => {
    survivalRef.current = initialSurvivalState(swarmCharacter, meta.perm, enabledArtifacts, readDifficulty('survival'))
    // R219.3: 重开也带上当前场景/冲刺偏好——回 ready 态的画布与开局参数一致
    // (原重开丢 scene,预览背景静默回退旧星空主题)。
    survivalRef.current.scene = swarmSceneRef.current
    survivalRef.current.sprintSeconds = swarmSprintOnRef.current ? 90 : undefined
    publishSurvival()
  }, [enabledArtifacts, meta, publishSurvival, swarmCharacter])

  const toggleArtifact = useCallback((id: ArtifactId) => {
    setMeta((prev) => {
      const def = ARTIFACTS.find((artifact) => artifact.id === id)
      if (!def || !isArtifactUnlocked(def, prev.stats)) return prev
      const next = { ...prev, artifacts: { ...prev.artifacts, [id]: !prev.artifacts[id] } }
      writeMeta(next)
      return next
    })
  }, [])

  const selectCharacter = useCallback((id: CharacterId) => {
    setSwarmCharacter(id)
    writeCharacter(id)
  }, [])

  const beginRoulette = useCallback(() => {
    openRoulette(survivalRef.current)
    setRoulette({ stage: 'pick' })
    publishSurvival()
  }, [publishSurvival])

  const spinRoulette = useCallback((kind: 'item' | 'stat') => {
    const state = survivalRef.current
    const luck = 0.12 * state.perm.luck
    const result = kind === 'item' ? rollRouletteItem(state.taken, luck) : rollRouletteStat(luck)
    setRoulette({ stage: 'spin', result })
    window.setTimeout(() => setRoulette((current) => (current.stage === 'spin' ? { ...current, stage: 'result' } : current)), 1700)
  }, [])

  const claimRoulette = useCallback(() => {
    if (roulette.result) applyRouletteResult(survivalRef.current, roulette.result)
    setRoulette({ stage: 'pick' })
    publishSurvival()
  }, [publishSurvival, roulette.result])

  const dissolveCurrentRoulette = useCallback(() => {
    if (roulette.result) dissolveRoulette(survivalRef.current, roulette.result)
    setRoulette({ stage: 'pick' })
    publishSurvival()
  }, [publishSurvival, roulette.result])

  // R139: late-binding action list for the gesture focus — rebuilt per stage
  // (pick → the two wheels, result → claim/dissolve); pollVision invokes it.
  rouletteActionsRef.current = roulette.stage === 'pick'
    ? [() => spinRoulette('item'), () => spinRoulette('stat')]
    : [claimRoulette, dissolveCurrentRoulette]

  // entering/re-entering the roulette resets the gesture selection
  useEffect(() => {
    setRouletteFocus(0)
    rouletteFocusRef.current = 0
    visionDoublePinchRef.current = 0
  }, [survivalSnapshot.phase, roulette.stage])

  const buyPermanent = useCallback((key: PermKey) => {
    setMeta((prev) => {
      const next = buyPerm(prev, key)
      if (!next) return prev
      writeMeta(next)
      return next
    })
  }, [])

  const startTetrisRun = useCallback(() => {
    // R218 U4: Tetris 难度=起始等级(TETRIS_DIFFICULTY_PARAMS,initialTetrisState
    // 第 2 参生效——重力曲线 0.8×0.85^(lv-1) 已有;level 由引擎初始化,勿重复赋)。
    const d = readDifficulty('tetris')
    runDifficultyRef.current = d
    // R209 三期(FR-LN05): LAN Tetris 对战——双方各跑本地引擎(事件同步),
    // 种子开局(host 建房生成/guest 经 welcome 收取)保证 piece 序列一致;
    // 本地双板开关在该模式下不参与(对手即远端板);断线不恢复,重开即新局。
    if (lanRoleRef.current !== 'idle' && lanGameRef.current === 'tetris') {
      tetrisRef.current = initialTetrisState(lanSeedRef.current ?? undefined, d)
      tetrisBRef.current = initialTetrisState(undefined, d)
      setLanTetrisScore(null)
      startTetris(tetrisRef.current)
      publishTetris()
      return
    }
    if (tetrisRef.current.phase === 'ready' || tetrisRef.current.phase === 'lost' || (tetrisDuelOnRef.current && tetrisBRef.current.phase === 'lost')) {
      tetrisRef.current = initialTetrisState(undefined, d)
      tetrisBRef.current = initialTetrisState(undefined, d)
    }
    // R208(FR-MP02): 双板对战——A 左移 B 右移并排;键位 P1 方向键/C,P2 IJKL+/.。
    // FR-G08: 40 行竞速——达标进 'won'(结算面板复用)。
    tetrisRef.current.raceLines = tetrisRaceOnRef.current ? 40 : undefined
    tetrisBRef.current.raceLines = tetrisRaceOnRef.current ? 40 : undefined
    tetrisRef.current.boardX = tetrisDuelOnRef.current ? 150 : 300
    if (tetrisDuelOnRef.current) {
      tetrisBRef.current.boardX = 560
      startTetris(tetrisBRef.current)
    }
    startTetris(tetrisRef.current)
    publishTetris()
  }, [publishTetris])

  startTetrisRef.current = startTetrisRun

  const restartTetrisRun = useCallback(() => {
    tetrisRef.current = initialTetrisState()
    tetrisBRef.current = initialTetrisState()
    publishTetris()
  }, [publishTetris])

  const chooseUpgrade = useCallback((id: UpgradeId) => {
    // R220.2: 手动点卡即取消待执行的自动选择
    autoPickChoiceRef.current = null
    setAutoPickChoice(null)
    applyUpgrade(survivalRef.current, id)
    publishSurvival()
  }, [publishSurvival])

  // ── R218 U9: 一局进行中(含 survival levelup/roulette 中场)——「进行态」
  // 布局门:隐藏标题行/收窄边距/专注模式随开局进入。──
  const runActive = screen === 'td' ? tdSnapshot.phase === 'running'
    : screen === 'survival' ? (survivalSnapshot.phase === 'running' || survivalSnapshot.phase === 'levelup' || survivalSnapshot.phase === 'roulette')
      : screen === 'slash' ? slashSnapshot.phase === 'running'
        : screen === 'tetris' ? tetrisSnapshot.phase === 'running'
          : false
  const runActivePrevRef = useRef(false)
  useEffect(() => {
    if (runActive && !runActivePrevRef.current) {
      if (screenScaleRef.current === 'focus') setFocusMode(true) // 偏好=专注:开局自动满幅
    } else if (!runActive && runActivePrevRef.current) {
      setFocusMode(false) // 终局/回 ready 自动退出专注
    }
    runActivePrevRef.current = runActive
  }, [runActive])

  if (screen === 'hub') {
    return (
      <div className="games-view">
        <header className="workspace-header games-header">
          {/* R189 Q-5: topbar already shows '迷你游戏' — the near-duplicate
              hub H1 is gone; per-game screens keep their own gameTitle H2. */}
          <div>
            <p className="eyebrow">{t('games.eyebrow')}</p>
          </div>
          <div className="games-header-actions">
            <button className="aspect-lock-btn" type="button" aria-label={t('games.bgmToggle')} title={t('games.bgmToggle')} onClick={toggleBgm}>
              <Music aria-hidden="true" size={13} />
              {bgmOn ? '' : '×'}
            </button>
            <button className="aspect-lock-btn" type="button" aria-label={t('games.sfxToggle')} title={t('games.sfxToggle')} onClick={toggleSfx}>
              {sfxOn ? <Volume2 aria-hidden="true" size={13} /> : <VolumeX aria-hidden="true" size={13} />}
            </button>
            {/* R207: 手势指示器临时呼出入口(设置页为主入口) */}
            <button
              className="aspect-lock-btn"
              type="button"
              data-action="vision-pad-toggle"
              aria-label={t('games.visionPad.toggle')}
              title={t('games.visionPad.toggle')}
              onClick={() => { const next = !visionPadVisible; setVisionPadVisible(next); writeVisionPadVisible(next) }}
            >
              {visionPadVisible ? <Eye aria-hidden="true" size={13} /> : <EyeOff aria-hidden="true" size={13} />}
            </button>
            {/* R209 (FR-LN01): LAN 联机入口——建房/发现/直连 */}
            <button
              className="aspect-lock-btn"
              type="button"
              data-action="lan-toggle"
              aria-label={t('games.lan.title')}
              title={t('games.lan.title')}
              onClick={() => setLanPanelOpen((v) => !v)}
            >
              <Grid aria-hidden="true" size={13} />
              {t('games.lan.button')}
            </button>
          </div>
        </header>
        {lanPanelOpen ? (
          <LanPanel
            onHosted={(game, seed) => {
              setLanRole('host')
              setLanGame(game)
              lanSeedRef.current = seed
              lanPeersRef.current = 0
              setLanTetrisScore(null)
              setLanPanelOpen(false)
              enterGame(game)
            }}
            onJoined={(game, seed) => {
              setLanRole('guest')
              setLanGame(game)
              lanSeedRef.current = seed ?? null
              lanSnapRef.current = null
              lanSnapExRef.current = null
              setLanTetrisScore(null)
              setLanPanelOpen(false)
              enterGame(game)
            }}
            onClose={() => setLanPanelOpen(false)}
          />
        ) : null}
        <div className="games-hub">
          <button className="game-tile" type="button" style={{ '--game-accent': '#67e8f9' } as CSSProperties} onClick={() => enterGame('td')}>
            <span className="tower-orb" style={{ background: '#67e8f9' }}><Shield aria-hidden="true" size={18} /></span>
            <span className="game-tile-copy">
              <strong>{t('games.tileTdTitle')}</strong>
              <small>{t('games.tileTdSummary')}</small>
              <em><Trophy aria-hidden="true" size={12} />{bests.td}</em>
            </span>
            <Play aria-hidden="true" size={16} />
          </button>
          <button className="game-tile" type="button" style={{ '--game-accent': '#4ade80' } as CSSProperties} onClick={() => enterGame('survival')}>
            <span className="tower-orb" style={{ background: '#4ade80' }}><Zap aria-hidden="true" size={18} /></span>
            <span className="game-tile-copy">
              <strong>{t('games.tileSwarmTitle')}</strong>
              <small>{t('games.tileSwarmSummary')}</small>
              <em><Trophy aria-hidden="true" size={12} />{bests.survival}</em>
            </span>
            <Play aria-hidden="true" size={16} />
          </button>
          <button className="game-tile" type="button" style={{ '--game-accent': '#f0abfc' } as CSSProperties} onClick={() => enterGame('tetris')}>
            <span className="tower-orb" style={{ background: '#f0abfc' }}><Grid aria-hidden="true" size={18} /></span>
            <span className="game-tile-copy">
              <strong>{t('games.tileTetrisTitle')}</strong>
              <small>{t('games.tileTetrisSummary')}</small>
              <em><Trophy aria-hidden="true" size={12} />{bests.tetris}</em>
            </span>
            <Play aria-hidden="true" size={16} />
          </button>
          <button className="game-tile" type="button" style={{ '--game-accent': '#fbbf24' } as CSSProperties} onClick={() => enterGame('slash')}>
            <span className="tower-orb" style={{ background: '#fbbf24' }}><Crosshair aria-hidden="true" size={18} /></span>
            <span className="game-tile-copy">
              <strong>{t('games.tileSlashTitle')}</strong>
              <small>{t('games.tileSlashSummary')}</small>
              <em><Trophy aria-hidden="true" size={12} />{bests.slash}</em>
            </span>
            <Play aria-hidden="true" size={16} />
          </button>
          <div className="game-tile ghost" aria-hidden="true">
            <span className="tower-orb"><Crosshair aria-hidden="true" size={18} /></span>
            <span className="game-tile-copy">
              <strong>{t('games.tileSoonTitle')}</strong>
              <small>{t('games.tileSoonSummary')}</small>
            </span>
          </div>
        </div>
        {/* R198(FR-G02): arcade profile——局数/时长/连续天数(遥测聚合) */}
        <div className="games-profile" data-field="games-profile">
          <h3>{t('games.profile.title')}</h3>
          <div className="games-daily-row" data-field="games-daily">
            <span>{t('games.daily.title')}</span>
            {(['td', 'swarm', 'tetris', 'slash'] as GameId[]).map((id) => {
              const rec = loadDaily(localStorage, id)
              const title = id === 'td' ? t('games.tileTdTitle') : id === 'swarm' ? t('games.tileSwarmTitle') : id === 'tetris' ? t('games.tileTetrisTitle') : t('games.tileSlashTitle')
              return <span key={id} className={rec !== null ? 'daily-chip done' : 'daily-chip'}>{title} {rec !== null ? `★${rec.best}` : '·'}</span>
            })}
          </div>
          <div className="games-profile-grid">
            {(['td', 'swarm', 'tetris', 'slash'] as GameId[]).map((id) => {
              const key = (id === 'swarm' ? 'survival' : id) as GameKey
              const stats = profileStats(loadRuns(localStorage, id), bestRef.current[key])
              const title = id === 'td' ? t('games.tileTdTitle') : id === 'swarm' ? t('games.tileSwarmTitle') : id === 'tetris' ? t('games.tileTetrisTitle') : t('games.tileSlashTitle')
              return (
                <div key={id} className="games-profile-cell">
                  <strong>{title}</strong>
                  <span>{stats.totalRuns} {t('games.profile.runs')}</span>
                  <span>{Math.round(stats.totalSeconds / 60)}min {t('games.profile.time')}</span>
                  {stats.streakDays > 0 ? <span>🔥 {stats.streakDays} {t('games.profile.streak')}</span> : null}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  const isSlash = screen === 'slash'
  const isTetris = screen === 'tetris'
  const isTd = screen === 'td'
  const isSurvival = screen === 'survival'
  const gameTitle = isTd ? t('games.tileTdTitle') : isSurvival ? t('games.tileSwarmTitle') : isSlash ? t('games.tileSlashTitle') : t('games.tileTetrisTitle')
  const rawPhase = isTd ? tdSnapshot.phase : isSurvival ? (survivalSnapshot.phase === 'levelup' ? 'ready' : survivalSnapshot.phase) : isSlash ? slashSnapshot.phase : tetrisSnapshot.phase
  const phase = rawPhase as 'ready' | 'running' | 'won' | 'lost'
  const phaseLabel = phase === 'won' ? t('games.statusWon') : phase === 'lost' ? t('games.statusLost') : phase === 'ready' ? t('games.statusReady') : t('games.statusRunning')
  const best = isTd ? bests.td : isSurvival ? bests.survival : isSlash ? bests.slash : bests.tetris
  // R131/R132: vision status chip — localized wizard hint while calibrating
  // (retry reasons from the engine stay verbatim — they are the actionable
  // text); R132: an active session with no hand in frame flips to the
  // "not detected" text immediately (the session itself stays active through
  // the 45-frame grace), and a just-disabled session shows a short notice.
  const visionSuffix = visionExitNotice
    ? ` · 👁 ${t('games.vision.exited')}`
    : vision.enabled
      ? ` · 👁 ${vision.state === 'active' && (phase === 'ready' || phase === 'lost')
          ? t('games.vision.startHint')
          : vision.state === 'calibrating' && vision.stepId && !vision.label.startsWith('重试')
            ? t(`games.vision.hint.${vision.stepId}`)
            : vision.state === 'active' && !vision.handSeen
              ? t('games.vision.state.searching')
              : vision.label || t(`games.vision.state.${vision.state}`)}`
      : vision.label ? ` · 👁 ${t('games.vision.error')}: ${vision.label}` : ''
  const startHandler = isTd ? startOrNextWave : isSurvival ? startSurvivalRun : isTetris ? startTetrisRun : startSlashRunCb
  const restartHandler = isTd ? restartTd : isSurvival ? restartSurvivalRun : restartTetrisRun
  // ── R218 U3: ready 态统一面板的数据面 ──
  /** 真实引擎 phase==='ready'(不经 levelup→ready 的显示映射,避免升级浮层下穿出)。 */
  const showReady = isTd ? tdSnapshot.phase === 'ready' : isSurvival ? survivalSnapshot.phase === 'ready' : isSlash ? slashSnapshot.phase === 'ready' : tetrisSnapshot.phase === 'ready'
  /** 选择写透 rgbbox:gamesReady:<game>(与进作恢复 effect 成对)。 */
  const persistReadyPref = (game: GameKey, patch: Partial<ReadyPrefs>): void => {
    writeReadyPrefs(game, { ...readReadyPrefs(game), ...patch })
  }
  /** R218 U7: ≥2P 的键位席位摘要(配置键位 + assignGamepads 分得的手柄)。 */
  const readySeating: Array<{ n: number; keys: string; padId: string | null }> = []
  if (isSurvival && swarmPlayers >= 2) {
    const assign = assignGamepads(gamepadInfo.indices, inputConfigsRef.current)
    for (let i = 0; i < swarmPlayers; i += 1) {
      const cfg = inputConfigsRef.current[i]
      const padIndex = assign[i]
      const padPos = padIndex !== undefined ? gamepadInfo.indices.indexOf(padIndex) : -1
      readySeating.push({
        n: i + 1,
        keys: `${cfg.up}/${cfg.down}/${cfg.left}/${cfg.right}`,
        padId: padPos >= 0 ? (gamepadInfo.ids[padPos] ?? null) : null,
      })
    }
  }
  // ── R218 U2: 手柄 Start 统一入口的活引用(渲染期刷新,rAF/Esc 闭包免重建)──
  startAnyRef.current = startHandler
  currentPhaseRef.current = () => {
    const scr = screenRef.current
    if (scr === 'td') return tdStateRef.current.phase
    if (scr === 'survival') return survivalRef.current.phase
    if (scr === 'tetris') return tetrisRef.current.phase
    if (scr === 'slash') return slashRef.current.phase
    return 'ready'
  }
  padStartRef.current = () => {
    const scr = screenRef.current
    if (scr === 'hub') return
    // LAN TD 客端为远程席位——开局/下一波由房主决定(与 DOM 按钮同禁用)。
    if (scr === 'td' && lanRoleRef.current === 'guest' && lanGameRef.current === 'td') return
    const phase = currentPhaseRef.current()
    if (phase === 'running') {
      // U2: 运行态 Start=暂停/恢复(复用 R206 fsPaused 冻结,非 fs 态同样生效)
      setFsPaused((v) => !v)
      return
    }
    if (phase === 'ready' || phase === 'lost' || phase === 'won') {
      playSfx('confirm')
      startAnyRef.current()
    }
    // levelup/roulette:升级选择走数字键/手势,Start 不抢焦点。
  }

  // ── R211: fs 纯画布 HUD 绘制(hud.ts 首次接线;DOM 面板已由 CSS 隐藏) ──
  fsActionRef.current = {
    'fs-primary': startHandler,
    'fs-restart': () => { if (restartHandler) restartHandler() },
    'fs-upgrade': upgradeSelected,
    'fs-sell': sellSelected,
    ...Object.fromEntries(TOWER_DEFINITIONS.map((def, i) => [`fs-tower-${i}`, () => setSelectedTower(def.kind)])),
    ...Object.fromEntries((survivalSnapshot.phase === 'levelup' ? survivalSnapshot.offers : []).map((id, i) => [`fs-offer-${i}`, () => chooseUpgrade(id)])),
  }
  selectedTowerActionRef.current = (kind) => setSelectedTower(kind)
  chooseUpgradeRef.current = chooseUpgrade
  fsDrawRef.current = (ctx, now) => {
    const btns = fsButtonsRef.current
    const push = (b: HudButton): void => {
      btns.push(b)
      drawHudButton(ctx, b, hudHoverRef.current === b.id)
    }
    // R219.7①: survival fs 全铺满 → 画布 HUD 锚点读 vp;其余三作恒 900×520
    const vw = isSurvival ? survivalRef.current.vp.w : WIDTH
    const vh = isSurvival ? survivalRef.current.vp.h : HEIGHT
    // ① 顶部状态面板(各作两行关键数值——fs 态 DOM 统计条已隐藏)
    drawHudPanel(ctx, 12, 12, 336, 62)
    ctx.save()
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#e2f8ff'
    ctx.font = '600 14px Inter, sans-serif'
    ctx.fillText(fsStatusLine1(), 26, 34)
    ctx.fillStyle = 'rgba(159, 183, 193, 0.95)'
    ctx.font = '500 12px Inter, sans-serif'
    ctx.fillText(fsStatusLine2(), 26, 56)
    ctx.restore()
    // ② TD 商店(右侧竖列;数字键 1-5 等价)+ 选中塔升级/出售
    if (isTd) {
      TOWER_DEFINITIONS.forEach((def, i) => {
        push({ id: `fs-tower-${i}`, x: vw - 122, y: 86 + i * 47, w: 108, h: 41, label: `${def.label} ◎${def.cost}`, color: def.color, key: String(i + 1) })
      })
      const detail = tdStateRef.current.towers.find((tw) => tw.id === selectedTowerId)
      if (detail) {
        const def = TOWER_DEFINITIONS.find((item) => item.kind === detail.kind)
        drawHudPanel(ctx, vw - 122, 86 + TOWER_DEFINITIONS.length * 47 + 8, 108, 66)
        ctx.save()
        ctx.fillStyle = '#e2f8ff'
        ctx.font = '600 12px Inter, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`${def?.label ?? ''} Lv${detail.level}`, vw - 68, 86 + TOWER_DEFINITIONS.length * 47 + 28)
        ctx.restore()
        push({ id: 'fs-upgrade', x: vw - 118, y: 86 + TOWER_DEFINITIONS.length * 47 + 44, w: 100, h: 26, label: `${t('games.upgrade')} ◎${towerUpgradeCost(detail)}`, key: 'U' })
        push({ id: 'fs-sell', x: vw - 118, y: 86 + TOWER_DEFINITIONS.length * 47 + 74, w: 100, h: 26, label: t('games.sell'), key: 'X' })
      }
    }
    // ③ Swarm 升级三选一(levelup 时画布化,数字键 1/2/3 等价)
    if (isSurvival && survivalRef.current.phase === 'levelup' && survivalRef.current.offers.length > 0) {
      survivalRef.current.offers.forEach((id, i) => {
        const def = UPGRADES.find((upgrade) => upgrade.id === id)
        const x = vw / 2 - 292 + i * 196
        drawHudPanel(ctx, x, vh / 2 - 86, 184, 150)
        push({ id: `fs-offer-${i}`, x: x + 8, y: vh / 2 - 78, w: 168, h: 134, label: '', key: String(i + 1) })
        ctx.save()
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = '#e2f8ff'
        ctx.font = '600 14px Inter, sans-serif'
        ctx.fillText(t(`games.up.${id}`), x + 92, vh / 2 - 46)
        ctx.fillStyle = 'rgba(159, 183, 193, 0.95)'
        ctx.font = '500 11px Inter, sans-serif'
        wrapCanvasText(ctx, t(`games.up.${id}.desc`), x + 92, vh / 2 - 16, 160, 16)
        ctx.fillStyle = def ? RARITY_COLORS[def.rarity] : '#9fb7c1'
        ctx.font = '600 11px Inter, sans-serif'
        ctx.fillText(`${t('games.claim')} ${i + 1}`, x + 92, vh / 2 + 44)
        ctx.restore()
      })
    }
    // ④ 底部主按钮条(开始/下一波 + 重开)
    // R219.7②: 运行中(含 levelup/roulette 选择态)隐藏——用户:「游戏开始
    // 之后可以隐藏,游戏结束才能显示」;TD 的「下一波」是局中玩法按钮,保留。
    const phaseNow = currentPhaseRef.current()
    const showPrimaryBar = isTd || phaseNow === 'ready' || phaseNow === 'lost' || phaseNow === 'won'
    if (showPrimaryBar) {
      const primaryLabel = isTd && tdStateRef.current.phase === 'running' ? t('games.nextWave') : t('games.start')
      push({ id: 'fs-primary', x: vw / 2 - 162, y: vh - 58, w: 152, h: 40, label: primaryLabel, key: 'Enter' })
      push({ id: 'fs-restart', x: vw / 2 + 10, y: vh - 58, w: 152, h: 40, label: t('games.restart'), key: 'R' })
    }
    // R220.1⑪: fs 态死亡结算画布化——两 DOM 结算面板(swarm-summary/run-recap)
    // 在 fs 均隐藏,原 fs 死亡只有按钮条无任何战绩反馈(G6 P2)。
    if (isSurvival && survivalRef.current.phase === 'lost') {
      const s = survivalRef.current
      const cx = vw / 2
      drawHudPanel(ctx, cx - 170, vh / 2 - 92, 340, 168)
      ctx.save()
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#f9a8d4'
      ctx.font = '800 20px Inter, sans-serif'
      ctx.fillText(t('games.summaryTitle'), cx, vh / 2 - 60)
      ctx.fillStyle = '#e2f8ff'
      ctx.font = '700 15px Inter, sans-serif'
      ctx.fillText(`★ ${s.score}`, cx, vh / 2 - 30)
      ctx.fillStyle = 'rgba(159, 183, 193, 0.95)'
      ctx.font = '500 12px Inter, sans-serif'
      ctx.fillText(`${t('games.summaryKills')} ${s.kills} · ${t('games.summaryTime')} ${Math.floor(s.time)}s · ${t('games.summaryCombo')} ×${s.comboBest}`, cx, vh / 2 - 6)
      ctx.fillText(`LV ${s.level} · +${runCoinsFor(s.score, s.coinMult)} ${t('games.summaryCoins')}`, cx, vh / 2 + 16)
      ctx.fillStyle = 'rgba(159, 183, 193, 0.75)'
      ctx.font = '500 11px Inter, sans-serif'
      ctx.fillText(t('games.summaryAgain'), cx, vh / 2 + 44)
      ctx.restore()
    }
    // ⑤ 退出角标(3s 无操作自动隐藏)
    if (now - lastInputAtRef.current < 3000) drawExitBadge(ctx, `Esc · ${t('games.pause.title')}`)
  }
  const fsStatusLine1 = (): string => {
    if (isTd) {
      const state = tdStateRef.current
      return `${t('games.wave')} ${state.wave}${state.endless ? ' · ∞' : `/${MAX_WAVE}`} · ❤${state.lives} · ◎${state.coins}`
    }
    if (isSurvival) {
      const state = survivalRef.current
      return `HP ${state.player.hp}/${state.player.maxHp} · LV${state.level} · ${t('games.island').replace('{n}', String(state.island))}`
    }
    if (isSlash) {
      const state = slashRef.current
      return `${t('games.recap.score')} ${state.score} · ×${state.combo} · ${'♥'.repeat(Math.max(0, state.hearts))}`
    }
    const state = tetrisRef.current
    return `${t('games.recap.score')} ${state.score} · ${state.lines}L · LV${state.level}`
  }
  const fsStatusLine2 = (): string => {
    // R211: 用纯标签键(recap.score/best 等)——games.ariaScore 含 {value} 占位符不适合画布直绘
    if (isTd) return `${t('games.recap.score')} ${tdStateRef.current.score} · ${t('games.recap.best')} ${bestRef.current.td}`
    if (isSurvival) return `${t('games.recap.score')} ${survivalRef.current.score} · ${t('games.summaryKills')} ${survivalRef.current.kills}`
    if (isSlash) return `${t('games.recap.best')} ${bestRef.current.slash} · ${t('games.summaryCombo')} ${slashRef.current.bestCombo}`
    return `${t('games.recap.best')} ${bestRef.current.tetris}`
  }

  return (
    <div ref={screenRootRef} data-game={screen} className={`games-view games-screen ${fullscreen ? 'fs' : ''}${focusMode ? ' focus' : ''}${screenScale === 'large' ? ' size-large' : ''}${runActive ? ' running' : ''}`}>
      <header className="workspace-header games-header">
        <div>
          <p className="eyebrow">{t('games.eyebrow')}</p>
          <h2>{gameTitle}</h2>
        </div>
        <div className="games-header-actions">
          <button className="aspect-lock-btn" type="button" onClick={backToHub}>
            <ArrowLeft aria-hidden="true" size={13} />
            {t('games.backToHub')}
          </button>
          <button className="aspect-lock-btn" type="button" aria-label={t('games.bgmToggle')} title={t('games.bgmToggle')} onClick={toggleBgm}>
            <Music aria-hidden="true" size={13} />
            {bgmOn ? '' : '×'}
          </button>
          <button className="aspect-lock-btn" type="button" aria-label={t('games.sfxToggle')} title={t('games.sfxToggle')} onClick={toggleSfx}>
            {sfxOn ? <Volume2 aria-hidden="true" size={13} /> : <VolumeX aria-hidden="true" size={13} />}
          </button>
          {/* R207: 手势指示器临时呼出入口(设置页为主入口) */}
          <button
            className="aspect-lock-btn"
            type="button"
            data-action="vision-pad-toggle"
            aria-label={t('games.visionPad.toggle')}
            title={t('games.visionPad.toggle')}
            onClick={() => { const next = !visionPadVisible; setVisionPadVisible(next); writeVisionPadVisible(next) }}
          >
            {visionPadVisible ? <Eye aria-hidden="true" size={13} /> : <EyeOff aria-hidden="true" size={13} />}
          </button>
          {/* R131: vision gesture toggle — off by default; recalibrate while on */}
          <button
            className="aspect-lock-btn"
            type="button"
            aria-label={vision.enabled ? t('games.vision.disable') : t('games.vision.enable')}
            title={vision.enabled ? t('games.vision.disable') : t('games.vision.enable')}
            onClick={() => {
              if (vision.enabled) vision.disable()
              else void vision.enable().catch(() => undefined)
            }}
          >
            {vision.enabled ? <Eye aria-hidden="true" size={13} /> : <EyeOff aria-hidden="true" size={13} />}
            {t('games.vision.toggle')}
          </button>
          {vision.enabled ? (
            <button className="aspect-lock-btn" type="button" aria-label={t('games.vision.calibrate')} title={t('games.vision.calibrate')} onClick={vision.recalibrate}>
              <RotateCcw aria-hidden="true" size={13} />
            </button>
          ) : null}
          {/* R136: runtime mirror fix (reversed left/right) + latency/accuracy preset */}
          {vision.enabled ? (
            <button
              className="aspect-lock-btn"
              type="button"
              aria-label={t('games.vision.mirrorToggle')}
              title={t('games.vision.mirrorToggle')}
              onClick={() => vision.setMirror(!vision.mirror)}
            >
              ⇄ {vision.mirror ? t('games.vision.mirrorOn') : t('games.vision.mirrorOff')}
            </button>
          ) : null}
          {vision.enabled ? (
            <button
              className="aspect-lock-btn"
              type="button"
              aria-label={t('games.vision.sensitivity')}
              title={t('games.vision.sensitivity')}
              onClick={() => vision.setSensitivity(vision.sensitivity === 'standard' ? 'fast' : vision.sensitivity === 'fast' ? 'sport' : 'standard')}
            >
              ⚡ {t(`games.vision.sens.${vision.sensitivity}`)}
            </button>
          ) : null}
          {isTd ? (
            <button className="aspect-lock-btn" type="button" aria-label={t('games.speed')} title={t('games.speed')} onClick={() => setTdSpeed((speed) => (speed === 1 ? 2 : 1))}>
              <Zap aria-hidden="true" size={13} />
              {tdSpeed}×
            </button>
          ) : null}
          {/* R209: LAN 客端为远程席位——开波/重开由房主决定,客端控件禁用防死按钮
              (三期起仅 TD 快照合作禁用;tetris 对战双方跑本地引擎,客端可自行开局)
              R219.3: ready 态隐藏「开始/重新开始」——画布下方面板的大号开局按钮
              是唯一主 CTA(去「双开始」混排);lost 态仍显示便于一键再战。 */}
          {!showReady ? (
            <>
              <button className="aspect-lock-btn" type="button" onClick={startHandler} disabled={lanRole === 'guest' && lanGame === 'td'}>
                <Play size={13} />
                {isTd && tdSnapshot.wave > 0 ? t('games.nextWave') : t('games.start')}
              </button>
              <button className="aspect-lock-btn" type="button" onClick={restartHandler} disabled={lanRole === 'guest' && lanGame === 'td'}>
                <RotateCcw size={13} />
                {t('games.restart')}
              </button>
            </>
          ) : null}
          <button className="aspect-lock-btn" type="button" aria-label={t('games.fullscreen')} title={t('games.fullscreen')} onClick={toggleFullscreen}>
            {fullscreen ? <Minimize2 aria-hidden="true" size={13} /> : <Maximize2 aria-hidden="true" size={13} />}
            {fullscreen ? t('games.exitFullscreen') : t('games.fullscreen')}
          </button>
        </div>
      </header>

      <div className="games-stat-grid" role="list">
        <span role="listitem" aria-label={t('games.ariaStatus').replace('{value}', phaseLabel)} title={t('games.ariaStatus').replace('{value}', phaseLabel)}><Shield aria-hidden="true" size={15} />{phaseLabel}</span>
        {isTd ? (
          <span role="listitem" aria-label={t('games.ariaWave').replace('{current}', String(tdSnapshot.wave)).replace('{max}', String(MAX_WAVE))} title={t('games.ariaWave').replace('{current}', String(tdSnapshot.wave)).replace('{max}', String(MAX_WAVE))}><Zap aria-hidden="true" size={15} />{t('games.wave')} {tdSnapshot.wave}/{MAX_WAVE}</span>
        ) : isSurvival ? (
          <span role="listitem" aria-label={t('games.ariaWave').replace('{current}', String(survivalSnapshot.level)).replace('{max}', '∞')} title={t('games.ariaWave').replace('{current}', String(survivalSnapshot.level)).replace('{max}', '∞')}><Zap aria-hidden="true" size={15} />LV {survivalSnapshot.level}</span>
        ) : (
          <span role="listitem" aria-label={t('games.ariaWave').replace('{current}', String(tetrisSnapshot.level)).replace('{max}', '∞')} title={t('games.ariaWave').replace('{current}', String(tetrisSnapshot.level)).replace('{max}', '∞')}><Zap aria-hidden="true" size={15} />LV {tetrisSnapshot.level}</span>
        )}
        {isTd || isSurvival ? (
          <span role="listitem" aria-label={t('games.ariaLives').replace('{value}', String(isTd ? tdSnapshot.lives : survivalSnapshot.player.hp))} title={t('games.ariaLives').replace('{value}', String(isTd ? tdSnapshot.lives : survivalSnapshot.player.hp))}><Heart aria-hidden="true" size={15} />{isTd ? tdSnapshot.lives : survivalSnapshot.player.hp}</span>
        ) : null}
        <span role="listitem" aria-label={t('games.ariaCoins').replace('{value}', String(isTd ? tdSnapshot.coins : isSurvival ? survivalSnapshot.kills : tetrisSnapshot.lines))} title={t('games.ariaCoins').replace('{value}', String(isTd ? tdSnapshot.coins : isSurvival ? survivalSnapshot.kills : tetrisSnapshot.lines))}><span aria-hidden="true">{isTd ? '◎' : isSurvival ? '✕' : '≡'}</span> {isTd ? tdSnapshot.coins : isSurvival ? survivalSnapshot.kills : isSlash ? slashSnapshot.combo : tetrisSnapshot.lines}</span>
        <span role="listitem" aria-label={t('games.ariaScore').replace('{value}', String(isTd ? tdSnapshot.score : isSurvival ? survivalSnapshot.score : tetrisSnapshot.score))} title={t('games.ariaScore').replace('{value}', String(isTd ? tdSnapshot.score : isSurvival ? survivalSnapshot.score : tetrisSnapshot.score))}><span aria-hidden="true">★</span> {isTd ? tdSnapshot.score : isSurvival ? survivalSnapshot.score : isSlash ? slashSnapshot.score : tetrisSnapshot.score}</span>
        <span role="listitem" aria-label={t('games.ariaBest').replace('{value}', String(best))} title={t('games.ariaBest').replace('{value}', String(best))}><Trophy aria-hidden="true" size={15} />{best}</span>
      </div>

      {/* R200(FR-G06.5): 统一 run recap(结算面板,任意一局结束) */}
      {recap !== null ? (
        <div className="run-recap" data-field="run-recap" role="status">
          <div className="run-recap-score">
            <span>{t('games.recap.score')}</span>
            <strong>{recap.score}</strong>
          </div>
          {recap.deltaPct !== null ? (
            <span className={recap.deltaPct >= 0 ? 'run-recap-up' : 'run-recap-down'}>
              {recap.deltaPct >= 0 ? '+' : ''}{recap.deltaPct}% {t('games.recap.vsLast')}
            </span>
          ) : null}
          <span className="run-recap-best">★ {t('games.recap.best')} {recap.best}</span>
          {recap.highlight !== '' ? <span className="run-recap-highlight">{recap.highlight}</span> : null}
          <span className="run-recap-coach">{t(recap.coach as Parameters<typeof t>[0])}</span>
          <button
            type="button"
            className="coach-off-btn"
            onClick={() => setRecap(null)}
          >{t('games.recap.dismiss')}</button>
        </div>
      ) : null}

      {/* R198(FR-G01): 教练条 / 首局引导条(全屏画布化随 R206) */}
      {!coachOff && onboardStep > 0 ? (
        <div className="coach-bar onboard" data-field="coach-onboard">
          <span>{onboardStep}/3 · {t(`games.onboard.${screen}.${onboardStep}` as Parameters<typeof t>[0])}</span>
          <button
            type="button"
            className="coach-off-btn"
            onClick={() => { markOnboarded(localStorage, screen); setOnboardStep(0) }}
          >{t('games.onboard.skip')}</button>
        </div>
      ) : !coachOff && coachHint !== null && phase === 'running' ? (
        <div className={`coach-bar ${coachHint.tone}`} data-field="coach" role="status">
          <span>{t(`games.coach.${coachHint.key}` as Parameters<typeof t>[0])}</span>
          <button
            type="button"
            className="coach-off-btn"
            onClick={() => { setCoachOff(true); setCoachHint(null); try { localStorage.setItem('rgbbox:gamesCoach', '0') } catch { /* best-effort */ } }}
          >{t('games.coachBar.off')}</button>
        </div>
      ) : null}

      {isTd ? (
        <div className="td-ctl-row" data-field="td-ctl">
          <label className="td-endless-toggle" style={{ cursor: lanRole === 'guest' ? 'not-allowed' : 'pointer' }}>
            <input
              type="checkbox"
              data-setting="td-endless"
              checked={tdEndless}
              disabled={lanRole === 'guest'}
              onChange={(e) => { setTdEndless(e.target.checked); tdStateRef.current.endless = e.target.checked }}
            />
            <span>{t('games.td.endless')}</span>
          </label>
          {/* R218 U9: 进行态标题行隐藏——提前开波的入口从 header 按钮移到这里 */}
          {tdSnapshot.phase === 'running' && tdSnapshot.waveQueue === 0 && tdSnapshot.balloons.length === 0 && tdSnapshot.wave < MAX_WAVE ? (
            <button type="button" className="aspect-lock-btn" data-action="td-next-wave" onClick={startOrNextWave} disabled={lanRole === 'guest' && lanGame === 'td'}>
              <Play aria-hidden="true" size={12} />
              {t('games.nextWave')}
            </button>
          ) : null}
          <span className={tdStateRef.current.meteorCd > 0 ? 'td-meteor-cd' : 'td-meteor-ready'} title={t('games.td.meteorHint')}>
            ☄ {tdStateRef.current.meteorCd > 0 ? Math.ceil(tdStateRef.current.meteorCd) + 's' : t('games.td.meteorReady')} · Q
          </span>
          {tdCoopOn ? (
            /* R208 (FR-MP04): 分工合作——P1 鼠标建塔 / P2 Q 键陨石(输入天然分源,UI 明示) */
            <span className="td-affix-chip">{t('games.td.coop')}</span>
          ) : null}
          {lanRole === 'guest' ? (
            /* R209 (FR-LN04): LAN 远程席位提示 */
            <span className="td-affix-chip">{lanNotice ?? t('games.lan.cmdHint')}</span>
          ) : null}
          {lanRole === 'host' && lanPeersRef.current > 0 ? (
            <span className="td-affix-chip">LAN · {lanPeersRef.current}P</span>
          ) : null}
          {tdStateRef.current.affix !== null ? (
            <span className="td-affix-chip">{t(`games.td.affix.${tdStateRef.current.affix}` as Parameters<typeof t>[0])}</span>
          ) : null}
        </div>
      ) : null}

      <div className="games-layout">
        <section className="games-canvas-panel panel">
          <div className="games-canvas-wrap" ref={canvasWrapRef}>
            {/* R219.3: canvas 提为 wrap 首子(wrap 纵列 flex)——ready 面板静态化后
                自然排在画布下方;各浮层均为 absolute,绘制/命中映射零改动。 */}
            <canvas
              ref={canvasRef}
              className="games-canvas"
              onClick={handleUnifiedCanvasClick}
              onDoubleClick={() => {
                // R218 U9: 双击画布进入专注(TD 除外——双击会先落两座塔)
                if (!isTd && currentPhaseRef.current() === 'running') setFocusMode(true)
              }}
              onMouseMove={handleUnifiedCanvasMove}
              onMouseLeave={() => { hudHoverRef.current = null; tdHoverRef.current = null }}
              aria-label={`${gameTitle} game board`}
            />
            {/* R206(FR-G03.5): fs 暂停浮层(Esc 呼出;继续/重开/退出全屏/返回 hub) */}
            {/* R218 U3: ready 态统一信息架构(四作)——大号「开局」主按钮(Fitts)
                + 一行核心胶囊(难度四档×倍率 + 各作核心项) + 高级项折叠进
                「更多设置」抽屉(渐进披露;展开态 rgbbox:gamesReady:drawer 记忆)。
                上次选择全记忆 rgbbox:gamesReady:<game>,重进恢复(见 screen effect)。 */}
            {showReady ? (
              <div className="ready-panel" data-field="ready-panel">
                <button type="button" className="ready-start" data-action="ready-start" onClick={startHandler} disabled={lanRole === 'guest' && lanGame === 'td'}>
                  <Play aria-hidden="true" size={16} />
                  {t('games.start')}
                </button>
                <div className="ready-core">
                  <div className="ready-group" data-field="difficulty">
                    <span className="ready-group-label">{t('games.difficulty.label')}</span>
                    {GAME_DIFFICULTIES.map((d) => (
                      <button
                        key={d}
                        type="button"
                        className={`ready-chip ${difficulty === d ? 'on' : ''}`}
                        data-diff={d}
                        onClick={() => { setDifficulty(d); writeDifficulty(screen, d) }}
                      >{t(`games.difficulty.${d}`)}<em className="ready-chip-em">{DIFFICULTY_SCORE_MULT[d]}×</em></button>
                    ))}
                  </div>
                  {isSurvival ? (
                    <div className="ready-group" data-field="swarm-characters">
                      <span className="ready-group-label">{t('games.setupTitle')}</span>
                      {CHARACTERS.map((character) => (
                        <button
                          key={character.id}
                          type="button"
                          className={`ready-chip ${swarmCharacter === character.id ? 'on' : ''}`}
                          style={{ '--game-accent': character.accent } as CSSProperties}
                          title={t(`games.char.${character.id}.desc`)}
                          onClick={() => selectCharacter(character.id)}
                        >{t(`games.char.${character.id}`)}<em className="ready-chip-em">HP {SURVIVAL_DIFFICULTY_PARAMS[difficulty].hp + character.hpMod}</em></button>
                      ))}
                    </div>
                  ) : null}
                  {isSurvival ? (
                    <label className="ready-group">
                      <span className="ready-group-label">{t('games.swarm.players')}</span>
                      <select data-field="swarm-players" value={swarmPlayers} onChange={(e) => { const n = Number(e.target.value) as 1 | 2 | 3 | 4; setSwarmPlayers(n); persistReadyPref('survival', { players: n }) }}>
                        {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}P</option>)}
                      </select>
                    </label>
                  ) : null}
                  {isSurvival ? (
                    <label className="ready-group">
                      <span className="ready-group-label">{t('games.swarm.scene')}</span>
                      <select data-field="swarm-scene" value={swarmScene} onChange={(e) => { const s = e.target.value as SwarmSceneId; setSwarmScene(s); persistReadyPref('survival', { scene: s }) }}>
                        {(['station', 'desert', 'snow', 'grass', 'ocean', 'fusion'] as const).map((s) => (
                          <option key={s} value={s}>{t(`games.scene.${s}` as Parameters<typeof t>[0])}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {isTd ? (
                    <div className="ready-group">
                      <span className="ready-group-label">{t('games.td.endless')}</span>
                      <button type="button" className={`ready-chip ${tdEndless ? 'on' : ''}`} data-field="td-endless-toggle" onClick={() => { const next = !tdEndless; setTdEndless(next); tdStateRef.current.endless = next; persistReadyPref('td', { endless: next }) }}>{tdEndless ? '✓' : '—'}</button>
                    </div>
                  ) : null}
                </div>
                {/* R218 U2: 手柄在场提示——任意已分配手柄 Start 开局/运行态暂停 */}
                <div className="pad-hint-row" data-field="pad-hint">
                  {gamepadInfo.count > 0 ? (
                    <span>
                      🎮 {t('games.pad.hint').replace('{n}', String(gamepadInfo.count))}
                      {gamepadInfo.ids.length > 0 ? <small> · {gamepadInfo.ids.map((id) => id.length > 22 ? `${id.slice(0, 22)}…` : id).join(' · ')}</small> : null}
                    </span>
                  ) : (
                    <span>{t('games.pad.none')}</span>
                  )}
                </div>
                {/* R218 U7: ≥2P 键位席位摘要(每玩家方向键 + 分得的手柄) */}
                {readySeating.length > 0 ? (
                  <div className="ready-seating" data-field="ready-seating">
                    {readySeating.map((row) => (
                      <span key={row.n}><b>P{row.n}</b> {row.keys}{row.padId !== null ? <small> 🎮 {row.padId.length > 20 ? `${row.padId.slice(0, 20)}…` : row.padId}</small> : null}</span>
                    ))}
                  </div>
                ) : null}
                <details className="ready-drawer" data-field="ready-drawer" open={drawerOpen} onToggle={(e) => { const next = e.currentTarget.open; setDrawerOpen(next); writeDrawerOpen(next) }}>
                  <summary>{t('games.ready.more')}</summary>
                  <div className="ready-drawer-body">
                    <div className="ready-drawer-grid">
                      {/* R218 U9: 「画面大小」三档——标准/大(隐藏侧栏占比 ~95%)/专注(开局自动满幅) */}
                      <div className="ready-group" data-field="screen-scale">
                        <span className="ready-group-label">{t('games.screenSize.label')}</span>
                        {(['standard', 'large', 'focus'] as const).map((scale) => (
                          <button key={scale} type="button" className={`ready-chip ${screenScale === scale ? 'on' : ''}`} data-scale={scale} onClick={() => { setScreenScale(scale); writeScreenScale(scale) }}>{t(`games.screenSize.${scale}`)}</button>
                        ))}
                      </div>
                      <button type="button" className={`ready-chip ${bgmOn ? 'on' : ''}`} data-field="bgm-toggle" onClick={toggleBgm}>{t('games.bgmToggle')}</button>
                      {/* R205 尾款(FR-G08): 短局矩阵开关(引擎层已随 T1 合入) */}
                      {isTd ? (
                        <button type="button" className={`ready-chip ${tdBlitzOn ? 'on' : ''}`} data-field="td-blitz-toggle" onClick={() => { const next = !tdBlitzOn; setTdBlitzOn(next); persistReadyPref('td', { blitz: next }) }}>{t('games.short.blitz')}</button>
                      ) : null}
                      {isTd ? (
                        <button type="button" className={`ready-chip ${tdCoopOn ? 'on' : ''}`} data-field="coop-toggle" onClick={() => { const next = !tdCoopOn; setTdCoopOn(next); persistReadyPref('td', { coop: next }) }}>{t('games.duel.coopToggle')}</button>
                      ) : null}
                      {isSurvival ? (
                        <button type="button" className={`ready-chip ${swarmSprintOn ? 'on' : ''}`} data-field="swarm-sprint-toggle" onClick={() => { const next = !swarmSprintOn; setSwarmSprintOn(next); persistReadyPref('survival', { sprint: next }) }}>{t('games.short.sprint')}</button>
                      ) : null}
                      {isSurvival ? (
                        <button type="button" className={`ready-chip ${swarmDailyOn ? 'on' : ''}`} data-field="swarm-daily-toggle" onClick={() => { const next = !swarmDailyOn; setSwarmDailyOn(next); persistReadyPref('survival', { daily: next }) }}>{t('games.daily.run')}</button>
                      ) : null}
                      {isTetris ? (
                        <button type="button" className={`ready-chip ${tetrisRaceOn ? 'on' : ''}`} data-field="tetris-race-toggle" onClick={() => { const next = !tetrisRaceOn; setTetrisRaceOn(next); persistReadyPref('tetris', { race: next }) }}>{t('games.short.race')}</button>
                      ) : null}
                      {isTetris ? (
                        <button type="button" className={`ready-chip ${tetrisDuelOn ? 'on' : ''}`} data-field="tetris-duel-toggle" onClick={() => { const next = !tetrisDuelOn; setTetrisDuelOn(next); persistReadyPref('tetris', { duel: next }) }}>{t('games.duel.toggle')}</button>
                      ) : null}
                      {isSlash ? (
                        <button type="button" className={`ready-chip ${slashBurstOn ? 'on' : ''}`} data-field="slash-burst-toggle" onClick={() => { const next = !slashBurstOn; setSlashBurstOn(next); persistReadyPref('slash', { burst: next }) }}>{t('games.short.burst')}</button>
                      ) : null}
                      {isSlash ? (
                        <button type="button" className={`ready-chip ${slashDuelOn ? 'on' : ''}`} data-field="duel-toggle" onClick={() => { const next = !slashDuelOn; setSlashDuelOn(next); persistReadyPref('slash', { duel: next }) }}>{t('games.duel.toggle')}</button>
                      ) : null}
                      {/* R213: 输入配置中心(P1-P4 键位自定义+手柄绑定) */}
                      <button type="button" className="ready-chip" data-field="input-config-open" onClick={() => setInputPanelOpen(true)}>{t('games.input.title')}</button>
                      {isSurvival ? (
                        <label className="ready-group">
                          <span className="ready-group-label">{t('games.swarm.autoPick')}</span>
                          <select data-field="swarm-autopick" value={autoPickMode} onChange={(e) => { const m = e.target.value as 'off' | 'list' | 'best'; setAutoPickMode(m); try { localStorage.setItem('rgbbox:swarmAutoPick', JSON.stringify(m)) } catch { /* best-effort */ } }}>
                            <option value="off">{t('games.swarm.autoPick.off')}</option>
                            <option value="list">{t('games.swarm.autoPick.list')}</option>
                            <option value="best">{t('games.swarm.autoPick.best')}</option>
                          </select>
                        </label>
                      ) : null}
                    </div>
                    {/* R213: 头像行(每玩家一张;画布上替代默认飞船贴图) */}
                    {isSurvival ? (
                      <div className="swarm-avatars" data-field="swarm-avatars">
                        {Array.from({ length: swarmPlayers }, (_, i) => (
                          <AvatarPicker key={i + 1} slot={i + 1} label={`P${i + 1}`} onSet={() => { void refreshAvatars() }} />
                        ))}
                      </div>
                    ) : null}
                    {isSurvival ? (
                      <div className="artifact-bar" data-field="swarm-artifacts">
                        {ARTIFACTS.map((artifact) => {
                          const unlocked = isArtifactUnlocked(artifact, meta.stats)
                          const on = unlocked && !!meta.artifacts[artifact.id]
                          return (
                            <button
                              key={artifact.id}
                              type="button"
                              className={`artifact-chip ${on ? 'on' : ''} ${unlocked ? '' : 'locked'}`}
                              disabled={!unlocked}
                              onClick={() => toggleArtifact(artifact.id)}
                              title={unlocked ? t(`games.art.${artifact.id}.desc`) : t(`games.art.${artifact.id}.lock`)}
                            >
                              <span>{unlocked ? t(`games.art.${artifact.id}`) : t(`games.art.${artifact.id}.lock`)}</span>
                              <em>{artifact.mult >= 0 ? '+' : ''}{artifact.mult.toFixed(2)}×</em>
                            </button>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
                </details>
                <p className="ready-hint">{isSurvival ? (swarmPlayers >= 2 ? t('games.swarm.coopHint') : t('games.setupHint')) : isTd ? t('games.td.readySubtitle') : isTetris ? t('games.tetrisHint') : t('games.slashHint')}</p>
              </div>
            ) : null}
            {/* R209 三期(FR-LN05): LAN Tetris 对战——比分互显面板(任一方结算
                即出现,双方分齐后可比对;断线提示复用同一面板) */}
            {isTetris && lanTetrisScore !== null ? (
              <div className="duel-panel" data-field="lan-tetris-result">
                <p className="duel-title">{t('games.lan.resultTitle')}</p>
                <p className="duel-scores">{t('games.lan.me')} {lanTetrisScore.mine ?? '…'} · {t('games.lan.peer')} {lanTetrisScore.theirs ?? '…'}</p>
                {lanNotice !== null ? <p className="duel-title">{lanNotice}</p> : null}
              </div>
            ) : isTetris && lanNotice !== null ? (
              <div className="duel-panel" data-field="lan-tetris-result">
                <p className="duel-title">{lanNotice}</p>
              </div>
            ) : null}
            {/* R208 (FR-MP03): 轮换对决——回合提示 / 对照结算(P2 回合待开始,或双局已完) */}
            {isSlash && duel !== null && duel.done ? (
              <div className="duel-panel" data-field="duel-panel">
                {duel.turn === 1 ? (
                  <>
                    <p className="duel-title">{t('games.duel.turnReady').replace('{n}', '2')}</p>
                    <button type="button" className="video-btn" data-action="duel-next" onClick={() => { const next = { turn: 2 as const, scores: duel.scores, done: false }; duelRef.current = next; setDuel(next); startSlashRunCb() }}>{t('games.start')}</button>
                  </>
                ) : (
                  <>
                    <p className="duel-title">{t('games.duel.result')}</p>
                    <p className="duel-scores">P1 {duel.scores[0]} · P2 {duel.scores[1]}</p>
                    <p className="duel-verdict">{judgeDuel(duel.scores) === 'tie' ? t('games.duel.tie') : t('games.duel.wins').replace('{n}', judgeDuel(duel.scores) === 'p1' ? '1' : '2')}</p>
                    <div className="fs-pause-actions">
                      <button type="button" className="video-btn" data-action="duel-again" onClick={() => { const fresh = { turn: 1 as const, scores: [null, null] as [number | null, number | null], done: false }; duelRef.current = fresh; setDuel(fresh); startSlashRunCb() }}>{t('games.duel.again')}</button>
                      <button type="button" className="video-btn" data-action="duel-close" onClick={() => setDuel(null)}>{t('games.recap.dismiss')}</button>
                    </div>
                  </>
                )}
              </div>
            ) : null}
            {fsPaused ? (
              <div className="fs-pause-overlay" data-field="fs-pause" role="alertdialog" aria-label={t('games.pause.title')}>
                <p>{t('games.pause.title')}</p>
                <div className="fs-pause-actions">
                  <button type="button" className="video-btn" data-action="fs-resume" onClick={() => setFsPaused(false)}>{t('games.pause.resume')}</button>
                  <button type="button" className="video-btn" data-action="fs-restart" onClick={() => { if (restartHandler) restartHandler(); setFsPaused(false) }} disabled={!restartHandler}>{t('games.pause.restart')}</button>
                  {/* R219.2: 运行态 header 被 .running 隐藏,OS 级全屏入口只剩这里——
                      非 fs 暂停浮层补「全屏」按钮(用户报「游戏中点不到全屏」)。 */}
                  {!fullscreen ? (
                    <button type="button" className="video-btn" data-action="fs-enter" onClick={() => { setFsPaused(false); toggleFullscreen() }}>{t('games.fullscreen')}</button>
                  ) : null}
                  {/* R218 U2: 非 fs 态也可暂停(手柄 Start/Esc)——「退出全屏」仅 fs 态显示 */}
                  {fullscreen ? (
                    <button type="button" className="video-btn" data-action="fs-exit" onClick={() => { setFsPaused(false); setFullscreen(false); if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined) }}>{t('games.pause.exitFs')}</button>
                  ) : null}
                  <button type="button" className="video-btn" data-action="fs-hub" onClick={() => { setFsPaused(false); setFullscreen(false); if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined); backToHub() }}>{t('games.pause.hub')}</button>
                </div>
              </div>
            ) : null}
            {/* R213: 输入配置中心(P1-P4 键位自定义+手柄绑定) */}
            {inputPanelOpen ? (
              <InputConfigPanel onClose={() => setInputPanelOpen(false)} onApply={applyInputConfigs} />
            ) : null}
            {/* R218 U9: 专注模式半透明退出角标(Esc / 点击退出) */}
            {focusMode ? (
              <button type="button" className="focus-exit-badge" data-action="focus-exit" onClick={() => setFocusMode(false)}>
                Esc · {t('games.focus.exit')}
              </button>
            ) : null}
            {!isTd && survivalSnapshot.phase === 'levelup' && survivalSnapshot.offers.length > 0 ? (
              <div className="levelup-overlay">
                <p>{t('games.levelupTitle')}</p>
                <div className="levelup-cards">
                  {survivalSnapshot.offers.map((id) => {
                    const def = UPGRADES.find((upgrade) => upgrade.id === id)
                    const takenCount = survivalSnapshot.taken[id] ?? 0
                    return (
                      <button className={`levelup-card${autoPickChoice === id ? ' autopick' : ''}`} type="button" key={id} style={{ '--game-accent': RARITY_COLORS[def?.rarity ?? 0] } as CSSProperties} onClick={() => chooseUpgrade(id)}>
                        <strong>{t(`games.up.${id}`)}</strong>
                        <small>{t(`games.up.${id}.desc`)}</small>
                        <em>{takenCount}/{def?.max ?? 0}</em>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}
            {/* R218 U3: survival 的旧 swarm-setup ready 面板已并入上方统一 ready-panel
                (战机/人数/场景=核心行;artifact/头像/自动预选/输入配置=抽屉)。 */}
            {isSurvival && survivalSnapshot.phase === 'roulette' ? (
              <div className="swarm-roulette">
                {roulette.stage === 'pick' ? (
                  <>
                    <p>{t('games.roulettePick')}</p>
                    {vision.enabled ? <p className="vision-roulette-hint">{t('games.vision.rouletteHint')}</p> : null}
                    <div className="roulette-wheels">
                      <button type="button" className={rouletteFocus === 0 ? 'vision-focus' : undefined} onClick={() => spinRoulette('item')}>
                        <strong>{t('games.wheelItem')}</strong>
                        <small>{t('games.wheelItem.desc')}</small>
                      </button>
                      <button type="button" className={rouletteFocus === 1 ? 'vision-focus' : undefined} onClick={() => spinRoulette('stat')}>
                        <strong>{t('games.wheelStat')}</strong>
                        <small>{t('games.wheelStat.desc')}</small>
                      </button>
                    </div>
                  </>
                ) : roulette.stage === 'spin' ? (
                  <div className="roulette-disc spinning" aria-label={t('games.rouletteSpinning')}>?</div>
                ) : roulette.result ? (
                  <div className="roulette-result" style={{ '--game-accent': RARITY_COLORS[roulette.result.rarity] } as CSSProperties}>
                    <span>{t(`games.rarity.${roulette.result.rarity}`)}</span>
                    <strong>
                      {roulette.result.kind === 'item'
                        ? t('games.rouletteItemResult').replace('{name}', t(`games.up.${roulette.result.upgradeId}`)).replace('{levels}', String(roulette.result.levels))
                        : t('games.rouletteStatResult').replace('{stat}', t(`games.stat.${roulette.result.stat}`)).replace('{pct}', String(roulette.result.pct))}
                    </strong>
                    <div className="roulette-actions">
                      <button type="button" className={rouletteFocus === 0 ? 'vision-focus' : undefined} onClick={claimRoulette}>{t('games.claim')}</button>
                      <button type="button" className={rouletteFocus === 1 ? 'vision-focus' : undefined} onClick={dissolveCurrentRoulette}>{t('games.dissolve').replace('{xp}', String(roulette.result.xpValue))}</button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            {isSurvival && survivalSnapshot.phase === 'lost' ? (
              <div className="swarm-summary">
                <p className="swarm-summary-title">{t('games.summaryTitle')}</p>
                <div className="swarm-summary-rows">
                  <span>★ {survivalSnapshot.score}</span>
                  <span>{t('games.summaryKills')} {survivalSnapshot.kills}</span>
                  <span>{t('games.summaryTime')} {Math.floor(survivalSnapshot.time)}s</span>
                  <span>{t('games.summaryCombo')} ×{survivalSnapshot.comboBest}</span>
                  <span>{t('games.summaryCoins')} +{runCoinsFor(survivalSnapshot.score, survivalSnapshot.coinMult)}</span>
                </div>
                <div className="swarm-summary-build">
                  {Object.entries(survivalSnapshot.taken).filter(([, level]) => level > 0).map(([id, level]) => (
                    <em key={id} style={{ borderColor: RARITY_COLORS[UPGRADES.find((upgrade) => upgrade.id === (id as UpgradeId))?.rarity ?? 0] }}>{t(`games.up.${id as UpgradeId}`)} {level}</em>
                  ))}
                </div>
                <p className="swarm-setup-hint">{t('games.summaryAgain')}</p>
              </div>
            ) : null}
            {isSurvival && survivalSnapshot.phase === 'running' && survivalSnapshot.pendingSpins > 0 ? (
              <button type="button" className="spin-fab" onClick={beginRoulette}>{t('games.spinFab').replace('{n}', String(survivalSnapshot.pendingSpins))}</button>
            ) : null}
            {isSurvival && newAchievements.length > 0 ? (
              <div className="ach-toast">🏆 {newAchievements.map((id) => t(`games.ach.${id as AchievementId}`)).join(' · ')}</div>
            ) : null}
            {/* R136.2: immediate status banner — instant publish, progress via rAF */}
            {vision.enabled ? <VisionBanner vision={vision} /> : null}
            {/* R132.2: joystick + skeleton overlay — own rAF, reads frameRef directly */}
            {vision.enabled && visionPadVisible ? <VisionPad vision={vision} /> : null}
            {/* R142-L3: relative cursor overlay — hover highlight + pinch click */}
            {vision.enabled && vision.state === 'active' ? <VisionCursor vision={vision} wrapRef={canvasWrapRef} stateRef={visionCursorRef} /> : null}
          </div>
          <div className="games-canvas-status">
            {/* R218 U9: 专注模式开关(窗口内满幅;与 OS 级 fs 全屏正交) */}
            <button
              type="button"
              className="aspect-lock-btn focus-toggle-btn"
              data-action="focus-toggle"
              aria-label={t('games.focus.toggle')}
              title={t('games.focus.toggle')}
              onClick={() => setFocusMode((v) => !v)}
            >
              {focusMode ? <Minimize2 aria-hidden="true" size={12} /> : <Maximize2 aria-hidden="true" size={12} />}
            </button>
            <span>
              {isTd
                ? `${t('games.wave')} ${tdSnapshot.wave}/${MAX_WAVE}${tdSnapshot.phase === 'running' && tdSnapshot.waveQueue + tdSnapshot.balloons.length > 0 ? ` · ${t('games.balloonsLeft').replace('{value}', String(tdSnapshot.waveQueue + tdSnapshot.balloons.length))}` : ''}`
                : isSurvival ? `${t('games.swarmHint')} · ${t('games.island').replace('{n}', String(survivalSnapshot.island))}${swarmPlayers >= 2 ? ` · ${swarmPlayers}P` : ''}${gamepadName ? ` · 🎮 ${gamepadName}` : ''}${visionSuffix}` : isSlash ? `${t('games.slashHint')}${visionSuffix}` : `${t('games.tetrisHint')}${visionSuffix}`}
            </span>
            <span>
              {isTd && tdSnapshot.phase === 'running' && tdSnapshot.waveQueue === 0 && tdSnapshot.balloons.length === 0 && tdSnapshot.wave < MAX_WAVE
                ? `${t('games.nextIn').replace('{seconds}', String(Math.ceil(Math.max(0, tdSnapshot.waveCooldown))))} · ${t('games.earlyBonus').replace('{bonus}', String(Math.max(0, Math.round(tdSnapshot.waveCooldown * 4))))}`
                : phaseLabel}
            </span>
          </div>
        </section>
        <aside className="games-control-panel panel">
          {isTd ? (
            <>
              <h3>{t('games.towers')}</h3>
              <p className="games-help">{t('games.help')}</p>
              <div className="tower-card-list">
                {TOWER_DEFINITIONS.map((tower) => (
                  <button className={`tower-card ${selectedTower === tower.kind ? 'selected' : ''}`} key={tower.kind} type="button" onClick={() => setSelectedTower(tower.kind)}>
                    <span className="tower-orb" style={{ background: tower.color }}><Crosshair aria-hidden="true" size={15} /></span>
                    <span><strong>{tower.label}</strong><small>{tower.description}</small></span>
                    <b>◎{tower.cost}</b>
                  </button>
                ))}
              </div>
              {(() => {
                const detail = tdSnapshot.towers.find((tower) => tower.id === selectedTowerId)
                if (!detail) return null
                return (
                  <div className="tower-detail">
                    <div className="tower-detail-head">
                      <strong>{TOWER_DEFINITIONS.find((item) => item.kind === detail.kind)?.label}</strong>
                      <span>Lv{detail.level}</span>
                    </div>
                    <div className="tower-stats">
                      <span>{t('games.statDamage')}<b>{detail.damage}</b></span>
                      <span>{t('games.statRange')}<b>{detail.range}</b></span>
                      <span>{t('games.statRate')}<b>{(1 / detail.fireRate).toFixed(1)}/s</b></span>
                    </div>
                    <div className="tower-detail-actions">
                      {detail.level >= TOWER_MAX_LEVEL ? (
                        <button className="aspect-lock-btn" type="button" disabled>{t('games.maxLevel')}</button>
                      ) : (
                        <button className="aspect-lock-btn" type="button" disabled={tdSnapshot.coins < towerUpgradeCost(detail)} onClick={upgradeSelected}>
                          {t('games.upgrade')} ◎{towerUpgradeCost(detail)}
                        </button>
                      )}
                      <button className="aspect-lock-btn" type="button" onClick={sellSelected}>
                        {t('games.sell')} +◎{Math.round(detail.spent * SELL_REFUND)}
                      </button>
                    </div>
                  </div>
                )
              })()}
              <div className="games-rules">
                <strong>{t('games.rulesTitle')}</strong>
                <ul>
                  <li>{t('games.rulePlace')}</li>
                  <li>{t('games.ruleEarn')}</li>
                  <li>{t('games.ruleWin')}</li>
                </ul>
              </div>
            </>
          ) : isSurvival ? (
            <>
              <button className="aspect-lock-btn" type="button" onClick={() => setShowCodex(true)}>
                📚 {t('games.codexTitle')}
              </button>
              <div className="games-rules">
                <strong>{t('games.controlsTitle')}</strong>
                <p>{t('games.swarmControls')}</p>
                <strong>{t('games.rulesTitle')}</strong>
                <ul>
                  <li>{t('games.swarmRule1')}</li>
                  <li>{t('games.swarmRule2')}</li>
                  <li>{t('games.swarmRule3')}</li>
                </ul>
                <p className="games-help">{t('games.swarmRule4')}</p>
              </div>
              <div className="swarm-panel">
                <strong>{t('games.invTitle')}</strong>
                {Object.entries(survivalSnapshot.taken).filter(([, level]) => level > 0).length === 0 ? (
                  <small className="games-help">{t('games.invEmpty')}</small>
                ) : (
                  <ul className="swarm-inv">
                    {Object.entries(survivalSnapshot.taken).filter(([, level]) => level > 0).map(([id, level]) => {
                      const upgradeId = id as UpgradeId
                      const def = UPGRADES.find((upgrade) => upgrade.id === upgradeId)
                      return (
                        <li key={id}>
                          <span className="rarity-dot" style={{ background: RARITY_COLORS[def?.rarity ?? 0] }} />
                          {t(`games.up.${upgradeId}`)}
                          <em>Lv{level}/{def?.max ?? 0}</em>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
              <div className="swarm-panel swarm-shop">
                <strong>{t('games.shopTitle')}</strong>
                <span className="swarm-coins">◎ {meta.coins}</span>
                {PERM_UPGRADES.map((def) => {
                  const level = meta.perm[def.key]
                  const cost = permCost(def, level)
                  return (
                    <div className="shop-row" key={def.key}>
                      <span className="shop-copy">
                        {t(`games.perm.${def.key}`)}
                        <small>{t(`games.perm.${def.key}.desc`)}</small>
                        <span className="shop-pips">{'●'.repeat(level)}{'○'.repeat(PERM_MAX - level)}</span>
                      </span>
                      {level >= PERM_MAX ? (
                        <b className="shop-max">{t('games.maxedShort')}</b>
                      ) : (
                        <button className="aspect-lock-btn" type="button" disabled={meta.coins < cost} onClick={() => buyPermanent(def.key)}>
                          {t('games.buy').replace('{cost}', String(cost))}
                        </button>
                      )}
                    </div>
                  )
                })}
                <small className="games-help">{t('games.shopHint')}</small>
              </div>
              <div className="swarm-panel">
                <strong>{t('games.achTitle')} {ACHIEVEMENTS.filter((achievement) => meta.achievements[achievement.id]).length}/{ACHIEVEMENTS.length}</strong>
                <ul className="ach-list">
                  {ACHIEVEMENTS.map((achievement) => {
                    const done = !!meta.achievements[achievement.id]
                    return (
                      <li key={achievement.id} className={done ? 'done' : ''}>
                        <span aria-hidden="true">{done ? '🏆' : '🔒'}</span>
                        {t(`games.ach.${achievement.id}`)}
                        {!done ? <em>{t(`games.ach.${achievement.id}.cond`)}</em> : null}
                      </li>
                    )
                  })}
                </ul>
              </div>
            </>
          ) : (
            <div className="games-rules">
              <strong>{t('games.controlsTitle')}</strong>
              <p>{isSlash ? t('games.slashControls') : t('games.tetrisControls')}</p>
              <strong>{t('games.rulesTitle')}</strong>
              {isSlash ? (
                <ul>
                  <li>{t('games.slashRule1')}</li>
                  <li>{t('games.slashRule2')}</li>
                </ul>
              ) : (
                <>
                  <ul>
                    <li>{t('games.tetrisRule1')}</li>
                    <li>{t('games.tetrisRule2')}</li>
                    <li>{t('games.tetrisRule3')}</li>
                  </ul>
                  <p className="games-help">{t('games.tetrisRule4')}</p>
                </>
              )}
            </div>
          )}
        </aside>
      </div>
      {isSurvival && showCodex ? (
        <div className="codex-overlay">
          <div className="codex-inner">
            <header className="codex-head">
              <strong>{t('games.codexTitle')}</strong>
              <button className="aspect-lock-btn" type="button" onClick={() => setShowCodex(false)}>{t('games.codexClose')}</button>
            </header>
            <p className="codex-section">{t('games.codexChars')}</p>
            <div className="codex-grid">
              {CHARACTERS.map((character) => (
                <div className="codex-entry" key={character.id} style={{ '--game-accent': character.accent } as CSSProperties}>
                  <strong>{t(`games.char.${character.id}`)}</strong>
                  <small>{t(`games.codex.char.${character.id}.lore`)}</small>
                </div>
              ))}
            </div>
            <p className="codex-section">{t('games.codexEnemies')}</p>
            <div className="codex-grid">
              {/* R220.5: 补 R218 敌矩阵 5 新种(tank/swarm/shooter/splitter/healer),图鉴教学不再缺位 */}
              {(['chaser', 'sprinter', 'brute', 'elite', 'boss', 'tank', 'swarm', 'shooter', 'splitter', 'healer'] as const).map((kind) => (
                <div className="codex-entry" key={kind} style={{ '--game-accent': { chaser: '#fb7185', sprinter: '#fbbf24', brute: '#f472b6', elite: '#fde68a', boss: '#db2777', tank: '#7c8da4', swarm: '#a3e635', shooter: '#c084fc', splitter: '#fb923c', healer: '#f87171' }[kind] } as CSSProperties}>
                  <strong>{t(`games.codex.enemy.${kind}`)}</strong>
                  <small>{t(`games.codex.enemy.${kind}.lore`)}</small>
                </div>
              ))}
            </div>
            <p className="codex-section">{t('games.codexUpgrades')}</p>
            <div className="codex-grid">
              {UPGRADES.map((upgrade) => (
                <div className="codex-entry" key={upgrade.id} style={{ '--game-accent': RARITY_COLORS[upgrade.rarity] } as CSSProperties}>
                  <strong>{t(`games.up.${upgrade.id}`)}</strong>
                  <small>{t(`games.up.${upgrade.id}.desc`)}</small>
                </div>
              ))}
            </div>
            <p className="codex-section">{t('games.codexArtifacts')}</p>
            <div className="codex-grid">
              {ARTIFACTS.map((artifact) => (
                <div className="codex-entry" key={artifact.id} style={{ '--game-accent': artifact.mult >= 0 ? '#fde68a' : '#9aa5ad' } as CSSProperties}>
                  <strong>{t(`games.art.${artifact.id}`)}</strong>
                  <small>{t(`games.art.${artifact.id}.desc`)}</small>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
