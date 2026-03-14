import { describe, it, expect } from 'vitest'
import {
  formatPrice,
  formatPriceDollars,
  formatDistance,
  formatTime,
  haversineDistance,
  ORDER_STATUS_LABELS,
} from '@/lib/utils'

describe('formatPrice', () => {
  it('formats cents to dollar string', () => {
    expect(formatPrice(1000)).toBe('$10.00')
    expect(formatPrice(999)).toBe('$9.99')
    expect(formatPrice(0)).toBe('$0.00')
  })
})

describe('formatPriceDollars', () => {
  it('formats dollars to dollar string', () => {
    expect(formatPriceDollars(10)).toBe('$10.00')
    expect(formatPriceDollars(9.99)).toBe('$9.99')
    expect(formatPriceDollars(0)).toBe('$0.00')
  })
})

describe('formatDistance', () => {
  it('returns meters for distances under 1km', () => {
    expect(formatDistance(0.5)).toBe('500m')
    expect(formatDistance(0.1)).toBe('100m')
  })

  it('returns km for distances 1km and over', () => {
    expect(formatDistance(1)).toBe('1.0km')
    expect(formatDistance(2.5)).toBe('2.5km')
  })
})

describe('formatTime', () => {
  it('returns minutes for under 60', () => {
    expect(formatTime(30)).toBe('30 min')
    expect(formatTime(1)).toBe('1 min')
  })

  it('returns hours for 60+', () => {
    expect(formatTime(60)).toBe('1h')
    expect(formatTime(90)).toBe('1h 30m')
    expect(formatTime(120)).toBe('2h')
  })
})

describe('haversineDistance', () => {
  it('returns 0 for same coordinates', () => {
    expect(haversineDistance(40.6782, -73.9442, 40.6782, -73.9442)).toBe(0)
  })

  it('calculates approximate distance between two NYC points', () => {
    // Brooklyn to Manhattan ~ 7-10km
    const dist = haversineDistance(40.6782, -73.9442, 40.7580, -73.9855)
    expect(dist).toBeGreaterThan(5)
    expect(dist).toBeLessThan(15)
  })

  it('returns a positive number for different coordinates', () => {
    const dist = haversineDistance(0, 0, 1, 1)
    expect(dist).toBeGreaterThan(0)
  })
})

describe('ORDER_STATUS_LABELS', () => {
  it('has labels for all key statuses', () => {
    expect(ORDER_STATUS_LABELS.pending).toBe('Order Placed')
    expect(ORDER_STATUS_LABELS.confirmed).toBe('Confirmed')
    expect(ORDER_STATUS_LABELS.delivered).toBe('Delivered')
    expect(ORDER_STATUS_LABELS.cancelled).toBe('Cancelled')
  })
})
