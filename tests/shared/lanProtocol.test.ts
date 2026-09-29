// R209 (FR-LN01-03): LAN 协议纯函数——帧编解码/版本握手/beacon 解析。
import { describe, expect, it } from 'vitest'
import {
  FrameDecoder,
  LAN_MAX_FRAME_BYTES,
  encodeFrame,
  parseBeacon,
  versionsCompatible,
  type LanBeacon,
  type LanMessage,
} from '../../src/shared/lanProtocol'

describe('R209 lanProtocol', () => {
  it('encodeFrame→FrameDecoder 往返(粘包/半包)', () => {
    const a: LanMessage = { t: 'hello', v: 1, av: '1.0.0' }
    const b: LanMessage = { t: 'snap', s: { wave: 3 }, h: '3:120:2:9' }
    const wire = Buffer.concat([encodeFrame(a), encodeFrame(b)])
    // 按任意切分喂入都应还原出两条
    const cut = Math.floor(wire.length / 3)
    const d1 = new FrameDecoder()
    expect(d1.push(wire.subarray(0, cut))).toEqual([])
    const out = [...d1.push(wire.subarray(cut, cut * 2)), ...d1.push(wire.subarray(cut * 2))]
    expect(out).toEqual([a, b])
  })

  it('超限帧:encode 抛错 / 解码端抛错(调用方断连)', () => {
    expect(() => encodeFrame({ t: 'snap', s: 'x'.repeat(LAN_MAX_FRAME_BYTES + 1), h: '' })).toThrow()
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
