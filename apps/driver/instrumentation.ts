export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnv, DRIVER_REQUIRED_VARS } = await import('@doornext/shared/env')
    validateEnv(DRIVER_REQUIRED_VARS)
  }
}
