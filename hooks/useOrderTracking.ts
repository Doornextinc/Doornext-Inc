'use client'

import { useEffect, useState } from 'react'
import type { OrderStatus, NexterLocation } from '@/types'

interface OrderUpdate {
  status: OrderStatus
  updated_at: string
}

export function useOrderTracking(orderId: string) {
  const [status, setStatus] = useState<OrderStatus>('confirmed')
  const [nexterLocation, setNexterLocation] = useState<NexterLocation | null>(null)

  useEffect(() => {
    if (!orderId) return

    const isSupabaseConfigured =
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')

    if (!isSupabaseConfigured) return

    let supabaseClient: ReturnType<typeof import('@/lib/supabase/client').createClient> | null = null

    const setup = async () => {
      const { createClient } = await import('@/lib/supabase/client')
      supabaseClient = createClient()

      // Subscribe to order status changes
      const orderChannel = supabaseClient
        .channel(`order:${orderId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'orders',
            filter: `id=eq.${orderId}`,
          },
          (payload) => {
            const update = payload.new as OrderUpdate
            setStatus(update.status)
          }
        )
        .subscribe()

      // Subscribe to nexter location
      const locationChannel = supabaseClient
        .channel(`nexter_location:${orderId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'nexter_locations',
            filter: `order_id=eq.${orderId}`,
          },
          (payload) => {
            setNexterLocation(payload.new as NexterLocation)
          }
        )
        .subscribe()

      return () => {
        supabaseClient?.removeChannel(orderChannel)
        supabaseClient?.removeChannel(locationChannel)
      }
    }

    const cleanup = setup()
    return () => {
      cleanup.then((fn) => fn?.())
    }
  }, [orderId])

  return { status, nexterLocation }
}
