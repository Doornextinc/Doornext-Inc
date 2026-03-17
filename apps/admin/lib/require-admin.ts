import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createSessionClient } from '@/lib/supabase/server'

export type AdminCtx = {
  adminId: string
  ip: string | null
  supabase: ReturnType<typeof createAdminClient>
}

type Ok = { ok: true } & AdminCtx
type Fail = { ok: false; response: NextResponse }

/**
 * Verifies the request has a valid admin session.
 * Returns admin context on success, or a ready-to-return 401/403 response on failure.
 * Use in every admin API route for defence-in-depth beyond middleware.
 */
export async function requireAdmin(req: NextRequest): Promise<Ok | Fail> {
  const session = await createSessionClient()
  const { data: { user } } = await session.auth.getUser()

  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const supabase = createAdminClient()
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? null
  return { ok: true, adminId: user.id, ip, supabase }
}
