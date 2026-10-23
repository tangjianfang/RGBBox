import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LAN_BEACON_PORT } from '../../src/shared/lanProtocol'

/**
 * R317a（REVIEW_2026-10-24 E-1）：LAN beacon 竞态回归锁。
 *
 * 缺陷本体（v0.3.85 本机 20 连 crash 实证，crash-20261011-*.json）：
 * 发现监听与房主广播共用 `this.beacon` 字段 + stopDiscovery 只关 socket 不清
 * beaconTimer —— host 建房后开发现 = 关掉房主广播 socket 而定时器存活，
 * interval 闭包 `sock.send` 对已关 dgram socket **同步 throw**
 * ERR_SOCKET_DGRAM_NOT_RUNNING（`sock.on('error')` 接不住同步异常）=
 * 每秒一条 uncaughtException，并把 crashLog 的 KEEP=20 历史挤光。
 *
 * fake 契约：close 后的 send 同步 throw（Node dgram healthCheck 路径的真实
 * 行为，crash 栈原文即 `at healthCheck (node:dgram) at Socket.send`）；
 * bind/listen 回调经 microtask 异步触发（复刻真实异步时序）。
 */
type Handler = (arg?: unknown) => void

interface FakeSocket {
  closed: boolean
  /** bind 落位端口；无参 bind（房主 beacon 临时端口）记 0 */
  boundPort: number
  sends: Array<{ port: number; host: string }>
  handlers: Record<string, Handler[]>
  on(ev: string, fn: Handler): FakeSocket
  /** 真实调用两种形态：bind(port, cb)（发现监听）与 bind(cb)（beacon 临时端口） */
  bind(...args: Array<unknown>): void
  setBroadcast: ReturnType<typeof vi.fn>
  close(): void
  send(_buf: Buffer, port: number, host: string): void
}

const h = vi.hoisted(() => ({ sockets: [] as unknown[] }))

vi.mock('node:dgram', () => ({
  createSocket: () => {
    const sock: FakeSocket = {
      closed: false,
      boundPort: -1,
      sends: [],
      handlers: {},
      on(ev, fn) { (this.handlers[ev] ??= []).push(fn); return this },
      bind(...args: Array<unknown>) {
        const port = args.find((a) => typeof a === 'number')
        this.boundPort = typeof port === 'number' ? port : 0
        const cb = args.find((a) => typeof a === 'function') as (() => void) | undefined
        if (cb) queueMicrotask(cb)
      },
      setBroadcast: vi.fn(),
      close() { this.closed = true },
      send(_buf, port, host) {
        if (this.closed) {
          throw Object.assign(new Error('Not running'), { code: 'ERR_SOCKET_DGRAM_NOT_RUNNING' })
        }
        this.sends.push({ port, host })
      },
    }
    h.sockets.push(sock)
    return sock
  },
}))

vi.mock('node:net', () => ({
  createServer: () => ({
    listen: (_port: number, _host: string, cb: () => void) => { queueMicrotask(cb) },
    address: () => ({ port: 53892 }),
    close: vi.fn(),
  }),
  connect: vi.fn(),
}))

const flush = async (): Promise<void> => {
  // listen cb → 建 beacon sock + bind cb → 建 timer：两跳 microtask
  for (let i = 0; i < 6; i++) await Promise.resolve()
}

/** 房主广播 socket = 无参 bind（临时端口）的那个。 */
const beaconSock = (): FakeSocket => {
  const s = h.sockets.find((x) => (x as FakeSocket).boundPort === 0) as FakeSocket | undefined
  if (!s) throw new Error('beacon socket not created')
  return s
}

describe('R317a LanService beacon/discovery 竞态', () => {
  let svc: InstanceType<typeof import('../../src/main/lanService').LanService>

  beforeEach(() => {
    vi.useFakeTimers()
    h.sockets.length = 0
  })

  afterEach(() => {
    svc?.teardown()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('host 期间开发现：发现 socket 独立监听 53891，房主广播不受影响（缺陷本体回放）', async () => {
    const { LanService } = await import('../../src/main/lanService')
    svc = new LanService()
    svc.host('room', 'td')
    await flush()
    const beacon = beaconSock()
    expect(beacon.closed).toBe(false)

    svc.startDiscovery() // 缺陷路径：旧实现此处关掉的是**房主**广播 socket
    const discovery = h.sockets[h.sockets.length - 1] as FakeSocket
    expect(discovery).not.toBe(beacon)
    expect(discovery.boundPort).toBe(LAN_BEACON_PORT)
    expect(beacon.closed).toBe(false) // 红：旧代码 discovery 共字段 → beacon 已被关

    vi.advanceTimersByTime(3000)
    // 红：旧代码 beacon 已关 → interval send 同步 throw ERR_SOCKET_DGRAM_NOT_RUNNING
    expect(beacon.sends.length).toBe(6) // 3 拍 × (广播 + 回环)
  })

  it('teardown 停广播定时器、关房主 beacon，之后零发送（回归锁）', async () => {
    const { LanService } = await import('../../src/main/lanService')
    svc = new LanService()
    svc.host('room', 'td')
    await flush()
    const beacon = beaconSock()
    svc.teardown()
    expect(beacon.closed).toBe(true)
    vi.advanceTimersByTime(5000)
    expect(beacon.sends.length).toBe(0)
  })

  it('teardown 后晚到的 listen 回调弃权：不建房间/beacon/timer（世代校验）', async () => {
    const { LanService } = await import('../../src/main/lanService')
    svc = new LanService()
    svc.host('room', 'td') // 不 flush：listen 回调还没跑
    svc.teardown() // 立刻拆房（epoch++）
    await flush() // 迟到的 listen 回调现在才执行
    expect(svc.state.role).toBe('idle')
    expect(svc.state.room).toBeNull()
    vi.advanceTimersByTime(5000)
    // 红：旧代码迟到回调照建 timer/beacon → 出现发送（或对已关 socket throw）
    expect(h.sockets.every((s) => (s as FakeSocket).sends.length === 0)).toBe(true)
  })

  it('广播 socket 被外部关闭后，定时器 send 的同步 throw 被兜底捕获（crash 风暴签名锁）', async () => {
    const { LanService } = await import('../../src/main/lanService')
    svc = new LanService()
    svc.host('room', 'td')
    await flush()
    const beacon = beaconSock()
    beacon.closed = true // 模拟异常路径下的已关 socket（send 同步 throw）
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow() // 红：旧代码 = uncaughtException 本体
  })
})
