// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
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

beforeEach(() => {
  setupRendererMocks()
  cleanup()
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
})
