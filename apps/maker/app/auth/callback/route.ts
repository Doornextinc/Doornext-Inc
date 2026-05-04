import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)

  // Support both PKCE (code) and OTP (token_hash) confirmation flows.
  // admin.createUser() sends OTP-style links; signUp() sends PKCE links.
  const code      = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type      = searchParams.get('type') as 'signup' | 'recovery' | 'invite' | 'email' | 'magiclink' | null
  const next      = searchParams.get('next') ?? '/dashboard'

  const supabase = await createClient()
  let exchangeError = true

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) exchangeError = false
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (!error) exchangeError = false
  }

  if (exchangeError) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
  }

  // Route the maker based on their approval status
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: maker } = await supabase
      .from('food_makers')
      .select('approval_status')
      .eq('user_id', user.id)
      .maybeSingle()

    if (maker?.approval_status === 'rejected') {
      return NextResponse.redirect(`${origin}/rejected`)
    }
    if (maker?.approval_status === 'pending') {
      return NextResponse.redirect(`${origin}/pending`)
    }
  }

  return NextResponse.redirect(`${origin}${next}`)
}
