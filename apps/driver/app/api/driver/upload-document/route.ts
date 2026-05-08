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

// Maps the frontend docType slot names to the actual driver_documents column names.
const DOC_COLUMN_MAP: Record<DocType, string> = {
  drivers_license_front: 'front_path',
  drivers_license_back:  'back_path',
  selfie_with_id:        'selfie_path',
  vehicle_photo:         'vehicle_photo_path',
  vehicle_insurance:     'insurance_path',
  vehicle_registration:  'registration_path',
}

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

  // Write (or update) the storage path in driver_documents using the correct column name.
  // This powers the Documents page which lets drivers replace individual documents after
  // KYC approval. The onboarding flow's submit-kyc endpoint will overwrite these paths
  // with the same values when a full KYC submission is made — that's safe and intentional.
  const column = DOC_COLUMN_MAP[docType as DocType]
  const { error: dbError } = await admin
    .from('driver_documents')
    .upsert(
      { user_id: userId, [column]: storagePath },
      { onConflict: 'user_id' }
    )

  if (dbError) {
    // Storage upload succeeded; log the DB error but don't fail the request.
    // The caller can still use the returned path for bulk submit-kyc writes.
    console.error('[upload-document] DB upsert failed:', dbError.message)
  }

  return NextResponse.json({ path: storagePath })
}
