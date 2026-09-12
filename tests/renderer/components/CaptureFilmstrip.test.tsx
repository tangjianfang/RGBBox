// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { CaptureFilmstrip, computeCanNav } from '../../../src/renderer/src/components/CaptureFilmstrip'
import type { CaptureEntry } from '../../../src/shared/types'
import { setupRendererMocks } from '../_helpers'

beforeEach(() => { setupRendererMocks(); cleanup() })

const item = (id: string): CaptureEntry => ({
  id, file: `C:\\cap\\${id}.png`, name: `${id}.png`, ts: 1700000000000, kind: 'photo',
})

describe('CaptureFilmstrip', () => {
  it('renders one item per capture plus the import button', () => {
    const { container } = render(
      <CaptureFilmstrip items={[item('a'), item('b')]} onEdit={() => {}} onDelete={() => {}} onImport={() => {}} />,
    )
    expect(container.querySelectorAll('.video-filmstrip-item').length).toBe(2)
    expect(container.querySelector('.video-filmstrip-add')).toBeTruthy()
    // 缩略图走 media:// 协议
    const img = container.querySelector('.video-filmstrip-thumb') as HTMLImageElement
    expect(img.src).toContain('media://local?p=')
  })

  it('edit / delete / import callbacks fire with the right args', () => {
    const onEdit = vi.fn(), onDelete = vi.fn(), onImport = vi.fn()
    const { container } = render(
      <CaptureFilmstrip items={[item('a')]} onEdit={onEdit} onDelete={onDelete} onImport={onImport} />,
    )
    fireEvent.click(container.querySelector('.video-filmstrip-edit')!)
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }))
    fireEvent.click(container.querySelector('.video-filmstrip-del')!)
    expect(onDelete).toHaveBeenCalledWith('a')
    fireEvent.click(container.querySelector('.video-filmstrip-add')!)
    expect(onImport).toHaveBeenCalledTimes(1)
  })

  it('renders nothing for an empty list', () => {
    const { container } = render(
      <CaptureFilmstrip items={[]} onEdit={() => {}} onDelete={() => {}} onImport={() => {}} />,
    )
    expect(container.querySelector('.video-filmstrip')).toBeNull()
  })

  it('computeCanNav: no overflow → both false; at left edge → left false; middle → both true', () => {
    expect(computeCanNav(300, 300, 0)).toEqual({ left: false, right: false })
    expect(computeCanNav(600, 300, 0)).toEqual({ left: false, right: true })
    expect(computeCanNav(600, 300, 150)).toEqual({ left: true, right: true })
    expect(computeCanNav(600, 300, 300)).toEqual({ left: true, right: false })
  })

  it('R79.4: double-click a thumbnail opens the editor', () => {
    const onEdit = vi.fn()
    const { container } = render(
      <CaptureFilmstrip items={[item('a')]} onEdit={onEdit} onDelete={() => {}} onImport={() => {}} />,
    )
    fireEvent.dblClick(container.querySelector('.video-filmstrip-thumb')!)
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }))
  })

  it('R78.4: prev/next buttons scroll by one thumbnail (scrollBy spy)', () => {
    const scrollBySpy = vi.fn()
    const proto = Element.prototype as unknown as Record<string, unknown>
    const orig = proto.scrollBy
    proto.scrollBy = scrollBySpy
    // happy-dom 无布局：原型级 mock 滚动尺寸制造溢出（600 > 300）
    const divProto = HTMLDivElement.prototype as unknown as Record<string, PropertyDescriptor>
    const origSW = Object.getOwnPropertyDescriptor(HTMLDivElement.prototype, 'scrollWidth')
    const origCW = Object.getOwnPropertyDescriptor(HTMLDivElement.prototype, 'clientWidth')
    Object.defineProperty(HTMLDivElement.prototype, 'scrollWidth', { configurable: true, get: () => 600 })
    Object.defineProperty(HTMLDivElement.prototype, 'clientWidth', { configurable: true, get: () => 300 })
    try {
      const { container } = render(
        <CaptureFilmstrip items={[item('a'), item('b'), item('c')]} onEdit={() => {}} onDelete={() => {}} onImport={() => {}} />,
      )
      const next = container.querySelector('.video-filmstrip-next') as HTMLButtonElement
      expect(next).toBeTruthy()   // 溢出 → next 显示；scrollLeft=0 → prev 隐藏
      expect(container.querySelector('.video-filmstrip-prev')).toBeNull()
      fireEvent.click(next)
      expect(scrollBySpy).toHaveBeenCalledTimes(1)
      expect((scrollBySpy.mock.calls[0][0] as { left: number }).left).toBeGreaterThan(0)
    } finally {
      proto.scrollBy = orig
      if (origSW) Object.defineProperty(HTMLDivElement.prototype, 'scrollWidth', origSW)
      else delete divProto.scrollWidth
      if (origCW) Object.defineProperty(HTMLDivElement.prototype, 'clientWidth', origCW)
      else delete divProto.clientWidth
    }
  })
})
