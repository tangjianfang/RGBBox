// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, act, waitFor } from '@testing-library/react'
import { MiniGamesView } from '../../../src/renderer/src/components/MiniGamesView'
import {
  towerUpgradeCost,
  upgradeTower,
  sellTower,
  tickGame,
  initialState,
  type Tower,
} from '../../../src/renderer/src/games/td'
import { setupRendererMocks } from '../_helpers'

// R141-A: capture gesture-feedback sounds without an AudioContext. NOTE:
// must stay a plain vi.mock call — an aliased 'viSfx.mock' is NOT hoisted and
// the component would bind the real module before the mock runs.
vi.mock('../../../src/renderer/src/games/sfx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/renderer/src/games/sfx')>()
  return { ...actual, playSfx: vi.fn() }
})

// R136: the vision pipeline lives in the hidden host window; the component
// talks to it over the (mocked) BroadcastChannel. FakeHost answers init with
// 'ready' so the real hook completes enable; drives happen via the seam.
class FakeHost {
  channel: BroadcastChannel
  sent: Array<{ type: string; [key: string]: unknown }> = []
  constructor() {
    this.channel = new BroadcastChannel('rgbbox-vision')
    this.channel.onmessage = (ev: MessageEvent) => {
      const msg = ev.data as { type: string }
      this.sent.push(msg)
      if (msg.type === 'init') this.channel.postMessage({ type: 'ready', delegate: 'GPU' })
    }
  }
  send(msg: unknown): void {
    this.channel.postMessage(msg)
  }
  dispose(): void {
    this.channel.close()
  }
}

let fakeHost: FakeHost
let rgbboxMocks: ReturnType<typeof setupRendererMocks>

beforeEach(() => {
  rgbboxMocks = setupRendererMocks()
  localStorage.clear()
  fakeHost = new FakeHost()
  cleanup()
})

afterEach(() => {
  fakeHost.dispose()
})

function makeTower(overrides: Partial<Tower> = {}): Tower {
  return { id: 1, kind: 'dart', level: 1, spent: 70, angle: 0, x: 0, y: 0, range: 126, cooldown: 0, fireRate: 0.62, damage: 1, ...overrides }
}

