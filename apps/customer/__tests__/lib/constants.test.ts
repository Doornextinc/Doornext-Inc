import { describe, it, expect } from 'vitest'
import {
  DELIVERY_FEE,
  PLATFORM_FEE_PCT,
  FALLBACK_LAT,
  FALLBACK_LNG,
  FALLBACK_LOCATION_LABEL,
} from '@/lib/constants'

describe('Fee constants', () => {
  it('DELIVERY_FEE is a positive number', () => {
    expect(typeof DELIVERY_FEE).toBe('number')
    expect(DELIVERY_FEE).toBeGreaterThan(0)
  })

  it('PLATFORM_FEE_PCT is a fraction between 0 and 1', () => {
    expect(typeof PLATFORM_FEE_PCT).toBe('number')
    expect(PLATFORM_FEE_PCT).toBeGreaterThan(0)
    expect(PLATFORM_FEE_PCT).toBeLessThan(1)
  })
})

describe('Fallback location', () => {
  it('has valid Brooklyn coordinates', () => {
    expect(typeof FALLBACK_LAT).toBe('number')
    expect(typeof FALLBACK_LNG).toBe('number')
    // Brooklyn, NY latitude/longitude ranges
    expect(FALLBACK_LAT).toBeGreaterThan(40)
    expect(FALLBACK_LAT).toBeLessThan(41)
    expect(FALLBACK_LNG).toBeGreaterThan(-75)
    expect(FALLBACK_LNG).toBeLessThan(-73)
  })

  it('has a non-empty location label', () => {
    expect(typeof FALLBACK_LOCATION_LABEL).toBe('string')
    expect(FALLBACK_LOCATION_LABEL.length).toBeGreaterThan(0)
  })
})
