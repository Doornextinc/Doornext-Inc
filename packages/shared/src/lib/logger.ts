/**
 * Structured logger for Doornext apps.
 *
 * In production, outputs newline-delimited JSON (NDJSON) compatible with
 * Vercel Log Drains, Datadog, and most cloud logging platforms.
 * In development, outputs human-readable colored text.
 *
 * Usage:
 *   import { logger } from '@doornext/shared/logger'
 *   logger.info('checkout', 'Order created', { orderId, userId })
 *   logger.error('webhook', 'Stripe signature invalid', { error: e.message })
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  scope: string
  message: string
  timestamp: string
  [key: string]: unknown
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const MIN_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel | undefined) ??
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug')

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL]
}

function emit(level: LogLevel, scope: string, message: string, meta?: Record<string, unknown>) {
  if (!shouldLog(level)) return

  const entry: LogEntry = {
    level,
    scope,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  }

  if (process.env.NODE_ENV === 'production') {
    // NDJSON — one JSON object per line
    const output = JSON.stringify(entry)
    if (level === 'error' || level === 'warn') {
      process.stderr.write(output + '\n')
    } else {
      process.stdout.write(output + '\n')
    }
  } else {
    // Human-readable dev output
    const COLORS: Record<LogLevel, string> = {
      debug: '\x1b[36m', // cyan
      info: '\x1b[32m',  // green
      warn: '\x1b[33m',  // yellow
      error: '\x1b[31m', // red
    }
    const RESET = '\x1b[0m'
    const color = COLORS[level]
    const prefix = `${color}[${level.toUpperCase()}]${RESET} [${scope}]`
    const metaStr = meta ? ' ' + JSON.stringify(meta) : ''
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
    fn(`${prefix} ${message}${metaStr}`)
  }
}

export const logger = {
  debug: (scope: string, message: string, meta?: Record<string, unknown>) =>
    emit('debug', scope, message, meta),
  info: (scope: string, message: string, meta?: Record<string, unknown>) =>
    emit('info', scope, message, meta),
  warn: (scope: string, message: string, meta?: Record<string, unknown>) =>
    emit('warn', scope, message, meta),
  error: (scope: string, message: string, meta?: Record<string, unknown>) =>
    emit('error', scope, message, meta),
}
