// @vitest-environment happy-dom
// R227.3: the render-crash containment boundary — before it, any render-time
// exception whited out the whole window (zero ErrorBoundary in the renderer).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { ErrorBoundary } from '../../../src/renderer/src/components/ErrorBoundary'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  cleanup()
})

function Bomb(): JSX.Element {
  throw new Error('kaboom-view-crash')
}

describe('renderer/components/ErrorBoundary (R227.3)', () => {
  it('renders children when nothing throws', () => {
    const { container } = render(
      <ErrorBoundary><p>healthy view</p></ErrorBoundary>,
    )
    expect(container.textContent).toContain('healthy view')
  })

  it('a crashing child shows the bilingual fallback with reload, not a white window', () => {
    const { container } = render(
      <ErrorBoundary><Bomb /></ErrorBoundary>,
    )
    expect(container.textContent).toContain('界面渲染出错')
    expect(container.textContent).toContain('UI render error')
    expect(container.textContent).toContain('kaboom-view-crash')
    const btn = container.querySelector('button')
    expect(btn?.textContent).toContain('重新加载')
  })

  it('logs the crash loudly (componentDidCatch)', () => {
    render(<ErrorBoundary><Bomb /></ErrorBoundary>)
    expect(console.error).toHaveBeenCalled()
  })
})
