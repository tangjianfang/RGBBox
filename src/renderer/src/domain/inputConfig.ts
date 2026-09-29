/**
 * R213: 输入配置中心(域层纯数据)——四玩家键位 + 手柄绑定。
 *
 * 现状对齐:Swarm P1 = wasd/arrow* 直写引擎 state.keys(视层 keydown 原样
 * 写入,双通道由引擎硬编码保留);P2 = keys2 池(ijkl→p2up/p2down/p2left/
 * p2right)。R213-TA 并行改造 players/inputs 数组(P3/P4 池名前缀 p3/p4),
 * 本模块只提供配置数据与映射生成,不依赖引擎实现细节。
 */

export interface PlayerInputConfig {
  /** 四方向键名(规范化小写,如 'w'、'arrowup'、'i'、'space')。 */
  up: string
  down: string
  left: string
  right: string
  /** 绑定的手柄索引(null=无手柄,键盘专用)。 */
  gamepad: number | null
}

export type InputConfigs = [PlayerInputConfig, PlayerInputConfig, PlayerInputConfig, PlayerInputConfig]

/** P2 默认键位——与引擎现状 keys2(IJKL)逐字对齐。 */
export const P2_DEFAULT: PlayerInputConfig = { up: 'i', down: 'k', left: 'j', right: 'l', gamepad: null }

// 默认键位表原则:四玩家 16 键互不冲突,且避开 P1/P2 已占用的常用键簇。
// P3 = TFGH 主行簇(避开 wasd/ijkl);P4 = 小键盘十字(NumLock 开启时
// event.key 即数字)。P1 默认占手柄 0——对齐现状「第一只手柄喂 P1 摇杆」。
const P1_DEFAULT: PlayerInputConfig = { up: 'w', down: 's', left: 'a', right: 'd', gamepad: 0 }
const P3_DEFAULT: PlayerInputConfig = { up: 't', down: 'g', left: 'f', right: 'h', gamepad: null }
const P4_DEFAULT: PlayerInputConfig = { up: '8', down: '2', left: '4', right: '6', gamepad: null }

export const DEFAULT_INPUTS: InputConfigs = [P1_DEFAULT, { ...P2_DEFAULT }, P3_DEFAULT, P4_DEFAULT]

const STORAGE_KEY = 'rgbbox:gameInputs'
const DIRECTIONS = ['up', 'down', 'left', 'right'] as const

function cloneInputs(c: InputConfigs): InputConfigs {
  return c.map((player) => ({ ...player })) as InputConfigs
}

/** 规范化键名:'ArrowUp'→'arrowup',空格 ' '→'space'。 */
export function normalizeKey(e: { key: string }): string {
  return e.key === ' ' ? 'space' : e.key.toLowerCase()
}

function isPlayerConfig(v: unknown): v is PlayerInputConfig {
  if (typeof v !== 'object' || v === null) return false
  const p = v as Record<string, unknown>
  return (
    DIRECTIONS.every((d) => typeof p[d] === 'string' && p[d].length > 0) &&
    (p.gamepad === null || Number.isInteger(p.gamepad))
  )
}

/**
 * 读取输入配置(rgbbox:gameInputs)。整体损坏(不可解析/非 4 元数组)回
 * 全默认;单个玩家条目损坏仅该条回默认,其余保留。键名加载时规范化。
 */
export function loadInputConfigs(storage: Storage): InputConfigs {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return cloneInputs(DEFAULT_INPUTS)
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length !== 4) return cloneInputs(DEFAULT_INPUTS)
    return DEFAULT_INPUTS.map((def, i) => {
      if (!isPlayerConfig(parsed[i])) return { ...def }
      const p = parsed[i]
      return {
        up: normalizeKey({ key: p.up }),
        down: normalizeKey({ key: p.down }),
        left: normalizeKey({ key: p.left }),
        right: normalizeKey({ key: p.right }),
        gamepad: p.gamepad,
      }
    }) as InputConfigs
  } catch {
    return cloneInputs(DEFAULT_INPUTS)
  }
}

/** 写入输入配置(best-effort,存储异常静默)。 */
export function saveInputConfigs(storage: Storage, c: InputConfigs): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(c))
  } catch {
    return
  }
}

/** 冲突检测:同键位被多个玩家/多方向占用 → 返回冲突描述数组(空=无冲突)。 */
export function findKeyConflicts(c: InputConfigs): string[] {
  const owners = new Map<string, string[]>()
  c.forEach((player, pi) => {
    DIRECTIONS.forEach((d) => {
      const key = normalizeKey({ key: player[d] })
      const label = `P${pi + 1}.${d}`
      owners.set(key, [...(owners.get(key) ?? []), label])
    })
  })
  const conflicts: string[] = []
  for (const [key, labels] of owners) {
    if (labels.length > 1) conflicts.push(`键位 '${key}' 同时绑定: ${labels.join(', ')}`)
  }
  return conflicts
}

/**
 * 键→池名映射(引擎输入):如 { i:'p2up', t:'p3up', '8':'p4up', … }。
 * P1 特例:键位仍直写引擎 keys(兼容现状),映射表只覆盖 P2-P4。
 * 冲突键后写者覆盖先写者——调用方应先用 findKeyConflicts 校验。
 */
export function buildKeyToPoolMap(c: InputConfigs): Record<string, string> {
  const map: Record<string, string> = {}
  for (let pi = 1; pi < c.length; pi++) {
    DIRECTIONS.forEach((d) => {
      map[normalizeKey({ key: c[pi][d] })] = `p${pi + 1}${d}`
    })
  }
  return map
}

/**
 * 手柄分配:给定已连接手柄 index 列表与配置,返回 玩家索引→手柄 index。
 * 规则:①显式绑定优先(玩家序升序,绑定的手柄须在连接列表中,重复绑定
 * 先到先得);②未分配的手柄按连接顺序补给 gamepad=null 的玩家(玩家序
 * 升序)。显式绑定了未连接手柄的玩家不参与补位。未分配的玩家不进结果。
 */
export function assignGamepads(connected: number[], c: InputConfigs): Record<number, number> {
  const result: Record<number, number> = {}
  const usedPads = new Set<number>()
  c.forEach((player, pi) => {
    if (player.gamepad !== null && connected.includes(player.gamepad) && !usedPads.has(player.gamepad)) {
      result[pi] = player.gamepad
      usedPads.add(player.gamepad)
    }
  })
  const waiting = [...new Set(connected)].filter((pad) => !usedPads.has(pad))
  let wi = 0
  c.forEach((player, pi) => {
    if (player.gamepad === null && wi < waiting.length) {
      result[pi] = waiting[wi]
      wi += 1
    }
  })
  return result
}
