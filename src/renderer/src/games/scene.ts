// R213: 六场景程序化背景——纯绘制模块(零素材,全程序绘制)。
// 设计基准画布 900×520,但按 s.w/s.h 等比适配任意尺寸。
// 硬约束:
//  - 确定性:全部伪随机走 sin 哈希(seed 数组/纯 t 公式),不用 Math.random,
//    无模块级可变状态——同参数每帧渲染结果稳定,可快照/回放。
//  - 视差:px/py 只做 ≤0.05 系数的微偏移(背景层感,不喧宾夺主)。
//  - 结构:每场景 = 底色渐变(createLinearGradient 2-3 stop)+ 2-3 层
//    视差元素 + 时间动画元素;形状用简洁几何 + 低饱和配色。

export type SceneId = 'station' | 'desert' | 'snow' | 'grass' | 'ocean' | 'fusion'

export interface SceneCtx {
  ctx: CanvasRenderingContext2D
  /** 画布宽高(设计基准 900×520)。 */
  w: number
  h: number
  /** 时间(秒)——驱动全部动画。 */
  t: number
  /** 玩家位置(视差微偏移用,系数 ≤0.05)。 */
  px: number
  py: number
}

export const SCENE_IDS: SceneId[] = ['station', 'desert', 'snow', 'grass', 'ocean', 'fusion']

/** 确定性伪随机 [0,1)——sin 哈希,同 seed 恒同值(每帧稳定)。 */
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** 正数取模(处理负数回绕)。 */
function wrap(v: number, m: number): number {
  return ((v % m) + m) % m
}

/** 两三个 stop 的线性渐变(底色基调用)。 */
function vgrad(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, stops: Array<[number, string]>): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1)
  for (const [at, color] of stops) g.addColorStop(at, color)
  return g
}

