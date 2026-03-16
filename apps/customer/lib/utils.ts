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

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Order Placed',
  confirmed: 'Confirmed',
  preparing: 'Being Prepared',
  ready: 'Ready for Pickup',
  driver_assigned: 'Driver Assigned',
  arrived_at_maker: 'Driver at Restaurant',
  picked_up: 'Picked Up',
  on_the_way: 'On The Way',
  arrived_at_customer: 'Driver Arrived',
  delivered: 'Delivered',
  failed_delivery: 'Delivery Failed',
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
