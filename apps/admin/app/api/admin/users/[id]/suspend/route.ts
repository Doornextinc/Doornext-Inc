import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('users')
    .update({ account_status: 'suspended' })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Optionally log reason via support ticket or notes field if extended later
  void body

  return NextResponse.json({ success: true })
}
