import { create } from 'zustand'

interface DriverState {
  activeOrderId: string | null
  isOnline: boolean
  currentLat: number | null
  currentLng: number | null
  setActiveOrder: (id: string | null) => void
  setOnline: (online: boolean) => void
  setLocation: (lat: number, lng: number) => void
}

export const useDriverStore = create<DriverState>((set) => ({
  activeOrderId: null,
  isOnline: false,
  currentLat: null,
  currentLng: null,
  setActiveOrder: (id) => set({ activeOrderId: id }),
  setOnline: (online) => set({ isOnline: online }),
  setLocation: (lat, lng) => set({ currentLat: lat, currentLng: lng }),
}))
