import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // KYC-grade submission (legal name, SSN/EIN) — cap at 3 per hour per user.
  if (!await checkRateLimit(`maker-onboarding:${user.id}`, 3, 3600)) {
    return NextResponse.json({ error: 'Too many submissions. Please wait an hour before retrying.' }, { status: 429 })
  }

  const body = await req.json()
  const { business_type, legal_name, dba_name, ein, ssn_last4, business_phone, business_address } = body

  if (!business_type || !legal_name) {
    return NextResponse.json({ error: 'business_type and legal_name are required' }, { status: 400 })
  }

  const VALID_TYPES = ['sole_proprietor', 'llc', 'corporation', 'partnership']
  if (!VALID_TYPES.includes(business_type)) {
    return NextResponse.json({ error: 'Invalid business_type' }, { status: 400 })
  }

  // Sole proprietors must provide SSN last 4; others must provide EIN
  if (business_type === 'sole_proprietor' && !ssn_last4) {
    return NextResponse.json({ error: 'SSN last 4 digits required for sole proprietors' }, { status: 400 })
  }
  if (business_type !== 'sole_proprietor' && !ein) {
    return NextResponse.json({ error: 'EIN required for LLC, corporation, and partnership' }, { status: 400 })
  }
  if (ssn_last4 && !/^\d{4}$/.test(ssn_last4)) {
    return NextResponse.json({ error: 'SSN last 4 must be exactly 4 digits' }, { status: 400 })
  }
  if (ein && !/^\d{2}-?\d{7}$/.test(ein.replace(/\s/g, ''))) {
    return NextResponse.json({ error: 'EIN must be in format XX-XXXXXXX' }, { status: 400 })
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: maker } = await admin
    .from('food_makers')
    .select('id, kyc_status')
    .eq('user_id', user.id)
    .single()

  if (!maker) return NextResponse.json({ error: 'Maker profile not found' }, { status: 404 })
  if (maker.kyc_status === 'approved') {
    return NextResponse.json({ error: 'KYC already approved' }, { status: 409 })
  }

  // Check that required documents were uploaded
  const { data: docs } = await admin
    .from('maker_documents')
    .select('identity_front_path, business_doc_path')
    .eq('maker_id', maker.id)
    .maybeSingle()

  if (!docs?.identity_front_path) {
    return NextResponse.json({ error: 'Government-issued ID (front) is required' }, { status: 400 })
  }
  if (business_type !== 'sole_proprietor' && !docs?.business_doc_path) {
    return NextResponse.json({ error: 'Business formation document is required for your business type' }, { status: 400 })
  }

  const now = new Date().toISOString()

  // Upsert business details and mark as pending_review
  const { error: docError } = await admin
    .from('maker_documents')
    .upsert(
      {
        maker_id:         maker.id,
        user_id:          user.id,
        business_type,
        legal_name:       legal_name.trim(),
        dba_name:         dba_name?.trim() || null,
        ein:              ein?.replace(/\s/g, '') || null,
        ssn_last4:        ssn_last4 || null,
        business_phone:   business_phone?.trim() || null,
        business_address: business_address?.trim() || null,
        kyc_status:       'pending_review',
        submitted_at:     now,
        updated_at:       now,
      },
      { onConflict: 'maker_id' }
    )

  if (docError) {
    console.error('KYC submit error:', docError)
    return NextResponse.json({ error: 'Failed to save business information' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, kyc_status: 'pending_review' })
}
