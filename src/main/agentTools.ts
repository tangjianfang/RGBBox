/**
 * agentTools — R172-S1 审批门禁工具组(内核引擎的 6 件工具)。
 *
 * 安全纪律(方案 §5):
 *  - 所有路径先经 clampToWorkspace 钳制(规范化 + 前缀校验),越界一律拒绝;
 *  - write/edit 走调用方审批门禁,落地前生成 .bak(会话内覆盖只留最新),原子写;
 *  - bash 走 denylist + 超时 + 输出截断,exec 的 cwd 固定为工作区;
 *  - 纯函数部分(clamp/denylist/glob 匹配)导出供单测。
 */
import { exec } from 'node:child_process'
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { globSync } from 'node:fs' // Node ≥22 sync glob (patterns subset)
import { isAbsolute, join, relative, resolve } from 'node:path'

export const AGENT_MAX_OUTPUT = 64 * 1024
export const AGENT_BASH_TIMEOUT_MS = 120_000

/** 规范化并钳制到工作区内;越界/绝对路径逃逸返回 null。 */
export function clampToWorkspace(workspace: string, p: string): string | null {
  if (typeof p !== 'string' || p.trim() === '') return null
  const ws = resolve(workspace)
  const target = resolve(ws, p)
  const rel = relative(ws, target)
  if (rel.startsWith('..') || isAbsolute(rel) || rel === '') {
    // rel === '' is the workspace dir itself — only valid as a listing target
    return rel === '' ? ws : null
  }
  return target
}

