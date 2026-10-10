import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nextLayerId } from '../../src/renderer/src/domain/profileUtils'

// R264: profile 导入/命名槽载入的校验 + 迁移统一（REVIEW-workspace-settings
// A1 / U1·U3·U4）。与 tests/profileStore.test.ts 同款 electron mock——
// profileStore 模块级 `app.getPath('userData')` 需要它。
const TEST_USER_DATA = join(tmpdir(), 'rgbbox-r264-profilestore-' + process.pid)
vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? TEST_USER_DATA : tmpdir())
  }
}))

const { normalizeProfile, importProfile, loadProfileById, saveProfileAs } = await import('../../src/main/profileStore')
const { defaultProfile } = await import('../../src/shared/defaultProfile')

const profilesDir = join(TEST_USER_DATA, 'config', 'profiles')

/** 最小合法形状：结构骨架齐全，其余字段留给 normalizeProfile 迁移补齐。 */
const baseValid = {
  id: 'import-1',
  name: 'Imported One',
  activeSceneId: 's1',
  scenes: [
    {
      id: 's1',
      name: 'Scene 1',
      displayIds: [1, 2],
      layers: [{ id: 'layer-150', kind: 'rainbow', name: 'Imported Rainbow' }]
    }
  ]
}

describe('R264 normalizeProfile — 结构校验（坏形状 → null，不崩）', () => {
  it('非对象根（字符串/数字/布尔/null/数组）一律 null', () => {
    expect(normalizeProfile('{"scenes":[]}')).toBeNull()
    expect(normalizeProfile(42)).toBeNull()
    expect(normalizeProfile(true)).toBeNull()
    expect(normalizeProfile(null)).toBeNull()
    expect(normalizeProfile([])).toBeNull()
  })

  it('scenes 缺失 / 空数组 / 非数组 → null（activeLayer 崩溃源头）', () => {
    expect(normalizeProfile({ id: 'x' })).toBeNull()
    expect(normalizeProfile({ ...baseValid, scenes: [] })).toBeNull()
    expect(normalizeProfile({ ...baseValid, scenes: 'nope' })).toBeNull()
    expect(normalizeProfile({ ...baseValid, scenes: {} })).toBeNull()
  })

  it('scene 级坏结构（非对象 / 缺 string id / layers 非数组）→ null', () => {
    expect(normalizeProfile({ ...baseValid, scenes: [42] })).toBeNull()
    expect(normalizeProfile({ ...baseValid, scenes: [{ layers: [] }] })).toBeNull()
    expect(normalizeProfile({ ...baseValid, scenes: [{ id: 's1', layers: 'x' }] })).toBeNull()
  })

  it('sampling 非对象 → null', () => {
    expect(normalizeProfile({ ...baseValid, sampling: 3 })).toBeNull()
    expect(normalizeProfile({ ...baseValid, sampling: [] })).toBeNull()
  })

  it('合法 JSON 错形状的整份导入文本同样不崩（经 importProfile 走同一条路）', async () => {
    await expect(importProfile('"just a string"')).resolves.toBeNull()
    await expect(importProfile('123')).resolves.toBeNull()
    await expect(importProfile(JSON.stringify({ ...baseValid, scenes: [] }))).resolves.toBeNull()
  })
})

