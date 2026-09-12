// @vitest-environment happy-dom
// setup.ts 全局 mock i18n（t(key)=key）与 lucide-react → 断言用 key 字面量与类名
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { TabBar } from '../../../src/renderer/src/components/TabBar'

beforeEach(() => cleanup())

describe('TabBar', () => {
  const tabs = ['dashboard', 'workspace', 'effects'] as const

  it('renders one tab per entry in order', () => {
    const { container } = render(
      <TabBar tabs={[...tabs]} activeView="workspace" onOpen={() => {}} onClose={() => {}} />
    )
    const els = container.querySelectorAll('.tab')
    expect(els.length).toBe(3)
    expect(els[1].textContent).toContain('nav.workspace')
  })

  it('marks the active tab', () => {
    const { container } = render(
      <TabBar tabs={[...tabs]} activeView="effects" onOpen={() => {}} onClose={() => {}} />
    )
    expect(container.querySelectorAll('.tab')[2].classList.contains('active')).toBe(true)
    expect(container.querySelectorAll('.tab')[0].classList.contains('active')).toBe(false)
  })

  it('dashboard tab has no close button, module tabs do', () => {
    const { container } = render(
      <TabBar tabs={[...tabs]} activeView="dashboard" onOpen={() => {}} onClose={() => {}} />
    )
    expect(container.querySelectorAll('.tab')[0].querySelector('.tab-close')).toBeNull()
    expect(container.querySelectorAll('.tab')[1].querySelector('.tab-close')).not.toBeNull()
  })

  it('clicking a tab calls onOpen; clicking × calls onClose', () => {
    const onOpen = vi.fn(); const onClose = vi.fn()
    const { container } = render(<TabBar tabs={[...tabs]} activeView="dashboard" onOpen={onOpen} onClose={onClose} />)
    fireEvent.click(container.querySelectorAll('.tab-main')[1])
    expect(onOpen).toHaveBeenCalledWith('workspace')
    fireEvent.click(container.querySelectorAll('.tab-close')[1])
    expect(onClose).toHaveBeenCalledWith('effects')
  })
})
