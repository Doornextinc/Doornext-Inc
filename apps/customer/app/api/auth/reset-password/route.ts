/**
 * POST /api/auth/reset-password
 *
 * Updates the authenticated user's password.
 * The user must be authenticated via the magic-link token that Supabase
 * included in the reset email (exchanged for a session on the client before
 * this route is called).
 *
 * Enforces a minimum password length of 8 characters server-side.
 * Rate limited to 5 attempts per hour per user to slow brute-force on
 * weak passwords.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { checkRateLimit } from '@/lib/rate-limit'

const MIN_PASSWORD_LENGTH = 8

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) => {
          try { cookieStore.set(name, value, options) } catch {}
        }),
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { error: 'Session expired or invalid reset link. Please request a new one.' },
      { status: 401 }
    )
  }

  // Rate limit per authenticated user
  if (!await checkRateLimit(`reset-password:${user.id}`, 5, 3600)) {
    return NextResponse.json({ error: 'Too many attempts. Please try again in an hour.' }, { status: 429 })
  }

  const { password } = await req.json()
  if (!password || typeof password !== 'string') {
    return NextResponse.json({ error: 'Password is required' }, { status: 400 })
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 }
    )
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    console.error('Password reset error:', error.message)
    return NextResponse.json({ error: 'Failed to update password. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
