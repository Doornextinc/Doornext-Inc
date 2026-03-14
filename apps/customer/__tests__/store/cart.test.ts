import { describe, it, expect, beforeEach } from 'vitest'
import { useCartStore } from '@/store/cart'
import type { MenuItem } from '@/types'

const makeItem = (overrides?: Partial<MenuItem>): MenuItem => ({
  id: 'item-1',
  maker_id: 'maker-1',
  name: 'Test Dish',
  description: 'A test dish',
  price: 12.99,
  category: 'Mains',
  is_available: true,
  prep_time_mins: 20,
  daily_limit: null,
  photo_url: null,
  dietary_tags: [],
  ...overrides,
})

describe('Cart store', () => {
  beforeEach(() => {
    useCartStore.getState().clearCart()
  })

  it('starts empty', () => {
    const { items } = useCartStore.getState()
    expect(items).toHaveLength(0)
  })

  it('adds an item', () => {
    useCartStore.getState().addItem(makeItem(), 'maker-1', 'Test Kitchen')
    const { items } = useCartStore.getState()
    expect(items).toHaveLength(1)
    expect(items[0].quantity).toBe(1)
  })

  it('increments quantity when adding same item twice', () => {
    const item = makeItem()
    useCartStore.getState().addItem(item, 'maker-1', 'Test Kitchen')
    useCartStore.getState().addItem(item, 'maker-1', 'Test Kitchen')
    const { items } = useCartStore.getState()
    expect(items).toHaveLength(1)
    expect(items[0].quantity).toBe(2)
  })

  it('clears cart when switching makers', () => {
    useCartStore.getState().addItem(makeItem({ id: 'item-1' }), 'maker-1', 'Kitchen A')
    useCartStore.getState().addItem(makeItem({ id: 'item-2' }), 'maker-2', 'Kitchen B')
    const { items, makerId } = useCartStore.getState()
    expect(items).toHaveLength(1)
    expect(makerId).toBe('maker-2')
  })

  it('removes an item', () => {
    useCartStore.getState().addItem(makeItem(), 'maker-1', 'Test Kitchen')
    useCartStore.getState().removeItem('item-1')
    expect(useCartStore.getState().items).toHaveLength(0)
  })

  it('clears makerId when cart is emptied', () => {
    useCartStore.getState().addItem(makeItem(), 'maker-1', 'Test Kitchen')
    useCartStore.getState().removeItem('item-1')
    expect(useCartStore.getState().makerId).toBeNull()
  })

  it('calculates subtotal correctly', () => {
    useCartStore.getState().addItem(makeItem({ price: 10 }), 'maker-1', 'Test Kitchen')
    useCartStore.getState().addItem(makeItem({ id: 'item-2', price: 5 }), 'maker-1', 'Test Kitchen')
    const subtotal = useCartStore.getState().subtotal()
    expect(subtotal).toBe(15)
  })

  it('updateQuantity removes item when quantity is 0', () => {
    useCartStore.getState().addItem(makeItem(), 'maker-1', 'Test Kitchen')
    useCartStore.getState().updateQuantity('item-1', 0)
    expect(useCartStore.getState().items).toHaveLength(0)
  })

  it('clearCart resets everything', () => {
    useCartStore.getState().addItem(makeItem(), 'maker-1', 'Test Kitchen')
    useCartStore.getState().clearCart()
    const { items, makerId, makerName } = useCartStore.getState()
    expect(items).toHaveLength(0)
    expect(makerId).toBeNull()
    expect(makerName).toBeNull()
  })

  it('totalItems counts all quantities', () => {
    useCartStore.getState().addItem(makeItem({ id: 'item-1' }), 'maker-1', 'Test Kitchen')
    useCartStore.getState().addItem(makeItem({ id: 'item-1' }), 'maker-1', 'Test Kitchen') // qty = 2
    useCartStore.getState().addItem(makeItem({ id: 'item-2' }), 'maker-1', 'Test Kitchen')
    expect(useCartStore.getState().totalItems()).toBe(3)
  })
})