/** 危险命令 denylist(正则,大小写不敏感)。命中即拒绝,不给审批机会。 */
export const BASH_DENYLIST: RegExp[] = [
  /rm\s+-[a-z]*r[a-z]*f?(\s+[^\s|;&]+)*\s+\/(\s|$)/i, // rm -rf … / 目标根
  /rm\s+-[a-z]*r[a-z]*f?\s+"?[a-z]:[\\/]"?(\s|$)/i, // rm -rf C:\ 盘根(git-bash 风格)
  /remove-item\s+[^\n]*-recurse[^\n]*-force/i, // PowerShell Remove-Item -Recurse -Force
  /rd\s+(\/[sq]\s+)+"?[a-z]:[\\/]?(\s|$)/i,
  /format\s+[a-z]:/i,
  /shutdown|logoff\s+\/s|taskkill\s+\/f\s+\/im\s+explorer/i,
  /reg\s+(delete|add)\s+.*(HKLM|HKCR)/i,
  /del\s+\/[a-z]*s[a-z]*\s+[a-z]:\\windows/i,
  /curl[^|]*\|\s*(bash|sh|powershell|iex)/i,
  /Invoke-Expression|iex\s+\(/i,
  /mkfs|dd\s+if=/i,
  /vssadmin\s+delete\s+shadows/i,
  /bcdedit\s+\/(set|delete)/i,
]

export function isBashDenied(cmd: string): boolean {
  return BASH_DENYLIST.some((re) => re.test(cmd))
}

export function truncateOutput(text: string): string {
  if (text.length <= AGENT_MAX_OUTPUT) return text
  return `${text.slice(0, AGENT_MAX_OUTPUT)}\n…[truncated ${text.length - AGENT_MAX_OUTPUT} chars]`
}

/** OpenAI tools 参数面(内核引擎随消息下发)。 */
export const AGENT_TOOL_SCHEMAS = [
  { type: 'function', function: { name: 'read', description: 'Read a text file inside the workspace. Returns file content (truncated).', parameters: { type: 'object', properties: { path: { type: 'string' }, offset: { type: 'number' }, limit: { type: 'number' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'write', description: 'Create/overwrite a text file inside the workspace. Requires approval.', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } },
  { type: 'function', function: { name: 'edit', description: 'Replace exactly one occurrence of `find` with `replace` in a workspace file. Requires approval.', parameters: { type: 'object', properties: { path: { type: 'string' }, find: { type: 'string' }, replace: { type: 'string' } }, required: ['path', 'find', 'replace'] } } },
  { type: 'function', function: { name: 'bash', description: 'Run a shell command with cwd=workspace. Requires approval. 120s timeout, output truncated.', parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } } },
  { type: 'function', function: { name: 'list', description: 'List entries of a directory inside the workspace.', parameters: { type: 'object', properties: { path: { type: 'string' }, recursive: { type: 'boolean' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'glob', description: 'Glob-match relative paths inside the workspace (e.g. "src/**/*.ts").', parameters: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] } } },
] as const

export interface ToolOutcome { ok: boolean; text: string }

export async function toolRead(workspace: string, p: string, offset = 0, limit = 400): Promise<ToolOutcome> {
  const target = clampToWorkspace(workspace, p)
  if (!target) return { ok: false, text: 'ERR: path escapes workspace' }
  try {
    if (!existsSync(target) || statSync(target).isDirectory()) return { ok: false, text: 'ERR: not found (or is a directory)' }
    const raw = readFileSync(target, 'utf8')
    const lines = raw.split('\n')
    const slice = lines.slice(offset, offset + limit).map((l, i) => `${offset + i + 1}| ${l}`).join('\n')
    return { ok: true, text: truncateOutput(slice) }
  } catch (e) {
    return { ok: false, text: `ERR: ${errText(e)}` }
  }
}

/** 写前 .bak(决策 ③):同目录 <name>.bak,存在则覆盖(会话内只留最新一份)。 */
export function backupFile(target: string): void {
  if (existsSync(target)) {
    writeFileSync(`${target}.bak`, readFileSync(target))
  }
}

/** 原子写:临时文件 + rename。 */
export function atomicWrite(target: string, content: string): void {
  const tmp = `${target}.agent-tmp`
  writeFileSync(tmp, content, 'utf8')
  renameSync(tmp, target)
}

export async function toolWrite(workspace: string, p: string, content: string): Promise<ToolOutcome> {
  const target = clampToWorkspace(workspace, p)
  if (!target) return { ok: false, text: 'ERR: path escapes workspace' }
  try {
    backupFile(target)
    atomicWrite(target, content)
    return { ok: true, text: `wrote ${content.length} bytes to ${relative(resolve(workspace), target)}` }
  } catch (e) {
    return { ok: false, text: `ERR: ${errText(e)}` }
  }
}

export async function toolEdit(workspace: string, p: string, find: string, replaceWith: string): Promise<ToolOutcome> {
  const target = clampToWorkspace(workspace, p)
  if (!target) return { ok: false, text: 'ERR: path escapes workspace' }
  try {
    if (!existsSync(target)) return { ok: false, text: 'ERR: file not found' }
    const raw = readFileSync(target, 'utf8')
    const count = raw.split(find).length - 1
    if (count === 0) return { ok: false, text: 'ERR: `find` not present in file' }
    if (count > 1) return { ok: false, text: `ERR: \`find\` occurs ${count} times — provide a longer unique snippet` }
    backupFile(target)
    atomicWrite(target, raw.replace(find, replaceWith))
    return { ok: true, text: `edited ${relative(resolve(workspace), target)}` }
  } catch (e) {
    return { ok: false, text: `ERR: ${errText(e)}` }
  }
}

export function toolBash(workspace: string, command: string, timeoutMs = AGENT_BASH_TIMEOUT_MS): Promise<ToolOutcome> {
  return new Promise((resolvePromise) => {
    exec(command, { cwd: resolve(workspace), timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      const out = `stdout:\n${stdout}\nstderr:\n${stderr}`
      if (err && stdout === '' && stderr === '') {
        resolvePromise({ ok: false, text: `ERR: ${errText(err)}` })
        return
      }
      resolvePromise({ ok: !err, text: truncateOutput(out) + (err ? `\n(exit: ${(err as NodeJS.ErrnoException & { code?: number | string }).code ?? 'nonzero'})` : '') })
    })
  })
}

export function toolList(workspace: string, p: string, recursive = false): ToolOutcome {
  const target = clampToWorkspace(workspace, p)
  if (!target) return { ok: false, text: 'ERR: path escapes workspace' }
  try {
    const hits = globSync(recursive ? join(relative(resolve(workspace), target) || '.', '**/*') : join(relative(resolve(workspace), target) || '.', '*'), { cwd: resolve(workspace) })
    if (hits.length === 0) return { ok: true, text: '(empty)' }
    return { ok: true, text: truncateOutput(hits.slice(0, 500).join('\n')) }
  } catch (e) {
    return { ok: false, text: `ERR: ${errText(e)}` }
  }
}

export function toolGlob(workspace: string, pattern: string): ToolOutcome {
  // R180: keep glob inside the workspace — absolute or `..`-leading patterns
  // would escape the sandbox root.
  const normalized = String(pattern ?? '').replace(/\\/g, '/')
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized) || normalized.split('/').includes('..')) {
    return { ok: false, text: 'ERR: pattern must be workspace-relative (no leading /, drive, or ..)' }
  }
  try {
    const hits = globSync(normalized, { cwd: resolve(workspace) })
    if (hits.length === 0) return { ok: true, text: '(no matches)' }
    return { ok: true, text: truncateOutput(hits.slice(0, 500).join('\n')) }
  } catch (e) {
    return { ok: false, text: `ERR: ${errText(e)}` }
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
