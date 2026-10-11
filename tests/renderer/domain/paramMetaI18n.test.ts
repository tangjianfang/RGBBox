// R274 paramMeta 键位完整性 — 37 个 labelKey 全部走 i18n 真键(裸英文直出根修)。
import { describe, it, expect, vi } from 'vitest'
const { translations } = await vi.importActual<typeof import('../../../src/renderer/src/i18n')>('../../../src/renderer/src/i18n')
const { PARAM_META } = await vi.importActual<typeof import('../../../src/renderer/src/domain/paramMeta')>('../../../src/renderer/src/domain/paramMeta')

describe('domain/paramMeta 键位完整性 (R274)', () => {
  it('全部 labelKey 均为 param.* 真键(零裸英文)', () => {
    for (const meta of Object.values(PARAM_META)) {
      expect(meta.labelKey.startsWith('param.')).toBe(true)
    }
  })

  it('每个 param.* 键在 zh/en 双语表都存在且非空(zh 抽屉/tooltip 零英文残留)', () => {
    for (const meta of Object.values(PARAM_META)) {
      for (const lang of ['en', 'zh'] as const) {
        const v = translations[lang][meta.labelKey as keyof typeof translations.zh]
        expect(v, `${lang} 缺 ${meta.labelKey}`).toBeTruthy()
      }
    }
  })
})
