# Contributing to Doornext

## Development Setup

### Prerequisites

- Node.js 20+
- pnpm 9+
- Supabase CLI (`brew install supabase/tap/supabase`)
- Stripe CLI (for local webhook testing)

### First-time Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Copy environment files for each app
cp apps/customer/.env.local.example apps/customer/.env.local
cp apps/driver/.env.local.example   apps/driver/.env.local
cp apps/maker/.env.local.example    apps/maker/.env.local
cp apps/admin/.env.local.example    apps/admin/.env.local

# 3. Fill in the .env.local files with your actual values

# 4. Start local Supabase
supabase start

# 5. Run migrations
supabase db push

# 6. Start all apps
pnpm dev
```

### Running Individual Apps

```bash
pnpm --filter @doornext/customer dev  # http://localhost:3000
pnpm --filter @doornext/maker dev     # http://localhost:3001
pnpm --filter @doornext/driver dev    # http://localhost:3002
pnpm --filter @doornext/admin dev     # http://localhost:3003
```

### Stripe Webhook Testing

```bash
# Forward Stripe events to local customer app
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

## Pre-commit Checklist

Before pushing, ensure:

- [ ] `pnpm type-check` passes with no errors
- [ ] `pnpm lint` passes with no errors
- [ ] `pnpm test` passes (if tests exist for changed code)
- [ ] New API routes include authentication checks
- [ ] New API routes include rate limiting where appropriate
- [ ] New environment variables are added to `.env.local.example` and `packages/shared/src/lib/env.ts`
- [ ] New database migrations follow the naming convention: `NNN_description.sql`
- [ ] No secrets or API keys committed to the repository

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production — auto-deploys to Vercel |
| `feature/*` | New features — CI runs on push |
| `fix/*` | Bug fixes — CI runs on push |
| `chore/*` | Maintenance — CI runs on push |

## Adding a New Migration

```bash
# Create a new migration file (increment the number)
# Example: 026_add_promo_codes.sql
touch supabase/migrations/026_add_promo_codes.sql

# Write your SQL, then test locally
supabase db reset  # Applies all migrations from scratch
```

## Architecture Overview

```
Doornext/
├── apps/
│   ├── customer/   Next.js 16 — Customer-facing PWA (port 3000)
│   ├── maker/      Next.js 16 — Food maker dashboard (port 3001)
│   ├── driver/     Next.js 16 — Driver app (port 3002)
│   └── admin/      Next.js 16 — Internal admin panel (port 3003)
├── packages/
│   ├── shared/     Shared types, utils, pricing, env validation, logger
│   └── ui/         Shared UI components (if present)
└── supabase/
    └── migrations/ Numbered SQL migrations (applied in order)
```

## Key Services

| Service | Purpose | Docs |
|---------|---------|------|
| Supabase | Database, Auth, Realtime | [docs.supabase.com](https://docs.supabase.com) |
| Stripe | Payments, webhooks | [stripe.com/docs](https://stripe.com/docs) |
| Stream Chat | In-app messaging | [getstream.io/docs](https://getstream.io/docs) |
| Firebase | Push notifications (FCM) | [firebase.google.com/docs](https://firebase.google.com/docs) |
| Sentry | Error tracking | [docs.sentry.io](https://docs.sentry.io) |
| Vercel | Hosting & deployment | [vercel.com/docs](https://vercel.com/docs) |
