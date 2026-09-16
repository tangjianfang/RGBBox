import { ArrowLeft, Crosshair, Grid, Heart, Maximize2, Minimize2, Music, Play, RotateCcw, Shield, Trophy, Volume2, VolumeX, Zap } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type JSX, type MouseEvent } from 'react'
import { useI18n } from '../i18n'
import {
  HEIGHT,
  MAX_WAVE,
  SELL_REFUND,
  TOWER_DEFINITIONS,
  TOWER_MAX_LEVEL,
  WIDTH,
  addText,
  distanceToPath,
  drawGame,
  initialState,
  launchWave,
  sellTower,
  spawnBurst,
  tickGame,
  towerUpgradeCost,
  upgradeTower,
  type GameState,
  type TowerKind,
} from '../games/td'
import {
  UPGRADES,
  applyRouletteResult,
  applyUpgrade,
  dissolveRoulette,
  drawSurvival,
  initialSurvivalState,
  openRoulette,
  startSurvival,
  tickSurvival,
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
import { isBgmEnabled, isSfxEnabled, playSfx, setBgmEnabled, setSfxEnabled, startBgm, stopBgm } from '../games/sfx'
import {
  drawTetris,
  initialTetrisState,
  startTetris,
  tickTetris,
  type TetrisState,
} from '../games/tetris'

type Screen = 'hub' | 'td' | 'survival' | 'tetris'
type GameKey = 'td' | 'survival' | 'tetris'

const BEST_KEYS: Record<GameKey, string> = {
  td: 'rgbbox:gamesBest:balloon',
  survival: 'rgbbox:gamesBest:survival',
  tetris: 'rgbbox:gamesBest:tetris',
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

export function MiniGamesView(): JSX.Element {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const tdStateRef = useRef<GameState>(initialState())
  const survivalRef = useRef<SurvivalState>(initialSurvivalState())
  const tetrisRef = useRef<TetrisState>(initialTetrisState())
  const bestRef = useRef<Record<GameKey, number>>({ td: readBest('td'), survival: readBest('survival'), tetris: readBest('tetris') })
  const [screen, setScreen] = useState<Screen>('hub')
  const [fullscreen, setFullscreen] = useState(false)
  const [sfxOn, setSfxOn] = useState(() => isSfxEnabled())
  const [selectedTower, setSelectedTower] = useState<TowerKind>('dart')
  const [selectedTowerId, setSelectedTowerId] = useState<number | null>(null)
  const [tdSpeed, setTdSpeed] = useState<1 | 2>(1)
  const [bests, setBests] = useState<Record<GameKey, number>>({ ...bestRef.current })
  const [tdSnapshot, setTdSnapshot] = useState<GameState>(() => ({ ...tdStateRef.current }))
  const [survivalSnapshot, setSurvivalSnapshot] = useState<SurvivalState>(() => ({ ...survivalRef.current, keys: new Set() }))
  const [tetrisSnapshot, setTetrisSnapshot] = useState<TetrisState>(() => ({ ...tetrisRef.current, keys: new Set() }))
  const [swarmCharacter, setSwarmCharacter] = useState<CharacterId>(() => readCharacter())
  const [meta, setMeta] = useState<SwarmMeta>(() => readMeta())
  const [roulette, setRoulette] = useState<{ stage: 'pick' | 'spin' | 'result'; result?: RouletteResult }>({ stage: 'pick' })
  const [gamepadName, setGamepadName] = useState<string | null>(null)
  const [bgmOn, setBgmOn] = useState(() => isBgmEnabled())
  const [newAchievements, setNewAchievements] = useState<string[]>([])
  const [showCodex, setShowCodex] = useState(false)
  const metaRef = useRef<SwarmMeta>(meta)
  metaRef.current = meta
  const screenRootRef = useRef<HTMLDivElement | null>(null)
  const gamepadNameRef = useRef<string | null>(null)
  const prevStartRef = useRef(false)
  const startRunRef = useRef<() => void>(() => undefined)

  const publishTd = useCallback(() => {
    setTdSnapshot({ ...tdStateRef.current, towers: [...tdStateRef.current.towers], balloons: [...tdStateRef.current.balloons], projectiles: [...tdStateRef.current.projectiles] })
  }, [])

  const publishSurvival = useCallback(() => {
    setSurvivalSnapshot({ ...survivalRef.current, keys: new Set(survivalRef.current.keys), enemies: [...survivalRef.current.enemies], bullets: [...survivalRef.current.bullets], orbs: [...survivalRef.current.orbs] })
  }, [])

  const publishTetris = useCallback(() => {
    setTetrisSnapshot({ ...tetrisRef.current, keys: new Set(tetrisRef.current.keys), queue: [...tetrisRef.current.queue] })
  }, [])

  const settleBest = useCallback((game: GameKey, score: number): void => {
    if (score > bestRef.current[game]) {
      bestRef.current[game] = score
      writeBest(game, score)
      setBests({ ...bestRef.current })
    }
  }, [])

  // R103: poll any connected gamepad each frame — presence detection (no
  // pairing-event dependency), left stick as analog movement, Start to run.
  const pollGamepad = useCallback(() => {
    if (typeof navigator.getGamepads !== 'function') return
    const pads = navigator.getGamepads()
    const pad = Array.from(pads).find((item) => item && item.connected) ?? null
    if (pad) {
      survivalRef.current.axis = { x: pad.axes[0] ?? 0, y: pad.axes[1] ?? 0 }
      if (gamepadNameRef.current !== pad.id) {
        gamepadNameRef.current = pad.id
        setGamepadName(pad.id)
      }
      const startPressed = pad.buttons[9]?.pressed === true
      if (startPressed && !prevStartRef.current) {
        const phase = survivalRef.current.phase
        if (phase === 'ready' || phase === 'lost') startRunRef.current()
      }
      prevStartRef.current = startPressed
    } else {
      survivalRef.current.axis = { x: 0, y: 0 }
      prevStartRef.current = false
      if (gamepadNameRef.current !== null) {
        gamepadNameRef.current = null
        setGamepadName(null)
      }
    }
  }, [])

  // R102: native fullscreen state sync — Esc / OS exit flips the layout back.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFullscreen(false)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      setFullscreen(false)
      void document.exitFullscreen?.().catch(() => undefined)
      return
    }
    setFullscreen(true)
    void screenRootRef.current?.requestFullscreen?.().catch(() => undefined)
  }, [])

  useEffect(() => {
    if (screen !== 'td' && screen !== 'survival' && screen !== 'tetris') return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    startBgm()
    canvas.width = WIDTH
    canvas.height = HEIGHT
    let frame = 0
    let last = performance.now()
    let snapshotTimer = 0
    let lastPhase: string = screen === 'td' ? tdStateRef.current.phase : screen === 'survival' ? survivalRef.current.phase : tetrisRef.current.phase
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (screen === 'td') {
        tickGame(tdStateRef.current, dt * tdSpeed)
        const phase = tdStateRef.current.phase
        if ((phase === 'won' || phase === 'lost') && lastPhase !== phase) {
          settleBest('td', tdStateRef.current.score)
          if (tdStateRef.current.score >= bestRef.current.td) addText(tdStateRef.current, WIDTH / 2, HEIGHT / 2 + 96, 'NEW BEST!', '#fde68a')
        }
        lastPhase = phase
        drawGame(ctx, tdStateRef.current, selectedTowerId, bestRef.current.td)
      } else if (screen === 'survival') {
        pollGamepad()
        tickSurvival(survivalRef.current, dt)
        const phase = survivalRef.current.phase
        if (phase === 'lost' && lastPhase !== phase) {
          settleBest('survival', survivalRef.current.score)
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
        }
        lastPhase = phase
        drawSurvival(ctx, survivalRef.current)
      } else {
        tickTetris(tetrisRef.current, dt)
        const phase = tetrisRef.current.phase
        if (phase === 'lost' && lastPhase !== phase) {
          settleBest('tetris', tetrisRef.current.score)
        }
        lastPhase = phase
        drawTetris(ctx, tetrisRef.current, bestRef.current.tetris)
      }
      snapshotTimer += dt
      if (snapshotTimer > 0.18) {
        if (screen === 'td') publishTd()
        else if (screen === 'survival') publishSurvival()
        else publishTetris()
        snapshotTimer = 0
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(frame)
      stopBgm()
    }
  }, [fullscreen, pollGamepad, publishTd, publishSurvival, publishTetris, screen, selectedTowerId, settleBest, tdSpeed])

  useEffect(() => {
    if (screen !== 'survival' && screen !== 'tetris' && !fullscreen) return
    const normalizeKey = (event: KeyboardEvent) => event.code === 'Space' ? 'space' : event.key.toLowerCase()
    const down = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFullscreen(false)
        if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined)
        return
      }
      const normalized = normalizeKey(event)
      if (MOVEMENT_KEYS.has(normalized) && !event.ctrlKey && !event.metaKey && !event.altKey) event.preventDefault()
      if (screen === 'survival') {
        survivalRef.current.keys.add(normalized)
      } else if (screen === 'tetris') {
        if (normalized === 'arrowleft') tetrisRef.current.commands.push('left')
        else if (normalized === 'arrowright') tetrisRef.current.commands.push('right')
        else if (normalized === 'arrowup') tetrisRef.current.commands.push('rotate')
        else if (normalized === 'space') tetrisRef.current.commands.push('hard')
        else if (normalized === 'arrowdown') tetrisRef.current.keys.add('arrowdown')
      }
    }
    const up = (event: KeyboardEvent) => {
      const normalized = normalizeKey(event)
      survivalRef.current.keys.delete(normalized)
      tetrisRef.current.keys.delete(normalized)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [fullscreen, screen])

  const enterGame = useCallback((next: Screen) => {
    setFullscreen(false)
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined)
    setScreen(next)
  }, [])

  const backToHub = useCallback(() => {
    setFullscreen(false)
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined)
    setScreen('hub')
  }, [])

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
      tdStateRef.current = initialState()
      setSelectedTowerId(null)
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
    tdStateRef.current = initialState()
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
    const point = {
      x: ((event.clientX - rect.left) / rect.width) * WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
    }
    const state = tdStateRef.current
    const tower = state.towers.find((item) => Math.hypot(item.x - point.x, item.y - point.y) < 22)
    if (tower) {
      setSelectedTowerId(tower.id === selectedTowerId ? null : tower.id)
      return
    }
    const def = TOWER_DEFINITIONS.find((item) => item.kind === selectedTower) ?? TOWER_DEFINITIONS[0]
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
  }, [publishTd, selectedTower, selectedTowerId])

  const enabledArtifacts = useMemo(() => ARTIFACTS
    .filter((artifact) => meta.artifacts[artifact.id] && isArtifactUnlocked(artifact, meta.stats))
    .map((artifact) => artifact.id), [meta])

  const startSurvivalRun = useCallback(() => {
    if (survivalRef.current.phase === 'lost' || survivalRef.current.phase === 'ready') {
      survivalRef.current = initialSurvivalState(swarmCharacter, meta.perm, enabledArtifacts)
    }
    startSurvival(survivalRef.current)
    publishSurvival()
  }, [enabledArtifacts, meta, publishSurvival, swarmCharacter])

  startRunRef.current = startSurvivalRun

  const restartSurvivalRun = useCallback(() => {
    survivalRef.current = initialSurvivalState(swarmCharacter, meta.perm, enabledArtifacts)
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

  const buyPermanent = useCallback((key: PermKey) => {
    setMeta((prev) => {
      const next = buyPerm(prev, key)
      if (!next) return prev
      writeMeta(next)
      return next
    })
  }, [])

  const startTetrisRun = useCallback(() => {
    if (tetrisRef.current.phase === 'lost') {
      tetrisRef.current = initialTetrisState()
    }
    startTetris(tetrisRef.current)
    publishTetris()
  }, [publishTetris])

  const restartTetrisRun = useCallback(() => {
    tetrisRef.current = initialTetrisState()
    publishTetris()
  }, [publishTetris])

  const chooseUpgrade = useCallback((id: UpgradeId) => {
    applyUpgrade(survivalRef.current, id)
    publishSurvival()
  }, [publishSurvival])

  if (screen === 'hub') {
    return (
      <div className="games-view">
        <header className="workspace-header games-header">
          <div>
            <p className="eyebrow">{t('games.eyebrow')}</p>
            <h2>{t('games.title')}</h2>
          </div>
          <div className="games-header-actions">
            <button className="aspect-lock-btn" type="button" aria-label={t('games.bgmToggle')} title={t('games.bgmToggle')} onClick={toggleBgm}>
              <Music aria-hidden="true" size={13} />
              {bgmOn ? '' : '×'}
            </button>
            <button className="aspect-lock-btn" type="button" aria-label={t('games.sfxToggle')} title={t('games.sfxToggle')} onClick={toggleSfx}>
              {sfxOn ? <Volume2 aria-hidden="true" size={13} /> : <VolumeX aria-hidden="true" size={13} />}
            </button>
          </div>
        </header>
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
          <div className="game-tile ghost" aria-hidden="true">
            <span className="tower-orb"><Crosshair aria-hidden="true" size={18} /></span>
            <span className="game-tile-copy">
              <strong>{t('games.tileSoonTitle')}</strong>
              <small>{t('games.tileSoonSummary')}</small>
            </span>
          </div>
        </div>
      </div>
    )
  }

  const isTd = screen === 'td'
  const isSurvival = screen === 'survival'
  const gameTitle = isTd ? t('games.tileTdTitle') : isSurvival ? t('games.tileSwarmTitle') : t('games.tileTetrisTitle')
  const rawPhase = isTd ? tdSnapshot.phase : isSurvival ? (survivalSnapshot.phase === 'levelup' ? 'ready' : survivalSnapshot.phase) : tetrisSnapshot.phase
  const phase = rawPhase as 'ready' | 'running' | 'won' | 'lost'
  const phaseLabel = phase === 'won' ? t('games.statusWon') : phase === 'lost' ? t('games.statusLost') : phase === 'ready' ? t('games.statusReady') : t('games.statusRunning')
  const best = isTd ? bests.td : isSurvival ? bests.survival : bests.tetris
  const startHandler = isTd ? startOrNextWave : isSurvival ? startSurvivalRun : startTetrisRun
  const restartHandler = isTd ? restartTd : isSurvival ? restartSurvivalRun : restartTetrisRun

  return (
    <div ref={screenRootRef} className={`games-view games-screen ${fullscreen ? 'fs' : ''}`}>
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
          {isTd ? (
            <button className="aspect-lock-btn" type="button" aria-label={t('games.speed')} title={t('games.speed')} onClick={() => setTdSpeed((speed) => (speed === 1 ? 2 : 1))}>
              <Zap aria-hidden="true" size={13} />
              {tdSpeed}×
            </button>
          ) : null}
          <button className="aspect-lock-btn" type="button" onClick={startHandler}>
            <Play size={13} />
            {isTd && tdSnapshot.wave > 0 ? t('games.nextWave') : t('games.start')}
          </button>
          <button className="aspect-lock-btn" type="button" onClick={restartHandler}>
            <RotateCcw size={13} />
            {t('games.restart')}
          </button>
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
        <span role="listitem" aria-label={t('games.ariaCoins').replace('{value}', String(isTd ? tdSnapshot.coins : isSurvival ? survivalSnapshot.kills : tetrisSnapshot.lines))} title={t('games.ariaCoins').replace('{value}', String(isTd ? tdSnapshot.coins : isSurvival ? survivalSnapshot.kills : tetrisSnapshot.lines))}><span aria-hidden="true">{isTd ? '◎' : isSurvival ? '✕' : '≡'}</span> {isTd ? tdSnapshot.coins : isSurvival ? survivalSnapshot.kills : tetrisSnapshot.lines}</span>
        <span role="listitem" aria-label={t('games.ariaScore').replace('{value}', String(isTd ? tdSnapshot.score : isSurvival ? survivalSnapshot.score : tetrisSnapshot.score))} title={t('games.ariaScore').replace('{value}', String(isTd ? tdSnapshot.score : isSurvival ? survivalSnapshot.score : tetrisSnapshot.score))}><span aria-hidden="true">★</span> {isTd ? tdSnapshot.score : isSurvival ? survivalSnapshot.score : tetrisSnapshot.score}</span>
        <span role="listitem" aria-label={t('games.ariaBest').replace('{value}', String(best))} title={t('games.ariaBest').replace('{value}', String(best))}><Trophy aria-hidden="true" size={15} />{best}</span>
      </div>

      <div className="games-layout">
        <section className="games-canvas-panel panel">
          <div className="games-canvas-wrap">
            <canvas
              ref={canvasRef}
              className="games-canvas"
              onClick={isTd ? handleCanvasClick : undefined}
              aria-label={`${gameTitle} game board`}
            />
            {!isTd && survivalSnapshot.phase === 'levelup' && survivalSnapshot.offers.length > 0 ? (
              <div className="levelup-overlay">
                <p>{t('games.levelupTitle')}</p>
                <div className="levelup-cards">
                  {survivalSnapshot.offers.map((id) => {
                    const def = UPGRADES.find((upgrade) => upgrade.id === id)
                    const takenCount = survivalSnapshot.taken[id] ?? 0
                    return (
                      <button className="levelup-card" type="button" key={id} style={{ '--game-accent': RARITY_COLORS[def?.rarity ?? 0] } as CSSProperties} onClick={() => chooseUpgrade(id)}>
                        <strong>{t(`games.up.${id}`)}</strong>
                        <small>{t(`games.up.${id}.desc`)}</small>
                        <em>{takenCount}/{def?.max ?? 0}</em>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}
            {isSurvival && survivalSnapshot.phase === 'ready' ? (
              <div className="swarm-setup">
                <p className="swarm-setup-title">{t('games.setupTitle')}</p>
                <div className="char-cards">
                  {CHARACTERS.map((character) => (
                    <button key={character.id} type="button" className={`char-card ${swarmCharacter === character.id ? 'selected' : ''}`} style={{ '--game-accent': character.accent } as CSSProperties} onClick={() => selectCharacter(character.id)}>
                      <strong>{t(`games.char.${character.id}`)}</strong>
                      <small>{t(`games.char.${character.id}.desc`)}</small>
                      <em>HP {5 + character.hpMod}</em>
                    </button>
                  ))}
                </div>
                <div className="artifact-bar">
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
                <p className="swarm-setup-hint">{t('games.setupHint')}</p>
              </div>
            ) : null}
            {isSurvival && survivalSnapshot.phase === 'roulette' ? (
              <div className="swarm-roulette">
                {roulette.stage === 'pick' ? (
                  <>
                    <p>{t('games.roulettePick')}</p>
                    <div className="roulette-wheels">
                      <button type="button" onClick={() => spinRoulette('item')}>
                        <strong>{t('games.wheelItem')}</strong>
                        <small>{t('games.wheelItem.desc')}</small>
                      </button>
                      <button type="button" onClick={() => spinRoulette('stat')}>
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
                      <button type="button" onClick={claimRoulette}>{t('games.claim')}</button>
                      <button type="button" onClick={dissolveCurrentRoulette}>{t('games.dissolve').replace('{xp}', String(roulette.result.xpValue))}</button>
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
          </div>
          <div className="games-canvas-status">
            <span>
              {isTd
                ? `${t('games.wave')} ${tdSnapshot.wave}/${MAX_WAVE}${tdSnapshot.phase === 'running' && tdSnapshot.waveQueue + tdSnapshot.balloons.length > 0 ? ` · ${t('games.balloonsLeft').replace('{value}', String(tdSnapshot.waveQueue + tdSnapshot.balloons.length))}` : ''}`
                : isSurvival ? `${t('games.swarmHint')} · ${t('games.island').replace('{n}', String(survivalSnapshot.island))}${gamepadName ? ` · 🎮 ${gamepadName}` : ''}` : t('games.tetrisHint')}
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
              <p>{t('games.tetrisControls')}</p>
              <strong>{t('games.rulesTitle')}</strong>
              <ul>
                <li>{t('games.tetrisRule1')}</li>
                <li>{t('games.tetrisRule2')}</li>
                <li>{t('games.tetrisRule3')}</li>
              </ul>
              <p className="games-help">{t('games.tetrisRule4')}</p>
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
              {(['chaser', 'sprinter', 'brute', 'elite', 'boss'] as const).map((kind) => (
                <div className="codex-entry" key={kind} style={{ '--game-accent': { chaser: '#fb7185', sprinter: '#fbbf24', brute: '#f472b6', elite: '#fde68a', boss: '#db2777' }[kind] } as CSSProperties}>
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
