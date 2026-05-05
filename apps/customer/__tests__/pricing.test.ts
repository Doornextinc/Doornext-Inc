/**
 * Unit tests for the shared pricing engine.
 * These tests protect revenue calculations — any change to fee splits
 * must be explicitly verified here.
 */
import { describe, it, expect } from 'vitest'
import {
  calculatePricing,
  snapshotFees,
  DEFAULT_FORMULA,
  type DistanceTier,
  type PricingFormula,
} from '@doornext/shared/pricing'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TIERS: DistanceTier[] = [
  { id: 1, distance_min: 0,  distance_max: 2,    customer_fee: 2.99, driver_base_pay: 2.50, label: '0-2 mi'  },
  { id: 2, distance_min: 2,  distance_max: 5,    customer_fee: 4.49, driver_base_pay: 3.50, label: '2-5 mi'  },
  { id: 3, distance_min: 5,  distance_max: 10,   customer_fee: 5.99, driver_base_pay: 4.50, label: '5-10 mi' },
  { id: 4, distance_min: 10, distance_max: null, customer_fee: 7.99, driver_base_pay: 6.00, label: '10+ mi'  },
]

const BASE_INPUT = {
  distanceMiles: 3,
  subtotal: 25,
  tiers: TIERS,
}

// ── Core fee calculation ──────────────────────────────────────────────────────

describe('calculatePricing — delivery fee', () => {
  it('selects the correct distance tier', () => {
    const r = calculatePricing(BASE_INPUT)
    expect(r.deliveryFee).toBe(4.49)  // 3 miles → 2-5 mi tier
    expect(r.tierLabel).toBe('2-5 mi')
  })

  it('uses the 0-2 mi tier for very short distances', () => {
    const r = calculatePricing({ ...BASE_INPUT, distanceMiles: 1 })
    expect(r.deliveryFee).toBe(2.99)
  })

  it('uses the catch-all 10+ mi tier for long distances', () => {
    const r = calculatePricing({ ...BASE_INPUT, distanceMiles: 15 })
    expect(r.deliveryFee).toBe(7.99)
    expect(r.driverBasePay).toBe(6.00)
  })

  it('falls back to last tier when no tier matches and distance is 0', () => {
    const r = calculatePricing({ ...BASE_INPUT, distanceMiles: 0, tiers: TIERS })
    expect(r.deliveryFee).toBe(2.99)
  })
})

describe('calculatePricing — service fee', () => {
  it('calculates service fee as % of subtotal', () => {
    const r = calculatePricing({ ...BASE_INPUT, formula: { ...DEFAULT_FORMULA, service_fee_pct: 10 } })
    expect(r.serviceFee).toBe(2.50)  // 10% of $25
  })

  it('uses DEFAULT_FORMULA service_fee_pct when formula is omitted', () => {
    const r = calculatePricing(BASE_INPUT)
    expect(r.serviceFee).toBe(Math.round(25 * 0.09 * 100) / 100)
  })
})

describe('calculatePricing — platform commission', () => {
  it('calculates maker payout using platform_commission_pct', () => {
    const formula: PricingFormula = { ...DEFAULT_FORMULA, platform_commission_pct: 10 }
    const r = calculatePricing({ ...BASE_INPUT, formula })
    expect(r.platformCommission).toBe(2.50)   // 10% of $25
    expect(r.makerPayout).toBe(22.50)         // $25 - $2.50
  })

  it('uses 5% commission from DEFAULT_FORMULA when not specified', () => {
    const r = calculatePricing(BASE_INPUT)
    expect(r.platformCommission).toBe(Math.round(25 * 0.05 * 100) / 100)
    expect(r.makerPayout).toBe(Math.round(25 * 0.95 * 100) / 100)
  })

  it('changing platform_commission_pct changes maker payout consistently', () => {
    const r5  = calculatePricing({ ...BASE_INPUT, formula: { ...DEFAULT_FORMULA, platform_commission_pct: 5  } })
    const r15 = calculatePricing({ ...BASE_INPUT, formula: { ...DEFAULT_FORMULA, platform_commission_pct: 15 } })

    expect(r15.platformCommission).toBeGreaterThan(r5.platformCommission)
    expect(r15.makerPayout).toBeLessThan(r5.makerPayout)
    // Total paid by customer should not change when commission changes
    expect(r15.serviceFee).toBe(r5.serviceFee)
    expect(r15.deliveryFee).toBe(r5.deliveryFee)
  })
})

