# Production Deployment Checklist

Work through this checklist before going live. Check each item off as you complete it.

---

## 1. Infrastructure

- [ ] Supabase project created on **Pro plan** (required for daily backups and no pausing)
- [ ] Supabase database password is strong and stored in a password manager
- [ ] Supabase Auth email templates customised (confirmation, password reset)
- [ ] Supabase Auth rate limits reviewed (Settings → Auth → Rate Limits)
- [ ] Supabase Point-in-Time Recovery (PITR) enabled (Pro plan)
- [ ] Vercel projects created for all 4 apps (customer, driver, maker, admin)
- [ ] Custom domains configured in Vercel for each app
- [ ] Vercel environment variables set for all apps (see `.env.local.example` in each app)

## 2. Secrets & Keys

- [ ] All Stripe keys switched from `sk_test_` / `pk_test_` to `sk_live_` / `pk_live_`
- [ ] Stripe webhook endpoint registered for production URL (`/api/webhooks/stripe`)
- [ ] Stripe webhook secret (`STRIPE_WEBHOOK_SECRET`) updated with production value
- [ ] Firebase project configured for production (not test/dev project)
- [ ] `INTERNAL_WEBHOOK_SECRET` set to a strong random value (`openssl rand -hex 32`)
- [ ] All secrets added to GitHub Actions (see `.github/SECRETS.md`)
- [ ] No `.env.local` files committed to git (verify with `git status`)

## 3. Database

- [ ] All migrations applied to production Supabase (`supabase db push`)
- [ ] Migration 025 (production hardening) applied and verified
- [ ] RLS policies verified — test with a non-admin user that they cannot access other users' data
- [ ] Indexes verified with `EXPLAIN ANALYZE` on critical queries
- [ ] `cleanup_stripe_processed_events()` scheduled (pg_cron or Edge Function)
- [ ] Database backups tested (restore a backup to a staging project)

## 4. Authentication

- [ ] Supabase Auth redirect URLs include production domains
- [ ] Auth email templates use production app URLs
- [ ] Admin app restricted to admin-role users only (verify `requireAdmin` middleware)
- [ ] Driver/Maker onboarding flows tested end-to-end in production

## 5. Payments

- [ ] Stripe live mode enabled
- [ ] Test a real payment end-to-end (small amount)
- [ ] Stripe webhook events verified in Stripe Dashboard (Events tab)
- [ ] Stripe radar rules reviewed for fraud prevention
- [ ] Payout schedule configured for drivers/makers

## 6. Monitoring & Observability

- [ ] Sentry projects created for all 4 apps
- [ ] `NEXT_PUBLIC_SENTRY_DSN` set for each app
- [ ] Sentry alerts configured (error rate, new issues)
- [ ] Vercel Analytics enabled (or alternative)
- [ ] Health check endpoints verified: `/api/health` returns 200 on all 4 apps
- [ ] Uptime monitoring configured (e.g., Better Uptime, Checkly, or UptimeRobot) for all 4 `/api/health` endpoints

## 7. CI/CD

- [ ] GitHub branch protection enabled on `main` (require `CI Passed` status check)
- [ ] All GitHub Actions secrets configured (see `.github/SECRETS.md`)
- [ ] Deploy workflow tested with a manual trigger (`workflow_dispatch`)
- [ ] Post-deploy health checks passing in deploy workflow

## 8. Performance

- [ ] Next.js Image Optimization configured (remote patterns include Supabase domains)
- [ ] Vercel Edge Network CDN caching verified for static assets
- [ ] Supabase connection pooling enabled (PgBouncer — Transaction mode)
- [ ] Large images compressed and served from Supabase Storage with CDN

## 9. Security

- [ ] Security headers verified with [securityheaders.com](https://securityheaders.com)
- [ ] CSP headers not blocking any required resources (check browser console)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` never exposed to the client (search codebase for any `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`)
- [ ] Rate limiting active on all mutation API routes
- [ ] Stripe webhook signature verification active (not bypassed)
- [ ] Admin app not publicly indexed (add `X-Robots-Tag: noindex` or robots.txt)

## 10. Push Notifications

- [ ] Firebase Cloud Messaging (FCM) configured for production
- [ ] VAPID key set for web push
- [ ] Push notification delivery tested on real devices (iOS + Android via Median.co)
- [ ] OneSignal / Median push registration tested

## 11. Legal & Compliance

- [ ] Privacy Policy published and linked in all apps
- [ ] Terms of Service published and linked
- [ ] Cookie consent banner (if required by jurisdiction)
- [ ] GDPR/CCPA data deletion flow implemented (or documented)

## 12. Go-Live

- [ ] Smoke test all critical flows in production:
  - [ ] Customer: sign up → browse → add to cart → checkout → track order
  - [ ] Maker: receive order → accept → mark ready
  - [ ] Driver: see available order → accept → pick up → deliver
  - [ ] Admin: view dashboard → view orders → refund test order
- [ ] DNS propagated for all custom domains
- [ ] SSL certificates active (green padlock) on all domains
- [ ] Announce launch 🎉
