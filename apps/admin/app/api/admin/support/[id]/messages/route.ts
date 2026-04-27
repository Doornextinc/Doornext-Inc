import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const { id } = await params

  const { data, error } = await supabase
    .from('support_messages')
    .select('id, message, is_internal, created_at, sender_id, users(full_name)')
    .eq('ticket_id', id)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ messages: data })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { adminId, supabase } = auth

  const { id } = await params
  const { message, is_internal } = await request.json()

  const { error } = await supabase
    .from('support_messages')
    .insert({
      ticket_id: id,
      sender_id: adminId,
      message,
      is_internal: is_internal ?? false,
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update ticket updated_at and set in_progress if still open
  await supabase
    .from('support_tickets')
    .update({ updated_at: new Date().toISOString(), status: 'in_progress' })
    .eq('id', id)
    .eq('status', 'open')

  return NextResponse.json({ success: true })
}
