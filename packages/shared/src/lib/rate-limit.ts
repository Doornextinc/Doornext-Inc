/**
 * Serverless-safe rate limiter.
 *
 * Strategy:
 *  1. If UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set → use
 *     Upstash Redis via its lightweight REST API (no npm package needed,
 *     works across all serverless isolates).
 *  2. Otherwise → fall back to the in-memory Map (dev / single-process only).
 *
 * To enable Redis-backed limiting:
 *   UPSTASH_REDIS_REST_URL=https://<your-id>.upstash.io
 *   UPSTASH_REDIS_REST_TOKEN=<your-token>
 *
 * Usage (unchanged from previous API):
 *   if (!await checkRateLimit(`checkout:${ip}`, 5, 60)) {
 *     return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
 *   }
 *
 * NOTE: The return type is now Promise<boolean> to support the async Redis path.
 * Callers using `if (!checkRateLimit(...))` need `await`.
 */

// ── Upstash Redis REST client (zero-dependency) ───────────────────────────────

async function upstashIncr(key: string, windowSec: number): Promise<number> {
  const url = process.env.UPSTASH_REDIS_REST_URL!
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!

  // MULTI/EXEC pipeline: INCR key + EXPIRE key windowSec (only sets expiry if new key)
  const pipeline = [
    ['INCR', key],
    ['EXPIRE', key, String(windowSec), 'NX'], // NX = only set if not already expiring
  ]

  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(pipeline),
    // 2s timeout via AbortController to prevent hanging a serverless function
    signal: AbortSignal.timeout(2000),
  })

  if (!res.ok) throw new Error(`Upstash pipeline failed: ${res.status}`)
  const data = (await res.json()) as Array<{ result: number }>
  return data[0].result // count after INCR
}

// ── In-memory fallback ────────────────────────────────────────────────────────

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

// ── Public API ────────────────────────────────────────────────────────────────

const _hasUpstash =
  typeof process !== 'undefined' &&
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN

if (!_hasUpstash && process.env.NODE_ENV === 'production') {
  throw new Error(
    '[rate-limit] UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set in production. ' +
    'In-memory rate limiting is NOT effective across serverless isolates and will not protect against abuse. ' +
    'Set these env vars to an Upstash Redis instance before deploying.'
  )
}

/**
 * Returns true (allowed) or false (rate-limited).
 * @param key       Unique key, e.g. `checkout:${ip}`
 * @param limit     Max requests allowed in the window
 * @param windowSec Window size in seconds
 */
export async function checkRateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  if (_hasUpstash) {
    try {
      const count = await upstashIncr(key, windowSec)
      return count <= limit
    } catch (err) {
      // Redis unavailable — fail open rather than blocking legitimate traffic.
      // Fall through to in-memory as degraded fallback.
      console.error('[rate-limit] Upstash error, falling back to in-memory:', err)
    }
  }
  return inMemoryCheck(key, limit, windowSec)
}
