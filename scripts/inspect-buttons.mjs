import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://localhost:9223')
const ctx = browser.contexts()[0]
const page = ctx.pages().find(p => p.url().includes('index.html'))
const buttons = await page.$$('button')
for (const btn of buttons) {
  const text = await btn.textContent()
  if (text && text.trim()) console.log(JSON.stringify(text.trim()))
}
await browser.close()
