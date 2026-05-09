/**
 * DoorDash-style order stacking utilities
 *
 * Implements:
 *   - haversineKm()            — great-circle distance between two lat/lng points
 *   - scoreStackCompatibility() — decides if an existing + candidate order can be stacked
 *   - optimizeStops()          — enumerates all valid orderings and returns the shortest route
 *
 * All distances are in kilometres unless noted.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface LatLng {
  lat: number
  lng: number
}

/** One stop on a multi-order route plan. Mirrors the DB JSONB shape. */
export interface RouteStop {
  seq: number                     // 1-based position (assigned by optimizeStops)
  type: 'pickup' | 'dropoff'
  order_id: string
  lat: number
  lng: number
  label: string                   // maker name for pickup, street for dropoff
  done: boolean
}

/** Returned by scoreStackCompatibility when two orders CAN be stacked. */
export interface CompatibilityScore {
  /** 0–100, higher = better fit */
  score: number
  /** Total extra km the driver adds versus direct single delivery */
  detourKm: number
  /** Recommended route stop list in optimised order */
  stops: RouteStop[]
  /** Sum of all leg distances in km */
  totalDistanceKm: number
}

/** Minimum order shape needed for compatibility scoring. */
export interface StackableOrder {
  id: string
  /** Pickup location (maker kitchen) */
  pickup: LatLng & { label: string }
  /** Dropoff location (customer address) */
  dropoff: LatLng & { label: string }
}

// ── Haversine ─────────────────────────────────────────────────────────────
//
// Audit finding 1.6: previously this module had its own Haversine impl
// (Math.asin form) parallel to the one in utils.ts (Math.atan2 form). Both
// computed the same result but drift was a real risk if either was edited
// without the other. Now there's a single source of truth in utils.ts; the
// `haversineKm` name is re-exported for back-compat with existing callers.

import { haversineDistance as _haversineDistance } from './utils'

/**
 * Returns the great-circle distance (km) between two lat/lng points.
 * Re-exported from utils.haversineDistance — same units, same accuracy.
 */
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  return _haversineDistance(lat1, lng1, lat2, lng2)
}

/** Convenience wrapper for LatLng objects */
export function distanceKm(a: LatLng, b: LatLng): number {
  return _haversineDistance(a.lat, a.lng, b.lat, b.lng)
}

// ── Route length calculator ────────────────────────────────────────────────

/**
 * Total distance of an ordered waypoint sequence starting from driverPos.
 * Sum of: driver→stop[0] + stop[0]→stop[1] + … + stop[n-1]→stop[n]
 */
export function routeDistance(
  driverPos: LatLng,
  stops: Array<LatLng>,
): number {
  let total = 0
  let prev: LatLng = driverPos
  for (const stop of stops) {
    total += distanceKm(prev, stop)
    prev = stop
  }
  return total
}

// ── Stop ordering enumerator ───────────────────────────────────────────────

/**
 * All valid orderings for a 2-order stack.
 *
 * Constraints:
 *   - Each order's pickup must come before its own dropoff
 *   - Pickups first when co-located (efficiency heuristic)
 *
 * For orders A and B with stops: pA (pickup A), dA (dropoff A), pB (pickup B), dB (dropoff B)
 * Valid orderings (pickup always before dropoff, within each order):
 *   1. pA → pB → dA → dB
 *   2. pA → pB → dB → dA
 *   3. pA → dA → pB → dB  (sequential: finish A then B)
 *   4. pB → pA → dA → dB
 *   5. pB → pA → dB → dA
 *   6. pB → dB → pA → dA  (sequential: finish B then A)
 */
function allValidOrderings(
  pA: LatLng, dA: LatLng,
  pB: LatLng, dB: LatLng,
): Array<[LatLng, LatLng, LatLng, LatLng]> {
  return [
    [pA, pB, dA, dB],
    [pA, pB, dB, dA],
    [pA, dA, pB, dB],
    [pB, pA, dA, dB],
    [pB, pA, dB, dA],
    [pB, dB, pA, dA],
  ]
}

// ── Stack compatibility scoring ────────────────────────────────────────────

export interface StackConfig {
  /** Max km between the two pickup locations */
  pickupRadiusKm?: number
  /** Max km between the two dropoff locations */
  dropoffRadiusKm?: number
  /** Max percentage increase in route length vs. single-order direct */
  detourPct?: number
}

const DEFAULT_CONFIG: Required<StackConfig> = {
  pickupRadiusKm:  3.0,
  dropoffRadiusKm: 4.0,
  detourPct:       40,
}

/**
 * Determines whether `candidate` can be stacked with `existing` given the
 * driver's current position and the stacking config from settings.
 *
 * Returns a CompatibilityScore (with recommended stop order) if compatible,
 * or null if any constraint is violated.
 */
