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
  const name = formData.get('name') as string | null

  if (!file || !name) {
    return NextResponse.json({ error: 'Missing file or name' }, { status: 400 })
  }

  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  if (!allowedMimes.includes(file.type)) {
    return NextResponse.json({ error: 'File must be JPEG, PNG, WebP, or PDF' }, { status: 400 })
  }

  const MAX_SIZE = 10 * 1024 * 1024 // 10 MB
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File must be under 10 MB' }, { status: 400 })
  }

  const ext = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1]
  const path = `${user.id}/${name}-${Date.now()}.${ext}`
  const { error } = await admin.storage
    .from('driver-documents')
    .upload(path, file, { cacheControl: '3600', upsert: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ path })
}
