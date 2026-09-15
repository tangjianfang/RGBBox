// R99.3: "Nova Swarm" — Goobies-style survival arena. Player auto-fires at the
// nearest enemy, kills drop XP orbs, level-ups freeze the run for a pick-one-of-
// three upgrade card, and an adaptive director tightens or eases the spawn pace
// based on how well the run is going.
import { playSfx } from './sfx'
import { WIDTH, HEIGHT } from './td'

export type SurvivalPhase = 'ready' | 'running' | 'levelup' | 'lost'
export type UpgradeId = 'fireRate' | 'damage' | 'multishot' | 'pierce' | 'blade' | 'speed' | 'maxHp' | 'magnet' | 'crit' | 'bulletSpeed' | 'thorns' | 'regen'

export const BOSS_INTERVAL = 90

interface Point {
  x: number
  y: number
}

interface Enemy extends Point {
  id: number
  vx: number
  vy: number
  size: number
  hp: number
  maxHp: number
  kind: 'chaser' | 'sprinter' | 'brute' | 'boss'
  elite: boolean
  hitFlash: number
}

interface Bullet extends Point {
  id: number
  vx: number
  vy: number
  damage: number
  pierce: number
  crit: boolean
  life: number
}

interface Orb extends Point {
  id: number
  value: number
}

interface Particle extends Point {
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
}

interface FloatText extends Point {
  id: number
  text: string
  life: number
  color: string
}

interface Banner {
  text: string
  life: number
}

export interface PlayerState {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  hp: number
  maxHp: number
  invuln: number
  fireTimer: number
  angle: number
}

export interface PlayerStats {
  fireRate: number
  damage: number
  multishot: number
  pierce: number
  blade: number
  moveSpeed: number
  magnet: number
  crit: number
  bulletSpeed: number
  thorns: number
  regenInterval: number
}

export interface SurvivalState {
  phase: SurvivalPhase
  clock: number
  time: number
  score: number
  kills: number
  level: number
  xp: number
  xpNext: number
  shake: number
  nextId: number
  player: PlayerState
  stats: PlayerStats
  taken: Record<UpgradeId, number>
  offers: UpgradeId[]
  enemies: Enemy[]
  bullets: Bullet[]
  orbs: Orb[]
  particles: Particle[]
  texts: FloatText[]
  banner: Banner | null
  keys: Set<string>
  spawnTimer: number
  bossTimer: number
  regenTimer: number
  bladeAngle: number
  bladeTimer: number
  lastMinute: number
}

export interface UpgradeDef {
  id: UpgradeId
  accent: string
  max: number
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'fireRate', accent: '#67e8f9', max: 5 },
  { id: 'damage', accent: '#fb7185', max: 5 },
  { id: 'multishot', accent: '#fde68a', max: 3 },
  { id: 'pierce', accent: '#a78bfa', max: 3 },
  { id: 'blade', accent: '#38bdf8', max: 3 },
  { id: 'speed', accent: '#86efac', max: 4 },
  { id: 'maxHp', accent: '#f87171', max: 4 },
  { id: 'magnet', accent: '#4ade80', max: 3 },
  { id: 'crit', accent: '#fbbf24', max: 4 },
  { id: 'bulletSpeed', accent: '#e879f9', max: 3 },
  { id: 'thorns', accent: '#f472b6', max: 3 },
  { id: 'regen', accent: '#34d399', max: 2 },
]

export function xpToNext(level: number): number {
  return 5 + level * 3
}

function baseStats(): PlayerStats {
  return {
    fireRate: 2,
    damage: 1,
    multishot: 1,
    pierce: 0,
    blade: 0,
    moveSpeed: 170,
    magnet: 70,
    crit: 0,
    bulletSpeed: 420,
    thorns: 0,
    regenInterval: 0,
  }
}

