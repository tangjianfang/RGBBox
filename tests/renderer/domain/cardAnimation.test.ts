// R301: 效果库卡片渲染资源预算 —— 纯域单测（node 环境即可，零 DOM 依赖）
import { describe, it, expect, beforeEach } from 'vitest'
import {
  cardFpsForMode,
  effectiveCardFps,
  shouldDrawCardFrame,
  composeCardFramePixels,
  enterVisibleCard,
  exitVisibleCard,
  getVisibleCardCount,
  resetVisibleCardCount,
  CARD_COUNT_BUDGET,
  CARD_GRID_COLS,
  CARD_GRID_ROWS
} from '../../../src/renderer/src/domain/cardAnimation'

describe('domain/cardAnimation (R301)', () => {
  describe('cardFpsForMode — performanceMode 首次接入真实行为', () => {
    it('maps the three performance modes to card fps budgets', () => {
      expect(cardFpsForMode('battery')).toBe(10)
      expect(cardFpsForMode('balanced')).toBe(20)
      expect(cardFpsForMode('extreme')).toBe(Infinity)
    })
  })

  describe('effectiveCardFps — 同屏活跃卡预算（降帧而非冻结）', () => {
    it('keeps base fps at or below the card-count budget', () => {
      expect(effectiveCardFps(20, CARD_COUNT_BUDGET)).toBe(20)
      expect(effectiveCardFps(20, 1)).toBe(20)
    })

    it('scales down proportionally above budget (every card keeps moving)', () => {
      expect(effectiveCardFps(20, 24)).toBeCloseTo(10, 5)
      expect(effectiveCardFps(20, 18)).toBeCloseTo((20 * CARD_COUNT_BUDGET) / 18, 5)
    })

    it('never drops below the 2fps floor', () => {
      expect(effectiveCardFps(10, 200)).toBe(2)
    })

    it('extreme stays uncapped regardless of card count', () => {
      expect(effectiveCardFps(Infinity, 40)).toBe(Infinity)
    })
  })

  describe('shouldDrawCardFrame — rAF 时间门', () => {
    it('gates frames at the interval for the mode fps (1ms tolerance)', () => {
      // balanced 20fps → 50ms interval
      expect(shouldDrawCardFrame(0, 25, 20, 1)).toBe(false)
      expect(shouldDrawCardFrame(0, 49, 20, 1)).toBe(true)
    })

    it('widens the interval when visible cards exceed the budget', () => {
      // 24 visible cards → effective 10fps → ~100ms interval
      expect(shouldDrawCardFrame(0, 60, 20, 24)).toBe(false)
      expect(shouldDrawCardFrame(0, 99, 20, 24)).toBe(true)
    })

    it('extreme draws every rAF tick', () => {
      expect(shouldDrawCardFrame(0, 1, Infinity, 30)).toBe(true)
    })
  })

  describe('visible-card registry — useCardVisible 进出登记', () => {
    beforeEach(() => {
      resetVisibleCardCount()
    })

    it('counts enter/exit and never goes negative', () => {
      enterVisibleCard()
      enterVisibleCard()
      enterVisibleCard()
      expect(getVisibleCardCount()).toBe(3)
      exitVisibleCard()
      exitVisibleCard()
      exitVisibleCard()
      exitVisibleCard() // 过量 exit 不产生负数
      expect(getVisibleCardCount()).toBe(0)
    })
  })

  describe('composeCardFramePixels — ImageData 路径像素对齐 (R301.2 ③)', () => {
    it('writes cell centers at full color and edges as the old 0.75 AA blend', () => {
      // 旧 fillRect 几何:cell 起点 0.25px、宽 4.5px → 局部 col/row 0 与 4 被覆盖 75%。
      // ImageData 复刻:边缘权重 0.75（颜色×0.75 + 背景 #080d11 ×0.25）。
      const grid = Array.from({ length: CARD_GRID_COLS * CARD_GRID_ROWS }, () => ({ r: 255, g: 0, b: 0 }))
      const out = new Uint8ClampedArray(240 * 135 * 4)
      composeCardFramePixels(grid, out)
      const px = (x: number, y: number): number[] => {
        const o = (y * 240 + x) * 4
        return [out[o], out[o + 1], out[o + 2]]
      }
      // cell 中心 (local 2,2) — 纯色
      expect(px(2, 2)).toEqual([255, 0, 0])
      // cell 边缘列 (local 0) — 0.75 红 + 0.25 背景
      expect(px(0, 2)).toEqual([
        Math.round(255 * 0.75 + 8 * 0.25),
        Math.round(13 * 0.25),
        Math.round(17 * 0.25)
      ])
      // 角落 (0,0) — 0.75×0.75 双边缘
      expect(px(0, 0)).toEqual([
        Math.round(255 * 0.5625 + 8 * 0.4375),
        Math.round(13 * 0.4375),
        Math.round(17 * 0.4375)
      ])
      // alpha 全不透明
      expect(out[3]).toBe(255)
    })

    it('maps each output pixel to its grid cell color', () => {
      const grid = Array.from({ length: CARD_GRID_COLS * CARD_GRID_ROWS }, (_, i) => ({ r: i % 256, g: 0, b: 0 }))
      const out = new Uint8ClampedArray(240 * 135 * 4)
      composeCardFramePixels(grid, out)
      // 像素 (12,7) → cell (2,1)（local 2,2 = cell 中心）→ 网格索引 48+2=50，权重不衰减
      const o = (7 * 240 + 12) * 4
      expect(out[o]).toBe(50)
    })
  })
})
