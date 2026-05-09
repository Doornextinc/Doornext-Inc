# DoorNext — Business Plan
**Version 1.0 — May 2026**
**Prepared for:** Claude Code (engineering & product context)
**Author:** DoorNext Founding Team

---

## 0. How to use this document (for Claude Code)

This is the canonical business + product brief for the DoorNext ecosystem. It is structured so an LLM coding agent (Claude Code) can:
- Understand the **product surface area** (3 apps + 1 control hub).
- Map **business rules → database tables → edge functions → UI flows**.
- Generate or refactor code that respects the **economic model** (commissions, splits, payouts).
- Avoid breaking the **trust & safety primitives** (KYC, RLS, roles, wallet idempotency).

When in doubt, **business rules in §6–§8 are source of truth** over any conflicting code comment.

---

## 1. Executive Summary

**DoorNext** is a hyperlocal, three-sided delivery and commerce platform built for small American neighborhoods — starting with **home-based food sellers ("DoorMakers")**, **independent gig drivers ("Nexters")**, and **everyday riders/customers**.

We are building the "neighborhood operating system" for last-mile delivery: a cheaper, more human alternative to DoorDash / Uber Eats, where:
- Sellers keep **85%** of the order subtotal (vs. ~70% on incumbents).
- Drivers earn **transparent base + tips + distance pay**, with no hidden algorithmic suppression.
- Customers pay **lower delivery fees** because we run lean dispatch and city-level "hubs."

The platform is operated from a single **DoorNext Cloud** backend (Supabase) shared by three frontends and one internal **Control Hub**.

| Metric (Year 1 target) | Value |
|---|---|
| Active cities | 3 (pilot: Atlanta, Tampa, Newark) |
| Active sellers | 600 |
| Active drivers | 1,200 |
| Monthly orders | 45,000 |
| Take rate (blended) | ~18% |
| Gross revenue Y1 | $2.1M |

---

## 2. The Problem

1. **Sellers** — Home cooks and micro-brands are locked out of DoorDash/UberEats due to commercial-kitchen requirements and 30% commissions. Cottage-food laws (now active in 49 states) created legal supply with no marketplace.
2. **Drivers** — Gig drivers face opaque pay, declining per-trip earnings, and no path to local loyalty. Tip transparency is broken.
3. **Riders** — Delivery fees + service fees + inflated menu prices have made a $12 burrito cost $28. Trust in big delivery apps is collapsing (2025 NPS for DoorDash: −4).
4. **Neighborhoods** — Local economic value leaks to SF/Seattle HQs instead of recirculating.

---

## 3. The Solution — Product Overview

DoorNext is **one backend, three apps, one ops console**.

```
                ┌──────────────────────────┐
                │     DoorNext Cloud (DB)   │
                │  Postgres + RLS + Edge fn│
                └──────────────┬───────────┘
                               │
   ┌───────────────┬───────────┼───────────┬────────────────┐
   │               │           │           │                │
┌──▼───┐      ┌────▼────┐  ┌───▼────┐  ┌───▼─────────────┐
│Rider │      │DoorMaker│  │Nexter  │  │ Control Hub     │
│ App  │      │(Seller) │  │(Driver)│  │ (admin/ops)     │
└──────┘      └─────────┘  └────────┘  └─────────────────┘
```

| App | Project ID | Primary user | Core jobs |
|---|---|---|---|
| **DoorNextCustomer (Rider)** | `1f6d4373-a689-4916-9087-5ea4f9ad3e93` | Customer | Browse stores, order food, send packages, track, tip |
| **DoorMaker (Seller)** | `037f585c-1828-47c1-8b6d-ccb89a5fd77d` | Home seller | KYC + license, manage menu, accept orders, see earnings, withdraw |
| **Doornexter (Driver)** | `fe00566c-ec96-49ff-bb87-ca939ad782e7` | Gig driver | KYC, go online, accept dispatched orders, navigate, get paid, cash out |
| **Control Hub** (internal) | `ca9613ff-2b4e-4bef-ae89-7b2f54888e40` | Internal admin | KYC review, dispatch overrides, surge zones, withdrawals approval, analytics, support |

---

## 4. Market & Competition

### TAM / SAM / SOM
- **TAM (US last-mile food + parcel):** $230B (2026).
- **SAM (cottage-food + neighborhood courier in 50 mid-size US metros):** $14B.
- **SOM (Y3):** $90M GMV across 12 metros.

