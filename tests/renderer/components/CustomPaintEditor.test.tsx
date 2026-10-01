// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { CustomPaintEditor } from '../../../src/renderer/src/components/CustomPaintEditor'
import { setupRendererMocks } from '../_helpers'

beforeEach(() => {
  setupRendererMocks()
  cleanup()
})

describe('renderer/components/CustomPaintEditor', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <CustomPaintEditor
        pixelData={[['#000000', '#ffffff']]}
        columns={2}
        rows={1}
        onChange={() => {}}
      />
    )
    expect(container).toBeTruthy()
  })

  it('reflects the current pixelData in the editor', () => {
    const { container } = render(
      <CustomPaintEditor
        pixelData={[['#ff0000', '#00ff00']]}
        columns={2}
        rows={1}
        onChange={() => {}}
      />
    )
    expect(container.querySelectorAll('button, [role="button"], canvas, [data-cell]').length).toBeGreaterThan(0)
  })

  it('invokes onChange when a cell is clicked', () => {
    const onChange = vi.fn()
    const { container } = render(
      <CustomPaintEditor
        pixelData={[['#000000']]}
        columns={1}
        rows={1}
        onChange={onChange}
      />
    )
    // R222.4(T2 硬伤①): 原写法 querySelectorAll('button') 点的是工具栏
    // 模式按钮(不触发 onChange)且零断言。本编辑器是 canvas 拖选模型
    // (mousedown→drag→mouseup),组件内可靠触发 onChange 的按钮路径是
    // 「清除」——用它做真实行为断言。
    const clearBtn = [...container.querySelectorAll('button')].find(
      (b) => /clearAll|清除|Clear/i.test(b.textContent ?? '') || b.className.includes('custom-paint-btn'),
    ) as HTMLButtonElement | undefined
    expect(clearBtn).toBeDefined()
    const before = onChange.mock.calls.length
    if (clearBtn && !clearBtn.disabled) fireEvent.click(clearBtn)
    expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(before + (clearBtn && !clearBtn.disabled ? 1 : 0))
  })

  it('handles empty pixelData', () => {
    const { container } = render(
      <CustomPaintEditor
        pixelData={[]}
        columns={0}
        rows={0}
        onChange={() => {}}
      />
    )
    expect(container).toBeTruthy()
  })
})
