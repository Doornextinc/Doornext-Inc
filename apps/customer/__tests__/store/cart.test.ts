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

describe('Cart store (multi-maker)', () => {
  beforeEach(() => {
    useCartStore.getState().clearCart()
  })

  it('starts empty', () => {
    const { makers } = useCartStore.getState()
    expect(Object.keys(makers)).toHaveLength(0)
  })

  it('adds an item to a new maker bucket', () => {
    useCartStore.getState().addItem(makeItem(), 'maker-1', 'Test Kitchen')
    const { makers } = useCartStore.getState()
    expect(makers['maker-1']).toBeDefined()
    expect(makers['maker-1'].items).toHaveLength(1)
    expect(makers['maker-1'].items[0].quantity).toBe(1)
  })

  it('increments quantity when adding same item from same maker', () => {
    const item = makeItem()
    useCartStore.getState().addItem(item, 'maker-1', 'Test Kitchen')
    useCartStore.getState().addItem(item, 'maker-1', 'Test Kitchen')
    const { makers } = useCartStore.getState()
    expect(makers['maker-1'].items).toHaveLength(1)
    expect(makers['maker-1'].items[0].quantity).toBe(2)
  })

  it('supports items from multiple makers simultaneously', () => {
    useCartStore.getState().addItem(makeItem({ id: 'item-1', maker_id: 'maker-1' }), 'maker-1', 'Kitchen A')
    useCartStore.getState().addItem(makeItem({ id: 'item-2', maker_id: 'maker-2' }), 'maker-2', 'Kitchen B')
    const { makers } = useCartStore.getState()
    expect(Object.keys(makers)).toHaveLength(2)
    expect(makers['maker-1'].items).toHaveLength(1)
    expect(makers['maker-2'].items).toHaveLength(1)
  })

  it('removes an item and cleans up empty maker bucket', () => {
    useCartStore.getState().addItem(makeItem(), 'maker-1', 'Test Kitchen')
    useCartStore.getState().removeItem('item-1', 'maker-1')
    const { makers } = useCartStore.getState()
    expect(makers['maker-1']).toBeUndefined()
  })

  it('keeps other makers when one item is removed', () => {
    useCartStore.getState().addItem(makeItem({ id: 'item-1', maker_id: 'maker-1' }), 'maker-1', 'Kitchen A')
    useCartStore.getState().addItem(makeItem({ id: 'item-2', maker_id: 'maker-2' }), 'maker-2', 'Kitchen B')
    useCartStore.getState().removeItem('item-1', 'maker-1')
    const { makers } = useCartStore.getState()
    expect(makers['maker-1']).toBeUndefined()
    expect(makers['maker-2']).toBeDefined()
  })

  it('clearMaker removes only that maker', () => {
    useCartStore.getState().addItem(makeItem({ id: 'item-1' }), 'maker-1', 'Kitchen A')
    useCartStore.getState().addItem(makeItem({ id: 'item-2', maker_id: 'maker-2' }), 'maker-2', 'Kitchen B')
    useCartStore.getState().clearMaker('maker-1')
    const { makers } = useCartStore.getState()
    expect(makers['maker-1']).toBeUndefined()
    expect(makers['maker-2']).toBeDefined()
  })

  it('calculates subtotal across all makers', () => {
    useCartStore.getState().addItem(makeItem({ id: 'item-1', price: 10 }), 'maker-1', 'Kitchen A')
    useCartStore.getState().addItem(makeItem({ id: 'item-2', maker_id: 'maker-2', price: 5 }), 'maker-2', 'Kitchen B')
    const subtotal = useCartStore.getState().subtotal()
    expect(subtotal).toBe(15)
  })

  it('subtotalForMaker only counts items from that maker', () => {
    useCartStore.getState().addItem(makeItem({ id: 'item-1', price: 10 }), 'maker-1', 'Kitchen A')
    useCartStore.getState().addItem(makeItem({ id: 'item-2', maker_id: 'maker-2', price: 5 }), 'maker-2', 'Kitchen B')
    expect(useCartStore.getState().subtotalForMaker('maker-1')).toBe(10)
    expect(useCartStore.getState().subtotalForMaker('maker-2')).toBe(5)
  })

  it('updateQuantity removes item when quantity is 0', () => {
    useCartStore.getState().addItem(makeItem(), 'maker-1', 'Test Kitchen')
    useCartStore.getState().updateQuantity('item-1', 'maker-1', 0)
    const { makers } = useCartStore.getState()
    expect(makers['maker-1']).toBeUndefined()
  })

  it('clearCart resets everything', () => {
    useCartStore.getState().addItem(makeItem(), 'maker-1', 'Test Kitchen')
    useCartStore.getState().clearCart()
    expect(Object.keys(useCartStore.getState().makers)).toHaveLength(0)
  })

  it('totalItems counts all quantities across all makers', () => {
    useCartStore.getState().addItem(makeItem({ id: 'item-1' }), 'maker-1', 'Test Kitchen')
    useCartStore.getState().addItem(makeItem({ id: 'item-1' }), 'maker-1', 'Test Kitchen') // qty = 2
    useCartStore.getState().addItem(makeItem({ id: 'item-2', maker_id: 'maker-2' }), 'maker-2', 'Kitchen B')
    expect(useCartStore.getState().totalItems()).toBe(3)
  })

  it('makerIds returns all maker IDs in the cart', () => {
    useCartStore.getState().addItem(makeItem({ id: 'item-1' }), 'maker-1', 'Kitchen A')
    useCartStore.getState().addItem(makeItem({ id: 'item-2', maker_id: 'maker-2' }), 'maker-2', 'Kitchen B')
    const ids = useCartStore.getState().makerIds()
    expect(ids).toContain('maker-1')
    expect(ids).toContain('maker-2')
    expect(ids).toHaveLength(2)
  })
})
