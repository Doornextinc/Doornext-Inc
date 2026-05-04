import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const { id: makerId } = await params

  // Use service role to read the private maker_documents record
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: doc, error } = await admin
    .from('maker_documents')
    .select('*')
    .eq('maker_id', makerId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!doc) return NextResponse.json({ doc: null })

  // Generate short-lived signed URLs for each document so admin can preview
  const BUCKET = 'maker-documents'
  const EXPIRY = 3600 // 1 hour

  async function signedUrl(path: string | null): Promise<string | null> {
    if (!path) return null
    const { data } = await admin.storage.from(BUCKET).createSignedUrl(path, EXPIRY)
    return data?.signedUrl ?? null
  }

  const [identityFrontUrl, identityBackUrl, businessDocUrl, foodPermitUrl] = await Promise.all([
    signedUrl(doc.identity_front_path),
    signedUrl(doc.identity_back_path),
    signedUrl(doc.business_doc_path),
    signedUrl(doc.food_permit_path),
  ])

  return NextResponse.json({
    doc: {
      ...doc,
      identity_front_url: identityFrontUrl,
      identity_back_url:  identityBackUrl,
      business_doc_url:   businessDocUrl,
      food_permit_url:    foodPermitUrl,
    },
  })
}
