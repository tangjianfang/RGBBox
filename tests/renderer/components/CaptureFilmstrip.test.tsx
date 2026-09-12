// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { CaptureFilmstrip } from '../../../src/renderer/src/components/CaptureFilmstrip'
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
})
