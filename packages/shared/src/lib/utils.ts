import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export function formatPriceDollars(dollars: number): string {
  return `$${dollars.toFixed(2)}`
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`
  return `${km.toFixed(1)}km`
}

export function formatTime(mins: number): string {
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Estimate travel time in minutes for a given straight-line distance.
 * Uses urban speeds with a small buffer for real-world conditions.
 */
export function estimateMinutes(
  distanceKm: number,
  vehicleType: 'car' | 'bike' | 'foot' | null = null,
): number {
  const speedKmh = vehicleType === 'foot' ? 4 : vehicleType === 'bike' ? 14 : 22
  return Math.max(1, Math.round((distanceKm / speedKmh) * 60 + 1.5))
}

/** Format an ETA as a friendly string: "3 min", "1h 5m" */
export function formatEta(minutes: number): string {
  if (minutes < 2) return '< 2 min'
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** Format an arrival clock time: "Arrives by 6:35 PM" */
export function arrivalTimeStr(minutesFromNow: number): string {
  const d = new Date(Date.now() + minutesFromNow * 60_000)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Order Placed',
  confirmed: 'Confirmed',
  preparing: 'Being Prepared',
  ready: 'Ready for Pickup',
  picked_up: 'Picked Up',
  on_the_way: 'On The Way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

export const CUISINE_TAGS = [
  'All',
  'Nigerian',
  'Mexican',
  'Indian',
  'Chinese',
  'Caribbean',
  'Soul Food',
  'Thai',
  'Italian',
  'Halal',
  'Vegan',
  'Gluten-Free',
]

export const DIETARY_TAG_COLORS: Record<string, string> = {
  vegan: 'bg-green-100 text-green-700',
  vegetarian: 'bg-lime-100 text-lime-700',
  halal: 'bg-emerald-100 text-emerald-700',
  'gluten-free': 'bg-yellow-100 text-yellow-700',
  dairy_free: 'bg-blue-100 text-blue-700',
  spicy: 'bg-red-100 text-red-700',
}
