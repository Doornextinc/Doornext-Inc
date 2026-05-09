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
  base_pay: number                 // fallback base pay when no tier matches
  per_mile: number                 // $/mile for dynamic mode
  per_min_wait: number             // $/min wait
  use_dynamic: boolean
  service_fee_pct: number          // % of subtotal charged to customer (default 9)
  platform_commission_pct: number  // % of subtotal taken from maker's revenue (default 5)
  priority_driver_bonus: number    // default $2.50
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
  party: 'customer' | 'driver' | 'maker' | 'platform'
}

export interface PricingResult {
  // ── What customer pays (on top of food subtotal) ──
  deliveryFee: number      // from distance tier (customer_fee)
  smallOrderFee: number
  surgeFee: number
  serviceFee: number       // service_fee_pct% of subtotal
  tip: number              // alias for driverTip

  // ── What driver earns ──
  driverBasePay: number    // from distance tier (driver_base_pay — may differ from deliveryFee)
  driverPriorityBonus: number
  driverSurgeShare: number
  driverTip: number
  driverTotal: number      // driverBasePay + priority + surge share + tip

  // ── What maker receives ──
  makerPayout: number      // subtotal - platform commission
  platformCommission: number // platform's cut from maker

  // ── Platform net revenue ──
  // serviceFee + smallOrderFee + surgeRetained + platformCommission - deliverySubsidy
  platformNet: number

  // Delivery subsidy: positive = platform subsidises driver (driver_base_pay > customer_fee)
  deliverySubsidy: number

  // Applied tier
  tierLabel: string
  isTierBased: boolean

  // Full line-item breakdown
  customerLines: PricingLineItem[]
  driverLines: PricingLineItem[]
  makerLines: PricingLineItem[]
  platformLines: PricingLineItem[]
}

// ─── Default formula ──────────────────────────────────────────────────────────
export const DEFAULT_FORMULA: PricingFormula = {
  base_pay: 2.50,
  per_mile: 0.80,
  per_min_wait: 0.30,
  use_dynamic: false,
  service_fee_pct: 9,
  platform_commission_pct: 5,
  priority_driver_bonus: 2.50,
}

// ─── Core fee split calculation ───────────────────────────────────────────────
/**
 * Given order inputs, returns the full fee split across
 * customer / driver / maker / platform.
 *
 * Fee model:
 *  • Customer pays:  subtotal + deliveryFee + serviceFee + smallOrderFee + surgeFee + tip
 *  • Driver receives: driverBasePay (from tier) + priority bonus + surge share + tip
 *  • Maker receives:  subtotal × (1 - platform_commission_pct)
 *  • Platform net:    serviceFee + smallOrderFee + surgeRetained + platformCommission - deliverySubsidy
 */
