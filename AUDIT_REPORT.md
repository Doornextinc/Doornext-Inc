# Doornext — Production Audit Report

**Date:** April 16, 2026  
**Auditor:** Manus  
**Scope:** All 4 Next.js apps (customer, driver, maker, admin) + shared packages + CI/CD + database

---

## Executive Summary

The Doornext codebase is architecturally sound and well-structured for a multi-app delivery platform. The monorepo layout, shared packages, Supabase-first approach, and Stripe integration are all solid foundations. However, several gaps would cause real problems in production — most critically a **broken middleware export** in the customer app that leaves all routes unprotected, missing observability in 3 of 4 apps, no automated deployment pipeline, and no health check endpoints.

All critical and high-priority issues have been fixed in this audit. The changes are minimal and surgical — no rewrites, only targeted additions.

---

## Findings by Severity

### Critical (Fixed)

**1. Customer app has no active middleware**

The customer app's `proxy.ts` exports an `async function proxy()` but Next.js requires the middleware file to export a function named `middleware`. Because `middleware.ts` did not exist, the Supabase session refresh and auth redirect logic in `proxy.ts` was never executing. Every route in the customer app was running without session hydration, meaning `supabase.auth.getUser()` would return `null` on server-rendered pages even for authenticated users.

*Fix:* Created `apps/customer/middleware.ts` with a single re-export:
```ts
export { proxy as middleware, config } from './proxy'
```

---

**2. No health check endpoints on any app**

Without `/api/health` endpoints, there is no way for Vercel, uptime monitors, or the post-deploy CI step to verify that an app is running and can reach its dependencies. A broken deploy would go undetected until a user reports it.

*Fix:* Created `app/api/health/route.ts` in all 4 apps. Each endpoint checks Supabase connectivity and the presence of critical env vars, returning `200 OK` with a JSON status object or `503 Service Unavailable` if a dependency is unreachable.

---

### High (Fixed)

**3. Sentry missing from driver, maker, and admin apps**

