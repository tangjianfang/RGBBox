import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://localhost:9223')
const ctx = browser.contexts()[0]
const page = ctx.pages().find(p => p.url().includes('index.html'))
const buttons = await page.$$('button')
for (let i = 0; i < buttons.length; i++) {
  const title = await buttons[i].getAttribute('title')
  const text = await buttons[i].textContent()
  console.log(i, JSON.stringify(title), JSON.stringify(text && text.trim()))
}
await browser.close()
