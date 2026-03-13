'use client'

import { useEffect, useState } from 'react'
import type { OrderStatus, NexterLocation } from '@/types'

export function useOrderTracking(orderId: string, nexterId?: string | null) {
  const [status, setStatus] = useState<OrderStatus | null>(null)
  const [nexterLocation, setNexterLocation] = useState<NexterLocation | null>(null)

  useEffect(() => {
    if (!orderId) return
    const isConfigured =
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')
    if (!isConfigured) return

    let cleanup: (() => void) | null = null
    const setup = async () => {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const orderChannel = supabase
        .channel(`order-status:${orderId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
          (payload) => {
            const updated = payload.new as { status: OrderStatus }
            setStatus(updated.status)
          }
        )
        .subscribe()
      cleanup = () => { supabase.removeChannel(orderChannel) }
    }
    setup().catch(console.error)
    return () => { cleanup?.() }
  }, [orderId])

  useEffect(() => {
    if (!nexterId) return
    const isConfigured =
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')
    if (!isConfigured) return

    let cleanup: (() => void) | null = null
    const setup = async () => {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const channel = supabase
        .channel(`nexter-loc:${nexterId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'nexter_locations', filter: `nexter_id=eq.${nexterId}` },
          (payload) => { setNexterLocation(payload.new as NexterLocation) }
        )
        .subscribe()
      cleanup = () => { supabase.removeChannel(channel) }
    }
    setup().catch(console.error)
    return () => { cleanup?.() }
  }, [nexterId])

  return { status, nexterLocation }
}
