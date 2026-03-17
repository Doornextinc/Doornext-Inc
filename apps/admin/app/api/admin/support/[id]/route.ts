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
    .from('support_tickets')
    .select(`
      id, subject, message, status, priority,
      assigned_to, resolved_at, created_at, updated_at, order_id,
      users(full_name, email),
      order:orders(
        id, status, total, created_at,
        food_maker:food_makers(display_name),
        order_items(quantity, unit_price, menu_items(name))
      )
    `)
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ticket: data })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { supabase } = auth

  const { id } = await params
  const body = await request.json()

  const allowed = ['status', 'priority', 'assigned_to', 'resolved_at', 'order_id']
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key]
  }

  const { error } = await supabase
    .from('support_tickets')
    .update(update)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
