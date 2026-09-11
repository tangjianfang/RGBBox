/**
 * SnapshotEditorModal — 拍照/局部截图后的图片编辑弹窗（PRD R75.4/R75.5）。
 * react-filerobot-image-editor 懒加载（约 +400KB，不进主 chunk）；
 * 加载/渲染失败走 ErrorBoundary → 兜底提示（用右栏缩略图旁的下载链接），不白屏。
 * 无水印铁律（R75.2）：tabsIds 机制性排除 Watermark/Filters 标签；
 * useBackendTranslations=false（离线桌面应用禁止网络请求）。
 */
import { Component, Suspense, lazy, type JSX, type ReactNode } from 'react'
import { Copy, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import { editorZh } from './editorZh'

// 库自带 TS 类型（lib/index.d.ts），懒加载拆 chunk
const FilerobotImageEditor = lazy(() => import('react-filerobot-image-editor'))

interface EditorErrorBoundaryProps {
  onError: () => void
  children: ReactNode
}

class EditorErrorBoundary extends Component<EditorErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onError() }
  render() { return this.state.failed ? null : this.props.children }
}

export interface SnapshotEditorModalProps {
  source: string                              // 编辑对象（dataURL）
  open: boolean
  lang: 'zh' | 'en'
  onClose: () => void                         // 直接关闭 = 不保存（原图仍在右栏缩略图）
  onSaved: (dataUrl: string) => void          // 编辑器内保存：View 负责下载
  toast: (msg: string) => void
}

interface EditorSaveData {
  imageBase64?: string
  imageCanvas?: HTMLCanvasElement
  mimeType?: string
}

export function SnapshotEditorModal({ source, open, lang, onClose, onSaved, toast }: SnapshotEditorModalProps): JSX.Element | null {
  const { t } = useI18n()
  if (!open) return null

  const handleSave = (imageData: EditorSaveData): void => {
    let url = imageData.imageBase64 ?? ''
    if (url && !url.startsWith('data:')) url = `data:${imageData.mimeType ?? 'image/png'};base64,${url}`
    if (!url && imageData.imageCanvas) url = imageData.imageCanvas.toDataURL('image/png')
    if (!url) { toast(t('video.editor.error')); return }
    onSaved(url)
    toast(t('video.editor.saved'))
  }

  const copyToClipboard = async (): Promise<void> => {
    try {
      const blob = await (await fetch(source)).blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      toast(t('video.editor.copied'))
    } catch {
      toast(t('video.editor.copyFail'))
    }
  }

  return (
    <div className="video-editor-modal">
      <div className="video-editor-shell">
        <div className="video-editor-topbar">
          <span className="video-editor-title">{t('video.editor.title')}</span>
          <div className="video-editor-actions">
            <button type="button" className="video-btn" onClick={() => void copyToClipboard()} title={t('video.editor.copy')}>
              <Copy size={14} /> {t('video.editor.copy')}
            </button>
            <button type="button" className="video-btn" onClick={onClose} title={t('video.editor.close')}>
              <X size={14} /> {t('video.editor.close')}
            </button>
          </div>
        </div>
        <div className="video-editor-body">
          <EditorErrorBoundary onError={() => toast(t('video.editor.error'))}>
            <Suspense fallback={<div className="video-editor-loading">{t('video.editor.loading')}</div>}>
              <FilerobotImageEditor
                source={source}
                savingPixelRatio={1}
                previewPixelRatio={1}
                tabsIds={['Annotate', 'Adjust']}
                defaultTabId="Annotate"
                useBackendTranslations={false}
                language="en"
                translations={lang === 'zh' ? editorZh : undefined}
                theme={{
                  palette: {
                    'bg-primary': '#0d1519',
                    'bg-secondary': '#05090b',
                    'accent-primary': '#46c6a8',
                    'borders-primary': 'rgba(255,255,255,0.12)',
                  },
                  typography: { fontFamily: 'inherit' },
                }}
                onSave={handleSave}
              />
            </Suspense>
          </EditorErrorBoundary>
        </div>
        <p className="video-editor-hint">{t('video.editor.hint')}</p>
      </div>
    </div>
  )
}
