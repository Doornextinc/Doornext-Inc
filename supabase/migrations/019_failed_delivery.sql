-- Failed delivery flow: driver arrives at customer but cannot complete delivery
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'failed_delivery';

-- Store reason for failed delivery (set by driver)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS failed_delivery_reason text;
