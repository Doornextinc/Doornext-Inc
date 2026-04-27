/**
 * Serverless-safe rate limiter.
 *
 * Uses Upstash Redis REST API when UPSTASH_REDIS_REST_URL +
 * UPSTASH_REDIS_REST_TOKEN are set; otherwise falls back to an
 * in-memory Map (dev / single-process only).
 */

async function upstashIncr(key: string, windowSec: number): Promise<number> {
  const url = process.env.UPSTASH_REDIS_REST_URL!
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!
  const pipeline = [
    ['INCR', key],
    ['EXPIRE', key, String(windowSec), 'NX'],
  ]
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(pipeline),
    signal: AbortSignal.timeout(2000),
  })
  if (!res.ok) throw new Error(`Upstash pipeline failed: ${res.status}`)
  const data = (await res.json()) as Array<{ result: number }>
  return data[0].result
}

const _store = new Map<string, { count: number; resetAt: number }>()
let _cleanupScheduled = false

function evictExpired() {
  const now = Date.now()
  for (const [k, e] of _store) {
    if (now >= e.resetAt) _store.delete(k)
  }
}

function inMemoryCheck(key: string, limit: number, windowSec: number): boolean {
  if (!_cleanupScheduled) {
    _cleanupScheduled = true
    const t = setInterval(evictExpired, 5 * 60 * 1000)
    if (t.unref) t.unref()
  }
  const now = Date.now()
  const entry = _store.get(key)
  if (!entry || now >= entry.resetAt) {
    _store.set(key, { count: 1, resetAt: now + windowSec * 1000 })
    return true
  }
  if (entry.count >= limit) return false
  entry.count++
  return true
}

const _hasUpstash =
  typeof process !== 'undefined' &&
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN

if (!_hasUpstash && process.env.NODE_ENV === 'production') {
  console.warn(
    '[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set. ' +
    'Using in-memory fallback — rate limiting is NOT effective across serverless isolates.'
  )
}

export async function checkRateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  if (_hasUpstash) {
    try {
      const count = await upstashIncr(key, windowSec)
      return count <= limit
    } catch (err) {
      console.error('[rate-limit] Upstash error, falling back to in-memory:', err)
    }
  }
  return inMemoryCheck(key, limit, windowSec)
}
