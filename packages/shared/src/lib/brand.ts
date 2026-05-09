/**
 * Doornext brand constants — single source of truth for vocabulary,
 * support contacts, and tone-of-voice references across the 4 apps.
 *
 * Doornext is a hyperlocal P2P food marketplace: **neighbors cooking for neighbors**.
 *
 * Brand vocabulary (immutable):
 *   - Doornext  = the platform
 *   - Maker     = the seller / home cook  (NOT "restaurant", "store", "merchant", "vendor")
 *   - Nexter    = the driver / courier    (NOT "driver" in user-facing copy)
 *   - Neighbor  = the customer            (operational "customer" is OK; UX leans neighbor)
 *
 * NOTE: This module is shared across all 4 apps. Any value that varies per
 * environment (e.g. support email in staging vs prod) should be wired through
 * NEXT_PUBLIC_* env vars; the constants below are sane defaults.
 */

export const BRAND = {
  /** Platform name. One word, no space. */
  name: 'Doornext',
  /** Tagline used on welcome / marketing surfaces. */
  tagline: 'Neighbors cooking for neighbors',

  /** Per-app version strings. Bump when shipping a release. */
  versions: {
    customerApp: 'Doornext v1.0.0',
    makerApp:    'Doornext Maker v1.0.0',
    nexterApp:   'Nexter v1.0.0',
    adminApp:    'Doornext Admin v1.0.0',
  },

  /**
   * Support contacts. Defaults are baked in; override per environment via
   * NEXT_PUBLIC_SUPPORT_* env vars when those exist (staging support inbox,
   * regional phone lines, etc.).
   */
  support: {
    email:    process.env.NEXT_PUBLIC_SUPPORT_EMAIL    ?? 'support@doornext.com',
    phone:    process.env.NEXT_PUBLIC_SUPPORT_PHONE    ?? '+1 (555) 123-4567',
    /** WhatsApp deep-link (must include https:// prefix). */
    whatsapp: process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? 'https://wa.me/15551234567',
  },

  /** Vocabulary tokens. Use when the literal might need to flex (e.g. i18n later). */
  vocab: {
    seller:    'Maker',
    sellers:   'Makers',
    courier:   'Nexter',
    couriers:  'Nexters',
    customer:  'Neighbor',  // for community-tone copy only
    customers: 'Neighbors',
  },

  /**
   * Canonical unit-economics constants from the business plan (§6).
   *
   * **NOTE:** These are reference values for documentation, not runtime
   * defaults. The actual values come from the `settings` table and
   * `delivery_distance_tiers` / `priority_delivery_tiers` rows so an admin
   * can adjust without a redeploy. Use these constants in tests, in
   * marketing/legal copy, and to detect drift between plan and DB.
   *
   * If the live values diverge from these without a documented reason,
   * that's a business-rule drift bug.
   */
  economics: {
    /** Marketplace commission % taken from the Maker's subtotal. Plan §6.1. */
    platformCommissionPct: 15,
    /** Maker keep-rate (1 - commission). Sellers keep 85% of subtotal. */
    makerKeepPct: 85,
    /** Customer service fee on food orders (USD). Plan §6.1. */
    serviceFeeFood: 1.99,
    /** Customer service fee on package deliveries (USD). Plan §6.1. */
    serviceFeePackage: 0.99,
    /** Driver flat base-pay per single delivery (USD). Plan §6.4. */
    driverBaseSingle: 3.00,
    /** Driver per-leg base-pay on stacked deliveries (75% of single). Plan §6.4. */
    driverBaseStackedLeg: 2.25,
    /** Driver distance-pay per mile (USD). Plan §6.4. */
    driverPerMile: 0.15,
    /** Driver share of surge bonus (vs. platform 30%). Plan §6.1. */
    driverSurgeShare: 0.70,
    /** Tip handling — 100% to driver, never touched by platform. Plan §8.4 invariant #5. */
    driverTipPassthrough: 1.0,
  },
} as const

/** Convenience typed aliases — re-export for ergonomic imports. */
export type BrandVocab = typeof BRAND.vocab
