// F11-03: 语言实时切换——顶栏按钮一键 zh/en 往返
export const journey = {
  id: 'lang-switch-live',
  title: 'zh ⇄ en 一键往返',
  async run({ page, sleep, check }) {
    const before = await page.evaluate(() => document.querySelector('.topbar-title')?.textContent ?? '')
    await page.locator('button[title*="English"], button[title*="中文"]').first().click()
    await sleep(500)
    const after = await page.evaluate(() => document.querySelector('.topbar-title')?.textContent ?? '')
    check('标题语言已切换', before !== after && after.length > 0, `${before} → ${after}`)
    await page.locator('button[title*="English"], button[title*="中文"]').first().click()
    await sleep(400)
    const back = await page.evaluate(() => document.querySelector('.topbar-title')?.textContent ?? '')
    check('往返复原', back === before, `${after} → ${back}`)
  },
}
