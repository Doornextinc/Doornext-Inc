-- Migration 017: Delivery batch support for combined orders
-- When a driver picks up multiple orders in one trip (combined delivery),
-- their payout is 80% of the combined delivery fees + 100% of tips.
-- This migration adds the schema; batch assignment logic comes in a future update.

ALTER TABLE orders ADD COLUMN delivery_batch_id uuid;
ALTER TABLE orders ADD COLUMN is_combined_delivery boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN orders.delivery_batch_id IS 'Groups multiple orders delivered together in a single trip. All orders in a batch share the same UUID.';
COMMENT ON COLUMN orders.is_combined_delivery IS 'True when this order was delivered as part of a batch. Driver payout is 80% of combined delivery fees + 100% of tips.';
