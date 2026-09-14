import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://localhost:9223')
const ctx = browser.contexts()[0]
const page = ctx.pages().find(p => p.url().includes('index.html'))
// Close any open drawer first by clicking its close button if present
const closeBtn = await page.$('[title="关闭"]')
if (closeBtn) await closeBtn.click()
await new Promise(r => setTimeout(r, 300))
await page.click('[title="投屏到显示器"]')
await new Promise(r => setTimeout(r, 800))
const picker = await page.$('.audio-display-picker')
if (picker) {
  await picker.screenshot({ path: 'c:/tjf/github/RGBBox/docs/screenshots/r52-06-region-picker.png' })
  console.log('picker element screenshot saved')
} else {
  console.log('picker not found')
}
await browser.close()
