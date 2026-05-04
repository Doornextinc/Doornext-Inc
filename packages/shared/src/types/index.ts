export type OrderStatus =
  | 'awaiting_payment'
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'driver_assigned'
  | 'arrived_at_maker'
  | 'picked_up'
  | 'on_the_way'
  | 'arrived_at_customer'
  | 'delivered'
  | 'failed_delivery'
  | 'cancelled'

export type UserRole = 'customer' | 'maker' | 'driver' | 'admin'

export interface User {
  id: string
  email: string | null
  phone: string | null
  full_name: string
  avatar_url: string | null
  default_address_id: string | null
  role: UserRole
  created_at: string
}

export interface Address {
  id: string
  user_id: string
  label: string
  street: string
  city: string
  state: string
  zip: string
  lat: number
  lng: number
}

export interface FoodMaker {
  id: string
  user_id: string
  display_name: string
  bio: string | null
  avatar_url: string | null
  banner_url: string | null
  cuisine_tags: string[]
  avg_rating: number
  total_reviews: number
  is_open: boolean
  service_radius_km: number
  lat: number
  lng: number
  prep_time_mins: number
  distance_km?: number
  created_at: string
  approval_status?: 'pending' | 'approved' | 'rejected'
  rejection_reason?: string | null
}

export interface MenuItem {
  id: string
  maker_id: string
  name: string
  description: string | null
  price: number
  photo_url: string | null
  dietary_tags: string[]
  is_available: boolean
  daily_limit: number | null
  prep_time_mins: number
  category: string | null
}

export interface CartItem {
  menu_item: MenuItem
  quantity: number
  notes: string
}

export interface Order {
  id: string
  customer_id: string
  maker_id: string
  nexter_id: string | null
  status: OrderStatus
  subtotal: number
  delivery_fee: number
  tip_amount: number
  platform_fee: number
  total: number
  delivery_address: Address
  stripe_payment_intent_id: string | null
  scheduled_for: string | null
  /** 4-digit pickup confirmation PIN — shown to driver, entered by maker */
  pickup_pin: string | null
  /** Cumulative failed PIN attempts; locked out after 5 */
  pin_attempts: number
  created_at: string
  updated_at: string
  food_maker?: FoodMaker
  order_items?: OrderItem[]
}

export interface OrderItem {
  id: string
  order_id: string
  menu_item_id: string
  quantity: number
  unit_price: number
  customization_notes: string | null
  menu_item?: MenuItem
}

export interface Review {
  id: string
  order_id: string
  customer_id: string
  maker_id: string
  rating: number
  body: string | null
  created_at: string
  user?: User
}

export interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  body: string
  data: Record<string, unknown>
  read: boolean
  created_at: string
}

export interface NexterLocation {
  nexter_id: string
  lat: number
  lng: number
  updated_at: string
}

export interface DriverProfile {
  id: string
  full_name: string
  avatar_url: string | null
  vehicle_type: 'car' | 'bike' | 'foot' | null
  is_active: boolean
  total_deliveries: number
  avg_rating: number
  created_at: string
}