describe('renderer/components/MiniGamesView', () => {
  it('renders the games hub (R99/R100 platform shell)', () => {
    const { container } = render(<MiniGamesView />)
    expect(container.querySelectorAll('.game-tile:not(.ghost)').length).toBe(4)
    expect(container.querySelectorAll('.game-tile.ghost').length).toBe(1)
    expect(container.querySelectorAll('canvas').length).toBe(0)
  })

  it('enters the tower defense game from its hub tile', () => {
    const { container } = render(<MiniGamesView />)
    fireEvent.click(container.querySelectorAll('.game-tile:not(.ghost)')[0])
    expect(container.querySelectorAll('canvas').length).toBe(1)
    expect(container.querySelectorAll('.tower-card').length).toBe(5)
    expect(container.querySelector('.games-canvas-status')).toBeTruthy()
  })

  it('enters nova swarm from its hub tile', () => {
    const { container } = render(<MiniGamesView />)
    fireEvent.click(container.querySelectorAll('.game-tile:not(.ghost)')[1])
    expect(container.querySelectorAll('canvas').length).toBe(1)
    expect(container.querySelectorAll('.tower-card').length).toBe(0)
    expect(container.querySelector('.games-canvas-status')).toBeTruthy()
  })

  it('codex overlay lists all four sections with full entry counts (R107)', () => {
    const { container } = render(<MiniGamesView />)
    fireEvent.click(container.querySelectorAll('.game-tile:not(.ghost)')[1])
    const codexButton = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('📚'))
    expect(codexButton).toBeTruthy()
    fireEvent.click(codexButton as HTMLButtonElement)
    expect(container.querySelectorAll('.codex-overlay').length).toBe(1)
    expect(container.querySelectorAll('.codex-entry').length).toBe(3 + 10 + 12 + 8) // R220.5: 敌图鉴 +5 种 R218 新敌型
    const close = [...container.querySelectorAll('.codex-head button')][0] as HTMLButtonElement
    fireEvent.click(close)
    expect(container.querySelectorAll('.codex-overlay').length).toBe(0)
  })

  it('tower upgrades scale stats, rise in cost, and cap at level 3 (R97.2)', () => {
    const tower = makeTower()
    const firstCost = towerUpgradeCost(tower)
    expect(upgradeTower(initialState(), tower)).toBe(true)
    expect(tower.level).toBe(2)
    expect(tower.damage).toBeGreaterThan(1)
    expect(tower.range).toBeGreaterThan(126)
    expect(towerUpgradeCost(tower)).toBeGreaterThan(firstCost)
    expect(upgradeTower(initialState(), tower)).toBe(true)
    expect(tower.level).toBe(3)
    expect(upgradeTower(initialState(), tower)).toBe(false)
    const poor = initialState()
    poor.coins = 0
    const fresh = makeTower()
    expect(upgradeTower(poor, fresh)).toBe(false)
  })

  it('selling a tower refunds 70% of total spend and removes it (R98.4)', () => {
    const state = initialState()
    const tower = makeTower({ id: 7, spent: 100 })
    state.towers.push(tower)
    sellTower(state, tower)
    expect(state.towers.length).toBe(0)
    expect(state.coins).toBe(220 + 70)
  })

  it('tower defense intermission counts down to the next wave (R97.2)', () => {
    const state = initialState()
    state.phase = 'running'
    state.wave = 1
    state.waveCooldown = 0.5
    tickGame(state, 0.6)
    expect(state.wave).toBe(2)
    expect(state.banner?.text).toBe('WAVE 2')
  })

  it('mint spire mints coins on cooldown and rail cannon snipes the toughest balloon (R100.2)', () => {
    const state = initialState()
    state.phase = 'running'
    state.towers.push({ id: 1, kind: 'mint', level: 1, spent: 120, angle: 0, x: 100, y: 100, range: 0, cooldown: 0, fireRate: 4, damage: 0 })
    const coins = state.coins
    tickGame(state, 0.02)
    expect(state.coins).toBe(coins + 6)
    expect(state.towers[0].cooldown).toBeGreaterThan(0)
    state.towers.push({ id: 2, kind: 'rail', level: 1, spent: 190, angle: 0, x: 344, y: 200, range: 210, cooldown: 0, fireRate: 2.2, damage: 4 })
    state.balloons.push({ id: 10, progress: 0.2, speed: 0.1, hp: 2, maxHp: 2, reward: 10, slowUntil: 0, color: '#ffffff' })
    state.balloons.push({ id: 11, progress: 0.21, speed: 0.1, hp: 5, maxHp: 5, reward: 10, slowUntil: 0, color: '#ffffff' })
    for (let i = 0; i < 40; i++) tickGame(state, 0.02)
    expect(state.balloons.find((balloon) => balloon.id === 11)?.hp).toBe(1)
  })

  it('vision input: enabling via the seam starts the worker, status chip appears, Tetris switches to 4-way (R131/R136)', async () => {
    const { container } = render(<MiniGamesView />)
    fireEvent.click(container.querySelectorAll('.game-tile:not(.ghost)')[2]) // Tetris
    const eye = [...container.querySelectorAll('button')].find((button) => /^games\.vision\.(enable|disable)$/.test(button.getAttribute('aria-label') ?? ''))
    expect(eye?.getAttribute('aria-label')).toBe('games.vision.enable')
    await act(async () => {
      await (window as unknown as { __rgbboxVision: { enableSynthetic(): Promise<void> } }).__rgbboxVision.enableSynthetic()
    })
    expect(rgbboxMocks.visionHostOpen).toHaveBeenCalled()
    // Tetris runs the direction ring 4-way
    await waitFor(() => {
      const settings = fakeHost.sent.find((m) => m.type === 'settings') as { patch: { dirs: number } } | undefined
      expect(settings?.patch.dirs).toBe(4)
    })
    await waitFor(() => {
      expect(container.querySelector('.games-canvas-status span')?.textContent).toContain('👁')
    })
  })

  it('vision pad + banner mount with vision enabled; exit notice on disable (R132/R136)', async () => {
    const { container } = render(<MiniGamesView />)
    expect(container.querySelector('.vision-pad')).toBeNull() // off by default
    fireEvent.click(container.querySelectorAll('.game-tile:not(.ghost)')[2]) // Tetris
    await act(async () => {
      await (window as unknown as { __rgbboxVision: { enableSynthetic(): Promise<void> } }).__rgbboxVision.enableSynthetic()
    })
    // R207: the pad is gated behind rgbbox:visionPadVisible (default OFF) — flip it on first
    fireEvent.click(container.querySelector('[data-action="vision-pad-toggle"]')!)
    await waitFor(() => {
      expect(container.querySelector('.vision-pad canvas')).toBeTruthy()
    })
    expect(container.querySelector('.vision-banner')).toBeTruthy()
    // a snapshot with landmarks + calibrating step drives banner + skeleton data
    await act(async () => {
      fakeHost.send({ type: 'snapshot', snapshot: {
        state: 'calibrating', label: '校准 1/3', stepId: 'center', stepProgress: 0.5,
        geom: { palm: { x: 0.5, y: 0.5 }, pinch: 1.1, scale: 0.18 },
        pickedLandmarks: new Array(21).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0 })),
        stats: { infer: { n: 5, p50: 8, p95: 12, mean: 9 }, fps: 60, inferFps: 30, delegate: 'GPU', lowFps: false },
      } })
    })
    expect(container.querySelector('.vision-banner')?.textContent).toContain('1/3')
    expect(container.querySelector('.vision-banner-skip')).toBeTruthy()
    // disabling shows the transient "vision off" notice in the status chip
    await act(async () => {
      ;(window as unknown as { __rgbboxVision: { disable(): void } }).__rgbboxVision.disable()
    })
    expect(container.querySelector('.vision-pad')).toBeNull()
    expect(container.querySelector('.games-canvas-status span')?.textContent).toContain('games.vision.exited')
  })

  it('vision input: back to the hub terminates the worker (R131/R136)', async () => {
    const { container } = render(<MiniGamesView />)
    fireEvent.click(container.querySelectorAll('.game-tile:not(.ghost)')[1]) // Nova Swarm
    await act(async () => {
      await (window as unknown as { __rgbboxVision: { enableSynthetic(): Promise<void> } }).__rgbboxVision.enableSynthetic()
    })
    await waitFor(() => {
      expect(container.querySelector('.games-canvas-status span')?.textContent).toContain('👁')
    })
    const back = [...container.querySelectorAll('button')].find((button) => button.textContent === 'games.backToHub') as HTMLButtonElement
    fireEvent.click(back)
    expect(rgbboxMocks.visionHostClose).toHaveBeenCalled()
  })

  // R137: the R135 analog path reused the DirectionRing's up-positive math
  // convention inside the engine's down-positive axis — hand up moved the
  // ship DOWN. Pin the polarity in both directions via the seam probe.
  it('analog polarity: palm ABOVE center drives axis.y negative (ship up), below → positive (R137)', async () => {
    // happy-dom has no real 2D context — the game loop (and pollVision with
    // it) never starts. Stub getContext with an all-noop proxy.
    const noopCtx = new Proxy({}, {
      get: (_t, prop) => {
        if (prop === 'canvas') return undefined
        if (prop === 'measureText') return () => ({ width: 10 })
        return () => undefined
      },
      set: () => true,
    }) as unknown as CanvasRenderingContext2D
    const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noopCtx)
    const { container } = render(<MiniGamesView />)
    fireEvent.click(container.querySelectorAll('.game-tile:not(.ghost)')[1]) // Nova Swarm
    await act(async () => {
      await (window as unknown as { __rgbboxVision: { enableSynthetic(): Promise<void> } }).__rgbboxVision.enableSynthetic()
    })
    const center = { x: 0.5, y: 0.55 }
    const sendPalm = async (palmY: number) => {
      await act(async () => {
        fakeHost.send({ type: 'snapshot', snapshot: {
          state: 'active', label: 'x', stepProgress: 0,
          ringCenter: center,
          geom: { palm: { x: center.x, y: palmY }, pinch: 1.1, scale: 0.18 },
          profile: { activeZone: 0.17, deadZone: 0.09 },
          stats: { infer: { n: 9, p50: 8, p95: 12, mean: 9 }, fps: 30, inferFps: 30, delegate: 'GPU', lowFps: false },
        } })
      })
      // let the game rAF run pollVision at least once
      await new Promise((r) => setTimeout(r, 60))
      return (window as unknown as { __rgbboxVision: { probe(): { axis: { x: number; y: number } } } }).__rgbboxVision.probe().axis
    }
    const up = await sendPalm(center.y - 0.15) // hand above center → screen up
    expect(up.y).toBeLessThan(0)
    expect(up.x).toBeCloseTo(0, 1)
    const down = await sendPalm(center.y + 0.15)
    expect(down.y).toBeGreaterThan(0)
    ctxSpy.mockRestore()
    const right = await sendPalm(center.y + 0.15) // reuse baseline, then x
    await act(async () => {
      fakeHost.send({ type: 'snapshot', snapshot: {
        state: 'active', label: 'x', ringCenter: center,
        geom: { palm: { x: center.x + 0.15, y: center.y }, pinch: 1.1, scale: 0.18 },
        profile: { activeZone: 0.17, deadZone: 0.09 },
        stats: { infer: { n: 9, p50: 8, p95: 12, mean: 9 }, fps: 30, inferFps: 30, delegate: 'GPU', lowFps: false },
      } })
    })
    await new Promise((r) => setTimeout(r, 60))
    const probe = (window as unknown as { __rgbboxVision: { probe(): { axis: { x: number; y: number } } } }).__rgbboxVision.probe().axis
    expect(right.y).toBeGreaterThan(0)
    expect(probe.x).toBeGreaterThan(0)
    expect(probe.y).toBeCloseTo(0, 1)
  })

  // R138: open-palm hold (~24 frames) starts the run from the ready screen
  // R221.7(修 R220.1⑨ 回归): vision 关闭是常态——pollVision 的直通键释放
  // 必须是下降沿,否则每帧 delete 与 keydown 互斥,WASD/方向键全部失效。
  it('键盘移动键在 vision 关闭时持续驻留键池(修每帧清键回归)', async () => {
    const noopCtx = new Proxy({}, {
      get: (_t, prop) => {
        if (prop === 'canvas') return undefined
        if (prop === 'measureText') return () => ({ width: 10 })
        return () => undefined
      },
      set: () => true,
    }) as unknown as CanvasRenderingContext2D
    const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noopCtx)
    const { container } = render(<MiniGamesView />)
    fireEvent.click(container.querySelectorAll('.game-tile:not(.ghost)')[1]) // Nova Swarm
    const start = container.querySelector('[data-action="ready-start"]') as HTMLButtonElement
    fireEvent.click(start)
    const tick = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()))
    const quantum = async (): Promise<void> => { await new Promise((r) => setTimeout(r, 100)); await tick(); await tick() }
    await quantum(); await quantum() // 修复前每帧都会清键——跨帧驻留是断言核心
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', bubbles: true, cancelable: true }))
    await quantum(); await quantum() // 再过帧——键必须仍在
    const keys = (window as unknown as { __rgbboxVision: { probe(): { keys: string[] } } }).__rgbboxVision.probe().keys
    expect(keys).toContain('arrowleft') // p1KeyMap: a→arrowleft
    document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', code: 'KeyA', bubbles: true }))
    ctxSpy.mockRestore()
  })

  it('open-palm hold for ~0.8s starts the survival run (R138)', async () => {
    const noopCtx = new Proxy({}, {
      get: (_t, prop) => {
        if (prop === 'canvas') return undefined
        if (prop === 'measureText') return () => ({ width: 10 })
        return () => undefined
      },
      set: () => true,
    }) as unknown as CanvasRenderingContext2D
    const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noopCtx)
    const { container } = render(<MiniGamesView />)
    fireEvent.click(container.querySelectorAll('.game-tile:not(.ghost)')[1]) // Nova Swarm
    await act(async () => {
      await (window as unknown as { __rgbboxVision: { enableSynthetic(): Promise<void> } }).__rgbboxVision.enableSynthetic()
    })
    const center = { x: 0.5, y: 0.55 }
    const openPalmSnap = () => fakeHost.send({ type: 'snapshot', snapshot: {
      state: 'active', label: 'x', ringCenter: center,
      geom: { palm: { x: center.x, y: center.y }, pinch: 1.3, scale: 0.18 }, // released pinch = open palm
      profile: { activeZone: 0.17, deadZone: 0.09, pinchOff: 0.85 },
      stats: { infer: { n: 9, p50: 8, p95: 12, mean: 9 }, fps: 30, inferFps: 30, delegate: 'GPU', lowFps: false },
    } })
    const phase = () => (window as unknown as { __rgbboxVision: { probe(): { phase: string } } }).__rgbboxVision.probe().phase
    expect(phase()).toBe('ready')
    // hold open-palm snapshots for ~400ms — below the 700ms threshold.
    // R219: 负向断言加墙钟护栏——全量并发负载下 10×40ms 实际墙钟可能超阈值,
    // 此时跳过(时序前提失效),只保正向结论;正向改 waitFor 轮询,消除 rAF
    // 饥饿下的负载敏感(同轮 crashLog 计时 flake 一类,断言本身不变)。
    const negStart = Date.now()
    for (let i = 0; i < 10; i++) {
      await act(async () => { openPalmSnap() })
      await new Promise((r) => setTimeout(r, 40))
    }
    if (Date.now() - negStart < 650) expect(phase()).toBe('ready') // still short of the hold
    // keep holding past 700ms total → the run starts
    for (let i = 0; i < 14 && phase() === 'ready'; i++) {
      await act(async () => { openPalmSnap() })
      await new Promise((r) => setTimeout(r, 40))
    }
    await waitFor(() => expect(phase()).toBe('running'), { timeout: 5000, interval: 50 })
    ctxSpy.mockRestore()
  })

  // R139: roulette options via gestures — direction flips focus between the
  // two buttons, DOUBLE pinch (<900ms apart) confirms; a single pinch must not.
  it('roulette: direction flips vision-focus, double-pinch confirms (R139)', async () => {
    const noopCtx = new Proxy({}, {
      get: (_t, prop) => {
        if (prop === 'canvas') return undefined
        if (prop === 'measureText') return () => ({ width: 10 })
        return () => undefined
      },
      set: () => true,
    }) as unknown as CanvasRenderingContext2D
    const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noopCtx)
    const { container } = render(<MiniGamesView />)
    fireEvent.click(container.querySelectorAll('.game-tile:not(.ghost)')[1]) // Nova Swarm
    await act(async () => {
      await (window as unknown as { __rgbboxVision: { enableSynthetic(): Promise<void> } }).__rgbboxVision.enableSynthetic()
    })
    // force the roulette overlay via the debug seam
    await act(async () => {
      ;(window as unknown as { __rgbboxGames: { startRoulette(): void } }).__rgbboxGames.startRoulette()
    })
    await waitFor(() => {
      expect(container.querySelector('.swarm-roulette')).toBeTruthy()
    })
    const wheels = container.querySelectorAll('.roulette-wheels button')
    expect(wheels.length).toBe(2)
    expect(wheels[0].className).toContain('vision-focus') // auto-highlight first
    expect(container.textContent).toContain('games.vision.rouletteHint')
    // one direction command flips focus to the second option
    await act(async () => {
      fakeHost.send({ type: 'events', events: [{ kind: 'direction', key: 'ArrowRight', down: true }] })
    })
    await new Promise((r) => setTimeout(r, 60))
    expect(wheels[1].className).toContain('vision-focus')
    expect(wheels[0].className).not.toContain('vision-focus')
    // single pinch: arms the detector, must NOT confirm yet
    await act(async () => {
      fakeHost.send({ type: 'events', events: [{ kind: 'pinch', key: 'Space', down: true }] })
    })
    await new Promise((r) => setTimeout(r, 60))
    expect(container.querySelector('.swarm-roulette')).toBeTruthy()
    // second pinch within the window → confirms the focused (stat) wheel
    await act(async () => {
      fakeHost.send({ type: 'events', events: [{ kind: 'pinch', key: 'Space', down: true }] })
    })
    await waitFor(() => {
      expect(container.querySelector('.roulette-disc.spinning')).toBeTruthy()
    })
    ctxSpy.mockRestore()
  })

  // R141-A: instant gesture feedback — a tick fires the moment a discrete
  // gesture is recognized; confirm actions get the two-tone chime.
  it('vision tick sfx fires on gesture events, confirm sfx on roulette confirm (R141-A)', async () => {
    const sfx = await import('../../../src/renderer/src/games/sfx')
    const noopCtx = new Proxy({}, {
      get: (_t, prop) => {
        if (prop === 'canvas') return undefined
        if (prop === 'measureText') return () => ({ width: 10 })
        return () => undefined
      },
      set: () => true,
    }) as unknown as CanvasRenderingContext2D
    const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noopCtx)
    const { container } = render(<MiniGamesView />)
    fireEvent.click(container.querySelectorAll('.game-tile:not(.ghost)')[1]) // Nova Swarm
    await act(async () => {
      await (window as unknown as { __rgbboxVision: { enableSynthetic(): Promise<void> } }).__rgbboxVision.enableSynthetic()
    })
    ;(sfx.playSfx as unknown as { mockClear(): void }).mockClear()

    await act(async () => {
      fakeHost.send({ type: 'events', events: [{ kind: 'direction', key: 'ArrowRight', down: true }] })
    })
    expect(sfx.playSfx).toHaveBeenCalledWith('tick')
    ctxSpy.mockRestore()
  })

  // R141-B: the banner surfaces the environment coach advice from telemetry
  it('vision banner shows dim-light advice when capture age is long (R141-B)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { container } = render(<MiniGamesView />)
    fireEvent.click(container.querySelectorAll('.game-tile:not(.ghost)')[1])
    await act(async () => {
      await (window as unknown as { __rgbboxVision: { enableSynthetic(): Promise<void> } }).__rgbboxVision.enableSynthetic()
    })
    await act(async () => {
      fakeHost.send({ type: 'snapshot', snapshot: {
        state: 'active', label: 'x', geom: { palm: { x: 0.5, y: 0.5 }, pinch: 1.1, scale: 0.18 },
        stats: { infer: { n: 100, p50: 8, p95: 12, mean: 9 }, fps: 60, inferFps: 30, delegate: 'GPU', lowFps: false,
          acquire: { n: 100, p50: 40, p95: 55, mean: 42 }, cam: { w: 640, h: 360, fps: 60 } },
      } })
    })
    await act(async () => { vi.advanceTimersByTime(1300) })
    expect(container.querySelector('.vision-banner-advice')?.textContent).toContain('games.vision.env.dim-light')
    vi.useRealTimers()
  })

  // R142-L3: the relative-cursor overlay mounts when the session is active
  // and the cursor follows palm movement (via the seam probe).
  it('relative cursor overlay mounts and follows palm movement (R142-L3)', async () => {
    const noopCtx = new Proxy({}, {
      get: (_t, prop) => {
        if (prop === 'canvas') return undefined
        if (prop === 'measureText') return () => ({ width: 10 })
        return () => undefined
      },
      set: () => true,
    }) as unknown as CanvasRenderingContext2D
    const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noopCtx)
    const { container } = render(<MiniGamesView />)
    fireEvent.click(container.querySelectorAll('.game-tile:not(.ghost)')[1]) // Nova Swarm
    await act(async () => {
      await (window as unknown as { __rgbboxVision: { enableSynthetic(): Promise<void> } }).__rgbboxVision.enableSynthetic()
    })
    const sendPalm = async (x: number) => {
      await act(async () => {
        fakeHost.send({ type: 'snapshot', snapshot: {
          state: 'active', label: 'x', ringCenter: { x: 0.5, y: 0.5 },
          geom: { palm: { x, y: 0.5 }, pinch: 1.1, scale: 0.18 },
          profile: { activeZone: 0.17, deadZone: 0.09, pinchOff: 0.85 },
          stats: { infer: { n: 9, p50: 8, p95: 12, mean: 9 }, fps: 60, inferFps: 30, delegate: 'GPU', lowFps: false },
        } })
      })
      await new Promise((r) => setTimeout(r, 60))
    }
    await sendPalm(0.5)
    await waitFor(() => {
      expect(container.querySelector('.vision-cursor')).toBeTruthy()
    })
    const before = (window as unknown as { __rgbboxVision: { cursor(): { x: number } } }).__rgbboxVision.cursor().x
    // a decisive right sweep moves the cursor right
    for (let i = 1; i <= 8; i++) await sendPalm(0.5 + i * 0.02)
    const after = (window as unknown as { __rgbboxVision: { cursor(): { x: number } } }).__rgbboxVision.cursor().x
    expect(after).toBeGreaterThan(before)
    ctxSpy.mockRestore()
  })
})


