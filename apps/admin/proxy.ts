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
  const isAuthRoute = pathname.startsWith('/login')
  const isApiRoute = pathname.startsWith('/api/admin')

  // Get user — fail gracefully if Supabase is unreachable
  let user = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch {
    // Supabase unreachable — allow auth pages, block everything else
  }

  if (!user && !isAuthRoute) {
    if (isApiRoute) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && !isAuthRoute) {
    try {
      const { data: profile } = await supabase
        .from('users').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') {
        if (isApiRoute) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        await supabase.auth.signOut()
        return NextResponse.redirect(new URL('/login?error=not_admin', request.url))
      }
    } catch {
      // DB unreachable — allow through, page itself will handle errors
    }
  }

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