export function recomputeStats(stats: PlayerStats, taken: Record<UpgradeId, number>): void {
  stats.fireRate = 2 * (1 + 0.22 * taken.fireRate)
  stats.damage = 1 + taken.damage
  stats.multishot = 1 + taken.multishot
  stats.pierce = taken.pierce
  stats.blade = taken.blade
  stats.moveSpeed = 170 * (1 + 0.12 * taken.speed)
  stats.magnet = 70 + 45 * taken.magnet
  stats.crit = 0.1 * taken.crit
  stats.bulletSpeed = 420 * (1 + 0.3 * taken.bulletSpeed)
  stats.thorns = taken.thorns
  stats.regenInterval = taken.regen === 0 ? 0 : taken.regen === 1 ? 30 : 16
}

export function initialSurvivalState(): SurvivalState {
  return {
    phase: 'ready',
    clock: 0,
    time: 0,
    score: 0,
    kills: 0,
    level: 1,
    xp: 0,
    xpNext: xpToNext(1),
    shake: 0,
    nextId: 1,
    player: { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0, size: 14, hp: 5, maxHp: 5, invuln: 0, fireTimer: 0, angle: -Math.PI / 2 },
    stats: baseStats(),
    taken: { fireRate: 0, damage: 0, multishot: 0, pierce: 0, blade: 0, speed: 0, maxHp: 0, magnet: 0, crit: 0, bulletSpeed: 0, thorns: 0, regen: 0 },
    offers: [],
    enemies: [],
    bullets: [],
    orbs: [],
    particles: [],
    texts: [],
    banner: null,
    keys: new Set<string>(),
    spawnTimer: 1,
    bossTimer: BOSS_INTERVAL,
    regenTimer: 0,
    bladeAngle: 0,
    bladeTimer: 0,
    lastMinute: 0,
  }
}

function key(state: SurvivalState, value: string): boolean {
  return state.keys.has(value)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function addText(state: SurvivalState, x: number, y: number, text: string, color: string): void {
  state.texts.push({ id: state.nextId++, x, y, text, color, life: 0.9 })
}

function spawnBurst(state: SurvivalState, x: number, y: number, color: string, count = 10, power = 130): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = power * (0.35 + Math.random() * 0.65)
    state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 30, life: 0.5 + Math.random() * 0.35, maxLife: 0.85, size: 2 + Math.random() * 3, color })
  }
}

export function startSurvival(state: SurvivalState): void {
  if (state.phase !== 'ready') return
  state.phase = 'running'
  state.banner = { text: 'SURVIVE', life: 1.5 }
  playSfx('wave')
}

export function restartSurvival(): SurvivalState {
  return initialSurvivalState()
}

/** Adaptive director: spawn interval tightens over time and with player level;
 * eases off when the player is one hit from death, tightens when untouched. */
export function directorSpawnInterval(state: SurvivalState): number {
  const minutes = state.time / 60
  const base = clamp(1.5 - minutes * 0.28 - state.level * 0.05, 0.32, 1.5)
  const factor = state.player.hp <= 1 ? 1.25 : state.player.hp >= state.player.maxHp ? 0.85 : 1
  return base * factor
}

function pickOffers(state: SurvivalState): UpgradeId[] {
  const pool = UPGRADES.filter((upgrade) => state.taken[upgrade.id] < upgrade.max)
  const offers: UpgradeId[] = []
  while (offers.length < 3 && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length)
    offers.push(pool[index].id)
    pool.splice(index, 1)
  }
  return offers
}

export function applyUpgrade(state: SurvivalState, id: UpgradeId): void {
  const def = UPGRADES.find((upgrade) => upgrade.id === id)
  if (!def || state.taken[id] >= def.max) return
  state.taken[id] += 1
  if (id === 'maxHp') {
    state.player.maxHp += 1
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 2)
  }
  recomputeStats(state.stats, state.taken)
  state.offers = []
  state.phase = 'running'
  spawnBurst(state, state.player.x, state.player.y, def.accent, 18, 150)
  addText(state, state.player.x, state.player.y - 30, `+${id}`, def.accent)
}

