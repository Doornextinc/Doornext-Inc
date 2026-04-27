# Doornext Execution & Automation Audit Report

**Date:** April 21, 2026  
**Auditor:** Manus AI  
**Target:** Doornext Monorepo (Customer, Driver, Maker, Admin apps)

## Executive Summary

I have conducted a deep-dive audit of the Doornext delivery platform, focusing specifically on execution, automation, code quality, and business-critical logic. While the platform has a modern Next.js and Supabase architecture, there are severe gaps in how operational states translate into financial realities. 

The most critical issues involve the decoupling of delivery completion from financial settlement, the reliance on in-memory rate limiting in a serverless environment, and the lack of automated recovery for failed deliveries. This report provides a clean audit of these issues along with explicit instructions for Claude to implement the necessary fixes.

---

## 1. Critical Execution & Automation Gaps

### 1.1 Decoupled Delivery Completion and Financial Settlement
**Issue:** The operational path that marks an order as `delivered` (`apps/driver/app/api/driver/update-status/route.ts`) is entirely separate from the financial settlement path (`apps/driver/app/api/driver/complete-delivery/route.ts`). 
**Impact:** If a driver updates the status to `delivered` but their app crashes or loses connectivity before calling `complete-delivery`, the order remains operationally complete but financially unsettled. Maker earnings and driver payouts will not be recorded in `maker_earnings` and `order_fee_splits`.
**Claude Implementation Instructions:** 
1. Open `apps/driver/app/api/driver/update-status/route.ts`.
2. When the target `status` is `'delivered'`, import and invoke the fee snapshot and upsert logic currently found in `complete-delivery/route.ts`.
3. Ensure the transaction is atomic: update the `orders` table status and insert the records into `order_fee_splits` and `maker_earnings` in a single logical flow using the service-role client.
4. Deprecate or remove the standalone `complete-delivery` route once the logic is merged.

### 1.2 In-Memory Rate Limiting in Serverless Environment
**Issue:** The shared rate limiter (`packages/shared/src/lib/rate-limit.ts`) uses a Node.js `Map` to track IP requests. 
**Impact:** In a serverless environment like Vercel (as indicated by `.github/workflows/deploy.yml`), each function invocation may spin up a new isolate. In-memory state is not shared across isolates, rendering the rate limiting entirely ineffective against distributed abuse (e.g., checkout spam, PIN brute-forcing).
**Claude Implementation Instructions:**
1. Open `packages/shared/src/lib/rate-limit.ts`.
2. Replace the in-memory `Map` implementation with a Redis-backed solution (e.g., `@upstash/ratelimit` or `ioredis`).
3. Ensure the `checkRateLimit` function signature remains compatible or update all consuming routes (`checkout`, `accept-order`, `update-status`, etc.) to handle the new asynchronous signature.

### 1.3 Unreliable Driver Presence and Dispatch Signaling
**Issue:** Driver availability is managed via a manual boolean toggle (`is_active`) in `apps/driver/app/api/driver/set-online/route.ts`. There is no heartbeat or TTL mechanism.
**Impact:** If a driver goes offline by closing the app without toggling the switch, they remain `is_active = true` indefinitely. The maker dispatch logic (`apps/maker/app/api/maker/update-status/route.ts`) will continue to send push notifications to these "ghost" drivers, leading to dispatch delays and poor maker experience.
**Claude Implementation Instructions:**
1. Create a new Supabase migration to add a `last_seen_at` `timestamptz` column to the `driver_profiles` table.
2. Create a new lightweight heartbeat API route in the driver app (`apps/driver/app/api/driver/heartbeat/route.ts`) that updates `last_seen_at` to `now()`.
3. Update the driver client app to ping this heartbeat endpoint every 1-2 minutes while the app is open and the driver is online.
4. Modify the maker dispatch query in `apps/maker/app/api/maker/update-status/route.ts` to only select drivers where `is_active = true` AND `last_seen_at` is within the last 5 minutes.