export function calculatePricing(input: PricingInput): PricingResult {
  const {
    distanceMiles,
    subtotal,
    tip = 0,
    isPriority = false,
    tiers,
    priorityTiers = [],
    smallOrderFees = [],
    activeSurgeConditions = [],
    formula = DEFAULT_FORMULA,
  } = input

  const r = (n: number) => Math.round(n * 100) / 100

  // Sort tiers by distance_min ascending so the fallback (last element) is
  // always the open-ended "10+ miles" catch-all tier, regardless of DB row order.
  const sortedTiers = [...tiers].sort((a, b) => a.distance_min - b.distance_min)

  // 1. Find matching standard distance tier
  const tier = sortedTiers.find(
    (t) => distanceMiles >= t.distance_min && (t.distance_max === null || distanceMiles < t.distance_max)
  ) ?? sortedTiers[sortedTiers.length - 1]

  let deliveryFee = r(tier?.customer_fee ?? 3.99)
  let driverBasePay = r(tier?.driver_base_pay ?? formula.base_pay)
  const tierLabel = tier?.label ?? 'Standard'

  // 2. Priority override
  const sortedPriorityTiers = [...priorityTiers].sort((a, b) => a.distance_min - b.distance_min)
  let driverPriorityBonus = 0
  if (isPriority && sortedPriorityTiers.length > 0) {
    const pt = sortedPriorityTiers.find(
      (t) => distanceMiles >= t.distance_min && (t.distance_max === null || distanceMiles < t.distance_max)
    ) ?? sortedPriorityTiers[sortedPriorityTiers.length - 1]
    if (pt) {
      deliveryFee = r(pt.customer_fee)
      driverPriorityBonus = r(pt.driver_priority_bonus)
    }
  }

  // 3. Small order fee — sort descending by order_value_min so we match the
  // most specific (highest minimum) bracket first.
  let smallOrderFee = 0
  if (smallOrderFees.length > 0) {
    const sortedSmallOrderFees = [...smallOrderFees].sort((a, b) => b.order_value_min - a.order_value_min)
    const sof = sortedSmallOrderFees.find(
      (f) => subtotal >= f.order_value_min && (f.order_value_max === null || subtotal < f.order_value_max)
    )
    smallOrderFee = r(sof?.fee ?? 0)
  }

  // 4. Surge fees
  let surgeFee = 0
  let driverSurgeShare = 0
  for (const sc of activeSurgeConditions) {
    surgeFee = r(surgeFee + sc.extra_fee)
    driverSurgeShare = r(driverSurgeShare + sc.extra_fee * (sc.driver_share_pct / 100))
  }
  const surgeRetained = r(surgeFee - driverSurgeShare)

  // 5. Service fee (charged to customer)
  const serviceFee = r(subtotal * (formula.service_fee_pct / 100))

  // 6. Platform commission from maker
  const commPct = formula.platform_commission_pct ?? 5
  const platformCommission = r(subtotal * (commPct / 100))
  const makerPayout = r(subtotal - platformCommission)

  // 7. Driver totals
  const driverTip = r(tip)
  const driverTotal = r(driverBasePay + driverPriorityBonus + driverSurgeShare + driverTip)

  // 8. Delivery subsidy: positive = platform pays more to driver than customer paid
  const deliverySubsidy = r(driverBasePay - deliveryFee)

  // 9. Platform net revenue
  const platformNet = r(serviceFee + smallOrderFee + surgeRetained + platformCommission - deliverySubsidy)

  // ── Line items ─────────────────────────────────────────────────────────────
  const customerLines: PricingLineItem[] = [
    { label: 'Delivery fee', amount: deliveryFee, note: isPriority ? 'Priority' : tierLabel, party: 'customer' },
    ...(smallOrderFee > 0 ? [{ label: 'Small order fee', amount: smallOrderFee, party: 'customer' as const }] : []),
    ...(surgeFee > 0 ? [{ label: 'Surge fee', amount: surgeFee, note: activeSurgeConditions.map((s) => s.label).join(', '), party: 'customer' as const }] : []),
    { label: 'Service fee', amount: serviceFee, note: `${formula.service_fee_pct}% of subtotal`, party: 'customer' },
    ...(driverTip > 0 ? [{ label: 'Tip', amount: driverTip, party: 'customer' as const }] : []),
  ]

  const driverLines: PricingLineItem[] = [
    { label: 'Delivery pay', amount: driverBasePay, note: tierLabel, party: 'driver' },
    ...(driverPriorityBonus > 0 ? [{ label: 'Priority bonus', amount: driverPriorityBonus, party: 'driver' as const }] : []),
    ...(driverSurgeShare > 0 ? [{ label: 'Surge share', amount: driverSurgeShare, party: 'driver' as const }] : []),
    ...(driverTip > 0 ? [{ label: 'Tip (100%)', amount: driverTip, party: 'driver' as const }] : []),
  ]

  const makerLines: PricingLineItem[] = [
    { label: 'Food subtotal', amount: subtotal, party: 'maker' },
    { label: `Platform commission (${commPct}%)`, amount: -platformCommission, party: 'maker' },
    { label: 'Your payout', amount: makerPayout, party: 'maker' },
  ]

  const platformLines: PricingLineItem[] = [
    { label: `Service fee (${formula.service_fee_pct}% of subtotal)`, amount: serviceFee, party: 'platform' },
    { label: `Maker commission (${commPct}% of subtotal)`, amount: platformCommission, party: 'platform' },
    ...(smallOrderFee > 0 ? [{ label: 'Small order fee', amount: smallOrderFee, party: 'platform' as const }] : []),
    ...(surgeRetained > 0 ? [{ label: 'Surge retained', amount: surgeRetained, party: 'platform' as const }] : []),
    ...(deliverySubsidy !== 0 ? [{ label: deliverySubsidy > 0 ? 'Delivery subsidy' : 'Delivery margin', amount: -deliverySubsidy, note: `driver_base_pay (${driverBasePay}) vs customer_fee (${deliveryFee})`, party: 'platform' as const }] : []),
  ]

  return {
    deliveryFee,
    smallOrderFee,
    surgeFee,
    serviceFee,
    tip: driverTip,
    driverBasePay,
    driverPriorityBonus,
    driverSurgeShare,
    driverTip,
    driverTotal,
    makerPayout,
    platformCommission,
    platformNet,
    deliverySubsidy,
    tierLabel,
    isTierBased: !formula.use_dynamic,
    customerLines,
    driverLines,
    makerLines,
    platformLines,
  }
}