function spawnEnemy(state: SurvivalState): void {
  const side = Math.floor(Math.random() * 4)
  const x = side === 0 ? -30 : side === 1 ? WIDTH + 30 : Math.random() * WIDTH
  const y = side === 2 ? -30 : side === 3 ? HEIGHT + 30 : Math.random() * HEIGHT
  const elite = state.time > 60 && Math.random() < 0.08
  const scale = elite ? 2.5 : 1
  const roll = Math.random()
  if (state.time > 90 && roll < 0.12) {
    const hp = Math.round((10 + Math.floor(state.time / 15)) * scale)
    state.enemies.push({ id: state.nextId++, x, y, vx: 0, vy: 0, size: 20, hp, maxHp: hp, kind: 'brute', elite, hitFlash: 0 })
  } else if (state.time > 40 && roll < 0.34) {
    const hp = Math.round(2 * scale)
    state.enemies.push({ id: state.nextId++, x, y, vx: 0, vy: 0, size: 11, hp, maxHp: hp, kind: 'sprinter', elite, hitFlash: 0 })
  } else {
    const hp = Math.round((3 + Math.floor(state.time / 25)) * scale)
    state.enemies.push({ id: state.nextId++, x, y, vx: 0, vy: 0, size: 14, hp, maxHp: hp, kind: 'chaser', elite, hitFlash: 0 })
  }
}

function spawnBoss(state: SurvivalState): void {
  const hp = 60 + Math.floor(state.time / 10) * 6
  const side = Math.floor(Math.random() * 4)
  const x = side === 0 ? -50 : side === 1 ? WIDTH + 50 : Math.random() * WIDTH
  const y = side === 2 ? -50 : side === 3 ? HEIGHT + 50 : Math.random() * HEIGHT
  state.enemies.push({ id: state.nextId++, x, y, vx: 0, vy: 0, size: 34, hp, maxHp: hp, kind: 'boss', elite: false, hitFlash: 0 })
  state.banner = { text: 'BOSS INBOUND', life: 1.6 }
  playSfx('wave')
}

function killEnemy(state: SurvivalState, enemy: Enemy): void {
  state.kills += 1
  if (enemy.kind === 'boss') {
    spawnBurst(state, enemy.x, enemy.y, '#f472b6', 34, 260)
    spawnBurst(state, enemy.x, enemy.y, '#fde68a', 20, 180)
    for (let i = 0; i < 15; i++) {
      state.orbs.push({ id: state.nextId++, x: enemy.x + (Math.random() - 0.5) * 110, y: enemy.y + (Math.random() - 0.5) * 110, value: 1 })
    }
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 1)
    state.banner = { text: 'BOSS DOWN', life: 1.8 }
    state.shake = 8
    playSfx('levelup')
    return
  }
  const color = enemy.kind === 'brute' ? '#f472b6' : enemy.kind === 'sprinter' ? '#fbbf24' : '#fb7185'
  spawnBurst(state, enemy.x, enemy.y, color, enemy.kind === 'brute' ? 18 : 9, 140)
  const drops = enemy.elite || enemy.kind === 'brute' ? 3 : 1
  for (let i = 0; i < drops; i++) {
    state.orbs.push({ id: state.nextId++, x: enemy.x + (Math.random() - 0.5) * 18, y: enemy.y + (Math.random() - 0.5) * 18, value: 1 })
  }
}