### Why now
- 49 states have cottage-food laws (last: NJ, 2021).
- Drivers leaving DoorDash/Uber after 2024 pay cuts (~22% YoY decline in active drivers per Gridwise).
- Stripe Connect + DoorNext Cloud removed the 12-month, $400k engineering moat that protected incumbents.

### Competitive landscape

| Player | Take rate | Seller type | Weakness |
|---|---|---|---|
| DoorDash | 25–30% | Restaurants only | Hostile to home sellers, opaque tipping |
| UberEats | 25–30% | Restaurants only | Same |
| Shef / Foodnome | 20% | Home cooks | Single-vertical, no driver layer (uses DoorDash Drive) |
| Local Facebook groups | 0% | Home cooks | No payments, no logistics, no trust |
| **DoorNext** | **15% seller + $1.99 customer fee** | **Home cooks + small biz + parcel** | **(new entrant — must prove dispatch quality)** |

---

## 5. Users & Personas

### 5.1 Maya — the DoorMaker (seller)
- 34, makes Salvadoran pupusas from her FL home kitchen.
- Has a state cottage-food license; can legally sell ≤$50k/yr.
- Currently sells via Instagram DMs + Venmo. Loses ~6 hrs/week to logistics.
- Wants: a storefront, automatic order intake, a driver who shows up, and weekly payouts.

### 5.2 Marcus — the Nexter (driver)
- 28, drove for DoorDash 2 yrs, quit after rate cuts.
- Wants: predictable per-mile pay, 100% of tips, fast cashout (instant ≤$0.50 fee, free weekly).
- Will work 25 hrs/week if he can clear $22/hr gross.

### 5.3 Priya — the Rider (customer)
- 41, two kids, lives in a Tampa suburb.
- Tired of $28 burritos. Wants real home-cooked food and to support neighbors.
- Will tolerate 35-min delivery (vs. 25 min on DoorDash) for ~30% lower total bill.

### 5.4 Internal — Hub Operator
- DoorNext city manager. Uses Control Hub to approve KYC, manage surge, resolve disputes, monitor SLA.

---

## 6. Business Model & Unit Economics

### 6.1 Revenue streams
1. **Marketplace commission** — 15% of seller subtotal (sellers keep 85%).
2. **Customer service fee** — flat $1.99 per food order, $0.99 per package.
3. **Delivery fee margin** — customer pays distance-based fee; we pay driver $0.15/mi + base + tips; we keep the spread (typically $1.50–$3.00 / order).
4. **Surge multiplier (driver-shared)** — during surge, customer fee +X%; 70% to driver, 30% to platform.
5. **Subscription (DoorNext+)** — Y2: $7.99/mo, free delivery on orders > $20.
6. **Sponsored placements** — Y2: sellers can boost listing within a zip code.

### 6.2 Sample order economics (food, $24 subtotal, 2.4 mi)

| Line | Customer pays | Seller gets | Driver gets | Platform |
|---|---|---|---|---|
| Subtotal | $24.00 | $20.40 (85%) | — | $3.60 (15%) |
| Service fee | $1.99 | — | — | $1.99 |
| Delivery fee | $4.49 | — | $3.36 (base $3.00 + $0.36 dist.) | $1.13 |
| Tip | $4.00 | — | $4.00 | — |
| **Total** | **$34.48** | **$20.40** | **$7.36** | **$6.72** |

Blended take rate on this order: **19.5%**.

### 6.3 Cost to serve (Y1 estimate, per order)
- Stripe fees: $0.95
- SMS/push (Twilio + Resend): $0.06
- Maps (Google routing/geocoding): $0.04
- Compute (DoorNext Cloud): $0.02
- Support (chargeback reserve): $0.18
- **CoGS ≈ $1.25 / order → contribution margin ≈ $5.47 / order.**

### 6.4 Driver pay formula (canonical — must match `update_driver_wallet_on_delivery` trigger)

```
driver_pay = base_pay + distance_pay + tip
  base_pay      = $3.00 (single)  or  $2.25 (each leg of stacked, 75%)
  distance_pay  = miles * $0.15
  tip           = 100% pass-through, never touched
surge_bonus     = driver_pay * (surge_multiplier - 1) * 0.70
```

### 6.5 Seller payout formula (canonical — must match `update_seller_wallet_on_order_complete`)

```
seller_credit = order.subtotal * 0.85
```
Credited only **on order = `delivered`**, **once per order** (idempotent via `wallet_transactions.order_id` unique guard).

---

## 7. Operations Model

