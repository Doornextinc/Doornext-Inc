import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface DriverState {
  /** Primary active order ID (first undelivered order in the current stack) */
  activeOrderId: string | null
  /** All order IDs currently in the driver's active stack (1 or 2) */
  activeOrderIds: string[]
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
  /** Replace the full active order stack (used on accept and page load) */
  setActiveOrders: (ids: string[]) => void
  /** Add a second order to the stack (stacking accepted) */
  addActiveOrder: (id: string) => void
  /** Remove an order from the stack (delivered or cancelled) */
  removeActiveOrder: (id: string) => void
  setOnline: (online: boolean) => void
  setLocation: (lat: number, lng: number) => void
  setUser: (id: string | null, email: string | null) => void
  setAuthReady: () => void
  setHasHydrated: () => void
  clearStore: () => void
}

export const useDriverStore = create<DriverState>()(
  persist(
    (set, get) => ({
      activeOrderId: null,
      activeOrderIds: [],
      isOnline: false,
      currentLat: null,
      currentLng: null,
      userId: null,
      userEmail: null,
      _hasHydrated: false,
      authReady: false,

      setActiveOrder: (id) =>
        set((s) => {
          if (id === null) return { activeOrderId: null, activeOrderIds: [] }
          // Keeps legacy call sites working: sets primary and ensures it's in the list
          const next = s.activeOrderIds.includes(id)
            ? s.activeOrderIds
            : [id, ...s.activeOrderIds]
          return { activeOrderId: id, activeOrderIds: next }
        }),

      setActiveOrders: (ids) =>
        set({ activeOrderIds: ids, activeOrderId: ids[0] ?? null }),

      addActiveOrder: (id) =>
        set((s) => {
          if (s.activeOrderIds.includes(id)) return {}
          const next = [...s.activeOrderIds, id]
          return { activeOrderIds: next, activeOrderId: s.activeOrderId ?? id }
        }),

      removeActiveOrder: (id) =>
        set((s) => {
          const next = s.activeOrderIds.filter((oid) => oid !== id)
          const primary = s.activeOrderId === id ? (next[0] ?? null) : s.activeOrderId
          return { activeOrderIds: next, activeOrderId: primary }
        }),

      setOnline: (online) => set({ isOnline: online }),
      setLocation: (lat, lng) => set({ currentLat: lat, currentLng: lng }),
      setUser: (id, email) => set({ userId: id, userEmail: email }),
      setAuthReady: () => set({ authReady: true }),
      setHasHydrated: () => set({ _hasHydrated: true }),
      clearStore: () =>
        set({
          activeOrderId: null,
          activeOrderIds: [],
          isOnline: false,
          currentLat: null,
          currentLng: null,
          userId: null,
          userEmail: null,
          authReady: false,
        }),
    }),
    {
      name: 'doornext-driver',
      partialize: (state) => ({
        isOnline:       state.isOnline,
        activeOrderId:  state.activeOrderId,
        activeOrderIds: state.activeOrderIds,
        userId:         state.userId,
        userEmail:      state.userEmail,
        // _hasHydrated and authReady are intentionally NOT persisted
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated()
      },
    }
  )
)