export function tickSurvival(state: SurvivalState, dt: number): void {
  state.clock += dt
  state.shake = Math.max(0, state.shake - dt * 14)
  for (const text of state.texts) {
    text.y -= 28 * dt
    text.life -= dt
  }
  state.texts = state.texts.filter((text) => text.life > 0)
  for (const particle of state.particles) {
    particle.x += particle.vx * dt
    particle.y += particle.vy * dt
    particle.vy += 200 * dt
    particle.life -= dt
  }
  state.particles = state.particles.filter((particle) => particle.life > 0)
  if (state.banner) {
    state.banner.life -= dt
    if (state.banner.life <= 0) state.banner = null
  }
  if (state.phase !== 'running') return

  state.time += dt
  state.score = state.kills * 10 + Math.floor(state.time)
  const player = state.player
  const stats = state.stats
  player.invuln = Math.max(0, player.invuln - dt)

  const dx = (key(state, 'arrowright') || key(state, 'd') ? 1 : 0) - (key(state, 'arrowleft') || key(state, 'a') ? 1 : 0)
  const dy = (key(state, 'arrowdown') || key(state, 's') ? 1 : 0) - (key(state, 'arrowup') || key(state, 'w') ? 1 : 0)
  const len = Math.hypot(dx, dy) || 1
  player.x = clamp(player.x + (dx / len) * stats.moveSpeed * dt, 16, WIDTH - 16)
  player.y = clamp(player.y + (dy / len) * stats.moveSpeed * dt, 16, HEIGHT - 16)
  if (dx !== 0 || dy !== 0) {
    player.angle = Math.atan2(dy, dx)
    if (Math.random() < dt * 40) state.particles.push({ x: player.x - Math.cos(player.angle) * 14, y: player.y - Math.sin(player.angle) * 14, vx: -Math.cos(player.angle) * 60, vy: -Math.sin(player.angle) * 60, life: 0.3, maxLife: 0.3, size: 2.5, color: '#67e8f9' })
  }

  state.spawnTimer -= dt
  if (state.spawnTimer <= 0) {
    spawnEnemy(state)
    if (state.time > 60 && Math.random() < 0.35) spawnEnemy(state)
    state.spawnTimer = directorSpawnInterval(state)
  }
  state.bossTimer -= dt
  if (state.bossTimer <= 0) {
    spawnBoss(state)
    state.bossTimer = BOSS_INTERVAL
  }
  if (stats.regenInterval > 0 && player.hp < player.maxHp) {
    state.regenTimer += dt
    if (state.regenTimer >= stats.regenInterval) {
      state.regenTimer = 0
      player.hp += 1
      addText(state, player.x, player.y - 34, '+HP', '#34d399')
      spawnBurst(state, player.x, player.y, '#34d399', 8, 90)
    }
  }

  player.fireTimer -= dt
  if (player.fireTimer <= 0 && state.enemies.length > 0) {
    let nearest: Enemy | undefined
    let bestDist = Number.POSITIVE_INFINITY
    for (const enemy of state.enemies) {
      const dist = distance(player, enemy)
      if (dist < bestDist) {
        nearest = enemy
        bestDist = dist
      }
    }
    if (nearest) {
      const baseAngle = Math.atan2(nearest.y - player.y, nearest.x - player.x)
      const shots = stats.multishot
      for (let i = 0; i < shots; i++) {
        const spread = (i - (shots - 1) / 2) * (Math.PI / 14)
        const angle = baseAngle + spread
        const crit = Math.random() < stats.crit
        state.bullets.push({ id: state.nextId++, x: player.x, y: player.y, vx: Math.cos(angle) * stats.bulletSpeed, vy: Math.sin(angle) * stats.bulletSpeed, damage: crit ? stats.damage * 2 : stats.damage, pierce: stats.pierce, crit, life: 1.2 })
      }
      playSfx('shoot')
    }
    player.fireTimer = 1 / stats.fireRate
  }

  state.bladeAngle += dt * 2.8
  state.bladeTimer += dt
  if (stats.blade > 0 && state.bladeTimer >= 0.25) {
    state.bladeTimer = 0
    for (let i = 0; i < stats.blade; i++) {
      const angle = state.bladeAngle + (i * Math.PI * 2) / stats.blade
      const bx = player.x + Math.cos(angle) * 78
      const by = player.y + Math.sin(angle) * 78
      for (const enemy of state.enemies) {
        if (distance({ x: bx, y: by }, enemy) < 16 + enemy.size) {
          enemy.hp -= stats.damage
          enemy.hitFlash = 0.1
        }
      }
    }
  }

  for (const bullet of state.bullets) {
    bullet.x += bullet.vx * dt
    bullet.y += bullet.vy * dt
    bullet.life -= dt
    for (const enemy of state.enemies) {
      if (bullet.pierce < 0 || bullet.life <= 0) break
      if (distance(bullet, enemy) < 5 + enemy.size) {
        enemy.hp -= bullet.damage
        enemy.hitFlash = 0.1
        enemy.x += bullet.vx * dt * 0.5
        enemy.y += bullet.vy * dt * 0.5
        bullet.pierce -= 1
        spawnBurst(state, bullet.x, bullet.y, bullet.crit ? '#fbbf24' : '#67e8f9', 3, 60)
        playSfx('hit')
      }
    }
  }
  state.bullets = state.bullets.filter((bullet) => bullet.life > 0 && bullet.pierce >= 0 && bullet.x > -20 && bullet.x < WIDTH + 20 && bullet.y > -20 && bullet.y < HEIGHT + 20)

  const speedFor = (enemy: Enemy): number => {
    if (enemy.kind === 'sprinter') return 132
    if (enemy.kind === 'brute') return 40
    if (enemy.kind === 'boss') return 34
    return Math.min(112, 64 + state.time * 0.12)
  }
  for (const enemy of state.enemies) {
    const dist = Math.max(1, distance(enemy, player))
    const speed = speedFor(enemy)
    enemy.x += ((player.x - enemy.x) / dist) * speed * dt
    enemy.y += ((player.y - enemy.y) / dist) * speed * dt
    enemy.hitFlash = Math.max(0, enemy.hitFlash - dt)
    if (player.invuln <= 0 && distance(enemy, player) < enemy.size + player.size) {
      player.hp -= 1
      player.invuln = 0.9
      state.shake = enemy.kind === 'boss' ? 9 : 6
      playSfx('hurt')
      spawnBurst(state, player.x, player.y, '#f87171', 12, 150)
      enemy.x -= (player.x - enemy.x) / dist * 46
      enemy.y -= (player.y - enemy.y) / dist * 46
      if (stats.thorns > 0) {
        enemy.hp -= stats.thorns
        enemy.hitFlash = 0.1
      }
      if (player.hp <= 0) {
        state.phase = 'lost'
        spawnBurst(state, player.x, player.y, '#f87171', 30, 230)
        playSfx('gameover')
        return
      }
    }
  }
  for (let i = 0; i < state.enemies.length; i++) {
    for (let j = i + 1; j < state.enemies.length; j++) {
      const a = state.enemies[i]
      const b = state.enemies[j]
      const dist = distance(a, b)
      const min = a.size + b.size
      if (dist < min && dist > 0.01) {
        const push = ((min - dist) / 2) * 0.35
        const nx = (b.x - a.x) / dist
        const ny = (b.y - a.y) / dist
        a.x -= nx * push
        a.y -= ny * push
        b.x += nx * push
        b.y += ny * push
      }
    }
  }

  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) killEnemy(state, enemy)
  }
  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0)
  if (state.enemies.length > 0) state.score = state.kills * 10 + Math.floor(state.time)

  state.orbs = state.orbs.filter((orb) => {
    const dist = distance(orb, player)
    if (dist < stats.magnet) {
      const speed = 260
      orb.x += ((player.x - orb.x) / dist) * speed * dt
      orb.y += ((player.y - orb.y) / dist) * speed * dt
    }
    if (dist < player.size + 8) {
      state.xp += orb.value
      playSfx('xp')
      return false
    }
    return true
  })

  if (state.xp >= state.xpNext) {
    state.xp -= state.xpNext
    state.level += 1
    state.xpNext = xpToNext(state.level)
    state.offers = pickOffers(state)
    if (state.offers.length > 0) {
      state.phase = 'levelup'
      state.banner = { text: `LEVEL ${state.level}`, life: 1.4 }
      playSfx('levelup')
    }
  }

  const minute = Math.floor(state.time / 60)
  if (minute > state.lastMinute) {
    state.lastMinute = minute
    state.banner = { text: `${minute} MIN SURVIVED`, life: 1.6 }
    playSfx('wave')
  }
}