### 1.4 Missing Automated Financial Remediation for Failed Deliveries
**Issue:** When a driver reports a failed delivery (`apps/driver/app/api/driver/failed-delivery/route.ts`), the system updates the status and creates a support ticket. It does not automatically refund the customer, reverse the maker payout, or adjust the driver's earnings.
**Impact:** High manual operational overhead. Customers must wait for support to manually process refunds via the admin panel, leading to poor user experience and potential chargebacks.
**Claude Implementation Instructions:**
1. Open `apps/driver/app/api/driver/failed-delivery/route.ts`.
2. Implement automated refund logic: If the failure reason warrants a refund (or as a default policy), use the Stripe SDK to issue a refund against the order's `stripe_payment_intent_id`.
3. Ensure that if a refund is issued, the order's financial columns (e.g., `maker_payout`, `driver_payout`) are zeroed out or a compensating record is created to prevent the platform from paying out on a refunded order.

---

## 2. Financial & Pricing Logic Inconsistencies

### 2.1 Divergent State Machines for Cash vs. Card Orders
**Issue:** Card orders (`apps/customer/app/api/checkout/route.ts`) are created with the status `awaiting_payment` and transition to `confirmed` via the Stripe webhook. Cash orders (`apps/customer/app/api/checkout-cash/route.ts`) are created directly as `pending`.
**Impact:** This divergence complicates the state machine and analytics. Furthermore, the cash checkout route lacks the rate limiting present in the card checkout route, exposing it to order-spam abuse.
**Claude Implementation Instructions:**
1. Open `apps/customer/app/api/checkout-cash/route.ts`.
2. Add the `checkRateLimit` utility at the top of the route, mirroring the implementation in the card checkout route.
3. Align the initial state for cash orders to match the expected lifecycle, or explicitly document and handle the `pending` vs `awaiting_payment` divergence in all downstream queries (e.g., maker dashboards).

### 2.2 Hardcoded Platform Fee in Cash Checkout
**Issue:** The cash checkout route hardcodes the maker payout as 85% of the subtotal (`Math.round(subtotal * 0.85 * 100) / 100`) and uses a local `PLATFORM_FEE_PCT` constant.
**Impact:** If the platform commission is updated in the database (`app_settings`), cash orders will silently continue using the hardcoded 15% commission, leading to revenue leakage or maker disputes.
**Claude Implementation Instructions:**
1. Open `apps/customer/app/api/checkout-cash/route.ts`.
2. Refactor the pricing logic to use the `platform_commission_pct` from the `settings` table, exactly as the shared `calculatePricing` and `complete-delivery` routes do. Remove the hardcoded `0.85` multiplier.

---

## 3. Security & Code Quality

### 3.1 Fire-and-Forget Notifications Masking Errors
**Issue:** Throughout the codebase (e.g., `apps/maker/app/api/maker/update-status/route.ts`, `apps/admin/app/api/admin/withdrawals/[id]/route.ts`), notifications are sent using `.catch(() => {/* non-fatal */})` or without awaiting the result.
**Impact:** While this prevents notification failures from blocking critical updates, it also masks underlying infrastructure issues (e.g., Firebase misconfiguration).
**Claude Implementation Instructions:**
1. Search the codebase for instances of `notifyUser` being called without `await` or with an empty `.catch()` block.
2. Update these calls to ensure that caught errors are logged to Sentry (`Sentry.captureException(err)`) so that delivery failures are observable without breaking the main execution flow.

### 3.2 Unvalidated Admin Settings Mutations
**Issue:** The admin settings route (`apps/admin/app/api/admin/settings/route.ts`) accepts any key-value pair and upserts it into the `settings` table without validating against a known schema.
**Impact:** A compromised admin account or a simple typo could inject invalid configuration keys, potentially breaking pricing calculations or other dynamic logic.
**Claude Implementation Instructions:**
1. Open `apps/admin/app/api/admin/settings/route.ts`.
2. Implement a strict allowlist of valid setting keys (e.g., `dynamic_base_pay`, `service_fee_pct`, `platform_commission_pct`).
3. Reject any requests where the `key` is not in the allowlist with a 400 Bad Request response.

---

## Conclusion

The Doornext platform has a solid foundation, but requires immediate attention to its execution automation and financial reconciliation paths. Prioritize merging the delivery completion and financial settlement logic, replacing the in-memory rate limiter, and implementing driver heartbeats to ensure a reliable, scalable marketplace.
