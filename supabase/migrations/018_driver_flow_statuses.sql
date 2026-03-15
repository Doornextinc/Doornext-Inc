-- Add new driver delivery flow statuses to order_status enum
-- Full 8-step flow:
--   accept → driver_assigned
--   arrive at maker → arrived_at_maker
--   confirm pickup → picked_up
--   start dropoff → on_the_way
--   arrive at customer → arrived_at_customer
--   complete → delivered

ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'driver_assigned';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'arrived_at_maker';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'arrived_at_customer';
