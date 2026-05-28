import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Logger, initLogger, getLogger, resetLogger } from '../src/shared/logger'

const TEST_LOG_DIR = join('/tmp', 'rgbbox-test-logs-' + process.pid)

function readLogFile(dir: string, fileName = 'rgbbox.log'): string {
  try {
    return readFileSync(join(dir, fileName), 'utf-8')
  } catch {
    return ''
  }
}

describe('Logger', () => {
  beforeEach(() => {
    mkdirSync(TEST_LOG_DIR, { recursive: true })
  })

  afterEach(() => {
    rmSync(TEST_LOG_DIR, { recursive: true, force: true })
    resetLogger()
  })

  describe('basic logging', () => {
    it('writes log entries to file', async () => {
      const logger = new Logger({ logDir: TEST_LOG_DIR })
      logger.initialize()
      logger.info('Test', 'Hello world')
      await logger.flush()

      const content = readLogFile(TEST_LOG_DIR)
      expect(content).toContain('[INFO ]')
      expect(content).toContain('[Test]')
      expect(content).toContain('Hello world')
    })

    it('includes ISO timestamp in log entries', async () => {
      const logger = new Logger({ logDir: TEST_LOG_DIR })
      logger.initialize()
      logger.info('App', 'Timestamp test')
      await logger.flush()

      const content = readLogFile(TEST_LOG_DIR)
      // ISO timestamp pattern: 2024-01-01T00:00:00.000Z
      expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z\]/)
    })

    it('logs all levels correctly', async () => {
      const logger = new Logger({ logDir: TEST_LOG_DIR, minLevel: 'debug' })
      logger.initialize()
      logger.debug('Cat', 'debug msg')
      logger.info('Cat', 'info msg')
      logger.warn('Cat', 'warn msg')
      logger.error('Cat', 'error msg')
      await logger.flush()

      const content = readLogFile(TEST_LOG_DIR)
      expect(content).toContain('[DEBUG]')
      expect(content).toContain('[INFO ]')
      expect(content).toContain('[WARN ]')
      expect(content).toContain('[ERROR]')
    })
  })

  describe('level filtering', () => {
    it('respects minimum log level', async () => {
      const logger = new Logger({ logDir: TEST_LOG_DIR, minLevel: 'warn' })
      logger.initialize()
      logger.debug('Cat', 'should not appear')
      logger.info('Cat', 'should not appear')
      logger.warn('Cat', 'warning message')
      logger.error('Cat', 'error message')
      await logger.flush()

      const content = readLogFile(TEST_LOG_DIR)
      expect(content).not.toContain('should not appear')
      expect(content).toContain('warning message')
      expect(content).toContain('error message')
    })

    it('default min level is info', async () => {
      const logger = new Logger({ logDir: TEST_LOG_DIR })
      logger.initialize()
      logger.debug('Cat', 'debug should not appear')
      logger.info('Cat', 'info should appear')
      await logger.flush()

      const content = readLogFile(TEST_LOG_DIR)
      expect(content).not.toContain('debug should not appear')
      expect(content).toContain('info should appear')
    })
  })

  describe('flushSync', () => {
    it('writes buffered entries synchronously', () => {
      const logger = new Logger({ logDir: TEST_LOG_DIR })
      logger.initialize()
      logger.info('Sync', 'sync message')
      logger.flushSync()

      const content = readLogFile(TEST_LOG_DIR)
      expect(content).toContain('sync message')
    })
  })

  describe('file rotation', () => {
    it('rotates when file exceeds max size', async () => {
      const logger = new Logger({
        logDir: TEST_LOG_DIR,
        maxFileSize: 100, // Very small for testing
        maxFiles: 3
      })
      logger.initialize()

      // Write enough data to trigger rotation
      const bigMessage = 'A'.repeat(150)
      writeFileSync(join(TEST_LOG_DIR, 'rgbbox.log'), bigMessage, 'utf-8')

      logger.info('Rotate', 'after rotation')
      await logger.flush()

      const files = readdirSync(TEST_LOG_DIR)
      expect(files).toContain('rgbbox.log.1')
      // New log file should contain the latest message
      const newContent = readLogFile(TEST_LOG_DIR)
      expect(newContent).toContain('after rotation')
    })

    it('keeps only maxFiles rotated files', async () => {
      const logger = new Logger({
        logDir: TEST_LOG_DIR,
        maxFileSize: 50,
        maxFiles: 2
      })
      logger.initialize()

      // Pre-create rotated files
      writeFileSync(join(TEST_LOG_DIR, 'rgbbox.log.1'), 'old1', 'utf-8')
      writeFileSync(join(TEST_LOG_DIR, 'rgbbox.log.2'), 'old2', 'utf-8')
      writeFileSync(join(TEST_LOG_DIR, 'rgbbox.log.3'), 'should be deleted', 'utf-8')

      // Write enough to trigger rotation
      writeFileSync(join(TEST_LOG_DIR, 'rgbbox.log'), 'X'.repeat(100), 'utf-8')
      logger.info('Test', 'trigger rotation')
      await logger.flush()

      const files = readdirSync(TEST_LOG_DIR)
      expect(files).not.toContain('rgbbox.log.3')
    })
  })

  describe('custom file prefix', () => {
    it('uses custom prefix for log file name', async () => {
      const logger = new Logger({ logDir: TEST_LOG_DIR, filePrefix: 'myapp' })
      logger.initialize()
      logger.info('Cat', 'custom prefix')
      await logger.flush()

      const files = readdirSync(TEST_LOG_DIR)
      expect(files).toContain('myapp.log')
      expect(logger.getLogFilePath()).toContain('myapp.log')
    })
  })

  describe('error resilience', () => {
    it('does not throw when log directory does not exist and initialize is not called', async () => {
      const logger = new Logger({ logDir: '/tmp/nonexistent-rgbbox-xyz-test/nested/path' })
      // Should not throw
      logger.info('Cat', 'message')
      await logger.flush()
    })
  })

  describe('singleton API', () => {
    it('initLogger creates singleton and getLogger retrieves it', () => {
      const logger = initLogger(TEST_LOG_DIR)
      expect(getLogger()).toBe(logger)
    })

    it('getLogger throws before initLogger is called', () => {
      expect(() => getLogger()).toThrow('Logger not initialized')
    })

    it('initLogger returns existing instance on second call', () => {
      const logger1 = initLogger(TEST_LOG_DIR)
      const logger2 = initLogger('/tmp/other-dir')
      expect(logger1).toBe(logger2)
    })
  })
})
