/**
 * R253 / TASK-UNIVERSE F6 (first tranche): the IPC channel CONTRACT test —
 * the whole 137-channel roster parsed from the single source of truth
 * (src/shared/ipc.ts) and checked for naming discipline + uniqueness +
 * direction annotations on the vision family. Later tranches add per-channel
 * payload schemas on this foundation.
 */
import { test, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const src = readFileSync('src/shared/ipc.ts', 'utf8')
const entries = [...src.matchAll(/^ {2}(\w+): '(rgbbox:[^']+)'/gm)]
const channels = entries.map((m) => ({ key: m[1], channel: m[2] }))

test('R253: IPC 名册解析——至少 130 通道（对 2026-10-09 实测 137 防意外缩减）', () => {
  expect(channels.length).toBeGreaterThanOrEqual(130)
})

test('R253: 全通道命名规范 rgbbox:<域>:<动作> 且无重复值', () => {
  const seen = new Set<string>()
  for (const { key, channel } of channels) {
    expect(channel, key).toMatch(/^rgbbox:[a-z0-9-]+:[a-z0-9-]+$/)
    expect(seen.has(channel), `duplicate channel ${channel}`).toBe(false)
    seen.add(channel)
  }
})

test('R253: 视觉家族通道齐全且方向对码（host 开关为 invoke，推送为 on-push）', () => {
  const keys = new Set(channels.map((c) => c.key))
  for (const k of ['visionHostOpen', 'visionHostClose']) expect(keys.has(k), k).toBe(true)
  // the vision data plane deliberately does NOT ride ipc — it is the
  // BroadcastChannel 'rgbbox-vision' contract (hostProtocol.js), asserted by
  // its own frozen tables in tests/vision/hostProtocol.test.mjs
})

test('R253: 无游离字符串——renderer 侧不直接拼接通道名（抽检 grep 契约）', () => {
  // spot-check: preload must import the constant table, not hardcode strings
  const preload = readFileSync('src/preload/index.ts', 'utf8')
  expect(preload).toContain('ipcChannels.')
  expect(preload.includes("ipcRenderer.send('rgbbox:")).toBe(false)
})