// ─── Quick fee split for use at delivery completion ───────────────────────────
/**
 * Lightweight version that only needs the stored order columns
 * (no tier lookup needed — values already stamped on the order at creation).
 */
export interface OrderFeeSnapshot {
  subtotal: number
  delivery_fee: number
  service_fee: number
  small_order_fee: number
  surge_fee: number
  tip_amount: number
  driver_payout: number       // already calculated at order creation
  platform_fee_pct?: number   // defaults to 5
}

export interface FeeSnapshot {
  driverPayout: number
  makerPayout: number
  platformFee: number         // service_fee + small_order_fee + surge_retained + commission - subsidy
  platformCommission: number
  serviceFee: number
}

export function snapshotFees(order: OrderFeeSnapshot): FeeSnapshot {
  const r = (n: number) => Math.round(n * 100) / 100
  const commPct = order.platform_fee_pct ?? 5
  const platformCommission = r(order.subtotal * (commPct / 100))
  const makerPayout = r(order.subtotal - platformCommission)
  // Platform net = everything the customer pays minus driver payout minus maker payout.
  // Equivalent to: service_fee + small_order_fee + surge_fee + commission + delivery_fee - driver_payout
  // (delivery surplus goes to platform; delivery subsidy comes out of platform — handled by the sign)
  const platformFee = r(
    order.service_fee +
    (order.small_order_fee ?? 0) +
    (order.surge_fee ?? 0) +
    platformCommission +
    order.delivery_fee -
    order.driver_payout
  )
  const driverPayout = r(order.driver_payout + order.tip_amount)

  // Invariant: the three payouts MUST sum to what the customer paid.
  // customer total = subtotal + service_fee + small_order_fee + surge_fee + delivery_fee + tip
  // If this assertion fails, settlement is broken — fail loudly rather than silently mis-paying.
  const customerTotal = r(
    order.subtotal +
    order.service_fee +
    (order.small_order_fee ?? 0) +
    (order.surge_fee ?? 0) +
    order.delivery_fee +
    order.tip_amount
  )
  const sumPayouts = r(driverPayout + makerPayout + platformFee)
  if (Math.abs(sumPayouts - customerTotal) > 0.02) {
    throw new Error(
      `snapshotFees invariant violation: driver(${driverPayout}) + maker(${makerPayout}) + platform(${platformFee}) = ${sumPayouts}, but customer paid ${customerTotal}`
    )
  }

  return {
    driverPayout,
    makerPayout,
    platformFee,
    platformCommission,
    serviceFee: order.service_fee,
  }
}
