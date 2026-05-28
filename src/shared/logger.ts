/**
 * File-based logger for RGBBox.
 *
 * Features:
 * - Logs to a rotating file in the user data directory (logs/)
 * - Log levels: debug, info, warn, error
 * - Automatic file rotation when size exceeds threshold (default 5 MB)
 * - Keeps the last N rotated files (default 5)
 * - Includes ISO timestamp, level, category, and message in each line
 * - Thread-safe buffered writes to avoid blocking the main process
 */

import { mkdirSync, writeFileSync, statSync, renameSync, unlinkSync, readdirSync } from 'node:fs'
import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
}

export interface LoggerOptions {
  /** Directory to store log files. Defaults to `<userData>/logs`. */
  logDir: string
  /** Minimum log level to write. Defaults to 'info'. */
  minLevel?: LogLevel
  /** Max size (bytes) before rotation. Defaults to 5 MB. */
  maxFileSize?: number
  /** Number of rotated files to keep. Defaults to 5. */
  maxFiles?: number
  /** Log file name prefix. Defaults to 'rgbbox'. */
  filePrefix?: string
}

/** Buffer entry waiting to be flushed to disk. */
interface LogEntry {
  timestamp: string
  level: LogLevel
  category: string
  message: string
}

export class Logger {
  private readonly logDir: string
  private readonly minLevel: LogLevel
  private readonly maxFileSize: number
  private readonly maxFiles: number
  private readonly filePrefix: string
  private readonly logFilePath: string
  private buffer: LogEntry[] = []
  private flushPending = false
  private initialized = false

  constructor(options: LoggerOptions) {
    this.logDir = options.logDir
    this.minLevel = options.minLevel ?? 'info'
    this.maxFileSize = options.maxFileSize ?? 5 * 1024 * 1024
    this.maxFiles = options.maxFiles ?? 5
    this.filePrefix = options.filePrefix ?? 'rgbbox'
    this.logFilePath = join(this.logDir, `${this.filePrefix}.log`)
  }

  /** Ensure the log directory exists. Call once at app startup. */
  initialize(): void {
    if (this.initialized) return
    try {
      mkdirSync(this.logDir, { recursive: true })
    } catch {
      // If directory creation fails, logging will silently skip
    }
    this.initialized = true
  }

  debug(category: string, message: string): void {
    this.log('debug', category, message)
  }

  info(category: string, message: string): void {
    this.log('info', category, message)
  }

  warn(category: string, message: string): void {
    this.log('warn', category, message)
  }

  error(category: string, message: string): void {
    this.log('error', category, message)
  }

  private log(level: LogLevel, category: string, message: string): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.minLevel]) return

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message
    }

    this.buffer.push(entry)
    this.scheduleFlush()
  }

  private scheduleFlush(): void {
    if (this.flushPending) return
    this.flushPending = true
    // Use queueMicrotask for near-immediate async flush without blocking
    queueMicrotask(() => {
      void this.flush()
    })
  }

  /** Flush buffered entries to disk. */
  async flush(): Promise<void> {
    this.flushPending = false
    if (this.buffer.length === 0) return
    if (!this.initialized) this.initialize()

    const entries = this.buffer.splice(0)
    const lines = entries.map((e) => this.formatEntry(e)).join('\n') + '\n'

    try {
      this.rotateIfNeeded()
      await appendFile(this.logFilePath, lines, 'utf-8')
    } catch {
      // Silently drop logs on write failure — never crash the app for logging
    }
  }

  /** Synchronous flush for shutdown scenarios. */
  flushSync(): void {
    if (this.buffer.length === 0) return
    if (!this.initialized) this.initialize()

    const entries = this.buffer.splice(0)
    const lines = entries.map((e) => this.formatEntry(e)).join('\n') + '\n'

    try {
      this.rotateIfNeeded()
      writeFileSync(this.logFilePath, lines, { flag: 'a', encoding: 'utf-8' })
    } catch {
      // Silently drop
    }
  }

  private formatEntry(entry: LogEntry): string {
    return `[${entry.timestamp}] [${entry.level.toUpperCase().padEnd(5)}] [${entry.category}] ${entry.message}`
  }

  private rotateIfNeeded(): void {
    try {
      const stat = statSync(this.logFilePath)
      if (stat.size < this.maxFileSize) return
    } catch {
      // File doesn't exist yet — no rotation needed
      return
    }

    // Rotate existing files: .log.4 → .log.5, .log.3 → .log.4, etc.
    for (let i = this.maxFiles - 1; i >= 1; i--) {
      const src = join(this.logDir, `${this.filePrefix}.log.${i}`)
      const dest = join(this.logDir, `${this.filePrefix}.log.${i + 1}`)
      try { renameSync(src, dest) } catch { /* file may not exist */ }
    }

    // Rename current log to .log.1
    try {
      renameSync(this.logFilePath, join(this.logDir, `${this.filePrefix}.log.1`))
    } catch { /* ignore */ }

    // Remove excess rotated files
    this.cleanOldFiles()
  }

  private cleanOldFiles(): void {
    try {
      const files = readdirSync(this.logDir)
      const logFiles = files
        .filter((f) => f.startsWith(`${this.filePrefix}.log.`))
        .sort((a, b) => {
          const numA = parseInt(a.split('.').pop() ?? '0', 10)
          const numB = parseInt(b.split('.').pop() ?? '0', 10)
          return numA - numB
        })

      for (const file of logFiles) {
        const num = parseInt(file.split('.').pop() ?? '0', 10)
        if (num > this.maxFiles) {
          try { unlinkSync(join(this.logDir, file)) } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }

  /** Get the current log file path (useful for diagnostics). */
  getLogFilePath(): string {
    return this.logFilePath
  }
}

// ── Singleton instance (lazy-initialized in main process) ──────────────────

let _instance: Logger | null = null

/**
 * Get or create the global logger instance.
 * Must call `initLogger(logDir)` first in the main process.
 */
export function getLogger(): Logger {
  if (!_instance) {
    throw new Error('Logger not initialized. Call initLogger(logDir) first.')
  }
  return _instance
}

/**
 * Initialize the global logger singleton with the given log directory.
 * Typically called once during app startup with `app.getPath('userData') + '/logs'`.
 */
export function initLogger(logDir: string, options?: Partial<Omit<LoggerOptions, 'logDir'>>): Logger {
  if (_instance) return _instance
  _instance = new Logger({ logDir, ...options })
  _instance.initialize()
  return _instance
}

/**
 * Reset the global logger instance (for testing purposes only).
 */
export function resetLogger(): void {
  _instance = null
}