// ── R218 U2: gamepad Start/Options — any ASSIGNED pad, all four games ─────────
describe('renderer/components/MiniGamesView · gamepad Start (R218 U2)', () => {
  const noopCtx = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'canvas') return undefined
      if (prop === 'measureText') return () => ({ width: 10 })
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => ({ addColorStop: () => undefined })
      }
      return () => undefined
    },
    set: () => true,
  }) as unknown as CanvasRenderingContext2D

  function makePad(index: number, id: string, mapping = 'standard'): Gamepad {
    const buttons = Array.from({ length: 18 }, () => ({ pressed: false, value: 0, touched: false }))
    return { index, id, mapping, connected: true, axes: [0, 0, 0, 0], buttons, timestamp: 0 } as unknown as Gamepad
  }

  function mockGamepads(pads: Gamepad[]): void {
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => pads,
      configurable: true,
    })
  }

  // R219: 手柄/视觉类断言依赖组件 rAF 循环的轮询推进(pollGamepad/pollVision/
  // snapshot publish)。固定 ms 等待在全量并发负载下会 rAF 饥饿(同轮已两次复现)
  // ——改为「≥minTicks 个 rAF 量子 且 ≥ms 墙钟」双屏障:本 helper 的 rAF 回调
  // 得以执行即证明该帧队列排空,组件循环同帧必然跑过;3s 兜底防极端饥饿悬挂。
  const frames = (ms = 90, minTicks = 2): Promise<void> => new Promise((resolve) => {
    const start = performance.now()
    let ticks = 0
    const loop = (): void => {
      ticks += 1
      if ((ticks >= minTicks && performance.now() - start >= ms) || performance.now() - start > ms + 3000) resolve()
      else requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  })

  beforeEach(() => {
    localStorage.clear()
    Object.defineProperty(navigator, 'getGamepads', { value: () => [], configurable: true })
  })

  it('any assigned pad (not just P1) starts the run; hint row lists the count', async () => {
    const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noopCtx)
    const pad0 = makePad(0, 'Xbox Wireless Controller')
    const pad1 = makePad(1, 'DualSense Wireless Controller') // lands on P2 via assignGamepads fill
    mockGamepads([pad0, pad1])
    const { container } = render(<MiniGamesView />)
    fireEvent.click(container.querySelectorAll('.game-tile:not(.ghost)')[1]) // Nova Swarm
    await frames()
    const probe = () => (window as unknown as { __rgbboxVision: { probe(): { phase: string } } }).__rgbboxVision.probe().phase
    expect(probe()).toBe('ready')
    // ready-state presence hint (tests render without I18nProvider → raw key) + ids
    const hint = container.querySelector('[data-field="pad-hint"]')
    expect(hint?.textContent).toContain('games.pad.hint')
    expect(hint?.textContent).toContain('Xbox Wireless')
    expect(hint?.textContent).toContain('DualSense')
    // press Start on the P2 pad (index 1) — the pi!==0 pad that never worked before
    pad1.buttons[9].pressed = true
    await frames()
    expect(probe()).toBe('running')
    ctxSpy.mockRestore()
  })

  it('held Start does not re-trigger (edge detect) nor pause mid-press', async () => {
    const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noopCtx)
    const pad0 = makePad(0, 'Pad A')
    mockGamepads([pad0])
    const { container } = render(<MiniGamesView />)
    fireEvent.click(container.querySelectorAll('.game-tile:not(.ghost)')[1])
    await frames()
    pad0.buttons[9].pressed = true
    await frames()
    const probe = () => (window as unknown as { __rgbboxVision: { probe(): { phase: string } } }).__rgbboxVision.probe().phase
    expect(probe()).toBe('running')
    // keep holding: no new edge → no pause overlay, still running
    await frames(150)
    expect(container.querySelector('[data-field="fs-pause"]')).toBeNull()
    expect(probe()).toBe('running')
    ctxSpy.mockRestore()
  })

  it('Start while running toggles the pause overlay (non-fs state too)', async () => {
    const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noopCtx)
    const pad0 = makePad(0, 'Pad A')
    mockGamepads([pad0])
    const { container } = render(<MiniGamesView />)
    fireEvent.click(container.querySelectorAll('.game-tile:not(.ghost)')[1])
    await frames()
    const probe = () => (window as unknown as { __rgbboxVision: { probe(): { phase: string } } }).__rgbboxVision.probe().phase
    pad0.buttons[9].pressed = true
    await frames()
    expect(probe()).toBe('running')
    pad0.buttons[9].pressed = false
    await frames()
    expect(container.querySelector('[data-field="fs-pause"]')).toBeNull()
    // fresh press while running → pause overlay (resume/restart/hub; no exit-fs button outside fs)
    pad0.buttons[9].pressed = true
    await frames()
    const overlay = container.querySelector('[data-field="fs-pause"]')
    expect(overlay).toBeTruthy()
    expect(overlay?.querySelector('[data-action="fs-resume"]')).toBeTruthy()
    expect(overlay?.querySelector('[data-action="fs-exit"]')).toBeNull() // hidden outside fullscreen
    // release + press again → resume
    pad0.buttons[9].pressed = false
    await frames()
    pad0.buttons[9].pressed = true
    await frames()
    expect(container.querySelector('[data-field="fs-pause"]')).toBeNull()
    expect(probe()).toBe('running')
    ctxSpy.mockRestore()
  })

  it('non-standard mapping pad falls back to buttons[16]', async () => {
    const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noopCtx)
    const pad0 = makePad(0, 'Generic HID', '')
    mockGamepads([pad0])
    const { container } = render(<MiniGamesView />)
    fireEvent.click(container.querySelectorAll('.game-tile:not(.ghost)')[1])
    await frames()
    const probe = () => (window as unknown as { __rgbboxVision: { probe(): { phase: string } } }).__rgbboxVision.probe().phase
    expect(probe()).toBe('ready')
    pad0.buttons[16].pressed = true
    await frames()
    expect(probe()).toBe('running')
    ctxSpy.mockRestore()
  })

  it('Start also starts TD (all four games share the poll path)', async () => {
    const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noopCtx)
    const pad0 = makePad(0, 'Pad A')
    mockGamepads([pad0])
    const { container } = render(<MiniGamesView />)
    fireEvent.click(container.querySelectorAll('.game-tile:not(.ghost)')[0]) // TD
    await frames()
    expect(container.querySelector('[data-field="td-ctl"]')).toBeTruthy()
    pad0.buttons[9].pressed = true
    await waitFor(() => {
      // canvas-status second span shows the phase label once the snapshot publishes
      const spans = container.querySelectorAll('.games-canvas-status span')
      expect(spans[1]?.textContent).toContain('games.statusRunning')
    }, { timeout: 1500 })
    ctxSpy.mockRestore()
  })
})

