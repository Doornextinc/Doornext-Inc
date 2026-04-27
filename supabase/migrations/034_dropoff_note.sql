-- ============================================================
-- 034: Drop-off instructions
-- ============================================================
-- Stores the customer's per-order drop-off note (e.g. "leave at door,
-- ring bell twice"). Made nullable in the DB for backward compat with
-- existing orders; enforced as mandatory at the application layer.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS dropoff_note TEXT;
