/**
 * R302: 应用内样式化对话框 promise 桥。
 *
 * 替换渲染层全部 window.confirm/alert（Electron 下渲染为系统风格白底
 * MessageBox，与深色主题脱节——见 PRD-0002 R302.1 的 6 处盘点）。调用点
 * 一行式替换：`if (!(await showConfirm({ message, danger: true }))) return`；
 * App 根部挂一次 `<AppDialogHost />` 消费渲染（createPortal 到 body）。
 *
 * 语义对齐旧 window.confirm：resolve(true)=确定，resolve(false)=取消/Esc。
 * FIFO 排队：异步路径的 alert 落在 confirm 打开期间时按序展示，不互相顶掉。
 */

export interface AppDialogRequest {
  /** 对话框正文（已本地化文本）。无标题行——与旧原生弹框内容等价，零新增文案键。 */
  message: string
  /** 危险动作（删除/清空类）——确认按钮走 danger 语义色。 */
  danger?: boolean
  /** 自定义确认钮文案；缺省由 Host 用 t('dialog.confirm')（alert 用 dialog.ok）。 */
  confirmLabel?: string
  /** 自定义取消钮文案；缺省 t('dialog.cancel')。 */
  cancelLabel?: string
}

interface PendingDialog extends AppDialogRequest {
  kind: 'confirm' | 'alert'
  resolve: (ok: boolean) => void
}

let queue: PendingDialog[] = []
let current: PendingDialog | null = null
const listeners = new Set<() => void>()

function notify(): void {
  for (const fn of listeners) fn()
}

/** 只在无当前对话框时出队下一条。 */
function pump(): void {
  if (current !== null || queue.length === 0) return
  current = queue.shift() ?? null
}

/** useSyncExternalStore 快照——引用稳定（同一 pending 对象直到状态变化）。 */
export function appDialogSnapshot(): PendingDialog | null {
  return current
}

export function subscribeAppDialog(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** 确认类对话框：确定 → true，取消/Esc → false。 */
export function showConfirm(req: AppDialogRequest): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    queue.push({ ...req, kind: 'confirm', resolve })
    pump()
    notify()
  })
}

/** 通报类对话框（单钮）：关闭即 resolve。Esc 与点击等效。 */
export function showAlert(req: AppDialogRequest): Promise<void> {
  return new Promise<void>((resolve) => {
    queue.push({ ...req, kind: 'alert', resolve: () => resolve() })
    pump()
    notify()
  })
}

/** Host 调用：用户点了确认钮（alert 的唯一钮同此）。 */
export function acceptAppDialog(): void {
  if (!current) return
  const d = current
  current = null
  pump()
  notify()
  d.resolve(true)
}

/** Host 调用：取消钮/Esc/点击遮罩（confirm → false；alert 同样可关）。 */
export function dismissAppDialog(): void {
  if (!current) return
  const d = current
  current = null
  pump()
  notify()
  d.resolve(false)
}
