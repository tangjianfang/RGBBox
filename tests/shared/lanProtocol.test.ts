// R209 (FR-LN01-03): LAN 协议纯函数——帧编解码/版本握手/beacon 解析。
// 二期 (FR-LN03 断线恢复与一致性):snap seq 编解码 / resync+spectate 消息 / SnapTracker 对账。
import { describe, expect, it } from 'vitest'
import {
  FrameDecoder,
  LAN_MAX_FRAME_BYTES,
  SnapTracker,
  encodeFrame,
  hashWellFormed,
  parseBeacon,
  versionsCompatible,
  type LanBeacon,
  type LanMessage,
} from '../../src/shared/lanProtocol'

describe('R209 lanProtocol', () => {
  it('encodeFrame→FrameDecoder 往返(粘包/半包)', () => {
    const a: LanMessage = { t: 'hello', v: 1, av: '1.0.0' }
    const b: LanMessage = { t: 'snap', s: { wave: 3 }, h: '3:120:2:9', seq: 3 }
    const wire = Buffer.concat([encodeFrame(a), encodeFrame(b)])
    // 按任意切分喂入都应还原出两条
    const cut = Math.floor(wire.length / 3)
    const d1 = new FrameDecoder()
    expect(d1.push(wire.subarray(0, cut))).toEqual([])
    const out = [...d1.push(wire.subarray(cut, cut * 2)), ...d1.push(wire.subarray(cut * 2))]
    expect(out).toEqual([a, b])
  })

  it('超限帧:encode 抛错 / 解码端抛错(调用方断连)', () => {
    expect(() => encodeFrame({ t: 'snap', s: 'x'.repeat(LAN_MAX_FRAME_BYTES + 1), h: '', seq: 1 })).toThrow()
    const head = Buffer.alloc(4)
    head.writeUInt32LE(LAN_MAX_FRAME_BYTES + 1, 0)
    expect(() => new FrameDecoder().push(head)).toThrow()
  })

  it('版本握手:app 版本不一致即不兼容(FR-LN01③)', () => {
    expect(versionsCompatible('1.2.3', '1.2.3')).toBe(true)
    expect(versionsCompatible('1.2.3', '1.2.4')).toBe(false)
  })

  it('parseBeacon:合法包通过,坏包/版本不符返回 null', () => {
    const beacon: LanBeacon = { t: 'rgbbox-lan', v: 1, av: '1.0.0', n: 'room', g: 'td', p: 53890, c: 1 }
    const buf = Buffer.from(JSON.stringify(beacon), 'utf8')
    expect(parseBeacon(buf, '1.0.0')).toEqual(beacon)
    expect(parseBeacon(buf, '1.0.1')).toBeNull() // 版本不符
    expect(parseBeacon(Buffer.from('not-json'))).toBeNull()
    expect(parseBeacon(Buffer.from(JSON.stringify({ t: 'other' })))).toBeNull()
    expect(parseBeacon(Buffer.alloc(8192))).toBeNull() // 超长包丢弃
  })
})

describe('R209 二期 lanProtocol(seq 对账/resync/spectate/续传标记)', () => {
  it('snap 带 seq 编解码往返(半包切分)', () => {
    const a: LanMessage = { t: 'snap', s: { wave: 9, towers: [1, 2] }, h: '9:410:6:31', seq: 7 }
    const wire = encodeFrame(a)
    const d = new FrameDecoder()
    const cut = 5 // 头 4 字节 + 1 字节载荷,强制半包
    expect(d.push(wire.subarray(0, cut))).toEqual([])
    expect(d.push(wire.subarray(cut))).toEqual([a])
  })

  it('resync/spectate/hello(id)/welcome(resume+seq) 编解码往返', () => {
    const msgs: LanMessage[] = [
      { t: 'hello', v: 1, av: '1.0.0', id: 'guest-session-1' },
      { t: 'welcome', v: 1, g: 'td', resume: true, seq: 42 },
      { t: 'resync' },
      { t: 'spectate' },
    ]
    expect(new FrameDecoder().push(Buffer.concat(msgs.map(encodeFrame)))).toEqual(msgs)
  })

  it('SnapTracker:seq 跳号→resync;补发同 seq/旧 seq 回退/无 seq 不触发', () => {
    const t = new SnapTracker()
    expect(t.push(1, 'h1')).toEqual({ resync: false, hashAnomaly: false }) // 首帧为基线
    expect(t.push(2, 'h2').resync).toBe(false) // 连续
    expect(t.push(5, 'h5').resync).toBe(true) // 跳号(丢帧)
    expect(t.push(5, 'h5').resync).toBe(false) // 房主补发同 seq 全量快照 → 不循环
    expect(t.push(3, 'h3').resync).toBe(false) // 旧 seq 回退不触发
    expect(t.push(undefined, 'h').resync).toBe(false) // 一期旧端无 seq:不做对账
  })

  it('SnapTracker:连续 3 帧 hash 异常→告警一次;好 hash/断续打断 streak', () => {
    const long = 'x'.repeat(129)
    const t = new SnapTracker()
    t.push(1, 'ok')
    expect(t.push(2, '').hashAnomaly).toBe(false)
    expect(t.push(3, long).hashAnomaly).toBe(false)
    expect(t.push(4, '').hashAnomaly).toBe(true) // 连续第 3 帧 → 告警
    expect(t.push(5, '').hashAnomaly).toBe(false) // 告警后 streak 归零
    expect(t.push(6, long).hashAnomaly).toBe(false)
    expect(t.push(7, long).hashAnomaly).toBe(true) // 持续异常再次满 3 → 再告警
    t.push(8, 'good')
    expect(t.push(9, '').hashAnomaly).toBe(false) // 好 hash 打断后重新累计
    expect(t.push(10, '').hashAnomaly).toBe(false)
    // seq 断续(每帧都跳号)的异常 hash 不计入 streak
    const t2 = new SnapTracker()
    t2.push(1, 'ok')
    t2.push(3, '')
    t2.push(5, '')
    t2.push(7, '')
    expect(t2.push(9, '').hashAnomaly).toBe(false)
  })

  it('SnapTracker:rebase(welcome 续传基线)与 reset', () => {
    const t = new SnapTracker()
    t.push(10, 'ok')
    t.reset()
    expect(t.push(1, 'ok')).toEqual({ resync: false, hashAnomaly: false }) // reset 后首帧为新基线
    t.rebase(41) // welcome{resume:true, seq:41}
    expect(t.push(43, 'ok').resync).toBe(true) // 续传后的跳号仍可检出
    expect(t.push(42, 'ok').resync).toBe(false)
  })

  it('hashWellFormed:空串/超长/非字符串为非法', () => {
    expect(hashWellFormed('3:120:2:9')).toBe(true)
    expect(hashWellFormed('x'.repeat(128))).toBe(true)
    expect(hashWellFormed('')).toBe(false)
    expect(hashWellFormed('x'.repeat(129))).toBe(false)
    expect(hashWellFormed(undefined)).toBe(false)
    expect(hashWellFormed(42)).toBe(false)
  })
})