const STARS = Array.from({ length: 42 }, (_, i) => ({
  x: (Math.sin(i * 127.3) * 0.5 + 0.5) * WIDTH,
  y: (Math.sin(i * 311.7) * 0.5 + 0.5) * HEIGHT,
  size: (Math.sin(i * 73.1) * 0.5 + 0.5) * 1.6 + 0.6,
  phase: (Math.sin(i * 45.7) * 0.5 + 0.5) * Math.PI * 2,
}))

function drawOverlay(ctx: CanvasRenderingContext2D, title: string, subtitle: string, footer = ''): void {
  ctx.fillStyle = 'rgba(5, 10, 14, 0.68)'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  ctx.fillStyle = '#e2f8ff'
  ctx.font = '800 34px Inter, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(title, WIDTH / 2, HEIGHT / 2 - 30)
  ctx.fillStyle = '#9fb7c1'
  ctx.font = '500 15px Inter, sans-serif'
  ctx.fillText(subtitle, WIDTH / 2, HEIGHT / 2 + 14)
  if (footer) {
    ctx.fillStyle = '#c9ecff'
    ctx.font = '600 13px Inter, sans-serif'
    ctx.fillText(footer, WIDTH / 2, HEIGHT / 2 + 56)
  }
}

export function drawSurvival(ctx: CanvasRenderingContext2D, state: SurvivalState, best: number): void {
  const player = state.player
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  ctx.save()
  if (state.shake > 0.2) ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake)
  ctx.fillStyle = '#050a12'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  for (const star of STARS) {
    ctx.globalAlpha = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(state.clock * 2 + star.phase))
    ctx.fillStyle = '#9fb7c1'
    ctx.fillRect(star.x - player.x * 0.02, star.y - player.y * 0.02, star.size, star.size)
  }
  ctx.globalAlpha = 1

  for (const orb of state.orbs) {
    ctx.save()
    ctx.translate(orb.x, orb.y)
    ctx.rotate(Math.PI / 4)
    ctx.fillStyle = '#4ade80'
    ctx.shadowColor = '#4ade80'
    ctx.shadowBlur = 8
    ctx.fillRect(-4, -4, 8, 8)
    ctx.restore()
    ctx.shadowBlur = 0
  }

  if (state.stats.blade > 0) {
    for (let i = 0; i < state.stats.blade; i++) {
      const angle = state.bladeAngle + (i * Math.PI * 2) / state.stats.blade
      const bx = player.x + Math.cos(angle) * 78
      const by = player.y + Math.sin(angle) * 78
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(player.x + Math.cos(angle - 0.5) * 78, player.y + Math.sin(angle - 0.5) * 78)
      ctx.lineTo(bx, by)
      ctx.stroke()
      ctx.fillStyle = '#38bdf8'
      ctx.beginPath(); ctx.arc(bx, by, 7, 0, Math.PI * 2); ctx.fill()
    }
  }

  for (const bullet of state.bullets) {
    ctx.strokeStyle = bullet.crit ? 'rgba(251, 191, 36, 0.6)' : 'rgba(103, 232, 249, 0.5)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(bullet.x - bullet.vx * 0.02, bullet.y - bullet.vy * 0.02)
    ctx.lineTo(bullet.x, bullet.y)
    ctx.stroke()
    ctx.fillStyle = bullet.crit ? '#fbbf24' : '#67e8f9'
    ctx.beginPath(); ctx.arc(bullet.x, bullet.y, bullet.crit ? 4 : 3, 0, Math.PI * 2); ctx.fill()
  }

  for (const enemy of state.enemies) {
    if (enemy.elite) {
      ctx.shadowColor = '#fde68a'
      ctx.shadowBlur = 14
    }
    ctx.fillStyle = enemy.hitFlash > 0 ? '#ffffff' : enemy.kind === 'brute' ? '#f472b6' : enemy.kind === 'sprinter' ? '#fbbf24' : '#fb7185'
    if (enemy.kind === 'boss') {
      ctx.save()
      ctx.translate(enemy.x, enemy.y)
      ctx.rotate(state.clock * 0.8)
      ctx.fillStyle = enemy.hitFlash > 0 ? '#ffffff' : '#db2777'
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3
        const px = Math.cos(angle) * enemy.size
        const py = Math.sin(angle) * enemy.size
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath(); ctx.fill()
      ctx.strokeStyle = '#f9a8d4'
      ctx.lineWidth = 3
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3
        ctx.beginPath()
        ctx.moveTo(Math.cos(angle) * enemy.size, Math.sin(angle) * enemy.size)
        ctx.lineTo(Math.cos(angle) * (enemy.size + 12), Math.sin(angle) * (enemy.size + 12))
        ctx.stroke()
      }
      ctx.restore()
    } else if (enemy.kind === 'sprinter') {
      const angle = Math.atan2(state.player.y - enemy.y, state.player.x - enemy.x)
      ctx.save(); ctx.translate(enemy.x, enemy.y); ctx.rotate(angle)
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-9, -8); ctx.lineTo(-9, 8); ctx.closePath(); ctx.fill()
      ctx.restore()
    } else if (enemy.kind === 'brute') {
      ctx.fillRect(enemy.x - enemy.size, enemy.y - enemy.size, enemy.size * 2, enemy.size * 2)
    } else {
      ctx.beginPath(); ctx.arc(enemy.x, enemy.y, enemy.size, 0, Math.PI * 2); ctx.fill()
    }
    ctx.shadowBlur = 0
    if (enemy.kind !== 'boss' && enemy.hp < enemy.maxHp) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
      ctx.fillRect(enemy.x - 14, enemy.y - enemy.size - 10, 28, 3)
      ctx.fillStyle = '#86efac'
      ctx.fillRect(enemy.x - 14, enemy.y - enemy.size - 10, 28 * (enemy.hp / enemy.maxHp), 3)
    }
  }

  const boss = state.enemies.find((enemy) => enemy.kind === 'boss')
  if (boss) {
    ctx.fillStyle = 'rgba(219, 39, 119, 0.25)'
    ctx.fillRect(WIDTH / 2 - 160, 64, 320, 10)
    ctx.fillStyle = '#f472b6'
    ctx.fillRect(WIDTH / 2 - 160, 64, 320 * clamp(boss.hp / boss.maxHp, 0, 1), 10)
    ctx.fillStyle = '#f9a8d4'
    ctx.font = '800 12px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText('BOSS', WIDTH / 2, 58)
  }

  for (const particle of state.particles) {
    ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1)
    ctx.fillStyle = particle.color
    ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
  }

  if (!(player.invuln > 0 && Math.floor(player.invuln * 12) % 2 === 0)) {
    ctx.save()
    ctx.translate(player.x, player.y)
    ctx.rotate(player.angle)
    ctx.fillStyle = '#e2f8ff'
    ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-10, -10); ctx.lineTo(-5, 0); ctx.lineTo(-10, 10); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#67e8f9'
    ctx.beginPath(); ctx.arc(2, 0, 4, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }

  for (const text of state.texts) {
    ctx.globalAlpha = clamp(text.life, 0, 1)
    ctx.fillStyle = text.color
    ctx.font = '800 13px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(text.text, text.x, text.y)
    ctx.globalAlpha = 1
  }

  for (let i = 0; i < player.hp; i++) {
    ctx.fillStyle = '#f87171'
    ctx.beginPath()
    ctx.arc(28 + i * 22, 30, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#050a12'
    ctx.beginPath()
    ctx.arc(28 + i * 22, 30, 3, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.fillStyle = 'rgba(74, 222, 128, 0.18)'
  ctx.fillRect(40, HEIGHT - 22, WIDTH - 80, 8)
  ctx.fillStyle = '#4ade80'
  ctx.fillRect(40, HEIGHT - 22, (WIDTH - 80) * clamp(state.xp / state.xpNext, 0, 1), 8)
  ctx.fillStyle = '#9fb7c1'
  ctx.font = '700 12px Inter, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(`LV ${state.level}`, 40, HEIGHT - 34)

  if (state.banner) {
    ctx.globalAlpha = clamp(state.banner.life / 0.5, 0, 1)
    ctx.fillStyle = '#e2f8ff'
    ctx.font = '800 44px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(state.banner.text, WIDTH / 2, 110)
    ctx.globalAlpha = 1
  }
  ctx.restore()
  if (state.phase === 'ready') {
    drawOverlay(ctx, 'Nova Swarm', 'Auto-fire survival: move, collect XP, pick upgrades, outlast the swarm.', best > 0 ? `Best ★${best}` : '')
  } else if (state.phase === 'lost') {
    drawOverlay(ctx, 'Swarmed', `Level ${state.level} · ${state.kills} kills · ${Math.floor(state.time)}s`, `Score ★${state.score} · Best ★${best} — Press Start to play again`)
  }
}
