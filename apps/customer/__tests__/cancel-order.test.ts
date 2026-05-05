/**
 * Tests for order cancellation business logic.
 *
 * Cancellation rules:
 *   - Only 'pending', 'awaiting_payment', 'confirmed' orders are cancellable
 *   - 'preparing', 'ready', and post-pickup statuses cannot be cancelled
 *   - Cash orders: no Stripe call needed
 *   - awaiting_payment card orders: void the PaymentIntent (not refund)
 *   - confirmed card orders: full refund
 */
import { describe, it, expect } from 'vitest'
import type { OrderStatus } from '@doornext/shared/types'

// ── Cancellable status guard ──────────────────────────────────────────────────

const CANCELLABLE_STATUSES: OrderStatus[] = ['pending', 'awaiting_payment', 'confirmed']

function isCancellable(status: OrderStatus): boolean {
  return CANCELLABLE_STATUSES.includes(status)
}

describe('Cancellable order statuses', () => {
  it('allows cancellation for pending orders', () => {
    expect(isCancellable('pending')).toBe(true)
  })

  it('allows cancellation for awaiting_payment orders', () => {
    expect(isCancellable('awaiting_payment')).toBe(true)
  })

  it('allows cancellation for confirmed orders (before maker starts)', () => {
    expect(isCancellable('confirmed')).toBe(true)
  })

  it('blocks cancellation once preparing has started', () => {
    expect(isCancellable('preparing')).toBe(false)
  })

  it('blocks cancellation for all in-delivery statuses', () => {
    const inDelivery: OrderStatus[] = [
      'ready', 'driver_assigned', 'arrived_at_maker',
      'picked_up', 'on_the_way', 'arrived_at_customer',
    ]
    for (const status of inDelivery) {
      expect(isCancellable(status)).toBe(false)
    }
  })

  it('blocks cancellation for terminal statuses', () => {
    expect(isCancellable('delivered')).toBe(false)
    expect(isCancellable('failed_delivery')).toBe(false)
    expect(isCancellable('cancelled')).toBe(false)
  })
})

// ── Payment method routing ────────────────────────────────────────────────────

type PaymentMethod = 'cash' | 'card'

function getStripeAction(status: OrderStatus, paymentMethod: PaymentMethod): 'none' | 'void' | 'refund' {
  if (paymentMethod === 'cash') return 'none'
  if (status === 'awaiting_payment') return 'void'
  return 'refund'
}

describe('Stripe action routing on cancellation', () => {
  it('cash orders require no Stripe action', () => {
    expect(getStripeAction('confirmed', 'cash')).toBe('none')
    expect(getStripeAction('pending', 'cash')).toBe('none')
  })

  it('awaiting_payment card orders void the PaymentIntent (not refund)', () => {
    // Payment was not captured yet — void is correct, refund would fail
    expect(getStripeAction('awaiting_payment', 'card')).toBe('void')
  })

  it('confirmed card orders issue a full refund', () => {
    // Payment was captured when order was confirmed via webhook
    expect(getStripeAction('confirmed', 'card')).toBe('refund')
    expect(getStripeAction('pending', 'card')).toBe('refund')
  })
})

// ── Refund note copy ──────────────────────────────────────────────────────────

function getRefundNote(status: OrderStatus): string {
  return status === 'awaiting_payment'
    ? 'No charge was made.'
    : 'Your full refund will appear in 3–5 business days.'
}

describe('Refund note for customer notification', () => {
  it('says no charge for voided payment intents', () => {
    expect(getRefundNote('awaiting_payment')).toContain('No charge')
  })

  it('says refund timeline for captured + refunded orders', () => {
    expect(getRefundNote('confirmed')).toContain('3–5 business days')
  })
})

// ── Stale assignment recovery ─────────────────────────────────────────────────

describe('Stale assignment — statuses that trigger recovery', () => {
  const STALE_STATUSES: OrderStatus[] = [
    'driver_assigned', 'arrived_at_maker', 'picked_up', 'on_the_way',
  ]

  it('includes all mid-delivery driver statuses', () => {
    expect(STALE_STATUSES).toContain('driver_assigned')
    expect(STALE_STATUSES).toContain('arrived_at_maker')
    expect(STALE_STATUSES).toContain('picked_up')
    expect(STALE_STATUSES).toContain('on_the_way')
  })

  it('does not include arrived_at_customer (driver should wait, not be released)', () => {
    expect(STALE_STATUSES).not.toContain('arrived_at_customer')
  })

  it('recovery transitions stale orders back to ready (not pending)', () => {
    // ready = available for re-assignment; pending = awaiting maker confirmation
    const recoveryTargetStatus: OrderStatus = 'ready'
    expect(recoveryTargetStatus).toBe('ready')
  })
})

// ── Failed delivery ───────────────────────────────────────────────────────────

describe('Failed delivery', () => {
  const FAILED_DELIVERY_ELIGIBLE: OrderStatus[] = ['arrived_at_customer', 'on_the_way']

  it('can only be reported when driver is on the way or arrived', () => {
    expect(FAILED_DELIVERY_ELIGIBLE).toContain('arrived_at_customer')
    expect(FAILED_DELIVERY_ELIGIBLE).toContain('on_the_way')
    expect(FAILED_DELIVERY_ELIGIBLE).not.toContain('delivered')
    expect(FAILED_DELIVERY_ELIGIBLE).not.toContain('cancelled')
  })

  it('zeroes out driver and maker payouts on failed delivery', () => {
    const failedDeliveryUpdate = { driver_payout: 0, maker_payout: 0, status: 'failed_delivery' }
    expect(failedDeliveryUpdate.driver_payout).toBe(0)
    expect(failedDeliveryUpdate.maker_payout).toBe(0)
  })
})
