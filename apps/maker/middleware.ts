import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes that require an authenticated session
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/orders',
  '/menu',
  '/earnings',
  '/profile',
  '/settings',
  '/notifications',
  '/messages',
  '/onboarding',
  '/pending',
  '/welcome',
]

// Routes that should NOT be accessible when already signed in
const AUTH_PREFIXES = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/check-email',
]

export async function middleware(request: NextRequest) {
  // Build a mutable response so we can forward refreshed session cookies
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Write refreshed cookies back into both the request and the response
          // so downstream server components pick them up.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: getUser() makes a server-side call to verify the JWT and
  // refresh the session cookie if needed.  Never swap this for getSession().
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // ── Root path ────────────────────────────────────────────────────────────
  if (pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = user ? '/dashboard' : '/login'
    return NextResponse.redirect(url)
  }

  // ── Protected routes — must be signed in ─────────────────────────────────
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))
  if (isProtected && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // Preserve the intended destination so we can redirect back after login
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // ── Auth routes — skip if already signed in ───────────────────────────────
  const isAuthRoute = AUTH_PREFIXES.some((p) => pathname.startsWith(p))
  if (isAuthRoute && user) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     *  - _next/static  (static files)
     *  - _next/image   (image optimisation)
     *  - favicon.ico
     *  - /icons/*      (PWA icons)
     *  - /manifest.json
     *  - /sw.js        (service worker)
     *  - /api/*        (API routes handle their own auth)
     *  - Files with a recognised extension (.svg, .png …)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|icons|manifest\\.json|sw\\.js|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
}
