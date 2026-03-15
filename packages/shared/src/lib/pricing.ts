// ─── Types ────────────────────────────────────────────────────────────────────

export interface DistanceTier {
  id: number
  distance_min: number
  distance_max: number | null
  customer_fee: number
  driver_base_pay: number
  label: string
}

export interface PriorityTier {
  id: number
  distance_min: number
  distance_max: number | null
  customer_fee: number
  driver_priority_bonus: number
  label: string
}

export interface SmallOrderFee {
  id: number
  order_value_min: number
  order_value_max: number | null
  fee: number
  label: string
}

export interface SurgeConditionData {
  id: number
  condition_type: string
  label: string
  extra_fee: number
  driver_share_pct: number
  is_active: boolean
}

export interface PricingFormula {
  base_pay: number         // default $2.50
  per_mile: number         // default $0.80
  per_min_wait: number     // default $0.30
  use_dynamic: boolean
  service_fee_pct: number  // default 9 (%)
  priority_driver_bonus: number // default $2.50
}

export interface PricingInput {
  distanceMiles: number
  subtotal: number
  tip?: number
  isPriority?: boolean
  waitMinutes?: number
  tiers: DistanceTier[]
  priorityTiers?: PriorityTier[]
  smallOrderFees?: SmallOrderFee[]
  activeSurgeConditions?: SurgeConditionData[]
  formula?: PricingFormula
}

export interface PricingLineItem {
  label: string
  amount: number
  note?: string
  party: 'customer' | 'driver' | 'platform'
}

export interface PricingResult {
  // What customer pays (on top of food subtotal)
  deliveryFee: number       // base delivery fee from tier
  smallOrderFee: number     // small order surcharge
  surgeFee: number          // surge extra
  serviceFee: number        // platform service fee
  tip: number

  // What driver earns
  driverBasePay: number
  driverPriorityBonus: number
  driverSurgeShare: number
  driverTip: number
  driverTotal: number

  // Platform keeps
  platformKeeps: number

  // Applied tier labels
  tierLabel: string
  isTierBased: boolean

  // Full line-item breakdown
  customerLines: PricingLineItem[]
  driverLines: PricingLineItem[]
  platformLines: PricingLineItem[]
}

// ─── Default formula ──────────────────────────────────────────────────────────
export const DEFAULT_FORMULA: PricingFormula = {
  base_pay: 2.50,
  per_mile: 0.80,
  per_min_wait: 0.30,
  use_dynamic: false,
  service_fee_pct: 9,
  priority_driver_bonus: 2.50,
}

// ─── Core calculation ─────────────────────────────────────────────────────────
export function calculatePricing(input: PricingInput): PricingResult {
  const {
    distanceMiles,
    subtotal,
    tip = 0,
    isPriority = false,
    waitMinutes = 0,
    tiers,
    priorityTiers = [],
    smallOrderFees = [],
    activeSurgeConditions = [],
    formula = DEFAULT_FORMULA,
  } = input

  const r = (n: number) => Math.round(n * 100) / 100

  // 1. Find matching standard distance tier
  const tier = tiers.find(
    (t) => distanceMiles >= t.distance_min && (t.distance_max === null || distanceMiles < t.distance_max)
  ) ?? tiers[tiers.length - 1]

  let deliveryFee = r(tier?.customer_fee ?? 3.99)
  const tierLabel = tier?.label ?? 'Standard'

  // 2. Priority override
  let driverPriorityBonus = 0
  if (isPriority && priorityTiers.length > 0) {
    const pt = priorityTiers.find(
      (t) => distanceMiles >= t.distance_min && (t.distance_max === null || distanceMiles < t.distance_max)
    ) ?? priorityTiers[priorityTiers.length - 1]
    if (pt) {
      deliveryFee = r(pt.customer_fee)
      driverPriorityBonus = r(pt.driver_priority_bonus)
    }
  }

  // 4. Small order fee
  let smallOrderFee = 0
  if (smallOrderFees.length > 0) {
    const sof = smallOrderFees.find(
      (f) => subtotal >= f.order_value_min && (f.order_value_max === null || subtotal < f.order_value_max)
    )
    smallOrderFee = r(sof?.fee ?? 0)
  }

  // 5. Surge fees
  let surgeFee = 0
  let driverSurgeShare = 0
  for (const sc of activeSurgeConditions) {
    surgeFee = r(surgeFee + sc.extra_fee)
    driverSurgeShare = r(driverSurgeShare + sc.extra_fee * (sc.driver_share_pct / 100))
  }

  // 6. Service fee
  const serviceFee = r(subtotal * (formula.service_fee_pct / 100))

  // 7. Totals — driver receives 100% of delivery fee + 100% of tips
  const driverTip = r(tip)
  const driverTotal = r(deliveryFee + driverPriorityBonus + driverSurgeShare + driverTip)

  // Platform keeps: service fee + surge platform share + small order fee
  // (delivery fee goes entirely to driver — no delivery margin for platform)
  const platformKeeps = r(
    serviceFee +
    (surgeFee - driverSurgeShare) +
    smallOrderFee
  )

  // Line items
  const customerLines: PricingLineItem[] = [
    { label: `Delivery fee`, amount: deliveryFee, note: isPriority ? 'Priority' : tierLabel, party: 'customer' },
    ...(smallOrderFee > 0 ? [{ label: 'Small order fee', amount: smallOrderFee, party: 'customer' as const }] : []),
    ...(surgeFee > 0 ? [{ label: 'Surge fee', amount: surgeFee, note: activeSurgeConditions.map((s) => s.label).join(', '), party: 'customer' as const }] : []),
    { label: 'Service fee', amount: serviceFee, note: `${formula.service_fee_pct}% of subtotal`, party: 'customer' },
    ...(driverTip > 0 ? [{ label: 'Tip', amount: driverTip, party: 'customer' as const }] : []),
  ]

  const driverLines: PricingLineItem[] = [
    { label: 'Delivery fee (100%)', amount: deliveryFee, note: tierLabel, party: 'driver' },
    ...(driverPriorityBonus > 0 ? [{ label: 'Priority bonus', amount: driverPriorityBonus, party: 'driver' as const }] : []),
    ...(driverSurgeShare > 0 ? [{ label: 'Surge share', amount: driverSurgeShare, party: 'driver' as const }] : []),
    ...(driverTip > 0 ? [{ label: 'Tip (100%)', amount: driverTip, party: 'driver' as const }] : []),
  ]

  const platformLines: PricingLineItem[] = [
    { label: 'Service fee', amount: serviceFee, party: 'platform' },
    ...(smallOrderFee > 0 ? [{ label: 'Small order fee', amount: smallOrderFee, party: 'platform' as const }] : []),
    ...(surgeFee - driverSurgeShare > 0 ? [{ label: 'Surge platform share', amount: r(surgeFee - driverSurgeShare), party: 'platform' as const }] : []),
  ]

  return {
    deliveryFee,
    smallOrderFee,
    surgeFee,
    serviceFee,
    tip: driverTip,
    driverBasePay: deliveryFee,
    driverPriorityBonus,
    driverSurgeShare,
    driverTip,
    driverTotal,
    platformKeeps,
    tierLabel,
    isTierBased: !formula.use_dynamic,
    customerLines,
    driverLines,
    platformLines,
  }
}
