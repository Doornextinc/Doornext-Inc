# Doornext Production Runbook

> **Purpose.** This document enables an operator to identify, investigate, and escalate common production failures without reading source code. Keep it up to date with every infrastructure change.

---

## Table of Contents

1. [Deployment Procedure and Rollback](#1-deployment-procedure-and-rollback)
2. [Verifying App Health](#2-verifying-app-health)
3. [Stale Driver Assignment Recovery](#3-stale-driver-assignment-recovery)
4. [Handling Stuck Orders by Status](#4-handling-stuck-orders-by-status)
5. [Stripe Webhooks and Refund Status](#5-stripe-webhooks-and-refund-status)
6. [Failed Deliveries](#6-failed-deliveries)
7. [Notifications — Delivery and Retry Failures](#7-notifications--delivery-and-retry-failures)
8. [Required Production Environment Variables](#8-required-production-environment-variables)
9. [Incident Severity and Escalation](#9-incident-severity-and-escalation)
10. [Post-Incident Checklist](#10-post-incident-checklist)

---

## 1. Deployment Procedure and Rollback

### Normal deployment (push to `main`)

The `deploy.yml` workflow runs automatically on every push to `main`:

1. **Migrate** — Additive SQL migrations run first (`supabase db push`). Apps are never deployed before the schema they depend on.
2. **Deploy apps** — Customer, driver, maker, and admin apps deploy in parallel to Vercel.
3. **Health + readiness checks** — Each app is probed at `/api/health` (liveness) and `/api/readiness` (dependency probe). Failure blocks the deploy and triggers a Slack alert.

### Manual deployment (specific app)

```
GitHub → Actions → Deploy → Run workflow
App to deploy: customer | driver | maker | admin | all
```

### Rollback procedure

1. Find the last good commit SHA in GitHub Actions → Deploy.
2. Run `git revert <sha>` locally and push to `main`, **or**
3. Go to Vercel dashboard → project → Deployments → select previous deployment → **Promote to Production**.
4. If the bad commit included a migration, assess whether a reverse migration is safe. Contact the DBA before running destructive SQL.

### Destructive (contract) migrations

Never deploy automatically. Apply via:
```bash
supabase db push --db-url "$SUPABASE_DB_URL" --include-all
```
Only after confirming all apps no longer reference the dropped column/table.

---

## 2. Verifying App Health

### Quick liveness check (any app)

```bash
curl -s https://<APP_URL>/api/health | jq .
```
Expected: `{ "status": "ok", "checks": { "supabase": "ok", ... } }`

### Deep readiness check (requires internal secret)

```bash
curl -s -H "Authorization: Bearer $INTERNAL_WEBHOOK_SECRET" \
  https://<APP_URL>/api/readiness | jq .
```
Expected: `{ "status": "ready", "critical_failed": [] }`

| App | URL env var |
|-----|-------------|
| Customer | `CUSTOMER_APP_URL` |
| Driver   | `DRIVER_APP_URL`   |
| Maker    | `MAKER_APP_URL`    |
| Admin    | `ADMIN_APP_URL`    |

### What each check means

| Check | What it verifies |
|-------|-----------------|
| `supabase` | Real DB query + critical RPC availability |
| `stripe` | Live Stripe API call (list 1 customer) |
| `firebase` | Firebase Admin SDK initialised |
| `stream` | Stream Chat env vars present |
| `stale_assignment_rpc` | `release_stale_driver_assignments()` RPC exists |
| `cron_secret` | `CRON_SECRET` is set (cron auth will fail otherwise) |
| `notify_push` | `NOTIFY_PUSH_BASE_URL` is set (push will silently skip if not) |

---

## 3. Stale Driver Assignment Recovery

### What it does

Every minute, Vercel Cron calls `POST /api/cron/release-stale-assignments` on the admin app. It runs the `release_stale_driver_assignments()` Postgres function which:

- Finds orders in `driver_assigned`, `arrived_at_maker`, `picked_up`, or `on_the_way` where the driver's `last_seen_at` is older than `stale_driver_grace_seconds` (default: 90 s).
- Resets those orders to `ready` so they can be re-assigned.
- Notifies affected customers: "Finding you a new driver".
- Records a `driver_reliability_events` row for each release.

### Verifying cron is running

1. Go to Vercel Dashboard → Admin project → Cron Jobs.
2. Confirm `release-stale-assignments` shows last run < 2 minutes ago.
3. Check Sentry for `Released N stale driver assignment(s)` messages (expected when drivers go offline).

### Manually triggering (emergency)

```bash
curl -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://<ADMIN_APP_URL>/api/cron/release-stale-assignments | jq .
```
Expected: `{ "released": [...], "count": N }`

### Adjusting grace period

```sql
-- Increase to 2 minutes if GPS heartbeat is unreliable in your market
UPDATE public.settings SET value = '120' WHERE key = 'stale_driver_grace_seconds';
```

### Driver reliability history

```sql
-- Which drivers have gone stale most often this week?
SELECT driver_id, COUNT(*) AS stale_count
FROM driver_reliability_events
WHERE triggered_at > now() - INTERVAL '7 days'
GROUP BY driver_id
ORDER BY stale_count DESC
LIMIT 20;
```

---

## 4. Handling Stuck Orders by Status

### Decision tree

```
Order stuck?
├── awaiting_payment  → Payment not confirmed. Check Stripe PaymentIntent status.
│                       If succeeded, webhook may have missed — manually confirm via admin.
├── confirmed         → Maker hasn't accepted. Contact maker. If unreachable, cancel + refund.
├── preparing         → Maker is cooking. Normal state. Escalate only if > 2 hours.
├── ready             → No driver picked up. Check driver availability. May need manual dispatch.
├── driver_assigned   → Driver accepted but hasn't moved. Stale recovery should handle this.
│                       If grace period hasn't expired, wait. If urgent, manually release.
├── arrived_at_maker  → Driver at maker but not picking up. Call driver.
├── picked_up         → Driver picked up but no updates. Call driver.
├── on_the_way        → En route. Normal state. Stale recovery covers offline driver.
└── arrived_at_customer → Driver arrived but can't deliver. May need failed-delivery action.
```

### Manually releasing a stuck order

```bash
# Release a single stuck order back to 'ready' (bypasses stale timer)
curl -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://<ADMIN_APP_URL>/api/cron/release-stale-assignments | jq .
```

For a specific order (emergency — run in Supabase SQL editor):
```sql
UPDATE public.orders
SET status = 'ready', nexter_id = NULL, pickup_pin = NULL, pin_attempts = 0, updated_at = now()
WHERE id = '<order_id>'
  AND status IN ('driver_assigned', 'arrived_at_maker', 'picked_up', 'on_the_way');
```

### Orders stuck in `awaiting_payment`

Check Stripe Dashboard → Payments → search PaymentIntent ID. If succeeded, the webhook may have failed to write the status update. Check:

1. Sentry for `Failed to confirm order <id>` warning (webhook returned 200 but DB update failed).
2. If confirmed payment in Stripe, manually confirm the order:
   ```sql
   UPDATE public.orders SET status = 'confirmed', updated_at = now()
   WHERE id = '<order_id>' AND status = 'awaiting_payment';
   ```

---

## 5. Stripe Webhooks and Refund Status

### Verifying webhook health

1. Stripe Dashboard → Developers → Webhooks → select endpoint.
2. Check recent events: all should show `200` responses.
3. Failed events can be manually retried from the Stripe dashboard.

### Idempotency

Every webhook event is deduplicated via `stripe_processed_events.event_id` (unique constraint). Retried events are safely no-ops.

### Checking refund status for an order

```sql
SELECT id, status, payment_method, stripe_payment_intent_id,
       stripe_refund_id, refund_status, refund_requested_at,
       refund_completed_at, refund_failure_reason
FROM public.orders
WHERE id = '<order_id>';
```

| `refund_status` | Meaning |
|-----------------|---------|
| `NULL` | No refund action taken |
| `pending` | Refund initiated, Stripe not yet confirmed |
| `completed` | Stripe confirmed refund (3–5 business days to customer) |
| `failed` | Stripe rejected refund — see `refund_failure_reason` |
| `not_required` | Cash order or voided PaymentIntent (no charge captured) |

### Reconciliation cron

Runs every 5 minutes. Finds orders with `refund_status = 'pending'` older than 30 minutes and syncs them against Stripe. Also recovers missed write-backs on cancelled card orders.

Check reconciliation results:
```bash
curl -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://<ADMIN_APP_URL>/api/cron/reconcile-payments | jq .
```

### Finding orders with failed refunds (admin priority queue)

```sql
SELECT id, status, total, refund_failure_reason, updated_at
FROM public.orders
WHERE refund_status = 'failed'
ORDER BY updated_at DESC;
```

---

## 6. Failed Deliveries

### What triggers a failed delivery

A driver reports a failed delivery from the driver app when they are in `on_the_way` or `arrived_at_customer` status. The system:

1. Sets order status to `failed_delivery`.
2. Zeroes driver and maker payouts (`driver_payout = 0`, `maker_payout = 0`).
3. Issues a full Stripe refund to the customer.
4. Notifies customer, driver, and admin.
5. Creates a support ticket in the `support_tickets` table.

### Operator actions for failed deliveries

1. Check `support_tickets` table for the order.
2. Verify Stripe refund was issued (`refund_status = 'completed'`).
3. Contact customer if refund is pending > 30 minutes (reconciliation cron will catch this).
4. Review `driver_reliability_events` for the driver to assess pattern.

```sql
-- Recent failed deliveries
SELECT o.id, o.total, o.failed_delivery_reason, o.refund_status, o.updated_at,
       dp.full_name AS driver_name
FROM public.orders o
LEFT JOIN public.driver_profiles dp ON dp.id = o.nexter_id
WHERE o.status = 'failed_delivery'
ORDER BY o.updated_at DESC
LIMIT 20;
```

---

## 7. Notifications — Delivery and Retry Failures

### Notification outbox

Critical push notifications (new order, payment failed, driver assigned, etc.) are written to `notification_outbox` before delivery is attempted. The `process-notification-outbox` cron runs every minute.

### Checking outbox health

```sql
-- Breakdown by status
SELECT status, COUNT(*) FROM public.notification_outbox GROUP BY status;

-- Dead-letter entries (failed after max retries)
SELECT id, user_id, title, body, retry_count, last_error, created_at
FROM public.notification_outbox
WHERE status = 'dead'
ORDER BY created_at DESC
LIMIT 20;
```

### Manually retrying dead-letter notifications

```sql
-- Reset dead notifications to pending for another attempt
UPDATE public.notification_outbox
SET status = 'pending', next_attempt_at = now(), retry_count = 0
WHERE status = 'dead'
  AND created_at > now() - INTERVAL '24 hours';
```

### Common causes of notification failure

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| All pushes failing | `NOTIFY_PUSH_BASE_URL` wrong or customer app down | Check readiness, verify env var |
| One user not receiving pushes | User's FCM token stale/revoked | User must re-register in app |
| Dead-letter entries accumulating | FCM quota exceeded or Firebase misconfigured | Check Firebase console |

---

## 8. Required Production Environment Variables

Set in Vercel for each app environment. Never commit real values to the repository.

### All apps

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (secret) |
| `INTERNAL_WEBHOOK_SECRET` | Shared secret for cross-app calls + readiness probes |
| `NOTIFY_PUSH_BASE_URL` | Customer app base URL (e.g. `https://app.doornext.com`) |

### Customer app only

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `NEXT_PUBLIC_APP_URL` | Customer app public URL (for password reset links) |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account email |
| `FIREBASE_PRIVATE_KEY` | Firebase service account private key |
| `STREAM_API_SECRET` | Stream Chat API secret |
| `NEXT_PUBLIC_STREAM_API_KEY` | Stream Chat API key (public) |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL (required in production for rate limiting) |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token |

### Admin app only

| Variable | Description |
|----------|-------------|
| `CRON_SECRET` | Shared secret for all cron endpoints |
| `STRIPE_SECRET_KEY` | Stripe secret key (for admin refunds) |
| `SENTRY_DSN` | Sentry DSN for error capture |

### GitHub Actions secrets (deploy workflow)

| Secret | Description |
|--------|-------------|
| `VERCEL_TOKEN` | Vercel API token |
| `VERCEL_ORG_ID` | Vercel org ID |
| `VERCEL_PROJECT_ID_CUSTOMER/DRIVER/MAKER/ADMIN` | Per-app Vercel project IDs |
| `SUPABASE_DB_URL` | Direct Postgres connection string |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI token |
| `CUSTOMER/DRIVER/MAKER/ADMIN_APP_URL` | App public URLs for health checks |
| `INTERNAL_WEBHOOK_SECRET` | For readiness probe Authorization header |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook for deploy alerts |

---

## 9. Incident Severity and Escalation

### Severity levels

| Severity | Definition | Response time |
|----------|-----------|---------------|
| **P0 — Critical** | Active orders stuck, payments failing, customer app down | Immediate (< 15 min) |
| **P1 — High** | Notifications not delivering, driver app degraded, refunds stuck | < 1 hour |
| **P2 — Medium** | Cron job failing, non-critical feature broken | < 4 hours (business hours) |
| **P3 — Low** | Cosmetic issues, slow non-critical queries | Next sprint |

### P0 response procedure

1. Check Sentry for the exception trail.
2. Run health + readiness checks on all apps (Section 2).
3. Check Stripe webhook health (Section 5).
4. Check for stuck orders (Section 4).
5. If deploy-related, initiate rollback (Section 1).
6. Escalate to on-call engineer if not resolved in 15 min.

### Escalation contacts

| Role | Contact |
|------|---------|
| On-call engineer | *(add contact)* |
| DBA / Supabase | *(add contact)* |
| Stripe support | [dashboard.stripe.com/support](https://dashboard.stripe.com/support) |
| Firebase support | [console.firebase.google.com](https://console.firebase.google.com) |

---

## 10. Post-Incident Checklist

After every P0 or P1 incident, complete the following before closing:

- [ ] Root cause identified and documented in incident ticket
- [ ] All stuck orders resolved (no orders in unexpected states)
- [ ] All pending refunds confirmed or escalated (Section 5)
- [ ] Dead-letter notifications reviewed and retried or escalated (Section 7)
- [ ] Driver reliability events reviewed for affected driver(s) (Section 3)
- [ ] Sentry errors resolved or acknowledged
- [ ] Affected customers notified / compensated if applicable
- [ ] Preventive fix or monitoring improvement identified
- [ ] Runbook updated if new failure mode discovered
- [ ] Post-mortem shared with team (for P0)
