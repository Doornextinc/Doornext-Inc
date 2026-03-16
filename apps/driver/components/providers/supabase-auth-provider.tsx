'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDriverStore } from '@/store/driver-store'

export function SupabaseAuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const setOnline = useDriverStore((s) => s.setOnline)
  const setActiveOrder = useDriverStore((s) => s.setActiveOrder)
  const clearStore = useDriverStore((s) => s.clearStore)

  useEffect(() => {
    const supabase = createClient()

    const syncDriverStatus = async (userId: string) => {
      const { data } = await supabase
        .from('driver_profiles')
        .select('is_active')
        .eq('id', userId)
        .single()
      if (data) setOnline(data.is_active ?? false)

      const { data: activeOrder } = await supabase
        .from('orders')
        .select('id')
        .eq('nexter_id', userId)
        .in('status', ['driver_assigned', 'arrived_at_maker', 'picked_up', 'on_the_way', 'arrived_at_customer'])
        .maybeSingle()
      setActiveOrder(activeOrder?.id ?? null)
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        // Clear stale data from previous session so a different driver
        // logging in on the same device doesn't see ghost state
        clearStore()
        router.push('/login')
        return
      }
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (session?.user) await syncDriverStatus(session.user.id)
      }
      if (event === 'TOKEN_REFRESHED') {
        router.refresh()
      }
    })

    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [router, setOnline, setActiveOrder, clearStore])

  return <>{children}</>
}
