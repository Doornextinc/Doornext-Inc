'use client'

import { useState, useEffect } from 'react'
import { getLocation } from '@/lib/median'

interface LocationState {
  lat: number | null
  lng: number | null
  error: string | null
  loading: boolean
}

export function useLocation() {
  const [state, setState] = useState<LocationState>({
    lat: null,
    lng: null,
    error: null,
    loading: false,
  })

  const requestLocation = async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const position = await getLocation()
      setState({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        error: null,
        loading: false,
      })
    } catch {
      setState((s) => ({
        ...s,
        error: 'Unable to get location',
        loading: false,
      }))
    }
  }

  return { ...state, requestLocation }
}
