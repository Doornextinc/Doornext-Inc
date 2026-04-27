import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

  const isConfigured =
    supabaseUrl && supabaseKey &&
    !supabaseUrl.includes('placeholder') && !supabaseKey.includes('placeholder')

  if (!isConfigured) {
    return new NextResponse('Service unavailable: auth not configured', { status: 503 })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() { return request.cookies.getAll() },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  const pathname = request.nextUrl.pathname

  const isAuthRoute =
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/welcome') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/auth/')

  const isOnboarding = pathname.startsWith('/onboarding')
  const isApi = pathname.startsWith('/api')

  // Get user — fail gracefully if Supabase is unreachable
  let user = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch {
    // Supabase unreachable — treat as logged out, let auth pages through
  }

  // Unauthenticated: send to welcome (except public routes)
  if (!user && !isAuthRoute && !isApi) {
    return NextResponse.redirect(new URL('/welcome', request.url))
  }

  if (user && !isAuthRoute && !isApi) {
    // Verify driver role — fail open if DB unreachable (don't lock user out)
    try {
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile && profile.role !== 'driver') {
        await supabase.auth.signOut()
        return NextResponse.redirect(new URL('/login?error=not_driver', request.url))
      }
    } catch {
      // DB unreachable — allow through, page itself will handle errors
    }

    // Enforce KYC: unapproved drivers can only access /onboarding
    if (!isOnboarding) {
      try {
        const { data: driverProfile } = await supabase
          .from('driver_profiles')
          .select('kyc_status')
          .eq('id', user.id)
          .single()

        if (driverProfile && driverProfile.kyc_status !== 'approved') {
          return NextResponse.redirect(new URL('/onboarding', request.url))
        }
      } catch {
        // DB unreachable — allow through rather than loop to /onboarding
      }
    }
  }

  // Authenticated users hitting auth pages → go to app
  if (user && isAuthRoute) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