### 7.1 City launch playbook
1. Recruit 30 sellers (cottage-food licensees from state registry).
2. Recruit 60 drivers (Facebook + ex-DoorDash funnels).
3. KYC + license verification via Control Hub.
4. Seed demand: $5 off first 3 orders for first 500 customers.
5. Hub Operator monitors first 30 days; SLA target: ≥92% on-time, ≤1.5% cancel.

### 7.2 KYC & compliance
- **Drivers:** ID + selfie + auto driving record + insurance proof. Verified via `kyc-verify` edge fn.
- **Sellers:** State cottage-food license (state-specific fee table in `src/lib/constants/stateFees.ts`), DBA, food-handler cert, ServSafe upload.
- License expiry monitored daily by `check-license-expiry` edge fn → email + push via `notify-license-status`.

### 7.3 Trust & safety
- Roles in dedicated `user_roles` table (`admin`, `driver`, `seller`, `rider`) — never in profile (privilege-escalation prevention).
- All sensitive tables: RLS on, `has_role()` security-definer for admin checks.
- Wallet triggers idempotent (`ON CONFLICT` + `ROW_COUNT` guards).
- Magic-link OTP login (6-digit code) — no password reuse risk.

---

## 8. Technical Architecture (for Claude Code)

### 8.1 Stack
- **Frontends:** React 18 + Vite 5 + TS 5 + Tailwind v3 + shadcn/ui. Mobile via Capacitor (Android shipped, iOS pending).
- **Backend:** DoorNext Cloud (managed Supabase) — Postgres, RLS, Auth, Storage, Edge Functions (Deno).
- **AI:** AI Gateway (`google/gemini-2.5-flash` for support triage, `gpt-5-mini` for menu copy).
- **Payments:** Stripe Connect Express (drivers + sellers as connected accounts).
- **Email:** Resend on `notify.doornext.org` (queue: `email_queue` table → `process-email-queue` edge fn).
- **Push:** OneSignal via `send-push-notification`.
- **Maps:** Google Maps JS + Directions + Distance Matrix.

### 8.2 Core tables (shared across all 4 projects)
| Table | Purpose | Critical RLS rule |
|---|---|---|
| `profiles` | One per auth user | self read/write |
| `user_roles` | Role assignments | only admin can write |
| `stores` | Seller storefronts | seller owns; public read if `is_active` |
| `menu_items` | Seller catalog | seller writes own; public read |
| `orders` | Food orders | rider/seller/driver involved can read; only system trigger writes wallet |
| `packages` | Parcel deliveries | similar to orders |
| `driver_sessions` | Online/offline shifts | driver self |
| `driver_wallets` / `seller_wallets` | Balances | self read; only triggers write |
| `wallet_transactions` | Ledger | append-only via trigger; unique on `order_id` |
| `withdrawal_requests` | Cashouts | self insert; admin approves |
| `kyc_documents` | Uploaded IDs/licenses | self insert; admin read |
| `surge_zones` | Geo polygons + multiplier | admin only write |
| `notifications` | In-app bell | self read |
| `messages` / `chat_threads` | Order chat | participants only |
| `email_queue` | Outbound email buffer | service-role only |
| `audit_log` | Hub operator actions | admin read |

### 8.3 Edge functions (canonical list)
- `dispatch-engine` — assigns drivers (haversine + load + rating).
- `business-logic` — quote pricing, validate cart, compute surge.
- `kyc-verify` — third-party identity check.
- `check-license-expiry` (cron daily) → `notify-license-status`.
- `notify-order-status`, `notify-new-message`, `notify-seller-order`, `notify-withdrawal-status`.
- `send-push-notification`, `send-support-message`.
- `process-email-queue` (cron 1m).
- `stripe-webhook` — payouts + refunds.
- `rider-api`, `seller-onboarding`, `admin-reset-password`.

### 8.4 Non-negotiable invariants (Claude Code: do not violate)
1. **Never** put roles on `profiles`. Always `user_roles` + `has_role()`.
2. **Never** edit `src/integrations/supabase/{client,types}.ts`.
3. Wallet credits **only** via DB triggers, never from app code.
4. Triggers must be **idempotent** (`ON CONFLICT` or pre-check on `wallet_transactions.order_id`).
5. Driver tip = 100% to driver. Always.
6. Magic-link OTP must render the 6-digit `{{ .Token }}` template (`supabase/templates/magic-link.html`), not the magic-link button.
7. Never ALTER reserved schemas (`auth`, `storage`, `realtime`, `vault`, `supabase_functions`).
8. Use semantic Tailwind tokens (defined in `index.css`), never raw colors.

