import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface DriverState {
  /**
   * All order IDs currently in the driver's active stack (1 or 2).
   * The "primary" active order is `activeOrderIds[0]` — use the
   * `useActiveOrderId` selector below to access it without duplicating state.
   *
   * Audit finding 3.1: previously this store kept both `activeOrderId` and
   * `activeOrderIds`, which had to be hand-synced in every setter. The single
   * source of truth is now `activeOrderIds`; `activeOrderId` is derived.
   */
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
    (set) => ({
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
          if (id === null) return { activeOrderIds: [] }
          // Promote `id` to the head of the stack if not already present
          const next = s.activeOrderIds.includes(id)
            ? [id, ...s.activeOrderIds.filter((oid) => oid !== id)]
            : [id, ...s.activeOrderIds]
          return { activeOrderIds: next }
        }),

      setActiveOrders: (ids) => set({ activeOrderIds: ids }),

      addActiveOrder: (id) =>
        set((s) =>
          s.activeOrderIds.includes(id)
            ? {}
            : { activeOrderIds: [...s.activeOrderIds, id] }
        ),

      removeActiveOrder: (id) =>
        set((s) => ({ activeOrderIds: s.activeOrderIds.filter((oid) => oid !== id) })),

      setOnline: (online) => set({ isOnline: online }),
      setLocation: (lat, lng) => set({ currentLat: lat, currentLng: lng }),
      setUser: (id, email) => set({ userId: id, userEmail: email }),
      setAuthReady: () => set({ authReady: true }),
      setHasHydrated: () => set({ _hasHydrated: true }),
      clearStore: () =>
        set({
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

/** Selector: the primary active order ID (head of the stack), or null. */
export const useActiveOrderId = (): string | null =>
  useDriverStore((s) => s.activeOrderIds[0] ?? null)
