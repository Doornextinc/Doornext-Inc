import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('support_messages')
    .select('id, message, is_internal, created_at, sender_id, users(full_name)')
    .eq('ticket_id', id)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ messages: data })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { message, is_internal, sender_id } = await request.json()
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('support_messages')
    .insert({
      ticket_id: id,
      sender_id,
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