describe('calculatePricing — small order fee', () => {
  it('applies small order fee when subtotal is below threshold', () => {
    const smallOrderFees = [
      { id: 1, order_value_min: 0, order_value_max: 10, fee: 1.99, label: 'Under $10' },
      { id: 2, order_value_min: 10, order_value_max: 20, fee: 0.99, label: '$10-$20'  },
    ]
    const r = calculatePricing({ ...BASE_INPUT, subtotal: 8, smallOrderFees })
    expect(r.smallOrderFee).toBe(1.99)
  })

  it('applies no small order fee when subtotal is above all thresholds', () => {
    const smallOrderFees = [
      { id: 1, order_value_min: 0, order_value_max: 10, fee: 1.99, label: 'Under $10' },
    ]
    const r = calculatePricing({ ...BASE_INPUT, subtotal: 50, smallOrderFees })
    expect(r.smallOrderFee).toBe(0)
  })
})

describe('calculatePricing — surge fees', () => {
  it('adds surge fee and splits driver share correctly', () => {
    const surge = [{ id: 1, condition_type: 'time', label: 'Weekend', extra_fee: 2.00, driver_share_pct: 50, is_active: true }]
    const r = calculatePricing({ ...BASE_INPUT, activeSurgeConditions: surge })
    expect(r.surgeFee).toBe(2.00)
    expect(r.driverSurgeShare).toBe(1.00)
  })
})

describe('calculatePricing — priority', () => {
  it('applies priority tier when isPriority is true', () => {
    const priorityTiers = [
      { id: 1, distance_min: 0, distance_max: null, customer_fee: 8.99, driver_priority_bonus: 3.00, label: 'Priority' },
    ]
    const r = calculatePricing({ ...BASE_INPUT, isPriority: true, priorityTiers })
    expect(r.deliveryFee).toBe(8.99)
    expect(r.driverPriorityBonus).toBe(3.00)
  })
})

describe('calculatePricing — tip', () => {
  it('passes tip to driver total and does not add to platform', () => {
    const r = calculatePricing({ ...BASE_INPUT, tip: 5 })
    expect(r.tip).toBe(5)
    expect(r.driverTip).toBe(5)
    expect(r.driverTotal).toBe(r.driverBasePay + r.driverPriorityBonus + r.driverSurgeShare + 5)
  })
})

describe('calculatePricing — total consistency', () => {
  it('platform net = serviceFee + smallOrderFee + surgeRetained + commission - subsidy', () => {
    const surge = [{ id: 1, condition_type: 'time', label: 'Peak', extra_fee: 2.00, driver_share_pct: 50, is_active: true }]
    const smallOrderFees = [{ id: 1, order_value_min: 0, order_value_max: 30, fee: 0.99, label: 'Small' }]
    const r = calculatePricing({ ...BASE_INPUT, activeSurgeConditions: surge, smallOrderFees })
    const surgeRetained = r.surgeFee - r.driverSurgeShare
    const expected = Math.round((
      r.serviceFee + r.smallOrderFee + surgeRetained + r.platformCommission - r.deliverySubsidy
    ) * 100) / 100
    expect(r.platformNet).toBe(expected)
  })
})

// ── snapshotFees ──────────────────────────────────────────────────────────────

describe('snapshotFees', () => {
  it('calculates payout correctly from stored order columns', () => {
    const order = {
      subtotal: 30,
      delivery_fee: 4.49,
      service_fee: 2.70,
      small_order_fee: 0,
      surge_fee: 0,
      tip_amount: 3,
      driver_payout: 3.50,
      platform_fee_pct: 5,
    }
    const snap = snapshotFees(order)
    expect(snap.makerPayout).toBe(28.50)         // 30 * 0.95
    expect(snap.platformCommission).toBe(1.50)   // 30 * 0.05
    expect(snap.driverPayout).toBe(6.50)         // 3.50 base + 3 tip
  })
})
