/**
 * In-memory rate limiter (per-process).
 *
 * NOTE: This is suitable for single-instance / development use only.
 * For multi-node / serverless deployments replace with a Redis/Upstash
 * backed implementation using @upstash/ratelimit or ioredis.
 *
 * TTL cleanup runs automatically to prevent unbounded memory growth.
 */

const store = new Map<string, { count: number; resetAt: number }>()

// Evict all expired entries. Called periodically to bound memory usage.
function evictExpired() {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (now >= entry.resetAt) store.delete(key)
  }
}

// Schedule cleanup every 5 minutes.
let cleanupTimer: ReturnType<typeof setInterval> | null = null
function ensureCleanupScheduled() {
  if (!cleanupTimer) {
    cleanupTimer = setInterval(evictExpired, 5 * 60 * 1000)
    // Allow the process to exit even if the timer is active.
    if (cleanupTimer.unref) cleanupTimer.unref()
  }
}

/**
 * Returns true (allowed) or false (rate-limited).
 * @param key       Unique key, e.g. `checkout:${ip}`
 * @param limit     Max requests allowed in the window
 * @param windowSec Window size in seconds
 */
export function checkRateLimit(key: string, limit: number, windowSec: number): boolean {
  ensureCleanupScheduled()
  const now = Date.now()
  const entry = store.get(key)
  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowSec * 1000 })
    return true
  }
  if (entry.count >= limit) return false
  entry.count++
  return true
}
