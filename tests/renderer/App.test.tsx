// @vitest-environment happy-dom
// App.tsx pulls in the whole view tree (including 3D / WebGL components).
// happy-dom has no WebGL, so the full render is impossible here. We only
// assert the import surface and a stable property of the App component.
import { describe, it, expect } from 'vitest'

describe('renderer/App', () => {
  it('App module type-shape: App is a function (component)', { timeout: 60_000 }, async () => {
    // Lazy import wrapped in try/catch — if Three.js fails to load, the test
    // still records the import-shape intent.
    let App: any = null
    try {
      const mod = await import('../../src/renderer/src/App')
      App = mod.App
    } catch (err) {
      // The module might fail to load due to 3D code — R222.4: 原写法
      // catch 里 expect(App).toBeNull() 是等价永真(T2 硬伤③):导入失败
      // 也绿。改为**硬断言导入必须成功**——App.tsx 顶层不应再抛(3D 均
      // lazy),失败即真失败;如此本用例才有门禁价值。
      throw err
    }
    expect(typeof App).toBe('function')
  })

  it.skip('renders the top-level app shell', () => {})
  it.skip('renders nav buttons for the 9 known views', () => {})
  it.skip('starts on the workspace view by default', () => {})
  it.skip('does not throw when IPC returns empty data', () => {})
})
