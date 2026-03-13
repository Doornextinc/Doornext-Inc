import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createSessionClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const session = await createSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const { data: profile } = await session.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.redirect(new URL('/login', req.url))

  const body = await req.formData()
  const key = body.get('key') as string
  let value = body.get('value') as string

  if (!key || value === null) {
    return NextResponse.redirect(new URL('/settings?error=missing', req.url))
  }

  // Parse value: boolean, number, or string
  let parsed: boolean | number | string = value
  if (value === 'true') parsed = true
  else if (value === 'false') parsed = false
  else if (!isNaN(Number(value))) parsed = Number(value)

  const admin = createAdminClient()
  await admin
    .from('settings')
    .upsert({ key, value: parsed, updated_at: new Date().toISOString() }, { onConflict: 'key' })

  return NextResponse.redirect(new URL('/settings?saved=1', req.url))
}