---

## 9. Go-To-Market

### 9.1 Phase 1 — Pilot (Months 0–4)
- 3 metros: Atlanta, Tampa, Newark.
- Hand-recruit 30 sellers / city via state cottage-food registry.
- $25k local marketing/city (FB + community newspapers + church bulletins).
- Goal: 1,500 orders/wk by Month 4.

### 9.2 Phase 2 — Density (Months 5–12)
- Add 9 metros. Repeat playbook with city manager hires ($55k base + equity).
- Launch DoorNext+ subscription.
- Goal: 12,000 orders/wk; 45% repeat rate.

### 9.3 Phase 3 — Network (Y2)
- 30 metros. Open API for local non-food sellers (florists, bakeries, thrift).
- Launch parcel B2B (small businesses sending packages cross-town).

---

## 10. Marketing & Brand

- **Voice:** Warm, neighborly, anti-corporate. ("Your next door delivery partner.")
- **Visual:** Black + DoorNext orange (`hsl` token `--primary`), bold display font for hero typography (already implemented in `src/pages/Index.tsx`).
- **Channels:** Hyperlocal Meta ads (zip-code targeting), Nextdoor sponsorships, church/PTA partnerships, founder-led TikTok (founder cooks with sellers).
- **Acquisition cost target:** Rider CAC < $9, Seller CAC < $40, Driver CAC < $25.

---

## 11. Team & Org

| Role | Y1 hires | Y2 hires |
|---|---|---|
| Founders (CEO, CTO) | 2 | 2 |
| City Managers | 3 | 12 |
| Engineering | 2 | 5 |
| Support / Trust & Safety | 2 | 6 |
| Growth | 1 | 3 |
| **Total** | **10** | **28** |

---

## 12. Financial Projections

| | Y1 | Y2 | Y3 |
|---|---|---|---|
| Cities | 3 | 12 | 30 |
| Orders | 540k | 4.8M | 18M |
| GMV | $13.5M | $130M | $510M |
| Net revenue (take ~18%) | $2.4M | $23.4M | $91.8M |
| Gross margin | 38% | 52% | 61% |
| Opex | $3.1M | $14.0M | $42.0M |
| EBITDA | -$2.2M | -$1.8M | +$14.0M |

---

## 13. Funding

- **Pre-seed (closed, Mar 2026):** $750k SAFE, $8M cap.
- **Seed (raising Q3 2026):** $4.5M, $22M cap. Use of funds: 9 city launches + 3 engineers + Stripe reserves.
- **Series A (Y2):** $18M to fuel scale to 30 metros.

---

## 14. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Cottage-food law changes in a state | Multi-vertical (parcel + small biz buffer) |
| Driver supply shortage | $250 referral bonuses; instant cashout |
| Big delivery apps copy us | Network density + neighborhood brand are defensible |
| Food safety incident | Mandatory ServSafe + license; insurance rider $2M |
| Stripe disputes | Reserve 1.5% of GMV; auto-evidence pipeline |
| Capacity / stacked dispatch errors | `dispatch-engine` returns deterministic plan; Hub Operator can override |

---

## 15. Roadmap (Engineering — for Claude Code prioritization)

**Now (Q2 2026)**
- ✅ Magic-link OTP + custom email domain (`notify.doornext.org`)
- ✅ Wallet trigger consolidation (idempotent)
- ⏳ TypeScript build cleanup (in progress)
- ⏳ Email queue processor cron

**Next (Q3 2026)**
- Stripe Connect Express onboarding for sellers + drivers
- Surge zone editor UI in Control Hub
- Driver stacked-dispatch UX
- Rider tipping flow post-delivery (component exists: `PostDeliveryTipDialog`)

**Later (Q4 2026)**
- DoorNext+ subscription
- iOS Capacitor build
- Sponsored seller placements
- Multi-language (en/es/fr already scaffolded in `src/i18n/`)

---

## 16. Glossary

- **DoorMaker** — a seller on the platform (typically home-based).
- **Nexter** — a driver on the platform.
- **Hub** — the internal admin console (internal) and/or a city operations team.
- **Stacked order** — one driver carrying 2 deliveries at once; each leg pays 75% base.
- **Wallet** — internal ledger balance (`driver_wallets` / `seller_wallets`); cashouts move funds to Stripe.
- **Surge zone** — geo polygon with a multiplier > 1.0 active for a time window.

---

*End of document. For implementation questions, defer to §6 (economics) and §8.4 (invariants).*
