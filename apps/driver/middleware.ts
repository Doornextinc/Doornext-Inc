import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

  const isConfigured =
    supabaseUrl && supabaseKey &&
    !supabaseUrl.includes('placeholder') && !supabaseKey.includes('placeholder')

  if (!isConfigured) return NextResponse.next()

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

  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname
  const isAuthRoute = pathname.startsWith('/login')

  if (!user && !isAuthRoute && !pathname.startsWith('/api')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && !isAuthRoute && !pathname.startsWith('/api')) {
    const { data: profile } = await supabase
      .from('users').select('role').eq('id', user.id).single()
    if (profile?.role !== 'driver') {
      await supabase.auth.signOut()
      return NextResponse.redirect(new URL('/login?error=not_driver', request.url))
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
