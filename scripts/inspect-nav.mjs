/*
 * @Author: MIS\mike 1255033066@qq.com
 * @Date: 2026-07-07 22:50:29
 * @LastEditors: MIS\mike 1255033066@qq.com
 * @LastEditTime: 2026-07-17 22:05:54
 * @FilePath: \RGBBox\scripts\inspect-nav.mjs
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://localhost:9223')
const ctx = browser.contexts()[0]
const page = ctx.pages().find(p => p.url().includes('index.html'))
const navButtons = await page.$$('nav button')
for (const btn of navButtons) {
  const text = await btn.textContent()
  console.log('nav:', JSON.stringify(text))
}
await browser.close()
