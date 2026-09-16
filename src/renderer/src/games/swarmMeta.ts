// R101: Goobies-FRD-inspired meta layer for Nova Swarm — characters, upgrade
// rarities, permanent coin upgrades, and roulette rolls. Pure data + pure
// functions; the engine and UI both consume this, nothing here imports back.

export type UpgradeId = 'fireRate' | 'damage' | 'multishot' | 'pierce' | 'blade' | 'speed' | 'maxHp' | 'magnet' | 'crit' | 'bulletSpeed' | 'thorns' | 'regen'
export type Rarity = 0 | 1 | 2 | 3

export interface UpgradeDef {
  id: UpgradeId
  accent: string
  max: number
  rarity: Rarity
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'fireRate', accent: '#67e8f9', max: 5, rarity: 1 },
  { id: 'damage', accent: '#fb7185', max: 5, rarity: 2 },
  { id: 'multishot', accent: '#fde68a', max: 3, rarity: 3 },
  { id: 'pierce', accent: '#a78bfa', max: 3, rarity: 3 },
  { id: 'blade', accent: '#38bdf8', max: 3, rarity: 3 },
  { id: 'speed', accent: '#86efac', max: 4, rarity: 1 },
  { id: 'maxHp', accent: '#f87171', max: 4, rarity: 1 },
  { id: 'magnet', accent: '#4ade80', max: 3, rarity: 1 },
  { id: 'crit', accent: '#fbbf24', max: 4, rarity: 2 },
  { id: 'bulletSpeed', accent: '#e879f9', max: 3, rarity: 0 },
  { id: 'thorns', accent: '#f472b6', max: 3, rarity: 0 },
  { id: 'regen', accent: '#34d399', max: 2, rarity: 2 },
]

export const RARITY_WEIGHTS = [60, 25, 10, 5]
export const RARITY_COLORS = ['#9aa5ad', '#60a5fa', '#f472b6', '#fde047']
export const RARITY_LEVELS = [1, 2, 3, 4]
export const DISSOLVE_XP = [12, 25, 45, 80]

export type CharacterId = 'wisp' | 'bulwark' | 'volt'

export interface CharacterDef {
  id: CharacterId
  accent: string
  hpMod: number
  speedMod: number
  innateThorns: number
  innateBlade: number
  fireRateMod: number
  xpMod: number
}

export const CHARACTERS: CharacterDef[] = [
  { id: 'wisp', accent: '#67e8f9', hpMod: 0, speedMod: 1, innateThorns: 0, innateBlade: 0, fireRateMod: 1, xpMod: 1.12 },
  { id: 'bulwark', accent: '#f59e0b', hpMod: 3, speedMod: 0.82, innateThorns: 1, innateBlade: 0, fireRateMod: 1, xpMod: 1 },
  { id: 'volt', accent: '#f0abfc', hpMod: -1, speedMod: 1.12, innateThorns: 0, innateBlade: 1, fireRateMod: 1.15, xpMod: 1 },
]

export function characterById(id: CharacterId): CharacterDef {
  return CHARACTERS.find((character) => character.id === id) ?? CHARACTERS[0]
}

export type PermKey = 'damage' | 'fireRate' | 'moveSpeed' | 'maxHp' | 'xpGain' | 'luck'
export type PermMap = Record<PermKey, number>

export interface PermDef {
  key: PermKey
  baseCost: number
}

export const PERM_UPGRADES: PermDef[] = [
  { key: 'damage', baseCost: 60 },
  { key: 'fireRate', baseCost: 60 },
  { key: 'moveSpeed', baseCost: 50 },
  { key: 'maxHp', baseCost: 80 },
  { key: 'xpGain', baseCost: 70 },
  { key: 'luck', baseCost: 90 },
]

export const PERM_MAX = 3

export const EMPTY_PERM: PermMap = { damage: 0, fireRate: 0, moveSpeed: 0, maxHp: 0, xpGain: 0, luck: 0 }

export interface SwarmMeta {
  coins: number
  perm: PermMap
  stats: RunStats
  artifacts: Partial<Record<ArtifactId, boolean>>
  achievements: Record<string, boolean>
}

const META_KEY = 'rgbbox:gamesMeta:swarm'
const CHAR_KEY = 'rgbbox:swarmChar'

