/**
 * useRecorderDomain (R300 第一阶段) — 视频站录制域 hook。
 *
 * 从 VideoStudioView 2229 行巨组件抽出的第一个域(R297 录制控制包的
 * 全部状态与操作:录制/暂停/计时/码率/系统声持久化/停止后处理链)。
 * 架构评审(06)蓝图的渐进第一步——域内聚清晰,依赖全注入:
 *   stream   当前直播流(录制源)
 *   notify   完成/失败回执(toast)
 *   labels   i18n 文案 {saved, fail}
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import fixWebmDuration from 'fix-webm-duration'
import { REC_BITRATE_TIERS, buildRecorderOptions, type RecBitrateTier } from '../../domain/recorderOptions'

export interface RecorderDomainOpts {
  /** 直播流 ref——start 时读 current(渲染期读 ref 会拿到 stale 值)。 */
  streamRef: RefObject<MediaStream | null>
  notify: (msg: string) => void
  labels: { saved: string; fail: string }
}

export function useRecorderDomain({ streamRef, notify, labels }: RecorderDomainOpts) {
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const [recording, setRecording] = useState(false)
  const [recPaused, setRecPaused] = useState(false)
  const [recElapsed, setRecElapsed] = useState(0)
  const recStartRef = useRef(0)
  const recAccumRef = useRef(0)
  const recTimerRef = useRef<number | null>(null)

  // 码率/系统声(持久化 rgbbox:videoRecOpts)
  const [recBitrate, setRecBitrate] = useState<RecBitrateTier>(() => {
    try {
      const t = localStorage.getItem('rgbbox:videoRecOpts')
      const tier = t ? JSON.parse(t).bitrate : null
      return tier in REC_BITRATE_TIERS ? tier as RecBitrateTier : 'high'
    } catch { return 'high' }
  })
  const [recSystemAudio, setRecSystemAudio] = useState<boolean>(() => {
    try {
      const t = localStorage.getItem('rgbbox:videoRecOpts')
      return t ? JSON.parse(t).systemAudio === true : false
    } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem('rgbbox:videoRecOpts', JSON.stringify({ bitrate: recBitrate, systemAudio: recSystemAudio })) } catch { /* storage unavailable */ }
  }, [recBitrate, recSystemAudio])

  // R300: 卸载兜底——计时器必清(录制中卸载视图片段场景;keep-alive 下
  // visible=false 不卸载,真正的卸载只发生在应用级路由销毁)。
  useEffect(() => () => {
    if (recTimerRef.current) window.clearInterval(recTimerRef.current)
  }, [])

  /** 已录总时长(累计+当前段)——暂停模式下的真实时长,供计时器与 onstop 元数据共用。 */
  const recElapsedTotal = useCallback((): number =>
    recAccumRef.current + (recStartRef.current ? Date.now() - recStartRef.current : 0), [])

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop() } catch { /* noop */ }
    }
  }, [])

  /** 暂停/续录——pause 冻结累计,resume 重设基准;计时器读 recElapsedTotal。 */
  const toggleRecPause = useCallback(() => {
    const r = recorderRef.current
    if (!r || !recording) return
    if (r.state === 'recording') {
      try { r.pause() } catch { return }
      recAccumRef.current = recAccumRef.current + Date.now() - recStartRef.current
      recStartRef.current = 0
      setRecPaused(true)
    } else if (r.state === 'paused') {
      try { r.resume() } catch { return }
      recStartRef.current = Date.now()
      setRecPaused(false)
    }
  }, [recording])

  const startRecording = useCallback(() => {
    const stream = streamRef.current
    if (!stream) return
    const mimeType = (() => {
      const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
      if (typeof MediaRecorder !== 'undefined') {
        for (const c of candidates) if (MediaRecorder.isTypeSupported(c)) return c
      }
      return undefined
    })()
    chunksRef.current = []
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(stream, buildRecorderOptions(mimeType, recBitrate))
    } catch {
      return
    }
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    // R296(X-1): 录制失败回执——源被撤/编码器错误此前完全静默
    recorder.onerror = () => {
      setRecording(false)
      setRecPaused(false)
      if (recTimerRef.current) { window.clearInterval(recTimerRef.current); recTimerRef.current = null }
      notify(labels.fail)
    }
    recorder.onstop = () => {
      // R296(M-2): 状态复位必须同步——复位先行,下载异步等待。
      setRecording(false)
      setRecPaused(false)
      if (recTimerRef.current) { window.clearInterval(recTimerRef.current); recTimerRef.current = null }
      const raw = new Blob(chunksRef.current, { type: mimeType || 'video/webm' })
      // R295: webm 流式写出缺 Duration(时长=∞)→播放器禁用拖动条。用实际
      // 录制时长(暂停感知)在 EBML 级补写;修复失败兜底原样下载。
      void fixWebmDuration(raw, recElapsedTotal(), { logger: false })
        .catch(() => raw)
        .then((blob: Blob) => {
          const url = URL.createObjectURL(blob)
          const ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
          const a = document.createElement('a')
          a.href = url
          a.download = `rgbbox-recording-${Date.now()}.${ext}`
          a.click()
          setTimeout(() => URL.revokeObjectURL(url), 10_000)
          notify(labels.saved)
        })
    }
    recorder.start(100)
    recorderRef.current = recorder
    recAccumRef.current = 0
    recStartRef.current = Date.now()
    setRecElapsed(0)
    setRecPaused(false)
    setRecording(true)
    recTimerRef.current = window.setInterval(() => setRecElapsed(recElapsedTotal()), 250)
  }, [streamRef, recBitrate, recElapsedTotal, notify, labels])

  return {
    recording, recPaused, recElapsed,
    recBitrate, setRecBitrate,
    recSystemAudio, setRecSystemAudio,
    startRecording, stopRecording, toggleRecPause,
    recorderRef,
  }
}
