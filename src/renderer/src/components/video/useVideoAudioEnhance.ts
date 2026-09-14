/**
 * useVideoAudioEnhance — R91.3 电影 EQ 链（视频播放器专用）。
 *
 * 懒建链：首次选择非 off 预设才 createMediaElementSource（一经创建元素音频
 * 永久改道本图，无法摘除）→ 预设「关闭」= 全通 + 中性压缩器（bypass 而非拆链）。
 * 远程 http(s) 无 CORS 流送入 WebAudio 会被静音——这种源拒绝建链并回报错误，
 * 保持直出。参数纯函数在 audioEnhance.ts（单测覆盖），本 hook 只管建链/接线。
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { ENHANCE_PRESETS, clampEnhanceGain, type EnhancePresetId } from './audioEnhance'

export function useVideoAudioEnhance(videoRef: RefObject<HTMLVideoElement | null>) {
  const ctxRef = useRef<AudioContext | null>(null)
  const srcRef = useRef<MediaElementAudioSourceNode | null>(null)
  const bandsRef = useRef<BiquadFilterNode[]>([])
  const compRef = useRef<DynamicsCompressorNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const [presetId, setPresetId] = useState<EnhancePresetId>('off')
  const [gainDb, setGainDb] = useState(0)
  const [enhanceError, setEnhanceError] = useState<string | null>(null)

  /** True if the current source cannot be routed through WebAudio safely. */
  const isRemoteNoCors = useCallback((): boolean => {
    const el = videoRef.current
    if (!el || !el.currentSrc) return false
    return /^https?:\/\//i.test(el.currentSrc) && !el.crossOrigin
  }, [videoRef])

  const ensureGraph = useCallback((): boolean => {
    const el = videoRef.current
    if (!el) return false
    if (ctxRef.current && srcRef.current) return true
    if (isRemoteNoCors()) { setEnhanceError('ERR_REMOTE'); return false }
    try {
      const AC: typeof AudioContext | undefined = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) { setEnhanceError('ERR_NO_WEBAUDIO'); return false }
      const ctx = new AC()
      const src = ctx.createMediaElementSource(el)
      const comp = ctx.createDynamicsCompressor()
      const gain = ctx.createGain()
      src.connect(comp)
      comp.connect(gain)
      gain.connect(ctx.destination)
      ctxRef.current = ctx
      srcRef.current = src
      compRef.current = comp
      gainNodeRef.current = gain
      return true
    } catch {
      setEnhanceError('ERR_CREATE')
      return false
    }
  }, [videoRef, isRemoteNoCors])

  // Re-wire the chain whenever the preset changes (off with no graph = lazy skip)
  useEffect(() => {
    if (presetId === 'off' && !ctxRef.current) return
    if (!ensureGraph()) { setPresetId('off'); return }
    const ctx = ctxRef.current!
    const src = srcRef.current!
    const comp = compRef.current!
    const plan = ENHANCE_PRESETS[presetId]
    src.disconnect()
    bandsRef.current.forEach((b) => b.disconnect())
    bandsRef.current = []
    let node: AudioNode = src
    for (const spec of plan.bands) {
      const b = ctx.createBiquadFilter()
      b.type = spec.type
      b.frequency.value = spec.freq
      if (spec.q !== undefined) b.Q.value = spec.q
      if (spec.gain !== undefined) b.gain.value = spec.gain
      node.connect(b)
      node = b
      bandsRef.current.push(b)
    }
    node.connect(comp)
    const c = plan.compressor
    comp.threshold.value = c.threshold
    comp.knee.value = c.knee
    comp.ratio.value = c.ratio
    comp.attack.value = c.attack
    comp.release.value = c.release
  }, [presetId, ensureGraph])

  // Output gain rides the tail GainNode (dB → linear)
  useEffect(() => {
    const g = gainNodeRef.current
    if (g) g.gain.value = Math.pow(10, clampEnhanceGain(gainDb) / 20)
  }, [gainDb, presetId])

  const setPreset = useCallback((id: EnhancePresetId) => {
    setEnhanceError(null)
    setPresetId(id)
  }, [])

  const setGain = useCallback((db: number) => setGainDb(clampEnhanceGain(db)), [])

  // MediaElementSource 不会随元素 src 变化失效——同一元素换片无需重建图。
  return { presetId, setPreset, gainDb, setGain, enhanceError }
}