describe('R264 normalizeProfile — 默认值深合并（缺字段迁移补齐）', () => {
  it('最小合法形状补齐为完整 Profile：sampling 全默认、层字段补齐', () => {
    const p = normalizeProfile(baseValid)
    expect(p).not.toBeNull()
    expect(p!.id).toBe('import-1')
    expect(p!.activeSceneId).toBe('s1')
    expect(p!.performanceMode).toBe('balanced')
    // sampling：非可选字段全部有值（U1：旧槽缺 usePerformanceGuard/showGap
    // 时受控/非受控失配）
    expect(p!.sampling.usePerformanceGuard).toBe(true)
    expect(typeof p!.sampling.usePerformanceGuard).toBe('boolean')
    expect(p!.sampling.showGap).toBe(false)
    expect(p!.sampling.columns).toBe(defaultProfile.sampling.columns)
    expect(p!.sampling.fps).toBe(defaultProfile.sampling.fps)
    // 层字段补齐
    const layer = p!.scenes[0].layers[0]
    expect(layer.id).toBe('layer-150')
    expect(layer.kind).toBe('rainbow')
    expect(layer.enabled).toBe(true)
    expect(layer.opacity).toBe(0.75)
    expect(layer.blendMode).toBe('screen')
    expect(layer.parameters).toEqual({})
    // 既有字段保留
    expect(p!.scenes[0].name).toBe('Scene 1')
    expect(p!.scenes[0].displayIds).toEqual([1, 2])
  })

  it('sampling 部分字段：合法值保留，非法值回默认', () => {
    const p = normalizeProfile({ ...baseValid, sampling: { columns: 32, fps: 'fast', rows: -5 } })
    expect(p!.sampling.columns).toBe(32)
    expect(p!.sampling.fps).toBe(defaultProfile.sampling.fps)
    expect(p!.sampling.rows).toBe(defaultProfile.sampling.rows)
  })

  it('activeSceneId 缺失或指向不存在的 scene → 回落到 scenes[0].id', () => {
    const noActive = (({ id: 'x', name: 'n', scenes: baseValid.scenes }) as unknown as typeof baseValid)
    expect(normalizeProfile(noActive)!.activeSceneId).toBe('s1')
    expect(normalizeProfile({ ...baseValid, activeSceneId: 'ghost' })!.activeSceneId).toBe('s1')
  })

  it('performanceMode 非法 → balanced；合法值保留', () => {
    expect(normalizeProfile({ ...baseValid, performanceMode: 'turbo' })!.performanceMode).toBe('balanced')
    expect(normalizeProfile({ ...baseValid, performanceMode: 'extreme' })!.performanceMode).toBe('extreme')
  })

  it('坏层条目被丢弃（非对象 / 缺 string kind），好层保留', () => {
    const p = normalizeProfile({
      ...baseValid,
      scenes: [{ id: 's1', layers: [42, null, { id: 'no-kind' }, { id: 'layer-1', kind: 'wave', opacity: 'x', blendMode: 'weird' }] }]
    })
    expect(p!.scenes[0].layers).toHaveLength(1)
    const layer = p!.scenes[0].layers[0]
    expect(layer.id).toBe('layer-1')
    expect(layer.kind).toBe('wave')
    expect(layer.opacity).toBe(0.75)
    expect(layer.blendMode).toBe('screen')
  })

  it('scene 附加字段：videoWall/linkedDisplays 非法时剔除，不进渲染层', () => {
    const p = normalizeProfile({
      ...baseValid,
      scenes: [{ id: 's1', layers: [], videoWall: 'nope', linkedDisplays: 'yes' }]
    })
    expect(p!.scenes[0].videoWall).toBeUndefined()
    expect(p!.scenes[0].linkedDisplays).toBeUndefined()
  })

  it('完整导出 profile 往返：normalize 不丢字段（前向兼容的 spread 语义）', () => {
    const round = normalizeProfile(JSON.parse(JSON.stringify(defaultProfile)))
    expect(round).toEqual(defaultProfile)
  })
})

describe('R264/U4 nextLayerId — 扫描现有 id 取 max+1', () => {
  it('无层 / 无 profile → layer-101（保持旧计数器首个 id）', () => {
    expect(nextLayerId(null)).toBe('layer-101')
    expect(nextLayerId(undefined)).toBe('layer-101')
    expect(nextLayerId({ ...baseValid, scenes: [{ id: 's1', layers: [] }] } as never)).toBe('layer-101')
  })

  it('现有 layer-105 → layer-106', () => {
    const profile = { ...baseValid, scenes: [{ id: 's1', layers: [{ id: 'layer-105', kind: 'wave' }] }] }
    expect(nextLayerId(profile as never)).toBe('layer-106')
  })

  it('导入含 layer-150 与 layer-102 → max+1 = layer-151（不再撞自增段）', () => {
    const profile = {
      ...baseValid,
      scenes: [
        { id: 's1', layers: [{ id: 'layer-102', kind: 'wave' }] },
        { id: 's2', layers: [{ id: 'layer-150', kind: 'aurora' }] }
      ]
    }
    expect(nextLayerId(profile as never)).toBe('layer-151')
  })

  it('非 layer-N 形态的 id 不参与扫描', () => {
    const profile = { ...baseValid, scenes: [{ id: 's1', layers: [{ id: 'layer-aurora-veil', kind: 'aurora' }, { id: 'weird', kind: 'wave' }] }] }
    expect(nextLayerId(profile as never)).toBe('layer-101')
  })
})

