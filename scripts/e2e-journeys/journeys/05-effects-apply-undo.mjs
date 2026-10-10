// F11-05: 效果应用 + 撤销 toast（R164 契约）
export const journey = {
  id: 'effects-apply-undo',
  title: '效果卡片点击 → 应用 toast + 撤销',
  async run({ page, sleep, check }) {
    await page.locator('.module-rail .rail-item').nth(2).click() // effects view
    await page.waitForSelector('.effect-card', { timeout: 15000 })
    await sleep(500)
    await page.locator('.effect-card:not(.selected) .effect-card-main').first().click()
    await sleep(800)
    check('applied toast 出现', await page.locator('.fx-applied-toast').isVisible().catch(() => false))
    const undone = await page.evaluate(() => document.querySelector('.fx-applied-toast button')?.textContent ?? '')
    check('撤销按钮存在', undone.length > 0, undone)
  },
}
