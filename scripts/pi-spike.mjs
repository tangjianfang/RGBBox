#!/usr/bin/env node
/**
 * R172-S0 pi spike (A2) — go/no-go harness for the pi coding agent SDK.
 *
 * Verifies the three unknowns from the integration plan:
 *   R-1  pi-ai can drive Zhipu's China endpoint (open.bigmodel.cn/api/coding/paas/v4)
 *        with an ordinary API key via env ZAI_CODING_CN_API_KEY.
 *   -   customTools replace/extend the built-in tool set (approval-gate pattern).
 *   -   agent loop completes a real smoke task in a temp workspace.
 *
 * Run (get a key at open.bigmodel.cn; the app's own profile key works):
 *   ZAI_CODING_CN_API_KEY=xxx node scripts/pi-spike.mjs              # glm-5.3
 *   ZAI_CODING_CN_API_KEY=xxx node scripts/pi-spike.mjs glm-5.3-flash
 *
 * Exit 0 = GO, 1 = NO-GO (with the failure stage printed).
 */
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const MODEL_ID = process.argv[2] ?? 'glm-5.3'
const KEY = process.env.ZAI_CODING_CN_API_KEY ?? process.env.ZAI_API_KEY ?? ''
if (!KEY) {
  console.error('[spike] missing env ZAI_CODING_CN_API_KEY — get one at open.bigmodel.cn')
  process.exit(1)
}

let workspace = ''
try {
  const { createAgentSession } = await import('@earendil-works/pi-coding-agent')
  const { zaiCodingCnProvider } = await import('@earendil-works/pi-ai/providers/zai-coding-cn.js')

  const provider = zaiCodingCnProvider()
  const model = provider.models.find((m) => m.id === MODEL_ID)
  if (!model) throw new Error(`model ${MODEL_ID} not in catalog: ${provider.models.map((m) => m.id).join(', ')}`)

  workspace = mkdtempSync(join(tmpdir(), 'pi-spike-'))
  const approver = { calls: 0 }
  const gate = (label, run) => async (args) => {
    approver.calls += 1
    console.log(`  [gate] ${label} → auto-approved`, JSON.stringify(args).slice(0, 120))
    return run(args)
  }

  const { session } = await createAgentSession({
    cwd: workspace,
    model,
    // The integration ships ALL tools through approval gates — mirror that here.
    noTools: 'builtin',
    customTools: [
      {
        name: 'spike_write',
        description: 'Write text to a file inside the workspace (approval-gated in the real app).',
        parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
        execute: gate('write', async ({ path, content }) => {
          const p = join(workspace, path)
          writeFileSync(p, content)
          return `wrote ${content.length} bytes to ${path}`
        }),
      },
      {
        name: 'spike_read',
        description: 'Read a file inside the workspace.',
        parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
        execute: gate('read', async ({ path }) => readFileSync(join(workspace, path), 'utf8').slice(0, 512)),
      },
    ],
  })

  let textLen = 0
  session.subscribe((event) => {
    if (event.type === 'text_delta') textLen += event.text?.length ?? 0
    else if (event.type === 'message_end' || event.type === 'agent_settled') console.log(`  [event] ${event.type}`)
  })

  console.log(`[spike] model=${MODEL_ID} workspace=${workspace}`)
  console.log('[spike] prompt: create notes.txt containing the word GO, then read it back')
  await session.prompt('Use the spike_write tool to create notes.txt containing exactly the word GO. Then use spike_read to read it back and tell me its content.')
  const answer = session.getLastAssistantText?.() ?? ''

  const wrote = existsSync(join(workspace, 'notes.txt'))
  const content = wrote ? readFileSync(join(workspace, 'notes.txt'), 'utf8').trim() : ''
  session.dispose()

  console.log('---')
  console.log(`[spike] file created: ${wrote} | content: ${JSON.stringify(content)}`)
  console.log(`[spike] gated tool calls: ${approver.calls} | assistant text chars: ${answer.length + textLen}`)
  const ok = wrote && content === 'GO' && approver.calls >= 2
  console.log(ok ? '[spike] VERDICT: GO ✅' : '[spike] VERDICT: NO-GO ❌ (loop ran but task incomplete — inspect output above)')
  rmSync(workspace, { recursive: true, force: true })
  process.exit(ok ? 0 : 1)
} catch (err) {
  console.error(`[spike] VERDICT: NO-GO ❌ — failure at setup/loop: ${err?.message ?? err}`)
  if (workspace) rmSync(workspace, { recursive: true, force: true })
  process.exit(1)
}
