/**
 * POST /api/auth/forgot-password
 *
 * Sends a password-reset email via Supabase Auth.
 * The `redirectTo` URL is where Supabase will redirect the user after they
 * click the email link — it must be the reset-password page in this app.
 *
 * Rate limited to 3 requests per hour per IP to prevent email flooding.
 * Always returns 200 (even for unknown emails) to avoid user enumeration.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  if (!await checkRateLimit(`forgot-password:${ip}`, 3, 3600)) {
    // Return 200 even on rate limit — don't reveal rate limiting behaviour to attackers
    return NextResponse.json({ success: true })
  }

  const { email } = await req.json()
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
  }

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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  // Fire-and-forget — we don't surface Supabase errors to avoid user enumeration
  await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${appUrl}/reset-password`,
  })

  // Always respond with success regardless of whether the email exists
  return NextResponse.json({ success: true })
}
