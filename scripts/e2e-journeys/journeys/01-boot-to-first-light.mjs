// F11-01: 冷启动到可用主界面——rail + 仪表盘卡片就绪，控制台零未捕获错误
export const journey = {
  id: 'boot-to-first-light',
  title: '冷启动 → 主界面可用',
  async run({ page, sleep, check }) {
    const errors = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 80)) })
    await sleep(600)
    check('rail 导航就绪', await page.locator('.module-rail .rail-item').count() >= 5)
    check('仪表盘状态卡渲染', await page.locator('.dashboard, .panel, .metric').first().isVisible().catch(() => false))
    await sleep(1200)
    check('控制台零错误', errors.length === 0, errors.slice(0, 3).join(' | '))
  },
}
