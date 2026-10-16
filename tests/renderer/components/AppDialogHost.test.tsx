// @vitest-environment happy-dom
// R302: AppDialogHost 组件用例 —— 按钮/Esc/danger/portal 渲染
import { describe, it, expect, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { AppDialogHost } from '../../../src/renderer/src/components/AppDialog'
import { showConfirm, showAlert, appDialogSnapshot, dismissAppDialog } from '../../../src/renderer/src/domain/appDialog'
import { setupRendererMocks } from '../_helpers'

beforeEach(() => {
  setupRendererMocks()
  cleanup()
  // 排空前序用例可能残留的队列
  for (let i = 0; i < 10 && appDialogSnapshot() !== null; i++) dismissAppDialog()
})

describe('renderer/components/AppDialogHost (R302)', () => {
  it('showConfirm 后渲染 alertdialog + 确认/取消两钮(portal 到 body)', async () => {
    const { container } = render(<AppDialogHost />)
    const p = showConfirm({ message: '确定删除全部 11 张截图？' })
    await waitFor(() => {
      expect(document.querySelector('.app-dialog')).not.toBeNull()
    })
    // portal 渲染在 container 之外(document.body)
    expect(container.querySelector('.app-dialog')).toBeNull()
    const dlg = document.querySelector('.app-dialog') as HTMLElement
    expect(dlg.getAttribute('role')).toBe('alertdialog')
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    expect(dlg.textContent).toContain('确定删除全部 11 张截图？')
    const buttons = document.querySelectorAll('.app-dialog-buttons button')
    expect(buttons.length).toBe(2)
    fireEvent.click(buttons[0]) // 取消
    await expect(p).resolves.toBe(false)
  })

  it('确认钮点击 → promise true', async () => {
    render(<AppDialogHost />)
    const p = showConfirm({ message: 'go' })
    await waitFor(() => { expect(document.querySelector('.app-dialog')).not.toBeNull() })
    const confirm = document.querySelector('.app-dialog-buttons .btn-primary') as HTMLButtonElement
    fireEvent.click(confirm)
    await expect(p).resolves.toBe(true)
  })

  it('danger 变体 → 确认钮带 danger 语义类', async () => {
    render(<AppDialogHost />)
    const p = showConfirm({ message: '危险操作', danger: true })
    await waitFor(() => { expect(document.querySelector('.app-dialog')).not.toBeNull() })
    const confirm = document.querySelector('.app-dialog-buttons .btn-primary') as HTMLElement
    expect(confirm.className).toContain('danger')
    fireEvent.click(confirm)
    await expect(p).resolves.toBe(true)
  })

  it('Esc 关闭 → promise false', async () => {
    render(<AppDialogHost />)
    const p = showConfirm({ message: 'esc' })
    await waitFor(() => { expect(document.querySelector('.app-dialog')).not.toBeNull() })
    fireEvent.keyDown(window, { key: 'Escape' })
    await expect(p).resolves.toBe(false)
  })

  it('alert 单钮:仅确认钮,点击后关闭', async () => {
    render(<AppDialogHost />)
    const p = showAlert({ message: '导入失败' })
    await waitFor(() => { expect(document.querySelector('.app-dialog')).not.toBeNull() })
    const buttons = document.querySelectorAll('.app-dialog-buttons button')
    expect(buttons.length).toBe(1)
    fireEvent.click(buttons[0])
    await expect(p).resolves.toBeUndefined()
    await waitFor(() => { expect(document.querySelector('.app-dialog')).toBeNull() })
  })

  it('打开即聚焦确认钮（Enter 直接确认的键盘路径）', async () => {
    render(<AppDialogHost />)
    const p = showConfirm({ message: 'focus' })
    await waitFor(() => { expect(document.querySelector('.app-dialog')).not.toBeNull() })
    const confirm = document.querySelector('.app-dialog-buttons .btn-primary') as HTMLButtonElement
    expect(document.activeElement).toBe(confirm)
    // Enter 在聚焦钮上自然触发 click
    fireEvent.keyDown(confirm, { key: 'Enter' })
    fireEvent.click(confirm)
    await expect(p).resolves.toBe(true)
  })
})
