import { createContext, useCallback, useContext, useState, type JSX, type ReactNode } from 'react'

export type Lang = 'zh' | 'en'

// ── Translation tables ─────────────────────────────────────────────────────

const EN = {
  // App / branding
  'app.name': 'RGBBox',
  // Navigation
  'nav.workspace': 'Workspace',
  'nav.effects': 'Effects',
  'nav.profiles': 'Profiles',
  'nav.diagnostics': 'Diagnostics',
  // Audio
  'audio.on': 'Audio On',
  'audio.off': 'Audio Off',
  'audio.defaultDevice': 'Default (Mic)',
  'audio.deviceLabel': 'Audio Source',
  'audio.tooltip.on': 'Disable mic input',
  'audio.tooltip.off': 'Enable audio reactive',
  // Engine
  'engine.label': 'Engine',
  'engine.running': 'Running',
  'engine.paused': 'Paused',
  // Power save
  'power.label': 'Block Screensaver',
  'power.on': 'On',
  'power.off': 'Off',
  // Performance modes
  'perf.battery': 'Battery',
  'perf.balanced': 'Balanced',
  'perf.extreme': 'Extreme',
  // Workspace header
  'ws.eyebrow': 'Local-first RGB controller',
  'ws.displays': 'Displays',
  'ws.grid': 'Grid',
  'ws.mode': 'Mode',
  // Preview panel
  'preview.eyebrow': 'Virtual output',
  'preview.title': 'RGB Canvas Preview',
  // Display map
  'map.eyebrow': 'Display topology',
  'map.title': 'Multi-screen Map',
  // FX sidebar
  'fx.layers': 'Layers',
  'fx.addLayer': 'Add Layer',
  'fx.effect': 'Effect',
  'fx.effects': 'Effect',
  'fx.noLayer': 'No layer',
  'fx.opacity': 'Opacity',
  'fx.blend': 'Blend',
  // Blend modes
  'blend.normal': 'Normal',
  'blend.screen': 'Screen',
  'blend.add': 'Add',
  'blend.multiply': 'Multiply',
  // Layer actions
  'layer.delete': 'Delete layer',
  'layer.enable': 'Enabled',
  'layer.disable': 'Disabled',
  'layer.enabled': 'Enabled',
  'layer.disabled': 'Disabled',
  // Sampling panel
  'sampling.eyebrow': 'Sampling Settings',
  'sampling.title': 'Sampling',
  'sampling.columns': 'Columns',
  'sampling.rows': 'Rows',
  'sampling.smooth': 'Smooth',
  'sampling.saturation': 'Saturation',
  'sampling.brightness': 'Brightness',
  'sampling.fps': 'FPS',
  'sampling.perfGuard': 'Performance guard',
  // Effects view
  'effects.library': 'Effect Library',
  'effects.eyebrow': '18 built-in effects — click to apply to selected layer',
  'effects.classic': 'Classic',
  'effects.advanced': 'Advanced',
  'effects.audio': 'Audio Reactive',
  // Diagnostics
  'diag.eyebrow': 'Runtime',
  'diag.title': 'Diagnostics',
  'diag.virtualBounds': 'Virtual bounds',
  'diag.frameAge': 'Frame age',
  'diag.brightGain': 'Brightness gain',
  'diag.gridSize': 'Grid size',
  'diag.activeLayers': 'Active layers',
  'diag.targetFps': 'Target FPS',
  'diag.platform': 'Platform',
  'diag.audio': 'Audio',
  'diag.waiting': 'Waiting',
  'diag.off': 'Off',
  // Profile manager
  'profile.label': 'Profiles',
  'profile.title': 'Profile Manager',
  'profile.eyebrow': 'Save & load effect configurations',
  'profile.current': 'Current Profile',
  'profile.saved': 'Saved Profiles',
  'profile.new': 'New Profile',
  'profile.rename': 'Rename',
  'profile.duplicate': 'Duplicate',
  'profile.delete': 'Delete',
  'profile.load': 'Load',
  'profile.import': 'Import JSON',
  'profile.export': 'Export JSON',
  'profile.saveCurrent': 'Save to Slot',
  'profile.confirmDelete': 'Delete this profile?',
  'profile.namePlaceholder': 'Profile name…',
  'profile.noSaved': 'No saved profiles yet.',
  'profile.importSuccess': 'Profile imported.',
  'profile.importError': 'Invalid profile file.',
  // Language toggle
  'lang.toggle': '中文',
  // Static text effect params
  'param.text': 'Text',
  'param.textX': 'X Position',
  'param.textY': 'Y Position',
  'param.textScale': 'Scale',
  'param.textWeight': 'Weight',
  'param.textColor': 'Text Color',
  'param.bgColor': 'Background',
  'param.textPlaceholder': 'Enter display text…',
  // Effect kind labels
  'effect.screen-ambient': 'Screen Ambient',
  'effect.static': 'Static',
  'effect.breathing': 'Breathing',
  'effect.rainbow': 'Rainbow',
  'effect.wave': 'Wave',
  'effect.zone-gradient': 'Gradient',
  'effect.fire': 'Fire',
  'effect.starlight': 'Starlight',
  'effect.ripple': 'Ripple',
  'effect.spectrum': 'Spectrum',
  'effect.comet': 'Comet',
  'effect.lightning': 'Lightning',
  'effect.aurora': 'Aurora',
  'effect.explode': 'Explode',
  'effect.audio-beat': 'Audio Beat',
  'effect.audio-equalizer': 'Equalizer',
  'effect.random-color': 'Random Color',
  // Common
  'common.cancel': 'Cancel',
  'common.ok': 'OK',
} as const

