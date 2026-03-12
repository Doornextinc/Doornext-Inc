import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CartItem, MenuItem } from '@/types'

interface CartState {
  items: CartItem[]
  makerId: string | null
  makerName: string | null
  addItem: (item: MenuItem, makerId: string, makerName: string, notes?: string) => void
  removeItem: (menuItemId: string) => void
  updateQuantity: (menuItemId: string, quantity: number) => void
  clearCart: () => void
  subtotal: () => number
  totalItems: () => number
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      makerId: null,
      makerName: null,

      addItem: (menuItem, makerId, makerName, notes = '') => {
        const { items, makerId: currentMakerId } = get()

        // If adding from a different maker, clear cart first
        if (currentMakerId && currentMakerId !== makerId) {
          set({ items: [], makerId: null, makerName: null })
        }

        const existing = items.find((i) => i.menu_item.id === menuItem.id)
        if (existing) {
          set({
            items: items.map((i) =>
              i.menu_item.id === menuItem.id
                ? { ...i, quantity: i.quantity + 1 }
                : i
            ),
          })
        } else {
          set({
            items: [...get().items, { menu_item: menuItem, quantity: 1, notes }],
            makerId,
            makerName,
          })
        }
      },

      removeItem: (menuItemId) => {
        const items = get().items.filter((i) => i.menu_item.id !== menuItemId)
        set({ items, makerId: items.length ? get().makerId : null, makerName: items.length ? get().makerName : null })
      },

      updateQuantity: (menuItemId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(menuItemId)
          return
        }
        set({
          items: get().items.map((i) =>
            i.menu_item.id === menuItemId ? { ...i, quantity } : i
          ),
        })
      },

      clearCart: () => set({ items: [], makerId: null, makerName: null }),

      subtotal: () =>
        get().items.reduce(
          (sum, item) => sum + item.menu_item.price * item.quantity,
          0
        ),

      totalItems: () =>
        get().items.reduce((sum, item) => sum + item.quantity, 0),
    }),
    {
      name: 'doornext-cart',
    }
  )
)
