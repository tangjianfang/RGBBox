/**
 * trayMenu — R80.12: 托盘菜单标签（纯函数，供单测）。
 * 主进程原生菜单在启动时构建一次，界面语言切换后需按 locale 重建；
 * 标签集中此处避免 index.ts 内散落硬编码。
 */

export type UiLocale = 'zh' | 'en'

export interface TrayMenuLabels {
  toggle: string
  snip: string
  selectionAi: string
  quit: string
}

export function trayMenuLabels(locale: UiLocale, hotkeyLabel: string): TrayMenuLabels {
  return locale === 'en'
    ? {
        toggle: 'Show / Hide Main Window',
        snip: `Snip (${hotkeyLabel})`,
        selectionAi: 'Selection AI (Alt+Q)',
        quit: 'Quit RGBBox',
      }
    : {
        toggle: '显示 / 隐藏主界面',
        snip: `截图 (${hotkeyLabel})`,
        selectionAi: '划词 AI (Alt+Q)',
        quit: '退出 RGBBox',
      }
}

export function asUiLocale(v: unknown): UiLocale {
  return v === 'en' ? 'en' : 'zh'
}
