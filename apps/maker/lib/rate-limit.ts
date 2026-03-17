/** Simple in-memory rate limiter (per-process). Does not persist across restarts. */
const store = new Map<string, { count: number; resetAt: number }>()

/**
 * Returns true (allowed) or false (rate-limited).
 * @param key       Unique key, e.g. `signup:${ip}`
 * @param limit     Max requests allowed in the window
 * @param windowSec Window size in seconds
 */
export function checkRateLimit(key: string, limit: number, windowSec: number): boolean {
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
