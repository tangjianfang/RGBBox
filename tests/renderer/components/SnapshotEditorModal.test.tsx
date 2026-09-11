// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'

// 本文件覆写 setup.ts 的全局 i18n mock（t(key)=key）：提供真实文案映射 +
// 透传 I18nProvider，使 hint 文案断言有意义。
vi.mock('../../../src/renderer/src/i18n', () => {
  const dict: Record<string, string> = {
    'video.editor.hint': '标注 / 裁剪 / 旋转后点保存下载；直接关闭则只保留原图。',
    'video.editor.saved': '已保存（PNG 已下载）',
  }
  return {
    useI18n: () => ({ t: (k: string) => dict[k] ?? k, lang: 'zh', setLang: vi.fn() }),
    I18nProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  }
})

// mock 库本体：懒加载 chunk 在测试里直接同步可解析，Save 按钮触发 onSave
vi.mock('react-filerobot-image-editor', () => ({
  default: (props: Record<string, unknown>) => (
    <div data-testid="filerobot-mock">
      <button
        data-testid="filerobot-save"
        data-tabs={JSON.stringify(props.tabsIds)}
        data-backend={String(props.useBackendTranslations)}
        onClick={() => props.onSave?.({ imageBase64: 'data:image/png;base64,QUJD', mimeType: 'image/png' })}
      >
        save
      </button>
    </div>
  ),
}))

import { SnapshotEditorModal } from '../../../src/renderer/src/components/video/SnapshotEditorModal'
import { setupRendererMocks } from '../_helpers'

beforeEach(() => { setupRendererMocks(); cleanup() })

describe('SnapshotEditorModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <SnapshotEditorModal source="data:image/png;base64,QQ==" open={false} lang="zh"
        onClose={() => {}} onSaved={() => {}} toast={() => {}} />,
    )
    expect(container.querySelector('.video-editor-modal')).toBeNull()
  })

  it('passes R75.2/R75.4 config to the editor (tabs exclude Watermark/Filters, no backend translations)', async () => {
    const { container, findByTestId } = render(
      <SnapshotEditorModal source="data:image/png;base64,QQ==" open lang="zh"
        onClose={() => {}} onSaved={() => {}} toast={() => {}} />,
    )
    expect(container.querySelector('.video-editor-modal')).toBeTruthy()
    expect(container.querySelector('.video-editor-hint')?.textContent).toContain('标注')
    const btn = await findByTestId('filerobot-save')
    expect(btn.getAttribute('data-tabs')).toBe(JSON.stringify(['Annotate', 'Adjust']))
    expect(btn.getAttribute('data-backend')).toBe('false')
  })

  it('editor save → onSaved with normalized dataURL + saved toast', async () => {
    const onSaved = vi.fn()
    const toast = vi.fn()
    const { findByTestId } = render(
      <SnapshotEditorModal source="data:image/png;base64,QQ==" open lang="zh"
        onClose={() => {}} onSaved={onSaved} toast={toast} />,
    )
    const btn = await findByTestId('filerobot-save')
    fireEvent.click(btn)
    expect(onSaved).toHaveBeenCalledWith('data:image/png;base64,QUJD')
    expect(toast).toHaveBeenCalledWith('已保存（PNG 已下载）')
  })

  it('close button calls onClose', () => {
    const onClose = vi.fn()
    const { container } = render(
      <SnapshotEditorModal source="data:image/png;base64,QQ==" open lang="en"
        onClose={onClose} onSaved={() => {}} toast={() => {}} />,
    )
    const btns = container.querySelectorAll('.video-editor-actions .video-btn')
    fireEvent.click(btns[btns.length - 1])
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
