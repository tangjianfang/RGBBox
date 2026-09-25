/**
 * CaptureFilmstrip — 拍摄缓存胶片栏（PRD R77.1 / R78.4）。
 * 横向滚动缩略图带，最大宽度=视觉窗口（外层布局负责限宽）；超出后：
 * 细样式横向滚动条 + 两端「上一张/下一张」‹ › 按钮（平滑滚一位，到头隐藏）
 * + 滚轮纵向转横向滑动。R170: 顶部紧凑头行——「截图预览 (N)」+ 清空全部 +
 * 折叠/展开开关（折叠状态由父层持久化）。哑组件——数据加载与 IPC 由
 * VideoStudioView 负责。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useI18n } from '../i18n'
import type { CaptureEntry } from '../../../shared/types'
import type { JSX } from 'react'

/** 一位的滚动步长（缩略图宽 + 间距，与 CSS 对齐）。 */
const STEP_PX = 176

/** R78.4: 溢出导航判定（纯函数）。 */
export function computeCanNav(
  scrollWidth: number,
  clientWidth: number,
  scrollLeft: number,
): { left: boolean; right: boolean } {
  const overflow = scrollWidth > clientWidth + 1
  return {
    left: overflow && scrollLeft > 1,
    right: overflow && scrollLeft < scrollWidth - clientWidth - 1,
  }
}

export interface CaptureFilmstripProps {
  items: CaptureEntry[]
  onEdit: (item: CaptureEntry) => void
  onDelete: (id: string) => void
  onImport: () => void
  /** R170: collapse the strip to just its header row. */
  collapsed: boolean
  onToggleCollapsed: () => void
  /** R170: delete every capture (parent confirms before calling IPC). */
  onClearAll: () => void
}

export function CaptureFilmstrip({ items, onEdit, onDelete, onImport, collapsed, onToggleCollapsed, onClearAll }: CaptureFilmstripProps): JSX.Element | null {
  const { t } = useI18n()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [canNav, setCanNav] = useState({ left: false, right: false })

  const measure = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanNav(computeCanNav(el.scrollWidth, el.clientWidth, el.scrollLeft))
  }, [])

  useEffect(() => {
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    if (scrollRef.current) ro.observe(scrollRef.current)
    return () => ro.disconnect()
  }, [measure, items.length, collapsed])

  if (items.length === 0) return null

  const nav = (dir: 1 | -1): void => {
    scrollRef.current?.scrollBy({ left: dir * STEP_PX, behavior: 'smooth' })
  }

  return (
    <div className="video-filmstrip-wrap video-filmstrip-block">
      {/* R170: compact header — title + count, clear-all, collapse toggle. */}
      <div className="video-filmstrip-head">
        <button
          type="button"
          className="video-filmstrip-title video-filmstrip-toggle"
          onClick={onToggleCollapsed}
          title={t(collapsed ? 'video.filmstrip.expand' : 'video.filmstrip.collapse')}
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          <span>{t('video.filmstrip.title')} ({items.length})</span>
        </button>
        <button
          type="button"
          className="video-filmstrip-clearall"
          title={t('video.filmstrip.clearAll')}
          onClick={onClearAll}
        >
          <Trash2 size={12} />
          <span>{t('video.filmstrip.clearAll')}</span>
        </button>
      </div>
      {!collapsed && (
        <>
          {canNav.left && (
            <button type="button" className="video-filmstrip-nav video-filmstrip-prev" title={t('video.filmstrip.prev')} onClick={() => nav(-1)}>
              <ChevronLeft size={16} />
            </button>
          )}
          <div
            ref={scrollRef}
            className="video-filmstrip"
            onScroll={measure}
            onWheel={(e) => {
              // 纵向滚轮转横向滑动
              if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY
            }}
          >
            {items.map((it) => (
              <div key={it.id} className="video-filmstrip-item">
                <img
                  className="video-filmstrip-thumb"
                  src={`media://local?p=${encodeURIComponent(it.file)}`}
                  alt={it.name}
                  title={`${it.name} · ${new Date(it.ts).toLocaleString()} — ${t('video.filmstrip.dblclickEdit')}`}
                  loading="lazy"
                  onLoad={measure}
                  onDoubleClick={() => onEdit(it)}
                />
                <button
                  type="button"
                  className="video-filmstrip-act video-filmstrip-edit"
                  title={t('video.filmstrip.edit')}
                  onClick={() => onEdit(it)}
                >
                  <Pencil size={12} />
                </button>
                <button
                  type="button"
                  className="video-filmstrip-act video-filmstrip-del"
                  title={t('video.filmstrip.delete')}
                  onClick={() => onDelete(it.id)}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <button type="button" className="video-filmstrip-add" title={t('video.filmstrip.import')} onClick={onImport}>
              <Plus size={16} />
            </button>
          </div>
          {canNav.right && (
            <button type="button" className="video-filmstrip-nav video-filmstrip-next" title={t('video.filmstrip.next')} onClick={() => nav(1)}>
              <ChevronRight size={16} />
            </button>
          )}
        </>
      )}
    </div>
  )
}
