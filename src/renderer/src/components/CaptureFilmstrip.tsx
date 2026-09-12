/**
 * CaptureFilmstrip — 拍摄缓存胶片栏（PRD R77.1）。
 * 横向滚动缩略图带（滚轮转横滚）；每项 hover 浮现「编辑 / 删除」；
 * 尾部 + 按钮从文件导入。哑组件——数据加载与 IPC 由 VideoStudioView 负责。
 */
import { Pencil, Plus, X } from 'lucide-react'
import { useI18n } from '../i18n'
import type { CaptureEntry } from '../../../shared/types'
import type { JSX } from 'react'

export interface CaptureFilmstripProps {
  items: CaptureEntry[]
  onEdit: (item: CaptureEntry) => void
  onDelete: (id: string) => void
  onImport: () => void
}

export function CaptureFilmstrip({ items, onEdit, onDelete, onImport }: CaptureFilmstripProps): JSX.Element | null {
  const { t } = useI18n()
  if (items.length === 0) return null
  return (
    <div
      className="video-filmstrip"
      onWheel={(e) => {
        // 纵向滚轮转横向滚动
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY
      }}
    >
      {items.map((it) => (
        <div
          key={it.id}
          className="video-filmstrip-item"
          title={`${it.name} · ${new Date(it.ts).toLocaleString()}`}
        >
          <img
            className="video-filmstrip-thumb"
            src={`media://local?p=${encodeURIComponent(it.file)}`}
            alt={it.name}
            loading="lazy"
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
  )
}
