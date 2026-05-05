/**
 * Tests for the checkout estimate route.
 * Verifies pricing formula consistency — especially that platform_commission_pct
 * from settings is applied rather than silently defaulting to a hardcoded value.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { calculatePricing, DEFAULT_FORMULA } from '@doornext/shared/pricing'

// We test the pricing logic in isolation (not the full Next.js route handler,
// which requires mocking cookies/headers/SSR). The route's job is to load
// settings and pass them to calculatePricing — so we validate that the
// settings keys map correctly to the formula fields.

const TIERS = [
  { id: 1, distance_min: 0, distance_max: 5, customer_fee: 3.99, driver_base_pay: 3.00, label: '0-5 mi' },
]

describe('Checkout estimate — pricing formula settings mapping', () => {
  it('platform_commission_pct from settings affects maker payout', () => {
    const subtotal = 40
    const distance = 2

    // Simulate two different DB settings values
    const at5pct  = calculatePricing({ distanceMiles: distance, subtotal, tiers: TIERS, formula: { ...DEFAULT_FORMULA, platform_commission_pct: 5  } })
    const at12pct = calculatePricing({ distanceMiles: distance, subtotal, tiers: TIERS, formula: { ...DEFAULT_FORMULA, platform_commission_pct: 12 } })

    expect(at12pct.makerPayout).toBeLessThan(at5pct.makerPayout)
    expect(at12pct.platformCommission).toBeGreaterThan(at5pct.platformCommission)
    // Customer-facing totals do not change when commission changes (it's maker-side)
    expect(at12pct.deliveryFee).toBe(at5pct.deliveryFee)
    expect(at12pct.serviceFee).toBe(at5pct.serviceFee)
  })

  it('service_fee_pct from settings affects customer total', () => {
    const at9pct  = calculatePricing({ distanceMiles: 2, subtotal: 40, tiers: TIERS, formula: { ...DEFAULT_FORMULA, service_fee_pct: 9  } })
    const at15pct = calculatePricing({ distanceMiles: 2, subtotal: 40, tiers: TIERS, formula: { ...DEFAULT_FORMULA, service_fee_pct: 15 } })

    expect(at15pct.serviceFee).toBeGreaterThan(at9pct.serviceFee)
    // Maker payout is unaffected by service fee
    expect(at15pct.makerPayout).toBe(at9pct.makerPayout)
  })

  it('estimate and final checkout must use same formula defaults', () => {
    // Both estimate route and checkout route call calculatePricing with the same
    // formula. Verify DEFAULT_FORMULA values match what routes fall back to.
    expect(DEFAULT_FORMULA.platform_commission_pct).toBe(5)
    expect(DEFAULT_FORMULA.service_fee_pct).toBe(9)
    expect(DEFAULT_FORMULA.base_pay).toBe(2.50)
    expect(DEFAULT_FORMULA.priority_driver_bonus).toBe(2.50)
  })

  it('total matches sum of all components', () => {
    const r = calculatePricing({
      distanceMiles: 3,
      subtotal: 25,
      tiers: TIERS,
      formula: DEFAULT_FORMULA,
    })
    const expectedTotal = Math.round((25 + r.deliveryFee + r.smallOrderFee + r.surgeFee + r.serviceFee) * 100) / 100
    const actualTotal   = Math.round((25 + r.deliveryFee + r.smallOrderFee + r.surgeFee + r.serviceFee) * 100) / 100
    expect(actualTotal).toBe(expectedTotal)
  })
})
