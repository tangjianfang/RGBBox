/**
 * R238 journey runner — executes every journey in ./journeys/ (or the ids
 * passed as args). Each journey is `{ id, title, run(ctx) }`; ctx =
 * { page, sleep, check }. One isolated app instance per journey (slow but
 * hermetic — journeys are a night-tier gate, not the default suite).
 */
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { withApp, check, summary, sleep } from './harness.mjs'

const dir = join(dirname(fileURLToPath(import.meta.url)), 'journeys')
const only = process.argv.slice(2)
const journeys = []
for (const f of readdirSync(dir).filter((x) => x.endsWith('.mjs')).sort()) {
  const mod = await import(pathToFileURL(join(dir, f)).href)
  journeys.push(mod.journey)
}

const selected = only.length ? journeys.filter((j) => only.includes(j.id)) : journeys
let allOk = true
for (const j of selected) {
  console.log(`\n== ${j.id}: ${j.title} ==`)
  const ctx = await withApp(async () => {})
  try {
    await j.run({ page: ctx.page, sleep, check })
  } catch (e) {
    check(`${j.id} crashed`, false, String(e?.message ?? e).slice(0, 120))
    allOk = false
  } finally {
    await ctx.cleanup()
  }
}
if (!summary()) process.exit(1)
