/**
 * Startup environment validation.
 *
 * Call `validateEnv(requiredVars)` at the top of your Next.js instrumentation
 * file (`instrumentation.ts`) or in a server-only module that runs at boot.
 *
 * Throws a descriptive error in development; logs a critical warning in
 * production so the app still starts but operators are alerted.
 */

export type EnvVar = {
  name: string
  /** Optional human-readable description shown in the error message */
  description?: string
  /** If true, only warn instead of throwing in development */
  optional?: boolean
}

export function validateEnv(vars: EnvVar[]): void {
  const missing: string[] = []

  for (const v of vars) {
    const value = process.env[v.name]
    const isEmpty =
      !value ||
      value.trim() === '' ||
      value.includes('placeholder') ||
      value.startsWith('your-') ||
      value === 'undefined'

    if (isEmpty && !v.optional) {
      missing.push(`  • ${v.name}${v.description ? ` — ${v.description}` : ''}`)
    }
  }

  if (missing.length === 0) return

  const message = [
    '╔══════════════════════════════════════════════════════════╗',
    '║          MISSING REQUIRED ENVIRONMENT VARIABLES          ║',
    '╚══════════════════════════════════════════════════════════╝',
    '',
    'The following environment variables are required but not set:',
    '',
    ...missing,
    '',
    'Copy .env.local.example → .env.local and fill in the values.',
    'See the project README for setup instructions.',
    '',
  ].join('\n')

  if (process.env.NODE_ENV === 'production') {
    // In production, log loudly but don't crash — let the health check surface it
    console.error('[CRITICAL]', message)
  } else {
    throw new Error(message)
  }
}

/** Shared required vars for all Doornext apps */
export const COMMON_REQUIRED_VARS: EnvVar[] = [
  { name: 'NEXT_PUBLIC_SUPABASE_URL', description: 'Supabase project URL' },
  { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', description: 'Supabase anon/public key' },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', description: 'Supabase service role key (server-side only)' },
]

export const CUSTOMER_REQUIRED_VARS: EnvVar[] = [
  ...COMMON_REQUIRED_VARS,
  { name: 'STRIPE_SECRET_KEY', description: 'Stripe secret key' },
  { name: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', description: 'Stripe publishable key' },
  { name: 'STRIPE_WEBHOOK_SECRET', description: 'Stripe webhook signing secret' },
  { name: 'NEXT_PUBLIC_STREAM_API_KEY', description: 'Stream Chat API key' },
  { name: 'STREAM_API_SECRET', description: 'Stream Chat API secret' },
  { name: 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', description: 'Google Maps API key' },
  { name: 'FIREBASE_PROJECT_ID', description: 'Firebase project ID (Admin SDK)' },
  { name: 'FIREBASE_CLIENT_EMAIL', description: 'Firebase client email (Admin SDK)' },
  { name: 'FIREBASE_PRIVATE_KEY', description: 'Firebase private key (Admin SDK)' },
  { name: 'INTERNAL_WEBHOOK_SECRET', description: 'Shared secret for internal webhooks (FCM endpoint)' },
  { name: 'NEXT_PUBLIC_SENTRY_DSN', description: 'Sentry DSN for error tracking', optional: true },
]

export const DRIVER_REQUIRED_VARS: EnvVar[] = [
  ...COMMON_REQUIRED_VARS,
  { name: 'NEXT_PUBLIC_STREAM_API_KEY', description: 'Stream Chat API key' },
  { name: 'STREAM_API_SECRET', description: 'Stream Chat API secret' },
  // Firebase vars are optional — push notifications won't work without them but the app starts fine
  { name: 'NEXT_PUBLIC_FIREBASE_API_KEY', description: 'Firebase client API key', optional: true },
  { name: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID', description: 'Firebase project ID', optional: true },
]

export const MAKER_REQUIRED_VARS: EnvVar[] = [
  ...COMMON_REQUIRED_VARS,
  { name: 'NEXT_PUBLIC_STREAM_API_KEY', description: 'Stream Chat API key' },
  { name: 'STREAM_API_SECRET', description: 'Stream Chat API secret' },
]

export const ADMIN_REQUIRED_VARS: EnvVar[] = [
  ...COMMON_REQUIRED_VARS,
  { name: 'STRIPE_SECRET_KEY', description: 'Stripe secret key' },
]
