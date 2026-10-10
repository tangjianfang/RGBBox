// R262 死亡钩子 + 画布中文化 — TDD 失败测试先行。
// #6 deathHook: lost 态纯函数(差多少升级/最近进化配方在望)。
// #9 labels: R235 messages 模式——SURVIVAL_LABELS 缺省=现英文值(兼容锁),
//   state.labels 注入覆盖(引擎零 i18n 依赖,本地化在 view 层)。
import { describe, it, expect } from 'vitest'
import {
  advanceIsland,
  applyUpgrade,
  deathHook,
  drawSurvival,
  initialSurvivalState,
  startSurvival,
  SURVIVAL_LABELS,
  type SurvivalState,
} from '../../../src/renderer/src/games/survival'

/** 极简 ctx 记录器:只记 fillText 的文本参数(labels 断言用)。 */
function textCtx(): { ctx: CanvasRenderingContext2D; texts: string[] } {
  const texts: string[] = []
  const ctx = {
    fillText: (t: string) => { texts.push(t) },
    save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {}, scale: () => {},
    beginPath: () => {}, closePath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {},
    fill: () => {}, arc: () => {}, fillRect: () => {}, strokeRect: () => {}, clearRect: () => {}, roundRect: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    set globalAlpha(_v: unknown) {}, set fillStyle(_v: unknown) {}, set strokeStyle(_v: unknown) {},
    set font(_v: unknown) {}, set textAlign(_v: unknown) {}, set textBaseline(_v: unknown) {}, set lineWidth(_v: unknown) {},
  } as unknown as CanvasRenderingContext2D
  return { ctx, texts }
}

describe('games/survival #6 死亡钩子 (R262)', () => {
  it('lost 态:距下次升级的 XP 差值', () => {
    const s = initialSurvivalState()
    s.phase = 'lost'
    s.xp = 3
    s.xpNext = 6
    expect(deathHook(s).xpToLevel).toBe(3)
  })

  it('lost 态:缺 ≤2 级的最近进化配方在望(lightspier: pierce/bulletSpeed 各差 1)', () => {
    const s = initialSurvivalState()
    s.phase = 'lost'
    s.taken.pierce = 2
    s.taken.bulletSpeed = 2
    const hint = deathHook(s).evolveHint
    expect(hint).not.toBeNull()
    expect(hint!.effect).toBe('lightspear')
    expect(hint!.missing).toBe(2)
  })

  it('全零 taken:无配方在望(差 ≥3 级),hint=null', () => {
    const s = initialSurvivalState()
    s.phase = 'lost'
    expect(deathHook(s).evolveHint).toBeNull()
  })

  it('已进化配方不再提示', () => {
    const s = initialSurvivalState()
    s.phase = 'lost'
    s.taken.pierce = 2
    s.taken.bulletSpeed = 2
    s.evolved = ['lightspear']
    expect(deathHook(s).evolveHint).toBeNull()
  })
})

describe('games/survival #9 画布文案 labels 注入 (R262)', () => {
  it('兼容锁:不注入 labels 时全部现值原样(引擎零 i18n 依赖)', () => {
    expect(SURVIVAL_LABELS.survive).toBe('SURVIVE')
    expect(SURVIVAL_LABELS.island(2)).toBe('ISLAND 2')
    expect(SURVIVAL_LABELS.level(3)).toBe('LEVEL 3')
    expect(SURVIVAL_LABELS.bossDown).toContain('BOSS DOWN')
    expect(SURVIVAL_LABELS.lv(4)).toBe('LV 4')
    const s = initialSurvivalState()
    expect(s.labels).toBeUndefined()
    startSurvival(s)
    expect(s.banner?.text).toBe('SURVIVE')
  })

  it('注入 zh labels:开场横幅/换岛横幅/进化横幅走注入值', () => {
    const s = initialSurvivalState()
    s.labels = { survive: '生存', island: (n) => `第 ${n} 座岛`, level: (n) => `升级!第 ${n} 级`, evolved: (e) => `进化完成 · ${e}` }
    startSurvival(s)
    expect(s.banner?.text).toBe('生存')
    s.portal = { x: 100, y: 100 }
    advanceIsland(s)
    expect(s.banner?.text).toBe('第 2 座岛')
    s.phase = 'running'
    s.offers = ['moonblade' as never]
    s.phase = 'levelup'
    applyUpgrade(s, 'moonblade' as never)
    expect(s.banner?.text).toBe('进化完成 · moonblade')
  })

  it('注入 zh labels:drawSurvival HUD 文本走注入值(LV 等级)', () => {
    const s = initialSurvivalState()
    s.phase = 'running'
    s.labels = { lv: (n) => `等级 ${n}` }
    const rec = textCtx()
    drawSurvival(rec.ctx, s as SurvivalState)
    expect(rec.texts).toContain('等级 1')
    // 未注入的键回落缺省英文
    expect(rec.texts.some((t) => t.includes('ISLAND 1'))).toBe(true)
  })

  it('combo HUD:注入 zh 后画「连击 ×N」(AI 读图误报裁决用)', () => {
    const s = initialSurvivalState()
    s.phase = 'running'
    s.combo = 3
    s.comboTimer = 2
    s.labels = { combo: (n) => `连击 ×${n}` }
    const rec = textCtx()
    drawSurvival(rec.ctx, s)
    expect(rec.texts).toContain('连击 ×3')
    expect(rec.texts.some((t) => t.includes('COMBO'))).toBe(false)
  })

  it('缺省态:drawSurvival HUD 文本为现英文值(LV 1 / ISLAND 1)', () => {
    const s = initialSurvivalState()
    s.phase = 'running'
    const rec = textCtx()
    drawSurvival(rec.ctx, s)
    expect(rec.texts).toContain('LV 1')
    expect(rec.texts.some((t) => t.includes('ISLAND 1'))).toBe(true)
  })
})
