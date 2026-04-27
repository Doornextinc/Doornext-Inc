import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function GET() {
  const checks: Record<string, 'ok' | 'error' | 'unconfigured'> = {}

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    checks.supabase = 'unconfigured'
  } else {
    try {
      const sb = createServiceClient(supabaseUrl, serviceKey)
      const { error } = await sb.from('users').select('id').limit(1)
      checks.supabase = error ? 'error' : 'ok'
    } catch {
      checks.supabase = 'error'
    }
  }

  checks.stream = process.env.STREAM_API_SECRET ? 'ok' : 'unconfigured'
  checks.firebase = process.env.FIREBASE_PRIVATE_KEY ? 'ok' : 'unconfigured'

  const healthy = Object.values(checks).every((v) => v !== 'error')
  return NextResponse.json(
    { status: healthy ? 'ok' : 'degraded', timestamp: new Date().toISOString(), checks },
    { status: healthy ? 200 : 503 },
  )
}
