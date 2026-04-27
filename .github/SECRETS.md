# GitHub Actions Secrets & Variables

This document lists all secrets and variables required for the CI/CD workflows.
Configure these at: **Settings → Secrets and variables → Actions**

## Repository Secrets

### Vercel Deployment

| Secret | Description |
|--------|-------------|
| `VERCEL_TOKEN` | Vercel personal access token (Settings → Tokens) |
| `VERCEL_ORG_ID` | Vercel team/org ID (from `.vercel/project.json` after `vercel link`) |
| `VERCEL_PROJECT_ID_CUSTOMER` | Vercel project ID for the customer app |
| `VERCEL_PROJECT_ID_DRIVER` | Vercel project ID for the driver app |
| `VERCEL_PROJECT_ID_MAKER` | Vercel project ID for the maker app |
| `VERCEL_PROJECT_ID_ADMIN` | Vercel project ID for the admin app |

### Supabase

| Secret | Description |
|--------|-------------|
| `SUPABASE_ACCESS_TOKEN` | Supabase personal access token (app.supabase.com → Account → Access Tokens) |
| `SUPABASE_DB_URL` | Direct database connection string (Project Settings → Database → Connection string → URI) |

### Health Check URLs

| Secret | Description |
|--------|-------------|
| `CUSTOMER_APP_URL` | Production URL of the customer app, e.g. `https://app.doornext.com` |
| `DRIVER_APP_URL` | Production URL of the driver app |
| `MAKER_APP_URL` | Production URL of the maker app |
| `ADMIN_APP_URL` | Production URL of the admin app |

### Notifications (optional)

| Secret | Description |
|--------|-------------|
| `SLACK_WEBHOOK_URL` | Slack incoming webhook URL for deploy failure alerts |

## Environment Variables (per-app)

Each Vercel project needs these environment variables configured in the Vercel dashboard.
See each app's `.env.local.example` for the full list.

## Setting Up Branch Protection

After configuring CI, add the `CI Passed` job as a required status check:

1. Go to **Settings → Branches → Add rule**
2. Branch name pattern: `main`
3. Check **Require status checks to pass before merging**
4. Search for and add: `CI Passed`
5. Check **Require branches to be up to date before merging**
6. Check **Restrict who can push to matching branches**
