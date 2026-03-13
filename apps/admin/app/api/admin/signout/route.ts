import { NextRequest, NextResponse } from 'next/server'
import { createSessionClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createSessionClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login', req.url))
}
