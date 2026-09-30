/**
 * R213: 角色头像选择器 —— 每玩家(P1-P4)可设本地图片作游戏内角色大头像。
 *
 * 纯展示组件(props 驱动:slot/label + 可选 onSet/onClear 回调),头像数据经
 * window.rgbbox 头像白名单桥读;「更换」由组件内部直接调 avatarSet(主进程开
 * 原生选图对话框 → 128×128 缩裁 PNG 落盘),成功后自刷新预览。游戏画布
 * drawImage 接线由主干统一做,本组件不触碰游戏渲染。
 *
 * 样式说明:games 面板样式集中在 styles/app.css(R213 未开 CSS 改动口),
 * 本组件用内联样式 + 复用 video-btn 通用按钮类;颜色引用全局 tokens.css 变量。
 */
import { useCallback, useEffect, useState, type CSSProperties, type JSX } from 'react'
import { useI18n } from '../../i18n'

interface Props {
  /** 玩家席位 1-4(主进程按 slot 落盘/读取)。 */
  slot: number
  /** 展示名(如 "P1"/玩家昵称)。 */
  label: string
  /** 点「更换」时的旁听回调(容器可借此联动;默认头像设置走组件内部)。 */
  onSet?: (slot: number) => void
  /** 点「清除」时的旁听回调。 */
  onClear?: (slot: number) => void
}

/** P1-P4 占位底色(暗底上的区分色,取自游戏面板既有色系)。 */
const SLOT_COLORS = ['#42e8a9', '#67e8f9', '#f4bf75', '#f28ba8'] as const

const ROOT_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 10px',
  borderRadius: 10,
  border: '1px solid rgba(255, 255, 255, 0.08)',
  background: 'rgba(255, 255, 255, 0.03)',
}

const PREVIEW_STYLE: CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: '50%',
  overflow: 'hidden',
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 15,
  fontWeight: 700,
}

const SMALL_BTN_STYLE: CSSProperties = { padding: '4px 10px', fontSize: 11 }

export function AvatarPicker({ slot, label, onSet, onClear }: Props): JSX.Element {
  const { t } = useI18n()
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (s: number): Promise<void> => {
    try {
      setDataUrl((await window.rgbbox?.avatarGet?.(s)) ?? null)
    } catch {
      setDataUrl(null) // 无桥/读失败一律按「未设置」呈现
    }
  }, [])

  // 打开/换 slot 时拉当前头像(主进程 <userData>/avatars/avatar-<slot>.png)
  useEffect(() => {
    void refresh(slot)
  }, [slot, refresh])

  const change = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    onSet?.(slot)
    try {
      const res = await window.rgbbox?.avatarSet?.(slot)
      // 用户取消对话框属常态,静默;其余失败给一行可读错误
      if (res && !res.ok && res.error !== 'cancelled') setError(t('games.avatar.error'))
      await refresh(slot)
    } catch {
      setError(t('games.avatar.error'))
    } finally {
      setBusy(false)
    }
  }, [busy, slot, onSet, refresh, t])

  const clear = useCallback(async () => {
    onClear?.(slot)
    try {
      await window.rgbbox?.avatarClear?.(slot)
    } catch {
      /* 无桥(非 Electron 环境)时静默 */
    }
    setError(null)
    await refresh(slot)
  }, [slot, onClear, refresh])

  const color = SLOT_COLORS[(slot - 1) % SLOT_COLORS.length] ?? SLOT_COLORS[0]

  return (
    <div data-field="avatar-picker" data-slot={slot} style={ROOT_STYLE}>
      <div
        role="img"
        aria-label={`${t('games.avatar.label')} ${label}`}
        style={dataUrl ? PREVIEW_STYLE : { ...PREVIEW_STYLE, background: `${color}22`, color, border: `1px solid ${color}66` }}
      >
        {dataUrl ? (
          <img src={dataUrl} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span aria-hidden="true">{slot}</span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
        <strong
          title={label}
          style={{ fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {label}
        </strong>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className="video-btn"
            data-action="avatar-set"
            style={SMALL_BTN_STYLE}
            disabled={busy}
            onClick={() => {
              void change()
            }}
          >
            {t('games.avatar.change')}
          </button>
          <button
            type="button"
            className="video-btn"
            data-action="avatar-clear"
            style={SMALL_BTN_STYLE}
            disabled={!dataUrl || busy}
            onClick={() => {
              void clear()
            }}
          >
            {t('games.avatar.clear')}
          </button>
        </div>
        {error ? <span style={{ fontSize: 11, color: '#f28b8b' }}>{error}</span> : null}
      </div>
    </div>
  )
}
