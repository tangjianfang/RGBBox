// F11-02: 主题实时切换——持久化键驱动，重启后无闪错
export const journey = {
  id: 'theme-switch-live',
  title: '浅色主题持久化并全 UI 生效',
  async run({ page, sleep, check }) {
    await page.evaluate(() => localStorage.setItem('rgbbox:theme', 'light'))
    await page.reload()
    await page.waitForSelector('.module-rail', { timeout: 15000 })
    await sleep(400)
    check('html[data-theme=light]', await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'light')
    const topbarBg = await page.evaluate(() => getComputedStyle(document.querySelector('.topbar')).backgroundColor)
    check('顶栏为浅色', /rgb\(2\d\d/.test(topbarBg), topbarBg)
    await page.evaluate(() => localStorage.removeItem('rgbbox:theme'))
  },
}
