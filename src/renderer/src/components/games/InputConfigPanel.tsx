/**
 * R213: 输入配置中心面板 —— P1-P4 键位自定义 + 手柄绑定。
 * 纯域逻辑在 domain/inputConfig（TB 交付）;本组件只做捕获/展示/持久化。
 * P1 键位直写引擎 keys 池（现状兼容），P2-P4 经 buildKeyToPoolMap 映射。
 */
import { useEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useI18n } from '../../i18n'
import {
  DEFAULT_INPUTS, buildKeyToPoolMap, findKeyConflicts, loadInputConfigs, normalizeKey, saveInputConfigs,
  type InputConfigs,
} from '../../domain/inputConfig'

interface Props {
  onClose: () => void
  /** 配置变化回调（返回新配置与映射表,容器写 ref 供 keydown 使用）。 */
  onApply?: (configs: InputConfigs) => void
}

const DIRS = ['up', 'left', 'down', 'right'] as const
const DIR_KEYS: Record<(typeof DIRS)[number], 'up' | 'left' | 'down' | 'right'> = { up: 'up', left: 'left', down: 'down', right: 'right' }

export function InputConfigPanel({ onClose, onApply }: Props): JSX.Element {
  const { t } = useI18n()
  const [configs, setConfigs] = useState<InputConfigs>(() => loadInputConfigs(localStorage))
  const [capturing, setCapturing] = useState<{ player: number; dir: (typeof DIRS)[number] } | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const conflicts = useMemo(() => findKeyConflicts(configs), [configs])
  const keyMap = useMemo(() => buildKeyToPoolMap(configs), [configs])

  useEffect(() => {
    saveInputConfigs(localStorage, configs)
    onApply?.(configs)
  }, [configs, onApply])

  // 捕获:面板内任意 keydown 直接吃掉,写入正在捕获的槽位
  const captureKey = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (capturing === null) return
    e.preventDefault()
    e.stopPropagation()
    const key = normalizeKey({ key: e.key })
    if (key === 'escape') { setCapturing(null); return }
    setConfigs((prev) => {
      const next: InputConfigs = [...prev]
      next[capturing.player] = { ...next[capturing.player], [DIR_KEYS[capturing.dir]]: key }
      return next
    })
    setCapturing(null)
  }

  const setGamepad = (player: number, value: string): void => {
    setConfigs((prev) => {
      const next: InputConfigs = [...prev]
      next[player] = { ...next[player], gamepad: value === '' ? null : Number(value) }
      return next
    })
  }

  return (
    <div className="input-config-panel" ref={rootRef} data-field="input-config" role="dialog" aria-label={t('games.input.title')} tabIndex={-1}
      onKeyDown={captureKey}>
      <div className="input-config-card panel">
        <div className="lan-head">
          <strong>{t('games.input.title')}</strong>
          <button type="button" className="coach-off-btn" data-action="input-close" onClick={onClose}>{t('games.recap.dismiss')}</button>
        </div>
        <div className="input-grid">
          {configs.map((c, p) => (
            <div key={p} className={`input-cell ${capturing?.player === p ? 'capturing' : ''}`}>
              <strong>P{p + 1}</strong>
              <div className="input-key-row">
                {DIRS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`input-key ${capturing?.player === p && capturing.dir === d ? 'capturing' : ''}`}
                    data-field={`input-key-${p}-${d}`}
                    title={c[DIR_KEYS[d]]}
                    onClick={() => setCapturing({ player: p, dir: d })}
                  >{capturing?.player === p && capturing.dir === d ? t('games.input.capture') : c[DIR_KEYS[d]]}</button>
                ))}
              </div>
              <label>
                <span>{t('games.input.gamepad')}</span>
                <select value={c.gamepad === null ? '' : String(c.gamepad)} onChange={(e) => setGamepad(p, e.target.value)}>
                  <option value="">{t('games.input.none')}</option>
                  {[0, 1, 2, 3].map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
            </div>
          ))}
        </div>
        {conflicts.length > 0 ? <p className="input-conflicts" data-field="input-conflicts">{t('games.input.conflict')}: {conflicts.join(' · ')}</p> : null}
        <div className="input-actions">
          <button type="button" className="video-btn" data-action="input-reset" onClick={() => setConfigs(DEFAULT_INPUTS)}>{t('fx.resetDefaults')}</button>
          <button type="button" className="video-btn" data-action="input-done" onClick={onClose}>{t('common.ok')}</button>
        </div>
        {/* 映射表挂 DOM 便于 E2E 断言(不展示) */}
        <span hidden data-field="input-keymap">{JSON.stringify(keyMap)}</span>
      </div>
    </div>
  )
}
