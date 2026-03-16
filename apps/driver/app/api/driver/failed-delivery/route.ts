import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orderId, reason } = await req.json()
  if (!orderId || !reason) {
    return NextResponse.json({ error: 'orderId and reason required' }, { status: 400 })
  }

  // Verify driver is assigned to this order and it's at the right stage
  const { data: order } = await supabase
    .from('orders')
    .select('id, status, nexter_id, customer_id, maker_id, total, payment_method')
    .eq('id', orderId)
    .single()

  if (!order || order.nexter_id !== user.id) {
    return NextResponse.json({ error: 'Order not found or not assigned to you' }, { status: 404 })
  }

  if (order.status !== 'arrived_at_customer') {
    return NextResponse.json(
      { error: `Can only report failed delivery when arrived at customer (current: ${order.status})` },
      { status: 400 }
    )
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const shortId = orderId.slice(-6).toUpperCase()

  // 1. Mark order as failed_delivery with reason
  await admin
    .from('orders')
    .update({
      status: 'failed_delivery',
      failed_delivery_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)

  // 2. Create a high-priority support ticket on behalf of the driver
  const { data: ticket } = await admin
    .from('support_tickets')
    .insert({
      user_id: user.id,
      order_id: orderId,
      subject: `Failed Delivery — Order #${shortId}`,
      message: `Driver was unable to complete delivery for order #${shortId}.\n\nReason: ${reason}\n\nDriver ID: ${user.id}\nOrder total: $${order.total?.toFixed(2) ?? 'N/A'}\nPayment: ${order.payment_method ?? 'N/A'}`,
      status: 'open',
      priority: 'high',
    })
    .select('id')
    .single()

  // 3. Notify customer
  await admin.from('notifications').insert({
    user_id: order.customer_id,
    type: 'failed_delivery',
    title: 'Delivery Unsuccessful',
    body: `We were unable to deliver your order #${shortId}. Our support team has been notified and will contact you shortly to resolve this.`,
    data: { order_id: orderId, ticket_id: ticket?.id ?? null },
  })

  return NextResponse.json({ success: true, ticketId: ticket?.id ?? null })
}
