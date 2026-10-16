import { useEffect, useRef, useSyncExternalStore, type JSX } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../i18n'
import {
  acceptAppDialog,
  appDialogSnapshot,
  dismissAppDialog,
  subscribeAppDialog
} from '../domain/appDialog'

/**
 * R302: 应用内样式化对话框 Host —— App 根部挂一次，消费 domain/appDialog
 * 的 pending 队列（showConfirm/showAlert）。纯 R148 token 驱动（scrim 遮罩 +
 * surface-raised 面板 + btn-* 原型按钮），替换 Electron 下白底系统风格的
 * window.confirm/alert。
 *
 * 可达性：role="alertdialog" + aria-modal；打开即聚焦确认钮（Enter 直接确认
 * ——与旧原生框肌肉记忆一致）；Esc=取消；点遮罩=取消。
 */
export function AppDialogHost(): JSX.Element | null {
  const { t } = useI18n()
  const pending = useSyncExternalStore(subscribeAppDialog, appDialogSnapshot)
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null)

  // 打开即聚焦确认钮
  useEffect(() => {
    if (pending) confirmBtnRef.current?.focus()
  }, [pending])

  // Esc 关闭（捕获阶段拦截，避免被下层视图的快捷键先消费）
  useEffect(() => {
    if (!pending) return undefined
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        dismissAppDialog()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [pending])

  if (!pending) return null

  const confirmLabel = pending.confirmLabel ?? t(pending.kind === 'alert' ? 'dialog.ok' : 'dialog.confirm')
  const cancelLabel = pending.cancelLabel ?? t('dialog.cancel')

  return createPortal(
    <div
      className="app-dialog-scrim"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) dismissAppDialog()
      }}
    >
      <div className="app-dialog" role="alertdialog" aria-modal="true" aria-label={pending.message}>
        <p className="app-dialog-message">{pending.message}</p>
        <div className="app-dialog-buttons">
          {pending.kind === 'confirm' && (
            <button type="button" className="app-dialog-btn btn-secondary" onClick={() => dismissAppDialog()}>
              {cancelLabel}
            </button>
          )}
          <button
            ref={confirmBtnRef}
            type="button"
            className={`app-dialog-btn btn-primary ${pending.danger === true ? 'btn-danger danger' : ''}`}
            onClick={() => acceptAppDialog()}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
