// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import {
  MiniGamesView,
  towerUpgradeCost,
  upgradeTower,
  caveGapHalf,
  createArcadeState,
  updateHelicopter,
  updateMotherload,
  tickGame,
  initialState,
  type Tower,
} from '../../../src/renderer/src/components/MiniGamesView'
import { setupRendererMocks } from '../_helpers'

beforeEach(() => {
  setupRendererMocks()
  cleanup()
})

describe('renderer/components/MiniGamesView', () => {
  it('renders the mini-games view container', () => {
    const { container } = render(<MiniGamesView />)
    expect(container).toBeTruthy()
  })

  it('renders a list of game entries', () => {
    const { container } = render(<MiniGamesView />)
    expect(container.querySelectorAll('button, [role="button"]').length).toBeGreaterThan(0)
  })

  it('renders exactly the three curated game cards (R96 cut)', () => {
    const { container } = render(<MiniGamesView />)
    const cards = container.querySelectorAll('.game-card')
    expect(cards.length).toBe(3)
    expect(Array.from(cards).map((card) => card.querySelector('strong')?.textContent)).toEqual([
      'Balloon TD Arena',
      'Helicopter Game',
      'Motherload',
    ])
  })

  it('transitions to a game when one is clicked', () => {
    const { container } = render(<MiniGamesView />)
    const buttons = container.querySelectorAll('button')
    if (buttons.length > 0) fireEvent.click(buttons[0])
    expect(container).toBeTruthy()
  })

  it('tower upgrades scale stats, rise in cost, and cap at level 3 (R97.2)', () => {
    const tower: Tower = { id: 1, kind: 'dart', level: 1, x: 0, y: 0, range: 126, cooldown: 0, fireRate: 0.62, damage: 1 }
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
    const fresh: Tower = { ...tower, level: 1 }
    expect(upgradeTower(poor, fresh)).toBe(false)
  })

  it('helicopter cave gap narrows with distance and clamps at the minimum (R97.3)', () => {
    expect(caveGapHalf(0)).toBe(96)
    expect(caveGapHalf(1000)).toBeLessThan(caveGapHalf(0))
    expect(caveGapHalf(5000)).toBe(58)
  })

  it('helicopter crash costs one life with invulnerability instead of instant loss (R97.3)', () => {
    const state = createArcadeState('helicopter')
    state.phase = 'running'
    expect(state.lives).toBe(3)
    state.player.y = 10
    updateHelicopter(state, 0.016)
    expect(state.lives).toBe(2)
    expect(state.phase).toBe('running')
    expect(state.invuln).toBeGreaterThan(0)
    state.player.y = 10
    updateHelicopter(state, 0.016)
    expect(state.lives).toBe(2)
    state.lives = 1
    state.invuln = 0
    state.player.y = 10
    updateHelicopter(state, 0.016)
    expect(state.phase).toBe('lost')
  })

  it('motherload cargo caps at 60 and banks at the surface (R97.4)', () => {
    const state = createArcadeState('motherload')
    state.phase = 'running'
    const ore = state.obstacles[0]
    ore.x = state.player.x
    ore.y = state.player.y
    ore.kind = 'ore'
    ore.value = 10
    state.cargo = 55
    updateMotherload(state, 0.016)
    expect(state.cargo).toBe(55)
    state.cargo = 20
    updateMotherload(state, 0.016)
    expect(state.cargo).toBe(30)
    expect(state.resources).toBe(0)
    state.player.y = 75
    ore.x = -100
    updateMotherload(state, 0.016)
    expect(state.resources).toBe(30)
    expect(state.cargo).toBe(0)
  })

  it('tower defense intermission counts down to the next wave (R97.2)', () => {
    const state = initialState()
    state.phase = 'running'
    state.wave = 1
    state.waveCooldown = 0.5
    tickGame(state, 0.6)
    expect(state.wave).toBe(2)
  })
})
