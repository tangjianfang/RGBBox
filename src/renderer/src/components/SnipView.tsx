/**
 * SnipView — R80 独立全局截图窗口内容（?snip=1&displayId=X 路由进入）。
 * 冻结帧全屏 → 暗幕挖洞拖选（≥8px 有效）→ 裁剪 → AnnotateOverlay 就地标注。
 * R130.3: 冻结帧改主进程推送（BGRA 位图直传），绘制完成回 ack；
 * R130.5: 首帧上屏时快门白闪 ×2。
 * ESC/右键 = 退出会话（标注态 ESC 由 AnnotateOverlay 分层处理，× 回拖选态）。
 * 无水印铁律（R75.2）：裁剪/导出只搬运像素。
 */
import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '../i18n'
import { AnnotateOverlay } from './video/AnnotateOverlay'
import { cropToDataUrl, swapBgraToRgba } from './video/frameCapture'

/** happy-dom 无 canvas 时的兜底（生产路径永远走真 canvas）。 */
const FALLBACK_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
/** 拖选有效阈值（物理像素，与 OCR 框选同语义）。 */
const MIN_SELECT_PX = 8

type Phase = 'loading' | 'select' | 'annotate'
interface Pt { x: number; y: number }

export function SnipView({ displayId }: { displayId: number }): JSX.Element {
  const { t } = useI18n()
  const [phase, setPhase] = useState<Phase>('loading')
  const [frame, setFrame] = useState<HTMLCanvasElement | null>(null)  // 物理像素冻结帧
  const [frameUrl, setFrameUrl] = useState<string>(FALLBACK_PNG)      // dataURL（AnnotateOverlay 源；标注前必被裁剪结果覆盖）
  const [draft, setDraft] = useState<{ a: Pt; b: Pt } | null>(null)
  const [vp, setVp] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [flashOn, setFlashOn] = useState(false)                        // R130.5: 快门白闪（仅会话首次）
  const flashedRef = useRef(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // R80.11: 挖洞路径需要像素值（非百分比）——跟踪视口尺寸
  useEffect(() => {
    const measure = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // R130.3: 冻结帧改主进程推送（BGRA 原始位图直传）——订阅一次；交换 R/B →
  // ImageData → putImageData 到物理像素 canvas；绘制完成回 ack（主进程等
  // 画面真正上屏才 show 窗口）。displayId 仅作路由参数，推送本身按窗口定向。
  useEffect(() => {
    const unsubscribe = window.rgbbox.snipOnFrame((f) => {
      const cv = document.createElement('canvas')
      cv.width = f.width
      cv.height = f.height
      const ctx = cv.getContext('2d')
      if (ctx) {
        try {
          ctx.putImageData(new ImageData(swapBgraToRgba(f.data), f.width, f.height), 0, 0)
        } catch { /* 生产路径不可达（真 Chromium 必有 ImageData 构造器） */ }
      }
      setFrame(cv)
      setPhase('select')
      if (!flashedRef.current) {
        flashedRef.current = true
        setFlashOn(true)
      }
      window.rgbbox.snipAckPainted()
    })
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayId])

  // 冻结帧绘到全屏 canvas（CSS 拉伸 100vw/100vh，物理像素 1:1）
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !frame) return
    if (cv.width !== frame.width) cv.width = frame.width
    if (cv.height !== frame.height) cv.height = frame.height
    cv.getContext('2d')?.drawImage(frame, 0, 0)
  }, [frame, phase])

  // 会话退出：选区阶段 ESC / 右键（标注阶段 ESC 由 AnnotateOverlay onClose 分层）
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || phase !== 'select') return
      if ((e as KeyboardEvent & { isComposing?: boolean }).isComposing) return
      window.rgbbox.snipCancel()
    }
    const onCtx = (e: MouseEvent): void => {
      if (phase !== 'select') return
      e.preventDefault()
      window.rgbbox.snipCancel()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('contextmenu', onCtx)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('contextmenu', onCtx)
    }
  }, [phase])

  /** CSS px → 冻结帧物理像素。 */
  const toPhys = useCallback((clientX: number, clientY: number): Pt => {
    const r = wrapRef.current?.getBoundingClientRect()
    const dpr = frame && r && r.width > 0 ? frame.width / r.width : window.devicePixelRatio || 1
    return { x: (clientX - (r?.left ?? 0)) * dpr, y: (clientY - (r?.top ?? 0)) * dpr }
  }, [frame])

  const confirmSel = useCallback((a: Pt, b: Pt): void => {
    const sel = {
      x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y),
    }
    if (!frame || sel.w < MIN_SELECT_PX || sel.h < MIN_SELECT_PX) {
      setDraft(null)   // 抖动/单击 → 取消选择回拖选态
      return
    }
    setFrameUrl(cropToDataUrl(frame, sel, FALLBACK_PNG))
    setDraft(null)
    setPhase('annotate')
  }, [frame])

  /** R80.6: 完成动作 → 落档+剪贴板（主进程）+ 可选下载（渲染端）→ 关会话。 */
  const finish = useCallback((mode: 'copy' | 'save') => (url: string): void => {
    if (mode === 'save' && url) {
      const a = document.createElement('a')
      a.href = url
      a.download = `rgbbox-snip-${Date.now()}.png`
      a.click()
    }
    void window.rgbbox.snipFinish(url, mode)
      .catch(() => undefined)
      .finally(() => window.rgbbox.snipCancel())
  }, [])

  // 暗幕挖洞矩形（draft 存物理坐标 → 反算回 CSS 供 SVG 绘制）
  const dpr = frame && wrapRef.current && wrapRef.current.clientWidth > 0
    ? frame.width / wrapRef.current.clientWidth
    : 1
  const selCss = draft
    ? {
        x: Math.min(draft.a.x, draft.b.x) / dpr,
        y: Math.min(draft.a.y, draft.b.y) / dpr,
        w: Math.abs(draft.b.x - draft.a.x) / dpr,
        h: Math.abs(draft.b.y - draft.a.y) / dpr,
      }
    : null

  return (
    <div ref={wrapRef} className="snip-root">
      <canvas ref={canvasRef} className="snip-canvas" />
      {/* R130.5: 快门白闪 ×2 —— 首帧上屏时刻两下 90ms 脉冲；pointer-events:none
          不阻挡拖选；发生在捕获之后，不可能污染冻结帧内容 */}
      {flashOn && <div className="snip-flash" onAnimationEnd={() => setFlashOn(false)} />}
      {phase === 'select' && (
        <svg
          className="snip-mask"
          width="100%" height="100%"
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.currentTarget.setPointerCapture?.(e.pointerId)
            setDraft({ a: toPhys(e.clientX, e.clientY), b: toPhys(e.clientX, e.clientY) })
          }}
          onPointerMove={(e) => {
            setDraft(d => (d ? { ...d, b: toPhys(e.clientX, e.clientY) } : d))
          }}
          onPointerUp={(e) => {
            const p = toPhys(e.clientX, e.clientY)
            setDraft(d => {
              if (d) confirmSel(d.a, p)
              return null
            })
          }}
          onPointerCancel={() => setDraft(null)}
        >
          {/* R80.11: evenodd 真挖洞——选区内完全透亮显示原画面；暗幕只留一点暗（0.18） */}
          <path
            d={selCss
              ? `M0 0H${vp.w}V${vp.h}H0Z M${selCss.x} ${selCss.y}H${selCss.x + selCss.w}V${selCss.y + selCss.h}H${selCss.x}Z`
              : `M0 0H${vp.w}V${vp.h}H0Z`}
            fill="rgba(0,0,0,0.18)"
            fillRule="evenodd"
          />
          {selCss && (
            <rect x={selCss.x} y={selCss.y} width={selCss.w} height={selCss.h} fill="none" stroke="#46c6a8" strokeWidth="1.5" />
          )}
        </svg>
      )}
      {phase === 'select' && selCss && selCss.w > 0 && (
        <span
          className="snip-size"
          style={{ left: selCss.x + selCss.w / 2, top: Math.max(4, selCss.y - 26) }}
        >
          {Math.round(selCss.w * dpr)} × {Math.round(selCss.h * dpr)}
        </span>
      )}
      {phase === 'select' && (
        <div className="snip-hint-row">
          <p className="snip-hint">{t('snip.hint' as never)}</p>
          {/* R112.2: 手动取消入口——热键触发的会话窗口可能没有键盘焦点，鼠标点击始终可用 */}
          <button
            type="button"
            className="snip-hint-close"
            onClick={() => window.rgbbox.snipCancel()}
            aria-label={t('snip.cancel' as never)}
            title={t('snip.cancel' as never)}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {phase === 'annotate' && (
        <AnnotateOverlay
          source={frameUrl}
          onClose={() => setPhase('select')}
          onSave={finish('save')}
          onCopy={finish('copy')}
        />
      )}
    </div>
  )
}
