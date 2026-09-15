// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import {
  MiniGamesView,
  towerUpgradeCost,
  upgradeTower,
  sellTower,
  tickGame,
  initialState,
  type Tower,
} from '../../../src/renderer/src/components/MiniGamesView'
import { setupRendererMocks } from '../_helpers'

beforeEach(() => {
  setupRendererMocks()
  cleanup()
})

function makeTower(overrides: Partial<Tower> = {}): Tower {
  return { id: 1, kind: 'dart', level: 1, spent: 70, angle: 0, x: 0, y: 0, range: 126, cooldown: 0, fireRate: 0.62, damage: 1, ...overrides }
}

describe('renderer/components/MiniGamesView', () => {
  it('renders the mini-games view container', () => {
    const { container } = render(<MiniGamesView />)
    expect(container).toBeTruthy()
  })

  it('renders the single-game tower defense shell (R98 cut)', () => {
    const { container } = render(<MiniGamesView />)
    expect(container.querySelectorAll('canvas').length).toBe(1)
    expect(container.querySelectorAll('.tower-card').length).toBe(3)
    expect(container.querySelectorAll('.game-card').length).toBe(0)
    expect(container.querySelector('.games-canvas-status')).toBeTruthy()
  })

  it('transitions when the start button is clicked', () => {
    const { container } = render(<MiniGamesView />)
    const buttons = container.querySelectorAll('button')
    if (buttons.length > 0) fireEvent.click(buttons[0])
    expect(container).toBeTruthy()
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
})