export function scoreStackCompatibility(
  driverPos: LatLng,
  existing: StackableOrder,
  candidate: StackableOrder,
  config: StackConfig = {},
): CompatibilityScore | null {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  // ── Proximity gates ──────────────────────────────────────────────────────
  const pickupDist = distanceKm(existing.pickup, candidate.pickup)
  if (pickupDist > cfg.pickupRadiusKm) return null

  const dropoffDist = distanceKm(existing.dropoff, candidate.dropoff)
  if (dropoffDist > cfg.dropoffRadiusKm) return null

  // ── Baseline: single-order existing distance (driver→pickup→dropoff) ─────
  const singleDist = routeDistance(driverPos, [existing.pickup, existing.dropoff])
  if (singleDist === 0) return null

  // ── Find best valid ordering ─────────────────────────────────────────────
  const orderings = allValidOrderings(
    existing.pickup,  existing.dropoff,
    candidate.pickup, candidate.dropoff,
  )

  let bestDist = Infinity
  let bestIdx  = 0
  for (let i = 0; i < orderings.length; i++) {
    const d = routeDistance(driverPos, orderings[i])
    if (d < bestDist) { bestDist = d; bestIdx = i }
  }

  // ── Detour gate ──────────────────────────────────────────────────────────
  const detourKm  = bestDist - singleDist
  const detourPct = (detourKm / singleDist) * 100
  if (detourPct > cfg.detourPct) return null

  // ── Build RouteStop list from best ordering ───────────────────────────────
  const stopPositions = allValidOrderings(
    existing.pickup,  existing.dropoff,
    candidate.pickup, candidate.dropoff,
  )[bestIdx]

  const stopTypes: Array<{ type: 'pickup' | 'dropoff'; order_id: string; label: string }> = [
    // Map positions back to their semantic meaning
    ...buildStopMeta(existing,  stopPositions),
    ...buildStopMeta(candidate, stopPositions),
  ]
  // Sort by position index
  const stopMeta = stopPositions.map((pos, idx) => {
    const meta = stopTypes.find(
      (s) => s.order_id === findOrderIdForPos(pos, existing, candidate, s.type)
    )!
    return {
      seq:      idx + 1,
      type:     meta.type,
      order_id: meta.order_id,
      lat:      pos.lat,
      lng:      pos.lng,
      label:    meta.label,
      done:     false,
    } satisfies RouteStop
  })

  // ── Score (0–100): lower detour + closer pickups = higher score ──────────
  const proximityScore = Math.max(0, 100 - (pickupDist / cfg.pickupRadiusKm) * 50)
  const detourScore    = Math.max(0, 100 - (detourPct / cfg.detourPct) * 50)
  const score          = Math.round((proximityScore + detourScore) / 2)

  return { score, detourKm, stops: stopMeta, totalDistanceKm: bestDist }
}

// ── Internal helpers ──────────────────────────────────────────────────────

function buildStopMeta(
  order: StackableOrder,
  positions: LatLng[],
): Array<{ type: 'pickup' | 'dropoff'; order_id: string; label: string }> {
  return [
    { type: 'pickup',  order_id: order.id, label: order.pickup.label  },
    { type: 'dropoff', order_id: order.id, label: order.dropoff.label },
  ]
}

function findOrderIdForPos(
  pos: LatLng,
  existing: StackableOrder,
  candidate: StackableOrder,
  type: 'pickup' | 'dropoff',
): string {
  if (type === 'pickup') {
    if (pos.lat === existing.pickup.lat && pos.lng === existing.pickup.lng)   return existing.id
    if (pos.lat === candidate.pickup.lat && pos.lng === candidate.pickup.lng) return candidate.id
  } else {
    if (pos.lat === existing.dropoff.lat && pos.lng === existing.dropoff.lng)   return existing.id
    if (pos.lat === candidate.dropoff.lat && pos.lng === candidate.dropoff.lng) return candidate.id
  }
  return existing.id // fallback
}

// ── Single-order stop builder ─────────────────────────────────────────────

/**
 * Builds a simple 2-stop route plan for a single order.
 * Used when accepting without stacking.
 */
export function buildSingleOrderStops(order: StackableOrder): RouteStop[] {
  return [
    {
      seq:      1,
      type:     'pickup',
      order_id: order.id,
      lat:      order.pickup.lat,
      lng:      order.pickup.lng,
      label:    order.pickup.label,
      done:     false,
    },
    {
      seq:      2,
      type:     'dropoff',
      order_id: order.id,
      lat:      order.dropoff.lat,
      lng:      order.dropoff.lng,
      label:    order.dropoff.label,
      done:     false,
    },
  ]
}

// ── Optimise stops for N orders (greedy nearest-neighbour) ────────────────

/**
 * Given an arbitrary list of pending stops, returns them in a near-optimal
 * visitation order (greedy nearest-neighbour from driverPos).
 *
 * Constraint: each order's pickup must come before its dropoff.
 * This is the same algorithm used for 2-order stacks, generalised to N.
 */
export function optimizeStops(
  driverPos: LatLng,
  stops: RouteStop[],
): RouteStop[] {
  const pending  = stops.filter((s) => !s.done)
  const done     = stops.filter((s) => s.done)
  const pickedUp = new Set<string>()
  const result:   RouteStop[] = []
  let   current:  LatLng      = driverPos

  while (pending.length > 0) {
    // Find closest eligible stop
    let bestIdx  = -1
    let bestDist = Infinity

    for (let i = 0; i < pending.length; i++) {
      const s = pending[i]
      // A dropoff is only eligible if the pickup has already been visited
      if (s.type === 'dropoff' && !pickedUp.has(s.order_id)) continue

      const d = distanceKm(current, s)
      if (d < bestDist) { bestDist = d; bestIdx = i }
    }

    if (bestIdx === -1) {
      // Deadlock guard — should not happen if stops are well-formed
      // Force-visit the nearest pickup to unblock
      let nearestPickup = -1, nearestDist = Infinity
      for (let i = 0; i < pending.length; i++) {
        if (pending[i].type === 'pickup') {
          const d = distanceKm(current, pending[i])
          if (d < nearestDist) { nearestDist = d; nearestPickup = i }
        }
      }
      if (nearestPickup === -1) break // nothing left to do
      bestIdx = nearestPickup
    }

    const chosen = pending.splice(bestIdx, 1)[0]
    if (chosen.type === 'pickup') pickedUp.add(chosen.order_id)
    result.push(chosen)
    current = chosen
  }

  // Re-sequence and merge with already-done stops
  const allStops = [
    ...done,
    ...result.map((s, i) => ({ ...s, seq: done.length + i + 1 })),
  ]

  return allStops
}
