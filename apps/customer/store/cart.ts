import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CartItem, MenuItem } from '@/types'

// One maker's bucket inside the cart
export interface MakerCart {
  makerName: string
  items: CartItem[]
}

interface CartState {
  // keyed by makerId
  makers: Record<string, MakerCart>

  addItem: (item: MenuItem, makerId: string, makerName: string, notes?: string) => void
  removeItem: (menuItemId: string, makerId: string) => void
  updateQuantity: (menuItemId: string, makerId: string, quantity: number) => void
  clearCart: () => void
  clearMaker: (makerId: string) => void

  subtotal: () => number
  subtotalForMaker: (makerId: string) => number
  totalItems: () => number
  makerIds: () => string[]
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      makers: {},

      addItem: (menuItem, makerId, makerName, notes = '') => {
        const { makers } = get()
        const makerCart = makers[makerId]

        if (makerCart) {
          // Maker already in cart — add or increment item
          const existing = makerCart.items.find((i) => i.menu_item.id === menuItem.id)
          if (existing) {
            set({
              makers: {
                ...makers,
                [makerId]: {
                  ...makerCart,
                  items: makerCart.items.map((i) =>
                    i.menu_item.id === menuItem.id
                      ? { ...i, quantity: i.quantity + 1 }
                      : i
                  ),
                },
              },
            })
          } else {
            set({
              makers: {
                ...makers,
                [makerId]: {
                  ...makerCart,
                  items: [...makerCart.items, { menu_item: menuItem, quantity: 1, notes }],
                },
              },
            })
          }
        } else {
          // First item from this maker — create a new bucket
          set({
            makers: {
              ...makers,
              [makerId]: {
                makerName,
                items: [{ menu_item: menuItem, quantity: 1, notes }],
              },
            },
          })
        }
      },

      removeItem: (menuItemId, makerId) => {
        const { makers } = get()
        const makerCart = makers[makerId]
        if (!makerCart) return

        const items = makerCart.items.filter((i) => i.menu_item.id !== menuItemId)
        if (items.length === 0) {
          // Remove maker bucket when it empties
          const { [makerId]: _removed, ...rest } = makers
          set({ makers: rest })
        } else {
          set({ makers: { ...makers, [makerId]: { ...makerCart, items } } })
        }
      },

      updateQuantity: (menuItemId, makerId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(menuItemId, makerId)
          return
        }
        const { makers } = get()
        const makerCart = makers[makerId]
        if (!makerCart) return
        set({
          makers: {
            ...makers,
            [makerId]: {
              ...makerCart,
              items: makerCart.items.map((i) =>
                i.menu_item.id === menuItemId ? { ...i, quantity } : i
              ),
            },
          },
        })
      },

      clearCart: () => set({ makers: {} }),

      clearMaker: (makerId) => {
        const { [makerId]: _removed, ...rest } = get().makers
        set({ makers: rest })
      },

      subtotal: () =>
        Object.values(get().makers).reduce(
          (total, mc) =>
            total + mc.items.reduce((sum, i) => sum + i.menu_item.price * i.quantity, 0),
          0
        ),

      subtotalForMaker: (makerId) => {
        const mc = get().makers[makerId]
        if (!mc) return 0
        return mc.items.reduce((sum, i) => sum + i.menu_item.price * i.quantity, 0)
      },

      totalItems: () =>
        Object.values(get().makers).reduce(
          (total, mc) => total + mc.items.reduce((sum, i) => sum + i.quantity, 0),
          0
        ),

      makerIds: () => Object.keys(get().makers),
    }),
    {
      name: 'doornext-cart',
    }
  )
)
