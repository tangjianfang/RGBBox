// R289 Phase 0(架构评审雷③): renderEffectPixel case 穷尽守卫。
// 雷的实态:新 kind 忘写 case 会静默落进 default(屏幕像素增强回退)——
// 「能亮」从而骗过 visual-floor/effects.test 三道门禁,直到用户看到假效果。
// 本测试解析 effects.ts 源码的 case 集合,断言每个 preset kind 都有显式
// case,唯一豁免=GPU 3D 五件套(物理 LED 输出走 overlay shader 广播,
// CPU default 回退是既定语义)。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { effectPresets } from '../../src/shared/defaultProfile'
import { EFFECT_3D_KINDS } from '../../src/shared/types'

const effectsSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../src/engine/effects.ts'),
  'utf8',
)

const caseKinds = new Set([...effectsSrc.matchAll(/case '([a-z0-9-]+)':/g)].map((m) => m[1]))

describe('engine/effects case 穷尽守卫 (R289 Phase 0)', () => {
  it('每个 preset kind 都有显式 case(除 GPU 3D 五件套豁免)', () => {
    const missing: string[] = []
    for (const p of effectPresets) {
      if (EFFECT_3D_KINDS.has(p.kind)) continue
      if (!caseKinds.has(p.kind)) missing.push(p.kind)
    }
    expect(missing, `以下 kind 无显式 case,会静默走 default 回退: ${missing.join(',')}`).toEqual([])
  })

  it('守卫自检:解析到的 case 数与引擎规模一致(防正则失效空转)', () => {
    expect(caseKinds.size).toBeGreaterThanOrEqual(43)
  })
})