// ── station: 太空站——深蓝紫渐变 + 静态星场 + 底部大行星弧(大气光晕)+ 漂浮舱段 ──
function drawStation(s: SceneCtx): void {
  const { ctx, w, h, t } = s
  ctx.fillStyle = vgrad(ctx, 0, 0, 0, h, [[0, '#070514'], [0.55, '#150e33'], [1, '#0b1c3a']])
  ctx.fillRect(0, 0, w, h)
  const ox = (s.px - w / 2) * 0.02
  const oy = (s.py - h / 2) * 0.015
  // 静态星场(seed 数组,闪烁走 t,位置不动)
  for (let i = 0; i < 70; i++) {
    const x = hash(i * 1.37) * w
    const y = hash(i * 2.71 + 5) * h * 0.8
    const size = 0.6 + hash(i * 3.3 + 9) * 1.7
    ctx.globalAlpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.6 + hash(i * 4.4) * 6.28))
    ctx.fillStyle = i % 7 === 0 ? '#cfd8ff' : '#9fb7d1'
    ctx.fillRect(x + ox, y + oy, size, size)
  }
  ctx.globalAlpha = 1
  // 底部大行星(弧线 + 两圈大气光晕 + 顶部亮弧)
  const cx = w * 0.5 + ox * 2
  const cy = h + h * 0.52
  const R = h * 0.95
  ctx.fillStyle = 'rgba(109, 90, 207, 0.10)'
  ctx.beginPath(); ctx.arc(cx, cy, R + 26, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = 'rgba(109, 90, 207, 0.16)'
  ctx.beginPath(); ctx.arc(cx, cy, R + 10, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = vgrad(ctx, cx - R, cy - R, cx + R, cy, [[0, '#3b2f6e'], [0.6, '#241a4e'], [1, '#120d2c']])
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = 'rgba(165, 180, 252, 0.5)'
  ctx.lineWidth = 3
  ctx.beginPath(); ctx.arc(cx, cy, R + 6, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke()
  // 缓慢漂浮的舱段剪影(矩形组 + 舷窗点,横向匀速漂移回绕)
  for (let m = 0; m < 3; m++) {
    const len = 70 + m * 26
    const speed = 12 + m * 7
    const period = w + len * 2
    const x = wrap(hash(m * 9.1 + 3) * period - t * speed, period) - len
    const y = h * (0.16 + 0.17 * m) + oy * (1 + m)
    ctx.save()
    ctx.translate(x, y)
    ctx.globalAlpha = 0.5
    ctx.fillStyle = '#1c2340'
    ctx.fillRect(0, -9, len, 18)
    ctx.fillRect(-8, -5, 8, 10)
    ctx.globalAlpha = 0.9
    ctx.fillStyle = '#8fd3ff'
    for (let p = 0; p < Math.floor(len / 18); p++) ctx.fillRect(10 + p * 18, -2.5, 5, 5)
    ctx.restore()
  }
  ctx.globalAlpha = 1
}

// ── desert: 沙漠——橙金渐变 + 大落日(柔光)+ 三层沙丘正弦 + 横移沙尘带 ──
function drawDesert(s: SceneCtx): void {
  const { ctx, w, h, t } = s
  ctx.fillStyle = vgrad(ctx, 0, 0, 0, h, [[0, '#8a4a20'], [0.5, '#c4763a'], [1, '#eec27f']])
  ctx.fillRect(0, 0, w, h)
  // 大落日(柔光两圈 + 实心盘)
  const sunX = w * 0.68 + (s.px - w / 2) * 0.012
  const sunY = h * 0.42
  ctx.fillStyle = 'rgba(255, 214, 153, 0.16)'
  ctx.beginPath(); ctx.arc(sunX, sunY, 88, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = 'rgba(255, 214, 153, 0.22)'
  ctx.beginPath(); ctx.arc(sunX, sunY, 62, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#ffd9a3'
  ctx.beginPath(); ctx.arc(sunX, sunY, 46, 0, Math.PI * 2); ctx.fill()
  // 三层沙丘(远浅近深,正弦曲线;近层视差略强)
  const dunes: Array<[number, number, number, number, string]> = [
    [0.62, 26, 1.5, 0, '#d8a468'],
    [0.74, 34, 2.1, 2.2, '#b97f45'],
    [0.88, 42, 2.7, 4.1, '#8f5a2c'],
  ]
  dunes.forEach(([yr, amp, freq, phase, color], i) => {
    const offY = (s.py - h / 2) * 0.01 * (i + 1)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(0, h * yr)
    for (let x = 0; x <= w; x += 16) {
      ctx.lineTo(x, h * yr + Math.sin((x / w) * Math.PI * freq + phase) * amp + offY)
    }
    ctx.lineTo(w, h)
    ctx.lineTo(0, h)
    ctx.closePath()
    ctx.fill()
  })
  // 缓慢横移的沙尘粒带
  for (let i = 0; i < 26; i++) {
    const speed = 30 + hash(i * 5.7) * 60
    const period = w + 40
    const x = wrap(hash(i * 3.1) * period + t * speed, period) - 20
    const y = h * (0.5 + hash(i * 7.3) * 0.45)
    ctx.globalAlpha = 0.12 + hash(i * 9.9) * 0.18
    ctx.fillStyle = '#ffe9c9'
    ctx.fillRect(x, y + Math.sin(t * 2 + i) * 6, 3 + hash(i) * 5, 1.6)
  }
  ctx.globalAlpha = 1
}

// ── snow: 雪地——冷青白渐变 + 极光带(正弦摆动绿紫幕)+ 远山剪影 + 两层飘雪 ──
function drawSnow(s: SceneCtx): void {
  const { ctx, w, h, t } = s
  ctx.fillStyle = vgrad(ctx, 0, 0, 0, h, [[0, '#0a1c2b'], [0.55, '#2c556e'], [1, '#b9d8e8']])
  ctx.fillRect(0, 0, w, h)
  // 极光带:2-3 条正弦摆动的半透明绿紫幕(上缘/下缘各自摆动)
  const auroras = [
    { color: '#34d399', phase: 0, speed: 0.7, alpha: 0.14 },
    { color: '#a78bfa', phase: 2.1, speed: 0.5, alpha: 0.11 },
    { color: '#5eead4', phase: 4.2, speed: 0.9, alpha: 0.08 },
  ]
  for (const a of auroras) {
    ctx.globalAlpha = a.alpha
    ctx.fillStyle = a.color
    const top = (x: number): number =>
      h * 0.18 + Math.sin((x / w) * Math.PI * 2.2 + a.phase + t * a.speed) * h * 0.06 + (s.px - w / 2) * 0.008
    ctx.beginPath()
    ctx.moveTo(0, top(0))
    for (let x = 0; x <= w; x += 18) ctx.lineTo(x, top(x))
    for (let x = w; x >= 0; x -= 18) {
      ctx.lineTo(x, top(x) + h * 0.3 + Math.sin((x / w) * Math.PI * 1.4 + a.phase * 1.7 - t * a.speed * 0.7) * h * 0.05)
    }
    ctx.closePath()
    ctx.fill()
  }
  ctx.globalAlpha = 1
  // 远山剪影(确定性锯齿天际线,轻视差)
  const ox = (s.px - w / 2) * 0.015
  ctx.fillStyle = '#16324a'
  ctx.beginPath()
  ctx.moveTo(-40 + ox, h * 0.66)
  for (let i = 0; i < 8; i++) {
    const x1 = (w / 8) * (i + 0.5) + ox
    const x2 = (w / 8) * (i + 1) + ox
    const ph = h * (0.1 + hash(i * 6.13) * 0.16)
    ctx.lineTo(x1, h * 0.66 - ph)
    ctx.lineTo(x2, h * 0.66 - ph * 0.25)
  }
  ctx.lineTo(w + 40, h)
  ctx.lineTo(-40, h)
  ctx.closePath()
  ctx.fill()
  // 雪原(近亮远暗的竖渐变)
  ctx.fillStyle = vgrad(ctx, 0, h * 0.66, 0, h, [[0, '#c8dcea'], [1, '#eef6fb']])
  ctx.fillRect(0, h * 0.66, w, h * 0.34)
  // 两层飘雪(后层小而慢、前层大而快;纯 t 公式,帧间不存状态)
  const snowLayer = (count: number, sizeMin: number, sizeMax: number, speedMin: number, speedMax: number, alpha: number): void => {
    for (let i = 0; i < count; i++) {
      const speed = speedMin + hash(i * 8.3) * (speedMax - speedMin)
      const y = wrap(hash(i * 6.1) * h + t * speed, h + 8) - 4
      const x = wrap(hash(i * 12.7 + 1) * w + Math.sin(t * 0.8 + i) * 18, w + 8) - 4
      const size = sizeMin + hash(i * 2.3) * (sizeMax - sizeMin)
      ctx.globalAlpha = alpha
      ctx.fillStyle = '#f4fbff'
      ctx.fillRect(x, y, size, size)
    }
  }
  snowLayer(46, 1, 2, 26, 44, 0.5)
  snowLayer(24, 2.2, 3.6, 58, 88, 0.85)
  ctx.globalAlpha = 1
}

// ── grass: 草丛——绿金渐变 + 远树线剪影 + 三排草浪(相位差摆动)+ 呼吸萤火虫 ──
function drawGrass(s: SceneCtx): void {
  const { ctx, w, h, t } = s
  ctx.fillStyle = vgrad(ctx, 0, 0, 0, h, [[0, '#152a17'], [0.5, '#37551f'], [1, '#8a8c3c']])
  ctx.fillRect(0, 0, w, h)
  // 远树线剪影(半圆拱组成的树冠带,轻视差)
  const ox = (s.px - w / 2) * 0.012
  ctx.fillStyle = '#1d351f'
  ctx.beginPath()
  ctx.moveTo(-20 + ox, h * 0.62)
  for (let i = 0; i <= 12; i++) {
    const x = (w / 12) * i - w / 24 + ox
    ctx.arc(x, h * 0.62, h * (0.04 + hash(i * 3.71) * 0.1), Math.PI, 0)
  }
  ctx.lineTo(w + 20, h)
  ctx.lineTo(-20, h)
  ctx.closePath()
  ctx.fill()
  // 三排草浪(quadraticCurveTo 单株,正弦相位差摆动;近排更深更密)
  const rows = [
    { baseY: 0.68, color: '#4a6b28', sway: 0.5, step: 26, hgt: 0.1 },
    { baseY: 0.78, color: '#3a5a20', sway: 0.8, step: 22, hgt: 0.14 },
    { baseY: 0.9, color: '#2c481b', sway: 1.15, step: 18, hgt: 0.19 },
  ]
  rows.forEach((row, ri) => {
    ctx.strokeStyle = row.color
    ctx.lineWidth = 2
    const y0 = h * row.baseY + (s.py - h / 2) * 0.008 * (ri + 1)
    const shift = ox * (ri + 1)
    for (let x = -10; x <= w + 10; x += row.step) {
      const xx = x + shift
      const phase = xx * 0.02 + ri * 1.3
      const bend = Math.sin(t * row.sway * 2 + phase) * 10 + Math.sin(t * 0.7 + phase * 1.7) * 6
      const height = h * row.hgt * (0.75 + hash(x * 7.77 + ri) * 0.5)
      ctx.beginPath()
      ctx.moveTo(xx, y0 + 14)
      ctx.quadraticCurveTo(xx + bend * 0.4, y0 - height * 0.55, xx + bend, y0 - height)
      ctx.stroke()
    }
  })
  // 游走萤火虫(5 个,正余弦游走 + 亮度呼吸)
  for (let i = 0; i < 5; i++) {
    const fx = w * (0.12 + hash(i * 5.5) * 0.76) + Math.sin(t * (0.3 + hash(i) * 0.25) + i * 2) * w * 0.04
    const fy = h * (0.45 + hash(i * 8.8) * 0.4) + Math.cos(t * (0.4 + hash(i * 2.2) * 0.3) + i) * h * 0.05
    const breath = 0.5 + 0.5 * Math.sin(t * 1.8 + i * 2.4)
    ctx.globalAlpha = 0.25 + breath * 0.6
    ctx.fillStyle = '#fde68a'
    ctx.beginPath(); ctx.arc(fx, fy, 2.2, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 0.08 + breath * 0.12
    ctx.beginPath(); ctx.arc(fx, fy, 7, 0, Math.PI * 2); ctx.fill()
  }
  ctx.globalAlpha = 1
}

// ── ocean: 海底——幽蓝渐变 + 顶部光柱(摇摆梯形)+ 焦散光斑 + 上升气泡 + 摆动水草 ──
function drawOcean(s: SceneCtx): void {
  const { ctx, w, h, t } = s
  ctx.fillStyle = vgrad(ctx, 0, 0, 0, h, [[0, '#0d5e6e'], [0.5, '#074652'], [1, '#03232c']])
  ctx.fillRect(0, 0, w, h)
  // 顶部光柱(3-4 条缓慢摇摆的半透明白梯形,顶端亮根渐隐)
  for (let i = 0; i < 4; i++) {
    const baseX = w * (0.14 + i * 0.24) + (s.px - w / 2) * 0.01
    ctx.save()
    ctx.translate(baseX, -20)
    ctx.rotate(Math.sin(t * 0.35 + i * 1.7) * 0.12)
    ctx.fillStyle = vgrad(ctx, 0, 0, 0, h, [[0, 'rgba(190, 240, 255, 0.16)'], [1, 'rgba(190, 240, 255, 0)']])
    ctx.beginPath()
    ctx.moveTo(-14, 0)
    ctx.lineTo(14, 0)
    ctx.lineTo(58, h * 0.9)
    ctx.lineTo(-2, h * 0.9)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
  // 焦散光斑(几个大的低透明度椭圆,随 t 缓慢变形位移)
  for (let i = 0; i < 5; i++) {
    const ex = w * (0.1 + hash(i * 3.3) * 0.8) + Math.sin(t * 0.25 + i * 2.2) * 40
    const ey = h * (0.12 + hash(i * 7.1) * 0.35) + Math.cos(t * 0.2 + i) * 24
    const rx = Math.max(10, 60 + hash(i * 9.7) * 70 + Math.sin(t * 0.4 + i * 1.3) * 14)
    const ry = Math.max(6, rx * (0.32 + Math.sin(t * 0.3 + i) * 0.08))
    ctx.globalAlpha = 0.05 + hash(i * 4.1) * 0.04
    ctx.fillStyle = '#bff0ff'
    ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2); ctx.fill()
  }
  ctx.globalAlpha = 1
  // 海底
  ctx.fillStyle = vgrad(ctx, 0, h * 0.88, 0, h, [[0, '#0a4a44'], [1, '#06342f']])
  ctx.fillRect(0, h * 0.88, w, h * 0.12)
  // 底部水草(贝塞尔,相位差摆动)
  for (let i = 0; i < 9; i++) {
    const baseX = w * (0.04 + i * 0.115) + (s.px - w / 2) * 0.03
    for (let c = 0; c < 3; c++) {
      const bx = baseX + c * 7 - 7
      const height = h * (0.12 + hash(i * 8.8 + c) * 0.16)
      const sway = Math.sin(t * (0.8 + hash(i + c * 3) * 0.5) + i + c * 2) * 16
      ctx.strokeStyle = c % 2 === 0 ? '#0e6b52' : '#0b5a49'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(bx, h + 4)
      ctx.bezierCurveTo(bx - 4, h - height * 0.4, bx + sway * 0.5, h - height * 0.7, bx + sway, h - height)
      ctx.stroke()
    }
  }
  // 上升气泡(确定性列,横向微摆)
  for (let col = 0; col < 7; col++) {
    const colX = w * (0.07 + col * 0.14) + Math.sin(col * 2.1) * 18 + (s.px - w / 2) * 0.02
    for (let j = 0; j < 4; j++) {
      const speed = 26 + hash(col * 3.1 + j) * 34
      const y = wrap(hash(col * 5.3 + j * 2.7) * (h + 30) + h - t * speed, h + 30) - 15
      const x = colX + Math.sin(t * 1.4 + col + j * 1.9) * 7
      const r = 1.6 + hash(col + j * 4.4) * 2.6
      ctx.globalAlpha = 0.22 + hash(col * 6.6 + j) * 0.2
      ctx.strokeStyle = '#cdeef8'
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
    }
  }
  ctx.globalAlpha = 1
}

// ── fusion: 融合——星空 + 极光 + 气泡同帧采样混合(各透明度压低) ──
function drawFusion(s: SceneCtx): void {
  const { ctx, w, h, t } = s
  ctx.fillStyle = vgrad(ctx, 0, 0, 0, h, [[0, '#0b0721'], [0.5, '#101c33'], [1, '#071e26']])
  ctx.fillRect(0, 0, w, h)
  // 星空(压低)
  const ox = (s.px - w / 2) * 0.015
  for (let i = 0; i < 50; i++) {
    const x = hash(i * 1.37) * w + ox
    const y = hash(i * 2.71 + 5) * h * 0.7
    ctx.globalAlpha = 0.12 + 0.2 * (0.5 + 0.5 * Math.sin(t * 1.3 + hash(i * 4.4) * 6.28))
    ctx.fillStyle = '#b9c8e8'
    ctx.fillRect(x, y, 1.4, 1.4)
  }
  // 极光(压低:绿 + 紫两条幕)
  const auroras = [
    { color: '#34d399', phase: 0, speed: 0.6, alpha: 0.07 },
    { color: '#a78bfa', phase: 2.6, speed: 0.45, alpha: 0.06 },
  ]
  for (const a of auroras) {
    ctx.globalAlpha = a.alpha
    ctx.fillStyle = a.color
    const top = (x: number): number => h * 0.16 + Math.sin((x / w) * Math.PI * 2 + a.phase + t * a.speed) * h * 0.05
    ctx.beginPath()
    ctx.moveTo(0, top(0))
    for (let x = 0; x <= w; x += 18) ctx.lineTo(x, top(x))
    for (let x = w; x >= 0; x -= 18) {
      ctx.lineTo(x, top(x) + h * 0.24 + Math.sin((x / w) * Math.PI * 1.3 + a.phase * 1.7 - t * a.speed * 0.7) * h * 0.04)
    }
    ctx.closePath()
    ctx.fill()
  }
  // 上升气泡(压低:4 列,更淡)
  for (let col = 0; col < 4; col++) {
    const colX = w * (0.15 + col * 0.22) + (s.px - w / 2) * 0.02
    for (let j = 0; j < 3; j++) {
      const speed = 22 + hash(col * 3.1 + j) * 26
      const y = wrap(hash(col * 5.3 + j * 2.7) * (h + 30) + h - t * speed, h + 30) - 15
      const x = colX + Math.sin(t * 1.2 + col + j * 1.9) * 6
      ctx.globalAlpha = 0.12 + hash(col * 6.6 + j) * 0.1
      ctx.strokeStyle = '#9fd8e8'
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(x, y, 1.4 + hash(col + j * 4.4) * 2, 0, Math.PI * 2); ctx.stroke()
    }
  }
  ctx.globalAlpha = 1
}

type ScenePainter = (s: SceneCtx) => void

/** Partial 使未知 id(运行时字符串)的索引访问可判 undefined → 抛错而非静默。 */
const PAINTERS: Partial<Record<SceneId, ScenePainter>> = {
  station: drawStation,
  desert: drawDesert,
  snow: drawSnow,
  grass: drawGrass,
  ocean: drawOcean,
  fusion: drawFusion,
}

/** 绘制指定场景背景。未知 id 显式抛错(不静默 no-op,便于接线层尽早发现)。 */
export function drawScene(id: SceneId, s: SceneCtx): void {
  const paint = PAINTERS[id]
  if (paint === undefined) throw new Error(`[games/scene] unknown scene id: ${String(id)}`)
  paint(s)
}
