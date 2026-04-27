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
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
  const MAX_SIZE = 5 * 1024 * 1024 // 5 MB
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, and WebP images are allowed' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Image must be under 5 MB' }, { status: 400 })
  }

  const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg'
  const path = `${user.id}/avatar-${Date.now()}.${ext}`
  const { error: uploadError } = await admin.storage
    .from('driver-documents')
    .upload(path, file, { cacheControl: '3600', upsert: true })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  // Store the storage path (not a signed URL) so we can generate
  // short-lived signed URLs on demand rather than embedding a long-lived URL.
  const { error: updateError } = await admin
    .from('driver_profiles')
    .update({ avatar_url: path })
    .eq('id', user.id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  // Return a 1-hour signed URL for immediate display in the client.
  const { data: signed, error: signError } = await admin.storage
    .from('driver-documents')
    .createSignedUrl(path, 3600)

  if (signError || !signed?.signedUrl) {
    // Path was saved successfully; signed URL generation is non-fatal.
    return NextResponse.json({ avatarUrl: null, storagePath: path })
  }

  return NextResponse.json({ avatarUrl: signed.signedUrl, storagePath: path })
}
