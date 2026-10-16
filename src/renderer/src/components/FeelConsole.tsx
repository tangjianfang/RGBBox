import { useState, type JSX } from 'react'
import { Lock, RotateCcw, Shuffle, Unlock } from 'lucide-react'
import type { RandomizerMode } from '../domain/randomizer'
import type { EffectLayer } from '../../../shared/types'
import { effectPresets } from '../../../shared/defaultProfile'
import { useI18n } from '../i18n'
import { PARAM_META } from '../domain/paramMeta'
import { feelDialsFor, feelColorParam } from '../domain/feelDials'
import { HueStrip } from './HueStrip'

/**
 * R304: 感觉台——工作区参数交互的唯一主语言（表头两标签 + 三列对齐表格体）。
 *
 *   「调感觉」（默认页）：4 根语义盘（动感/能量/密度/色彩，映射真实参数，
 *     缺参自动隐藏——绝不做幽灵控制）+ 效果主色色相条。
 *   「专家参数 (N)」：全部长尾滑杆三列对齐（不删任何能力）+ 逐行锁定 +
 *     随机器 + 重置默认。
 *
 * 取代旧的主参数带（与语义盘竞争语言）与「高级」抽屉的参数部分。
 * paint 类效果（custom-paint / image-paint）是内容编辑型——参数区显示
 * 指向舞台画板的提示，旋钮住在画板编辑器里（R304.2 ⑤⑥）。
 */

const PAINT_KINDS = new Set(['custom-paint', 'image-paint'])

export interface FeelConsoleProps {
  layer: EffectLayer
  setLayerParameter: (name: string, value: number | string | boolean) => void
  updateSelectedLayer: (patch: Partial<EffectLayer>) => void
  randomizerMode: RandomizerMode
  setRandomizerMode: (mode: RandomizerMode) => void
  randomizerLockedParams: string[]
  toggleRandomizerParamLock: (name: string) => void
  randomizeSelectedLayer: () => void
}

