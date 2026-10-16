// R302: 应用内样式化对话框 promise 桥 —— 纯域单测（node 环境）
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  showConfirm,
  showAlert,
  acceptAppDialog,
  dismissAppDialog,
  appDialogSnapshot,
  subscribeAppDialog
} from '../../../src/renderer/src/domain/appDialog'

describe('domain/appDialog (R302)', () => {
  beforeEach(() => {
    // 排空可能残留的队列（前序用例 resolve 挂起的 promise）
    while (appDialogSnapshot() !== null) dismissAppDialog()
  })

  it('showConfirm 挂起当前对话框,accept 解析 true', async () => {
    const p = showConfirm({ message: '删除？', danger: true })
    expect(appDialogSnapshot()?.message).toBe('删除？')
    expect(appDialogSnapshot()?.danger).toBe(true)
    expect(appDialogSnapshot()?.kind).toBe('confirm')
    acceptAppDialog()
    await expect(p).resolves.toBe(true)
    expect(appDialogSnapshot()).toBeNull()
  })

  it('dismissAppDialog 解析 false（取消/Esc 语义）', async () => {
    const p = showConfirm({ message: 'x' })
    dismissAppDialog()
    await expect(p).resolves.toBe(false)
  })

  it('showAlert 单钮语义:accept 解析 void', async () => {
    const p = showAlert({ message: '导入失败' })
    expect(appDialogSnapshot()?.kind).toBe('alert')
    acceptAppDialog()
    await expect(p).resolves.toBeUndefined()
  })

  it('FIFO 排队:第二个对话框等第一个收尾后才成为当前', async () => {
    const p1 = showConfirm({ message: 'first' })
    const p2 = showConfirm({ message: 'second' })
    expect(appDialogSnapshot()?.message).toBe('first')
    acceptAppDialog()
    await expect(p1).resolves.toBe(true)
    expect(appDialogSnapshot()?.message).toBe('second')
    dismissAppDialog()
    await expect(p2).resolves.toBe(false)
    expect(appDialogSnapshot()).toBeNull()
  })

  it('订阅者在打开/关闭时收到通知,退订后不再收', () => {
    const fn = vi.fn()
    const unsub = subscribeAppDialog(fn)
    const p = showConfirm({ message: 'n' })
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(1)
    acceptAppDialog()
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(2)
    unsub()
    const p2 = showConfirm({ message: 'n2' })
    const callsAfterUnsub = fn.mock.calls.length
    acceptAppDialog()
    expect(fn.mock.calls.length).toBe(callsAfterUnsub)
    void p; void p2
  })

  it('快照引用稳定:状态不变时返回同一对象（useSyncExternalStore 契约）', () => {
    const p = showConfirm({ message: 'stable' })
    const a = appDialogSnapshot()
    const b = appDialogSnapshot()
    expect(a).toBe(b)
    acceptAppDialog()
    void p
  })
})
