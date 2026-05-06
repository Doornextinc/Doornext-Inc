import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { adminId, ip, supabase } = auth

  const { id: userId } = await params

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Get the user's email
  const { data: { user }, error: getUserError } = await serviceClient.auth.admin.getUserById(userId)
  if (getUserError || !user?.email) {
    return NextResponse.json({ error: 'User not found or has no email' }, { status: 404 })
  }

  // Generate a password reset link (valid 1 hour)
  const redirectTo = `${process.env.NEXT_PUBLIC_MAKER_APP_URL ?? ''}/auth/callback?type=recovery`
  const { data: linkData, error: linkError } = await serviceClient.auth.admin.generateLink({
    type: 'recovery',
    email: user.email,
    options: { redirectTo },
  })

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 })
  }

  await supabase.from('admin_audit_log').insert({
    admin_id: adminId,
    action: 'user_password_reset_sent',
    target_type: 'user',
    target_id: userId,
    payload: { email: user.email },
    ip_address: ip,
  })

  // Return the link so admin can share it directly if email delivery is broken
  return NextResponse.json({
    ok: true,
    email: user.email,
    reset_link: linkData.properties?.action_link ?? null,
  })
}
