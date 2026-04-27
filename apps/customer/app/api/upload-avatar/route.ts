import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  // Verify user is authenticated
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  // Derive extension from MIME type — never from filename, which can be spoofed
  const MIME_TO_EXT: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png':  'png',
    'image/webp': 'webp',
    'image/gif':  'gif',
  }
  const ext = MIME_TO_EXT[file.type]
  if (!ext) {
    return NextResponse.json({ error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF' }, { status: 400 })
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 })
  }

  // Use service role to bypass RLS for storage upload
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Ensure the avatars bucket exists (creates it if missing)
  const { data: buckets } = await admin.storage.listBuckets()
  const bucketExists = buckets?.some((b) => b.id === 'avatars')
  if (!bucketExists) {
    const { error: createErr } = await admin.storage.createBucket('avatars', {
      public: true,
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    })
    if (createErr) {
      console.error('[upload-avatar] Could not create avatars bucket:', createErr)
      return NextResponse.json(
        { error: `Storage bucket unavailable: ${createErr.message}` },
        { status: 500 }
      )
    }
  }

  const path = `${user.id}/avatar.${ext}`
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const { error } = await admin.storage
    .from('avatars')
    .upload(path, buffer, {
      upsert: true,
      contentType: file.type,
    })

  if (error) {
    // StorageError may have .message or .error depending on version
    const msg =
      (error as { message?: string; error?: string }).message ??
      (error as { message?: string; error?: string }).error ??
      JSON.stringify(error)
    console.error('[upload-avatar] Upload failed:', msg, error)
    return NextResponse.json({ error: msg || 'Upload failed' }, { status: 500 })
  }

  const { data } = admin.storage.from('avatars').getPublicUrl(path)
  const publicUrl = `${data.publicUrl}?t=${Date.now()}`

  return NextResponse.json({ url: publicUrl })
}