export function readMeta(): SwarmMeta {
  try {
    const raw = localStorage.getItem(META_KEY)
    if (!raw) return { coins: 0, perm: { ...EMPTY_PERM }, stats: { ...EMPTY_STATS }, artifacts: {}, achievements: {} }
    const parsed = JSON.parse(raw) as Partial<SwarmMeta>
    return {
      coins: Number.isFinite(parsed.coins) && (parsed.coins as number) > 0 ? Math.floor(parsed.coins as number) : 0,
      perm: { ...EMPTY_PERM, ...(parsed.perm ?? {}) },
      stats: { ...EMPTY_STATS, ...(parsed.stats ?? {}) },
      artifacts: { ...(parsed.artifacts ?? {}) },
      achievements: { ...(parsed.achievements ?? {}) },
    }
  } catch {
    return { coins: 0, perm: { ...EMPTY_PERM }, stats: { ...EMPTY_STATS }, artifacts: {}, achievements: {} }
  }
}

export function writeMeta(meta: SwarmMeta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta))
  } catch {
    return
  }
}

export function readCharacter(): CharacterId {
  try {
    const raw = localStorage.getItem(CHAR_KEY)
    if (raw === 'wisp' || raw === 'bulwark' || raw === 'volt') return raw
  } catch {
    // fall through to default
  }
  return 'wisp'
}

export function writeCharacter(id: CharacterId): void {
  try {
    localStorage.setItem(CHAR_KEY, id)
  } catch {
    return
  }
}

export function permCost(def: PermDef, level: number): number {
  return def.baseCost * (level + 1)
}

export function buyPerm(meta: SwarmMeta, key: PermKey): SwarmMeta | null {
  const def = PERM_UPGRADES.find((upgrade) => upgrade.key === key)
  if (!def) return null
  const level = meta.perm[key]
  if (level >= PERM_MAX) return null
  const cost = permCost(def, level)
  if (meta.coins < cost) return null
  return { coins: meta.coins - cost, perm: { ...meta.perm, [key]: level + 1 }, stats: meta.stats, artifacts: meta.artifacts, achievements: meta.achievements }
}

export function runCoins(score: number): number {
  return Math.floor(score / 20)
}

// ── R104: artifacts — rule changers with score risk multipliers ──

export type ArtifactId = 'mutantis' | 'glass' | 'swift' | 'famine' | 'pain' | 'bounty' | 'chrono' | 'magnetWell'

export interface RunStats {
  runs: number
  totalKills: number
  bosses: number
  bestCombo: number
  bestScore: number
}

export const EMPTY_STATS: RunStats = { runs: 0, totalKills: 0, bosses: 0, bestCombo: 0, bestScore: 0 }

export interface ArtifactDef {
  id: ArtifactId
  mult: number
  unlock: (stats: RunStats) => boolean
}

export const ARTIFACTS: ArtifactDef[] = [
  { id: 'mutantis', mult: 0.15, unlock: (stats) => stats.totalKills >= 500 },
  { id: 'glass', mult: 0.3, unlock: (stats) => stats.bestScore >= 1500 },
  { id: 'swift', mult: 0.2, unlock: (stats) => stats.totalKills >= 1500 },
  { id: 'famine', mult: 0.2, unlock: (stats) => stats.runs >= 5 },
  { id: 'pain', mult: 0.15, unlock: (stats) => stats.bosses >= 3 },
  { id: 'bounty', mult: -0.1, unlock: (stats) => stats.totalKills >= 1000 },
  { id: 'chrono', mult: 0.1, unlock: (stats) => stats.bestCombo >= 15 },
  { id: 'magnetWell', mult: -0.1, unlock: (stats) => stats.runs >= 3 },
]

export function artifactById(id: ArtifactId): ArtifactDef {
  return ARTIFACTS.find((artifact) => artifact.id === id) ?? ARTIFACTS[0]
}

export function isArtifactUnlocked(def: ArtifactDef, stats: RunStats): boolean {
  return def.unlock(stats)
}

export function scoreMultiplier(artifacts: ArtifactId[]): number {
  return artifacts.reduce((sum, id) => sum + artifactById(id).mult, 0)
}

export function runCoinsFor(score: number, coinMult: number): number {
  return Math.floor((score / 20) * coinMult)
}

// ── R105: achievements — pure functions over run stats ──

