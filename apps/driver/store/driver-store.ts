import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface DriverState {
  activeOrderId: string | null
  isOnline: boolean
  currentLat: number | null
  currentLng: number | null
  setActiveOrder: (id: string | null) => void
  setOnline: (online: boolean) => void
  setLocation: (lat: number, lng: number) => void
  clearStore: () => void
}

export const useDriverStore = create<DriverState>()(
  persist(
    (set) => ({
      activeOrderId: null,
      isOnline: false,
      currentLat: null,
      currentLng: null,
      setActiveOrder: (id) => set({ activeOrderId: id }),
      setOnline: (online) => set({ isOnline: online }),
      setLocation: (lat, lng) => set({ currentLat: lat, currentLng: lng }),
      clearStore: () => set({ activeOrderId: null, isOnline: false, currentLat: null, currentLng: null }),
    }),
    {
      name: 'doornext-driver',
      partialize: (state) => ({
        isOnline: state.isOnline,
        activeOrderId: state.activeOrderId,
      }),
    }
  )
)
