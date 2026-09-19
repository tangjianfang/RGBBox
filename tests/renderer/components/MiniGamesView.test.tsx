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
    expect(container.querySelectorAll('.game-tile:not(.ghost)').length).toBe(3)
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
    expect(container.querySelectorAll('.codex-entry').length).toBe(3 + 5 + 12 + 8)
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
})
