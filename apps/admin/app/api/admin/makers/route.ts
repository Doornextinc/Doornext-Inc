import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const { searchParams } = new URL(req.url)
  const filter = searchParams.get('status') // 'pending' | 'approved' | 'rejected' | null = all

  let query = supabase
    .from('food_makers')
    .select('id, user_id, display_name, cuisine_tags, avg_rating, total_reviews, is_open, approval_status, kyc_status, rejection_reason, reviewed_at, created_at')
    .order('created_at', { ascending: false })

  if (filter) query = query.eq('approval_status', filter)

  const { data: makers, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ makers: makers ?? [] })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response
  const { supabase, adminId } = auth

  const body = await req.json()
  const { makerId, action, is_open, rejection_reason } = body

  if (!makerId) {
    return NextResponse.json({ error: 'makerId required' }, { status: 400 })
  }

  // Toggle open/closed
  if (action === undefined && is_open !== undefined) {
    const { error } = await supabase.from('food_makers').update({ is_open }).eq('id', makerId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // Approve — also mark kyc_status approved so the maker can access their dashboard
  if (action === 'approve') {
    const { error } = await supabase
      .from('food_makers')
      .update({
        approval_status: 'approved',
        kyc_status: 'approved',
        rejection_reason: null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: adminId,
      })
      .eq('id', makerId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // Reject
  if (action === 'reject') {
    const { error } = await supabase
      .from('food_makers')
      .update({
        approval_status: 'rejected',
        rejection_reason: rejection_reason ?? null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: adminId,
      })
      .eq('id', makerId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
