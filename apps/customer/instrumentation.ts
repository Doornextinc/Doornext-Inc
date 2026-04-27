/**
 * Next.js Instrumentation Hook
 * Runs once at server startup — validates required environment variables.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnv, CUSTOMER_REQUIRED_VARS } = await import('@doornext/shared/env')
    validateEnv(CUSTOMER_REQUIRED_VARS)
  }
}
