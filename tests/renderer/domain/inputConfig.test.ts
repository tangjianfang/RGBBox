import { describe, it, expect } from 'vitest'
import {
  DEFAULT_INPUTS,
  P2_DEFAULT,
  assignGamepads,
  buildKeyToPoolMap,
  findKeyConflicts,
  loadInputConfigs,
  normalizeKey,
  saveInputConfigs,
  type InputConfigs,
  type PlayerInputConfig,
} from '../../../src/renderer/src/domain/inputConfig'

const STORAGE_KEY = 'rgbbox:gameInputs'

/** node 环境无 localStorage,以内存 Map 伪造 Storage(仅用到的两个方法)。 */
function makeStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
  } as unknown as Storage
}

function copyOf(inputs: InputConfigs): InputConfigs {
  return inputs.map((player) => ({ ...player })) as InputConfigs
}

describe('renderer/domain/inputConfig (R213)', () => {
  it('默认键位表:四玩家 16 键互不冲突,P1/P2 与引擎现状对齐', () => {
    expect(findKeyConflicts(DEFAULT_INPUTS)).toEqual([])
    const keys = DEFAULT_INPUTS.flatMap((player) => [player.up, player.down, player.left, player.right])
    expect(new Set(keys).size).toBe(16)
    expect(DEFAULT_INPUTS[0]).toMatchObject({ up: 'w', down: 's', left: 'a', right: 'd' })
    expect(P2_DEFAULT).toEqual({ up: 'i', down: 'k', left: 'j', right: 'l', gamepad: null })
    expect(DEFAULT_INPUTS[1]).toEqual(P2_DEFAULT)
  })

  it('normalizeKey 规范化各键型', () => {
    expect(normalizeKey({ key: 'ArrowUp' })).toBe('arrowup')
    expect(normalizeKey({ key: 'ArrowLeft' })).toBe('arrowleft')
    expect(normalizeKey({ key: 'w' })).toBe('w')
    expect(normalizeKey({ key: ' ' })).toBe('space')
    expect(normalizeKey({ key: 'Enter' })).toBe('enter')
    expect(normalizeKey({ key: 'F5' })).toBe('f5')
  })

  it('load:空存储 / 损坏 JSON / 数组形状不对 → 整体回默认', () => {
    expect(loadInputConfigs(makeStorage())).toEqual(DEFAULT_INPUTS)
    expect(loadInputConfigs(makeStorage({ [STORAGE_KEY]: '{oops' }))).toEqual(DEFAULT_INPUTS)
    expect(loadInputConfigs(makeStorage({ [STORAGE_KEY]: '[1,2]' }))).toEqual(DEFAULT_INPUTS)
    expect(loadInputConfigs(makeStorage({ [STORAGE_KEY]: '"nope"' }))).toEqual(DEFAULT_INPUTS)
  })

  it('load:单个玩家条目损坏仅该条回默认,其余保留', () => {
    const configs = copyOf(DEFAULT_INPUTS)
    configs[1] = { up: 'p', down: 'o', left: 'n', right: 'm', gamepad: null }
    const stored = copyOf(configs)
    stored[3] = { up: 8, down: '2', left: '4', right: '6', gamepad: null } as unknown as PlayerInputConfig
    const loaded = loadInputConfigs(makeStorage({ [STORAGE_KEY]: JSON.stringify(stored) }))
    expect(loaded[1]).toEqual(configs[1])
    expect(loaded[3]).toEqual(DEFAULT_INPUTS[3])
    expect(loaded[0]).toEqual(DEFAULT_INPUTS[0])
  })

  it('save/load 往返一致', () => {
    const storage = makeStorage()
    const configs = copyOf(DEFAULT_INPUTS)
    configs[2] = { up: 'u', down: 'n', left: 'b', right: 'm', gamepad: 1 }
    saveInputConfigs(storage, configs)
    expect(loadInputConfigs(storage)).toEqual(configs)
  })

  it('findKeyConflicts:跨玩家撞键与同玩家双方向撞键均检出', () => {
    const clash = copyOf(DEFAULT_INPUTS)
    clash[2] = { ...clash[2], up: 'w' }
    const conflicts = findKeyConflicts(clash)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toContain("'w'")
    expect(conflicts[0]).toContain('P1.up')
    expect(conflicts[0]).toContain('P3.up')

    const selfClash = copyOf(DEFAULT_INPUTS)
    selfClash[1] = { up: 'i', down: 'i', left: 'j', right: 'l', gamepad: null }
    const selfConflicts = findKeyConflicts(selfClash)
    expect(selfConflicts).toHaveLength(1)
    expect(selfConflicts[0]).toContain('P2.up')
    expect(selfConflicts[0]).toContain('P2.down')
  })

  it('buildKeyToPoolMap:P2-P4 共 12 键映射正确,P1 键直写引擎不进表', () => {
    const map = buildKeyToPoolMap(DEFAULT_INPUTS)
    expect(Object.keys(map)).toHaveLength(12)
    expect(map).toEqual({
      i: 'p2up', k: 'p2down', j: 'p2left', l: 'p2right',
      t: 'p3up', g: 'p3down', f: 'p3left', h: 'p3right',
      8: 'p4up', 2: 'p4down', 4: 'p4left', 6: 'p4right',
    })
    for (const p1Key of ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']) {
      expect(p1Key in map).toBe(false)
    }
  })

  it('assignGamepads:显式绑定优先,余柄按连接顺序补位,无手柄为空', () => {
    // 默认 P1 显式绑 0:两只手柄 → P1←0(显式),P2←1(补位)
    expect(assignGamepads([0, 1], DEFAULT_INPUTS)).toEqual({ 0: 0, 1: 1 })
    // 补位按连接列表顺序:P2←3,P3←1
    expect(assignGamepads([0, 3, 1], DEFAULT_INPUTS)).toEqual({ 0: 0, 1: 3, 2: 1 })
    // P1 显式绑的 0 未连接:P1 不分配(显式绑未连接手柄不补位),余柄照常补位
    expect(assignGamepads([3, 1], DEFAULT_INPUTS)).toEqual({ 1: 3, 2: 1 })
    expect(assignGamepads([], DEFAULT_INPUTS)).toEqual({})
  })

  it('assignGamepads:显式绑未连接的手柄不占位,空缺补给 null 玩家', () => {
    const configs = copyOf(DEFAULT_INPUTS)
    configs[0] = { ...configs[0], gamepad: 5 }
    // P1 绑的手柄 5 未连接:pad 0 补给第一个 gamepad=null 的玩家(P2)
    expect(assignGamepads([0], configs)).toEqual({ 1: 0 })
  })

  it('assignGamepads:重复显式绑定先到先得,败者不参与补位', () => {
    const configs = copyOf(DEFAULT_INPUTS)
    configs[1] = { ...configs[1], gamepad: 0 }
    expect(assignGamepads([0], configs)).toEqual({ 0: 0 })
    // P2 显式非 null,输给 P1 后不再补位;pad 2 落到 P3
    expect(assignGamepads([0, 2], configs)).toEqual({ 0: 0, 2: 2 })
  })
})
