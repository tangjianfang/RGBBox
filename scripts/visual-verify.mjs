import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { setTimeout } from 'node:timers/promises'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const outDir = join(root, 'docs', 'screenshots')
mkdirSync(outDir, { recursive: true })

const electron = spawn('npx', ['electron', '--remote-debugging-port=9223', 'out/main/index.js'], {
  cwd: root,
  stdio: 'ignore',
  shell: true,
})

await setTimeout(4000)

let browser
let success = false

try {
  browser = await chromium.connectOverCDP('http://localhost:9223')
  const context = browser.contexts()[0] || (await browser.newContext())
  const pages = context.pages()
  const page = pages.find((p) => p.url().includes('index.html')) || pages[0]
  await page.waitForLoadState('networkidle')

  // 1. Launch / Workspace view
  await page.screenshot({ path: join(outDir, 'r52-01-launch.png') })

  // 2. Navigate to Audio Studio
  await page.click('text=Audio Studio')
  await setTimeout(800)
  await page.screenshot({ path: join(outDir, 'r52-02-audio-studio.png') })

  // 3. Open Generator drawer
  await page.click('text=Generator')
  await setTimeout(500)
  await page.screenshot({ path: join(outDir, 'r52-03-generator-drawer.png') })

  // 4. Switch to Scenes sub-tab
  await page.click('text=Scenes')
  await setTimeout(500)
  await page.screenshot({ path: join(outDir, 'r52-04-scenes-tab.png') })

  // 5. Switch to Export sub-tab
  await page.click('text=Export')
  await setTimeout(500)
  await page.screenshot({ path: join(outDir, 'r52-05-export-tab.png') })

  // 6. Close drawer and open projector region picker
  await page.keyboard.press('Escape')
  await setTimeout(300)
  await page.click('[title="Project to display"]')
  await setTimeout(500)
  await page.screenshot({ path: join(outDir, 'r52-06-region-picker.png') })

  success = true
  console.log('Visual verification screenshots saved to docs/screenshots/')
} catch (err) {
  console.error('Visual verification failed:', err.message)
} finally {
  if (browser) await browser.close()
  try {
    electron.kill()
  } catch {
    // ignore
  }
}

process.exit(success ? 0 : 1)