export type TranslationKey = keyof typeof EN
type TranslationTable = { readonly [K in TranslationKey]: string }

const ZH: TranslationTable = {
  'app.name': 'RGBBox',
  'nav.workspace': '工作区',
  'nav.effects': '效果库',
  'nav.profiles': 'Profile 管理',
  'nav.diagnostics': '诊断',
  'audio.on': '音频已开',
  'audio.off': '音频已关',
  'audio.defaultDevice': '默认（麦克风）',
  'audio.deviceLabel': '音频源',
  'audio.tooltip.on': '关闭麦克风',
  'audio.tooltip.off': '开启音频响应',
  'engine.label': '引擎',
  'engine.running': '运行中',
  'engine.paused': '已暂停',
  'power.label': '阻止屏保/睡眠',
  'power.on': '开',
  'power.off': '关',
  'perf.battery': '省电',
  'perf.balanced': '均衡',
  'perf.extreme': '极致',
  'ws.eyebrow': '本地 RGB 控制器',
  'ws.displays': '显示器',
  'ws.grid': '网格',
  'ws.mode': '模式',
  'preview.eyebrow': '虚拟输出',
  'preview.title': 'RGB 画布预览',
  'map.eyebrow': '显示器拓扑',
  'map.title': '多屏映射',
  'fx.layers': '图层',
  'fx.addLayer': '添加图层',
  'fx.effect': '效果',
  'fx.effects': '效果',
  'fx.noLayer': '无图层',
  'fx.opacity': '不透明度',
  'fx.blend': '混合模式',
  'blend.normal': '正常',
  'blend.screen': '滤色',
  'blend.add': '叠加',
  'blend.multiply': '正片叠底',
  'layer.delete': '删除图层',
  'layer.enable': '已启用',
  'layer.disable': '已禁用',
  'layer.enabled': '已启用',
  'layer.disabled': '已禁用',
  'sampling.eyebrow': '采样设置',
  'sampling.title': '采样',
  'sampling.columns': '列数',
  'sampling.rows': '行数',
  'sampling.smooth': '平滑',
  'sampling.saturation': '饱和度',
  'sampling.brightness': '亮度',
  'sampling.fps': '帧率',
  'sampling.perfGuard': '性能守护',
  'effects.library': '效果库',
  'effects.eyebrow': '18 种内置效果 — 点击应用到选中图层',
  'effects.classic': '经典',
  'effects.advanced': '进阶',
  'effects.audio': '音频响应',
  'diag.eyebrow': '运行时',
  'diag.title': '诊断',
  'diag.virtualBounds': '虚拟画布',
  'diag.frameAge': '帧延迟',
  'diag.brightGain': '亮度增益',
  'diag.gridSize': '网格大小',
  'diag.activeLayers': '活跃图层',
  'diag.targetFps': '目标帧率',
  'diag.platform': '平台',
  'diag.audio': '音频',
  'diag.waiting': '等待中',
  'diag.off': '关闭',
  'profile.title': 'Profile 管理',
  'profile.label': 'Profile 配置',
  'profile.eyebrow': '保存并加载效果配置',
  'profile.current': '当前配置',
  'profile.saved': '已保存配置',
  'profile.new': '新建配置',
  'profile.rename': '重命名',
  'profile.duplicate': '复制',
  'profile.delete': '删除',
  'profile.load': '加载',
  'profile.import': '导入 JSON',
  'profile.export': '导出 JSON',
  'profile.saveCurrent': '存入插槽',
  'profile.confirmDelete': '确认删除此配置？',
  'profile.namePlaceholder': '配置名称…',
  'profile.noSaved': '暂无已保存配置。',
  'profile.importSuccess': '配置已导入。',
  'profile.importError': '无效的配置文件。',
  'lang.toggle': 'English',
  'param.text': '文本内容',
  'param.textX': 'X 位置',
  'param.textY': 'Y 位置',
  'param.textScale': '缩放',
  'param.textWeight': '粗细',
  'param.textColor': '文字颜色',
  'param.bgColor': '背景色',
  'param.textPlaceholder': '输入显示文本…',
  // Effect kind labels
  'effect.screen-ambient': '屏幕采样',
  'effect.static': '静态色',
  'effect.breathing': '呼吸灯',
  'effect.rainbow': '彩虹',
  'effect.wave': '波浪',
  'effect.zone-gradient': '渐变',
  'effect.fire': '火焰',
  'effect.starlight': '星光',
  'effect.ripple': '涟漪',
  'effect.spectrum': '光谱',
  'effect.comet': '彗星',
  'effect.lightning': '闪电',
  'effect.aurora': '极光',
  'effect.explode': '爆炸',
  'effect.audio-beat': '节拍',
  'effect.audio-equalizer': '均衡器',
  'effect.random-color': '随机色',
  'common.cancel': '取消',
  'common.ok': '确定',
}

export const translations: Record<Lang, TranslationTable> = { en: EN, zh: ZH }

// ── Context ────────────────────────────────────────────────────────────────

interface I18nContextValue {
  t: (key: TranslationKey) => string
  lang: Lang
  setLang: (l: Lang) => void
}

const I18nContext = createContext<I18nContextValue>({
  t: (key) => key,
  lang: 'zh',
  setLang: () => undefined,
})

// ── Provider ───────────────────────────────────────────────────────────────

export function I18nProvider({ children }: { children: ReactNode }): JSX.Element {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem('rgbbox:lang') as Lang | null
    return saved === 'en' || saved === 'zh' ? saved : 'zh'
  })

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    localStorage.setItem('rgbbox:lang', l)
  }, [])

  const t = useCallback((key: TranslationKey): string => {
    return translations[lang][key] ?? key
  }, [lang])

  // Value is stable per lang change (memoised inline via useCallback deps)
  return (
    <I18nContext.Provider value={{ t, lang, setLang }}>
      {children}
    </I18nContext.Provider>
  )
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useI18n(): I18nContextValue {
  return useContext(I18nContext)
}
