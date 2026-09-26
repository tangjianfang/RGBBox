/**
 * agentTools — R172-S1 审批门禁工具组(内核引擎的 6 件工具)。
 *
 * 安全纪律(方案 §5):
 *  - 所有路径先经 clampToWorkspace 钳制(规范化 + 前缀校验),越界一律拒绝;
 *  - write/edit 走调用方审批门禁,落地前生成 .bak(会话内覆盖只留最新),原子写;
 *  - bash 走 denylist + 超时 + 输出截断,exec 的 cwd 固定为工作区;
 *  - 纯函数部分(clamp/denylist/glob 匹配)导出供单测。
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { globSync } from 'node:fs' // Node ≥22 sync glob (patterns subset)
import { isAbsolute, join, relative, resolve } from 'node:path'

export const AGENT_MAX_OUTPUT = 64 * 1024
export const AGENT_BASH_TIMEOUT_MS = 120_000

// ── R192.9: bash 工具的 Windows 现实 ─────────────────────────────────────────
// exec() 在 win32 恒走 cmd.exe——名为 bash 的工具实际跑批处理,cat/grep 全灭且
// 中文输出 GBK 被按 UTF-8 解成乱码。优先解析 Git Bash;找不到才回落 cmd 并在
// 结果里注明(模型可据此改写命令风格)。

let cachedBashPath: string | null | undefined

/** 测试 seam:清空 bash 解析缓存。 */
export function resetBashPathCacheForTest(): void {
  cachedBashPath = undefined
}

export function pickBashPath(): string | null {
  if (process.platform !== 'win32') return null // POSIX 上 spawn shell 路径本就正确
  if (cachedBashPath !== undefined) return cachedBashPath
  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files'
  const candidates = [
    process.env.RGBBOX_AGENT_BASH, // 测试注入位
    join(programFiles, 'Git', 'bin', 'bash.exe'),
    join(programFiles, 'Git', 'usr\\bin\\bash.exe'),
    join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Git', 'bin', 'bash.exe'),
    join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Git', 'bin', 'bash.exe'),
  ].filter((c): c is string => typeof c === 'string' && c.trim() !== '')
  for (const c of candidates) {
    try {
      if (existsSync(c)) {
        cachedBashPath = c
        return c
      }
    } catch { /* unreadable candidate — keep probing */ }
  }
  cachedBashPath = null
  return null
}

/** 缓冲解码:UTF-8 严格解失败 → GBK 回退(cmd.exe 中文路径的常态)。 */
export function decodeOutput(buf: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    try {
      return new TextDecoder('gbk').decode(buf)
    } catch {
      return buf.toString('utf8')
    }
  }
}

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
    const bash = pickBashPath()
    const useBash = bash !== null || process.platform !== 'win32'
    // R192.9: bash available (or POSIX) → spawn(bash -c). Windows without bash
    // → cmd.exe via shell:true, plus an explicit note so the model adapts.
    const child = useBash
      ? spawn(bash ?? 'bash', ['-c', command], { cwd: resolve(workspace), windowsHide: true })
      : spawn(command, { cwd: resolve(workspace), windowsHide: true, shell: true })
    const outBuf: Buffer[] = []
    const errBuf: Buffer[] = []
    let killed = false
    const timer = setTimeout(() => {
      killed = true
      child.kill()
    }, timeoutMs)
    const MAX = 16 * 1024 * 1024
    child.stdout?.on('data', (c: Buffer) => { if (sum(outBuf) < MAX) outBuf.push(c) })
    child.stderr?.on('data', (c: Buffer) => { if (sum(errBuf) < MAX) errBuf.push(c) })
    child.on('error', (err) => {
      clearTimeout(timer)
      resolvePromise({ ok: false, text: `ERR: ${errText(err)}` })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const stdout = decodeOutput(Buffer.concat(outBuf))
      const stderr = decodeOutput(Buffer.concat(errBuf))
      const note = useBash ? '' : '\nnote: bash.exe not found — ran via cmd.exe (Unix commands unavailable; rewrite in cmd/PowerShell style)'
      const out = `stdout:\n${stdout}\nstderr:\n${stderr}${note}`
      resolvePromise({
        ok: !killed && code === 0,
        text: truncateOutput(out) + (killed ? '\n(exit: timeout killed)' : code !== 0 ? `\n(exit: ${code ?? 'nonzero'})` : ''),
      })
    })
  })
}

function sum(bufs: Buffer[]): number {
  return bufs.reduce((a, b) => a + b.length, 0)
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
