export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnv, ADMIN_REQUIRED_VARS } = await import('@doornext/shared/env')
    validateEnv(ADMIN_REQUIRED_VARS)
  }
}
