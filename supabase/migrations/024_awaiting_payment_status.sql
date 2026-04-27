-- Migration 024: Add awaiting_payment order status
-- Orders are created with this status when the customer opens checkout.
-- The status moves to 'confirmed' (via Stripe webhook) only after payment succeeds.
-- This prevents unpaid orders from appearing in the maker dashboard.

ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'awaiting_payment' BEFORE 'pending';
