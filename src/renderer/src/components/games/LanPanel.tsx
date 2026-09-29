/**
 * R209 (FR-LN01): LAN 房间面板 —— 建房/发现/直连加入。
 * 纯 DOM 浮层;网络一律经 window.rgbbox LAN 白名单桥(不直接触网)。
 */
import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { useI18n } from '../../i18n'

interface FoundRoom {
  key: string
  name: string
  ip: string
  port: number
  players: number
  at: number
}

interface Props {
  onHosted: () => void
  onJoined: () => void
  onClose: () => void
}

export function LanPanel({ onHosted, onJoined, onClose }: Props): JSX.Element {
  const { t } = useI18n()
  const [roomName, setRoomName] = useState('RGBBox')
  const [rooms, setRooms] = useState<FoundRoom[]>([])
  const [manual, setManual] = useState('')
  const [status, setStatus] = useState<'idle' | 'hosting' | 'guest-wait'>('idle')
  const roomsRef = useRef<Map<string, FoundRoom>>(new Map())

  useEffect(() => {
    // 发现:监听 beacon 推流;3s 过期的条目滚出列表
    void window.rgbbox?.lanDiscover?.(true)
    const prune = setInterval(() => {
      const now = Date.now()
      for (const [k, v] of roomsRef.current) {
        if (now - v.at > 3200) roomsRef.current.delete(k)
      }
      setRooms([...roomsRef.current.values()])
    }, 1000)
    // 打开面板时同步主进程会话状态(重复打开面板不丢 hosting/guest 态)
    void window.rgbbox?.lanState?.().then((s) => {
      if (s.role === 'host') setStatus('hosting')
      else if (s.role === 'guest') setStatus('guest-wait')
    })
    return () => {
      clearInterval(prune)
      void window.rgbbox?.lanDiscover?.(false)
    }
  }, [])

  useEffect(() => {
    const off = window.rgbbox?.onLanEvent?.((e) => {
      if (e.kind === 'peer-joined' && e.detail && typeof e.detail === 'object' && 'found' in e.detail) {
        const b = (e.detail as { found: { n: string; ip: string; p: number; c: number } }).found
        roomsRef.current.set(`${b.n}:${b.p}`, { key: `${b.n}:${b.p}`, name: b.n, ip: b.ip, port: b.p, players: b.c, at: Date.now() })
        setRooms([...roomsRef.current.values()])
      } else if (e.kind === 'rejected') {
        setStatus('idle')
        window.alert(t('games.lan.rejected'))
      }
    })
    return () => { off?.() }
  }, [t])

  const host = useCallback(async () => {
    await window.rgbbox?.lanHost?.(roomName.trim() || 'RGBBox', 'td')
    setStatus('hosting')
    onHosted()
  }, [roomName, onHosted])

  const join = useCallback(async (ip: string, port: number) => {
    const res = await window.rgbbox?.lanJoin?.(ip, port)
    if (res && res.ok) {
      setStatus('guest-wait')
      onJoined()
    } else if (res && !res.ok) {
      setStatus('idle')
    }
  }, [onJoined])

  return (
    <div className="lan-panel panel" data-field="lan-panel" role="dialog" aria-label={t('games.lan.title')}>
      <div className="lan-head">
        <strong>{t('games.lan.title')}</strong>
        <button type="button" className="coach-off-btn" onClick={onClose}>{t('games.recap.dismiss')}</button>
      </div>

      {status === 'idle' ? (
        <>
          <div className="lan-row">
            <input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder={t('games.lan.roomName')} aria-label={t('games.lan.roomName')} />
            <button type="button" className="video-btn" data-action="lan-host" onClick={() => { void host() }}>{t('games.lan.host')}</button>
          </div>
          <p className="lan-sub">{t('games.lan.rooms')}</p>
          {rooms.length === 0 ? <p className="lan-empty">{t('games.lan.roomsEmpty')}</p> : null}
          <ul className="lan-rooms">
            {rooms.map((r) => (
              <li key={r.key}>
                <span>{r.name} · {r.ip} · {r.players}P</span>
                <button type="button" className="video-btn" data-action="lan-join" onClick={() => { void join(r.ip, r.port) }}>{t('games.lan.join')}</button>
              </li>
            ))}
          </ul>
          <div className="lan-row">
            <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="192.168.1.23:53890" aria-label={t('games.lan.manual')} />
            <button
              type="button"
              className="video-btn"
              data-action="lan-connect"
              onClick={() => {
                const [ip, port] = manual.trim().split(':')
                if (ip && port) void join(ip, Number(port))
              }}
            >{t('games.lan.connect')}</button>
          </div>
        </>
      ) : (
        <div className="lan-status">
          <p>{status === 'hosting' ? t('games.lan.hosting') : t('games.lan.guestWait')}</p>
          <button type="button" className="video-btn" data-action="lan-leave" onClick={() => { void window.rgbbox?.lanLeave?.(); setStatus('idle'); onClose() }}>{t('games.lan.leave')}</button>
        </div>
      )}
    </div>
  )
}
