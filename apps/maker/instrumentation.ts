export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnv, MAKER_REQUIRED_VARS } = await import('@doornext/shared/env')
    validateEnv(MAKER_REQUIRED_VARS)
  }
}