export function FeelConsole({
  layer,
  setLayerParameter,
  updateSelectedLayer,
  randomizerMode,
  setRandomizerMode,
  randomizerLockedParams,
  toggleRandomizerParamLock,
  randomizeSelectedLayer
}: FeelConsoleProps): JSX.Element {
  const { t } = useI18n()
  const [tab, setTab] = useState<'feel' | 'expert'>('feel')

  const isPaint = PAINT_KINDS.has(layer.kind)
  const dials = feelDialsFor(layer.parameters)
  const colorParam = feelColorParam(layer.parameters)
  const preset = effectPresets.find((p) => p.kind === layer.kind)

  /** 专家页长尾：全部非 `_` 前缀参数（paint 类整体除外——编辑器即参数）。 */
  const expertEntries = isPaint
    ? []
    : Object.entries(layer.parameters).filter(([name]) => !name.startsWith('_'))

  /** 专家页参数行（三列对齐：标签 | 控件 | 值+锁定）。 */
  const renderExpertRow = (name: string, value: unknown): JSX.Element => {
    const meta = PARAM_META[name]
    const label = meta?.labelKey?.includes('.')
      ? t(meta.labelKey as Parameters<typeof t>[0])
      : (meta?.labelKey ?? name)
    const unit = meta?.unit ?? ''
    const locked = randomizerLockedParams.includes(name)
    return (
      <div className="feel-row parameter-line" key={name}>
        <span>{label}</span>
        {typeof value === 'string' && !value.startsWith('#') ? (
          <input
            className="text-param-input"
            type="text"
            value={value}
            placeholder={name === 'text' ? t('param.textPlaceholder') : ''}
            onChange={(e) => setLayerParameter(name, e.target.value)}
          />
        ) : typeof value === 'string' && value.startsWith('#') ? (
          <input type="color" value={value} onChange={(e) => setLayerParameter(name, e.target.value)} />
        ) : typeof value === 'number' ? (
          <input
            min={meta?.min ?? 0}
            max={meta?.max ?? 2}
            step={meta?.step ?? 0.05}
            type="range"
            value={value}
            onChange={(e) => setLayerParameter(name, Number(e.target.value))}
          />
        ) : (
          <input
            checked={Boolean(value)}
            type="checkbox"
            onChange={(e) => setLayerParameter(name, e.target.checked)}
          />
        )}
        {typeof value === 'number' ? (
          <strong className="feel-value">
            {value}{unit}
            <button
              className={`parameter-lock-btn ${locked ? 'locked' : ''}`}
              type="button"
              aria-pressed={locked}
              title={locked ? t('effects.unlockParam') : t('effects.lockParam')}
              onClick={() => toggleRandomizerParamLock(name)}
            >
              {locked ? <Lock size={12} /> : <Unlock size={12} />}
            </button>
          </strong>
        ) : typeof value === 'string' && value.startsWith('#') ? (
          <strong className="feel-value">{value}</strong>
        ) : null}
      </div>
    )
  }

  return (
    <div className="feel-console">
      <div className="feel-tabs" role="tablist" aria-label={t('feel.consoleLabel')}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'feel'}
          className={`feel-tab ${tab === 'feel' ? 'active' : ''}`}
          onClick={() => setTab('feel')}
        >
          {t('feel.tabFeel')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'expert'}
          className={`feel-tab ${tab === 'expert' ? 'active' : ''}`}
          onClick={() => setTab('expert')}
        >
          {t('feel.tabExpert')} ({expertEntries.length})
        </button>
      </div>

      {tab === 'feel' ? (
        <div className="feel-body">
          {isPaint ? (
            <p className="feel-empty">{t('feel.paintHint')}</p>
          ) : (
            <>
              {dials.map((dial) => {
                const meta = PARAM_META[dial.param]
                const value = Number(layer.parameters[dial.param])
                return (
                  <div className="feel-row" key={dial.id}>
                    <span className="feel-label" title={t((meta?.labelKey ?? dial.param) as Parameters<typeof t>[0])}>
                      {t(dial.labelKey as Parameters<typeof t>[0])}
                    </span>
                    <input
                      type="range"
                      min={meta?.min ?? 0}
                      max={meta?.max ?? 2}
                      step={meta?.step ?? 0.05}
                      value={value}
                      aria-label={t(dial.labelKey as Parameters<typeof t>[0])}
                      onChange={(e) => setLayerParameter(dial.param, Number(e.target.value))}
                    />
                    <strong className="feel-value">
                      {value}
                      {meta?.unit ?? ''}
                    </strong>
                  </div>
                )
              })}
              {colorParam !== null && (
                <div className="feel-row">
                  <span className="feel-label">{t('feel.color')}</span>
                  <HueStrip
                    value={String(layer.parameters[colorParam])}
                    onChange={(hex) => setLayerParameter(colorParam, hex)}
                    ariaLabel={t('feel.color')}
                  />
                  <span
                    className="feel-swatch"
                    style={{ background: String(layer.parameters[colorParam]) }}
                    aria-hidden="true"
                  />
                </div>
              )}
              {dials.length === 0 && colorParam === null && <p className="feel-empty">{t('feel.noDials')}</p>}
            </>
          )}
        </div>
      ) : (
        <div className="feel-body feel-expert">
          {preset && (
            <button
              className="layer-action-btn fx-reset-defaults"
              type="button"
              onClick={() => updateSelectedLayer({ parameters: { ...preset.defaults } })}
            >
              <RotateCcw size={12} />
              <span>{t('fx.resetDefaults')}</span>
            </button>
          )}
          <div className="layer-tools-row">
            <select
              className="randomizer-select"
              value={randomizerMode}
              title={t('effects.randomizeMode')}
              onChange={(e) => setRandomizerMode(e.target.value as RandomizerMode)}
            >
              <option value="subtle">{t('effects.randomize.subtle')}</option>
              <option value="bold">{t('effects.randomize.bold')}</option>
              <option value="calm">{t('effects.randomize.calm')}</option>
              <option value="energy">{t('effects.randomize.energy')}</option>
            </select>
            <button className="layer-action-btn" type="button" onClick={randomizeSelectedLayer} title={t('effects.randomize')}>
              <Shuffle size={13} />
              <span>{t('effects.randomize')}</span>
            </button>
          </div>
          {expertEntries.length === 0 ? (
            <p className="feel-empty">{t('feel.paintHint')}</p>
          ) : (
            expertEntries.map(([name, value]) => renderExpertRow(name, value))
          )}
        </div>
      )}
    </div>
  )
}