export type AchievementId = 'firstRun' | 'runs10' | 'kills100' | 'kills1000' | 'kills5000' | 'score1000' | 'score5000' | 'score20000' | 'boss1' | 'boss10' | 'combo10' | 'combo25'

export interface AchievementDef {
  id: AchievementId
  check: (stats: RunStats) => boolean
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'firstRun', check: (s) => s.runs >= 1 },
  { id: 'runs10', check: (s) => s.runs >= 10 },
  { id: 'kills100', check: (s) => s.totalKills >= 100 },
  { id: 'kills1000', check: (s) => s.totalKills >= 1000 },
  { id: 'kills5000', check: (s) => s.totalKills >= 5000 },
  { id: 'score1000', check: (s) => s.bestScore >= 1000 },
  { id: 'score5000', check: (s) => s.bestScore >= 5000 },
  { id: 'score20000', check: (s) => s.bestScore >= 20000 },
  { id: 'boss1', check: (s) => s.bosses >= 1 },
  { id: 'boss10', check: (s) => s.bosses >= 10 },
  { id: 'combo10', check: (s) => s.bestCombo >= 10 },
  { id: 'combo25', check: (s) => s.bestCombo >= 25 },
]

export function checkAchievements(stats: RunStats): string[] {
  return ACHIEVEMENTS.filter((achievement) => achievement.check(stats)).map((achievement) => achievement.id)
}

export type RouletteStat = 'damage' | 'fireRate' | 'moveSpeed' | 'magnet' | 'crit'
export const ROULETTE_STATS: RouletteStat[] = ['damage', 'fireRate', 'moveSpeed', 'magnet', 'crit']

export type RouletteResult =
  | { kind: 'item'; upgradeId: UpgradeId; levels: number; rarity: Rarity; xpValue: number }
  | { kind: 'stat'; stat: RouletteStat; pct: number; rarity: Rarity; xpValue: number }

export function rollRarity(luck = 0): Rarity {
  const weights = RARITY_WEIGHTS.map((weight, index) => (index >= 2 ? weight * (1 + luck) : weight))
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let roll = Math.random() * total
  for (let index = 0; index < weights.length; index++) {
    roll -= weights[index]
    if (roll <= 0) return index as Rarity
  }
  return 0
}

export function pickOffers(taken: Record<UpgradeId, number>, count = 3, luck = 0): UpgradeId[] {
  const pool = UPGRADES.filter((upgrade) => taken[upgrade.id] < upgrade.max)
  const offers: UpgradeId[] = []
  while (offers.length < count && pool.length > 0) {
    const weights = pool.map((upgrade) => (upgrade.rarity >= 2 ? RARITY_WEIGHTS[upgrade.rarity] * (1 + luck) : RARITY_WEIGHTS[upgrade.rarity]))
    const total = weights.reduce((sum, weight) => sum + weight, 0)
    let roll = Math.random() * total
    let picked = 0
    for (let index = 0; index < pool.length; index++) {
      roll -= weights[index]
      if (roll <= 0) {
        picked = index
        break
      }
    }
    offers.push(pool[picked].id)
    pool.splice(picked, 1)
  }
  return offers
}

export function rollRouletteItem(taken: Record<UpgradeId, number>, luck = 0): RouletteResult {
  const pool = UPGRADES.filter((upgrade) => taken[upgrade.id] < upgrade.max)
  const rarity = rollRarity(luck)
  if (pool.length === 0) {
    return { kind: 'stat', stat: ROULETTE_STATS[Math.floor(Math.random() * ROULETTE_STATS.length)], pct: 10 + Math.floor(Math.random() * 21), rarity, xpValue: DISSOLVE_XP[rarity] }
  }
  const upgrade = pool[Math.floor(Math.random() * pool.length)]
  const levels = Math.min(RARITY_LEVELS[rarity], upgrade.max - taken[upgrade.id])
  return { kind: 'item', upgradeId: upgrade.id, levels: Math.max(1, levels), rarity, xpValue: DISSOLVE_XP[rarity] }
}

export function rollRouletteStat(luck = 0): RouletteResult {
  const rarity = rollRarity(luck)
  return { kind: 'stat', stat: ROULETTE_STATS[Math.floor(Math.random() * ROULETTE_STATS.length)], pct: 10 + Math.floor(Math.random() * 21), rarity, xpValue: DISSOLVE_XP[rarity] }
}
