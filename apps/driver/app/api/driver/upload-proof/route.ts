import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

const admin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const orderId = formData.get('orderId') as string | null

  if (!file || !orderId) {
    return NextResponse.json({ error: 'Missing file or orderId' }, { status: 400 })
  }

  const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp']
  if (!ALLOWED_MIMES.includes(file.type)) {
    return NextResponse.json({ error: 'File must be JPEG, PNG, or WebP' }, { status: 400 })
  }

  const MAX_SIZE = 10 * 1024 * 1024 // 10 MB
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File must be under 10 MB' }, { status: 400 })
  }

  // Verify this order belongs to the authenticated driver
  const { data: order, error: orderErr } = await admin
    .from('orders')
    .select('id')
    .eq('id', orderId)
    .eq('nexter_id', user.id)
    .single()

  if (orderErr || !order) {
    return NextResponse.json({ error: 'Order not found or not authorized' }, { status: 403 })
  }

  const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg'
  const storagePath = `proof/${orderId}/${user.id}-${Date.now()}.${ext}`

  const { error: uploadError } = await admin.storage
    .from('driver-documents')
    .upload(storagePath, file, { cacheControl: '3600', upsert: true })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  // Store the proof photo path on the order record
  const { error: updateError } = await admin
    .from('orders')
    .update({ proof_photo_path: storagePath })
    .eq('id', orderId)

  if (updateError) {
    // Non-fatal: photo was uploaded, just couldn't link it to the order
    console.error('Failed to update order proof_photo_path:', updateError.message)
  }

  return NextResponse.json({ path: storagePath })
}