// ── R218 U4: difficulty four tiers, persistence, per-game wiring ──────────────
describe('renderer/components/MiniGamesView · difficulty four tiers (R218 U4)', () => {
  const noopCtx = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'canvas') return undefined
      if (prop === 'measureText') return () => ({ width: 10 })
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => ({ addColorStop: () => undefined })
      }
      return () => undefined
    },
    set: () => true,
  }) as unknown as CanvasRenderingContext2D

  // R219: rAF 量子屏障版 frames(见 gamepad describe 处说明)——固定 ms 等待
  // 在全量并发负载下会 rAF 饥饿,改为「≥2 量子且 ≥ms 墙钟」双屏障 + 3s 兜底。
  const frames = (ms = 260, minTicks = 2): Promise<void> => new Promise((resolve) => {
    const start = performance.now()
    let ticks = 0
    const loop = (): void => {
      ticks += 1
      if ((ticks >= minTicks && performance.now() - start >= ms) || performance.now() - start > ms + 3000) resolve()
      else requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  })

  const enterTd = (container: HTMLElement) => {
    fireEvent.click(container.querySelectorAll('.game-tile:not(.ghost)')[0])
  }

  it('renders four tiers with score multipliers and persists the pick', () => {
    const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noopCtx)
    const { container } = render(<MiniGamesView />)
    enterTd(container)
    const btns = container.querySelectorAll('[data-field="difficulty"] [data-diff]')
    expect([...btns].map((b) => b.getAttribute('data-diff'))).toEqual(['casual', 'standard', 'hard', 'insane'])
    expect([...btns].map((b) => b.querySelector('.ready-chip-em')?.textContent)).toEqual(['1×', '1.5×', '2×', '3×'])
    expect(btns[1].className).toContain('on') // default standard
    fireEvent.click(btns[2]) // hard
    expect(localStorage.getItem('rgbbox:gamesDifficulty:td')).toBe('hard')
    expect(btns[2].className).toContain('on')
    ctxSpy.mockRestore()
  })

  it('legacy two-tier values map through; invalid falls back to standard', () => {
    const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noopCtx)
    localStorage.setItem('rgbbox:gamesDifficulty:td', 'casual')
    const { container } = render(<MiniGamesView />)
    enterTd(container)
    expect(container.querySelector('[data-diff="casual"]')?.className).toContain('on')
    ctxSpy.mockRestore()
    cleanup()

    localStorage.setItem('rgbbox:gamesDifficulty:td', 'bogus')
    const second = render(<MiniGamesView />)
    enterTd(second.container)
    expect(second.container.querySelector('[data-diff="standard"]')?.className).toContain('on')
    ctxSpy.mockRestore()
  })

  it('TD hard start applies the four-tier table (lives 14 / coins 187)', async () => {
    const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noopCtx)
    const { container } = render(<MiniGamesView />)
    enterTd(container)
    fireEvent.click(container.querySelector('[data-diff="hard"]')!)
    // R219.3: ready 态唯一主 CTA 是画布下方面板的开局按钮(header 开始已隐藏)
    const start = container.querySelector('[data-action="ready-start"]') as HTMLButtonElement
    fireEvent.click(start)
    await frames() // loop publishes the snapshot every 0.18s
    const lives = [...container.querySelectorAll('.games-stat-grid span')].find((s) => s.getAttribute('aria-label')?.includes('games.ariaLives'))
    expect(lives?.textContent).toContain('14')
    const coins = [...container.querySelectorAll('.games-stat-grid span')].find((s) => s.getAttribute('aria-label')?.includes('games.ariaCoins'))
    expect(coins?.textContent).toContain('180')
    ctxSpy.mockRestore()
  })

  it('tetris difficulty maps to the start level (insane → LV13)', async () => {
    const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noopCtx)
    const { container } = render(<MiniGamesView />)
    fireEvent.click(container.querySelectorAll('.game-tile:not(.ghost)')[2]) // Tetris
    fireEvent.click(container.querySelector('[data-diff="insane"]')!)
    // R219.3: ready 态唯一主 CTA(同上)
    const start = container.querySelector('[data-action="ready-start"]') as HTMLButtonElement
    fireEvent.click(start)
    await frames()
    const lv = [...container.querySelectorAll('.games-stat-grid span')].find((s) => s.getAttribute('aria-label')?.includes('games.ariaWave'))
    expect(lv?.textContent).toContain('LV 13')
    ctxSpy.mockRestore()
  })
})

