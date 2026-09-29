/**
 * R209 (FR-LN01/02/03): LAN 联机共享协议 —— 纯数据与纯函数,主进程/测试共用。
 * 零 npm 依赖;渲染层不 import 本模块(网络全部经 window.rgbbox IPC 桥)。
 *
 * 传输约定(NFR-08 安全世界):
 *  - TCP 消息帧 = 4 字节小端长度 + UTF-8 JSON,单帧上限 MAX_FRAME_BYTES;
 *  - UDP beacon = 单包 JSON,超长直接丢弃;
 *  - 版本握手先行:hello 携带 PROTOCOL+APP 版本,不一致即拒绝。
 */

/** 协议大版本(不兼容变更时 +1,旧新互拒)。 */
export const LAN_PROTOCOL_VERSION = 1
/** UDP beacon 端口(发现层;TCP 会话端口由系统分配并写进 beacon)。 */
export const LAN_BEACON_PORT = 53891
/** 单帧/单包载荷上限(超限断连/丢弃——防异常大包)。 */
export const LAN_MAX_FRAME_BYTES = 256 * 1024
/** 心跳间隔与判死窗口(FR-LN03:2s 心跳,5s 无包判断线)。 */
export const LAN_HEARTBEAT_MS = 2000
export const LAN_DEAD_AFTER_MS = 5000

export type LanGame = 'td'

/** UDP beacon 载荷(1s 一发)。 */
export interface LanBeacon {
  t: 'rgbbox-lan'
  /** 协议版本。 */
  v: number
  /** 应用版本(app.getVersion())。 */
  av: string
  /** 房名。 */
  n: string
  /** 会话游戏。 */
  g: LanGame
  /** TCP 会话端口。 */
  p: number
  /** 当前人数(房主+已加入)。 */
  c: number
}

/** TCP 会话消息(双向)。 */
export type LanMessage =
  | { t: 'hello'; v: number; av: string }
  | { t: 'welcome'; v: number; g: LanGame }
  | { t: 'reject'; reason: string }
  | { t: 'ping' }
  | { t: 'pong' }
  | { t: 'cmd'; c: LanCommand }
  | { t: 'snap'; s: unknown; h: string }

/** 客端→房主的游戏指令(FR-LN04:TD 合作——建塔/升级/出售/技能)。 */
export type LanCommand =
  | { k: 'build'; kind: string; x: number; y: number }
  | { k: 'select'; id: number }
  | { k: 'upgrade' }
  | { k: 'sell' }
  | { k: 'meteor' }

/** 应用版本是否兼容(一期:字符串全等)。 */
export function versionsCompatible(a: string, b: string): boolean {
  return a === b
}

/** 编码一条 TCP 帧(长度前缀)。 */
export function encodeFrame(msg: LanMessage): Buffer {
  const json = Buffer.from(JSON.stringify(msg), 'utf8')
  if (json.length > LAN_MAX_FRAME_BYTES) throw new Error(`frame too large: ${json.length}`)
  const head = Buffer.alloc(4)
  head.writeUInt32LE(json.length, 0)
  return Buffer.concat([head, json])
}

/** 增量解码器:喂入任意分块,吐出完整消息;坏帧(超限)抛错由调用方断连。 */
export class FrameDecoder {
  private buf = Buffer.alloc(0)

  push(chunk: Buffer): LanMessage[] {
    this.buf = Buffer.concat([this.buf, chunk])
    const out: LanMessage[] = []
    while (this.buf.length >= 4) {
      const len = this.buf.readUInt32LE(0)
      if (len > LAN_MAX_FRAME_BYTES) throw new Error(`oversized frame: ${len}`)
      if (this.buf.length < 4 + len) break
      const json = this.buf.subarray(4, 4 + len).toString('utf8')
      this.buf = this.buf.subarray(4 + len)
      out.push(JSON.parse(json) as LanMessage)
    }
    return out
  }
}

/** beacon 包解析(不合法/超限/版本不符返回 null)。 */
export function parseBeacon(buf: Buffer, appVersion: string): LanBeacon | null {
  if (buf.length === 0 || buf.length > 4096) return null
  let parsed: Partial<LanBeacon>
  try {
    parsed = JSON.parse(buf.toString('utf8')) as Partial<LanBeacon>
  } catch {
    return null
  }
  if (parsed.t !== 'rgbbox-lan' || typeof parsed.p !== 'number' || typeof parsed.n !== 'string') return null
  if (parsed.v !== LAN_PROTOCOL_VERSION || !versionsCompatible(parsed.av ?? '', appVersion)) return null
  return parsed as LanBeacon
}
