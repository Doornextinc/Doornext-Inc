// Re-export from shared package so all apps use the same implementation.
// When you upgrade to Redis/Upstash, update the shared package only.
export { checkRateLimit } from '@doornext/shared/rate-limit'
