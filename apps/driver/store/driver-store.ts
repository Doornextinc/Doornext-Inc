import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface DriverState {
  activeOrderId: string | null
  isOnline: boolean
  currentLat: number | null
  currentLng: number | null
  // Cached from auth — avoids blocking the auth lock on every page load
  userId: string | null
  userEmail: string | null
  // True once the Zustand persist middleware has rehydrated from localStorage.
  // Until this is true, userId/userEmail reflect defaults (null), not persisted values.
  _hasHydrated: boolean
  // Set to true once the INITIAL_SESSION auth event has fired.
  authReady: boolean
  setActiveOrder: (id: string | null) => void
  setOnline: (online: boolean) => void
  setLocation: (lat: number, lng: number) => void
  setUser: (id: string | null, email: string | null) => void
  setAuthReady: () => void
  setHasHydrated: () => void
  clearStore: () => void
}

export const useDriverStore = create<DriverState>()(
  persist(
    (set) => ({
      activeOrderId: null,
      isOnline: false,
      currentLat: null,
      currentLng: null,
      userId: null,
      userEmail: null,
      _hasHydrated: false,
      authReady: false,
      setActiveOrder: (id) => set({ activeOrderId: id }),
      setOnline: (online) => set({ isOnline: online }),
      setLocation: (lat, lng) => set({ currentLat: lat, currentLng: lng }),
      setUser: (id, email) => set({ userId: id, userEmail: email }),
      setAuthReady: () => set({ authReady: true }),
      setHasHydrated: () => set({ _hasHydrated: true }),
      clearStore: () => set({ activeOrderId: null, isOnline: false, currentLat: null, currentLng: null, userId: null, userEmail: null, authReady: false }),
    }),
    {
      name: 'doornext-driver',
      partialize: (state) => ({
        isOnline: state.isOnline,
        activeOrderId: state.activeOrderId,
        userId: state.userId,
        userEmail: state.userEmail,
        // _hasHydrated and authReady are intentionally NOT persisted
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated()
      },
    }
  )
)
