/**
 * R209 (FR-LN01/02/03/04): LAN 联机服务 —— 主进程传输层,零 npm 依赖
 * (node:dgram 广播发现 + node:net TCP 直连)。引擎权威在房主渲染进程:
 * 主进程只搬运(指令上行/快照下行)与看门(心跳/版本握手/载荷上限)。
 * 二期(FR-LN03 断线恢复与一致性):快照带单调 seq + 跳号 resync 补发、
 * 会话身份保留(断线重连 welcome 带 resume:true+当前 seq)、观战态、
 * hash 异常 streak 检测(lan:event error:hash-anomaly)。
 *
 * 边界(强制):仅本网段;无公网、无 NAT 穿透、无账号;渲染层经 IPC 桥接入。
 */
import * as dgram from 'node:dgram'
import * as net from 'node:net'
import { randomUUID } from 'node:crypto'
import type { BrowserWindow, IpcMain } from 'electron'
import { ipcChannels } from '../shared/ipc'
import {
  FrameDecoder,
  LAN_BEACON_PORT,
  LAN_DEAD_AFTER_MS,
  LAN_HEARTBEAT_MS,
  LAN_PROTOCOL_VERSION,
  SnapTracker,
  encodeFrame,
  parseBeacon,
  versionsCompatible,
  type LanBeacon,
  type LanGame,
  type LanMessage,
} from '../shared/lanProtocol'

export interface LanEvent {
  kind: 'peer-joined' | 'peer-left' | 'cmd' | 'snap' | 'rejected' | 'closed' | 'error'
  detail?: unknown
}

interface Peer {
  socket: net.Socket
  decoder: FrameDecoder
  lastSeen: number
  /** 所属房主世代(teardown 递增;过期 close 事件据此丢弃,防跨局误记 resumable)。 */
  epoch: number
  /** 对端会话身份(hello.id;断线重连识别用)。 */
  sessionId?: string
  /** 观战位(FR-LN03 二期:该 peer 的 cmd 直接忽略,只收快照)。 */
  spectates: boolean
}

export class LanService {
  private win: BrowserWindow | null = null
  private role: 'idle' | 'host' | 'guest' = 'idle'
  private beacon: dgram.Socket | null = null
  private beaconTimer: NodeJS.Timeout | null = null
  private room: { name: string; game: LanGame; port: number } | null = null
  private server: net.Server | null = null
  private peers = new Map<string, Peer>()
  private guest: { socket: net.Socket; decoder: FrameDecoder; lastSeen: number } | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private appVersion = '0.0.0'
  // ── 二期(FR-LN03 断线恢复与一致性)状态 ──
  /** 客端会话身份:TCP 断开不清(重连识别),仅显式 teardown 换新。 */
  private guestId: string | null = null
  /** 房主快照序号(单调递增;peer 断开不重置,仅 teardown 归零)。 */
  private snapSeq = 0
  /** 房主最近一帧全量快照缓存(resync 时立即补发,不必等下一拍 15Hz)。 */
  private lastSnap: { s: unknown; h: string; seq: number } | null = null
  /** 断线可恢复会话(sessionId → 是否观战;房间销毁即清空)。 */
  private resumable = new Map<string, boolean>()
  /** 房主世代计数(见 Peer.epoch)。 */
  private epoch = 0
  /** 客端快照对账器(seq 跳号→resync;hash 异常 streak→告警)。 */
  private snapTracker = new SnapTracker()

  bind(win: BrowserWindow, appVersion: string): void {
    this.win = win
    this.appVersion = appVersion
  }

  private emit(event: LanEvent): void {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send(ipcChannels.lanEvent, event)
  }

  get state(): { role: 'idle' | 'host' | 'guest'; room: { name: string; game: LanGame; port: number } | null; peers: number } {
    return { role: this.role, room: this.room, peers: this.peers.size }
  }

  // ── 发现层(FR-LN01):房主周期广播 beacon;客端监听 ─────────────────────

  /** 客端:开始监听 beacon,发现的房间经 lan:event(kind=found)推给渲染层。 */
  startDiscovery(): void {
    this.stopDiscovery()
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    sock.on('message', (buf, rinfo) => {
      const beacon = parseBeacon(buf, this.appVersion)
      if (beacon) this.emit({ kind: 'peer-joined', detail: { found: { ...beacon, ip: rinfo.address } } })
    })
    sock.on('error', () => undefined) // 端口被占(常见于本机双实例)→ 静默,走手输直连兜底
    sock.bind(LAN_BEACON_PORT, () => {
      try { sock.setBroadcast(true) } catch { /* best-effort */ }
    })
    this.beacon = sock
  }