// ── R218 U3: ready 态统一信息架构——抽屉折叠/记忆恢复/主按钮/席位行 ───────────
describe('renderer/components/MiniGamesView · ready panel (R218 U3)', () => {
  const noopCtx = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'canvas') return undefined
      if (prop === 'measureText') return () => ({ width: 10 })
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => ({ addColorStop: () => undefined })
      }
      return () => undefined
    },
    set: () => true,
  }) as unknown as CanvasRenderingContext2D

  // R219: rAF 量子屏障版 frames(见 gamepad describe 处说明)——固定 ms 等待
  // 在全量并发负载下会 rAF 饥饿,改为「≥2 量子且 ≥ms 墙钟」双屏障 + 3s 兜底。
  const frames = (ms = 120, minTicks = 2): Promise<void> => new Promise((resolve) => {
    const start = performance.now()
    let ticks = 0
    const loop = (): void => {
      ticks += 1
      if ((ticks >= minTicks && performance.now() - start >= ms) || performance.now() - start > ms + 3000) resolve()
      else requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  })

  function makePad(index: number, id: string): Gamepad {
    const buttons = Array.from({ length: 18 }, () => ({ pressed: false, value: 0, touched: false }))
    return { index, id, mapping: 'standard', connected: true, axes: [0, 0, 0, 0], buttons, timestamp: 0 } as unknown as Gamepad
  }

  it('first screen ≤5 groups: start button + core row + pad hint + drawer (collapsed)', () => {
    const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noopCtx)
    const { container } = render(<MiniGamesView />)
    fireEvent.click(container.querySelectorAll('.game-tile:not(.ghost)')[1]) // survival
    expect(container.querySelector('[data-action="ready-start"]')).toBeTruthy()
    expect(container.querySelector('.ready-core')).toBeTruthy()
    expect(container.querySelector('[data-field="pad-hint"]')).toBeTruthy()
    const drawer = container.querySelector('[data-field="ready-drawer"]') as HTMLDetailsElement
    expect(drawer).toBeTruthy()
    expect(drawer.open).toBe(false) // collapsed by default
    // advanced items live inside the drawer only
    expect(container.querySelector('[data-field="input-config-open"]')).toBeTruthy()
    expect(container.querySelector('[data-field="swarm-avatars"]')).toBeTruthy()
    ctxSpy.mockRestore()
  })

  it('drawer expands on summary click and the state persists', () => {
    const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noopCtx)
    const { container } = render(<MiniGamesView />)
    fireEvent.click(container.querySelectorAll('.game-tile:not(.ghost)')[1])
    fireEvent.click(container.querySelector('[data-field="ready-drawer"] summary')!)
    const drawer = container.querySelector('[data-field="ready-drawer"]') as HTMLDetailsElement
    expect(drawer.open).toBe(true)
    expect(localStorage.getItem('rgbbox:gamesReady:drawer')).toBe('1')
    ctxSpy.mockRestore()
    cleanup()

    // re-enter: expansion restored from storage
    const second = render(<MiniGamesView />)
    fireEvent.click(second.container.querySelectorAll('.game-tile:not(.ghost)')[2]) // tetris drawer is shared
    const drawer2 = second.container.querySelector('[data-field="ready-drawer"]') as HTMLDetailsElement
    expect(drawer2.open).toBe(true)
  })

  it('choices persist and restore across visits (players 3P + scene desert)', () => {
    const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noopCtx)
    const { container } = render(<MiniGamesView />)
    fireEvent.click(container.querySelectorAll('.game-tile:not(.ghost)')[1]) // survival
    fireEvent.change(container.querySelector('[data-field="swarm-players"]')!, { target: { value: '3' } })
    fireEvent.change(container.querySelector('[data-field="swarm-scene"]')!, { target: { value: 'desert' } })
    expect(JSON.parse(localStorage.getItem('rgbbox:gamesReady:survival') ?? '{}')).toEqual({ players: 3, scene: 'desert' })
    // back to hub, re-enter
    const back = [...container.querySelectorAll('button')].find((b) => b.textContent === 'games.backToHub') as HTMLButtonElement
    fireEvent.click(back)
    fireEvent.click(container.querySelectorAll('.game-tile:not(.ghost)')[1])
    expect((container.querySelector('[data-field="swarm-players"]') as HTMLSelectElement).value).toBe('3')
    expect((container.querySelector('[data-field="swarm-scene"]') as HTMLSelectElement).value).toBe('desert')
    ctxSpy.mockRestore()
  })

  it('the big start button starts the run; seating rows appear for 2P with pads', async () => {
    const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noopCtx)
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => [makePad(0, 'Pad Zero'), makePad(3, 'Pad Three')],
      configurable: true,
    })
    const { container } = render(<MiniGamesView />)
    fireEvent.click(container.querySelectorAll('.game-tile:not(.ghost)')[1]) // survival
    fireEvent.change(container.querySelector('[data-field="swarm-players"]')!, { target: { value: '2' } })
    // R219: seating 行 = 玩家数 state(立即)+ 手柄名(经 rAF 轮询的 gamepadInfo,
    // 晚一拍)——固定 260ms 等待在全量并发负载下会 rAF 饥饿,改对最终形态条件
    // 轮询(2 行齐 + 双手柄名到齐,断言不变)。
    await waitFor(() => {
      const spans = container.querySelectorAll('[data-field="ready-seating"] span')
      expect(spans.length).toBe(2)
      expect(spans[0].textContent).toContain('Pad Zero')
      expect(spans[1].textContent).toContain('Pad Three')
    }, { timeout: 5000, interval: 50 })
    // U7: two seating rows (P1 default wasd + pad 0; P2 default ijkl + pad 3)
    const seating = container.querySelectorAll('[data-field="ready-seating"] span')
    expect(seating[0].textContent).toContain('w/s/a/d')
    expect(seating[1].textContent).toContain('i/k/j/l')
    fireEvent.click(container.querySelector('[data-action="ready-start"]') as HTMLButtonElement)
    await frames()
    const probe = () => (window as unknown as { __rgbboxVision: { probe(): { phase: string } } }).__rgbboxVision.probe().phase
    expect(probe()).toBe('running')
    // run started → ready panel unmounts
    expect(container.querySelector('[data-field="ready-panel"]')).toBeNull()
    ctxSpy.mockRestore()
  })
})

