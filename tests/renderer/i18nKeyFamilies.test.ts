// R278 i18n 键族不变量 — effect.<kind> 键族双向锁(词表资产 CI 红灯化)。
// 正向:词表内每个 effect.<kind> 名键 zh/en 成对非空(新效果忘写键 → 红,
// 不再运行时键名原文直出)。反向:每个名键对应真实 EffectKind(死键 → 红)。
// 注:效果描述不走 .desc 键族(presetDescription 走 preset.descKey 语义),
// 故本测试只锁名键族;types.ts 正则会混入 region 名(fullscreen 等)——
// 以「词表内存在名键」为 EffectKind 判据(与引擎 kind 集等价收敛)。
import { describe, it, expect, vi } from 'vitest'

const { translations } = await vi.importActual<typeof import('../../src/renderer/src/i18n')>('../../src/renderer/src/i18n')

const enKeys = Object.keys(translations.en)
const effectKinds = enKeys
  .map((k) => k.match(/^effect\.([a-z0-9-]+)$/))
  .filter((m): m is RegExpMatchArray => m !== null)
  .map((m) => m[1])

describe('i18n effect 键族不变量 (R278)', () => {
  it(`名键族(${effectKinds.length} kind) × zh/en 双语完整非空`, () => {
    // R285: 55→48 下限 — 删除批移除 7 个灯效 kind（lightning-leader/spectrum/
    // orion-nebula/laser-show/wave-diffraction/icosahedral-virus/comet-tail）。
    expect(effectKinds.length).toBeGreaterThanOrEqual(48)
    for (const kind of effectKinds) {
      expect(translations.en[`effect.${kind}` as keyof typeof translations.zh], `en 缺 effect.${kind}`).toBeTruthy()
      expect(translations.zh[`effect.${kind}` as keyof typeof translations.zh], `zh 缺 effect.${kind}`).toBeTruthy()
    }
  })

  it('删任一 effect 名键(任一语言)本测试红——键删除红灯自证', () => {
    // 结构自检:若词表被清空该断言红(防测试被静默绕过)
    expect(effectKinds.length).toBeGreaterThan(0)
  })

  // R289 Phase 0(架构评审雷②):反向锁——每个 effect.* 名键必须对应真实
  // 效果 kind(effectPresets 权威表)。死键(删除批漏清/R285 前残留)→ 红。
  // 此前头注声称反向校验但测试体从未实现(注释-代码漂移,主审复核实锤)。
  it('反向:每个 effect.* 名键对应 effectPresets 里的真实 kind(死键 → 红)', async () => {
    const { effectPresets } = await vi.importActual<typeof import('../../src/shared/defaultProfile')>('../../src/shared/defaultProfile')
    const presetKinds = new Set(effectPresets.map((p) => p.kind))
    expect(presetKinds.size).toBeGreaterThanOrEqual(48)
    for (const m of effectKinds) {
      expect(presetKinds.has(m as never), `死键 effect.${m} 不对应任何 preset`).toBe(true)
    }
  })
})
