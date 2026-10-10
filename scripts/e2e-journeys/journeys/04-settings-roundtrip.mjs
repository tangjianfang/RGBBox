// F11-04: 设置往返——开关持久化跨重启（隔离 userData 内验证）
export const journey = {
  id: 'settings-roundtrip',
  title: '设置开关持久化往返',
  async run({ page, sleep, check }) {
    await page.locator('.module-rail .rail-settings').click()
    await page.waitForSelector('.settings-group', { timeout: 10000 })
    const box = page.locator('input[type="checkbox"]').first()
    const initial = await box.isChecked()
    await box.click()
    await sleep(600)
    await page.reload()
    await page.waitForSelector('.module-rail', { timeout: 15000 })
    await page.locator('.module-rail .rail-settings').click()
    await page.waitForSelector('.settings-group', { timeout: 10000 })
    const after = await page.locator('input[type="checkbox"]').first().isChecked()
    check('开关状态跨重启持久化', after === !initial, `${initial} → ${after}`)
  },
}