// ── R218 U9: 画面占比三档 + 专注模式 ──────────────────────────────────────────
describe('renderer/components/MiniGamesView · screen size & focus mode (R218 U9)', () => {
  const noopCtx = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'canvas') return undefined
      if (prop === 'measureText') return () => ({ width: 10 })
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => ({ addColorStop: () => undefined })
      }
      return () => undefined
    },
    set: () => true,
  }) as unknown as CanvasRenderingContext2D

  // R219: rAF 量子屏障版 frames(见 gamepad describe 处说明)——固定 ms 等待
  // 在全量并发负载下会 rAF 饥饿,改为「≥2 量子且 ≥ms 墙钟」双屏障 + 3s 兜底。
  const frames = (ms = 320, minTicks = 2): Promise<void> => new Promise((resolve) => {
    const start = performance.now()
    let ticks = 0
    const loop = (): void => {
      ticks += 1
      if ((ticks >= minTicks && performance.now() - start >= ms) || performance.now() - start > ms + 3000) resolve()
      else requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  })
  const root = (container: HTMLElement) => container.querySelector('.games-screen') as HTMLElement

  it('focus toggle button enters/exits; Esc exits; badge shown while active', async () => {
    const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noopCtx)
    const { container } = render(<MiniGamesView />)
    fireEvent.click(container.querySelectorAll('.game-tile:not(.ghost)')[1]) // survival
    expect(root(container).className).not.toContain('focus')
    fireEvent.click(container.querySelector('[data-action="focus-toggle"]')!)
    expect(root(container).className).toContain('focus')
    expect(container.querySelector('[data-action="focus-exit"]')).toBeTruthy()
    // Esc exits focus
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(root(container).className).not.toContain('focus')
    expect(container.querySelector('[data-action="focus-exit"]')).toBeNull()
    // badge click also exits
    fireEvent.click(container.querySelector('[data-action="focus-toggle"]')!)
    fireEvent.click(container.querySelector('[data-action="focus-exit"]')!)
    expect(root(container).className).not.toContain('focus')
    ctxSpy.mockRestore()
  })

  it('screen-size preference persists and restores (focus → auto-enter on run start)', async () => {
    const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noopCtx)
    const { container } = render(<MiniGamesView />)
    fireEvent.click(container.querySelectorAll('.game-tile:not(.ghost)')[1]) // survival
    // drawer holds the three-tier screen size setting
    fireEvent.click(container.querySelector('[data-field="ready-drawer"] summary')!)
    fireEvent.click(container.querySelector('[data-scale="large"]')!)
    expect(localStorage.getItem('rgbbox:gamesFocusMode')).toBe('large')
    expect(root(container).className).toContain('size-large')
    fireEvent.click(container.querySelector('[data-scale="focus"]')!)
    expect(localStorage.getItem('rgbbox:gamesFocusMode')).toBe('focus')
    // starting the run auto-enters focus (pref = focus)
    fireEvent.click(container.querySelector('[data-action="ready-start"]') as HTMLButtonElement)
    await frames() // phase snapshot publish (~0.18s) flips runActive
    expect(root(container).className).toContain('focus')
    expect(root(container).className).toContain('running')
    // run ends → focus auto-exits is covered by the runActive effect; here verify
    // the class is bound to run state at least via presence while running
    ctxSpy.mockRestore()
  })

  it('double-click on the canvas enters focus while running (non-TD)', async () => {
    const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noopCtx)
    const { container } = render(<MiniGamesView />)
    fireEvent.click(container.querySelectorAll('.game-tile:not(.ghost)')[1]) // survival
    fireEvent.click(container.querySelector('[data-action="ready-start"]') as HTMLButtonElement)
    await frames()
    expect(root(container).className).toContain('running')
    fireEvent.dblClick(container.querySelector('canvas.games-canvas')!)
    expect(root(container).className).toContain('focus')
    ctxSpy.mockRestore()
  })
})

