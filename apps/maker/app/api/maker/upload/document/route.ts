import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const BUCKET = 'maker-documents'

const VALID_SLOTS = ['identity_front', 'identity_back', 'business_doc', 'food_permit'] as const
type Slot = typeof VALID_SLOTS[number]

const SLOT_TO_COLUMN: Record<Slot, string> = {
  identity_front: 'identity_front_path',
  identity_back:  'identity_back_path',
  business_doc:   'business_doc_path',
  food_permit:    'food_permit_path',
}

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg':     'jpg',
  'image/png':      'png',
  'image/webp':     'webp',
  'application/pdf': 'pdf',
}

async function ensureBucket(admin: ReturnType<typeof createServiceClient>) {
  try {
    const { data: buckets } = await admin.storage.listBuckets()
    if (!buckets?.some((b) => b.id === BUCKET)) {
      await admin.storage.createBucket(BUCKET, {
        public: false,
        fileSizeLimit: 10 * 1024 * 1024,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
      })
    }
  } catch {
    // Bucket may already exist — continue
  }
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const slot = formData.get('slot') as string | null

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (!slot || !VALID_SLOTS.includes(slot as Slot)) {
      return NextResponse.json({ error: `slot must be one of: ${VALID_SLOTS.join(', ')}` }, { status: 400 })
    }

    const ext = MIME_TO_EXT[file.type]
    if (!ext) {
      return NextResponse.json({ error: 'Only JPEG, PNG, WebP images and PDF files are allowed' }, { status: 400 })
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File must be under 10 MB' }, { status: 400 })
    }

    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    await ensureBucket(admin)

    const storagePath = `${user.id}/${slot}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: file.type, upsert: true })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    // Update or create the maker_documents row with the new path
    const column = SLOT_TO_COLUMN[slot as Slot]
    const { data: maker } = await admin
      .from('food_makers')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!maker) return NextResponse.json({ error: 'Maker profile not found' }, { status: 404 })

    await admin
      .from('maker_documents')
      .upsert(
        { maker_id: maker.id, user_id: user.id, [column]: storagePath },
        { onConflict: 'maker_id' }
      )

    return NextResponse.json({ path: storagePath, slot })
  } catch (err) {
    console.error('Document upload error:', err)
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }
}