  stopDiscovery(): void {
    this.beacon?.close()
    this.beacon = null
  }

  // ── 会话层(FR-LN02/03) ────────────────────────────────────────────────

  /** 房主:建房 —— TCP server(端口系统分配)+ 1s beacon 广播 + 心跳看门。
   *  端口在 'listening' 后才可知(异步),beacon/房间登记随之启动;返回值
   *  的 port 恒为 0,真实端口经 lanState().room.port 暴露。 */
  host(name: string, game: LanGame): { port: number } {
    this.teardown()
    const server = net.createServer((socket) => this.onPeerSocket(socket))
    this.role = 'host'
    this.server = server
    server.listen(0, '0.0.0.0', () => {
      const port = (server.address() as net.AddressInfo).port
      this.room = { name, game, port }
      const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true })
      sock.on('error', () => undefined)
      sock.bind(() => {
        try { sock.setBroadcast(true) } catch { /* best-effort */ }
        this.beaconTimer = setInterval(() => {
          const payload: LanBeacon = {
            t: 'rgbbox-lan', v: LAN_PROTOCOL_VERSION, av: this.appVersion,
            n: name, g: game, p: port, c: 1 + this.peers.size,
          }
          const buf = Buffer.from(JSON.stringify(payload), 'utf8')
          sock.send(buf, LAN_BEACON_PORT, '255.255.255.255')
          sock.send(buf, LAN_BEACON_PORT, '127.0.0.1') // 本机回环(双实例 E2E)
        }, 1000)
      })
      this.beacon = sock
    })
    this.startHeartbeat()
    return { port: 0 }
  }

  /** 客端:直连加入(发现面板与手输 IP 共用此口)。版本不一致被拒(FR-LN01③)。
   *  二期:hello 附会话身份 id;TCP 断开后再次 join 同一 host 时,房主在房间
   *  未销毁的情况下 welcome 带 resume:true + 当前 seq,返回值原样透传渲染层,
   *  据此区分续传与新局(FR-LN03 重连窗口)。 */
  join(
    ip: string,
    port: number,
  ): Promise<{ ok: true; game: LanGame; resume?: boolean; seq?: number } | { ok: false; reason: string }> {
    const sessionId = this.guestId ?? randomUUID() // 断线重连沿用旧身份;显式离开后为 null → 换新
    this.teardown()
    this.guestId = sessionId
    return new Promise((resolve) => {
      const socket = net.connect({ host: ip, port, timeout: 4000 })
      const decoder = new FrameDecoder()
      let settled = false
      const finish = (
        r: { ok: true; game: LanGame; resume?: boolean; seq?: number } | { ok: false; reason: string },
      ): void => {
        if (settled) return
        settled = true
        resolve(r)
      }
      socket.on('connect', () => {
        socket.write(encodeFrame({ t: 'hello', v: LAN_PROTOCOL_VERSION, av: this.appVersion, id: sessionId }))
      })
      socket.on('data', (chunk) => {
        let msgs: LanMessage[]
        try {
          msgs = decoder.push(chunk as Buffer)
        } catch {
          socket.destroy()
          finish({ ok: false, reason: 'bad-frame' })
          return
        }
        for (const msg of msgs) {
          if (msg.t === 'welcome') {
            this.role = 'guest'
            this.guest = { socket, decoder, lastSeen: Date.now() }
            if (msg.resume) this.snapTracker.rebase(msg.seq) // 续传基线;非续传保持 reset 态
            this.startHeartbeat()
            finish({ ok: true, game: msg.g, resume: msg.resume === true, seq: msg.seq })
          } else if (msg.t === 'reject') {
            this.emit({ kind: 'rejected', detail: msg.reason })
            socket.destroy()
            finish({ ok: false, reason: msg.reason })
          }
        }
        if (this.guest && this.guest.socket === socket) {
          this.guest.lastSeen = Date.now()
          for (const msg of msgs) {
            if (msg.t === 'snap') {
              const verdict = this.snapTracker.push(msg.seq, msg.h)
              if (verdict.resync) this.sendResync() // 跳号(丢帧)→ 请求全量快照
              if (verdict.hashAnomaly) this.emit({ kind: 'error', detail: 'hash-anomaly' })
              this.emit({ kind: 'snap', detail: msg.s })
            } else if (msg.t === 'pong') { /* lastSeen 已刷新 */ }
          }
        }
      })
      socket.on('error', (err) => finish({ ok: false, reason: err.message }))
      socket.on('timeout', () => {
        socket.destroy()
        finish({ ok: false, reason: 'timeout' })
      })
      socket.on('close', () => {
        if (this.role === 'guest' && this.guest?.socket === socket) {
          this.guest = null
          this.role = 'idle'
          this.emit({ kind: 'peer-left' })
        }
        finish({ ok: false, reason: 'closed' })
      })
    })
  }

  private onPeerSocket(socket: net.Socket): void {
    const id = randomUUID()
    const peer: Peer = {
      socket, decoder: new FrameDecoder(), lastSeen: Date.now(),
      epoch: this.epoch, spectates: false,
    }
    socket.on('data', (chunk) => {
      let msgs: LanMessage[]
      try {
        msgs = peer.decoder.push(chunk as Buffer)
      } catch {
        socket.destroy() // 超限帧直接断(NFR-08)
        return
      }
      peer.lastSeen = Date.now()
      for (const msg of msgs) {
        if (msg.t === 'hello') {
          if (msg.v !== LAN_PROTOCOL_VERSION || !versionsCompatible(msg.av, this.appVersion)) {
            socket.write(encodeFrame({ t: 'reject', reason: 'version-mismatch' }))
            socket.end()
            return
          }
          // 二期:同一会话身份重连且房间未销毁 → welcome 带 resume:true + 当前 seq
          let resume = false
          if (msg.id !== undefined && this.resumable.has(msg.id)) {
            peer.spectates = this.resumable.get(msg.id) ?? false // 观战位随会话身份恢复
            this.resumable.delete(msg.id)
            resume = true
          }
          peer.sessionId = msg.id
          this.peers.set(id, peer)
          socket.write(
            resume
              ? encodeFrame({ t: 'welcome', v: LAN_PROTOCOL_VERSION, g: this.room?.game ?? 'td', resume: true, seq: this.snapSeq })
              : encodeFrame({ t: 'welcome', v: LAN_PROTOCOL_VERSION, g: this.room?.game ?? 'td' }),
          )
          this.emit({ kind: 'peer-joined', detail: { joined: true, id, resume } })
        } else if (msg.t === 'spectate') {
          peer.spectates = true // welcome 后随时可切观战(FR-LN03)
        } else if (msg.t === 'cmd') {
          if (!peer.spectates) this.emit({ kind: 'cmd', detail: msg.c }) // 观战 peer 指令直接忽略
        } else if (msg.t === 'resync') {
          this.replyResync(socket) // 立即补发全量快照(带当前 seq)
        } else if (msg.t === 'ping') {
          socket.write(encodeFrame({ t: 'pong' }))
        }
      }
    })
    socket.on('error', () => undefined)
    socket.on('close', () => {
      const was = this.peers.delete(id)
      if (was) {
        // 二期:peer 断开不清房间/不重置序号,仅登记会话身份供重连续传
        if (this.role === 'host' && peer.epoch === this.epoch && peer.sessionId !== undefined) {
          this.resumable.set(peer.sessionId, peer.spectates)
        }
        this.emit({ kind: 'peer-left' })
      }
    })
  }

  /** 房主:对 resync 的响应——立即补发缓存的全量快照(带当前 seq);尚未推过
   *  快照则静默(下一拍 15Hz 广播兜底)。补发不推进 seq,客端不会循环 resync。 */
  private replyResync(socket: net.Socket): void {
    if (!this.lastSnap) return
    try {
      socket.write(encodeFrame({ t: 'snap', s: this.lastSnap.s, h: this.lastSnap.h, seq: this.lastSnap.seq }))
    } catch { /* close 兜底 */ }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now()
      if (this.role === 'guest' && this.guest) {
        try { this.guest.socket.write(encodeFrame({ t: 'ping' })) } catch { /* close 会触发 */ }
        if (now - this.guest.lastSeen > LAN_DEAD_AFTER_MS) {
          this.guest.socket.destroy() // 触发 close→peer-left(FR-LN03:2s 心跳 5s 判死)
        }
      }
      if (this.role === 'host') {
        for (const peer of this.peers.values()) {
          if (now - peer.lastSeen > LAN_DEAD_AFTER_MS) peer.socket.destroy()
        }
      }
    }, LAN_HEARTBEAT_MS)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
  }

  // ── 渲染层出入口 ───────────────────────────────────────────────────────

  /** 房主:推快照(渲染层节流 15Hz;hash 由渲染层计算附带)。
   *  二期:附单调递增 seq 供客端对账;超限帧丢弃时不推进 seq(不会造成假跳号),
   *  并缓存本帧供 resync 立即补发。 */
  pushSnapshot(s: unknown, h: string): void {
    if (this.role !== 'host') return
    const seq = this.snapSeq + 1
    let frame: Buffer
    try {
      frame = encodeFrame({ t: 'snap', s, h, seq })
    } catch {
      return // 超限:丢弃本帧(下一帧再来;seq 未推进)
    }
    this.snapSeq = seq
    this.lastSnap = { s, h, seq }
    for (const peer of this.peers.values()) {
      try { peer.socket.write(frame) } catch { /* close 兜底 */ }
    }
  }

  /** 客端:上行指令。 */
  sendCmd(c: unknown): void {
    if (this.role !== 'guest' || !this.guest) return
    try { this.guest.socket.write(encodeFrame({ t: 'cmd', c: c as never })) } catch { /* close 兜底 */ }
  }

  /** 客端:切换观战态(只收快照不发指令;房主将忽略本端后续 cmd)。
   *  渲染层接线(IPC 通道)由主干统一补齐。 */
  sendSpectate(): void {
    if (this.role !== 'guest' || !this.guest) return
    try { this.guest.socket.write(encodeFrame({ t: 'spectate' })) } catch { /* close 兜底 */ }
  }

  /** 客端:seq 跳号(丢帧)时请求房主补发全量快照(FR-LN03)。 */
  private sendResync(): void {
    if (this.role !== 'guest' || !this.guest) return
    try { this.guest.socket.write(encodeFrame({ t: 'resync' })) } catch { /* close 兜底 */ }
  }

  teardown(): void {
    this.stopHeartbeat()
    if (this.beaconTimer) clearInterval(this.beaconTimer)
    this.beaconTimer = null
    this.stopDiscovery()
    if (this.beaconTimer) clearInterval(this.beaconTimer)
    for (const peer of this.peers.values()) peer.socket.destroy()
    this.peers.clear()
    this.guest?.socket.destroy()
    this.guest = null
    this.server?.close()
    this.server = null
    this.room = null
    this.role = 'idle'
    // 二期:会话/对账状态全部归零;世代 +1 使在途 close 事件不再登记 resumable
    this.guestId = null
    this.snapSeq = 0
    this.lastSnap = null
    this.resumable.clear()
    this.snapTracker.reset()
    this.epoch++
  }
}

export function registerLanIpc(ipcMain: IpcMain, service: LanService): void {
  ipcMain.handle(ipcChannels.lanState, () => service.state)
  ipcMain.handle(ipcChannels.lanHost, (_e, name: string, _game: LanGame) => service.host(String(name ?? 'Room').slice(0, 32), 'td')) // 一期仅 TD 合作(tetris 次发)
  ipcMain.handle(ipcChannels.lanJoin, (_e, ip: string, port: number) => service.join(String(ip), Number(port) || 0))
  ipcMain.handle(ipcChannels.lanLeave, () => { service.teardown(); return true })
  ipcMain.handle(ipcChannels.lanDiscover, (_e, on: boolean) => { if (on) service.startDiscovery(); else service.stopDiscovery(); return true })
  ipcMain.handle(ipcChannels.lanCmd, (_e, c: unknown) => { service.sendCmd(c); return true })
  ipcMain.handle(ipcChannels.lanSnapshot, (_e, s: unknown, h: string) => { service.pushSnapshot(s, h); return true })
  // R209 二期: 客端声明观战(只收快照,指令被房主忽略)
  ipcMain.handle(ipcChannels.lanSpectate, () => { service.sendSpectate(); return true })
}