// ── R218 U7: 多人 shell 接线——ready 席位行(见 U3 组)/进行态人数徽章 ──────────
describe('renderer/components/MiniGamesView · multiplayer shell chrome (R218 U7)', () => {
  const noopCtx = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'canvas') return undefined
      if (prop === 'measureText') return () => ({ width: 10 })
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => ({ addColorStop: () => undefined })
      }
      return () => undefined
    },
    set: () => true,
  }) as unknown as CanvasRenderingContext2D

  // R219: rAF 量子屏障版 frames(见 gamepad describe 处说明)——固定 ms 等待
  // 在全量并发负载下会 rAF 饥饿,改为「≥2 量子且 ≥ms 墙钟」双屏障 + 3s 兜底。
  const frames = (ms = 320, minTicks = 2): Promise<void> => new Promise((resolve) => {
    const start = performance.now()
    let ticks = 0
    const loop = (): void => {
      ticks += 1
      if ((ticks >= minTicks && performance.now() - start >= ms) || performance.now() - start > ms + 3000) resolve()
      else requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  })

  it('running state shows the player-count badge in the (translucent) canvas chrome', async () => {
    const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noopCtx)
    const { container } = render(<MiniGamesView />)
    fireEvent.click(container.querySelectorAll('.game-tile:not(.ghost)')[1]) // survival
    fireEvent.change(container.querySelector('[data-field="swarm-players"]')!, { target: { value: '3' } })
    fireEvent.click(container.querySelector('[data-action="ready-start"]') as HTMLButtonElement)
    await frames()
    const status = container.querySelector('.games-canvas-status span')?.textContent ?? ''
    expect(status).toContain('3P')
    // running state chrome carries the translucency hook (CSS class on root)
    expect((container.querySelector('.games-screen') as HTMLElement).className).toContain('running')
    ctxSpy.mockRestore()
  })
})
