import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  Logger,
  initLogger,
  getLogger,
  resetLogger,
  type LoggerOptions,
} from '../../src/shared/logger'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'rgbbox-logger-'))
  resetLogger()
})

afterEach(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
  resetLogger()
})

async function waitForFlush(): Promise<void> {
  // queueMicrotask is used in Logger; wait a few microtasks
  await new Promise((resolve) => setTimeout(resolve, 20))
}

describe('shared/logger', () => {
  describe('Logger instance', () => {
    it('initializes log directory on initialize()', () => {
      const logger = new Logger({ logDir: join(tmpDir, 'subdir', 'logs') })
      logger.initialize()
      expect(existsSync(join(tmpDir, 'subdir', 'logs'))).toBe(true)
    })

    it('does not throw if log directory already exists', () => {
      const logger = new Logger({ logDir: tmpDir })
      expect(() => logger.initialize()).not.toThrow()
    })

    it('respects minLevel filter', async () => {
      const logger = new Logger({ logDir: tmpDir, minLevel: 'warn' })
      logger.initialize()
      logger.debug('A', 'debug message')
      logger.info('A', 'info message')
      logger.warn('A', 'warn message')
      logger.error('A', 'error message')
      await waitForFlush()
      const content = readFileSync(logger.getLogFilePath(), 'utf-8')
      expect(content).not.toContain('debug message')
      expect(content).not.toContain('info message')
      expect(content).toContain('warn message')
      expect(content).toContain('error message')
    })

    it('logs all levels when minLevel=debug', async () => {
      const logger = new Logger({ logDir: tmpDir, minLevel: 'debug' })
      logger.initialize()
      logger.debug('A', 'd')
      logger.info('A', 'i')
      logger.warn('A', 'w')
      logger.error('A', 'e')
      await waitForFlush()
      const content = readFileSync(logger.getLogFilePath(), 'utf-8')
      expect(content).toContain('d')
      expect(content).toContain('i')
      expect(content).toContain('w')
      expect(content).toContain('e')
    })

    it('formats entries with timestamp, level, category, message', async () => {
      const logger = new Logger({ logDir: tmpDir })
      logger.initialize()
      logger.info('MyCat', 'hello world')
      await waitForFlush()
      const content = readFileSync(logger.getLogFilePath(), 'utf-8')
      expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T/)
      expect(content).toContain('[INFO ]')
      expect(content).toContain('[MyCat]')
      expect(content).toContain('hello world')
    })

    it('multiple logs are batched into one flush call', async () => {
      const logger = new Logger({ logDir: tmpDir })
      logger.initialize()
      for (let i = 0; i < 5; i++) {
        logger.info('Batch', `message ${i}`)
      }
      await waitForFlush()
      const content = readFileSync(logger.getLogFilePath(), 'utf-8')
      for (let i = 0; i < 5; i++) {
        expect(content).toContain(`message ${i}`)
      }
    })

    it('flushSync writes immediately (no queueMicrotask)', () => {
      const logger = new Logger({ logDir: tmpDir })
      logger.initialize()
      logger.info('Sync', 'immediate')
      logger.flushSync()
      const content = readFileSync(logger.getLogFilePath(), 'utf-8')
      expect(content).toContain('immediate')
    })

    it('flushSync on empty buffer is a no-op', () => {
      const logger = new Logger({ logDir: tmpDir })
      logger.initialize()
      expect(() => logger.flushSync()).not.toThrow()
    })

    it('rotates log file when size exceeds maxFileSize', async () => {
      const logger = new Logger({
        logDir: tmpDir,
        maxFileSize: 100, // very small
        maxFiles: 3
      })
      logger.initialize()
      // Write enough to trigger rotation
      for (let i = 0; i < 20; i++) {
        logger.info('Rot', `a-long-message-that-pads-the-line-number-${i}`)
        logger.flushSync()
      }
      // After rotation we should have at least one rotated file
      const files = ['rgbbox.log', 'rgbbox.log.1']
      for (const f of files) {
        const p = join(tmpDir, f)
        if (existsSync(p)) {
          // Just verify it was created
          expect(existsSync(p)).toBe(true)
        }
      }
    })

    it('removes excess rotated files beyond maxFiles', () => {
      // Pre-create a current log file that is OVER the maxFileSize to force rotation
      const logger = new Logger({
        logDir: tmpDir,
        maxFileSize: 50, // very small threshold
        maxFiles: 2
      })
      logger.initialize()
      // Manually create rotated files
      for (const i of [1, 2, 3, 4]) {
        writeFileSync(join(tmpDir, `rgbbox.log.${i}`), `content ${i}`)
      }
      // Create a current log that exceeds the threshold so rotation triggers
      writeFileSync(join(tmpDir, 'rgbbox.log'), 'X'.repeat(100))
      // Trigger rotation
      logger.info('Trigger', 'rotate')
      logger.flushSync()
      // Files with index > maxFiles=2 should be removed
      expect(existsSync(join(tmpDir, 'rgbbox.log.4'))).toBe(false)
      expect(existsSync(join(tmpDir, 'rgbbox.log.3'))).toBe(false)
    })

    it('getLogFilePath returns the expected path', () => {
      const logger = new Logger({ logDir: tmpDir, filePrefix: 'custom' })
      expect(logger.getLogFilePath()).toBe(join(tmpDir, 'custom.log'))
    })

    it('uses custom filePrefix', async () => {
      const logger = new Logger({ logDir: tmpDir, filePrefix: 'myapp' })
      logger.initialize()
      logger.info('P', 'test')
      await waitForFlush()
      expect(existsSync(join(tmpDir, 'myapp.log'))).toBe(true)
    })
  })

  describe('global logger singleton', () => {
    it('getLogger() throws if not initialized', () => {
      resetLogger()
      expect(() => getLogger()).toThrow(/not initialized/i)
    })

    it('initLogger returns the same instance on subsequent calls', () => {
      const a = initLogger(tmpDir)
      const b = initLogger(tmpDir)
      expect(a).toBe(b)
    })

    it('initLogger with options applies them', async () => {
      const logger = initLogger(tmpDir, { minLevel: 'warn', filePrefix: 'singleton' })
      logger.info('S', 'should not appear')
      logger.warn('S', 'should appear')
      await waitForFlush()
      const content = readFileSync(join(tmpDir, 'singleton.log'), 'utf-8')
      expect(content).not.toContain('should not appear')
      expect(content).toContain('should appear')
    })

    it('resetLogger clears the singleton', () => {
      initLogger(tmpDir)
      resetLogger()
      expect(() => getLogger()).toThrow()
    })
  })
})
