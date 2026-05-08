import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { requireDriver } from '@/lib/require-driver'

const admin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const ALLOWED_DOC_TYPES = [
  'drivers_license_front',
  'drivers_license_back',
  'selfie_with_id',
  'vehicle_photo',
  'vehicle_insurance',
  'vehicle_registration',
] as const

type DocType = (typeof ALLOWED_DOC_TYPES)[number]

export async function POST(req: NextRequest) {
  const auth = await requireDriver(req)
  if (!auth.ok) return auth.response
  const { userId } = auth

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const docType = formData.get('docType') as string | null

  if (!file || !docType) {
    return NextResponse.json({ error: 'Missing file or docType' }, { status: 400 })
  }

  if (!ALLOWED_DOC_TYPES.includes(docType as DocType)) {
    return NextResponse.json({ error: 'Invalid docType' }, { status: 400 })
  }

  const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  if (!ALLOWED_MIMES.includes(file.type)) {
    return NextResponse.json({ error: 'File must be JPEG, PNG, WebP, or PDF' }, { status: 400 })
  }

  const MAX_SIZE = 10 * 1024 * 1024 // 10 MB
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File must be under 10 MB' }, { status: 400 })
  }

  const ext = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1]
  const storagePath = `${userId}/${docType}-${Date.now()}.${ext}`

  const { error: uploadError } = await admin.storage
    .from('driver-documents')
    .upload(storagePath, file, { cacheControl: '3600', upsert: true })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  // The storage path is returned to the caller (onboarding page).
  // driver_documents DB rows are written in bulk by /api/driver/submit-kyc
  // once the driver completes all steps — writing them here too caused column
  // name mismatches (docType values vs the actual column names in the table).
  return NextResponse.json({ path: storagePath })
}