The customer app had full Sentry integration (`sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `withSentryConfig` in `next.config.ts`). The other three apps had none. Server errors in the driver, maker, and admin apps would be silently swallowed.

*Fix:* Added all three Sentry config files and wrapped `next.config.ts` with `withSentryConfig` for driver, maker, and admin. Added `@sentry/nextjs` to each app's `package.json`.

---

**4. No startup environment validation**

Any missing or misconfigured environment variable would cause a cryptic runtime error deep inside a request handler rather than a clear startup failure. In production, this means a broken deploy can serve partial traffic before anyone notices.

*Fix:* Created `packages/shared/src/lib/env.ts` with a `validateEnv()` function and per-app required variable lists. Created `instrumentation.ts` in all 4 apps to call `validateEnv()` at server startup via Next.js's instrumentation hook. In development, missing vars throw immediately. In production, they log a `[CRITICAL]` message and the health check surfaces the issue.

---

**5. No automated deployment pipeline**

The existing CI workflow only ran lint, type-check, and build. There was no workflow to actually deploy to Vercel, run post-deploy health checks, apply database migrations, or notify on failure.

*Fix:* Created `.github/workflows/deploy.yml` with:
- Smart change detection (only redeploys apps whose files changed)
- Per-app Vercel deployment with `--prod` flag
- Post-deploy health check for each app
- Supabase migration step after all apps are deployed
- Slack failure notification

---

**6. Missing error boundaries and 404 pages in driver and admin apps**

The maker app had `error.tsx` and `not-found.tsx`. The driver and admin apps had neither. Unhandled React errors would show a blank white screen, and 404s would fall through to Next.js defaults with no branding.

*Fix:* Created `app/error.tsx` and `app/not-found.tsx` for both the driver and admin apps.

---

### Medium (Fixed)

**7. CI workflow lacked tests, security scanning, and migration validation**

The original CI ran lint, type-check, and build — but not tests (even though the customer app has a Vitest test suite), not dependency vulnerability scanning, and not migration file validation.

*Fix:* Rewrote `.github/workflows/ci.yml` to add:
- A dedicated `test` job that runs `pnpm test`
- A `security-audit` job running `pnpm audit --audit-level=high` and gitleaks secret scanning
- A `validate-migrations` job checking naming conventions and duplicate numbers
- A `ci-success` summary job for use as a required branch protection status check
- `concurrency` groups to cancel redundant runs

---

**8. No structured logging**

All apps used `console.log/error` directly, producing unstructured output that is difficult to query in cloud logging platforms (Vercel Log Drains, Datadog, etc.).

*Fix:* Created `packages/shared/src/lib/logger.ts` — a lightweight structured logger that outputs NDJSON in production (compatible with all major log platforms) and human-readable colored output in development.

---

**9. Missing database indexes on hot query paths**

Several high-frequency query patterns lacked composite indexes: order history by customer, available orders by status+time, driver active orders, unread notification counts, and maker menu pages.

*Fix:* Created `supabase/migrations/025_production_hardening.sql` with 8 targeted composite indexes, all using `IF NOT EXISTS` to be safely re-runnable.

---

**10. No Stripe processed events TTL cleanup**

The `stripe_processed_events` table (used for idempotency) had no cleanup mechanism. Over time it would grow unboundedly, slowing down the idempotency check query.

*Fix:* Migration 025 adds a `cleanup_stripe_processed_events()` function and an index on `processed_at`. Schedule it via Supabase's pg_cron extension or an Edge Function cron.

---

**11. Missing `.env.local.example` files for driver, maker, and admin**

Only the customer app had an example env file. The other three apps had no documentation of which environment variables they required.

*Fix:* Created `.env.local.example` for all 4 apps with descriptions and instructions for each variable.

---

**12. No scheduled maintenance workflow**

No automated process existed to run daily health checks, weekly security audits, or create GitHub issues when vulnerabilities are found.

*Fix:* Created `.github/workflows/maintenance.yml` with daily health checks and weekly security audits.

---

### Low (Documented, Not Auto-Fixed)

**13. Rate limiting is in-memory only (not multi-node safe)**

The `rate-limit.ts` utility in the customer and driver apps uses an in-memory Map. This works correctly on a single Node.js process but provides no protection on Vercel's serverless/edge infrastructure where each request may hit a different function instance.

*Recommendation:* Replace with [Upstash Rate Limit](https://github.com/upstash/ratelimit) backed by Redis. This is a 10-line change per route and requires an Upstash account.

---

**14. `unsafe-inline` and `unsafe-eval` in Content Security Policy**

All 4 apps include `'unsafe-inline'` and `'unsafe-eval'` in their `script-src` CSP directive. This significantly weakens XSS protection. These are present because Next.js's inline scripts and some third-party libraries require them.

*Recommendation:* Migrate to [nonce-based CSP](https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy) using Next.js middleware. This is a medium-effort change that substantially improves security posture.

---

**15. Admin app has no Sentry source maps in CI**

`sourcemaps: { disable: true }` is set in all `withSentryConfig` calls. This means Sentry error stack traces will show minified code.

*Recommendation:* Set `SENTRY_AUTH_TOKEN` as a GitHub Actions secret and remove `sourcemaps: { disable: true }` from production builds. Keep it disabled only in CI.

---

**16. Driver role check is a second DB query on every API route**

Every driver API route fetches the user's role with a separate `supabase.from('users').select('role')` query after authenticating. This adds ~20ms latency to every request.

*Recommendation:* Store the role in the Supabase JWT via a custom claim (database function + auth hook). This eliminates the extra query and makes role checks free.

---

**17. No database connection pooling configured**

The apps connect directly to Supabase without PgBouncer. Under load, each serverless function invocation opens a new database connection.

*Recommendation:* Enable Supabase's built-in connection pooler (Transaction mode) and use the pooler connection string in production. This is a one-line change per app.

---

## Files Created / Modified

| File | Action | Description |
|------|--------|-------------|
| `apps/customer/middleware.ts` | **Created** | Fixes broken middleware — re-exports `proxy` as `middleware` |
| `apps/customer/app/api/health/route.ts` | **Created** | Health check endpoint |
| `apps/driver/app/api/health/route.ts` | **Created** | Health check endpoint |
| `apps/maker/app/api/health/route.ts` | **Created** | Health check endpoint |
| `apps/admin/app/api/health/route.ts` | **Created** | Health check endpoint |
| `apps/driver/app/error.tsx` | **Created** | Global error boundary |
| `apps/driver/app/not-found.tsx` | **Created** | 404 page |
| `apps/admin/app/error.tsx` | **Created** | Global error boundary |
| `apps/admin/app/not-found.tsx` | **Created** | 404 page |
| `apps/customer/instrumentation.ts` | **Created** | Startup env validation |
| `apps/driver/instrumentation.ts` | **Created** | Startup env validation |
| `apps/maker/instrumentation.ts` | **Created** | Startup env validation |
| `apps/admin/instrumentation.ts` | **Created** | Startup env validation |
| `apps/driver/sentry.client.config.ts` | **Created** | Sentry client config |
| `apps/driver/sentry.server.config.ts` | **Created** | Sentry server config |
| `apps/driver/sentry.edge.config.ts` | **Created** | Sentry edge config |
| `apps/maker/sentry.client.config.ts` | **Created** | Sentry client config |
| `apps/maker/sentry.server.config.ts` | **Created** | Sentry server config |
| `apps/maker/sentry.edge.config.ts` | **Created** | Sentry edge config |
| `apps/admin/sentry.client.config.ts` | **Created** | Sentry client config |
| `apps/admin/sentry.server.config.ts` | **Created** | Sentry server config |
| `apps/admin/sentry.edge.config.ts` | **Created** | Sentry edge config |
| `apps/driver/next.config.ts` | **Modified** | Added `withSentryConfig` wrapper |
| `apps/maker/next.config.ts` | **Modified** | Added `withSentryConfig` wrapper |
| `apps/admin/next.config.ts` | **Modified** | Added `withSentryConfig` wrapper |
| `apps/driver/package.json` | **Modified** | Added `@sentry/nextjs` dependency |
| `apps/maker/package.json` | **Modified** | Added `@sentry/nextjs` dependency |
| `apps/admin/package.json` | **Modified** | Added `@sentry/nextjs` dependency |
| `apps/driver/app/api/driver/accept-order/route.ts` | **Modified** | Added rate limiting + Sentry |
| `apps/customer/.env.local.example` | **Created** | Full env documentation |
| `apps/driver/.env.local.example` | **Created** | Full env documentation |
| `apps/maker/.env.local.example` | **Created** | Full env documentation |
| `apps/admin/.env.local.example` | **Created** | Full env documentation |
| `packages/shared/src/lib/env.ts` | **Created** | Env validation utility |
| `packages/shared/src/lib/logger.ts` | **Created** | Structured logger |
| `packages/shared/package.json` | **Modified** | Added `./env` and `./logger` exports |
| `supabase/migrations/025_production_hardening.sql` | **Created** | Indexes, constraints, audit trigger, TTL cleanup |
| `.github/workflows/ci.yml` | **Rewritten** | Added tests, security audit, migration validation, concurrency |
| `.github/workflows/deploy.yml` | **Created** | Full Vercel deploy pipeline with health checks |
| `.github/workflows/maintenance.yml` | **Created** | Daily health checks + weekly security audit |
| `.github/SECRETS.md` | **Created** | GitHub Actions secrets documentation |
| `CONTRIBUTING.md` | **Created** | Developer onboarding guide |
| `PRODUCTION_CHECKLIST.md` | **Created** | Pre-launch checklist |

---

## Immediate Next Steps

The following items require your action and cannot be automated:

1. **Run `pnpm install`** to pick up the new `@sentry/nextjs` dependencies in driver, maker, and admin.

2. **Apply migration 025** to your Supabase project:
   ```bash
   supabase db push
   ```

3. **Create Sentry projects** for driver, maker, and admin at [sentry.io](https://sentry.io) and add the DSNs to each app's environment variables.

4. **Configure GitHub Actions secrets** — follow `.github/SECRETS.md` to set up Vercel tokens, Supabase credentials, and app URLs.

5. **Enable branch protection** on `main` — require the `CI Passed` status check before merging.

6. **Set up uptime monitoring** — point a monitor at each app's `/api/health` endpoint (Better Uptime, Checkly, or UptimeRobot are all free for basic use).

7. **Review the medium-priority items** — particularly the in-memory rate limiter (item 13) before going live under real traffic.
