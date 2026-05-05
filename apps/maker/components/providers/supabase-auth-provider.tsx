'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

async function tryRegisterPushToken(userId: string) {
  try {
    const { requestPushPermission, savePushToken } = await import('@/lib/fcm')
    const token = await requestPushPermission()
    if (token) await savePushToken(token, userId)
  } catch {
    // Non-fatal
  }
}

export function SupabaseAuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (event === 'SIGNED_OUT' || (event as any) === 'TOKEN_REFRESH_FAILED') {
        await supabase.auth.signOut()
        router.push('/login')
        return
      }
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (session?.user) {
          tryRegisterPushToken(session.user.id)
        }
      }
      if (event === 'TOKEN_REFRESHED') {
        router.refresh()
      }
    })

    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return
      // Use getUser() (server-verified) rather than getSession() (localStorage-only).
      // getSession() can return null if the browser cleared localStorage while a
      // valid cookie-based session still exists, causing a false logout redirect.
      const { data: { user: visibilityUser } } = await supabase.auth.getUser()
      if (!visibilityUser) {
        router.push('/login')
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [router])

  return <>{children}</>
}