describe('R264 loadProfileById — 命名槽统一走 normalizeProfile', () => {
  beforeEach(() => mkdirSync(profilesDir, { recursive: true }))
  afterEach(() => rmSync(TEST_USER_DATA, { recursive: true, force: true }))

  it('旧槽缺 sampling 非可选字段 → 载入后为布尔值（受控/非受控不再失配）', async () => {
    writeFileSync(
      join(profilesDir, 'legacy-1.json'),
      JSON.stringify({ ...baseValid, id: 'legacy-1', sampling: { columns: 20, rows: 12 } }),
      'utf-8'
    )
    const loaded = await loadProfileById('legacy-1')
    expect(loaded).not.toBeNull()
    expect(loaded!.sampling.columns).toBe(20)
    expect(loaded!.sampling.usePerformanceGuard).toBe(true)
    expect(loaded!.sampling.showGap).toBe(false)
  })

  it('合法 JSON 但 scenes:[] 的坏槽 → null（此前裸 parse 原样返回）', async () => {
    writeFileSync(join(profilesDir, 'bad-1.json'), JSON.stringify({ ...baseValid, id: 'bad-1', scenes: [] }), 'utf-8')
    await expect(loadProfileById('bad-1')).resolves.toBeNull()
  })

  it('坏 JSON / 不存在的槽 → null（既有语义保持）', async () => {
    writeFileSync(join(profilesDir, 'corrupt.json'), 'not json{{{', 'utf-8')
    await expect(loadProfileById('corrupt')).resolves.toBeNull()
    await expect(loadProfileById('missing')).resolves.toBeNull()
  })
})

describe('R264/U3 importProfile — 同 id 导入生成新 id，旧槽保留', () => {
  beforeEach(() => mkdirSync(profilesDir, { recursive: true }))
  afterEach(() => rmSync(TEST_USER_DATA, { recursive: true, force: true }))

  it('坏文本（非 JSON / 错形状）→ null 不崩', async () => {
    await expect(importProfile('not json{{{')).resolves.toBeNull()
    await expect(importProfile('[]')).resolves.toBeNull()
    await expect(importProfile(JSON.stringify({ ...baseValid, scenes: 'nope' }))).resolves.toBeNull()
  })

  it('无冲突：保留原 id，字段迁移补齐', async () => {
    const imported = await importProfile(JSON.stringify(baseValid))
    expect(imported).not.toBeNull()
    expect(imported!.id).toBe('import-1')
    expect(imported!.sampling.usePerformanceGuard).toBe(true)
  })

  it('撞既有命名槽 → 生成新 id，旧槽内容原样保留（不再静默覆盖）', async () => {
    // 既有槽 import-1：另一个名字
    await saveProfileAs(JSON.parse(JSON.stringify({ ...baseValid, name: 'Original Slot' })))
    const imported = await importProfile(JSON.stringify(baseValid))
    expect(imported).not.toBeNull()
    expect(imported!.id).not.toBe('import-1')
    expect(imported!.id).toMatch(/^profile-/)
    // 旧槽未被覆盖
    const oldSlot = await loadProfileById('import-1')
    expect(oldSlot).not.toBeNull()
    expect(oldSlot!.name).toBe('Original Slot')
  })

  it('既有槽文件是坏 JSON（文件仍存在）→ 同样按冲突处理生成新 id', async () => {
    writeFileSync(join(profilesDir, 'import-1.json'), 'corrupt but present', 'utf-8')
    const imported = await importProfile(JSON.stringify(baseValid))
    expect(imported).not.toBeNull()
    expect(imported!.id).not.toBe('import-1')
  })
})
